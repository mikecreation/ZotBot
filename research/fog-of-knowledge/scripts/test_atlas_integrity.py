"""Regression checks for reachability, provenance separation, and strict imports."""
import json
import unittest
from collections import defaultdict, deque
from copy import deepcopy

from atlas_navigation import ROOT, build, compile_navigation
from nemesis_apply import BatchError, compile_batch, normalize_batch, validate_manifest, validate_nodes


class AtlasIntegrity(unittest.TestCase):
    def setUp(self):
        self.graph = json.loads((ROOT / "data/knowledge.json").read_text(encoding="utf-8"))
        self.families = json.loads((ROOT / "data/atlas-families.json").read_text(encoding="utf-8"))
        self.registry = (ROOT / "data/ologies.tsv").read_text(encoding="utf-8")

    def test_every_runtime_record_has_one_acyclic_path(self):
        before = deepcopy(self.graph)
        p = build(self.graph)
        nodes = self.graph["nodes"] + p["registry_nodes"]
        parents, children = {}, defaultdict(list)
        for link in p["links"]:
            self.assertNotIn(link["target"], parents)
            parents[link["target"]] = link["source"]
            children[link["source"]].append(link["target"])
            self.assertNotIn(link["type"], {"derived_from", "supports", "depends_on"})
        visited = set()
        queue = deque("family:" + f["id"] for f in self.families)
        while queue:
            node = queue.popleft()
            self.assertNotIn(node, visited)
            visited.add(node)
            queue.extend(children[node])
        self.assertTrue({n["id"] for n in nodes} <= visited)
        self.assertEqual(self.graph, before)
        self.assertEqual(set(parents), {n["id"] for n in nodes})

    def test_projection_is_deterministic_under_record_reordering(self):
        first = build(self.graph)
        self.graph["nodes"].reverse()
        self.graph["edges"].reverse()
        second = build(self.graph)
        # Input hash records the actual snapshot; display links remain stable.
        self.assertEqual(first["links"], second["links"])
        self.assertEqual(first["placement_pending_ids"], second["placement_pending_ids"])

    def test_scientific_cycles_do_not_become_navigation_cycles(self):
        graph = deepcopy(self.graph)
        roots = [n for n in graph["nodes"] if n["domain"] == "physical"][:3]
        for a, b in zip(roots, roots[1:] + roots[:1]):
            graph["edges"].append({"source": a["id"], "target": b["id"], "type": "related"})
        p = compile_navigation(graph, self.registry, self.families)
        self.assertEqual(len(p["links"]), p["counts"]["discoverable"])

    def test_unsupported_semantics_are_rejected_without_mutation(self):
        manifest = {"protocol": "fog-nemesis-batch/1", "batch_id": "test.strict", "created_at": "2026-10-07",
                    "agent": "test", "mission": "test", "scope": {"domains": ["physical"]}}
        node = {"id": "test.node", "label": "Test", "kind": "claim", "domain": "physical",
                "era": "twentieth", "status": "active", "sources": [{"url": "https://example.org"}]}
        variants = [{**node, "kind": kind} for kind in ("person", "org", "event", "evidence", "instrument")]
        variants += [{**node, "era": "contemporary"}, {**node, "domain": "physics"}, {**node, "status": "unresolved"}]
        variants += [{k: v for k, v in node.items() if k != missing} for missing in ("era", "status", "domain")]
        for variant in variants:
            with self.subTest(variant=variant):
                before = deepcopy(variant)
                m, nodes, _ = normalize_batch(deepcopy(manifest), [variant], [], self.graph)
                with self.assertRaises(BatchError):
                    validate_nodes(nodes, self.graph, m)
                self.assertEqual(variant, before)
        bad_scope = {**manifest, "scope": {"domains": ["physics"]}}
        with self.assertRaises(BatchError):
            validate_manifest(bad_scope, self.graph)
    def test_reviewed_parent_wins_when_orphan_child_sorts_first(self):
        template=next(n for n in self.graph['nodes'] if n['domain']=='physical')
        self.graph['nodes'].extend([{**template,'id':'aaa.reviewed-child','label':'Reviewed child'},
                                    {**template,'id':'zzz.orphan-parent','label':'Orphan parent'}])
        self.graph['taxonomy']=[{'id':'taxonomy.test','parent':'zzz.orphan-parent','child':'aaa.reviewed-child','type':'narrower'}]
        p=build(self.graph)
        link=next(e for e in p['links'] if e['target']=='aaa.reviewed-child')
        self.assertEqual(link['source'],'zzz.orphan-parent')
        self.assertEqual(link['type'],'reviewed_taxonomy')

    def test_batch_and_navigation_are_idempotent(self):
        folder = ROOT / "nemesis/example-batch"
        def rows(name):
            return [json.loads(line) for line in (folder / name).read_text(encoding="utf-8").splitlines() if line.strip()]
        nodes, edges, reviews = rows("nodes.jsonl"), rows("edges.jsonl"), rows("reviews.jsonl")
        once = compile_batch(self.graph, nodes, edges, reviews)
        twice = compile_batch(once, nodes, edges, reviews)
        self.assertEqual(once, twice)
        self.assertEqual(build(once), build(twice))


if __name__ == "__main__":
    unittest.main()
