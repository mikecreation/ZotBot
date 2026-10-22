# Vegetation, trees and real axe chopping (JOB 1)

## What is in the game
- **Grass** (vegetation.js): GPU-instanced, Ghost-of-Tsushima-style curved blades (each blade is a tapered strip bent along a quadratic curve). Wind runs through the vertex shader with a scrolling gust field. Colour varies per blade from root to tip, there is translucency facing the sun, and density falls off with distance from the player. Grass is pushed away from the player's feet and works alongside the footprint system.
- **Trees**: built procedurally with a recursive Weber & Penn style trunk/branch generator for broadleaf and conifer species. Settings per species: height, taper, branch start (kStart), leaves per branch and leaf size. Leaf cards use alpha-to-coverage. Distant trees switch to baked impostors: each tree type is rendered once into an RGBA target and drawn as 3 crossed alpha quads. Trees stay as per-type InstancedMeshes (ch.tr / ch.cr), so felling, burning and gathering work as before.
- **Flowers**: instanced, in several colours. Small blooms are scattered through the grass.
- **Real axe chopping** (axe.js):
  - Two-bone IK on the human rig (DEF-upper_arm > forearm > hand, R and L). The grip points are measured from the axe mesh itself (handle axis, head end, blade side).
  - A two-sided raycast finds the trunk's true axis and radius at chest height, even on leaning, gnarled trunks.
  - Swing phases: wind-up, downswing, contact, then recovery. On contact you get hit-stop, wood/bark chips and a thud sound.
  - Each hit deepens a V-notch: depth = min(1.15R, 1.25R x progress). The notch has a pale wood face shader with jagged torn-bark edges, and the bark shader is discarded inside the wedge.
  - After 6 hits the tree falls away from the notch, rotating about the hinge, and the stump is left showing the cut ring.
  - The woodland house, water wheel, gatherables and footprints are untouched.
- Debug hooks: `__fogWorld.chopTest(n,freeze)`, `axeFreeze`, `axeDbg`.

## Sources (researched, then our own implementation; no third-party assets)
- Eric Wohllaib, "Procedural Grass in Ghost of Tsushima", GDC 2021.
- Jason Weber & Joseph Penn, "Creation and Rendering of Realistic Trees", SIGGRAPH 1995.
- GPU Gems 3, ch. 16 "Vegetation Procedural Animation and Shading in Crysis" (Sousa).
- Ben Golus, "Anti-aliased Alpha Test: The Esoteric Alpha To Coverage" (2017).
- Ryan Brucks, "Octahedral Impostors" (2018), background reading; we use simpler baked cross-quad impostors.
- Two-bone analytic IK (law of cosines with a pole vector), as in standard game animation references (e.g. "Two Bone IK", theorangeduck.com).
