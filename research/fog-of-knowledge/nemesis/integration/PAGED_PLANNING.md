# Paged scientific planning deployment

The production Native scientific planner uses `fog-paged-planning/1`. A new
decision starts with a catalog: domain coverage, record counts, pinned Git commit
and retrieval snapshot. It does not receive the complete graph. Brain chooses
typed node, relation, source, assertion-history and review queries, and exact
captured text spans. Scientific directions remain Brain decisions; retrieval
does not strengthen, classify, merge, place or approve assertions.

`scripts/nemesis_retrieve.py serve` is a sequential JSONL read service. Native
materializes the selected project at a verified commit, starts isolated Python
without credentials, audits the derived snapshot once, and reuses its connection.
Every reply identifies exact bytes, hash, protocol, snapshot, scope, count and
completeness. Cursors bind the query and snapshot. Native independently checks
these fields and the requested operation. Partial pages disclose continuation;
oversize records or source spans fail explicitly without clipping.

The current reply enters the next planning job. Prior replies, raw worker
responses, job IDs and exact inputs remain on disk. Brain can replay a reply or
page retained source/investigation/progress/query history. The prompt includes
the latest 16 query descriptors with explicit total/returned/start/completeness;
all earlier descriptors remain accessible. Planning jobs bind decision ID and
turn, so enqueue-before-checkpoint recovery reuses the same exact job and GOAL.
An investigation must read first and can only cite retrieved canonical anchors
and findings. Exact canonical summaries are checked again before admission.
The source capture, independent reviews, scientific compiler and exact-head
publication gates remain required.

Each decision has an explicit initial allowance of 16 read turns. Reaching it
retains the precise pending request in `RETRIEVAL_WAIT`; it does not exhaust a
field or create another identical planning mission. A same-origin local POST to
`/api/github/project/{owner}/{repo}/evidence-crew/retrieval-resume`, with `path`,
`plan_id`, and `additional_turns` (1–64), grants another resource window on the
same snapshot. It never enables a paused queue and refuses to enlarge the
original bounded demonstration's budget. GET `.../evidence-crew/graph-catalog`
returns a verified catalog without starting research. Resource limits remain
operational limits, separately visible from scientific knowledge.

Restarting or pausing retains the old demonstration budget. A later explicit
coverage start archives the completed demonstration's exact queue and budget,
preserves its tasks/decisions, and starts a separate continuous production run.
This prevents an expired demonstration deadline from immediately stopping a
new user-requested run; it does not extend the earlier demonstration.

Native `14.14-paged-planning` also uses unique same-directory JSON staging files,
flush/fsync and bounded retries for Windows sharing denial. A failed replacement
leaves the previous valid checkpoint intact. Unique files prevent competing
writers from sharing one `.json.tmp`; caller locks still serialize state updates.
This is not cross-process compare-and-swap or a database transaction. Tests
include an actual Windows file handle denying replacement, transient and
persistent failures, disk failure, and concurrent staging. Old queues, raw
captures, jobs, leases and the previous live budget are preserved.

Extension `6.2.5-paged-planning` adds the observed platform-generation-error
classifier only for the current owned request, excluding quoted evidence,
assistant text and earlier alerts. Delivery fences and resume-only behavior
remain; an ambiguous user turn is never automatically resent. A loaded heartbeat
marker and page build must be checked after Chrome extension reload: installed
files alone are not evidence of activation.

`paged-planning/` retains exact Native/extension postimages, support modules,
tests, hashes and a reversible incremental patch. The original 14.13 / 6.2.4
retention bundles are historical preimages and remain unchanged. Run
`scripts/test_paged_planner_source.py` and `scripts/test_retrieval_service.py`;
CI runs the portable Native integration, actual reader process and five browser
fault fixtures. These tests are not live scientific progress. Local activation
proof separately checks loaded builds, preserved jobs/captures/budget and actual
installed retrieval. The earlier measured 100× report measures the index engine,
not the complete upgraded planner or provider performance.

Remaining bounds are explicit: pinned materialization permits 3,000 project
files / 80 MiB total / 25 MiB per file; replies fit a 100 KB transport frame;
individual author/review packets retain their existing limits. A graph beyond
checkout bounds needs another storage transport. This change does not claim
unlimited physical capacity, complete scientific coverage, zero latency,
provider reliability, automatic recovery from unknown UI changes, or reduced
per-assertion review amplification. The legacy whole-context command remains
for old plans and manual workflows; newly created production decisions use
the paged path.
