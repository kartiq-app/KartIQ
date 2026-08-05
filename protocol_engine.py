from __future__ import annotations

from collections import Counter
import re
import time
from typing import Any

from apex_interpreter import ApexInterpreter


class ProtocolEngine:
    """Détecte le profil de flux Apex et alimente un modèle de course unifié."""

    def __init__(self) -> None:
        self.interpreter = ApexInterpreter()
        self.reset()

    def reset(self) -> None:
        self.interpreter.reset()
        self.protocol = "detecting"
        self.adapter = "Détection en cours"
        self.confidence = 0
        self.frames = 0
        self.updates = 0
        self.grid_frames = 0
        self.init_frames = 0
        self._codes: Counter[str] = Counter()
        self._columns: Counter[int] = Counter()
        self._rows: set[int] = set()
        self._lap_anchor: int | None = None
        self._heuristic_schema_applied = False
        self.remaining_ms: int | None = None
        self.remaining_updated_at_ms: int | None = None
        self.remaining_end_at_ms: int | None = None
        self.total_laps: int | None = None
        self.comments_raw: str = ""
        self.comments_updated_at_ms: int | None = None

    def observe_frame(self, frame: str, grid: Any | None, updates: list[Any]) -> None:
        self.frames += 1
        # Apex publie le temps restant sous la forme dyn1|countdown|<millisecondes>.
        countdowns = re.findall(r"(?:^|\n)dyn1\|countdown\|(\d+)", frame)
        if countdowns:
            received_at_ms = int(time.time() * 1000)
            self.remaining_ms = max(0, int(countdowns[-1]))
            self.remaining_updated_at_ms = received_at_ms
            self.remaining_end_at_ms = received_at_ms + self.remaining_ms
        # Les courses au nombre de tours publient selon les configurations Apex
        # une cible explicite sous plusieurs noms dynamiques. On ne retient que
        # ces clés structurées afin de ne pas confondre la cible avec le compteur
        # de tours individuel présent dans la grille.
        lap_targets = re.findall(
            r"(?:^|[\r\n\s])(?:dyn1\|)?(?:total_laps|totallaps|max_laps|maxlaps|laps_total|lapstotal|nb_laps|nblaps|nb_tours|nbtours|tours_total|tourstotal|lapcount)\|(\d+)",
            frame,
            re.IGNORECASE,
        )
        if lap_targets:
            target = int(lap_targets[-1])
            if target > 0:
                self.total_laps = target
        # La zone « Commentaires » Apex est publiée via com||... .
        # On conserve uniquement une valeur non vide afin qu'une trame partielle
        # ne supprime pas accidentellement la dernière information reçue.
        # Les trames d'initialisation Apex peuvent être séparées par des retours
        # à la ligne OU par de simples espaces. On extrait donc la section com||
        # jusqu'au prochain champ protocolaire (grid||, msg||, dyn1|..., r123c4|...).
        comment_match = re.search(
            r"(?:^|\s)com\|\|(.*?)(?=\s+(?:[A-Za-z][A-Za-z0-9_]*|r\d+(?:c\d+)?)\|(?:\||[^|]*\|)|$)",
            frame,
            re.DOTALL,
        )
        if comment_match:
            raw_comment = comment_match.group(1).strip()
            if raw_comment:
                self.comments_raw = raw_comment
                self.comments_updated_at_ms = int(time.time() * 1000)
        if "init|" in frame:
            self.init_frames += 1
        if grid:
            self.grid_frames += 1
            self.protocol = "html_grid"
            self.adapter = "HTML Grid Adapter"
            self.confidence = 100
            self.interpreter.set_schema(grid.schema, grid.labels)

        for update in updates:
            self.updates += 1
            self._rows.add(update.row)
            if update.column is not None:
                self._columns[update.column] += 1
            if update.code:
                self._codes[update.code] += 1
            if update.code in {"tn", "tb", "ti"} and update.column is not None:
                self._lap_anchor = update.column

        if self.protocol != "html_grid":
            self._detect_non_grid()
            self._apply_heuristic_schema()

    def _detect_non_grid(self) -> None:
        endurance_signals = self._codes["to"] >= 2 or any(code in self._codes for code in ("*in", "*out"))
        enough_data = self.frames >= 2 or self.updates >= 8
        if endurance_signals and enough_data:
            self.protocol = "endurance_stream"
            self.adapter = "Endurance Adapter"
            self.confidence = min(92, 58 + self._codes["to"] * 4 + len(self._rows))
        elif self._lap_anchor is not None and enough_data:
            self.protocol = "live_rows"
            self.adapter = "Live Rows Adapter"
            self.confidence = min(88, 55 + len(self._rows) * 2)
        else:
            self.protocol = "detecting"
            self.adapter = "Détection en cours"
            self.confidence = min(45, self.frames * 8)

    def _apply_heuristic_schema(self) -> None:
        """Reconstruit un schéma relatif autour de la colonne du dernier tour.

        Apex conserve généralement l'ordre : position, kart, nom/équipe,
        dernier tour, écart, intervalle, meilleur tour, puis compteurs.
        """
        if self._lap_anchor is None:
            return
        c = self._lap_anchor
        schema = {
            c - 3: "rk",
            c - 2: "no",
            c - 1: "dr",
            c: "llp",
            c + 1: "gap",
            c + 2: "int",
            c + 3: "blp",
        }
        labels = {
            c - 3: "Classement (inféré)", c - 2: "Kart (inféré)",
            c - 1: "Pilote/Équipe (inféré)", c: "Dernier tour",
            c + 1: "Écart", c + 2: "Intervalle", c + 3: "Meilleur tour",
        }
        if self.protocol == "live_rows":
            schema[c + 4] = "tlp"
            labels[c + 4] = "Tours (inféré)"
        self.interpreter.set_schema(schema, labels)
        self._heuristic_schema_applied = True

    def apply(self, update: Any, previous_value: str | None = None, *, initial: bool = False) -> list[dict[str, Any]]:
        return self.interpreter.apply(update, previous_value, initial=initial)

    def snapshot(self) -> dict[str, Any]:
        snap = self.interpreter.snapshot()
        rows = snap.get("rows", [])
        snap["protocol"] = {
            "id": self.protocol,
            "label": {
                "detecting": "Détection en cours",
                "html_grid": "HTML Grid",
                "live_rows": "Live Rows",
                "endurance_stream": "Endurance",
            }.get(self.protocol, self.protocol),
            "adapter": self.adapter,
            "confidence": self.confidence,
            "frames": self.frames,
            "updates": self.updates,
            "grid_frames": self.grid_frames,
            "init_frames": self.init_frames,
            "row_count": len(self._rows),
            "race_objects": len(rows),
            "lap_anchor_column": self._lap_anchor,
            "heuristic_schema": self._heuristic_schema_applied,
        }
        snap["mapping_status"] = "automatic_grid" if self.protocol == "html_grid" else "automatic_heuristic"
        # Un compte à rebours Apex n'est valable que s'il a été rafraîchi récemment.
        # Sans cette expiration, une ancienne session peut continuer à se décompter
        # localement alors qu'aucune course n'est plus active sur la piste.
        now_ms = int(time.time() * 1000)
        countdown_fresh = bool(
            self.remaining_updated_at_ms is not None
            and now_ms - self.remaining_updated_at_ms <= 45_000
        )
        snap["session"] = {
            "remaining_ms": self.remaining_ms if countdown_fresh else None,
            "remaining_updated_at_ms": self.remaining_updated_at_ms if countdown_fresh else None,
            "remaining_end_at_ms": self.remaining_end_at_ms if countdown_fresh else None,
            "countdown_fresh": countdown_fresh,
            "total_laps": self.total_laps,
        }
        snap["comments"] = {
            "raw": self.comments_raw,
            "updated_at_ms": self.comments_updated_at_ms,
        }
        return snap
