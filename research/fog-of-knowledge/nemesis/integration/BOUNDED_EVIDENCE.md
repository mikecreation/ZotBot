# Bounded evidence delivery

Author and independent reviewer jobs use `fog-evidence-reads/1` over complete
compiler-owned captures in the pinned project. The initial author view contains
source metadata, URLs and prefix windows, plus the live compiler contract.
The repeated whole atlas catalog is replaced by exact record queries. A URL is
never treated as captured evidence, and a prefix is never called a complete paper.

Reviews retain the complete canonical target, assertion, scope and every exact
supporting quotation, with surrounding context. Both roles independently request
additional retained sections, limitations and counterevidence. Reads do not count
as approval. The original full packet, candidate/context hashes, source bindings,
compiler, scientific rejection rules and exact-head CI remain authoritative.

Each outbound evidence JSON view is at most 32,000 UTF-8 bytes. A source read
covers at most 2,000 Unicode code points; a reply is at most 10,000 bytes. These
are transport capacities, not limits on stored scientific knowledge. Sources may
be millions of characters long. An indivisible canonical assertion that cannot
fit is retained with an explicit capacity failure; it is never clipped or approved.
The Brain's file-first delivery and explicit upload-quota fallback are unchanged.

Workers return a separate object to retrieve more evidence:

```json
{"decision":"retrieve","request":{"operation":"search","source_id":"retained-id","query":"limitations","offset":0}}
```

Operations are exact source offsets, literal search with context, source catalog,
complete pinned/proposed records by IDs or literal query, and replay of previous
reads. Replies disclose counts, offsets, hashes and pagination. A zero-match
literal query does not prove a concept is absent. There is no worker-selected
filesystem path, SQL, shell, or source rewriting. PDF windows retain page locations.

Each author unit or review role has its own durable input, frame, request/result
journal and job history. Enqueue-before-checkpoint recovery reuses the same
deterministic job; prior replies remain replayable without accumulating full
papers in later prompts. Reviewer conclusions are not passed to the other role.

After 64 reads a stream waits, preserving its candidate, job and reviews. This is
a resource wait, not scientific exhaustion. An explicit additional grant resumes
it using the existing same-origin Native API:

`POST /api/github/project/{owner}/{repo}/evidence-crew/{batch_id}/evidence-read-resume`

Body: `{"key":"exact public wait key","additional_turns":16}` (1–64 per grant).
The grant never enables a paused pool or bypasses review. Status exposes
`evidence_read_wait`. Invalid/oversized requests return an explicit error, never
silently shortened evidence.

Migration preserves existing submitted jobs and retained review roles. Only new
jobs use bounded views; an already sent giant message and its conversation history
are not erased. Activation requires loading Native runtime revision
`crew-bounded-evidence/1`; no extension update is required. Offline tests cover
large sources, Unicode/page offsets, late counterevidence, immutable identities,
journal recovery, independent reviews, the real compiler/apply/validator and
exact-head CI. Those tests do not establish live scientific publication or guarantee
that ChatGPT can never freeze.

Run `python scripts/test_bounded_evidence_source.py --full-native` for the portable
suite or `--source-only` to verify exact sources and the reversible patch.
