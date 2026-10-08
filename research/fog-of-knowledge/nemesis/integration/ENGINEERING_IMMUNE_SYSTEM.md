# Engineering integrity: ranked audit and bounded guarantees

Audit began after the installed live verification retained an INCOMPLETE result:
23 new reviewed canonical records, two automatically merged fields/publications,
real substantive LongCite → proof-verification follow-up, and three original
SENT author jobs successfully collected after restart. The third publication
was not established. A current-turn ChatGPT generation error was reported as
COLLECTING; evidence upload confirmation failed separately. The original live
budget and installed files are preserved. No new worker request, reset, reload,
restart, scientific shortcut or expanded budget is part of this audit.

## Ranking recorded before implementation

Ranks reflect observed failures and inspected code, not speculative percentages.

| Rank | Safeguard | Observed risk / future impact | Complexity / regression risk | Decision |
|---|---|---|---|---|
| 1 | Reusable transfer manifests, strict parsing and explicit scope | Successful 400 KB clipping; machine stdout still redacted; syntactically valid partial JSON can appear successful | Small / low for independent verified readers; medium when changing active producer/receiver | Implement reusable guards and context/retrieval contracts first; do not change the frozen live runtime |
| 2 | Snapshot-indexed exact retrieval and expandable evidence | ~342 KB model input at only ~642 atlas entries; 500,000-character Brain ceiling; one atomic source already exceeds author capacity | Moderate / low for derived read-only index; high for replacing scientific planner mid-run | Implement independently usable query layer and test; document staged planner integration rather than silently swap it |
| 3 | Independent mission observer, failure corpus and dependency checks | Infrastructure passes previously concealed stagnation; current platform failure escaped collector classification | Small/moderate / low; observer has no dispatch/publication authority | Reuse strong existing mission verifier, add explicit progress/failure/staleness observation, recurring-failure escalation and affected-path regression plan |
| 4 | Bounded capacity and isolated fault replay | Full graph, retained evidence and job history scale differently; limits merely moved between layers | Small / low in temporary synthetic stores | Measure 10× and 100× representative engineering records and output; replay failures without touching production workers/database |
| 5 | Source-aware review grouping, paged author sources, source-failure granularity, UI repair | 31–35 assertions become 62–70 review calls per candidate revision; one rejected unit restarts all authoring; certificate error holds a batch | Moderate/high / scientific/recovery regression risk | Preserve full evidence and review gates; require targeted design and measured complete-path proof before activating operational changes |

## Execution boundaries and contracts

| Boundary / inspected owner | Input → output contract and completeness | Failure / recovery requirement |
|---|---|---|
| GitHub tree → pinned project (`github_workspace.full_tree`, `github_sandbox.materialize`) | Exact commit, complete tree, verified Git blob bytes and contained paths. Current 3,000 files / 80 MiB total / 25 MiB per-file limits | Reject server-truncated trees and locally clipped inventories. Current full-tree slice at 200,000 must declare truncation. No incomplete checkout may run a compiler |
| Compiler subprocess → machine result (`github_sandbox.execute`) | Strict UTF-8, complete machine stdout; byte count/hash from producer, JSON structure/protocol validated by receiver | Timeout, invalid encoding, altered/redacted output or wrong protocol must fail. Stderr/excerpts may be bounded/redacted diagnostics; scientific bytes may not be redacted |
| Machine context → cache (`github_workspace.run_context`) | Pin commit plus snapshot identity; counts bind complete inventory and graph. Partial advisory lists are explicitly scoped | Valid JSON alone does not prove a complete graph. Reject absent/mismatched declarations before caching/admission; retain original diagnostics |
| Canonical context → planning (`fog_scientific_planner.graph/schedule`) | Scientific decision receives exact records, source outcomes, pending work and recent findings; derived gap scores are advisory | Current complete-graph prompt is O(N+E) and fails above Brain capacity. Retrieval must allow further queries and disclose unseen inventory. Never call a retrieved subset the entire graph |
| Proposal → admission (`validate_proposal`, `reconcile_decisions`) | Explicit topic/rationale/strategy; anchors or novel topic; exact finding summary and implication; nonduplicate investigation | Raw result retained before parse; invalid proposal held. New evidence may justify revisits. Current held strategy fingerprint does not include independent source availability changes |
| Durable intent → SQLite job → queue JSON (`enqueue_plan`, crew `enqueue`) | Deterministic intent/tag binds immutable GOAL and one job; transaction commits before checkpoint | Recover committed job by tag after interrupted checkpoint, rather than duplicate enqueue. File and SQLite are not a cross-store atomic transaction; replay tests are required |
| SQLite lease → browser delivery (`BrainBridge.poll/authorize_send`, background fence) | Exact owner/lease/request; delivery intent durable before send; sent/ambiguous work is collection-only after restart | No automatic retransmission of uncertain delivery. Known-unsent receipt must bind original request. Disconnected jobs expose deadlines and cannot count as progress |
| Large packet → upload (`nbPreparePacket`, `nbAttach`) | Full UTF-8 JSON file, SHA and bytes, declared original request; 48 KB switch, 4 MB upload cap | Visible attachment confirmation is not proof the model read it. Unconfirmed upload fails without sending. Current DOM chip/progress assumptions need observed-page regression coverage |
| Browser response → result (`nbStatus`, `nbRequestRejection`, `BrainBridge.result`) | Exact owned user turn, finished matching protocol/request, complete nonempty RETURN; current 1 MB return limit | UI platform errors must not masquerade as indefinite collection. Source/prompt text or old alerts must not be classified as a current platform error. Reply failure never becomes scientific approval |
| Discovery → source backlog (`start`, exchange `capture`) | Every unique requested source retained; four URLs per capture invocation is throughput, not global scientific cap | Exact complete backlog and unavailable outcomes persist. 403/404/410 currently recorded individually; certificate/network errors can hold the batch after bounded retry |
| HTTP/PDF → capture (`source_capture.capture_source/validate_captures`) | Retain raw SHA, extracted-text SHA, method/version and exact page offsets; re-extraction reproduces text | Current 8 MB response / 500 PDF pages / 16 MB page stream limits reject explicitly. Scans, formulas and figures remain unresolved where text capture is insufficient. Never synthesize evidence |
| Captures → author (`author_goal`, `author_units`) | Full captured source objects and known representations; every unit and full original durable | Current 300 KB packet cap rejects an atomic large source. Authoring must preserve scientific decision provenance; current coverage_plan rebuild drops parts of the planner decision |
| Candidate → independent reviews (`review_units`, compiler review_packet) | Every exact target has scoped assertion/source binding; both independent roles cover same full candidate/context hashes | Partitioning does not imply approval of other assertions. Current single-assertion units and whole-revision restart have cost amplification. A review rejection remains a rejection |
| Reviewed candidate → compiler (`compile_batch`, evidence compiler) | Exact quote offsets, source captures, target representations, identities, taxonomy and endpoint context | Invalid source, unsupported classification/strengthening/placement or changed endpoint quarantined. No harness/model silently repairs scientific meaning |
| Compiler → publication (`github_batches`, crew CI) | Existing permission, refreshed current main, exact PR head, successful validate CI and retained merge identity | Failed/stale head/CI never approved; uncertain merge acknowledgment reconciled by exact existing PR. Another user's permission is not inferred |
| Publication → refresh → next decision (`coverage.reconcile/refresh/schedule`) | Verify real canonical additions, persist outcome/identity, supply exact new findings, automatically admit justified useful work | Counts alone do not demonstrate learning. User pause and bounded-demo stop persist; visited is not exhausted; unsuccessful sources do not validate claims |
| Jobs/history/UI → mission observer | Read actual reviewed canonical additions, publication heads/CI, real finding use, preserved identities and captures | Test counts, searches, successful HTTP calls, uploaded files and proposed targets are not accomplishments. Incomplete, stale and unknown must remain explicit |

## Retrieval design and authority

Canonical Git records, retained source bytes and reviewed compiler history remain
the authority. The SQLite query index is a disposable, derived cache, not a new
adjudication or compliance store. Immutable snapshot names bind the exact indexed
records. Index build is transactional; interrupted builds cannot replace a valid
snapshot. Queries use fixed kinds, exact ID/domain filters, deterministic ordering
and bounded pages. Cursors bind snapshot and query scope; switching snapshots or
filters fails. Returned records remain complete representations, with explicit
matched/returned counts, page continuation and completeness declarations.

Evidence retrieval identifies the exact retained capture and full text hash,
then returns requested character offsets, segment bytes/hash and total length.
No quote is shortened and relabeled as the whole source. Models may request the
next segment, source, relation or domain. Retrieval does not prove entailment;
the existing scientific compiler and independent reviewers still own admission.

The future planner adapter should begin with coverage/catalog pages and recent
reviewed findings, allow explicit `retrieve` decisions (exact IDs, domain pages,
incident relationships and source spans), and resume planning against the same
snapshot after each verified transaction. Persist query/response manifests in
the decision record. Resource exhaustion enters an explicit wait with resumable
cursor; it never fabricates exhaustion of scientific knowledge. Do not silently
replace whole-graph access with one relevance ranking. Repository materialization
also needs a pinned minimal dependency closure or an indexed data service before
million-record deployment. The query layer alone does not remove those upstream
limits or make the currently frozen planner stop sending complete graphs.

## Verification and activation policy

New engineering tests use temporary synthetic records and isolated processes;
they never enter canonical research data or production SQLite. Capacity reports
must name what was measured: representative metadata sizes are not 100× full
paper/PDF corpora. Token estimates use disclosed approximations, not provider
bills or claimed cognition. Larger projections are estimates and do not certify
readiness. No invented readiness percentages are reported.

Boundary registry and permanent failure corpus map a changed assumption to both
its producers and consumers, including persistence and scientific publication.
Dependency plans are reviewed executable argument arrays, not commands taken from
source content. Previously verified repair followed by the same failure category
requires an architectural escalation naming the assumption, dependent boundaries,
and prevention evidence before another component repair is accepted.

Preserve the original live run. New CLI readers, tests and derived indexes may run
separately; changing loaded runtime or workers must wait for the preserved work.
The independent live report remains INCOMPLETE until all its original requirements
are actually demonstrated. An intentional bounded stop is not silently relabeled
as sustained autonomous acceptance.

## Guarantees ledger

Verification results and actual prevented/detected/remaining classes are appended
after implementation and measurement. A hash proves identity under an honest
producer/receiver contract, not scientific truth, authorized disclosure, complete
upstream extraction, malicious-producer resistance, or model attention.

### Verified result, 2026-10-08

The preserved run subsequently published its third independently reviewed batch
automatically: PRs 70, 71 and 72 contain 35 actual new canonical records across
life, information and physical sciences. All three exact heads passed validation
CI. A later formal-science decision used the exact new LongCite assertion to
distinguish textual citations from mechanically checked proof certificates.
Three original SENT author jobs completed after the controlled restart with the
same owner, lease and GOAL; 520 nonempty retained-file preimages matched, all 545
prior jobs remained, and no duplicate dispatch/publication was found.

The original eight-investigation admission limit was reached without another
manual Expand or budget increase. The queue now says `BOUNDED_DEMO_COMPLETE`.
The unchanged strict acceptance report remains **INCOMPLETE** solely because
`continuation_still_enabled` is false. This documents a deliberate budget stop;
it does not certify sustained unbounded operation. Pending work and actual upload,
atomic-source and certificate failures remain retained. No installed runtime or
extension file was changed during this audit.

| Class | Verified protection / detection | Remaining exposure |
|---|---|---|
| Changed/truncated scientific transfers | Manifest verifier rejects changed canonical bytes, counts, version, identity, scope or completeness; strict parsing rejects invalid UTF-8, duplicate keys and nonfinite values | Protected query readers and opt-in `nemesis_context.py --integrity` only. Frozen live receiver does not yet require these manifests. Hashes cannot expose an upstream producer that incorrectly declares completeness |
| Silent retrieval omission | Snapshot audit binds all record payloads and indexed filter columns; source versions remain distinct; bundle components retain exact counts/hashes; full traversal checks continuity and final totals | Single-page consumers must honor continuation. Atomic oversized records fail explicitly. No semantic relevance ranking or model attention is guaranteed |
| Mixed snapshots / evidence changes | Cursors bind snapshot/query; source retrieval verifies retained capture and text hashes and exact Unicode offsets | Cursor checksum detects corruption, not a malicious actor able to recompute hashes. Capture extraction and scientific entailment still require existing compiler checks |
| Interrupted derived index / DB transaction | Transactional staging cannot replace an existing valid snapshot; isolated child-process crash rolls back its uncommitted write | OS/storage failure and all production cross-store transitions are not exhaustively fault-injected. Existing durable-intent/restart tests and live recovery remain separate evidence |
| False mission success | Independent observer verifies canonical reviewed records, exact publication head/CI, substantive finding use and restart identity; watchdog exposes holds, stale proof, repeats and stagnation | Observer must be invoked against fresh evidence; it is not a continuously installed service and cannot repair platform failures |
| Recurrence / overlooked dependents | Registry computes upstream/downstream execution path; permanent 17-case corpus and ordered event ledger require assumption/dependency/prevention review after a verified repair recurs | Registry and observed ledger must be maintained. Unrecorded incidents cannot be inferred. A completed architecture review is not runtime activation |
| Diagnostic redaction / local tree clipping / current platform error | Three byte-exact staged changes pass isolated real-function and owned-turn DOM replay, including >400 KB stdout and a 200,001-entry tree | **Staged, inactive.** New build identities and safe activation after preserved work are still required. Unknown UI variants and upload confirmation failures remain possible |
| Whole-atlas prompt growth / review cost | Measured capacity reports and explicit retrieval pages expose costs before scaling; no model calls in synthetic runs | Current scientific planner still sends a complete graph. Interactive retrieval adapter, author source paging and efficient complete review grouping remain future integration work |

There are 27 new distinct engineering tests: 15 integrity/retrieval/capacity tests,
four dependency/recurrence tests, four staged-boundary tests and four watchdog
tests. The affected-path run also includes existing compiler (37), exchange (33),
context (2), mission (8), retained Native source, five browser transport scenarios
and canonical validation. Repeated runs are not added to test totals. Failures
remain in local diagnostic reports. CI executes the new regressions along with
the existing scientific and transport suites.

### Measured future capacity

The final reproducible report binds implementation SHA-256 values and the initial
input graph bytes. Its baseline is 666 atlas nodes, 384 edges, 76 source versions,
624 observed job records and 330 assertion/review history records. Jobs are a
declared observed baseline, not an invented current production total. Workloads
contain synthetic representative metadata and never enter canonical data.

| Multiplier | Synthetic records | SQLite bytes | Build / verified open | Indexed 100-node page | Envelope bytes |
|---|---:|---:|---:|---:|---:|
| 10× | 20,800 | 30,572,544 | 5.70 s / 2.67 s | 99 ms | 53,927 |
| 100× | 208,000 | 305,815,552 | 54.79 s / 28.57 s | 116 ms | 53,930 |

Measured Windows process working set after each case was about 24.8 MB / 25.7 MB;
cumulative process peaks were about 26.9 MB / 28.2 MB. Python allocation peaks,
whole-metadata serialization bytes/time and rough bytes/4 context estimates are
in the report. These exclude multiplied full papers/PDFs and total system cache.
The verified open is an O(N) content audit: a future service must reuse a pinned
verified connection rather than reopen/audit the entire index for every page.
1,000× is explicitly a linear **estimate, not tested**; no infinite-scale,
zero-latency or provider-cost guarantee is claimed. Actual synthetic model calls
and model cost were zero. `engineering-capacity-measured.json` retains the report.

### Reproduce safely

From `research/fog-of-knowledge`, use `python scripts/nemesis_retrieve.py build`
to create a derived snapshot. Pin the returned path with `--snapshot` for
`catalog`, `query --kind nodes --domain physical --limit 100`, relation queries
with `--kind edges --incident NODE_ID`, and evidence history with
`--kind history --batch BATCH_ID`. Retrieve exact source spans using
`evidence --capture-id HASH --start 0 --end 1000`. Follow returned cursors with
the same snapshot and filters. Source ID queries return every retained version;
evidence bundle manifests explicitly point to separately indexed exact components.

`python scripts/engineering_guard.py --changed sim/github_sandbox.py --run`
runs the complete registered affected path. Native runtime fault suites and fresh
installed-system acceptance are still required before activation; repository
tests do not impersonate that proof. `--events SAFE_EVENTS.jsonl` evaluates the
ordered recurrence ledger. `mission_watchdog.py` consumes fresh independent
acceptance, runtime observation and baseline reports without dispatch authority.
`measure_future_capacity.py --graph data/knowledge.json --jobs OBSERVED_COUNT
--max-records 300000 --report CAPACITY_REPORT.json` runs bounded 10×/100× metadata
measurements. Resource-bound cases say NOT_MEASURED, never ready.
