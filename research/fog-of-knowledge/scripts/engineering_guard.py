"""Affected-path regression planning and recurring-assumption escalation.

This is an engineering release check, not a research planner or model dispatcher.
"""
from __future__ import annotations
import argparse,fnmatch,json,subprocess,sys
from pathlib import Path
from research_integrity import IntegrityError,digest,strict_json
ROOT=Path(__file__).resolve().parents[1]
REGISTRY=ROOT/'nemesis/integration/engineering-boundaries.json'
CORPUS=ROOT/'nemesis/integration/engineering-failures.json'
CHECKS={'engineering':['scripts/test_engineering_integrity.py'],'context':['scripts/test_coverage_context.py'],
    'native_source':['scripts/test_native_authority_source.py'],'mission':['scripts/test_mission_acceptance.py'],
    'transport':['scripts/test_brain_transport_source.py'],'exchange':['scripts/test_nemesis_exchange.py'],
    'compiler':['scripts/test_evidence_compiler.py'],'validate':['scripts/validate.py'],'guard':['scripts/test_engineering_guard.py'],'watchdog':['scripts/test_mission_watchdog.py'],'boundary_upgrade':['scripts/test_boundary_upgrade.py'],
    'paged_planning':['scripts/test_paged_planner_source.py','scripts/test_retrieval_service.py'],
    'response_ownership':['scripts/test_response_ownership_source.py'],
    'tab_recovery':['scripts/test_tab_recovery_source.py'],'upload_recovery':['scripts/test_upload_recovery_source.py'],'status_scan':['scripts/test_status_scan_source.py'],'planning_recovery':['scripts/test_planning_recovery_source.py'],'completed_fence':['scripts/test_completed_fence_source.py'],'cancellation_recovery':['scripts/test_cancellation_recovery_source.py'],'bounded_evidence':['scripts/test_bounded_evidence_source.py']}
# This check includes the complete portable Native suite and browser fixtures.
# Its measured Windows run exceeded the ordinary single-script budget; this is
# an engineering-test limit, never a scientific job or mission budget extension.
CHECK_TIMEOUTS={'scripts/test_paged_planner_source.py':600,'scripts/test_fresh_chat_source.py':600}
CHECKS['fresh_chat']=['scripts/test_fresh_chat_source.py']

def normalize(path):
    path=path.replace('\\','/')
    prefix='research/fog-of-knowledge/'
    if path.startswith(prefix):path=path[len(prefix):]
    for retained in ('nemesis/integration/scientific-authority/','nemesis/integration/brain-transport/'):
        if path.startswith(retained):path=path[len(retained):]
    for retained in ('nemesis/integration/paged-planning/native/','nemesis/integration/paged-planning/extension/','nemesis/integration/response-ownership/extension/','nemesis/integration/tab-recovery/extension/','nemesis/integration/upload-recovery/extension/','nemesis/integration/status-scan/extension/','nemesis/integration/planning-recovery/native/','nemesis/integration/completed-fence/extension/','nemesis/integration/cancellation-recovery/native/'):
        if path.startswith(retained):path=path[len(retained):]
    if path.startswith('nemesis/integration/bounded-evidence/native/'):path=path[len('nemesis/integration/bounded-evidence/native/'):]
    for retained in ('nemesis/integration/fresh-chat/native/','nemesis/integration/fresh-chat/extension/'):
        if path.startswith(retained):path=path[len(retained):]
    return path

def closure(registry,seeds):
    edges={k:set(v['next']) for k,v in registry.items()}
    for source,targets in list(edges.items()):
        for target in targets:
            if target not in edges:raise IntegrityError('Unknown dependency boundary: '+target)
    result=set(seeds)
    while True:
        previous=set(result)
        for key,targets in edges.items():
            if key in result or result&targets:result.add(key);result.update(targets)
        if previous==result:return sorted(result)

def plan(changed,registry=None):
    registry=registry or strict_json(REGISTRY.read_bytes())['boundaries']
    normalized=[normalize(p) for p in changed]
    seeds={k for k,v in registry.items() if any(fnmatch.fnmatchcase(p,pattern) for p in normalized for pattern in v['paths'])}
    affected=closure(registry,seeds)
    checks=sorted({c for k in affected for c in registry[k]['checks']})
    if any(c not in CHECKS for c in checks):raise IntegrityError('Unknown executable engineering check')
    return {'protocol':'nemesis-affected-path/1','changed':normalized,'direct':sorted(seeds),'affected':affected,
        'checks':{c:CHECKS[c] for c in checks},'scope':'Repository and retained-source regression path; installed/live mission checks remain separate.'}

def recurrence(events,corpus=None,registry=None):
    cases=(corpus or strict_json(CORPUS.read_bytes())['cases'])
    registry=registry or strict_json(REGISTRY.read_bytes())['boundaries']
    repairs={};escalations=[]
    for event in events:
        category=event.get('category');kind=event.get('type')
        if not isinstance(category,str) or kind not in {'incident','verified-repair','architecture-review'}:raise IntegrityError('Invalid engineering event')
        if kind=='verified-repair':
            proof=event.get('verification',{})
            if proof.get('passed') is not True or not isinstance(proof.get('sha256'),str) or len(proof['sha256'])!=64 or not proof.get('checks'):
                raise IntegrityError('Repair requires actual verification identity and checks')
            repairs[category]=event
        elif kind=='architecture-review':
            target=event.get('incident_identity');review=event.get('review',{})
            matches=[e for e in escalations if e['incident_identity']==target and e['category']==category]
            if not matches:raise IntegrityError('Architecture review must bind a prior recurring incident')
            for escalation in matches:
                escalation['resolved']=all(review.get(k) for k in escalation['required']) and set(escalation['affected'])<=set(review.get('dependent_boundaries',[]))
                escalation['review_identity']=digest(event)
        elif kind=='incident' and category in repairs:
            matching=[c for c in cases if c['category']==category]
            if not matching:raise IntegrityError('Recurring failure absent from permanent corpus')
            required={'assumption','dependent_boundaries','prevention_evidence'}
            review=event.get('architecture_review',{})
            resolved=all(review.get(k) for k in required)
            affected=closure(registry,{b for c in matching for b in c['boundaries']})
            if resolved and not set(affected)<=set(review['dependent_boundaries']):resolved=False
            escalations.append({'category':category,'incident_identity':digest(event),'prior_repair_identity':digest(repairs[category]),
                'assumptions':sorted({c['assumption'] for c in matching}),'affected':affected,'required':sorted(required),'resolved':resolved})
    return {'protocol':'nemesis-recurring-failure/1','status':'ARCHITECTURE_REVIEW_REQUIRED' if any(not e['resolved'] for e in escalations) else 'NO_UNRESOLVED_RECURRENCE',
        'escalations':escalations,'guarantee':'Detects recurrence in the supplied ordered event ledger; does not infer incidents that were never observed.'}

def changed_files():
    def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).splitlines()
    try:changed=git('diff','--name-only','origin/main')
    except subprocess.CalledProcessError:
        # CI shallow checkout: unknown baseline requires the complete registry,
        # never a silently smaller affected-path claim.
        registry=strict_json(REGISTRY.read_bytes())['boundaries']
        changed=[p for boundary in registry.values() for p in boundary['paths']]
    return sorted(set(changed+git('ls-files','--others','--exclude-standard')))

def run_checks(checks):
    results=[]
    for name,scripts in checks.items():
        # Each registry entry is a list of independent script checks, not argv
        # for the first script. Execute and record every one, including failures.
        for script in scripts:
            try:
                budget=CHECK_TIMEOUTS.get(script,300)
                run=subprocess.run([sys.executable,'-X','utf8',script],cwd=ROOT,capture_output=True,text=True,encoding='utf8',timeout=budget)
                results.append({'check':name,'script':script,'exit_code':run.returncode,
                    'stdout_excerpt':run.stdout[-2000:],'stderr_excerpt':run.stderr[-2000:]})
            except subprocess.TimeoutExpired:
                results.append({'check':name,'script':script,'exit_code':124,
                    'stdout_excerpt':'','stderr_excerpt':'Check exceeded its execution budget. No pass inferred.'})
    return results

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--changed',nargs='*');p.add_argument('--events',type=Path);p.add_argument('--run',action='store_true');p.add_argument('--report',type=Path)
    args=p.parse_args();result=plan(args.changed if args.changed is not None else changed_files())
    if args.events:result['recurrence']=recurrence([strict_json(s) for s in args.events.read_bytes().splitlines() if s.strip()])
    if args.run:
        result['results']=run_checks(result['checks'])
    text=json.dumps(result,ensure_ascii=False,indent=2)
    if args.report:args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(text+'\n',encoding='utf8')
    print(text)
    return 2 if result.get('recurrence',{}).get('status')=='ARCHITECTURE_REVIEW_REQUIRED' or any(r['exit_code'] for r in result.get('results',[])) else 0

if __name__=='__main__':raise SystemExit(main())
