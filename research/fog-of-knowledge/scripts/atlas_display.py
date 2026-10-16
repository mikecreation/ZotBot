"""Lossless UI records and exact node support, without duplicated proof bundles.

knowledge.json remains the authority. Every historical node assertion retains
all its fields except canonical_record, whose ID is kept as target_id. Complete
current canonical records remain in nodes; this artifact grants no review status.
"""
from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "atlas-display.json"
PROTOCOL = "fog-atlas-display/1"
SCHEMA_VERSION = 1


def compile_display(graph: dict, navigation: dict) -> dict:
    input_hash = navigation.get("input_sha256")
    if navigation.get("protocol") != "fog-atlas-navigation/1" or not isinstance(input_hash, str) or not re.fullmatch(
        r"[0-9a-f]{64}", input_hash
    ):
        raise ValueError("display projection requires a bound navigation snapshot")
    # Full UI records, including future canonical fields, survive unchanged.
    display = deepcopy({k: v for k, v in graph.items() if k != "evidence_reviews"})
    support = {}
    for bundle in graph.get("evidence_reviews", []):
        for assertion in bundle.get("assertions", []):
            if assertion.get("target_kind") != "node":
                continue
            target_id = assertion["canonical_record"]["id"]
            slim = deepcopy({k: v for k, v in assertion.items() if k != "canonical_record"})
            slim["target_id"] = target_id
            support.setdefault(target_id, []).append(slim)
    display.update(protocol=PROTOCOL, schema_version=SCHEMA_VERSION,
                   input_sha256=navigation["input_sha256"], node_support=support)
    return display


def projection_bytes(display: dict) -> bytes:
    """One deterministic, minified UTF-8 representation."""
    return json.dumps(display, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":")).encode("utf-8")


def write_display(graph: dict, navigation: dict, output: Path | None = None) -> None:
    (output or OUTPUT).write_bytes(projection_bytes(compile_display(graph, navigation)))


def validate_display(graph: dict, navigation: dict, output: Path | None = None) -> None:
    path = output or OUTPUT
    if not path.exists() or path.read_bytes() != projection_bytes(compile_display(graph, navigation)):
        raise ValueError("stale display projection; run python scripts/atlas_navigation.py")
