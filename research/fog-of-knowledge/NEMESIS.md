# Nemesis interface

Fog of Knowledge is designed to be maintained by Nemesis at research scale.

Nemesis should treat the repository as an **auditable knowledge compiler**, not as a webpage.

## Fast path

The Nemesis **Expand map with crew** integration now uses a durable discovery,
capture, candidate, dual-review and publication handoff. See
[EVIDENCE_CREW.md](nemesis/integration/EVIDENCE_CREW.md) for the runtime patch,
restart check and failure states. Legacy four-file worker replies remain drafts.

From `research/fog-of-knowledge`:

```bash
python scripts/nemesis_context.py
```

That returns the current machine-readable state: coverage by domain, source gaps, challenged nodes, frontier nodes, and high-value next targets.

For Expand/crew prompts, inject the **live** compiler contract each run (never hard-code era/kind/relation enums):

```bash
python scripts/nemesis_worker_contract.py --prompt
```

Workers propose `source -> extracted_assertion -> entity_candidate -> relationship_candidate`. Explicit review owns scientific interpretation; the deterministic compiler checks bindings and publishes reviewed representations. Taxonomy, evidence relations, dependency strength and visual parent remain distinct. Formatting retries must not silently rewrite sources or scientific claims.

Retain the manifest, record files, source snapshots and scoped assertions under `nemesis/batches/<batch_id>/`. See [SCIENTIFIC_COMPILER.md](SCIENTIFIC_COMPILER.md) for the exact evidence contract.

Research a bounded mission, then create:

```text
nemesis/batches/<batch_id>/
  manifest.json
  nodes.jsonl
  edges.jsonl
  reviews.jsonl
  sources.jsonl
  assertions.jsonl
  taxonomy.jsonl       # optional reviewed placements
  identities.jsonl     # optional reviewed concept links
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
→ allocate fair concurrent domain capacity
→ Brain proposes and justifies an investigation from canonical findings
→ admit a durable nonduplicate investigation, including revisits or novel topics
→ create branch nemesis/<mission>-<batch_id>
→ research
→ write batch
→ exact source/representation review
→ check batch
→ apply batch
→ validate
→ commit
→ open PR
→ CI
→ merge
```

A Nemesis worker may research thousands of papers in one run. Chat output should summarize the run. The actual records belong in the batch files.

Engineering integrity checks, the boundary dependency registry, the independent
mission watchdog and measured capacity results are documented in
[ENGINEERING_IMMUNE_SYSTEM.md](nemesis/integration/ENGINEERING_IMMUNE_SYSTEM.md).
`scripts/nemesis_retrieve.py` exposes exact snapshot-pinned graph/evidence pages
without changing scientific authority. New Native decisions use the catalog and
paged planning adapter described in [PAGED_PLANNING.md](nemesis/integration/PAGED_PLANNING.md).
Retained source checks and loaded/live verification are separate release gates.

The current Brain transport uses complete packet files first, with exact inline
fallback only after a visible, explicit upload block. Bound worker and primary
tabs have an independent page watchdog and owned stream-error refresh. Disabled upload
inputs and menu quota notices are handled by the
[6.2.10 upload recovery](nemesis/integration/UPLOAD_RECOVERY.md). See
[TAB_RECOVERY.md](nemesis/integration/TAB_RECOVERY.md) for delivery preservation,
recovery limits and release verification.

## What belongs in a batch?

### nodes.jsonl

One JSON object per line. Nodes can represent fields, concepts, methods, claims, questions, theories, papers, datasets, experiments, models, laws, or technologies.

Minimum:

```json
{"id":"claim.example","label":"Example claim","kind":"claim","domain":"physical","era":"undated","status":"reported","frontier":false,"summary":"...","sources":[{"id":"doi:...","title":"...","url":"https://..."}]}
```

These neutral values must be proposed explicitly by the author: `status: reported` records a source-attributed result or proposal without claiming scientific acceptance or current consensus; `era: undated` leaves chronology unresolved and makes no claim about currency; `frontier: false` makes no claim that the record represents the current frontier. It does not declare the question settled or the result obsolete.

Unknown metadata remains explicit. If a candidate claims acceptance, chronology or frontier standing that its sources do not establish, the author must submit a new candidate revision with justified or neutral metadata. The compiler does not rewrite the captured source, summary or assertion scope to make a candidate pass. The complete revised representation still requires both independent review roles.

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

## Navigation and strict ingestion

Brain 6.2.11 bounds status-notice scans before layout-sensitive reads. See
[status scan verification](nemesis/integration/STATUS_SCAN.md); the complete
research prompts and retained evidence remain unchanged.

New Native scientific decisions use a catalog and exact snapshot-pinned retrieval
turns instead of sending the whole graph into each Brain prompt. See
[paged planning deployment](nemesis/integration/PAGED_PLANNING.md) for the read
protocol, retained history, resource-window resume, Windows checkpoint repair,
build identities and separate installed/live verification.

Batch application regenerates `data/atlas-navigation.json`. After changing registry or family configuration, run `python scripts/atlas_navigation.py`; validation rejects a stale projection. Navigation routes are separate from scientific edges, and unresolved placement is explicitly pending.

No semantic alias coercion is accepted. Unsupported kinds, domains, eras, statuses and missing metadata fail validation with a quarantined disposition. Correct the candidate explicitly with retained adjudication evidence; do not reinterpret it during a formatting retry. The evidence gate checks exact excerpts and requires separate entailment and adversarial reviews of the entire canonical representation. These reviews are retained provenance, not proof of scientific truth. Existing records remain legacy until reviewed. See [SCIENTIFIC_COMPILER.md](SCIENTIFIC_COMPILER.md).
