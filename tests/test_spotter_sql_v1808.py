"""Offline SQL regression tests: run `python tests/test_spotter_sql_v1808.py`."""
import json
import ast
import threading
import time
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from data_recorder import RecorderStore


class SpotterSQLTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        os.environ.pop('DATABASE_URL', None)
        self.store = RecorderStore(Path(self.temp.name))

    def tearDown(self):
        self.temp.cleanup()

    def test_legacy_snapshot_survives_and_conflicting_write_is_rejected(self):
        old = {"app_release":"7.2.1806","revision":87,"queue":[{"kv":"KV34"}],"incoming":[],"maintenance":[]}
        self.store._execute("INSERT INTO velocity_spotter_shared_state(workspace_id,revision,snapshot_json,updated_at_ms) VALUES(?,?,?,?)",
                            ('ABC',87,json.dumps(old),1))
        row=self.store._execute("SELECT revision,snapshot_json FROM velocity_spotter_shared_state WHERE workspace_id=?",('ABC',),fetchone=True)
        self.assertEqual(row['revision'],87)
        self.assertEqual(json.loads(row['snapshot_json'])['app_release'],'7.2.1806')
        blocked=self.store._execute("""INSERT INTO velocity_spotter_shared_state(workspace_id,revision,snapshot_json,updated_at_ms)
            VALUES(?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE
            SET revision=excluded.revision,snapshot_json=excluded.snapshot_json,updated_at_ms=excluded.updated_at_ms
            WHERE velocity_spotter_shared_state.revision=? RETURNING revision""",
            ('ABC',1,'{}',2,0),fetchone=True)
        self.assertIsNone(blocked)
        updated=self.store._execute("""INSERT INTO velocity_spotter_shared_state(workspace_id,revision,snapshot_json,updated_at_ms)
            VALUES(?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE
            SET revision=excluded.revision,snapshot_json=excluded.snapshot_json,updated_at_ms=excluded.updated_at_ms
            WHERE velocity_spotter_shared_state.revision=? RETURNING revision""",
            ('ABC',88,json.dumps({**old,'app_release':'7.2.1808','revision':88}),3,87),fetchone=True)
        self.assertEqual(updated['revision'],88)

    def test_persistent_workspaces_across_restart(self):
        data={"workspaces":[{"id":"W1","owner_email":"owner@example.com","members":["owner@example.com"]}]}
        self.store._execute("""INSERT INTO velocity_workspaces_shared(state_id,revision,payload_json,updated_at_ms)
              VALUES('global',0,?,?) ON CONFLICT(state_id) DO NOTHING""",(json.dumps(data),1))
        second=RecorderStore(Path(self.temp.name))
        row=second._execute("SELECT revision,payload_json FROM velocity_workspaces_shared WHERE state_id='global'",fetchone=True)
        self.assertEqual(json.loads(row['payload_json']),data)
        revision=row['revision']
        ok=second._execute("UPDATE velocity_workspaces_shared SET revision=? WHERE state_id='global' AND revision=? RETURNING revision",
                           (revision+1,revision),fetchone=True)
        self.assertEqual(ok['revision'],1)
        stale=self.store._execute("UPDATE velocity_workspaces_shared SET revision=? WHERE state_id='global' AND revision=? RETURNING revision",
                                  (1,0),fetchone=True)
        self.assertIsNone(stale)

    def test_single_monitor_lease(self):
        sql="""INSERT INTO velocity_spotter_monitor_lease(workspace_id,client_id,expires_at_ms) VALUES(?,?,?)
         ON CONFLICT(workspace_id) DO UPDATE SET client_id=excluded.client_id,expires_at_ms=excluded.expires_at_ms
         WHERE velocity_spotter_monitor_lease.client_id=excluded.client_id OR velocity_spotter_monitor_lease.expires_at_ms<?
         RETURNING client_id,expires_at_ms"""
        first=self.store._execute(sql,('W1','mobile',5000,1000),fetchone=True)
        self.assertEqual(first['client_id'],'mobile')
        refused=self.store._execute(sql,('W1','desktop',5500,2000),fetchone=True)
        self.assertIsNone(refused)
        renewed=self.store._execute(sql,('W1','mobile',7000,2000),fetchone=True)
        self.assertEqual(renewed['client_id'],'mobile')
        recovered=self.store._execute(sql,('W1','desktop',12000,8000),fetchone=True)
        self.assertEqual(recovered['client_id'],'desktop')


class WorkspaceResolutionTest(unittest.TestCase):
    def test_paired_device_uses_persistent_workspace_without_course(self):
        module=ast.parse((ROOT/'app.py').read_text(encoding='utf8'))
        fn=next(node for node in module.body if isinstance(node,ast.FunctionDef) and node.name=='_paired_device_workspace_id')
        env={'has_request_context':lambda:True,'TEAM_DATA':{'devices':{'PHONE':{'member_id':'M1','workspace_id':'WORKSPACE-SHARED'}},'sessions':[]},
             'TEAM_DATA_LOCK':threading.RLock(),'_refresh_team_data':lambda:None,'request':type('Request',(),{'headers':{},'cookies':{'velocity_device_id':'PHONE'}})()}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),str(ROOT/'app.py'),'exec'),env)
        self.assertEqual(env['_paired_device_workspace_id'](),'WORKSPACE-SHARED')
        env['TEAM_DATA']['devices']['PHONE'].pop('workspace_id')
        self.assertIsNone(env['_paired_device_workspace_id']())
        env['TEAM_DATA']['sessions']=[{'workspace_id':'RACE-SHARED','status':'active','created_at_ms':1,'assignments':{'spotter':['M1']}}]
        self.assertEqual(env['_paired_device_workspace_id'](),'RACE-SHARED')

if __name__ == '__main__':
    unittest.main(verbosity=2)
