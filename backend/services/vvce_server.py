"""VVCE server-side secondary projection. Never called from Apex frame processing.

The recorder owns capture; this service only reads committed laps and pits. Results
are snapshots, not official Apex positions. No reconstruction of historical wall times.
"""
import json
import math
import statistics
import time
from collections import defaultdict


def median(values):
    values = sorted(x for x in values if isinstance(x, (int, float)) and math.isfinite(x))
    return statistics.median(values) if values else None


def calculate(laps, pits, expected_rows=None):
    buckets = defaultdict(dict)
    for lap in laps:
        try:
            row = int(lap.get('row_id') or 0)
            number = int(lap.get('lap_number') or 0)
            seconds = float(lap.get('lap_seconds') or 0)
        except (ValueError, TypeError):
            continue
        if row > 0 and number > 0 and 0 < seconds < 1800:
            buckets[row][number] = {'seconds': seconds, 'name': str(lap.get('team') or ''),
                                    'position': int(lap.get('position') or 999)}
    by_pit = defaultdict(set)
    by_stop = defaultdict(set)
    for pit in pits:
        if str(pit.get('event') or '').upper() != 'IN':
            continue
        row = int(pit.get('row_id') or 0)
        number = int(pit.get('lap_number') or 0)
        stop = int(pit.get('stop_number') or 0)
        if row > 0 and number > 0:
            by_pit[row].add(number)
            by_stop[row].add(stop if stop > 0 else number)
    expected = {int(r) for r in (expected_rows or []) if int(r) > 0}
    missing = expected - set(buckets)
    if missing:
        raise ValueError(f'Tours manquants pour {len(missing)} équipes ({sorted(missing)[:4]}).')
    datasets = []
    for row, series in buckets.items():
        nums = sorted(series)
        last = nums[-1]
        pit_next = {number+1 for number in by_pit[row]}
        clean = [series[n]['seconds'] for n in nums if n > 2 and n not in pit_next and 40 <= series[n]['seconds'] <= 300]
        if (last < 20 or len(nums) != last or len(clean) < 15):
            if row in expected:
                raise ValueError(f'Historique incomplet équipe {row}: {len(nums)}/{last} tours, {len(clean)} tours propres.')
            continue
        base = median(clean)
        pace = median(clean[-30:])
        if not base or not pace:
            continue
        datasets.append({'rowId': row, 'name': series[last]['name'] or series[nums[0]]['name'] or f'Équipe {row}',
                         'realPos': series[last]['position'], 'stops': len(by_stop[row]),
                         'lastLap': last, 'elapsed': sum(series[n]['seconds'] for n in nums),
                         'pace': pace, 'baseline': base, 'series': series, 'pitNext': pit_next})
    if len(datasets) < 2:
        raise ValueError('Historique insuffisant : moins de deux équipes exploitables.')
    if expected and {d['rowId'] for d in datasets} != expected:
        raise ValueError('Historique incomplet : classement partiel refusé.')
    costs = []
    for d in datasets:
        for n in d['pitNext']:
            value = d['series'].get(n, {}).get('seconds')
            if value is not None and d['baseline']*1.45 < value < d['baseline']*5:
                costs.append(value-d['baseline'])
    if len(costs) < 6:
        raise ValueError('Moins de six passages aux stands exploitables.')
    net = median(costs)
    max_stops = max(d['stops'] for d in datasets)
    max_lap = max(d['lastLap'] for d in datasets)
    ranked = []
    for d in datasets:
        missing_stops = max(0, max_stops-d['stops'])
        missing_laps = max(0, max_lap-d['lastLap'])
        extra = missing_stops*net
        projected = d['elapsed']+missing_laps*d['pace']+extra
        ranked.append({k: d[k] for k in ('rowId','name','realPos','stops','lastLap')}
                      | {'missing': missing_stops, 'extra': extra, 'missingLaps': missing_laps,
                         'projectedTotal': projected})
    ranked.sort(key=lambda x: (x['projectedTotal'], x['realPos']))
    base = ranked[0]['projectedTotal']
    for index, row in enumerate(ranked, 1):
        row['position'] = index
        row['gap'] = max(0, row['projectedTotal']-base)
    return {'ranking': ranked, 'referenceStops': max_stops, 'referenceLap': max_lap,
            'pitNetCost': net, 'netSamples': len(costs), 'teams': len(ranked),
            'method': 'vvce-historical-projection', 'certified': False}


class VVCERepository:
    """Shared snapshots across Render instances, using existing RecorderStore SQL."""
    def __init__(self, store):
        self.store = store
        self.store._execute('''CREATE TABLE IF NOT EXISTS velocity_vvce_state (
            scope TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at_ms BIGINT NOT NULL)''')

    def active(self):
        since=int(time.time()*1000)-30*3600000
        rows=self.store._execute('SELECT scope,payload_json FROM velocity_vvce_state WHERE updated_at_ms>=?',
                                 (since,),fetchall=True) or []
        result=[]
        for row in rows:
            try:
                item=json.loads(row['payload_json'])
                if item.get('status') in ('ready','waiting','stale'):
                    result.append({**item,'scope':row['scope']})
            except (ValueError,TypeError):
                continue
        return result

    def read(self, scope):
        row = self.store._execute('SELECT payload_json FROM velocity_vvce_state WHERE scope=?', (scope,), fetchone=True)
        if not row:
            return None
        return json.loads(row['payload_json'])

    def put(self, scope, data):
        self.store._execute('''INSERT INTO velocity_vvce_state (scope,payload_json,updated_at_ms)
            VALUES (?,?,?) ON CONFLICT(scope) DO UPDATE SET
            payload_json=excluded.payload_json,updated_at_ms=excluded.updated_at_ms''',
            (scope, json.dumps(data, ensure_ascii=False, separators=(',', ':')), int(time.time()*1000)))

# V1870 — Live-snapshot model. Do not use historical/synthetic lap counts to
# reconstruct absolute race time. The official live grid is the sole origin.
import re

_LAP_GAP_RE = re.compile(r'^\s*(\d+)\s*(?:tours?|laps?)\s*$', re.I)
_LEADER_LAP_RE = re.compile(r'^\s*(?:tour|lap)\s*(\d+)\s*$', re.I)


def _positive_int(value):
    try:
        number = int(value)
        return number if number > 0 else 0
    except (ValueError, TypeError):
        return 0


def _time_seconds(value):
    value = str(value or '').strip().lstrip('+').replace(',', '.')
    if not value or value in {'—', '--'}:
        return None
    try:
        parts = [float(p) for p in value.split(':')]
        if len(parts) > 3 or any(p < 0 or not math.isfinite(p) for p in parts):
            return None
        result = 0.0
        for part in parts:
            result = result * 60 + part
        return result
    except (TypeError, ValueError):
        return None


def live_snapshot_calculate(drivers, initial, net_cost=110.0):
    """Equalize observed stops from a simultaneous Apex grid (no historic replay).

    A lap-gap to seconds conversion is explicitly approximate, not certified.
    If the leader's lap or a team's gap is unknowable, refuse the ranking.
    """
    entries = [d for d in drivers if isinstance(d, dict) and _positive_int(d.get('apex_row'))]
    positions = [_positive_int(d.get('pos')) for d in entries]
    if len(entries) < 2 or not all(positions) or len(set(positions)) != len(positions):
        raise ValueError('Grille LIVE Apex incomplète ou positions non uniques.')
    entries.sort(key=lambda d: int(d['pos']))
    if entries[0]['pos'] != 1 and _positive_int(entries[0]['pos']) != 1:
        raise ValueError('Leader LIVE Apex indisponible.')
    leader = entries[0]
    lead_lap = _positive_int(leader.get('laps'))
    leader_label = str(leader.get('gap') or '')
    leader_match = _LEADER_LAP_RE.match(leader_label)
    if not lead_lap and leader_match:
        lead_lap = int(leader_match.group(1))
    if lead_lap <= 0:
        raise ValueError('Tour du leader inconnu : refus des tours synthétiques du Recorder.')
    # Lap duration estimate is intentionally separate from the raw Apex stop clock.
    pace_values = [_time_seconds(d.get('last')) for d in entries]
    clean = [v for v in pace_values if v is not None and 40 <= v <= 180]
    pace = median(clean)
    if pace is None or not 40 <= pace <= 180:
        raise ValueError('Rythme du plateau insuffisant pour convertir les écarts en tours.')
    max_stops = max(_positive_int(d.get('pit_stops')) for d in entries)
    if max_stops < 1:
        raise ValueError('Aucun arrêt Apex identifié : pas de classement virtuel fiable.')
    if not 30 <= net_cost <= 600:
        raise ValueError('Coût net d’arrêt hors bornes.')
    result = []
    for d in entries:
        row_id = _positive_int(d.get('apex_row'))
        real_pos = _positive_int(d.get('pos'))
        gap_label = str(d.get('gap') or '')
        raw_laps = _positive_int(d.get('laps'))
        lap_match = _LAP_GAP_RE.match(gap_label)
        if real_pos == 1:
            lap_deficit = 0
            real_gap = 0.0
        elif lap_match:
            lap_deficit = int(lap_match.group(1))
            real_gap = lap_deficit * pace
        else:
            seconds = _time_seconds(gap_label)
            if seconds is None:
                raise ValueError(f'Écart LIVE manquant pour la ligne Apex {row_id}.')
            # An elapsed gap expressed in seconds does NOT prove that the
            # competitor is on the leader's lap. On this Apex layout, teams
            # several laps down can have a numeric gap. We MUST know their
            # own completed lap number, otherwise no virtual rank is valid.
            if not raw_laps:
                raise ValueError(f'Tours individuels Apex manquants (ligne {row_id}, position {real_pos}) : écart en secondes ambigu, classement virtuel suspendu.')
            lap_deficit = max(0, lead_lap - raw_laps)
            if lap_deficit > 1:
                raise ValueError(f'Écart incohérent pour la ligne Apex {row_id}.')
            real_gap = seconds
        if raw_laps and raw_laps > lead_lap:
            raise ValueError(f'Tours LIVE incohérents pour la ligne Apex {row_id}.')
        if raw_laps and abs((lead_lap - raw_laps) - lap_deficit) > 1:
            raise ValueError(f'Écart tours/position incohérent pour la ligne Apex {row_id}.')
        stops = _positive_int(d.get('pit_stops'))
        if str(d.get('pit_stops') or '').strip() in ('', '—', '--'):
            raise ValueError(f'Nombre d’arrêts Apex manquant pour la ligne {row_id}.')
        missing = max_stops - stops
        extra = missing * net_cost
        # Common live instant: equalizing stops means penalizing teams with
        # fewer completed stops. Larger score is worse.
        score = real_gap + extra
        initial_row = initial.get(str(row_id), {})
        result.append({'rowId': row_id, 'name': str(d.get('driver') or f'Équipe {row_id}'),
                       'realPos': real_pos, 'stops': stops, 'lastLap': raw_laps or lead_lap - lap_deficit,
                       'missing': missing, 'extra': extra, 'missingLaps': lap_deficit,
                       'projectedTotal': score, 'liveGapEstimate': real_gap,
                       'deltaLapsSinceActivation': (raw_laps or lead_lap-lap_deficit) - int(initial_row.get('lastLap') or 0),
                       'deltaStopsSinceActivation': stops - int(initial_row.get('stops') or 0)})
    result.sort(key=lambda d: (d['projectedTotal'], d['realPos']))
    base = result[0]['projectedTotal']
    for idx, item in enumerate(result, 1):
        item['position'] = idx
        item['gap'] = max(0.0, item['projectedTotal']-base)
    return {'ranking': result, 'referenceStops': max_stops, 'referenceLap': lead_lap,
            'pitNetCost': net_cost, 'netSamples': 0, 'teams': len(result),
            'method': 'vvce-live-grid-validated-v1871', 'certified': False,
            'costProvisional': True, 'paceEstimate': pace,
            'note': 'Positions issues du LIVE commun ; écarts en tours convertis au rythme médian estimé.'}

# V1872: the timing history is used only to *measure* net pit losses and pace.
# Race positions and official completed laps must be independently verifiable
# against one live grid; recorder lap_number may be synthetic and is NEVER used
# as an official lap count.
def historical_pit_metrics(laps, pits):
    """Estimate net stop loss from completed lap times, without inventing laps.

    Return (net_cost, number_of_samples, representative_pace).  Rows with sparse
    history are ignored rather than extrapolated. Pit IN associations are used
    only if that event has a usable lap number; outliers with no association
    are not presumed to be pit stops.
    """
    by_row = defaultdict(dict)
    for lap in laps:
        try:
            row = int(lap.get('row_id') or 0)
            n = int(lap.get('lap_number') or 0)
            seconds = float(lap.get('lap_seconds') or 0)
        except (TypeError, ValueError):
            continue
        if row > 0 and n > 0 and 40 <= seconds <= 600:
            by_row[row][n] = seconds
    pit_laps = defaultdict(set)
    for item in pits:
        if str(item.get('event') or '').upper() != 'IN':
            continue
        try:
            row = int(item.get('row_id') or 0)
            n = int(item.get('lap_number') or 0)
        except (TypeError, ValueError):
            continue
        if row > 0 and n > 0:
            pit_laps[row].add(n)
    costs = []
    paces = []
    for row, series in by_row.items():
        affected = {n + 1 for n in pit_laps[row]}
        clean = [v for n, v in sorted(series.items())
                 if n not in affected and 40 <= v <= 180]
        if len(clean) < 8:
            continue
        base = median(clean[-60:])
        if base is None:
            continue
        paces.append(base)
        for n in affected:
            observed = series.get(n)
            if observed is not None and base * 1.45 < observed < base * 5:
                costs.append(observed - base)
    net = median(costs) if len(costs) >= 6 else None
    return net, len(costs), median(paces)


def hybrid_live_history_calculate(drivers, laps, pits, initial=None, calibration=None):
    """Historical pit calibration + strict validation against the same LIVE grid.

    Never uses synthetic Recorder lap counts for classification. Refuse numeric
    Apex gaps if a team's true lap is absent, and refuse a reconstruction whose
    zero-adjustment ordering differs from the published live order.
    """
    net, samples, history_pace = calibration if calibration is not None else historical_pit_metrics(laps, pits)
    result = live_snapshot_calculate(drivers, initial or {}, net_cost=net if net is not None else 110.0)
    rows = result['ranking']
    live_order = sorted(rows, key=lambda d: d['realPos'])
    # Validate the unadjusted estimated gaps against official LIVE positions.
    # This catches exactly the inconsistent mixing of seconds and 'N Tours'
    # that previously elevated an Apex P23 to virtual P1.
    for before, after in zip(live_order, live_order[1:]):
        if before['liveGapEstimate'] > after['liveGapEstimate'] + 0.01:
            raise ValueError(
                'Écarts LIVE non réconciliés entre P{} et P{} : '
                'historique conservé pour étalonnage, classement suspendu.'.format(
                    before['realPos'], after['realPos']))
    result.update({'method': 'vvce-hybrid-validated-v1872',
                   'netSamples': samples,
                   'costProvisional': net is None,
                   'historyPaceEstimate': history_pace,
                   'note': ('Historique : estimation des pertes aux stands. '
                            'Positions : grille LIVE contrôlée ; écarts en tours approximatifs.')})
    return result
