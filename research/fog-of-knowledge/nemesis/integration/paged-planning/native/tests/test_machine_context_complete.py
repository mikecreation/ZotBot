"""Synthetic sandbox boundary regression for the real 400 KB graph failure."""
import json
from types import SimpleNamespace
from sim.github_sandbox import execute,OUTPUT_CAP

def test_complete_machine_json_survives_diagnostic_cap(tmp_path):
    packet={'nodes':[{'id':'new-finding','summary':'Primary source finding '+('x'*OUTPUT_CAP)}],'tail':'entire graph retained'}
    raw=json.dumps(packet,ensure_ascii=False).encode()
    result=execute(tmp_path,'scripts/context.py',[],runner=lambda *a,**k:SimpleNamespace(returncode=0,stdout=raw,stderr=b'x'*(OUTPUT_CAP+50)))
    assert result['exit_code']==0
    assert json.loads(result['stdout'])==packet
    assert len(result['stderr'])==OUTPUT_CAP

def test_invalid_utf8_cannot_become_machine_data(tmp_path):
    result=execute(tmp_path,'scripts/context.py',[],runner=lambda *a,**k:SimpleNamespace(returncode=0,stdout=b'{"node":"\xff"}',stderr=b''))
    assert result['exit_code']==-1 and 'not valid UTF-8' in result['error']

def test_invalid_json_is_explicit_context_failure(tmp_path):
    from test_github_workspace import FakeGitHub,make
    fake=FakeGitHub();fake.files['research/fog/scripts/nemesis_context.py']=b'print("incomplete graph")\n'
    store,workspace,_,client=make(tmp_path,fake=fake)
    result=client.post('/api/github/project/mikecreation/ZotBot/context',json={'path':'research/fog'}).json()
    assert result['exit_code']==-1 and 'invalid JSON' in result['error']
    assert result['summary'] is None
    assert not store.cache_get('gh:context-full:mikecreation/ZotBot:research/fog')
