from __future__ import annotations

import re
from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

LAP_RE = re.compile(r"^(?:(\d+):)?(\d{1,2})\.(\d{3})$")

FIELD_BY_APEX_TYPE = {
    "rk": "position",
    "no": "kart",
    "dr": "name",
    "llp": "last_lap",
    "gap": "gap",
    "int": "interval",
    "blp": "best_lap",
    "tlp": "laps",
}


def lap_seconds(value: str) -> float | None:
    m = LAP_RE.match((value or "").strip())
    if not m:
        return None
    return int(m.group(1) or 0) * 60 + int(m.group(2)) + int(m.group(3)) / 1000


@dataclass(slots=True)
class RaceEvent:
    at: str
    type: str
    row: int
    title: str
    detail: str
    value: str = ""
    severity: str = "info"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ApexInterpreter:
    """Interprète Apex à partir du schéma `grid` fourni par Apex lui-même."""

    def __init__(self) -> None:
        self.rows: dict[int, dict[str, Any]] = {}
        self.events: deque[RaceEvent] = deque(maxlen=300)
        self.fastest_lap: float | None = None
        self.schema: dict[int, str] = {}
        self.labels: dict[int, str] = {}
        self._initialized_rows: set[int] = set()

    def reset(self) -> None:
        self.rows.clear(); self.events.clear(); self.fastest_lap = None
        self.schema.clear(); self.labels.clear(); self._initialized_rows.clear()

    def set_schema(self, schema: dict[int, str], labels: dict[int, str] | None = None) -> None:
        if schema:
            self.schema = dict(schema)
        if labels:
            self.labels = dict(labels)

    def _row(self, row: int) -> dict[str, Any]:
        return self.rows.setdefault(row, {
            "row": row, "position": None, "name": None, "kart": None,
            "last_lap": None, "best_lap": None, "gap": None,
            "interval": None, "laps": None, "timer": None,
            "pit_stops": None, "status": "unknown", "last_lap_kind": None,
            "updated_at": None,
        })

    def _emit(self, row: int, type_: str, title: str, detail: str, value: str = "", severity: str = "info") -> None:
        self.events.appendleft(RaceEvent(datetime.now(timezone.utc).isoformat(), type_, row, title, detail, value, severity))

    @staticmethod
    def _as_int(value: str) -> int | None:
        try: return int(value.strip())
        except (TypeError, ValueError, AttributeError): return None

    def apply(self, update: Any, previous_value: str | None = None, *, initial: bool = False) -> list[dict[str, Any]]:
        row = self._row(update.row)
        row["updated_at"] = datetime.now(timezone.utc).isoformat()
        code, col, value = update.code, update.column, update.value
        before = len(self.events)

        apex_type = self.schema.get(col) if col is not None else None
        field = FIELD_BY_APEX_TYPE.get(apex_type or "")

        if field in {"position", "kart", "laps"}:
            parsed = self._as_int(value)
            old = row.get(field)
            if parsed is not None:
                row[field] = parsed
                if field == "laps" and old is not None and parsed > old and not initial:
                    self._emit(update.row, "lap_count", "Nouveau tour", f"Tour {parsed}", str(parsed))
        elif field == "name":
            row["name"] = value.strip() or None
        elif field == "last_lap":
            if lap_seconds(value) is not None:
                row["last_lap"] = value
                kind = {"tb": "fastest", "ti": "team_best", "tn": "normal"}.get(code, "lap")
                row["last_lap_kind"] = kind
                if not initial and previous_value != value:
                    if code == "tb":
                        self.fastest_lap = lap_seconds(value)
                        self._emit(update.row, "fastest_lap", "Meilleur tour de la grille", "Chrono magenta Apex", value, "fastest")
                    elif code == "ti":
                        self._emit(update.row, "team_best", "Meilleur tour de l'équipe", "Chrono vert Apex", value, "best")
                    else:
                        self._emit(update.row, "lap", "Tour enregistré", "Chrono non amélioré", value, "normal")
        elif field == "best_lap":
            if lap_seconds(value) is not None:
                row["best_lap"] = value
        elif field in {"gap", "interval"}:
            row[field] = value or None
        elif col is None and code == "*in":
            old = row.get("status")
            row["status"] = "pit"
            if not initial and old != "pit": self._emit(update.row, "pit_in", "Entrée aux stands", "Décompte bleu attendu", severity="pit")
        elif col is None and code == "*out":
            old = row.get("status")
            row["status"] = "track"
            if not initial and old not in {"unknown", "track"}: self._emit(update.row, "pit_out", "Sortie des stands", "Nouveau relais en piste", severity="track")
        elif col is not None and code == "to":
            # Colonne non typée utilisée comme compteur piste/stands selon la configuration.
            row["timer"] = value or None

        if initial:
            self._initialized_rows.add(update.row)
        return [e.to_dict() for e in list(self.events)[:len(self.events)-before]] if len(self.events) > before else []

    def snapshot(self) -> dict[str, Any]:
        rows = [r for r in self.rows.values() if any(r.get(k) is not None for k in ("position", "kart", "name", "last_lap", "best_lap", "laps"))]
        rows.sort(key=lambda x: (x["position"] is None, x["position"] or 9999, x["kart"] or 9999, x["row"]))
        return {
            "rows": rows,
            "events": [e.to_dict() for e in self.events],
            "fastest_lap_seconds": self.fastest_lap,
            "schema": {str(c): {"type": t, "label": self.labels.get(c, "")} for c, t in sorted(self.schema.items())},
            "mapping_status": "automatic_grid",
        }
