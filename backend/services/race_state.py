from copy import deepcopy
from datetime import datetime
from html.parser import HTMLParser
import re
import time

from backend.config import APP_VERSION, load_circuits


class _ApexCommentsParser(HTMLParser):
    """Extrait les entrées <p> de la zone com|| d'Apex Timing."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.entries = []
        self.current = None
        self._capture_time = False
        self._capture_kart = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "p":
            self.current = {"time": "", "kart": "", "text_parts": [], "is_penalty": False}
        elif self.current is not None and tag == "b":
            self._capture_time = True
        elif self.current is not None and tag == "span":
            classes = str(attrs.get("class", "")).split()
            if attrs.get("data-flag") == "penalty":
                self.current["is_penalty"] = True
            if "com_no" in classes:
                self._capture_kart = True

    def handle_endtag(self, tag):
        if tag == "b":
            self._capture_time = False
        elif tag == "span":
            self._capture_kart = False
        elif tag == "p" and self.current is not None:
            self.current["text"] = re.sub(r"\s+", " ", " ".join(self.current["text_parts"])).strip()
            self.entries.append(self.current)
            self.current = None

    def handle_data(self, data):
        if self.current is None:
            return
        value = data.strip()
        if not value:
            return
        if self._capture_time:
            self.current["time"] += value
        elif self._capture_kart:
            self.current["kart"] += value
        else:
            self.current["text_parts"].append(value)


class RaceStateService:
    """Centralise l’état métier et les calculs Qualification, Sprint et Endurance."""

    def __init__(self, state):
        self.state = state
        self.lap_history = {}
        self.lap_results_by_number = {}
        self.last_lap_performance = {}
        self.last_lap_marker = {}
        self.followed_crossing_marker = {}
        self.penalty_first_seen = {}
        self.comment_penalty_history = {}

    def clear_session_history(self):
        self.lap_history.clear()
        self.lap_results_by_number.clear()
        self.last_lap_performance.clear()
        self.last_lap_marker.clear()
        self.followed_crossing_marker.clear()
        self.penalty_first_seen.clear()
        self.comment_penalty_history.clear()

    def reset_state(self, circuit_id):
        self.clear_session_history()
        self.state.update({
            "version": APP_VERSION,
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
            "current_lap": 0,
            "total_laps": 0,
            "session_best": {"driver": "—", "lap": "—"},
            "fastest_last_lap": {"driver": "—", "lap": "—"},
            "drivers": [],
            "penalties": [],
            "comment_penalties": [],
            "quick_change": [],
            "qualif_crossing": None,
            "generic_alert": None,
        })
        self.state["live"] = {
            "status": "connecting",
            "messages": 0,
            "last_message_at": None,
            "last_error": None,
            "websocket_url": None,
            "parsed_updates": 0,
            "last_frame_preview": None,
        }

    def time_to_seconds(self, value):
        try:
            mins, secs = value.split(":")
            return int(mins) * 60 + float(secs)
        except Exception:
            return 9999.0


    def format_lap_seconds(self, seconds):
        if seconds is None or seconds >= 9999:
            return "—"
        minutes = int(seconds // 60)
        remaining = seconds - minutes * 60
        return f"{minutes}:{remaining:06.3f}" if minutes else f"{remaining:.3f}"


    def fmt_delta(self, seconds):
        if abs(seconds) < 0.0005:
            return "0.000 s"
        return f"{seconds:+.3f} s"


    def race_gap_seconds(self, value):
        raw = str(value or "").strip().replace(",", ".")
        if not raw or raw in {"—", "--"}:
            return 0.0
        if "lap" in raw.lower() or "tour" in raw.lower():
            return None
        raw = raw.lstrip("+").rstrip(" s")
        try:
            parts = [float(part) for part in raw.split(":")]
        except ValueError:
            return None
        if len(parts) == 1:
            return parts[0]
        if len(parts) == 2:
            return parts[0] * 60 + parts[1]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        return None

    def direct_race_gap(self, behind, ahead):
        if not behind or not ahead:
            return None
        behind_gap = self.race_gap_seconds(behind.get("gap"))
        ahead_gap = 0.0 if ahead.get("pos") == 1 else self.race_gap_seconds(ahead.get("gap"))
        if behind_gap is not None and ahead_gap is not None and behind_gap >= ahead_gap:
            return behind_gap - ahead_gap
        interval = self.race_gap_seconds(behind.get("interval"))
        return interval

    @staticmethod
    def race_lap_interval(value):
        raw = str(value or "").strip()
        match = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:lap|laps|tour|tours)", raw, re.I)
        if not match:
            return None
        try:
            laps = float(match.group(1).replace(",", "."))
        except ValueError:
            return None
        return laps if laps > 0 else None

    def direct_race_gap_display(self, behind, ahead, sign):
        if not behind or not ahead:
            return "--"
        laps = self.race_lap_interval(behind.get("interval"))
        if laps is not None:
            shown = str(int(laps)) if laps.is_integer() else str(laps).replace(".", ",")
            label = "tour" if laps == 1 else "tours"
            return f"{sign}{shown} {label}"
        gap = self.direct_race_gap(behind, ahead)
        return f"{sign}{gap:.3f}" if gap is not None else "--"


    def driver_by_name(self, name):
        return next((d for d in self.state["drivers"] if d["driver"] == name), None)


    def _format_remaining(self, ms):
        if ms is None:
            return "—"
        total = max(0, int(ms // 1000))
        hours, rem = divmod(total, 3600)
        minutes, seconds = divmod(rem, 60)
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}" if hours else f"{minutes:02d}:{seconds:02d}"


    def _comment_penalties(self, snapshot, drivers):
        """Construit l'historique depuis com||, source officielle des commentaires Apex.

        Chaque entrée de pénalité est identifiée par son heure Apex, son kart et son
        texte. Le numéro de kart est ensuite rapproché du pilote/équipe courant.
        """
        raw = str((snapshot.get("comments") or {}).get("raw") or "").strip()
        if raw:
            parser = _ApexCommentsParser()
            try:
                parser.feed(raw)
                parser.close()
            except Exception:
                parser.entries = []

            drivers_by_kart = {
                str(d.get("apex") or "").strip(): str(d.get("driver") or "—").strip()
                for d in drivers
                if str(d.get("apex") or "").strip() not in {"", "—"}
            }
            for entry in parser.entries:
                if not entry.get("is_penalty"):
                    continue
                shown_time = str(entry.get("time") or "").strip()[:5] or datetime.now().strftime("%H:%M")
                kart = str(entry.get("kart") or "").strip()
                penalty = str(entry.get("text") or "").strip() or "Pénalité"
                driver = drivers_by_kart.get(kart, f"Kart {kart}" if kart else "—")
                # L'heure est le pivot demandé pour éviter de rejouer une pénalité.
                # Kart et texte sécurisent le cas rare de plusieurs sanctions la même minute.
                key = f"{shown_time}|{kart}|{penalty}"
                self.comment_penalty_history.setdefault(key, {
                    "id": key,
                    "driver": driver,
                    "kart": kart,
                    "penalty": penalty,
                    "comment": penalty,
                    "time": shown_time,
                    "at": datetime.now().isoformat(timespec="seconds"),
                })

        values = list(self.comment_penalty_history.values())
        values.sort(key=lambda item: (item.get("time", ""), item.get("at", "")), reverse=True)
        return values

    def sync_state_from_race(self, snapshot, interpreted_events=None):
        """Injecte le modèle unifié Apex dans l'interface moderne Velocity."""
        previous_drivers = {d.get("driver"): d for d in self.state.get("drivers", [])}
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
            lap_seconds = self.time_to_seconds(last)
            marker = (lap_number, last)
            # Une valeur de dernier tour n'est ajoutée qu'une fois, au passage d'un nouveau tour.
            if lap_seconds < 9999 and self.last_lap_marker.get(history_key) != marker:
                previous_laps = list(self.lap_history.get(history_key, []))
                previous_best_seconds = min(previous_laps) if previous_laps else None
                improved_personal_best = (
                    previous_best_seconds is None
                    or lap_seconds < previous_best_seconds - 0.0005
                )
                self.last_lap_performance[history_key] = {
                    "marker": marker,
                    "improved_personal_best": improved_personal_best,
                    "previous_best_seconds": previous_best_seconds,
                }
                self.lap_history.setdefault(history_key, []).append(lap_seconds)
                self.lap_history[history_key] = self.lap_history[history_key][-20:]
                # Mémorise le chrono avec le numéro du tour afin que le cartouche Sprint
                # affiche le meilleur pilote du dernier tour réellement terminé, sans
                # mélanger des chronos provenant de tours différents.
                if isinstance(lap_number, int) and lap_number > 0:
                    self.lap_results_by_number.setdefault(lap_number, {})[history_key] = {
                        "driver": driver_name,
                        "lap": last,
                        "seconds": lap_seconds,
                    }
                    # Limite l'historique aux 10 derniers numéros de tour.
                    for old_lap in sorted(self.lap_results_by_number)[:-10]:
                        self.lap_results_by_number.pop(old_lap, None)
                self.last_lap_marker[history_key] = marker
            recent_five = self.lap_history.get(history_key, [])[-5:]
            pace5_seconds = sum(recent_five) / len(recent_five) if recent_five else None
            pace5 = self.format_lap_seconds(pace5_seconds) if pace5_seconds is not None else "—"
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
                "pit_timer": row.get("pit_timer") or None,
                "track_timer": row.get("track_timer") or None,
                "apex_row": row.get("row"),
                "last_improved_personal_best": bool(
                    self.last_lap_performance.get(history_key, {}).get("marker") == marker
                    and self.last_lap_performance.get(history_key, {}).get("improved_personal_best")
                ),
            })
        live_drivers.sort(key=lambda d: (d["pos"] == 999, d["pos"]))
        if live_drivers:
            self.state["drivers"] = live_drivers

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
                    first_seen = self.penalty_first_seen.setdefault(
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
            for penalty_key in list(self.penalty_first_seen):
                if penalty_key not in active_penalty_keys:
                    self.penalty_first_seen.pop(penalty_key, None)
            apex_penalties.sort(key=lambda item: item.get("at", ""), reverse=True)
            self.state["penalties"] = apex_penalties
            # Le Focus Sprint utilise exclusivement la zone Commentaires Apex.
            self.state["comment_penalties"] = self._comment_penalties(snapshot, live_drivers)
            # Mode AUTO : tant qu'aucun pilote n'a été sélectionné, la ligne 1 suit le P1.
            # Mode LOCK : après un clic, on conserve impérativement le même pilote,
            # même si une trame Apex intermédiaire ne contient pas sa ligne.
            if not self.state.get("followed_locked"):
                self.state["followed_driver"] = live_drivers[0]["driver"]

            followed_name = self.state.get("followed_driver")
            followed_live = next((d for d in live_drivers if d.get("driver") == followed_name), None)
            if followed_live:
                self.state["followed_snapshot"] = deepcopy(followed_live)
            valid_best = [d for d in live_drivers if self.time_to_seconds(d["best"]) < 9999]
            if valid_best:
                leader = min(valid_best, key=lambda d: self.time_to_seconds(d["best"]))
                self.state["session_best"] = {"driver": leader["driver"], "lap": leader["best"]}
            # Sprint : meilleur chrono du tour précédent. Apex met les lignes à jour
            # au fil des passages ; comparer simplement la colonne « dernier tour »
            # mélange donc parfois plusieurs numéros de tour. On privilégie ici le
            # dernier numéro de tour entièrement dépassé par le leader.
            lap_numbers = [d.get("laps") for d in live_drivers if isinstance(d.get("laps"), int)]
            target_lap = max(lap_numbers) - 1 if lap_numbers and max(lap_numbers) > 1 else None
            lap_results = list(self.lap_results_by_number.get(target_lap, {}).values()) if target_lap else []
            if lap_results:
                fastest = min(lap_results, key=lambda item: item["seconds"])
                self.state["fastest_last_lap"] = {"driver": fastest["driver"], "lap": fastest["lap"]}
            else:
                # Repli utile au démarrage de séance, avant qu'un tour complet soit disponible.
                valid_last = [d for d in live_drivers if self.time_to_seconds(d["last"]) < 9999]
                if valid_last:
                    fastest = min(valid_last, key=lambda d: self.time_to_seconds(d["last"]))
                    self.state["fastest_last_lap"] = {"driver": fastest["driver"], "lap": fastest["last"]}

            # En qualification, le popup est lié au pilote choisi par l'utilisateur.
            # Son marqueur courant est mémorisé au clic, puis le prochain changement
            # (nombre de tours ou dernier chrono) correspond à un passage sur la ligne.
            followed_name = self.state.get("followed_driver")
            followed_now = next((d for d in live_drivers if d.get("driver") == followed_name), None)
            if self.state.get("mode") == "qualification" and followed_now:
                new_marker = (followed_now.get("laps"), followed_now.get("last"))
                old_marker = self.followed_crossing_marker.get(followed_name)
                if old_marker is None:
                    self.followed_crossing_marker[followed_name] = new_marker
                elif new_marker != old_marker:
                    self.followed_crossing_marker[followed_name] = new_marker
                    if self.time_to_seconds(followed_now.get("last")) < 9999:
                        # Le popup compare le tour qui vient d'être réalisé aux meilleurs
                        # temps absolus de la session.
                        ranking = sorted(valid_best, key=lambda d: self.time_to_seconds(d["best"]))
                        leader = ranking[0] if ranking else None
                        second = ranking[1] if len(ranking) > 1 else None
                        last_sec = self.time_to_seconds(followed_now["last"])
                        leader_sec = self.time_to_seconds(leader["best"]) if leader else 9999

                        # Cas P1 : le tour franchi est bien le nouveau meilleur temps
                        # absolu. On affiche alors l'avance sur le deuxième pilote.
                        is_new_session_best = bool(
                            leader
                            and leader.get("driver") == followed_name
                            and abs(last_sec - leader_sec) < 0.0005
                        )
                        if is_new_session_best and second:
                            reference_driver = second.get("driver") or "—"
                            delta_value = last_sec - self.time_to_seconds(second.get("best"))
                        elif is_new_session_best:
                            reference_driver = "—"
                            delta_value = 0.0
                        else:
                            reference_driver = leader.get("driver") if leader else "—"
                            delta_value = last_sec - leader_sec if leader else 0.0

                        self.state["qualif_crossing"] = {
                            "event_id": datetime.now().isoformat(timespec="milliseconds"),
                            "position": followed_now["pos"],
                            "delta": self.fmt_delta(delta_value),
                            "reference_driver": reference_driver,
                            "is_session_best": is_new_session_best,
                        }

        session = snapshot.get("session", {})
        now_ms = int(time.time() * 1000)
        updated_at_ms = session.get("remaining_updated_at_ms")
        try:
            countdown_is_fresh = bool(
                updated_at_ms is not None
                and now_ms - int(updated_at_ms) <= 45_000
            )
        except (TypeError, ValueError):
            countdown_is_fresh = False

        # Une ancienne grille mémorisée ne suffit pas à prouver qu'une course est
        # encore active. Le compte à rebours n'est affiché que si Apex vient de le
        # rafraîchir et si la grille contient au moins une donnée sportive réelle.
        def _has_sporting_data(driver: dict) -> bool:
            laps_raw = driver.get("laps")
            try:
                laps_value = int(laps_raw or 0)
            except (TypeError, ValueError):
                laps_value = 0
            return bool(
                driver.get("position") is not None
                or laps_value > 0
                or driver.get("last_lap")
                or driver.get("best_lap")
            )

        has_active_grid = any(_has_sporting_data(d) for d in live_drivers)
        end_at_ms = session.get("remaining_end_at_ms") if countdown_is_fresh and has_active_grid else None
        current_remaining_ms = None
        if end_at_ms is not None:
            try:
                current_remaining_ms = max(0, int(end_at_ms) - now_ms)
            except (TypeError, ValueError):
                current_remaining_ms = None
        if current_remaining_ms is None and countdown_is_fresh and has_active_grid:
            current_remaining_ms = session.get("remaining_ms")
        self.state["time_remaining"] = self._format_remaining(current_remaining_ms)
        self.state["time_remaining_ms"] = current_remaining_ms
        self.state["time_remaining_updated_at_ms"] = now_ms if current_remaining_ms is not None else None
        self.state["time_remaining_end_at_ms"] = end_at_ms

        # Apex ne fournit pas toujours un objectif de tours. Lorsque ce total est
        # disponible, on affiche les tours restants ; sinon on affiche le nombre de
        # tours actuellement couverts par le leader, afin de ne jamais inventer une
        # valeur de tours restants.
        leader_laps = max(
            (int(d.get("laps") or 0) for d in live_drivers if str(d.get("laps") or "").isdigit()),
            default=0,
        )
        session_total_laps = session.get("total_laps") or self.state.get("total_laps") or 0
        try:
            session_total_laps = int(session_total_laps)
        except (TypeError, ValueError):
            session_total_laps = 0
        if session_total_laps > 0:
            self.state["total_laps"] = session_total_laps
            # Pour une course au nombre de tours, dyn1|text|Giro X/Y est plus
            # fiable que le compteur individuel du leader, notamment au départ
            # et pendant les trames partielles.
            session_current_lap = session.get("current_lap")
            try:
                session_current_lap = int(session_current_lap)
            except (TypeError, ValueError):
                session_current_lap = leader_laps
            completed_laps = min(session_total_laps, max(0, session_current_lap))
            self.state["current_lap"] = completed_laps
            self.state["apex_laps_remaining"] = f"{completed_laps}/{session_total_laps} TOURS"
            # Une cible de tours explicite prévaut sur tout ancien compte à rebours
            # encore présent dans le cache de la session précédente.
            self.state["time_remaining"] = "—"
            self.state["time_remaining_ms"] = None
            self.state["time_remaining_updated_at_ms"] = None
            self.state["time_remaining_end_at_ms"] = None
        elif leader_laps > 0:
            self.state["current_lap"] = leader_laps
            self.state["apex_laps_remaining"] = f"TOUR {leader_laps}"
        else:
            self.state["current_lap"] = 0
            self.state["apex_laps_remaining"] = "—"

        for event in interpreted_events or []:
            if event.get("type") != "pit_in":
                continue
            row_id = event.get("row")
            entrant = next((d for d in live_drivers if d.get("apex_row") == row_id), None)
            if self.state.get("mode") == "endurance" and entrant and isinstance(entrant.get("pos"), int) and entrant["pos"] <= 8:
                self.state["generic_alert"] = {
                    "event_id": event.get("at") or datetime.now().isoformat(timespec="milliseconds"),
                    "kind": "top8_pit_entry",
                    "title": "🚨 ALERTE",
                    "team": entrant["driver"],
                    "position": entrant["pos"],
                }


    def payload(self):
        data = deepcopy(self.state)
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
                if self.time_to_seconds(d.get("best")) < 9999
            ]
            if valid_best_drivers and self.time_to_seconds(followed.get("best")) < 9999:
                absolute_best = min(
                    valid_best_drivers,
                    key=lambda d: self.time_to_seconds(d.get("best")),
                )
                session_best_sec = self.time_to_seconds(absolute_best.get("best"))
                followed_best_sec = self.time_to_seconds(followed.get("best"))
                data["session_best"] = {
                    "driver": absolute_best.get("driver"),
                    "lap": absolute_best.get("best"),
                }
                data["qualif_delta"] = self.fmt_delta(max(0.0, followed_best_sec - session_best_sec))
            else:
                data["qualif_delta"] = "--"
            if followed["pos"] == 1:
                p2 = next((d for d in data["drivers"] if d["pos"] == 2), None)
                delta_display = self.direct_race_gap_display(p2, followed, "+")
                data["sprint_delta"] = {
                    "reference": "P2",
                    "display": delta_display,
                    "detail": "Leader sur P2",
                }
            else:
                ahead = next((d for d in data["drivers"] if d["pos"] == followed["pos"] - 1), None)
                delta_display = self.direct_race_gap_display(followed, ahead, "-")
                data["sprint_delta"] = {
                    "reference": f"P{ahead['pos']}" if ahead else "--",
                    "display": delta_display,
                    "detail": f"Écart avec P{ahead['pos']}" if ahead else "--",
                }
        else:
            data["qualif_delta"] = "--"
            data["sprint_delta"] = {"reference": "--", "display": "--", "detail": "Pilote non trouvé"}

        pace = sorted([d for d in data["drivers"] if self.time_to_seconds(d.get("pace5")) < 9999], key=lambda d: self.time_to_seconds(d["pace5"]))[:8]
        for i, d in enumerate(pace, 1):
            d["pace_rank"] = i
        data["pace_top8"] = pace
        return data
