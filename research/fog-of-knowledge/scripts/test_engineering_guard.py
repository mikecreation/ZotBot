import unittest
import subprocess,sys
from unittest.mock import patch
from engineering_guard import CHECKS,closure,plan,recurrence,run_checks
from research_integrity import IntegrityError

class GuardTests(unittest.TestCase):
    def test_complete_affected_path_and_retained_native_names(self):
        value=plan(['research/fog-of-knowledge/nemesis/integration/scientific-authority/sim/github_sandbox.py'])
        self.assertEqual(value['direct'],['context'])
        self.assertTrue({'retrieval','planning','dispatch','worker','capture','author','review','publication','continuation','persistence'}<=set(value['affected']))
        self.assertEqual(set(value['checks']),set(CHECKS))
    def test_visual_change_does_not_invent_scientific_boundary(self):
        self.assertEqual(plan(['app.css'])['affected'],[])
    def test_every_registered_script_runs_and_timeout_does_not_hide_later_checks(self):
        with patch('engineering_guard.subprocess.run',side_effect=[
            subprocess.CompletedProcess([],0,'first result',''),
            subprocess.TimeoutExpired(['fixture'],300),
            subprocess.CompletedProcess([],7,'','third failed')]) as execute:
            result=run_checks({'group':['one.py','two.py','three.py']})
        self.assertEqual([call.args[0] for call in execute.call_args_list],
            [[sys.executable,'-X','utf8',name] for name in ['one.py','two.py','three.py']])
        self.assertEqual([r['script'] for r in result],['one.py','two.py','three.py'])
        self.assertEqual([r['exit_code'] for r in result],[0,124,7])
        self.assertIn('No pass inferred',result[1]['stderr_excerpt'])
    def test_recurring_failure_requires_shared_assumption_review(self):
        repair={'type':'verified-repair','category':'platform-error','verification':{'passed':True,'sha256':'a'*64,'checks':['prior observed rejection variants']}}
        incident={'type':'incident','category':'platform-error','versions':{'fixture':True}}
        result=recurrence([repair,incident]);self.assertEqual(result['status'],'ARCHITECTURE_REVIEW_REQUIRED')
        self.assertIn('publication',result['escalations'][0]['affected'])
        review={'type':'architecture-review','category':'platform-error','incident_identity':result['escalations'][0]['incident_identity'],
            'review':{'assumption':'Fixed DOM/error strings are not exhaustive','dependent_boundaries':result['escalations'][0]['affected'],'prevention_evidence':['scoped current-turn regression and independent observer; unknown variants remain possible']}}
        self.assertEqual(recurrence([repair,incident,review])['status'],'NO_UNRESOLVED_RECURRENCE')
        self.assertNotIn('architecture_review',incident,'historical incident remains unchanged')
    def test_unverified_repair_and_unknown_dependencies_fail(self):
        with self.assertRaises(IntegrityError):recurrence([{'type':'verified-repair','category':'platform-error','verification':{'passed':True}}])
        with self.assertRaises(IntegrityError):closure({'a':{'next':['unknown']}},{'a'})

if __name__=='__main__':unittest.main()
