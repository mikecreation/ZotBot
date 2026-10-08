"""Exact graph retrieval CLI. Never dispatches workers or edits scientific records."""
import argparse,hashlib,json,sqlite3,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from graph_retrieval import Snapshot,build,records_from_graph
from research_integrity import IntegrityError,strict_json
ROOT=Path(__file__).resolve().parents[1]

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('operation',choices=['build','catalog','query','evidence','serve'])
    p.add_argument('--cache',type=Path,default=ROOT/'.nemesis-query-cache')
    p.add_argument('--snapshot',type=Path)
    p.add_argument('--kind',default='nodes');p.add_argument('--domain');p.add_argument('--ids',nargs='*');p.add_argument('--incident');p.add_argument('--batch')
    p.add_argument('--limit',type=int,default=100);p.add_argument('--cursor');p.add_argument('--max-bytes',type=int,default=100000)
    p.add_argument('--capture-id');p.add_argument('--start',type=int,default=0);p.add_argument('--end',type=int)
    args=p.parse_args()
    if args.operation=='serve':
        from retrieval_service import serve
        return serve(ROOT,args.cache)
    if args.operation=='build':
        from nemesis_context import merge_runtime_ologies
        raw=(ROOT/'data/knowledge.json').read_bytes();g=strict_json(raw);merge_runtime_ologies(g)
        registry=(ROOT/'data/ologies.tsv').read_bytes()
        target,info=build(args.cache,records_from_graph(g),origin={'knowledge_sha256':hashlib.sha256(raw).hexdigest(),'ology_registry_sha256':hashlib.sha256(registry).hexdigest()})
        result={'path':str(target),'manifest':info}
    else:
        if args.snapshot is None:raise IntegrityError('Pin an explicit snapshot returned by build')
        snapshot=Snapshot(args.snapshot)
        try:
            if args.operation=='catalog':result=snapshot.info
            elif args.operation=='query':result=snapshot.page(kind=args.kind,domain=args.domain,ids=args.ids,incident=args.incident,batch=args.batch,limit=args.limit,cursor=args.cursor,max_bytes=args.max_bytes)
            else:result=snapshot.evidence(ROOT,args.capture_id,start=args.start,end=args.end,max_bytes=args.max_bytes)
        finally:snapshot.close()
    print(json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False))
    return 0

if __name__=='__main__':
    try:raise SystemExit(main())
    except (IntegrityError,OSError,ValueError,sqlite3.Error) as exc:
        print(json.dumps({'status':'blocked','error':str(exc),'complete':False},ensure_ascii=False));raise SystemExit(2)
