"""Disposable, offline adversarial tests for actual controller transitions."""
import asyncio
import json
import time
import pytest
from sim.store import Store
from sim.engine import Arena
from sim.pandora import Pandora

OBJECTIVE = 'Explain research memory cache invalidation using retained evidence and rival mechanisms.'
QUOTE = 'Retained research evidence can be reprocessed through a different generator without acquiring new observations.'


class Federation:
    def __init__(self):
        self.calls = []

    async def provider(self, name, query):
        self.calls.append((name, query))
        return [{'title': 'Research memory cache invalidation and retained evidence',
                 'doi': '10.9999/retained-evidence', 'provider': name,
                 'abstract_snippet': QUOTE, 'url': 'https://example.invalid/fixture'}], False


@pytest.fixture
def unit(tmp_path):
    s = Store(str(tmp_path/'v16.db')); a = Arena(s); f = Federation(); p = Pandora(s, arena=a, federation=f)
    cid = p.guided.start(OBJECTIVE, 'computing', mode='RESEARCH')['campaign_id']
    p.frontier.enable(cid)
    yield s, a, p, cid, f
    s.db.close()


def source(p, cid):
    sid = p.db.source({'title': 'Research memory cache invalidation', 'provider': 'fixture',
                       'doi': '10.9999/retained-evidence', 'abstract_snippet': QUOTE})
    p.db.link_source(cid, sid, 'fixture')
    p.frontier.refresh(cid)
    return sid


def action(p, cid, kind, target='fixture'):
    p.frontier._offer(cid, kind, target, 5, 1, 'Offline adversarial fixture')
    r = p.frontier.row(cid)
    a = p.db.store.one('''SELECT * FROM frontier_actions WHERE campaign_id=? AND kind=?
        AND target=? AND generator_version=? ORDER BY created DESC LIMIT 1''', (cid, kind, target, r['generator_version']))
    p.db.store.execute("UPDATE frontier_actions SET status='DISPATCHED' WHERE id=?", (a['id'],))
    return a['id']


def generator():
    return {'name': 'Decoder-relative equivalence', 'rule': 'Partition retained observations by future prediction under the decoder',
            'scope': 'Identical retained observations and declared prediction operators',
            'observables': ['prediction equivalence', 'rival discrimination'],
            'falsifier': 'Two states in the same class yield different declared predictions'}


def test_new_controller_retires_36_duplicates_and_uses_existing_queue(unit):
    s, a, p, cid, f = unit
    active = s.query("SELECT * FROM campaign_tasks WHERE campaign_id=? AND status='QUEUED'", (cid,))
    assert 1 <= len(active) <= 3
    assert all(t['task_type'] == 'SWARM_FRONTIER' for t in active)
    assert s.one("SELECT COUNT(*) n FROM campaign_tasks WHERE campaign_id=? AND task_type='SWARM_GUIDED_PRIOR_ART' AND status='SUPERSEDED'", (cid,))['n'] == 36
    assert len({t['target_ref'] for t in active}) == len(active)


def test_same_D_new_G_new_K_and_reprocessing_is_required(unit):
    s, a, p, cid, f = unit; sid = source(p, cid)
    before = p.frontier.row(cid)
    aid = action(p, cid, 'MAP_SEARCH')
    assert p.frontier.ingest(aid, {'generator': generator()}) == 'DONE'
    after = p.frontier.row(cid)
    assert after['data_hash'] == before['data_hash']
    assert after['generator_version'] == before['generator_version']+1
    assert after['knowledge_version'] > before['knowledge_version']
    # Finish initial acquisition lanes so new G can reprocess retained D.
    s.execute("UPDATE frontier_actions SET status='DONE' WHERE campaign_id=? AND kind='SEARCH'", (cid,))
    p.frontier.plan(cid)
    assert s.one("SELECT COUNT(*) n FROM frontier_actions WHERE campaign_id=? AND kind='REANALYZE_EXISTING_STATE'", (cid,))['n'] == 1
    aid = action(p, cid, 'REANALYZE_EXISTING_STATE', 'retained:0')
    p.frontier.ingest(aid, {'claims': [{'text': 'A decoder change can alter predictions under unchanged observations',
        'type': 'inference', 'scope': 'The supplied retained fragment', 'falsifier': 'No changed prediction',
        'citations': [{'source_id': sid, 'quote': QUOTE}]}]})
    assert p.frontier.row(cid)['data_hash'] == before['data_hash']
    assert p.frontier.objects(cid, 'CLAIM')[0]['payload']['verification'].startswith('Exact quote checked')
    assert p.frontier.objects(cid, 'CLAIM')[0]['status'] == 'PROVISIONAL'


@pytest.mark.parametrize('raw', ['not json', '[]', '', '{broken', 'x'*80001],
                         ids=['prose','array','empty','broken','oversized'])
def test_malformed_results_fail_bounded_without_graph_changes(unit, raw):
    s, a, p, cid, f = unit; aid = action(p, cid, 'SYNTHESIZE')
    assert p.frontier.ingest(aid, raw) == 'FAILED'
    assert not p.frontier.objects(cid)


def test_duplicate_and_cosmetic_generator_are_not_new_progress(unit):
    s, a, p, cid, f = unit; aid = action(p, cid, 'MAP_SEARCH')
    assert p.frontier.ingest(aid, {'generator': generator()}) == 'DONE'
    assert p.frontier.ingest(aid, {'generator': generator()}) == 'DUPLICATE'
    aid2 = action(p, cid, 'MAP_SEARCH', 'cosmetic')
    assert p.frontier.ingest(aid2, {'generator': generator()}) == 'LOW_YIELD'
    assert p.frontier.row(cid)['generator_version'] == 1


def test_generator_retires_obsolete_queue_and_stale_results_are_excluded(unit):
    s, a, p, cid, f = unit
    old = action(p, cid, 'SYNTHESIZE', 'old')
    queued = action(p, cid, 'MIPU_SEARCH', 'obsolete')
    s.execute("UPDATE frontier_actions SET status='QUEUED' WHERE id=?", (queued,))
    aid = action(p, cid, 'MAP_SEARCH')
    p.frontier.ingest(aid, {'generator': generator()})
    assert s.one('SELECT status FROM frontier_actions WHERE id=?', (queued,))['status'] == 'SUPERSEDED'
    assert p.frontier.ingest(old, {'claims': [{'text': 'Stale result cannot become current knowledge'}]}) == 'STALE'
    assert not p.frontier.objects(cid, 'CLAIM')


def test_content_correction_changes_D_without_changing_source_count(unit):
    s, a, p, cid, f = unit; sid = source(p, cid); before = p.frontier.row(cid)['data_hash']
    s.execute('UPDATE sources SET abstract_snippet=? WHERE id=?', ('Corrected retained research evidence contradicts the earlier decoder assumption.', sid))
    p.frontier.refresh(cid)
    assert p.frontier.row(cid)['data_hash'] != before
    assert p.frontier.snapshot(cid)['D']['sources'] == 1


def test_fabricated_quotes_and_unknown_sources_are_rejected(unit):
    s, a, p, cid, f = unit; sid = source(p, cid); aid = action(p, cid, 'SYNTHESIZE')
    data = {'claims': [{'text': 'A fabricated source proves cache correctness', 'citations': [{'source_id': sid, 'quote': 'Fabricated quote not present in retained evidence.'}]}]}
    assert p.frontier.ingest(aid, data) == 'LOW_YIELD'
    assert not p.frontier.objects(cid, 'CLAIM')


def test_contradiction_remains_contested_and_never_falsifies_from_prose(unit):
    s, a, p, cid, f = unit; aid = action(p, cid, 'SYNTHESIZE')
    p.frontier.ingest(aid, {'claims': [{'text': 'One invariant may explain all retained observations'}]})
    claim = p.frontier.objects(cid, 'CLAIM')[0]
    aid = action(p, cid, 'ATTACK', claim['id'])
    p.frontier.ingest(aid, {'attacks': [{'claim_id': claim['id'], 'objection': 'A hidden confound could explain the same observations', 'discriminator': 'Compare a controlled held-out case'}]})
    assert p.frontier.objects(cid, 'CLAIM')[0]['status'] == 'CONTESTED'
    assert p.frontier.objects(cid, 'ATTACK')


def test_model_cannot_install_unscoped_or_arbitrary_generator(unit):
    s, a, p, cid, f = unit
    aid = action(p, cid, 'SYNTHESIZE'); p.frontier.ingest(aid, {'generator': generator()})
    aid = action(p, cid, 'MAP_SEARCH'); p.frontier.ingest(aid, {'generator': {'name': 'vague pattern'}})
    assert p.frontier.row(cid)['generator_version'] == 0


def test_brain_delegation_is_idempotent_and_result_consumed_after_restart(unit):
    s, a, p, cid, f = unit; a.llm.brain.set_enabled(True);a.llm.brain.set_research_config(enabled=True,multi=True)
    aid = action(p, cid, 'MIPU_SEARCH');p.frontier.plan(cid)
    row=s.one('SELECT * FROM frontier_actions WHERE id=?',(aid,))
    # Direct fixture task matches the existing identity-bound queue contract.
    task={'target_ref':'frontier:'+aid+':try0','id':'fixture'}
    asyncio.run(p.frontier.execute(p.db.campaign(cid),task))
    job=s.one('SELECT job_id FROM frontier_actions WHERE id=?',(aid,))['job_id']
    asyncio.run(p.frontier.execute(p.db.campaign(cid),task))
    assert s.one('SELECT COUNT(*) n FROM brain_research_assignments WHERE job_id=?',(job,))['n']==1
    a.llm.brain._ingest_research_result(job,json.dumps({'conclusion':'A boundary discriminator is missing', 'obligations':[{'text':'Check one held-out decoder boundary'}]}))
    fresh=Pandora(s,arena=a,federation=f);fresh.frontier.tick()
    assert fresh.frontier.objects(cid,'OBLIGATION')
    assert s.one('SELECT status FROM frontier_actions WHERE id=?',(aid,))['status']=='DONE'


def test_sent_stale_job_is_never_cancelled_but_queued_job_is(unit):
    s,a,p,cid,f=unit;a.llm.brain.set_enabled(True);a.llm.brain.set_research_config(enabled=True)
    aid=action(p,cid,'MIPU_SEARCH');task={'target_ref':'frontier:'+aid,'id':'fixture'}
    asyncio.run(p.frontier.execute(p.db.campaign(cid),task))
    row=s.one('SELECT * FROM frontier_actions WHERE id=?',(aid,))
    s.execute("UPDATE brain_jobs SET status='SENT' WHERE id=?",(row['job_id'],))
    p.frontier.complete(row,{},'STALE')
    assert s.one('SELECT status FROM brain_jobs WHERE id=?',(row['job_id'],))['status']=='SENT'


def test_low_yield_exhaustion_never_closes_the_objective(unit):
    s,a,p,cid,f=unit
    s.execute("UPDATE frontier_actions SET status='LOW_YIELD' WHERE campaign_id=?",(cid,))
    # Cover the full available action vocabulary for this D/G pair.
    p.frontier.plan(cid)
    for _ in range(3):
        s.execute("UPDATE frontier_actions SET status='LOW_YIELD' WHERE campaign_id=?",(cid,))
        p.frontier.tick()
    snap=p.frontier.snapshot(cid)
    assert snap['status']=='WAITING_EXTERNAL', s.query("SELECT kind,status,result FROM frontier_actions WHERE campaign_id=? AND status='FAILED'", (cid,))
    assert 'exhausted' in snap['reason']
    assert p.db.campaign(cid)['status']!='RESOLVED'
    assert p.guided.row(cid)['status']=='PAUSED'


def test_unproductive_tranche_is_semantic_saturation_not_scientific_closure(unit):
    s,a,p,cid,f=unit;r=p.frontier.row(cid);cfg=json.loads(r['config']);cfg['max_actions']=8
    s.execute('UPDATE frontier_campaigns SET config=? WHERE campaign_id=?',(json.dumps(cfg),cid))
    for i in range(8):action(p,cid,'VERIFY_SOURCE','no-progress-'+str(i))
    s.execute("UPDATE frontier_actions SET status='LOW_YIELD' WHERE campaign_id=?", (cid,))
    p.frontier.plan(cid)
    assert p.frontier.snapshot(cid)['status']=='SATURATED'
    assert 'unresolved' in p.frontier.snapshot(cid)['reason']


def test_unattended_synthetic_campaign_evolves_and_stops_without_repeat_search(unit):
    s,a,p,cid,f=unit
    async def ask(system,user,*args,**kwargs):
        packet=json.loads(user);kind=packet['action']
        if kind=='MAP_SEARCH':return json.dumps({'conclusion':'Use decoder-relative equivalence','generator':generator()}),'fixture'
        if kind=='REANALYZE_EXISTING_STATE':
            src=packet['D']['sources'][0]
            return json.dumps({'conclusion':'Same evidence exposes a new implication','claims':[{'text':'Decoder equivalence reveals a new cache invalidation discriminator',
                'scope':'Supplied retained evidence','falsifier':'Different declared predictions in one class',
                'citations':[{'source_id':src['id'],'quote':QUOTE}]}]}),'fixture'
        if kind=='ATTACK':return json.dumps({'attacks':[{'claim_id':packet['target'],'objection':'A hidden variable may split the equivalence class','discriminator':'Test held-out cache histories'}]}),'fixture'
        return json.dumps({'conclusion':'No additional consequential result'}),'fixture'
    a.llm.exchange.ask=ask
    for _ in range(45):
        asyncio.run(p.workers.tick(cid=cid,limit=4));p.frontier.tick()
        if p.frontier.row(cid)['status']!='ACTIVE':break
    snap=p.frontier.snapshot(cid)
    assert snap['G']['version']==1
    assert snap['D']['sources']==1
    assert snap['K']['objects'] and snap['metrics']['frontier_changes']>=2
    assert snap['status']=='WAITING_EXTERNAL', s.query("SELECT kind,status,result FROM frontier_actions WHERE campaign_id=? AND status='FAILED'", (cid,))
    assert len(f.calls)==len({q for _,q in f.calls})==3
    assert s.one("SELECT COUNT(*) n FROM frontier_actions WHERE campaign_id=? AND kind='REANALYZE_EXISTING_STATE' AND status='DONE'",(cid,))['n']==1


def test_legacy_eureka_overlap_never_promotes(unit):
    s,a,p,cid,f=unit
    assert a.llm.brain.corroborate_research('computing','GENERAL',OBJECTIVE,'SURVIVES')==0


def test_repeated_enable_does_not_retire_or_duplicate_running_work(unit):
    s,a,p,cid,f=unit
    before=s.query('SELECT id,status,task_id FROM frontier_actions WHERE campaign_id=? ORDER BY id',(cid,))
    p.frontier.enable(cid)
    assert s.query('SELECT id,status,task_id FROM frontier_actions WHERE campaign_id=? ORDER BY id',(cid,))==before


def test_independent_tasks_use_distinct_existing_agents(unit):
    s,a,p,cid,f=unit
    tasks=s.query("SELECT agent_id FROM campaign_tasks WHERE campaign_id=? AND status='QUEUED'",(cid,))
    assert len(tasks)==3 and len({t['agent_id'] for t in tasks})==3


def test_disappeared_brain_worker_expires_without_global_primary_hold(unit):
    s,a,p,cid,f=unit;a.llm.brain.set_enabled(True);a.llm.brain.set_research_config(enabled=True)
    aid=action(p,cid,'MIPU_SEARCH');task={'target_ref':'frontier:'+aid,'id':'fixture'}
    asyncio.run(p.frontier.execute(p.db.campaign(cid),task))
    job=s.one('SELECT job_id FROM frontier_actions WHERE id=?',(aid,))['job_id']
    s.execute("UPDATE brain_jobs SET status='SENT',deadline=?,worker_slot='worker_1' WHERE id=?",(time.time()-1,job))
    p.frontier.tick()
    assert s.one('SELECT status FROM frontier_actions WHERE id=?',(aid,))['status']=='WAITING'
    retried=s.one('SELECT status,packet FROM brain_jobs WHERE id=?',(job,))
    assert retried['status']=='SENT' and json.loads(retried['packet'])['STATE']['timeout_retries']==1
    assert json.loads(retried['packet'])['STATE']['resume_only'] is True
    assert not a.llm.brain.hold
    s.execute("UPDATE brain_jobs SET status='SENT',deadline=? WHERE id=?",(time.time()-1,job))
    p.frontier.tick()
    assert s.one('SELECT status FROM frontier_actions WHERE id=?',(aid,))['status']=='FAILED'
    assert not a.llm.brain.hold
