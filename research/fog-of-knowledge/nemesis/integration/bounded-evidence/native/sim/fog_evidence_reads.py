"""Small evidence views over immutable local captures. No network or scientific edits."""
import copy,hashlib,json
from pathlib import Path
from .durable_json import write_json

PROTOCOL='fog-evidence-reads/1'
FRAME_LIMIT=32000
REPLY_LIMIT=10000
READ_LIMIT=64
SYSTEM='''The source catalog and text windows are views of complete retained captures, NOT complete papers. URLs are discovery aids, not substitute evidence. Nothing omitted is absent, disproved or exhausted.
Request additional exact source context whenever necessary before authoring or approving. Return {"decision":"retrieve","request":{"operation":"source","source_id":"exact ID","start":0,"end":2000}} for Unicode code-point offsets, end exclusive (at most 2000 characters). Use operation:"search",source_id,query:exact literal text,offset:0 for source matches with context; operation:"records",query:literal text or ids:[exact IDs],offset:0 for complete existing/proposed atlas records; operation:"catalog",offset:0 for source metadata; operation:"replay",turn:0 for a prior read. No file paths, SQL, code or shell commands. Each reply discloses total/returned counts, exact offsets, hashes and continuation. All earlier replies remain replayable. A zero-match literal search does not prove a paper lacks a concept.
For reviews the complete target, assertion, scope and all exact supporting passages remain supplied. Inspect surrounding context, limitations and counterevidence with reads; if evidence is inadequate return unsupported or uncertain. Reads never constitute approval. Once satisfied, return the original requested author packet or review decisions. Do not append retrieval requests to a final candidate/decision. No cross-role review results are shared. Resource waits preserve the same candidate and role; they never authorize publication.'''

def encode(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'),allow_nan=False)
def size(v):return len(encode(v).encode('utf8'))
def digest(v):return hashlib.sha256(encode(v).encode('utf8')).hexdigest()
def header(s):
    text=s['text'];sha=hashlib.sha256(text.encode('utf8')).hexdigest()
    if s.get('sha256') and s['sha256']!=sha:raise ValueError('Retained source text hash mismatch: '+s['id'])
    out={k:copy.deepcopy(v) for k,v in s.items() if k not in {'text','pages'}}
    out.update(sha256=sha,characters=len(text),text_is_complete=False)
    # PDF page tables contain metadata only; text stays in the source vault.
    if 'pages' in s:out['page_count']=len(s['pages'])
    return out

def window(s,start,end):
    text=s['text']
    if type(start) is not int or type(end) is not int or not 0<=start<=end<=len(text):raise ValueError('Invalid exact source offsets')
    quote=text[start:end]
    return {'start':start,'end':end,'text':quote,'sha256':hashlib.sha256(quote.encode('utf8')).hexdigest(),
            'complete_source':start==0 and end==len(text),'source_characters':len(text),
            'page_numbers':[p.get('page') for p in s.get('pages',[]) if p.get('start',0)<end and p.get('end',len(text))>start]}

def author_frames(value):
    """Keep original sources outside prompts; every source gets an explicit preview."""
    base=copy.deepcopy(value);sources=base.pop('sources');catalog=base.pop('record_catalog',[])
    targets=base.pop('existing_targets',[])
    plan=base.get('coverage_plan',{})
    existing=plan.pop('existing_representations',[])
    base['existing_record_access']={'catalog_records':len(catalog),'explicit_target_ids':[n['id'] for n in targets],
        'related_existing_ids':[n['id'] for n in existing],
        'scope':'Full records and duplicate checks require records queries; the catalog is not pasted.'}
    base['evidence_access']={'protocol':PROTOCOL,'source_count':len(sources),'complete_captures_retained':True,
        'scope':'Each source has a prefix preview only. Search/read other sections before conclusions; all sources accessible through catalog.'}
    # Failed URL details are retained in the original context, not repeated prose.
    if size(base.get('source_capture_failures',[]))>2000:
        failures=base.pop('source_capture_failures')
        base['source_capture_failure_scope']={'count':len(failures),'unavailable_ids':[v.get('id') for v in failures],
            'scope':'Unavailable captures cannot support claims. Exact failure details remain local.'}
    units=[];current=[]
    for s in sources:
        view={**header(s),'windows':[window(s,0,min(800,len(s['text'])))]}
        trial={**base,'sources':current+[view]}
        if current and (len(current)>=4 or size(trial)>28000):
            units.append({**copy.deepcopy(base),'sources':current});current=[]
        current.append(view)
        if size({**base,'sources':current})>28000:raise ValueError('Atomic author metadata exceeds bounded frame; complete input retained')
    if current:units.append({**copy.deepcopy(base),'sources':current})
    for i,u in enumerate(units):
        u['partition']={'index':i,'count':len(units),'source_ids':[s['id'] for s in u['sources']],
            'rule':'Author distinct findings for these sources; other units remain pending. Additional source text is available through exact reads.'}
    return units

def review_frame(packet):
    frame=copy.deepcopy(packet);records=frame['records'];sources=records['sources.jsonl'];supports={}
    for a in records['assertions.jsonl']:
        for span in a['support']:supports.setdefault(span['source_id'],[]).append(span)
    views=[]
    for s in sources:
        spans=[]
        for support in supports.get(s['id'],[]):
            start=support.get('start');end=support.get('end');quote=support['quote']
            if start is None:
                if s['text'].count(quote)!=1:raise ValueError('Ambiguous review quotation needs exact offsets')
                start=s['text'].index(quote);end=start+len(quote)
            if s['text'][start:end]!=quote:raise ValueError('Review source differs from exact supporting passage')
            spans.append((max(0,start-600),min(len(s['text']),end+600)))
        merged=[]
        for start,end in sorted(spans):
            if merged and start<=merged[-1][1]:merged[-1]=(merged[-1][0],max(end,merged[-1][1]))
            else:merged.append((start,end))
        views.append({**header(s),'windows':[window(s,a,b) for a,b in merged]})
    records['sources.jsonl']=views
    referenced=set()
    for a in records['assertions.jsonl']:
        r=a['canonical_record'];referenced.add(r.get('id'))
        referenced.update(r.get(k) for k in ('source','target','parent','child','left','right'))
    endpoints=frame.get('existing_endpoints',[])
    frame['existing_endpoints']=[n for n in endpoints if n.get('id') in referenced]
    frame['endpoint_scope']={'matched':len(endpoints),'returned':len(frame['existing_endpoints']),
        'complete':len(endpoints)==len(frame['existing_endpoints']),'remaining_access':'records query; original and proposed versions distinguished'}
    frame['evidence_access']={'protocol':PROTOCOL,'complete_captures_retained':True,
        'scope':'Exact support plus surrounding windows, not complete sources. Both roles can independently retrieve every retained section.'}
    if size(frame)>FRAME_LIMIT:raise ValueError('Atomic assertion/context exceeds bounded frame; full candidate retained, no implicit approval')
    return frame

def bounded_review_units(packet):
    """Partition exact assertions by view capacity, not by full paper length."""
    from .fog_packet_units import review_units
    def measure(value):
        # Capacity errors partition; hash/quote integrity errors still fail in
        # review_frame on every final unit. No text is clipped to force a fit.
        try:return size(review_frame(value))
        except ValueError:return FRAME_LIMIT+1
    units=review_units(packet,FRAME_LIMIT,measure)
    for unit in units:review_frame(unit)
    return units

class EvidenceReads:
    def __init__(self,folder,flow,key):
        self.folder=Path(folder)/'evidence-reads'/hashlib.sha256(key.encode()).hexdigest()[:20]
        self.flow=flow;self.key=key
        self.state=flow.setdefault('evidence_reads',{}).setdefault(key,{'turn':0,'limit':READ_LIMIT,'history':[]})
    def create(self,original,frame):
        if not (self.folder/'original.json').exists():
            write_json(self.folder/'original.json',original)
        if not (self.folder/'base.json').exists():write_json(self.folder/'base.json',frame)
        if not (self.folder/'identity.json').exists():
            # Recover a process loss between individual atomic file commits.
            saved=json.loads((self.folder/'original.json').read_text(encoding='utf8'))
            saved_frame=json.loads((self.folder/'base.json').read_text(encoding='utf8'))
            if digest(saved)!=digest(original) or digest(saved_frame)!=digest(frame):raise ValueError('Partial read checkpoint conflicts with supplied input')
            identity={'original_sha256':digest(original),'base_sha256':digest(frame)}
            graph=self.folder.parents[1]/'project/data/knowledge.json'
            if graph.exists():identity['graph_sha256']=hashlib.sha256(graph.read_bytes()).hexdigest()
            write_json(self.folder/'identity.json',identity)
        identity=json.loads((self.folder/'identity.json').read_text(encoding='utf8'))
        if identity['original_sha256']!=digest(original) or identity['base_sha256']!=digest(frame):raise ValueError('Read stream identity changed')
        self.state.update(identity)
        return self.base()
    def base(self):
        v=json.loads((self.folder/'base.json').read_text(encoding='utf8'))
        if digest(v)!=self.state['base_sha256']:raise ValueError('Retained read frame changed')
        return v
    def original(self):
        v=json.loads((self.folder/'original.json').read_text(encoding='utf8'))
        if digest(v)!=self.state['original_sha256']:raise ValueError('Retained original evidence input changed')
        return v
    def sources(self):
        v=self.original();sources=v.get('sources',v.get('records',{}).get('sources.jsonl',[]))
        # Author original contains all complete sources even when previews are partitioned.
        for s in sources:header(s)
        return sources
    def exchange(self,request):
        if not isinstance(request,dict) or size(request)>2000:raise ValueError('A small typed evidence read is required')
        op=request.get('operation');allowed={
            'source':{'operation','source_id','start','end'},'search':{'operation','source_id','query','offset'},
            'records':{'operation','ids','query','offset'},'catalog':{'operation','offset'},'replay':{'operation','turn'}}
        if op not in allowed or set(request)-allowed[op]:raise ValueError('Unknown read operation or fields')
        if op=='replay':
            turn=request.get('turn')
            if type(turn) is not int or not 0<=turn<len(self.state['history']):raise ValueError('Unknown retained read turn')
            reply=json.loads((self.folder/f'query-{turn}.json').read_text(encoding='utf8'))
            if digest(reply)!=self.state['history'][turn]['reply_sha256']:raise ValueError('Retained read reply changed')
            return reply
        sources=self.sources();data={}
        if op in {'source','search'}:
            s=next((v for v in sources if v['id']==request.get('source_id')),None)
            if s is None:raise ValueError('Unknown compiler-retained source ID')
            if op=='source':
                a=request.get('start');b=request.get('end')
                if type(a) is not int or type(b) is not int or b-a>2000:raise ValueError('Source reads require exact offsets spanning at most 2000 characters')
                data={'source':header(s),'window':window(s,a,b),'next_start':b if b<len(s['text']) else None}
            else:
                q=request.get('query');offset=request.get('offset',0)
                if not isinstance(q,str) or not 1<=len(q)<=160:raise ValueError('Search needs an exact literal of 1..160 characters')
                matches=[];position=0
                while True:
                    position=s['text'].find(q,position)
                    if position<0:break
                    matches.append(position);position+=max(1,len(q))
                page=self.page(matches,offset,4)
                positions=page.pop('records')
                data={**page,'source':header(s),'windows':[window(s,max(0,p-250),min(len(s['text']),p+len(q)+250)) for p in positions]}
        elif op=='catalog':data=self.page([header(s) for s in sources],request.get('offset',0),4)
        else:
            # Read only the pinned local project, never a worker-supplied file path.
            graph=self.folder.parents[1]/'project/data/knowledge.json'
            raw=graph.read_bytes();sha=hashlib.sha256(raw).hexdigest()
            prior=self.state.setdefault('graph_sha256',sha)
            if sha!=prior:raise ValueError('Pinned graph changed during evidence reads')
            nodes=json.loads(raw)['nodes'];original=self.original();proposed=original.get('records',{}).get('nodes.jsonl',[])
            endpoints=original.get('existing_endpoints',[])
            ids=request.get('ids');q=request.get('query')
            if ids is not None and (not isinstance(ids,list) or len(ids)>10 or any(not isinstance(i,str) for i in ids)):raise ValueError('Records ids must be a small explicit list')
            if ids is None and (not isinstance(q,str) or not 1<=len(q)<=160):raise ValueError('Records query requires ids or a literal text search')
            rows=[{'version':label,'record':n} for label,items in [('existing',nodes),('proposed',proposed),('candidate_context',endpoints)] for n in items
                  if (n['id'] in ids if ids is not None else q.lower() in encode(n).lower())]
            data={**self.page(rows,request.get('offset',0),3),'graph_sha256':sha,'scope':request}
        reply={'protocol':PROTOCOL,'request':request,'data':data,'source_input_sha256':self.state['original_sha256']}
        reply['integrity']={'bytes':size(data),'sha256':digest(data)}
        if size(reply)>REPLY_LIMIT:raise ValueError('Exact reply exceeds read capacity; request a narrower page. Nothing clipped.')
        return reply
    @staticmethod
    def page(rows,offset,limit):
        if type(offset) is not int or not 0<=offset<=len(rows):raise ValueError('Invalid page offset')
        end=min(offset+limit,len(rows))
        return {'matched':len(rows),'returned':end-offset,'offset':offset,'records':copy.deepcopy(rows[offset:end]),
            'next_offset':end if end<len(rows) else None,'complete_query':offset==0 and end==len(rows)}
    def continuation(self,request,job):
        if self.state['turn']>=self.state['limit']:
            self.state.update(waiting=True,pending_request=request,pending_job=job['id']);return None
        turn=self.state['turn'];path=self.folder/f'query-{turn}.json'
        if path.exists() and (self.folder/f'result-{turn}.json').exists():
            receipt=json.loads((self.folder/f'result-{turn}.json').read_text(encoding='utf8'))
            if receipt['job_id']!=job['id'] or receipt['request']!=request:raise ValueError('Read journal conflicts with tracked request')
            reply=json.loads(path.read_text(encoding='utf8'))
            if digest(reply)!=receipt['reply_sha256']:raise ValueError('Retained read journal changed')
        else:
            try:reply=self.exchange(request)
            except (ValueError,KeyError,TypeError) as exc:reply={'protocol':PROTOCOL,'request':request,'error':str(exc),'complete':False}
            write_json(path,reply)
            write_json(self.folder/f'result-{turn}.json',{'job_id':job['id'],'request':request,'raw_result':job['result'],'reply_sha256':digest(reply)})
        frame=self.base()
        if 'sources' in frame:
            # Author previews do not accumulate alongside reads. The complete
            # sources and initial previews remain retained and source-readable.
            for source in frame['sources']:
                source['windows']=[]
                source['window_scope']='Initial prefix is retained; use source/search to read it again.'
        frame['current_reply']=reply
        frame['read_history']={'matched':len(self.state['history']),'recent':self.state['history'][-6:],
            'complete':len(self.state['history'])<=6,'all_replies_accessible':'replay'}
        if size(frame)>FRAME_LIMIT:
            frame['read_history']['recent']=[];frame['read_history']['complete']=False
        if size(frame)>FRAME_LIMIT:
            frame['current_reply']={'protocol':PROTOCOL,'request':request,'complete':False,'retained_turn':turn,
                'error':'Exact reply retained but cannot fit beside this complete target. Request a smaller source interval or narrower query. Nothing clipped; this read is replayable.'}
        if size(frame)>FRAME_LIMIT:raise ValueError('Exact evidence frame exceeds capacity; complete input and reply retained')
        return frame,{'turn':turn,'request':request,'reply_sha256':digest(reply)}
