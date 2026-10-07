"""Adversarial regressions for the scientific compiler, using explicit toy fixtures."""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from copy import deepcopy
from pathlib import Path
from evidence_compiler import ROOT, EvidenceError, audit_index, candidate_digest, compile_reviewed, context_digest, digest, enforce, review_packet, validate_dag
from nemesis_apply import normalize_batch,validate_nodes
from nemesis_worker_contract import build_contract,prompt_block

POLICY={"required_roles":["entailment","adversarial"],"review_roles":["entailment","adversarial"]}


def fixture():
    text="Test fixture only: in sample S, the measured test signal was 2 units with uncertainty 1 unit."
    source={"id":"source.test","url":"https://example.org/test-fixture","title":"Explicit synthetic test fixture",
            "retrieved_at":"2026-10-07T00:00:00Z","source_kind":"unknown","text":text,"sha256":hashlib.sha256(text.encode()).hexdigest()}
    node={"id":"test.signal","label":"Test signal","kind":"claim","domain":"physical","era":"frontier","status":"active",
          "summary":text,"sources":[{"id":source["id"],"url":source["url"]}],"frontier":False}
    assertion={"id":"assertion.test","target_kind":"node","target_sha256":digest(node),"canonical_record":node,
               "statement":text,"scope":{"population":"sample S","time":None,"assumptions":["synthetic fixture"],"uncertainty":"1 unit","units":"synthetic units","quantifiers":"sample S only"},
               "support":[{"source_id":source["id"],"source_sha256":source["sha256"],"start":0,"end":len(text),"quote":text}]}
    manifest={"protocol":"fog-nemesis-batch/1","batch_id":"test-evidence","created_at":"2026-10-07T00:00:00Z","agent":"fixture-author",
              "mission":"Synthetic compiler regression only","scope":{"domains":["physical"]}}
    candidate={"manifest.json":manifest,"nodes.jsonl":[node],"edges.jsonl":[],"reviews.jsonl":[],"sources.jsonl":[source],
               "assertions.jsonl":[assertion],"taxonomy.jsonl":[],"identities.jsonl":[]}
    decisions=[{"candidate_sha256":candidate_digest(candidate),"target_kind":"node","target_sha256":digest(node),
                "assertion_id":assertion["id"],"reviewer_id":"fixture-"+role,"role":role,"model":"explicit-test-fixture-not-real-review",
                "reviewed_at":"2026-10-07T00:00:00Z","outcome":"supported","rationale":"This toy record preserves the fixture exactly.",
                "limitations":"Synthetic fixture only; no scientific knowledge established.",
                "checks":{k:True for k in ("exact_support","scope_preserved","no_strengthening","relation_direction","representation_justified")}}
               for role in ("entailment","adversarial")]
    graph={"meta":{},"eras":[{"id":"frontier"}],"domains":[{"id":"physical"}],"nodes":[],"edges":[],"reviews":[]}
    for decision in decisions:decision['context_sha256']=context_digest(candidate,graph)
    return candidate,graph,decisions


class EvidenceCompilerTests(unittest.TestCase):
    def setUp(self):self.c,self.g,self.d=fixture()
    def check(self):return enforce(self.c,self.g,self.d,POLICY)
    def test_exact_bound_review_passes(self):self.assertEqual(self.check()["reviewed_targets"],1)
    def neutral_report(self):
        self.c['nodes.jsonl'][0].update(status='reported',era='undated',frontier=False)
        self.g['eras'].append({'id':'undated','label':'Chronology unresolved'})
        target_hash=digest(self.c['nodes.jsonl'][0]);self.c['assertions.jsonl'][0]['target_sha256']=target_hash
        for decision in self.d:decision.update(candidate_sha256=candidate_digest(self.c),target_sha256=target_hash,context_sha256=context_digest(self.c,self.g))
    def test_explicit_neutral_report_can_pass_only_with_complete_evidence_and_both_reviews(self):
        self.neutral_report();validate_nodes(self.c['nodes.jsonl'],self.g,self.c['manifest.json'])
        self.assertEqual(self.check()['reviewed_targets'],1)
        self.d.pop()
        with self.assertRaisesRegex(EvidenceError,'missing evidence review roles'):self.check()
    def test_neutral_metadata_never_rescues_unsupported_or_strengthened_assertion(self):
        self.neutral_report();self.d[1]['outcome']='unsupported'
        with self.assertRaisesRegex(EvidenceError,'unsupported or uncertain'):self.check()
        self.d[1]['outcome']='supported';self.c['assertions.jsonl'][0]['support'][0]['quote']='The result holds for every population forever.'
        with self.assertRaisesRegex(EvidenceError,'quote does not match'):self.check()
    def test_compiler_never_coerces_existing_metadata_to_neutral_states(self):
        before=deepcopy(self.c)
        normalize_batch(self.c['manifest.json'],self.c['nodes.jsonl'],self.c['reviews.jsonl'],self.g)
        self.assertEqual(self.c,before);self.assertEqual(self.c['nodes.jsonl'][0]['status'],'active');self.assertEqual(self.c['nodes.jsonl'][0]['era'],'frontier')
    def test_same_neutral_representation_policy_reaches_worker_and_review_packet(self):
        contract=build_contract();packet=review_packet(self.c,self.g)
        self.assertIn('reported',contract['allowed_statuses']);self.assertIn('undated',contract['atlas_eras'])
        self.assertEqual(contract['representation_policy'],packet['representation_policy'])
        self.assertEqual(contract['review_policy'],packet['review_policy'])
        self.assertIn('fog-representation-policy/1',prompt_block(contract))
    def test_private_tool_metadata_cannot_bypass_review(self):
        self.c["nodes.jsonl"][0]["public_frontier"]={"category":"company-tool","company":"Synthetic company","tool":"Synthetic tool","capability_status":"undisclosed","disclosed_at":None,"source_ids":["source.test"]}
        with self.assertRaises(EvidenceError):self.check()
    def test_no_reviews_never_passes(self):
        self.d=[]
        with self.assertRaises(EvidenceError):self.check()
    def test_one_review_is_not_two(self):
        self.d.pop()
        with self.assertRaises(EvidenceError):self.check()
    def test_author_self_review_rejected(self):
        self.d[0]["reviewer_id"]="fixture-author"
        with self.assertRaises(EvidenceError):self.check()
    def test_quote_must_exist_at_exact_offsets(self):
        self.c["assertions.jsonl"][0]["support"][0]["quote"]="All signals are always 2 units."
        with self.assertRaises(EvidenceError):self.check()
    def test_source_revision_change_rejected(self):
        self.c["sources.jsonl"][0]["text"]+=" changed"
        with self.assertRaises(EvidenceError):self.check()
    def test_stale_decision_rejected_after_scope_change(self):
        self.c["assertions.jsonl"][0]["scope"]["population"]="all populations"
        with self.assertRaises(EvidenceError):self.check()
    def test_classification_cannot_change_after_review(self):
        self.c["nodes.jsonl"][0]["kind"]="field"
        with self.assertRaises(EvidenceError):self.check()
    def test_uncertainty_is_not_supported(self):
        self.d[1]["outcome"]="uncertain"
        with self.assertRaises(EvidenceError):self.check()
    def test_scope_and_representation_checks_required(self):
        for check in ("scope_preserved","no_strengthening","representation_justified"):
            with self.subTest(check=check):
                self.d[0]["checks"][check]=False
                with self.assertRaises(EvidenceError):self.check()
                self.d[0]["checks"][check]=True
    def test_review_binding_cannot_be_substituted(self):
        self.d[0]["target_sha256"]="0"*64
        with self.assertRaises(EvidenceError):self.check()
    def test_update_cannot_inherit_unreviewed_fields(self):
        self.g['nodes']=[{**self.c['nodes.jsonl'][0],'tags':['unreviewed-extra-meaning']}]
        with self.assertRaises(EvidenceError):self.check()
    def test_implicit_frontier_classification_rejected(self):
        del self.c['nodes.jsonl'][0]['frontier']
        with self.assertRaises(EvidenceError):self.check()
    def test_provenance_url_cannot_point_elsewhere(self):
        self.c['nodes.jsonl'][0]['sources'][0]['url']='https://example.org/another-paper'
        # Rebind the fixture so the source URL mismatch, rather than stale hash,
        # is what prevents the canonical record from acquiring reviewed status.
        self.c['assertions.jsonl'][0]['target_sha256']=digest(self.c['nodes.jsonl'][0])
        self.d=[{**d,'candidate_sha256':candidate_digest(self.c),'target_sha256':digest(self.c['nodes.jsonl'][0])} for d in self.d]
        with self.assertRaises(EvidenceError):self.check()
    def test_added_semantics_remove_reviewed_status(self):
        compiled=compile_reviewed(self.g,self.c,self.check())
        compiled['nodes'][0]['extra_claim']='All populations always produce 2 units.'
        self.assertEqual(audit_index(compiled)['counts']['evidence_reviewed'],0)
    def test_relationship_needs_its_own_support(self):
        self.c["edges.jsonl"]=[{"source":"test.signal","target":"test.other","type":"supports"}]
        self.d=[{**d,"candidate_sha256":candidate_digest(self.c)} for d in self.d]
        with self.assertRaises(EvidenceError):self.check()
    def test_mult_parent_taxonomy_and_cycle_detection(self):
        links=[{"parent":"a","child":"c","type":"narrower"},{"parent":"b","child":"c","type":"narrower"}]
        validate_dag(links,{"a","b","c"})
        with self.assertRaises(EvidenceError):validate_dag(links+[{"parent":"c","child":"a","type":"narrower"}],{"a","b","c"})
    def test_identity_kinds_cannot_be_collapsed(self):
        self.g["nodes"]=[{"id":"field.a","kind":"field"},{"id":"question.a","kind":"question"}]
        self.c["identities.jsonl"]=[{"id":"identity.a","left":"field.a","right":"question.a","type":"same_concept"}]
        with self.assertRaises(EvidenceError):self.check()
    def test_packet_marks_source_as_untrusted_data(self):
        packet=review_packet(self.c,self.g)
        self.assertTrue(any("untrusted" in rule for rule in packet["instructions"]))
    def test_pdf_text_capture_retains_page_locations(self):
        import io
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject,NameObject,DecodedStreamObject
        from source_capture import extract_pdf
        writer=PdfWriter();page=writer.add_blank_page(width=300,height=200)
        font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):font})})
        stream=DecodedStreamObject();stream.set_data(b'BT /F1 12 Tf 30 100 Td (Synthetic sample S only.) Tj ET')
        page[NameObject('/Contents')]=stream
        memory=io.BytesIO();writer.write(memory)
        text,pages=extract_pdf(memory.getvalue())
        self.assertIn('Synthetic sample S only.',text)
        self.assertEqual(pages,[{'page':1,'start':0,'end':len(text),'has_text':True}])
    def test_scanned_pdf_cannot_invent_text(self):
        import io
        from pypdf import PdfWriter
        from source_capture import extract_pdf
        writer=PdfWriter();writer.add_blank_page(width=300,height=200);memory=io.BytesIO();writer.write(memory)
        with self.assertRaises(EvidenceError):extract_pdf(memory.getvalue())
    def test_pdf_excerpt_requires_the_correct_page(self):
        self.c['sources.jsonl'][0]['pages']=[{'page':1,'start':0,'end':len(self.c['sources.jsonl'][0]['text'])}]
        self.d=[{**d,'candidate_sha256':candidate_digest(self.c)} for d in self.d]
        with self.assertRaises(EvidenceError):self.check()
    def test_changed_endpoint_context_requires_new_review(self):
        self.c['edges.jsonl']=[{'source':'test.signal','target':'test.other','type':'supports'}]
        self.g['nodes']=[{'id':'test.other','kind':'claim','summary':'Original scoped endpoint'}]
        before=context_digest(self.c,self.g)
        self.g['nodes'][0]['summary']='Strengthened endpoint'
        self.assertNotEqual(before,context_digest(self.c,self.g))
    def existing_update(self):
        self.c['nodes.jsonl'][0].update(tags=[],aliases=[])
        self.c['assertions.jsonl'][0]['target_sha256']=digest(self.c['nodes.jsonl'][0])
        original=deepcopy(self.c['nodes.jsonl'][0]);original['summary']='Prior scoped synthetic measurement; fixture only.'
        self.g['nodes']=[original]
        for decision in self.d:
            decision.update(target_sha256=digest(self.c['nodes.jsonl'][0]),candidate_sha256=candidate_digest(self.c),context_sha256=context_digest(self.c,self.g))
        return original
    def test_same_id_update_merged_after_review_rejects_stale_replacement(self):
        original=self.existing_update();self.assertEqual(self.check()['reviewed_targets'],1)
        original['summary']='Newer measurement merged after the candidate review; fixture only.'
        with self.assertRaisesRegex(EvidenceError,'context changed'):self.check()
        self.assertEqual(self.g['nodes'][0]['summary'],original['summary'])
    def test_candidate_overwritten_relation_endpoint_keeps_original_revision_bound(self):
        original=self.existing_update();self.g['nodes'].append({'id':'test.other','kind':'claim','summary':'Other scoped endpoint'})
        self.c['edges.jsonl']=[{'source':'test.signal','target':'test.other','type':'supports'}]
        before=context_digest(self.c,self.g);original['summary']='Changed original endpoint, despite unchanged candidate replacement.'
        self.assertNotEqual(before,context_digest(self.c,self.g))
    def test_unrelated_sibling_addition_does_not_stale_reviewed_update(self):
        self.existing_update();before=context_digest(self.c,self.g)
        self.g['nodes'].append({'id':'test.unrelated','kind':'claim','summary':'Independent sibling result'})
        self.assertEqual(before,context_digest(self.c,self.g));self.assertEqual(self.check()['reviewed_targets'],1)
    def test_reviewed_existing_update_reapplies_idempotently_with_original_context(self):
        original=deepcopy(self.existing_update());proof=self.check();once=compile_reviewed(self.g,self.c,proof)
        self.assertEqual(once['evidence_reviews'][0]['context_nodes'],[original])
        again=enforce(self.c,once,self.d,POLICY);twice=compile_reviewed(once,self.c,again)
        self.assertEqual(once,twice)
    def test_later_same_id_revision_cannot_reuse_old_accepted_context(self):
        self.existing_update();once=compile_reviewed(self.g,self.c,self.check())
        once['nodes'][0]['summary']='A separately reviewed later revision; synthetic fixture only.'
        with self.assertRaisesRegex(EvidenceError,'context changed'):enforce(self.c,once,self.d,POLICY)
    def test_sibling_creation_of_same_node_id_changes_addition_context(self):
        before=context_digest(self.c,self.g)
        sibling=deepcopy(self.c['nodes.jsonl'][0]);sibling.update(tags=[],aliases=[])
        self.g['nodes'].append(sibling)
        self.assertNotEqual(before,context_digest(self.c,self.g))
        with self.assertRaisesRegex(EvidenceError,'context changed'):self.check()
    def test_reapplying_node_batch_still_detects_changed_external_endpoint(self):
        self.existing_update();self.g['nodes'].append({'id':'test.other','kind':'claim','summary':'Original independent endpoint'})
        self.c['edges.jsonl']=[{'source':'test.signal','target':'test.other','type':'supports'}]
        before=context_digest(self.c,self.g)
        accepted={'candidate_sha256':candidate_digest(self.c),'context_nodes':deepcopy(self.g['nodes'])}
        current=deepcopy(self.g);current['nodes'][0]=deepcopy(self.c['nodes.jsonl'][0]);current['nodes'][0].setdefault('sources',[]);current['nodes'][0].setdefault('tags',[]);current['nodes'][0].setdefault('aliases',[])
        current['evidence_reviews']=[accepted]
        self.assertEqual(before,context_digest(self.c,current))
        current['nodes'][1]['summary']='Changed independent endpoint after application'
        self.assertNotEqual(before,context_digest(self.c,current))
    def test_reviewed_compilation_and_audit_are_idempotent(self):
        proof=self.check();once=compile_reviewed(self.g,self.c,proof);twice=compile_reviewed(once,self.c,proof)
        self.assertEqual(once,twice)
        self.assertEqual(audit_index(once)["counts"]["evidence_reviewed"],1)
    def test_real_cli_rejects_unsourced_example_and_applies_bound_fixture(self):
        with tempfile.TemporaryDirectory(prefix="fog-compiler-") as directory:
            target=Path(directory)/"fog"
            shutil.copytree(ROOT,target,ignore=shutil.ignore_patterns("__pycache__",".playwright-cli","output"))
            command=[sys.executable,"scripts/nemesis_apply.py"]
            result=subprocess.run(command+["nemesis/example-batch","--apply"],cwd=target,capture_output=True,text=True)
            self.assertEqual(result.returncode,2)
            folder=target/"nemesis/batches/test-evidence";folder.mkdir(parents=True,exist_ok=True)
            source_text=self.c['sources.jsonl'][0]['text']
            class FixtureSource(BaseHTTPRequestHandler):
                def do_GET(self):
                    body=source_text.encode('utf-8');self.send_response(200)
                    self.send_header('Content-Type','text/plain; charset=utf-8');self.end_headers();self.wfile.write(body)
                def log_message(self,*args):pass
            server=ThreadingHTTPServer(('127.0.0.1',0),FixtureSource)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                capture=subprocess.run([sys.executable,'scripts/evidence_pipeline.py','capture','--url',f'http://127.0.0.1:{server.server_port}/fixture','--source-id','source.test','--title','Explicit synthetic test fixture'],cwd=target,capture_output=True,text=True)
                self.assertEqual(capture.returncode,0,capture.stderr)
                source=json.loads(capture.stdout)
            finally:server.shutdown();server.server_close();thread.join()
            self.c['sources.jsonl']=[source]
            self.c['nodes.jsonl'][0]['sources'][0]['url']=source['url']
            record_hash=digest(self.c['nodes.jsonl'][0])
            self.c['assertions.jsonl'][0]['target_sha256']=record_hash
            self.d=[{**d,'target_sha256':record_hash,'candidate_sha256':candidate_digest(self.c)} for d in self.d]
            for name,value in self.c.items():
                data=json.dumps(value) if name.endswith(".json") else "".join(json.dumps(row)+"\n" for row in value)
                (folder/name).write_text(data,encoding="utf-8")
            review=target/"nemesis/adjudications";review.mkdir(parents=True,exist_ok=True)
            (review/(candidate_digest(self.c)+".json")).write_text(json.dumps({"decisions":self.d}),encoding="utf-8")
            raw={p.name:p.read_bytes() for p in folder.iterdir()}
            first=None
            for _ in range(2):
                result=subprocess.run(command+[str(folder),"--apply"],cwd=target,capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                snapshot={name:(target/name).read_bytes() for name in ("data/knowledge.json","data/atlas-navigation.json","data/evidence-index.json","nemesis/applied.jsonl")}
                if first is None:first=snapshot
                else:self.assertEqual(first,snapshot)
            self.assertEqual(raw,{p.name:p.read_bytes() for p in folder.iterdir()})
            result=subprocess.run([sys.executable,"scripts/validate.py"],cwd=target,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            raw_response=target/'data/evidence/raw'/(source['raw_sha256']+'.bin')
            original_response=raw_response.read_bytes();raw_response.write_bytes(b'Invented worker source prose')
            result=subprocess.run([sys.executable,'scripts/validate.py'],cwd=target,capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('HTTP response missing or changed',result.stdout+result.stderr)
            raw_response.write_bytes(original_response)
            altered=json.loads((target/'data/knowledge.json').read_text(encoding='utf-8'))
            altered['nodes'][-1]['summary']='All signals are always exactly 2 units.'
            (target/'data/knowledge.json').write_text(json.dumps(altered),encoding='utf-8')
            result=subprocess.run([sys.executable,'scripts/validate.py'],cwd=target,capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('unreviewed new or changed',result.stdout+result.stderr)


if __name__=="__main__":unittest.main()
