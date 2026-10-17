"""Isolation and non-destructive archiving of Velocity Spotter kart registries.

A KV identifier belongs to a physical kart only *within a run*: neither the
workspace ID nor the Apex kart number is a safe race identifier. Old unscoped
registries are preserved as legacy archives, never merged into a new run.
"""
from __future__ import annotations

import json
import time
import uuid


def _json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _read_json(raw):
    try:
        value = json.loads(raw or "{}")
        return value if isinstance(value, dict) else {}
    except (ValueError, TypeError):
        return {}


def _title(value):
    return " ".join(str(value or "").split())[:180]


class RegistryRuns:
    """Atomic within a RecorderStore connection; all data lives in SQL."""

    def __init__(self, store):
        self.store = store

    def _row(self, workspace):
        return self.store._execute(
            "SELECT * FROM velocity_spotter_registry_runs WHERE workspace_id=?",
            (workspace,), fetchone=True)

    def _archive(self, workspace, row):
        if row is None:
            return
        self.store._execute(
            """INSERT INTO velocity_spotter_registry_archive
            (workspace_id,run_id,circuit_id,session_id,session_title,registry_json,started_at_ms,archived_at_ms)
            VALUES(?,?,?,?,?,?,?,?)
            ON CONFLICT(workspace_id,run_id) DO NOTHING""",
            (workspace, row["run_id"], row.get("circuit_id") or "",
             row.get("session_id") or "", row.get("session_title") or "",
             row.get("registry_json") or "{}", int(row.get("started_at_ms") or 0),
             int(time.time()*1000)),
        )

    def _new(self, workspace, circuit, session_id, title, *, expected_run_id=None):
        now = int(time.time()*1000)
        run_id = uuid.uuid4().hex
        if expected_run_id is None:
            # Two Render workers starting at the same time must agree on one id.
            self.store._execute(
                """INSERT INTO velocity_spotter_registry_runs
                (workspace_id,run_id,circuit_id,session_id,session_title,registry_json,started_at_ms,updated_at_ms)
                VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id) DO NOTHING""",
                (workspace,run_id,circuit,session_id,title,"{}",now,now),
            )
        else:
            # Cross-worker compare-and-swap: never replace a more recent run.
            self.store._execute(
                """UPDATE velocity_spotter_registry_runs SET
                run_id=?,circuit_id=?,session_id=?,session_title=?,
                registry_json=?,started_at_ms=?,updated_at_ms=?
                WHERE workspace_id=? AND run_id=?""",
                (run_id,circuit,session_id,title,"{}",now,now,workspace,expected_run_id),
            )
        return self._row(workspace)

    def current(self, workspace, *, circuit_id="", session_id="", session_title="",
                title_observed_at_ms=0, circuit_observed_at_ms=0, new_run=False):
        """Resolve active course without inferring race identity from Apex titles.

        Empty context values mean 'not yet received', not a new course.
        Only circuit changes, Session Course ids or an explicit reset rotate
        the registry. Apex title1/title2 are descriptive and can alternate.
        """
        workspace = str(workspace or "LEGACY")
        circuit = str(circuit_id or "").strip()[:128]
        session = str(session_id or "").strip()[:128]
        title = _title(session_title)
        title_seen = int(title_observed_at_ms or 0)
        circuit_seen = int(circuit_observed_at_ms or 0)
        with self.store._lock:
            row = self._row(workspace)
            if row is None:
                # One-time migration: old storage may contain several races.
                # Keep it intact AND archive it under an explicitly uncertain id.
                old = self.store._execute(
                    "SELECT registry_json,updated_at_ms FROM velocity_spotter_shared_registry WHERE workspace_id=?",
                    (workspace,), fetchone=True)
                if old and _read_json(old.get("registry_json")):
                    old_run = {
                        "run_id": "legacy-"+uuid.uuid4().hex,
                        "registry_json": old["registry_json"],
                        "started_at_ms": int(old.get("updated_at_ms") or 0),
                        "session_title": "HISTORIQUE ANCIEN — COURSE NON IDENTIFIÉE",
                        "circuit_id": "", "session_id": "",
                    }
                    self._archive(workspace,old_run)
                return self._new(workspace,circuit,session,title)
            rotate = bool(new_run)
            # An idle Render worker may still hold an old circuit/title. Never
            # let observations predating this run rotate the current register.
            since = int(row.get("started_at_ms") or 0)
            # A second Render worker can retain an old circuit in its own
            # process memory. Only a circuit selection observed AFTER this
            # run began can trigger rotation; a zero/old timestamp must not.
            if circuit and row.get("circuit_id") and circuit != row["circuit_id"] and circuit_seen >= since:
                rotate = True
            if session and row.get("session_id") and session != row["session_id"]:
                rotate = True
            # Apex emits title1 and title2 independently, and their labels may
            # alternate during ONE race (e.g. "ENDURANCE 12H" / "ENDURANCE").
            # A display title is metadata, not a stable race identifier: never
            # rotate the active KV register merely because this text changes.
            # Different races on the same circuit require a new Session Course
            # or the explicit "Nouvelle course KV" command.
            if rotate:
                self._archive(workspace,row)
                return self._new(workspace,circuit or row.get("circuit_id") or "",session,title,expected_run_id=row["run_id"])
            # Fill unknown metadata without changing the run id. In particular,
            # do NOT clear a registry when a second client finally loads Apex.
            updates={}
            if circuit and not row.get("circuit_id"):updates["circuit_id"]=circuit
            if session and not row.get("session_id"):updates["session_id"]=session
            if title and not row.get("session_title"):updates["session_title"]=title
            if updates:
                row={**row,**updates}
                self.store._execute(
                    """UPDATE velocity_spotter_registry_runs
                    SET circuit_id=?,session_id=?,session_title=? WHERE workspace_id=?""",
                    (row.get("circuit_id") or "",row.get("session_id") or "",
                     row.get("session_title") or "",workspace),
                )
            return row

    def save(self, workspace, run_id, clean, *, circuit_id="", session_id="", session_title="",
             title_observed_at_ms=0, circuit_observed_at_ms=0):
        """No data from another run can enter the current registry."""
        with self.store._lock:
            current=self.current(workspace,circuit_id=circuit_id,session_id=session_id,session_title=session_title,
                                 title_observed_at_ms=title_observed_at_ms,circuit_observed_at_ms=circuit_observed_at_ms)
            if not run_id or str(run_id)!=str(current["run_id"]):
                return False,current
            merged=_read_json(current.get("registry_json"))
            for kv,row in clean.items():
                old=merged.get(kv) or {}
                previous=old.get("history") or []
                incoming=row.get("history") or []
                keyed={(str(h.get("team")),str(h.get("at"))):h for h in previous if isinstance(h,dict)}
                for event in incoming:
                    if isinstance(event,dict):
                        keyed[(str(event.get("team")),str(event.get("at")))]=event
                combined=sorted(keyed.values(),key=lambda h:int(h.get("at") or 0))[-80:]
                merged[kv]={**old,**row,"history":combined}
            now=int(time.time()*1000)
            result=self.store._execute(
                """UPDATE velocity_spotter_registry_runs SET registry_json=?,updated_at_ms=?
                WHERE workspace_id=? AND run_id=? RETURNING run_id""",
                (_json(merged),now,workspace,run_id),fetchone=True,
            )
            if not result:return False,self._row(workspace)
            return True,{**current,"registry_json":_json(merged),"updated_at_ms":now}

    def archives(self, workspace):
        return self.store._execute(
            """SELECT * FROM velocity_spotter_registry_archive
            WHERE workspace_id=? ORDER BY archived_at_ms DESC""",
            (workspace,), fetchall=True) or []
