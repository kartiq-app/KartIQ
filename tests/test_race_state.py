"""Tests unitaires sans réseau des conversions fondamentales de RaceStateService."""

import unittest

from backend.services.race_state import RaceStateService


class RaceStateServiceTests(unittest.TestCase):
    def setUp(self):
        self.service = RaceStateService({})

    def test_time_to_seconds(self):
        self.assertAlmostEqual(self.service.time_to_seconds("1:02.345"), 62.345)
        self.assertEqual(self.service.time_to_seconds("invalide"), 9999.0)

    def test_format_lap_seconds(self):
        self.assertEqual(self.service.format_lap_seconds(62.345), "1:02.345")
        self.assertEqual(self.service.format_lap_seconds(42.5), "42.500")
        self.assertEqual(self.service.format_lap_seconds(None), "—")

    def test_fmt_delta(self):
        self.assertEqual(self.service.fmt_delta(0), "0.000 s")
        self.assertEqual(self.service.fmt_delta(0.125), "+0.125 s")
        self.assertEqual(self.service.fmt_delta(-0.125), "-0.125 s")


    def test_direct_race_gap_from_apex_gap_column(self):
        leader = {"pos": 1, "gap": "—", "interval": "—"}
        p2 = {"pos": 2, "gap": "0.102", "interval": "—"}
        p3 = {"pos": 3, "gap": "0.828", "interval": "—"}
        self.assertAlmostEqual(self.service.direct_race_gap(p2, leader), 0.102)
        self.assertAlmostEqual(self.service.direct_race_gap(p3, p2), 0.726)

    def test_direct_race_gap_falls_back_to_interval(self):
        ahead = {"pos": 2, "gap": "1 TOUR", "interval": "—"}
        behind = {"pos": 3, "gap": "1 TOUR", "interval": "0.450"}
        self.assertAlmostEqual(self.service.direct_race_gap(behind, ahead), 0.450)


if __name__ == "__main__":
    unittest.main()
