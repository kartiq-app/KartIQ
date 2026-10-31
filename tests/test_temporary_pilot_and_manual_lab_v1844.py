"""V1844 -- scoped anonymous Pilot links and independent manual Apex Recorder."""
import copy
import hashlib
import os
import unittest
from unittest.mock import patch

try:
    import app as velocity
except ModuleNotFoundError as exc:
    if exc.name not in {'flask', 'werkzeug', 'jinja2', 'psycopg'}:
        raise
    velocity = None


@unittest.skipIf(velocity is None, 'Flask runtime unavailable in this test environment')
class TemporaryPilotAccessTests(unittest.TestCase):
    def setUp(self):
        self.now = 1_800_000_000.0
        self.team = {
            "teams": [], "invites": {}, "devices": {}, "active_session_id": None,
            "active_session_ids": {"W1": "R1"},
            "sessions": [{"id": "R1", "workspace_id": "W1", "status": "active",
                          "circuit_id": "track1", "team_name": "TEAM TEST", "name": "12H"}],
            "pilot_links": {},
        }
        self.patchers = [
            patch.object(velocity, 'TEAM_DATA', self.team),
            patch.object(velocity, '_refresh_team_data', lambda: None),
            patch.object(velocity, '_save_team_data', lambda *a, **kw: None),
            patch.object(velocity, '_workspace_for_authorized_email', lambda *a, **kw: {'id': 'W1'}),
            patch.object(velocity, 'RUNTIMES', {}),
            patch.object(velocity, '_get_recorder_manager', lambda: type('M', (), {'store':type('Store', (), {'persistent':True})()})()),
            patch.object(velocity, '_velocity_paired_device', lambda: None),
            patch.object(velocity, '_velocity_allowed_emails', lambda: {'admin@example.fr'}),
            patch.object(velocity.time, 'time', lambda: self.now),
        ]
        for p in self.patchers: p.start()
        runtime=velocity._runtime_for_workspace('W1')
        runtime.state.update(circuit_id='track1', followed_driver='TEAM TEST',
                             drivers=[{'apex_row':27,'driver':'TEAM TEST','pos':7,'status':'track','last':'1:12.345','pit_stops':2}])
        self.admin = velocity.app.test_client()
        with self.admin.session_transaction() as sess:
            sess['velocity_email'] = 'admin@example.fr'
        self.pilot = velocity.app.test_client()

    def tearDown(self):
        for p in reversed(self.patchers): p.stop()

    def issue(self, hours=3):
        result = self.admin.post('/api/pilot-access', json={'hours': hours})
        self.assertEqual(result.status_code, 201, result.get_json())
        return result.get_json()

    def test_guest_access_is_read_only_and_requires_no_email(self):
        issued = self.issue()
        token = issued['link'].split('/join/')[1]
        entry = self.team['pilot_links'][issued['id']]
        self.assertEqual(entry['token_hash'], hashlib.sha256(token.encode()).hexdigest())
        self.assertNotIn(token, str(self.team))
        response = self.pilot.get('/join/' + token)
        self.assertEqual(response.status_code, 200)
        self.assertIn('velocity_pilot_guest=', response.headers.get('Set-Cookie',''))
        self.assertIn('no-referrer', response.headers.get('Referrer-Policy',''))
        self.assertEqual(self.pilot.get('/api/race-access/' + token).status_code, 200)
        self.assertEqual(self.pilot.get('/api/state').status_code, 200)
        self.assertEqual(self.pilot.post('/api/analyzer-rules', json={'rules': {}}).status_code, 403)
        self.assertEqual(self.pilot.get('/api/lab/recorders').status_code, 403)
        self.assertEqual(self.pilot.get('/api/teams').status_code, 403)
        self.assertEqual(self.pilot.get('/').status_code, 403)

    def test_pilot_install_iphone_android_and_standalone_launch(self):
        issued = self.issue(hours=3)
        token = issued['link'].split('/join/')[1]
        landing = self.pilot.get('/join/' + token)
        self.assertEqual(landing.status_code, 200)
        self.assertIn(b'Installer Velocity Pilote', landing.data)
        self.assertIn(b'Safari', landing.data)
        self.assertIn(b'Chrome', landing.data)
        self.assertIn(b'beforeinstallprompt', landing.data)
        self.assertIn(b'navigator.standalone', landing.data)
        self.assertNotIn(b'Architecture 5 modes', landing.data)
        self.assertIn('no-store', landing.headers.get('Cache-Control', ''))
        manifest_response = self.pilot.get(f'/join/{token}/manifest.webmanifest')
        self.assertEqual(manifest_response.status_code, 200)
        manifest = manifest_response.get_json()
        self.assertEqual(manifest['start_url'], f'/join/{token}?launch=1')
        self.assertEqual(manifest['scope'], '/join/')
        self.assertEqual(manifest['orientation'], 'landscape')
        self.assertEqual(manifest['display'], 'standalone')
        self.assertNotEqual(manifest['id'], '/')
        worker = self.pilot.get('/join/pilot-sw.js')
        self.assertEqual(worker.status_code, 200)
        self.assertIn(b'self.addEventListener', worker.data)
        self.assertNotIn(b'caches.open', worker.data)
        launch = self.pilot.get('/join/' + token + '?launch=1')
        self.assertEqual(launch.status_code, 200)
        self.assertIn(b'enduranceFocus', launch.data)
        self.assertIn(f'/join/{token}/manifest.webmanifest'.encode(), launch.data)
        self.assertEqual(self.pilot.get('/api/race-access/' + token).status_code, 200)
        self.assertEqual(self.pilot.post('/api/pilot-access', json={}).status_code, 403)
        self.team['pilot_links'][issued['id']]['revoked'] = True
        self.assertEqual(self.pilot.get(f'/join/{token}/manifest.webmanifest').status_code, 410)
        self.assertEqual(self.pilot.get('/join/' + token + '?launch=1').status_code, 410)

    def test_expiry_revocation_and_session_end_are_server_enforced(self):
        issued = self.issue(hours=1)
        token = issued['link'].split('/join/')[1]
        self.pilot.get('/join/' + token)
        self.assertEqual(self.pilot.get('/api/state').status_code, 200)
        self.now += 3601
        self.assertNotEqual(self.pilot.get('/api/state').status_code, 200)
        self.assertEqual(self.pilot.get('/join/' + token).status_code, 410)
        issued2 = self.issue(hours=3)
        token2 = issued2['link'].split('/join/')[1]
        self.assertEqual(self.pilot.get('/join/' + token2).status_code, 200)
        self.assertEqual(self.admin.post('/api/pilot-access/'+issued2['id']+'/revoke').status_code, 200)
        self.assertEqual(self.pilot.get('/api/race-access/' + token2).status_code, 403)
        issued3 = self.issue(hours=3)
        token3 = issued3['link'].split('/join/')[1]
        self.assertEqual(self.pilot.get('/join/' + token3).status_code, 200)
        self.team['sessions'][0]['status'] = 'ended'
        self.assertEqual(self.pilot.get('/join/' + token3).status_code, 410)

    def test_admin_required_and_session_required(self):
        self.assertEqual(self.pilot.post('/api/pilot-access', json={'hours':3}).status_code, 403)
        self.assertEqual(self.admin.post('/api/pilot-access', json={'hours':25}).status_code, 400)
        self.team['sessions'][0]['status'] = 'ended'
        # A Session Course is NOT required for the temporary Focus link.
        self.assertEqual(self.admin.post('/api/pilot-access', json={'hours':3,'apex_row':'27'}).status_code, 201)

    def test_no_session_pilot_link_stays_bound_to_circuit(self):
        self.team['sessions'][0]['status'] = 'ended'
        issued=self.issue(hours=3)
        token=issued['link'].split('/join/')[1]
        self.assertEqual(self.pilot.get('/join/'+token).status_code, 200)
        with self.pilot.session_transaction() as sess:
            self.assertFalse(sess.get('velocity_email'))
        self.assertEqual(self.pilot.get('/api/state').status_code, 200)
        self.assertEqual(self.team['pilot_links'][issued['id']]['workspace_id'], 'W1')
        velocity._runtime_for_workspace('W1').state['circuit_id']='other'
        self.assertEqual(self.pilot.get('/join/'+token).status_code,410)

    def test_lab_recorder_is_standalone_and_never_creates_race_session(self):
        class Manager:
            def create(self, name, circuit_id):
                return {'id': 'REC1', 'name': name, 'circuit_id': circuit_id}
        self.team['sessions'][0]['status'] = 'ended'
        before = copy.deepcopy(self.team)
        with patch.object(velocity, '_get_recorder_manager', return_value=Manager()), \
             patch.object(velocity, 'load_circuits', return_value=[{'id':'track1', 'name':'Track 1', 'websocket_url':'wss://example.invalid'}]):
            response = self.admin.post('/api/lab/recorders', json={'circuit_id':'track1', 'name':'Manual'} )
        self.assertEqual(response.status_code, 201, response.get_json())
        self.assertEqual(before, self.team)

if __name__ == '__main__': unittest.main()
