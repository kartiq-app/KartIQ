from copy import deepcopy
from datetime import datetime
import json
import re
import io
import zipfile
import threading
import time
import webbrowser

try:
    import websocket
except ImportError:
    websocket = None

from flask import Flask, jsonify, render_template, request, send_file

from apex_decoder import decode_frame, updates_to_dicts
from apex_grid import parse_grid_frame
from apex_table import ApexTable
from protocol_engine import ProtocolEngine
from event_store import ApexEventStore
from backend.config import APP_DIR, APP_RELEASE_NAME, APP_VERSION, load_circuits
from backend.logging_tools import ApexLogManager
from backend.network import local_ip

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
    "total_laps": 0,
    "session_best": {"driver": "—", "lap": "—"},
    "fastest_last_lap": {"driver": "—", "lap": "—"},
    "drivers": [],
    "penalties": [],
    "quick_change": [],
    "qualif_crossing": None,
    "generic_alert": None,
    "developer_mode": False,
    "traffic_recording": False,
    "traffic_recording_started_at": None,
}



LIVE_LOCK = threading.Lock()
LIVE_THREAD = None
LIVE_STOP = threading.Event()
LIVE_WS = None

# Historique local des tours par pilote/équipe pour calculer le rythme réel sur 5 tours.
LAP_HISTORY = {}
LAP_RESULTS_BY_NUMBER = {}
LAST_LAP_PERFORMANCE = {}
LAST_LAP_MARKER = {}
FOLLOWED_CROSSING_MARKER = {}
PENALTY_FIRST_SEEN = {}

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
                    "User-Agent: Mozilla/5.0 KartIQ/3.1",
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
    try:
        mins, secs = value.split(":")
        return int(mins) * 60 + float(secs)
    except Exception:
        return 9999.0


def format_lap_seconds(seconds):
    if seconds is None or seconds >= 9999:
        return "—"
    minutes = int(seconds // 60)
    remaining = seconds - minutes * 60
    return f"{minutes}:{remaining:06.3f}" if minutes else f"{remaining:.3f}"


def fmt_delta(seconds):
    if abs(seconds) < 0.0005:
        return "0.000 s"
    return f"{seconds:+.3f} s"


def driver_by_name(name):
    return next((d for d in STATE["drivers"] if d["driver"] == name), None)


def _format_remaining(ms):
    if ms is None:
        return "—"
    total = max(0, int(ms // 1000))
    hours, rem = divmod(total, 3600)
    minutes, seconds = divmod(rem, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}" if hours else f"{minutes:02d}:{seconds:02d}"


def sync_state_from_race(snapshot, interpreted_events=None):
    """Injecte le modèle unifié Apex dans l'interface moderne KartIQ."""
    previous_drivers = {d.get("driver"): d for d in STATE.get("drivers", [])}
    rows = snapshot.get("rows", [])
    live_drivers = []
    for row in rows:
        name = (row.get("name") or "").strip()
        position = row.get("position")
        if not name and position is None:
            continue
        best = row.get("best_lap") or "—"
        last = row.get("last_lap") or "—"
        driver_name = name or f"Ligne Apex {row.get('row', '?')}"
        history_key = str(row.get("row") if row.get("row") is not None else driver_name)
        lap_number = row.get("laps") if row.get("laps") is not None else 0
        lap_seconds = time_to_seconds(last)
        marker = (lap_number, last)
        # Une valeur de dernier tour n'est ajoutée qu'une fois, au passage d'un nouveau tour.
        if lap_seconds < 9999 and LAST_LAP_MARKER.get(history_key) != marker:
            previous_laps = list(LAP_HISTORY.get(history_key, []))
            previous_best_seconds = min(previous_laps) if previous_laps else None
            improved_personal_best = (
                previous_best_seconds is None
                or lap_seconds < previous_best_seconds - 0.0005
            )
            LAST_LAP_PERFORMANCE[history_key] = {
                "marker": marker,
                "improved_personal_best": improved_personal_best,
                "previous_best_seconds": previous_best_seconds,
            }
            LAP_HISTORY.setdefault(history_key, []).append(lap_seconds)
            LAP_HISTORY[history_key] = LAP_HISTORY[history_key][-20:]
            # Mémorise le chrono avec le numéro du tour afin que le cartouche Sprint
            # affiche le meilleur pilote du dernier tour réellement terminé, sans
            # mélanger des chronos provenant de tours différents.
            if isinstance(lap_number, int) and lap_number > 0:
                LAP_RESULTS_BY_NUMBER.setdefault(lap_number, {})[history_key] = {
                    "driver": driver_name,
                    "lap": last,
                    "seconds": lap_seconds,
                }
                # Limite l'historique aux 10 derniers numéros de tour.
                for old_lap in sorted(LAP_RESULTS_BY_NUMBER)[:-10]:
                    LAP_RESULTS_BY_NUMBER.pop(old_lap, None)
            LAST_LAP_MARKER[history_key] = marker
        recent_five = LAP_HISTORY.get(history_key, [])[-5:]
        pace5_seconds = sum(recent_five) / len(recent_five) if recent_five else None
        pace5 = format_lap_seconds(pace5_seconds) if pace5_seconds is not None else "—"
        live_drivers.append({
            "pos": position if position is not None else 999,
            "driver": driver_name,
            "apex": row.get("kart") if row.get("kart") is not None else "—",
            "laps": lap_number,
            "pit_stops": row.get("pit_stops") if row.get("pit_stops") is not None else "—",
            "penalty": row.get("penalty") or "",
            "last": last,
            "best": best,
            "gap": row.get("gap") or "—",
            "interval": row.get("interval") or "—",
            "pace5": pace5,
            "pace5_laps": len(recent_five),
            "status": row.get("status", "unknown"),
            "apex_row": row.get("row"),
            "last_improved_personal_best": bool(
                LAST_LAP_PERFORMANCE.get(history_key, {}).get("marker") == marker
                and LAST_LAP_PERFORMANCE.get(history_key, {}).get("improved_personal_best")
            ),
        })
    live_drivers.sort(key=lambda d: (d["pos"] == 999, d["pos"]))
    if live_drivers:
        STATE["drivers"] = live_drivers

        # Pénalités Apex : logique stable de la V4.3.3.
        # On affiche l'état courant de la colonne « Péna. » sans construire
        # d'historique, ce qui évite les doublons pilote/équipe.
        no_penalty_values = {"", "-", "—", "0", "0 s", "0 sec", "aucune", "aucune pénalité", "none", "no"}
        apex_penalties = []
        active_penalty_keys = set()
        for driver in live_drivers:
            raw_penalty = str(driver.get("penalty") or "").strip()
            if raw_penalty.lower() not in no_penalty_values:
                display_name = driver.get("driver") or "—"
                penalty_key = (display_name, raw_penalty)
                active_penalty_keys.add(penalty_key)
                first_seen = PENALTY_FIRST_SEEN.setdefault(
                    penalty_key,
                    datetime.now().isoformat(timespec="seconds"),
                )
                apex_penalties.append({
                    "driver": display_name,
                    "penalty": raw_penalty,
                    "at": first_seen,
                    "time": first_seen[11:16],
                })
        # Une pénalité disparue de la colonne Apex est retirée de l'état courant.
        for penalty_key in list(PENALTY_FIRST_SEEN):
            if penalty_key not in active_penalty_keys:
                PENALTY_FIRST_SEEN.pop(penalty_key, None)
        apex_penalties.sort(key=lambda item: item.get("at", ""), reverse=True)
        STATE["penalties"] = apex_penalties
        # Mode AUTO : tant qu'aucun pilote n'a été sélectionné, la ligne 1 suit le P1.
        # Mode LOCK : après un clic, on conserve impérativement le même pilote,
        # même si une trame Apex intermédiaire ne contient pas sa ligne.
        if not STATE.get("followed_locked"):
            STATE["followed_driver"] = live_drivers[0]["driver"]

        followed_name = STATE.get("followed_driver")
        followed_live = next((d for d in live_drivers if d.get("driver") == followed_name), None)
        if followed_live:
            STATE["followed_snapshot"] = deepcopy(followed_live)
        valid_best = [d for d in live_drivers if time_to_seconds(d["best"]) < 9999]
        if valid_best:
            leader = min(valid_best, key=lambda d: time_to_seconds(d["best"]))
            STATE["session_best"] = {"driver": leader["driver"], "lap": leader["best"]}
        # Sprint : meilleur chrono du tour précédent. Apex met les lignes à jour
        # au fil des passages ; comparer simplement la colonne « dernier tour »
        # mélange donc parfois plusieurs numéros de tour. On privilégie ici le
        # dernier numéro de tour entièrement dépassé par le leader.
        lap_numbers = [d.get("laps") for d in live_drivers if isinstance(d.get("laps"), int)]
        target_lap = max(lap_numbers) - 1 if lap_numbers and max(lap_numbers) > 1 else None
        lap_results = list(LAP_RESULTS_BY_NUMBER.get(target_lap, {}).values()) if target_lap else []
        if lap_results:
            fastest = min(lap_results, key=lambda item: item["seconds"])
            STATE["fastest_last_lap"] = {"driver": fastest["driver"], "lap": fastest["lap"]}
        else:
            # Repli utile au démarrage de séance, avant qu'un tour complet soit disponible.
            valid_last = [d for d in live_drivers if time_to_seconds(d["last"]) < 9999]
            if valid_last:
                fastest = min(valid_last, key=lambda d: time_to_seconds(d["last"]))
                STATE["fastest_last_lap"] = {"driver": fastest["driver"], "lap": fastest["last"]}

        # En qualification, le popup est lié au pilote choisi par l'utilisateur.
        # Son marqueur courant est mémorisé au clic, puis le prochain changement
        # (nombre de tours ou dernier chrono) correspond à un passage sur la ligne.
        followed_name = STATE.get("followed_driver")
        followed_now = next((d for d in live_drivers if d.get("driver") == followed_name), None)
        if STATE.get("mode") == "qualification" and followed_now:
            new_marker = (followed_now.get("laps"), followed_now.get("last"))
            old_marker = FOLLOWED_CROSSING_MARKER.get(followed_name)
            if old_marker is None:
                FOLLOWED_CROSSING_MARKER[followed_name] = new_marker
            elif new_marker != old_marker:
                FOLLOWED_CROSSING_MARKER[followed_name] = new_marker
                if time_to_seconds(followed_now.get("last")) < 9999:
                    # Le popup compare le tour qui vient d'être réalisé aux meilleurs
                    # temps absolus de la session.
                    ranking = sorted(valid_best, key=lambda d: time_to_seconds(d["best"]))
                    leader = ranking[0] if ranking else None
                    second = ranking[1] if len(ranking) > 1 else None
                    last_sec = time_to_seconds(followed_now["last"])
                    leader_sec = time_to_seconds(leader["best"]) if leader else 9999

                    # Cas P1 : le tour franchi est bien le nouveau meilleur temps
                    # absolu. On affiche alors l'avance sur le deuxième pilote.
                    is_new_session_best = bool(
                        leader
                        and leader.get("driver") == followed_name
                        and abs(last_sec - leader_sec) < 0.0005
                    )
                    if is_new_session_best and second:
                        reference_driver = second.get("driver") or "—"
                        delta_value = last_sec - time_to_seconds(second.get("best"))
                    elif is_new_session_best:
                        reference_driver = "—"
                        delta_value = 0.0
                    else:
                        reference_driver = leader.get("driver") if leader else "—"
                        delta_value = last_sec - leader_sec if leader else 0.0

                    STATE["qualif_crossing"] = {
                        "event_id": datetime.now().isoformat(timespec="milliseconds"),
                        "position": followed_now["pos"],
                        "delta": fmt_delta(delta_value),
                        "reference_driver": reference_driver,
                        "is_session_best": is_new_session_best,
                    }

    session = snapshot.get("session", {})
    end_at_ms = session.get("remaining_end_at_ms")
    current_remaining_ms = None
    if end_at_ms is not None:
        try:
            current_remaining_ms = max(0, int(end_at_ms) - int(time.time() * 1000))
        except (TypeError, ValueError):
            current_remaining_ms = None
    if current_remaining_ms is None:
        current_remaining_ms = session.get("remaining_ms")
    STATE["time_remaining"] = _format_remaining(current_remaining_ms)
    STATE["time_remaining_ms"] = current_remaining_ms
    STATE["time_remaining_updated_at_ms"] = int(time.time() * 1000) if current_remaining_ms is not None else None
    STATE["time_remaining_end_at_ms"] = end_at_ms

    # Apex ne fournit pas toujours un objectif de tours. Lorsque ce total est
    # disponible, on affiche les tours restants ; sinon on affiche le nombre de
    # tours actuellement couverts par le leader, afin de ne jamais inventer une
    # valeur de tours restants.
    leader_laps = max(
        (int(d.get("laps") or 0) for d in live_drivers if str(d.get("laps") or "").isdigit()),
        default=0,
    )
    session_total_laps = session.get("total_laps") or STATE.get("total_laps") or 0
    try:
        session_total_laps = int(session_total_laps)
    except (TypeError, ValueError):
        session_total_laps = 0
    if session_total_laps > 0:
        STATE["total_laps"] = session_total_laps
        remaining_laps = max(0, session_total_laps - leader_laps)
        STATE["apex_laps_remaining"] = f"{remaining_laps} TOUR" + ("S" if remaining_laps != 1 else "")
    elif leader_laps > 0:
        STATE["apex_laps_remaining"] = f"TOUR {leader_laps}"
    else:
        STATE["apex_laps_remaining"] = "—"

    for event in interpreted_events or []:
        if event.get("type") != "pit_in":
            continue
        row_id = event.get("row")
        entrant = next((d for d in live_drivers if d.get("apex_row") == row_id), None)
        if STATE.get("mode") == "endurance" and entrant and isinstance(entrant.get("pos"), int) and entrant["pos"] <= 8:
            STATE["generic_alert"] = {
                "event_id": event.get("at") or datetime.now().isoformat(timespec="milliseconds"),
                "kind": "top8_pit_entry",
                "title": "🚨 ALERTE",
                "team": entrant["driver"],
                "position": entrant["pos"],
            }


def payload():
    data = deepcopy(STATE)
    data["circuits"] = load_circuits()
    data["drivers"].sort(key=lambda d: d["pos"])
    followed = next((d for d in data["drivers"] if d["driver"] == data["followed_driver"]), None)
    # Certaines trames Apex sont partielles. Dans ce cas, ne jamais vider la ligne 1 :
    # on garde le dernier instantané valide du pilote verrouillé jusqu'à son retour.
    if followed is None and data.get("followed_locked"):
        snapshot = data.get("followed_snapshot")
        if snapshot and snapshot.get("driver") == data.get("followed_driver"):
            followed = snapshot
    data["followed"] = followed

    top10_names = {d["driver"] for d in data["drivers"] if d["pos"] <= 10}
    data["visible_penalties"] = [p for p in data["penalties"] if p["driver"] in top10_names]

    if followed:
        # Recalcule le meilleur absolu directement depuis le classement courant.
        # Cela évite qu'une ancienne valeur de session_best reste en cache au
        # moment où l'utilisateur clique sur un nouveau pilote.
        valid_best_drivers = [
            d for d in data["drivers"]
            if time_to_seconds(d.get("best")) < 9999
        ]
        if valid_best_drivers and time_to_seconds(followed.get("best")) < 9999:
            absolute_best = min(
                valid_best_drivers,
                key=lambda d: time_to_seconds(d.get("best")),
            )
            session_best_sec = time_to_seconds(absolute_best.get("best"))
            followed_best_sec = time_to_seconds(followed.get("best"))
            data["session_best"] = {
                "driver": absolute_best.get("driver"),
                "lap": absolute_best.get("best"),
            }
            data["qualif_delta"] = fmt_delta(max(0.0, followed_best_sec - session_best_sec))
        else:
            data["qualif_delta"] = "--"
        if followed["pos"] == 1:
            p2 = next((d for d in data["drivers"] if d["pos"] == 2), None)
            gap = p2["gap"].lstrip("+") if p2 else "--"
            data["sprint_delta"] = {
                "reference": "P2",
                "display": f"+{gap}" if gap != "--" else "--",
                "detail": "Leader sur P2",
            }
        else:
            ahead = next((d for d in data["drivers"] if d["pos"] == followed["pos"] - 1), None)
            data["sprint_delta"] = {
                "reference": f"P{ahead['pos']}" if ahead else "--",
                "display": followed["interval"] if ahead else "--",
                "detail": f"Écart avec P{ahead['pos']}" if ahead else "--",
            }
    else:
        data["qualif_delta"] = "--"
        data["sprint_delta"] = {"reference": "--", "display": "--", "detail": "Pilote non trouvé"}

    pace = sorted([d for d in data["drivers"] if time_to_seconds(d.get("pace5")) < 9999], key=lambda d: time_to_seconds(d["pace5"]))[:8]
    for i, d in enumerate(pace, 1):
        d["pace_rank"] = i
    data["pace_top8"] = pace
    return data


@app.get("/")
def index():
    return render_template("index.html", app_version=APP_VERSION)


@app.get("/api/state")
def get_state():
    return jsonify(payload())


@app.post("/api/mode")
def set_mode():
    value = request.get_json(force=True).get("mode")
    if value not in {"qualification", "sprint", "endurance"}:
        return jsonify(ok=False), 400
    STATE["mode"] = value
    return jsonify(ok=True)


def reset_race_state_for_new_circuit(circuit_id):
    """Vide toutes les données appartenant au circuit précédent."""
    stop_live_connection()
    APEX_TABLE.reset()
    PROTOCOL_ENGINE.reset()
    EVENT_STORE.reset()
    LAP_HISTORY.clear()
    LAP_RESULTS_BY_NUMBER.clear()
    LAST_LAP_PERFORMANCE.clear()
    LAST_LAP_MARKER.clear()
    FOLLOWED_CROSSING_MARKER.clear()

    STATE.update({
        "circuit_id": circuit_id,
        "connection": "CONNEXION NAVIGATEUR…",
        "followed_driver": "",
        "followed_locked": False,
        "followed_snapshot": None,
        "time_remaining": "—",
        "time_remaining_ms": None,
        "time_remaining_updated_at_ms": None,
        "time_remaining_end_at_ms": None,
        "apex_laps_remaining": "—",
        "total_laps": 0,
        "session_best": {"driver": "—", "lap": "—"},
        "fastest_last_lap": {"driver": "—", "lap": "—"},
        "drivers": [],
        "penalties": [],
        "quick_change": [],
        "qualif_crossing": None,
        "generic_alert": None,
    })
    STATE["live"] = {
        "status": "connecting",
        "messages": 0,
        "last_message_at": None,
        "last_error": None,
        "websocket_url": None,
        "parsed_updates": 0,
        "last_frame_preview": None,
    }


@app.post("/api/circuit")
def set_circuit():
    circuit_id = request.get_json(force=True).get("circuit_id")
    if circuit_id not in {c["id"] for c in load_circuits()}:
        return jsonify(ok=False), 400
    reset_race_state_for_new_circuit(circuit_id)
    return jsonify(ok=True)


@app.post("/api/follow")
def follow():
    name = request.get_json(force=True).get("driver")
    if not driver_by_name(name):
        return jsonify(ok=False), 400
    STATE["followed_driver"] = name
    STATE["followed_locked"] = True
    driver = driver_by_name(name)
    STATE["followed_snapshot"] = deepcopy(driver)
    FOLLOWED_CROSSING_MARKER[name] = (driver.get("laps"), driver.get("last"))
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
        return jsonify(ok=False, ignored=True, error="Trame d'un ancien circuit ignorée"), 409

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
    return send_file(memory, mimetype="application/zip", as_attachment=True, download_name=f"KartIQ_Apex_Logs_{stamp}.zip")


@app.post("/api/clear-alert")
def clear_alert():
    STATE["generic_alert"] = None
    return jsonify(ok=True)


if __name__ == "__main__":
    desktop_url = "http://127.0.0.1:8200"
    print(f"\nKartIQ V{APP_VERSION} — {APP_RELEASE_NAME}")
    print(f"Application Mac : {desktop_url}")
    print(f"Application réseau : http://{local_ip()}:8200")
    print(f"Journal Apex : {LOG_FILE}")
    print("Fermer KartIQ : Ctrl + C\n")
    threading.Timer(1.0, lambda: webbrowser.open(desktop_url)).start()
    app.run(host="0.0.0.0", port=8200, debug=False, threaded=True)
