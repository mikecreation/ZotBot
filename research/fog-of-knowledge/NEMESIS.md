# Nemesis interface

Fog of Knowledge is designed to be maintained by Nemesis at research scale.

Nemesis should treat the repository as an **auditable knowledge compiler**, not as a webpage.

## Fast path

From `research/fog-of-knowledge`:

```bash
python scripts/nemesis_context.py
```

That returns the current machine-readable state: coverage by domain, source gaps, challenged nodes, frontier nodes, and high-value next targets.

Research a bounded mission, then create:

```text
nemesis/batches/<batch_id>/
  manifest.json
  nodes.jsonl
  edges.jsonl
  reviews.jsonl
```

Check it:

```bash
python scripts/nemesis_apply.py nemesis/batches/<batch_id> --check
```

Apply it:

```bash
python scripts/nemesis_apply.py nemesis/batches/<batch_id> --apply
python scripts/validate.py
```

Commit the immutable batch and the compiled canonical changes together.

## GitHub workflow

Preferred autonomous workflow:

```text
read manifest
→ obtain context
→ choose bounded coverage target
→ create branch nemesis/<mission>-<batch_id>
→ research
→ write batch
→ check batch
→ apply batch
→ validate
→ commit
→ open PR
→ CI
→ merge
```

A Nemesis worker may research thousands of papers in one run. Chat output should summarize the run. The actual records belong in the batch files.

## What belongs in a batch?

### nodes.jsonl

One JSON object per line. Nodes can represent fields, concepts, methods, claims, questions, theories, papers, datasets, experiments, models, laws, or technologies.

Minimum:

```json
{"id":"claim.example","label":"Example claim","kind":"claim","domain":"physical","era":"twentieth","status":"active","summary":"...","sources":[{"id":"doi:...","title":"...","url":"https://..."}]}
```

### edges.jsonl

One relationship per line.

```json
{"source":"claim.a","target":"claim.b","type":"supports","dependency":"soft"}
```

Useful relationship types include:

`enabled`, `depends_on`, `derived_from`, `supports`, `contradicts`, `supersedes`, `replicates`, `failed_replication`, `refines`, `tests`, `cites`, `related`.

### reviews.jsonl

Graph-native peer review, counterevidence, replication, correction, or retraction.

```json
{"id":"review.claim-a.001","target":"claim.a","author":"...","date":"2026-10-04","kind":"failed_replication","result":"failed","summary":"...","sources":[{"id":"doi:...","url":"https://..."}]}
```

## Safety of the knowledge record

Nemesis may:

- add knowledge;
- strengthen provenance;
- add relations;
- challenge claims;
- add replications;
- mark a claim disputed;
- invalidate a claim with evidence;
- add a superseding theory;
- map downstream impact;
- add frontier questions.

Nemesis must not silently erase a wrong turn.

If a foundation fails, descendants can be marked broken or review-required by the compiler, but the historical graph remains visible.

## Scaling rule

The batch protocol is stable even if canonical storage changes.

Today:

`batch → compiler → knowledge.json → atlas`

Later:

`batch → compiler → database/graph store → map tiles/API → atlas`

Nemesis continues writing the same batch contract.

## Human attention

A good Nemesis run should reduce itself to a tiny human queue.

Example:

```text
12,481 records processed
8,221 new evidence relations
1,109 new claims
243 contradictions
37 candidate invalidations
9 ambiguous identity merges
4 require Michael
```

The machine does the volume. The human resolves the genuinely ambiguous decisions.
