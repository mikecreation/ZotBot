# Brain 6.2.8 text-first evidence transport

The observed ChatGPT platform notice said its attachment quota was exhausted.
Brain 6.2.7 automatically converted any Fog packet over 48,000 serialized
characters into a file, even when its complete text fit the separate existing
600,000-character UI transport safety cap. Failed live review packets were
approximately 94,000–125,000 characters; queued author packets were approximately
181,000–287,000. These measurements describe this incident, not platform limits.

Brain 6.2.8 prefers the exact original packet as inline text whenever the full
prompt, including the request ID and transport instructions, fits that existing
cap. It does not increase the cap or summarize, truncate, remove, or rewrite
sources, assertions, relationships, reviewer identity, or compiler requirements.
Both review roles receive the complete original packet. Explicit attachments,
including images, keep their existing handling. Larger Fog packets retain the
existing lossless UTF-8 file adapter with its digest and explicit 4 MB bound.
The prompt length guard now runs before any attachment upload.

The 600,000-character cap is a Nemesis safety bound, **not a verified ChatGPT
composer or context limit**. ChatGPT can reject an inline message independently;
the retained rejection collector reports that failure without automatically
resending an already submitted or ambiguous turn. Native editor transaction,
full readback, lease authorization, draft protection, response ownership,
delivery fences, and no duplicate send rules are retained.

For packets that still require a file, a visible platform upload-quota notice
now produces an explicit quota error before an upload is attempted. Text-only
packets skip upload handling entirely. Quoted notices inside conversation/source
text, drafts, and hidden elements do not count as platform notices. This release
does not lift an account quota or guarantee that arbitrary evidence will fit
inside a model's context.

`text-first/` contains exact deployed sources, SHA-256 bindings, and a reversible
patch from the retained 6.2.7 bundle. Run:

```text
python scripts/test_text_first_source.py
node tests/validate-extension.js  # in a complete extension staging directory
python scripts/validate.py
```

The new offline cases cover complete packets across author, entailment and
adversarial roles; Unicode and escaping; the exact wrapper-inclusive boundary;
unchanged explicit images; lossless oversized files; and quota detection without
coupling text delivery to uploads. The preceding delivery and collector fault
injection cases run against the new source too.

Install only verified postimages in the existing extension directory, retaining
the 6.2.7 backup. Reload the extension, then refresh only idle bound ChatGPT pages.
No Native restart is required. Verify `6.2.8-text-first` heartbeats and delivery
of an existing authorized complete packet as inline text, without a new file or
duplicate user turn. Installed source, offline tests, CI, live activation,
completed response collection, and scientific publication are separate gates.
