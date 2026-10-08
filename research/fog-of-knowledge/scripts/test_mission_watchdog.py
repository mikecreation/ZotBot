import unittest
from mission_watchdog import assess

class MissionTests(unittest.TestCase):
    def test_invalid_independent_report_is_unknown(self):
        self.assertEqual(assess({'status':'INVALID_PROOF'},{},now=2000)['status'],'UNKNOWN')
    def test_checkpoint_failure_cannot_hide_behind_verified_progress(self):
        a,o=self.fixture();a['checks']={'all':True};a['status']='PASSED';a['observation'].update(new_nodes=35,growth_domains=3,merged_batches=3,publications=[{'merged_at':1999}])
        o.update(state='RECOVERY_PENDING',error='[WinError 5] Access is denied during checkpoint replacement')
        value=assess(a,o,now=2000)
        self.assertEqual(value['status'],'INCOMPLETE');self.assertEqual(value['verified_new_records'],35)
        self.assertTrue(any(alert['category']=='runtime-recovery' for alert in value['alerts']))
    def fixture(self):
        return ({'observed_at':2000,'status':'INCOMPLETE','checks':{'three_fields':False,'substantive':False},'observation':{'new_nodes':0,'growth_domains':0,'merged_batches':0,'publications':[]}},
            {'observed_at':2000,'job_counts_and_character_sizes':[['COMPLETE',500,1000000,500000]],'plans':[],'flows':[],'workers':{}})
    def test_successful_jobs_cannot_hide_mission_stagnation(self):
        acceptance,observation=self.fixture();value=assess(acceptance,observation,now=2000,baseline_started_at=0)
        self.assertEqual(value['status'],'INCOMPLETE');self.assertEqual(value['verified_new_records'],0);self.assertEqual(value['completed_brain_jobs'],500)
        self.assertTrue(any(a['category']=='mission-stagnation' for a in value['alerts']))
    def test_stale_or_partial_proof_cannot_report_passed(self):
        a,o=self.fixture();a['status']='PASSED'
        self.assertEqual(assess(a,o,now=2000)['status'],'INCOMPLETE')
        self.assertEqual(assess(a,o,now=2200)['status'],'UNKNOWN')
    def test_scientific_progress_and_substantive_followup_distinct(self):
        a,o=self.fixture();a['checks']={'all':True};a['status']='PASSED';a['observation'].update(new_nodes=11,growth_domains=3,merged_batches=3,substantive_followup=True,publications=[{'merged_at':1999}])
        value=assess(a,o,now=2000);self.assertEqual(value['status'],'PASSED');self.assertTrue(value['substantive_followup']);self.assertFalse(value['alerts'])

if __name__=='__main__':unittest.main()
