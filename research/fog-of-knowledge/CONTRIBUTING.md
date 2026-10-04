# Contributing

The map is meant to be argued with. The argument has to be inspectable.

## Add knowledge

1. Add or edit a node in `data/knowledge.json`, or curate an entry from `data/ologies.tsv`.
2. Give it a stable ID.
3. Attach primary sources for factual or historical claims whenever possible.
4. Add the relationships that explain what enabled it, what it depends on, and what it affects.
5. Run `python scripts/validate.py`.
6. Open a pull request explaining the change.

## Challenge a claim

Do **not** delete it.

Attach a review record and reproducible evidence. If warranted, change the node to `disputed`, `invalidated`, or `historical`.

Use `dependency: hard` only when failure of the parent genuinely breaks the child. Otherwise use `soft`.

Relationship types: `enabled`, `depends_on`, `derived_from`, `supports`, `contradicts`, `supersedes`, `related`.

## -ology discovery

Run:

```bash
python scripts/import_wiktionary_ologies.py
```

Candidates go to `data/ologies.staging.json`. Staging is not automatic promotion. Some `-ology` words are obsolete, humorous, synonymous, ideological, or not disciplines. Classify and source them before adding them to the canonical graph.
