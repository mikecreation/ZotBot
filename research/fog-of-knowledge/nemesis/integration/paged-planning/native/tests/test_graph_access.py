"""Native receiver against the real isolated Fog reader, with no GitHub calls."""
import json,os,shutil,sys
from pathlib import Path
from types import SimpleNamespace
import pytest
from sim import fog_graph_access as access
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sim.github_evidence import install_evidence_routes

ROOT=Path(os.environ.get('FOG_PROJECT_ROOT',Path(__file__).resolve().parents[3]/'release-fog-navigation/research/fog-of-knowledge'))

def test_native_reader_real_process_catalog_pages_and_owned_cleanup(tmp_path,monkeypatch):
    def materialize(ws,owner,repo,sha,path,dest):
        dest.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(ROOT/'.nemesis.json',dest/'.nemesis.json')
        for name in ('scripts','data'):
            shutil.copytree(ROOT/name,dest/name,dirs_exist_ok=True)
    monkeypatch.setattr(access,'materialize',materialize)
    ws=SimpleNamespace(cache_dir=tmp_path,project_row=lambda *a:{'mode':'READ_ONLY','manifest':json.loads((ROOT/'.nemesis.json').read_text())})
    reader=access.GraphAccess(ws,'owner','repo','fog','a'*40)
    try:
        assert reader.catalog['counts']['nodes']>0 and not reader.catalog['complete_graph_in_prompt']
        page=reader.request({'operation':'query','query':{'kind':'nodes','limit':2}})
        assert page['data']['returned']==2 and page['data']['continuation']
        assert page['manifest']['snapshot']==reader.snapshot
        with pytest.raises(ValueError):reader.request({'operation':'query','query':{'kind':'nodes','sql':'no'}})
        assert reader.process.poll() is not None
    finally:reader.close()

def test_same_origin_resource_resume_and_catalog_routes_preserve_policy():
    calls=[]
    reader=SimpleNamespace(request=lambda q:calls.append(q) or {'manifest':{'complete':False},'data':{'snapshot':'fixture'}})
    crew=SimpleNamespace(ws=SimpleNamespace(resolve=lambda *a:'a'*40),coverage=SimpleNamespace(
        paged=SimpleNamespace(readers=SimpleNamespace(get=lambda *a:reader)),
        resume_retrieval=lambda *a:calls.append(a) or {'enabled':False}))
    app=FastAPI();install_evidence_routes(app,crew);client=TestClient(app,client=('127.0.0.1',123))
    base='/api/github/project/owner/repo/evidence-crew/'
    assert client.get(base+'graph-catalog?path=fog',headers={'origin':'https://evil.example'}).status_code==403
    assert client.get(base+'graph-catalog?path=fog').json()['manifest']['complete'] is False
    assert client.post(base+'retrieval-resume',content='x'*4097).status_code==413
    assert client.post(base+'retrieval-resume',json={'path':'fog','plan_id':'1','additional_turns':2}).json()=={'enabled':False}
