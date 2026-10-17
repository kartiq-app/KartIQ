"""Regression: python -m unittest discover -s tests -p 'test_registry_isolation_v1811.py'"""
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from spotter_registry_scope import RegistryRuns


class SQLiteStore:
    def __init__(self):
        self.conn=sqlite3.connect(':memory:',check_same_thread=False,isolation_level=None)
        self.conn.row_factory=sqlite3.Row
        self._lock=threading.RLock()
        for sql in ("""CREATE TABLE velocity_spotter_shared_registry
            (workspace_id TEXT PRIMARY KEY,registry_json TEXT,updated_at_ms BIGINT)""",
            """CREATE TABLE velocity_spotter_registry_runs
            (workspace_id TEXT PRIMARY KEY,run_id TEXT,circuit_id TEXT,session_id TEXT,
             session_title TEXT,registry_json TEXT,started_at_ms BIGINT,updated_at_ms BIGINT)""",
            """CREATE TABLE velocity_spotter_registry_archive
            (workspace_id TEXT,run_id TEXT,circuit_id TEXT,session_id TEXT,session_title TEXT,
             registry_json TEXT,started_at_ms BIGINT,archived_at_ms BIGINT,
             PRIMARY KEY(workspace_id,run_id))"""):
            self._execute(sql)

    def _execute(self,sql,params=(),*,fetchone=False,fetchall=False):
        with self._lock:
            rows=self.conn.execute(sql,params)
            if fetchone:
                row=rows.fetchone();return dict(row) if row else None
            if fetchall:return [dict(row) for row in rows.fetchall()]


class IsolationTests(unittest.TestCase):
    def setUp(self):
        self.store=SQLiteStore()
        self.runs=RegistryRuns(self.store)

    def test_migrate_legacy_without_polluting_current(self):
        mixed={'KV03':{'history':[{'team':'OLD TEAM','at':9}]}}
        self.store._execute('INSERT INTO velocity_spotter_shared_registry VALUES(?,?,?)',('w',json.dumps(mixed),100))
        new=self.runs.current('w',circuit_id='Dunois',session_title='12H October')
        self.assertEqual(json.loads(new['registry_json']),{})
        archive=self.runs.archives('w')
        self.assertEqual(len(archive),1)
        self.assertEqual(json.loads(archive[0]['registry_json']),mixed)
        self.assertEqual(json.loads(self.store._execute('SELECT registry_json FROM velocity_spotter_shared_registry WHERE workspace_id=?',('w',),fetchone=True)['registry_json']),mixed)

    def test_two_races_same_circuit_have_distinct_kv_history(self):
        first=self.runs.current('w',circuit_id='Dunois',session_title='RACE 1')
        self.assertTrue(self.runs.save('w',first['run_id'],{'KV03':{'history':[{'team':'ALPHA','at':1}]}},circuit_id='Dunois',session_title='RACE 1')[0])
        second=self.runs.current('w',circuit_id='Dunois',session_title='RACE 2',new_run=True)
        self.assertNotEqual(first['run_id'],second['run_id'])
        self.assertEqual(json.loads(second['registry_json']),{})
        self.assertFalse(self.runs.save('w',first['run_id'],{'KV03':{'history':[{'team':'ALPHA','at':1}]}},circuit_id='Dunois',session_title='RACE 2')[0])
        self.assertTrue(self.runs.save('w',second['run_id'],{'KV03':{'history':[{'team':'BETA','at':2}]}},circuit_id='Dunois',session_title='RACE 2')[0])
        self.assertEqual([h['team'] for h in json.loads(self.runs.current('w',circuit_id='Dunois',session_title='RACE 2')['registry_json'])['KV03']['history']],['BETA'])
        self.assertEqual(json.loads(self.runs.archives('w')[0]['registry_json'])['KV03']['history'][0]['team'],'ALPHA')

    def test_run_unchanged_when_context_temporarily_absent(self):
        first=self.runs.current('w',circuit_id='Dunois',session_title='Endurance')
        second=self.runs.current('w',circuit_id='',session_title='')
        self.assertEqual(first['run_id'],second['run_id'])

    def test_title_observed_before_run_does_not_rotate_back(self):
        first=self.runs.current('w',circuit_id='Dunois',session_title='OLDER')
        second=self.runs.current('w',circuit_id='Dunois',session_title='NEWER',title_observed_at_ms=10**16)
        self.assertEqual(first['run_id'],second['run_id'])
        again=self.runs.current('w',circuit_id='Dunois',session_title='OLDER',title_observed_at_ms=1)
        self.assertEqual(second['run_id'],again['run_id'])

    def test_circuit_switch_and_session_id(self):
        first=self.runs.current('w',circuit_id='Dunois',session_id='S1')
        second=self.runs.current('w',circuit_id='Bresse',session_id='S2',new_run=True)
        self.assertNotEqual(first['run_id'],second['run_id'])
        third=self.runs.current('w',circuit_id='Bresse',session_id='S3',new_run=True)
        self.assertNotEqual(second['run_id'],third['run_id'])

    def test_explicit_new_race_same_name(self):
        a=self.runs.current('w',circuit_id='Dunois',session_title='ENDURANCE')
        b=self.runs.current('w',circuit_id='Dunois',session_title='ENDURANCE',new_run=True)
        self.assertNotEqual(a['run_id'],b['run_id'])
        self.assertEqual(len(self.runs.archives('w')),1)

    def test_workspaces_isolated(self):
        a=self.runs.current('Alice',circuit_id='Dunois',session_title='RACE')
        b=self.runs.current('Bob',circuit_id='Dunois',session_title='RACE')
        self.runs.save('Alice',a['run_id'],{'KV01':{'history':[{'team':'Alice','at':1}]}},circuit_id='Dunois',session_title='RACE')
        self.assertEqual(json.loads(self.runs.current('Bob',circuit_id='Dunois',session_title='RACE')['registry_json']),{})

    def test_existing_run_adds_history_without_crossing_run(self):
        a=self.runs.current('w',circuit_id='A',session_title='R')
        for i in range(3):
            self.runs.save('w',a['run_id'],{'KV09':{'history':[{'team':str(i),'at':i}]}},circuit_id='A',session_title='R')
        self.assertEqual(len(json.loads(self.runs.current('w',circuit_id='A')['registry_json'])['KV09']['history']),3)
        b=self.runs.current('w',circuit_id='A',session_title='R',new_run=True)
        self.assertEqual(json.loads(b['registry_json']),{})


if __name__=='__main__': unittest.main()
