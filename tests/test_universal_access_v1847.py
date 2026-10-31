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

    def test_access_is_unbound_and_home_menu_replaces_overlay_button(self):
        html = (ROOT / 'templates/index.html').read_text()
        css = (ROOT / 'static/css/60-analyzer.css').read_text()
        js = (ROOT / 'static/js/endurance/analyzer.js').read_text()
        core = (ROOT / 'static/js/core/core.js').read_text()
        self.assertNotIn('velocityAccessTarget', html)
        self.assertNotIn('velocityAccessTarget', js)
        self.assertIn('id="velocityAccessRedeemButton"', html)
        self.assertIn('class="velocity-access-menu-button"', html)
        self.assertIn('.velocity-invited-user .home-circuit{display:block!important}', css)
        self.assertNotIn("setTimeout(()=>openEnduranceFocus()", js.split("function velocityApplyAccess(data){",1)[1].split("async function velocityAccessCheck()",1)[0])
        self.assertIn('closeApexBrowserSocket()', js)
        self.assertNotIn('||window.VELOCITY_INVITED_ACCESS)return;', core)
        self.assertIn('velocityAccessModes=modes', js)

    def test_runtime_is_isolated_from_administrator_workspace(self):
        src = (ROOT / 'app.py').read_text()
        self.assertIn('def _velocity_guest_runtime_id(', src)
        self.assertIn('return _velocity_guest_runtime_id(grant)', src)
        self.assertIn('"/api/circuit", "/api/follow", "/api/apex/frame", "/api/apex/status"', src)
        self.assertIn('if _velocity_is_authorized():\n        try:\n            RegistryRuns', src)
        self.assertIn('if not guest_live:', src)
        self.assertNotIn('pilot_focus_driver": str((driver', src)

    def test_remote_focus_logic_stays_independent_of_apex_and_links(self):
        src = (ROOT / 'app.py').read_text()
        sql = (ROOT / 'data_recorder.py').read_text()
        ui = (ROOT / 'static/js/endurance/analyzer.js').read_text()
        self.assertIn('velocity_access_focus_control', sql)
        self.assertIn('def put_access_focus_presence(', sql)
        self.assertIn('def put_access_focus_command(', sql)
        self.assertIn('def set_access_remote_focus(', src)
        self.assertIn('def get_access_focus_command(', src)
        self.assertIn('def report_access_focus_presence(', src)
        self.assertIn('VELOCITY_REMOTE_FOCUS_TTL_MS', src)
        self.assertIn('velocityGuestFocusCheckCommand', ui)
        self.assertIn('velocityGuestFocusSendPresence', ui)
        self.assertIn('CHANGER LE FOCUS', ui)
        # Command never sets the admin's followed_driver and doesn't require a Session Course.
        command_route = src.split('def set_access_remote_focus(', 1)[1].split('@app.get("/api/access-grants")', 1)[0]
        self.assertNotIn('STATE["followed_driver"]', command_route)
        self.assertNotIn('_active_session_for_workspace(', command_route)
        self.assertNotIn('previous["revoked"]', command_route)

    def test_remote_sql_rows_are_independent(self):
        import tempfile
        from data_recorder import RecorderStore
        with tempfile.TemporaryDirectory() as directory:
            from pathlib import Path
            with patch.dict('os.environ', {'DATABASE_URL': ''}):
                store = RecorderStore(Path(directory))
            try:
                store.put_access_focus_presence('guest-A', {'session_id': 'A1', 'mode': 'endurance', 'teams': [{'driver':'A'}]})
                store.put_access_focus_presence('guest-B', {'session_id': 'B1', 'mode': 'qualification', 'teams': [{'driver':'B'}]})
                store.put_access_focus_command('guest-A', {'id':'cmd-A','driver':'A'})
                store.put_access_focus_command('guest-B', {'id':'cmd-B','driver':'B'})
                store.put_access_focus_presence('guest-A', {'session_id':'A1','mode':'endurance', 'teams':[{'driver':'A2'}]})
                a = store.get_access_focus_control('guest-A')
                b = store.get_access_focus_control('guest-B')
                self.assertEqual(a['command']['id'], 'cmd-A')
                self.assertEqual(a['presence']['teams'][0]['driver'], 'A2')
                self.assertEqual(b['command']['id'], 'cmd-B')
                self.assertEqual(b['presence']['teams'][0]['driver'], 'B')
                self.assertEqual(len(store.list_access_focus_controls(['guest-A','guest-B'])), 2)
            finally:
                store._conn.close()

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

    def test_guest_can_pick_any_circuit_and_follow_without_changing_admin(self):
        issued = self.issue(modes=['endurance'])
        token = issued['link'].split('/access/')[1]
        self.assertEqual(self.guest.post('/api/access/activate',json={'token':token}).status_code, 200)
        admin_runtime = velocity._runtime_for_workspace('W1')
        self.assertEqual(admin_runtime.state['circuit_id'], 'track1')
        circuits = velocity.load_circuits()
        self.assertGreater(len(circuits), 0)
        first = circuits[0]['id']
        result = self.guest.post('/api/circuit', json={'circuit_id':first})
        self.assertEqual(result.status_code, 200, result.get_json())
        guest_state = self.guest.get('/api/state').get_json()
        self.assertEqual(guest_state['circuit_id'], first)
        self.assertEqual(admin_runtime.state['circuit_id'], 'track1')
        self.assertEqual(self.guest.get('/api/teams').status_code, 403)
        self.assertEqual(self.guest.post('/api/race-session/end',json={}).status_code, 403)
        self.assertEqual(self.guest.post('/api/spotter-state',json={}).status_code, 403)
        # The guest's view preference cannot modify the admin followed driver.
        guest_runtime_id = 'ACCESS-' + issued['id']
        guest_runtime = velocity._runtime_for_workspace(guest_runtime_id)
        guest_runtime.state.update(drivers=[{'driver':'GUEST TEAM','pos':1,'laps':0,'last':'1:02.33'}])
        follow = self.guest.post('/api/follow',json={'driver':'GUEST TEAM'})
        self.assertEqual(follow.status_code, 200, follow.get_json())
        self.assertEqual(guest_runtime.state['followed_driver'], 'GUEST TEAM')
        self.assertEqual(admin_runtime.state['followed_driver'], 'TEAM TEST')

    def test_separate_guests_have_separate_circuit_runtime(self):
        first=self.issue(name='Pilote 1')
        second=self.issue(name='Pilote 2')
        browser2=velocity.app.test_client()
        self.assertEqual(self.guest.post('/api/access/activate',json={'token':first['link'].split('/access/')[1]}).status_code,200)
        self.assertEqual(browser2.post('/api/access/activate',json={'token':second['link'].split('/access/')[1]}).status_code,200)
        circuits = velocity.load_circuits()
        self.assertGreaterEqual(len(circuits), 2)
        self.assertEqual(self.guest.post('/api/circuit',json={'circuit_id':circuits[0]['id']}).status_code,200)
        self.assertEqual(browser2.post('/api/circuit',json={'circuit_id':circuits[1]['id']}).status_code,200)
        self.assertEqual(self.guest.get('/api/state').get_json()['circuit_id'],circuits[0]['id'])
        self.assertEqual(browser2.get('/api/state').get_json()['circuit_id'],circuits[1]['id'])
        self.assertEqual(self.admin.get('/api/state').get_json()['circuit_id'],'track1')

    def test_ios_pwa_cookie_isolation_allows_transfer(self):
        issued=self.issue()
        token=issued['link'].split('/access/')[1]
        self.assertEqual(self.guest.post('/api/access/activate',json={'token':token}).status_code,200)
        pwa=velocity.app.test_client()
        self.assertEqual(pwa.post('/api/access/activate',json={'token':token}).status_code,200)
        self.assertEqual(pwa.get('/api/state').status_code,200)
        self.assertEqual(self.guest.get('/api/state').status_code,403)


    def test_remote_focus_from_admin_uses_current_link_no_reissue(self):
        class FakeStore:
            def __init__(self): self.records={}
            def get_access_focus_control(self, grant_id):
                return self.records.get(grant_id, {'presence':{}, 'command':{}})
            def put_access_focus_presence(self, grant_id, presence):
                self.records.setdefault(grant_id, {'presence':{}, 'command':{}})['presence']=presence
            def put_access_focus_command(self, grant_id, command):
                self.records.setdefault(grant_id, {'presence':{}, 'command':{}})['command']=command
            def list_access_focus_controls(self, ids):
                return {id:self.records[id] for id in ids if id in self.records}
        store=FakeStore()
        with patch.object(velocity,'_velocity_focus_store',lambda:store):
            grant=self.issue(name='REMOTE PILOT',modes=['endurance'])
            token=grant['link'].split('/access/')[1]
            self.assertEqual(self.guest.post('/api/access/activate',json={'token':token}).status_code,200)
            circuit=velocity.load_circuits()[0]['id']
            self.assertEqual(self.guest.post('/api/circuit',json={'circuit_id':circuit}).status_code,200)
            data={'mode':'endurance','session_id':'focus-session-A','circuit_id':circuit,
                  'followed_driver':'TEAM ALPHA','teams':[{'driver':'TEAM ALPHA','apex_row':3},
                                                           {'driver':'TEAM BRAVO','apex_row':4}]}
            self.assertEqual(self.guest.post('/api/access/focus-presence',json=data).status_code,200)
            grants=self.admin.get('/api/access-grants').get_json()['grants']
            self.assertEqual(grants[0]['focus_presence']['mode'],'endurance')
            cmd=self.admin.post(f"/api/access-grants/{grant['id']}/focus",json={'driver':'TEAM BRAVO','apex_row':4})
            self.assertEqual(cmd.status_code,200,cmd.get_json())
            remote=self.guest.get('/api/access/focus-command').get_json()['command']
            self.assertEqual(remote['driver'],'TEAM BRAVO')
            self.assertEqual(remote['session_id'],'focus-session-A')
            self.assertFalse(self.data['access_grants'][grant['id']]['revoked'])
            # Request targeting a competitor outside this guest's circuit is rejected.
            self.assertEqual(self.admin.post(f"/api/access-grants/{grant['id']}/focus",
                json={'driver':'ANOTHER TEAM','apex_row':15}).status_code,409)
            # Once the guest exits Focus, prior command is no longer served.
            data.update(mode='',session_id='',circuit_id='',teams=[])
            self.assertEqual(self.guest.post('/api/access/focus-presence',json=data).status_code,200)
            self.assertIsNone(self.guest.get('/api/access/focus-command').get_json()['command'])
            # The invitation remains usable until its original expiry.
            self.assertEqual(self.guest.get('/api/access/me').status_code,200)

    def test_remote_focus_permissions_and_revoke(self):
        class Store:
            def __init__(self): self.presence={}
            def put_access_focus_presence(self, key, value): self.presence[key]=value
            def get_access_focus_control(self, key): return {'presence': self.presence.get(key,{}),'command':{}}
            def put_access_focus_command(self, key, value): self.last_command=value
        store=Store()
        with patch.object(velocity,'_velocity_focus_store',lambda:store):
            grant=self.issue(name='QUALIF',modes=['qualification'])
            token=grant['link'].split('/access/')[1]
            self.assertEqual(self.guest.post('/api/access/activate',json={'token':token}).status_code,200)
            circuit=velocity.load_circuits()[0]['id']
            self.assertEqual(self.guest.post('/api/access/focus-presence',json={'mode':'endurance',
                'session_id':'1','circuit_id':circuit}).status_code,403)
            self.assertEqual(self.guest.post('/api/access/focus-presence',json={'mode':'qualification',
                'session_id':'1','circuit_id':circuit,'teams':[{'driver':'X','apex_row':1}]}).status_code,200)
            self.assertEqual(self.guest.post(f"/api/access-grants/{grant['id']}/focus",
                json={'driver':'X','apex_row':1}).status_code,403)
            self.assertEqual(self.admin.post(f"/api/access-grants/{grant['id']}/focus",
                json={'driver':'X','apex_row':1}).status_code,200)
            # Revocation must disable both the guest's polling and presence.
            self.assertEqual(self.admin.post(f"/api/access-grants/{grant['id']}/revoke").status_code,200)
            self.assertEqual(self.guest.get('/api/access/focus-command').status_code,403)
            self.assertEqual(self.guest.post('/api/access/focus-presence',json={}).status_code,403)


if __name__ == '__main__': unittest.main()
