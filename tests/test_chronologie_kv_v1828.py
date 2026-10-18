import unittest
from spotter_registry_scope import _chronological_history

class ChronologieKVTests(unittest.TestCase):
    def test_confirmed_pit_out_supersedes_initial_observation(self):
        events=[{'team':'spirit','at':100,'source':'initial-live'},
                {'team':'skr','at':200,'source':'pit_out'},
                {'team':'spirit','at':300,'source':'pit_out','supersedesInitialAt':100}]
        self.assertEqual([e['team'] for e in _chronological_history(events)], ['skr','spirit'])
    def test_no_reordering_without_confirmed_event(self):
        events=[{'team':'spirit','at':100,'source':'initial-live'},
                {'team':'skr','at':200,'source':'pit_out'}]
        self.assertEqual([e['team'] for e in _chronological_history(events)], ['spirit','skr'])
