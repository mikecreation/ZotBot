# Complete knowledge circuits at scale

The visual target is a sprawling circuit with every recorded node, rather than detached constellations. Navigation strokes show discovery context; scientific support, tests, refinements and contradictions stay in their original graph and appear through selection or the evidence lens. Neither rendering nor discovery placement confers scientific trust.

Full and field expansion share one cached, deterministic geometry build. A Web Worker packs branches and routes wires. The worker also builds bounding-volume indexes, so the UI queries visible geometry without walking thousands of SVG elements. OffscreenCanvas paints the complete overview in the worker and transfers an ImageBitmap. During pan/zoom, the UI transforms that bitmap; after input settles, it draws the detailed viewport at the current scale. Nodes are batch-drawn by field. There are no per-node filters, timers or animations in complete expansion. Pointer hit-testing uses the node spatial index, while search and selected-node controls expose complete names and evidence.

Every record remains in the geometry and indexes, including nodes outside the current camera. Every node is drawn in the global overview. Only ordinary labels at an extreme subpixel overview may yield; important field labels remain, and All Labels explicitly displays complete names. Supplied short names may appear through semantic zoom. Canonical names never become ellipses or cut fragments.

At up to 2,000 items, progressive obstacle routing refines the first visible circuit without blocking input. Larger graphs use deterministic circuit buses instead of running a flood-fill for every wire. Bus strokes may cross circles; this is a visual routing compromise, never a scientific edge or a deleted node. The current 556-record atlas passes exact circle/connector geometry checks.

## Reproduce the browser measurement

Start `python scripts/atlas_server.py --port 8097`, then use a headless Playwright CLI session:

```sh
npx --package @playwright/cli playwright-cli -s=fog-benchmark open http://127.0.0.1:8097/
npx --package @playwright/cli playwright-cli -s=fog-benchmark resize 1900 1060
npx --package @playwright/cli playwright-cli -s=fog-benchmark run-code --filename scripts/benchmark_atlas.js
npx --package @playwright/cli playwright-cli -s=fog-benchmark close
```

The script creates a temporary synthetic 50,000-record star topology with 50,000 discovery connections, measures preparation, initial display, 30 cached camera redraws, a detailed viewport, and event-loop timer gaps, then removes its temporary renderer. It never writes canonical knowledge. The fixture establishes rendering coverage and a reproducible workload; it is not a scientific atlas of 50,000 verified discoveries.

October 7, 2026 local Chromium runs at 1900×1060 produced:

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
