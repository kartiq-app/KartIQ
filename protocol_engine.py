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
        self._apex_schema_locked = False
        self.remaining_ms: int | None = None
        self.remaining_updated_at_ms: int | None = None
        self.remaining_end_at_ms: int | None = None
        self.elapsed_ms: int | None = None
        self.elapsed_updated_at_ms: int | None = None
        self.apex_session_type: str = "unknown"
        self.dynamic_timing_mode: str = "unknown"
        self.current_lap: int | None = None
        self.total_laps: int | None = None
        self.lap_progress_updated_at_ms: int | None = None
        self.comments_raw: str = ""
        self.comments_updated_at_ms: int | None = None
        self.instant_messages: list[dict[str, Any]] = []

    def observe_frame(self, frame: str, grid: Any | None, updates: list[Any]) -> None:
        self.frames += 1
        received_at_ms = int(time.time() * 1000)

        # Type de session annoncé directement par Apex : r = course, n = aucun live,
        # toute autre valeur active correspond au mode meilleur temps. Cette donnée
        # reste diagnostique : Velocity ne change jamais automatiquement le mode choisi.
        init_matches = re.findall(r"(?:^|[\r\n])init\|([^|\r\n]+)", frame)
        if init_matches:
            init_code = str(init_matches[-1]).strip().lower()
            self.apex_session_type = "no_live" if init_code == "n" else ("race" if init_code == "r" else "best_time")

        # Les courses au nombre de tours peuvent publier la progression comme
        # texte localisé, par exemple :
        #   dyn1|text|Giro 1/8
        #   dyn1|text|Tour 7/8
        #   dyn1|text|Lap 5/10
        # Cette information est la source de vérité pour le tour courant ET la
        # cible de tours ; elle prévaut sur un ancien compte à rebours mémorisé.
        lap_progresses = re.findall(
            r"(?:^|[\r\n])dyn1\|text\|[^\r\n]*?"
            r"(?:giro|giri|tour|tours|lap|laps|vuelta|vueltas|runde|runden|volta|voltas|ronde|rondes|okrazenie|okrazenia|okrążenie|okrążenia)\s*(\d+)\s*/\s*(\d+)",
            frame,
            re.IGNORECASE,
        )
        if lap_progresses:
            current, target = (int(value) for value in lap_progresses[-1])
            if target > 0:
                self.current_lap = max(0, current)
                self.total_laps = target
                self.lap_progress_updated_at_ms = received_at_ms
                self.remaining_ms = None
                self.remaining_updated_at_ms = None
                self.remaining_end_at_ms = None

        # Apex peut annoncer le type de dyn1 séparément de sa valeur, par exemple
        # `dyn1|countdown|` puis pousser ensuite `dyn1|123456`. Cette déclaration
        # doit primer sur une ancienne cible de tours mémorisée.
        dyn1_mode_matches = re.findall(r"(?:^|[\r\n])dyn1\|(countdown_text|countdown|count|text)\|", frame, re.IGNORECASE)
        if dyn1_mode_matches:
            announced_mode = str(dyn1_mode_matches[-1]).lower()
            if announced_mode in {"countdown", "countdown_text"}:
                self.dynamic_timing_mode = "countdown"
                self.current_lap = None
                self.total_laps = None
                self.lap_progress_updated_at_ms = None
            elif announced_mode == "count":
                self.dynamic_timing_mode = "count"
            elif announced_mode == "text" and lap_progresses:
                self.dynamic_timing_mode = "laps"

        # Apex accepte deux encodages pour count/countdown : un entier déjà exprimé
        # en millisecondes, ou une valeur décimale exprimée en secondes. countdown_text
        # peut en plus suffixer un libellé après un underscore. On reproduit ici la
        # conversion du JavaScript officiel Apex.
        def _apex_dynamic_time_to_ms(raw: str) -> int:
            value = str(raw or "").strip()
            numeric = value.split("_", 1)[0]
            parsed = float(numeric)
            return max(0, int(round(parsed * 1000 if "." in numeric else parsed)))

        counts = re.findall(r"(?:^|[\r\n])dyn1\|count\|([0-9]+(?:\.[0-9]+)?)", frame)
        if counts:
            self.elapsed_ms = _apex_dynamic_time_to_ms(counts[-1])
            self.elapsed_updated_at_ms = received_at_ms

        # Le temps restant peut arriver via countdown ou countdown_text.
        countdowns = re.findall(r"(?:^|[\r\n])dyn1\|(?:countdown|countdown_text)\|([0-9]+(?:\.[0-9]+)?(?:_[^\r\n|]*)?)", frame)
        if countdowns and not lap_progresses:
            self.dynamic_timing_mode = "countdown"
            self.remaining_ms = _apex_dynamic_time_to_ms(countdowns[-1])
            self.remaining_updated_at_ms = received_at_ms
            self.remaining_end_at_ms = received_at_ms + self.remaining_ms
            self.current_lap = None
            self.total_laps = None
            self.lap_progress_updated_at_ms = None

        # Après `dyn1|countdown|`, Apex peut envoyer uniquement `dyn1|<valeur>`.
        # On interprète alors cette valeur comme le temps restant, sans jamais la
        # confondre avec le nombre de tours individuel de la grille.
        generic_dyn1 = re.findall(r"(?:^|[\r\n])dyn1\|([0-9]+(?:\.[0-9]+)?(?:_[^\r\n|]*)?)(?:\||$)", frame)
        if generic_dyn1 and not countdowns and not lap_progresses:
            if self.dynamic_timing_mode == "countdown":
                self.remaining_ms = _apex_dynamic_time_to_ms(generic_dyn1[-1])
                self.remaining_updated_at_ms = received_at_ms
                self.remaining_end_at_ms = received_at_ms + self.remaining_ms
                self.current_lap = None
                self.total_laps = None
                self.lap_progress_updated_at_ms = None
            elif self.dynamic_timing_mode == "count":
                self.elapsed_ms = _apex_dynamic_time_to_ms(generic_dyn1[-1])
                self.elapsed_updated_at_ms = received_at_ms

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
                self.lap_progress_updated_at_ms = received_at_ms
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

        # Apex pousse aussi le dernier message de direction de course via
        # msg|msgt|... . Cette voie sert uniquement à l'affichage immédiat :
        # com|| reste la source de vérité et RaceState déduplique les deux flux.
        instant_pattern = re.compile(
            r"(?:^|[\r\n\s])msg\|msgt\|(.*?)(?=(?:[\r\n]|\s+(?:com|grid|init|dyn\d+|gmt|track|r\d+(?:c\d+)?)\|)|$)",
            re.IGNORECASE | re.DOTALL,
        )
        for instant_match in instant_pattern.finditer(frame):
            text = re.sub(r"\s+", " ", instant_match.group(1)).strip()
            if not text:
                continue
            now_ms = int(time.time() * 1000)
            # Une même notification peut être répétée par Apex. On garde une
            # fenêtre courte et on évite les doublons stricts successifs.
            if not self.instant_messages or self.instant_messages[-1].get("text") != text:
                self.instant_messages.append({"text": text, "received_at_ms": now_ms, "flag": "msg"})
                self.instant_messages = self.instant_messages[-20:]
        if "init|" in frame:
            self.init_frames += 1
        if grid:
            self.grid_frames += 1
            self.protocol = "html_grid"
            self.adapter = "HTML Grid Adapter"
            self.confidence = 100
            self.interpreter.set_schema(grid.schema, grid.labels)
            # Dès qu'Apex fournit le schéma HTML réel, il devient la source de vérité.
            # Aucun mapping relatif cX ne doit pouvoir le remplacer ensuite.
            self._apex_schema_locked = True
            self._heuristic_schema_applied = False

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
        if self._lap_anchor is None or self._apex_schema_locked or self.grid_frames:
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
            "schema_source": "apex_data_type" if self._apex_schema_locked else ("heuristic" if self._heuristic_schema_applied else "pending"),
            "column_schema": {str(col): apex_type for col, apex_type in sorted(self.interpreter.schema.items())},
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
            "elapsed_ms": self.elapsed_ms if (self.elapsed_updated_at_ms is not None and now_ms - self.elapsed_updated_at_ms <= 45_000) else None,
            "elapsed_updated_at_ms": self.elapsed_updated_at_ms if (self.elapsed_updated_at_ms is not None and now_ms - self.elapsed_updated_at_ms <= 45_000) else None,
            "elapsed_fresh": bool(self.elapsed_updated_at_ms is not None and now_ms - self.elapsed_updated_at_ms <= 45_000),
            "current_lap": self.current_lap,
            "total_laps": self.total_laps,
            "lap_progress_updated_at_ms": self.lap_progress_updated_at_ms,
            "apex_session_type": self.apex_session_type,
            "dynamic_timing_mode": self.dynamic_timing_mode,
        }
        snap["comments"] = {
            "raw": self.comments_raw,
            "updated_at_ms": self.comments_updated_at_ms,
            "instant": list(self.instant_messages),
        }
        return snap
