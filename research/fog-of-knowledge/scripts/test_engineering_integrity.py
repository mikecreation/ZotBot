"""Synthetic fault injection only. No canonical data or production database writes."""
import base64,copy,hashlib,json,sqlite3,subprocess,sys,tempfile,unittest
from pathlib import Path
from research_integrity import IntegrityError,canonical,context_proof,digest,manifest,strict_json,verify,verify_context
from graph_retrieval import Snapshot,build,records_from_graph,verify_page

def records(count=7):
    for i in range(count):yield 'nodes',f'n{i:05d}',{'id':f'n{i:05d}','label':'Ω quantum state '+str(i),'domain':'physical','summary':'exact scoped record '+str(i)}

class Transfers(unittest.TestCase):
    def test_capacity_report_pins_bytes_read_before_concurrent_graph_change(self):
        import contextlib,io
        from unittest.mock import patch
        import measure_future_capacity as capacity
        with tempfile.TemporaryDirectory(prefix='fog-capacity-identity-') as folder:
            graph=Path(folder)/'synthetic.json';report=Path(folder)/'report.json'
            original=canonical({'nodes':[{'id':'original'}],'edges':[],'evidence_reviews':[]});graph.write_bytes(original)
            def simulated(counts,**kwargs):
                graph.write_bytes(canonical({'nodes':[],'edges':[],'evidence_reviews':[]}))
                return {'status':'NOT_MEASURED_RESOURCE_BOUND','requested_counts':counts}
            with patch.object(sys,'argv',['capacity','--graph',str(graph),'--jobs','1','--report',str(report)]),patch.object(capacity,'measure',simulated),patch('nemesis_context.merge_runtime_ologies',lambda g:None),contextlib.redirect_stdout(io.StringIO()):
                capacity.main()
            result=strict_json(report.read_bytes())
            self.assertEqual(result['input_graph_sha256'],hashlib.sha256(original).hexdigest())
            self.assertEqual(result['baseline_counts']['nodes'],1)
            self.assertIsNone(result['projection'])

    def test_changed_truncated_utf8_and_wrong_snapshot(self):
        value={'nodes':[{'id':'a','text':'λ '+('x'*500000)}]}
        args=dict(boundary='test',snapshot='v1',scope={'nodes':'complete'},counts={'nodes':1},complete=True)
        proof=manifest(value,**args);self.assertTrue(verify(value,proof,**args))
        changed=copy.deepcopy(value);changed['nodes'][0]['text']=changed['nodes'][0]['text'][:400000]
        with self.assertRaises(IntegrityError):verify(changed,proof,**args)
        with self.assertRaises(IntegrityError):verify(value,proof,**(args|{'snapshot':'v2'}))
        with self.assertRaises(IntegrityError):strict_json(b'{"text":"\xff"}')
        with self.assertRaises(IntegrityError):strict_json('{"text":"valid JSON in wrong encoding"}'.encode('utf16'))
    def test_duplicate_keys_nonfinite_and_declared_scope(self):
        for raw in ('{"nodes":[],"nodes":[1]}','{"n":NaN}','{"n":Infinity}'):
            with self.assertRaises(IntegrityError):strict_json(raw)
        value={'records':[1]};args=dict(boundary='test',snapshot='v1',scope={'offset':5},counts={'records':1},complete=False)
        proof=manifest(value,**args)
        with self.assertRaises(IntegrityError):verify(value,proof,**(args|{'complete':True}))
        with self.assertRaises(IntegrityError):verify(value,proof,**(args|{'counts':{'records':2}}))
    def test_context_identity_not_just_matching_count(self):
        packet={'planning_graph':{'nodes':[{'id':'a'}],'edges':[],'reviews':[]},'coverage_inventory':[{'id':'a'}],'counts':{'nodes':1,'edges':0,'reviews':0}}
        packet['integrity']=context_proof(packet);verify_context(packet)
        changed=copy.deepcopy(packet);changed['coverage_inventory']=[{'id':'b'}]
        with self.assertRaises(IntegrityError):verify_context(changed)
        changed=copy.deepcopy(packet);changed['counts']['nodes']=True
        with self.assertRaises(IntegrityError):verify_context(changed)
    def test_diagnostic_redaction_cannot_be_machine_transform(self):
        value={'quote':'public fixture ghp_'+'a'*36};args=dict(boundary='test',snapshot='v1',scope={'quote':'exact'},counts={'quotes':1},complete=True)
        proof=manifest(value,**args)
        with self.assertRaises(IntegrityError):verify({'quote':'public fixture [redacted]'},proof,**args)

class Retrieval(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory(prefix='fog-engineering-test-');self.directory=Path(self.tmp.name);self.path,self.info=build(self.directory,records(),origin={'fixture':True})
    def tearDown(self):self.tmp.cleanup()
    def test_complete_cursor_walk_no_omission_or_nonsense_labels(self):
        snapshot=Snapshot(self.path);cursor=None;all_records=[]
        try:
            while True:
                envelope=snapshot.page(kind='nodes',domain='physical',limit=2,cursor=cursor)
                value=verify_page(envelope,snapshot=self.info['snapshot'],scope=envelope['data']['scope'])
                self.assertEqual(value['matched'],7);all_records.extend(r['record'] for r in value['records'])
                cursor=value['continuation']
                if not cursor:break
            self.assertEqual(all_records,[r for _,_,r in records()]);self.assertFalse(value['complete_query'])
            self.assertTrue(snapshot.page(kind='nodes',limit=10)['data']['complete_query'])
        finally:snapshot.close()
    def test_cursor_snapshot_filter_and_payload_corruption(self):
        s=Snapshot(self.path);p=s.page(kind='nodes',limit=2);cursor=p['data']['continuation']
        try:
            with self.assertRaises(IntegrityError):s.page(kind='nodes',domain='physical',cursor=cursor)
            token=json.loads(base64.urlsafe_b64decode(cursor));token['last']='n00004'
            with self.assertRaises(IntegrityError):s.page(kind='nodes',cursor=base64.urlsafe_b64encode(canonical(token)).decode())
            changed=copy.deepcopy(p);changed['data']['records'].pop()
            with self.assertRaises(IntegrityError):verify_page(changed,snapshot=self.info['snapshot'],scope=p['data']['scope'])
            changed=copy.deepcopy(p);changed['data']['complete_query']=True
            with self.assertRaises(IntegrityError):verify_page(changed,snapshot=self.info['snapshot'],scope=p['data']['scope'])
        finally:s.close()
        other,info=build(self.directory,records(8),origin={});s=Snapshot(other)
        try:
            with self.assertRaises(IntegrityError):s.page(kind='nodes',cursor=cursor)
        finally:s.close()
    def test_verified_streaming_traversal_checks_final_count(self):
        s=Snapshot(self.path)
        try:
            pages=list(s.pages(kind='nodes',limit=2));self.assertEqual(sum(p['data']['returned'] for p in pages),7)
            original=s.page
            def omitted(**query):
                envelope=original(**query);data=envelope['data']
                if data['continuation'] is None:
                    data['records']=data['records'][:-1];data['returned']=len(data['records'])
                    envelope['manifest']=manifest(data,boundary='graph-query',snapshot=s.info['snapshot'],scope=data['scope'],counts={'returned':data['returned'],'matched':data['matched']},complete=data['complete_query'])
                return envelope
            s.page=omitted
            with self.assertRaises(IntegrityError):list(s.pages(kind='nodes',limit=2))
        finally:s.close()
    def test_interrupted_build_preserves_previous_and_duplicate_ids_fail(self):
        original=self.path.read_bytes()
        with self.assertRaises(IntegrityError):build(self.directory,records(10),origin={},fail_after=3)
        self.assertEqual(original,self.path.read_bytes());self.assertEqual(list(self.directory.glob('building-*')),[])
        with self.assertRaises(sqlite3.IntegrityError):build(self.directory,list(records())+list(records()),origin={})
        self.assertEqual(original,self.path.read_bytes())
    def test_database_interruption_rollback_in_child_process(self):
        target=self.directory/'crash.sqlite'
        db=sqlite3.connect(target);db.execute('CREATE TABLE intents(id TEXT PRIMARY KEY)');db.commit();db.close()
        code='import sqlite3,os,sys;c=sqlite3.connect(sys.argv[1]);c.execute("BEGIN IMMEDIATE");c.execute("INSERT INTO intents VALUES (?)",("uncommitted",));os._exit(17)'
        result=subprocess.run([sys.executable,'-c',code,str(target)],capture_output=True)
        self.assertEqual(result.returncode,17)
        db=sqlite3.connect(target)
        try:self.assertEqual(db.execute('SELECT count(*) FROM intents').fetchone()[0],0);self.assertEqual(db.execute('PRAGMA quick_check').fetchone()[0],'ok')
        finally:db.close()
    def test_corrupted_filter_column_cannot_silently_hide_node(self):
        db=sqlite3.connect(self.path);db.execute('UPDATE records SET domain=? WHERE id=?',('missing','n00001'));db.commit();db.close()
        with self.assertRaises(IntegrityError):Snapshot(self.path)
    def test_snapshot_origin_alteration_cannot_relabel_identical_content(self):
        db=sqlite3.connect(self.path)
        changed=dict(self.info);changed['origin']={'fixture':'different input identity'}
        db.execute('UPDATE metadata SET value=? WHERE key=?',(canonical(changed).decode(),'manifest'));db.commit();db.close()
        with self.assertRaises(IntegrityError):Snapshot(self.path)
    def test_oversize_atomic_record_explicit_and_incident_relations(self):
        p,_=build(self.directory,[('nodes','huge',{'id':'huge','text':'x'*200000}),('edges','e',{'source':'a','target':'b','type':'tests'})],origin={})
        s=Snapshot(p)
        try:
            with self.assertRaises(IntegrityError):s.page(kind='nodes',max_bytes=10000)
            self.assertEqual(s.page(kind='edges',incident='a')['data']['returned'],1)
            self.assertEqual(s.page(kind='edges',incident='c')['data']['returned'],0)
        finally:s.close()
    def test_exact_source_offsets_unicode_and_changed_capture(self):
        text='λΩ source evidence '*30000
        source={'id':'s','text':text,'sha256':hashlib.sha256(text.encode('utf8')).hexdigest(),'url':'https://example.org/source','title':'synthetic'}
        source['capture_id']=digest(source);metadata={k:v for k,v in source.items() if k!='text'}
        p,info=build(self.directory,[('sources','s',metadata)],origin={});s=Snapshot(p)
        folder=self.directory/'data/evidence/captures';folder.mkdir(parents=True);capture=folder/(source['capture_id']+'.json');capture.write_bytes(canonical(source))
        try:
            page=s.evidence(self.directory,source['capture_id'],start=0,end=100)
            self.assertEqual(page['data']['text'],text[:100]);self.assertFalse(page['data']['complete_source']);self.assertEqual(page['data']['next_start'],100)
            verify(page['data'],page['manifest'],boundary='evidence-query',snapshot=info['snapshot'],scope=page['data']['scope'],counts={'characters':100},complete=False)
            with self.assertRaises(IntegrityError):s.evidence(self.directory,source['capture_id'])
            source['text']='changed';capture.write_bytes(canonical(source))
            with self.assertRaises(IntegrityError):s.evidence(self.directory,source['capture_id'],end=1)
        finally:s.close()
    def test_large_bundle_components_and_source_versions_remain_complete(self):
        bundle={'batch_id':'synthetic-bundle','candidate_sha256':'c'*64,'assertions':[{'id':'a'+str(i),'exact':'x'*2000} for i in range(3)],
            'decisions':[{'id':'d'+str(i),'role':role} for i,role in enumerate(('entailment','adversarial'))],
            'context_nodes':[{'id':'existing','label':'Full retained representation'}],
            'sources':[{'id':'same-source-id','capture_id':letter*64,'sha256':letter*64,'title':'Distinct version '+letter} for letter in ('a','b')]}
        g={'nodes':[],'edges':[],'evidence_reviews':[bundle]}
        path,info=build(self.directory,records_from_graph(g),origin={'synthetic':True});s=Snapshot(path)
        try:
            manifest_row=s.page(kind='evidence_reviews',batch='synthetic-bundle')['data']['records'][0]['record']
            self.assertEqual(manifest_row['canonical_bundle_sha256'],digest(bundle))
            history=[r for p in s.pages(kind='history',batch='synthetic-bundle',limit=2) for r in p['data']['records']]
            self.assertEqual(len(history),6)
            versions=s.page(kind='sources',ids=['same-source-id'])['data']['records'];self.assertEqual(len(versions),2)
            self.assertNotEqual(versions[0]['record']['capture_id'],versions[1]['record']['capture_id'])
        finally:s.close()
        broken=list(records_from_graph(g));broken=[r for r in broken if not(r[0]=='history' and r[2].get('id')=='a1')]
        with self.assertRaises(IntegrityError):build(self.directory,broken,origin={'synthetic':True})

if __name__=='__main__':unittest.main()
