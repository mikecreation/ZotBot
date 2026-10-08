import unittest
from verify_mission_acceptance import assess


class MissionAcceptanceTests(unittest.TestCase):
    def valid(self):
        return dict(sources_match=True,evidence_valid=True,new_nodes=9,growth_domains=3,
                    merged_domains=3,merged_batches=3,followup_after_merge=True,followup_used_new_graph=True,
                    queue_enabled=True,publication_verified=True,scientific_direction=True,
                    substantive_followup=True,restart_recovered=True,no_duplicates=True,extension_matches=True)

    def test_bounded_live_acceptance_requires_the_whole_behavior(self):
        self.assertEqual(assess(self.valid())['status'],'PASSED')

    def test_many_searches_and_test_passes_cannot_replace_publication(self):
        observation={**self.valid(),'new_nodes':0,'growth_domains':0,'merged_domains':0,
                     'searches':100000,'passing_tests':567}
        self.assertEqual(assess(observation)['status'],'INCOMPLETE')

    def test_single_field_growth_does_not_establish_whole_atlas_continuation(self):
        self.assertEqual(assess({**self.valid(),'new_nodes':10000,'growth_domains':1,'merged_domains':1})['status'],'INCOMPLETE')

    def test_one_multifield_packet_is_not_sustained_publication(self):
        self.assertEqual(assess({**self.valid(),'merged_batches':1})['status'],'INCOMPLETE')

    def test_publishing_then_stopping_or_using_old_context_is_incomplete(self):
        for key in ('followup_after_merge','followup_used_new_graph','queue_enabled'):
            with self.subTest(key=key):
                self.assertEqual(assess({**self.valid(),key:False})['status'],'INCOMPLETE')

    def test_runtime_drift_missing_capture_and_unverified_ci_each_fail(self):
        for key in ('sources_match','evidence_valid','publication_verified'):
            with self.subTest(key=key):
                self.assertEqual(assess({**self.valid(),key:False})['status'],'INCOMPLETE')

    def test_counts_do_not_replace_scientific_planning_or_restart_proof(self):
        for key in ('scientific_direction','substantive_followup','restart_recovered','no_duplicates','extension_matches'):
            with self.subTest(key=key):self.assertEqual(assess({**self.valid(),key:False})['status'],'INCOMPLETE')


if __name__=='__main__':
    unittest.main()
