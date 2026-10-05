# Agent instructions — Fog of Knowledge

This subtree is Nemesis-native.

Before changing anything here, read:

1. `.nemesis.json`
2. `NEMESIS.md`
3. `nemesis/schema/batch.schema.json`

Hard rules:

- Do not delete falsified, superseded, disputed, or historically wrong knowledge.
- Do not make bulk research edits directly to `data/knowledge.json`. Produce a Nemesis batch and apply it through `scripts/nemesis_apply.py`.
- Claims and methods added by autonomous research require per-node provenance.
- Invalidating an existing node requires a review/counterevidence record in the same batch.
- Treat taxonomy edges and causal/dependency edges as different things.
- Prefer primary sources. Record secondary sources when they are useful for discovery or synthesis, but do not let them silently replace primary evidence.
- Batch application must be idempotent. Re-applying the same batch must not duplicate nodes, edges, or reviews.
- Run `python scripts/validate.py` before proposing a merge.
- Preserve raw batch files after application. They are part of the audit history.

For current state and suggested work, run:

```bash
python scripts/nemesis_context.py
```
