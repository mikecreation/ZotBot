"""Crew exchange regressions in disposable projects; no live research is dispatched."""
import hashlib,json,shutil,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from test_evidence_compiler import fixture
from evidence_compiler import ROOT,candidate_digest,digest
from source_capture import EvidenceError,public_url,PublicRedirects

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
