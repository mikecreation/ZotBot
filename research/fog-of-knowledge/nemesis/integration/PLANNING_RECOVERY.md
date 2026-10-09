# Recovery from planning transport timeouts

An earlier planning request timing out was stored as HELD. The scheduler then
excluded its entire field at that unchanged graph snapshot. Once all ten fields
had a timed-out request, three connected READY slots received no work forever.
Pressing Start again did not remove the exclusion.

Only a planning HELD record whose exact original job is FAILED with
`Deadline exceeded; no automatic resend` becomes eligible for a fresh planning
decision. The new decision has a new ID, enqueue tag and request ID, and names the
prior failed plan in its complete input and paged brief. It does not replay or
reactivate the failed request. Retained jobs, plans, captures, candidates, review
decisions and publication gates remain intact.

Recovery waits 60 seconds after the recorded failure, doubling for consecutive
same-snapshot planning timeouts up to 15 minutes. It respects pause and the existing
three-lane scheduling capacity. The latest same-snapshot planning decision owns
the lane hold; an older failure cannot permanently override a later valid decision.
Explicit scientific waits, retrieval resource waits, cancelled/quarantined jobs,
invalid planning responses and unsupported candidates remain held.

Public coverage exposes `planning_recoveries` and distinguishes
`WAITING_FOR_PLANNING_RECOVERY` from scientific waiting. Retained pre-upgrade
timeouts use their existing creation timestamp when no finish timestamp exists;
their exact original FAILED job is still checked before allocating a new decision.

`planning-recovery/source-sha256.json` binds the exact incremental source against
the unchanged paged-planning bundle. Run `scripts/test_planning_recovery_source.py`
or add `--full-native` for the full portable Native suite. The regression fails
against the prior scheduler (zero new jobs) and passes with three independently
addressed new plans, unchanged original jobs, restart preservation, pause,
backoff and paged-context checks. Offline results are not scientific progress.

The separate legacy Research objective Resume button can remain blocked by its
own action generator. It does not control the atlas's evidence-crew coverage queue.
