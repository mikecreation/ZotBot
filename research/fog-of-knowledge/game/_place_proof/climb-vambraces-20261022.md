# Climb spiked vambraces + plant pose (2026-10-22 America/Chicago)

## BEFORE
- Climb hands: tiny brown BoxGeometry palms + micro cones — read as yellow sponge/brick blobs in third person.
- Pose: upright walk with arms reaching ~head-high floating targets (poseHandDrill climb path); no body lean into slope.

## AFTER
- Spiked vambraces on both hands: dark leather forearm wrap + straps, palm plate, knuckle pads, 5 palm spikes (steel/bone) + 2 forearm spikes — clear third-person silhouette.
- Climb pose: body leans into slope (~0.4 rad); each hand IK-plants toward uphill surface via heightAt; staggered reach; palms flattened toward rock. Held items stay hidden while climbing.
- Inventory primitive for climbing_gloves matches vambrace look.
- Cache-bust: world/gfx/primitive v=3.36.0 (index imports world 3.36.0).

## How to try
1. Hard-refresh http://127.0.0.1:18437/ (Ctrl+F5) so ?v=3.36.0 loads.
2. Have spiked climbing gloves in inventory (craft path or DEV give climbing_gloves).
3. Find a steep slope (guide may pop on first visit) and hold W uphill.
4. Expect: lean + hands planted on rock with visible spiked vambraces — not upright empty-hand stroll / yellow blobs.

## Scope kept
- Did NOT touch bow/arrows, wheels, buildings, atlas, Nemesis.
