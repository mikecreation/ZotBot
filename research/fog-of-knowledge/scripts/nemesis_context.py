#!/usr/bin/env python3
"""Emit a compact machine-readable state packet for Nemesis."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GRAPH_PATH = ROOT / "data" / "knowledge.json"
OLOGY_PATH = ROOT / "data" / "ologies.tsv"
MANIFEST_PATH = ROOT / ".nemesis.json"

CHALLENGED = {"invalidated", "disputed", "dependency-broken", "review-required"}
SOURCE_PRIORITY_KINDS = {"claim", "method", "question", "theory", "paper", "dataset", "experiment", "model", "law"}


def load_graph() -> dict:
    return json.loads(GRAPH_PATH.read_text(encoding="utf-8"))


def merge_runtime_ologies(graph: dict) -> None:
    from atlas_navigation import build
    graph["nodes"].extend(build(graph)["registry_nodes"])


def derive_statuses(graph: dict) -> dict[str, str]:
    status = {n["id"]: n.get("status", "active") for n in graph["nodes"]}
    hard_children: dict[str, list[str]] = defaultdict(list)
    soft_children: dict[str, list[str]] = defaultdict(list)

    for edge in graph["edges"]:
        if edge.get("type") not in {"depends_on", "enabled", "derived_from"}:
            continue
        target = hard_children if edge.get("dependency") == "hard" else soft_children
        target[edge["source"]].append(edge["target"])

    invalid = {node_id for node_id, value in status.items() if value == "invalidated"}

    broken: set[str] = set()
    queue = deque(invalid)
    while queue:
        current = queue.popleft()
        for child in hard_children.get(current, []):
            if child not in invalid and child not in broken:
                broken.add(child)
                queue.append(child)

    for node_id in broken:
        status[node_id] = "dependency-broken"

    review: set[str] = set()
    queue = deque(invalid | broken)
    while queue:
        current = queue.popleft()
        for child in soft_children.get(current, []):
            if child not in review:
                review.add(child)
                queue.append(child)

    for node_id in review:
        if status.get(node_id) not in {"invalidated", "dependency-broken"}:
            status[node_id] = "review-required"

    return status


def build_context(graph: dict, max_items: int) -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    statuses = derive_statuses(graph)
    by_domain: dict[str, list[dict]] = defaultdict(list)

    for node in graph["nodes"]:
        by_domain[node["domain"]].append(node)

    domain_labels = {d["id"]: d["label"] for d in graph["domains"]}
    coverage = []

    for domain_id in domain_labels:
        nodes = by_domain.get(domain_id, [])
        sourced = sum(bool(n.get("sources")) for n in nodes)
        frontier = sum(bool(n.get("frontier")) or statuses.get(n["id"]) == "frontier" for n in nodes)
        challenged = sum(statuses.get(n["id"]) in CHALLENGED for n in nodes)
        priority_missing = sum(
            not n.get("sources") and n.get("kind") in SOURCE_PRIORITY_KINDS for n in nodes
        )
        missing_any = len(nodes) - sourced
        coverage.append({
            "domain": domain_id,
            "label": domain_labels[domain_id],
            "nodes": len(nodes),
            "sourced_nodes": sourced,
            "missing_sources": missing_any,
            "priority_source_gaps": priority_missing,
            "frontier_nodes": frontier,
            "challenged_nodes": challenged,
            "source_coverage_pct": round((sourced / len(nodes) * 100), 2) if nodes else 0.0,
            "priority_score": frontier * 20 + challenged * 10 + priority_missing * 4 + missing_any,
        })

    coverage.sort(key=lambda x: (-x["priority_score"], x["label"]))

    frontier_nodes = [
        {
            "id": n["id"],
            "label": n["label"],
            "domain": n["domain"],
            "kind": n["kind"],
            "status": statuses.get(n["id"], n.get("status")),
        }
        for n in graph["nodes"]
        if n.get("frontier") or statuses.get(n["id"]) == "frontier"
    ]

    challenged_nodes = [
        {
            "id": n["id"],
            "label": n["label"],
            "domain": n["domain"],
            "kind": n["kind"],
            "status": statuses.get(n["id"], n.get("status")),
        }
        for n in graph["nodes"]
        if statuses.get(n["id"]) in CHALLENGED
    ]

    source_gaps = [
        {
            "id": n["id"],
            "label": n["label"],
            "domain": n["domain"],
            "kind": n["kind"],
            "status": statuses.get(n["id"], n.get("status")),
        }
        for n in graph["nodes"]
        if not n.get("sources") and n.get("kind") in SOURCE_PRIORITY_KINDS
    ]

    kind_counts = Counter(n["kind"] for n in graph["nodes"])
    relation_counts = Counter(e["type"] for e in graph["edges"])

    return {
        "protocol": "fog-nemesis-context/1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project_id": manifest["project_id"],
        "project_version": manifest["project_version"],
        "batch_protocol": manifest["exchange"]["batch_protocol"],
        "commands": manifest["commands"],
        "counts": {
            "nodes": len(graph["nodes"]),
            "edges": len(graph["edges"]),
            "reviews": len(graph.get("reviews", [])),
            "frontier": len(frontier_nodes),
            "challenged": len(challenged_nodes),
            "kind_counts": dict(sorted(kind_counts.items())),
            "relation_counts": dict(sorted(relation_counts.items())),
        },
        "coverage_by_domain": coverage,
        "recommended_next_domain": coverage[0]["domain"] if coverage else None,
        "frontier_nodes": frontier_nodes[:max_items],
        "challenged_nodes": challenged_nodes[:max_items],
        "priority_source_gaps": source_gaps[:max_items],
        "nemesis_policy": {
            "preferred_records_per_batch": manifest["scale"]["preferred_records_per_batch"],
            "acceptable_records_per_batch": manifest["scale"]["acceptable_records_per_batch"],
            "preserve_invalidated_history": True,
            "preferred_transport": manifest["update_policy"]["preferred_transport"],
            "human_attention_goal": "Return only genuinely ambiguous merges, foundational invalidations, or unresolved evidence conflicts to the human.",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-items", type=int, default=100)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args()

    graph = load_graph()
    from evidence_compiler import audit_index
    from atlas_navigation import build
    evidence=audit_index(graph)
    navigation=build(graph)
    merge_runtime_ologies(graph)
    packet = build_context(graph, max(0, args.max_items))
    packet['evidence_review_coverage']=evidence['counts']
    packet['identity_candidates']=evidence['identity_candidates'][:max(0,args.max_items)]
    packet['navigation_coverage']=navigation['counts']
    packet['review_priority']='Exact source-to-assertion review, source gaps and justified placement precede record volume.'

    text = json.dumps(
        packet,
        ensure_ascii=False,
        separators=(",", ":") if args.compact else None,
        indent=None if args.compact else 2,
    ) + "\n"

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
