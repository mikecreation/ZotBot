"""Display payload completeness, exact evidence preservation and stale-output gate."""
import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

import atlas_navigation
from atlas_display import ROOT, OUTPUT, compile_display, projection_bytes, validate_display, write_display


class AtlasDisplay(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.graph = json.loads((ROOT / "data/knowledge.json").read_text(encoding="utf-8"))
        cls.navigation = atlas_navigation.build(cls.graph)

    def test_all_canonical_ui_records_and_exact_historical_support_survive(self):
        before = deepcopy(self.graph)
        display = compile_display(self.graph, self.navigation)
        for key, value in self.graph.items():
            if key != "evidence_reviews":
                self.assertEqual(display[key], value, key)
        expected = {}
        for bundle in self.graph.get("evidence_reviews", []):
            for assertion in bundle["assertions"]:
                if assertion["target_kind"] == "node":
                    target = assertion["canonical_record"]["id"]
                    projected = {k: v for k, v in assertion.items() if k != "canonical_record"}
                    expected.setdefault(target, []).append({**projected, "target_id": target})
        self.assertEqual(display["node_support"], expected)
        self.assertNotIn("evidence_reviews", display)
        self.assertEqual(self.graph, before, "projection must not mutate scientific authority")
        # The UI may add derived statuses and registry tags without editing input.
        display["nodes"][0]["tags"].append("display-only")
        self.assertEqual(self.graph, before)

    def test_historical_revisions_quotes_scope_offsets_and_order_are_not_collapsed(self):
        graph = {"nodes": [{"id": "n", "label": "current"}], "edges": [], "reviews": []}
        support = {"source_id": "s", "source_sha256": "a" * 64,
                   "quote": "Exact: α < β\nnext line", "start": 10, "end": 35, "page": 2}
        first = {"id": "a1", "target_kind": "node", "target_sha256": "b" * 64,
                 "canonical_record": {"id": "n", "label": "old"}, "statement": "Old report",
                 "scope": {"uncertainty": "Limited to this sample"}, "support": [support]}
        second = {**deepcopy(first), "id": "a2", "statement": "New report"}
        graph["evidence_reviews"] = [{"assertions": [first], "decisions": ["heavy receipt"]},
                                     {"assertions": [second]}]
        result = compile_display(graph, self.navigation)["node_support"]["n"]
        self.assertEqual([a["id"] for a in result], ["a1", "a2"])
        self.assertEqual(result[0]["support"], [support])
        self.assertEqual(result[0]["scope"], first["scope"])
        self.assertEqual(result[0]["target_sha256"], first["target_sha256"])

    def test_exact_minified_bytes_and_navigation_binding_are_validated(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "display.json"
            write_display(self.graph, self.navigation, output)
            expected = projection_bytes(compile_display(self.graph, self.navigation))
            self.assertEqual(output.read_bytes(), expected)
            self.assertEqual(json.loads(expected)["input_sha256"], self.navigation["input_sha256"])
            validate_display(self.graph, self.navigation, output)
            mutations = [lambda d: d["nodes"].pop(), lambda d: d["edges"].pop(),
                         lambda d: d["reviews"].clear(),
                         lambda d: d.update(input_sha256="0" * 64),
                         lambda d: next(iter(d["node_support"].values()))[0]["support"].clear()]
            for mutate in mutations:
                changed = json.loads(expected)
                mutate(changed)
                output.write_bytes(projection_bytes(changed))
                with self.assertRaisesRegex(ValueError, "stale display"):
                    validate_display(self.graph, self.navigation, output)
            output.write_bytes(expected + b"\n")
            with self.assertRaisesRegex(ValueError, "stale display"):
                validate_display(self.graph, self.navigation, output)

    def test_native_navigation_write_regenerates_new_records_and_support(self):
        graph = deepcopy(self.graph)
        graph["nodes"].append({**graph["nodes"][0], "id": "test.new", "label": "New native record"})
        graph.setdefault("evidence_reviews", []).append({"assertions": [{
            "id": "test.new-support", "target_kind": "node", "target_sha256": "c" * 64,
            "canonical_record": graph["nodes"][-1], "statement": "Synthetic native-apply fixture",
            "scope": {"uncertainty": "Test only"}, "support": [{"quote": "Exact test support"}]
        }]})
        navigation = atlas_navigation.build(graph)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "data").mkdir()
            (root / "data/knowledge.json").write_text(json.dumps(graph), encoding="utf-8")
            with patch.object(atlas_navigation, "ROOT", root), \
                 patch.object(atlas_navigation, "OUTPUT", root / "data/atlas-navigation.json"), \
                 patch("atlas_display.OUTPUT", root / "data/atlas-display.json"), \
                 patch("evidence_pipeline.write_index"):
                atlas_navigation.write_projection(navigation)
            result = json.loads((root / "data/atlas-display.json").read_bytes())
            self.assertEqual(result["nodes"][-1]["id"], "test.new")
            self.assertEqual(result["input_sha256"], navigation["input_sha256"])
            self.assertEqual(result["node_support"]["test.new"][0]["support"], [{"quote": "Exact test support"}])

    def test_committed_projection_and_knowledge_byte_preservation(self):
        path = ROOT / "data/knowledge.json"
        before = path.read_bytes()
        validate_display(self.graph, self.navigation)
        self.assertEqual(OUTPUT.read_bytes(), projection_bytes(compile_display(self.graph, self.navigation)))
        self.assertEqual(path.read_bytes(), before)
        self.assertLess(len(OUTPUT.read_bytes()), len(before) // 2)


if __name__ == "__main__":
    unittest.main()
