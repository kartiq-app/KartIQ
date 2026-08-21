from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import os
import re
import sqlite3
import statistics
import tempfile
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
import uuid
import zipfile
from bisect import bisect_left, bisect_right
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

try:
    import websocket
except Exception:  # pragma: no cover - surfaced in recorder status
    websocket = None

try:
    import psycopg
except Exception:  # optional locally, required only when DATABASE_URL is set
    psycopg = None

from apex_decoder import decode_frame, updates_to_dicts
from apex_grid import parse_grid_frame
from apex_table import ApexTable
from protocol_engine import ProtocolEngine
from backend.services.race_state import RaceStateService


def _now_ms() -> int:
    return int(time.time() * 1000)


def _utc_iso(ms: int | None = None) -> str:
    stamp = (ms if ms is not None else _now_ms()) / 1000
    return datetime.fromtimestamp(stamp, tz=timezone.utc).isoformat(timespec="milliseconds")


def _safe_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _time_seconds(value: Any) -> float | None:
    text = str(value or "").strip().replace(",", ".")
    if not text or text in {"—", "--", "-"}:
        return None
    try:
        parts = [float(p) for p in text.split(":")]
    except Exception:
        return None
    if len(parts) == 1:
        result = parts[0]
    elif len(parts) == 2:
        result = parts[0] * 60 + parts[1]
    elif len(parts) == 3:
        result = parts[0] * 3600 + parts[1] * 60 + parts[2]
    else:
        return None
    return result if math.isfinite(result) and result > 0 else None


def _sector_seconds(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        num = float(value)
        if num <= 0:
            return None
        return num / 1000 if num >= 1000 else num
    return _time_seconds(value)


def _normalize_pilot(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii").casefold()
    return re.sub(r"[^a-z0-9]+", "", text)


def _mean(values: list[float]) -> float | None:
    vals = [float(v) for v in values if isinstance(v, (int, float)) and math.isfinite(float(v))]
    return sum(vals) / len(vals) if vals else None


def _median(values: list[float]) -> float | None:
    vals = [float(v) for v in values if isinstance(v, (int, float)) and math.isfinite(float(v))]
    return statistics.median(vals) if vals else None


def _stddev(values: list[float]) -> float | None:
    vals = [float(v) for v in values if isinstance(v, (int, float)) and math.isfinite(float(v))]
    if not vals:
        return None
    if len(vals) == 1:
        return 0.0
    mean = sum(vals) / len(vals)
    return math.sqrt(sum((v - mean) ** 2 for v in vals) / len(vals))


def _percentile_score(value: float | None, values: list[float], lower_is_better: bool = True) -> int:
    clean = sorted(float(v) for v in values if isinstance(v, (int, float)) and math.isfinite(float(v)))
    if value is None or not math.isfinite(float(value)) or not clean:
        return 50
    if len(clean) == 1:
        return 100
    value = float(value)
    lower = sum(v < value for v in clean)
    equal = sum(v == value for v in clean)
    mid_rank = lower + (equal - 1) / 2
    percentile = mid_rank / max(1, len(clean) - 1)
    return round((1 - percentile if lower_is_better else percentile) * 100)


def _robust_distribution(values: list[float]) -> dict[str, float | None]:
    clean = [float(v) for v in values if isinstance(v, (int, float)) and math.isfinite(float(v))]
    if not clean:
        return {"median": None, "mad": None, "sigma": None}
    median = _median(clean)
    deviations = [abs(v - float(median)) for v in clean]
    mad = _median(deviations)
    sigma = 1.4826 * mad if mad is not None and mad > 1e-9 else _stddev(clean)
    if sigma is None or sigma <= 1e-9:
        sigma = None
    return {"median": median, "mad": mad, "sigma": sigma}


def _transition_signal(delta: float | None, values: list[float]) -> dict[str, float | None]:
    if delta is None or not math.isfinite(float(delta)):
        return {"z": None, "median": None, "sigma": None}
    dist = _robust_distribution(values)
    sigma = dist["sigma"]
    z = (float(delta) - float(dist["median"])) / float(sigma) if sigma is not None else 0.0
    return {"z": z, "median": dist["median"], "sigma": sigma}


def _transition_weights(z: float | None, has_transition: bool) -> dict[str, float]:
    if not has_transition or z is None or not math.isfinite(float(z)):
        return {"pace": .60, "transition": 0.0, "potential": .20, "consistency": .133333, "sample": .066667}
    strength = max(0.0, min(1.0, (abs(float(z)) - .5) / 1.5))
    transition = .25 + .20 * strength
    pace = .45 - .20 * strength
    return {"pace": pace, "transition": transition, "potential": .15, "consistency": .10, "sample": .05}



def _apex_request_port(circuit: dict[str, Any]) -> int | None:
    """Déduit le port HTTP historique Apex du WebSocket (WS = request + 3)."""
    match = re.search(r":(\d+)(?:/|$)", str(circuit.get("websocket_url") or ""))
    if not match:
        return None
    port = int(match.group(1)) - 3
    return port if port > 0 else None


def _apex_http_history(circuit: dict[str, Any], command: str, timeout: int = 20) -> str:
    """Interroge le endpoint read-only request.php utilisé par Apex/Analyzer."""
    port = _apex_request_port(circuit)
    if not port:
        raise ValueError("Port historique Apex introuvable pour ce circuit")
    encoded = urllib.parse.urlencode({"port": port, "request": command}).encode("utf-8")
    live_url = str(circuit.get("live_url") or "https://www.apex-timing.com/")
    req = urllib.request.Request(
        "https://live-data.apex-timing.com/live-timing/commonv2/functions/request.php",
        data=encoded,
        headers={
            "User-Agent": "Mozilla/5.0 Velocity-Lab-Recorder",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": live_url.rstrip("/"),
            "Referer": live_url,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def _apex_protocol_number(value: Any) -> int:
    """Reproduit le parseInt Apex après suppression des marqueurs couleur alphabétiques."""
    text = re.sub(r"[a-zA-Z]", "", str(value or "")).strip()
    match = re.match(r"^[+-]?\d+", text)
    if not match:
        return 0
    try:
        return int(match.group(0))
    except Exception:
        return 0


def _format_apex_ms(value: int | float | None) -> str | None:
    ms = int(value or 0)
    if ms <= 0:
        return None
    minutes, remainder = divmod(ms, 60_000)
    seconds, millis = divmod(remainder, 1_000)
    if minutes:
        return f"{minutes}:{seconds:02d}.{millis:03d}"
    return f"{seconds}.{millis:03d}"


def _parse_apex_history(raw: str, row_id: int) -> dict[str, Any]:
    """Parse les lignes .L/.P/.INF d'une réponse historique Apex courante."""
    laps: dict[int, dict[str, Any]] = {}
    pits: dict[int, dict[str, Any]] = {}
    drivers: dict[int, str] = {}
    current_driver = ""
    marker_lap = f"D{row_id}.L"
    marker_pit = f"D{row_id}.P"
    marker_inf = f"D{row_id}.INF"

    for raw_line in str(raw or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(marker_lap):
            hash_pos = line.find("#", len(marker_lap))
            if hash_pos < 0:
                continue
            lap_no = _apex_protocol_number(line[len(marker_lap):hash_pos])
            fields = line[hash_pos + 1:].split("|")
            if lap_no <= 0 or len(fields) < 4:
                continue
            s1, s2, s3, lap_time = (_apex_protocol_number(fields[i]) for i in range(4))
            if lap_time <= 0:
                continue
            laps[lap_no] = {"lap": lap_no, "sector1": s1, "sector2": s2, "sector3": s3, "lap_time": lap_time}
            continue

        if line.startswith(marker_pit):
            hash_pos = line.find("#", len(marker_pit))
            if hash_pos < 0:
                continue
            marker_stop = _apex_protocol_number(line[len(marker_pit):hash_pos])
            fields = [str(item or "").strip() for item in line[hash_pos + 1:].split("|")]
            if marker_stop <= 0 or len(fields) < 4:
                continue
            stop = _apex_protocol_number(fields[0]) or marker_stop
            pits[stop] = {
                "stop": stop,
                "lap": _apex_protocol_number(fields[1]) if len(fields) > 1 else 0,
                "pit_in_ms": _apex_protocol_number(fields[2]) if len(fields) > 2 else 0,
                "pit_out_ms": _apex_protocol_number(fields[3]) if len(fields) > 3 else 0,
                "pit_time_ms": _apex_protocol_number(fields[4]) if len(fields) > 4 else 0,
                "track_time_ms": _apex_protocol_number(fields[5]) if len(fields) > 5 else 0,
                "relay_laps": _apex_protocol_number(fields[6]) if len(fields) > 6 else 0,
                "driver_id": _apex_protocol_number(fields[7]) if len(fields) > 7 else 0,
                "driver_total_ms": _apex_protocol_number(fields[8]) if len(fields) > 8 else 0,
            }
            continue

        if line.startswith(marker_inf):
            # Les balises <driver> sont suffisamment simples pour un parseur d'attributs léger.
            for tag in re.findall(r"<driver\b[^>]*>", line, flags=re.I):
                attrs = dict(re.findall(r"([:\w-]+)=[\"']([^\"']*)[\"']", tag))
                did = _apex_protocol_number(attrs.get("id"))
                name = str(attrs.get("name") or "").strip()
                if did and name:
                    drivers[did] = name
                    if str(attrs.get("current") or "") == "1":
                        current_driver = name

    for pit in pits.values():
        pit["driver_name"] = drivers.get(int(pit.get("driver_id") or 0), "")
    return {
        "laps": [laps[k] for k in sorted(laps)],
        "pits": [pits[k] for k in sorted(pits)],
        "drivers": drivers,
        "current_driver": current_driver,
    }


class RecorderStore:
    """Persistent storage for Velocity Lab Recorder.

    Render Postgres is used when DATABASE_URL is configured. A local SQLite file
    is kept as a development fallback, but is intentionally reported as non-persistent.
    """

    def __init__(self, app_dir: Path):
        self.app_dir = Path(app_dir)
        self.database_url = str(os.getenv("DATABASE_URL") or "").strip()
        self.backend = "postgres" if self.database_url else "sqlite"
        self.persistent = bool(self.database_url)
        self.sqlite_path = self.app_dir / "velocity_lab_recorder.sqlite3"
        self._lock = threading.RLock()
        self._conn = None
        self._connect()
        self._init_schema()

    def _connect(self):
        with self._lock:
            try:
                if self._conn is not None:
                    self._conn.close()
            except Exception:
                pass
            if self.backend == "postgres":
                if psycopg is None:
                    raise RuntimeError("DATABASE_URL est défini mais psycopg n'est pas installé")
                self._conn = psycopg.connect(self.database_url, autocommit=True)
            else:
                self._conn = sqlite3.connect(self.sqlite_path, check_same_thread=False, isolation_level=None)
                self._conn.row_factory = sqlite3.Row
                self._conn.execute("PRAGMA journal_mode=WAL")
                self._conn.execute("PRAGMA synchronous=NORMAL")

    def _sql(self, text: str) -> str:
        return text.replace("?", "%s") if self.backend == "postgres" else text

    def _execute(self, sql: str, params: tuple | list = (), *, fetchone=False, fetchall=False):
        with self._lock:
            for attempt in range(2):
                try:
                    cur = self._conn.cursor()
                    cur.execute(self._sql(sql), params)
                    if fetchone:
                        row = cur.fetchone()
                        if row is None:
                            return None
                        if self.backend == "postgres":
                            columns = [d.name for d in cur.description]
                            return dict(zip(columns, row))
                        return dict(row)
                    if fetchall:
                        rows = cur.fetchall()
                        if self.backend == "postgres":
                            columns = [d.name for d in cur.description]
                            return [dict(zip(columns, row)) for row in rows]
                        return [dict(row) for row in rows]
                    return None
                except Exception:
                    if attempt:
                        raise
                    self._connect()

    def _init_schema(self):
        ddl = [
            """CREATE TABLE IF NOT EXISTS velocity_recordings (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, circuit_id TEXT NOT NULL, circuit_name TEXT NOT NULL,
                websocket_url TEXT NOT NULL, live_url TEXT, session_request TEXT, status TEXT NOT NULL,
                created_at_ms BIGINT NOT NULL, started_at_ms BIGINT, stopped_at_ms BIGINT,
                last_message_at_ms BIGINT, frames_count BIGINT NOT NULL DEFAULT 0,
                laps_count BIGINT NOT NULL DEFAULT 0, sectors_count BIGINT NOT NULL DEFAULT 0,
                pits_count BIGINT NOT NULL DEFAULT 0, scores_count BIGINT NOT NULL DEFAULT 0,
                teams_count BIGINT NOT NULL DEFAULT 0, last_error TEXT, metadata_json TEXT
            )""",
            """CREATE TABLE IF NOT EXISTS velocity_recorder_frames (
                recording_id TEXT NOT NULL, received_at_ms BIGINT NOT NULL, raw TEXT NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS velocity_recorder_laps (
                recording_id TEXT NOT NULL, row_id BIGINT NOT NULL, lap_number BIGINT NOT NULL,
                received_at_ms BIGINT NOT NULL, team TEXT, pilot TEXT, kart TEXT, position BIGINT,
                lap_time TEXT, lap_seconds DOUBLE PRECISION, sector_1 TEXT, sector_1_seconds DOUBLE PRECISION,
                sector_2 TEXT, sector_2_seconds DOUBLE PRECISION, sector_3 TEXT, sector_3_seconds DOUBLE PRECISION,
                pit_stops BIGINT, relay_index BIGINT, PRIMARY KEY(recording_id,row_id,lap_number)
            )""",
            """CREATE TABLE IF NOT EXISTS velocity_recorder_sectors (
                recording_id TEXT NOT NULL, row_id BIGINT NOT NULL, lap_number BIGINT,
                received_at_ms BIGINT NOT NULL, team TEXT, kart TEXT, sector BIGINT NOT NULL,
                value TEXT, seconds DOUBLE PRECISION, kind TEXT
            )""",
            """CREATE TABLE IF NOT EXISTS velocity_recorder_pits (
                recording_id TEXT NOT NULL, row_id BIGINT NOT NULL, received_at_ms BIGINT NOT NULL,
                lap_number BIGINT, team TEXT, pilot TEXT, kart TEXT, event TEXT NOT NULL,
                stop_number BIGINT, relay_index BIGINT
            )""",
            """CREATE TABLE IF NOT EXISTS velocity_recorder_scores (
                recording_id TEXT NOT NULL, received_at_ms BIGINT NOT NULL, row_id BIGINT NOT NULL,
                team TEXT, pilot TEXT, kart TEXT, relay_index BIGINT, score BIGINT, confidence BIGINT,
                average DOUBLE PRECISION, best3 DOUBLE PRECISION, consistency DOUBLE PRECISION,
                corrected_delta DOUBLE PRECISION, condition_mode TEXT, criteria_json TEXT, weights_json TEXT,
                engine TEXT NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS velocity_recorder_events (
                recording_id TEXT NOT NULL, received_at_ms BIGINT NOT NULL, event_type TEXT,
                row_id BIGINT, payload_json TEXT NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS velocity_recorder_snapshots (
                recording_id TEXT NOT NULL, received_at_ms BIGINT NOT NULL, payload_json TEXT NOT NULL
            )""",
            "CREATE INDEX IF NOT EXISTS idx_velocity_frames_rec_time ON velocity_recorder_frames(recording_id, received_at_ms)",
            "CREATE INDEX IF NOT EXISTS idx_velocity_laps_rec_time ON velocity_recorder_laps(recording_id, received_at_ms)",
            "CREATE INDEX IF NOT EXISTS idx_velocity_scores_rec_time ON velocity_recorder_scores(recording_id, received_at_ms)",
        ]
        for sql in ddl:
            self._execute(sql)

    def storage_info(self) -> dict[str, Any]:
        return {
            "backend": self.backend,
            "persistent": self.persistent,
            "label": "Render Postgres" if self.persistent else "SQLite local (non persistant sur Render)",
        }

    def create_recording(self, name: str, circuit: dict[str, Any]) -> dict[str, Any]:
        now = _now_ms()
        rid = uuid.uuid4().hex[:16]
        clean_name = (str(name or "").strip() or f"Enregistrement {circuit.get('name') or circuit.get('id')}")[:120]
        self._execute(
            """INSERT INTO velocity_recordings
               (id,name,circuit_id,circuit_name,websocket_url,live_url,session_request,status,created_at_ms,started_at_ms,metadata_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (rid, clean_name, circuit.get("id"), circuit.get("name") or circuit.get("id"), circuit.get("websocket_url") or "",
             circuit.get("live_url") or "", circuit.get("session_request") or "", "starting", now, now,
             _safe_json({"version": 1, "score_engine": "velocity-v2-recorder"})),
        )
        return self.get_recording(rid)

    def get_recording(self, rid: str) -> dict[str, Any] | None:
        row = self._execute("SELECT * FROM velocity_recordings WHERE id=?", (rid,), fetchone=True)
        return self._public_recording(row) if row else None

    def list_recordings(self) -> list[dict[str, Any]]:
        rows = self._execute("SELECT * FROM velocity_recordings ORDER BY created_at_ms DESC", fetchall=True) or []
        return [self._public_recording(row) for row in rows]

    def active_recordings(self) -> list[dict[str, Any]]:
        rows = self._execute("SELECT * FROM velocity_recordings WHERE status IN ('starting','waiting','recording','reconnecting') ORDER BY created_at_ms", fetchall=True) or []
        return [self._public_recording(row) for row in rows]

    def worker_history(self, rid: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Recharge l'historique utile au score après un redémarrage Render."""
        laps = self._execute(
            "SELECT * FROM velocity_recorder_laps WHERE recording_id=? ORDER BY received_at_ms,row_id,lap_number",
            (rid,), fetchall=True,
        ) or []
        pits = self._execute(
            "SELECT * FROM velocity_recorder_pits WHERE recording_id=? ORDER BY received_at_ms,row_id",
            (rid,), fetchall=True,
        ) or []
        return laps, pits

    def _public_recording(self, row: dict[str, Any]) -> dict[str, Any]:
        item = dict(row)
        raw_meta = item.pop("metadata_json", None)
        try:
            item["metadata"] = json.loads(raw_meta) if raw_meta else {}
        except Exception:
            item["metadata"] = {}
        return item

    def update_recording(self, rid: str, **fields):
        allowed = {"status", "stopped_at_ms", "last_message_at_ms", "frames_count", "laps_count", "sectors_count", "pits_count", "scores_count", "teams_count", "last_error", "metadata_json"}
        clean = {k: v for k, v in fields.items() if k in allowed}
        if not clean:
            return
        assignments = ",".join(f"{key}=?" for key in clean)
        self._execute(f"UPDATE velocity_recordings SET {assignments} WHERE id=?", tuple(clean.values()) + (rid,))

    def append_frame(self, rid: str, at_ms: int, raw: str):
        self._execute("INSERT INTO velocity_recorder_frames(recording_id,received_at_ms,raw) VALUES (?,?,?)", (rid, at_ms, str(raw)))

    def upsert_lap(self, rid: str, lap: dict[str, Any], *, preserve_existing_timestamp: bool = False) -> bool:
        """Insère/complète un tour et indique s'il était réellement nouveau.

        Le backfill historique ne doit pas écraser l'horodatage d'un tour déjà capté
        en direct, tandis qu'un vrai passage live peut naturellement rafraîchir ses
        champs. Le verrou du store rend le test + upsert atomique entre threads.
        """
        with self._lock:
            existing = self._execute(
                "SELECT received_at_ms FROM velocity_recorder_laps WHERE recording_id=? AND row_id=? AND lap_number=?",
                (rid, lap["row_id"], lap["lap_number"]), fetchone=True,
            )
            params = (
                rid, lap["row_id"], lap["lap_number"], lap["received_at_ms"], lap.get("team"), lap.get("pilot"), lap.get("kart"), lap.get("position"),
                lap.get("lap_time"), lap.get("lap_seconds"), lap.get("sector_1"), lap.get("sector_1_seconds"), lap.get("sector_2"), lap.get("sector_2_seconds"),
                lap.get("sector_3"), lap.get("sector_3_seconds"), lap.get("pit_stops"), lap.get("relay_index"),
            )
            timestamp_update = "received_at_ms=velocity_recorder_laps.received_at_ms," if preserve_existing_timestamp else "received_at_ms=excluded.received_at_ms,"
            self._execute(
                f"""INSERT INTO velocity_recorder_laps
                   (recording_id,row_id,lap_number,received_at_ms,team,pilot,kart,position,lap_time,lap_seconds,sector_1,sector_1_seconds,sector_2,sector_2_seconds,sector_3,sector_3_seconds,pit_stops,relay_index)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(recording_id,row_id,lap_number) DO UPDATE SET
                   {timestamp_update}team=COALESCE(NULLIF(excluded.team,''),velocity_recorder_laps.team),pilot=COALESCE(NULLIF(excluded.pilot,''),velocity_recorder_laps.pilot),kart=COALESCE(NULLIF(excluded.kart,''),velocity_recorder_laps.kart),position=COALESCE(excluded.position,velocity_recorder_laps.position),
                   lap_time=excluded.lap_time,lap_seconds=excluded.lap_seconds,sector_1=COALESCE(excluded.sector_1,velocity_recorder_laps.sector_1),sector_1_seconds=COALESCE(excluded.sector_1_seconds,velocity_recorder_laps.sector_1_seconds),
                   sector_2=COALESCE(excluded.sector_2,velocity_recorder_laps.sector_2),sector_2_seconds=COALESCE(excluded.sector_2_seconds,velocity_recorder_laps.sector_2_seconds),sector_3=COALESCE(excluded.sector_3,velocity_recorder_laps.sector_3),sector_3_seconds=COALESCE(excluded.sector_3_seconds,velocity_recorder_laps.sector_3_seconds),
                   pit_stops=COALESCE(excluded.pit_stops,velocity_recorder_laps.pit_stops),relay_index=COALESCE(excluded.relay_index,velocity_recorder_laps.relay_index)""", params)
            return existing is None

    def append_sector(self, rid: str, item: dict[str, Any]):
        self._execute(
            "INSERT INTO velocity_recorder_sectors(recording_id,row_id,lap_number,received_at_ms,team,kart,sector,value,seconds,kind) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (rid, item["row_id"], item.get("lap_number"), item["received_at_ms"], item.get("team"), item.get("kart"), item["sector"], item.get("value"), item.get("seconds"), item.get("kind")))

    def append_historical_sector_once(self, rid: str, item: dict[str, Any]) -> bool:
        with self._lock:
            existing = self._execute(
                "SELECT 1 AS ok FROM velocity_recorder_sectors WHERE recording_id=? AND row_id=? AND lap_number=? AND sector=? AND kind='history' LIMIT 1",
                (rid, item["row_id"], item.get("lap_number"), item["sector"]), fetchone=True,
            )
            if existing:
                return False
            payload = dict(item)
            payload["kind"] = "history"
            self.append_sector(rid, payload)
            return True

    def append_pit(self, rid: str, item: dict[str, Any]):
        self._execute(
            "INSERT INTO velocity_recorder_pits(recording_id,row_id,received_at_ms,lap_number,team,pilot,kart,event,stop_number,relay_index) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (rid, item["row_id"], item["received_at_ms"], item.get("lap_number"), item.get("team"), item.get("pilot"), item.get("kart"), item["event"], item.get("stop_number"), item.get("relay_index")))

    def append_pit_once(self, rid: str, item: dict[str, Any]) -> bool:
        with self._lock:
            existing = self._execute(
                "SELECT 1 AS ok FROM velocity_recorder_pits WHERE recording_id=? AND row_id=? AND event=? AND stop_number=? AND lap_number=? LIMIT 1",
                (rid, item["row_id"], item["event"], item.get("stop_number"), item.get("lap_number")), fetchone=True,
            )
            if existing:
                return False
            self.append_pit(rid, item)
            return True

    def append_score(self, rid: str, item: dict[str, Any]):
        self._execute(
            """INSERT INTO velocity_recorder_scores(recording_id,received_at_ms,row_id,team,pilot,kart,relay_index,score,confidence,average,best3,consistency,corrected_delta,condition_mode,criteria_json,weights_json,engine)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (rid, item["received_at_ms"], item["row_id"], item.get("team"), item.get("pilot"), item.get("kart"), item.get("relay_index"), item.get("score"), item.get("confidence"),
             item.get("average"), item.get("best3"), item.get("consistency"), item.get("corrected_delta"), item.get("condition_mode"), _safe_json(item.get("criteria") or {}),
             _safe_json(item.get("weights") or {}), item.get("engine") or "velocity-v2-recorder"))

    def append_event(self, rid: str, at_ms: int, event: dict[str, Any]):
        self._execute("INSERT INTO velocity_recorder_events(recording_id,received_at_ms,event_type,row_id,payload_json) VALUES (?,?,?,?,?)",
                      (rid, at_ms, str(event.get("kind") or event.get("type") or event.get("event") or "event"), event.get("row"), _safe_json(event)))

    def append_snapshot(self, rid: str, at_ms: int, payload: dict[str, Any]):
        self._execute("INSERT INTO velocity_recorder_snapshots(recording_id,received_at_ms,payload_json) VALUES (?,?,?)", (rid, at_ms, _safe_json(payload)))

    def table_rows(self, table: str, rid: str) -> list[dict[str, Any]]:
        allowed = {
            "velocity_recorder_laps": "received_at_ms,row_id,lap_number",
            "velocity_recorder_sectors": "received_at_ms,row_id,sector",
            "velocity_recorder_pits": "received_at_ms,row_id",
            "velocity_recorder_scores": "received_at_ms,row_id",
            "velocity_recorder_events": "received_at_ms,row_id",
            "velocity_recorder_snapshots": "received_at_ms",
            "velocity_recorder_frames": "received_at_ms",
        }
        if table not in allowed:
            raise ValueError("Table export non autorisée")
        return self._execute(f"SELECT * FROM {table} WHERE recording_id=? ORDER BY {allowed[table]}", (rid,), fetchall=True) or []

    def iter_table_rows(self, table: str, rid: str, batch_size: int = 1000):
        """Lit un gros enregistrement par lots sur une connexion dédiée.

        L'export RAW d'une 24 h peut représenter des centaines de milliers de
        lignes : on évite de charger toute la course dans les 512 Mo de RAM du
        Web Service Starter et on ne bloque pas la connexion d'écriture du Recorder.
        """
        allowed = {
            "velocity_recorder_laps": "received_at_ms,row_id,lap_number",
            "velocity_recorder_sectors": "received_at_ms,row_id,sector",
            "velocity_recorder_pits": "received_at_ms,row_id",
            "velocity_recorder_scores": "received_at_ms,row_id",
            "velocity_recorder_events": "received_at_ms,row_id",
            "velocity_recorder_snapshots": "received_at_ms",
            "velocity_recorder_frames": "received_at_ms",
        }
        if table not in allowed:
            raise ValueError("Table export non autorisée")
        if self.backend == "postgres":
            if psycopg is None:
                raise RuntimeError("psycopg indisponible")
            conn = psycopg.connect(self.database_url, autocommit=True)
        else:
            conn = sqlite3.connect(self.sqlite_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
        try:
            cur = conn.cursor()
            sql = f"SELECT * FROM {table} WHERE recording_id=? ORDER BY {allowed[table]}"
            cur.execute(self._sql(sql), (rid,))
            columns = [d.name if hasattr(d, "name") else d[0] for d in (cur.description or [])]
            while True:
                rows = cur.fetchmany(max(1, int(batch_size)))
                if not rows:
                    break
                for row in rows:
                    if isinstance(row, sqlite3.Row):
                        yield dict(row)
                    else:
                        yield dict(zip(columns, row))
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def delete_recording(self, rid: str):
        rec = self.get_recording(rid)
        if not rec:
            return False
        if rec.get("status") in {"starting", "waiting", "recording", "reconnecting"}:
            raise ValueError("Arrêtez l'enregistrement avant de le supprimer.")
        for table in ("velocity_recorder_frames", "velocity_recorder_laps", "velocity_recorder_sectors", "velocity_recorder_pits", "velocity_recorder_scores", "velocity_recorder_events", "velocity_recorder_snapshots"):
            self._execute(f"DELETE FROM {table} WHERE recording_id=?", (rid,))
        self._execute("DELETE FROM velocity_recordings WHERE id=?", (rid,))
        return True

    @staticmethod
    def _write_csv_stream(zf: zipfile.ZipFile, filename: str, rows, fields: list[str], on_row: Callable[[dict[str, Any]], None] | None = None) -> int:
        count = 0
        with zf.open(filename, "w") as binary:
            binary.write(b"\xef\xbb\xbf")
            text = io.TextIOWrapper(binary, encoding="utf-8", newline="", write_through=True)
            writer = csv.DictWriter(text, fieldnames=fields, extrasaction="ignore", delimiter=";")
            writer.writeheader()
            for row in rows:
                clean = dict(row)
                if "received_at_ms" in clean:
                    clean["heure_utc"] = _utc_iso(clean.get("received_at_ms"))
                writer.writerow(clean)
                count += 1
                if on_row:
                    on_row(clean)
            text.flush()
            text.detach()
        return count

    @staticmethod
    def _write_jsonl_stream(zf: zipfile.ZipFile, filename: str, rows, transform: Callable[[dict[str, Any]], dict[str, Any]]) -> int:
        count = 0
        with zf.open(filename, "w") as binary:
            for row in rows:
                binary.write((_safe_json(transform(dict(row))) + "\n").encode("utf-8"))
                count += 1
        return count

    def export_zip(self, rid: str):
        """Construit l'export complet en flux, avec débordement automatique sur disque temporaire."""
        rec = self.get_recording(rid)
        if not rec:
            raise KeyError(rid)

        safe = re.sub(r"[^A-Za-z0-9_-]+", "_", rec.get("name") or "course").strip("_") or "course"
        filename = f"Velocity_{safe}_{rid}.zip"
        # 16 Mo maximum en RAM, puis tempfile local. Le fichier n'est qu'un tampon
        # d'export : la source de vérité reste Postgres.
        payload = tempfile.SpooledTemporaryFile(max_size=16 * 1024 * 1024, mode="w+b", suffix=".zip")
        counts = {"laps": 0, "sectors": 0, "scores": 0, "pits": 0, "events": 0, "frames": 0, "snapshots": 0}
        teams: dict[tuple[Any, Any, Any], dict[str, Any]] = {}

        def collect_team(lap: dict[str, Any]):
            key = (lap.get("row_id"), lap.get("team"), lap.get("kart"))
            item = teams.setdefault(key, {
                "row_id": lap.get("row_id"), "equipe": lap.get("team"), "kart": lap.get("kart"),
                "premier_tour": lap.get("lap_number"), "dernier_tour": lap.get("lap_number"), "tours_enregistres": 0,
            })
            lap_no = int(lap.get("lap_number") or 0)
            if lap_no > 0:
                item["premier_tour"] = min(int(item.get("premier_tour") or lap_no), lap_no)
                item["dernier_tour"] = max(int(item.get("dernier_tour") or 0), lap_no)
            item["tours_enregistres"] = int(item.get("tours_enregistres") or 0) + 1

        with zipfile.ZipFile(payload, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as zf:
            counts["laps"] = self._write_csv_stream(zf, "01_TOURS.csv", self.iter_table_rows("velocity_recorder_laps", rid), ["heure_utc", "received_at_ms", "row_id", "lap_number", "team", "pilot", "kart", "position", "lap_time", "lap_seconds", "sector_1", "sector_1_seconds", "sector_2", "sector_2_seconds", "sector_3", "sector_3_seconds", "pit_stops", "relay_index"], collect_team)
            counts["sectors"] = self._write_csv_stream(zf, "02_SECTEURS.csv", self.iter_table_rows("velocity_recorder_sectors", rid), ["heure_utc", "received_at_ms", "row_id", "lap_number", "team", "kart", "sector", "value", "seconds", "kind"])
            counts["scores"] = self._write_csv_stream(zf, "03_VELOCITY_SCORES.csv", self.iter_table_rows("velocity_recorder_scores", rid), ["heure_utc", "received_at_ms", "row_id", "team", "pilot", "kart", "relay_index", "score", "confidence", "average", "best3", "consistency", "corrected_delta", "condition_mode", "criteria_json", "weights_json", "engine"])
            counts["pits"] = self._write_csv_stream(zf, "04_PITS_RELAIS.csv", self.iter_table_rows("velocity_recorder_pits", rid), ["heure_utc", "received_at_ms", "row_id", "lap_number", "team", "pilot", "kart", "event", "stop_number", "relay_index"])
            counts["snapshots"] = self._write_jsonl_stream(zf, "05_CLASSEMENT_SNAPSHOTS.jsonl", self.iter_table_rows("velocity_recorder_snapshots", rid), lambda row: {**row, "heure_utc": _utc_iso(row.get("received_at_ms"))})
            self._write_csv_stream(zf, "06_EQUIPES_KARTS.csv", teams.values(), ["row_id", "equipe", "kart", "premier_tour", "dernier_tour", "tours_enregistres"])
            counts["events"] = self._write_csv_stream(zf, "07_EVENEMENTS_APEX.csv", self.iter_table_rows("velocity_recorder_events", rid), ["heure_utc", "received_at_ms", "event_type", "row_id", "payload_json"])
            counts["frames"] = self._write_jsonl_stream(zf, "08_RAW_APEX.jsonl", self.iter_table_rows("velocity_recorder_frames", rid), lambda row: {"received_at_ms": row.get("received_at_ms"), "heure_utc": _utc_iso(row.get("received_at_ms")), "raw": row.get("raw")})
            zf.writestr("course.json", json.dumps({"recording": rec, "storage": self.storage_info(), "exported_at": _utc_iso(), "files": counts}, ensure_ascii=False, indent=2).encode("utf-8"))
        payload.seek(0)
        return payload, filename


class _RecorderProtocolRuntime:
    def __init__(self):
        self.state = {
            "version": "recorder", "mode": "endurance", "circuit_id": "", "connection": "RECORDER",
            "live": {"status": "idle", "messages": 0, "last_message_at": None, "last_error": None, "websocket_url": None, "parsed_updates": 0, "last_frame_preview": None},
            "followed_driver": "", "followed_locked": False, "followed_snapshot": None,
            "time_remaining": "—", "time_remaining_ms": None, "time_remaining_updated_at_ms": None, "time_remaining_end_at_ms": None,
            "apex_laps_remaining": "—", "current_lap": 0, "total_laps": 0, "session_best": {"driver": "—", "lap": "—"},
            "fastest_last_lap": {"driver": "—", "lap": "—"}, "drivers": [], "penalties": [], "penalty_history": [],
            "comment_penalties": [], "comment_events": [], "quick_change": [], "qualif_crossing": None, "generic_alert": None,
            "developer_mode": False, "traffic_recording": False, "traffic_recording_started_at": None, "driver_message": None,
            "spotter": {}, "spotter_registry": {}, "analyzer_rules": None, "analyzer_strategy": None,
        }
        self.table = ApexTable()
        self.protocol = ProtocolEngine()
        self.race = RaceStateService(self.state)

    def process(self, frame: str) -> dict[str, Any]:
        grid = parse_grid_frame(frame)
        initial = grid.updates if grid else []
        if grid:
            self.protocol.interpreter.set_schema(grid.schema, grid.labels)
        updates, unknown = decode_frame(frame)
        self.protocol.observe_frame(frame, grid, initial + updates)
        changes, events = [], []
        for update in initial:
            change = self.table.apply(update)
            changes.append(change.to_dict())
            self.protocol.apply(update, change.previous_value, initial=True)
        for update in updates:
            change = self.table.apply(update)
            changes.append(change.to_dict())
            events.extend(self.protocol.apply(update, change.previous_value))
        snapshot = self.protocol.snapshot()
        self.race.sync_state_from_race(snapshot, events)
        return {"state": deepcopy(self.state), "snapshot": snapshot, "events": events, "unknown": unknown, "updates": updates_to_dicts(initial + updates), "changes": changes}


class VelocityRecorderScoreEngine:
    """Server-side Velocity V2 scoring from recorded laps/pits.

    It mirrors the Analyzer V2 relative-to-grid logic for the data that the recorder
    owns. Qualification context is deliberately neutral when the recorder was started
    without an earlier qualification capture; every raw input remains exported so a
    later Lab replay can recompute the score with future algorithms.
    """

    def relay_slices(self, team: dict[str, Any]) -> list[dict[str, Any]]:
        laps = sorted((team.get("laps") or []), key=lambda x: int(x.get("lap") or 0))
        pit_laps = sorted({int(p.get("lap") or 0) for p in team.get("pits") or [] if int(p.get("lap") or 0) > 0 and p.get("event") == "IN"})
        clean = [l for l in laps if int(l.get("lap") or 0) > 0 and float(l.get("seconds") or 0) > 0 and int(l.get("lap") or 0) not in pit_laps]
        bounds = [0] + pit_laps + [10**12]
        relays = []
        for idx in range(len(bounds) - 1):
            segment = [l for l in clean if bounds[idx] < int(l.get("lap") or 0) < bounds[idx + 1]]
            if len(segment) > 1:
                segment = segment[1:]
            raw = [float(l["seconds"]) for l in segment if float(l.get("seconds") or 0) > 0]
            if not raw:
                continue
            med = _median(raw)
            values = [v for v in raw if med is None or v <= med + 5]
            scored = values if len(values) >= 3 else raw
            sorted_values = sorted(scored)
            pilot = ""
            if idx < len(team.get("pits") or []):
                pilot = str((team.get("pits") or [])[idx].get("pilot") or "").strip()
            if not pilot and idx == len(bounds) - 2:
                pilot = str(team.get("pilot") or "").strip()
            relays.append({
                "index": idx + 1, "from": int(segment[0]["lap"]) if segment else None, "to": int(segment[-1]["lap"]) if segment else None,
                "laps": len(scored), "average": _mean(scored), "best3": _mean(sorted_values[:3]), "consistency": _stddev(scored), "values": scored,
                "lapPoints": [{"lap": int(l["lap"]), "seconds": float(l["seconds"])} for l in segment if int(l.get("lap") or 0) > 0 and float(l.get("seconds") or 0) > 0],
                "pilot": pilot or None,
            })
        return relays

    def _all_points(self, teams):
        points = []
        for team in teams:
            for relay in team.get("relays", []):
                for point in relay.get("lapPoints", []):
                    lap, seconds = point.get("lap"), point.get("seconds")
                    if isinstance(lap, (int, float)) and isinstance(seconds, (int, float)) and seconds > 0:
                        points.append({"team": team, "relay": relay, "lap": int(lap), "seconds": float(seconds)})
        by_lap: dict[int, list[float]] = {}
        for p in points:
            by_lap.setdefault(p["lap"], []).append(p["seconds"])
        return points, by_lap

    def _temporal_ref(self, by_lap, lap):
        target = int(lap)
        cohort = [v for l in range(target - 1, target + 2) for v in by_lap.get(l, [])]
        if len(cohort) < 6:
            cohort = [v for l in range(target - 2, target + 3) for v in by_lap.get(l, [])]
        if len(cohort) < 4:
            return None
        dist = _robust_distribution(cohort)
        median = dist["median"]
        if median is None:
            return None
        tolerance = max(5.0, 4 * float(dist["sigma"]) if dist["sigma"] is not None else 5.0)
        clean = [v for v in cohort if abs(v - float(median)) <= tolerance]
        basis = clean if len(clean) >= 4 else cohort
        return {"reference": _median(basis), "spread": float(_robust_distribution(basis)["sigma"] or 0), "count": len(basis)}

    def _pilot_key(self, relay):
        return _normalize_pilot(relay.get("pilot"))

    def _pilot_baselines(self, teams, by_lap):
        buckets = {}
        for team in teams:
            for relay in team.get("relays", []):
                key = self._pilot_key(relay)
                if not key:
                    continue
                deltas = []
                for point in relay.get("lapPoints", []):
                    ref = self._temporal_ref(by_lap, point["lap"])
                    if ref:
                        deltas.append(float(point["seconds"]) - float(ref["reference"]))
                if len(deltas) < 3:
                    continue
                item = buckets.setdefault(key, {"values": [], "relays": set()})
                item["values"].extend(deltas)
                item["relays"].add(int(relay.get("index") or 0))
        return {key: {"median": _median(item["values"]), "samples": len(item["values"]), "relays": len(item["relays"])} for key, item in buckets.items() if item["values"]}

    def _relative_profile(self, relay, by_lap, pilot_baselines):
        points = []
        for point in relay.get("lapPoints", []):
            ref = self._temporal_ref(by_lap, point["lap"])
            if not ref:
                continue
            seconds = float(point["seconds"])
            points.append({"lap": int(point["lap"]), "seconds": seconds, "reference": ref["reference"], "spread": ref["spread"], "delta": seconds - float(ref["reference"])})
        if len(points) < 3:
            return None
        references = [float(p["reference"]) for p in points]
        ref_dist = _robust_distribution(references)
        ref_swing = max(references) - min(references)
        key = self._pilot_key(relay)
        baseline = pilot_baselines.get(key)
        use = bool(key and baseline and baseline["samples"] >= 12 and baseline["relays"] >= 2 and baseline["median"] is not None)
        relative_raw = [p["delta"] for p in points]
        relative = [v - (float(baseline["median"]) if use else 0.0) for v in relative_raw]
        spread = _median([p["spread"] for p in points])
        dynamic = ref_swing >= 2.5 or (ref_dist["sigma"] is not None and float(ref_dist["sigma"]) >= 1.0)
        return {"dynamic": dynamic, "average": _mean(relative), "best3": _mean(sorted(relative)[:3]), "consistency": _stddev(relative), "laps": len(relative),
                "referenceSwing": ref_swing, "gridSpread": float(spread or 0), "pilotBaselineApplied": use, "pilotBaselineSamples": baseline["samples"] if use else 0}

    def _window_peer_metrics(self, teams, relay, by_lap, pilot_baselines):
        start, end = relay.get("from"), relay.get("to")
        if start is None or end is None:
            return []
        out = []
        for team in teams:
            window = []
            for tr in team.get("relays", []):
                key = self._pilot_key(tr)
                baseline = pilot_baselines.get(key)
                use = bool(key and baseline and baseline["samples"] >= 12 and baseline["relays"] >= 2 and baseline["median"] is not None)
                for point in tr.get("lapPoints", []):
                    lap = int(point["lap"])
                    if lap < int(start) or lap > int(end):
                        continue
                    ref = self._temporal_ref(by_lap, lap)
                    if not ref:
                        continue
                    seconds = float(point["seconds"])
                    window.append({"seconds": seconds, "reference": ref["reference"], "spread": ref["spread"], "delta": seconds - float(ref["reference"]) - (float(baseline["median"]) if use else 0), "pilotBaselineApplied": use})
            if len(window) < 3:
                continue
            raw_values = [p["seconds"] for p in window]
            raw_median = _median(raw_values)
            stable = [v for v in raw_values if raw_median is None or v <= raw_median + 5]
            raw_scored = stable if len(stable) >= 3 else raw_values
            refs = [float(p["reference"]) for p in window]
            ref_dist = _robust_distribution(refs)
            ref_swing = max(refs) - min(refs)
            dynamic = ref_swing >= 2.5 or (ref_dist["sigma"] is not None and float(ref_dist["sigma"]) >= 1.0)
            relative = [float(p["delta"]) for p in window]
            values = relative if dynamic else raw_scored
            out.append({"team": team, "average": _mean(values), "best3": _mean(sorted(values)[:3]), "consistency": _stddev(values), "laps": len(values), "dynamic": dynamic,
                        "rawAverage": _mean(raw_scored), "profile": {"dynamic": dynamic, "average": _mean(relative), "best3": _mean(sorted(relative)[:3]), "consistency": _stddev(relative), "laps": len(relative),
                        "referenceSwing": ref_swing, "gridSpread": _median([p["spread"] for p in window]) or 0, "pilotBaselineApplied": any(p["pilotBaselineApplied"] for p in window)}})
        return out

    def compute(self, teams_input: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
        teams = []
        for row, source in teams_input.items():
            team = dict(source)
            team["row_id"] = int(row)
            team["relays"] = self.relay_slices(team)
            if team["relays"]:
                teams.append(team)
        if not teams:
            return []
        _, by_lap = self._all_points(teams)
        pilot_baselines = self._pilot_baselines(teams, by_lap)
        transitions = []
        window_cache = {}

        def peers_for(relay):
            key = (int(relay.get("from") or 0), int(relay.get("to") or 0))
            if key not in window_cache:
                window_cache[key] = self._window_peer_metrics(teams, relay, by_lap, pilot_baselines)
            return window_cache[key]

        for team in teams:
            for relay in team["relays"]:
                if relay.get("laps", 0) < 3 or relay.get("average") is None:
                    continue
                prev = next((r for r in team["relays"] if r.get("index") == relay.get("index") - 1), None)
                profile = self._relative_profile(relay, by_lap, pilot_baselines)
                prev_profile = self._relative_profile(prev, by_lap, pilot_baselines) if prev else None
                peer_metrics = peers_for(relay)
                grid_now = _median([x["rawAverage"] for x in peer_metrics if x.get("rawAverage") is not None])
                previous_grid = None
                if prev:
                    prev_peers = peers_for(prev)
                    previous_grid = _median([x["rawAverage"] for x in prev_peers if x.get("rawAverage") is not None])
                previous_average = prev.get("average") if prev else None
                raw_delta = relay["average"] - previous_average if previous_average is not None else None
                grid_delta = grid_now - previous_grid if grid_now is not None and previous_grid is not None else 0.0
                corrected = raw_delta - grid_delta if raw_delta is not None else None
                dynamic = bool(profile and profile.get("dynamic"))
                if dynamic and profile.get("average") is not None:
                    corrected = profile["average"] - prev_profile["average"] if prev_profile and prev_profile.get("average") is not None else profile["average"]
                midpoint = (float(relay.get("from") or 0) + float(relay.get("to") or 0)) / 2
                transitions.append({"team": team, "relay": relay, "previous": prev, "previousAverage": previous_average, "gridNow": grid_now, "previousGrid": previous_grid,
                                    "rawDelta": raw_delta, "gridDelta": grid_delta, "correctedDelta": corrected, "midpoint": midpoint, "dynamic": dynamic, "conditionProfile": profile, "previousConditionProfile": prev_profile})

        results = []
        for team in teams:
            latest = max((x for x in transitions if x["team"] is team), key=lambda x: int(x["relay"]["index"]), default=None)
            if not latest:
                continue
            relay = latest["relay"]
            peers = peers_for(relay)
            raw_peer = next((p for p in peers if p["team"] is team), None)
            use_dynamic = bool(raw_peer and raw_peer.get("dynamic") and raw_peer.get("profile"))
            pace_value = raw_peer["profile"]["average"] if use_dynamic else relay.get("average")
            potential_value = raw_peer["profile"]["best3"] if use_dynamic else relay.get("best3")
            consistency_value = raw_peer["profile"]["consistency"] if use_dynamic else relay.get("consistency")
            pace_values = [(x["average"] if x.get("dynamic") else x.get("rawAverage")) for x in peers if (x.get("average") if x.get("dynamic") else x.get("rawAverage")) is not None]
            potential_values = [x["best3"] for x in peers if x.get("best3") is not None]
            consistency_values = [x["consistency"] for x in peers if x.get("consistency") is not None]
            lap_values = [x["laps"] for x in peers if x.get("laps") is not None]
            transition_peers = [x["correctedDelta"] for x in transitions if x.get("correctedDelta") is not None and abs(float(x.get("midpoint") or 0) - float(latest.get("midpoint") or 0)) <= 30]
            if len(transition_peers) < 6:
                transition_peers = [x["correctedDelta"] for x in transitions if x.get("correctedDelta") is not None]
            has_transition = latest.get("correctedDelta") is not None and len(transition_peers) >= 3
            pace = _percentile_score(pace_value, pace_values)
            transition = _percentile_score(latest.get("correctedDelta"), transition_peers) if has_transition else None
            potential = _percentile_score(potential_value, potential_values) if potential_value is not None else 50
            consistency = _percentile_score(consistency_value, consistency_values) if consistency_value is not None else 50
            sample = _percentile_score(relay.get("laps"), lap_values, lower_is_better=False)
            signal = _transition_signal(latest.get("correctedDelta"), transition_peers) if has_transition else {"z": None, "median": None, "sigma": None}
            weights = _transition_weights(signal["z"], has_transition)
            score = round(pace * weights["pace"] + (transition or 0) * weights["transition"] + potential * weights["potential"] + consistency * weights["consistency"] + sample * weights["sample"])
            score = max(0, min(100, score))
            condition_penalty = 0
            grid_spread = (raw_peer or {}).get("profile", {}).get("gridSpread") if use_dynamic else (latest.get("conditionProfile") or {}).get("gridSpread")
            pilot_applied = bool((raw_peer or {}).get("profile", {}).get("pilotBaselineApplied") if use_dynamic else (latest.get("conditionProfile") or {}).get("pilotBaselineApplied"))
            if use_dynamic and (grid_spread or 0) >= 1.25 and not pilot_applied:
                condition_penalty = 15
            elif use_dynamic and (grid_spread or 0) >= .8 and not pilot_applied:
                condition_penalty = 8
            laps_n = int(relay.get("laps") or 0)
            confidence = 20 if laps_n < 3 else 40 if laps_n < 5 else 65 if laps_n < 8 else 85
            if latest.get("correctedDelta") is not None and latest.get("gridNow") is not None:
                confidence += 5
            if len(peers) >= 6:
                confidence += 5
            confidence -= condition_penalty
            current_pilot = _normalize_pilot(relay.get("pilot") or team.get("pilot"))
            previous_pilot = _normalize_pilot((latest.get("previous") or {}).get("pilot"))
            if current_pilot and previous_pilot:
                confidence += 5 if current_pilot == previous_pilot else -20
            elif latest.get("correctedDelta") is not None:
                confidence -= 10
            confidence = max(20, min(95, confidence))
            results.append({
                "row_id": team["row_id"], "team": team.get("team"), "pilot": relay.get("pilot") or team.get("pilot"), "kart": team.get("kart"),
                "relay_index": relay.get("index"), "score": score, "confidence": confidence, "average": relay.get("average"), "best3": relay.get("best3"), "consistency": relay.get("consistency"),
                "corrected_delta": latest.get("correctedDelta"), "condition_mode": "dynamic" if use_dynamic else "stable",
                "criteria": {"pace": pace, "transition": transition, "potential": potential, "consistency": consistency, "sample": sample}, "weights": weights,
                "engine": "velocity-v2-recorder",
            })
        return results


class DataRecorderWorker:
    ACTIVE = {"starting", "waiting", "recording", "reconnecting"}

    def __init__(self, store: RecorderStore, recording: dict[str, Any], circuit: dict[str, Any], on_done: Callable[[str], None] | None = None):
        self.store = store
        self.recording = recording
        self.circuit = circuit
        self.id = recording["id"]
        self.stop_event = threading.Event()
        self.thread = None
        self.ws = None
        self.runtime = _RecorderProtocolRuntime()
        self.seen: dict[int, dict[str, Any]] = {}
        self.teams: dict[int, dict[str, Any]] = {}
        self.score_engine = VelocityRecorderScoreEngine()
        self.last_score_at = 0
        self.last_score_signatures: dict[int, tuple] = {}
        self.last_snapshot_at = 0
        self.counters = {"frames": int(recording.get("frames_count") or 0), "laps": int(recording.get("laps_count") or 0), "sectors": int(recording.get("sectors_count") or 0), "pits": int(recording.get("pits_count") or 0), "scores": int(recording.get("scores_count") or 0)}
        self.on_done = on_done
        self.data_lock = threading.RLock()
        self.backfill_thread = None
        self.backfill_wakeup = threading.Event()
        self.metadata = dict(recording.get("metadata") or {})
        self.backfill_full_rows = {int(x) for x in (self.metadata.get("backfill_full_rows") or []) if str(x).isdigit()}
        self.backfill_total_laps = int(self.metadata.get("backfill_laps") or 0)
        self.backfill_total_pits = int(self.metadata.get("backfill_pits") or 0)
        self.backfill_total_sectors = int(self.metadata.get("backfill_sectors") or 0)
        self.backfill_syncing = False
        self._hydrate_history()

    def _hydrate_history(self):
        """Conserve le contexte Velocity Score si Render redémarre pendant un REC."""
        if not self.counters["laps"] and not self.counters["pits"]:
            return
        try:
            laps, pits = self.store.worker_history(self.id)
            for lap in laps:
                try:
                    row = int(lap.get("row_id") or 0)
                except Exception:
                    continue
                if row <= 0:
                    continue
                bucket = self.teams.setdefault(row, {"team": lap.get("team"), "pilot": lap.get("pilot"), "kart": lap.get("kart"), "laps": [], "pits": []})
                bucket["team"] = lap.get("team") or bucket.get("team")
                bucket["pilot"] = lap.get("pilot") or bucket.get("pilot")
                bucket["kart"] = lap.get("kart") or bucket.get("kart")
                seconds = lap.get("lap_seconds")
                if isinstance(seconds, (int, float)) and math.isfinite(float(seconds)) and float(seconds) > 0:
                    bucket["laps"].append({"lap": int(lap.get("lap_number") or 0), "seconds": float(seconds), "received_at_ms": int(lap.get("received_at_ms") or 0)})
            for pit in pits:
                if str(pit.get("event") or "").upper() != "IN":
                    continue
                try:
                    row = int(pit.get("row_id") or 0)
                except Exception:
                    continue
                if row <= 0:
                    continue
                bucket = self.teams.setdefault(row, {"team": pit.get("team"), "pilot": pit.get("pilot"), "kart": pit.get("kart"), "laps": [], "pits": []})
                bucket["pits"].append({"lap": int(pit.get("lap_number") or 0), "pilot": pit.get("pilot"), "event": "IN", "stop": int(pit.get("stop_number") or 0)})
            for bucket in self.teams.values():
                bucket["laps"].sort(key=lambda item: int(item.get("lap") or 0))
                bucket["pits"].sort(key=lambda item: int(item.get("lap") or 0))
        except Exception:
            # Le RAW reste la source de vérité ; un problème de réhydratation ne doit jamais empêcher le Recorder de reprendre.
            self.teams = {}

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        self.thread = threading.Thread(target=self._run, name=f"velocity-recorder-{self.id}", daemon=True)
        self.backfill_thread = threading.Thread(target=self._backfill_loop, name=f"velocity-recorder-backfill-{self.id}", daemon=True)
        self.thread.start()
        self.backfill_thread.start()
        self.backfill_wakeup.set()

    def stop(self):
        self.stop_event.set()
        self.backfill_wakeup.set()
        try:
            if self.ws:
                self.ws.close()
        except Exception:
            pass

    def _update_status(self, status: str, error: str | None = None):
        fields = {"status": status, "last_error": error}
        if status == "stopped":
            fields["stopped_at_ms"] = _now_ms()
        self.store.update_recording(self.id, **fields)

    def _run(self):
        if websocket is None:
            self._update_status("error", "Module websocket-client indisponible")
            return
        url = str(self.circuit.get("websocket_url") or "").strip()
        if not url:
            self._update_status("error", "URL WebSocket Apex absente")
            return
        request_message = str(self.circuit.get("session_request") or "").strip()
        retry = 3
        try:
            while not self.stop_event.is_set():
                self._update_status("waiting" if self.counters["frames"] == 0 else "reconnecting", None)

                def on_open(ws):
                    self._update_status("recording", None)
                    self.backfill_wakeup.set()  # réconciliation immédiate après toute reconnexion Apex
                    if request_message:
                        ws.send(request_message)

                def on_message(ws, message):
                    if self.stop_event.is_set() or not isinstance(message, str) or not message:
                        return
                    self._ingest(message)

                def on_error(ws, error):
                    if not self.stop_event.is_set():
                        self._update_status("reconnecting", str(error)[:500])

                def on_close(ws, code, reason):
                    if not self.stop_event.is_set():
                        label = f"{code or ''} {reason or ''}".strip()
                        self._update_status("reconnecting", label or None)

                try:
                    self.ws = websocket.WebSocketApp(
                        url, on_open=on_open, on_message=on_message, on_error=on_error, on_close=on_close,
                        header=["User-Agent: Mozilla/5.0 Velocity-Lab-Recorder", "Cache-Control: no-cache", "Pragma: no-cache"],
                    )
                    self.ws.run_forever(ping_interval=20, ping_timeout=10, suppress_origin=False, origin=self.circuit.get("live_url") or "https://live.apex-timing.com")
                except Exception as exc:
                    if not self.stop_event.is_set():
                        self._update_status("reconnecting", str(exc)[:500])
                finally:
                    self.ws = None
                if not self.stop_event.is_set():
                    self.stop_event.wait(retry)
        finally:
            try:
                self._snapshot_scores(force=True)
            except Exception:
                pass
            if self.stop_event.is_set():
                self._update_status("stopped", None)
            if self.on_done:
                self.on_done(self.id)

    def _team_bucket(self, row: int, driver: dict[str, Any]) -> dict[str, Any]:
        bucket = self.teams.setdefault(row, {"team": driver.get("driver"), "pilot": driver.get("pilot"), "kart": driver.get("apex"), "laps": [], "pits": []})
        bucket["team"] = driver.get("driver") or bucket.get("team")
        bucket["pilot"] = driver.get("pilot") or bucket.get("pilot")
        bucket["kart"] = driver.get("apex") or bucket.get("kart")
        return bucket

    def _ingest(self, frame: str):
        at = _now_ms()
        self.store.append_frame(self.id, at, frame)
        self.counters["frames"] += 1
        result = self.runtime.process(frame)
        state = result["state"]
        for event in result.get("events") or []:
            self.store.append_event(self.id, at, event)
        with self.data_lock:
            self._capture_drivers(state.get("drivers") or [], at)
        if at - self.last_snapshot_at >= 10_000:
            self.last_snapshot_at = at
            compact = {
                "session_title": state.get("apex_session_title"), "session_type": state.get("apex_session_type"), "time_remaining": state.get("time_remaining"),
                "drivers": [{k: d.get(k) for k in ("pos", "driver", "pilot", "apex", "laps", "pit_stops", "last", "best", "status", "apex_row")} for d in state.get("drivers") or []],
            }
            self.store.append_snapshot(self.id, at, compact)
        with self.data_lock:
            self._snapshot_scores()
            self._persist_counters(status="recording", last_message_at_ms=at, last_error=None)

    def _persist_counters(self, **extra):
        fields = {
            "frames_count": self.counters["frames"], "laps_count": self.counters["laps"],
            "sectors_count": self.counters["sectors"], "pits_count": self.counters["pits"],
            "scores_count": self.counters["scores"], "teams_count": len(self.teams),
        }
        fields.update(extra)
        self.store.update_recording(self.id, **fields)

    def _save_backfill_metadata(self, status: str, error: str | None = None):
        self.metadata.update({
            "version": max(2, int(self.metadata.get("version") or 1)),
            "score_engine": self.metadata.get("score_engine") or "velocity-v2-recorder",
            "backfill_status": status,
            "backfill_last_at_ms": _now_ms(),
            "backfill_laps": self.backfill_total_laps,
            "backfill_pits": self.backfill_total_pits,
            "backfill_sectors": self.backfill_total_sectors,
            "backfill_full_rows": sorted(self.backfill_full_rows),
            "backfill_error": error,
            "backfill_note": "Les tours historiques Apex n'incluent pas leur heure absolue de passage ; received_at_ms correspond à l'heure de récupération pour les lignes backfillées.",
        })
        self.store.update_recording(self.id, metadata_json=_safe_json(self.metadata))

    def _fetch_apex_history_for_row(self, row: int, full: bool) -> tuple[dict[str, Any], bool]:
        windows = [100, 500, 1500, 3000, 6000] if full else [150]
        latest = {"laps": [], "pits": [], "drivers": {}, "current_driver": ""}
        complete = False
        for count in windows:
            if self.stop_event.is_set():
                break
            command = f"D#-{count}#D{row}.L#-999#D{row}.P#2#D{row}.B#1#D{row}.INF"
            parsed = None
            for attempt in range(2):
                try:
                    parsed = _parse_apex_history(_apex_http_history(self.circuit, command), row)
                except Exception:
                    parsed = None
                if parsed and (parsed.get("laps") or parsed.get("pits") or parsed.get("drivers")):
                    break
                if attempt == 0:
                    self.stop_event.wait(.15)
            if not parsed:
                continue
            latest = parsed
            laps = parsed.get("laps") or []
            if not full:
                complete = True
                break
            if any(int(item.get("lap") or 0) == 1 for item in laps) or (laps and len(laps) < count):
                complete = True
                break
        return latest, complete

    def _historical_pilot_for_lap(self, lap_no: int, pits: list[dict[str, Any]], current_driver: str) -> str | None:
        for pit in pits:
            if int(pit.get("lap") or 0) >= int(lap_no):
                name = str(pit.get("driver_name") or "").strip()
                if name:
                    return name
        return str(current_driver or "").strip() or None

    def _merge_apex_history(self, row: int, history: dict[str, Any], full_complete: bool) -> dict[str, int]:
        at = _now_ms()
        new = {"laps": 0, "pits": 0, "sectors": 0}
        with self.data_lock:
            bucket = self.teams.get(row)
            if not bucket:
                return new
            current_driver = str(history.get("current_driver") or "").strip()
            if current_driver:
                bucket["pilot"] = current_driver
            pits = sorted((history.get("pits") or []), key=lambda p: int(p.get("stop") or 0))
            team_name, kart = bucket.get("team"), bucket.get("kart")

            # Les arrêts historiques sont injectés avant les tours afin de reconstruire
            # correctement les bornes de relais utilisées par Velocity Score.
            for pit in pits:
                lap_no = int(pit.get("lap") or 0)
                stop_no = int(pit.get("stop") or 0)
                pilot = str(pit.get("driver_name") or "").strip() or None
                base = {
                    "row_id": row, "received_at_ms": at, "lap_number": lap_no,
                    "team": team_name, "pilot": pilot, "kart": kart,
                    "stop_number": stop_no,
                }
                item_in = dict(base, event="IN", relay_index=max(1, stop_no))
                if self.store.append_pit_once(self.id, item_in):
                    self.counters["pits"] += 1; new["pits"] += 1
                key = (lap_no, stop_no)
                if not any((int(p.get("lap") or 0), int(p.get("stop") or 0)) == key for p in bucket["pits"]):
                    bucket["pits"].append({"lap": lap_no, "pilot": pilot, "event": "IN", "stop": stop_no})
                if int(pit.get("pit_out_ms") or 0) > int(pit.get("pit_in_ms") or 0):
                    item_out = dict(base, event="OUT", relay_index=max(1, stop_no + 1))
                    if self.store.append_pit_once(self.id, item_out):
                        self.counters["pits"] += 1; new["pits"] += 1
            bucket["pits"].sort(key=lambda item: int(item.get("lap") or 0))

            existing_laps = {int(x.get("lap") or 0): x for x in bucket.get("laps") or []}
            for lap in history.get("laps") or []:
                lap_no = int(lap.get("lap") or 0)
                lap_ms = int(lap.get("lap_time") or 0)
                if lap_no <= 0 or lap_ms <= 0:
                    continue
                completed_stops = sum(1 for pit in pits if int(pit.get("lap") or 0) < lap_no)
                pit_stops = sum(1 for pit in pits if int(pit.get("lap") or 0) <= lap_no)
                pilot = self._historical_pilot_for_lap(lap_no, pits, current_driver) or bucket.get("pilot")
                s1, s2, s3 = (int(lap.get(key) or 0) for key in ("sector1", "sector2", "sector3"))
                record = {
                    "row_id": row, "lap_number": lap_no, "received_at_ms": at,
                    "team": team_name, "pilot": pilot, "kart": kart, "position": None,
                    "lap_time": _format_apex_ms(lap_ms), "lap_seconds": lap_ms / 1000,
                    "sector_1": _format_apex_ms(s1), "sector_1_seconds": s1 / 1000 if s1 > 0 else None,
                    "sector_2": _format_apex_ms(s2), "sector_2_seconds": s2 / 1000 if s2 > 0 else None,
                    "sector_3": _format_apex_ms(s3), "sector_3_seconds": s3 / 1000 if s3 > 0 else None,
                    "pit_stops": pit_stops, "relay_index": completed_stops + 1,
                }
                if self.store.upsert_lap(self.id, record, preserve_existing_timestamp=True):
                    self.counters["laps"] += 1; new["laps"] += 1
                existing_laps[lap_no] = {"lap": lap_no, "seconds": lap_ms / 1000, "received_at_ms": at}
                for sector, value in ((1, s1), (2, s2), (3, s3)):
                    if value <= 0:
                        continue
                    sector_item = {
                        "row_id": row, "lap_number": lap_no, "received_at_ms": at,
                        "team": team_name, "kart": kart, "sector": sector,
                        "value": _format_apex_ms(value), "seconds": value / 1000,
                    }
                    if self.store.append_historical_sector_once(self.id, sector_item):
                        self.counters["sectors"] += 1; new["sectors"] += 1
            bucket["laps"] = [existing_laps[k] for k in sorted(existing_laps) if k > 0]

            if full_complete and (history.get("laps") or history.get("pits")):
                self.backfill_full_rows.add(row)
            self.backfill_total_laps += new["laps"]
            self.backfill_total_pits += new["pits"]
            self.backfill_total_sectors += new["sectors"]
            self._persist_counters()
        return new

    def _backfill_loop(self):
        """Rattrape l'historique au démarrage puis réconcilie les trous périodiquement."""
        while not self.stop_event.is_set():
            self.backfill_wakeup.clear()
            with self.data_lock:
                rows = sorted(int(row) for row in self.teams if int(row) > 0)
            if not rows:
                self._save_backfill_metadata("waiting-live", None)
                self.backfill_wakeup.wait(3)
                continue

            self.backfill_syncing = True
            self._save_backfill_metadata("syncing", None)
            errors = []
            changed = {"laps": 0, "pits": 0, "sectors": 0}
            for row in rows:
                if self.stop_event.is_set():
                    break
                full = row not in self.backfill_full_rows
                try:
                    history, complete = self._fetch_apex_history_for_row(row, full=full)
                    if self.stop_event.is_set():
                        break
                    delta = self._merge_apex_history(row, history, full_complete=(full and complete))
                    for key in changed:
                        changed[key] += delta[key]
                except Exception as exc:
                    errors.append(f"r{row}: {exc}")
                self.stop_event.wait(.05)

            if changed["laps"] or changed["pits"] or changed["sectors"]:
                self.store.append_event(self.id, _now_ms(), {
                    "kind": "history_backfill", "rows": len(rows), "new_laps": changed["laps"],
                    "new_pits": changed["pits"], "new_sectors": changed["sectors"],
                })
            with self.data_lock:
                self.backfill_syncing = False
                if changed["laps"] or changed["pits"] or changed["sectors"]:
                    self._snapshot_scores(force=True)
                self._persist_counters()
            self._save_backfill_metadata("ready" if not errors else "partial", "; ".join(errors)[:500] if errors else None)

            # Toutes les 5 minutes : une fenêtre courte suffit pour réparer les trous
            # éventuels dus à une coupure WebSocket. Une reconnexion réveille aussi
            # immédiatement la boucle via backfill_wakeup.
            self.backfill_wakeup.wait(300)

    def _capture_drivers(self, drivers: list[dict[str, Any]], at: int):
        for driver in drivers:
            try:
                row = int(driver.get("apex_row") or 0)
            except Exception:
                row = 0
            if row <= 0:
                continue
            bucket = self._team_bucket(row, driver)
            laps = int(driver.get("laps") or 0)
            last = str(driver.get("last") or "").strip()
            status = str(driver.get("status") or "unknown")
            pit_stops = int(driver.get("pit_stops") or 0) if str(driver.get("pit_stops") or "").isdigit() else 0
            current_sectors = {
                1: (driver.get("sector_1"), driver.get("sector_1_kind")),
                2: (driver.get("sector_2"), driver.get("sector_2_kind")),
                3: (driver.get("sector_3"), driver.get("sector_3_kind")),
            }
            prev = self.seen.get(row)
            if prev is None:
                self.seen[row] = {"laps": laps, "last": last, "status": status, "pit_stops": pit_stops, "sectors": {}, "sector_values": {}}
                prev = self.seen[row]
            else:
                last_seconds = _time_seconds(last)
                completed = (laps > int(prev.get("laps") or 0) or (last and last not in {"—", "--"} and last != prev.get("last"))) and last_seconds is not None
                if completed:
                    lap_number = laps if laps > 0 else int(prev.get("laps") or 0) + 1
                    sectors = prev.get("sectors") or {}
                    relay_index = pit_stops + 1
                    lap = {
                        "row_id": row, "lap_number": lap_number, "received_at_ms": at, "team": driver.get("driver"), "pilot": driver.get("pilot"), "kart": driver.get("apex"), "position": driver.get("pos"),
                        "lap_time": last, "lap_seconds": last_seconds,
                        "sector_1": (sectors.get(1) or {}).get("value"), "sector_1_seconds": (sectors.get(1) or {}).get("seconds"),
                        "sector_2": (sectors.get(2) or {}).get("value"), "sector_2_seconds": (sectors.get(2) or {}).get("seconds"),
                        "sector_3": (sectors.get(3) or {}).get("value"), "sector_3_seconds": (sectors.get(3) or {}).get("seconds"),
                        "pit_stops": pit_stops, "relay_index": relay_index,
                    }
                    inserted = self.store.upsert_lap(self.id, lap)
                    existing = {int(x.get("lap") or 0): x for x in bucket["laps"]}
                    existing[lap_number] = {"lap": lap_number, "seconds": last_seconds, "received_at_ms": at}
                    bucket["laps"] = [existing[k] for k in sorted(existing)]
                    if inserted:
                        self.counters["laps"] += 1
                    prev["sectors"] = {}
                    prev["sector_values"] = {}

                if status != prev.get("status"):
                    if status == "pit":
                        self._capture_pit(row, driver, at, laps, "IN", pit_stops, bucket)
                    elif prev.get("status") == "pit" and status != "pit":
                        self._capture_pit(row, driver, at, laps, "OUT", pit_stops, bucket)
                elif pit_stops > int(prev.get("pit_stops") or 0):
                    self._capture_pit(row, driver, at, laps, "IN", pit_stops, bucket)

            for sector, (value, kind) in current_sectors.items():
                seconds = _sector_seconds(value)
                if seconds is None:
                    continue
                marker = (str(value), str(kind or ""))
                if prev.get("sector_values", {}).get(sector) == marker:
                    continue
                prev.setdefault("sector_values", {})[sector] = marker
                prev.setdefault("sectors", {})[sector] = {"value": str(value), "seconds": seconds, "kind": kind}
                self.store.append_sector(self.id, {"row_id": row, "lap_number": laps + 1 if laps >= 0 else None, "received_at_ms": at, "team": driver.get("driver"), "kart": driver.get("apex"), "sector": sector, "value": str(value), "seconds": seconds, "kind": kind})
                self.counters["sectors"] += 1

            prev["laps"] = laps
            prev["last"] = last
            prev["status"] = status
            prev["pit_stops"] = pit_stops

    def _capture_pit(self, row, driver, at, laps, event, pit_stops, bucket):
        marker = (event, laps, pit_stops)
        if bucket.get("last_pit_marker") == marker:
            return
        bucket["last_pit_marker"] = marker
        item = {"row_id": row, "received_at_ms": at, "lap_number": laps, "team": driver.get("driver"), "pilot": driver.get("pilot"), "kart": driver.get("apex"), "event": event, "stop_number": pit_stops, "relay_index": pit_stops + (0 if event == "IN" else 1)}
        inserted = self.store.append_pit_once(self.id, item)
        if inserted:
            self.counters["pits"] += 1
        if event == "IN":
            key = (int(laps or 0), int(pit_stops or 0))
            if not any((int(p.get("lap") or 0), int(p.get("stop") or 0)) == key for p in bucket["pits"]):
                bucket["pits"].append({"lap": laps, "pilot": driver.get("pilot"), "event": "IN", "stop": pit_stops})
                bucket["pits"].sort(key=lambda item: int(item.get("lap") or 0))

    def _snapshot_scores(self, force=False):
        if self.backfill_syncing and not force:
            return
        now = _now_ms()
        if not force and now - self.last_score_at < 15_000:
            return
        self.last_score_at = now
        for score in self.score_engine.compute(self.teams):
            row = int(score.get("row_id") or 0)
            signature = (
                score.get("score"), score.get("confidence"), score.get("relay_index"),
                round(float(score.get("average") or 0), 4), round(float(score.get("best3") or 0), 4),
                round(float(score.get("consistency") or 0), 4), round(float(score.get("corrected_delta") or 0), 4),
                str(score.get("condition_mode") or ""), str(score.get("criteria_json") or ""), str(score.get("weights_json") or ""),
            )
            if not force and self.last_score_signatures.get(row) == signature:
                continue
            self.last_score_signatures[row] = signature
            score["received_at_ms"] = now
            self.store.append_score(self.id, score)
            self.counters["scores"] += 1


class RecorderManager:
    def __init__(self, store: RecorderStore, load_circuits: Callable[[], list[dict[str, Any]]]):
        self.store = store
        self.load_circuits = load_circuits
        self._lock = threading.RLock()
        self.workers: dict[str, DataRecorderWorker] = {}

    def _circuit(self, circuit_id: str) -> dict[str, Any] | None:
        return next((c for c in self.load_circuits() if str(c.get("id")) == str(circuit_id)), None)

    def create(self, name: str, circuit_id: str) -> dict[str, Any]:
        circuit = self._circuit(circuit_id)
        if not circuit:
            raise ValueError("Circuit inconnu")
        if not circuit.get("websocket_url"):
            raise ValueError("Ce circuit n'a pas de WebSocket Apex configuré")
        if os.getenv("RENDER") == "true" and not self.store.persistent:
            raise ValueError("Render Postgres n'est pas configuré : ajoutez DATABASE_URL avant de lancer un enregistrement longue durée.")
        if any(str(item.get("circuit_id") or "") == str(circuit_id) for item in self.store.active_recordings()):
            raise ValueError("Un Recorder est déjà actif sur ce circuit Apex.")
        recording = self.store.create_recording(name, circuit)
        worker = DataRecorderWorker(self.store, recording, circuit, self._worker_done)
        with self._lock:
            self.workers[recording["id"]] = worker
        worker.start()
        return self.store.get_recording(recording["id"])

    def _worker_done(self, rid: str):
        with self._lock:
            self.workers.pop(rid, None)

    def stop(self, rid: str) -> dict[str, Any]:
        with self._lock:
            worker = self.workers.get(rid)
        if worker:
            worker.stop()
            worker.thread.join(timeout=3)
            if worker.backfill_thread and worker.backfill_thread.is_alive():
                worker.backfill_thread.join(timeout=1)
        else:
            rec = self.store.get_recording(rid)
            if not rec:
                raise KeyError(rid)
            if rec.get("status") in DataRecorderWorker.ACTIVE:
                self.store.update_recording(rid, status="stopped", stopped_at_ms=_now_ms())
        return self.store.get_recording(rid)

    def resume_active(self):
        for rec in self.store.active_recordings():
            circuit = self._circuit(rec.get("circuit_id"))
            if not circuit or not circuit.get("websocket_url"):
                self.store.update_recording(rec["id"], status="error", last_error="Circuit ou WebSocket introuvable au redémarrage")
                continue
            with self._lock:
                if rec["id"] in self.workers:
                    continue
                worker = DataRecorderWorker(self.store, rec, circuit, self._worker_done)
                self.workers[rec["id"]] = worker
            worker.start()

    def status(self):
        return {"storage": self.store.storage_info(), "recordings": self.store.list_recordings()}
