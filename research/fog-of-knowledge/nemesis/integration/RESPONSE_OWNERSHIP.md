# Brain 6.2.6 response ownership

During live verification of Native 14.14 / Brain 6.2.5, ChatGPT completed the
correct request but its Latest response presentation rendered only an assistant
search unit. Nemesis retained the SENT job because no matching user turn appeared.
The response was visible; no timeout or retry established that it was unsent.

Brain 6.2.6 can collect that same job using a persisted clicked receipt and an
exact nonce-bound complete return in the latest assistant unit. This collection
path requires no user nodes, no active generation or send, the observed explicit
complete-turn marker, visible completed-turn actions and eight seconds of stable
text. An intervening rendered user, newer unrelated assistant, wrong nonce,
unfinished/invalid return or manual-stop receipt cannot pass. It neither sends
another prompt nor requests formatting recovery. A matching completed return can
reconcile its original delivery fence; formatting fences keep their separate
confirmation requirement. Native still validates the owner and original lease.

`response-ownership/` retains exact deployed sources, source hashes, the reversible
incremental patch from 6.2.5 and six offline browser suites including the observed
DOM regression. Earlier 6.2.4 and 6.2.5 bundles remain historical releases.
Run `python scripts/test_response_ownership_source.py` with the locked
`brain-transport/node_modules` dependencies installed. The complete installed
extension also requires `node tests/validate-extension.js`.

The affected-path runner executes every script in a check group separately and
records each exit status. A timeout is a failed check and does not hide subsequent
checks. The full portable Native suite has a separate 600-second test budget
after a Windows run exceeded the ordinary 300-second script budget. This changes
neither scientific job deadlines nor the expired demonstration budget.

Installed bytes do not prove activation. Reload the already-installed extension,
refresh its bound worker pages, verify the `6.2.6-response-ownership` heartbeat and
collect the original job without resending it. A functional read-only cycle is
not a scientific expansion run and does not justify extending an expired
demonstration budget. Unknown future page presentations remain explicit delivery
uncertainty rather than permission to duplicate a scientific request.
