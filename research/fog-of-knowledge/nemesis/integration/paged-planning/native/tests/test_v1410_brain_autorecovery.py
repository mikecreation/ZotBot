import time

from sim.store import Store
from sim.brain_bridge import BrainBridge


def _poll(bridge, state='READY'):
    return bridge.poll({
        'client_id':'autorecovery-client-123456',
        'worker_slot':'primary','role':'primary','state':state,
        'url':'https://chatgpt.com/c/primary','conversation_id':'c:primary',
        'tab_id':1,'tab_count':1,
    })['job']


def test_primary_known_unsent_requeues_without_review_hold(tmp_path):
    s=Store(str(tmp_path/'safe-primary.db')); b=BrainBridge(s); b.set_enabled(True)
    try:
        jid=b.enqueue('system','repair the application',tag='system-engineering')
        job=_poll(b); assert job['id']==jid
        out=b.result(jid,{
            'client_id':job['owner'],'lease':job['lease'],
            'error':'Composer could not commit request after safe editor retries; no send attempted',
            'safe_unsent':True,'clicked':False,'phase':'VERIFY_COMMIT',
            'transport':{'safe_unsent':True,'clicked':False,'phase':'VERIFY_COMMIT'},
        })
        assert out['status']=='QUEUED' and out['requeued'] is True
        assert out['global_hold'] is False and not b.hold
        row=s.one('SELECT status,transport_retries,avoid_slot FROM brain_jobs WHERE id=?',(jid,))
        assert row['status']=='QUEUED' and row['transport_retries']==1 and row['avoid_slot']=='primary'
        # Same tab is eligible again after the bounded transport cooldown. The
        # same request ID is retained so browser retry receipts stay auditable.
        s.execute('UPDATE brain_jobs SET updated=? WHERE id=?',(time.time()-10,jid))
        retry=_poll(b); assert retry['id']==jid and retry['transport_retries']==1
    finally:
        s.db.close()


def test_primary_after_click_failure_still_requires_review(tmp_path):
    s=Store(str(tmp_path/'ambiguous-primary.db')); b=BrainBridge(s); b.set_enabled(True)
    try:
        jid=b.enqueue('system','repair the application',tag='system-engineering')
        job=_poll(b)
        out=b.result(jid,{
            'client_id':job['owner'],'lease':job['lease'],
            'error':'User-turn acknowledgement missing after click',
            'safe_unsent':False,'clicked':True,'phase':'VERIFY_USER_TURN_CREATED',
            'transport':{'safe_unsent':False,'clicked':True,'phase':'VERIFY_USER_TURN_CREATED'},
        })
        assert out['status']=='FAILED' and out['global_hold'] is True
        assert 'Review the Primary chat' in b.hold
    finally:
        s.db.close()


def test_legacy_no_send_primary_hold_is_auto_cleared(tmp_path):
    s=Store(str(tmp_path/'legacy-hold.db')); b=BrainBridge(s); b.set_enabled(True)
    try:
        s.kv_set('brain_hold','Delivery stopped: Composer could not commit request; no send attempted Review the Primary chat before resuming.')
        b2=BrainBridge(s)
        assert not b2.hold
        assert s.kv_get('brain_transport_last_error',{}).get('policy')=='LEGACY_SAFE_UNSENT_HOLD_AUTO_CLEARED'
    finally:
        s.db.close()


def test_safe_unsent_retry_limit_never_turns_into_global_hold(tmp_path):
    s=Store(str(tmp_path/'retry-limit.db')); b=BrainBridge(s); b.set_enabled(True)
    try:
        jid=b.enqueue('system','repair the application',tag='system-engineering')
        s.execute('UPDATE brain_jobs SET transport_retries=8 WHERE id=?',(jid,))
        job=_poll(b)
        out=b.result(jid,{
            'client_id':job['owner'],'lease':job['lease'],
            'error':'Composer unavailable; no send attempted',
            'safe_unsent':True,'clicked':False,'phase':'FIND_COMPOSER',
        })
        assert out['status']=='FAILED' and out['global_hold'] is False
        assert out['policy']=='SAFE_UNSENT_RETRY_LIMIT' and not b.hold
    finally:
        s.db.close()
