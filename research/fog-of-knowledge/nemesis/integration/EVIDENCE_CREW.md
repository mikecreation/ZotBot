# Nemesis evidence crew integration

## Current scientific authority upgrade

The installed architecture audit and responsibility trace are retained in
`AUTONOMOUS_RESEARCH_AUDIT.md`. Apply `crew-scientific-authority.patch` after
`crew-coverage-expansion.patch`, together with the current browser transport
patch. Exact installed native sources and fingerprints are retained under
`scientific-authority`; exact extension sources are under `brain-transport`.
The incremental patch uses LF text. Verify the preimage and normalize only its
allowlisted changed Python files to LF before applying it to a CRLF checkout;
retain their original bytes in the upgrade backup. Never replace the database.

Production now uses `ScientificCoveragePlanner`. The previous `choose_branch`
implementation remains available for historical migration regressions; it no
longer chooses production scientific targets. Nemesis allocates concurrent domain
capacity and supplies the complete canonical planning graph, source outcomes,
pending investigations and new substantive findings. Independent Brain requests
propose a topic, rationale, queries, existing anchors or a declared novel topic,
and exact canonical findings with an explanation of their influence. Proposals
are state-validated, recorded and admitted as investigations; they are never
published as knowledge. Repeating an identical investigation or all attempted
queries is rejected. A distinct strategy can revisit a visited field.

Each decision retains its exact input, input digest, Brain job and raw response.
The progress ledger distinguishes attempted, completed, new evidence and blocked
work. A waiting or rejected strategy is held at its substantive graph fingerprint;
a changed canonical graph permits another planning decision. There is no global
Physics override or single serialized planning worker. Existing manual jobs count
toward the three simultaneous project investigations.

Source acquisition processes four new URLs per capture operation while retaining
the entire request backlog; four is an operation window, not a source limit.
There is no twelve-target gate. Capacity uses actual serialized bytes. Oversized
author inputs are partitioned without shortening captures; their outputs remain
separate retained files before mechanical array assembly and the compiler's
duplicate/identity checks. Oversized reviews retain the full candidate and context
hashes and dispatch evidence-complete assertion units. Both independent roles
must support every assertion before the unchanged final compiler and publication
gate. An indivisible oversized source/assertion remains explicitly blocked with
all inputs and pending work retained. It is never truncated or implicitly approved.

Bridge `14.13-scientific-resume` preserves the exact owner, slot and lease for
optional in-flight work on restart. It marks delivery collection-only and accepts
the eventual reply for that original identity. Deadlines never requeue an ambiguous
claimed/sent turn. Known-unsent retries remain bounded; primary engineering holds
remain independent. Browser heartbeat build `6.2.4-scientific-resume` confirms
activation of the tested restart guard. Updating files alone cannot confirm this.

`verify_mission_acceptance.py` additionally requires a justified Brain direction,
a follow-up citing an exact substantive new canonical finding, controlled restart
recovery of unfinished work with original leases, no duplicate dispatch/publication,
and the observed loaded extension build. Earlier successful publications and
synthetic tests cannot substitute for these conditions. Native regressions run
against disposable SQLite fixtures; CI checks exact retained sources and reversible
patches separately from live acceptance. Keep demonstrations bounded and preserve
the user's existing publication permission.

The remainder documents earlier incremental upgrades and their original contracts.

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

Architectural changes also require a **live mission acceptance run**. Passing unit
tests alone never establishes that Pandora can continue expanding the atlas.
Keep a pre-run baseline containing `started_at`, `main_sha`, `baseline_nodes`,
`baseline_canonical_ids`, and SHA-256 values for the installed files under
`native_sources`. Enable the real queue and retain its original jobs. Update the
local Fog checkout to verified main as publications arrive, then run:

```sh
python scripts/verify_mission_acceptance.py --native-root /path/to/Nemesis \
  --baseline /path/to/coverage-live-acceptance-baseline.json \
  --report /path/to/coverage-live-acceptance.json --online
```

The acceptance verifier requires at least three completed real publications,
reviewed additions across three fields, six distinct new canonical nodes, and
an automatic later job whose retained request contains expanded knowledge.
It independently checks canonical evidence history and original capture bytes,
installed source hashes, actual canonical additions, and GitHub merge/head/CI
identities. Search counts, author drafts, synthetic fixtures and unit-test totals
cannot satisfy it. Repeated updates to one new ID cannot inflate the growth count.
Every run retains its report and appends an observation ledger; incomplete or
invalid proof exits nonzero. CI tests these rejection conditions, while live
acceptance needs the local running workers and is explicitly separate from CI.
This is a bounded demonstration of continuation, not a claim of scientific
completeness or immunity to all future failures. ChatGPT chooses sources and
assertions within the scheduled branch; the fair queue manages admission and
continuation without deciding scientific truth or adding taxonomy.

Source acquisition is independent for each requested URL. A permanent HTTP
403/404/410 is retained in `source-capture-failures.json` while other usable
sources are captured. The author receives those limitations and only the actual
captures; an unavailable source ID cannot support an assertion. If none can be
captured, no author context is constructed. Existing capture bytes and permanent
failure identities remain stable on restart; changed requests need a new revision.
Rate limits/server failures still use bounded operational retries, and source
policy or capture-integrity failures are never skipped. Public JSON/XML/Atom text
can also be retained verbatim from machine-readable publication APIs, without
inventing or interpreting fields as scientific assertions. The compiler does not
rewrite inaccessible publisher URLs or bypass their access restrictions.

### Browser delivery and oversized evidence packets

The live acceptance run found a transport failure which a healthy queue did not
detect: ChatGPT rendered the owned user turn but rejected its oversized message.
That is not an accepted research request and cannot produce a collected answer.
Apply `brain-message-deadlines.patch` from the directory containing
`NEMESIS_Brain_Extension_V6`, after the editor-transaction transport update. This
updates the existing extension to Brain 6.2.4 without changing its permissions,
host access or paired identity. Reload that unpacked extension, then refresh its
worker conversations after preserving drafts and allowing ongoing answers to
finish. Updating source files does not activate a running extension by itself.

Fog packets over 48,000 serialized characters use the existing document-upload
adapter. A UTF-8 JSON attachment retains the entire original packet, including
the exact GOAL string, complete sources, graph rows and compiler/review contract.
Its short message identifies the filename, byte count and SHA-256. This threshold
is conservative transport selection, not a claim about ChatGPT's fixed limit.
Workers must read the complete original packet or explicitly report blocked;
the compiler still validates every returned assertion against original captures.
Packets above the 4 MB file limit, or oversized packets already using attachments,
fail visibly for evidence-complete splitting. No attachment or graph row is
silently removed. Small packets and non-Fog jobs keep their existing transport.

Current-turn platform alerts for oversized messages or usage limits terminate
collection with the actual rejection reason. Old alerts and quoted source text
cannot reject another job; a rejected submitted turn is never automatically
resent by this collector. Page status/diagnostic waits end after eight seconds;
send/formatting waits end after 45 seconds. A timeout is not proof of non-delivery.
Persistent per-tab delivery fences prevent another send across extension/service
worker restarts until an exact matching user-turn or known-unsent receipt resolves
the ambiguity. One hung page releases its polling lock and reports an error
heartbeat without blocking the other workers.

Enabled bound tabs preserve their original automatic-discard preference, prevent
automatic discarding while bound, and restore it on pause/unbind. An already
discarded conversation requires restoration; it is never silently reloaded.
A frozen bound tab is activated without focusing its browser window. Chrome
documents that frozen pages cannot execute handlers/timers and resume on
activation: [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs).
Diagnostics expose frozen/discarded state and any unresolved delivery fence.
Binding authenticates its token before replacing the saved binding.

```sh
node tests/brain_liveness_v624.test.cjs
node tests/fog_packet_file_v624.test.cjs
node tests/brain_rejection_v624.test.cjs
node tests/site_files.test.cjs
node tests/transport_editor_v624.test.cjs
node tests/startup.test.cjs
node tests/validate-extension.js
```

The editor/rejection fixtures use the existing `release-v17-transport/qa`
dependencies; set `NEMESIS_QA_NODE_MODULES` in another checkout. The versioned
`brain-transport` payload retains exact installed sources and their SHA-256 index,
with locked offline test dependencies. CI checks those hashes, reverses/replays
the portable patch, and executes the real transport regression fixtures through
`scripts/test_brain_transport_source.py`. These checks inject failures offline and exercise complete upload,
editor commit, single submission and collection. They do not replace the live
cross-field mission acceptance requirement above. At the first verified
publication the canonical atlas grew from 564 to 576; cross-field acceptance
was still incomplete when the oversized-message failure was found.
