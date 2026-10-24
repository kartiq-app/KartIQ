"""Authoritative race-scoped kart mode and epoch.

The registry run_id IS the scoring epoch. Never derive scoring identity from
per-process STATE, Apex kart numbers or localStorage. All mode writes are SQL
serialized; the same persisted values are returned to every Render worker.
"""
from __future__ import annotations
import time
from spotter_registry_scope import RegistryRuns

class KartScoringScope:
    def __init__(self, store):
        self.store = store
        self.runs = RegistryRuns(store)

    def read(self, workspace, context):
        with self.store._lock:
            run = self.runs.current(workspace, **context)
            scope = self.store._execute(
                "SELECT run_id,mode FROM velocity_kart_scoring_scope WHERE workspace_id=?",
                (workspace,), fetchone=True)
            mode = str((scope or {}).get('mode') or '')
            if mode not in ('fixed', 'quick'):mode = ''
            # Mode is workspace choice; epoch is ALWAYS the actual KV run. A
            # course boundary may rotate the run without changing the mode.
            return {'run_id':run['run_id'], 'epoch':run['run_id'], 'mode':mode,
                    'registry':run}

    def select(self, workspace, context, *, mode=None, reset=False, expected_run_id=None):
        with self.store._lock:
            current = self.read(workspace, context)
            old_mode = current['mode']
            if expected_run_id and current['run_id'] != str(expected_run_id):
                return None, current
            if reset and not old_mode:
                raise ValueError('Choisissez d’abord un mode de course')
            if not reset and mode not in ('fixed','quick'):
                raise ValueError('Choisissez Kart fixe ou Quick Change')
            selected = old_mode if reset else mode
            # Changing between fixed/quick cannot preserve physical scoring.
            if reset or (old_mode and old_mode != selected):
                run = self.runs.current(workspace, **context, new_run=True)
            else:
                run = current['registry']
            now = int(time.time()*1000)
            self.store._execute('''INSERT INTO velocity_kart_scoring_scope
                (workspace_id,run_id,mode,updated_at_ms) VALUES(?,?,?,?)
                ON CONFLICT(workspace_id) DO UPDATE SET
                run_id=excluded.run_id,mode=excluded.mode,updated_at_ms=excluded.updated_at_ms''',
                (workspace,run['run_id'],selected,now))
            return {'run_id':run['run_id'],'epoch':run['run_id'],
                    'mode':selected,'registry':run}, current

    def rotate(self, workspace, context, *, expected_run_id):
        with self.store._lock:
            prior=self.read(workspace,context)
            if prior['run_id'] != str(expected_run_id):
                return None, prior
            run=self.runs.current(workspace, **context, new_run=True)
            if prior['mode']:
                self.store._execute('''INSERT INTO velocity_kart_scoring_scope
                    (workspace_id,run_id,mode,updated_at_ms) VALUES(?,?,?,?)
                    ON CONFLICT(workspace_id) DO UPDATE SET
                    run_id=excluded.run_id,mode=excluded.mode,updated_at_ms=excluded.updated_at_ms''',
                    (workspace,run['run_id'],prior['mode'],int(time.time()*1000)))
            return {'run_id':run['run_id'],'epoch':run['run_id'],
                    'mode':prior['mode'],'registry':run},prior
