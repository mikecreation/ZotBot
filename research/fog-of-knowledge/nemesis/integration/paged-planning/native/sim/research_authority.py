"""Research ownership and final admission, above the unchanged 6.2.3 transport.

Precedence: explicit user pause > current scope/revision > subsystem > scheduler.
Known-unsent work is deferred, not deleted. Ambiguous delivery is never reopened.
"""
from __future__ import annotations
from contextvars import ContextVar
import hashlib
import json
import secrets
import time
from types import MethodType

from .brain_bridge import BrainBridge, packed


def fingerprint(value):
    return hashlib.sha256(str(value).encode('utf-8')).hexdigest()


class ResearchAuthority:
    def __init__(self, pandora):
        self.p = pandora
        self.s = pandora.db.store
        self._reconcile_after = ''
        with self.s.lock, self.s.db:
            self.s.db.executescript('''
            CREATE TABLE IF NOT EXISTS research_delivery_scopes(
              job_id TEXT PRIMARY KEY, descriptor TEXT NOT NULL, packet_hash TEXT NOT NULL,
              disposition TEXT NOT NULL DEFAULT 'QUEUED', reason TEXT NOT NULL DEFAULT '', updated REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS research_admission_events(
              id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, boundary TEXT NOT NULL,
              decision TEXT NOT NULL, reason TEXT NOT NULL, diagnostics TEXT NOT NULL, created REAL NOT NULL);
            CREATE INDEX IF NOT EXISTS ix_research_admission_job_boundary
              ON research_admission_events(job_id,boundary,id DESC);
            ''')
        if self.s.kv_get('research:permission', None) is None:
            # Migration never interprets a running subsystem as fresh user consent
            # while a frontier is explicitly paused.
            paused = self.s.one("SELECT 1 FROM frontier_campaigns WHERE status='PAUSED' LIMIT 1")
            self.s.kv_set('research:permission', {'allowed':bool(self.p.running and not paused),
                'focus':'', 'reason':'Preserve existing pause authority on migration', 'at':time.time()})

    def permission(self):
        return self.s.kv_get('research:permission', {})

    def set_permission(self, allowed, focus=None, reason='Explicit user research control'):
        previous = self.permission()
        self.s.kv_set('research:permission', {'allowed':bool(allowed),
            'focus':previous.get('focus','') if focus is None else focus, 'reason':reason, 'at':time.time()})
        self.reconcile()

    def register(self, jid, descriptor):
        if self.s.one('SELECT 1 FROM research_delivery_scopes WHERE job_id=?', (jid,)):
            return
        job = self.s.one('SELECT packet FROM brain_jobs WHERE id=?', (jid,))
        self.s.execute('INSERT OR IGNORE INTO research_delivery_scopes(job_id,descriptor,packet_hash,updated) VALUES(?,?,?,?)',
            (jid, packed(descriptor or {}), fingerprint(job['packet']), time.time()))

    def note(self, jid, boundary, decision, reason, diagnostics=None):
        last = self.s.one('SELECT decision,reason FROM research_admission_events WHERE job_id=? AND boundary=? ORDER BY id DESC LIMIT 1', (jid,boundary))
        if last and last['decision']==decision and last['reason']==reason:
            return
        self.s.execute('INSERT INTO research_admission_events(job_id,boundary,decision,reason,diagnostics,created) VALUES(?,?,?,?,?,?)',
            (jid,boundary,decision,reason,packed(diagnostics or {}),time.time()))

    def evaluate(self, jid, slot=None):
        job = self.s.one('SELECT * FROM brain_jobs WHERE id=?', (jid,))
        scope = self.s.one('SELECT * FROM research_delivery_scopes WHERE job_id=?', (jid,))
        if not job or not scope:
            return 'QUARANTINED','Missing authoritative research ownership'
        d = json.loads(scope['descriptor'])
        required = ('kind','scope_id','field_id','objective','provenance')
        if not isinstance(d,dict) or any(not d.get(key) for key in required) or not isinstance(d.get('revision'),int) or isinstance(d.get('revision'),bool) or d['revision']<0 or not isinstance(d.get('provenance'),dict):
            return 'QUARANTINED','Incomplete scope, revision or provenance'
        if scope['packet_hash'] != fingerprint(job['packet']):
            return 'QUARANTINED','Research packet changed after assignment'
        assignment = self.s.one('SELECT * FROM brain_research_assignments WHERE job_id=?', (jid,))
        if assignment:
            if assignment['field_id']!=d['field_id'] or assignment['objective']!=d['objective'] or assignment['source']!=d.get('source'):
                return 'QUARANTINED','Assignment field/objective/type disagrees with its scope'
            if assignment['scope_key']!=d.get('assignment_key'):
                return 'QUARANTINED','Assignment identity disagrees with its provenance'
        elif d['kind'] != 'MEMORY':
            return 'QUARANTINED','Research assignment is missing'
        if d['provenance'].get('context_field_id',d['field_id']) != d['field_id']:
            return 'QUARANTINED','Objective context belongs to a different field'
        permission = self.permission()
        if not permission.get('allowed'):
            return 'DEFERRED','Blocked by explicit research pause'
        if not self.p.arena.llm.brain.enabled or not self.p.arena.llm.brain.research_enabled:
            return 'DEFERRED','Brain research participation is paused'
        if job['status'] not in ('QUEUED','CLAIMED','DEFERRED'):
            return 'DENIED','Delivery state is terminal, stale or already sent'
        kind = d['kind']
        if kind in ('CAMPAIGN','MEMORY'):
            c = self.p.db.campaign(d['scope_id'])
            rt = self.s.one('SELECT paused FROM campaign_runtime WHERE campaign_id=?',(d['scope_id'],))
            g = self.p.guided.row(d['scope_id'])
            if not c or c['revision']!=d['revision'] or c['field_id']!=d['field_id'] or c['question']!=d['objective']:
                return 'QUARANTINED','Campaign identity or revision is stale'
            if c.get('locked_hash') or (rt and rt['paused']) or (g and g['status']=='PAUSED'):
                return 'DEFERRED','Owning campaign is paused or frozen'
            if permission.get('focus') and permission['focus']!=d['scope_id']:
                return 'DEFERRED','Another research scope owns current delivery'
            action_id = d.get('action_id')
            if action_id:
                action = self.s.one('SELECT * FROM frontier_actions WHERE id=?',(action_id,))
                frontier = self.p.frontier.row(d['scope_id'])
                if not action or action['job_id']!=jid or action['status'] not in ('WAITING','DISPATCHED'):
                    return 'DEFERRED','Frontier assignment is retired or not admitted'
                if action['revision']!=d['revision'] or action['data_hash']!=frontier['data_hash'] or action['generator_version']!=frontier['generator_version']:
                    return 'QUARANTINED','Frontier evidence or generator context is stale'
                if frontier['status']!='ACTIVE':
                    return 'DEFERRED','Frontier is not active'
        elif kind == 'FIELD':
            if permission.get('focus'):
                return 'DEFERRED','Campaign focus excludes unrelated FIELD research'
            focus = self.p.arena.research_focus()
            current = self.p.arena.research_priority()
            state = self.p.arena._field_state(d['field_id'],d.get('topic','GENERAL'))
            if current.get('source')!='FIELD' or focus['field_id']!=d['field_id'] or focus['topic']!=d.get('topic','GENERAL'):
                return 'DEFERRED','FIELD focus changed; retained assignment is not current'
            if state['revision']!=d['revision'] or current['objective']!=d['objective']:
                return 'QUARANTINED','FIELD objective or state revision changed'
            if not self.p.arena.running:
                return 'DEFERRED','Arena research is paused'
        elif kind == 'TASTE':
            task = self.s.one('SELECT status FROM taste_jobs WHERE id=?',(d['scope_id'],))
            if permission.get('focus') or not task or task['status'] not in ('QUEUED','WAITING'):
                return 'DEFERRED','Derived research scope is not currently authorized'
        else:
            return 'QUARANTINED','Unregistered research scope type'
        if slot is not None:
            pool = self.p.arena.llm.brain.pool_status().get(slot)
            if not pool or not pool['connected'] or pool['state'] in ('DISCONNECTED','HELD','ERROR','BLOCKED','TRANSPORT_BLOCKED'):
                return 'DEFERRED','Research slot is not eligible'
            if job['worker_slot']!=slot:
                return 'DENIED','Research lease belongs to another slot'
        return 'ADMITTED','Current scope authorizes delivery'

    def gate(self, jid, boundary, slot=None):
        decision, reason = self.evaluate(jid,slot)
        self.note(jid,boundary,decision,reason)
        self.s.execute('UPDATE research_delivery_scopes SET disposition=?,reason=?,updated=? WHERE job_id=? AND (disposition<>? OR reason<>?)', (decision,reason,time.time(),jid,decision,reason))
        if decision in ('DEFERRED','QUARANTINED'):
            # QUEUED is known unsent. CLAIMED is moved only at the final gate;
            # its original lease remains until the browser confirms no click.
            statuses = ('QUEUED','DEFERRED') if boundary != 'FINAL_SEND' else ('QUEUED','CLAIMED','DEFERRED')
            marks=','.join('?' for _ in statuses)
            self.s.execute(f'UPDATE brain_jobs SET status=?,error=?,updated=? WHERE id=? AND status IN ({marks}) AND (status<>? OR COALESCE(error,\'\')<>?)',
                (decision,reason,time.time(),jid,*statuses,decision,reason))
            self.s.execute('UPDATE brain_research_assignments SET status=?,updated=? WHERE job_id=? AND status IN (\'QUEUED\',\'CLAIMED\',\'DEFERRED\') AND status<>?', (decision,time.time(),jid,decision))
        return {'ok':decision=='ADMITTED','decision':decision,'reason':reason}

    def reconcile(self, limit=128):
        # Rotate bounded admission windows. A large paused prefix cannot make
        # every worker rescan all history or starve a later active assignment.
        # FINAL_SEND still evaluates current permission for every exact lease.
        limit=max(1,min(256,int(limit)))
        with self.s.lock:
            query="""SELECT j.id,j.status,j.owner FROM brain_jobs j
              JOIN research_delivery_scopes s ON s.job_id=j.id
              WHERE j.status IN ('QUEUED','DEFERRED') AND j.id>?
              ORDER BY j.id LIMIT ?"""
            rows=self.s.query(query,(self._reconcile_after,limit))
            if not rows and self._reconcile_after:
                self._reconcile_after='';rows=self.s.query(query,('',limit))
            self._reconcile_after=rows[-1]['id'] if len(rows)==limit else ''
            # Unacknowledged CLAIMED jobs are never released/replayed here.
            for row in rows:
                verdict = self.gate(row['id'],'QUEUE_ADMISSION')
                if verdict['ok'] and row['status']=='DEFERRED' and not row['owner']:
                    acknowledged=self.s.one("SELECT 1 FROM research_admission_events WHERE job_id=? AND boundary='UNSENT_ACK' LIMIT 1",(row['id'],))
                    # Resume only the existing acknowledged no-click handshake.
                    self.s.execute("UPDATE brain_jobs SET status='QUEUED',error=NULL,transport_retries=transport_retries+?,deadline=?,updated=? WHERE id=? AND status='DEFERRED' AND owner IS NULL", (int(bool(acknowledged)),time.time()+1200,time.time(),row['id']))
                    self.s.execute("UPDATE brain_research_assignments SET status='QUEUED',updated=? WHERE job_id=? AND status='DEFERRED'", (time.time(),row['id']))
                    if acknowledged:
                        self.note(row['id'],'ADMISSION_RESUME','ADMITTED','Resume acknowledged no-click hold through the existing safe-unsent attempt handshake')


class ResearchBrainBridge(BrainBridge):
    """Use the unchanged lease, editor, send and collector implementation."""
    def __init__(self, store):
        super().__init__(store)
        self.authority = None
        self._scope = ContextVar('research_assignment_scope',default=None)

    def enqueue(self, system, user, max_tokens=420, tag=''):
        jid = super().enqueue(system,user,max_tokens,tag)
        if self.authority and ('research' in str(tag).lower() or self._scope.get()):
            descriptor = self._scope.get()
            if str(tag).startswith('research-memory:'):
                _,cid,revision = tag.split(':',2)
                c = self.authority.p.db.campaign(cid)
                if c:
                    descriptor={'kind':'MEMORY','scope_id':cid,'revision':int(revision),'field_id':c['field_id'],
                        'objective':c['question'],'provenance':{'producer':'Pandora memory','campaign_id':cid}}
            self.authority.register(jid,descriptor)
        return jid

    def enqueue_research(self, *, research_scope=None, preferred_slot=None, **kwargs):
        descriptor=dict(research_scope or {})
        descriptor.update(source=kwargs['source'],assignment_key=kwargs['scope_key'])
        with self.store.lock,self.store.db:
            token=self._scope.set(descriptor)
            try:
                jid=super().enqueue_research(**kwargs)
            finally:
                self._scope.reset(token)
        # enqueue() may register ownership before this returns. Stamp the claim
        # slot, then refresh the fingerprint so the gate does not quarantine.
        if jid and preferred_slot in ('primary','worker_1','worker_2','worker_3','worker_4'):
            row=self.store.one('SELECT packet,status FROM brain_jobs WHERE id=?',(jid,))
            if row and row['status']=='QUEUED':
                packet=json.loads(row['packet'])
                packet.setdefault('STATE',{})['transport_test_slot']=preferred_slot
                body=packed(packet)
                self.store.execute("UPDATE brain_jobs SET packet=? WHERE id=? AND status='QUEUED'",(body,jid))
                if self.store.one('SELECT 1 FROM research_delivery_scopes WHERE job_id=?',(jid,)):
                    self.store.execute('UPDATE research_delivery_scopes SET packet_hash=?,updated=? WHERE job_id=?',
                                      (fingerprint(body),time.time(),jid))
        if jid and self.authority:
            self.authority.register(jid,descriptor)
            # Frontier registers the job/action relation immediately after enqueue.
            # Final admission still rechecks that relation immediately before send.
            if not descriptor.get('action_id'):
                self.authority.gate(jid,'QUEUE_ADMISSION')
        return jid

    def poll(self, body):
        if self.authority:
            # Legacy queued research lacking scope is quarantined, never inferred
            # into a new authorization just because it survived a restart.
            for job in self.store.query("""SELECT j.id,j.packet FROM brain_jobs j
                LEFT JOIN research_delivery_scopes s ON s.job_id=j.id
                WHERE j.status='QUEUED' AND s.job_id IS NULL
                AND CASE WHEN json_valid(j.packet) THEN instr(lower(json_extract(j.packet,'$.STATE.tag')),'research') ELSE 0 END>0
                ORDER BY j.created LIMIT 128"""):
                tag=str(json.loads(job['packet']).get('STATE',{}).get('tag',''))
                if 'research' in tag.lower() and not self.store.one('SELECT 1 FROM research_delivery_scopes WHERE job_id=?',(job['id'],)):
                    self.authority.register(job['id'],{})
            self.authority.reconcile()
        return super().poll(body)

    def authorize_send(self, jid, body):
        # Transport identity/lease checks remain first and byte-for-byte unchanged.
        transport=super().authorize_send(jid,body)
        scope=self.store.one('SELECT 1 FROM research_delivery_scopes WHERE job_id=?',(jid,)) if self.authority else None
        if not scope:
            job=self.store.one('SELECT packet FROM brain_jobs WHERE id=?',(jid,))
            tag=str(json.loads(job['packet']).get('STATE',{}).get('tag','')) if job else ''
            if 'research' in tag.lower():
                return {'ok':False,'reason':'Research ownership unavailable'}
            return transport
        row=self.store.one('SELECT status,owner,lease FROM brain_jobs WHERE id=?',(jid,))
        valid_lease=row and row['status']=='CLAIMED' and row['owner']==body.get('client_id') and secrets.compare_digest(str(row['lease'] or ''),str(body.get('lease') or ''))
        if not valid_lease:
            self.authority.note(jid,'FINAL_SEND','DENIED',transport.get('reason','Invalid research lease'))
            return transport if not transport['ok'] else {'ok':False,'reason':'Invalid research lease'}
        admission=self.authority.gate(jid,'FINAL_SEND',body.get('worker_slot'))
        return admission if not admission['ok'] else transport

    def result(self, jid, body):
        row=self.store.one('SELECT status,owner,lease FROM brain_jobs WHERE id=?',(jid,))
        if row and row['status'] in ('DEFERRED','QUARANTINED'):
            if row['owner']!=body.get('client_id') or not secrets.compare_digest(str(row['lease'] or ''),str(body.get('lease') or '')):
                raise ValueError('Request / lease / owner mismatch')
            t=body.get('transport') or {}
            if body.get('error') and (body.get('safe_unsent') is True or t.get('safe_unsent') is True) and not (body.get('clicked') or t.get('clicked')):
                self.store.execute('UPDATE brain_jobs SET owner=NULL,lease=NULL,updated=? WHERE id=?',(time.time(),jid))
                self.authority.note(jid,'UNSENT_ACK',row['status'],'Browser confirmed final admission denial; no click')
                return {'ok':True,'status':row['status']}
            raise ValueError('Deferred research cannot accept ambiguous delivery as safe to replay')
        out=super().result(jid,body)
        try:
            if out.get('status')=='COMPLETE':
                raw=body.get('result') if isinstance(body, dict) else None
                text=((raw.get('RETURN') or {}).get('text') if isinstance(raw, dict) else '') or ''
                from .brain_continuity import complete_seed_if_okay
                complete_seed_if_okay(self.store, jid, text)
        except Exception:
            pass
        return out


def install_research_authority(p):
    authority=ResearchAuthority(p)
    p.research_authority=authority
    p.arena.llm.brain.authority=authority
    start,stop,resume,tick=p.guided.start,p.guided.stop,p.frontier.resume,p.frontier.tick
    def restore_authorized_focus(cid):
        permission=authority.permission()
        frontier=p.frontier.row(cid)
        mission=p.guided.active()
        if not permission.get('allowed') or permission.get('focus')!=cid or not frontier or frontier['status']!='ACTIVE' or not mission or mission['campaign_id']!=cid:
            return
        mode=authority.s.one('SELECT level,is_primary FROM campaign_mobilization WHERE campaign_id=?',(cid,))
        if mode and mode['level']=='FULL_MOBILIZATION' and mode['is_primary']:
            return
        # Pause restores the previous mobilization. Resume must re-acquire the
        # same reversible guided reservation before the scheduler can claim
        # SWARM_FRONTIER tasks; an ACTIVE label alone does not make them eligible.
        if not authority.s.kv_get(p.guided._pause_key(cid),None):
            p.guided._snapshot_and_pause_previous(cid,bool(p.arena.running))
        now=time.time()
        with authority.s.lock,authority.s.db:
            authority.s.db.execute("UPDATE campaign_mobilization SET level='NORMAL',is_primary=0,changed=? WHERE campaign_id<>? AND is_primary=1",(now,cid))
            authority.s.db.execute("INSERT INTO campaign_mobilization(campaign_id,level,is_primary,changed) VALUES(?,'FULL_MOBILIZATION',1,?) ON CONFLICT(campaign_id) DO UPDATE SET level='FULL_MOBILIZATION',is_primary=1,changed=excluded.changed",(cid,now))
        p.frontier.event(cid,'','RESEARCH_FOCUS_RESTORED',{'summary':'Existing explicit resume restored the reversible guided scheduler reservation; no new resume or model replay.'})
        p.wakeup.set()
    def start_owned(self,*args,**kwargs):
        result=start(*args,**kwargs)
        if result.get('mode')=='RESEARCH':
            authority.set_permission(True,result['campaign_id'],'Explicit new research objective')
        return result
    def stop_owned(self,cid,**kwargs):
        # Pause permission before existing state restoration can wake Arena FIELD.
        authority.set_permission(False,reason='Explicit campaign pause: '+cid)
        return stop(cid,**kwargs)
    def resume_owned(self,cid,automatic=False):
        if automatic and not authority.permission().get('allowed'):
            raise ValueError('Explicit research pause requires a user resume')
        result=resume(cid,automatic=automatic)
        if not automatic:
            authority.set_permission(True,cid,'Explicit research resume')
        restore_authorized_focus(cid)
        return result
    p.guided.start=MethodType(start_owned,p.guided)
    p.guided.stop=MethodType(stop_owned,p.guided)
    p.frontier.resume=MethodType(resume_owned,p.frontier)
    def tick_owned(self):
        if authority.permission().get('allowed'):
            focus=authority.permission().get('focus')
            if focus:
                restore_authorized_focus(focus)
            return tick()
    p.frontier.tick=MethodType(tick_owned,p.frontier)
    return authority


def action_state(store, action, paused=False):
    """Read-only orthogonal delivery, result and projection truth."""
    job=store.one('SELECT status FROM brain_jobs WHERE id=?',(action.get('job_id'),)) if action.get('job_id') else None
    delivery=job['status'] if job else 'NOT_DISPATCHED'
    complete=delivery=='COMPLETE'
    projected=action['status'] in ('DONE','LOW_YIELD')
    result='RESULT_COLLECTED' if complete else 'WAITING_FOR_MODEL' if delivery=='SENT' else 'NO_RESULT'
    superseded=action['status'] in ('STALE','SUPERSEDED')
    projection='PROJECTED' if projected else 'SUPERSEDED' if superseded else 'RESULT_DEFERRED' if complete and paused else 'READY_TO_PROJECT' if complete else 'BLOCKED_BY_PAUSE' if paused else 'PENDING'
    label=('Result collected · projection paused' if projection=='RESULT_DEFERRED' else
           'Result collected · ready to apply' if projection=='READY_TO_PROJECT' else
           'Applied to research' if projected else
           'Result collected · superseded scope' if complete and superseded else
           'Assignment quarantined · no request sent' if delivery=='QUARANTINED' else
           'Delivery paused · no request sent' if delivery=='DEFERRED' else
           'Waiting for a model response' if delivery=='SENT' else
           'Preparing model request' if delivery=='CLAIMED' else
           'Queued · campaign paused' if paused else
           'Executing' if action.get('task_status')=='RUNNING' else 'Queued')
    return {'delivery_state':delivery,'result_state':result,'projection_state':projection,
        'display_status':label,'active':not paused and not complete and (delivery in ('CLAIMED','SENT') or action.get('task_status')=='RUNNING')}
