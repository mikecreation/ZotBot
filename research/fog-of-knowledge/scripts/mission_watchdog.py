"""Independent read-only mission observer. Infrastructure throughput is not science."""
import argparse,json,time
from pathlib import Path
from research_integrity import IntegrityError,strict_json

def assess(acceptance,observation,*,now=None,max_age=120,stagnation_seconds=1800,baseline_started_at=None):
    now=time.time() if now is None else now
    if acceptance.get('status') not in {'PASSED','INCOMPLETE'} or not isinstance(acceptance.get('observation'),dict) or not isinstance(acceptance.get('checks'),dict):
        return {'status':'UNKNOWN','reason':'Independent acceptance evidence is invalid or missing; no accomplishment is inferred'}
    age=now-min(acceptance['observed_at'],observation['observed_at'])
    if age<0 or age>max_age:
        return {'status':'UNKNOWN','reason':'Acceptance/runtime observation is stale or from the future','observation_age_seconds':age}
    outcome=acceptance['observation'];checks=acceptance['checks']
    publications=outcome['publications'];times=[p['merged_at'] for p in publications]
    last_progress=max(times) if times else baseline_started_at
    stagnant=last_progress is not None and now-last_progress>=stagnation_seconds
    job_rows=observation.get('job_counts_and_character_sizes',[])
    completed=sum(r[1] for r in job_rows if r[0]=='COMPLETE')
    failures=sum(r[1] for r in job_rows if r[0]=='FAILED')
    plans=[p for p in observation.get('plans',[]) if p.get('proposal')]
    keys=[];queries=[]
    for plan in plans:
        p=plan['proposal'];normalize=lambda s:' '.join(s.casefold().split())
        keys.append((p.get('domain'),normalize(p.get('topic','')),normalize(p.get('strategy',{}).get('question',''))))
        queries.extend(normalize(q) for q in p.get('strategy',{}).get('queries',[]))
    alerts=[]
    runtime_problem=bool(observation.get('error')) or observation.get('state') in {'RECOVERY_PENDING','ERROR','FAILED'}
    if runtime_problem:alerts.append({'category':'runtime-recovery','state':observation.get('state'),'detail':observation.get('error'),'reason':'Retained runtime error/recovery state requires inspection; canonical progress does not clear operational failure'})
    if stagnant:alerts.append({'category':'mission-stagnation','reason':'No newly verified canonical publication within the declared observation window','seconds_without_verified_publication':now-last_progress})
    for f in observation.get('flows',[]):
        if f['state'] in {'HELD','BLOCKED'}:alerts.append({'category':'retained-work-held','domain':f['domain'],'reason':f.get('reason')})
    if len(keys)!=len(set(keys)) or len(queries)!=len(set(queries)):alerts.append({'category':'repeated-investigation','reason':'Repeated normalized investigation or query; inspect scientific justification and prior outcome'})
    for slot,worker in observation.get('workers',{}).items():
        if worker.get('connected') and worker.get('state') in {'FAILED','ERROR','TRANSPORT_BLOCKED','DELIVERY_UNCONFIRMED'}:
            alerts.append({'category':'worker-operation','slot':slot,'state':worker['state'],'detail':worker.get('detail'),'scientific_progress':False})
    status='PASSED' if acceptance.get('status')=='PASSED' and all(v is True for v in checks.values()) and not runtime_problem else 'INCOMPLETE'
    return {'protocol':'nemesis-mission-watchdog/1','status':status,'observed_at':now,'observation_age_seconds':age,
        'verified_new_records':outcome['new_nodes'],'verified_growth_fields':outcome['growth_domains'],'verified_publications':outcome['merged_batches'],
        'substantive_followup':outcome.get('substantive_followup',False),'restart_recovered':outcome.get('restart_recovered',False),
        'completed_brain_jobs':completed,'failed_brain_jobs':failures,'investigations':len(plans),
        'unverified_requirements':[k for k,v in checks.items() if v is not True],
        'last_verified_publication_at':last_progress,'stagnation_window_seconds':stagnation_seconds,'alerts':alerts,
        'scope':'Supplied fresh independently verified canonical/publication observations. No worker dispatch, claim approval, or automatic retry.'}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--acceptance',type=Path,required=True);p.add_argument('--observation',type=Path,required=True);p.add_argument('--baseline',type=Path,required=True)
    p.add_argument('--report',type=Path,required=True);p.add_argument('--max-age',type=int,default=120);p.add_argument('--stagnation-seconds',type=int,default=1800)
    args=p.parse_args()
    value=assess(strict_json(args.acceptance.read_bytes()),strict_json(args.observation.read_bytes()),max_age=args.max_age,
        stagnation_seconds=args.stagnation_seconds,baseline_started_at=strict_json(args.baseline.read_bytes())['started_at'])
    args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(value,ensure_ascii=False))
    return 0 if value['status']=='PASSED' else 3 if value['status']=='UNKNOWN' else 2

if __name__=='__main__':raise SystemExit(main())
