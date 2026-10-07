"""Pinned, file-based evidence operations for the Nemesis crew adapter."""
from __future__ import annotations
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from evidence_compiler import ROOT,EvidenceError,candidate_digest,context_digest,digest,load_candidate,review_packet,rows,validate_assertions,validate_sources
from evidence_pipeline import graph,retain_decisions
from source_capture import capture_source,validate_captures

MAX_PACKET=300_000

def folder(value):
    result=(ROOT/value).resolve()
    if not result.is_relative_to((ROOT/'nemesis/batches').resolve()) or not result.is_dir():
        raise EvidenceError('batch folder required inside nemesis/batches')
    return result

def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def bounded(value):
    if len(json.dumps(value,ensure_ascii=False).encode())>MAX_PACKET:
        raise EvidenceError('Evidence packet exceeds 300 KB; select smaller sources and split the mission')
    return value

def capture(batch):
    requests=rows(batch/'source_requests.jsonl')
    if not 1<=len(requests)<=4:raise EvidenceError('Discover one to four bounded public sources per batch')
    control=batch/'.nemesis-control';sources=[]
    for request in requests:
        sid=request.get('id')
        if not isinstance(sid,str) or not sid or any(s['id']==sid for s in sources):raise EvidenceError('unique source ID required')
        # A resumed capture reuses its retained revision; it never silently fetches newer text.
        receipt=control/'captured-sources.json'
        retained=json.loads(receipt.read_text(encoding='utf-8')) if receipt.exists() else []
        source=next((s for s in retained if s['id']==sid),None)
        if source:
            if any(source[k]!=request.get(k,'unknown' if k=='source_kind' else None) for k in ('url','title','source_kind')):raise EvidenceError('source request changed; create a new batch revision')
            validate_captures({sid:source})
        else:
            source=capture_source(request['url'],sid,request['title'],request.get('source_kind','unknown'),public_only=True)
            retained.append(source);write(receipt,retained)
        sources.append(source)
    discovery=json.loads((control/'discovery.json').read_text(encoding='utf-8')) if (control/'discovery.json').exists() else {}
    ids=discovery.get('target_ids',[])
    if not isinstance(ids,list) or len(ids)>12:raise EvidenceError('At most twelve existing target_ids per mission')
    g=graph()
    value=bounded({'sources':sources,'existing_targets':[n for n in g['nodes'] if n['id'] in ids],
                   'record_catalog':[{k:n.get(k) for k in ('id','label','kind','domain')} for n in g['nodes']]})
    write(control/'author-context.json',value)
    return {'captured':len(sources)}

def packet(batch):
    candidate=load_candidate(batch);sources=validate_sources(candidate);validate_captures(sources)
    retained=json.loads((batch/'.nemesis-control/captured-sources.json').read_text(encoding='utf-8'))
    if sources!={s['id']:s for s in retained}:raise EvidenceError('candidate sources must exactly match compiler captures')
    # Bind mechanical references only. Supplied hashes/offsets are never corrected.
    # Quotes, scope, classification, target kinds and full records remain author-owned.
    original=json.loads(json.dumps(candidate['assertions.jsonl']))
    for assertion in candidate['assertions.jsonl']:
        if 'target_sha256' not in assertion:assertion['target_sha256']=digest(assertion['canonical_record'])
        for span in assertion.get('support',[]):
            source=sources.get(span.get('source_id'))
            if source is None:raise EvidenceError('support source ID was not captured')
            if 'source_sha256' not in span:span['source_sha256']=source['sha256']
            if 'start' not in span and 'end' not in span:
                quote=span.get('quote');text=source['text']
                if not isinstance(quote,str) or not quote or text.count(quote)!=1:raise EvidenceError('Quote needs one exact location or explicit start/end offsets')
                span['start']=text.index(quote);span['end']=span['start']+len(quote)
    validate_assertions(candidate)
    for filename,kind in (('nodes.jsonl','node'),('edges.jsonl','edge'),('reviews.jsonl','review'),('taxonomy.jsonl','taxonomy'),('identities.jsonl','identity')):
        for record in candidate[filename]:
            if not any(a.get('target_kind')==kind and a.get('target_sha256')==digest(record) and a.get('canonical_record')==record for a in candidate['assertions.jsonl']):
                raise EvidenceError('Every target needs an exact complete representation assertion before review')
    targets=sum(len(candidate[k]) for k in ('nodes.jsonl','edges.jsonl','reviews.jsonl','taxonomy.jsonl','identities.jsonl'))
    if not 1<=targets<=12:raise EvidenceError('Use one to twelve fully supported targets per review packet')
    value=bounded(review_packet(candidate,graph()))
    if original!=candidate['assertions.jsonl']:
        write(batch/'.nemesis-control/unbound-assertions.json',original)
        (batch/'assertions.jsonl').write_text(''.join(json.dumps(a,ensure_ascii=False)+'\n' for a in candidate['assertions.jsonl']),encoding='utf-8')
    write(batch/'.nemesis-control/packet.json',value)
    return {'candidate_sha256':value['candidate_sha256'],'context_sha256':value['context_sha256'],'targets':targets}

def review(batch):
    control=json.loads((batch/'.nemesis-control/review-input.json').read_text(encoding='utf-8'))
    candidate=load_candidate(batch)
    if candidate_digest(candidate)!=control['candidate_sha256'] or context_digest(candidate,graph())!=control['context_sha256']:
        raise EvidenceError('Candidate or endpoint revision changed after review dispatch')
    return retain_decisions(candidate,control['decisions'],control['reviewer'],control['model'],control['role'])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('batch_dir')
    modes=parser.add_mutually_exclusive_group(required=True)
    for mode in ('capture','packet','review'):modes.add_argument('--'+mode,action='store_true')
    args=parser.parse_args();batch=folder(args.batch_dir)
    try:result=capture(batch) if args.capture else packet(batch) if args.packet else review(batch)
    except (EvidenceError,ValueError,KeyError,OSError) as exc:
        print(json.dumps({'ok':False,'error':str(exc)}));return 2
    print(json.dumps({'ok':True,**result}));return 0

if __name__=='__main__':raise SystemExit(main())
