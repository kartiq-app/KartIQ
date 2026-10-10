"""Convertit les tours/pits déjà stockés par le Recorder en Score Relais Analyzer.

Une seule formule de référence : backend.services.relay_score_engine.score_compute.
Aucune requête HTTP STATS / aucune dépendance navigateur.
"""
from __future__ import annotations

from backend.services.relay_score_engine import relay_slices, score_compute


def compute_recorder_relay_matrix(buckets):
    teams = []
    for row_id, source in sorted(buckets.items()):
        laps = []
        seen = set()
        for lap in sorted(source.get("laps") or [], key=lambda item: int(item.get("lap") or 0)):
            number = int(lap.get("lap") or 0)
            seconds = float(lap.get("seconds") or 0)
            if number <= 0 or seconds <= 0 or number in seen:
                continue
            seen.add(number)
            laps.append({"lap": number, "lapTime": round(seconds * 1000),
                         "sector1": int(lap.get("sector1") or 0),
                         "sector2": int(lap.get("sector2") or 0),
                         "sector3": int(lap.get("sector3") or 0)})
        unique_pits = {}
        for pit in source.get("pits") or []:
            if str(pit.get("event") or "").upper() != "IN":
                continue
            number = int(pit.get("lap") or 0)
            if number <= 0:
                continue
            stop = int(pit.get("stop") or 0)
            key = (number, stop)
            unique_pits[key] = {"lap": number, "stop": stop,
                                "driverName": str(pit.get("pilot") or "")}
        pits = sorted(unique_pits.values(), key=lambda x: (x["lap"], x["stop"]))
        for index, pit in enumerate(pits, 1):
            if pit["stop"] <= 0:
                pit["stop"] = index
        driver = {"apex_row": int(row_id), "driver": source.get("team") or "",
                  "pilot": source.get("pilot") or "", "kart": source.get("kart") or ""}
        teams.append({"driver": driver, "relays": relay_slices(laps, pits, driver),
                      "_lap_count": len(laps), "_pit_count": len(pits)})
    if not teams:
        return {"maxRelay": 0, "teams": []}
    matrix = score_compute(teams)
    # Même les mini-relais sans note (<3 tours) doivent apparaître dans
    # l'historique et préserver la numérotation de colonnes Analyzer.
    result_by_row = {int(team["apex_row"]): team for team in matrix["teams"]}
    for original in teams:
        row = int(original["driver"]["apex_row"])
        item = result_by_row.get(row)
        if item is None:
            continue
        existing = {int(cell["relay_index"]) for cell in item.get("relays") or []}
        for relay in original["relays"]:
            index = int(relay["index"])
            if index in existing:
                continue
            item["relays"].append({"relay_index": index, "score": None,
                                   "relay": {key: value for key, value in relay.items()
                                             if key in ("index", "from", "to", "laps", "average", "best3", "consistency", "pilot")}})
        item["relays"].sort(key=lambda cell: int(cell["relay_index"]))
    matrix["maxRelay"] = max((int(relay["index"]) for team in teams for relay in team["relays"]), default=0)
    matrix["source"] = "session-relay-stats"
    return matrix
