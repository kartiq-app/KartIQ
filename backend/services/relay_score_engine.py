"""Velocity Score Relais — moteur serveur pour longues endurances.

V7.2.1773:
- récupère les STATS Apex côté serveur ;
- découpe les tours en relais ;
- applique la même logique Score Relais que le front V7.2.1772 ;
- renvoie uniquement un résultat compact au navigateur.

La qualification historique n'est volontairement pas recherchée par ce moteur :
elle reste un enrichissement facultatif et ne doit jamais bloquer une endurance.
"""
from __future__ import annotations

from dataclasses import dataclass
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
import math
import re
import statistics
import time
import unicodedata


def finite(v):
    return isinstance(v, (int, float)) and math.isfinite(v)


def mean(values):
    vals = [float(v) for v in values if finite(v)]
    return sum(vals) / len(vals) if vals else None


def median(values):
    vals = sorted(float(v) for v in values if finite(v))
    if not vals:
        return None
    n = len(vals)
    m = n // 2
    return vals[m] if n % 2 else (vals[m - 1] + vals[m]) / 2


def stddev(values):
    vals = [float(v) for v in values if finite(v)]
    if len(vals) < 2:
        return None
    avg = sum(vals) / len(vals)
    return math.sqrt(sum((v - avg) ** 2 for v in vals) / len(vals))


def robust_distribution(values):
    vals = [float(v) for v in values if finite(v)]
    if not vals:
        return {"median": None, "mad": None, "sigma": None}
    med = median(vals)
    mad = median([abs(v - med) for v in vals])
    sigma = 1.4826 * mad if finite(mad) and mad > 1e-9 else stddev(vals)
    if not finite(sigma) or sigma <= 1e-9:
        sigma = None
    return {"median": med, "mad": mad, "sigma": sigma}


def percentile_score(value, values, lower_is_better=True):
    clean = sorted(float(v) for v in values if finite(v))
    if not finite(value) or not clean:
        return 50
    if len(clean) == 1:
        return 100
    lower = sum(1 for v in clean if v < value)
    equal = sum(1 for v in clean if v == value)
    mid_rank = lower + (equal - 1) / 2
    percentile = mid_rank / max(1, len(clean) - 1)
    # JS Math.round for positive values.
    raw = (1 - percentile if lower_is_better else percentile) * 100
    return int(math.floor(raw + 0.5))


def transition_signal(delta, values):
    if not finite(delta):
        return {"z": None, "median": None, "sigma": None}
    dist = robust_distribution(values)
    z = (delta - dist["median"]) / dist["sigma"] if finite(dist["sigma"]) else 0
    return {"z": z, "median": dist["median"], "sigma": dist["sigma"]}


def transition_weights(z, has_transition=True):
    if not has_transition or not finite(z):
        return {"pace": .60, "transition": 0, "potential": .20, "consistency": .133333, "sample": .066667}
    strength = max(0, min(1, (abs(z) - .5) / 1.5))
    return {"pace": .45 - .20 * strength, "transition": .25 + .20 * strength, "potential": .15, "consistency": .10, "sample": .05}


def normalize_pilot(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def protocol_number(value):
    token = re.sub(r"[a-zA-Z]", "", str(value or ""))
    m = re.match(r"^[+-]?\d+", token.strip())
    return int(m.group(0)) if m else 0


class _DriverParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.drivers = []
        self.root = {}
        self._got_root = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if not self._got_root:
            self.root = attrs
            self._got_root = True
        if tag.lower() == "driver":
            driver_id = protocol_number(attrs.get("id"))
            name = str(attrs.get("name") or "").strip()
            if driver_id and name:
                self.drivers.append({
                    "driverId": driver_id,
                    "name": name,
                    "current": str(attrs.get("current") or "") == "1",
                })


def parse_driver_info(raw, row_id):
    marker = f"D{row_id}.INF"
    line = next((ln.strip() for ln in str(raw or "").splitlines() if ln.strip().startswith(marker)), "")
    start = line.find("<")
    if start < 0:
        return {"driverName": "", "kartNumber": "", "drivers": []}
    parser = _DriverParser()
    try:
        parser.feed(line[start:])
    except Exception:
        return {"driverName": "", "kartNumber": "", "drivers": []}
    return {
        "driverName": str(parser.root.get("name") or "").strip(),
        "kartNumber": str(parser.root.get("num") or "").strip(),
        "drivers": parser.drivers,
    }


def parse_laps(raw, row_id):
    marker = f"D{row_id}.L"
    by_lap = {}
    for line in str(raw or "").splitlines():
        value = line.strip()
        if not value.startswith(marker):
            continue
        dot = value.find(".")
        h = value.find("#", dot + 1)
        if dot < 0 or h < 0:
            continue
        lap_token = value[dot + 1:h]
        fields = value[h + 1:].split("|")
        if len(fields) < 4:
            continue
        lap = protocol_number(re.sub(r"^L", "", lap_token, flags=re.I))
        if not lap:
            continue
        by_lap[lap] = {
            "lap": lap,
            "sector1": protocol_number(fields[0]),
            "sector2": protocol_number(fields[1]),
            "sector3": protocol_number(fields[2]),
            "lapTime": protocol_number(fields[3]),
        }
    return sorted(by_lap.values(), key=lambda x: x["lap"], reverse=True)


def parse_pits(raw, row_id):
    team_info = parse_driver_info(raw, row_id)
    names = {int(d["driverId"]): d["name"] for d in team_info["drivers"]}
    marker = f"D{row_id}.P"
    by_stop = {}
    for line in str(raw or "").splitlines():
        value = line.strip()
        if not value.startswith(marker):
            continue
        h = value.find("#", len(marker))
        if h < 0:
            continue
        marker_stop = protocol_number(value[len(marker):h])
        fields = [x.strip() for x in value[h + 1:].split("|")]
        if not marker_stop or len(fields) < 4:
            continue
        stop = protocol_number(fields[0]) or marker_stop
        driver_id = protocol_number(fields[7]) if len(fields) > 7 else 0
        by_stop[stop] = {
            "stop": stop,
            "lap": protocol_number(fields[1]) if len(fields) > 1 else 0,
            "pitInMs": protocol_number(fields[2]) if len(fields) > 2 else 0,
            "pitOutMs": protocol_number(fields[3]) if len(fields) > 3 else 0,
            "pitTimeMs": protocol_number(fields[4]) if len(fields) > 4 else 0,
            "trackTimeMs": protocol_number(fields[5]) if len(fields) > 5 else 0,
            "relayLapsNumber": protocol_number(fields[6]) if len(fields) > 6 else 0,
            "driverId": driver_id,
            "driverTotalTimeMs": protocol_number(fields[8]) if len(fields) > 8 else 0,
            "driverName": names.get(driver_id, ""),
        }
    return sorted(by_stop.values(), key=lambda x: x["stop"], reverse=True)


def sector_value_ms(lap, key):
    """Retourne un chrono secteur Apex plausible en millisecondes."""
    try:
        value = int(lap.get(key) or 0)
        lap_time = int(lap.get("lapTime") or 0)
    except Exception:
        return None
    # Les secteurs karting observés sont largement > 1 s. Ce garde-fou élimine
    # les valeurs parasites type 0.47 s sans coder de borne propre à un circuit.
    if value < 1000:
        return None
    if lap_time > 0 and value >= lap_time:
        return None
    return value


def sector_best_from_laps(laps):
    out = {"s1": None, "s2": None, "s3": None}
    mapping = {"s1": "sector1", "s2": "sector2", "s3": "sector3"}
    for target, source in mapping.items():
        values = [sector_value_ms(lap, source) for lap in (laps or [])]
        values = [v for v in values if v is not None]
        out[target] = min(values) if values else None
    return out


def sector_count_from_laps(laps):
    best = sector_best_from_laps(laps)
    if best.get("s3") is not None:
        return 3
    if best.get("s2") is not None:
        return 2
    if best.get("s1") is not None:
        return 1
    return 0


def team_sector_stats(team):
    """Agrégats secteurs dérivés des mêmes STATS Apex que SCORE RELAIS.

    - currentRelay : uniquement le relais en cours (donc reset après PIT) ;
    - teamBest : historique équipe complet ;
    - aucun nouvel appel Apex n'est nécessaire.
    """
    relays = list(team.get("relays") or [])
    team_laps = []
    for relay in relays:
        team_laps.extend(relay.get("sectorLapPoints") or [])
    current = relays[-1] if relays else None
    current_laps = list((current or {}).get("sectorLapPoints") or [])
    team_best = sector_best_from_laps(team_laps)
    current_best = sector_best_from_laps(current_laps)
    count = sector_count_from_laps(team_laps)
    best_laps = [int(lap.get("lapTime") or 0) for lap in team_laps if int(lap.get("lapTime") or 0) > 0]
    return {
        "sectorCount": count or None,
        "currentRelayIndex": int((current or {}).get("index") or 0) or None,
        "sectorBestCurrentRelay": current_best,
        "sectorBestTeam": team_best,
        "bestLapTeamMs": min(best_laps) if best_laps else None,
    }


def relay_slices(laps, pits, driver):
    pit_laps_set = {int(p["lap"]) for p in pits if p.get("lap")}
    clean = [
        {**l, "seconds": float(l["lapTime"]) / 1000}
        for l in laps
        if l.get("lap", 0) > 0 and l.get("lapTime", 0) > 0 and int(l["lap"]) not in pit_laps_set
    ]
    clean.sort(key=lambda x: int(x["lap"]))
    chronological_pits = sorted(pits, key=lambda p: int(p.get("stop") or 0))
    pit_laps = sorted(int(p["lap"]) for p in chronological_pits if finite(float(p.get("lap") or 0)))
    bounds = [0] + pit_laps + [math.inf]
    relays = []
    for i in range(len(bounds) - 1):
        segment = [l for l in clean if l["lap"] > bounds[i] and l["lap"] < bounds[i + 1]]
        if len(segment) > 1:
            segment = segment[1:]
        raw_values = [float(l["seconds"]) for l in segment if finite(float(l["seconds"]))]
        if not raw_values:
            continue
        local_med = median(raw_values)
        values = [v for v in raw_values if not finite(local_med) or v <= local_med + 5]
        scored = values if len(values) >= 3 else raw_values
        ordered = sorted(scored)
        top3 = ordered[:3]
        completed_pilot = str(chronological_pits[i].get("driverName") or "").strip() if i < len(chronological_pits) else ""
        current_pilot = str(driver.get("pilot") or "").strip() if i == len(bounds) - 2 else ""
        relays.append({
            "index": i + 1,
            "from": segment[0]["lap"] if segment else None,
            "to": segment[-1]["lap"] if segment else None,
            "laps": len(scored),
            "average": mean(scored),
            "best3": mean(top3),
            "consistency": stddev(scored),
            "values": scored,
            "lapPoints": [{"lap": int(l["lap"]), "seconds": float(l["seconds"])} for l in segment],
            "sectorLapPoints": [
                {
                    "lap": int(l["lap"]),
                    "lapTime": int(l.get("lapTime") or 0),
                    "sector1": int(l.get("sector1") or 0),
                    "sector2": int(l.get("sector2") or 0),
                    "sector3": int(l.get("sector3") or 0),
                }
                for l in segment
            ],
            "pilot": completed_pilot or current_pilot or None,
        })
    return relays


def all_lap_points(teams):
    by_lap = defaultdict(list)
    team_index = {}
    points = []
    for ti, team in enumerate(teams):
        idx = defaultdict(list)
        team_index[ti] = idx
        for relay in team["relays"]:
            for point in relay.get("lapPoints", []):
                lap, seconds = point.get("lap"), point.get("seconds")
                if not finite(float(lap or 0)) or not finite(float(seconds or 0)) or seconds <= 0:
                    continue
                item = {"team_index": ti, "relay_index": relay["index"], "lap": int(lap), "seconds": float(seconds)}
                points.append(item)
                by_lap[int(lap)].append(item)
                idx[int(lap)].append((relay, point))
    return points, by_lap, team_index


def temporal_reference(by_lap, target, radius=1):
    if not finite(float(target or 0)):
        return None

    def collect(r):
        vals = []
        for current in range(math.floor(target - r), math.ceil(target + r) + 1):
            for item in by_lap.get(current, []):
                if abs(item["lap"] - target) <= r and finite(item["seconds"]):
                    vals.append(item["seconds"])
        return vals

    cohort = collect(radius)
    if len(cohort) < 6:
        cohort = collect(2)
    if len(cohort) < 4:
        return None
    dist = robust_distribution(cohort)
    med = dist["median"]
    if not finite(med):
        return None
    tol = max(5, 4 * dist["sigma"] if finite(dist["sigma"]) else 5)
    clean = [v for v in cohort if abs(v - med) <= tol]
    base = clean if len(clean) >= 4 else cohort
    spread = robust_distribution(base)
    return {"reference": median(base), "spread": spread["sigma"] or 0, "count": len(base)}


def pilot_key(relay):
    return normalize_pilot(relay.get("pilot") or "")


def build_pilot_baselines(teams, by_lap):
    buckets = {}
    for team in teams:
        for relay in team["relays"]:
            key = pilot_key(relay)
            if not key:
                continue
            deltas = []
            for point in relay.get("lapPoints", []):
                ref = temporal_reference(by_lap, point["lap"])
                if ref and finite(point["seconds"]):
                    deltas.append(point["seconds"] - ref["reference"])
            if len(deltas) < 3:
                continue
            item = buckets.setdefault(key, {"values": [], "relays": set()})
            item["values"].extend(deltas)
            item["relays"].add(int(relay["index"]))
    return {k: {"median": median(v["values"]), "samples": len(v["values"]), "relays": len(v["relays"])} for k, v in buckets.items() if v["values"]}


def relative_profile(relay, by_lap, pilot_baselines):
    pts = []
    for point in relay.get("lapPoints", []):
        ref = temporal_reference(by_lap, point["lap"])
        seconds = point["seconds"]
        if not ref or not finite(seconds):
            continue
        pts.append({"lap": point["lap"], "seconds": seconds, "reference": ref["reference"], "spread": ref["spread"], "count": ref["count"], "delta": seconds - ref["reference"]})
    if len(pts) < 3:
        return None
    refs = [p["reference"] for p in pts]
    ref_dist = robust_distribution(refs)
    ref_swing = max(refs) - min(refs)
    relative_raw = [p["delta"] for p in pts]
    pk = pilot_key(relay)
    baseline = pilot_baselines.get(pk)
    use = bool(pk and baseline and baseline["samples"] >= 12 and baseline["relays"] >= 2 and finite(baseline["median"]))
    relative = [v - (baseline["median"] if use else 0) for v in relative_raw]
    ordered = sorted(relative)
    spreads = [p["spread"] for p in pts if finite(p["spread"])]
    dynamic = ref_swing >= 2.5 or (finite(ref_dist["sigma"]) and ref_dist["sigma"] >= 1.0)
    return {
        "dynamic": dynamic,
        "average": mean(relative),
        "best3": mean(ordered[:3]),
        "consistency": stddev(relative),
        "laps": len(relative),
        "referenceSwing": ref_swing,
        "gridSpread": median(spreads) if spreads else 0,
        "pilotBaselineApplied": use,
        "pilotBaselineSamples": baseline["samples"] if use else 0,
    }


def window_peer_metrics(teams, relay, by_lap, pilot_baselines, team_index):
    start, end = relay.get("from"), relay.get("to")
    if not finite(float(start or 0)) or not finite(float(end or 0)):
        return []
    out = []
    for ti, team in enumerate(teams):
        window = []
        idx = team_index.get(ti, {})
        for lap in range(math.floor(start), math.ceil(end) + 1):
            for team_relay, point in idx.get(lap, []):
                seconds = point.get("seconds")
                if lap < start or lap > end or not finite(seconds):
                    continue
                ref = temporal_reference(by_lap, lap)
                if not ref:
                    continue
                pk = pilot_key(team_relay)
                baseline = pilot_baselines.get(pk)
                use = bool(pk and baseline and baseline["samples"] >= 12 and baseline["relays"] >= 2 and finite(baseline["median"]))
                window.append({
                    "seconds": seconds,
                    "reference": ref["reference"],
                    "spread": ref["spread"],
                    "delta": seconds - ref["reference"] - (baseline["median"] if use else 0),
                    "pilotBaselineApplied": use,
                })
        if len(window) < 3:
            continue
        raw = [p["seconds"] for p in window]
        raw_med = median(raw)
        stable = [v for v in raw if not finite(raw_med) or v <= raw_med + 5]
        raw_scored = stable if len(stable) >= 3 else raw
        refs = [p["reference"] for p in window]
        rd = robust_distribution(refs)
        swing = max(refs) - min(refs)
        dynamic = swing >= 2.5 or (finite(rd["sigma"]) and rd["sigma"] >= 1.0)
        relative = [p["delta"] for p in window]
        values = relative if dynamic else raw_scored
        ordered = sorted(values)
        out.append({
            "team_index": ti,
            "average": mean(values),
            "best3": mean(ordered[:3]),
            "consistency": stddev(values),
            "laps": len(values),
            "dynamic": dynamic,
            "rawAverage": mean(raw_scored),
            "profile": {
                "dynamic": dynamic,
                "average": mean(relative),
                "best3": mean(sorted(relative)[:3]),
                "consistency": stddev(relative),
                "laps": len(relative),
                "referenceSwing": swing,
                "gridSpread": median([p["spread"] for p in window if finite(p["spread"])]) or 0,
                "pilotBaselineApplied": any(p["pilotBaselineApplied"] for p in window),
            },
        })
    return out


def score_compute(teams):
    max_relay = max([len(t["relays"]) for t in teams] + [0])
    _, by_lap, team_index = all_lap_points(teams)
    pilot_baselines = build_pilot_baselines(teams, by_lap)
    transitions = []

    # Small memo: the same relay windows are requested repeatedly by the JS algorithm.
    peer_cache = {}
    profile_cache = {}

    def peers(relay):
        key = (relay.get("from"), relay.get("to"))
        if key not in peer_cache:
            peer_cache[key] = window_peer_metrics(teams, relay, by_lap, pilot_baselines, team_index)
        return peer_cache[key]

    def profile(ti, relay):
        key = (ti, relay["index"])
        if key not in profile_cache:
            profile_cache[key] = relative_profile(relay, by_lap, pilot_baselines)
        return profile_cache[key]

    for ti, team in enumerate(teams):
        by_idx = {r["index"]: r for r in team["relays"]}
        for relay in team["relays"]:
            if relay["laps"] < 3 or not finite(relay.get("average")):
                continue
            previous = by_idx.get(relay["index"] - 1)
            prof = profile(ti, relay)
            prev_prof = profile(ti, previous) if previous else None
            dynamic = bool(prof and prof.get("dynamic"))
            p = peers(relay)
            grid_now = median([x["rawAverage"] for x in p if finite(x.get("rawAverage"))])
            if previous:
                pp = peers(previous)
                previous_grid = median([x["rawAverage"] for x in pp if finite(x.get("rawAverage"))])
                previous_avg = previous.get("average")
            else:
                previous_grid = None
                previous_avg = None
            raw_delta = relay["average"] - previous_avg if finite(previous_avg) else None
            grid_delta = grid_now - previous_grid if finite(grid_now) and finite(previous_grid) else 0
            corrected = raw_delta - grid_delta if finite(raw_delta) else None
            if dynamic and prof and finite(prof.get("average")):
                corrected = prof["average"] - prev_prof["average"] if prev_prof and finite(prev_prof.get("average")) else prof["average"]
            midpoint = (float(relay["from"]) + float(relay["to"])) / 2
            transitions.append({
                "team_index": ti, "relay": relay, "previous": previous,
                "previousAverage": previous_avg, "gridNow": grid_now, "previousGrid": previous_grid,
                "rawDelta": raw_delta, "gridDelta": grid_delta, "correctedDelta": corrected,
                "midpoint": midpoint, "dynamic": dynamic, "conditionProfile": prof,
            })

    matrix = defaultdict(dict)
    all_corrected = [x["correctedDelta"] for x in transitions if finite(x.get("correctedDelta"))]
    for raw in transitions:
        p = peers(raw["relay"])
        raw_peer = next((x for x in p if x["team_index"] == raw["team_index"]), None)
        use_dynamic = bool(raw_peer and raw_peer.get("dynamic") and raw_peer.get("profile"))
        pace_value = raw_peer["profile"]["average"] if use_dynamic else raw["relay"]["average"]
        potential_value = raw_peer["profile"]["best3"] if use_dynamic else raw["relay"]["best3"]
        consistency_value = raw_peer["profile"]["consistency"] if use_dynamic else raw["relay"]["consistency"]
        pace_values = [(x["average"] if x["dynamic"] else x["rawAverage"]) for x in p if finite(x.get("average") if x["dynamic"] else x.get("rawAverage"))]
        potential_values = [x["best3"] for x in p if finite(x.get("best3"))]
        consistency_values = [x["consistency"] for x in p if finite(x.get("consistency"))]
        lap_values = [x["laps"] for x in p if finite(x.get("laps"))]
        transition_peers = [x["correctedDelta"] for x in transitions if finite(x.get("correctedDelta")) and finite(x.get("midpoint")) and abs(x["midpoint"] - raw["midpoint"]) <= 30]
        if len(transition_peers) < 6:
            transition_peers = all_corrected
        has_transition = finite(raw.get("correctedDelta")) and len(transition_peers) >= 3
        pace = percentile_score(pace_value, pace_values)
        transition = percentile_score(raw["correctedDelta"], transition_peers) if has_transition else None
        potential = percentile_score(potential_value, potential_values) if finite(potential_value) else 50
        consistency = percentile_score(consistency_value, consistency_values) if finite(consistency_value) else 50
        sample = percentile_score(raw["relay"]["laps"], lap_values, lower_is_better=False)
        signal = transition_signal(raw["correctedDelta"], transition_peers) if has_transition else {"z": None, "median": None, "sigma": None}
        weights = transition_weights(signal["z"], has_transition)
        score_raw = pace * weights["pace"] + (transition or 0) * weights["transition"] + potential * weights["potential"] + consistency * weights["consistency"] + sample * weights["sample"]
        score = max(0, min(100, int(math.floor(score_raw + 0.5))))
        condition_penalty = 0
        cp = raw_peer.get("profile") if raw_peer else raw.get("conditionProfile")
        if use_dynamic and cp:
            if (cp.get("gridSpread") or 0) >= 1.25 and not cp.get("pilotBaselineApplied"):
                condition_penalty = 15
            elif (cp.get("gridSpread") or 0) >= .8 and not cp.get("pilotBaselineApplied"):
                condition_penalty = 8
        matrix[raw["team_index"]][int(raw["relay"]["index"])] = {
            "score": score,
            "relay": {
                "index": int(raw["relay"]["index"]), "from": raw["relay"].get("from"), "to": raw["relay"].get("to"),
                "laps": int(raw["relay"]["laps"]), "average": raw["relay"].get("average"),
                "best3": raw["relay"].get("best3"), "consistency": raw["relay"].get("consistency"),
                "pilot": raw["relay"].get("pilot"),
            },
            "previousAverage": raw.get("previousAverage"),
            "rawDelta": raw.get("rawDelta"),
            "gridDelta": raw.get("gridDelta"),
            "correctedDelta": raw.get("correctedDelta"),
            "gridNow": raw.get("gridNow"),
            "previousGrid": raw.get("previousGrid"),
            "criteria": {"pace": pace, "transition": transition, "potential": potential, "consistency": consistency, "sample": sample},
            "weights": weights,
            "transitionZ": signal["z"],
            "transitionMedian": signal["median"],
            "transitionSigma": signal["sigma"],
            "transitionPopulation": len(transition_peers),
            "conditionMode": "dynamic" if use_dynamic else "stable",
            "conditionConfidencePenalty": condition_penalty,
            "conditionReferenceSwing": (cp or {}).get("referenceSwing", 0),
            "conditionGridSpread": (cp or {}).get("gridSpread", 0),
            "pilotBaselineApplied": bool((cp or {}).get("pilotBaselineApplied")),
            "pilotBaselineSamples": (raw.get("conditionProfile") or {}).get("pilotBaselineSamples", 0),
        }

    result = []
    for ti, team in enumerate(teams):
        row = int(team["driver"]["apex_row"])
        cells = [{"relay_index": ri, **cell} for ri, cell in sorted(matrix.get(ti, {}).items())]
        result.append({
            "apex_row": row,
            "team": team["driver"].get("driver") or "",
            "kart": team["driver"].get("kart") or "",
            "relays": cells,
            "sector_stats": team_sector_stats(team),
        })
    return {"maxRelay": max_relay, "teams": result}


def build_team_from_raw(driver, raw):
    row_id = int(driver["apex_row"])
    laps = parse_laps(raw, row_id)
    pits = parse_pits(raw, row_id)
    relays = relay_slices(laps, pits, driver)
    return {"driver": driver, "relays": relays, "_lap_count": len(laps), "_pit_count": len(pits)}


def choose_window(driver):
    laps = int(float(driver.get("laps") or 0)) if str(driver.get("laps") or "").strip() not in ("", "None", "null") else 0
    if laps > 1500:
        return 3000
    return 1500


def fetch_and_compute(circuit, drivers, apex_http_request, progress=None, max_workers=4, cancelled=None, cached_teams=None):
    """Reconstruit SCORE RELAIS avec cache incrémental par équipe.

    Une équipe dont le nombre d'arrêts terminés n'a pas changé est réutilisée
    directement depuis le cache. Si au moins une équipe a changé, la formule
    Velocity complète est recalculée sur l'ensemble de la population
    (équipes en cache + équipes rafraîchies) : l'algorithme de score reste donc
    strictement identique.
    """
    started = time.time()
    cached_teams = cached_teams if isinstance(cached_teams, dict) else {}
    clean_drivers = []
    for d in drivers or []:
        try:
            row = int(d.get("apex_row") or 0)
        except Exception:
            row = 0
        if row:
            clean_drivers.append({
                "apex_row": row,
                "driver": str(d.get("driver") or d.get("name") or ""),
                "pilot": str(d.get("pilot") or ""),
                "kart": str(d.get("kart") or d.get("apex") or ""),
                "laps": d.get("laps"),
                "pit_stops": int(float(d.get("pit_stops") or 0)),
            })

    total = len(clean_drivers)
    teams = [None] * total
    fetch_pairs = []
    reused = 0

    # Le nombre d'arrêts est notre frontière sûre : tant qu'il n'a pas changé,
    # aucun nouveau relais TERMINÉ n'a été créé. Le relais courant continue,
    # lui, d'être calculé en Live côté navigateur.
    for index, driver in enumerate(clean_drivers):
        row_key = str(driver["apex_row"])
        cached = cached_teams.get(row_key)
        cached_stops = None
        cached_team = None
        if isinstance(cached, dict):
            try:
                cached_stops = int(cached.get("pit_stops") or 0)
            except Exception:
                cached_stops = None
            cached_team = cached.get("team")
        cached_laps = None
        if isinstance(cached_team, dict):
            try:
                cached_laps = int((cached_team.get("driver") or {}).get("laps") or 0)
            except Exception:
                cached_laps = None
        try:
            live_laps = int(float(driver.get("laps") or 0))
        except Exception:
            live_laps = 0
        if cached_team and cached_stops == driver["pit_stops"] and cached_laps == live_laps:
            # Réutilisation sûre seulement si arrêts ET nombre de tours sont
            # identiques. Après un refresh navigateur, un relais ayant avancé
            # doit republier ses meilleurs secteurs STATS actualisés.
            cached_team = dict(cached_team)
            cached_team["driver"] = driver
            teams[index] = cached_team
            reused += 1
        else:
            fetch_pairs.append((index, driver))

    if progress:
        progress({
            "phase": "cache",
            "done": reused, "total": total, "team": "",
            "reused": reused, "to_fetch": len(fetch_pairs),
        })

    def one(index_driver):
        if cancelled and cancelled():
            raise RuntimeError("SCORE_RELAIS_JOB_CANCELLED")
        index, driver = index_driver
        window = choose_window(driver)
        row = driver["apex_row"]
        command = f"D#-{window}#D{row}.L#-999#D{row}.P#2#D{row}.B#1#D{row}.INF"
        raw, _port = apex_http_request(circuit, command)
        if cancelled and cancelled():
            raise RuntimeError("SCORE_RELAIS_JOB_CANCELLED")
        team = build_team_from_raw(driver, raw)

        # 3000 uniquement si 1500 prouve réellement que l'historique est tronqué.
        lap_numbers = [p["lap"] for r in team["relays"] for p in r.get("lapPoints", [])]
        if window < 3000 and lap_numbers and min(lap_numbers) > 2:
            command = f"D#-3000#D{row}.L#-999#D{row}.P#2#D{row}.B#1#D{row}.INF"
            raw, _port = apex_http_request(circuit, command)
            if cancelled and cancelled():
                raise RuntimeError("SCORE_RELAIS_JOB_CANCELLED")
            team = build_team_from_raw(driver, raw)
            window = 3000
        return index, team, window

    done = reused
    if fetch_pairs:
        with ThreadPoolExecutor(max_workers=max(1, min(int(max_workers or 4), 6))) as pool:
            futures = [pool.submit(one, pair) for pair in fetch_pairs]
            for future in as_completed(futures):
                index, team, window = future.result()
                teams[index] = team
                done += 1
                if progress:
                    progress({
                        "phase": "fetch",
                        "done": done, "total": total,
                        "team": team["driver"]["driver"],
                        "laps": team["_lap_count"], "pits": team["_pit_count"], "window": window,
                        "reused": reused, "fetched": done - reused,
                    })

    teams = [t for t in teams if t]
    if progress:
        progress({
            "phase": "compute", "done": total, "total": total, "team": "",
            "reused": reused, "fetched": len(fetch_pairs),
        })
    if cancelled and cancelled():
        raise RuntimeError("SCORE_RELAIS_JOB_CANCELLED")

    computed = score_compute(teams)
    computed["durationMs"] = int((time.time() - started) * 1000)
    computed["source"] = "server-incremental"
    computed["qualification"] = None
    computed["cache"] = {
        "reusedTeams": reused,
        "fetchedTeams": len(fetch_pairs),
        "totalTeams": total,
    }

    # Cache compact pour le prochain passage. Les lapPoints restent nécessaires
    # au calcul global exact ; la réponse Apex brute n'est jamais conservée.
    computed["_team_cache"] = {
        str(team["driver"]["apex_row"]): {
            "pit_stops": int(team["driver"].get("pit_stops") or 0),
            "team": team,
        }
        for team in teams
    }
    return computed
