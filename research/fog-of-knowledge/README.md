# Fog of Knowledge

**Fog of Knowledge** is an open, living atlas of human knowledge: where ideas came from, what they depend on, what evidence supports them, what has been overturned, and where the validated map ends and the unresolved frontier begins.

The underlying data is a **temporal dependency graph**. The interface is deliberately hierarchical so millions of records can remain understandable.

## v0.2 interface

The home screen is now a radial atlas centered on **Human Knowledge**.

Its first ring contains ten major navigational families:

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

Clicking a family opens a second radial view containing its major branches plus an outer constellation of mapped specialties. Actual support, contradiction, supersession, and dependency relationships remain attached to the underlying nodes and appear when drilling into them.

The top-level family ring is a navigation taxonomy, not a fabricated causal dependency graph.

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
- Is designed for forks and pull requests.

## Run it

```bash
cd research/fog-of-knowledge
python -m http.server 8080
```

Open `http://localhost:8080`.

## Data

`data/knowledge.json` is the canonical core graph. `data/ologies.tsv` is the compact curated registry loaded at runtime.

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

Version 0.2 contains the radial atlas shell, the evolutionary seed graph, historical invalidation examples, current frontier nodes, and hundreds of field/specialty entries. It is still a seed, not a claim of completed human knowledge.

**Never erase a wrong turn. Mark it, preserve it, and show exactly what depended on it.**
