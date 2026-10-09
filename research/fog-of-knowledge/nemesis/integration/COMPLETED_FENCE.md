# Completed requests must release delivery guards

Brain 6.2.11 could keep an idle Primary or worker in DELIVERY_UNCONFIRMED after
Nemesis had already collected its COMPLETE reply. The persistent page fence held
the request ID, but the server no longer returned an active lease. A generic page
status omitted the ID, returned READY, and could not prove the retained delivery.
Polling advertised DELIVERY_UNCONFIRMED forever, so no new work was assigned.

Brain 6.2.12 probes that exact fence ID with NB_CONTENT_STATUS when a generic
READY or differently addressed report cannot establish ownership. The existing
receipt rules then clear only confirmed delivery: a matching user turn, an exact
clicked and completed owned response, or a proven unsent receipt. Unknown
deliveries and formatting recovery's separate confirmation remain fenced.
No request is replayed, no result is resubmitted, and no editor is changed by this
probe. The old guard's nonce is checked again before clearing it.

The background advertises 6.2.12-completed-fence while intentionally retaining
the unchanged 6.2.11-status-scan page transport and collector. Reloading the
extension activates this background repair without refreshing worker conversations
or restarting Nemesis. Scientific capture, independent review and publication
requirements remain unchanged. Research activity is not a published node count.

The regression reproduces a completed server assignment with a retained fence
and no active job. The previous background fails it; the repaired background
releases a proven reply, preserves ambiguity, performs no send or formatting
request, and submits no result against a removed lease. Run
`python scripts/test_completed_fence_source.py` for exact source hashes, reversible
patch validation and the complete retained browser suite. Live activation and
delivery are separate acceptance checks.
