"""Regression guard: the V1815 server 500 came from lost Flask route functions.

No Flask dependency needed: test the deployed module's syntax tree and call
boundaries, not only its Python syntax.
"""
import ast
import pathlib
import unittest

APP = pathlib.Path(__file__).resolve().parents[1] / 'app.py'

class AppRouteIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tree = ast.parse(APP.read_text(encoding='utf-8'))
        cls.functions={n.name:n for n in cls.tree.body if isinstance(n,(ast.FunctionDef, ast.AsyncFunctionDef))}
        cls.routes={}
        for name,node in cls.functions.items():
            for dec in node.decorator_list:
                if (isinstance(dec,ast.Call) and isinstance(dec.func,ast.Attribute)
                    and isinstance(dec.func.value,ast.Name) and dec.func.value.id == 'app'
                    and dec.func.attr in ('get','post','route') and dec.args
                    and isinstance(dec.args[0],ast.Constant)):
                    key=(dec.func.attr,dec.args[0].value)
                    cls.routes.setdefault(key,[]).append(name)

    def test_critical_routes_remain_registered(self):
        required=[('get','/'),('get','/api/analyzer-strategy'),
                  ('post','/api/analyzer-strategy'),('post','/api/kart-setup'),
                  ('get','/api/spotter-registry'),('post','/api/spotter-registry'),
                  ('post','/api/spotter-registry/new-course'),
                  ('get','/api/spotter-registry/archives/export'),
                  ('post','/api/spotter-monitor-lease'),
                  ('get','/api/spotter-state'),('post','/api/spotter-state')]
        for route in required:
            with self.subTest(route=route):
                self.assertEqual(len(self.routes.get(route,[])),1, route)

    def test_required_helpers_are_defined(self):
        for fn in ['_spotter_persistent_store','_spotter_shared_read',
                   '_spotter_registry_run_context','_spotter_registry_response']:
            with self.subTest(fn=fn):
                self.assertIn(fn,self.functions)

    def test_analyzer_strategy_not_merged_with_spotter_state(self):
        body=self.functions['update_analyzer_strategy']
        called={node.func.id for node in ast.walk(body) if isinstance(node,ast.Call) and isinstance(node.func,ast.Name)}
        self.assertNotIn('spotter_snapshot_error',called)
        self.assertNotIn('_spotter_persistent_store',called)
        body2=self.functions['update_spotter_state']
        called2={node.func.id for node in ast.walk(body2) if isinstance(node,ast.Call) and isinstance(node.func,ast.Name)}
        self.assertIn('spotter_snapshot_error',called2)

    def test_registry_versioned_contract(self):
        block=ast.get_source_segment(APP.read_text(), self.functions['update_spotter_registry'])
        self.assertIn('base_updated_at_ms=base_updated_at_ms',block)
        getblock=ast.get_source_segment(APP.read_text(), self.functions['get_spotter_registry'])
        self.assertIn('registry_updated_at_ms',getblock)

if __name__=='__main__': unittest.main()
