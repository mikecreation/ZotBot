# Brain 6.2.10 upload quota and conversation recovery

The 2026-10-08 incident combined two independent delivery problems. The current
ChatGPT file input was disabled, while its explicit upload quota notice appeared
in an attachment-menu portal outside `main`. Brain 6.2.9 missed that notice and
repeated upload-confirmation attempts until jobs failed. Background-tab timer
throttling could also stretch an 80-iteration wait beyond its 45-second caller
limit. Diagnostics called the pre-editor upload stage COMPOSING.

Brain 6.2.10 probes the visible attachment toggle only when the file input is
disabled, reads the exact platform notice outside conversation/code/draft content,
and closes only a menu it opened. A confirmed upload block permits the complete
original packet as text; disabled inputs without a confirmed notice still refuse
submission. File-first behavior resumes when uploads are available. Upload and
hash preparation have elapsed-time bounds, and receipts expose the actual phase.

Text packets use a literal JSON fence longer than any backtick run in their data.
The decoded packet remains exact. This protects escaped scientific URL fields
from Markdown interpretation; it does not change captured source metadata or
invalidate an independent review. Existing rejected candidates remain rejected.

Each job records its proven conversation independently of the slot binding.
A sent/resume-only job assigned to an empty newly bound root can return to that
recorded conversation for collection only. Human drafts and other conversations
are preserved. A known-unsent server retry may update its route while retaining
its previous attempt. Unknown historical routes cannot be reconstructed by
inventing delivery receipts. The original worker_2 request was returned to its
known conversation; no complete answer was visible and Native subsequently
recorded its existing bounded deadline failure, releasing capacity without replay.

## Release checks

`upload-recovery/extension` retains the exact changed runtime and regression files.
`upload-recovery/source-sha256.json` binds the postimages; `upgrade.patch` is
reversible against retained 6.2.9. Run `scripts/test_upload_recovery_source.py`
with the locked QA Node dependencies. The complete installed extension additionally
runs `tests/validate-extension.js`. Keep the 6.2.9 retained bundle unchanged.

Loaded build identity, real quota fallback, exact original-job collection, and
publication are distinct live checks. A transport regression pass does not prove
an autonomous research mission or scientific approval. The incident's coverage
state was 710 discoverable nodes, 12 merged missions, 14 held and two authoring;
holds included source-access challenges, capture capacity and independent review
rejections. Those evidence gates are preserved by this repair.
