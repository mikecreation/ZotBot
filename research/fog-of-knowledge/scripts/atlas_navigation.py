"""Deterministic navigation projection; never adds scientific relationships."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import defaultdict, deque
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "atlas-navigation.json"
CONTEXT_TYPES = {"enabled", "derived_from"}
REGISTRY_PARENT = {"earth": "field.geology", "life": "field.biology", "health": "practice.medicine",
                   "social": "field.sociology", "humanities": "field.philosophy", "physical": "field.physics",
                   "information": "field.cognitive-science", "engineering": "field.engineering", "formal": "field.logic"}


def compile_navigation(graph: dict, registry: str, families: list[dict]) -> dict:
    nodes = deepcopy(graph["nodes"])
    by_id = {n["id"]: n for n in nodes}
    by_label = {n["label"].lower(): n for n in nodes}
    additions, registry_links, registry_ids = [], [], []
    for line in registry.splitlines()[1:]:
        if not line.strip():
            continue
        label, domain, era = line.split("\t")
        existing = by_label.get(label.lower())
        if existing:
            registry_ids.append(existing["id"])
            continue
        slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
        node = {"id": "ology." + slug, "label": label, "kind": "field", "domain": domain,
                "era": era, "status": "active", "summary": "Curated registry seed: " + label + ". Taxonomy and evidence remain unreviewed.",
                "tags": ["ology", "registry-seed"], "sources": [], "frontier": False, "aliases": []}
        if node["id"] in by_id:
            raise ValueError("registry ID collision: " + node["id"])
        by_id[node["id"]] = node
        by_label[label.lower()] = node
        nodes.append(node)
        additions.append(node)
        registry_ids.append(node["id"])
        parent = REGISTRY_PARENT.get(domain)
        if parent in by_id:
            registry_links.append({"source": parent, "target": node["id"], "type": "registry_membership"})

    domains = {f["id"] for f in families}
    for node in nodes:
        if node["domain"] not in domains:
            raise ValueError("node has no navigation family: " + node["id"])
    adj = defaultdict(list)
    taxonomy = sorted(graph.get("taxonomy", []), key=lambda e: (e["parent"], e["child"], e["id"]))
    preferred = {}
    alternatives = defaultdict(list)
    for edge in taxonomy:
        if edge["child"] not in by_id or (edge["parent"] not in by_id and not edge["parent"].startswith("family:")):
            raise ValueError("dangling reviewed taxonomy")
        alternatives[edge["child"]].append(edge)
    for child, placements in alternatives.items():
        compatible = [p for p in placements if p["parent"] == "family:" + by_id[child]["domain"] or
                      (p["parent"] in by_id and by_id[p["parent"]]["domain"] == by_id[child]["domain"])]
        if compatible:
            preferred[child] = compatible[0]["parent"]
            adj[compatible[0]["parent"]].append({"source": compatible[0]["parent"], "target": child,
                                               "type": "reviewed_taxonomy", "taxonomy_id": compatible[0]["id"]})
    # Preserve recorded lineage in its original direction. Scientific support,
    # testing and contradiction never become default navigation infrastructure.
    for edge in graph["edges"]:
        if edge["source"] not in by_id or edge["target"] not in by_id:
            raise ValueError("dangling scientific relationship")
        if edge["type"] not in CONTEXT_TYPES:
            continue
        a, b = by_id[edge["source"]], by_id[edge["target"]]
        if a["domain"] != b["domain"] or b["id"] in preferred:
            continue
        adj[a["id"]].append({"source": a["id"], "target": b["id"], "type": "recorded_lineage",
                              "scientific_relation": deepcopy(edge), "review_state": "legacy-unreviewed"})
    for edge in registry_links:
        if edge["target"] not in preferred:adj[edge["source"]].append(edge)
    for edges in adj.values():
        edges.sort(key=lambda e: ({"reviewed_taxonomy":0,"registry_membership":1,"recorded_lineage":2}[e["type"]], e["target"],
                                  json.dumps(e.get("scientific_relation", {}), sort_keys=True)))

    links, pending, stats = [], [], {}
    for family in families:
        domain = family["id"]
        members = sorted((n for n in nodes if n["domain"] == domain), key=lambda n: n["id"])
        roots = []
        for label in family["major"]:
            match = next((n for n in members if n["label"].lower() == label.lower()), None)
            if match and match["id"] not in roots:
                roots.append(match["id"])
        # Explicit reviewed placement wins over an inherited display root.
        roots = [r for r in roots if r not in preferred]
        roots.extend(e["target"] for e in adj["family:" + domain] if e["target"] not in roots)
        seen = set(roots)
        for root in roots:
            links.append({"source": "family:" + domain, "target": root, "type": "reviewed_taxonomy" if root in preferred else "category"})

        def walk(queue: deque, placement_pending: bool = False):
            while queue:
                current = queue.popleft()
                for edge in adj[current]:
                    target = edge["target"]
                    if target in seen or (target in preferred and preferred[target] != current):
                        continue
                    seen.add(target)
                    link = deepcopy(edge)
                    link["placement_pending"] = placement_pending
                    links.append(link)
                    if placement_pending:
                        pending.append(target)
                    queue.append(target)

        walk(deque(roots))
        connected = len(seen)
        # Retain entire disconnected components as discoverable, explicitly
        # unplaced inventory. Domain metadata does not prove specialty ancestry.
        remaining=[n for n in members if n['id'] not in seen]
        while remaining:
            # Start an orphan component at its reviewed ancestor, even when
            # the child's ID sorts first. Inventory never overrides placement.
            node=next((n for n in remaining if preferred.get(n['id']) not in by_id or preferred[n['id']] in seen),None)
            if node is None:raise ValueError('reviewed navigation parent cycle')
            seen.add(node["id"])
            pending.append(node["id"])
            links.append({"source": "family:" + domain, "target": node["id"],
                          "type": "placement_pending", "placement_pending": True})
            walk(deque([node["id"]]), True)
            remaining=[n for n in remaining if n['id'] not in seen]
        stats[domain] = {"total": len(members), "connected_before_inventory": connected,
                         "placement_pending": len(members) - connected}

    source = json.dumps({"graph": graph, "registry": registry, "families": families},
                        ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return {"protocol": "fog-atlas-navigation/1", "input_sha256": hashlib.sha256(source.encode()).hexdigest(),
            "registry_nodes": additions, "registry_ids": sorted(set(registry_ids)), "links": links,
            "placement_pending_ids": sorted(pending), "coverage": stats,
            "taxonomy": taxonomy, "identities": graph.get("identities", []),
            "alternative_parents": {k:v for k,v in alternatives.items() if len(v)>1},
            "counts": {"canonical": len(graph["nodes"]), "registry_added": len(additions),
                       "discoverable": len(nodes), "placement_pending": len(pending)}}


def build(graph: dict | None = None) -> dict:
    return compile_navigation(graph or json.loads((ROOT / "data/knowledge.json").read_text(encoding="utf-8")),
                              (ROOT / "data/ologies.tsv").read_text(encoding="utf-8"),
                              json.loads((ROOT / "data/atlas-families.json").read_text(encoding="utf-8")))


def write_projection(projection: dict) -> None:
    OUTPUT.write_text(json.dumps(projection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    from evidence_pipeline import write_index
    write_index()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    projection = build()
    if args.check:
        if not OUTPUT.exists() or json.loads(OUTPUT.read_text(encoding="utf-8")) != projection:
            raise SystemExit("Stale navigation: run python scripts/atlas_navigation.py")
    else:
        write_projection(projection)
    print(json.dumps(projection["counts"]))
