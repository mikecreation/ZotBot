#!/usr/bin/env python3
"""Validate and optionally compile an immutable Nemesis batch into Fog of Knowledge."""

from __future__ import annotations

import argparse
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[1]
GRAPH_PATH = ROOT / "data" / "knowledge.json"
LEDGER_PATH = ROOT / "nemesis" / "applied.jsonl"

ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")

ALLOWED_KINDS = {
    "origin", "practice", "concept", "field", "method", "claim", "question",
    "theory", "paper", "dataset", "experiment", "model", "law", "technology",
}
ALLOWED_STATUSES = {
    "foundational", "established", "active", "disputed", "frontier",
    "invalidated", "historical", "reported",
}
ALLOWED_RELATIONS = {
    "enabled", "depends_on", "derived_from", "supports", "contradicts",
    "supersedes", "replicates", "failed_replication", "refines", "tests",
    "cites", "related",
}
SOURCE_REQUIRED_KINDS = {"claim", "method"}


# Canonical semantics require explicit adjudication, never alias coercion.
DOMAIN_ALIASES = {}
ERA_ALIASES = {}
STATUS_ALIASES = {}
KIND_ALIASES = {}


def normalize_batch(manifest, nodes, reviews, graph):
    """Return unmodified records; unsupported semantics fail validation."""
    return manifest, nodes, reviews


class BatchError(Exception):
    pass


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise BatchError(f"missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise BatchError(f"invalid JSON in {path}: {exc}") from exc


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []

    records: list[dict] = []
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        try:
            value = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise BatchError(f"{path}:{line_no}: invalid JSON: {exc}") from exc
        if not isinstance(value, dict):
            raise BatchError(f"{path}:{line_no}: record must be a JSON object")
        records.append(value)
    return records


def ensure_id(value: object, where: str) -> str:
    if not isinstance(value, str) or not ID_RE.match(value):
        raise BatchError(f"{where}: invalid stable id {value!r}")
    return value


def unique_records(records: list[dict], key: str, label: str) -> None:
    seen: set[str] = set()
    for record in records:
        value = ensure_id(record.get(key), f"{label}.{key}")
        if value in seen:
            raise BatchError(f"duplicate {label} {key}: {value}")
        seen.add(value)


def validate_manifest(manifest: dict, graph: dict) -> None:
    if manifest.get("protocol") != "fog-nemesis-batch/1":
        raise BatchError("manifest.protocol must be fog-nemesis-batch/1")

    for key in ("batch_id", "created_at", "agent", "mission", "scope"):
        if key not in manifest:
            raise BatchError(f"manifest missing {key}")

    ensure_id(manifest["batch_id"], "manifest.batch_id")

    scope = manifest["scope"]
    if not isinstance(scope, dict) or not isinstance(scope.get("domains"), list) or not scope["domains"]:
        raise BatchError("manifest.scope.domains must be a non-empty array")

    valid_domains = {d["id"] for d in graph["domains"]}
    unknown = set(scope["domains"]) - valid_domains
    if unknown:
        raise BatchError(f"manifest has unknown domains: {sorted(unknown)}")


def validate_nodes(nodes: list[dict], graph: dict, manifest: dict) -> None:
    valid_domains = {d["id"] for d in graph["domains"]}
    valid_eras = {e["id"] for e in graph["eras"]}
    scope_domains = set(manifest["scope"]["domains"])

    for node in nodes:
        node_id = ensure_id(node.get("id"), "node.id")
        for key in ("label", "kind", "domain", "era", "status"):
            if key not in node:
                raise BatchError(f"{node_id}: node missing {key}")

        if node["kind"] not in ALLOWED_KINDS:
            raise BatchError(f"{node_id}: unsupported kind {node['kind']!r}")
        if node["status"] not in ALLOWED_STATUSES:
            raise BatchError(f"{node_id}: unsupported status {node['status']!r}")
        if node["domain"] not in valid_domains:
            raise BatchError(f"{node_id}: unknown domain {node['domain']!r}")
        if node["era"] not in valid_eras:
            raise BatchError(f"{node_id}: unknown era {node['era']!r}")
        if node["domain"] not in scope_domains:
            raise BatchError(f"{node_id}: domain {node['domain']!r} is outside manifest scope")

        if node["kind"] in SOURCE_REQUIRED_KINDS and not node.get("sources"):
            raise BatchError(f"{node_id}: {node['kind']} nodes require per-node provenance sources")


def validate_edges(edges: list[dict], future_node_ids: set[str]) -> None:
    for edge in edges:
        source = ensure_id(edge.get("source"), "edge.source")
        target = ensure_id(edge.get("target"), "edge.target")
        relation = edge.get("type")

        if source == target:
            raise BatchError(f"self-edge is not allowed: {source}")
        if relation not in ALLOWED_RELATIONS:
            raise BatchError(f"{source}->{target}: unsupported relation {relation!r}")
        if edge.get("dependency") not in {None, "hard", "soft"}:
            raise BatchError(f"{source}->{target}: dependency must be hard, soft, or omitted")
        if source not in future_node_ids:
            raise BatchError(f"edge source does not exist after batch: {source}")
        if target not in future_node_ids:
            raise BatchError(f"edge target does not exist after batch: {target}")


def validate_reviews(reviews: list[dict], future_node_ids: set[str]) -> None:
    for review in reviews:
        review_id = ensure_id(review.get("id"), "review.id")
        target = ensure_id(review.get("target"), f"{review_id}.target")

        for key in ("author", "date", "kind", "result", "summary"):
            if key not in review:
                raise BatchError(f"{review_id}: review missing {key}")
        if target not in future_node_ids:
            raise BatchError(f"{review_id}: review target does not exist after batch: {target}")


def merge_unique(old: list, new: list, identity) -> list:
    result = list(old or [])
    seen = {identity(item) for item in result}
    for item in new or []:
        key = identity(item)
        if key not in seen:
            result.append(item)
            seen.add(key)
    return result


def source_key(source: object) -> str:
    if isinstance(source, dict):
        return str(source.get("id") or source.get("url") or json.dumps(source, sort_keys=True))
    return str(source)


def merge_node(existing: dict, incoming: dict) -> dict:
    merged = deepcopy(existing)

    if existing.get("status") == "invalidated" and incoming.get("status") not in {None, "invalidated"}:
        raise BatchError(
            f"{existing['id']}: autonomous batch cannot reactivate an invalidated node; "
            "add a reviewed superseding node instead"
        )

    old_label = existing.get("label")
    new_label = incoming.get("label")
    if new_label and old_label and new_label != old_label:
        merged["aliases"] = merge_unique(merged.get("aliases", []), [old_label], str)

    for key, value in incoming.items():
        if key == "id":
            continue
        if key == "sources":
            merged["sources"] = merge_unique(merged.get("sources", []), value, source_key)
        elif key in {"tags", "aliases"}:
            merged[key] = merge_unique(merged.get(key, []), value, str)
        else:
            merged[key] = value

    return merged


def edge_key(edge: dict) -> tuple:
    return (
        edge.get("source"),
        edge.get("target"),
        edge.get("type"),
        edge.get("dependency"),
    )


def compile_batch(graph: dict, nodes: list[dict], edges: list[dict], reviews: list[dict]) -> dict:
    result = deepcopy(graph)
    by_id = {n["id"]: n for n in result["nodes"]}

    for incoming in nodes:
        node_id = incoming["id"]
        if node_id in by_id:
            merged = merge_node(by_id[node_id], incoming)
            index = next(i for i, n in enumerate(result["nodes"]) if n["id"] == node_id)
            result["nodes"][index] = merged
            by_id[node_id] = merged
        else:
            record = deepcopy(incoming)
            record.setdefault("sources", [])
            record.setdefault("tags", [])
            record.setdefault("aliases", [])
            record.setdefault("frontier", record.get("status") == "frontier")
            result["nodes"].append(record)
            by_id[node_id] = record

    existing_edges = {edge_key(e) for e in result["edges"]}
    for edge in edges:
        key = edge_key(edge)
        if key not in existing_edges:
            result["edges"].append(deepcopy(edge))
            existing_edges.add(key)

    existing_reviews = {r.get("id") for r in result.get("reviews", [])}
    for review in reviews:
        if review["id"] not in existing_reviews:
            result.setdefault("reviews", []).append(deepcopy(review))
            existing_reviews.add(review["id"])

    return result


def validate_invalidation_reviews(original: dict, nodes: list[dict], reviews: list[dict]) -> None:
    old_status = {n["id"]: n.get("status") for n in original["nodes"]}
    review_targets = {r["target"] for r in reviews}

    for node in nodes:
        node_id = node["id"]
        is_new_invalidation = (
            node.get("status") == "invalidated"
            and old_status.get(node_id) != "invalidated"
        )
        if is_new_invalidation and node_id not in review_targets:
            raise BatchError(
                f"{node_id}: invalidation requires a review/counterevidence record in the same batch"
            )


def validate_compiled_graph(graph: dict) -> None:
    ids = [n["id"] for n in graph["nodes"]]
    if len(ids) != len(set(ids)):
        raise BatchError("compiled graph contains duplicate node ids")

    node_ids = set(ids)
    review_ids: set[str] = set()

    for edge in graph["edges"]:
        if edge["source"] not in node_ids or edge["target"] not in node_ids:
            raise BatchError(f"compiled graph contains dangling edge: {edge}")

    for review in graph.get("reviews", []):
        review_id = review.get("id")
        if review_id:
            if review_id in review_ids:
                raise BatchError(f"compiled graph contains duplicate review id: {review_id}")
            review_ids.add(review_id)
        if review.get("target") not in node_ids:
            raise BatchError(f"compiled graph contains dangling review: {review}")


def read_ledger() -> list[dict]:
    if not LEDGER_PATH.exists():
        return []
    return read_jsonl(LEDGER_PATH)


def append_ledger(manifest: dict, nodes: list[dict], edges: list[dict], reviews: list[dict]) -> None:
    ledger = read_ledger()
    if any(entry.get("batch_id") == manifest["batch_id"] for entry in ledger):
        return

    entry = {
        "protocol": "fog-nemesis-ledger/1",
        "batch_id": manifest["batch_id"],
        "applied_at": datetime.now(timezone.utc).isoformat(),
        "agent": manifest["agent"],
        "mission": manifest["mission"],
        "counts": {
            "nodes": len(nodes),
            "edges": len(edges),
            "reviews": len(reviews),
        },
    }

    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LEDGER_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("batch_dir", type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    batch_dir = args.batch_dir.resolve()
    graph = read_json(GRAPH_PATH)
    manifest = read_json(batch_dir / "manifest.json")
    nodes = read_jsonl(batch_dir / "nodes.jsonl")
    edges = read_jsonl(batch_dir / "edges.jsonl")
    reviews = read_jsonl(batch_dir / "reviews.jsonl")

    manifest, nodes, reviews = normalize_batch(manifest, nodes, reviews, graph)

    validate_manifest(manifest, graph)
    unique_records(nodes, "id", "node")
    unique_records(reviews, "id", "review")
    validate_nodes(nodes, graph, manifest)

    current_ids = {n["id"] for n in graph["nodes"]}
    future_ids = current_ids | {n["id"] for n in nodes}
    validate_edges(edges, future_ids)
    validate_reviews(reviews, future_ids)
    validate_invalidation_reviews(graph, nodes, reviews)

    from evidence_compiler import EvidenceError, FILES, candidate_digest, load_candidate, enforce, compile_reviewed, validate_evidence_history
    from evidence_pipeline import load_decisions, policy, retain_quarantine, persist_sources, write_index
    candidate = load_candidate(batch_dir)
    try:
        validate_evidence_history(graph,ROOT,policy())
        proof = enforce(candidate, graph, load_decisions(candidate), policy())
        from source_capture import validate_captures
        validate_captures(proof['sources'])
        compiled = compile_reviewed(graph, candidate, proof)
    except EvidenceError as exc:
        retain_quarantine(candidate, exc)
        raise BatchError(str(exc)) from exc
    validate_compiled_graph(compiled)

    summary = {
        "protocol": "fog-nemesis-apply-result/1",
        "mode": "apply" if args.apply else "check",
        "batch_id": manifest["batch_id"],
        "valid": True,
        "counts": {
            "nodes_in_batch": len(nodes),
            "edges_in_batch": len(edges),
            "reviews_in_batch": len(reviews),
            "compiled_nodes": len(compiled["nodes"]),
            "compiled_edges": len(compiled["edges"]),
            "compiled_reviews": len(compiled.get("reviews", [])),
            "taxonomy_in_batch": len(candidate["taxonomy.jsonl"]),
            "compiled_taxonomy": len(compiled.get("taxonomy", [])),
            "evidence_reviewed_targets": proof["reviewed_targets"],
        },
    }

    # Compile before any writes so invalid navigation cannot partially apply.
    from atlas_navigation import build, write_projection
    try:
        projection = build(compiled)
    except ValueError as exc:
        raise BatchError(str(exc)) from exc

    if args.apply:
        retained = ROOT / "nemesis/batches" / manifest["batch_id"]
        if retained.resolve()!=batch_dir:
            if retained.exists() and candidate_digest(load_candidate(retained))!=candidate_digest(candidate):
                raise BatchError("immutable batch ID already contains another revision; use a new batch ID")
            retained.mkdir(parents=True,exist_ok=True)
            for name in FILES:
                source=batch_dir/name
                if source.exists():(retained/name).write_bytes(source.read_bytes())
        persist_sources(proof)
        # Publish one complete canonical snapshot; interrupted derived-output
        # writes are recoverable by rebuilding navigation and the evidence index.
        import os,tempfile
        handle,temporary=tempfile.mkstemp(prefix='.knowledge-',suffix='.json',dir=GRAPH_PATH.parent)
        try:
            with os.fdopen(handle,'w',encoding='utf-8',newline='') as stream:
                stream.write(json.dumps(compiled,ensure_ascii=False,indent=2)+'\n')
                stream.flush();os.fsync(stream.fileno())
            os.replace(temporary,GRAPH_PATH)
        finally:
            if Path(temporary).exists():Path(temporary).unlink()
        write_projection(projection)
        write_index(compiled)
        append_ledger(manifest, nodes, edges, reviews)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BatchError as exc:
        print(json.dumps({
            "protocol": "fog-nemesis-apply-result/1",
            "valid": False,
            "error": str(exc),
            "disposition": "quarantined",
            "requires_explicit_adjudication": True,
        }, ensure_ascii=False, indent=2))
        raise SystemExit(2)
