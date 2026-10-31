"""V1847 — security and permissions regression tests. Flask tests run on Render/CI."""
import ast
import hashlib
from pathlib import Path
import unittest
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]

try:
    import app as velocity
except ModuleNotFoundError as e:
    if e.name not in {'flask', 'werkzeug', 'jinja2', 'psycopg'}:
        raise
    velocity = None


class AccessStaticTests(unittest.TestCase):
    def test_pilot_install_removed_and_one_manifest(self):
        self.assertFalse((ROOT / 'templates/pilot_install.html').exists())
        self.assertTrue((ROOT / 'templates/access_invite.html').exists())
        html = (ROOT / 'templates/index.html').read_text()
        self.assertNotIn('velocityPilotGuestModal', html)
        self.assertNotIn('manifest.webmanifest', html)
        self.assertIn('velocityAccessModal', html)
        self.assertIn('velocityAccessRedeem', html)

    def test_guard_enforces_revocation_and_retires_old_urls(self):
        src = (ROOT / 'app.py').read_text()
        self.assertNotIn('def pilot_guest_manifest(', src)
        self.assertNotIn('def create_pilot_guest_link(', src)
        self.assertIn('path.startswith("/join/")', src)
        self.assertIn('"/api/state"', src)
        self.assertIn('"/api/access/me"', src)
        self.assertIn('VELOCITY_ACCESS_COOKIE', src)
        self.assertIn('if request.method in ("GET", "HEAD")', src)
        self.assertIn('strict_db=True', src)
        self.assertIn('previous["revoked"] = True', src)

    def test_python_syntax(self):
        ast.parse((ROOT / 'app.py').read_text())


@unittest.skipIf(velocity is None, 'Flask runtime unavailable in this environment')
class UniversalAccessIntegration(unittest.TestCase):
    def setUp(self):
        self.now = 1_800_000_000.0
        self.data = {'teams':[], 'invites':{}, 'devices':{}, 'sessions':[],
                     'active_session_id':None, 'active_session_ids':{}, 'access_grants':{}}
        self.patchers = [
            patch.object(velocity, 'TEAM_DATA', self.data),
            patch.object(velocity, '_refresh_team_data', lambda: None),
            patch.object(velocity, '_save_team_data', lambda *args, **kw: None),
            patch.object(velocity, '_velocity_access_store_ready', lambda: True),
            patch.object(velocity, '_workspace_for_authorized_email', lambda *a,**kw: {'id':'W1'}),
            patch.object(velocity, 'RUNTIMES', {}),
            patch.object(velocity, '_velocity_allowed_emails', lambda: {'admin@example.fr'}),
            patch.object(velocity.time, 'time', lambda: self.now),
        ]
        for p in self.patchers: p.start()
        runtime = velocity._runtime_for_workspace('W1')
        runtime.state.update(circuit_id='track1', followed_driver='TEAM TEST', drivers=[{'apex_row':27, 'driver':'TEAM TEST', 'pos':1}])
        self.admin = velocity.app.test_client()
        with self.admin.session_transaction() as sess:
            sess['velocity_email']='admin@example.fr'
        self.guest = velocity.app.test_client()

    def tearDown(self):
        for p in reversed(self.patchers): p.stop()

    def issue(self, name='Pilote test', modes=None, hours=3):
        result = self.admin.post('/api/access-grants', json={'name':name,'modes':modes or ['endurance'],'hours':hours})
        self.assertEqual(result.status_code, 201, result.get_json())
        return result.get_json()

    def test_install_once_and_server_side_read_only(self):
        issued = self.issue(modes=['endurance','spotter'])
        token = issued['link'].split('/access/')[1]
        self.assertEqual(self.guest.get('/access/'+token).status_code, 200)
        self.assertEqual(self.guest.get('/api/state').status_code, 403)
        activation = self.guest.post('/api/access/activate', json={'token':token})
        self.assertEqual(activation.status_code, 200, activation.get_json())
        self.assertIn('velocity_access_device=', activation.headers.get('Set-Cookie',''))
        self.assertEqual(self.guest.get('/').status_code, 200)
        self.assertEqual(self.guest.get('/api/state').status_code, 200)
        self.assertEqual(self.guest.get('/api/spotter-state').status_code, 200)
        self.assertEqual(self.guest.get('/api/analyzer-rules').status_code, 403)
        self.assertEqual(self.guest.post('/api/mode',json={'mode':'spotter'}).status_code, 403)
        self.assertEqual(self.guest.post('/api/race-session/end').status_code, 403)
        self.assertEqual(self.guest.post('/api/access-grants',json={}).status_code, 403)
        self.assertEqual(self.guest.get('/api/teams').status_code, 403)
        self.assertEqual(self.guest.get('/join/old').status_code, 410)

    def test_new_link_replaces_previous_and_revocation(self):
        old = self.issue('LUC', ['endurance'])
        token1 = old['link'].split('/access/')[1]
        self.assertEqual(self.guest.post('/api/access/activate', json={'token':token1}).status_code, 200)
        fresh = self.issue('luc', ['analyzer','qualification'])
        self.assertTrue(self.data['access_grants'][old['id']]['revoked'])
        self.assertEqual(self.guest.get('/api/state').status_code, 403)
        self.assertEqual(self.guest.post('/api/access/activate',json={'token':token1}).status_code, 410)
        token2 = fresh['link'].split('/access/')[1]
        self.assertEqual(self.guest.post('/api/access/activate',json={'token':token2}).status_code,200)
        self.assertEqual(self.guest.get('/api/analyzer-rules').status_code,200)
        self.assertEqual(self.guest.get('/api/spotter-state').status_code,403)
        self.assertEqual(self.admin.post('/api/access-grants/'+fresh['id']+'/revoke').status_code,200)
        self.assertEqual(self.guest.get('/api/state').status_code,403)

    def test_expiry_and_no_plaintext_token(self):
        issued = self.issue(hours=1)
        token = issued['link'].split('/access/')[1]
        record = self.data['access_grants'][issued['id']]
        self.assertEqual(record['token_hash'], hashlib.sha256(token.encode()).hexdigest())
        self.assertNotIn(token,str(self.data))
        self.assertEqual(self.guest.post('/api/access/activate',json={'token':token}).status_code,200)
        self.now += 3601
        self.assertEqual(self.guest.get('/api/state').status_code,403)
        self.assertEqual(self.guest.get('/access/'+token).status_code,410)

    def test_ios_pwa_cookie_isolation_allows_transfer(self):
        issued=self.issue()
        token=issued['link'].split('/access/')[1]
        self.assertEqual(self.guest.post('/api/access/activate',json={'token':token}).status_code,200)
        pwa=velocity.app.test_client()
        self.assertEqual(pwa.post('/api/access/activate',json={'token':token}).status_code,200)
        self.assertEqual(pwa.get('/api/state').status_code,200)
        self.assertEqual(self.guest.get('/api/state').status_code,403)


if __name__ == '__main__': unittest.main()
