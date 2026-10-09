import json, time
import pytest
from test_brain_bridge_v14 import b, poll, result
from sim.brain_bridge import BrainBridge, install_routes
from fastapi import FastAPI
from fastapi.testclient import TestClient

def retire(job, **extra):
    return dict(client_id=job['owner'],lease=job['lease'],worker_slot=job['worker_slot'],
                recovery_id='recovery-nonce-123456',old_url='https://chatgpt.com/c/frozen',**extra)

@pytest.mark.parametrize('status',['CLAIMED','SENT'])
def test_uncertainty_detaches_but_never_replays(b,status):
    first=b.enqueue('s','retained original scientific input',tag='fog-crew:evidence:first')
    second=b.enqueue('s','independent next bounded task',tag='fog-crew:evidence:second')
    j=poll(b);original=j['packet']
    if status=='SENT':b.result(first,{**result(j), 'sent':True})
    r=b.retire_conversation(first,retire(j));assert r['status']=='QUARANTINED'
    saved=b.store.one('SELECT * FROM brain_jobs WHERE id=?',(first,))
    assert saved['lease']==j['lease'] and saved['owner']==j['owner']
    assert json.loads(saved['packet'])['GOAL']==json.loads(original)['GOAL']
    assert b.authorize_send(first,retire(j))['ok'] is False
    assert poll(b)['id']==second
    assert b.retire_conversation(first,retire(j))['status']=='QUARANTINED'
    assert b.result(first,{**result(j),'sent':True})['status']=='QUARANTINED'
    b.store.execute('UPDATE brain_jobs SET deadline=? WHERE id=?',(time.time()-1,first))
    b.expire();assert b.store.one('SELECT status FROM brain_jobs WHERE id=?',(first,))['status']=='QUARANTINED'
    # Exact retained late result can complete the SAME request, never a new job.
    assert b.result(first,result(j))['status']=='COMPLETE'
    assert b.store.one('SELECT COUNT(*) AS n FROM brain_jobs')['n']==2

def test_restart_and_pool_disclose_quarantine(b):
    b.enqueue('s','u',tag='fog-crew:evidence:test');j=poll(b)
    b.retire_conversation(j['id'],retire(j));restarted=BrainBridge(b.store)
    assert poll(restarted) is None
    assert restarted.pool_status()['primary']['quarantined_deliveries'][0]['id']==j['id']
    assert restarted.result(j['id'],result(j))['status']=='COMPLETE'

@pytest.mark.parametrize('field,value',[('client_id','wrong-owner'),('lease','wrong'),('worker_slot','worker_2'),('old_url','https://evil.invalid/'),('recovery_id','short')])
def test_retirement_rejects_invalid_authority(b,field,value):
    b.enqueue('s','u');j=poll(b);body=retire(j);body[field]=value
    with pytest.raises(ValueError):b.retire_conversation(j['id'],body)
    assert b.store.one('SELECT status FROM brain_jobs')['status']=='CLAIMED'

def test_hold_and_idempotency_are_not_bypassed(b):
    b.enqueue('s','u');j=poll(b);b.store.kv_set('brain_hold','Independent Primary review required')
    recovered=b.poll({'client_id':j['owner'],'worker_slot':'primary','state':'RECOVERING','recovery_request_id':j['id']})
    assert recovered['job']['lease']==j['lease'] and recovered['hold']==b.hold
    b.retire_conversation(j['id'],retire(j))
    assert b.hold=='Independent Primary review required'
    changed=retire(j);changed['recovery_id']='different-nonce-123456'
    with pytest.raises(ValueError):b.retire_conversation(j['id'],changed)

def test_authenticated_http_route(b):
    app=FastAPI();install_routes(app,b);client=TestClient(app)
    b.enqueue('s','u');j=poll(b)
    url='/api/brain/jobs/'+j['id']+'/retire-conversation'
    assert client.post(url,json=retire(j)).status_code==401
    assert client.post(url,json=retire(j),headers={'Authorization':'Bearer '+b.token}).json()['status']=='QUARANTINED'
