"""Server-side, race-scoped KV scoring from explicitly enabled Recorder evidence.

Invoked ONLY from the recorder score worker, never from the Apex WebSocket
callback or /api/state hot path. A missing recorder/session/team association is
NOT grounds to infer a physical kart. Initial-live teams stay provisional.
"""
from __future__ import annotations

import json
import math
import time
from copy import deepcopy
from spotter_registry_scope import RegistryRuns, _chronological_history
from backend.services.kart_scoring_scope import KartScoringScope


def _valid_time(value):
    try:
        n = float(value)
        return n if math.isfinite(n) and 20 < n < 400 else None
    except (ValueError, TypeError):
        return None


def _filtered(samples):
    numbers = [n for n in (_valid_time(x) for x in samples) if n is not None]
    if not numbers:
        return []
    fastest = sorted(numbers)[:max(3, math.ceil(len(numbers)*.6))]
    med = sorted(fastest)[len(fastest)//2] if len(fastest)%2 else (sorted(fastest)[len(fastest)//2-1]+sorted(fastest)[len(fastest)//2])/2
    return [n for n in numbers if n <= med+max(5,med*.05)]


def _window(laps):
    """Equivalent to client scoring: best six of last ten after 8 valid laps."""
    recent=_filtered(laps[-10:])
    if len(laps) >= 8 and len(recent) >= 8:
        return sum(sorted(recent)[:6])/6, False
    if not recent:
        return None, True
    chosen=sorted(recent)[:max(1,math.ceil(len(recent)*.6))]
    return sum(chosen)/len(chosen), True


def _event_row(event):
    key=str(event.get('team') or '')
    if not key.startswith('apex:'):return None
    try:
        row=int(key[5:]);return row if row>0 else None
    except ValueError:
        return None


def _evaluate(registry, teams, run_started):
    """Map observed laps to identity intervals without transferring old teams."""
    measurements={}
    for kv,row in registry.items():
        if not isinstance(row,dict) or row.get('trace')=='interrupted':continue
        events=_chronological_history(row.get('history') or [])
        intervals=[]
        all_laps=[]
        for index,event in enumerate(events):
            row_id=_event_row(event)
            if row_id is None:continue
            # Each history entry owns its interval, not the entire team's race.
            start=max(int(run_started or 0),int(event.get('at') or 0))
            end=int(events[index+1].get('at') or 0) if index+1<len(events) else None
            bucket=teams.get(row_id) or teams.get(str(row_id)) or {}
            samples=[]
            for lap in bucket.get('laps') or []:
                # History backfill has retrieval time, NOT lap-passage time.
                # Never credit those laps to an individual KV/relay.
                if lap.get('origin') == 'backfill':continue
                at=int(lap.get('received_at_ms') or 0)
                seconds=_valid_time(lap.get('seconds'))
                if seconds is None or at<start or (end is not None and at>=end):continue
                samples.append((at,seconds))
            samples.sort()
            values=[value for _,value in samples]
            all_laps.extend(samples)
            # Only a currently observed relay receives the active score; old
            # historical scores are kept exactly as recorded.
            intervals.append((index,values,event))
        if not all_laps or not intervals:continue
        all_laps.sort()
        combined=[v for _,v in all_laps]
        # Best-ever qualified potential across recorded windows. No consistency
        # penalty: this evaluates raw speed only.
        best=None
        for end in range(8,len(combined)+1):
            window,provisional=_window(combined[max(0,end-10):end])
            if window is not None and not provisional:
                best=window if best is None else min(best,window)
        recent,provisional=_window(intervals[-1][1])
        # An initial-live KV is NOT a confirmed physical identity.
        auto=bool(row.get('autoProvisional'))
        measurements[kv]={'best':best,'recent':recent,'recentProvisional':provisional or auto,
                          'validLaps':len(combined),'relayLaps':len(intervals[-1][1]),
                          'activeIndex':intervals[-1][0], 'autoProvisional':auto}
    return measurements


def _score(value,reference):
    if value is None or reference is None:return None
    return round(max(0,min(100,100-1000*(value/reference-1))),1)


def apply_recorder_scores(store, recording_id, teams):
    """Best-effort SQL CAS update, called by the server recorder score thread.

    Returns the number of updated KVs. Safe under concurrent browsers and
    multiple Render workers; a stale run or recording is ignored.
    """
    state=store.get_race_team_state() or {}
    active=next((s for s in state.get('sessions',[]) if s.get('status')=='active'
                 and str(s.get('recorder_id') or '')==str(recording_id)),None)
    dedicated_run_id = None
    if active:
        workspace=str(active.get('workspace_id') or '')
        context={'circuit_id':str(active.get('circuit_id') or ''),
                 'session_id':str(active.get('id') or ''),
                 'session_title':str(active.get('name') or '')}
    else:
        # Only an explicitly started, still-active KV recorder is eligible.
        # A Lab recording or a stopped KV job must NEVER score a registry.
        rec = store.get_recording(recording_id)
        prefix = 'KV_TRACK_V1851:'
        name = str((rec or {}).get('name') or '')
        active_ids = {str(r.get('id')) for r in store.active_recordings()}
        if not name.startswith(prefix) or str(recording_id) not in active_ids:
            return 0
        identity = name[len(prefix):]
        if ':' not in identity:return 0
        workspace,dedicated_run_id = identity.rsplit(':',1)
        # Sessionless registry context has no Course session ID. Never create a
        # different run while scoring; read the current run by its real context.
        run_row = store._execute("SELECT circuit_id,session_id,session_title FROM velocity_spotter_registry_runs WHERE workspace_id=? AND run_id=?",
            (workspace,dedicated_run_id),fetchone=True)
        if not run_row:return 0
        context={'circuit_id':str(run_row.get('circuit_id') or ''),
                 'session_id':str(run_row.get('session_id') or ''),
                 'session_title':str(run_row.get('session_title') or '')}
        if context['session_id'] or context['circuit_id'] != str(rec.get('circuit_id') or ''):
            return 0
    if not workspace:return 0
    # Only short SQL queries take the store lock. Potentially expensive lap
    # aggregation happens OUTSIDE the shared recorder-store lock, ensuring
    # Apex lap persistence is never blocked by evaluating the fleet.
    scope=KartScoringScope(store).read(workspace,context)
    # Kart fixed/Quick Change is OPTIONAL for scoring: it only affects identity moves.
    if dedicated_run_id and scope['run_id'] != dedicated_run_id:return 0
    run=scope['registry']
    registry=json.loads(run.get('registry_json') or '{}')
    if not registry:return 0
    measures=_evaluate(registry, teams, int(run.get('started_at_ms') or 0))
    if not measures:return 0
    # Prefer confirmed physical identities for the common fleet baseline.
    # All-provisional startup remains comparable, but NEVER pretends that
    # its kart identity is already confirmed.
    confirmed=[x for x in measures.values() if not x['autoProvisional']]
    basis=confirmed or list(measures.values())
    reference=min((x['best'] if x['best'] is not None else x['recent']
                   for x in basis if x['best'] is not None or x['recent'] is not None),
                  default=None)
    if reference is None:return 0
    now=int(time.time()*1000)
    changed=0
    for kv,values in measures.items():
        row=registry[kv]
        potential=_score(values['best'],reference)
        recent_score=_score(values['recent'],reference)
        speed={'potential':values['best'],'recent':values['recent'],
               'confirmed':bool(values['best'] is not None and not values['autoProvisional']),
               'provisional':values['recentProvisional'],
               'validLaps':values['validLaps'],'relayLaps':values['relayLaps'],
               'epoch':scope['epoch'],'source':'server-recorder','reference':reference}
        prior=row.get('speed') or {}
        if all(prior.get(key)==value for key,value in speed.items()):continue
        speed['updatedAt']=now
        row['speed']=speed
        history=row.get('history') or []
        index=values['activeIndex']
        if index<len(history):
            event=history[index]
            if recent_score is not None:
                event['score']=recent_score
                event['scoreProvisional']=values['recentProvisional']
                event['scoreOrigin']='server-recorder'
                event['updatedAt']=now
        if potential is not None:
            row['analyzerPotential']=potential
            row['analyzerPotentialEpoch']=scope['epoch']
        history_score=row.setdefault('scoreHistory',[])
        if (prior.get('potential')!=speed['potential'] or prior.get('recent')!=speed['recent']):
            history_score.append({'at':now,'potential':values['best'],
                 'recent':values['recent'],'confirmed':speed['confirmed'],'epoch':scope['epoch']})
            row['scoreHistory']=history_score[-1500:]
        changed+=1
    if not changed:return 0
    baseline=int(run.get('updated_at_ms') or 0)
    stamped=max(now,baseline+1)
    saved=store._execute('''UPDATE velocity_spotter_registry_runs
        SET registry_json=?,updated_at_ms=? WHERE workspace_id=? AND run_id=?
        AND updated_at_ms=? RETURNING run_id''',
        (json.dumps(registry,ensure_ascii=False,separators=(',',':')),stamped,
         workspace,scope['run_id'],baseline),fetchone=True)
    return changed if saved else 0
