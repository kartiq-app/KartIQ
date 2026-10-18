"""Non-destructive validation of Velocity Quick Change snapshots.

A snapshot is never accepted if its visible queue could reserve one entrant
into two physical karts. This guard runs *before* the SQL revision CAS.
"""
from __future__ import annotations


def spotter_snapshot_error(snapshot):
    queue = snapshot.get('queue') or []
    maintenance = snapshot.get('maintenance') or []
    incoming = snapshot.get('incoming') or []
    assignments = snapshot.get('assignments') or {}
    if not isinstance(queue, list) or not isinstance(maintenance, list) or not isinstance(incoming, list) or not isinstance(assignments, dict):
        return 'Structure Spotter invalide'
    reserved = {}
    kv_places = {}
    card_ids = set()
    for source, cards in (('file', queue), ('maintenance', maintenance)):
        for item in cards:
            if not isinstance(item, dict):
                return 'Carte Spotter invalide'
            card_id = str(item.get('cardId') or '').strip()
            if card_id:
                if card_id in card_ids:
                    return 'Une carte figure à plusieurs emplacements'
                card_ids.add(card_id)
            kv = str(item.get('kv') or '').strip()
            if kv:
                if kv in kv_places:
                    return f'Kart {kv} présent dans deux emplacements'
                kv_places[kv] = source
            if item.get('status') != 'reserved':
                continue
            team = str(item.get('reservedTeam') or '').strip()
            if not team:
                return 'Kart réservé sans équipe'
            if team in reserved:
                return f'Double réservation interdite pour {team}'
            reserved[team] = kv
            assignment = assignments.get(team)
            if isinstance(assignment, dict):
                pending = assignment.get('pendingReplacementKv')
                if pending and str(pending) != kv:
                    return f'Affectation incohérente pour {team}'
    for team, assignment in assignments.items():
        if not isinstance(assignment, dict):
            continue
        kv = str(assignment.get('kv') or '').strip()
        if assignment.get('status') == 'track' and kv and kv in kv_places:
            return f'Kart {kv} simultanément en piste et en file'
    for entrant in incoming:
        if isinstance(entrant, dict) and str(entrant.get('team') or '') in reserved:
            return 'Une équipe validée figure encore dans les entrants'
    return None
