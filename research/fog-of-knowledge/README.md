# Fog of Knowledge

**Fog of Knowledge** is an open, living atlas of human knowledge: where ideas came from, what they depend on, what evidence supports them, what has been overturned, and where the validated map ends and the unresolved frontier begins.

The underlying data is a **temporal dependency graph**. The interface is deliberately progressive so the graph can grow without turning into an unreadable wall of nodes.

## v0.6 — Recursive atlas

The atlas now uses one recursive navigation model.

```text
Human Knowledge
→ Great Field
→ Category
→ Subcategory
→ Specialty
→ Claim / Method / Theory
→ Frontier
```

Every click reveals the next mapped layer **inside the same atlas**. There is no separate second-level chart anymore.

The active path remains visible while siblings collapse away. Back removes one level at a time. Large sibling sets are paged rather than stacked on top of one another.

The ten great fields are:

1. Foundations of Knowing
2. Mathematics & Logic
3. Physical Sciences
4. Earth & Environment
5. Life Sciences
6. Medicine & Health
7. Engineering & Technology
8. Information & Cognition
9. Social Sciences
10. Humanities & Philosophy

The renderer only draws:

- the center;
- the ten great fields;
- the selected path;
- the current node's immediate children.

That bounded rendering model is the performance contract for future Nemesis-scale growth.

## Nemesis-native research interface

Fog of Knowledge exposes a machine interface for autonomous research.

Nemesis should start by reading:

```text
AGENTS.md
NEMESIS.md
.nemesis.json
```

Then:

```bash
python scripts/nemesis_context.py
```

A research run writes an immutable batch:

```text
nemesis/batches/<batch_id>/
  manifest.json
  nodes.jsonl
  edges.jsonl
  reviews.jsonl
```

Validate and compile it with:

```bash
python scripts/nemesis_apply.py nemesis/batches/<batch_id> --check
python scripts/nemesis_apply.py nemesis/batches/<batch_id> --apply
python scripts/validate.py
```

The batch contract is intentionally independent of the UI and storage engine.

## Core behavior

- Starts from reconstructable early human distinctions and practices.
- Recursively expands toward the mapped frontier.
- Supports multi-parent ancestry.
- Keeps falsified and superseded knowledge visible.
- Crosses invalidated nodes out in red.
- Distinguishes hard dependencies from soft support.
- Automatically marks hard descendants as broken when a prerequisite fails.
- Marks softer descendants for review instead of automatically calling them false.
- Stores provenance, peer reviews, replications, failed replications, counterexamples, and supersession records.
- Includes an expandable `-ology` registry.
- Is designed for autonomous Nemesis batches and pull requests.

## Run the atlas

```bash
cd research/fog-of-knowledge
python -m http.server 8080
```

Open `http://localhost:8080`.

## Data

`data/knowledge.json` is the current canonical core graph. `data/ologies.tsv` is the compact curated registry loaded at runtime.

Navigation follows mapped graph relationships. If a node currently has no mapped descendant, the atlas exposes that location as an **unmapped next layer** rather than inventing a taxonomy relation.

A dependency edge can be `hard` or `soft`.

- **hard**: failure of the source breaks the descendant dependency.
- **soft**: failure of the source triggers review; the descendant may survive through independent evidence.

## Peer review

Wrong turns are preserved. A challenge should attach a proof, dataset, code artifact, replication, counterexample, correction, retraction, or methods critique.

## Current seed

Version 0.6 contains the recursive atlas, Nemesis machine contract, batch compiler, graph validator, historical invalidation examples, frontier nodes, and hundreds of field/specialty entries.

It is still a seed, not a claim of completed human knowledge.

**Never erase a wrong turn. Mark it, preserve it, and show exactly what depended on it.**
