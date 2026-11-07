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
        {'apex_row': 14, 'pos': 3, 'driver': 'MTF RACING', 'laps': 462,
         'gap': '19.933', 'pit_stops': 9, 'last': '1:11.337'},
    ]


def test_leader_keeps_advantage_over_three_lap_gap():
    r = live_snapshot_calculate(grid(), {})
    assert r['referenceLap'] == 462
    assert r['ranking'][0]['name'] == 'EIRIZ PRO'
    assert r['ranking'][1]['name'] == 'MTF RACING'
    assert r['ranking'][-1]['name'] == 'RED RACING'
    assert r['costProvisional']
    assert r['method'] == 'vvce-live-grid-validated-v1871'


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


def test_refuse_missing_individual_laps_when_gap_is_seconds():
    rows=grid()
    rows[2]['laps']=0
    with pytest.raises(ValueError, match='Tours individuels Apex manquants'):
        live_snapshot_calculate(rows,{})

def test_refuse_leader_lap_fabricated_for_all_teams():
    rows=grid()
    rows[1]['gap']='0.851'
    rows[1]['laps']=0
    rows[2]['gap']='14.942'
    rows[2]['laps']=0
    with pytest.raises(ValueError, match='Tours individuels Apex manquants'):
        live_snapshot_calculate(rows,{})
"""VVCE hybrid: verified LIVE order + historical pit calibration, fail-closed."""
import pytest
from backend.services.vvce_server import historical_pit_metrics, hybrid_live_history_calculate


def hybrid_history():
    laps, pits = [], []
    for row in (11, 22):
        for number in range(1, 61):
            seconds = 71.0
            if number in (14, 29, 44):
                seconds += 109.0
            laps.append({'row_id': row, 'lap_number': number, 'lap_seconds': seconds})
        for n in (13, 28, 43):
            pits.append({'row_id': row, 'lap_number': n, 'event': 'IN'})
    return laps, pits


def hybrid_grid():
    return [
        {'apex_row': 11, 'pos': 1, 'driver': 'EIRIZ', 'laps': 462,
         'gap': 'Tour 462', 'pit_stops': 9, 'last': '1:11.000'},
        {'apex_row': 22, 'pos': 2, 'driver': 'RED', 'laps': 459,
         'gap': '3 Tours', 'pit_stops': 10, 'last': '1:11.000'},
    ]


def test_hist_calibration_and_verified_live():
    laps, pits = hybrid_history()
    net, n, pace = historical_pit_metrics(laps, pits)
    assert n == 6 and net == pytest.approx(109.) and pace == pytest.approx(71.)
    result = hybrid_live_history_calculate(hybrid_grid(), laps, pits)
    assert result['referenceLap'] == 462
    assert result['netSamples'] == 6
    assert result['pitNetCost'] == pytest.approx(109.)
    assert [r['name'] for r in result['ranking']] == ['EIRIZ', 'RED']
    assert result['method'] == 'vvce-hybrid-validated-v1872'
    assert result['costProvisional'] is False


def test_synthetic_history_laps_never_replace_official_live():
    laps, pits = hybrid_history()
    for lap in laps:
        lap['lap_number'] += 400
    result = hybrid_live_history_calculate(hybrid_grid(), laps, pits)
    assert result['referenceLap'] == 462
    assert result['ranking'][0]['lastLap'] == 462


def test_invalid_live_order_is_refused_even_with_hybrid_history():
    laps, pits = hybrid_history()
    rows = hybrid_grid()
    rows[1]['gap'] = '0.5'
    rows[1]['laps'] = 462
    # numeric gap within lead lap is well-formed and correctly ordered
    assert hybrid_live_history_calculate(rows, laps, pits)['teams'] == 2
    rows[1]['laps'] = 0
    with pytest.raises(ValueError, match='Tours individuels Apex manquants'):
        hybrid_live_history_calculate(rows, laps, pits)


def test_non_monotonic_live_gaps_cannot_publish():
    laps, pits = hybrid_history()
    rows = hybrid_grid() + [
        {'apex_row': 33, 'pos': 3, 'driver': 'THIRD', 'laps': 462,
         'gap': '20.0', 'pit_stops': 10, 'last': '1:11.000'}]
    with pytest.raises(ValueError, match='Écarts LIVE non réconciliés'):
        hybrid_live_history_calculate(rows, laps, pits)


def test_incomplete_histories_stay_provisional_not_invented():
    result = hybrid_live_history_calculate(hybrid_grid(), [], [])
    assert result['costProvisional'] is True
    assert result['netSamples'] == 0
    assert result['pitNetCost'] == 110
