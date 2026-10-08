"""Bounded synthetic engineering data; never canonical research or real model calls."""
from __future__ import annotations
import argparse,hashlib,json,sqlite3,sys,tempfile,time,tracemalloc
from pathlib import Path
from graph_retrieval import FORMAT,Snapshot,build
from research_integrity import canonical,strict_json

def process_memory():
    """Observed OS memory; explicitly name cumulative process high-water scope."""
    try:
        if sys.platform=='win32':
            import ctypes
            class Counters(ctypes.Structure):
                _fields_=[('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong)]+[(k,ctypes.c_size_t) for k in ('PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage')]
            value=Counters();value.cb=ctypes.sizeof(value)
            kernel=ctypes.WinDLL('kernel32');kernel.GetCurrentProcess.restype=ctypes.c_void_p
            api=ctypes.WinDLL('psapi').GetProcessMemoryInfo;api.argtypes=[ctypes.c_void_p,ctypes.POINTER(Counters),ctypes.c_ulong];api.restype=ctypes.c_int
            if not api(kernel.GetCurrentProcess(),ctypes.byref(value),value.cb):return {'status':'UNAVAILABLE'}
            return {'status':'MEASURED','working_set_bytes':value.WorkingSetSize,'process_peak_working_set_so_far_bytes':value.PeakWorkingSetSize}
        import resource
        peak=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return {'status':'MEASURED','process_peak_working_set_so_far_bytes':peak if sys.platform=='darwin' else peak*1024}
    except (ImportError,OSError,AttributeError):return {'status':'UNAVAILABLE'}

def synthetic(counts):
    for kind,count in counts.items():
        for i in range(count):
            key=f'engineering-synthetic-{kind}-{i:09d}'
            row={'id':key,'synthetic':True,'label':'Representative engineering fixture '+str(i),
                'domain':'physical' if i%2 else 'life','summary':'Scoped representative metadata; not a scientific finding. '+('x'*256)}
            if kind=='edges':row.update(source=f'engineering-synthetic-nodes-{i:09d}',target=f'engineering-synthetic-nodes-{i+1:09d}',type='fixture')
            if kind=='sources':row.update(url='https://example.invalid/synthetic',sha256=hashlib.sha256(key.encode()).hexdigest(),capture_id=hashlib.sha256(('capture'+key).encode()).hexdigest())
            if kind=='jobs':row.update(status='COMPLETE',intent_sha256=hashlib.sha256(key.encode()).hexdigest(),goal='engineering fixture '*20)
            if kind=='history':row.update(candidate_sha256=hashlib.sha256(key.encode()).hexdigest(),roles=['entailment','adversarial'],synthetic_review=True)
            yield kind,key,row

def measure(counts,*,max_records=250000):
    total=sum(counts.values())
    if total>max_records:return {'status':'NOT_MEASURED_RESOURCE_BOUND','requested_counts':counts,'max_records':max_records}
    with tempfile.TemporaryDirectory(prefix='fog-capacity-engineering-') as directory:
        tracemalloc.start();t=time.perf_counter()
        path,info=build(directory,synthetic(counts),origin={'synthetic':True,'fixture':'representative-metadata/1'})
        build_seconds=time.perf_counter()-t;t=time.perf_counter();s=Snapshot(path);open_seconds=time.perf_counter()-t
        t=time.perf_counter();page=s.page(kind='nodes',domain='physical',limit=100);query_seconds=time.perf_counter()-t
        out_bytes=len(canonical(page));s.close();current,peak=tracemalloc.get_traced_memory();tracemalloc.stop()
        database_bytes=path.stat().st_size
        # Measure actual full serialization bytes/time through a generator, without a model invocation or giant in-memory JSON array.
        t=time.perf_counter();full_bytes=2
        for _,_,row in synthetic(counts):full_bytes+=len(canonical(row))+1
        serialization_seconds=time.perf_counter()-t
        return {'status':'MEASURED','synthetic':True,'counts':counts,'records':total,'database_bytes':database_bytes,'build_seconds':build_seconds,
            'verified_open_seconds':open_seconds,'indexed_query_seconds':query_seconds,'query_returned':page['data']['returned'],'query_matched':page['data']['matched'],
            'query_envelope_bytes':out_bytes,'whole_metadata_serialization_bytes':full_bytes,'serialization_seconds':serialization_seconds,
            'python_allocated_peak_bytes':peak,'os_memory':process_memory(),'memory_scope':'Python allocation peak plus observed OS process working set/high-water so far; does not multiply real PDF/source corpora or measure total system cache',
            'context_token_estimate':{'method':'bytes/4 rough planning estimate; not tokenizer/provider billing','whole_metadata':full_bytes/4,'one_query_page':out_bytes/4},
            'actual_model_calls':0,'actual_model_cost':0,'snapshot':info['snapshot']}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--graph',type=Path,required=True);p.add_argument('--jobs',type=int,required=True);p.add_argument('--report',type=Path,required=True)
    p.add_argument('--multipliers',type=int,nargs='+',default=[10,100]);p.add_argument('--max-records',type=int,default=250000)
    args=p.parse_args();graph_bytes=args.graph.read_bytes();g=strict_json(graph_bytes)
    identity={name:hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in ('measure_future_capacity.py','graph_retrieval.py','research_integrity.py')}
    from nemesis_context import merge_runtime_ologies
    merge_runtime_ologies(g)
    baseline={'nodes':len(g['nodes']),'edges':len(g['edges']),'sources':sum(len(b.get('sources',[])) for b in g.get('evidence_reviews',[])),
        'jobs':args.jobs,'history':sum(len(b.get('assertions',[]))+len(b.get('decisions',[])) for b in g.get('evidence_reviews',[]))}
    if args.jobs<0 or any(m<=0 for m in args.multipliers) or args.max_records<0:raise ValueError('Positive bounded workload required')
    results=[]
    for multiplier in args.multipliers:
        print('Measuring synthetic '+str(multiplier)+'x',flush=True)
        results.append({'multiplier':multiplier,**measure({k:n*multiplier for k,n in baseline.items()},max_records=args.max_records)})
    measured=[r for r in results if r['status']=='MEASURED']
    projection=None
    if measured:
        largest=max(measured,key=lambda r:r['multiplier']);factor=1000/largest['multiplier']
        projection={'multiplier':1000,'status':'ESTIMATE_NOT_TESTED','basis_multiplier':largest['multiplier'],
            'database_bytes_linear_estimate':largest['database_bytes']*factor,'whole_metadata_bytes_linear_estimate':largest['whole_metadata_serialization_bytes']*factor,
            'build_seconds_linear_estimate':largest['build_seconds']*factor,'limitations':'Index sorting/cache/I/O/model attention do not necessarily scale linearly. Full paper text/PDFs and network/provider limits were not multiplied.'}
    if any(hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()!=sha for name,sha in identity.items()):
        raise ValueError('Implementation changed during measurement; results are not a frozen-build capacity proof')
    result={'protocol':'nemesis-capacity-measurement/1','measured_at':time.time(),'implementation_sha256':identity,'snapshot_protocol':FORMAT,'input_graph_sha256':hashlib.sha256(graph_bytes).hexdigest(),'baseline_counts':baseline,'workload':'Synthetic representative metadata for nodes, edges, sources, jobs and evidence history; no scientific records or model calls',
        'bounds':{'max_records_per_case':args.max_records,'multipliers':args.multipliers},'measurements':results,'projection':projection}
    args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
