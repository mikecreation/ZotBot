# Brain 6.2.7 blank-composer recovery

Worker 1's live ChatGPT composer contained `<p> </p>`. The readiness check
normalized that to empty, while insertion's exact-text check rejected it as an
existing draft. The exported failure was at VERIFY_COMMIT with no click; the
export did not retain the original completed insertion details, so this observed
mismatch does not establish the cause of every earlier transport failure.

The new bundle uses one definition of a blank composer for readiness, insertion,
and retry cleanup: ASCII spaces, tabs and line endings in plain paragraphs/breaks.
Insertion still requires the exact observed DOM preimage. The native editor
model must also be blank and contain only plain paragraphs, text and breaks.
Real text, zero-width Unicode, nonbreaking spaces, marked text, embedded objects,
unknown editor nodes and racing human edits remain protected. Native model and
DOM readback, reconciliation, focus round-trip, and final pre-send checks still
verify the full prompt without normalization.

Human draft conflicts do not start the editor circuit breaker. Genuine commit
failures keep backoff and include the specific refusal method in their error.
The new transport revision supersedes old cooldowns, while persisted delivery
receipts and fences remain intact. Confirmed or ambiguous sends are never
replayed. Existing response collection, file transport, pause and binding logic
is retained and tested with this build.

`blank-composer/` retains exact deployed sources, hashes and a reversible patch
from 6.2.6; earlier bundles remain historical releases. Run
`python scripts/test_blank_composer_source.py` with the locked
`brain-transport/node_modules` dependencies installed. Run
`node tests/validate-extension.js` in the complete installed extension as well.

Install only the tested postimages into the existing extension directory, reload
that extension, and refresh bound ChatGPT pages to activate them. Installed bytes
alone do not prove activation. Verify the `6.2.7-blank-composer` heartbeat and
observe worker 1 completing one authorized delivery without a duplicate send.
Activation and live delivery remain separate from fixture validation. Native
does not need a restart.
