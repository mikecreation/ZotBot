# Fog of Knowledge

**Fog of Knowledge** is an open, living atlas of human knowledge: where ideas came from, what they depend on, what evidence supports them, what has been overturned, and where the validated map ends and the unresolved frontier begins.

The underlying data is a **temporal dependency graph**. The interface is deliberately layered so millions of records can remain understandable.

## v0.5 — Nemesis-native

Fog of Knowledge now exposes a machine interface for autonomous research.

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

That returns current coverage, source gaps, challenged nodes, frontier nodes, and suggested next domains.

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

The batch contract is intentionally independent of the UI and storage engine. Nemesis can keep using the same protocol if canonical storage later moves from JSON to SQLite, a graph database, or tiled research indexes.

## Atlas structure

The home screen is centered on **Human Knowledge**.

The inner ring contains foundational human ways of knowing. Outside that are nine great fields:

1. Mathematics & Logic
2. Physical Sciences
3. Earth & Environment
4. Life Sciences
5. Medicine & Health
6. Engineering & Technology
7. Information & Cognition
8. Social Sciences
9. Humanities & Philosophy

Clicking a great field expands its next categories in place. Clicking a category opens a bounded **field lens** showing prerequisites/support, descendants/effects, frontier questions, nearby specialties, and challenged knowledge.

The navigation hierarchy is not treated as causal evidence. Actual dependency, support, contradiction, replication, and supersession relations live in the graph.

## Core behavior

- Starts from reconstructable early human distinctions and practices.
- Expands through formal disciplines, sciences, humanities, engineering, and current research frontiers.
- Supports multi-parent ancestry.
- Keeps falsified and superseded knowledge visible.
- Crosses invalidated nodes out in red at evidence/dependency depth.
- Distinguishes hard dependencies from soft support.
- Automatically marks hard descendants as broken when a prerequisite fails.
- Marks softer descendants for review instead of automatically calling them false.
- Stores provenance, peer reviews, replications, failed replications, counterexamples, and supersession records.
- Includes an expandable `-ology` registry.
- Is designed for forks, autonomous research batches, and pull requests.

## Run the atlas

```bash
cd research/fog-of-knowledge
python -m http.server 8080
```

Open `http://localhost:8080`.

## Data

`data/knowledge.json` is the current canonical core graph. `data/ologies.tsv` is the compact curated registry loaded at runtime.

A node contains identity, era, domain, epistemic state, summary, tags, and sources.

A dependency edge can be `hard` or `soft`.

- **hard**: failure of the source breaks the descendant dependency.
- **soft**: failure of the source triggers review; the descendant may survive via independent evidence.

## Peer review

A challenge targets the exact node under dispute and should attach a proof, dataset, code artifact, replication, counterexample, correction, retraction, or detailed methods critique.

Wrong turns are preserved. The map should show how knowledge changed, not rewrite history after the fact.

## Taxonomy strategy

There is no single authoritative taxonomy covering all human knowledge. Fog of Knowledge is intentionally compositional. It can cross-link mature systems such as OECD Fields of R&D, NLM MeSH, MSC, and domain-specific ontologies without flattening them into one hierarchy.

The `-ology` registry is open-ended. `scripts/import_wiktionary_ologies.py` stages additional documented English `-ology` terms for classification and provenance review.

## Current seed

Version 0.5 contains the layered atlas, field lens, Nemesis machine contract, batch compiler, graph validator, historical invalidation examples, frontier nodes, and hundreds of field/specialty entries.

It is still a seed, not a claim of completed human knowledge.

**Never erase a wrong turn. Mark it, preserve it, and show exactly what depended on it.**
