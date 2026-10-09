"""Brain chooses scientific investigations; Nemesis admits durable concurrent work.

Planning proposals are never knowledge or review decisions. The legacy coverage
queue and every historical task survive migration; visited is not exhausted.
"""
from __future__ import annotations
import hashlib,json,re,time
from .fog_coverage import FogCoveragePlanner,TAG_EXPRESSION,url_key

AUTHORITY='fog-scientific-planning/1'
OPEN_PLANS={'INTENT','QUEUED','CLAIMED','SENT'}
SYSTEM='''You own scientific research direction for the supplied current objective.
Nemesis allocates a fair concurrent domain lane; it does not choose a topic for you.
Read the complete supplied canonical graph, source outcomes, prior investigations,
pending work and recent substantive findings. Historic missions are history, not
instructions. Identify a valuable gap, dependency, contradiction or follow-up.
Visited fields remain eligible. Topics absent from the graph are allowed; declare
novel_topic=true without inventing canonical records or unsupported facts.
Return one JSON object: decision (investigate or wait), domain, topic, rationale,
anchor_ids (existing IDs, possibly []), novel_topic (boolean), strategy {question,
queries (nonempty array), source_preferences (array), reuse (array of {url,
new_assertion})}, finding_uses (array of {id,summary,implication}). Copy each used
finding's summary exactly; explain how it changes the investigation. Source reuse
must identify a distinct assertion; cookie interstitials are not evidence.
For wait return domain, reason and exhausted_strategy; this exhausts only that
strategy at this graph state, not the field. Do not repeat an identical strategy.
No fixed Physics priority, target count quota, review decision or publication.
Choose within allocated_domain, noting cross-field relevance in your rationale.
Prefer accessible primary text and meaningful contribution over record volume.'''

def digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def normalized(value):return re.sub(r'\s+',' ',value.strip()).casefold()

def investigation_key(proposal):
    strategy=proposal['strategy']
    return digest({'domain':proposal['domain'],'topic':normalized(proposal['topic']),
                   'question':normalized(strategy['question']),
                   'queries':sorted(normalized(q) for q in strategy['queries'])})

def validate_proposal(proposal,plan,state):
    """Validate state bindings, not the truth or value of a proposed science claim."""
    if not isinstance(proposal,dict) or proposal.get('domain')!=plan['domain']:
        raise ValueError('Planning proposal does not match its allocated domain')
    if proposal.get('decision')=='wait':
        if not isinstance(proposal.get('reason'),str) or not proposal['reason'].strip():
            raise ValueError('Waiting requires a specific scientific or source limitation')
        return None
    if proposal.get('decision')!='investigate':raise ValueError('Unknown planning decision')
    for key in ('topic','rationale'):
        if not isinstance(proposal.get(key),str) or not proposal[key].strip():raise ValueError('Missing '+key)
    if len(proposal['topic'])>240:raise ValueError('Topic identifier exceeds operational capacity')
    anchors=proposal.get('anchor_ids'); known={n['id']:n for n in plan['input']['graph']['nodes']}
    if not isinstance(anchors,list) or any(a not in known for a in anchors):raise ValueError('Unknown existing anchor')
    if not isinstance(proposal.get('novel_topic'),bool) or (not anchors and not proposal['novel_topic']):
        raise ValueError('Declare a novel topic or bind existing anchors')
    strategy=proposal.get('strategy')
    if not isinstance(strategy,dict) or not isinstance(strategy.get('question'),str) or not strategy['question'].strip():
        raise ValueError('Investigation requires a specific question')
    queries=strategy.get('queries')
    if not isinstance(queries,list) or not queries or any(not isinstance(q,str) or not q.strip() for q in queries):
        raise ValueError('Investigation requires nonempty search queries')
    used_queries={normalized(q) for t in state['tasks'].values() if t['domain']==plan['domain']
                  for q in t.get('decision',{}).get('strategy',{}).get('queries',[])}
    if all(normalized(q) in used_queries for q in queries):raise ValueError('All proposed queries repeat an attempted investigation')
    reuse=strategy.get('reuse',[])
    if not isinstance(reuse,list) or any(not isinstance(r,dict) or not isinstance(r.get('url'),str)
        or not isinstance(r.get('new_assertion'),str) or not r['new_assertion'].strip() for r in reuse):
        raise ValueError('Source reuse requires a distinct intended assertion')
    uses=proposal.get('finding_uses',[])
    if not isinstance(uses,list):raise ValueError('finding_uses must be an array')
    for use in uses:
        if not isinstance(use,dict) or use.get('id') not in known or use.get('summary')!=known[use['id']].get('summary',''):
            raise ValueError('Finding differs from exact canonical planning input')
        if not isinstance(use.get('implication'),str) or not use['implication'].strip():raise ValueError('Explain finding influence')
    key=investigation_key(proposal)
    if key in state['tasks']:raise ValueError('Identical investigation already admitted')
    return key

class ScientificCoveragePlanner(FogCoveragePlanner):
    def __init__(self,crew):
        super().__init__(crew)
        from .fog_paged_planning import PagedPlanning
        self.paged=PagedPlanning(self)

    def refresh(self,state):
        return self.paged.refresh(state) if self.paged is not None else super().refresh(state)

    def configure(self,owner,repo,path,enabled,auto_publish=False):
        if type(enabled) is not bool or type(auto_publish) is not bool:raise ValueError('Coverage enabled and auto_publish must be booleans')
        with self.crew.lock:
            state=self.load(owner,repo,path);budget=state.get('live_acceptance_budget')
            completed=budget and (time.time()>=budget['deadline'] or state.get('state')=='BOUNDED_DEMO_COMPLETE')
            if enabled and completed:
                # An explicit new start is a new production run, never enlargement of the old demonstration.
                if not self.crew.ws.project_row(owner,repo,path)['mode'] in {'READ_PROPOSE','READ_BRANCH_PR','OWNER_AUTONOMOUS'}:raise ValueError('Coverage expansion needs READ_PROPOSE or higher')
                self.refresh(state)  # Do not retire its resource window until the new read path is available.
                original=self.load(owner,repo,path)
                stamp=str(int(budget['deadline']))
                archive=self.root/owner/repo/'completed-demonstrations'/(stamp+'.json')
                if not archive.exists():self.save(archive,original)
                state.setdefault('completed_demonstrations',[]).append({'budget':budget,'archive':str(archive.relative_to(self.crew.root)),'new_start_at':time.time()})
                state.pop('live_acceptance_budget',None)
                self.save(self.location(owner,repo,path),state)
            return super().configure(owner,repo,path,enabled,auto_publish)

    def resume_retrieval(self,owner,repo,path,plan_id,additional_turns):
        with self.crew.lock:
            state=self.load(owner,repo,path);plan=state.get('decisions',{}).get(plan_id)
            if plan is None:raise ValueError('Unknown retained planning decision')
            self.paged.resume(state,plan,additional_turns)
            self.save(self.location(owner,repo,path),state)
            return self.public(state)

    def initialize(self,state,packet):
        if state.get('authority')!=AUTHORITY:
            state.update(authority=AUTHORITY,objective='Continuously expand, source and challenge human knowledge using exact evidence; preserve uncertainty and history.',
                         decisions={},progress={},planning_sequence=0,
                         known_ids=[n['id'] for n in packet.get('coverage_inventory',[])])
            for task in state['tasks'].values():task.setdefault('origin','legacy-coverage')

    def graph(self,packet):
        graph=packet.get('planning_graph')
        if not isinstance(graph,dict) or not isinstance(graph.get('nodes'),list) or not isinstance(graph.get('edges'),list):
            raise ValueError('Current Fog must expose complete planning_graph before scientific planning')
        ids={n['id'] for n in graph['nodes']}
        if ids!={n['id'] for n in packet['coverage_inventory']}:
            raise ValueError('Planning graph is incomplete relative to current inventory')
        return graph

    def source_ledger(self,state):
        ledger=[]
        for file in sorted((self.crew.root/state['owner']/state['repo']).glob('*/flow.json')):
            flow=self.crew.load(file.parent)
            ledger.append({'batch_id':flow.get('batch_id',file.parent.name),'state':flow['state'],'reason':flow.get('error'),
                'sources':flow['discovery'].get('source_requests',[]),'yield_counts':flow.get('yield_counts'),
                'publication':{k:(flow.get('publication') or {}).get(k) for k in ('pr_url','commit_sha','merge_commit_sha','merged_at')},
                'mission':flow['discovery'].get('mission')})
        return ledger

    def update_progress(self,state):
        for key,task in state['tasks'].items():
            progress=state['progress'].setdefault(key,{'domain':task['domain'],'attempted_at':task['created_at']})
            progress.update(state=task['state'],completed=task['state']=='MERGED',
                blocked=task['state']=='HELD',reason=task.get('reason'),
                new_evidence=task.get('yield_counts',{}),publication_batch=task.get('batch_id'))

    def enqueue_plan(self,filename,state,plan):
        identity=[state['owner'],state['repo'],state['path'],plan['id']]
        if plan.get('paged'):identity.append(plan['turn'])
        tag='fog-crew:plan:'+digest(identity)
        found=self.crew.brain.store.one('SELECT id,status,packet FROM brain_jobs WHERE '+TAG_EXPRESSION+'=? ORDER BY created DESC LIMIT 1',(tag,))
        goal=json.dumps(plan['input'],ensure_ascii=False,separators=(',',':'))
        # The existing bridge enforces actual transport capacity. No clipping.
        if found and json.loads(found['packet']).get('GOAL')!=goal:raise ValueError('Recovered planning job differs from its exact durable input')
        if plan.get('paged'):
            from .fog_paged_planning import SYSTEM as system
        else:system=SYSTEM
        jid=found['id'] if found else self.crew.brain.enqueue(system,goal,max_tokens=5000,tag=tag)
        plan.update(job_id=jid,state='QUEUED');self.save(filename,state)

    def reconcile_decisions(self,filename,state):
        from .github_evidence import result_object
        for plan in state['decisions'].values():
            if plan['state']=='INTENT':self.enqueue_plan(filename,state,plan)
            if plan['state'] not in OPEN_PLANS:continue
            job=self.crew.job(plan['job_id']);plan['state']=job['status']
            if job['status'] in {'QUEUED','CLAIMED','SENT'}:continue
            if job['status']!='COMPLETE':
                plan.update(state='HELD',reason=job.get('error') or job['status'],finished_at=time.time());continue
            # Retain raw response before parsing or rejecting it.
            plan['raw_result']=job['result'];plan['finished_at']=time.time()
            try:
                proposal=result_object(job['result']);plan['proposal']=proposal
                if plan.get('paged') and proposal.get('decision')=='retrieve':
                    self.paged.receive(state,plan,proposal,job['result']);self.save(filename,state);continue
                validation=self.paged.validate(state,plan,proposal) if plan.get('paged') else plan
                key=validate_proposal(proposal,validation,state)
                if key is None:
                    plan.update(state='WAITING',reason=proposal['reason']);continue
                target={'id':proposal['anchor_ids'][0] if proposal['anchor_ids'] else 'proposed-topic:'+key,
                        'label':proposal['topic'],'domain':plan['domain'],'kind':'research-topic',
                        'canonical':False}
                task={'key':key,'domain':plan['domain'],'label':proposal['topic'],'state':'INTENT',
                      'created_at':time.time(),'target':target,'decision':proposal,'planning_id':plan['id'],
                      'planning_job_id':plan['job_id'],'planning_input_sha256':digest(plan['input']),
                      'graph_fingerprint':plan['graph_fingerprint'],'origin':AUTHORITY,
                      'source_history':self.history(state,target)}
                if plan.get('paged'):task['planning_access']=plan['paged']
                state['tasks'][key]=task;plan.update(state='ADMITTED',task_key=key)
            except (ValueError,TypeError,KeyError) as exc:plan.update(state='HELD',reason=str(exc))
            self.save(filename,state)

    def planning_timeout(self,plan):
        # A failed transport never constitutes a scientific decision to wait.
        # Inspect the original terminal job; do not change its status or resend it.
        if plan['state']!='HELD' or plan.get('reason')!='Deadline exceeded; no automatic resend':return False
        job=self.crew.job(plan['job_id'])
        return job['status']=='FAILED' and job.get('error')==plan['reason']

    def planning_holds(self,state,fingerprint):
        held=set();recoveries={};now=time.time()
        for domain in (d['id'] for d in state['domains']):
            plans=[p for p in state['decisions'].values() if p['domain']==domain and p['graph_fingerprint']==fingerprint]
            if not plans:continue
            latest=plans[-1]
            if latest['state'] not in {'WAITING','HELD','RETRIEVAL_WAIT'}:continue
            if not self.planning_timeout(latest):held.add(domain);continue
            consecutive=0
            for previous in reversed(plans):
                if not self.planning_timeout(previous):break
                consecutive+=1
            delay=min(900,60*2**min(consecutive-1,4))
            retry_at=latest.get('finished_at',latest['created_at'])+delay
            recoveries[domain]={'domain':domain,'plan_id':latest['id'],'job_id':latest['job_id'],
                'reason':latest['reason'],'retry_at':retry_at,'consecutive_timeouts':consecutive,
                'scope':'New planning decision only; the terminal request is preserved and never resent.'}
            if now<retry_at:held.add(domain)
        return held,recoveries

    def schedule(self,filename,state):
        self.reconcile(state)
        if not state['enabled']:
            if state.get('authority')==AUTHORITY:self.update_progress(state)
            if state.get('state')=='RECOVERY_PENDING' and 'Access is denied' in (state.get('error') or ''):
                state.setdefault('recovered_checkpoint_errors',[]).append({'at':time.time(),'error':state['error']})
                state.update(state='BOUNDED_DEMO_COMPLETE' if state.get('live_acceptance_budget') else 'PAUSED',error=None,next_attempt_at=0)
            self.save(filename,state);return
        if not self.crew.brain.enabled or self.crew.brain.store.kv_get('brain_hold',''):
            state['state']='WAITING_FOR_BRAIN';self.save(filename,state);return
        packet=self.refresh(state);self.initialize(state,packet)
        graph=self.graph(packet) if self.paged is None else None
        budget=state.get('live_acceptance_budget')
        if budget and (time.time()>=budget['deadline'] or sum(t.get('origin')==AUTHORITY for t in state['tasks'].values())>=budget['max_investigations']
                       or len(state['decisions'])>=budget['max_planning_requests']):
            state.update(enabled=False,state='BOUNDED_DEMO_COMPLETE',waiting_reasons=['Live demonstration budget reached; retained work may finish.'])
            self.save(filename,state);return
        self.reconcile_decisions(filename,state);self.update_progress(state)
        # Recover admitted pre-dispatch intents before allocating more lanes.
        for task in state['tasks'].values():
            if task['state']!='INTENT' or task.get('origin')!=AUTHORITY:continue
            queued=self.crew.discover(state['owner'],state['repo'],state['path'],
                    [self.mission(task)],state['auto_publish'],coverage_tasks=[task])
            task.update(job_id=queued['jobs'][0],state='QUEUED');self.save(filename,state)
        active_plans=[p for p in state['decisions'].values() if p['state'] in OPEN_PLANS]
        free=max(0,3-self.active_count(state)-len(active_plans))
        fingerprint=packet['snapshot'] if self.paged is not None else digest(graph)
        recent=[n for n in graph['nodes'] if n['id'] not in set(state['known_ids'])] if graph is not None else []
        domains=[d['id'] for d in state['domains']]
        if state.get('last_domain') in domains:
            i=domains.index(state['last_domain'])+1;domains=domains[i:]+domains[:i]
        busy={p['domain'] for p in active_plans}|{t['domain'] for t in state['tasks'].values()
                if t['state'] not in {'MERGED','HELD','READY','PR_OPEN'}}
        # A wait blocks only the strategy at the same substantive graph state.
        held,recoveries=self.planning_holds(state,fingerprint)
        state['planning_recoveries']=list(recoveries.values())
        for domain in [d for d in domains if d not in busy|held][:free]:
            state['planning_sequence']+=1;pid=str(state['planning_sequence'])+'-'+domain
            if self.paged is not None:
                plan=self.paged.create(state,pid,domain,packet)
            else:
                plan={'id':pid,'domain':domain,'state':'INTENT','created_at':time.time(),
                  'graph_fingerprint':fingerprint,'input':{'protocol':AUTHORITY,
                    'objective':state['objective'],'allocated_domain':domain,
                    'canonical_sha':state['inventory_sha'],'graph':graph,'recent_findings':recent,
                    'coverage':packet['coverage_by_domain'],'source_history':self.source_ledger(state),
                    'investigations':[{k:t.get(k) for k in ('key','domain','label','state','decision','reason','yield_counts','batch_id')}
                                      for t in state['tasks'].values()],
                    'progress':state['progress']}}
            if domain in recoveries:
                recovery=recoveries[domain]
                plan['recovery_of']=recovery
                plan['input']['planning_recovery']=recovery
                if plan.get('brief') is not None:plan['brief']['planning_recovery']=recovery
            state['decisions'][pid]=plan;state['last_domain']=domain
            self.save(filename,state);self.enqueue_plan(filename,state,plan)
        state.update(state='RUNNING' if self.active_count(state) or any(p['state'] in OPEN_PLANS for p in state['decisions'].values())
                     else 'WAITING_FOR_PLANNING_RECOVERY' if recoveries else 'WAITING_FOR_SCIENTIFIC_DIRECTION',waiting_reasons=[p.get('reason') for p in state['decisions'].values()
                     if p['state'] in {'WAITING','HELD'} and p['graph_fingerprint']==fingerprint],error=None,next_attempt_at=0)
        self.save(filename,state)

    @staticmethod
    def mission(task):
        if task.get('origin')!=AUTHORITY:return FogCoveragePlanner.mission(task)
        return ('Investigate '+task['label']+'. The complete Brain decision, rationale, search strategy, '
                'canonical findings and previous source outcomes are in context.coverage_plan.decision. '
                'Follow that justified investigation, not historic missions. Discover accessible primary sources '
                'for distinct unsupported gaps; preserve uncertainty and do not invent taxonomy or frontier status.')

    @staticmethod
    def public(state):
        result=FogCoveragePlanner.public(state)
        result.update(authority=state.get('authority'),objective=state.get('objective'),
            decision_states={k:sum(p['state']==k for p in state.get('decisions',{}).values())
                             for k in {p['state'] for p in state.get('decisions',{}).values()}},
            waiting_reasons=state.get('waiting_reasons',[]),planning_recoveries=state.get('planning_recoveries',[]),
            retrieval_waits=[{'plan_id':p['id'],'domain':p['domain'],'turn':p['turn'],'limit':p['retrieval_turn_limit'],'reason':p.get('reason')}
                for p in state.get('decisions',{}).values() if p['state']=='RETRIEVAL_WAIT'])
        return result
