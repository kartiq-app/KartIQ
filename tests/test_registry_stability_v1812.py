"""Regression V1812: Apex titles are NOT race boundaries."""
import json
import unittest
from test_registry_isolation_v1811 import SQLiteStore
from spotter_registry_scope import RegistryRuns


class RegistryStability(unittest.TestCase):
    def setUp(self):
        self.store=SQLiteStore()
        self.runs=RegistryRuns(self.store)

    def test_apex_title_1_title_2_alternate_without_creating_empty_runs(self):
        first=self.runs.current('w',circuit_id='dunois',session_title='ENDURANCE 12H EDITION 2026')
        body={'KV01':{'history':[{'team':'INFINITY RACING - PRO','at':100}]},'KV02':{'history':[{'team':'2R RACING 1 - PRO','at':200}]}}
        saved,_=self.runs.save('w',first['run_id'],body,circuit_id='dunois',session_title='ENDURANCE')
        self.assertTrue(saved)
        for idx in range(30):
            title='ENDURANCE' if idx%2 else 'ENDURANCE 12H EDITION 2026'
            run=self.runs.current('w',circuit_id='dunois',session_title=title,title_observed_at_ms=10**16)
            self.assertEqual(run['run_id'],first['run_id'])
            self.assertEqual(len(json.loads(run['registry_json'])),2)
        self.assertEqual(len(self.runs.archives('w')),0)

    def test_stale_render_worker_circuit_does_not_rotate_active_run(self):
        first=self.runs.current('w',circuit_id='dunois',session_title='ENDURANCE')
        stale=self.runs.current('w',circuit_id='old_circuit',circuit_observed_at_ms=0,
                                session_title='OLD EVENT')
        self.assertEqual(first['run_id'],stale['run_id'])
        self.assertEqual(len(self.runs.archives('w')),0)
        # A genuinely new circuit selection, observed after creation, still rotates.
        fresh=self.runs.current('w',circuit_id='bresse',circuit_observed_at_ms=10**16)
        self.assertNotEqual(first['run_id'],fresh['run_id'])

    def test_explicit_new_course_still_archives(self):
        first=self.runs.current('w',circuit_id='dunois',session_title='ENDURANCE')
        self.runs.save('w',first['run_id'],{'KV01':{'history':[{'team':'A','at':1}]}},circuit_id='dunois')
        second=self.runs.current('w',circuit_id='dunois',session_title='ENDURANCE 12H',new_run=True)
        self.assertNotEqual(first['run_id'],second['run_id'])
        self.assertEqual(json.loads(second['registry_json']),{})
        self.assertEqual(json.loads(self.runs.archives('w')[0]['registry_json'])['KV01']['history'][0]['team'],'A')

    def test_new_session_is_real_boundary_even_when_title_identical(self):
        first=self.runs.current('w',circuit_id='dunois',session_id='race-1',session_title='ENDURANCE')
        second=self.runs.current('w',circuit_id='dunois',session_id='race-2',session_title='ENDURANCE')
        self.assertNotEqual(first['run_id'],second['run_id'])


if __name__=='__main__':unittest.main()
