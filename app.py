from copy import deepcopy
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import json
import re
import io
import zipfile
import threading
import webbrowser
import urllib.parse
import urllib.request
import os
import time
import secrets
import unicodedata

try:
    import websocket
except ImportError:
    websocket = None

from flask import Flask, jsonify, render_template, request, send_file

try:
    import qrcode
except ImportError:
    qrcode = None

from apex_decoder import decode_frame, updates_to_dicts
from apex_grid import parse_grid_frame
from apex_table import ApexTable
from protocol_engine import ProtocolEngine
from event_store import ApexEventStore
from backend.config import APP_DIR, APP_RELEASE_NAME, APP_VERSION, load_circuits
from backend.logging_tools import ApexLogManager
from backend.network import local_ip
from backend.services.race_state import RaceStateService

app = Flask(__name__)

APEX_TABLE = ApexTable()
PROTOCOL_ENGINE = ProtocolEngine()
EVENT_STORE = ApexEventStore(APP_DIR / "recordings")

STATE = {
    "version": APP_VERSION,
    "mode": "qualification",
    "circuit_id": "",
    "connection": "HORS LIGNE",
    "live": {
        "status": "idle",
        "messages": 0,
        "last_message_at": None,
        "last_error": None,
        "websocket_url": None,
        "parsed_updates": 0,
        "last_frame_preview": None,
    },
    "followed_driver": "",
    "followed_locked": False,
    "followed_snapshot": None,
    "time_remaining": "—",
    "time_remaining_ms": None,
    "time_remaining_updated_at_ms": None,
    "time_remaining_end_at_ms": None,
    "apex_laps_remaining": "—",
    "current_lap": 0,
    "total_laps": 0,
    "session_best": {"driver": "—", "lap": "—"},
    "fastest_last_lap": {"driver": "—", "lap": "—"},
    "drivers": [],
    "penalties": [],
    "penalty_history": [],
    "comment_penalties": [],
    "comment_events": [],
    "quick_change": [],
    "qualif_crossing": None,
    "generic_alert": None,
    "developer_mode": False,
    "traffic_recording": False,
    "traffic_recording_started_at": None,
    "driver_message": None,
    "spotter": {"configured": False, "updated_at_ms": None, "queue_mode": 1, "setup_karts": ["X", "Y", "Z"], "queue": [], "maintenance": [], "incoming": [], "assignments": {}, "mode": "live", "app_release": APP_VERSION, "client_id": "server"},
}


RACE_STATE = RaceStateService(STATE)


WEATHER_CACHE = {}
WEATHER_LOCATION_CACHE = {}
WEATHER_LOCK = threading.Lock()
DRIVER_MESSAGE_LOCK = threading.Lock()
SPOTTER_LOCK = threading.Lock()
RACE_SESSION_LOCK = threading.Lock()
RACE_SESSION = None
TEAM_DATA_LOCK = threading.Lock()
TEAM_DATA_PATH = APP_DIR / "velocity_team_management.json"

def _default_team_data():
    return {"teams": [], "invites": {}, "devices": {}, "active_session_id": None, "sessions": []}

def _load_team_data():
    try:
        if TEAM_DATA_PATH.exists():
            data = json.loads(TEAM_DATA_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                base = _default_team_data(); base.update(data); return base
    except Exception:
        pass
    return _default_team_data()

def _save_team_data(data):
    try:
        TEAM_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = TEAM_DATA_PATH.with_suffix('.tmp')
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        tmp.replace(TEAM_DATA_PATH)
    except Exception:
        pass

TEAM_DATA = _load_team_data()
WEATHER_TTL_SECONDS = 300
WEATHER_LOCATION_TTL_SECONDS = 86400


def _json_urlopen(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": f"Velocity/{APP_VERSION}"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def _weather_location(circuit):
    now = datetime.now(timezone.utc).timestamp()
    circuit_id = str(circuit.get("id") or "")
    latitude = circuit.get("latitude")
    longitude = circuit.get("longitude")
    if latitude is not None and longitude is not None:
        return {
            "latitude": float(latitude),
            "longitude": float(longitude),
            "name": circuit.get("name") or circuit_id,
            "timezone": circuit.get("timezone") or "auto",
            "source": "circuit",
        }
    cached = WEATHER_LOCATION_CACHE.get(circuit_id)
    if cached and now - cached.get("cached_at", 0) < WEATHER_LOCATION_TTL_SECONDS:
        return cached
    query = str(circuit.get("name") or circuit_id).strip()
    country = str(circuit.get("country") or "").strip()
    params = {"name": query, "count": 10, "language": "fr", "format": "json"}
    url = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode(params)
    data = _json_urlopen(url)
    results = data.get("results") or []
    if not results and query:
        simplified = re.sub(r"\b(karting|circuit|racing|indoor|outdoor|loisir|concept|club|rko|rkc|pks|brk)\b", " ", query, flags=re.I)
        simplified = re.sub(r"\s+", " ", simplified).strip(" -")
        candidates = [simplified]
        words = re.findall(r"[A-Za-zÀ-ÿ0-9'-]+", simplified or query)
        if words:
            candidates.extend([words[-1], " ".join(words[-2:])])
        for candidate in dict.fromkeys(item for item in candidates if item):
            if candidate.lower() == query.lower():
                continue
            params["name"] = candidate
            data = _json_urlopen("https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode(params))
            results = data.get("results") or []
            if results:
                break
    if not results:
        raise ValueError(f"Localisation météo introuvable pour {query}")
    country_lower = country.lower()
    def score(item):
        value = 0
        if country_lower and str(item.get("country") or "").lower() == country_lower:
            value += 20
        label = " ".join(str(item.get(k) or "") for k in ("name", "admin1", "admin2", "admin3")).lower()
        for token in re.findall(r"[a-zà-ÿ0-9]+", query.lower()):
            if len(token) >= 4 and token in label:
                value += 3
        value += min(float(item.get("population") or 0) / 1_000_000, 5)
        return value
    best = max(results, key=score)
    location = {
        "latitude": float(best["latitude"]),
        "longitude": float(best["longitude"]),
        "name": best.get("name") or query,
        "admin1": best.get("admin1"),
        "country": best.get("country") or country,
        "timezone": best.get("timezone") or "auto",
        "source": "geocoding",
        "cached_at": now,
    }
    WEATHER_LOCATION_CACHE[circuit_id] = location
    return location


def _met_symbol_parts(symbol_code):
    symbol = str(symbol_code or "cloudy").strip().lower()
    is_day = not symbol.endswith("_night")
    base = re.sub(r"_(day|night|polartwilight)$", "", symbol)
    return base, is_day


def _weather_icon_from_met_symbol(symbol_code):
    base, is_day = _met_symbol_parts(symbol_code)
    if base in {"clearsky", "fair"}:
        return "clear-day" if is_day else "clear-night"
    if base in {"partlycloudy"}:
        return "partly-cloudy-day" if is_day else "partly-cloudy-night"
    if base in {"cloudy"}:
        return "cloudy"
    if "fog" in base:
        return "fog"
    if "thunder" in base:
        return "thunderstorm"
    if "snow" in base or "sleet" in base:
        return "snow"
    if "heavyrain" in base:
        return "rain-heavy"
    if "rain" in base or "showers" in base:
        return "rain"
    if "drizzle" in base:
        return "drizzle"
    return "cloudy"


def _weather_label_from_met_symbol(symbol_code):
    base, _ = _met_symbol_parts(symbol_code)
    labels = {
        "clearsky": "Ciel dégagé",
        "fair": "Peu nuageux",
        "partlycloudy": "Partiellement nuageux",
        "cloudy": "Couvert",
        "fog": "Brouillard",
        "lightrain": "Pluie faible",
        "rain": "Pluie",
        "heavyrain": "Forte pluie",
        "lightrainshowers": "Averses faibles",
        "rainshowers": "Averses",
        "heavyrainshowers": "Fortes averses",
        "lightsnow": "Neige faible",
        "snow": "Neige",
        "heavysnow": "Forte neige",
        "lightsnowshowers": "Averses de neige faibles",
        "snowshowers": "Averses de neige",
        "heavysnowshowers": "Fortes averses de neige",
        "lightsleet": "Faible neige fondue",
        "sleet": "Neige fondue",
        "heavysleet": "Forte neige fondue",
    }
    if base in labels:
        return labels[base]
    if "thunder" in base:
        return "Orage"
    if "snow" in base:
        return "Neige"
    if "sleet" in base:
        return "Neige fondue"
    if "rain" in base or "showers" in base:
        return "Pluie"
    return "Conditions variables"


def _met_request(location):
    params = {
        "lat": f"{float(location['latitude']):.5f}",
        "lon": f"{float(location['longitude']):.5f}",
    }
    altitude = location.get("altitude")
    if altitude is not None:
        params["altitude"] = int(round(float(altitude)))
    url = "https://api.met.no/weatherapi/locationforecast/2.0/complete?" + urllib.parse.urlencode(params)
    user_agent = os.environ.get(
        "MET_NO_USER_AGENT",
        f"Velocity/{APP_VERSION} (weather client; contact via application owner)",
    )
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": user_agent,
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def _met_period(entry):
    data = entry.get("data") or {}
    for key in ("next_1_hours", "next_6_hours", "next_12_hours"):
        period = data.get(key)
        if isinstance(period, dict):
            return period, key
    return {}, None


def _met_row(entry, local_zone):
    raw_time = entry.get("time")
    if not raw_time:
        return None
    try:
        dt = datetime.fromisoformat(str(raw_time).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt_local = dt.astimezone(local_zone)
    except Exception:
        return None
    data = entry.get("data") or {}
    instant = ((data.get("instant") or {}).get("details") or {})
    period, period_key = _met_period(entry)
    summary = period.get("summary") or {}
    details = period.get("details") or {}
    symbol = summary.get("symbol_code") or "cloudy"
    probability = details.get("probability_of_precipitation")
    precipitation = details.get("precipitation_amount")
    return {
        "dt": dt_local,
        "temperature": instant.get("air_temperature"),
        "wind_speed": instant.get("wind_speed"),
        "wind_gusts": instant.get("wind_speed_of_gust"),
        "humidity": instant.get("relative_humidity"),
        "cloud_fraction": instant.get("cloud_area_fraction"),
        "probability": probability,
        "precipitation": precipitation,
        "symbol": symbol,
        "period": period_key,
    }


def _weather_for_circuit(circuit):
    circuit_id = str(circuit.get("id") or "")
    now_ts = datetime.now(timezone.utc).timestamp()
    cached = WEATHER_CACHE.get(circuit_id)
    if cached and now_ts - cached.get("cached_at", 0) < WEATHER_TTL_SECONDS:
        return cached["payload"]

    location = _weather_location(circuit)
    circuit_timezone = str(circuit.get("timezone") or location.get("timezone") or "UTC")
    try:
        local_zone = ZoneInfo(circuit_timezone)
    except Exception:
        local_zone = timezone.utc
        circuit_timezone = "UTC"

    met_data = _met_request(location)
    entries = (((met_data.get("properties") or {}).get("timeseries")) or [])
    rows = [row for row in (_met_row(entry, local_zone) for entry in entries) if row]
    rows.sort(key=lambda row: row["dt"])
    if not rows:
        raise ValueError("MET Norway n'a renvoyé aucune prévision exploitable")

    now_local = datetime.now(timezone.utc).astimezone(local_zone)
    first_slot_local = now_local.replace(minute=0, second=0, microsecond=0)
    if now_local.minute >= 30:
        first_slot_local += timedelta(hours=1)

    selected = [row for row in rows if row["dt"] >= first_slot_local][:12]
    if len(selected) < 6:
        selected = [row for row in rows if row["dt"] >= now_local - timedelta(hours=1)][:12]
    if len(selected) < 6:
        selected = rows[:12]

    timeline = []
    for row in selected:
        local_dt = row["dt"]
        timeline.append({
            "timestamp": int(local_dt.astimezone(timezone.utc).timestamp()),
            "time": local_dt.isoformat(timespec="minutes"),
            "display_time": local_dt.strftime("%H:%M"),
            "temperature": row.get("temperature"),
            "probability": row.get("probability"),
            "precipitation": row.get("precipitation"),
            "rain": row.get("precipitation"),
            "weather_code": row.get("symbol"),
            "label": _weather_label_from_met_symbol(row.get("symbol")),
            "icon": _weather_icon_from_met_symbol(row.get("symbol")),
            "wind_speed": row.get("wind_speed"),
            "wind_gusts": row.get("wind_gusts"),
            "period": row.get("period"),
        })

    current_row = min(rows, key=lambda row: abs((row["dt"] - now_local).total_seconds()))
    next_rain = None
    for row in rows:
        if row["dt"] < now_local:
            continue
        precipitation = float(row.get("precipitation") or 0)
        probability = row.get("probability")
        symbol = str(row.get("symbol") or "")
        if precipitation >= 0.1 or (probability is not None and float(probability) >= 45) or any(token in symbol for token in ("rain", "sleet", "snow", "thunder")):
            next_rain = {
                "timestamp": int(row["dt"].astimezone(timezone.utc).timestamp()),
                "time": row["dt"].isoformat(timespec="minutes"),
                "display_time": row["dt"].strftime("%H:%M"),
                "probability": probability,
                "precipitation": row.get("precipitation"),
                "weather_code": symbol,
                "label": _weather_label_from_met_symbol(symbol),
            }
            break

    current_symbol = current_row.get("symbol") or "cloudy"
    payload_data = {
        "circuit_id": circuit_id,
        "circuit_name": circuit.get("name"),
        "location": location,
        "timezone": circuit_timezone,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "MET Norway Locationforecast 2.0",
        "current": {
            "temperature": current_row.get("temperature"),
            "apparent_temperature": None,
            "precipitation": current_row.get("precipitation"),
            "rain": current_row.get("precipitation"),
            "weather_code": current_symbol,
            "label": _weather_label_from_met_symbol(current_symbol),
            "icon": _weather_icon_from_met_symbol(current_symbol),
            "wind_speed": current_row.get("wind_speed"),
            "wind_gusts": current_row.get("wind_gusts"),
            "is_day": not str(current_symbol).endswith("_night"),
            "time": current_row["dt"].isoformat(timespec="minutes"),
        },
        "next_rain": next_rain,
        "timeline": timeline,
        "hourly_debug": {
            "times_received": len(rows),
            "slots_built": len(timeline),
            "first_slot_local": first_slot_local.isoformat(timespec="minutes"),
            "source": "met_no_locationforecast_complete",
        },
    }
    WEATHER_CACHE[circuit_id] = {"cached_at": now_ts, "payload": payload_data}
    return payload_data


LIVE_LOCK = threading.Lock()
LIVE_THREAD = None
LIVE_STOP = threading.Event()
LIVE_WS = None


LOG_MANAGER = ApexLogManager(APP_DIR)
LOG_FILE = LOG_MANAGER.live_file
TRAFFIC_IN_FILE = LOG_MANAGER.traffic_in_file
TRAFFIC_OUT_FILE = LOG_MANAGER.traffic_out_file
TRAFFIC_LOCK = LOG_MANAGER.traffic_lock


def write_live_log(message):
    LOG_MANAGER.write_live(message)


def write_traffic(direction, message):
    LOG_MANAGER.write_traffic(direction, message, enabled=STATE.get("traffic_recording", False))

def set_live_status(status, connection, error=None):
    with LIVE_LOCK:
        STATE["live"]["status"] = status
        STATE["connection"] = connection
        STATE["live"]["last_error"] = error


def stop_live_connection():
    global LIVE_WS
    LIVE_STOP.set()
    ws = LIVE_WS
    if ws is not None:
        try:
            ws.close()
        except Exception:
            pass
    LIVE_WS = None


def start_live_connection(circuit_id):
    global LIVE_THREAD
    stop_live_connection()
    LIVE_STOP.clear()
    circuit = next((c for c in load_circuits() if c["id"] == circuit_id), None)
    if not circuit or not circuit.get("websocket_url"):
        set_live_status("error", "CONFIG INCOMPLÈTE", "Aucune URL WebSocket configurée")
        return
    STATE["live"].update({
        "status": "connecting", "messages": 0, "last_message_at": None,
        "last_error": None, "websocket_url": circuit["websocket_url"],
        "parsed_updates": 0, "last_frame_preview": None
    })
    STATE["connection"] = "CONNEXION…"
    LIVE_THREAD = threading.Thread(target=live_worker, args=(circuit,), daemon=True)
    LIVE_THREAD.start()


APEX_UPDATE_RE = re.compile(r"^r(?P<row>\d+)(?:c(?P<column>\d+))?\|(?P<code>[^|]*)\|(?P<value>.*?)(?:\|)?$")


def parse_apex_frame(message):
    """Parse les mises à jour élémentaires du protocole texte Apex.

    Le mapping métier des colonnes dépend de la configuration du circuit ; cette
    fonction compte et journalise les mises à jour sans inventer leur signification.
    """
    if not isinstance(message, str):
        return []
    updates = []
    for raw_line in message.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = APEX_UPDATE_RE.match(line)
        if not match:
            continue
        item = match.groupdict()
        item["row"] = int(item["row"])
        item["column"] = int(item["column"]) if item["column"] else None
        item["raw"] = line
        updates.append(item)
    return updates


def live_worker(circuit):
    global LIVE_WS
    if websocket is None:
        set_live_status("error", "MODULE MANQUANT", "Installe websocket-client via pip3 install -r requirements.txt")
        return

    url = circuit["websocket_url"]
    request_message = (circuit.get("session_request") or "").strip()
    write_live_log(f"Connexion à {circuit['name']} — {url}")

    def on_open(ws):
        set_live_status("connected", "LIVE")
        write_live_log("WebSocket connecté")
        if request_message:
            ws.send(request_message)
            write_traffic("OUT", request_message)
            write_live_log(f"Requête envoyée : {request_message}")

    def on_message(ws, message):
        now = datetime.now().isoformat(timespec="seconds")
        preview = message if isinstance(message, str) else repr(message)
        write_traffic("IN", message)
        updates = parse_apex_frame(message)
        with LIVE_LOCK:
            STATE["live"]["messages"] += 1
            STATE["live"]["parsed_updates"] += len(updates)
            STATE["live"]["last_message_at"] = now
            STATE["live"]["last_frame_preview"] = preview[:180].replace("\n", " · ")
            STATE["live"]["status"] = "receiving"
            STATE["connection"] = "LIVE • DONNÉES"
        write_live_log(f"RX {preview[:4000]}")
        if updates:
            write_live_log(f"PARSED {len(updates)} mise(s) à jour Apex")

    def on_error(ws, error):
        if LIVE_STOP.is_set():
            return
        message = str(error)
        set_live_status("error", "ERREUR LIVE", message)
        write_live_log(f"ERREUR {message}")

    def on_close(ws, code, reason):
        if LIVE_STOP.is_set():
            return
        set_live_status("closed", "LIVE DÉCONNECTÉ", f"{code or ''} {reason or ''}".strip() or None)
        write_live_log(f"Fermeture {code} {reason}")

    retry_delay = 5
    while not LIVE_STOP.is_set():
        try:
            set_live_status("connecting", "CONNEXION…")
            LIVE_WS = websocket.WebSocketApp(
                url,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close,
                header=[
                    "User-Agent: Mozilla/5.0 Velocity/3.1",
                    "Cache-Control: no-cache",
                    "Pragma: no-cache",
                ],
            )
            LIVE_WS.run_forever(
                ping_interval=20,
                ping_timeout=10,
                suppress_origin=False,
                origin=circuit.get("live_url") or "https://live.apex-timing.com",
            )
        except Exception as exc:
            if LIVE_STOP.is_set():
                break
            set_live_status("error", "ERREUR LIVE", str(exc))
            write_live_log(f"EXCEPTION {exc}")
        finally:
            LIVE_WS = None

        if LIVE_STOP.is_set():
            break
        set_live_status("retrying", f"RECONNEXION DANS {retry_delay} S")
        write_live_log(f"Nouvelle tentative dans {retry_delay} secondes")
        LIVE_STOP.wait(retry_delay)


def time_to_seconds(value):
    return RACE_STATE.time_to_seconds(value)


def fmt_delta(seconds):
    return RACE_STATE.fmt_delta(seconds)


def driver_by_name(name):
    return RACE_STATE.driver_by_name(name)


def sync_state_from_race(snapshot, interpreted_events=None):
    return RACE_STATE.sync_state_from_race(snapshot, interpreted_events)


def payload():
    data = RACE_STATE.payload()
    now_ms = int(time.time() * 1000)
    with DRIVER_MESSAGE_LOCK:
        message = STATE.get("driver_message")
        if message:
            target = driver_by_name(message.get("target_driver"))
            if not message.get("delivered_at_ms") and target:
                current_laps = int(target.get("laps") or 0)
                baseline_laps = int(message.get("baseline_laps") or 0)
                if current_laps > baseline_laps:
                    message["delivered_at_ms"] = now_ms
                    message["delivery_reason"] = "line_crossing"
            delivered_at = message.get("delivered_at_ms")
            if delivered_at and now_ms - int(delivered_at) >= 15000:
                STATE["driver_message"] = None
                message = None
        data["driver_message"] = deepcopy(message) if message else None
    with SPOTTER_LOCK:
        data["spotter"] = deepcopy(STATE.get("spotter") or {})
    return data


def _team_public(team):
    if not isinstance(team, dict):
        return None
    return deepcopy(team)


def _member_by_id(data, member_id):
    for team in data.get("teams", []):
        for member in team.get("members", []):
            if str(member.get("id")) == str(member_id):
                return team, member
    return None, None


def _session_by_id(data, session_id):
    for session in data.get("sessions", []):
        if str(session.get("id")) == str(session_id):
            return session
    return None


def _race_session_public(session, include_assignments=True):
    if not isinstance(session, dict):
        return None
    public = {
        "id": session.get("id"), "name": session.get("name"), "status": session.get("status"),
        "circuit_id": session.get("circuit_id"), "circuit_name": session.get("circuit_name"),
        "followed_driver": session.get("followed_driver"), "team_id": session.get("team_id"),
        "team_name": session.get("team_name"), "created_at_ms": session.get("created_at_ms"),
        "ended_at_ms": session.get("ended_at_ms"),
    }
    if include_assignments:
        public["assignments"] = deepcopy(session.get("assignments") or {})
    return public


def _device_id_from_request():
    return str(request.headers.get("X-Velocity-Device") or request.cookies.get("velocity_device_id") or "").strip()


def _race_access_for_token(token):
    # Compatibilité des anciens liens V7.2.87 pendant la transition.
    token = str(token or "").strip()
    with RACE_SESSION_LOCK:
        session = deepcopy(RACE_SESSION) if isinstance(RACE_SESSION, dict) else None
    if not session or session.get("status") != "active": return None
    for role in ("spotter", "pilot"):
        if secrets.compare_digest(str(session.get("tokens", {}).get(role) or ""), token):
            return {"role": role, "session": _race_session_public(session)}
    return None


@app.get("/")
def index():
    return render_template("index.html", app_version=APP_VERSION, race_access_role="", race_access_token="", velocity_invite_token="")


@app.get("/join/<token>")
def race_join(token):
    access = _race_access_for_token(token)
    if not access:
        return render_template("index.html", app_version=APP_VERSION, race_access_role="expired", race_access_token="", velocity_invite_token=""), 410
    return render_template("index.html", app_version=APP_VERSION, race_access_role=access["role"], race_access_token=str(token), velocity_invite_token="")


@app.get("/invite/<token>")
def team_invite(token):
    with TEAM_DATA_LOCK:
        invite = deepcopy(TEAM_DATA.get("invites", {}).get(str(token)))
    if not invite or invite.get("revoked"):
        return render_template("index.html", app_version=APP_VERSION, race_access_role="", race_access_token="", velocity_invite_token="expired"), 410
    return render_template("index.html", app_version=APP_VERSION, race_access_role="", race_access_token="", velocity_invite_token=str(token))


@app.get("/api/teams")
def get_teams():
    with TEAM_DATA_LOCK:
        teams = deepcopy(TEAM_DATA.get("teams", []))
    return jsonify(ok=True, teams=teams)


@app.post("/api/teams")
def create_team():
    body=request.get_json(force=True,silent=True) or {}; name=str(body.get("name") or "").strip()[:80]
    if not name: return jsonify(ok=False,error="Nom de Team requis."),400
    with TEAM_DATA_LOCK:
        team={"id":secrets.token_hex(4).upper(),"name":name,"members":[],"created_at_ms":int(time.time()*1000)}
        TEAM_DATA["teams"].append(team); _save_team_data(TEAM_DATA)
    return jsonify(ok=True,team=team)


@app.delete("/api/teams/<team_id>")
def delete_team(team_id):
    with TEAM_DATA_LOCK:
        team=next((t for t in TEAM_DATA.get("teams",[]) if str(t.get("id"))==str(team_id)),None)
        if not team: return jsonify(ok=False,error="Team introuvable."),404
        active=_session_by_id(TEAM_DATA,TEAM_DATA.get("active_session_id")) if TEAM_DATA.get("active_session_id") else None
        if active and active.get("status")=="active" and str(active.get("team_id"))==str(team_id):
            return jsonify(ok=False,error="Terminez la Session Course avant de supprimer cette Team."),409
        member_ids={str(m.get("id")) for m in team.get("members",[])}
        device_ids={str(did) for m in team.get("members",[]) for did in (m.get("device_ids") or [])}
        TEAM_DATA["teams"]=[t for t in TEAM_DATA.get("teams",[]) if str(t.get("id"))!=str(team_id)]
        for did in device_ids: TEAM_DATA.get("devices",{}).pop(did,None)
        for token,invite in list(TEAM_DATA.get("invites",{}).items()):
            if str(invite.get("team_id"))==str(team_id) or str(invite.get("member_id")) in member_ids:
                TEAM_DATA.get("invites",{}).pop(token,None)
        _save_team_data(TEAM_DATA)
    return jsonify(ok=True)


@app.post("/api/teams/<team_id>/members")
def add_team_member(team_id):
    body=request.get_json(force=True,silent=True) or {}; name=str(body.get("name") or "").strip()[:80]
    roles=[r for r in (body.get("roles") or []) if r in {"pilot","spotter","team_manager"}]
    if not name: return jsonify(ok=False,error="Nom du membre requis."),400
    with TEAM_DATA_LOCK:
        team=next((t for t in TEAM_DATA.get("teams",[]) if str(t.get("id"))==str(team_id)),None)
        if not team: return jsonify(ok=False,error="Team introuvable."),404
        member={"id":secrets.token_hex(4).upper(),"name":name,"roles":roles,"device_ids":[],"created_at_ms":int(time.time()*1000)}
        team.setdefault("members",[]).append(member); _save_team_data(TEAM_DATA)
    return jsonify(ok=True,member=member)


@app.patch("/api/members/<member_id>")
def update_team_member(member_id):
    body=request.get_json(force=True,silent=True) or {}
    with TEAM_DATA_LOCK:
        team,member=_member_by_id(TEAM_DATA,member_id)
        if not member:return jsonify(ok=False,error="Membre introuvable."),404
        if "name" in body: member["name"]=str(body.get("name") or member.get("name") or "").strip()[:80]
        if "roles" in body: member["roles"]=[r for r in (body.get("roles") or []) if r in {"pilot","spotter","team_manager"}]
        _save_team_data(TEAM_DATA)
    return jsonify(ok=True,member=member)


@app.delete("/api/members/<member_id>")
def delete_team_member(member_id):
    with TEAM_DATA_LOCK:
        team, member = _member_by_id(TEAM_DATA, member_id)
        if not member:
            return jsonify(ok=False,error="Membre introuvable."),404
        # Retire les appareils et invitations liés au membre.
        for device_id in list(member.get("device_ids") or []):
            TEAM_DATA.get("devices", {}).pop(str(device_id), None)
        for token, invite in list(TEAM_DATA.get("invites", {}).items()):
            if str(invite.get("member_id")) == str(member_id):
                TEAM_DATA.get("invites", {}).pop(token, None)
        team["members"]=[m for m in team.get("members",[]) if str(m.get("id"))!=str(member_id)]
        # Retire ce membre de toutes les affectations de sessions.
        for session in TEAM_DATA.get("sessions",[]):
            assignments=session.get("assignments") or {}
            for role, mids in list(assignments.items()):
                if isinstance(mids, list):
                    assignments[role]=[mid for mid in mids if str(mid)!=str(member_id)]
                elif str(mids)==str(member_id):
                    assignments[role]=[]
        _save_team_data(TEAM_DATA)
    return jsonify(ok=True)


@app.post("/api/members/<member_id>/invite")
def create_member_invite(member_id):
    with TEAM_DATA_LOCK:
        team,member=_member_by_id(TEAM_DATA,member_id)
        if not member:return jsonify(ok=False,error="Membre introuvable."),404
        token=secrets.token_urlsafe(18); code=secrets.token_hex(3).upper()
        TEAM_DATA.setdefault("invites",{})[token]={"token":token,"code":code,"team_id":team.get("id"),"team_name":team.get("name"),"member_id":member.get("id"),"member_name":member.get("name"),"roles":deepcopy(member.get("roles") or []),"created_at_ms":int(time.time()*1000),"revoked":False}
        _save_team_data(TEAM_DATA)
    return jsonify(ok=True,link=f"{request.host_url.rstrip('/')}/invite/{token}",code=code)


@app.get("/api/invite/<token>")
def get_invite(token):
    with TEAM_DATA_LOCK: invite=deepcopy(TEAM_DATA.get("invites",{}).get(str(token)))
    if not invite or invite.get("revoked"): return jsonify(ok=False,error="Invitation invalide."),410
    return jsonify(ok=True,invite=invite)


@app.get("/api/invite/<token>/qr")
def invite_qr(token):
    with TEAM_DATA_LOCK:
        invite=deepcopy(TEAM_DATA.get("invites",{}).get(str(token)))
    if not invite or invite.get("revoked"):
        return jsonify(ok=False,error="Invitation invalide."),410
    if qrcode is None:
        return jsonify(ok=False,error="QR Code indisponible."),503
    link=f"{request.host_url.rstrip('/')}/invite/{token}"
    img=qrcode.make(link); buf=io.BytesIO(); img.save(buf,format="PNG"); buf.seek(0)
    return send_file(buf,mimetype="image/png",max_age=0)


@app.post("/api/invite/<token>/claim")
def claim_invite(token):
    body=request.get_json(force=True,silent=True) or {}; device_id=str(body.get("device_id") or _device_id_from_request() or secrets.token_urlsafe(18)).strip()
    device_name=str(body.get("device_name") or request.user_agent.platform or "Appareil Velocity")[:80]
    with TEAM_DATA_LOCK:
        invite=TEAM_DATA.get("invites",{}).get(str(token))
        if not invite or invite.get("revoked"): return jsonify(ok=False,error="Invitation invalide."),410
        team,member=_member_by_id(TEAM_DATA,invite.get("member_id"))
        if not member:return jsonify(ok=False,error="Membre introuvable."),404
        if device_id not in member.setdefault("device_ids",[]): member["device_ids"].append(device_id)
        TEAM_DATA.setdefault("devices",{})[device_id]={"id":device_id,"member_id":member.get("id"),"member_name":member.get("name"),"team_id":team.get("id"),"team_name":team.get("name"),"name":device_name,"last_seen_ms":int(time.time()*1000),"version":APP_VERSION}
        invite["claimed_device_id"]=device_id; invite["claimed_at_ms"]=int(time.time()*1000)
        _save_team_data(TEAM_DATA)
    resp=jsonify(ok=True,device_id=device_id,member={"id":member.get("id"),"name":member.get("name"),"team_name":team.get("name"),"roles":member.get("roles",[])})
    resp.set_cookie("velocity_device_id",device_id,max_age=60*60*24*365*3,samesite="Lax",secure=request.is_secure)
    return resp


@app.get("/api/device/me")
def device_me():
    device_id=_device_id_from_request()
    with TEAM_DATA_LOCK:
        dev=TEAM_DATA.get("devices",{}).get(device_id); data=deepcopy(dev) if dev else None
        if dev:
            dev["last_seen_ms"]=int(time.time()*1000); dev["version"]=APP_VERSION; _save_team_data(TEAM_DATA)
    return jsonify(ok=True,device=data)


@app.get("/api/device/session")
def device_session():
    device_id=_device_id_from_request()
    with TEAM_DATA_LOCK:
        dev=TEAM_DATA.get("devices",{}).get(device_id)
        if not dev:return jsonify(ok=True,paired=False,session=None,role=None)
        dev["last_seen_ms"]=int(time.time()*1000); dev["version"]=APP_VERSION
        _team,_member=_member_by_id(TEAM_DATA,dev.get("member_id"))
        authorized_roles=deepcopy((_member or {}).get("roles") or [])
        session=_session_by_id(TEAM_DATA,TEAM_DATA.get("active_session_id")) if TEAM_DATA.get("active_session_id") else None
        role=None
        if session and session.get("status")=="active":
            # Une session peut affecter plusieurs membres au même rôle.
            # Si un membre figure dans plusieurs rôles actifs, le rôle le plus
            # opérationnel est priorisé : Team Manager > Spotter > Pilote.
            assignments=session.get("assignments") or {}
            member_id=str(dev.get("member_id"))
            for r in ("team_manager","spotter","pilot"):
                mids=assignments.get(r) or []
                if not isinstance(mids,list): mids=[mids] if mids else []
                if any(str(mid)==member_id for mid in mids): role=r; break
        _save_team_data(TEAM_DATA)
        public=_race_session_public(session) if session and role else None
    return jsonify(ok=True,paired=True,device=deepcopy(dev),authorized_roles=authorized_roles,session=public,role=role)


@app.get("/api/race-session")
def get_race_session():
    with TEAM_DATA_LOCK:
        session=_session_by_id(TEAM_DATA,TEAM_DATA.get("active_session_id")) if TEAM_DATA.get("active_session_id") else None
        teams=deepcopy(TEAM_DATA.get("teams",[]))
    return jsonify(ok=True,session=_race_session_public(session) if session else None,teams=teams)


@app.post("/api/race-session/create")
def create_race_session():
    global RACE_SESSION
    body=request.get_json(force=True,silent=True) or {}; circuit_id=str(STATE.get("circuit_id") or "").strip()
    if not circuit_id:return jsonify(ok=False,error="Sélectionnez d'abord un circuit."),400
    circuits={str(c.get("id") or ""):c for c in load_circuits()}; circuit=circuits.get(circuit_id)
    if not circuit:return jsonify(ok=False,error="Circuit actif introuvable."),400
    team_id=str(body.get("team_id") or "").strip(); assignments=body.get("assignments") or {}
    with TEAM_DATA_LOCK:
        if TEAM_DATA.get("active_session_id"):
            current=_session_by_id(TEAM_DATA,TEAM_DATA.get("active_session_id"))
            if current and current.get("status")=="active":return jsonify(ok=False,error="Une session de course est déjà active.",session=_race_session_public(current)),409
        team=next((t for t in TEAM_DATA.get("teams",[]) if str(t.get("id"))==team_id),None)
        if not team:return jsonify(ok=False,error="Sélectionnez une Team."),400
        member_map={str(m.get("id")):m for m in team.get("members",[])}; clean={}
        for role in ("team_manager","spotter","pilot"):
            raw=assignments.get(role) or []
            mids=raw if isinstance(raw,list) else ([raw] if raw else [])
            valid=[]
            for mid in mids:
                mid=str(mid or "").strip()
                if not mid or mid in valid: continue
                m=member_map.get(mid)
                if not m or role not in (m.get("roles") or []):return jsonify(ok=False,error=f"Rôle {role} non autorisé pour ce membre."),400
                valid.append(mid)
            clean[role]=valid
        now_ms=int(time.time()*1000); sid=secrets.token_hex(4).upper()
        session={"id":sid,"name":str(body.get("name") or STATE.get("session_name") or "SESSION DE COURSE").strip()[:80] or "SESSION DE COURSE","status":"active","circuit_id":circuit_id,"circuit_name":str(circuit.get("name") or circuit_id),"followed_driver":str(STATE.get("followed_driver") or "").strip(),"team_id":team.get("id"),"team_name":team.get("name"),"assignments":clean,"created_at_ms":now_ms,"ended_at_ms":None}
        TEAM_DATA.setdefault("sessions",[]).append(session); TEAM_DATA["active_session_id"]=sid; _save_team_data(TEAM_DATA)
    # Miroir de compatibilité avec le verrouillage déjà présent côté V7.2.87.
    with RACE_SESSION_LOCK: RACE_SESSION=deepcopy(session)
    return jsonify(ok=True,session=_race_session_public(session))


@app.patch("/api/race-session/assignments")
def update_race_assignments():
    body=request.get_json(force=True,silent=True) or {}; assignments=body.get("assignments") or {}
    with TEAM_DATA_LOCK:
        session=_session_by_id(TEAM_DATA,TEAM_DATA.get("active_session_id")) if TEAM_DATA.get("active_session_id") else None
        if not session or session.get("status")!="active":return jsonify(ok=False,error="Aucune session active."),400
        team=next((t for t in TEAM_DATA.get("teams",[]) if str(t.get("id"))==str(session.get("team_id"))),None); member_map={str(m.get("id")):m for m in (team or {}).get("members",[])}
        clean={}
        for role in ("team_manager","spotter","pilot"):
            raw=assignments.get(role) or []
            mids=raw if isinstance(raw,list) else ([raw] if raw else [])
            valid=[]
            for mid in mids:
                mid=str(mid or "").strip()
                if not mid or mid in valid: continue
                m=member_map.get(mid)
                if not m or role not in (m.get("roles") or []):return jsonify(ok=False,error=f"Rôle {role} non autorisé."),400
                valid.append(mid)
            clean[role]=valid
        session["assignments"]=clean; _save_team_data(TEAM_DATA)
    return jsonify(ok=True,session=_race_session_public(session))


@app.post("/api/race-session/end")
def end_race_session():
    global RACE_SESSION
    with TEAM_DATA_LOCK:
        session=_session_by_id(TEAM_DATA,TEAM_DATA.get("active_session_id")) if TEAM_DATA.get("active_session_id") else None
        if not session or session.get("status")!="active":return jsonify(ok=False,error="Aucune session active."),400
        session["status"]="ended"; session["ended_at_ms"]=int(time.time()*1000); TEAM_DATA["active_session_id"]=None; _save_team_data(TEAM_DATA)
    with RACE_SESSION_LOCK: RACE_SESSION=deepcopy(session)
    return jsonify(ok=True,session=_race_session_public(session))


@app.get("/api/race-access/<token>")
def get_race_access(token):
    access=_race_access_for_token(token)
    if not access:return jsonify(ok=False,ended=True),410
    return jsonify(ok=True,role=access["role"],session=access["session"])



def _apex_request_port(circuit):
    """Déduit le port HTTP Apex du port WebSocket (port WS = port requête + 3)."""
    match = re.search(r":(\d+)(?:/|$)", str(circuit.get("websocket_url") or ""))
    if not match:
        return None
    port = int(match.group(1)) - 3
    return port if port > 0 else None


def _apex_http_request(circuit, command):
    port = _apex_request_port(circuit)
    if not port:
        raise ValueError("Port Apex introuvable pour ce circuit")
    encoded = urllib.parse.urlencode({"port": port, "request": command}).encode("utf-8")
    req = urllib.request.Request(
        "https://live-data.apex-timing.com/live-timing/commonv2/functions/request.php",
        data=encoded,
        headers={
            "User-Agent": "Mozilla/5.0 Velocity/7.2.128",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": circuit.get("live_url") or "https://www.apex-timing.com",
            "Referer": circuit.get("live_url") or "https://www.apex-timing.com/",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return response.read().decode("utf-8", errors="replace"), port


def _apex_session_kind(name):
    """Classe une session Apex sans dépendre de son identifiant numérique."""
    normalized = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode("ascii").casefold()
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized).strip()
    if re.search(r"\b(qualification|qualif|qualifying|tijdrijden|chrono|chronos|time trial|time attack)\b", normalized):
        return "qualification"
    if re.search(r"\b(endurance|resistencia|resistance|24h|12h|8h|6h|4h|2h)\b", normalized):
        return "endurance"
    if re.search(r"\b(sprint|race|course|finale|final|heat|manche)\b", normalized):
        return "race"
    if re.search(r"\b(practice|training|warm ?up|essai|essais|free practice)\b", normalized):
        return "practice"
    return "other"


def _parse_apex_sessions(raw):
    sessions = []
    for order, line in enumerate(str(raw or "").splitlines()):
        line = line.strip()
        if not line or "#" not in line:
            continue
        session_id, name = line.split("#", 1)
        session_id, name = session_id.strip(), name.strip()
        if not session_id or not name or session_id.casefold() == "error":
            continue
        sessions.append({"id": session_id, "name": name, "kind": _apex_session_kind(name), "order": order})
    return sessions


@app.get("/api/apex/sessions")
def apex_sessions():
    """Liste structurée des sessions historiques telle que fournie par Apex via S#."""
    circuit_id = str(request.args.get("circuit_id") or STATE.get("circuit_id") or "")
    circuit = next((c for c in load_circuits() if c["id"] == circuit_id), None)
    if not circuit:
        return jsonify(ok=False, error="Circuit inconnu"), 400
    try:
        raw, port = _apex_http_request(circuit, "S#")
        return jsonify(ok=True, sessions=_parse_apex_sessions(raw), raw=raw, port=port)
    except Exception as exc:
        write_live_log(f"SESSIONS APEX ERREUR {exc}")
        return jsonify(ok=False, error=str(exc)), 502


@app.post("/api/apex/history")
def apex_history():
    """Proxy limité aux commandes de consultation Apex utilisées par Analyzer."""
    body = request.get_json(force=True) or {}
    circuit_id = str(body.get("circuit_id") or STATE.get("circuit_id") or "")
    command = str(body.get("request") or "").strip()
    circuit = next((c for c in load_circuits() if c["id"] == circuit_id), None)
    if not circuit:
        return jsonify(ok=False, error="Circuit inconnu"), 400
    # Lecture seule : liste/snapshot et données L/P/B/INF uniquement.
    if not command or len(command) > 1000 or not re.fullmatch(r"[SDBINFPL#\-.0-9]+", command):
        return jsonify(ok=False, error="Commande Apex non autorisée"), 400
    try:
        raw, port = _apex_http_request(circuit, command)
        return jsonify(ok=True, raw=raw, port=port, request=command)
    except Exception as exc:
        write_live_log(f"HISTORIQUE APEX ERREUR {exc}")
        return jsonify(ok=False, error=str(exc)), 502


@app.get("/api/weather")
def weather():
    circuit_id = str(request.args.get("circuit_id") or STATE.get("circuit_id") or "")
    circuit = next((c for c in load_circuits() if c["id"] == circuit_id), None)
    if not circuit:
        return jsonify(ok=False, error="Circuit inconnu"), 400
    try:
        return jsonify(ok=True, weather=_weather_for_circuit(circuit))
    except Exception as exc:
        write_live_log(f"MÉTÉO ERREUR {exc}")
        return jsonify(ok=False, error=str(exc)), 502


@app.get("/api/state")
def get_state():
    return jsonify(payload())


@app.post("/api/spotter-state")
def update_spotter_state():
    body = request.get_json(force=True, silent=True) or {}
    snapshot = body.get("spotter")
    if not isinstance(snapshot, dict):
        return jsonify(ok=False, error="État Spotter invalide"), 400
    allowed = {"configured", "mode", "queue_mode", "queue", "maintenance", "incoming", "assignments", "movement_log", "incoming_queue_selections", "setup_karts", "free_started_at", "pit_ins", "pit_outs", "recalibrating", "client_id", "app_release"}
    if str(snapshot.get("app_release") or "") != APP_VERSION:
        return jsonify(ok=False, error="Version Spotter obsolète", expected=APP_VERSION), 409
    clean = {key: deepcopy(value) for key, value in snapshot.items() if key in allowed}
    clean["updated_at_ms"] = int(time.time() * 1000)
    clean["circuit_id"] = str(STATE.get("circuit_id") or "")
    with SPOTTER_LOCK:
        STATE["spotter"] = clean
    return jsonify(ok=True, updated_at_ms=clean["updated_at_ms"])


@app.get("/api/spotter-state")
def get_spotter_state():
    with SPOTTER_LOCK:
        return jsonify(ok=True, spotter=deepcopy(STATE.get("spotter") or {}))


@app.post("/api/mode")
def set_mode():
    value = request.get_json(force=True).get("mode")
    if value not in {"qualification", "sprint", "endurance", "analyzer"}:
        return jsonify(ok=False), 400
    STATE["mode"] = "endurance" if value == "analyzer" else value
    return jsonify(ok=True)


def reset_race_state_for_new_circuit(circuit_id):
    """Vide toutes les données appartenant au circuit précédent."""
    with DRIVER_MESSAGE_LOCK:
        STATE["driver_message"] = None
    # Le Quick Change est partagé entre Analyzer et Spotter pour un circuit donné.
    # Un changement de piste ne doit jamais réutiliser les files du circuit précédent.
    with SPOTTER_LOCK:
        STATE["spotter"] = {"configured": False, "updated_at_ms": int(time.time() * 1000), "queue_mode": 1, "setup_karts": ["X", "Y", "Z"], "queue": [], "maintenance": [], "incoming": [], "assignments": {}, "mode": "live", "app_release": APP_VERSION, "client_id": "server-reset", "circuit_id": str(circuit_id or "")}
    stop_live_connection()
    APEX_TABLE.reset()
    PROTOCOL_ENGINE.reset()
    EVENT_STORE.reset()
    RACE_STATE.reset_state(circuit_id)


@app.post("/api/circuit")
def set_circuit():
    body = request.get_json(force=True, silent=True) or {}
    circuit_id = str(body.get("circuit_id") or "").strip()
    circuits = {str(c.get("id") or "").strip(): c for c in load_circuits()}
    if not circuit_id or circuit_id not in circuits:
        return jsonify(ok=False, error="Circuit inconnu dans la configuration du serveur."), 400
    with RACE_SESSION_LOCK:
        active_session = deepcopy(RACE_SESSION) if isinstance(RACE_SESSION, dict) and RACE_SESSION.get("status") == "active" else None
    if active_session and str(active_session.get("circuit_id") or "") != circuit_id:
        return jsonify(ok=False, error="Circuit verrouillé par la session de course active. Terminez la session avant de changer de circuit."), 423
    try:
        # Plusieurs appareils (TM Analyzer + Spotter smartphone) peuvent sélectionner
        # le même circuit. Ne jamais réinitialiser l'état partagé si le circuit est
        # déjà actif : le deuxième appareil doit récupérer le Quick Change existant.
        current_circuit = str(STATE.get("circuit_id") or "").strip()
        if current_circuit != circuit_id:
            reset_race_state_for_new_circuit(circuit_id)
    except Exception as error:
        app.logger.exception("Erreur pendant la sélection du circuit %s", circuit_id)
        return jsonify(ok=False, error=f"Initialisation du circuit impossible : {error}"), 500
    return jsonify(ok=True, circuit_id=circuit_id, circuit_name=circuits[circuit_id].get("name"))




@app.post("/api/driver-message")
def send_driver_message():
    body = request.get_json(force=True) or {}
    text = str(body.get("message") or "").strip()
    urgent = bool(body.get("urgent"))
    if not text:
        return jsonify(ok=False, error="Le message est vide."), 400
    if len(text) > 25:
        return jsonify(ok=False, error="Le message dépasse 25 caractères."), 400
    target_name = str(STATE.get("followed_driver") or "").strip()
    target = driver_by_name(target_name)
    if not target_name or not target:
        return jsonify(ok=False, error="Aucune équipe suivie active."), 400
    now_ms = int(time.time() * 1000)
    with DRIVER_MESSAGE_LOCK:
        STATE["driver_message"] = {
            "id": f"msg-{now_ms}",
            "message": text,
            "urgent": urgent,
            "target_driver": target_name,
            "baseline_laps": int(target.get("laps") or 0),
            "created_at_ms": now_ms,
            "delivered_at_ms": now_ms if urgent else None,
            "delivery_reason": "urgent" if urgent else "line_crossing",
            "duration_ms": 15000,
        }
    return jsonify(ok=True, message=deepcopy(STATE["driver_message"]))


@app.post("/api/follow")
def follow():
    name = request.get_json(force=True).get("driver")
    if not driver_by_name(name):
        return jsonify(ok=False), 400
    with DRIVER_MESSAGE_LOCK:
        STATE["driver_message"] = None
    STATE["followed_driver"] = name
    STATE["followed_locked"] = True
    driver = driver_by_name(name)
    STATE["followed_snapshot"] = deepcopy(driver)
    RACE_STATE.followed_crossing_marker[name] = (driver.get("laps"), driver.get("last"))
    STATE["qualif_crossing"] = None
    return jsonify(ok=True)


@app.post("/api/test-crossing")
def test_crossing():
    p = request.get_json(force=True)
    driver = driver_by_name(STATE["followed_driver"])
    if not driver:
        return jsonify(ok=False), 400
    last_lap = p.get("lap", driver["last"])
    driver["last"] = last_lap
    driver["laps"] += 1
    ranking = sorted(
        [d for d in STATE.get("drivers", []) if time_to_seconds(d.get("best")) < 9999],
        key=lambda d: time_to_seconds(d.get("best")),
    )
    leader = ranking[0] if ranking else None
    second = ranking[1] if len(ranking) > 1 else None
    last_sec = time_to_seconds(last_lap)
    leader_sec = time_to_seconds(leader.get("best")) if leader else 9999
    is_session_best = bool(
        leader
        and leader.get("driver") == driver.get("driver")
        and abs(last_sec - leader_sec) < 0.0005
    )
    if is_session_best and second:
        reference_driver = second.get("driver") or "—"
        delta = last_sec - time_to_seconds(second.get("best"))
    elif is_session_best:
        reference_driver = "—"
        delta = 0.0
    else:
        reference_driver = leader.get("driver") if leader else "—"
        delta = last_sec - leader_sec if leader else 0.0
    STATE["qualif_crossing"] = {
        "event_id": datetime.now().isoformat(timespec="milliseconds"),
        "position": driver["pos"],
        "delta": fmt_delta(delta),
        "reference_driver": reference_driver,
        "is_session_best": is_session_best,
    }
    return jsonify(ok=True)


@app.post("/api/clear-crossing")
def clear_crossing():
    STATE["qualif_crossing"] = None
    return jsonify(ok=True)


@app.post("/api/add-penalty")
def add_penalty():
    p = request.get_json(force=True)
    driver, penalty = p.get("driver", "").strip(), p.get("penalty", "").strip()
    if not driver or not penalty:
        return jsonify(ok=False), 400
    now = datetime.now().isoformat(timespec="seconds")
    STATE["penalties"].append({"driver": driver, "penalty": penalty, "at": now, "time": now[11:16]})
    STATE["penalties"].sort(key=lambda item: item.get("at", ""), reverse=True)
    return jsonify(ok=True)


@app.post("/api/move")
def move():
    p = request.get_json(force=True)
    try:
        pos = int(p.get("pos"))
    except Exception:
        return jsonify(ok=False), 400
    target = driver_by_name(p.get("driver"))
    other = next((d for d in STATE["drivers"] if d["pos"] == pos), None)
    if not target or not other:
        return jsonify(ok=False), 400
    target["pos"], other["pos"] = other["pos"], target["pos"]
    return jsonify(ok=True)


@app.post("/api/add-quick-change")
def add_quick_change():
    p = request.get_json(force=True)
    item = {
        "queue": len(STATE["quick_change"]) + 1,
        "pit_time": datetime.now().strftime("%H:%M:%S"),
        "pace_rank": p.get("pace_rank", "8/32"),
        "previous_team": p.get("previous_team", "NOUVELLE ÉQUIPE"),
        "kart": int(p.get("kart", 99)),
        "avg5": p.get("avg5", "1:06.500"),
        "kart_delta": p.get("kart_delta", "--"),
    }
    STATE["quick_change"].append(item)
    STATE["generic_alert"] = {
        "event_id": datetime.now().isoformat(timespec="milliseconds"),
        "title": "AJOUTÉ AU QUICK CHANGE",
        "line1": item["previous_team"],
        "line2": f"Kart {item['kart']} — Rang {item['pace_rank']}",
    }
    return jsonify(ok=True)


@app.post("/api/test-top8-pit-entry")
def test_top8_pit_entry():
    if STATE.get("mode") != "endurance":
        return jsonify(ok=False, error="Alerte Top 8 disponible uniquement en endurance"), 400
    STATE["generic_alert"] = {
        "event_id": datetime.now().isoformat(timespec="milliseconds"),
        "kind": "top8_pit_entry",
        "title": "🚨 ALERTE",
        "team": "TEAM ALPHA",
        "position": 5,
    }
    return jsonify(ok=True)


@app.post("/api/pop-quick-change")
def pop_quick_change():
    if STATE["quick_change"]:
        STATE["quick_change"].pop(0)
        for i, item in enumerate(STATE["quick_change"], 1):
            item["queue"] = i
    return jsonify(ok=True)


@app.post("/api/live/reconnect")
def reconnect_live():
    if not STATE.get("circuit_id"):
        return jsonify(ok=False, error="Sélectionnez un circuit"), 400
    circuit = next((c for c in load_circuits() if c["id"] == STATE["circuit_id"]), None)
    return jsonify(ok=True, circuit=circuit)


@app.post("/api/apex/frame")
def apex_frame():
    payload_data = request.get_json(force=True, silent=True) or {}
    frame = payload_data.get("frame", "")
    frame_circuit_id = payload_data.get("circuit_id")
    if not isinstance(frame, str) or not frame:
        return jsonify(ok=False, error="Trame Apex vide"), 400
    # Une ancienne WebSocket peut encore livrer une dernière trame pendant le
    # changement de piste. Elle est ignorée pour empêcher tout mélange.
    if frame_circuit_id != STATE.get("circuit_id"):
        return jsonify(ok=True, ignored=True, error="Trame d'un ancien circuit ignorée")

    write_traffic("IN", frame)
    grid = parse_grid_frame(frame)
    initial_updates = grid.updates if grid else []
    if grid:
        PROTOCOL_ENGINE.interpreter.set_schema(grid.schema, grid.labels)
    updates, unknown = decode_frame(frame)
    PROTOCOL_ENGINE.observe_frame(frame, grid, initial_updates + updates)
    changes = []
    interpreted_events = []
    for update in initial_updates:
        change = APEX_TABLE.apply(update)
        changes.append(change.to_dict())
        PROTOCOL_ENGINE.apply(update, change.previous_value, initial=True)
    for update in updates:
        change = APEX_TABLE.apply(update)
        changes.append(change.to_dict())
        interpreted_events.extend(PROTOCOL_ENGINE.apply(update, change.previous_value))

    snapshot = PROTOCOL_ENGINE.snapshot()
    sync_state_from_race(snapshot, interpreted_events)
    now = datetime.now().isoformat(timespec="seconds")
    with LIVE_LOCK:
        STATE["live"]["messages"] += 1
        STATE["live"]["parsed_updates"] += len(initial_updates) + len(updates)
        STATE["live"]["last_message_at"] = now
        STATE["live"]["last_frame_preview"] = frame[:180].replace("\n", " · ")
        STATE["live"]["status"] = "receiving"
        STATE["connection"] = "LIVE • DONNÉES RÉELLES"
    EVENT_STORE.append({"type": "websocket_frame", "raw": frame, "updates": updates_to_dicts(initial_updates + updates), "changes": changes, "unknown": unknown, "interpreted_events": interpreted_events})
    return jsonify(ok=True, decoded_count=len(initial_updates)+len(updates), unknown_count=len(unknown), race=snapshot, interpreted_events=interpreted_events)


@app.post("/api/apex/status")
def apex_browser_status():
    data = request.get_json(force=True, silent=True) or {}
    status = str(data.get("status", "idle"))
    connection = str(data.get("connection", status.upper()))
    error = data.get("error")
    set_live_status(status, connection, error)
    return jsonify(ok=True)


@app.get("/api/live/diagnostics")
def live_diagnostics():
    return jsonify({"live": deepcopy(STATE["live"]), "log_file": str(LOG_FILE)})


@app.post("/api/developer/settings")
def developer_settings():
    data = request.get_json(force=True, silent=True) or {}
    developer_mode = bool(data.get("developer_mode", STATE.get("developer_mode", False)))
    recording = bool(data.get("traffic_recording", STATE.get("traffic_recording", False)))
    STATE["developer_mode"] = developer_mode
    if recording and not STATE.get("traffic_recording"):
        # Chaque démarrage produit une capture propre et facile à partager.
        LOG_MANAGER.reset_traffic()
        STATE["traffic_recording_started_at"] = datetime.now().isoformat(timespec="seconds")
        write_live_log("Boîte noire Apex démarrée")
    elif not recording and STATE.get("traffic_recording"):
        write_live_log("Boîte noire Apex arrêtée")
    STATE["traffic_recording"] = recording
    return jsonify(ok=True, developer_mode=developer_mode, traffic_recording=recording)


@app.post("/api/developer/outbound")
def developer_outbound():
    data = request.get_json(force=True, silent=True) or {}
    message = data.get("message", "")
    if message:
        write_traffic("OUT", message)
    return jsonify(ok=True)


@app.get("/api/developer/export-logs")
def export_logs():
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in (TRAFFIC_IN_FILE, TRAFFIC_OUT_FILE, LOG_FILE):
            if path.exists():
                archive.write(path, arcname=path.name)
        metadata = {
            "version": STATE.get("version"),
            "circuit_id": STATE.get("circuit_id"),
            "websocket_url": STATE.get("live", {}).get("websocket_url"),
            "recording_started_at": STATE.get("traffic_recording_started_at"),
            "exported_at": datetime.now().isoformat(timespec="seconds"),
        }
        archive.writestr("capture_info.json", json.dumps(metadata, ensure_ascii=False, indent=2))
    memory.seek(0)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return send_file(memory, mimetype="application/zip", as_attachment=True, download_name=f"Velocity_Apex_Logs_{stamp}.zip")


@app.post("/api/clear-alert")
def clear_alert():
    STATE["generic_alert"] = None
    return jsonify(ok=True)


if __name__ == "__main__":
    desktop_url = "http://127.0.0.1:8200"
    print(f"\nVelocity V{APP_VERSION} — {APP_RELEASE_NAME}")
    print(f"Application Mac : {desktop_url}")
    print(f"Application réseau : http://{local_ip()}:8200")
    print(f"Journal Apex : {LOG_FILE}")
    print("Fermer Velocity : Ctrl + C\n")
    threading.Timer(1.0, lambda: webbrowser.open(desktop_url)).start()
    app.run(host="0.0.0.0", port=8200, debug=False, threaded=True)
