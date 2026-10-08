# Nemesis evidence crew integration

The local Nemesis upgrade is retained in `evidence-crew.patch`. It targets the V17
runtime containing the existing live worker contract, GitHub batches and Brain
bridge. Apply `github_batches-evidence.patch` first if the runtime does not yet
retain sources/assertions/taxonomy/identity files. Stop workers before restarting.
The patch does not replace the research database or reset existing jobs.

From the Nemesis application directory, check the patch against the installed
files before applying it:

```sh
git apply --ignore-space-change --check /path/to/fog/nemesis/integration/evidence-crew.patch
git apply --ignore-space-change /path/to/fog/nemesis/integration/evidence-crew.patch
python -m pip install -r requirements.txt
```

The Fog project must also be refreshed to the matching main revision containing
`scripts/nemesis_evidence_exchange.py` and its three manifest commands. Run the
adapter tests with `FOG_PROJECT_ROOT` pointing at that Fog checkout:

```sh
python -m pytest tests/test_github_evidence.py tests/test_github_workspace.py
```

Restart through the normal Nemesis supervisor. `/api/health` reports
`fog_evidence_crew.version = fog-evidence-crew/1` and `running = true`.
Starting the application resumes an explicitly enabled persistent coverage queue.
**Expand map with crew** enables that queue; **Pause expansion queue** prevents new
research while allowing current batches to finish. Connected Brain slots handle
jobs without pinning work to a disconnected worker.

After the base patch, apply `crew-recovery.patch` and restart Nemesis, then reload
the existing **Nemesis application page**. Its atlas-only Refresh button refreshes
the embedded graph and does not reload application JavaScript. An already-open
page can otherwise keep submitting the retired `fog-crew:boss/w1/w2/w3` workflow
after a server upgrade: those jobs finish but have no durable evidence handoff.
The recovery patch rejects untracked Fog jobs on `/api/brain/jobs` with an explicit
reload message before dispatch. Existing replies remain retained in `brain_jobs`.
The current client loads as `github.js?v=gh-evidence-5`, checks the server's client
revision, and shows discovery, capture, author, review, completion and blocking
reasons directly above the atlas. Idle connected slots are separate from pipeline
progress; a blocked candidate does not masquerade as an active researcher.

Apply `crew-reliability.patch` after those two patches and restart through the
supervisor. It supplies the current adapter, publication checkpoints, candidate
revision tests and client. Reload the existing Nemesis application page once.
The atlas iframe persists during status changes. A confirmed `MERGED` revision
refreshes the atlas automatically while preserving camera, selection, expansion
and connection lenses; author completion and CI waiting never count as a merge.

Apply `crew-poll-reliability.patch` afterward for the current neutral-field author
contract and nonblocking Brain polling. Admission checks retain explicit pause,
ownership and lease rules while avoiding unchanged writes and rotating bounded
queue windows. Polling work runs outside the HTTP event loop.

Apply `crew-revision-budgets.patch` next. Formatting revisions have their own
four-revision limit, scientific revisions have a separate three-revision limit,
and a wave has at most eight author attempts. A malformed JSON reply or ambiguous
quote location cannot exhaust the scientific refinement allowance. Every revised
representation still requires both reviews. Explicit author evidence limitations
and capture corruption stop immediately. Terminal states retain the latest exact
review rationale and revision counts; reconnecting clears obsolete transport
errors while leaving scientific objections visible.

Apply `crew-startup-health.patch` next and restart the full supervisor, then
reload the existing application page to load workspace client `ws14`.
The supervisor owns the database across ports, drains its own Windows child
process tree on restart, and audits a private SQLite snapshot instead of holding
a long reader lock on the live DELETE-journal database. Full integrity remains a
required verification; a pending audit keeps the healthy application running and
retains the deployment marker without claiming a successful deployment.
Owned restarts capture the consistent database before starting their exact new
child. Verification records that scope and checks live API routes, migrations,
SSE and a fresh scheduler heartbeat afterward. Read-only online audits remain
available outside restart boundaries. SQLite performs ordinary hot-journal
recovery at the drained restart boundary; committed history is preserved.
Campaign badges retain the selected campaign's actual paused, blocked or stopped
state even when other Brain work is active. Manual planning retires old fixed
research-family queues while preserving paused campaigns and other campaigns.
Isolated Python runs in explicit UTF-8 mode and rejects undecodable machine
output rather than replacing characters in source or review JSON.
Manual research dispatch records its own fresh, matching completed
`NO_NEW_EVIDENCE` or `NO_CHANGE` attempt as done without inventing a scientific
result. Missing, stale or mismatched attempt receipts remain blocked.
The complete native regression gate has a bounded one-hour budget: this Windows
workspace's measured complete run exceeded the former thirty-minute limit.
A timeout remains incomplete infrastructure evidence and cannot mark a candidate
as tested or send it to approval.
The patch also updates obsolete regression contracts to the current evidence and
Brain handoff rules; the intentionally disabled v15 module is skipped explicitly.

The shared `representation_policy` defines `reported` as source attribution,
`undated` as unresolved chronology, and `frontier:false` as no currency assertion.
Authors select these neutral fields explicitly; the compiler never replaces
unsupported positive classifications with them. Both reviewers receive the same
policy and must still justify the complete substantive representation and scope.

The durable workflow is:

1. Workers discover one to four bounded public source URLs and identify existing
   records that need evidence. No scientific record is published at this stage.
2. Pinned compiler capture retains HTTP bytes, extraction metadata and full text.
   Local/private source destinations and redirects are rejected by this adapter.
3. A separate author job constructs a bounded set of supported targets with exact
   excerpts, complete representations and explicit scope. The author references
   retained source IDs instead of reproducing capture metadata. Nemesis owns
   batch identity and the delivery manifest; the compiler owns exact source
   URL/title metadata and capture bytes. Conflicting supplied metadata is rejected.
   Kind, status, domain, relationships and scientific prose remain explicit
   author decisions subject to both reviews.
   Missing hashes and uniquely located exact-quote offsets are bound mechanically;
   supplied incorrect values are rejected. Original author output is published
   beside the batch so this binding can be inspected.
4. Entailment and adversarial reviewer jobs receive the same revision-bound
   packet. Both decisions are retained separately and checked by the compiler.
   Canonical decisions must match their retained adjudication receipt exactly,
   including rationale, limitations and Unicode text.
   Model review is recorded provenance, not independent scientific corroboration.
5. The sandbox receives retained capture receipts, original binary responses and
   adjudications along with the candidate. Check/apply/validate repeat against
   the current canonical context. Raw responses are uploaded as base64 bytes.
6. With **Automate** enabled at wave dispatch, a passing candidate opens a PR.
   The adapter waits for successful validation CI and merges only the exact
   checked head commit. With Automate off it stops at `READY`; Check/Open PR
   remain available. Legacy four-file jobs are never automatically harvested or
   merged by the new workflow.

Flow state and job IDs live under Nemesis `data/github_cache/evidence-crew` as
ordinary JSON files. The server continues existing handoffs when the browser is
closed and resumes tracked IDs after restart. It reads tracked Brain results by
ID, avoiding the UI's twenty-most-recent-jobs limit. Candidate-format, preflight
and uncertain-review failures request a new explicit author revision from the
same captures within the separate bounded revision allowances. Prior candidates,
raw replies and reviewer results are archived; revised targets require both reviews again.
Capture corruption and changed publication heads block immediately. Operational
failures retry with bounded backoff, then show the reason; CI has a 30-minute
deadline. Malformed state files cannot stop other missions. Oversized packets
(300 KB) require a smaller evidence-complete mission.

Author/reviewer job intents are durable, so restart between queueing and
checkpointing reuses the same job. Publication records exact draft, commit,
branch and PR identities before continuing. A lost API response recovers the
existing PR; an unexpected head or draft change cannot be force-pushed or merged.
Every changed proof file is retained or publication fails visibly, including
binary capture bytes. Candidates and reviews run in parallel; one publication
per repository proceeds at a time, against fresh main, to prevent sibling PRs
conflicting with each other.

For deliberate upgrade recovery of older blocked Fog candidates, the local
`POST /api/github/project/{owner}/{repo}/evidence-crew/recover` accepts
`{"path":"research/fog-of-knowledge"}`. It stages the new pinned compiler before
swapping projects, preserves capture bytes and prior revisions, and resumes the
old author reply through binding/preflight. It does not approve a candidate,
refetch its sources, resume unrelated campaigns, or reset the database. An
interrupted swap resumes from its retained recovery checkpoint.

Synthetic tests use disposable copies and fake Brain/GitHub services. They do
not dispatch real researchers, create real PRs, or add fixture knowledge to Fog.

Run the focused runtime regressions after applying all patches:

```sh
python -m pytest tests/test_github_evidence.py tests/test_fog_pipeline_reliability.py tests/test_github_workspace.py
python -m pytest tests/test_github_sandbox_encoding.py tests/test_supervisor_snapshot_health.py tests/test_supervisor_startup_guard.py tests/test_supervisor_rollback.py tests/test_continuation_v17.py tests/test_autonomy_desks_v17.py tests/test_eureka_social_v14.py
```

Apply `crew-coverage-expansion.patch` after the preceding patches, restart the full
supervisor, then reload the existing application page. It removes the three
repeated Physics missions and the one-or-two-target author restriction. Discovery
receives the complete thin inventory for its domain, including old URL sources;
authoring receives every existing representation referencing its captured sources.
Oversized context fails visibly instead of silently dropping matching records.

The queue visits each domain before returning to another branch in that domain.
At most three discoveries/batches occupy expansion capacity, including existing
manual batches. Merged and held branches free capacity automatically; held evidence
is retained and never promoted. New branches on later main revisions enter the
inventory. Once all eligible branches are visited, the queue waits for new ones
instead of repeatedly searching the same branch. Branches are research scheduling
units, not newly reviewed taxonomy or scientific completeness claims.

Queue checkpoints live under `data/github_cache/evidence-crew/coverage`. Intents
are reserved before dispatch; deterministic project/branch tags recover jobs after
an interrupted enqueue. An additive JSON-safe Brain tag index makes that lookup
independent of total job history without rewriting old packets. Source-use history
is advisory: a previously used source can support a distinct assertion. Authors
aim for 6–12 targets when justified; this is a capacity goal, never an admission quota.
Exact capture, both explicit reviews, current-main preflight and exact-head CI
remain mandatory. Totals count proposed targets in merged batches, not searches
or a claim that the whole atlas has been scientifically reviewed.

The local same-origin coverage endpoint accepts
`POST /api/github/project/{owner}/{repo}/evidence-crew/coverage` with
`{"path":"research/fog-of-knowledge","enabled":true,"auto_publish":true}`.
It respects project permissions, Brain disable/hold, and manual publication mode.
Pausing and resuming preserve tasks, captures, jobs and historical failures.

```sh
python -m pytest tests/test_fog_coverage.py tests/test_fog_pipeline_reliability.py tests/test_github_evidence.py tests/test_brain_bridge_v14.py tests/test_v1410_brain_autorecovery.py tests/test_brain_rollover.py
python scripts/test_coverage_context.py  # in the Fog checkout
```
