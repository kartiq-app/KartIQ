from copy import deepcopy
from collections.abc import MutableMapping
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
import hashlib

try:
    import websocket
except ImportError:
    websocket = None

from flask import Flask, jsonify, render_template, request, send_file, session, redirect, url_for, abort, has_request_context

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
from backend.services.relay_score_engine import fetch_and_compute
from data_recorder import RecorderStore, RecorderManager

app = Flask(__name__)

# V7.2.1759 — Velocity Lab Data Recorder. Initialisation paresseuse : une base
# Postgres momentanément indisponible ne doit jamais empêcher Velocity de démarrer.
RECORDER_INIT_LOCK = threading.RLock()
RECORDER_STORE = None
RECORDER_MANAGER = None
RECORDER_INIT_ERROR = None

def _get_recorder_manager():
    global RECORDER_STORE, RECORDER_MANAGER, RECORDER_INIT_ERROR
    with RECORDER_INIT_LOCK:
        if RECORDER_MANAGER is not None:
            return RECORDER_MANAGER
        try:
            RECORDER_STORE = RecorderStore(APP_DIR)
            RECORDER_MANAGER = RecorderManager(RECORDER_STORE, load_circuits)
            RECORDER_INIT_ERROR = None
            return RECORDER_MANAGER
        except Exception as exc:
            RECORDER_INIT_ERROR = str(exc)
            raise

def _resume_velocity_recorders():
    try:
        _get_recorder_manager().resume_active()
    except Exception:
        # L'état est exposé dans Velocity Lab ; pas de crash global de l'application.
        pass

# V7.2.1740 — Private Google Authentication
app.secret_key = os.environ.get("VELOCITY_SESSION_SECRET") or secrets.token_hex(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("RENDER") == "true",
)

def _velocity_allowed_emails():
    raw = os.environ.get("VELOCITY_ALLOWED_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}

def _velocity_google_configured():
    return bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"))

def _velocity_is_authorized():
    email = str(session.get("velocity_email") or "").strip().lower()
    return bool(email and email in _velocity_allowed_emails())

def _velocity_external_base():
    return (os.environ.get("VELOCITY_PUBLIC_URL") or os.environ.get("RENDER_EXTERNAL_URL") or request.url_root).rstrip("/")



WORKSPACE_DATA_LOCK = threading.RLock()
WORKSPACE_DATA_PATH = APP_DIR / "velocity_workspaces.json"
LEGACY_WORKSPACE_ID = "LEGACY"


def _default_workspace_data():
    return {"workspaces": []}


def _load_workspace_data():
    try:
        if WORKSPACE_DATA_PATH.exists():
            data = json.loads(WORKSPACE_DATA_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                base = _default_workspace_data()
                base.update(data)
                if not isinstance(base.get("workspaces"), list):
                    base["workspaces"] = []
                return base
    except Exception:
        pass
    return _default_workspace_data()


def _save_workspace_data(data):
    try:
        WORKSPACE_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = WORKSPACE_DATA_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(WORKSPACE_DATA_PATH)
    except Exception:
        app.logger.exception("Sauvegarde des Sessions Velocity impossible")


WORKSPACE_DATA = _load_workspace_data()


def _workspace_member_emails(workspace):
    values = workspace.get("members") or []
    return {str(value or "").strip().lower() for value in values if str(value or "").strip()}


def _workspace_by_id_unlocked(workspace_id):
    wid = str(workspace_id or "").strip()
    return next((item for item in WORKSPACE_DATA.get("workspaces", []) if str(item.get("id") or "") == wid), None)


def _workspace_by_code_unlocked(code):
    wanted = re.sub(r"[^A-Z0-9]", "", str(code or "").upper())
    if not wanted:
        return None
    for item in WORKSPACE_DATA.get("workspaces", []):
        current = re.sub(r"[^A-Z0-9]", "", str(item.get("code") or "").upper())
        if current == wanted:
            return item
    return None


def _workspace_unique_code_unlocked():
    existing = {str(item.get("code") or "").upper() for item in WORKSPACE_DATA.get("workspaces", [])}
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        raw = "".join(secrets.choice(alphabet) for _ in range(6))
        code = f"VK-{raw}"
        if code not in existing:
            return code


def _workspace_default_name():
    name = str(session.get("velocity_name") or "").strip() if has_request_context() else ""
    email = str(session.get("velocity_email") or "").strip() if has_request_context() else ""
    identity = name.split()[0] if name else (email.split("@", 1)[0] if email else "Velocity")
    return f"Session {identity}"[:80]


def _create_workspace_unlocked(email, name=None):
    email = str(email or "").strip().lower()
    now_ms = int(time.time() * 1000)
    workspace = {
        "id": secrets.token_hex(6).upper(),
        "code": _workspace_unique_code_unlocked(),
        "name": str(name or _workspace_default_name() or "Session Velocity").strip()[:80] or "Session Velocity",
        "owner_email": email,
        "members": [email] if email else [],
        "created_at_ms": now_ms,
        "updated_at_ms": now_ms,
    }
    WORKSPACE_DATA.setdefault("workspaces", []).append(workspace)
    _save_workspace_data(WORKSPACE_DATA)
    return workspace


def _workspace_for_authorized_email(create=True):
    if not has_request_context():
        return None
    email = str(session.get("velocity_email") or "").strip().lower()
    if not email:
        return None
    selected = str(session.get("velocity_workspace_id") or "").strip()
    with WORKSPACE_DATA_LOCK:
        if selected:
            current = _workspace_by_id_unlocked(selected)
            if current and email in _workspace_member_emails(current):
                return current
        memberships = [
            item for item in WORKSPACE_DATA.get("workspaces", [])
            if email in _workspace_member_emails(item)
        ]
        if memberships:
            memberships.sort(key=lambda item: int(item.get("updated_at_ms") or item.get("created_at_ms") or 0), reverse=True)
            current = memberships[0]
        elif create:
            current = _create_workspace_unlocked(email)
        else:
            current = None
    if current:
        session["velocity_workspace_id"] = current.get("id")
    return current


def _paired_device_workspace_id():
    """Rattache un appareil Spotter/Pilote à la Session Velocity de sa Session Course."""
    if not has_request_context() or "TEAM_DATA" not in globals():
        return None
    device_id = str(request.headers.get("X-Velocity-Device") or request.cookies.get("velocity_device_id") or "").strip()
    if not device_id:
        return None
    lock = globals().get("TEAM_DATA_LOCK")
    data = globals().get("TEAM_DATA")
    if lock is None or not isinstance(data, dict):
        return None
    with lock:
        dev = data.get("devices", {}).get(device_id)
        if not dev:
            return None
        member_id = str(dev.get("member_id") or "")
        candidates = [
            item for item in data.get("sessions", [])
            if item.get("status") == "active" and item.get("workspace_id")
        ]
        candidates.sort(key=lambda item: int(item.get("created_at_ms") or 0), reverse=True)
        for race_session in candidates:
            assignments = race_session.get("assignments") or {}
            if any(
                member_id in {str(mid) for mid in (assignments.get(role) or [])}
                for role in ("team_manager", "spotter", "pilot")
            ):
                return str(race_session.get("workspace_id") or "").strip() or None
    return None


def _current_workspace_id(create=True):
    if not has_request_context():
        return LEGACY_WORKSPACE_ID
    if _velocity_is_authorized():
        workspace = _workspace_for_authorized_email(create=create)
        return str((workspace or {}).get("id") or LEGACY_WORKSPACE_ID)
    paired = _paired_device_workspace_id()
    return paired or LEGACY_WORKSPACE_ID


def _workspace_public(workspace_id=None):
    wid = str(workspace_id or _current_workspace_id()).strip()
    if wid == LEGACY_WORKSPACE_ID:
        return {
            "id": wid,
            "code": "",
            "name": "Session partagée",
            "owner": False,
            "can_manage": False,
        }
    email = str(session.get("velocity_email") or "").strip().lower() if has_request_context() else ""
    with WORKSPACE_DATA_LOCK:
        workspace = _workspace_by_id_unlocked(wid)
        if not workspace:
            return {"id": wid, "code": "", "name": "Session Velocity", "owner": False, "can_manage": False}
        return {
            "id": workspace.get("id"),
            "code": workspace.get("code"),
            "name": workspace.get("name"),
            "owner": bool(email and email == str(workspace.get("owner_email") or "").lower()),
            "can_manage": bool(email and email in _workspace_member_emails(workspace)),
            "members_count": len(_workspace_member_emails(workspace)),
        }


def _new_velocity_state():
    return {
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
        "spotter": {
            "configured": False,
            "updated_at_ms": None,
            "queue_mode": 1,
            "setup_karts": ["X"],
            "setup_queue_files": [1],
            "queue": [],
            "maintenance": [],
            "incoming": [],
            "assignments": {},
            "kart_tracking_enabled": False,
            "mutation_at_ms": 0,
            "mode": "live",
            "app_release": APP_VERSION,
            "client_id": "server",
        },
        "spotter_registry": {},
        "analyzer_rules": None,
        "analyzer_strategy": None,
    }


class _WorkspaceRuntime:
    def __init__(self, workspace_id):
        self.workspace_id = str(workspace_id or LEGACY_WORKSPACE_ID)
        self.state = _new_velocity_state()
        self.apex_table = ApexTable()
        self.protocol_engine = ProtocolEngine()
        safe = re.sub(r"[^A-Za-z0-9_-]+", "-", self.workspace_id).strip("-") or "legacy"
        self.event_store = ApexEventStore(APP_DIR / "recordings" / safe)
        self.race_state = RaceStateService(self.state)
        self.recent_frame_hashes = {}
        self.frame_lock = threading.Lock()

    def duplicate_frame(self, circuit_id, frame, window_ms=1200):
        """Évite qu'un même live soit interprété deux fois si deux appareils partagent la session."""
        now_ms = int(time.time() * 1000)
        digest = hashlib.sha1((str(circuit_id or "") + "\\0" + str(frame or "")).encode("utf-8", errors="replace")).hexdigest()
        with self.frame_lock:
            stale_before = now_ms - max(5000, window_ms * 4)
            for key, seen_at in list(self.recent_frame_hashes.items()):
                if seen_at < stale_before:
                    self.recent_frame_hashes.pop(key, None)
            previous = self.recent_frame_hashes.get(digest)
            self.recent_frame_hashes[digest] = now_ms
            return previous is not None and now_ms - previous <= window_ms


RUNTIME_LOCK = threading.RLock()
RUNTIMES = {}


def _runtime_for_workspace(workspace_id=None):
    wid = str(workspace_id or _current_workspace_id()).strip() or LEGACY_WORKSPACE_ID
    with RUNTIME_LOCK:
        runtime = RUNTIMES.get(wid)
        if runtime is None:
            runtime = _WorkspaceRuntime(wid)
            RUNTIMES[wid] = runtime
        return runtime


class _WorkspaceStateProxy(MutableMapping):
    def _target(self):
        return _runtime_for_workspace().state

    def __getitem__(self, key):
        return self._target()[key]

    def __setitem__(self, key, value):
        self._target()[key] = value

    def __delitem__(self, key):
        del self._target()[key]

    def __iter__(self):
        return iter(self._target())

    def __len__(self):
        return len(self._target())

    def get(self, key, default=None):
        return self._target().get(key, default)

    def update(self, *args, **kwargs):
        return self._target().update(*args, **kwargs)

    def setdefault(self, key, default=None):
        return self._target().setdefault(key, default)


class _WorkspaceObjectProxy:
    def __init__(self, attribute):
        object.__setattr__(self, "_attribute", attribute)

    def _target(self):
        return getattr(_runtime_for_workspace(), object.__getattribute__(self, "_attribute"))

    def __getattr__(self, name):
        return getattr(self._target(), name)


STATE = _WorkspaceStateProxy()
APEX_TABLE = _WorkspaceObjectProxy("apex_table")
PROTOCOL_ENGINE = _WorkspaceObjectProxy("protocol_engine")
EVENT_STORE = _WorkspaceObjectProxy("event_store")
RACE_STATE = _WorkspaceObjectProxy("race_state")


WEATHER_CACHE = {}
WEATHER_LOCATION_CACHE = {}
WEATHER_LOCK = threading.Lock()
DRIVER_MESSAGE_LOCK = threading.Lock()
SPOTTER_LOCK = threading.Lock()
ANALYZER_RULES_LOCK = threading.Lock()
ANALYZER_STRATEGY_LOCK = threading.Lock()
RACE_SESSION_LOCK = threading.Lock()
RACE_SESSION = None
TEAM_DATA_LOCK = threading.Lock()
TEAM_DATA_PATH = APP_DIR / "velocity_team_management.json"

def _default_team_data():
    return {"teams": [], "invites": {}, "devices": {}, "active_session_id": None, "active_session_ids": {}, "sessions": []}

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
    with ANALYZER_RULES_LOCK:
        data["analyzer_rules"] = deepcopy(STATE.get("analyzer_rules"))
    with ANALYZER_STRATEGY_LOCK:
        data["analyzer_strategy"] = deepcopy(STATE.get("analyzer_strategy"))
    data["workspace"] = _workspace_public()
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


def _active_session_for_workspace(data, workspace_id=None):
    wid = str(workspace_id or _current_workspace_id()).strip() or LEGACY_WORKSPACE_ID
    mapping = data.setdefault("active_session_ids", {})
    sid = str(mapping.get(wid) or "").strip()
    current = _session_by_id(data, sid) if sid else None
    if current and current.get("status") == "active":
        return current
    # Migration douce : une ancienne session sans workspace appartient au runtime LEGACY.
    legacy_sid = str(data.get("active_session_id") or "").strip()
    legacy = _session_by_id(data, legacy_sid) if legacy_sid else None
    if wid == LEGACY_WORKSPACE_ID and legacy and legacy.get("status") == "active":
        return legacy
    candidates = [
        item for item in data.get("sessions", [])
        if item.get("status") == "active" and str(item.get("workspace_id") or LEGACY_WORKSPACE_ID) == wid
    ]
    if not candidates:
        mapping.pop(wid, None)
        return None
    candidates.sort(key=lambda item: int(item.get("created_at_ms") or 0), reverse=True)
    current = candidates[0]
    mapping[wid] = current.get("id")
    return current


def _set_active_session_for_workspace(data, workspace_id, session_id):
    wid = str(workspace_id or LEGACY_WORKSPACE_ID).strip() or LEGACY_WORKSPACE_ID
    mapping = data.setdefault("active_session_ids", {})
    if session_id:
        mapping[wid] = str(session_id)
    else:
        mapping.pop(wid, None)
    if wid == LEGACY_WORKSPACE_ID:
        data["active_session_id"] = str(session_id) if session_id else None


def _race_session_public(session, include_assignments=True):
    if not isinstance(session, dict):
        return None
    public = {
        "id": session.get("id"), "name": session.get("name"), "status": session.get("status"),
        "circuit_id": session.get("circuit_id"), "circuit_name": session.get("circuit_name"),
        "followed_driver": session.get("followed_driver"), "pilot_focus_driver": session.get("pilot_focus_driver") or session.get("followed_driver"), "pilot_focus_apex_row": session.get("pilot_focus_apex_row"), "team_id": session.get("team_id"),
        "team_name": session.get("team_name"), "workspace_id": session.get("workspace_id"), "created_at_ms": session.get("created_at_ms"),
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



@app.get("/login")
def velocity_login_page():
    if _velocity_is_authorized():
        return redirect("/")
    return render_template("login.html", google_ready=_velocity_google_configured())

@app.get("/auth/google")
def velocity_google_login():
    if not _velocity_google_configured():
        return render_template("login.html", google_ready=False, auth_error="Google OAuth n'est pas encore configuré sur Render."), 503
    state = secrets.token_urlsafe(32)
    session["oauth_state"] = state
    redirect_uri = _velocity_external_base() + "/auth/google/callback"
    params = {
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
    }
    return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params))

@app.get("/auth/google/callback")
def velocity_google_callback():
    if request.args.get("state") != session.pop("oauth_state", None):
        abort(400)
    code = request.args.get("code")
    if not code:
        return render_template("login.html", google_ready=True, auth_error="Connexion Google annulée ou refusée."), 401
    redirect_uri = _velocity_external_base() + "/auth/google/callback"
    token_body = urllib.parse.urlencode({
        "code": code,
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=token_body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            token_data = json.loads(resp.read().decode("utf-8"))
        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError("Jeton Google absent")
        user_req = urllib.request.Request(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        with urllib.request.urlopen(user_req, timeout=10) as resp:
            user = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return render_template("login.html", google_ready=True, auth_error="Impossible de vérifier le compte Google."), 401
    email = str(user.get("email") or "").strip().lower()
    if not user.get("email_verified") or email not in _velocity_allowed_emails():
        session.clear()
        return render_template("login.html", google_ready=True, denied_email=email), 403
    session.clear()
    session["velocity_email"] = email
    session["velocity_name"] = str(user.get("name") or "")
    session.permanent = True
    return redirect("/")

@app.get("/logout")
def velocity_logout():
    session.clear()
    response = redirect("/login")
    # La déconnexion retire aussi l'identité d'appareil de ce navigateur :
    # Velocity ne doit plus rester accessible sur l'ordinateur après logout.
    response.delete_cookie("velocity_device_id")
    return response


def _velocity_paired_device():
    """Retourne l'appareil associé si le cookie/header correspond à un membre connu."""
    device_id = _device_id_from_request()
    if not device_id:
        return None
    with TEAM_DATA_LOCK:
        dev = TEAM_DATA.get("devices", {}).get(str(device_id))
        return deepcopy(dev) if dev else None


def _velocity_invite_session_valid():
    """Autorisation temporaire pendant l'écran d'association via QR/lien membre."""
    token = str(session.get("velocity_invite_token") or "").strip()
    if not token:
        return False
    with TEAM_DATA_LOCK:
        invite = TEAM_DATA.get("invites", {}).get(token)
        return bool(invite and not invite.get("revoked"))


def _velocity_member_access():
    return bool(_velocity_paired_device() or _velocity_invite_session_valid())


@app.before_request
def velocity_private_access_guard():
    path = request.path
    public_exact = {"/login", "/auth/google", "/auth/google/callback", "/logout", "/favicon.ico"}

    # OAuth admin / Team Manager.
    if path in public_exact or path.startswith("/static/auth/"):
        return None
    # Les métadonnées PWA et icônes doivent rester publiques pour qu'iOS
    # puisse créer correctement le raccourci avant/après authentification.
    if path == "/static/manifest.json" or path.startswith("/static/icons/"):
        return None
    if _velocity_is_authorized():
        return None

    # Les liens d'invitation et anciens liens de rôle doivent pouvoir atteindre
    # leur route afin que le token soit vérifié côté serveur.
    if path.startswith("/invite/") or path.startswith("/join/"):
        return None

    # Pendant une invitation valide, seules les ressources nécessaires à
    # l'association et les fichiers statiques de l'interface sont accessibles.
    if _velocity_invite_session_valid():
        if path.startswith("/api/invite/") or path.startswith("/static/"):
            return None

    # Après association, le cookie/header de l'appareil devient l'autorisation
    # membre. Le JavaScript existant limite ensuite l'interface au rôle affecté.
    if _velocity_paired_device():
        return None

    # Aucun code ou état Velocity n'est servi à un visiteur anonyme.
    if path.startswith("/api/") or path.startswith("/static/"):
        return ("Accès interdit", 403)
    return redirect("/login")


@app.get("/")
def index():
    # Garantit qu'un compte Google autorisé possède au moins une Session Velocity.
    if _velocity_is_authorized():
        _workspace_for_authorized_email(create=True)
    return render_template(
        "index.html", app_version=APP_VERSION, race_access_role="", race_access_token="", velocity_invite_token="",
        velocity_workspace_id=_current_workspace_id(create=True), velocity_account_email=str(session.get("velocity_email") or ""),
    )


@app.get("/api/workspaces")
def get_workspaces():
    if not _velocity_is_authorized():
        return jsonify(ok=False, error="Gestion des sessions réservée aux comptes Velocity autorisés."), 403
    email = str(session.get("velocity_email") or "").strip().lower()
    current_id = _current_workspace_id(create=True)
    with WORKSPACE_DATA_LOCK:
        workspaces = []
        for item in WORKSPACE_DATA.get("workspaces", []):
            if email not in _workspace_member_emails(item):
                continue
            workspaces.append({
                "id": item.get("id"),
                "code": item.get("code"),
                "name": item.get("name"),
                "owner": email == str(item.get("owner_email") or "").lower(),
                "members_count": len(_workspace_member_emails(item)),
                "created_at_ms": item.get("created_at_ms"),
                "updated_at_ms": item.get("updated_at_ms"),
            })
    workspaces.sort(key=lambda item: int(item.get("updated_at_ms") or item.get("created_at_ms") or 0), reverse=True)
    return jsonify(ok=True, active_workspace_id=current_id, workspaces=workspaces)


@app.post("/api/workspaces/create")
def create_workspace():
    if not _velocity_is_authorized():
        return jsonify(ok=False, error="Compte Velocity requis."), 403
    body = request.get_json(force=True, silent=True) or {}
    name = str(body.get("name") or "").strip()[:80]
    email = str(session.get("velocity_email") or "").strip().lower()
    with WORKSPACE_DATA_LOCK:
        workspace = _create_workspace_unlocked(email, name or None)
    session["velocity_workspace_id"] = workspace.get("id")
    return jsonify(ok=True, workspace=_workspace_public(workspace.get("id")))


@app.post("/api/workspaces/join")
def join_workspace():
    if not _velocity_is_authorized():
        return jsonify(ok=False, error="Compte Velocity requis."), 403
    body = request.get_json(force=True, silent=True) or {}
    code = str(body.get("code") or "").strip()
    email = str(session.get("velocity_email") or "").strip().lower()
    if not code:
        return jsonify(ok=False, error="Saisissez le code de la session."), 400
    with WORKSPACE_DATA_LOCK:
        workspace = _workspace_by_code_unlocked(code)
        if not workspace:
            return jsonify(ok=False, error="Code de session introuvable."), 404
        members = _workspace_member_emails(workspace)
        if email not in members:
            workspace.setdefault("members", []).append(email)
        workspace["updated_at_ms"] = int(time.time() * 1000)
        _save_workspace_data(WORKSPACE_DATA)
        wid = workspace.get("id")
    session["velocity_workspace_id"] = wid
    return jsonify(ok=True, workspace=_workspace_public(wid))


@app.post("/api/workspaces/select")
def select_workspace():
    if not _velocity_is_authorized():
        return jsonify(ok=False, error="Compte Velocity requis."), 403
    body = request.get_json(force=True, silent=True) or {}
    wid = str(body.get("workspace_id") or "").strip()
    email = str(session.get("velocity_email") or "").strip().lower()
    with WORKSPACE_DATA_LOCK:
        workspace = _workspace_by_id_unlocked(wid)
        if not workspace or email not in _workspace_member_emails(workspace):
            return jsonify(ok=False, error="Session Velocity inaccessible."), 403
        workspace["updated_at_ms"] = int(time.time() * 1000)
        _save_workspace_data(WORKSPACE_DATA)
    session["velocity_workspace_id"] = wid
    return jsonify(ok=True, workspace=_workspace_public(wid))


def _select_fallback_workspace_for_email(email: str):
    with WORKSPACE_DATA_LOCK:
        fallback = next((item for item in WORKSPACE_DATA.get("workspaces", []) if email in _workspace_member_emails(item)), None)
        if fallback is None:
            fallback = _create_workspace_unlocked(email)
        return str(fallback.get("id") or LEGACY_WORKSPACE_ID)


@app.delete("/api/workspaces/<workspace_id>")
def delete_workspace(workspace_id):
    if not _velocity_is_authorized():
        return jsonify(ok=False, error="Compte Velocity requis."), 403
    email = str(session.get("velocity_email") or "").strip().lower()
    wid = str(workspace_id or "").strip()
    with WORKSPACE_DATA_LOCK:
        workspace = _workspace_by_id_unlocked(wid)
        if not workspace or email not in _workspace_member_emails(workspace):
            return jsonify(ok=False, error="Session Velocity inaccessible."), 404
        if email != str(workspace.get("owner_email") or "").strip().lower():
            return jsonify(ok=False, error="Seul le propriétaire peut supprimer cette Session Velocity."), 403
        WORKSPACE_DATA["workspaces"] = [item for item in WORKSPACE_DATA.get("workspaces", []) if str(item.get("id") or "") != wid]
        _save_workspace_data(WORKSPACE_DATA)
    with RUNTIME_LOCK:
        RUNTIMES.pop(wid, None)
    # Les anciennes Sessions Course restent dans l'historique mais sont terminées
    # pour qu'aucun appareil ne continue à pointer vers un workspace supprimé.
    with TEAM_DATA_LOCK:
        for race_session in TEAM_DATA.get("sessions", []):
            if str(race_session.get("workspace_id") or LEGACY_WORKSPACE_ID) == wid and race_session.get("status") == "active":
                race_session["status"] = "ended"
                race_session["ended_at_ms"] = int(time.time() * 1000)
        TEAM_DATA.setdefault("active_session_ids", {}).pop(wid, None)
        _save_team_data(TEAM_DATA)
    if str(session.get("velocity_workspace_id") or "") == wid:
        session["velocity_workspace_id"] = _select_fallback_workspace_for_email(email)
    return jsonify(ok=True, active_workspace_id=session.get("velocity_workspace_id"))


@app.post("/api/workspaces/<workspace_id>/leave")
def leave_workspace(workspace_id):
    if not _velocity_is_authorized():
        return jsonify(ok=False, error="Compte Velocity requis."), 403
    email = str(session.get("velocity_email") or "").strip().lower()
    wid = str(workspace_id or "").strip()
    with WORKSPACE_DATA_LOCK:
        workspace = _workspace_by_id_unlocked(wid)
        if not workspace or email not in _workspace_member_emails(workspace):
            return jsonify(ok=False, error="Session Velocity inaccessible."), 404
        if email == str(workspace.get("owner_email") or "").strip().lower():
            return jsonify(ok=False, error="Le propriétaire doit supprimer la session, pas la quitter."), 409
        workspace["members"] = [member for member in workspace.get("members", []) if str(member).strip().lower() != email]
        workspace["updated_at_ms"] = int(time.time() * 1000)
        _save_workspace_data(WORKSPACE_DATA)
    if str(session.get("velocity_workspace_id") or "") == wid:
        session["velocity_workspace_id"] = _select_fallback_workspace_for_email(email)
    return jsonify(ok=True, active_workspace_id=session.get("velocity_workspace_id"))


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
        session.pop("velocity_invite_token", None)
        return render_template("index.html", app_version=APP_VERSION, race_access_role="", race_access_token="", velocity_invite_token="expired"), 410
    session["velocity_invite_token"] = str(token)
    return render_template("index.html", app_version=APP_VERSION, race_access_role="", race_access_token="", velocity_invite_token=str(token))



@app.get("/api/team-management/snapshot")
def team_management_snapshot():
    """Snapshot navigateur : Team Management + métadonnées des Sessions Velocity."""
    with TEAM_DATA_LOCK:
        snapshot = {
            "schema": 2,
            "teams": deepcopy(TEAM_DATA.get("teams", [])),
            "devices": deepcopy(TEAM_DATA.get("devices", {})),
            "invites": deepcopy(TEAM_DATA.get("invites", {})),
            "saved_at_ms": int(time.time() * 1000),
        }
    with WORKSPACE_DATA_LOCK:
        snapshot["workspaces"] = deepcopy(WORKSPACE_DATA.get("workspaces", []))
    return jsonify(ok=True, snapshot=snapshot)


@app.post("/api/team-management/restore")
def team_management_restore():
    """Restaure le backup navigateur uniquement si Render n'a plus aucune Team."""
    body = request.get_json(force=True, silent=True) or {}
    snapshot = body.get("snapshot") or {}
    teams = snapshot.get("teams")
    devices = snapshot.get("devices")
    invites = snapshot.get("invites")
    workspaces = snapshot.get("workspaces")
    if workspaces is None:
        workspaces = []
    if not isinstance(teams, list) or not isinstance(devices, dict) or not isinstance(invites, dict) or not isinstance(workspaces, list):
        return jsonify(ok=False, error="Sauvegarde Team Management invalide."), 400
    # Garde-fous simples contre un payload accidentellement énorme.
    if len(teams) > 50 or len(devices) > 500 or len(invites) > 500 or len(workspaces) > 100:
        return jsonify(ok=False, error="Sauvegarde Team Management trop volumineuse."), 400
    with TEAM_DATA_LOCK:
        if TEAM_DATA.get("teams"):
            return jsonify(ok=True, restored=False, reason="server_not_empty", teams=deepcopy(TEAM_DATA.get("teams", [])))
        clean_teams = []
        valid_roles = {"pilot", "spotter", "team_manager"}
        member_ids = set()
        team_ids = set()
        for raw_team in teams:
            if not isinstance(raw_team, dict):
                continue
            tid = str(raw_team.get("id") or "").strip()[:80]
            name = str(raw_team.get("name") or "").strip()[:80]
            if not tid or not name or tid in team_ids:
                continue
            team_ids.add(tid)
            clean_members = []
            for raw_member in raw_team.get("members") or []:
                if not isinstance(raw_member, dict):
                    continue
                mid = str(raw_member.get("id") or "").strip()[:80]
                mname = str(raw_member.get("name") or "").strip()[:80]
                if not mid or not mname or mid in member_ids:
                    continue
                member_ids.add(mid)
                roles = [r for r in (raw_member.get("roles") or []) if r in valid_roles]
                device_ids = [str(x)[:160] for x in (raw_member.get("device_ids") or []) if str(x).strip()]
                clean_members.append({
                    "id": mid,
                    "name": mname,
                    "roles": roles,
                    "device_ids": list(dict.fromkeys(device_ids)),
                    "created_at_ms": int(raw_member.get("created_at_ms") or int(time.time()*1000)),
                })
            clean_teams.append({
                "id": tid,
                "name": name,
                "members": clean_members,
                "created_at_ms": int(raw_team.get("created_at_ms") or int(time.time()*1000)),
            })
        clean_devices = {}
        for did, raw_dev in devices.items():
            if not isinstance(raw_dev, dict):
                continue
            did = str(did).strip()[:160]
            mid = str(raw_dev.get("member_id") or "").strip()
            tid = str(raw_dev.get("team_id") or "").strip()
            if not did or mid not in member_ids or tid not in team_ids:
                continue
            dev = deepcopy(raw_dev)
            dev["id"] = did
            dev["member_id"] = mid
            dev["team_id"] = tid
            dev["version"] = APP_VERSION
            clean_devices[did] = dev
        clean_invites = {}
        for token, raw_invite in invites.items():
            if not isinstance(raw_invite, dict):
                continue
            token = str(token).strip()[:240]
            mid = str(raw_invite.get("member_id") or "").strip()
            tid = str(raw_invite.get("team_id") or "").strip()
            if token and mid in member_ids and tid in team_ids:
                clean_invites[token] = deepcopy(raw_invite)
        TEAM_DATA["teams"] = clean_teams
        TEAM_DATA["devices"] = clean_devices
        TEAM_DATA["invites"] = clean_invites
        # Une MAJ ne restaure jamais une ancienne course active.
        TEAM_DATA["sessions"] = []
        TEAM_DATA["active_session_id"] = None
        TEAM_DATA["active_session_ids"] = {}
        _save_team_data(TEAM_DATA)
    if workspaces:
        clean_workspaces=[];seen_ids=set();seen_codes=set()
        for raw_workspace in workspaces:
            if not isinstance(raw_workspace,dict):
                continue
            wid=str(raw_workspace.get("id") or "").strip()[:80]
            code=str(raw_workspace.get("code") or "").strip().upper()[:20]
            name=str(raw_workspace.get("name") or "Session Velocity").strip()[:80] or "Session Velocity"
            owner=str(raw_workspace.get("owner_email") or "").strip().lower()[:160]
            members=[]
            for value in raw_workspace.get("members") or []:
                email=str(value or "").strip().lower()[:160]
                if email and email not in members:members.append(email)
            if owner and owner not in members:members.insert(0,owner)
            if not wid or not code or wid in seen_ids or code in seen_codes:
                continue
            seen_ids.add(wid);seen_codes.add(code)
            clean_workspaces.append({"id":wid,"code":code,"name":name,"owner_email":owner,"members":members,"created_at_ms":int(raw_workspace.get("created_at_ms") or int(time.time()*1000)),"updated_at_ms":int(raw_workspace.get("updated_at_ms") or int(time.time()*1000))})
        if clean_workspaces:
            with WORKSPACE_DATA_LOCK:
                WORKSPACE_DATA["workspaces"]=clean_workspaces
                _save_workspace_data(WORKSPACE_DATA)
    return jsonify(ok=True, restored=True, teams=deepcopy(clean_teams))


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



@app.patch("/api/teams/<team_id>")
def update_team(team_id):
    body=request.get_json(force=True,silent=True) or {}
    name=str(body.get("name") or "").strip()[:80]
    if not name:return jsonify(ok=False,error="Nom de Team requis."),400
    with TEAM_DATA_LOCK:
        team=next((t for t in TEAM_DATA.get("teams",[]) if str(t.get("id"))==str(team_id)),None)
        if not team:return jsonify(ok=False,error="Team introuvable."),404
        team["name"]=name
        for dev in TEAM_DATA.get("devices",{}).values():
            if str(dev.get("team_id"))==str(team_id):dev["team_name"]=name
        for invite in TEAM_DATA.get("invites",{}).values():
            if str(invite.get("team_id"))==str(team_id):invite["team_name"]=name
        for race_session in TEAM_DATA.get("sessions",[]):
            if race_session.get("status")=="active" and str(race_session.get("team_id"))==str(team_id):
                race_session["team_name"]=name
        _save_team_data(TEAM_DATA)
    return jsonify(ok=True,team=deepcopy(team))


@app.delete("/api/teams/<team_id>")
def delete_team(team_id):
    with TEAM_DATA_LOCK:
        team=next((t for t in TEAM_DATA.get("teams",[]) if str(t.get("id"))==str(team_id)),None)
        if not team: return jsonify(ok=False,error="Team introuvable."),404
        active=next((s for s in TEAM_DATA.get("sessions",[]) if s.get("status")=="active" and str(s.get("team_id"))==str(team_id)),None)
        if active:
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
    if not _velocity_is_authorized() and not _velocity_paired_device():
        if str(session.get("velocity_invite_token") or "") != str(token):
            return jsonify(ok=False,error="Invitation non autorisée."),403
    with TEAM_DATA_LOCK: invite=deepcopy(TEAM_DATA.get("invites",{}).get(str(token)))
    if not invite or invite.get("revoked"): return jsonify(ok=False,error="Invitation invalide."),410
    return jsonify(ok=True,invite=invite)


@app.get("/api/invite/<token>/qr")
def invite_qr(token):
    if not _velocity_is_authorized() and not _velocity_paired_device():
        if str(session.get("velocity_invite_token") or "") != str(token):
            return jsonify(ok=False,error="Invitation non autorisée."),403
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
    if not _velocity_is_authorized() and not _velocity_paired_device():
        if str(session.get("velocity_invite_token") or "") != str(token):
            return jsonify(ok=False,error="Invitation non autorisée."),403
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
        session.pop("velocity_invite_token", None)
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
        session=None
        role=None
        member_id=str(dev.get("member_id"))
        candidates=[s for s in TEAM_DATA.get("sessions",[]) if s.get("status")=="active"]
        candidates.sort(key=lambda s:int(s.get("created_at_ms") or 0),reverse=True)
        for candidate in candidates:
            assignments=candidate.get("assignments") or {}
            found_role=None
            for r in ("team_manager","spotter","pilot"):
                mids=assignments.get(r) or []
                if not isinstance(mids,list): mids=[mids] if mids else []
                if any(str(mid)==member_id for mid in mids): found_role=r; break
            if found_role:
                session=candidate;role=found_role;break
        _save_team_data(TEAM_DATA)
        public=_race_session_public(session) if session and role else None
    return jsonify(ok=True,paired=True,device=deepcopy(dev),authorized_roles=authorized_roles,session=public,role=role)


@app.get("/api/race-session")
def get_race_session():
    workspace_id=_current_workspace_id()
    with TEAM_DATA_LOCK:
        session=_active_session_for_workspace(TEAM_DATA,workspace_id)
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
    workspace_id=_current_workspace_id()
    with TEAM_DATA_LOCK:
        current=_active_session_for_workspace(TEAM_DATA,workspace_id)
        if current and current.get("status")=="active":return jsonify(ok=False,error="Une session de course est déjà active dans cette Session Velocity.",session=_race_session_public(current)),409
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
        initial_focus_driver=str(STATE.get("followed_driver") or "").strip()
        initial_focus_entry=driver_by_name(initial_focus_driver) if initial_focus_driver else None
        session={"id":sid,"workspace_id":workspace_id,"name":str(body.get("name") or STATE.get("session_name") or "SESSION DE COURSE").strip()[:80] or "SESSION DE COURSE","status":"active","circuit_id":circuit_id,"circuit_name":str(circuit.get("name") or circuit_id),"followed_driver":initial_focus_driver,"pilot_focus_driver":initial_focus_driver,"pilot_focus_apex_row":(initial_focus_entry or {}).get("apex_row"),"team_id":team.get("id"),"team_name":str(body.get("team_name") or team.get("name") or "").strip()[:80] or team.get("name"),"assignments":clean,"created_at_ms":now_ms,"ended_at_ms":None}
        TEAM_DATA.setdefault("sessions",[]).append(session); _set_active_session_for_workspace(TEAM_DATA,workspace_id,sid); _save_team_data(TEAM_DATA)
    # Miroir de compatibilité avec le verrouillage déjà présent côté V7.2.87.
    with RACE_SESSION_LOCK: RACE_SESSION=deepcopy(session)
    return jsonify(ok=True,session=_race_session_public(session))


@app.patch("/api/race-session/assignments")
def update_race_assignments():
    body=request.get_json(force=True,silent=True) or {}; assignments=body.get("assignments") or {}
    workspace_id=_current_workspace_id()
    with TEAM_DATA_LOCK:
        session=_active_session_for_workspace(TEAM_DATA,workspace_id)
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


@app.patch("/api/race-session/update")
def update_race_session():
    body=request.get_json(force=True,silent=True) or {}
    assignments=body.get("assignments")
    workspace_id=_current_workspace_id()
    with TEAM_DATA_LOCK:
        session=_active_session_for_workspace(TEAM_DATA,workspace_id)
        if not session or session.get("status")!="active": return jsonify(ok=False,error="Aucune session active."),400
        team=next((t for t in TEAM_DATA.get("teams",[]) if str(t.get("id"))==str(session.get("team_id"))),None)
        if not team:return jsonify(ok=False,error="Team introuvable."),404
        if assignments is not None:
            member_map={str(m.get("id")):m for m in team.get("members",[])};clean={}
            for role in ("team_manager","spotter","pilot"):
                raw=assignments.get(role) or [];mids=raw if isinstance(raw,list) else ([raw] if raw else []);valid=[]
                for mid in mids:
                    mid=str(mid or "").strip()
                    if not mid or mid in valid:continue
                    m=member_map.get(mid)
                    if not m or role not in (m.get("roles") or []):return jsonify(ok=False,error=f"Rôle {role} non autorisé."),400
                    valid.append(mid)
                clean[role]=valid
            session["assignments"]=clean
        if "session_name" in body:
            value=str(body.get("session_name") or "").strip()[:80]
            if value:session["name"]=value
        if "team_name" in body:
            value=str(body.get("team_name") or "").strip()[:80]
            if value:
                session["team_name"]=value;team["name"]=value
                for dev in TEAM_DATA.get("devices",{}).values():
                    if str(dev.get("team_id"))==str(team.get("id")):dev["team_name"]=value
        _save_team_data(TEAM_DATA);public=_race_session_public(session)
    with RACE_SESSION_LOCK:
        global RACE_SESSION
        RACE_SESSION=deepcopy(session)
    return jsonify(ok=True,session=public)


@app.patch("/api/race-session/pilot-focus")
def update_race_pilot_focus():
    """Cible indépendante affichée sur le Focus Endurance des appareils Pilote."""
    body=request.get_json(force=True,silent=True) or {}
    requested_row=body.get("apex_row")
    requested_driver=str(body.get("driver") or "").strip()
    target=None
    if requested_row not in (None,""):
        try:
            row_num=int(requested_row)
            target=next((d for d in STATE.get("drivers",[]) if int(d.get("apex_row") or -1)==row_num),None)
        except (TypeError,ValueError):
            target=None
    if target is None and requested_driver:
        target=driver_by_name(requested_driver)
    if not target:
        return jsonify(ok=False,error="Équipe/pilote introuvable dans le live."),400
    workspace_id=_current_workspace_id()
    with TEAM_DATA_LOCK:
        session=_active_session_for_workspace(TEAM_DATA,workspace_id)
        if not session or session.get("status")!="active":
            return jsonify(ok=False,error="Aucune session active."),400
        session["pilot_focus_driver"]=str(target.get("driver") or requested_driver).strip()
        session["pilot_focus_apex_row"]=target.get("apex_row")
        _save_team_data(TEAM_DATA)
        public=_race_session_public(session)
    with RACE_SESSION_LOCK:
        global RACE_SESSION
        RACE_SESSION=deepcopy(session)
    return jsonify(ok=True,session=public)


@app.post("/api/race-session/end")
def end_race_session():
    global RACE_SESSION
    workspace_id=_current_workspace_id()
    with TEAM_DATA_LOCK:
        session=_active_session_for_workspace(TEAM_DATA,workspace_id)
        if not session or session.get("status")!="active":return jsonify(ok=False,error="Aucune session active."),400
        session["status"]="ended"; session["ended_at_ms"]=int(time.time()*1000); _set_active_session_for_workspace(TEAM_DATA,workspace_id,None); _save_team_data(TEAM_DATA)
    with RACE_SESSION_LOCK: RACE_SESSION=deepcopy(session)
    return jsonify(ok=True,session=_race_session_public(session))


@app.get("/api/race-access/<token>")
def get_race_access(token):
    access=_race_access_for_token(token)
    if not access:return jsonify(ok=False,ended=True),410
    return jsonify(ok=True,role=access["role"],session=access["session"])




# V7.2.1773 — longues endurances : reconstruction SCORE RELAIS côté serveur.
# Le navigateur ne transporte/calcul plus des dizaines de milliers de tours.
RELAY_SCORE_JOB_LOCK = threading.RLock()
RELAY_SCORE_JOBS = {}
RELAY_SCORE_JOB_TTL_S = 1800


def _relay_score_job_cleanup():
    now = time.time()
    with RELAY_SCORE_JOB_LOCK:
        expired = [
            job_id for job_id, item in RELAY_SCORE_JOBS.items()
            if now - float(item.get("updated_at") or item.get("created_at") or now) > RELAY_SCORE_JOB_TTL_S
        ]
        for job_id in expired:
            RELAY_SCORE_JOBS.pop(job_id, None)


def _relay_score_job_public(item):
    return {
        "id": item.get("id"),
        "status": item.get("status"),
        "circuit_id": item.get("circuit_id"),
        "progress": deepcopy(item.get("progress") or {}),
        "error": item.get("error"),
        "result": deepcopy(item.get("result")) if item.get("status") == "done" else None,
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
    }


def _relay_score_run_job(job_id):
    with RELAY_SCORE_JOB_LOCK:
        item = RELAY_SCORE_JOBS.get(job_id)
        if not item:
            return
        circuit_id = item["circuit_id"]
        drivers = deepcopy(item["drivers"])
        item["status"] = "running"
        item["updated_at"] = time.time()

    circuit = next((c for c in load_circuits() if c["id"] == circuit_id), None)
    if not circuit:
        with RELAY_SCORE_JOB_LOCK:
            item = RELAY_SCORE_JOBS.get(job_id)
            if item:
                item.update(status="error", error="Circuit inconnu", updated_at=time.time())
        return

    def progress(payload):
        with RELAY_SCORE_JOB_LOCK:
            current = RELAY_SCORE_JOBS.get(job_id)
            if not current or current.get("cancelled"):
                raise RuntimeError("SCORE_RELAIS_JOB_CANCELLED")
            current["progress"] = dict(payload or {})
            current["updated_at"] = time.time()

    try:
        def cancelled():
            with RELAY_SCORE_JOB_LOCK:
                current = RELAY_SCORE_JOBS.get(job_id)
                return not current or bool(current.get("cancelled"))
        result = fetch_and_compute(circuit, drivers, _apex_http_request, progress=progress, max_workers=4, cancelled=cancelled)
        with RELAY_SCORE_JOB_LOCK:
            current = RELAY_SCORE_JOBS.get(job_id)
            if current:
                if current.get("cancelled"):
                    current.update(status="cancelled", result=None, updated_at=time.time())
                else:
                    current.update(
                        status="done",
                        result=result,
                        progress={"phase": "done", "done": len(drivers), "total": len(drivers), "team": ""},
                        updated_at=time.time(),
                    )
    except Exception as exc:
        with RELAY_SCORE_JOB_LOCK:
            current = RELAY_SCORE_JOBS.get(job_id)
            if current:
                if current.get("cancelled") or str(exc) == "SCORE_RELAIS_JOB_CANCELLED":
                    current.update(status="cancelled", error=None, updated_at=time.time())
                else:
                    current.update(status="error", error=str(exc), updated_at=time.time())
                    write_live_log(f"SCORE RELAIS SERVEUR ERREUR {exc}")


@app.post("/api/apex/relay-scores")
def apex_relay_scores_start():
    """Lance une reconstruction SCORE RELAIS serveur, adaptée aux 12H/24H."""
    _relay_score_job_cleanup()
    body = request.get_json(force=True, silent=True) or {}
    circuit_id = str(body.get("circuit_id") or STATE.get("circuit_id") or "")
    drivers = body.get("drivers") or []
    circuit = next((c for c in load_circuits() if c["id"] == circuit_id), None)
    if not circuit:
        return jsonify(ok=False, error="Circuit inconnu"), 400
    if not isinstance(drivers, list) or not drivers:
        return jsonify(ok=False, error="Aucune équipe à reconstruire"), 400
    safe = []
    for driver in drivers[:100]:
        try:
            row_id = int(driver.get("apex_row") or 0)
        except Exception:
            row_id = 0
        if not row_id:
            continue
        safe.append({
            "apex_row": row_id,
            "driver": str(driver.get("driver") or "")[:160],
            "pilot": str(driver.get("pilot") or "")[:160],
            "kart": str(driver.get("kart") or driver.get("apex") or "")[:40],
            "laps": driver.get("laps"),
            "pit_stops": driver.get("pit_stops"),
        })
    if not safe:
        return jsonify(ok=False, error="Aucune ligne Apex valide"), 400
    job_id = secrets.token_urlsafe(12)
    now = time.time()
    item = {
        "id": job_id, "status": "queued", "circuit_id": circuit_id, "drivers": safe,
        "progress": {"phase": "queued", "done": 0, "total": len(safe), "team": ""},
        "result": None, "error": None, "cancelled": False,
        "created_at": now, "updated_at": now,
    }
    with RELAY_SCORE_JOB_LOCK:
        RELAY_SCORE_JOBS[job_id] = item
    threading.Thread(target=_relay_score_run_job, args=(job_id,), daemon=True, name=f"relay-score-{job_id[:6]}").start()
    return jsonify(ok=True, job=_relay_score_job_public(item))


@app.get("/api/apex/relay-scores/<job_id>")
def apex_relay_scores_status(job_id):
    _relay_score_job_cleanup()
    with RELAY_SCORE_JOB_LOCK:
        item = RELAY_SCORE_JOBS.get(str(job_id))
        if not item:
            return jsonify(ok=False, error="Job SCORE RELAIS introuvable"), 404
        return jsonify(ok=True, job=_relay_score_job_public(item))


@app.post("/api/apex/relay-scores/<job_id>/cancel")
def apex_relay_scores_cancel(job_id):
    with RELAY_SCORE_JOB_LOCK:
        item = RELAY_SCORE_JOBS.get(str(job_id))
        if not item:
            return jsonify(ok=False, error="Job SCORE RELAIS introuvable"), 404
        item["cancelled"] = True
        if item.get("status") in ("queued", "running"):
            item["status"] = "cancelled"
        item["updated_at"] = time.time()
        return jsonify(ok=True, job=_relay_score_job_public(item))


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
            "User-Agent": "Mozilla/5.0 Velocity/7.2.135",
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


def _recorder_authorized():
    return _velocity_is_authorized()


def _recorder_manager_or_response():
    if not _recorder_authorized():
        return None, (jsonify(ok=False, error="Velocity Lab Recorder est réservé aux comptes Velocity autorisés."), 403)
    try:
        return _get_recorder_manager(), None
    except Exception as exc:
        return None, (jsonify(ok=False, error=f"Data Recorder indisponible : {exc}", storage={"persistent": False, "label": "Base indisponible"}), 503)


@app.get("/api/lab/recorders")
def lab_recorders():
    manager, error = _recorder_manager_or_response()
    if error:
        return error
    payload_data = manager.status()
    payload_data.update(ok=True, circuits=[{
        "id": c.get("id"), "name": c.get("name"), "country": c.get("country"),
        "websocket_ready": bool(c.get("websocket_url")),
    } for c in load_circuits()])
    return jsonify(payload_data)


@app.post("/api/lab/recorders")
def lab_recorder_create():
    manager, error = _recorder_manager_or_response()
    if error:
        return error
    body = request.get_json(force=True, silent=True) or {}
    circuit_id = str(body.get("circuit_id") or "").strip()
    name = str(body.get("name") or "").strip()
    if not circuit_id:
        return jsonify(ok=False, error="Sélectionnez un circuit Apex."), 400
    try:
        recording = manager.create(name, circuit_id)
        return jsonify(ok=True, recording=recording, storage=manager.store.storage_info())
    except Exception as exc:
        return jsonify(ok=False, error=str(exc)), 400


@app.post("/api/lab/recorders/<recording_id>/stop")
def lab_recorder_stop(recording_id):
    manager, error = _recorder_manager_or_response()
    if error:
        return error
    try:
        recording = manager.stop(recording_id)
        return jsonify(ok=True, recording=recording)
    except KeyError:
        return jsonify(ok=False, error="Enregistrement introuvable."), 404
    except Exception as exc:
        return jsonify(ok=False, error=str(exc)), 400


@app.delete("/api/lab/recorders/<recording_id>")
def lab_recorder_delete(recording_id):
    manager, error = _recorder_manager_or_response()
    if error:
        return error
    try:
        if not manager.store.delete_recording(recording_id):
            return jsonify(ok=False, error="Enregistrement introuvable."), 404
        return jsonify(ok=True)
    except ValueError as exc:
        return jsonify(ok=False, error=str(exc)), 409


@app.get("/api/lab/recorders/<recording_id>/export")
def lab_recorder_export(recording_id):
    manager, error = _recorder_manager_or_response()
    if error:
        return error
    try:
        memory, filename = manager.store.export_zip(recording_id)
    except KeyError:
        return jsonify(ok=False, error="Enregistrement introuvable."), 404
    return send_file(memory, mimetype="application/zip", as_attachment=True, download_name=filename, max_age=0)


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


@app.post("/api/analyzer-rules")
def update_analyzer_rules():
    body = request.get_json(force=True, silent=True) or {}
    rules = body.get("rules")
    if not isinstance(rules, dict):
        return jsonify(ok=False, error="Règlement Analyzer invalide"), 400
    allowed = {"raceHours", "requiredStops", "minStintMinutes", "maxStintMinutes", "minPitSeconds", "pitCloseMinutes", "safetyMarginMinutes", "driversCount", "driverMinimumMinutes"}
    clean = {key: deepcopy(value) for key, value in rules.items() if key in allowed}
    snapshot = {"rules": clean, "updated_at_ms": int(time.time() * 1000), "circuit_id": str(STATE.get("circuit_id") or ""), "app_release": APP_VERSION}
    with ANALYZER_RULES_LOCK:
        STATE["analyzer_rules"] = snapshot
    return jsonify(ok=True, analyzer_rules=deepcopy(snapshot))


@app.get("/api/analyzer-rules")
def get_analyzer_rules():
    with ANALYZER_RULES_LOCK:
        return jsonify(ok=True, analyzer_rules=deepcopy(STATE.get("analyzer_rules")))


@app.post("/api/analyzer-strategy")
def update_analyzer_strategy():
    body = request.get_json(force=True, silent=True) or {}
    snapshot = body.get("strategy")
    if not isinstance(snapshot, dict):
        return jsonify(ok=False, error="Stratégie Analyzer invalide"), 400
    allowed = {"followed_driver", "score", "confidence", "track", "delta", "impact", "capital", "targetLong", "pitCloseRemaining", "recommendation", "windowLabel", "kind", "kartWindow"}
    clean = {key: deepcopy(value) for key, value in snapshot.items() if key in allowed}
    clean["updated_at_ms"] = int(time.time() * 1000)
    clean["circuit_id"] = str(STATE.get("circuit_id") or "")
    clean["app_release"] = APP_VERSION
    with ANALYZER_STRATEGY_LOCK:
        STATE["analyzer_strategy"] = clean
    return jsonify(ok=True, analyzer_strategy=deepcopy(clean))


@app.get("/api/analyzer-strategy")
def get_analyzer_strategy():
    with ANALYZER_STRATEGY_LOCK:
        return jsonify(ok=True, analyzer_strategy=deepcopy(STATE.get("analyzer_strategy")))


@app.get("/api/spotter-registry")
def get_spotter_registry():
    with SPOTTER_LOCK:
        return jsonify(ok=True, registry=deepcopy(STATE.get("spotter_registry") or {}))


@app.post("/api/spotter-registry")
def update_spotter_registry():
    body = request.get_json(force=True, silent=True) or {}
    registry = body.get("registry")
    if not isinstance(registry, dict):
        return jsonify(ok=False, error="Registre Spotter invalide"), 400
    clean = {}
    for kv, row in list(registry.items())[:250]:
        if not isinstance(row, dict):
            continue
        item = deepcopy(row)
        history = item.get("history")
        if isinstance(history, list):
            item["history"] = history[-80:]
        clean[str(kv)[:32]] = item
    with SPOTTER_LOCK:
        STATE["spotter_registry"] = clean
    return jsonify(ok=True, count=len(clean))


@app.post("/api/spotter-state")
def update_spotter_state():
    body = request.get_json(force=True, silent=True) or {}
    snapshot = body.get("spotter")
    if not isinstance(snapshot, dict):
        return jsonify(ok=False, error="État Spotter invalide"), 400
    allowed = {"configured", "mode", "queue_mode", "queue", "maintenance", "incoming", "assignments", "movement_log", "incoming_queue_selections", "kart_tracking_enabled", "mutation_at_ms", "setup_karts", "setup_queue_files", "free_started_at", "pit_ins", "pit_outs", "recalibrating", "client_id", "app_release"}
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
        STATE["spotter"] = {"configured": False, "updated_at_ms": int(time.time() * 1000), "queue_mode": 1, "setup_karts": ["X"], "setup_queue_files": [1], "queue": [], "maintenance": [], "incoming": [], "assignments": {}, "mode": "live", "app_release": APP_VERSION, "client_id": "server-reset", "circuit_id": str(circuit_id or "")}
        STATE["spotter_registry"] = {}
    with ANALYZER_STRATEGY_LOCK:
        STATE["analyzer_strategy"] = None
    # Le live principal est ouvert dans chaque navigateur. Ne jamais arrêter ici
    # un éventuel worker serveur global : une autre Session Velocity pourrait être active.
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
    workspace_id = _current_workspace_id()
    with TEAM_DATA_LOCK:
        active_session = deepcopy(_active_session_for_workspace(TEAM_DATA, workspace_id))
    if active_session and str(active_session.get("circuit_id") or "") != circuit_id:
        return jsonify(ok=False, error="Circuit verrouillé par la Session Course active de cette Session Velocity. Terminez-la avant de changer de circuit."), 423
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



def extract_apex_session_title(frame):
    """Extrait title2/title1 d'Apex sans toucher au moteur de timing V172."""
    if not isinstance(frame, str):
        return ""
    patterns = (
        r"(?:^|[\r\n\s])title2\|(?:[^|\r\n]*\|)?([^|\r\n]+)",
        r"(?:^|[\r\n\s])title1\|(?:[^|\r\n]*\|)?([^|\r\n]+)",
    )
    for pattern in patterns:
        matches = re.findall(pattern, frame, re.IGNORECASE)
        if matches:
            value = re.sub(r"\s+", " ", str(matches[-1] or "")).strip()
            if value:
                return value
    return ""


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

    runtime = _runtime_for_workspace()
    if runtime.duplicate_frame(frame_circuit_id, frame):
        return jsonify(ok=True, duplicate=True, decoded_count=0, unknown_count=0, interpreted_events=[])

    write_traffic("IN", frame)
    incoming_session_title = extract_apex_session_title(frame)
    if incoming_session_title:
        STATE["apex_session_title"] = incoming_session_title
    grid = parse_grid_frame(frame)
    initial_updates = grid.updates if grid else []
    grid_removed_rows = []
    if grid:
        # Un `grid||` Apex est un snapshot complet du classement live. Les
        # lignes absentes de ce nouveau GRID ne doivent donc plus subsister
        # dans Analyzer / Qualification / Sprint / Endurance. On purge
        # uniquement l'état live en mémoire : historiques et Recorder restent
        # intacts.
        active_grid_rows = set(grid.rows)
        table_removed = APEX_TABLE.retain_rows(active_grid_rows)
        protocol_removed = PROTOCOL_ENGINE.retain_rows(active_grid_rows)
        grid_removed_rows = sorted(set(table_removed) | set(protocol_removed.get("protocol", [])) | set(protocol_removed.get("interpreter", [])))
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
    # Indique à RaceState qu'un GRID complet vient d'être reçu. Même un GRID
    # sans concurrent doit pouvoir vider le classement live précédent.
    snapshot["grid_authoritative"] = bool(grid is not None)
    snapshot["grid_rows"] = sorted(grid.rows) if grid else []
    snapshot["grid_removed_rows"] = grid_removed_rows
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


threading.Timer(2.0, _resume_velocity_recorders).start()

if __name__ == "__main__":
    desktop_url = "http://127.0.0.1:8200"
    print(f"\nVelocity V{APP_VERSION} — {APP_RELEASE_NAME}")
    print(f"Application Mac : {desktop_url}")
    print(f"Application réseau : http://{local_ip()}:8200")
    print(f"Journal Apex : {LOG_FILE}")
    print("Fermer Velocity : Ctrl + C\n")
    threading.Timer(1.0, lambda: webbrowser.open(desktop_url)).start()
    app.run(host="0.0.0.0", port=8200, debug=False, threaded=True)
