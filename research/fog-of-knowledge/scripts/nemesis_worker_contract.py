#!/usr/bin/env python3
'''Emit the LIVE Fog compiler contract for worker prompts (never hard-code stale enums).'''
from __future__ import annotations
import json
from pathlib import Path

# Allow running as script from repo root or scripts/
ROOT = Path(__file__).resolve().parents[1]
APPLY = Path(__file__).resolve().parent / "nemesis_apply.py"
GRAPH = ROOT / "data" / "knowledge.json"


def _load_apply_sets():
    text = APPLY.read_text(encoding="utf-8")
    ns: dict = {}
    # Execute only the enum/constant preamble safely by truncating before first def/class after aliases
    # Prefer importing via runpy-like exec of module constants.
    code = []
    for line in text.splitlines():
        if line.startswith("def ") or line.startswith("class "):
            # keep alias helper defs out; stop at first real function after constants
            if code and any(k in "\n".join(code) for k in ("ALLOWED_KINDS", "DOMAIN_ALIASES")):
                # include alias maps which are assignments, stop before def _uniq etc? include DOMAIN maps
                if line.startswith("def _uniq") or line.startswith("def normalize") or line.startswith("def _alias") or line.startswith("class "):
                    break
        code.append(line)
    ns["__file__"] = str(APPLY)
    exec(compile("\n".join(code) + "\n", str(APPLY), "exec"), ns)
    return ns


def placement_lane(domains: list[str]) -> dict:
    """Source-backed PLACEMENT CANDIDATE lane ("X is narrower than Y")."""
    return {
        "protocol": "fog-placement-candidate/1",
        "purpose": "Resolve 'placement pending' atlas nodes with reviewed taxonomy, never by inference.",
        "batch_layout": "nemesis/batches/<batch_id>/{manifest.json,sources.jsonl,assertions.jsonl,taxonomy.jsonl}; nodes/edges/reviews files may be empty or absent",
        "candidate_file": "taxonomy.jsonl",
        "candidate_schema": "nemesis/schema/placement-candidate.schema.json",
        "candidate_record": {"id": "stable id, e.g. taxonomy.<child>.narrower.<parent>", "parent": "existing same-family node id or family:<child domain>",
                             "child": "existing canonical node id (the pending node)", "type": "narrower"},
        "candidate_record_fields_only": ["id", "parent", "child", "type"],
        "assertion_record": {"target_kind": "taxonomy", "target_sha256": "sha256 of the canonical taxonomy record (sorted keys, compact JSON)",
                             "canonical_record": "the exact taxonomy.jsonl record", "statement": "the placement claim as the source supports it",
                             "scope": "population/time/assumptions/uncertainty/units/quantifiers (null when unknown)",
                             "support": "exact excerpt(s) from captured sources classifying child under parent",
                             "confidence": "worker confidence in (0,1]; informational only, never passes review"},
        "family_roots": ["family:" + d for d in domains],
        "compiler_checks": [
            "child is an existing canonical node; parent exists (node or family root)",
            "same family: parent node domain == child domain, or parent == family:<child domain>",
            "taxonomy (existing + candidate) remains a DAG: no cycles, no self-placement",
            "dedupe: no repeated (parent, child) pair in the batch; an existing pair with another id is rejected; an identical record re-applies idempotently",
            "immutable taxonomy ids; only id/parent/child/type in the canonical record",
            "per-record entailment AND adversarial review by distinct non-author reviewers bound to the exact candidate and context hashes",
        ],
        "on_failure": "the whole candidate stays in nemesis/quarantine; nothing is written to knowledge.json",
        "multi_parent": "several reviewed same-family parents are allowed; navigation picks one deterministically and exposes the others as alternative_parents",
        "not_placement_evidence": ["name similarity", "co-occurrence", "supports/tests/contradicts/cites relations", "cross-domain lineage", "heuristic parent suggestions", "worker confidence"],
    }


def build_contract() -> dict:
    ns = _load_apply_sets()
    graph = json.loads(GRAPH.read_text(encoding="utf-8"))
    domains = [d["id"] for d in graph.get("domains", [])]
    eras = [e["id"] for e in graph.get("eras", [])]
    review_policy = json.loads((ROOT/"data/evidence-policy.json").read_text(encoding="utf-8"))
    return {
        "protocol": "fog-nemesis-worker-contract/1",
        "generated_from": {
            "apply": "scripts/nemesis_apply.py",
            "graph": "data/knowledge.json",
        },
        "worker_emits": [
            "source",
            "extracted_assertion",
            "entity_candidate",
            "relationship_candidate",
            "confidence",
        ],
        "worker_must_not": [
            "author_canonical_taxonomy_placement",
            "author_visual_parent_edges",
            "flatten_all_relations_to_related_soft",
            "hard_code_stale_era_or_kind_enums",
        ],
        "compiler_decides": [
            "reject_unsupported_or_uncertain_representation",
            "taxonomy_placement_from_reviewed_placement_candidates_only",
            "publish_reviewed_records_without_semantic_coercion",
            "deterministic_visual_projection_separate_from_evidence",
        ],
        "evidence_files": ["sources.jsonl","assertions.jsonl","taxonomy.jsonl","identities.jsonl"],
        "placement_lane": placement_lane(domains),
        "review_policy": review_policy,
        "representation_policy": review_policy.get("representation_policy", {}),
        "review_example": "scripts/test_evidence_compiler.py:fixture (synthetic example, not real scientific evidence)",
        "edge_kinds_distinct": sorted(ns.get("ALLOWED_RELATIONS", [])),
        "allowed_kinds": sorted(ns.get("ALLOWED_KINDS", [])),
        "allowed_statuses": sorted(ns.get("ALLOWED_STATUSES", [])),
        "atlas_domains": domains,
        "atlas_eras": eras,
        "domain_aliases": ns.get("DOMAIN_ALIASES", {}),
        "era_aliases": ns.get("ERA_ALIASES", {}),
        "kind_aliases": ns.get("KIND_ALIASES", {}),
        "status_aliases": ns.get("STATUS_ALIASES", {}),
        "prompt_rules": [
            "Read this contract each run; do not memorize old era labels like ancient/early_modern/twenty_first.",
            "Prefer writing nemesis/batches/<batch_id>/{manifest,nodes,edges,reviews}.jsonl over pasting huge JSON in chat.",
            "Formatting retries must not rewrite sources, scientific claims, or relation semantics.",
            "Use the compiler source capture before review; keep the capture_id and retrieval metadata unchanged. Worker-written text attached to a real URL is not a retrieved source. Retain exact source text, sha256, retrieval time and source URL. Assertions require exact Unicode code-point start/end excerpts, explicit scope, target hash and the full proposed canonical record.",
            "Every node, edge, review, taxonomy and identity candidate needs its own supported assertion. Include an explicit frontier boolean and every inherited field of an updated node.",
            "Use explicit neutral metadata when its positive interpretation is unsupported: status reported attributes a scoped result/proposal to its captured source without endorsement; era undated leaves chronology unresolved; frontier false makes no current-frontier currency claim. Do not substitute these automatically for rejected metadata: author a new complete candidate revision and obtain both reviews. Neutral metadata never excuses an unsupported assertion, kind, domain, relationship, or strengthened scope.",
            "Separate entailment and adversarial reviewers must approve the exact candidate revision. The candidate author cannot self-review. Worker confidence and citations alone never pass ingestion.",
            "Unsupported or uncertain candidates stay in quarantine. Classification, placement and identity cannot be invented by a formatting normalizer.",
            "Optional node.public_frontier metadata uses category open-question/public-result/company-tool; capability_status publicly-described/undisclosed; disclosed_at exact YYYY-MM-DD or null; source_ids identifying captured supporting sources. Company/tool names and each claimed capability must be publicly supported. Private or undisclosed capabilities remain unknown. A disclosure date never establishes world-leading currency.",
            "Taxonomy is not a scientific relationship; UI parent is not an epistemic edge.",
            "To resolve a placement-pending node, propose a placement candidate in taxonomy.jsonl ({id,parent,child,type:narrower}) with its own target_kind taxonomy assertion carrying exact source excerpts and confidence in (0,1]. Parent must be a same-family node or family:<domain>. The compiler rejects cycles, missing endpoints, cross-family and duplicate placements, and publishes only after entailment and adversarial review.",
            "Propose an explicit relation type only when justified; unknown types remain unresolved candidates, never default to related/soft.",
        ],
    }


def prompt_block(contract: dict | None = None) -> str:
    c = contract or build_contract()
    return (
        "FOG LIVE COMPILER CONTRACT (machine-generated; obey exactly)\n"
        + json.dumps({
            "atlas_domains": c["atlas_domains"],
            "atlas_eras": c["atlas_eras"],
            "allowed_kinds": c["allowed_kinds"],
            "allowed_statuses": c["allowed_statuses"],
            "allowed_relations": c["edge_kinds_distinct"],
            "worker_emits": c["worker_emits"],
            "worker_must_not": c["worker_must_not"],
            "compiler_decides": c["compiler_decides"],
            "evidence_files": c["evidence_files"],
            "placement_lane": c["placement_lane"],
            "review_policy": c["review_policy"],
            "representation_policy": c["representation_policy"],
            "prompt_rules": c["prompt_rules"],
        }, ensure_ascii=False, indent=2)
    )


def main() -> int:
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--prompt", action="store_true", help="Print prompt block only")
    args = p.parse_args()
    contract = build_contract()
    if args.prompt:
        print(prompt_block(contract))
    else:
        print(json.dumps(contract, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

