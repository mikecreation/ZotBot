"""Derived immutable SQLite snapshots; complete logical access in bounded pages.

Canonical graph/captures stay authoritative. No summaries, rankings, adjudications,
scientific merges or worker dispatch occur here.
"""
from __future__ import annotations
import base64,hashlib,json,os,sqlite3,tempfile
from pathlib import Path
from research_integrity import IntegrityError,canonical,digest,manifest,strict_json,verify

KINDS={'nodes','edges','reviews','taxonomy','identities','evidence_reviews','sources','catalog','jobs','history'}
FORMAT='fog-query-snapshot/3'

def snapshot_identity(content,origin):
    return digest({'protocol':FORMAT,'content_sha256':content,'origin':origin})

def records_from_graph(graph):
    for kind in ('nodes','edges','reviews','taxonomy','identities'):
        for index,row in enumerate(graph.get(kind,[])):
            yield kind,(row['id'] if kind=='nodes' else f'{digest(row)}:{index:012d}'),row
    for index,bundle in enumerate(graph.get('evidence_reviews',[])):
        components=('assertions','decisions','context_nodes','sources')
        bid=bundle['batch_id']
        yield 'evidence_reviews',f'{index:012d}',{'batch_id':bid,'representation':'bundle-manifest; exact components in history/sources',
            'remaining_fields':{k:v for k,v in bundle.items() if k not in components},
            'counts':{k:len(bundle.get(k,[])) for k in components},'component_sha256':{k:digest(bundle.get(k,[])) for k in components},
            'canonical_bundle_sha256':digest(bundle)}, {'bundle_id':bid}
        for component in ('assertions','decisions','context_nodes'):
            for position,row in enumerate(bundle.get(component,[])):
                yield 'history',f'{index:012d}:{component}:{position:012d}',row,{'bundle_id':bid,'component':component}
        for position,source in enumerate(bundle.get('sources',[])):
            yield 'sources',f'{index:012d}:{position:012d}:{source["capture_id"]}',source,{'bundle_id':bid,'component':'sources'}
    yield 'catalog','graph-metadata',{k:v for k,v in graph.items() if k not in ('nodes','edges','reviews','taxonomy','identities','evidence_reviews')}

def _content(connection):
    h=hashlib.sha256();counts={}
    for kind,key,payload,sha,domain,source,target,capture,record_id,bundle,links_raw in connection.execute('SELECT kind,id,payload,sha,domain,source,target,capture,record_id,bundle,links FROM records ORDER BY kind,id'):
        value=strict_json(payload)
        links=strict_json(links_raw)
        if digest(value)!=sha or (domain,source,target,capture,record_id,bundle)!=tuple(value.get(k) for k in ('domain','source','target','capture_id','id'))+(links.get('bundle_id'),):
            raise IntegrityError('Indexed record or filter columns altered: '+kind+'/'+key)
        h.update(canonical([kind,key,value,links])+b'\n');counts[kind]=counts.get(kind,0)+1
    return h.hexdigest(),counts

def _bundles(connection):
    for (raw,) in connection.execute('SELECT payload FROM records WHERE kind=?',('evidence_reviews',)):
        bundle=strict_json(raw)
        if bundle.get('representation')!='bundle-manifest; exact components in history/sources':continue
        for component,expected in bundle['counts'].items():
            h=hashlib.sha256();h.update(b'[');count=0
            for (payload,) in connection.execute('SELECT payload FROM records WHERE bundle=? AND json_extract(links,?)=? ORDER BY id',(bundle['batch_id'],'$.component',component)):
                if count:h.update(b',')
                h.update(canonical(strict_json(payload)));count+=1
            h.update(b']')
            if count!=expected or h.hexdigest()!=bundle['component_sha256'][component]:raise IntegrityError('Evidence bundle component omitted or changed: '+bundle['batch_id']+'/'+component)

def build(directory,records,*,origin,fail_after=None):
    """Transactional staging: interrupted builds never replace a valid snapshot."""
    directory=Path(directory).resolve();directory.mkdir(parents=True,exist_ok=True)
    fd,name=tempfile.mkstemp(prefix='building-',suffix='.sqlite',dir=directory);os.close(fd)
    temporary=Path(name);db=sqlite3.connect(temporary)
    try:
        db.executescript('CREATE TABLE records(kind TEXT,id TEXT,payload TEXT,sha TEXT,domain TEXT,source TEXT,target TEXT,capture TEXT,record_id TEXT,bundle TEXT,links TEXT,PRIMARY KEY(kind,id)); CREATE INDEX domain_idx ON records(kind,domain,id); CREATE INDEX source_idx ON records(kind,source,id); CREATE INDEX target_idx ON records(kind,target,id); CREATE INDEX capture_idx ON records(kind,capture,id); CREATE INDEX identity_idx ON records(kind,record_id,id); CREATE INDEX bundle_idx ON records(bundle,id); CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);')
        with db:
            for i,entry in enumerate(records):
                kind,key,row=entry[:3];links=entry[3] if len(entry)==4 else {}
                if kind not in KINDS or not isinstance(key,str) or not key or not isinstance(row,dict):raise IntegrityError('Invalid indexed record')
                if not isinstance(links,dict) or set(links)-{'bundle_id','component'} or any(not isinstance(v,str) for v in links.values()):raise IntegrityError('Explicit mechanical component links required')
                raw=canonical(row).decode('utf8')
                db.execute('INSERT INTO records VALUES(?,?,?,?,?,?,?,?,?,?,?)',(kind,key,raw,digest(row),row.get('domain'),row.get('source'),row.get('target'),row.get('capture_id'),row.get('id'),links.get('bundle_id'),canonical(links).decode('utf8')))
                if fail_after is not None and i>=fail_after:raise IntegrityError('Injected interrupted index build')
            content,counts=_content(db)
            snapshot=snapshot_identity(content,origin)
            _bundles(db)
            info={'protocol':FORMAT,'snapshot':snapshot,'origin':origin,'counts':counts,'total_records':sum(counts.values())}
            db.execute('INSERT INTO metadata VALUES(?,?)',('manifest',canonical(info).decode('utf8')))
        db.close()
        target=directory/(snapshot+'.sqlite')
        if target.exists():
            # Never overwrite a concurrently installed immutable snapshot.
            existing=Snapshot(target);info=existing.info;existing.close();temporary.unlink()
        else:
            # Hard-link publication is atomic and refuses an existing name.
            try:os.link(temporary,target)
            except FileExistsError:
                existing=Snapshot(target);info=existing.info;existing.close()
            temporary.unlink()
        return target,info
    except Exception:
        db.close()
        if temporary.exists():temporary.unlink()
        raise

class Snapshot:
    def __init__(self,path):
        self.path=Path(path).resolve()
        self.db=sqlite3.connect(self.path.as_uri()+'?mode=ro',uri=True)
        self.db.execute('PRAGMA query_only=ON')
        self.info=strict_json(self.db.execute('SELECT value FROM metadata WHERE key=?',('manifest',)).fetchone()[0])
        if self.info.get('protocol')!=FORMAT or self.path.stem!=self.info.get('snapshot'):
            self.close();raise IntegrityError('Snapshot filename/manifest mismatch')
        try:self.audit()
        except Exception:self.close();raise
    def close(self):self.db.close()
    def audit(self):
        content,counts=_content(self.db)
        snapshot=snapshot_identity(content,self.info['origin'])
        if snapshot!=self.info['snapshot'] or counts!=self.info['counts'] or sum(counts.values())!=self.info['total_records']:
            raise IntegrityError('Snapshot content/count commitment mismatch')
        _bundles(self.db)
        return self.info
    def page(self,*,kind,domain=None,ids=None,incident=None,batch=None,limit=100,cursor=None,max_bytes=100000):
        if kind not in KINDS or type(limit) is not int or not 1<=limit<=500 or type(max_bytes) is not int or max_bytes<1024:
            raise IntegrityError('Invalid bounded query capacity')
        if ids is not None and (not isinstance(ids,list) or len(ids)>500 or any(not isinstance(i,str) for i in ids)):
            raise IntegrityError('Exact ID list required, at most 500 per query')
        if domain is not None and not isinstance(domain,str) or incident is not None and not isinstance(incident,str) or batch is not None and not isinstance(batch,str):raise IntegrityError('Exact filter strings required')
        scope={'kind':kind,'domain':domain,'ids':sorted(set(ids)) if ids is not None else None,'incident':incident,'batch':batch}
        query=digest(scope);last=''
        if cursor:
            try:prior=strict_json(base64.b64decode(cursor.encode('ascii'),altchars=b'-_',validate=True))
            except Exception as exc:raise IntegrityError('Invalid continuation cursor') from exc
            body={k:v for k,v in prior.items() if k!='integrity'}
            if prior.get('integrity')!=digest(body) or prior.get('snapshot')!=self.info['snapshot'] or prior.get('query')!=query or not isinstance(prior.get('last'),str):
                raise IntegrityError('Cursor belongs to another snapshot/query')
            last=prior['last']
            if not self.db.execute('SELECT 1 FROM records WHERE kind=? AND id=?',(kind,last)).fetchone():raise IntegrityError('Cursor record missing')
        clauses=['kind=?'];args=[kind]
        if domain is not None:clauses.append('domain=?');args.append(domain)
        if ids is not None:
            clauses.append('record_id IN ('+','.join('?' for _ in ids)+')' if ids else '0');args.extend(ids)
        if incident is not None:clauses.append('(source=? OR target=?)');args.extend([incident,incident])
        if batch is not None:clauses.append('bundle=?');args.append(batch)
        where=' AND '.join(clauses)
        total=self.db.execute('SELECT count(*) FROM records WHERE '+where,args).fetchone()[0]
        rows=self.db.execute('SELECT id,payload,sha,links FROM records WHERE '+where+' AND id>? ORDER BY id LIMIT ?',args+[last,limit+1]).fetchall()
        chosen=[]
        for key,raw,sha,links in rows[:limit]:
            row=strict_json(raw)
            if digest(row)!=sha:raise IntegrityError('Retrieved record hash mismatch')
            proposed=chosen+[{'key':key,'record':row,'links':strict_json(links)}]
            if len(canonical(proposed))>max_bytes-2000:
                if not chosen:raise IntegrityError('Atomic record exceeds query capacity; request an explicit field/source scope')
                break
            chosen=proposed
        more=len(rows)>len(chosen)
        nxt=None
        if more and chosen:
            token={'snapshot':self.info['snapshot'],'query':query,'last':chosen[-1]['key']}
            nxt=base64.urlsafe_b64encode(canonical(token|{'integrity':digest(token)})).decode('ascii')
        data={'snapshot':self.info['snapshot'],'origin':self.info['origin'],'scope':scope,'after_key':last,'matched':total,'returned':len(chosen),'records':chosen,
            'continuation':nxt,'complete_query':cursor is None and not more,'page_complete':True,
            'unseen_matching_records':self.db.execute('SELECT count(*) FROM records WHERE '+where+' AND id>?',args+[chosen[-1]['key'] if chosen else last]).fetchone()[0]}
        proof=manifest(data,boundary='graph-query',snapshot=self.info['snapshot'],scope=scope,counts={'returned':len(chosen),'matched':total},complete=data['complete_query'])
        envelope={'manifest':proof,'data':data}
        if len(canonical(envelope))>max_bytes:raise IntegrityError('Query envelope exceeds capacity; original scope and cursor remain resumable')
        return envelope

    def pages(self,**query):
        """Verified O(1)-memory traversal; never treat a partial walk as complete."""
        if query.get('cursor'):raise IntegrityError('Complete traversal must begin at the first page')
        cursor=None;after='';count=0;total=None
        while True:
            envelope=self.page(**(query|{'cursor':cursor}))
            data=verify_page(envelope,snapshot=self.info['snapshot'],scope=envelope['data']['scope'])
            if data['after_key']!=after or total is not None and data['matched']!=total:raise IntegrityError('Page traversal discontinuity')
            total=data['matched'];keys=[r['key'] for r in data['records']]
            if keys!=sorted(set(keys)) or keys and keys[0]<=after:raise IntegrityError('Duplicate or reordered query records')
            count+=len(keys)
            if data['continuation'] is None and count!=total:raise IntegrityError('Completed traversal omitted matching records')
            yield envelope
            if data['continuation'] is None:return
            if not keys:raise IntegrityError('Empty continuation cannot progress')
            after=keys[-1];cursor=data['continuation']

    def evidence(self,root,capture_id,*,start=0,end=None,max_bytes=50000):
        if not isinstance(capture_id,str) or len(capture_id)!=64 or any(c not in '0123456789abcdef' for c in capture_id):raise IntegrityError('Exact capture hash required')
        expected=[strict_json(raw) for (raw,) in self.db.execute('SELECT payload FROM records WHERE kind=? AND capture=?',('sources',capture_id))]
        if not expected:raise IntegrityError('Capture is absent from this snapshot')
        path=Path(root).resolve()/'data/evidence/captures'/(capture_id+'.json')
        source=strict_json(path.read_bytes());text=source.get('text')
        if not isinstance(text,str) or digest({k:v for k,v in source.items() if k!='capture_id'})!=capture_id:
            raise IntegrityError('Retained capture changed')
        if hashlib.sha256(text.encode('utf8')).hexdigest()!=source.get('sha256') or any({k:v for k,v in source.items() if k!='text'}!=r for r in expected):
            raise IntegrityError('Capture metadata/text differs from snapshot')
        if end is None:end=len(text)
        if type(start) is not int or type(end) is not int or not 0<=start<=end<=len(text):raise IntegrityError('Exact valid character offsets required')
        scope={'capture_id':capture_id,'start':start,'end':end,'offset_unit':'unicode-characters'}
        data={'scope':scope,'source_sha256':source['sha256'],'total_characters':len(text),'total_utf8_bytes':len(text.encode('utf8')),
            'text':text[start:end],'complete_source':start==0 and end==len(text),'next_start':end if end<len(text) else None,
            'source_metadata':{k:v for k,v in source.items() if k!='text'}}
        proof=manifest(data,boundary='evidence-query',snapshot=self.info['snapshot'],scope=scope,
            counts={'characters':end-start},complete=data['complete_source'])
        envelope={'manifest':proof,'data':data}
        if len(canonical(envelope))>max_bytes:raise IntegrityError('Requested evidence segment exceeds capacity; request smaller exact offsets')
        return envelope

def verify_page(envelope,*,snapshot,scope):
    data=envelope['data']
    if data.get('snapshot')!=snapshot or data.get('scope')!=scope or data.get('returned')!=len(data.get('records',[])):
        raise IntegrityError('Query scope/count mismatch')
    if type(data.get('matched')) is not int or data['matched']<data['returned'] or type(data.get('complete_query')) is not bool or data.get('page_complete') is not True:
        raise IntegrityError('Invalid query completeness')
    if data['complete_query'] and (data['continuation'] is not None or data['matched']!=data['returned']):raise IntegrityError('Partial query declared complete')
    verify(data,envelope['manifest'],boundary='graph-query',snapshot=snapshot,scope=scope,
        counts={'returned':len(data['records']),'matched':data['matched']},complete=data['complete_query'])
    return data
