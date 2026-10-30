# Capability Harvester registry

This directory is a **persistent catalog of potentially reusable techniques and capabilities** found during normal project work. It complements the personal ChatGPT *Capability Harvester* Skill. It is not the Skill itself and does not grant new permissions or automatically install software.

## Files

- `config.json`: write authorization and scope.
- `registry.json`: versioned capability records, initially empty.

## Capture process

1. While completing an ordinary task, use the installed Skill to recognize a *concrete*, transferable tool, automation, workflow, research method, or validated fix.
2. Read the latest `config.json` and `registry.json` from the default branch using the available GitHub connector.
3. Require a concrete source. Compare with existing items for exact ID, related methods, project, and overlapping sources. Prefer updating an entry rather than adding a duplicate.
4. Record a neutral title, what it enables, project, exact source location, factual evidence, prerequisites, limitations, observed date, verification status, and optional T21 serial pointer.
5. If `auto_write_authorized` remains `true`, propose the registry update on a new `capability-harvester/*` branch and **open a pull request**. Only `capability-registry/registry.json` is allowlisted for routine automatic writes.
6. Never merge the PR without a fresh user instruction. If the connector is unavailable or approvals are required, report `Detected, not persisted` instead of claiming the record was saved.

## Status meanings

- **candidate**: concrete idea or method with unverified effectiveness.
- **tested**: reproducible successful test with exact evidence and environment.
- **enabled**: available for use in the current environment; installation/permissions verified.
- **retired**: superseded, disabled, or disproved. Preserve record for provenance.

A proposed capability, PR, URL, or remembered title does not grant ChatGPT tools, execution privileges, access, or new model abilities.

## Record structure

`registry.json` uses schema version `1.0` and an `items` list. Each entry has a deterministic `cap-...` ID derived from its normalized `project|category|title`, plus:

```json
{
  "id": "cap-<16-char-hex-hash>",
  "title": "Descriptive capability name",
  "project": "Project name",
  "category": "workflow",
  "enables": "Specific repeatable action",
  "reuse_context": "Where it could be helpful later",
  "source": {"type": "repository", "locator": "owner/repo:path@commit"},
  "evidence": "unverified",
  "requirements": [],
  "limitations": [],
  "status": "candidate",
  "observed_on": "2026-10-30",
  "verified_on": null,
  "t21_serial": null
}
```

Allowed categories: `tool`, `integration`, `skill`, `workflow`, `code`, `research-method`. Allowed sources: `repository`, `url`, `chat-artifact`, `document`. Use `chat-artifact` only when safe to publish and the exact artifact is retrievable.

## Separation and privacy

- **T21 Motherload** is the router to exact serialized payloads. Do not modify or copy T21 indexes or payloads, or write to Memory as part of harvesting. A title or catalog entry is only a pointer. If the needed payload cannot be read: `I have pointer, not payload.`
- **This repository is public.** Do not commit secrets, access tokens, personal data, private excerpts, private repository references, unpublished research, or sensitive project material. Skip unsafe records until a private approved location exists.
- Approval applies **only to routine registry-file PRs**; it does not authorize app code edits, deployment, account settings changes, model setting changes, merges, or spending.
- Registry changes are versioned and can be reviewed in the PR before merging.

## What is automatic

Skill selection can occur automatically **during relevant chats where the Skill is available and selected**, and the GitHub connector may then write a proposed registry PR. This is **best effort**, not a guaranteed every-chat observer or a background service. It does not monitor other agents' work unless their outputs are accessible in that task. No GitHub Actions schedule or paid service is required for this setup.

To disable future registry PRs, change `auto_write_authorized` to `false` on the default branch.
