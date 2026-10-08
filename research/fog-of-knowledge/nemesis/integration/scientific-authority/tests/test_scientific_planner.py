"""Synthetic integrated state transitions; never count as live scientific output."""
import copy,json,time
import pytest
from test_fog_coverage import planner,inventory,context,finish
from sim.fog_scientific_planner import ScientificCoveragePlanner,AUTHORITY,validate_proposal,digest
from sim.brain_bridge import BrainBridge
from sim.store import Store

@pytest.fixture
def science(planner):
    packet=context(inventory());packet['planning_graph']={'nodes':copy.deepcopy(packet['coverage_inventory']),'edges':[],'reviews':[]}
    planner.crew.ws.s.cache_get=lambda key:{'sha':'a'*40,'packet':packet}
    planner.crew.job=lambda jid:planner.crew.brain.rows[jid]
    return ScientificCoveragePlanner(planner.crew),packet

def state(p):return p.load('owner','repo','fog')
def activate(p):p.configure('owner','repo','fog',True,True);p.tick();return state(p)
def proposal(plan,topic='New question',query='primary evidence question'):
    return {'decision':'investigate','domain':plan['domain'],'topic':topic,'rationale':'The supplied source gap merits a distinct investigation.',
            'anchor_ids':[],'novel_topic':True,'strategy':{'question':topic,'queries':[query],'reuse':[]},'finding_uses':[]}
def complete(p,plan,value):p.crew.brain.complete(plan['job_id'],value)

def test_parallel_planning_lanes_have_no_fixed_physics_mission(science):
    p,packet=science;s=activate(p)
    plans=list(s['decisions'].values());assert len(plans)==3
    assert len({v['domain'] for v in plans})==3
    for plan in plans:
        assert plan['input']['objective']==s['objective']
        assert plan['input']['graph']==packet['planning_graph']
        assert 'Map the physics branch' not in p.crew.brain.rows[plan['job_id']]['system']
    p.tick();assert len(p.crew.brain.rows)==3

def test_new_topic_is_admitted_with_saved_brain_rationale(science):
    p,_=science;s=activate(p);plan=next(iter(s['decisions'].values()))
    value=proposal(plan);complete(p,plan,value);p.tick();s=state(p)
    task=next(iter(s['tasks'].values()))
    assert task['decision']==value and task['origin']==AUTHORITY
    assert not task['target']['canonical'] and task['target']['id'].startswith('proposed-topic:')
    assert task['planning_job_id']==plan['job_id'] and task['planning_input_sha256']==digest(plan['input'])

def test_same_investigation_rejected_but_distinct_revisit_allowed(science):
    p,_=science;s=activate(p);plan=next(iter(s['decisions'].values()));value=proposal(plan)
    key=validate_proposal(value,plan,s);s['tasks'][key]={'domain':plan['domain'],'decision':value}
    with pytest.raises(ValueError,match='repeat'):validate_proposal(value,plan,s)
    other=proposal(plan,'New mechanism','different primary evidence')
    assert validate_proposal(other,plan,s)!=key

def test_substantive_graph_change_replans_waiting_domain(science):
    p,packet=science;s=activate(p);plans=list(s['decisions'].values())
    for plan in plans:complete(p,plan,{'decision':'wait','domain':plan['domain'],'reason':'Current strategy has no usable primary evidence','exhausted_strategy':'first search'})
    p.tick();before=len(p.crew.brain.rows)
    for _ in range(5):p.tick()
    # Remaining domains may obtain lanes; exhausted same-state lanes never repeat.
    assert sum(d['domain']==plans[0]['domain'] for d in state(p)['decisions'].values())==1
    packet['planning_graph']['nodes'].append({'id':'new.finding','label':'New finding','domain':plans[0]['domain'],'kind':'claim','summary':'A scoped new result.'})
    packet['coverage_inventory'].append(packet['planning_graph']['nodes'][-1])
    p.crew.ws.resolve=lambda *a:'b'*40;p.crew.ws.s.cache_get=lambda key:{'sha':'b'*40,'packet':packet}
    # Finish other lanes so re-planning capacity exists.
    for d in state(p)['decisions'].values():
        if d['state'] in {'QUEUED','CLAIMED','SENT'}:complete(p,d,{'decision':'wait','domain':d['domain'],'reason':'No usable source','exhausted_strategy':'search'})
    p.tick();s=state(p)
    assert any(any(n['id']=='new.finding' for n in d['input']['recent_findings']) for d in s['decisions'].values())

def test_finding_reference_requires_exact_summary_and_reason(science):
    p,_=science;s=activate(p);plan=next(iter(s['decisions'].values()));v=proposal(plan)
    n=plan['input']['graph']['nodes'][0]
    v['finding_uses']=[{'id':n['id'],'summary':'invented stronger assertion','implication':'test'}]
    with pytest.raises(ValueError,match='exact canonical'):validate_proposal(v,plan,s)
    v['finding_uses'][0]['summary']=n.get('summary','');assert validate_proposal(v,plan,s)

def test_source_reuse_requires_distinct_assertion(science):
    p,_=science;s=activate(p);plan=next(iter(s['decisions'].values()));v=proposal(plan)
    v['strategy']['reuse']=[{'url':'https://example.org/primary'}]
    with pytest.raises(ValueError,match='distinct'):validate_proposal(v,plan,s)
    v['strategy']['reuse'][0]['new_assertion']='A different unrepresented measurement'
    assert validate_proposal(v,plan,s)

def test_planning_enqueue_crash_recovers_same_job(science):
    p,_=science;p.configure('owner','repo','fog',True,True)
    original=p.crew.brain.enqueue
    def crash(*args,**kwargs):original(*args,**kwargs);raise RuntimeError('post-commit crash')
    p.crew.brain.enqueue=crash;p.tick();s=state(p);assert len(p.crew.brain.rows)==1
    s['next_attempt_at']=0;p.save(p.location('owner','repo','fog'),s);p.crew.brain.enqueue=original
    restarted=ScientificCoveragePlanner(p.crew);restarted.tick()
    assert len(p.crew.brain.rows)==3 and len({d['job_id'] for d in state(p)['decisions'].values()})==3

def test_pause_preserves_publication_permission_and_plans(science):
    p,_=science;s=activate(p);p.configure('owner','repo','fog',False,True);p.tick()
    assert state(p)['auto_publish'] and not state(p)['enabled']
    assert state(p)['decisions']==s['decisions']

def test_completed_publication_automatically_gets_justified_substantive_followup(science):
    p,packet=science
    nodes=[n for n in packet['coverage_inventory'] if n['domain']=='physics']
    packet['coverage_inventory']=nodes;packet['planning_graph']['nodes']=copy.deepcopy(nodes)
    packet['coverage_by_domain']=[{'domain':'physics','label':'Synthetic Physics lane'}]
    s=activate(p);first=next(iter(s['decisions'].values()));complete(p,first,proposal(first));p.tick()
    task=next(iter(state(p)['tasks'].values()));finish(p,task)
    finding={'id':'published.new.finding','label':'New measured result','domain':'physics','kind':'claim','summary':'The primary experiment reports a bounded result.'}
    packet['coverage_inventory'].append(finding);packet['planning_graph']['nodes'].append(copy.deepcopy(finding))
    p.crew.ws.resolve=lambda *a:'b'*40;p.crew.ws.s.cache_get=lambda key:{'sha':'b'*40,'packet':packet}
    p.tick();s=state(p);second=list(s['decisions'].values())[-1]
    assert second['id']!=first['id'] and finding in second['input']['recent_findings']
    v=proposal(second,'Follow up new measurement','independent primary replication query')
    v['finding_uses']=[{'id':finding['id'],'summary':finding['summary'],'implication':'Investigate independent replication of this exact bounded result.'}]
    complete(p,second,v);p.tick();s=state(p)
    assert len(s['tasks'])==2 and list(s['tasks'].values())[-1]['decision']==v
    before=len(p.crew.brain.rows)
    for _ in range(3):p.tick()
    assert len(p.crew.brain.rows)==before and s['totals']['new_nodes']==7

@pytest.mark.parametrize('status',['CLAIMED','SENT'])
def test_restart_and_deadline_resume_exact_lease_never_requeue(tmp_path,status):
    store=Store(str(tmp_path/'arena.db'))
    try:
        b=BrainBridge(store);b.set_enabled(True);b.set_research_config(enabled=True)
        jid=b.enqueue('synthetic','synthetic',20,'fog-crew:plan:restart')
        owner='synthetic-owner-12345';body={'client_id':owner,'worker_slot':'worker_1','role':'research','state':'READY'}
        job=b.poll(body)['job'];store.execute('UPDATE brain_jobs SET status=? WHERE id=?',(status,jid))
        restarted=BrainBridge(store);again=restarted.poll(body)['job']
        assert again['status']==status and again['lease']==job['lease'] and again['owner']==owner
        assert json.loads(again['packet'])['STATE']['resume_only']
        assert not restarted.authorize_send(jid,{'client_id':owner,'lease':job['lease'],'worker_slot':'worker_1'})['ok']
        store.execute('UPDATE brain_jobs SET deadline=? WHERE id=?',(time.time()-1,jid));restarted.expire()
        row=store.one('SELECT * FROM brain_jobs WHERE id=?',(jid,));assert row['status']==status and row['lease']==job['lease']
        result={'client_id':owner,'lease':job['lease'],'result':{'protocol':'pandora-language/1','request_id':jid,'RETURN':{'status':'complete','text':'real shape; synthetic response','evidence':[]}}}
        assert restarted.result(jid,result)['status']=='COMPLETE'
        assert len(store.query('SELECT id FROM brain_jobs'))==1
    finally:store.db.close()
