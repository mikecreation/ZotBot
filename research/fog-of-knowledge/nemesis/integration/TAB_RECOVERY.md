# Brain 6.2.9: file-first delivery and unresponsive-page recovery

The earlier 6.2.8 text-first default caused 200–300 KB research tasks to be
rendered as user messages. A recent retained archaeology packet was 308,795
characters: its GOAL held about 215,600 characters of captured sources and
61,504 characters of a 485-record catalog, plus coverage and compiler context.
This packaging explains message size; it does not establish the cause of a
Chrome renderer's 954 MB memory footprint or a platform stream failure.

## Transport

- Complete original packets prefer the existing UTF-8 JSON file adapter, with
  SHA256, byte length and explicit instructions to read the entire attachment.
- Explicit images and user-provided attachments retain their existing adapter.
- Only a visible platform notice explicitly blocking uploads (including an
  attachment quota or upload-related upgrade notice) permits exact text fallback.
  Generic Upgrade buttons, source quotations, hidden notices, missing file inputs
  and unconfirmed uploads do not authorize fallback.
- A blocked upload is cleaned up before inline fallback if its owned file chip
  appeared. Unrelated attachments are preserved. No content is shortened.
- The existing 4 MB file bound and 600,000-character complete inline prompt
  bound fail explicitly. The latter is a local transport guard, not a claimed
  ChatGPT model/context guarantee. A file chip does not prove the model read it.

## Automatic page recovery

The extension alarm runs independently of renderer heartbeats. At least three
consecutive content-message failures spanning two minutes trigger replacement
of the bound tab. Responsive generation, Native HTTP failures, deliberate
navigation and known human drafts do not trigger this watchdog. Both primary
and worker slots use the same path. A missing bridge after extension reload first
gets one bounded, idempotent content-script reinjection before page replacement.
This repairs responsive pages without refreshing them. New-chat bootstraps with an active job and
no stable conversation ID remain unresolved rather than being blindly replayed.

A durable per-slot journal records the original conversation, job ID, delivery
fence and actual retained receipt. An extension-owned placeholder with a unique
nonce makes tab creation recoverable across service-worker termination. The new
tab takes the existing slot before the old renderer closes, then loads the same
conversation. Old-tab authorization is denied. Configuration and status writes
are serialized so independent workers cannot overwrite another slot's binding.

Receipts are checkpointed outside the renderer before submission. The checkpoint
is the existing conservative pre-click ambiguity marker, not proof of delivery.
Replacement restores genuine receipts and completed results; it never invents
an unsent or clicked decision. Unknown delivery gets a collection-only fence.
Only an exact owned user turn, completed nonce-bound result or established
known-unsent receipt can reconcile it through the existing rules. If the original
turn cannot be found, the job remains DELIVERY_UNCONFIRMED rather than resending.
Completed replies still require the existing owner/lease and scientific gates.

No more than two tab replacements per slot occur in 15 minutes. A replacement
that fails to load for three minutes returns to the watchdog with its evidence
and ambiguity intact. Pause, explicit unbind/rebind, navigation, and recovery
backoff remain visible. Recovery journals are bounded to one per slot; retired
renderer health caches are cleared.

## Visible stream-error recovery

The current owned response's visible “Error in message stream” alert, or the
exact label paired with a visible Retry control, triggers a same-tab refresh.
Source/code quotations, older alerts and another request's error cannot trigger
it. The original request is preserved and collected, not sent again. At most
two refreshes per job are attempted, at least a minute apart. A persistent error
then follows the existing failure-reporting path rather than looping forever.
Refreshing may restore rendering; it does not guarantee a failed server response
will resume or finish.

## Deployment and verification

`tab-recovery/extension/` retains exact 6.2.9 postimages, their SHA256 index and a
reversible upgrade patch against the retained 6.2.8 bundle. Run:

```text
python scripts/test_tab_recovery_source.py
python scripts/validate.py
```

The source gate checks hashes, reverse/apply deployment and all retained browser
fixtures: real ProseMirror commits, file-first and quota fallback, request/reply
ownership, hung primary/worker isolation, original-lease collection, interrupted
tab creation, pause/navigation/draft protection, backoff and stream refresh.
These are offline tests. Installation, extension reload, loaded build and real
page delivery are separate live checks; never report them as passed from fixtures.
The Native application, workers' scientific contracts and atlas are not restarted
or redesigned by this extension update.
