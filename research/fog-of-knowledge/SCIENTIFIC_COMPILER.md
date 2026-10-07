# Scientific compiler and evidence review

The invariant is: every record entering the evidence-reviewed graph must identify the exact retained source passage supporting its exact assertion. Classification, scope, identity, relationship direction and placement must be explicitly justified. Models cannot silently repair semantics during ingestion.

This implementation uses ordinary JSON/JSONL files and retained text. There is no SQLite evidence database, signing system or new trust authority.

## Boundary

`worker candidate → retained source + scoped assertion → entailment review + adversarial review → deterministic gate → canonical graph → separate navigation projection`

A URL is insufficient. The compiler-owned HTTP capture retains the response bytes and reproduces the defined text extraction. A candidate must match that capture exactly before review; invented worker prose attached to a real URL is rejected. Exact excerpt matching is deterministic; natural-language entailment is reviewed, not mathematically proved. Two model checks are not independent scientific corroboration. Disagreement, uncertainty, missing source text, unsupported kinds and stale reviews block the whole batch. Resolve those problems with a new candidate revision; do not normalize them away.

The existing 331 canonical records are preserved as **legacy-unreviewed**, including 41 with no attached sources. None were retroactively certified by this implementation. Registry seeds remain separate unreviewed inventory. The baseline prevents later unreviewed canonical edits from masquerading as historical records.

## Candidate files

Capture HTML, plain text or text-layer PDFs through the review desk or CLI before constructing assertions:

```sh
python scripts/evidence_pipeline.py capture --url https://example.org/source --source-id source.version --title "Source title" --source-kind unknown --output nemesis/batches/<batch_id>/sources.jsonl
```

The downloaded/captured source record includes the capture ID, original response hash, final URL, character decoding and extraction method. Retain these fields unchanged. PDF capture uses pinned pypdf 6.19.0 in layout mode and retains a page table. PDF support entries must name the correct page and stay within its offsets. Scanned/empty-text and encrypted PDFs remain unresolved; figures, formulas and tables require page review because text-layer extraction does not establish visual fidelity. Other unsupported formats remain unavailable; no text is invented. Captured content can still be wrong or untrustworthy: retrieval establishes traceability, not scientific validity.

Keep the existing `manifest.json`, `nodes.jsonl`, `edges.jsonl`, and `reviews.jsonl`. Add:

- `sources.jsonl`: each record has `id`, `url`, `title`, `retrieved_at`, `source_kind` (`primary`, `secondary`, `unknown`), `text`, and the SHA-256 of the exact UTF-8 text. Retain an authorized source extract or snapshot; do not invent inaccessible text. Identify publication/version and extraction method in optional metadata when available.
- `assertions.jsonl`: `id`, `target_kind` (`node`, `edge`, `review`, `taxonomy`, `identity`), `target_sha256`, `canonical_record`, `statement`, `scope`, and `support`. A support entry contains `source_id`, `source_sha256`, `start`, `end`, `quote`. Offsets are Python Unicode code points into the retained text, with an exclusive end. Quote equality and source revision are checked exactly.
- `taxonomy.jsonl`, optional: `id`, `parent`, `child`, `type: narrower`. Multiple reviewed parents are allowed; cycles are rejected. Family roots use `family:<domain>`. The display chooses one compatible parent deterministically and exposes the others.
- `identities.jsonl`, optional: `id`, `left`, `right`, `type` (`same_concept`, `about`, `related_concept`). Records remain intact; a question is never collapsed into a field. Matching names only generate review candidates.

Scope explicitly names `population`, `time`, `assumptions`, `uncertainty`, `units`, and `quantifiers`; unknown values may be null. Put limitations in the assertion rather than allowing a scoped experimental result to become a universal claim. Every scientific relationship needs its own assertion and review, even when both endpoints have sources.

`canonical_record` is the complete proposed record. Compute its hash with `evidence_compiler.digest`, which hashes sorted compact JSON encoded as UTF-8. Node summary must equal the reviewed assertion statement. Node provenance must point to the same source ID and URL as its excerpts. A node needs an explicit `frontier` boolean. Updates must include every inherited field: the compiler rejects unreviewed fields, source unions and automatically added aliases. Empty storage arrays are the only nonsemantic defaults.

For an executable example, see `fixture()` in `scripts/test_evidence_compiler.py`. It is deliberately synthetic and never inserted into the real knowledge graph.

## Review workflow

Run Python 3.12+ and install the pinned PDF dependency:

```sh
python -m pip install -r requirements.txt
python scripts/atlas_server.py --port 8097
```

Open `/review.html`. Inspect a candidate's retained evidence packet, request entailment and adversarial Brain reviews, collect their results, then check the gate. **Apply reviewed batch** becomes available after a successful check; applying repeats the gate against the current revision. Requests use the existing local Nemesis Brain on port 8000 and its configured models. The desk does not claim or silently switch to a particular provider model. The provider model is recorded as unavailable when Brain does not report it.

Brain currently exposes its 20 most recent jobs. The desk retains its dispatch IDs across restarts and reports unavailable results explicitly. Collect promptly, or import the retained reviewer output through the CLI. A changed endpoint, source, candidate or scoped assertion requires another review. Formatting repairs do not authorize changed semantics.

For CLI operation:

```sh
python scripts/evidence_pipeline.py packet nemesis/batches/<batch_id>
python scripts/evidence_pipeline.py review nemesis/batches/<batch_id> --decision entailment.json --reviewer reviewer-a --model actual-model-version --role entailment
python scripts/evidence_pipeline.py review nemesis/batches/<batch_id> --decision adversarial.json --reviewer reviewer-b --model actual-model-version --role adversarial
python scripts/nemesis_apply.py nemesis/batches/<batch_id> --check
python scripts/nemesis_apply.py nemesis/batches/<batch_id> --apply
python scripts/validate.py
```

Each review input is `{"decisions":[...]}`. Decisions name `target_kind`, `target_sha256`, `assertion_id`, `outcome` (`supported`, `unsupported`, `uncertain`), `rationale`, `limitations`, and five explicit boolean checks: `exact_support`, `scope_preserved`, `no_strengthening`, `relation_direction`, `representation_justified`. Operational review collection binds the candidate and endpoint hashes, reviewer ID, role, model and timestamp. The candidate author cannot self-review, and both required roles must cover the same scoped assertion with distinct reviewer identities. Manual reviewer identifiers express recorded provenance; they are not cryptographic authentication.

Reviews live outside worker candidates under `nemesis/adjudications/`. Failed evidence checks retain the candidate in `nemesis/quarantine/`. Applying retains raw batches, source text snapshots, review decisions and prior node context. Reapplying the same approved batch is idempotent. Validation checks source snapshots, raw batch hashes, current canonical records, taxonomy and generated artifact freshness. A complete canonical snapshot is published atomically; derived navigation/index files can be rebuilt after an interrupted write.

## Nemesis integration and scale

The live worker contract now describes the evidence files and strict gate. `nemesis_context.py` reports review coverage, unresolved identities and navigation coverage, and uses the same registry compiler as the browser.

The complete crew adapter is retained in [EVIDENCE_CREW.md](nemesis/integration/EVIDENCE_CREW.md).
It performs capture before authoring, retains two revision-bound review roles,
stages original response bytes and decisions into publication sandboxes, and
waits for CI before merging the exact PR head. The standalone review desk remains
available for explicit revisions and manual inspection.

The local Nemesis transport adapter was patched to retain all four evidence files when saving, loading and ingesting worker packets. The portable patch is `nemesis/integration/github_batches-evidence.patch`. The running Nemesis process needs its normal restart to load this adapter change; active research was not interrupted. The standalone atlas/review server already runs the new workflow.

The atlas API `/api/graph/nodes` returns bounded, deterministic pages of canonical and registry records, with a graph revision and a 409 response when that revision changes. It supports `domain`, `q`, `offset`, and `limit` (maximum 200). The client currently loads the complete graph. Full and field expansion use worker geometry, worker-built spatial indexes, an OffscreenCanvas overview and viewport drawing. A synthetic 50,000-record circuit has been measured; results and limits are recorded in RENDERING.md. Large evidence packets must be split into complete, reviewable batches; the local reviewer rejects packets above 1.8 MB.

Research expansion should now prioritize the retained source gaps and unresolved scientific representations. Building a larger store cannot replace verifying those assertions.

PDF extraction follows the [pypdf text extraction documentation](https://pypdf.readthedocs.io/en/stable/user/extract-text.html). The retained response and text hash establish the exact representation reviewed, including extraction limitations.

## Public Frontier

The tab separates recorded open questions from evidence-reviewed public disclosures. Optional `node.public_frontier` metadata is part of the exact reviewed canonical record:

```json
{"category":"company-tool","company":"publicly supported name","tool":"publicly supported name","capability_status":"undisclosed","disclosed_at":null,"source_ids":["captured-source-id"]}
```

Categories are `open-question`, `public-result`, or `company-tool`; disclosure status is `publicly-described` or `undisclosed`. A disclosed date must be an exact ISO calendar date or null. Metadata sources must be canonical citations and exact assertion support. A company/tool assertion and each capability require public-source support and both review roles. A date is not proof of current world leadership. Undisclosed private capabilities are never inferred. Legacy frontier questions remain visibly unreviewed; no commercial disclosures have been fabricated to populate the tab.
