"""End-to-end SQL tests: browser-independent physical scores and race isolation."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from data_recorder import RecorderStore
from backend.services.kart_scoring_scope import KartScoringScope
from backend.services.spotter_kv_scores import apply_recorder_scores, _evaluate
from spotter_registry_scope import RegistryRuns


class ConsolidatedKartScoringTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{},clear=False)
        self.env.start()
        os.environ.pop('DATABASE_URL',None)
        self.store=RecorderStore(Path(self.tmp.name))
        self.workspace='TEAM-A'
        self.ctx={'circuit_id':'RKO','session_id':'S1','session_title':'12H'}

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def _seed(self, store=None):
        store=store or self.store
        score=KartScoringScope(store)
        current=score.read(self.workspace,self.ctx)
        selected,_=score.select(self.workspace,self.ctx,mode='quick',
                                expected_run_id=current['run_id'])
        ok,run=RegistryRuns(store).seed_live(self.workspace,selected['run_id'],
                                  [{'key':'apex:17','label':'EQUIPE TEST','kart':'25'}],**self.ctx)
        self.assertTrue(ok)
        registry=json.loads(run['registry_json'])
        kv=next(iter(registry))
        return selected,registry,kv

    def _record(self,store=None):
        store=store or self.store
        store.put_race_team_state({'sessions':[{'id':'S1','workspace_id':self.workspace,
                  'circuit_id':'RKO','name':'12H','status':'active','recorder_id':'REC-1'}]})

    def test_mode_epoch_survives_new_store_instance_and_redeployment(self):
        scope,reg,kv=self._seed()
        store2=RecorderStore(Path(self.tmp.name))
        incoming=KartScoringScope(store2).read(self.workspace,self.ctx)
        self.assertEqual(incoming['epoch'],scope['run_id'])
        self.assertEqual(incoming['mode'],'quick')
        self.assertIn(kv,json.loads(incoming['registry']['registry_json']))
        new,previous=KartScoringScope(store2).rotate(
            self.workspace,self.ctx,expected_run_id=scope['run_id'])
        self.assertNotEqual(new['epoch'],scope['epoch'])
        self.assertEqual(new['mode'],'quick')
        self.assertEqual(json.loads(new['registry']['registry_json']),{})
        self.assertTrue(RegistryRuns(store2).archives(self.workspace))
        unchanged,actual=KartScoringScope(store2).rotate(
            self.workspace,self.ctx,expected_run_id=scope['run_id'])
        self.assertIsNone(unchanged)
        self.assertEqual(actual['epoch'],new['epoch'])

    def test_scoring_runs_without_browser_and_stops_after_session_end(self):
        scope,registry,kv=self._seed()
        self._record()
        at=max(int(scope['registry']['started_at_ms']),registry[kv]['history'][0]['at'])
        laps=[{'received_at_ms':at+(i+1)*10000,'seconds':46.0+(i%3)*.06,'lap':i+1}
              for i in range(13)]
        teams={17:{'laps':laps}}
        self.assertEqual(apply_recorder_scores(self.store,'REC-1',teams),1)
        row=json.loads(KartScoringScope(self.store).read(self.workspace,self.ctx)['registry']['registry_json'])[kv]
        self.assertEqual(row['speed']['source'],'server-recorder')
        self.assertEqual(row['speed']['epoch'],scope['epoch'])
        self.assertGreaterEqual(row['speed']['validLaps'],8)
        self.assertIsNotNone(row['speed']['potential'])
        self.assertIsNotNone(row['history'][-1]['score'])
        # Provisional initial observation must not be validated physically.
        self.assertFalse(row['speed']['confirmed'])
        # Observer updates without fresh evidence do not fabricate a new score.
        self.assertEqual(apply_recorder_scores(self.store,'REC-1',teams),0)
        self.store.put_race_team_state({'sessions':[{'id':'S1','workspace_id':self.workspace,
                'circuit_id':'RKO','name':'12H','status':'ended','recorder_id':'REC-1'}]})
        teams[17]['laps'].append({'received_at_ms':at+180000,'seconds':44.9,'lap':14})
        self.assertEqual(apply_recorder_scores(self.store,'REC-1',teams),0)

    def test_new_course_excludes_prior_laps_and_stale_browser_scores(self):
        scope,reg,kv=self._seed()
        self._record()
        start=int(reg[kv]['history'][0]['at'])
        teams={17:{'laps':[{'received_at_ms':start+1000*i,'seconds':46.3+i*.02}
                            for i in range(1,11)]}}
        self.assertEqual(apply_recorder_scores(self.store,'REC-1',teams),1)
        before=KartScoringScope(self.store).read(self.workspace,self.ctx)
        row=json.loads(before['registry']['registry_json'])[kv]
        browser=json.loads(before['registry']['registry_json'])
        browser[kv]['speed']={'potential':30,'epoch':scope['epoch'],'source':'client'}
        browser[kv]['history'][0]['score']=1
        saved,after=RegistryRuns(self.store).save(self.workspace,scope['run_id'],browser,
             base_updated_at_ms=int(before['registry']['updated_at_ms']),**self.ctx)
        self.assertTrue(saved)
        clean=json.loads(after['registry_json'])[kv]
        self.assertEqual(clean['speed']['source'],'server-recorder')
        self.assertNotEqual(clean['history'][0]['score'],1)
        next_course,_=KartScoringScope(self.store).rotate(self.workspace,self.ctx,
                                    expected_run_id=scope['run_id'])
        # No old data can be injected into a new race even from a stale POST.
        stale,current=RegistryRuns(self.store).save(self.workspace,scope['run_id'],browser,
                                    base_updated_at_ms=int(after['updated_at_ms']),**self.ctx)
        self.assertFalse(stale)
        self.assertEqual(json.loads(current['registry_json']),{})
        # Must seed the new race before scores are available.
        self.assertEqual(apply_recorder_scores(self.store,'REC-1',teams),0)

    def test_server_scoring_updates_only_current_relay_after_quick_change(self):
        scope,registry,kv=self._seed()
        self._record()
        first_at=int(registry[kv]['history'][0]['at'])
        first_laps=[{'received_at_ms':first_at+1000*(i+1),'seconds':46.1} for i in range(9)]
        self.assertEqual(apply_recorder_scores(self.store,'REC-1',{17:{'laps':first_laps}}),1)
        old=KartScoringScope(self.store).read(self.workspace,self.ctx)['registry']
        row=json.loads(old['registry_json'])[kv]
        frozen=row['history'][0]['score']
        transition=first_at+30_000
        row['history'].append({'team':'apex:28','source':'pit_out','at':transition})
        row['autoProvisional']=False
        self.assertTrue(RegistryRuns(self.store).save(self.workspace,scope['run_id'],{kv:row},
            base_updated_at_ms=int(old['updated_at_ms']),**self.ctx)[0])
        second_laps=[{'received_at_ms':transition+1000*(i+1),'seconds':47.3} for i in range(9)]
        self.assertEqual(apply_recorder_scores(self.store,'REC-1',
                          {17:{'laps':first_laps},28:{'laps':second_laps}}),1)
        latest=json.loads(KartScoringScope(self.store).read(self.workspace,self.ctx)['registry']['registry_json'])[kv]
        self.assertEqual(latest['history'][0]['score'],frozen,
                         'a previous relay score is frozen')
        self.assertIsNotNone(latest['history'][1]['score'])
        self.assertEqual(latest['speed']['relayLaps'],9)
        self.assertEqual(latest['history'][1]['scoreOrigin'],'server-recorder')

    def test_relay_transition_does_not_transfer_prior_team_laps(self):
        reg={'KV01':{'kv':'KV01','history':[
               {'team':'apex:17','at':1000,'source':'initial-live'},
               {'team':'apex:28','at':9000,'source':'pit_out'}]}}
        teams={17:{'laps':[{'received_at_ms':2000,'seconds':44.8}]},
               28:{'laps':[{'received_at_ms':10000,'seconds':47.5}]}}
        result=_evaluate(reg,teams,1000)['KV01']
        self.assertEqual(result['validLaps'],2)
        self.assertEqual(result['relayLaps'],1)
        self.assertEqual(result['recent'],47.5)

if __name__=='__main__':unittest.main()

class BackfillProvenanceTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{},clear=False)
        self.env.start();os.environ.pop('DATABASE_URL',None)
        self.store=RecorderStore(Path(self.tmp.name))

    def tearDown(self):
        self.env.stop();self.tmp.cleanup()

    def _lap(self,t):
        return {'row_id':17,'lap_number':1,'received_at_ms':t,
                'lap_seconds':46.1,'lap_time':'46.100'}

    def test_historical_lap_does_not_acquire_false_course_timestamp(self):
        # Apex history is fetched *after* the KV course starts, but its
        # acquisition timestamp must not be used to claim physical laps.
        self.assertTrue(self.store.upsert_lap('R',self._lap(20_000),preserve_existing_timestamp=True))
        lap=self.store.worker_history('R')[0][0]
        self.assertEqual(lap['origin'],'backfill')
        self.assertNotIn('KV01',_evaluate({'KV01':{'history':[
            {'team':'apex:17','at':10_000}]}},
            {17:{'laps':[{'seconds':46.1,'received_at_ms':20_000,
                        'origin':lap['origin']}]}},10_000))
        self.assertFalse(self.store.upsert_lap('R',self._lap(30_000)))
        live=self.store.worker_history('R')[0][0]
        self.assertEqual(live['received_at_ms'],30_000)
        self.assertEqual(live['origin'],'live')
        self.assertFalse(self.store.upsert_lap('R',self._lap(40_000),preserve_existing_timestamp=True))
        retained=self.store.worker_history('R')[0][0]
        self.assertEqual(retained['received_at_ms'],30_000)
        self.assertEqual(retained['origin'],'live')
