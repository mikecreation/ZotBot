"""Cancellation/disable must preserve scientific work and exact delivery ownership."""
import copy,hashlib,json,time
import pytest
from test_github_evidence import rig,author,approve
from test_brain_bridge_v14 import b,poll,result
from sim import github_evidence as ge
from sim.brain_bridge import BrainBridge

def fingerprint(folder):
    return {p.relative_to(folder).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
            for p in folder.rglob('*') if p.is_file() and p.suffix in {'.json','.jsonl','.bin'}
            and '/.nemesis-control/review-input.json' not in p.as_posix()}

@pytest.mark.parametrize('stage',['author','author-unit','review','review-unit'])
@pytest.mark.parametrize('status',['CANCELLED','FAILED','INTERRUPTED','QUARANTINED'])
def test_transport_termination_never_reauthors_or_spends_revision(rig,monkeypatch,stage,status):
    author(rig)
    if stage.startswith('review'):
        rig.crew.tick()
        approve(rig,'entailment');rig.crew.tick()
    flow=rig.crew.load(rig.folder)
    original_stage=flow['state']
    if stage=='author-unit':
        jid=flow['jobs']['author']
        flow['author_units']=[{'index':0,'goal':rig.brain.rows[jid]['goal'],'job_id':jid}]
    elif stage=='review-unit':
        packet=json.loads((rig.folder/'project/nemesis/batches/test-evidence/.nemesis-control/packet.json').read_text())
        flow['review_units']=[{'index':0,'packet':packet,'jobs':copy.deepcopy(flow['jobs']),
                              'retained_roles':['entailment']}]
        monkeypatch.setattr(rig.crew,'review_small',lambda f,d,p:rig.crew.review_partitioned(f,d,p))
    jid=flow['jobs']['adversarial' if stage.startswith('review') else 'author']
    rig.brain.rows[jid].update(status=status,error='Brain provider disabled',result=None)
    rig.crew.save(rig.folder,flow)
    before=fingerprint(rig.folder/'project')
    count=len(rig.brain.rows)
    jobs=copy.deepcopy(flow['jobs'])
    rig.crew.tick()
    final=rig.crew.load(rig.folder)
    assert final['state']=='BLOCKED'
    assert final['resume_stage']==original_stage
    assert final['failure_kind']=='operational'
    assert final['error_code']=='brain-job-terminal'
    assert final['transport_wait']['job_id']==jid
    assert final['jobs']==jobs
    assert final.get('candidate_sha256')==flow.get('candidate_sha256')
    assert final.get('context_sha256')==flow.get('context_sha256')
    assert final.get('retained_roles',[])==flow.get('retained_roles',[])
    assert final.get('author_units')==flow.get('author_units')
    assert final.get('review_units')==flow.get('review_units')
    assert final['author_attempt']==flow['author_attempt']
    assert final.get('revision_counts',{})==flow.get('revision_counts',{})
    assert fingerprint(rig.folder/'project')==before
    assert len(rig.brain.rows)==count
    assert not rig.ws.publications
    # The ordinary upgrade-recovery button must not reset exact work either.
    assert rig.crew.recover('owner','repo','fog')['recovered']==[]
    assert len(rig.brain.rows)==count
    assert fingerprint(rig.folder/'project')==before

def test_disabled_crew_does_not_advance_or_consume_retry_budget(rig):
    author(rig);rig.crew.tick()
    before=(rig.folder/'flow.json').read_bytes();count=len(rig.brain.rows)
    rig.brain.enabled=False
    for _ in range(8):rig.crew.advance(rig.folder)
    assert (rig.folder/'flow.json').read_bytes()==before
    assert len(rig.brain.rows)==count

def test_exact_job_recovery_resumes_review_without_new_author_or_reviewer(rig):
    author(rig);rig.crew.tick()
    approve(rig,'entailment');rig.crew.tick()
    before=rig.crew.load(rig.folder);jid=before['jobs']['adversarial']
    rig.brain.rows[jid].update(status='FAILED',error='No send attempted')
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state']=='BLOCKED'
    count=len(rig.brain.rows)
    # Emulate the existing Brain's proven-unsent recovery of this SAME ID.
    rig.brain.rows[jid].update(status='QUEUED',error='Fog lease/auth recovery requeue; no prior send assumed')
    rig.crew.tick()
    resumed=rig.crew.load(rig.folder)
    assert resumed['state']=='REVIEW'
    assert resumed['candidate_sha256']==before['candidate_sha256']
    assert resumed['context_sha256']==before['context_sha256']
    assert resumed['jobs']==before['jobs']
    assert resumed['retained_roles']==['entailment']
    assert resumed['author_attempt']==before['author_attempt']
    assert len(rig.brain.rows)==count
    assert resumed['transport_history'][0]['details']['job_id']==jid
    approve(rig,'adversarial');rig.crew.tick()
    assert rig.crew.load(rig.folder)['state']=='CI'
    assert len(rig.brain.rows)==count

@pytest.mark.parametrize('phase',['QUEUED','CLAIMED','SENT'])
def test_provider_toggle_preserves_fog_id_lease_packet_and_deadline(b,phase,monkeypatch):
    jid=b.enqueue('same sources','same candidate',tag='fog-crew:evidence:adversarial:retained')
    job=poll(b) if phase!='QUEUED' else None
    if phase=='SENT':b.result(jid,{**result(job),'sent':True})
    before=b.store.one('SELECT * FROM brain_jobs WHERE id=?',(jid,))
    clock=time.time()
    monkeypatch.setattr('sim.brain_bridge.time.time',lambda:clock)
    b.set_enabled(False)
    clock+=7200
    b.set_enabled(False)  # Repeated disable must not lose the original pause duration.
    b.expire()
    after=b.store.one('SELECT * FROM brain_jobs WHERE id=?',(jid,))
    assert after==before
    assert poll(b) is None
    b.set_enabled(True)
    resumed=b.store.one('SELECT * FROM brain_jobs WHERE id=?',(jid,))
    assert resumed['deadline']==pytest.approx(before['deadline']+7200)
    for key in ('id','status','packet','owner','lease','worker_slot','transport_retries'):
        assert resumed[key]==before[key]
    b.set_enabled(True)
    assert b.store.one('SELECT deadline FROM brain_jobs WHERE id=?',(jid,))['deadline']==resumed['deadline']
    if job:
        same=poll(b)
        assert same['id']==jid and same['lease']==job['lease']
        assert b.result(jid,result(job))['status']=='COMPLETE'

def test_disabled_fog_can_collect_completed_owned_turn_without_dispatch(b):
    jid=b.enqueue('exact','exact',tag='fog-crew:evidence:author:retained')
    job=poll(b);b.set_enabled(False)
    assert poll(b) is None
    assert b.result(jid,result(job))['status']=='COMPLETE'
    assert poll(b) is None

def test_disabled_restart_keeps_fog_lease_for_collection_only(b):
    jid=b.enqueue('exact','exact',tag='fog-crew:evidence:entailment:retained')
    job=poll(b);b.set_enabled(False)
    restarted=BrainBridge(b.store)
    assert poll(restarted) is None
    assert restarted.result(jid,result(job))['status']=='COMPLETE'
    assert b.store.kv_get('brain_fog_pause_started') is not None
    restarted.set_enabled(True)
    assert b.store.kv_get('brain_fog_pause_started') is None

def test_non_fog_disable_keeps_existing_cancellation_semantics(b):
    jid=b.enqueue('coding','unrelated');job=poll(b);b.set_enabled(False)
    assert b.result(jid,result(job))['status']=='CANCELLED'
