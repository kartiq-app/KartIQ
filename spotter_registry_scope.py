"""Isolation and non-destructive archiving of Velocity Spotter kart registries.

A KV identifier belongs to a physical kart only *within a run*: neither the
workspace ID nor the Apex kart number is a safe race identifier. Old unscoped
registries are preserved as legacy archives, never merged into a new run.
"""
from __future__ import annotations

import json
from copy import deepcopy
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
                title_observed_at_ms=0, circuit_observed_at_ms=0, new_run=False,
                explicit_circuit_change=False):
        """Resolve active course without inferring race identity from Apex titles.

        Empty context values mean 'not yet received', not a new course.
        Only an explicit circuit selection, explicit Session Course creation or
        explicit new course rotates the registry. Passive GETs or saves from
        worker-local STATE can NEVER rotate a race. Apex titles are metadata.
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
            # V1813: passive requests must NEVER create a new run.  Render
            # workers keep independent STATE and can briefly disagree about
            # circuit_id or session_id, even with a shared PostgreSQL store.
            # Only /api/circuit explicitly selecting a different circuit and
            # /api/race-session/create explicitly creating a new Session may
            # rotate the registered course. A GET cannot blank a live table.
            if (explicit_circuit_change and circuit and row.get("circuit_id")
                    and circuit != row["circuit_id"]):
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

    def save(self, workspace, run_id, clean, *, base_updated_at_ms=None, circuit_id="", session_id="", session_title="",
             title_observed_at_ms=0, circuit_observed_at_ms=0):
        """No data from another run can enter the current registry."""
        with self.store._lock:
            current=self.current(workspace,circuit_id=circuit_id,session_id=session_id,session_title=session_title,
                                 title_observed_at_ms=title_observed_at_ms,circuit_observed_at_ms=circuit_observed_at_ms)
            if not run_id or str(run_id)!=str(current["run_id"]):
                return False,current
            # The run identifier protects race isolation; the server revision
            # additionally protects all fields inside an individual KV against
            # stale mobile/desktop snapshots. Existing internal callers without
            # a revision remain supported for migrations/tests, while the API
            # requires the revision on every client write.
            baseline = int(current.get("updated_at_ms") or 0)
            if base_updated_at_ms is not None and int(base_updated_at_ms) != baseline:
                # V1817: a stale whole-registry snapshot must NEVER overwrite
                # speeds, trace, team labels or previously recorded event scores.
                # But NEW immutable history events are independent operations:
                # preserve them even when another client published first.
                authoritative = _read_json(current.get("registry_json"))
                changes = 0
                for kv, incoming_row in clean.items():
                    if not isinstance(incoming_row, dict):
                        continue
                    previous_row = authoritative.get(kv)
                    # A NEW independent KV is a valid concurrent creation,
                    # including before its first relay has been scored.
                    if previous_row is None:
                        authoritative[kv] = deepcopy(incoming_row)
                        changes += 1
                        continue
                    prior_history = previous_row.get("history") or []
                    if not isinstance(prior_history, list):
                        prior_history = []
                    previous_ids = {(str(e.get("team")), str(e.get("at")))
                                    for e in prior_history if isinstance(e, dict)}
                    new_events = []
                    for event in (incoming_row.get("history") or []):
                        if not isinstance(event, dict) or not str(event.get("team") or "").strip():
                            continue
                        try:
                            timestamp = int(event.get("at"))
                        except (TypeError, ValueError):
                            continue
                        if timestamp <= 0:
                            continue
                        event_id = (str(event.get("team")), str(timestamp))
                        if event_id in previous_ids:
                            continue
                        previous_ids.add(event_id)
                        new_events.append(event)
                    if not new_events:
                        continue
                    previous_row["history"] = sorted(prior_history + new_events,
                        key=lambda h: int(h.get("at") or 0))
                    changes += len(new_events)
                if not changes:
                    return False, current
                # The lock protects both reads and CAS writes in this worker;
                # SQL CAS still protects against writes by other workers.
                now = max(int(time.time()*1000), baseline+1)
                updated = self.store._execute(
                    """UPDATE velocity_spotter_registry_runs SET registry_json=?,updated_at_ms=?
                    WHERE workspace_id=? AND run_id=? AND updated_at_ms=? RETURNING run_id""",
                    (_json(authoritative), now, workspace, run_id, baseline),fetchone=True)
                if not updated:
                    return False, self._row(workspace)
                return True, {**current, "registry_json": _json(authoritative),
                              "updated_at_ms": now, "history_merge_only": True,
                              "history_events_added": changes}
            merged=_read_json(current.get("registry_json"))
            for kv,row in clean.items():
                old=merged.get(kv) or {}
                previous=old.get("history") or []
                incoming=row.get("history") or []
                keyed={(str(h.get("team")),str(h.get("at"))):h for h in previous if isinstance(h,dict)}
                for event in incoming:
                    if isinstance(event,dict):
                        key=(str(event.get("team")),str(event.get("at")))
                        prior=keyed.get(key)
                        if prior is None or int(event.get("updatedAt") or event.get("at") or 0) >= int(prior.get("updatedAt") or prior.get("at") or 0):
                            keyed[key]=event
                # Archive every recorded passage; any UI limit belongs solely
                # to the renderer, never to the authoritative SQL JSON.
                combined=sorted(keyed.values(),key=lambda h:int(h.get("at") or 0))
                merged[kv]={**old,**row,"history":combined}
            now=max(int(time.time()*1000),baseline+1)
            result=self.store._execute(
                """UPDATE velocity_spotter_registry_runs SET registry_json=?,updated_at_ms=?
                WHERE workspace_id=? AND run_id=? AND updated_at_ms=? RETURNING run_id""",
                (_json(merged),now,workspace,run_id,baseline),fetchone=True,
            )
            if not result:return False,self._row(workspace)
            return True,{**current,"registry_json":_json(merged),"updated_at_ms":now}

    def archives(self, workspace):
        return self.store._execute(
            """SELECT * FROM velocity_spotter_registry_archive
            WHERE workspace_id=? ORDER BY archived_at_ms DESC""",
            (workspace,), fetchall=True) or []
