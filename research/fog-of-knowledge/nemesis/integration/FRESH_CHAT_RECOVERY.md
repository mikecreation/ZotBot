# Fresh conversations for overloaded workers

The previous watchdog replaced the renderer but reopened its original ChatGPT
conversation. Its pending-job routing rule also returned an explicitly bound
empty tab to the old URL. Both paths could load the same oversized conversation
again. Brain 6.2.13 opens `https://chatgpt.com/` instead. The old URL remains audit
metadata and is never the replacement target.

After three page failures spanning two minutes, the extension creates a durable,
nonce-owned placeholder, fences the old renderer, and asks Native to retire the
exact owned request. Native 14.14.3 preserves its ID, owner, lease, input, source
references and candidate/review state as `QUARANTINED`. The slot can process
other independently queued tasks. The ambiguous old request is never resubmitted.
Its exact late result can still be accepted with the original owner/lease and
protocol ID; no new request is substituted for it. Completed replies already
checkpointed outside the renderer are submitted before retirement.

The existing evidence crew treats quarantine as an operational block, retaining
the affected stage and all completed reviews without reauthoring or spending a
scientific revision. A fresh browser tab cannot recover an answer that was never
retained. Such a candidate remains pending, visibly unresolved. This update does
not claim that an uncertain request completed or that all frozen research resumes.
Primary authority holds remain in force; research workers gain no SYSTEM access.

New tasks use the existing bounded evidence views and server-side retrieval
checkpoints. No old transcript is copied into a fresh conversation. Between
jobs, a responsive empty composer rolls over after four completed requests or
120,000 accumulated request/response characters. Those are local precautionary
limits, not a measured Chrome memory guarantee. Active generation, a delivery
fence, and human drafts prevent rollover. Existing pre-update conversations
are recovered when the watchdog observes a hang; their past sizes are unknown.

Unfinished journals from the older build migrate to fresh-chat recovery. Restart
finds the same placeholder rather than creating duplicate tabs. Native must
acknowledge retirement before the old tab is closed. Failed acknowledgement
retains the old request and prevents sends into the replacement. Rebinding,
pausing, deliberate navigation and the existing two-replacements-per-15-minute
watchdog limit remain protected. Responsive stream errors retain their bounded
same-tab refresh behavior; a subsequently hung page uses fresh-chat recovery.

`fresh-chat/` contains exact changed postimages and a reversible incremental patch
over completed-fence plus the Native bounded-evidence/cancellation layers. Run
`python scripts/test_fresh_chat_source.py --full-native` and
`python scripts/validate.py`. CI exercises the source gate. Offline fault injection,
installation, loaded versions and live fresh-chat delivery are distinct checks.
Activation requires both a Native restart and extension reload; leave existing
worker tabs alone so recovery can preserve their delivery state.
