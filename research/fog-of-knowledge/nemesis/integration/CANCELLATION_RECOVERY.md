# Preserve scientific work across Brain interruptions

The provider-disable path cancelled queued, claimed and sent Fog jobs. Author and
review handlers then raised a generic ValueError, which the crew classified as a
candidate-format failure. That spent a revision attempt and returned a partially
reviewed batch to authoring despite no scientific rejection.

The Native repair treats disabling Brain as a pause for `fog-crew:` jobs. It keeps
each request's exact ID, owner, lease, slot, packet and status. No new work is sent
while disabled. An already running owned turn may still be collected. Paused
deadlines do not expire; re-enabling extends each pending Fog deadline by the
pause duration once. Coding and other non-Fog cancellation semantics stay intact.

All four crew paths (single/partitioned author, single/partitioned review) now
classify transport termination as operational. The candidate, captured sources,
unit jobs, completed review roles, hashes and scientific revision budget survive.
A terminal job remains blocked with its exact job ID and original stage recorded.
Generic upgrade recovery cannot erase those records or replay an uncertain send.
This also preserves explicit cancellations; it does not override user intent.
If the existing Brain safely recovers that same request ID, or collects its owned
completion, the crew resumes its original stage automatically. It never creates
a replacement request to infer that an ambiguous delivery was unsent.

This repair cannot undo model work already repeated by the previous software.
Earlier attempts remain archived, and active replacement requests are not reset.
It does not promote proposals, fabricate approval, or change compiler/CI gates.
Unsupported or uncertain scientific reviews still require a new explicit candidate
revision under the existing bounded budgets.

`cancellation-recovery/source-sha256.json` retains exact postimages against the
paged-planning baseline. `scripts/test_cancellation_recovery_source.py` verifies
source hashes, the reversible patch and the affected Native regressions; use
`--full-native` for the full portable suite with the prior planning repair applied.
CI runs this combined current suite. Installed source and loaded runtime are
separate checks: Native must restart to load Python changes. No Brain extension
update is involved. Status exposes `runtime_revision: crew-cancellation-recovery/1`
and `bridge_version: 14.14.2-fog-pause-preservation` after activation.
