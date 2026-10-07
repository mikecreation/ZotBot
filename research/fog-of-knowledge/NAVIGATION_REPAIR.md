# Fog navigation and evidence compiler repair

Implemented against GitHub main `2afe6b765f1ae45f91796d5901ce0bc8d30dcd6f` on October 7, 2026, on `codex/fog-navigation-integrity`.

## Reproduced diagnosis

The original 250-node stopping point came from incomplete navigation, not a traversal cap. The renderer also had a separate seven-level search-path cutoff and clipped canonical names inside circles.

| Records | Known | Originally reachable | Originally stranded |
|---|---:|---:|---:|
| Canonical | 331 | 227 | 104 |
| Registry additions | 225 | 23 | 202 |
| Total | 556 | 250 | 306 |

The pasted diagnosis got the total correct; its stranded canonical/registry split was inaccurate. The old validator invented scientific `derived_from` edges for registry entries that the browser never saw. Geometry CI omitted the registry and tested only already connected records.

## Implemented behavior

The browser, validator and geometry check now consume the same deterministic registry and navigation projection. All 556 records have an acyclic discovery path. No scientific edges are manufactured for reachability; all original 384 edges, 331 canonical nodes and 17 reviews are preserved.

The global atlas preserves the sprawling radial circuit-board grammar. Every discovery connection remains visible; complete field and global expansion use the worker-backed canvas renderer. Support, test, refinement and contradiction networks appear on node/branch selection or through the evidence lens. Selecting a node also reveals its evidence neighbors even when they occupy another navigation branch. This makes a navigation leaf distinguishable from a record with scientific relationships elsewhere.

Only reviewed taxonomy and recorded directional lineage can establish a projected branch; unresolved records remain placement pending. There are now **279 pending records**, more than the initial repair's 104, because scientific support/refinement relationships no longer masquerade as ancestry. This is a more honest projection, not lost knowledge. Recorded legacy lineage is labeled as legacy rather than retrospectively certified.

Full canonical labels live outside node circles with semantic zoom, supplied short names, collision placement and leader lines. Focused views label every rendered node. Only an extreme global overview can suppress ordinary labels; important canonical fields remain named. Full names remain in accessible buttons, hover, search and details. An explicit All Labels control exposes every name. The old relationship badges that overlapped names were removed. Family titles are complete as well.

The scientific compiler is implemented and connected to batch application, validation, the local review desk and the live worker contract. It requires exact source excerpts, complete scoped representations, independent reviewer roles and revision-bound decisions. No semantic kind/status/era/domain coercion remains. Details are in [SCIENTIFIC_COMPILER.md](SCIENTIFIC_COMPILER.md).

## Verification

- 32 regression checks pass, including exact excerpts, stale decisions, self-review rejection, scope/classification changes, PDF page locations and unavailable text, captured response tampering, inherited-field rejection, source URL mismatch, multi-parent taxonomy, identity distinctions, raw retention and repeated application.
- The CLI rejects the unsourced historical example and applies an explicitly labeled synthetic reviewed fixture twice without changing graph, projection, index, ledger or raw input bytes. Fixtures remain in temporary test copies.
- Canonical validation passes for all 556 discoverable records and the original 384 scientific edges.
- Shared circuit geometry passes for 566 items including family hubs, all 556 navigation connections, depth 3, zero circle overlaps and zero unroutable connections at the current size. Deterministic signature: `ff9f0a214dfce371`. Ten additional hub connections complete the visible circuit. Above 2,000 items the renderer uses bounded circuit-bus routes, which may cross circles; these strokes never change scientific relationships.
- Browser inspection confirms all 556 unique records in the expanded canvas, 284 records in complete physical-field expansion, preserved full labels on selection, all 384 retained scientific relationships, and 12 recorded frontier entries. No anonymous circles occur in the inspected focus view.
- The local Nemesis transport passes an eight-file Unicode round trip. Its running service was not restarted during active research.

The existing scientific content has **not** been retroactively audited: 331 records remain legacy-unreviewed, including 41 source gaps. Model review is not a scientific truth certificate. Multi-parent and identity mechanisms are available, but this patch does not invent reviewed classifications for historical records. A synthetic 50,000-record circuit was measured locally: roughly 1.0–1.2 seconds to prepare, 4–6 ms for initial bitmap display, about 0.1–0.2 ms for cached pan redraws, and 17–32 ms for the inspected detailed viewport. Those are renderer timings, not guaranteed frame rates. The synthetic star topology, hardware, graph density, data parsing, transfer, all-label mode and cold setup affect results; an observed setup timer gap reached roughly 230 ms. No zero-lag claim is made. See [RENDERING.md](RENDERING.md).

## Run

```sh
python -m pip install -r requirements.txt
python scripts/atlas_navigation.py --check
python scripts/validate.py
python -m unittest discover -s scripts -p 'test_*.py'
node scripts/check_layout.js
python scripts/atlas_server.py --port 8097
```

Open `http://127.0.0.1:8097/` and `/review.html`. Browser screenshots are retained locally under `output/playwright/`.
