"""Reproduce ten permanently held planning lanes without any live research."""
import copy,json
import inspect
from pathlib import Path
import pytest
from test_fog_coverage import planner
from test_scientific_planner import science,activate,state
from test_paged_planning import paged,load,read
from sim.fog_scientific_planner import ScientificCoveragePlanner

ERROR='Deadline exceeded; no automatic resend'

def test_runs_the_staged_runtime_not_another_checkout():
    assert Path(inspect.getfile(ScientificCoveragePlanner)).resolve()==Path(__file__).resolve().parents[1]/'sim/fog_scientific_planner.py'

def held_lanes(p,s,now):
    template=next(iter(s['decisions'].values()))
    for plan in s['decisions'].values():
        p.crew.brain.rows[plan['job_id']].update(status='FAILED',error=ERROR)
        plan.update(state='HELD',reason=ERROR,finished_at=now)
    for domain in [d['id'] for d in s['domains'] if d['id'] not in {v['domain'] for v in s['decisions'].values()}]:
        s['planning_sequence']+=1;pid=str(s['planning_sequence'])+'-'+domain
        plan=copy.deepcopy(template);plan.update(id=pid,domain=domain,created_at=now,finished_at=now,state='HELD',reason=ERROR)
        plan['job_id']=p.crew.brain.enqueue('old','old',5000,'old:'+pid)
        p.crew.brain.rows[plan['job_id']].update(status='FAILED',error=ERROR)
        s['decisions'][pid]=plan
    p.save(p.location('owner','repo','fog'),s)
    return copy.deepcopy(s['decisions']),copy.deepcopy(p.crew.brain.rows)

def test_all_ten_timeout_holds_continue_without_graph_change_or_resend(science,monkeypatch):
    p,_=science;s=activate(p);now=100000
    old,jobs=held_lanes(p,s,now)
    monkeypatch.setattr('sim.fog_scientific_planner.time.time',lambda:now+61)
    p.tick();s=state(p)
    new=[v for k,v in s['decisions'].items() if k not in old]
    assert len(new)==3 and len({v['domain'] for v in new})==3
    assert s['state']=='RUNNING' and not s['tasks']
    assert {k:s['decisions'][k] for k in old}==old
    assert {k:p.crew.brain.rows[k] for k in jobs}==jobs
    for plan in new:
        assert plan['job_id'] not in jobs and plan['recovery_of']['job_id'] in jobs
        assert plan['input']['planning_recovery']==plan['recovery_of']
        assert json.loads(p.crew.brain.rows[plan['job_id']]['packet'])['GOAL']!=json.loads(jobs[plan['recovery_of']['job_id']]['packet'])['GOAL']
    count=len(p.crew.brain.rows)
    restarted=ScientificCoveragePlanner(p.crew);restarted.paged=None;restarted.tick()
    assert len(p.crew.brain.rows)==count,'restart must recover the three new exact intents'

def test_durable_cooldown_and_pause_do_not_dispatch(science,monkeypatch):
    p,_=science;s=activate(p);now=100000
    old,jobs=held_lanes(p,s,now)
    monkeypatch.setattr('sim.fog_scientific_planner.time.time',lambda:now+59)
    p.tick();assert len(p.crew.brain.rows)==len(jobs)
    assert state(p)['state']=='WAITING_FOR_PLANNING_RECOVERY'
    assert all(v['retry_at']==now+60 for v in p.public(state(p))['planning_recoveries'])
    p.configure('owner','repo','fog',False,True)
    monkeypatch.setattr('sim.fog_scientific_planner.time.time',lambda:now+1000)
    p.tick();assert len(p.crew.brain.rows)==len(jobs)
    assert state(p)['decisions']==old

@pytest.mark.parametrize('status,reason',[('COMPLETE',ERROR),('CANCELLED',ERROR),('QUARANTINED',ERROR),('FAILED','Evidence is unsupported')])
def test_only_verified_terminal_planning_timeout_is_recoverable(science,status,reason):
    p,_=science;s=activate(p);plan=next(iter(s['decisions'].values()))
    p.crew.brain.rows[plan['job_id']].update(status=status,error=reason)
    plan.update(state='HELD',reason=reason)
    assert not p.planning_timeout(plan)
    for hold in ['WAITING','RETRIEVAL_WAIT']:
        plan['state']=hold;assert not p.planning_timeout(plan)

def test_consecutive_timeouts_back_off_but_keep_lanes_eligible(science,monkeypatch):
    p,_=science;s=activate(p);now=100000
    held_lanes(p,s,now);monkeypatch.setattr('sim.fog_scientific_planner.time.time',lambda:now+61)
    p.tick();s=state(p)
    latest=list(s['decisions'].values())[-1];domain=latest['domain']
    latest.update(state='HELD',reason=ERROR,finished_at=now+61)
    p.crew.brain.rows[latest['job_id']].update(status='FAILED',error=ERROR)
    held,recovery=p.planning_holds(s,latest['graph_fingerprint'])
    assert domain in held and recovery[domain]['retry_at']==now+181
    monkeypatch.setattr('sim.fog_scientific_planner.time.time',lambda:now+182)
    held,_=p.planning_holds(s,latest['graph_fingerprint']);assert domain not in held

def test_paged_recovery_retains_context_through_exact_reads(paged,monkeypatch):
    p,_=paged;s=load(p);now=100000
    old,jobs=held_lanes(p,s,now)
    monkeypatch.setattr('sim.fog_scientific_planner.time.time',lambda:now+61)
    p.tick();s=load(p);plan=next(v for k,v in s['decisions'].items() if k not in old)
    recovery=copy.deepcopy(plan['recovery_of'])
    assert plan['brief']['planning_recovery']==recovery
    current=read(p,plan)
    assert current['turn']==1 and current['input']['planning_recovery']==recovery
    assert {k:p.crew.brain.rows[k] for k in jobs}==jobs
