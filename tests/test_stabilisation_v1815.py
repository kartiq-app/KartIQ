"""Tests de sécurité P0 de la V1815: python -m unittest tests/test_stabilisation_v1815.py"""
import json
import unittest
from test_registry_isolation_v1811 import SQLiteStore
from spotter_registry_scope import RegistryRuns
from spotter_invariants import spotter_snapshot_error


class RegistrySafetyTests(unittest.TestCase):
    def setUp(self):
        self.store=SQLiteStore()
        self.runs=RegistryRuns(self.store)
        self.w='w'
        self.start=self.runs.current(self.w,circuit_id='dunois')
        self.id=self.start['run_id']
        self.base=self.start['updated_at_ms']

    def test_stale_client_cannot_regress_potential_score_or_trace(self):
        fresh={'KV01':{'trace':'interrupted','speed':{'potential':61.2},
                       'history':[{'team':'RED','at':1,'score':88,'updatedAt':200}]}}
        old={'KV01':{'trace':'active','speed':{'potential':78.0},
                     'history':[{'team':'RED','at':1,'score':44,'updatedAt':100}]}}
        ok,new=self.runs.save(self.w,self.id,fresh,base_updated_at_ms=self.base)
        self.assertTrue(ok)
        ok,after=self.runs.save(self.w,self.id,old,base_updated_at_ms=self.base)
        self.assertFalse(ok)
        row=json.loads(after['registry_json'])['KV01']
        self.assertEqual(row['trace'],'interrupted')
        self.assertEqual(row['speed']['potential'],61.2)
        self.assertEqual(row['history'][0]['score'],88)

    def test_registry_history_keeps_more_than_80_passages(self):
        history=[{'team':'TEAM-'+str(i),'at':i,'score':50} for i in range(140)]
        ok,_=self.runs.save(self.w,self.id,{'KV01':{'history':history}},base_updated_at_ms=self.base)
        self.assertTrue(ok)
        saved=json.loads(self.runs.current(self.w)['registry_json'])['KV01']['history']
        self.assertEqual(len(saved),140)
        self.assertEqual(saved[0]['team'],'TEAM-0')
        self.assertEqual(saved[-1]['team'],'TEAM-139')

    def test_new_race_rejects_old_run_write_even_with_fresh_revision(self):
        nxt=self.runs.current(self.w,new_run=True)
        ok,_=self.runs.save(self.w,self.id,{'KV03':{'history':[{'team':'OLD','at':1}]}},
                            base_updated_at_ms=nxt['updated_at_ms'])
        self.assertFalse(ok)
        self.assertEqual(json.loads(self.runs.current(self.w)['registry_json']),{})


class QueueSafetyTests(unittest.TestCase):
    def test_two_different_karts_for_one_team_rejected(self):
        snap={'queue':[
            {'cardId':'a','kv':'KV01','status':'reserved','reservedTeam':'RED'},
            {'cardId':'b','kv':'KV02','status':'reserved','reservedTeam':'RED'}],
            'assignments':{'RED':{'kv':'KV03','status':'pit','pendingReplacementKv':'KV01'}}}
        self.assertIn('Double réservation',spotter_snapshot_error(snap) or '')

    def test_reserved_and_incoming_same_team_rejected(self):
        snap={'queue':[{'cardId':'a','kv':'KV01','status':'reserved','reservedTeam':'RED'}],
              'incoming':[{'id':'i1','team':'RED'}]}
        self.assertIn('entrants',spotter_snapshot_error(snap) or '')

    def test_kart_double_location_rejected(self):
        snap={'queue':[{'cardId':'a','kv':'KV01','status':'available'}],
              'maintenance':[{'cardId':'b','kv':'KV01','status':'maintenance'}]}
        self.assertIn('deux emplacements',spotter_snapshot_error(snap) or '')

    def test_track_kart_also_in_queue_rejected(self):
        snap={'queue':[{'cardId':'a','kv':'KV01','status':'available'}],
              'assignments':{'RED':{'kv':'KV01','status':'track'}}}
        self.assertIn('simultanément',spotter_snapshot_error(snap) or '')

    def test_normal_validation_accepted(self):
        snap={'queue':[{'cardId':'a','kv':'KV01','status':'reserved','reservedTeam':'RED'},
                       {'cardId':'b','kv':'KV03','status':'available'}],
              'assignments':{'RED':{'kv':'KV02','status':'pit','pendingReplacementKv':'KV01'}}}
        self.assertIsNone(spotter_snapshot_error(snap))

if __name__=='__main__':unittest.main()
