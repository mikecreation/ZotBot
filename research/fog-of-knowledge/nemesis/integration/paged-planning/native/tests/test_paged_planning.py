"""Synthetic planning/restart/fault tests. Never produce canonical science."""
import copy,json,os,sys
from pathlib import Path
from types import SimpleNamespace
import pytest
from test_fog_coverage import planner,inventory,finish
from test_scientific_planner import proposal
from sim.fog_scientific_planner import ScientificCoveragePlanner
from sim.fog_graph_access import canonical,verify

ROOT=Path(os.environ.get('FOG_PROJECT_ROOT',Path(__file__).resolve().parents[3]/'release-fog-navigation/research/fog-of-knowledge'))
sys.path.insert(0,str(ROOT/'scripts'))
from graph_retrieval import build,Snapshot

@pytest.fixture
def paged(planner,tmp_path):
    p=ScientificCoveragePlanner(planner.crew)
    p.crew.job=lambda jid:p.crew.brain.rows[jid]
    rows=inventory();rows[0]['summary']='An exact synthetic bounded finding.'
    path,info=build(tmp_path/'snapshots',(('nodes',n['id'],n) for n in rows),origin={'synthetic':True})
    snapshot=Snapshot(path)
    catalog={'snapshot':info['snapshot'],'counts':info['counts'],'eligible_branches':len(rows),
        'coverage_by_domain':[{'domain':d,'label':d} for d in dict.fromkeys(n['domain'] for n in rows)],'complete_graph_in_prompt':False}
    def request(value):
        reply=snapshot.page(**value['query']);verify(reply,info['snapshot']);return reply
    reader=SimpleNamespace(snapshot=info['snapshot'],catalog=catalog,request=request)
    p.paged.readers=SimpleNamespace(get=lambda *a:reader)
    p.configure('owner','repo','fog',True,True);p.tick()
    yield p,reader
    snapshot.close()

def load(p):return p.load('owner','repo','fog')
def read(p,plan,query=None):
    value={'decision':'retrieve','domain':plan['domain'],'rationale':'Inspect exact relevant evidence before choosing a question.',
        'request':{'operation':'query','query':query or {'kind':'nodes','domain':plan['domain'],'limit':2}}}
    p.crew.brain.complete(plan['job_id'],value);p.tick();p.tick()
    return load(p)['decisions'][plan['id']]

def test_production_default_is_paged_and_three_initial_goals_are_catalogs(paged):
    p,reader=paged;s=load(p)
    assert len(s['decisions'])==3 and len({d['domain'] for d in s['decisions'].values()})==3
    for plan in s['decisions'].values():
        assert 'graph' not in plan['input'] and 'coverage_inventory' not in plan['input']
        assert plan['input']['catalog']['counts']['nodes']==127
        assert len(canonical(plan['input']))<10000
        assert 'complete graph' not in p.crew.brain.rows[plan['job_id']]['system'].lower().split('not the complete graph')[0]

def test_exact_read_then_admission_retains_decision_and_input_identity(paged):
    p,reader=paged;plan=next(iter(load(p)['decisions'].values()));plan=read(p,plan)
    assert plan['turn']==1 and plan['input']['current_reply']['data']['matched']==100
    assert not plan['input']['current_reply']['data']['complete_query']
    node=plan['input']['current_reply']['data']['records'][0]['record'];value=proposal(plan)
    value['anchor_ids']=[node['id']];value['finding_uses']=[{'id':node['id'],'summary':node['summary'],'implication':'Investigate independent replication of the exact scoped result.'}]
    p.crew.brain.complete(plan['job_id'],value);p.tick();task=next(iter(load(p)['tasks'].values()))
    assert task['decision']==value and task['planning_access']=='fog-paged-planning/1'
    assert task['planning_job_id']==plan['job_id']
    assert (p.paged.folder(load(p),plan)/'query-0.json').exists()

def test_unread_anchor_cannot_be_admitted(paged):
    p,_=paged;plan=read(p,next(iter(load(p)['decisions'].values())))
    value=proposal(plan);value['anchor_ids']=['life-0'];p.crew.brain.complete(plan['job_id'],value);p.tick()
    assert load(p)['decisions'][plan['id']]['state']=='HELD' and not load(p)['tasks']

def test_retrieval_enqueue_commit_crash_recovers_same_exact_goal(paged):
    p,_=paged;plan=next(iter(load(p)['decisions'].values()))
    p.crew.brain.complete(plan['job_id'],{'decision':'retrieve','domain':plan['domain'],'rationale':'Read exact nodes','request':{'operation':'query','query':{'kind':'nodes','domain':plan['domain'],'limit':2}}});p.tick()
    original=p.crew.brain.enqueue
    def crash(*a,**k):original(*a,**k);raise RuntimeError('After durable enqueue')
    p.crew.brain.enqueue=crash;p.tick();count=len(p.crew.brain.rows)
    s=load(p);s['next_attempt_at']=0;p.save(p.location('owner','repo','fog'),s);p.crew.brain.enqueue=original
    restarted=ScientificCoveragePlanner(p.crew);restarted.paged.readers=p.paged.readers;restarted.tick()
    assert len(p.crew.brain.rows)==count
    current=load(p)['decisions'][plan['id']]
    assert json.loads(p.crew.brain.rows[current['job_id']]['packet'])['GOAL']==json.dumps(current['input'],ensure_ascii=False,separators=(',',':'))

def test_exact_reply_replay_detects_retained_corruption(paged):
    p,_=paged;plan=read(p,next(iter(load(p)['decisions'].values())));s=load(p)
    query={'operation':'replay','query':{'turn':0}}
    assert p.paged.exchange(s,plan,query)==plan['input']['current_reply']
    file=p.paged.folder(s,plan)/'query-0.json';value=json.loads(file.read_text());value['data']['records']=[];file.write_text(json.dumps(value))
    with pytest.raises(ValueError,match='changed'):p.paged.exchange(s,plan,query)

def test_resource_wait_resumes_exact_pending_read_without_enabling_paused_run(paged):
    p,_=paged;s=load(p);plan=next(iter(s['decisions'].values()));plan['retrieval_turn_limit']=0;p.save(p.location('owner','repo','fog'),s)
    plan=read(p,plan);assert plan['state']=='RETRIEVAL_WAIT'
    p.configure('owner','repo','fog',False,True)
    p.resume_retrieval('owner','repo','fog',plan['id'],2);s=load(p)
    assert not s['enabled'] and s['decisions'][plan['id']]['turn']==1 and s['decisions'][plan['id']]['state']=='INTENT'
    assert s['decisions'][plan['id']]['graph_fingerprint']==plan['graph_fingerprint']

def test_original_live_budget_cannot_be_enlarged_by_resume(paged):
    p,_=paged;s=load(p);plan=next(iter(s['decisions'].values()));plan['state']='RETRIEVAL_WAIT';s['live_acceptance_budget']={'deadline':0};p.save(p.location('owner','repo','fog'),s)
    with pytest.raises(ValueError,match='cannot be enlarged'):p.resume_retrieval('owner','repo','fog',plan['id'],2)

def test_changed_reply_bytes_are_rejected_independently(paged):
    p,r=paged;reply=r.request({'operation':'query','query':{'kind':'nodes','limit':2}})
    reply['data']['records'][0]['record']['summary']='Stronger invented assertion'
    with pytest.raises(ValueError,match='mismatch'):verify(reply,r.snapshot)

def test_explicit_new_start_archives_completed_demo_without_rewriting_old_budget(paged):
    p,_=paged;s=load(p);budget={'deadline':1,'max_investigations':8,'max_planning_requests':12}
    s.update(enabled=False,state='BOUNDED_DEMO_COMPLETE',live_acceptance_budget=budget);p.save(p.location('owner','repo','fog'),s)
    p.crew.ws.project_row=lambda *a:{'mode':'READ_BRANCH_PR'}
    p.configure('owner','repo','fog',True,True);current=load(p)
    archive=p.crew.root/current['completed_demonstrations'][0]['archive']
    assert json.loads(archive.read_text())==s and current['enabled'] and 'live_acceptance_budget' not in current
    assert current['tasks']==s['tasks'] and current['decisions']==s['decisions']

def test_restart_or_pause_does_not_retire_old_demo_budget(paged):
    p,_=paged;s=load(p);budget={'deadline':1,'max_investigations':8,'max_planning_requests':12}
    s.update(enabled=False,state='BOUNDED_DEMO_COMPLETE',live_acceptance_budget=budget);p.save(p.location('owner','repo','fog'),s)
    p.configure('owner','repo','fog',False,True);p.tick()
    assert load(p)['live_acceptance_budget']==budget and not load(p)['enabled']


def real_discovery(p):
    """Exercise the production handoff, not the coverage fixture's enqueue stub."""
    from sim.github_evidence import FogEvidenceCrew
    ws=p.crew.ws
    ws.project_row=lambda *a:{'key':'fixture','mode':'READ_BRANCH_PR',
        'manifest':json.loads((ROOT/'.nemesis.json').read_text())}
    ws.use_project=lambda *a:None
    # The contract may advance independently of the retained planning snapshot.
    ws.run_worker_contract=lambda *a:{'ok':True,'sha':'b'*40,'prompt_block':'synthetic live contract'}
    def no_full_context(*a):raise AssertionError('Paged discovery must not load the whole inventory')
    ws.run_context=no_full_context
    p.crew.coverage=p
    p.crew.discover=lambda *a,**k:FogEvidenceCrew.discover(p.crew,*a,**k)


@pytest.mark.parametrize('anchors',[True,False])
def test_real_paged_discovery_handoff_is_scoped_pinned_and_restart_safe(paged,anchors):
    p,r=paged;plan=read(p,next(iter(load(p)['decisions'].values())))
    node=plan['input']['current_reply']['data']['records'][0]['record'];value=proposal(plan)
    if anchors:
        value['anchor_ids']=[node['id']]
        value['finding_uses']=[{'id':node['id'],'summary':node['summary'],'implication':'Test independent replication.'}]
    real_discovery(p)
    # Simulate enqueue succeeding before the discovery/checkpoint write commits.
    original=p.crew.brain.enqueue
    def crash(*a,**k):original(*a,**k);raise RuntimeError('After durable discovery enqueue')
    p.crew.brain.enqueue=crash;p.crew.brain.complete(plan['job_id'],value);p.tick()
    s=load(p);task=next(iter(s['tasks'].values()))
    assert s['state']=='RECOVERY_PENDING' and s['error']=='After durable discovery enqueue'
    count=len(p.crew.brain.rows);s['next_attempt_at']=0;p.save(p.location('owner','repo','fog'),s)
    p.crew.brain.enqueue=original
    restarted=ScientificCoveragePlanner(p.crew);restarted.paged.readers=p.paged.readers
    real_discovery(restarted);restarted.tick()
    task=load(restarted)['tasks'][task['key']]
    assert task['state']=='QUEUED' and len(p.crew.brain.rows)==count
    packet=json.loads(p.crew.brain.rows[task['job_id']]['goal'])['context']
    assert packet['coverage_plan']['decision']==value
    assert packet['planning_access']['canonical_sha']==plan['canonical_sha']
    assert packet['retrieval_catalog']['snapshot']==r.snapshot
    assert packet['known_branch_records']==([node] if anchors else [])
    assert packet['known_branch_records_scope']['complete_domain'] is False
    assert packet['known_branch_records_scope']['complete_graph'] is False
    assert 'coverage_inventory' not in packet and len(canonical(packet))<20000
    if anchors:
        verify(packet['known_branch_records_page'],r.snapshot)
        assert packet['known_branch_records_page']['data']['complete_query'] is True
    restarted.tick();assert len(p.crew.brain.rows)==count


@pytest.mark.parametrize('fault',['decision','input','snapshot','missing','scope','bytes'])
def test_discovery_context_rejects_changed_plan_or_incomplete_anchor_read(paged,fault):
    p,r=paged;plan=read(p,next(iter(load(p)['decisions'].values())))
    node=plan['input']['current_reply']['data']['records'][0]['record'];value=proposal(plan)
    value['anchor_ids']=[node['id']]
    p.crew.brain.complete(plan['job_id'],value);p.tick();s=load(p);task=next(iter(s['tasks'].values()))
    if fault=='decision':task['decision']['topic']='Silent rewrite'
    elif fault=='input':task['planning_input_sha256']='0'*64
    elif fault=='snapshot':r.snapshot='0'*64
    else:
        request=r.request
        def changed(v):
            reply=request(v)
            if fault=='missing':
                reply['data']['records']=[];reply['data']['returned']=0;reply['data']['matched']=0
                reply['manifest']['counts']={'returned':0,'matched':0}
            elif fault=='scope':
                reply['data']['scope']['ids']=[];reply['manifest']['scope']=reply['data']['scope']
            else:reply['data']['records'][0]['record']['summary']='Stronger invented finding'
            if fault!='bytes':
                from sim.fog_graph_access import digest
                reply['manifest'].update(bytes=len(canonical(reply['data'])),sha256=digest(reply['data']))
            return reply
        r.request=changed
    with pytest.raises(ValueError):p.paged.discovery_context(s,task)

