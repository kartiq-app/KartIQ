"""Secondary VVCE invariants: keep the official Apex live untouched."""
import unittest
from backend.services.vvce_server import calculate


def example(missing=False):
    laps, pits = [], []
    for row in (11, 22):
        for n in range(1, 41):
            if missing and row == 22 and n == 20:
                continue
            lap = 72.0 if row == 11 else 74.0
            if n in (13, 27, 36):
                lap += 110
            laps.append({'row_id': row, 'lap_number': n, 'lap_seconds': lap,
                         'team': 'Leader' if row == 11 else 'Second', 'position': 1 if row == 11 else 2})
        for stop, n in enumerate((12, 26, 35), 1):
            pits.append({'row_id': row, 'lap_number': n, 'stop_number': stop, 'event': 'IN'})
    return laps, pits


class VVCEProjectionTests(unittest.TestCase):
    def test_complete_grid_and_net_cost(self):
        laps, pits = example()
        result = calculate(laps, pits, [11, 22])
        self.assertEqual(result['teams'], 2)
        self.assertEqual(result['referenceStops'], 3)
        self.assertEqual(result['netSamples'], 6)
        self.assertAlmostEqual(result['pitNetCost'], 110.0)
        self.assertEqual(result['ranking'][0]['rowId'], 11)
        self.assertFalse(result['certified'])

    def test_missing_lap_refuses_unreliable_projection(self):
        laps, pits = example(missing=True)
        with self.assertRaisesRegex(ValueError, 'Historique incomplet'):
            calculate(laps, pits, [11, 22])

    def test_missing_team_refuses_partial_grid(self):
        laps, pits = example()
        with self.assertRaisesRegex(ValueError, 'Tours manquants'):
            calculate(laps, pits, [11, 22, 33])

    def test_no_double_count_on_out_events(self):
        laps, pits = example()
        for pit in list(pits):
            pits.append({**pit, 'event': 'OUT'})
        result = calculate(laps, pits, [11, 22])
        self.assertEqual(result['referenceStops'], 3)
import pytest
from backend.services.vvce_server import live_snapshot_calculate


def grid():
    return [
        {'apex_row': 22, 'pos': 1, 'driver': 'EIRIZ PRO', 'laps': 0,
         'gap': 'Tour 462', 'pit_stops': 9, 'last': '1:10.714'},
        {'apex_row': 3, 'pos': 2, 'driver': 'RED RACING', 'laps': 0,
         'gap': '3 Tours', 'pit_stops': 10, 'last': '1:11.465'},
        {'apex_row': 14, 'pos': 3, 'driver': 'MTF RACING', 'laps': 0,
         'gap': '19.933', 'pit_stops': 9, 'last': '1:11.337'},
    ]


def test_leader_keeps_advantage_over_three_lap_gap():
    r = live_snapshot_calculate(grid(), {})
    assert r['referenceLap'] == 462
    assert r['ranking'][0]['name'] == 'EIRIZ PRO'
    assert r['ranking'][1]['name'] == 'MTF RACING'
    assert r['ranking'][-1]['name'] == 'RED RACING'
    assert r['costProvisional']
    assert r['method'] == 'vvce-live-grid-incremental-v1870'


def test_only_live_grid_stop_counts_and_incremental_delta():
    initial = {'22': {'lastLap': 462, 'stops': 9}}
    rows = grid()
    rows[0]['gap'] = 'Tour 463'
    rows[0]['pit_stops'] = 10
    r = live_snapshot_calculate(rows, initial)
    team = next(d for d in r['ranking'] if d['rowId'] == 22)
    assert team['deltaLapsSinceActivation'] == 1
    assert team['deltaStopsSinceActivation'] == 1


def test_reject_incomplete_grid_or_unknown_leader():
    rows = grid()
    rows[0]['gap'] = '—'
    with pytest.raises(ValueError, match='leader'):
        live_snapshot_calculate(rows, {})
    rows = grid()
    rows[1]['gap'] = '—'
    with pytest.raises(ValueError, match='Écart LIVE'):
        live_snapshot_calculate(rows, {})


def test_reject_mismatched_live_laps():
    rows = grid()
    rows[1]['laps'] = 459
    assert live_snapshot_calculate(rows, {})['referenceLap'] == 462
    rows[1]['laps'] = 500
    with pytest.raises(ValueError, match='incohérents'):
        live_snapshot_calculate(rows, {})
