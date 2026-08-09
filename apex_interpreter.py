from __future__ import annotations

import re
import unicodedata
from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

LAP_RE = re.compile(r"^(?:(\d+):)?(\d{1,2})\.(\d{3})$")
DRIVER_STINT_RE = re.compile(r"^(.*?)\s*\[(\d{1,3}:\d{2}(?::\d{2})?)\]\s*$")

FIELD_BY_APEX_TYPE = {
    "rk": "position",
    "no": "kart",
    "dr": "name",
    "llp": "last_lap",
    "gap": "gap",
    "int": "interval",
    "blp": "best_lap",
    "tlp": "laps",
    # Compteur dynamique Apex « On track / En piste ». La classe CSS de la
    # cellule (`in` ou `to`) indique ensuite si le concurrent roule ou se trouve
    # dans les stands. Il est essentiel de limiter cette logique à la colonne
    # `otr`, car de nombreuses autres cellules Apex utilisent aussi la classe
    # générique `in`.
    "otr": "on_track_timer",
    # Colonne de statut Apex : certaines pistes matérialisent IN avec la classe `si`
    # et le damier avec `sf`, sans fournir de compteur `otr`.
    "sta": "status_flag",
    # Types fréquemment employés par les configurations Apex pour le nombre d'arrêts.
    "pit": "pit_stops",
    "pst": "pit_stops",
    "stp": "pit_stops",
    "nbp": "pit_stops",
    # Pénalités : les codes varient selon les configurations Apex.
    "pen": "penalty",
    "pnl": "penalty",
    "pny": "penalty",
    "pty": "penalty",
    "san": "penalty",
    "pna": "penalty",
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
            "row": row, "position": None, "name": None, "pilot": None, "kart": None,
            "last_lap": None, "best_lap": None, "gap": None,
            "interval": None, "laps": None, "timer": None,
            "pit_timer": None, "track_timer": None,
            "pit_stops": None, "penalty": None, "status": "unknown", "status_source": None, "last_lap_kind": None,
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
        raw_label = (self.labels.get(col) or "").strip().lower() if col is not None else ""
        label = unicodedata.normalize("NFKD", raw_label).encode("ascii", "ignore").decode("ascii")
        label = re.sub(r"[^a-z0-9]+", " ", label).strip()

        # Certaines grilles Endurance Apex séparent l'équipe et le pilote courant.
        # On ne considère une colonne comme PILOTE que si son libellé est explicite
        # et qu'il ne s'agit pas du libellé combiné « Équipe / Pilote ».
        pilot_labels = {"pilote", "pilot", "driver", "conducteur", "nom pilote", "driver name", "pilote actuel"}
        normalized_labels = []
        for other in self.labels.values():
            normalized = unicodedata.normalize("NFKD", str(other or "").lower()).encode("ascii", "ignore").decode("ascii")
            normalized_labels.append(re.sub(r"[^a-z0-9]+", " ", normalized).strip())
        has_team_column = any(any(token in other for token in ("equipe", "team")) and not any(token in other for token in ("pilote", "pilot", "driver")) for other in normalized_labels)
        if label in pilot_labels and has_team_column:
            field = "pilot"
        elif any(token in label for token in ("equipe", "team")) and not any(token in label for token in ("pilote", "pilot", "driver")):
            field = "name"

        # Certaines pistes utilisent un type Apex personnalisé pour cette colonne.
        # Le libellé de grille permet alors d'identifier STANDS / PITS / ARRÊTS.
        if field is None and col is not None:
            # Les installations Apex peuvent traduire les libellés sans renseigner
            # data-type (ex. Belgique : « Rondes » pour les tours). On mappe donc
            # les colonnes métier par libellé en dernier recours.
            if label in {"position", "pos", "clt", "classement", "rang", "rank"}:
                field = "position"
            elif label in {"kart", "no", "n", "numero", "numero kart", "kart no", "kart number"}:
                field = "kart"
            elif label in {
                "tours", "tour", "laps", "lap", "rondes", "ronde",
                "vueltas", "vuelta", "giri", "giro", "runden", "runde",
                "voltas", "volta", "okrążenia", "okrążenie", "okrazenia", "okrazenie"
            }:
                field = "laps"
            elif label in {"dernier", "dernier tour", "last", "last lap", "tour precedent", "temps dernier tour"}:
                field = "last_lap"
            elif label in {"meilleur", "meilleur tour", "best", "best lap", "record", "temps meilleur"}:
                field = "best_lap"
            elif label in {"ecart", "gap", "difference"}:
                field = "gap"
            elif label in {"intervalle", "interval", "interv", "int"}:
                field = "interval"
            elif label in {"en piste", "temps en piste", "on track", "on track time", "track time", "rijtijd", "op de baan"}:
                field = "on_track_timer"
            # Apex abrège souvent la colonne des pénalités en « Péna. ».
            elif any(token in label for token in ("pena", "penalite", "penalty", "sanction")):
                field = "penalty"
            # Ne pas confondre « Totale pit tijd » (durée) et « Pits » (nombre).
            elif label in {"pits", "pit stops", "stops", "arrets", "arret", "stands"}:
                field = "pit_stops"

        if field in {"position", "kart", "laps", "pit_stops"}:
            parsed = self._as_int(value)
            old = row.get(field)
            if parsed is not None:
                row[field] = parsed
                if field == "laps" and old is not None and parsed > old and not initial:
                    self._emit(update.row, "lap_count", "Nouveau tour", f"Tour {parsed}", str(parsed))
        elif field == "name":
            cleaned = value.strip()
            stint = DRIVER_STINT_RE.match(cleaned)
            if stint:
                # Certaines courses endurance affichent le pilote courant sous la
                # forme « NOM [0:04] ». Le compteur entre crochets est le temps de
                # roulage du pilote. On l'expose comme pilote + EN PISTE sans
                # dépendre d'une colonne `otr` absente.
                pilot_name = stint.group(1).strip()
                driver_time = stint.group(2).strip()
                # Le format Apex [H:MM] exprime heures:minutes, pas minutes:secondes.
                # On normalise en HH:MM:SS pour les calculateurs Analyzer.
                parts = driver_time.split(":")
                normalized_driver_time = f"{int(parts[0]):02d}:{int(parts[1]):02d}:00" if len(parts) == 2 else driver_time
                row["name"] = pilot_name or None
                row["pilot"] = pilot_name or row.get("pilot")
                if row.get("status") != "pit":
                    row["track_timer"] = normalized_driver_time
                    row["timer"] = normalized_driver_time
            else:
                row["name"] = cleaned or None
        elif field == "pilot":
            row["pilot"] = value.strip() or None
        elif field == "penalty":
            cleaned = value.strip()
            row["penalty"] = cleaned or None
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
        elif field == "status_flag":
            # Certaines interfaces Apex n'exposent le statut stands que via la
            # colonne `sta`. `si` correspond au badge rouge IN, tandis que `sf`
            # correspond au damier / concurrent terminé. On conserve la source
            # afin que le frontend puisse filtrer les non-partants marqués IN.
            old = row.get("status")
            if code == "si":
                row["status"] = "pit"
                row["status_source"] = "sta"
                if not initial and old != "pit":
                    self._emit(update.row, "pit_in", "Entrée aux stands", "Statut Apex IN (sta/si)", value, "pit")
            elif code == "sf":
                row["status"] = "finished"
                row["status_source"] = "sta"
                if not initial and old == "pit":
                    self._emit(update.row, "pit_out", "Sortie du statut IN", "Statut Apex damier (sta/sf)", value, "track")
            else:
                # `sr`, `su`, `sd` et les autres classes de statut non-IN sont
                # des états piste/position. Il faut explicitement effacer un ancien
                # `pit`, sinon l'équipe reste bloquée avec la mention IN.
                if old == "pit" and row.get("status_source") == "sta" and not initial:
                    self._emit(update.row, "pit_out", "Sortie des stands", f"Statut Apex {code or 'normal'}", value, "track")
                row["status"] = "track"
                row["status_source"] = "sta"
        elif field == "on_track_timer":
            # La colonne Apex `otr` porte le compteur du relais en cours.
            # Sa classe `to` correspond au compteur de stand, tandis que `in`
            # correspond au temps écoulé depuis la dernière sortie des stands.
            # On ne doit surtout pas interpréter les classes `in`/`to` d'autres
            # colonnes, sous peine de remplacer le compteur de relais par un
            # écart, un meilleur tour ou une autre valeur du tableau.
            old = row.get("status")
            if code in {"to", "*in"}:
                row["status"] = "pit"
                row["status_source"] = "otr"
                row["pit_timer"] = value or row.get("pit_timer")
                row["timer"] = row.get("pit_timer")
                if not initial and old != "pit":
                    self._emit(update.row, "pit_in", "Entrée aux stands", "Décompte Apex TO", value, "pit")
            else:
                # Apex utilise normalement `in` lorsque le kart est en piste.
                # Le fallback accepte aussi les variantes de classe rencontrées
                # sur certains habillages, puisque le type de colonne `otr` est
                # désormais la source de vérité.
                row["status"] = "track"
                row["status_source"] = "otr"
                row["track_timer"] = value or row.get("track_timer")
                row["timer"] = row.get("track_timer")
                if not initial and old == "pit":
                    self._emit(update.row, "pit_out", "Sortie des stands", "Reprise du compteur Apex EN PISTE", row.get("pit_timer") or "", "track")

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
