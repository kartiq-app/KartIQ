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
