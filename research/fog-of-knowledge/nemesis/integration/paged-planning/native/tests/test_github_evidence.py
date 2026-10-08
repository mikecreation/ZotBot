"""Evidence crew integration with disposable projects and synthetic Brain/GitHub."""
import copy,hashlib,json,shutil,sys,time,os
from pathlib import Path
from types import SimpleNamespace
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sim import github_evidence as ge,github_batches as gb,github_sandbox as gs

@pytest.mark.parametrize('tag',['fog-crew:boss','fog-crew:w1','fog-crew:w2','fog-crew:w3','fog-crew:discover:1','fog-crew:evidence:author:test'])
def test_browser_cannot_submit_untracked_fog_jobs(tag):
    from sim.brain_bridge import install_routes
    brain=Brain();app=FastAPI();install_routes(app,brain)
    response=TestClient(app).post('/api/brain/jobs',json={'tag':tag,'system':'old UI','goal':'untracked batch'})
    assert response.status_code==409
    assert 'Reload the Nemesis page' in response.json()['detail']
    assert not brain.rows

def test_manual_non_fog_jobs_remain_available():
    from sim.brain_bridge import install_routes
    brain=Brain();app=FastAPI();install_routes(app,brain)
    response=TestClient(app).post('/api/brain/jobs',json={'tag':'manual','system':'test','goal':'test'})
    assert response.status_code==200
    assert len(brain.rows)==1

FOG=Path(__file__).resolve().parents[1]/'data/fog-upgrade-backups/20261007-evidence-crew/test-project-path.txt'
# The portable bundle's test launcher supplies its Fog checkout; production data is never imported.
PROJECT=Path(os.environ['FOG_PROJECT_ROOT']) if os.environ.get('FOG_PROJECT_ROOT') else Path(FOG.read_text().strip()) if FOG.exists() else None

class Brain:
    def __init__(self):self.rows={};self.store=self
    def one(self,query,args):
        if 'json_extract' in query:
            return next((row for row in reversed(list(self.rows.values())) if json.loads(row['packet']).get('STATE',{}).get('tag')==args[0]),None)
        return self.rows.get(args[0])
    def enqueue(self,system,user,max_tokens,tag):
        jid='job'+str(len(self.rows)+1);self.rows[jid]={'id':jid,'status':'QUEUED','result':None,'error':None,'packet':json.dumps({'STATE':{'tag':tag},'GOAL':user}),'goal':user,'system':system};return jid
    def complete(self,jid,value):self.rows[jid].update(status='COMPLETE',result=json.dumps({'RETURN':{'text':json.dumps(value)}}))

class Client:
    def __init__(self):self.green=False;self.head='b'*40;self.writes=[]
    def call(self,method,url,**kwargs):
        if method=='PUT':self.writes.append(kwargs['body']);return {'sha':'c'*40,'merged':True},{}
        if url.endswith('/check-runs'):return {'check_runs':[{'name':'validate','status':'completed' if self.green else 'in_progress','conclusion':'success' if self.green else None}]},{}
        if url.endswith('/status'):return {'state':'pending','statuses':[]},{}
        return {'head':{'sha':self.head},'state':'open','merged':False},{}

class Workspace:
    def __init__(self,root):self.cache_dir=root;self.client=Client();self.manifest=json.loads((PROJECT/'.nemesis.json').read_text());self.publications=[];self.s=SimpleNamespace(cache_get=lambda key:{'sha':'a'*40,'packet':{}})
    def project_row(self,*args):return {'manifest':self.manifest,'mode':'READ_BRANCH_PR','key':'fixture','owner':'owner','repo':'repo','path':'fog'}
    def resolve(self,*args):return 'a'*40
    def use_project(self,*args):pass
    def log(self,*args,**kwargs):pass
    def run_worker_contract(self,*args):return {'ok':True,'sha':'a'*40,'contract':{},'prompt_block':'synthetic live contract'}
    def run_context(self,*args):return {'exit_code':0}
    def check_batch(self,*args):return gb.check_batch(self,*args)
    def propose_batch(self,owner,repo,path,bid,**kwargs):
        # Exercise the actual check/apply/validator with the same retained proof overlay.
        check=self.check_batch(owner,repo,path,bid)
        assert check['ok'],check
        work=self.cache_dir/'publication';shutil.copytree(PROJECT,work,dirs_exist_ok=True,ignore=shutil.ignore_patterns('output','.playwright-cli','__pycache__'))
        _,files=gb._load_batch_files(self,owner,repo,bid);gb._stage_into_project(work,'nemesis/batches/'+bid,files);ge.stage_evidence_artifacts(self,owner,repo,bid,work)
        for script,args in [('scripts/nemesis_apply.py',['nemesis/batches/'+bid,'--apply']),('scripts/validate.py',[])]:
            result=gs.execute(work,script,args);assert result['exit_code']==0,result
        result={'ok':True,'pr_number':1,'pr_url':'https://example.org/synthetic-pr','commit_sha':'b'*40}
        gb._update_meta(gb._batch_dir(self,owner,repo,bid),propose=result);self.publications.append(result);return result

@pytest.fixture
def rig(tmp_path,monkeypatch):
    if PROJECT is None:pytest.skip('Set the Fog project path using the integration test launcher')
    sys.path.insert(0,str(PROJECT/'scripts'))
    from test_evidence_compiler import fixture
    from evidence_compiler import digest
    # Individual gate assertions are tested without retrying the same invalid
    # synthetic response. Reliability tests restore the production budgets when
    # checking explicit candidate revisions and operational retry exhaustion.
    monkeypatch.setattr(ge,'MAX_AUTHOR_ATTEMPTS',1)
    monkeypatch.setattr(ge,'MAX_OPERATIONAL_ATTEMPTS',0)
    candidate,_,decisions=fixture();source=candidate['sources.jsonl'][0]
    source.update(final_url=source['url'],raw_sha256=hashlib.sha256(source['text'].encode()).hexdigest(),content_type='text/plain',charset='utf-8',extraction_method='http-text/1');source['capture_id']=digest(source)
    brain=Brain();ws=Workspace(tmp_path);crew=ge.FogEvidenceCrew(ws,brain)
    def materialize(ws,owner,repo,sha,path,target):
        shutil.copytree(PROJECT,target,dirs_exist_ok=True,ignore=shutil.ignore_patterns('output','.playwright-cli','__pycache__'));return {}
    monkeypatch.setattr(ge,'materialize',materialize);monkeypatch.setattr(gs,'materialize',materialize)
    real_execute=ge.execute
    def execute(work,script,args,**kwargs):
        if '--capture' not in args:return real_execute(work,script,args,**kwargs)
        work=Path(work);batch=work/args[0];control=batch/'.nemesis-control';control.mkdir(parents=True,exist_ok=True)
        for rel,body in [('data/evidence/raw/'+source['raw_sha256']+'.bin',source['text'].encode()),('data/evidence/captures/'+source['capture_id']+'.json',json.dumps(source).encode())]:
            target=work/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(body)
        ge.write(control/'captured-sources.json',[source]);ge.write(control/'author-context.json',{'sources':[source]})
        return {'exit_code':0,'stdout':'{"ok":true,"captured":1}'}
    monkeypatch.setattr(ge,'execute',execute)
    jid=brain.enqueue('','',1,'fog-crew:discover:1');brain.complete(jid,{'batch_id':'test-evidence','mission':'synthetic fixture only','target_ids':[],'source_requests':[{'id':source['id'],'url':source['url'],'title':source['title']}]})
    return SimpleNamespace(crew=crew,ws=ws,brain=brain,candidate=candidate,decisions=decisions,initial_target_hash=decisions[0]['target_sha256'],jid=jid,folder=crew.location('owner','repo','test-evidence'))

def author(rig):
    rig.crew.start('owner','repo','fog',rig.jid,True);rig.crew.tick();flow=rig.crew.load(rig.folder)
    rig.candidate['manifest.json']['agent']=flow['author_identity']
    packet={'batch_id':'test-evidence',**{k.removesuffix('.jsonl').removesuffix('.json'):v for k,v in rig.candidate.items()}}
    rig.brain.complete(flow['jobs']['author'],packet);return packet

def approve(rig,role):
    flow=rig.crew.load(rig.folder);decision=copy.deepcopy(next(d for d in rig.decisions if d['role']==role))
    # Real reviewers reference exact assertion IDs rather than inventing hashes.
    # Preserve deliberately tampered hashes in adversarial tests.
    if decision['target_sha256']==rig.initial_target_hash:
        decision.pop('target_sha256');decision.pop('target_kind')
    rig.brain.complete(flow['jobs'][role],{'decisions':[decision]})

def test_complete_flow_waits_for_both_reviews_and_exact_head_ci(rig):
    author(rig);rig.crew.tick();assert rig.crew.load(rig.folder)['state']=='REVIEW'
    approve(rig,'entailment');rig.crew.tick();assert not rig.ws.publications
    # A new adapter instance resumes durable job IDs without redispatching.
    resumed=ge.FogEvidenceCrew(rig.ws,rig.brain);approve(rig,'adversarial');resumed.tick()
    flow=resumed.load(rig.folder);assert flow['state']=='CI';assert not rig.ws.client.writes
    rig.ws.client.green=True;flow['next_ci_check']=0;resumed.save(rig.folder,flow);resumed.tick()
    assert resumed.load(rig.folder)['state']=='MERGED';assert rig.ws.client.writes[0]['sha']=='b'*40
    assert len(rig.brain.rows)==4

def test_missing_assertions_blocks_without_review_dispatch(rig):
    packet=author(rig);packet['assertions']=[];flow=rig.crew.load(rig.folder);rig.brain.complete(flow['jobs']['author'],packet);rig.crew.tick()
    assert rig.crew.load(rig.folder)['state']=='BLOCKED';assert not rig.ws.publications

def test_source_references_and_mechanical_bindings_preserve_assertion(rig):
    packet=author(rig);packet['source_ids']=[s['id'] for s in packet.pop('sources')]
    assertion=packet['assertions'][0];statement=assertion['statement'];assertion.pop('target_sha256')
    for span in assertion['support']:
        for key in ('source_sha256','start','end'):span.pop(key)
    flow=rig.crew.load(rig.folder);rig.brain.complete(flow['jobs']['author'],packet);rig.crew.tick()
    flow=rig.crew.load(rig.folder);assert flow['state']=='REVIEW'
    bound=json.loads((rig.folder/'project/nemesis/batches/test-evidence/assertions.jsonl').read_text())
    assert bound['statement']==statement;assert bound['support'][0]['quote']==statement
    approve(rig,'entailment');approve(rig,'adversarial');rig.crew.tick()
    assert rig.crew.load(rig.folder)['state']=='CI'
    raw=json.loads((rig.ws.cache_dir/'publication/nemesis/batches/test-evidence/author-output.json').read_text())
    assert 'target_sha256' not in raw['output']['assertions'][0]

def test_fabricated_source_does_not_get_silently_rebound(rig):
    packet=author(rig);packet['sources'][0]['text']='Fabrication';packet['sources'][0]['sha256']=hashlib.sha256(b'Fabrication').hexdigest()
    flow=rig.crew.load(rig.folder);rig.brain.complete(flow['jobs']['author'],packet);rig.crew.tick()
    assert rig.crew.load(rig.folder)['state']=='BLOCKED';assert len(rig.brain.rows)==2

def test_uncertain_review_blocks_publication(rig):
    author(rig);rig.crew.tick();rig.decisions[1]['outcome']='uncertain';approve(rig,'entailment');approve(rig,'adversarial');rig.crew.tick()
    assert rig.crew.load(rig.folder)['state']=='BLOCKED';assert not rig.ws.publications

def test_changed_pr_head_cannot_merge(rig):
    author(rig);rig.crew.tick();approve(rig,'entailment');approve(rig,'adversarial');rig.ws.client.head='d'*40;rig.crew.tick()
    assert rig.crew.load(rig.folder)['state']=='BLOCKED';assert not rig.ws.client.writes

def test_manual_mode_stops_ready_and_opens_pr_without_merging(rig):
    author(rig);flow=rig.crew.load(rig.folder);flow['auto_publish']=False;rig.crew.save(rig.folder,flow)
    rig.crew.tick();approve(rig,'entailment');approve(rig,'adversarial');rig.crew.tick()
    assert rig.crew.load(rig.folder)['state']=='READY';assert not rig.ws.publications
    rig.crew.publish('owner','repo','fog','test-evidence',False);rig.crew.tick()
    assert rig.crew.load(rig.folder)['state']=='PR_OPEN';assert not rig.ws.client.writes

def test_discovery_jobs_are_durable_without_browser_harvesting(rig):
    result=rig.crew.discover('owner','repo','fog',['Synthetic source discovery only'])
    jid=result['jobs'][0];original=json.loads(rig.brain.rows[rig.jid]['result'])['RETURN']['text']
    rig.brain.complete(jid,json.loads(original));rig.crew.tick()
    entry=json.loads((rig.crew.root/'discoveries'/(jid+'.json')).read_text())
    assert entry['state']=='HANDED_OFF';assert rig.crew.load(rig.folder)['state']=='AUTHOR'

def test_start_idempotency_and_legacy_job_exclusion(rig):
    first=rig.crew.start('owner','repo','fog',rig.jid);second=rig.crew.start('owner','repo','fog',rig.jid)
    assert first['batch_id']==second['batch_id'];assert len(rig.brain.rows)==1
    jid=rig.brain.enqueue('','',1,'fog-crew:w1');rig.brain.complete(jid,{'nodes':[]})
    with pytest.raises(ValueError):rig.crew.start('owner','repo','fog',jid)

def test_routes_reject_cross_origin_and_oversized_requests(rig):
    app=FastAPI();ge.install_evidence_routes(app,rig.crew);client=TestClient(app,client=('127.0.0.1',1234))
    assert client.get('/api/github/project/owner/repo/evidence-crew?path=fog').status_code==200
    assert client.post('/api/github/project/owner/repo/evidence-crew',headers={'origin':'https://untrusted.example'},json={}).status_code==403
    assert client.post('/api/github/project/owner/repo/evidence-crew',content='x'*4097).status_code==413

def test_binary_response_is_published_without_utf8_conversion(monkeypatch):
    import base64
    calls=[]
    def api(ws,method,url,body=None):
        calls.append((method,url,body))
        if '/git/commits/' in url:return {'tree':{'sha':'base-tree'}}
        if url.endswith('/pulls'):return {'number':1,'html_url':'https://example.org/synthetic-pr'}
        return {'sha':'b'*40}
    monkeypatch.setattr(gb,'_git_api',api)
    ws=SimpleNamespace(repo=lambda *a,**k:{'default_branch':'main'})
    raw=b'%PDF-1.7\x00\xff\xfe binary retained response'
    gb._create_branch_commit_pr(ws,'owner','repo','a'*40,'nemesis/synthetic','test',[{'path':'data/evidence/raw/test.bin','content':raw}],'test','test')
    blob=next(body for method,url,body in calls if url.endswith('/git/blobs'))
    assert blob['encoding']=='base64';assert base64.b64decode(blob['content'])==raw
