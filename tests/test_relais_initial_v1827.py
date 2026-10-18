import json
import unittest
from test_registry_isolation_v1811 import SQLiteStore
from spotter_registry_scope import RegistryRuns

class InitialRelayTests(unittest.TestCase):
    def setUp(self):
        self.store=SQLiteStore()
        self.runs=RegistryRuns(self.store)
        self.w='race-v1827'
        self.run=self.runs.current(self.w,circuit_id='dunois')['run_id']

    def seed(self, teams):
        ok,run=self.runs.seed_live(self.w,self.run,teams)
        self.assertTrue(ok)
        return json.loads(run['registry_json'])

    def test_initial_team_is_relay_one_and_reopen_does_not_duplicate(self):
        registry=self.seed([{'key':'apex:14','label':'TEAM 76','kart':'14'}])
        self.assertEqual(registry['KV01']['history'][0]['teamLabel'],'TEAM 76')
        self.assertEqual(registry['KV01']['history'][0]['source'],'initial-live')
        self.assertEqual(len(self.seed([{'key':'apex:14','label':'TEAM 76','kart':'14'}])['KV01']['history']),1)
        self.assertEqual(len(json.loads(self.runs.current(self.w)['registry_json'])['KV01']['history']),1)

    def test_legacy_empty_provisional_backfills_once_without_rewriting_history(self):
        self.runs.save(self.w,self.run,{'KV01':{'kv':'KV01','autoProvisional':True,'autoTeamKey':'apex:14','history':[]}})
        registry=self.seed([{'key':'apex:14','label':'TEAM 76','kart':'14'}])
        self.assertEqual(registry['KV01']['history'][0]['teamLabel'],'TEAM 76')
        existing=registry['KV01'];existing['history'].append({'team':'apex:26','teamLabel':'K.A.R.T','at':2,'score':70})
        self.runs.save(self.w,self.run,registry)
        after=self.seed([{'key':'apex:14','label':'TEAM 76','kart':'14'}])
        self.assertEqual(len(after['KV01']['history']),2)
        self.assertIn('K.A.R.T',[entry['teamLabel'] for entry in after['KV01']['history']])

    def test_new_course_starts_new_relay_one(self):
        self.seed([{'key':'apex:14','label':'TEAM 76','kart':'14'}])
        next_run=self.runs.current(self.w,new_run=True)
        self.run=next_run['run_id']
        new=self.seed([{'key':'apex:26','label':'K.A.R.T','kart':'26'}])
        self.assertEqual(new['KV01']['history'][0]['teamLabel'],'K.A.R.T')
        self.assertEqual(len(new['KV01']['history']),1)

if __name__=='__main__':unittest.main()
