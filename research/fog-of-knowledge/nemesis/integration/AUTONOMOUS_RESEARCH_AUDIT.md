# Installed architecture audit — 7 October 2026

## Phase 1: installed behavior before authority repair

The running application is `release-v17-final/Nemesis`, not the Fog checkout.
Its supervisor owns port 8000; SQLite is `data/arena.db`. The deployed client is
`gh-evidence-5`, Brain bridge `14.12.1-fog-lease-retry`. The actual Chrome extension
is the unpacked `release-v17-final/NEMESIS_Brain_Extension_V6`, ID
`cfacceembikcjlaaeieendfaecjaookk`. Installed files and loaded extension code are
different observations: version 6.2.4 on disk does not establish its activation.
The byte-exact transport sources are retained in `brain-transport` and PR 62.

The coverage patch is installed. An enabled persistent queue does continue
without another Expand click. At the audit checkpoint it had produced 58 actual
reviewed records in five merged publications (PRs 58, 61, 63, 64, 65). Two further
batches were unfinished. Four investigations were held on unavailable or unusable
sources; those holds correctly prevented fabricated assertions. Expansion admission
is now paused while unfinished work drains; existing publication permission remains.

The scientific-authority preimage, consistent SQLite backup, queues and exact
source hashes are retained locally under
`data/fog-upgrade-backups/20261007-scientific-authority`; the machine-readable
baseline is `output/scientific-authority-baseline.json`. Original research is preserved.

Demonstrated restrictions:

* `sim/fog_coverage.py:choose_branch` picks a branch by domain rotation, missing
  sources, kind and alphabetical ID. `set(tasks)` permanently excludes visited
  branches. The planner cannot propose an absent topic or justify scientific value.
* `schedule` refreshes current main but discovery receives thin domain inventory;
  the prior acceptance checker only verifies that a later request's node count grew.
* `github_evidence.start` accepts only four sources. `enqueue` refuses oversized
  packets without a durable partition backlog. These are execution restrictions,
  not scientific reasons to discard legitimate findings.
* `BrainBridge.__init__` and `expire` requeue optional Fog work even after `SENT`.
  A timeout or server restart cannot establish that a message was unsent. The
  browser delivery fence helps but cannot make server lease replacement safe.
* Older fixed Physics missions remain in historical jobs. Current coverage
  admission no longer uses them. Historical instructions must not become the
  objective of new requests.

## Phase 2: responsibility and failure trace

| Transition | Owner and input | Necessary boundary / durable state |
|---|---|---|
| Objective → admission | Nemesis: user objective, enabled flag, publication permission, pending work, capacity | Preserve pauses, fairness and exact durable intents; do not choose scientific targets by lexical order. |
| Admission → planning | Independent Brain requests: canonical graph, substantive new records, gaps, source/outcome history, concurrent work | ChatGPT proposes a direction, rationale, strategy and grounding. A planning proposal is untrusted and is not canonical knowledge. |
| Proposal → discovery | Nemesis validates domain, existing anchors, novel-topic declaration and investigation identity | Retain decision and input hash; reject identical investigations and unsupported grounding; allow distinct revisits. |
| Discovery → capture | Brain chooses exact public primary URLs; compiler fetches actual bytes | Persist all source requests; inaccessible sources remain explicit; capacity partitions cannot delete the backlog. |
| Capture → author | Brain receives retained text, exact existing representations and compiler contract | Preserve source scope and uncertainty. No new identity, classification, edge or placement is inferred by the harness. |
| Author → reviews | Separate entailment and adversarial Brain jobs | Exact candidate/context hashes, all assertions and representation checks; a failed decision requires a fresh candidate and fresh reviews. |
| Reviews → compiler | Deterministic pinned scientific compiler | Exact quotes, captures, sources, identities, relationships and reviewed representations; failure retains evidence and attempts. |
| Compiler → publication | Nemesis and GitHub | Existing permissions, current-main recheck, exact PR head and successful CI. Publication serialization protects main; research remains concurrent. |
| Publication → next plan | Nemesis refreshes canonical main and outcome/source ledger; Brain selects follow-up | Supply actual new findings and their provenance, not counts alone. Completed does not mean field exhausted. |
| Restart / failure | Nemesis preserves intents, captures, job IDs, owner and lease; browser resumes exact owned turn | Never replay ambiguous delivery. Known-unsent retries are bounded. Missing worker, evidence limitation and exhaustion expose reasons. |

This separation is the gate for the planner repair. Scheduling selects available
domain capacity; ChatGPT selects the scientific investigation. Existing compiler,
reviews, publication controls, circuit layout and canonical history remain the
working foundation. Offline tests and real mission acceptance are separate proofs.
