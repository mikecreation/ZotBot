# Nemesis batches

This directory is the immutable research intake layer for Fog of Knowledge.

Each real run should create a new folder:

```text
batches/<batch_id>/
  manifest.json
  nodes.jsonl
  edges.jsonl
  reviews.jsonl
```

Do not overwrite an old batch to revise history. Create a correcting batch.

The batch protocol is intentionally independent of the atlas renderer and canonical storage engine.
