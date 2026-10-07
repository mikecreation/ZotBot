# Nemesis evidence crew integration

The local Nemesis upgrade is retained in `evidence-crew.patch`. It targets the V17
runtime containing the existing live worker contract, GitHub batches and Brain
bridge. Apply `github_batches-evidence.patch` first if the runtime does not yet
retain sources/assertions/taxonomy/identity files. Stop workers before restarting.
The patch does not replace the research database or reset existing jobs.

From the Nemesis application directory, check the patch against the installed
files before applying it:

```sh
git apply --ignore-space-change --check /path/to/fog/nemesis/integration/evidence-crew.patch
git apply --ignore-space-change /path/to/fog/nemesis/integration/evidence-crew.patch
python -m pip install -r requirements.txt
```

The Fog project must also be refreshed to the matching main revision containing
`scripts/nemesis_evidence_exchange.py` and its three manifest commands. Run the
adapter tests with `FOG_PROJECT_ROOT` pointing at that Fog checkout:

```sh
python -m pytest tests/test_github_evidence.py tests/test_github_workspace.py
```

Restart through the normal Nemesis supervisor. `/api/health` reports
`fog_evidence_crew.version = fog-evidence-crew/1` and `running = true`.
Starting the application does not start a new Fog wave. **Expand map with crew**
explicitly queues three bounded discovery missions. Connected Brain slots handle
these jobs without pinning work to a disconnected worker.

After the base patch, apply `crew-recovery.patch` and restart Nemesis, then reload
the existing **Nemesis application page**. Its atlas-only Refresh button refreshes
the embedded graph and does not reload application JavaScript. An already-open
page can otherwise keep submitting the retired `fog-crew:boss/w1/w2/w3` workflow
after a server upgrade: those jobs finish but have no durable evidence handoff.
The recovery patch rejects untracked Fog jobs on `/api/brain/jobs` with an explicit
reload message before dispatch. Existing replies remain retained in `brain_jobs`.
The current client loads as `github.js?v=gh-evidence-2`, checks the server's client
revision, and shows discovery, capture, author, review, completion and blocking
reasons directly above the atlas. Idle connected slots are separate from pipeline
progress; a blocked candidate does not masquerade as an active researcher.

The durable workflow is:

1. Workers discover one to four bounded public source URLs and identify existing
   records that need evidence. No scientific record is published at this stage.
2. Pinned compiler capture retains HTTP bytes, extraction metadata and full text.
   Local/private source destinations and redirects are rejected by this adapter.
3. A separate author job constructs at most twelve targets with exact source
   excerpts, complete representations, hashes and explicit scope. Source objects
   must exactly match the retained captures. Unsupported input blocks; it is not
   repaired by a formatting retry.
   An author may reference retained source IDs instead of repeating full text.
   Missing hashes and uniquely located exact-quote offsets are bound mechanically;
   supplied incorrect values are rejected. Original author output is published
   beside the batch so this binding can be inspected.
4. Entailment and adversarial reviewer jobs receive the same revision-bound
   packet. Both decisions are retained separately and checked by the compiler.
   Model review is recorded provenance, not independent scientific corroboration.
5. The sandbox receives retained capture receipts, original binary responses and
   adjudications along with the candidate. Check/apply/validate repeat against
   the current canonical context. Raw responses are uploaded as base64 bytes.
6. With **Automate** enabled at wave dispatch, a passing candidate opens a PR.
   The adapter waits for successful validation CI and merges only the exact
   checked head commit. With Automate off it stops at `READY`; Check/Open PR
   remain available. Legacy four-file jobs are never automatically harvested or
   merged by the new workflow.

Flow state and job IDs live under Nemesis `data/github_cache/evidence-crew` as
ordinary JSON files. The server continues existing handoffs when the browser is
closed and resumes tracked IDs after restart. It reads tracked Brain results by
ID, avoiding the UI's twenty-most-recent-jobs limit. Errors, uncertain support,
oversized packets (300 KB), stale representations, failed CI and changed PR heads
stop at `BLOCKED` with the retained candidate and reason. Revise explicitly using
a new batch; the adapter does not silently change scientific meaning.

Synthetic tests use disposable copies and fake Brain/GitHub services. They do
not dispatch real researchers, create real PRs, or add fixture knowledge to Fog.
