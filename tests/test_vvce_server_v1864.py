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
