"""Guard against reintroducing the retired VVCE engine into Analyzer/Render."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_virtual_ranking_is_removed_from_ui_and_endpoints():
    html = (ROOT / 'templates/index.html').read_text()
    js = (ROOT / 'static/js/endurance/analyzer.js').read_text()
    backend = (ROOT / 'app.py').read_text()
    assert 'analyzerVirtualRankingBtn' not in html
    assert 'analyzerVVCEReport' not in html
    assert '/api/vvce/' not in backend
    assert 'analyzerVVCEActivate' not in js
    assert not (ROOT / 'backend/services/vvce_server.py').exists()


def test_kv_capture_still_has_explicit_trigger_and_independent_scoring():
    js = (ROOT / 'static/js/endurance/analyzer.js').read_text()
    backend = (ROOT / 'app.py').read_text()
    recorder = (ROOT / 'data_recorder.py').read_text()
    assert "fetch('/api/spotter-kv-tracking'" in js
    assert '@app.post("/api/spotter-kv-tracking")' in backend
    assert 'KV_TRACK_V1851:' in recorder
    assert 'apply_recorder_scores' in recorder
    assert 'manager.store.request_stop' in backend
