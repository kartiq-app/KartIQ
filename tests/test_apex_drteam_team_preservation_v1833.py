from apex_decoder import decode_frame
from apex_interpreter import ApexInterpreter


def test_drteam_does_not_replace_team_name():
    engine = ApexInterpreter()
    engine.set_schema({4: 'dr'}, {4: 'Equipe'})
    initial, _ = decode_frame('r165037c4|dr|LMA RACING SPORT')
    engine.apply(initial[0], initial=True)
    assert engine.rows[165037]['name'] == 'LMA RACING SPORT'
    updates, _ = decode_frame('r165037c4|drteam|JAOUI Rémi [0:46]')
    engine.apply(updates[0])
    assert engine.rows[165037]['name'] == 'LMA RACING SPORT'
    assert engine.rows[165037]['pilot'] == 'JAOUI Rémi'
    assert engine.rows[165037]['track_timer'] == '00:46:00'
    later, _ = decode_frame('r165037c4|drteam|AUTRE PILOTE')
    engine.apply(later[0])
    assert engine.rows[165037]['name'] == 'LMA RACING SPORT'
    assert engine.rows[165037]['pilot'] == 'AUTRE PILOTE'
