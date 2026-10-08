"""Read-only pinned graph service. Exact pages, independent receiver validation."""
import hashlib,json,queue,subprocess,sys,threading
from pathlib import Path
from .github_sandbox import materialize,sandbox_env,_NO_WINDOW,command_plan
from .durable_json import write_json

PROTOCOL='fog-retrieval-service/1'
MAX_FRAME=100000

def canonical(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf8')
def digest(value):return hashlib.sha256(canonical(value)).hexdigest()
def strict_json(raw):
    def pairs(rows):
        value={}
        for key,item in rows:
            if key in value:raise ValueError('Duplicate reader JSON key')
            value[key]=item
        return value
    def invalid(_):raise ValueError('Nonfinite reader JSON')
    return json.loads(raw.decode('utf8','strict') if isinstance(raw,bytes) else raw,object_pairs_hook=pairs,parse_constant=invalid)
def verify(envelope,snapshot):
    if not isinstance(envelope,dict) or not isinstance(envelope.get('manifest'),dict) or not isinstance(envelope.get('data'),dict):raise ValueError('Missing retrieval integrity envelope')
    proof=envelope['manifest'];data=envelope['data'];raw=canonical(data)
    if proof.get('protocol')!='nemesis-integrity/1' or proof.get('snapshot')!=snapshot or proof.get('encoding')!='canonical-json-utf8/1' or proof.get('bytes')!=len(raw) or proof.get('sha256')!=hashlib.sha256(raw).hexdigest():raise ValueError('Retrieval bytes/hash/version/snapshot mismatch')
    boundary=proof.get('boundary')
    if boundary=='graph-query':
        if type(data.get('matched')) is not int or type(data.get('returned')) is not int or type(data.get('complete_query')) is not bool or data.get('page_complete') is not True or data['matched']<len(data.get('records',[])):raise ValueError('Invalid query count/completeness types')
        expected={'returned':len(data['records']),'matched':data['matched']}
        if proof.get('counts')!=expected or data['returned']!=expected['returned'] or data['snapshot']!=snapshot or proof.get('scope')!=data['scope'] or proof.get('complete')!=data['complete_query']:raise ValueError('Graph query scope/count/completeness mismatch')
        if data['complete_query'] and (data['continuation'] is not None or data['matched']!=data['returned']):raise ValueError('Partial query declared complete')
    elif boundary=='evidence-query':
        scope=data['scope'];expected={'characters':scope['end']-scope['start']}
        if proof.get('scope')!=scope or proof.get('counts')!=expected or len(data['text'])!=expected['characters'] or proof.get('complete')!=data['complete_source']:raise ValueError('Evidence span scope/count mismatch')
    elif boundary=='retrieval-catalog':
        if proof.get('counts')!=data['counts'] or data['snapshot']!=snapshot or proof.get('complete') is not False:raise ValueError('Invalid catalog declaration')
    else:raise ValueError('Unknown retrieval boundary')
    return data

class GraphAccess:
    def __init__(self,ws,owner,repo,path,sha):
        row=ws.project_row(owner,repo,path);allowed=command_plan(row['manifest'],'graph_retrieval',row['mode'])
        if not allowed['allowed'] or allowed['script']!='scripts/nemesis_retrieve.py' or allowed['args']:
            raise ValueError('Pinned Fog must declare the read-only graph_retrieval command')
        key=hashlib.sha256((owner+'/'+repo+'/'+path+'@'+sha).encode()).hexdigest()
        self.directory=ws.cache_dir/'graph-readers'/key;self.directory.mkdir(parents=True,exist_ok=True)
        work=self.directory/'project'
        materialize(ws,owner,repo,sha,path,work)
        self.sha=sha;self.lock=threading.RLock();self.responses=queue.Queue(maxsize=2)
        self.process=subprocess.Popen([sys.executable,'-I','-B','-X','utf8','scripts/nemesis_retrieve.py','serve','--cache',str(self.directory/'snapshots')],cwd=work,
            env=sandbox_env(self.directory),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,creationflags=_NO_WINDOW)
        def read():
            try:
                while True:
                    raw=self.process.stdout.readline(MAX_FRAME+1)
                    if not raw or len(raw)>MAX_FRAME or not raw.endswith(b'\n'):raise ValueError('Reader closed or exceeded frame capacity; no scientific clipping')
                    self.responses.put(strict_json(raw))
            except Exception as exc:
                try:self.responses.put(exc,timeout=1)
                except queue.Full:pass
        threading.Thread(target=read,daemon=True).start()
        try:
            hello=self.receive()
            if hello.get('protocol')!=PROTOCOL or not isinstance(hello.get('ready'),dict):raise ValueError('Reader handshake missing')
            self.snapshot=hello['ready']['snapshot'];self.catalog=self.request({'operation':'catalog','query':{}})['data']
        except Exception:self.close();raise
    def receive(self):
        try:result=self.responses.get(timeout=120)
        except queue.Empty:raise ValueError('Reader deadline reached; exact request remains resumable')
        if isinstance(result,Exception):raise result
        return result
    def request(self,request):
        with self.lock:
            request=dict(request,snapshot=self.snapshot);raw=canonical(request)
            if len(raw)+1>MAX_FRAME:raise ValueError('Query request exceeds transport capacity; no clipping')
            try:
                self.process.stdin.write(raw+b'\n');self.process.stdin.flush();reply=self.receive()
                if reply.get('protocol')!=PROTOCOL or 'response' not in reply:raise ValueError(reply.get('error','Reader response missing'))
                envelope=reply['response'];data=verify(envelope,self.snapshot)
                expected={'query':'graph-query','catalog':'retrieval-catalog','evidence':'evidence-query'}.get(request['operation'])
                if envelope['manifest']['boundary']!=expected:raise ValueError('Reply differs from requested operation')
                query=request.get('query',{})
                if request['operation']=='query':
                    scope={'kind':query['kind'],'domain':query.get('domain'),'ids':sorted(set(query['ids'])) if query.get('ids') is not None else None,'incident':query.get('incident'),'batch':query.get('batch')}
                    if data['scope']!=scope:raise ValueError('Reply differs from exact requested query')
                if request['operation']=='evidence':
                    scope=data['scope']
                    if scope['capture_id']!=query['capture_id'] or scope['start']!=query.get('start',0) or query.get('end') is not None and scope['end']!=query['end']:raise ValueError('Reply differs from requested evidence span')
                return envelope
            except Exception:
                self.close();raise  # Ambiguous transport never contaminates the next request.
    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:self.process.kill();self.process.wait(timeout=5)
        for stream in (self.process.stdin,self.process.stdout):
            if stream:stream.close()

class GraphReaders:
    def __init__(self,ws):self.ws=ws;self.readers={};self.lock=threading.RLock()
    def get(self,owner,repo,path,sha):
        key=(owner,repo,path,sha)
        with self.lock:
            reader=self.readers.get(key)
            if reader is not None and reader.process.poll() is None:
                self.readers.pop(key);self.readers[key]=reader;return reader
            if reader is not None:reader.close()
            reader=GraphAccess(self.ws,*key);self.readers[key]=reader
            while len(self.readers)>8:
                oldest=next(iter(self.readers));self.readers.pop(oldest).close()
            return reader
