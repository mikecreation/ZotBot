import unittest
from engineering_guard import CHECKS,closure,plan,recurrence
from research_integrity import IntegrityError

class GuardTests(unittest.TestCase):
    def test_complete_affected_path_and_retained_native_names(self):
        value=plan(['research/fog-of-knowledge/nemesis/integration/scientific-authority/sim/github_sandbox.py'])
        self.assertEqual(value['direct'],['context'])
        self.assertTrue({'retrieval','planning','dispatch','worker','capture','author','review','publication','continuation','persistence'}<=set(value['affected']))
        self.assertEqual(set(value['checks']),set(CHECKS))
    def test_visual_change_does_not_invent_scientific_boundary(self):
        self.assertEqual(plan(['app.css'])['affected'],[])
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
