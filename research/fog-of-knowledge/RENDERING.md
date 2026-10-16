# Complete knowledge circuits at scale

The visual target is a sprawling circuit with every recorded node, rather than detached constellations. Navigation strokes show discovery context; scientific support, tests, refinements and contradictions stay in their original graph and appear through selection or the evidence lens. Neither rendering nor discovery placement confers scientific trust.

Full and field expansion share one cached, deterministic geometry build. A Web Worker packs branches and routes wires. The worker also builds bounding-volume indexes, so the UI queries visible geometry without walking thousands of SVG elements. OffscreenCanvas paints the complete overview in the worker and transfers an ImageBitmap. During pan/zoom, the UI transforms that bitmap; after input settles, it draws the detailed viewport at the current scale. Nodes are batch-drawn by field. There are no per-node filters, timers or animations in complete expansion. Pointer hit-testing uses the node spatial index, while search and selected-node controls expose complete names and evidence.

Every record remains in the geometry and indexes, including nodes outside the current camera. Every node is drawn in the global overview. Only ordinary labels at an extreme subpixel overview may yield; important field labels remain, and All Labels explicitly displays complete names. Supplied short names may appear through semantic zoom. Canonical names never become ellipses or cut fragments.

Every atlas size now receives progressive obstacle routing. One spatial obstacle index, goal-directed search and shared parent trunks replace repeated whole-map flood fills. Subtree-first packing reserves nearby space for inventory groups and their immediate children; displaced parents carry their descendants with them. Temporary spokes are replaced by clear routes in bounded progress batches without changing any scientific relationship. Each finished navigation segment is independently checked against unrelated node borders with seven world units of clearance; scientific evidence overlays remain a distinct view.

The initial browser payload is `data/atlas-display.json`, a deterministic projection bound to the navigation input hash. It retains complete canonical UI records and every historical node assertion's exact statement, scope, support and target binding. Full proof bundles stay in the canonical graph and batch archive. Native batch application automatically regenerates the display projection; validation checks exact bytes. Missing, invalid or stale projections fall back to the full canonical graph. Pinned assets use normal HTTP caching.

Worker overview requests carry generation IDs, options and canvas dimensions. Resize and scope bursts coalesce; stale bitmaps are closed, final routes trigger a fresh bitmap, and unavailable OffscreenCanvas falls back to the canvas painter without blanking large neighborhoods. Resizing preserves a manually moved camera; explicit FIT and chrome layout controls still refit intentionally.

October 16, 2026, 4,303-record measurements: the display payload is7,743,902 bytes versus29,141,371 canonical bytes (73.4% smaller). Local live-browser worker geometry took368ms and full routing completed in8.23s while the initial map remained interactive. Independent checks cover all4,303 records,4,436 navigation connectors and180,301 routed segments, with zero circle overlaps, unrelated-circle intersections or unrouted connectors. These are local measurements, not guaranteed timings. The synthetic50,000-record packing and12,000-level chain fixtures preserve complete coverage; their workloads differ from the live graph.

## Reproduce the browser measurement

Start `python scripts/atlas_server.py --port 8097`, then use a headless Playwright CLI session:

```sh
npx --package @playwright/cli playwright-cli -s=fog-benchmark open http://127.0.0.1:8097/
npx --package @playwright/cli playwright-cli -s=fog-benchmark resize 1900 1060
npx --package @playwright/cli playwright-cli -s=fog-benchmark run-code --filename scripts/benchmark_atlas.js
npx --package @playwright/cli playwright-cli -s=fog-benchmark close
```

The script creates a temporary synthetic 50,000-record star topology with 50,000 discovery connections, measures preparation, initial display, 30 cached camera redraws, a detailed viewport, and event-loop timer gaps, then removes its temporary renderer. It never writes canonical knowledge. The fixture establishes rendering coverage and a reproducible workload; it is not a scientific atlas of 50,000 verified discoveries.

Historical October 7, 2026 local Chromium runs at1900×1060 using the former bus-only large-map routing produced the following measurements. They do not measure completion of the newer obstacle routes:

| Measurement | Observed |
|---|---:|
| Records preserved | 50,000 / 50,000 |
| Worker geometry and index build | about 550 ms |
| Ready for first display | about 1.0–1.2 s |
| First bitmap display | about 4–6 ms |
| Cached pan redraw p95 | about 0.2 ms |
| Detailed viewport redraw | 17–32 ms |
| Typical timer gap p95 | about 17 ms |
| Largest observed setup timer gap | about 230 ms |

These are local rendering measurements, not guaranteed FPS or zero-lag promises. Dense evidence graphs, other topologies, all-label mode, large canonical JSON parsing/transfer and different hardware can cost more. Graph loading still reads complete artifacts. Bounded revision-aware API pagination is available for further incremental loading. OffscreenCanvas-unavailable browsers fall back to main-thread canvas drawing; a worker load failure is reported visibly. No benchmark claims unlimited scale.

## Collapsible chrome

`atlas-chrome.js` controls presentation only. None of these controls change graph, review or worker state.

- **Header:** ▴/▾ (or `[`) collapses the header to a 32px bar. The bar keeps HUB, Expand all, Frontier lens, search (⌕ or `/`), Focus map and the expand chevron.
- **Right panel:** the edge tab (or `]`) collapses it to a 26px labeled tab. The tab is its own grid column, so it never covers the map.
- **Focus map:** FOCUS MAP, ⤢ or `F` collapses everything at once. Esc or EXIT FOCUS restores the previous choices.
- **Map note:** × on the note, the INFO button or `I` hides and shows it.

State persists in `localStorage` (`fog:atlas-chrome:v1`). Every change refits the visible viewport through the existing FIT path, so the circle spacing is unchanged. The compact list layout is chosen from the window size, not the map's own size, which avoids a layout feedback loop. The map surface uses `overflow:clip` so hidden geometry cannot leave the bottom of the map blank. Regression test: `node scripts/test_atlas_chrome.js`.
