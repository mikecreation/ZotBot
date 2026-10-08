"""Pinned sequential JSONL reader; one audited snapshot reused across queries."""
import hashlib,json,sqlite3,sys
from pathlib import Path
from graph_retrieval import Snapshot,build,records_from_graph
from research_integrity import IntegrityError,canonical,manifest,strict_json

PROTOCOL='fog-retrieval-service/1'
MAX_REQUEST=100000
MAX_REPLY=98000

class Reader:
    def __init__(self,root,cache):
        from nemesis_context import merge_runtime_ologies,build_context
        self.root=Path(root).resolve()
        raw=(self.root/'data/knowledge.json').read_bytes();graph=strict_json(raw)
        merge_runtime_ologies(graph)
        context=build_context(graph,0)
        path,info=build(cache,records_from_graph(graph),origin={
            'knowledge_sha256':hashlib.sha256(raw).hexdigest(),
            'ology_registry_sha256':hashlib.sha256((self.root/'data/ologies.tsv').read_bytes()).hexdigest()})
        self.snapshot=Snapshot(path)
        self.catalog={'protocol':PROTOCOL,'snapshot':info['snapshot'],'origin':info['origin'],
            'counts':info['counts'],'coverage_by_domain':context['coverage_by_domain'],
            'eligible_branches':sum(n['kind'] in {'field','subfield','concept','method','theory','model','law','question','technology'} for n in graph['nodes']),
            'complete_graph_in_prompt':False,'access':'Every indexed record is available through exact paginated queries; catalog is not the graph.'}
    def close(self):self.snapshot.close()
    def execute(self,request):
        if not isinstance(request,dict) or request.get('snapshot')!=self.catalog['snapshot']:
            raise IntegrityError('Pin the exact reader snapshot')
        operation=request.get('operation');query=request.get('query',{})
        if not isinstance(query,dict):raise IntegrityError('Typed query object required')
        if operation=='catalog':
            if query:raise IntegrityError('Catalog has no query arguments')
            data=self.catalog;scope={'representation':'complete catalog; graph records accessed separately'}
            return {'manifest':manifest(data,boundary='retrieval-catalog',snapshot=data['snapshot'],scope=scope,counts=data['counts'],complete=False),'data':data}
        if operation=='query':
            allowed={'kind','domain','ids','incident','batch','limit','cursor','max_bytes'}
            if set(query)-allowed:raise IntegrityError('Unknown graph query argument')
            query=dict(query);query['max_bytes']=min(query.get('max_bytes',MAX_REPLY),MAX_REPLY)
            return self.snapshot.page(**query)
        if operation=='evidence':
            if set(query)-{'capture_id','start','end','max_bytes'}:raise IntegrityError('Unknown evidence query argument')
            query=dict(query);query['max_bytes']=min(query.get('max_bytes',MAX_REPLY),MAX_REPLY)
            return self.snapshot.evidence(self.root,**query)
        raise IntegrityError('Unknown read-only operation')

def serve(root,cache):
    reader=Reader(root,cache)
    def emit(value):
        raw=canonical(value)
        if len(raw)>MAX_REPLY:raise IntegrityError('Reply exceeds declared transport capacity; no clipping')
        sys.stdout.buffer.write(raw+b'\n');sys.stdout.buffer.flush()
    try:
        emit({'protocol':PROTOCOL,'ready':reader.catalog})
        while True:
            raw=sys.stdin.buffer.readline(MAX_REQUEST+1)
            if not raw:return 0
            if len(raw)>MAX_REQUEST or not raw.endswith(b'\n'):
                emit({'protocol':PROTOCOL,'status':'blocked','complete':False,'error':'Request exceeds frame capacity'});return 2
            try:emit({'protocol':PROTOCOL,'response':reader.execute(strict_json(raw))})
            except (IntegrityError,ValueError,TypeError,KeyError,OSError,sqlite3.Error) as exc:
                emit({'protocol':PROTOCOL,'status':'blocked','complete':False,'error':str(exc)})
    finally:reader.close()
