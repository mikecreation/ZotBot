"""Regressions for the source-backed PLACEMENT CANDIDATE lane (taxonomy.jsonl).

All fixtures are synthetic; none of them is scientific evidence.
"""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from copy import deepcopy
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from evidence_compiler import ROOT,EvidenceError,candidate_digest,compile_reviewed,context_digest,digest,enforce,review_packet
from atlas_navigation import compile_navigation
from nemesis_worker_contract import build_contract,prompt_block

POLICY={"required_roles":["entailment","adversarial"],"review_roles":["entailment","adversarial"]}
TEXT="Synthetic placement fixture only: within this toy scheme, Subfield S is a branch of Field F."
CHECKS=("exact_support","scope_preserved","no_strengthening","relation_direction","representation_justified")


def node(i,domain="physical",label=None):
    return {"id":i,"label":label or i,"kind":"field","domain":domain,"era":"frontier","status":"active",
            "summary":"Synthetic "+i,"sources":[],"tags":[],"aliases":[],"frontier":False}


def placement_fixture(parent="test.field",child="test.sub",rid="taxonomy.test.sub.narrower.test.field",text=TEXT,url="https://example.org/placement-fixture",confidence=0.7):
    source={"id":"source.placement","url":url,"title":"Synthetic placement fixture","retrieved_at":"2026-10-10T00:00:00Z",
            "source_kind":"unknown","text":text,"sha256":hashlib.sha256(text.encode()).hexdigest()}
    record={"id":rid,"parent":parent,"child":child,"type":"narrower"}
    assertion={"id":"assertion.placement","target_kind":"taxonomy","target_sha256":digest(record),"canonical_record":record,
               "statement":"Within the cited toy scheme, "+child+" is narrower than "+parent+".",
               "scope":{"population":None,"time":None,"assumptions":["synthetic fixture"],"uncertainty":None,"units":None,"quantifiers":"this scheme only"},
               "support":[{"source_id":source["id"],"source_sha256":source["sha256"],"start":0,"end":len(text),"quote":text}],
               "confidence":confidence}
    manifest={"protocol":"fog-nemesis-batch/1","batch_id":"test-placement","created_at":"2026-10-10T00:00:00Z","agent":"placement-author",
              "mission":"Synthetic placement regression only","scope":{"domains":["physical"]}}
    candidate={"manifest.json":manifest,"nodes.jsonl":[],"edges.jsonl":[],"reviews.jsonl":[],"sources.jsonl":[source],
               "assertions.jsonl":[assertion],"taxonomy.jsonl":[record],"identities.jsonl":[]}
    graph={"meta":{},"eras":[{"id":"frontier"}],"domains":[{"id":"physical"},{"id":"life"}],
           "nodes":[node("test.field"),node("test.sub"),node("test.other"),node("life.field","life")],
           "edges":[],"reviews":[],"taxonomy":[],"identities":[]}
    return candidate,graph


def decide(candidate,graph,roles=("entailment","adversarial"),outcome="supported"):
    result=[]
    for record in candidate["taxonomy.jsonl"]:
        aid=next(a["id"] for a in candidate["assertions.jsonl"] if a["target_sha256"]==digest(record))
        for role in roles:
            result.append({"candidate_sha256":candidate_digest(candidate),"context_sha256":context_digest(candidate,graph),
                           "target_kind":"taxonomy","target_sha256":digest(record),"assertion_id":aid,
                           "reviewer_id":"fixture-"+role,"role":role,"model":"explicit-test-fixture-not-real-review",
                           "reviewed_at":"2026-10-10T00:00:00Z","outcome":outcome,
                           "rationale":"Toy excerpt classifies the child under the parent.","limitations":"Synthetic fixture only.",
                           "checks":{k:True for k in CHECKS}})
    return result


def rebind(candidate):
    for a in candidate["assertions.jsonl"]:
        a["canonical_record"]=next(r for r in candidate["taxonomy.jsonl"] if r["id"]==a["canonical_record"]["id"])
        a["target_sha256"]=digest(a["canonical_record"])


class PlacementLaneTests(unittest.TestCase):
    def setUp(self):self.c,self.g=placement_fixture()
    def check(self,decisions=None):
        return enforce(self.c,self.g,decide(self.c,self.g) if decisions is None else decisions,POLICY)

    def test_reviewed_placement_compiles_to_taxonomy_and_places_the_node(self):
        proof=self.check();self.assertEqual(proof["reviewed_targets"],1)
        compiled=compile_reviewed(self.g,self.c,proof)
        self.assertEqual(compiled["taxonomy"],self.c["taxonomy.jsonl"])
        families=[{"id":"physical","major":["test.field"]},{"id":"life","major":["life.field"]}]
        nav=compile_navigation(compiled,"label\tdomain\tera\n",families)
        self.assertIn({"source":"test.field","target":"test.sub","type":"reviewed_taxonomy",
                       "taxonomy_id":self.c["taxonomy.jsonl"][0]["id"],"placement_pending":False},nav["links"])
        self.assertNotIn("test.sub",nav["placement_pending_ids"])
        self.assertIn("test.other",nav["placement_pending_ids"])
        before=compile_navigation(self.g,"label\tdomain\tera\n",families)
        self.assertIn("test.sub",before["placement_pending_ids"])

    def test_identical_placement_reapplies_idempotently(self):
        once=compile_reviewed(self.g,self.c,self.check())
        again=enforce(self.c,once,decide(self.c,self.g),POLICY)
        self.assertEqual(once,compile_reviewed(once,self.c,again))

    def test_adversarial_review_is_mandatory(self):
        with self.assertRaisesRegex(EvidenceError,"missing evidence review roles"):self.check(decide(self.c,self.g,roles=("entailment",)))
        decisions=decide(self.c,self.g);decisions[1]["outcome"]="uncertain"
        with self.assertRaisesRegex(EvidenceError,"unsupported or uncertain"):self.check(decisions)
        decisions=decide(self.c,self.g);decisions[1]["checks"]["relation_direction"]=False
        with self.assertRaisesRegex(EvidenceError,"checks not satisfied"):self.check(decisions)

    def test_author_cannot_review_own_placement(self):
        decisions=decide(self.c,self.g);decisions[1]["reviewer_id"]="placement-author"
        with self.assertRaisesRegex(EvidenceError,"cannot review their own"):self.check(decisions)

    def test_no_reviews_never_publishes(self):
        with self.assertRaises(EvidenceError):self.check([])

    def test_cycle_rejected(self):
        self.g["taxonomy"]=[{"id":"taxonomy.existing","parent":"test.sub","child":"test.field","type":"narrower"}]
        with self.assertRaisesRegex(EvidenceError,"cycle"):self.check()

    def test_self_placement_rejected(self):
        self.c["taxonomy.jsonl"][0]["parent"]="test.sub";rebind(self.c)
        with self.assertRaisesRegex(EvidenceError,"narrower than itself"):self.check()

    def test_parent_and_child_must_exist(self):
        self.c["taxonomy.jsonl"][0]["parent"]="test.missing";rebind(self.c)
        with self.assertRaisesRegex(EvidenceError,"parent does not exist"):self.check()
        self.c,self.g=placement_fixture(child="test.missing")
        with self.assertRaisesRegex(EvidenceError,"child must be a canonical node"):self.check()

    def test_same_family_rule(self):
        self.c["taxonomy.jsonl"][0]["parent"]="life.field";rebind(self.c)
        with self.assertRaisesRegex(EvidenceError,"cross-family"):self.check()
        self.c["taxonomy.jsonl"][0]["parent"]="family:life";rebind(self.c)
        with self.assertRaisesRegex(EvidenceError,"not the child's family"):self.check()
        self.c["taxonomy.jsonl"][0]["parent"]="family:physical";rebind(self.c)
        self.assertEqual(self.check()["reviewed_targets"],1)

    def test_duplicates_rejected(self):
        twin=dict(self.c["taxonomy.jsonl"][0],id="taxonomy.twin")
        self.c["taxonomy.jsonl"].append(twin)
        self.c["assertions.jsonl"].append(dict(self.c["assertions.jsonl"][0],id="assertion.twin",canonical_record=twin,target_sha256=digest(twin)))
        with self.assertRaisesRegex(EvidenceError,"duplicate placement"):self.check()
        self.c,self.g=placement_fixture()
        self.g["taxonomy"]=[{"id":"taxonomy.prior","parent":"test.field","child":"test.sub","type":"narrower"}]
        with self.assertRaisesRegex(EvidenceError,"already narrower"):self.check()

    def test_multiple_same_family_parents_allowed(self):
        self.g["taxonomy"]=[{"id":"taxonomy.prior","parent":"test.other","child":"test.sub","type":"narrower"}]
        self.assertEqual(self.check()["reviewed_targets"],1)

    def test_confidence_required_and_bounded(self):
        for bad in (None,0,1.5,True,"high"):
            with self.subTest(confidence=bad):
                self.c,self.g=placement_fixture(confidence=bad)
                if bad is None:del self.c["assertions.jsonl"][0]["confidence"]
                with self.assertRaisesRegex(EvidenceError,"confidence"):self.check()

    def test_placement_record_cannot_smuggle_other_semantics(self):
        for extra in ({"dependency":"hard"},{"confidence":0.9},{"visual_parent":True}):
            with self.subTest(extra=extra):
                self.c,self.g=placement_fixture();self.c["taxonomy.jsonl"][0].update(extra);rebind(self.c)
                with self.assertRaisesRegex(EvidenceError,"only id/parent/child/type"):self.check()
        self.c,self.g=placement_fixture();self.c["taxonomy.jsonl"][0]["type"]="related";rebind(self.c)
        with self.assertRaisesRegex(EvidenceError,"narrower semantics"):self.check()

    def test_placement_needs_its_own_assertion(self):
        self.c["assertions.jsonl"][0]["target_kind"]="node"
        with self.assertRaises(EvidenceError):self.check()

    def test_review_packet_tells_reviewers_how_to_judge_placement(self):
        packet=review_packet(self.c,self.g)
        self.assertTrue(any("taxonomy (narrower)" in rule for rule in packet["instructions"]))
        self.assertIn("test.sub",{n["id"] for n in packet["existing_endpoints"]})

    def test_live_worker_contract_exposes_the_lane(self):
        contract=build_contract();lane=contract["placement_lane"]
        self.assertEqual(lane["candidate_file"],"taxonomy.jsonl")
        self.assertEqual(lane["candidate_record_fields_only"],["id","parent","child","type"])
        self.assertIn("taxonomy.jsonl",contract["evidence_files"])
        self.assertIn("author_canonical_taxonomy_placement",contract["worker_must_not"])
        self.assertTrue((ROOT/lane["candidate_schema"]).exists())
        schema=json.loads((ROOT/lane["candidate_schema"]).read_text(encoding="utf-8"))
        self.assertEqual(sorted(schema["required"]),sorted(lane["candidate_record_fields_only"]))
        block=prompt_block(contract)
        self.assertIn("fog-placement-candidate/1",block)
        self.assertTrue(any("placement candidate" in r for r in contract["prompt_rules"]))
        manifest=json.loads((ROOT/".nemesis.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["commands"]["worker_contract"],"python scripts/nemesis_worker_contract.py")

    def test_real_cli_applies_placement_only_batch_after_both_reviews(self):
        with tempfile.TemporaryDirectory(prefix="fog-placement-") as directory:
            target=Path(directory)/"fog"
            shutil.copytree(ROOT,target,ignore=shutil.ignore_patterns("__pycache__",".playwright-cli","output"))
            graph=json.loads((target/"data/knowledge.json").read_text(encoding="utf-8"))
            nav=json.loads((target/"data/atlas-navigation.json").read_text(encoding="utf-8"))
            ids={n["id"]:n for n in graph["nodes"]}
            child=next(i for i in nav["placement_pending_ids"] if i in ids and ids[i]["domain"]=="physical")
            parent="family:physical"
            class FixtureSource(BaseHTTPRequestHandler):
                def do_GET(self):
                    body=TEXT.encode("utf-8");self.send_response(200)
                    self.send_header("Content-Type","text/plain; charset=utf-8");self.end_headers();self.wfile.write(body)
                def log_message(self,*args):pass
            server=ThreadingHTTPServer(("127.0.0.1",0),FixtureSource)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                capture=subprocess.run([sys.executable,"scripts/evidence_pipeline.py","capture","--url",f"http://127.0.0.1:{server.server_port}/fixture",
                                        "--source-id","source.placement","--title","Synthetic placement fixture"],cwd=target,capture_output=True,text=True)
                self.assertEqual(capture.returncode,0,capture.stderr)
                source=json.loads(capture.stdout)
            finally:server.shutdown();server.server_close();thread.join()
            c,_=placement_fixture(parent=parent,child=child,rid="taxonomy."+child+".narrower.physical")
            c["sources.jsonl"]=[source]
            for span in c["assertions.jsonl"][0]["support"]:span["source_sha256"]=source["sha256"]
            folder=target/"nemesis/batches/test-placement";folder.mkdir(parents=True,exist_ok=True)
            for name,value in c.items():
                data=json.dumps(value) if name.endswith(".json") else "".join(json.dumps(row)+"\n" for row in value)
                (folder/name).write_text(data,encoding="utf-8")
            command=[sys.executable,"scripts/nemesis_apply.py",str(folder)]
            review=target/"nemesis/adjudications";review.mkdir(parents=True,exist_ok=True)
            receipt=review/(candidate_digest(c)+".json")
            receipt.write_text(json.dumps({"decisions":decide(c,graph,roles=("entailment",))}),encoding="utf-8")
            result=subprocess.run(command+["--apply"],cwd=target,capture_output=True,text=True)
            self.assertEqual(result.returncode,2,result.stdout+result.stderr)
            self.assertIn("missing evidence review roles",result.stdout)
            self.assertEqual(json.loads((target/"data/knowledge.json").read_text(encoding="utf-8"))["taxonomy"],[])
            receipt.write_text(json.dumps({"decisions":decide(c,graph)}),encoding="utf-8")
            first=None
            for _ in range(2):
                result=subprocess.run(command+["--apply"],cwd=target,capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                summary=json.loads(result.stdout);self.assertEqual(summary["counts"]["taxonomy_in_batch"],1)
                snapshot={n:(target/n).read_bytes() for n in ("data/knowledge.json","data/atlas-navigation.json","nemesis/applied.jsonl")}
                if first is None:first=snapshot
                else:self.assertEqual(first,snapshot)
            after=json.loads((target/"data/atlas-navigation.json").read_text(encoding="utf-8"))
            self.assertNotIn(child,after["placement_pending_ids"])
            self.assertEqual(after["counts"]["placement_pending"],nav["counts"]["placement_pending"]-1-sum(
                1 for l in nav["links"] if l.get("placement_pending") and l["source"]==child))
            result=subprocess.run([sys.executable,"scripts/validate.py"],cwd=target,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            altered=json.loads((target/"data/knowledge.json").read_text(encoding="utf-8"))
            altered["taxonomy"].append({"id":"taxonomy.unreviewed","parent":"family:physical","child":next(
                i for i in after["placement_pending_ids"] if i in ids and ids[i]["domain"]=="physical"),"type":"narrower"})
            (target/"data/knowledge.json").write_text(json.dumps(altered),encoding="utf-8")
            result=subprocess.run([sys.executable,"scripts/validate.py"],cwd=target,capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)


if __name__=="__main__":unittest.main()
