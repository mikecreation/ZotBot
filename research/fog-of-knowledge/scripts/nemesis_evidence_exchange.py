"""Pinned, file-based evidence operations for the Nemesis crew adapter."""
from __future__ import annotations
import argparse,json,os,sys
from pathlib import Path
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parent))
from evidence_compiler import ROOT,EvidenceError,candidate_digest,context_digest,digest,load_candidate,review_packet,rows,storage_record,unique,validate_assertions,validate_dag,validate_public_frontier,validate_sources
from evidence_pipeline import graph,retain_decisions
from source_capture import capture_source,validate_captures
from nemesis_apply import BatchError,compile_batch,edge_key,unique_records,validate_edges,validate_invalidation_reviews,validate_manifest,validate_nodes,validate_reviews

MAX_PACKET=300_000
TARGET_FILES=(('nodes.jsonl','node'),('edges.jsonl','edge'),('reviews.jsonl','review'),('taxonomy.jsonl','taxonomy'),('identities.jsonl','identity'))
AUTHOR_CORRECTABLE_CODES={'capture-binding','candidate-format','candidate-preflight','evidence-validation'}


class ExchangeError(EvidenceError):
    """Structured feedback for an explicit, retained candidate revision."""
    def __init__(self,code,message,**details):
        super().__init__(message);self.code=code;self.details=details

def folder(value):
    result=(ROOT/value).resolve()
    if not result.is_relative_to((ROOT/'nemesis/batches').resolve()) or not result.is_dir():
        raise EvidenceError('batch folder required inside nemesis/batches')
    return result

def write(path,value):
    write_text(path,json.dumps(value,ensure_ascii=False,indent=2)+'\n')

def write_text(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(value,encoding='utf-8');os.replace(temporary,path)

def bounded(value):
    if len(json.dumps(value,ensure_ascii=False).encode())>MAX_PACKET:
        raise EvidenceError('Evidence packet exceeds 300 KB; select smaller sources and split the mission')
    return value

def retained_captures(batch,required=True):
    receipt=batch/'.nemesis-control/captured-sources.json'
    if not required and not receipt.exists():return {}
    try:
        retained=json.loads(receipt.read_text(encoding='utf-8'))
        if not isinstance(retained,list) or any(not isinstance(s,dict) for s in retained):
            raise EvidenceError('Compiler capture receipt must be an array of source objects')
        sources=validate_sources({'sources.jsonl':retained});validate_captures(sources)
    except (EvidenceError,ValueError,TypeError,AttributeError,KeyError,OSError) as exc:raise ExchangeError('capture-integrity',str(exc)) from exc
    return sources

def capture(batch):
    requests=rows(batch/'source_requests.jsonl')
    if not 1<=len(requests)<=4:raise EvidenceError('Discover one to four bounded public sources per batch')
    control=batch/'.nemesis-control';sources=[];retained=list(retained_captures(batch,required=False).values())
    failed_path=control/'source-capture-failures.json'
    failures=json.loads(failed_path.read_text(encoding='utf-8')) if failed_path.exists() else []
    if not isinstance(failures,list) or any(not isinstance(f,dict) or not isinstance(f.get('request'),dict) or f.get('status') not in {403,404,410} for f in failures):
        raise ExchangeError('capture-integrity','Malformed source acquisition history; original retained')
    ids=[r.get('id') for r in requests]
    if any(not isinstance(sid,str) or not sid for sid in ids) or len(ids)!=len(set(ids)):
        raise EvidenceError('unique source ID required')
    failed={f['request'].get('id'):f for f in failures}
    if len(failed)!=len(failures) or set(failed)-set(ids):
        raise ExchangeError('capture-integrity','Source requests removed or duplicated an acquisition failure; create a new batch revision')
    requested_ids={r.get('id') for r in requests if isinstance(r.get('id'),str)}
    if set(s['id'] for s in retained)-requested_ids:raise ExchangeError('capture-integrity','Source requests removed a retained source; create a new batch revision')
    for request in requests:
        sid=request.get('id')
        if not isinstance(sid,str) or not sid or any(s['id']==sid for s in sources):raise EvidenceError('unique source ID required')
        if sid in failed:
            if failed[sid]['request']!=request or any(s['id']==sid for s in retained):
                raise ExchangeError('capture-integrity','Source request changed or conflicting capture history; create a new batch revision')
            continue  # Retain permanent access outcomes, never fetch a later revision silently.
        # A resumed capture reuses its retained revision; it never silently fetches newer text.
        receipt=control/'captured-sources.json'
        source=next((s for s in retained if s['id']==sid),None)
        if source:
            if any(source[k]!=request.get(k,'unknown' if k=='source_kind' else None) for k in ('url','title','source_kind')):raise ExchangeError('capture-integrity','Source request changed; create a new batch revision')
        else:
            try:
                source=capture_source(request['url'],sid,request['title'],request.get('source_kind','unknown'),public_only=True)
            except HTTPError as exc:
                if exc.code not in {403,404,410}:raise  # transient failures retain bounded runtime retry
                failure={'request':request,'status':exc.code,'reason':'Public source returned HTTP '+str(exc.code)+'; no source text captured'}
                failures.append(failure);failed[sid]=failure;write(failed_path,failures)
                continue
            retained.append(source);write(receipt,retained)
        sources.append(source)
    if not sources:
        raise ExchangeError('source-unavailable','No public source could be captured; no candidate constructed',source_capture_failures=failures)
    discovery=json.loads((control/'discovery.json').read_text(encoding='utf-8')) if (control/'discovery.json').exists() else {}
    ids=discovery.get('target_ids',[])
    if not isinstance(ids,list) or len(ids)>12:raise EvidenceError('At most twelve existing target_ids per mission')
    g=graph()
    value=bounded({'sources':sources,'source_capture_failures':failures,
                   'source_limitations':'Only compiler-captured sources below may support assertions. Unavailable URLs are not evidence; request a new source revision for unsupported targets.',
                   'existing_targets':[n for n in g['nodes'] if n['id'] in ids],
                   'record_catalog':[{k:n.get(k) for k in ('id','label','kind','domain')} for n in g['nodes']]})
    write(control/'author-context.json',value)
    return {'captured':len(sources),'unavailable':len(failures)}

def captured_sources(batch,candidate):
    """The compiler owns captures; model metadata can never replace them."""
    sources=retained_captures(batch)
    try:proposed=unique(candidate['sources.jsonl'],'source')
    except EvidenceError as exc:raise ExchangeError('candidate-format',str(exc)) from exc
    if proposed!=sources:
        missing=sorted(set(sources)-set(proposed));unexpected=sorted(set(proposed)-set(sources))
        changed={sid:sorted(k for k in set(proposed[sid])|set(sources[sid]) if proposed[sid].get(k)!=sources[sid].get(k))
                 for sid in set(sources)&set(proposed) if proposed[sid]!=sources[sid]}
        raise ExchangeError('capture-binding','Candidate sources must exactly match compiler captures; author replies should reference source_ids instead of reproducing capture metadata',
                            missing_source_ids=missing,unexpected_source_ids=unexpected,changed_source_fields=changed)
    return sources


def bind_citations(record,sources):
    """Resolve explicit capture IDs; never guess a URL or alter supplied metadata."""
    citations=record.get('sources')
    if not isinstance(citations,list):raise ExchangeError('candidate-format',str(record.get('id','record'))+': sources must be an array')
    for index,citation in enumerate(citations):
        if isinstance(citation,str):
            if citation not in sources:raise ExchangeError('candidate-format','Shorthand source ID was not captured: '+citation)
            citation={'id':citation};citations[index]=citation
        if not isinstance(citation,dict):raise ExchangeError('candidate-format','Canonical citation must be an object or an explicit captured source ID')
        if 'id' in citation and not isinstance(citation['id'],str):raise ExchangeError('candidate-format','Canonical citation id must be a string')
        source=sources.get(citation.get('id'))
        if source is None:continue  # Complete existing records may retain earlier citations.
        missing_url='url' not in citation
        for field in ('url','title'):
            if field in citation and citation[field]!=source[field]:
                raise ExchangeError('candidate-preflight',str(record.get('id','record'))+': supplied citation '+field+' differs from compiler capture: '+source['id'])
            if field=='url' or missing_url:citation.setdefault(field,source[field])


def preflight(candidate,g,sources):
    """Run deterministic representation gates before paying for two reviews.

    This never approves a scientific interpretation. The final apply gate repeats
    these checks and still requires both independent reviews of the same revision.
    """
    manifest=candidate['manifest.json']
    if not isinstance(manifest,dict):raise EvidenceError('manifest.json: expected an object')
    validate_manifest(manifest,g)
    unique_records(candidate['nodes.jsonl'],'id','node');unique_records(candidate['reviews.jsonl'],'id','review')
    validate_nodes(candidate['nodes.jsonl'],g,manifest)
    future={n['id']:n for n in g['nodes']};future.update({n['id']:n for n in candidate['nodes.jsonl']})
    validate_edges(candidate['edges.jsonl'],set(future));validate_reviews(candidate['reviews.jsonl'],set(future))
    validate_invalidation_reviews(g,candidate['nodes.jsonl'],candidate['reviews.jsonl'])
    final={n['id']:n for n in compile_batch(g,candidate['nodes.jsonl'],candidate['edges.jsonl'],candidate['reviews.jsonl'])['nodes']}
    assertions=unique(candidate['assertions.jsonl'],'assertion')
    for filename,kind in TARGET_FILES:
        if kind!='edge':unique(candidate[filename],kind)
        for record in candidate[filename]:
            matches=[a for a in assertions.values() if a.get('target_kind')==kind and a.get('target_sha256')==digest(record) and a.get('canonical_record')==record]
            if not matches:raise EvidenceError(f'{filename}: every target needs an exact complete representation assertion before review')
            if kind=='node':
                if type(record.get('frontier')) is not bool:raise EvidenceError(record['id']+': explicit frontier classification required')
                validate_public_frontier(record)
                if storage_record(record)!=final[record['id']]:raise EvidenceError(record['id']+': review must cover the complete resulting node; inherited fields or aliases cannot be silently added')
                if not isinstance(record.get('sources'),list) or any(not isinstance(s,dict) for s in record['sources']):
                    raise EvidenceError(record['id']+': canonical sources must be an array of objects with id and exact URL')
                listed={s.get('id'):s for s in record['sources']}
                for assertion in matches:
                    if record.get('summary')!=assertion['statement']:raise EvidenceError(record['id']+': canonical node summary differs from reviewed assertion')
                    supported={span['source_id'] for span in assertion['support']}
                    if not set(record.get('public_frontier',{}).get('source_ids',[]))<=supported:
                        raise EvidenceError(record['id']+': public disclosure metadata needs exact retained source support')
                    for sid in supported:
                        if sid not in listed or listed[sid].get('url')!=sources[sid]['url']:
                            raise EvidenceError(record['id']+': reviewed source missing or URL differs from canonical provenance: '+sid)
            elif kind=='edge' and any(edge_key(e)==edge_key(record) and e!=record for e in g['edges']):
                raise EvidenceError('existing relationship differs; use an explicit reviewed revision')
            elif kind=='review' and any(r.get('id')==record['id'] and r!=record for r in g.get('reviews',[])):
                raise EvidenceError('existing review ID differs; retain a new review revision')
    ids=set(future)|{'family:'+d['id'] for d in g['domains']}
    validate_dag(g.get('taxonomy',[])+candidate['taxonomy.jsonl'],ids)
    for ident in candidate['identities.jsonl']:
        left,right=future.get(ident.get('left')),future.get(ident.get('right'))
        if not left or not right or left==right:raise EvidenceError('invalid identity endpoints')
        if ident.get('type') not in {'same_concept','about','related_concept'}:raise EvidenceError('unsupported identity relation')
        if ident['type']=='same_concept' and left['kind']!=right['kind']:raise EvidenceError('same_concept cannot collapse distinct record kinds')


def packet(batch):
    candidate=load_candidate(batch);sources=captured_sources(batch,candidate)
    # Bind mechanical references only. Supplied hashes/offsets are never corrected.
    # Quotes, scope, classification, target kinds and full records remain author-owned.
    unbound=json.loads(json.dumps(candidate));original=unbound['assertions.jsonl']
    for node in candidate['nodes.jsonl']:bind_citations(node,sources)
    for assertion in candidate['assertions.jsonl']:
        if not isinstance(assertion.get('canonical_record'),dict):raise ExchangeError('candidate-format',assertion.get('id','assertion')+': canonical_record must be an object')
        if assertion.get('target_kind')=='node':bind_citations(assertion['canonical_record'],sources)
        if isinstance(assertion.get('support'),dict) and {'source_id','quote'}<=set(assertion['support']):
            assertion['support']=[assertion['support']]
        if not isinstance(assertion.get('support'),list) or not assertion['support'] or any(not isinstance(span,dict) for span in assertion['support']):
            raise ExchangeError('candidate-format',assertion.get('id','assertion')+': support must be a nonempty array of exact excerpt objects')
        if 'target_sha256' not in assertion:assertion['target_sha256']=digest(assertion['canonical_record'])
        for span in assertion.get('support',[]):
            if not isinstance(span.get('source_id'),str):raise ExchangeError('candidate-format','Exact support source_id must be a string')
            source=sources.get(span.get('source_id'))
            if source is None:raise EvidenceError('support source ID was not captured')
            if 'source_sha256' not in span:span['source_sha256']=source['sha256']
            if 'start' not in span and 'end' not in span:
                quote=span.get('quote');text=source['text']
                if not isinstance(quote,str) or not quote or text.count(quote)!=1:raise EvidenceError('Quote needs one exact location or explicit start/end offsets')
                span['start']=text.index(quote);span['end']=span['start']+len(quote)
    validate_assertions(candidate)
    try:preflight(candidate,graph(),sources)
    except (EvidenceError,BatchError,TypeError,KeyError) as exc:raise ExchangeError('candidate-preflight',str(exc)) from exc
    targets=sum(len(candidate[k]) for k in ('nodes.jsonl','edges.jsonl','reviews.jsonl','taxonomy.jsonl','identities.jsonl'))
    if not 1<=targets<=12:raise EvidenceError('Use one to twelve fully supported targets per review packet')
    value=bounded(review_packet(candidate,graph()))
    if unbound!=candidate:
        write(batch/'.nemesis-control/unbound-candidate.json',unbound)
        write(batch/'.nemesis-control/unbound-assertions.json',original)
        for filename in ('nodes.jsonl','assertions.jsonl'):
            if unbound[filename]!=candidate[filename]:
                write_text(batch/filename,''.join(json.dumps(a,ensure_ascii=False)+'\n' for a in candidate[filename]))
    write(batch/'.nemesis-control/packet.json',value)
    return {'candidate_sha256':value['candidate_sha256'],'context_sha256':value['context_sha256'],'targets':targets}

def review(batch):
    candidate=load_candidate(batch)
    captured_sources(batch,candidate)
    control=json.loads((batch/'.nemesis-control/review-input.json').read_text(encoding='utf-8'))
    if candidate_digest(candidate)!=control['candidate_sha256'] or context_digest(candidate,graph())!=control['context_sha256']:
        raise EvidenceError('Candidate or endpoint revision changed after review dispatch')
    return retain_decisions(candidate,control['decisions'],control['reviewer'],control['model'],control['role'])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('batch_dir')
    modes=parser.add_mutually_exclusive_group(required=True)
    for mode in ('capture','packet','review'):modes.add_argument('--'+mode,action='store_true')
    args=parser.parse_args();batch=folder(args.batch_dir)
    try:result=capture(batch) if args.capture else packet(batch) if args.packet else review(batch)
    except OSError as exc:
        print(json.dumps({'ok':False,'error':str(exc),'code':'operational-io'}));return 2
    except (EvidenceError,BatchError,ValueError,KeyError) as exc:
        print(json.dumps({'ok':False,'error':str(exc),**({'code':exc.code,'details':exc.details} if isinstance(exc,ExchangeError) else {'code':'evidence-validation'})}));return 2
    print(json.dumps({'ok':True,**result}));return 0

if __name__=='__main__':raise SystemExit(main())
