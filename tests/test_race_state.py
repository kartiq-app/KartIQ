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


if __name__ == "__main__":
    unittest.main()
