"""V1813: passive reads across Render workers cannot blank an active KV run."""
import json
import unittest
from test_registry_isolation_v1811 import SQLiteStore
from spotter_registry_scope import RegistryRuns


class StableLiveRegister(unittest.TestCase):
    def setUp(self):
        self.store = SQLiteStore()
        self.runs = RegistryRuns(self.store)
        self.workspace = 'kart-race'
        self.first = self.runs.current(self.workspace,circuit_id='dunois',session_title='ENDURANCE 12H')
        self.kv = {f'KV{i:02d}':{'kv':f'KV{i:02d}', 'history':[{'team':f'TEAM {i}', 'at':i}]} for i in range(1,15)}
        self.assertTrue(self.runs.save(self.workspace,self.first['run_id'],self.kv,circuit_id='dunois')[0])

    def test_passive_gets_from_disagreeing_workers_cannot_rotate(self):
        for idx in range(60):
            circuit='dunois' if idx%2 else 'bresse'
            session='race-old' if idx%3 else 'race-new'
            run=self.runs.current(self.workspace,circuit_id=circuit,session_id=session,
                                  circuit_observed_at_ms=10**16)
            self.assertEqual(run['run_id'],self.first['run_id'])
            self.assertEqual(len(json.loads(run['registry_json'])),14)
        self.assertEqual(self.runs.archives(self.workspace),[])

    def test_background_saves_with_stale_context_do_not_rotate(self):
        for circuit in ['bresse','dunois','another']:
            ok,run=self.runs.save(self.workspace,self.first['run_id'],{},circuit_id=circuit,session_id='stale')
            self.assertTrue(ok)
            self.assertEqual(len(json.loads(run['registry_json'])),14)
        self.assertEqual(self.runs.archives(self.workspace),[])

    def test_real_circuit_selection_rotates_once(self):
        next_run=self.runs.current(self.workspace,circuit_id='bresse',explicit_circuit_change=True)
        self.assertNotEqual(next_run['run_id'],self.first['run_id'])
        self.assertEqual(json.loads(next_run['registry_json']),{})
        for _ in range(10):
            # Every worker still has its own circuit but nobody gets to change it via GET.
            fetched=self.runs.current(self.workspace,circuit_id='dunois',session_id='old-session')
            self.assertEqual(fetched['run_id'],next_run['run_id'])
        self.assertEqual(len(self.runs.archives(self.workspace)),1)
        self.assertEqual(len(json.loads(self.runs.archives(self.workspace)[0]['registry_json'])),14)
        again=self.runs.current(self.workspace,circuit_id='bresse',explicit_circuit_change=True)
        self.assertEqual(again['run_id'],next_run['run_id'])

    def test_explicit_new_race_still_creates_empty_kv(self):
        next_run=self.runs.current(self.workspace,circuit_id='dunois',new_run=True,session_id='race-new')
        self.assertNotEqual(self.first['run_id'],next_run['run_id'])
        self.assertFalse(self.runs.save(self.workspace,self.first['run_id'],self.kv)[0])
        self.assertEqual(json.loads(next_run['registry_json']),{})
        self.assertEqual(len(self.runs.archives(self.workspace)),1)


if __name__=='__main__': unittest.main()
