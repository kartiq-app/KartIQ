"""Safety checks for removal of leftover VVCE recorders on Karts activation."""

from unittest.mock import Mock
import ast
from pathlib import Path
from types import SimpleNamespace

# Extract the standalone cleanup helper without importing the Flask runtime.
root = ast.parse((Path(__file__).resolve().parents[1] / 'app.py').read_text())
fn = next(node for node in root.body if isinstance(node, ast.FunctionDef)
          and node.name == '_retire_obsolete_vvce_recorders')
namespace = {'app': SimpleNamespace(logger=Mock())}
exec(compile(ast.Module(body=[fn], type_ignores=[]), 'app.py', 'exec'), namespace)
_retire_obsolete_vvce_recorders = namespace['_retire_obsolete_vvce_recorders']


def test_all_vvce_generations_removed_but_others_left_untouched():
    examples = [
        {'id': 'old-1864', 'name': 'VVCE_V1864:W:session', 'circuit_id': 'RKO'},
        {'id': 'old-1872', 'name': 'VVCE_V1872:W:session', 'circuit_id': 'RKO'},
        {'id': 'session', 'name': 'SESSION_V1796:ABCD', 'circuit_id': 'RKO'},
        {'id': 'kv', 'name': 'KV_TRACK_V1851:W:run', 'circuit_id': 'RKO'},
        {'id': 'lab', 'name': 'Velocity Lab', 'circuit_id': 'RKO'},
    ]
    manager = Mock()
    manager.store.active_recordings.return_value = examples
    count = _retire_obsolete_vvce_recorders(manager)
    assert count == 2
    assert [args.args[0] for args in manager.stop.call_args_list] == ['old-1864', 'old-1872']
    assert [args.args[0] for args in manager.store.request_stop.call_args_list] == ['old-1864', 'old-1872']


def test_circuit_specific_cleanup_does_not_disturb_other_circuits():
    manager = Mock()
    manager.store.active_recordings.return_value = [
        {'id': 'a', 'name': 'VVCE_V1864:W:session', 'circuit_id': 'RKO'},
        {'id': 'b', 'name': 'VVCE_V1864:W:session', 'circuit_id': 'MRK'},
    ]
    assert _retire_obsolete_vvce_recorders(manager, 'MRK') == 1
    manager.stop.assert_called_once_with('b')
