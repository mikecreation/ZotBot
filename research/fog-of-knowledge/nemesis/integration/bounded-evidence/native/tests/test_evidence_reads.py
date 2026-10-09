"""Bounded delivery must preserve evidence access and the real compiler gate."""
import copy,hashlib,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import pytest
from sim.fog_evidence_reads import EvidenceReads,author_frames,review_frame,bounded_review_units,size,FRAME_LIMIT,READ_LIMIT
from test_github_evidence import rig,author,approve

def source(text):
    return {'id':'paper','url':'https://example.org/primary','title':'Synthetic primary fixture',
            'text':text,'sha256':hashlib.sha256(text.encode()).hexdigest()}

def session(tmp_path,key='author',text=None):
    folder=tmp_path/'crew';graph=folder/'project/data/knowledge.json';graph.parent.mkdir(parents=True,exist_ok=True)
    graph.write_text(json.dumps({'nodes':[{'id':'existing','label':'Existing discovery','summary':'Complete retained record'}]}))
    value={'sources':[source(text or 'prefix '+'x'*10000+' COUNTEREVIDENCE: limited to laboratory conditions.')],
           'record_catalog':[{'id':str(i),'label':'discovery'} for i in range(50000)]}
    flow={};reads=EvidenceReads(folder,flow,key);reads.create(value,author_frames(value)[0]);return reads,flow,value

def packet(text='Support sentence.'+'x'*1000000+' LIMITATION: not a power plant.'):
    s=source(text);quote='Support sentence.';node={'id':'result','label':'Result','summary':quote,'domain':'physical'}
    return {'candidate_sha256':'a'*64,'context_sha256':'b'*64,'existing_endpoints':[{'id':'unrelated','summary':'Do not repeat'}],
            'records':{'manifest.json':{},'nodes.jsonl':[node],'edges.jsonl':[],'reviews.jsonl':[],'taxonomy.jsonl':[],'identities.jsonl':[],
            'sources.jsonl':[s],'assertions.jsonl':[{'id':'assertion','target_kind':'node',
                'target_sha256':hashlib.sha256(json.dumps(node,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
                'canonical_record':node,'scope':{'uncertainty':'laboratory only'},'support':[{'source_id':'paper','quote':quote,'start':0,'end':len(quote)}]}]}}

@pytest.mark.parametrize('characters',[300000,3000000])
def test_paper_and_graph_growth_does_not_grow_browser_prompt(tmp_path,characters):
    reads,flow,value=session(tmp_path,text='Context '+'x'*characters)
    frame=reads.base();assert size(frame)<4000
    assert frame['existing_record_access']['catalog_records']==50000
    assert frame['sources'][0]['characters']==len(value['sources'][0]['text'])
    assert frame['sources'][0]['text_is_complete'] is False
    assert reads.original()==value
    reply=reads.exchange({'operation':'source','source_id':'paper','start':characters-100,'end':characters})
    assert reply['data']['window']['text']==value['sources'][0]['text'][characters-100:characters]
    assert reply['data']['next_start']==characters

def test_late_counterevidence_is_searchable_and_unicode_offsets_are_exact(tmp_path):
    reads,_,value=session(tmp_path,text='α😀'*5000+' COUNTEREVIDENCE β😀.')
    reply=reads.exchange({'operation':'search','source_id':'paper','query':'COUNTEREVIDENCE'})
    assert reply['data']['matched']==1 and reply['data']['complete_query'] is True
    span=reply['data']['windows'][0];assert 'COUNTEREVIDENCE' in span['text']
    assert span['text']==value['sources'][0]['text'][span['start']:span['end']]
    assert span['sha256']==hashlib.sha256(span['text'].encode()).hexdigest()
    zero=reads.exchange({'operation':'search','source_id':'paper','query':'different literal'})
    assert zero['data']['matched']==0

def test_reviews_include_complete_targets_scopes_and_every_exact_quote():
    p=packet();view=review_frame(p)
    assert size(view)<5000 and p['records']['sources.jsonl'][0]['text'].endswith('power plant.')
    assert view['records']['assertions.jsonl']==p['records']['assertions.jsonl']
    assert view['records']['nodes.jsonl']==p['records']['nodes.jsonl']
    assert view['records']['sources.jsonl'][0]['windows'][0]['text'].startswith('Support sentence.')
    assert view['evidence_access']['complete_captures_retained'] is True
    assert bounded_review_units(p)==[p]

def test_exact_large_assertion_cannot_be_clipped_to_obtain_approval():
    p=packet();p['records']['assertions.jsonl'][0]['scope']['uncertainty']='u'*FRAME_LIMIT
    with pytest.raises(ValueError,match='capacity'):bounded_review_units(p)

def test_pdf_windows_keep_page_location_without_repeating_the_pdf():
    p=packet();p['records']['sources.jsonl'][0]['pages']=[{'page':1,'start':0,'end':1000,'text':'never repeated'}, {'page':2,'start':1000,'end':1000017}]
    view=review_frame(p)['records']['sources.jsonl'][0]
    assert view['page_count']==2 and 'pages' not in view
    assert view['windows'][0]['page_numbers']==[1]

@pytest.mark.parametrize('query',[
    {'operation':'shell','command':'delete'}, {'operation':'source','source_id':'../secrets','start':0,'end':2},
    {'operation':'source','source_id':'paper','start':0,'end':2001},
    {'operation':'source','source_id':'paper','start':True,'end':2},
    {'operation':'records','query':'x','path':'C:/secrets'}, {'operation':'records','ids':['existing']*11},
    {'operation':'catalog','offset':-1}])
def test_untrusted_read_is_small_typed_and_cannot_access_arbitrary_files(tmp_path,query):
    reads,_,_=session(tmp_path)
    with pytest.raises(ValueError):reads.exchange(query)

def test_complete_existing_record_and_snapshot_change_detection(tmp_path):
    reads,_,_=session(tmp_path)
    reply=reads.exchange({'operation':'records','ids':['existing']})
    assert reply['data']['records'][0]['record']['summary']=='Complete retained record'
    (tmp_path/'crew/project/data/knowledge.json').write_text('{"nodes":[]}')
    with pytest.raises(ValueError,match='changed'):reads.exchange({'operation':'records','query':'discovery'})

def test_journal_recovery_replay_budget_and_tamper_detection(tmp_path):
    reads,flow,value=session(tmp_path);query={'operation':'source','source_id':'paper','start':1,'end':80};job={'id':'owned','result':'retained response'}
    frame,entry=reads.continuation(query,job)
    # Crash before flow save: rebuild stream from durable identity, same read.
    reopened=EvidenceReads(tmp_path/'crew',{},'author');reopened.create(value,author_frames(value)[0])
    assert reopened.continuation(query,job)==(frame,entry)
    reopened.state['history'].append(entry);reopened.state['turn']=1
    assert reopened.exchange({'operation':'replay','turn':0})==frame['current_reply']
    reopened.state['limit']=1;assert reopened.continuation(query,job) is None
    assert reopened.state['waiting'] and reopened.state['pending_job']=='owned'
    (reopened.folder/'query-0.json').write_text('{}')
    with pytest.raises(ValueError,match='changed'):reopened.exchange({'operation':'replay','turn':0})

def test_source_hash_mutation_fails_closed(tmp_path):
    reads,_,_=session(tmp_path);value=reads.original();value['sources'][0]['text']='invented'
    (reads.folder/'original.json').write_text(json.dumps(value))
    with pytest.raises(ValueError,match='changed'):reads.exchange({'operation':'catalog'})

def test_partial_initial_checkpoint_recovers_without_changing_input(tmp_path):
    reads,_,value=session(tmp_path);(reads.folder/'identity.json').unlink();(reads.folder/'base.json').unlink()
    recreated=EvidenceReads(tmp_path/'crew',{},'author');frame=author_frames(value)[0]
    assert recreated.create(value,frame)==frame
    (reads.folder/'identity.json').unlink();changed=copy.deepcopy(value);changed['sources'][0]['text']='changed'
    with pytest.raises(ValueError,match='conflicts'):recreated.create(changed,frame)

def test_large_read_notice_is_explicit_and_exact_reply_remains_replayable(tmp_path):
    reads,_,_=session(tmp_path,text='😀'*3000)
    base=reads.base();base['explicit_instruction']='i'*26000
    # Synthetic large instruction is complete; it is never silently shortened.
    original=reads.original();other=EvidenceReads(tmp_path/'crew',{},'large');other.create(original,base)
    frame,entry=other.continuation({'operation':'source','source_id':'paper','start':0,'end':2000},{'id':'owned','result':'raw'})
    assert size(frame)<=FRAME_LIMIT and frame['current_reply']['complete'] is False
    assert frame['current_reply']['retained_turn']==0 and frame['explicit_instruction']==base['explicit_instruction']
    other.state['history'].append(entry);other.state['turn']=1
    assert other.exchange({'operation':'replay','turn':0})['data']['window']['text']=='😀'*2000

def test_read_restart_and_two_independent_roles_reach_real_compiler_and_exact_head_ci(rig):
    candidate=author(rig);flow=rig.crew.load(rig.folder);initial=flow['jobs']['author']
    request={'decision':'retrieve','request':{'operation':'catalog','offset':0}}
    rig.brain.complete(initial,request);rig.crew.tick();flow=rig.crew.load(rig.folder);next_author=flow['jobs']['author']
    assert next_author!=initial and not rig.ws.publications
    rig.crew.tick();assert rig.crew.load(rig.folder)['jobs']['author']==next_author
    rig.brain.complete(next_author,candidate);rig.crew.tick();flow=rig.crew.load(rig.folder)
    assert flow['state']=='REVIEW';original_adversarial=flow['jobs']['adversarial'];original_hash=flow['candidate_sha256']
    rig.brain.complete(flow['jobs']['entailment'],request);rig.crew.tick();flow=rig.crew.load(rig.folder)
    assert flow['jobs']['adversarial']==original_adversarial and flow['candidate_sha256']==original_hash
    assert 'entailment' not in flow.get('retained_roles',[])
    approve(rig,'entailment')
    decision=json.loads(json.loads(rig.brain.rows[flow['jobs']['entailment']]['result'])['RETURN']['text'])
    decision['decisions'][0]['rationale']+=' ROLE_PRIVATE_ENTAILMENT_RESULT'
    rig.brain.complete(flow['jobs']['entailment'],decision);rig.crew.tick();assert not rig.ws.publications
    rig.brain.complete(original_adversarial,request);rig.crew.tick();flow=rig.crew.load(rig.folder)
    assert 'ROLE_PRIVATE_ENTAILMENT_RESULT' not in rig.brain.rows[flow['jobs']['adversarial']]['goal']
    approve(rig,'adversarial');rig.crew.tick();flow=rig.crew.load(rig.folder)
    assert flow['state']=='CI' and not rig.ws.client.writes
    rig.ws.client.green=True;flow['next_ci_check']=0;rig.crew.save(rig.folder,flow);rig.crew.tick()
    assert rig.crew.load(rig.folder)['state']=='MERGED'
    for row in list(rig.brain.rows.values())[1:]:assert len(row['goal'].encode())<=FRAME_LIMIT

def test_read_budget_wait_never_reauthors_or_counts_as_review(rig):
    author(rig);flow=rig.crew.load(rig.folder);jid=flow['jobs']['author'];key=next(iter(flow['evidence_reads']))
    flow['evidence_reads'][key]['limit']=0;rig.crew.save(rig.folder,flow)
    rig.brain.complete(jid,{'decision':'retrieve','request':{'operation':'catalog'}});rig.crew.tick();flow=rig.crew.load(rig.folder)
    assert flow['state']=='AUTHOR' and flow['jobs']['author']==jid and flow['author_attempt']==1
    assert flow['evidence_read_wait']['key']==key and not rig.ws.publications
    rig.crew.resume_evidence_reads('owner','repo','test-evidence',key,2);rig.crew.tick()
    assert rig.crew.load(rig.folder)['jobs']['author']!=jid

def test_enqueue_before_checkpoint_crash_reuses_same_owned_read_job(rig,monkeypatch):
    author(rig);flow=rig.crew.load(rig.folder);jid=flow['jobs']['author']
    rig.brain.complete(jid,{'decision':'retrieve','request':{'operation':'catalog'}})
    original_save=rig.crew.save
    def crash(*args):raise SystemExit('Simulated process loss after enqueue')
    monkeypatch.setattr(rig.crew,'save',crash)
    with pytest.raises(SystemExit):rig.crew.advance(rig.folder)
    allocated=set(rig.brain.rows);assert rig.crew.load(rig.folder)['jobs']['author']==jid
    monkeypatch.setattr(rig.crew,'save',original_save);rig.crew.advance(rig.folder)
    assert set(rig.brain.rows)==allocated and rig.crew.load(rig.folder)['jobs']['author']!=jid

def test_context_read_never_converts_reviewer_rejection_into_publication(rig):
    author(rig);rig.crew.tick();flow=rig.crew.load(rig.folder)
    rig.brain.complete(flow['jobs']['adversarial'],{'decision':'retrieve','request':{'operation':'catalog'}})
    rig.crew.tick();approve(rig,'entailment');approve(rig,'adversarial');flow=rig.crew.load(rig.folder)
    jid=flow['jobs']['adversarial'];response=json.loads(json.loads(rig.brain.rows[jid]['result'])['RETURN']['text'])
    response['decisions'][0].update(outcome='unsupported',rationale='Synthetic counterevidence invalidates the asserted scope')
    rig.brain.complete(jid,response);rig.crew.tick()
    assert rig.crew.load(rig.folder)['state']=='BLOCKED' and not rig.ws.publications

@pytest.mark.parametrize('status',['QUEUED','CLAIMED','SENT','COMPLETE'])
def test_startup_bounds_only_unsent_legacy_job_preserving_request_identity(tmp_path,monkeypatch,status):
    from types import SimpleNamespace
    from sim.store import Store
    from sim.brain_bridge import BrainBridge
    from sim.github_evidence import FogEvidenceCrew,AUTHOR_SYSTEM,write
    original={'sources':[source('Actual retained source '+'x'*200000)],'record_catalog':[]}
    store=Store(str(tmp_path/'test.db'));brain=BrainBridge(store);brain.set_enabled(True)
    jid=brain.enqueue(AUTHOR_SYSTEM,json.dumps(original),16000,'fog-crew:evidence:author:fixture:unit:0')
    if status!='QUEUED':store.execute('UPDATE brain_jobs SET status=?,owner=?,lease=? WHERE id=?',(status,'actual-owner','actual-lease',jid))
    before=store.one('SELECT * FROM brain_jobs WHERE id=?',(jid,))
    ws=SimpleNamespace(cache_dir=tmp_path);folder=tmp_path/'evidence-crew/owner/repo/fixture';folder.mkdir(parents=True)
    flow={'state':'AUTHOR','batch_id':'fixture','author_attempt':1,'jobs':{'author':jid},
          'author_units':[{'index':0,'job_id':jid,'goal':json.dumps(original)}],
          'candidate_sha256':'unchanged','retained_roles':['previous-independent-review']}
    write(folder/'flow.json',flow)
    # An archived attempt must never be swept or rewritten.
    archived=folder/'attempts/author-0/flow.json';write(archived,flow);archive_before=archived.read_bytes()
    monkeypatch.setattr(FogEvidenceCrew,'author_goal',lambda self,f,p:json.dumps(original))
    crew=FogEvidenceCrew(ws,brain);after=store.one('SELECT * FROM brain_jobs WHERE id=?',(jid,))
    assert after['id']==jid and after['status']==status
    assert after['owner']==before['owner'] and after['lease']==before['lease']
    assert archived.read_bytes()==archive_before
    if status=='QUEUED':
        envelope=json.loads(after['packet']);view=json.loads(envelope['GOAL'])
        assert size(view)<=FRAME_LIMIT and view['evidence_access']['complete_captures_retained']
        assert envelope['request_id']==json.loads(before['packet'])['request_id']
        assert envelope['STATE']==json.loads(before['packet'])['STATE']
        retained=json.loads((folder/'queued-packet-upgrade'/jid/'original-packet.json').read_text(encoding='utf8'))
        assert retained['packet']==before['packet']
        upgraded=crew.load(folder);reads=crew.read_session(folder,upgraded,'author:unit:0')
        assert reads.original()==original and upgraded['candidate_sha256']=='unchanged'
        assert upgraded['retained_roles']==flow['retained_roles']
        # A restart and a subsequent context read reuse this exact stream.
        FogEvidenceCrew(ws,brain)
        reads.create(original,reads.base())
        assert reads.exchange({'operation':'source','source_id':'paper','start':199000,'end':200000})['data']['window']['text']==original['sources'][0]['text'][199000:200000]
    else:assert after['packet']==before['packet'] and not (folder/'queued-packet-upgrade').exists()
    store.db.close()

def test_legacy_review_upgrade_preserves_approved_role_and_exact_candidate(tmp_path):
    from types import SimpleNamespace
    from sim.store import Store
    from sim.brain_bridge import BrainBridge
    from sim.github_evidence import FogEvidenceCrew,REVIEW_SYSTEM,write
    original=packet('Support sentence.'+'x'*200000);store=Store(str(tmp_path/'test.db'));brain=BrainBridge(store);brain.set_enabled(True)
    jobs={r:brain.enqueue(REVIEW_SYSTEM,json.dumps(original),16000,'fog-crew:evidence:'+r+':fixture') for r in ('entailment','adversarial')}
    store.execute("UPDATE brain_jobs SET status='COMPLETE',result=? WHERE id=?",('actual independently collected decision',jobs['entailment']))
    approved=store.one('SELECT * FROM brain_jobs WHERE id=?',(jobs['entailment'],))
    folder=tmp_path/'evidence-crew/owner/repo/fixture';folder.mkdir(parents=True)
    flow={'state':'REVIEW','batch_id':'fixture','jobs':jobs,'retained_roles':['entailment'],'candidate_sha256':original['candidate_sha256']}
    write(folder/'flow.json',flow);crew=FogEvidenceCrew(SimpleNamespace(cache_dir=tmp_path),brain)
    assert store.one('SELECT * FROM brain_jobs WHERE id=?',(jobs['entailment'],))==approved
    row=store.one('SELECT * FROM brain_jobs WHERE id=?',(jobs['adversarial'],));view=json.loads(json.loads(row['packet'])['GOAL'])
    assert size(view)<=FRAME_LIMIT and view['records']['assertions.jsonl']==original['records']['assertions.jsonl']
    assert view['records']['nodes.jsonl']==original['records']['nodes.jsonl']
    assert crew.load(folder)['retained_roles']==['entailment'] and crew.load(folder)['candidate_sha256']==original['candidate_sha256']
    store.db.close()
