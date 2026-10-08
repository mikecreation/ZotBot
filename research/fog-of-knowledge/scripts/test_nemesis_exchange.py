"""Crew exchange regressions in disposable projects; no live research is dispatched."""
import hashlib,io,json,shutil,subprocess,sys,tempfile,unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from email.message import Message
import source_capture
from test_evidence_compiler import fixture
from evidence_compiler import ROOT,candidate_digest,digest,load_candidate
from source_capture import EvidenceError,public_url,PublicRedirects
import nemesis_evidence_exchange as exchange_api

class ExchangeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)/'fog'
        shutil.copytree(ROOT,self.root,ignore=shutil.ignore_patterns('output','.playwright-cli','__pycache__'))
        self.batch=self.root/'nemesis/batches/test-evidence';self.batch.mkdir(parents=True,exist_ok=True)
        self.c,_,self.decisions=fixture();source=self.c['sources.jsonl'][0]
        source.update(final_url=source['url'],raw_sha256=hashlib.sha256(source['text'].encode()).hexdigest(),content_type='text/plain',charset='utf-8',extraction_method='http-text/1')
        source['capture_id']=digest(source)
        raw=self.root/'data/evidence/raw';raw.mkdir(parents=True,exist_ok=True);(raw/(source['raw_sha256']+'.bin')).write_bytes(source['text'].encode())
        receipt=self.root/'data/evidence/captures';receipt.mkdir(parents=True,exist_ok=True);(receipt/(source['capture_id']+'.json')).write_text(json.dumps(source),encoding='utf-8')
        self.control=self.batch/'.nemesis-control';self.control.mkdir();(self.control/'captured-sources.json').write_text(json.dumps([source]),encoding='utf-8')
        self.save()
    def tearDown(self):self.tmp.cleanup()
    def save(self):
        for name,value in self.c.items():
            (self.batch/name).write_text(json.dumps(value) if name.endswith('.json') else ''.join(json.dumps(v)+'\n' for v in value),encoding='utf-8')
    def run_cli(self,script,*args):
        return subprocess.run([sys.executable,'-I','-B','scripts/'+script,*args],cwd=self.root,text=True,capture_output=True,timeout=30)
    def exchange(self,mode):return self.run_cli('nemesis_evidence_exchange.py','nemesis/batches/test-evidence','--'+mode)
    def packet(self):
        result=self.exchange('packet');self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        return json.loads((self.control/'packet.json').read_text(encoding='utf-8'))
    def review(self,role,packet=None):
        packet=packet or self.packet();decision=next(d for d in self.decisions if d['role']==role)
        value={'decisions':[decision],'candidate_sha256':packet['candidate_sha256'],'context_sha256':packet['context_sha256'],'role':role,'reviewer':'fixture-'+role,'model':'synthetic-fixture'}
        (self.control/'review-input.json').write_text(json.dumps(value),encoding='utf-8')
        return self.exchange('review')
    def error(self):
        result=self.exchange('packet');self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertFalse((self.control/'packet.json').exists())
        return json.loads(result.stdout)
    def test_isolated_entry_points_and_complete_gate(self):
        self.assertEqual(self.run_cli('nemesis_context.py','--compact').returncode,0)
        self.assertEqual(self.run_cli('validate.py').returncode,0)
        packet=self.packet()
        self.assertEqual(self.review('entailment',packet).returncode,0)
        self.assertNotEqual(self.run_cli('nemesis_apply.py','nemesis/batches/test-evidence','--check').returncode,0)
        self.assertEqual(self.review('adversarial',packet).returncode,0)
        for _ in range(2):
            result=self.run_cli('nemesis_apply.py','nemesis/batches/test-evidence','--apply');self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        result=self.run_cli('validate.py');self.assertEqual(result.returncode,0,result.stdout+result.stderr)
    def test_tampered_source_never_reaches_review(self):
        self.c['sources.jsonl'][0]['text']='Invented paper passage';self.c['sources.jsonl'][0]['sha256']=hashlib.sha256(b'Invented paper passage').hexdigest();self.save()
        result=self.exchange('packet');self.assertNotEqual(result.returncode,0);self.assertIn('capture',result.stdout)
    def test_empty_sources_has_actionable_capture_binding_error(self):
        self.c['sources.jsonl']=[];self.save();error=self.error()
        self.assertEqual(error['code'],'capture-binding');self.assertEqual(error['details']['missing_source_ids'],['source.test'])
    def test_incomplete_model_capture_is_rejected_with_changed_fields(self):
        del self.c['sources.jsonl'][0]['raw_sha256'];self.save();error=self.error()
        self.assertEqual(error['code'],'capture-binding');self.assertIn('raw_sha256',error['details']['changed_source_fields']['source.test'])
    def source_requests(self):
        source=self.c['sources.jsonl'][0]
        (self.batch/'source_requests.jsonl').write_text(json.dumps({k:source[k] for k in ('id','url','title','source_kind')})+'\n',encoding='utf-8')
        return source
    def test_resumed_capture_keeps_the_original_receipt_and_text(self):
        self.source_requests();before=(self.control/'captured-sources.json').read_bytes()
        result=self.exchange('capture');self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual((self.control/'captured-sources.json').read_bytes(),before)
        context=json.loads((self.control/'author-context.json').read_text(encoding='utf-8'))
        self.assertEqual(context['sources'],self.c['sources.jsonl'])

    def mixed_source_requests(self):
        source=self.c['sources.jsonl'][0]
        good={k:source[k] for k in ('id','url','title','source_kind')}
        missing={'id':'source.unavailable','url':'https://example.org/unavailable','title':'Unavailable source','source_kind':'primary'}
        (self.batch/'source_requests.jsonl').write_text(json.dumps(missing)+'\n'+json.dumps(good)+'\n',encoding='utf-8')
        return missing,good

    def capture_with_http_failure(self,status=403):
        from source_capture import validate_captures
        # Real retained receipt/raw-byte verification in this disposable project.
        with patch.object(exchange_api,'validate_captures',lambda sources:validate_captures(sources,self.root)), \
             patch.object(exchange_api,'graph',lambda:json.loads((self.root/'data/knowledge.json').read_text())), \
             patch.object(exchange_api,'capture_source',side_effect=HTTPError('https://example.org/unavailable',status,'synthetic failure',{},None)) as fetch:
            result=exchange_api.capture(self.batch)
        return result,fetch.call_count

    def test_unavailable_url_does_not_discard_usable_original_capture(self):
        missing,_=self.mixed_source_requests()
        before=(self.control/'captured-sources.json').read_bytes()
        result,calls=self.capture_with_http_failure()
        self.assertEqual(result,{'captured':1,'unavailable':1});self.assertEqual(calls,1)
        self.assertEqual((self.control/'captured-sources.json').read_bytes(),before)
        context=json.loads((self.control/'author-context.json').read_text())
        self.assertEqual(context['sources'],self.c['sources.jsonl'])
        self.assertEqual(context['source_capture_failures'][0]['request'],missing)
        self.assertNotIn(missing['id'],[s['id'] for s in context['sources']])
        resumed,calls=self.capture_with_http_failure()
        self.assertEqual(resumed,result);self.assertEqual(calls,0)
        self.packet()  # The original source-bound candidate still reaches review.

    def test_unavailable_source_can_never_support_an_assertion(self):
        missing,_=self.mixed_source_requests();self.capture_with_http_failure()
        self.c['assertions.jsonl'][0]['support'][0]['source_id']=missing['id'];self.save()
        result=self.exchange('packet');self.assertNotEqual(result.returncode,0)
        self.assertFalse((self.control/'packet.json').exists())

    def test_all_unavailable_sources_never_construct_author_context(self):
        missing,_=self.mixed_source_requests()
        (self.control/'captured-sources.json').unlink()
        (self.batch/'source_requests.jsonl').write_text(json.dumps(missing)+'\n')
        with self.assertRaises(exchange_api.ExchangeError) as caught:self.capture_with_http_failure()
        self.assertEqual(caught.exception.code,'source-unavailable')
        self.assertFalse((self.control/'author-context.json').exists())

    def test_rate_limit_and_server_error_still_retry_without_discarding_receipts(self):
        for status in (429,503):
            with self.subTest(status=status):
                self.mixed_source_requests()
                with self.assertRaises(HTTPError):self.capture_with_http_failure(status)
                self.assertFalse((self.control/'source-capture-failures.json').exists())

    def test_capture_policy_or_integrity_error_is_never_skipped(self):
        self.mixed_source_requests()
        from source_capture import validate_captures
        with patch.object(exchange_api,'validate_captures',lambda sources:validate_captures(sources,self.root)), \
             patch.object(exchange_api,'capture_source',side_effect=EvidenceError('private address or invalid capture')):
            with self.assertRaises(EvidenceError):exchange_api.capture(self.batch)
        self.assertFalse((self.control/'author-context.json').exists())

    def test_changed_unavailable_request_requires_new_source_revision(self):
        missing,good=self.mixed_source_requests();self.capture_with_http_failure()
        missing['url']='https://example.org/different-source'
        (self.batch/'source_requests.jsonl').write_text(json.dumps(missing)+'\n'+json.dumps(good)+'\n')
        with self.assertRaises(exchange_api.ExchangeError) as caught:self.capture_with_http_failure()
        self.assertEqual(caught.exception.code,'capture-integrity')

    def test_public_machine_readable_text_keeps_original_bytes_and_representation(self):
        for content_type,body in [('application/json',b'{"abstract":"Synthetic source only: measured value 2."}'),
                                  ('application/xml',b'<abstract>Synthetic source only: measured value 2.</abstract>')]:
            with self.subTest(content_type=content_type):
                headers=Message();headers['Content-Type']=content_type+'; charset=utf-8'
                class Response(io.BytesIO):
                    def geturl(self):return 'https://example.org/synthetic-api'
                response=Response(body);response.headers=headers
                with patch.object(source_capture,'ROOT',self.root),patch.object(source_capture.urllib.request,'urlopen',return_value=response):
                    retained=source_capture.capture_source('https://example.org/synthetic-api','api-fixture','Synthetic API fixture')
                self.assertEqual(retained['text'],body.decode())
                self.assertEqual(retained['extraction_method'],'http-text/1')
                source_capture.validate_captures({'api-fixture':retained},self.root)
                self.assertEqual((self.root/'data/evidence/raw'/(retained['raw_sha256']+'.bin')).read_bytes(),body)

    def test_malformed_source_acquisition_history_is_not_silently_replaced(self):
        self.mixed_source_requests()
        history=self.control/'source-capture-failures.json';history.write_text('{"fake":"history"}')
        with self.assertRaises(exchange_api.ExchangeError) as caught:self.capture_with_http_failure()
        self.assertEqual(caught.exception.code,'capture-integrity')
        self.assertEqual(history.read_text(),'{"fake":"history"}')
    def test_resumed_capture_tamper_is_integrity_failure_without_refetch(self):
        source=self.source_requests();raw=self.root/'data/evidence/raw'/(source['raw_sha256']+'.bin');raw.write_bytes(b'Tampered retained response')
        result=self.exchange('capture');self.assertNotEqual(result.returncode,0)
        self.assertEqual(json.loads(result.stdout)['code'],'capture-integrity')
        self.assertEqual(raw.read_bytes(),b'Tampered retained response')
        self.assertFalse((self.control/'author-context.json').exists())
    def test_resumed_capture_changed_request_is_integrity_failure(self):
        source=self.source_requests();request={k:source[k] for k in ('id','url','title','source_kind')};request['url']='https://example.org/a-different-source'
        (self.batch/'source_requests.jsonl').write_text(json.dumps(request)+'\n',encoding='utf-8')
        result=self.exchange('capture');self.assertNotEqual(result.returncode,0)
        self.assertEqual(json.loads(result.stdout)['code'],'capture-integrity');self.assertIn('Source request changed',result.stdout)
    def test_malformed_retained_receipt_is_integrity_failure(self):
        self.source_requests();(self.control/'captured-sources.json').write_text('{incomplete',encoding='utf-8')
        result=self.exchange('capture');self.assertNotEqual(result.returncode,0)
        self.assertEqual(json.loads(result.stdout)['code'],'capture-integrity')
    def test_malformed_retained_capture_field_is_integrity_failure(self):
        self.source_requests();source={**self.c['sources.jsonl'][0],'capture_id':None}
        (self.control/'captured-sources.json').write_text(json.dumps([source]),encoding='utf-8')
        result=self.exchange('capture');self.assertNotEqual(result.returncode,0)
        self.assertEqual(json.loads(result.stdout)['code'],'capture-integrity')
    def test_review_source_tamper_is_integrity_failure_before_retention(self):
        packet=self.packet();source=self.c['sources.jsonl'][0]
        (self.root/'data/evidence/raw'/(source['raw_sha256']+'.bin')).write_bytes(b'Tampered after dispatch')
        result=self.review('entailment',packet);self.assertNotEqual(result.returncode,0)
        self.assertEqual(json.loads(result.stdout)['code'],'capture-integrity')
        self.assertFalse((self.root/'nemesis/adjudications'/(packet['candidate_sha256']+'.json')).exists())
    def test_write_failure_is_operational_not_scientific_reauthor_feedback(self):
        output=io.StringIO()
        with patch.object(exchange_api,'folder',return_value=self.batch),patch.object(exchange_api,'packet',side_effect=PermissionError('Temporary filesystem write denial')),patch.object(sys,'argv',['exchange','test-evidence','--packet']),redirect_stdout(output):
            self.assertEqual(exchange_api.main(),2)
        self.assertEqual(json.loads(output.getvalue())['code'],'operational-io')
    def test_explicit_source_ids_fill_citation_metadata_before_hash_and_both_reviews(self):
        node=self.c['nodes.jsonl'][0];node['sources']=[{'id':'source.test'}]
        assertion=self.c['assertions.jsonl'][0];assertion.pop('target_sha256');assertion['support'][0].pop('source_sha256')
        assertion['support'][0].pop('start');assertion['support'][0].pop('end');self.save()
        original=json.loads(json.dumps(self.c));packet=self.packet();bound=load_candidate(self.batch)
        citation=bound['nodes.jsonl'][0]['sources'][0]
        self.assertEqual(citation,{'id':'source.test','url':self.c['sources.jsonl'][0]['url'],'title':self.c['sources.jsonl'][0]['title']})
        self.assertEqual(bound['nodes.jsonl'][0],bound['assertions.jsonl'][0]['canonical_record'])
        self.assertEqual(bound['assertions.jsonl'][0]['scope'],original['assertions.jsonl'][0]['scope'])
        self.assertEqual(bound['assertions.jsonl'][0]['statement'],original['assertions.jsonl'][0]['statement'])
        self.assertEqual(bound['assertions.jsonl'][0]['target_sha256'],digest(bound['nodes.jsonl'][0]))
        self.assertEqual(packet['candidate_sha256'],candidate_digest(bound))
        self.assertEqual(json.loads((self.control/'unbound-candidate.json').read_text(encoding='utf-8')),original)
        self.assertEqual(self.packet()['candidate_sha256'],packet['candidate_sha256'])
        self.assertEqual(json.loads((self.control/'unbound-candidate.json').read_text(encoding='utf-8')),original)
        for decision in self.decisions:decision['target_sha256']=digest(bound['nodes.jsonl'][0])
        self.assertEqual(self.review('entailment',packet).returncode,0);self.assertEqual(self.review('adversarial',packet).returncode,0)
        self.assertEqual(self.run_cli('nemesis_apply.py','nemesis/batches/test-evidence','--apply').returncode,0)
        self.assertEqual(self.run_cli('validate.py').returncode,0)
    def test_string_capture_id_and_single_support_object_preserve_explicit_evidence(self):
        self.c['nodes.jsonl'][0]['sources']=['source.test'];assertion=self.c['assertions.jsonl'][0]
        assertion.pop('target_sha256');assertion['support']=assertion['support'][0];self.save()
        packet=self.packet();bound=packet['records'];self.assertEqual(bound['assertions.jsonl'][0]['support'][0]['quote'],self.c['sources.jsonl'][0]['text'])
        self.assertEqual(bound['nodes.jsonl'][0]['sources'][0]['id'],'source.test')
    def test_wrong_supplied_citation_url_and_title_are_never_repaired(self):
        citation=self.c['nodes.jsonl'][0]['sources'][0]
        for field,value in (('url','[https://example.org/test-fixture](https://example.org/test-fixture)'),('title','Made-up title')):
            with self.subTest(field=field):
                before=dict(citation);citation[field]=value;self.save();error=self.error()
                self.assertEqual(error['code'],'candidate-preflight');self.assertIn(field,error['error'])
                self.assertEqual(json.loads((self.batch/'nodes.jsonl').read_text())['sources'][0][field],value)
                citation.clear();citation.update(before)
    def test_unknown_shorthand_source_id_is_not_inferred(self):
        self.c['nodes.jsonl'][0]['sources']=['not-captured'];self.save()
        self.assertEqual(self.error()['code'],'candidate-format')
    def test_invalid_support_shape_has_structured_feedback(self):
        self.c['assertions.jsonl'][0]['support']={'invented':'not a support span'};self.save()
        self.assertEqual(self.error()['code'],'candidate-format')
    def test_record_shape_and_classification_are_checked_before_reviews(self):
        self.c['nodes.jsonl'][0]['kind']='inferred-unrecognized-kind';self.c['assertions.jsonl'][0].pop('target_sha256');self.save()
        error=self.error();self.assertEqual(error['code'],'candidate-preflight');self.assertIn('unsupported kind',error['error'])
        self.assertEqual(json.loads((self.batch/'nodes.jsonl').read_text())['kind'],'inferred-unrecognized-kind')
    def test_inherited_fields_cannot_be_silently_added_before_reviews(self):
        g=json.loads((self.root/'data/knowledge.json').read_text(encoding='utf-8'))
        g['nodes'].append({**self.c['nodes.jsonl'][0],'aliases':['A prior canonical name'],'tags':['prior-classification']})
        (self.root/'data/knowledge.json').write_text(json.dumps(g),encoding='utf-8')
        error=self.error();self.assertEqual(error['code'],'candidate-preflight');self.assertIn('complete resulting node',error['error'])
    def test_edge_alias_and_unknown_endpoint_are_not_normalized(self):
        self.c['edges.jsonl']=[{'source':'test.signal','target':'unknown.node','relation':'tests'}];self.save()
        error=self.error();self.assertEqual(error['code'],'candidate-preflight');self.assertIn('unsupported relation',error['error'])
    def test_exact_excerpt_missing_blocks_packet(self):
        self.c['assertions.jsonl'][0]['support'][0]['quote']='unsupported universal statement';self.save()
        self.assertNotEqual(self.exchange('packet').returncode,0)
    def test_incorrect_supplied_hash_is_rejected_not_repaired(self):
        self.c['assertions.jsonl'][0]['target_sha256']='0'*64;self.save()
        self.assertNotEqual(self.exchange('packet').returncode,0)
        self.assertEqual(json.loads((self.batch/'assertions.jsonl').read_text())['target_sha256'],'0'*64)
    def test_stale_candidate_blocks_review_retention(self):
        packet=self.packet();self.c['nodes.jsonl'][0]['label']='Changed after dispatch';self.save()
        result=self.review('entailment',packet);self.assertNotEqual(result.returncode,0);self.assertIn('revision changed',result.stdout)
    def test_uncertain_review_never_publishes(self):
        packet=self.packet();self.decisions[1]['outcome']='uncertain'
        self.assertEqual(self.review('entailment',packet).returncode,0);self.assertEqual(self.review('adversarial',packet).returncode,0)
        self.assertNotEqual(self.run_cli('nemesis_apply.py','nemesis/batches/test-evidence','--check').returncode,0)
    def test_public_sources_reject_local_targets_and_redirects(self):
        for url in ('http://127.0.0.1/x','http://localhost/x','https://user:secret@example.org/x'):
            with self.subTest(url=url),self.assertRaises(EvidenceError):public_url(url)
        with self.assertRaises(EvidenceError):PublicRedirects().redirect_request(None,None,302,'',{},'http://127.0.0.1/internal')

if __name__=='__main__':unittest.main()
