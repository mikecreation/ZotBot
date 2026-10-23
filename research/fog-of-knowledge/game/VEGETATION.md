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


## Tree mesh rebuild (branch junctions + continuous trunks)
Research applied (no third-party assets; our own implementation):
- **Weber & Penn** (SIGGRAPH 1995): recursive stem levels, relative length/radius, base flare, tropism.
- **SpeedTree Branch Intersections**: "welding" — child sits on parent skin (bottom ring projected onto parent cylinder); weld distance + spread form the collar/web; light-seam reduction blends child normals toward parent surface normals over the weld. We do **not** boolean-fuse into one watertight mesh (same practical reason SpeedTree cites for games).
- **Lluch et al.** / Unity discussions: soft junction transitions; NormalThief-style normal blending at the collar.
- **SpeedTree UV**: Relative V (keep aspect) so bark texel density matches circumference; continuous V along arc length avoids horizontal "stacked log" UV rings.
- **Branch collar anatomy**: flared attachment thicker than the free branch, tapering quickly into the limb.

Implementation notes:
- Trunk: 12–14 rings, power-curve taper, 9–10 radial sides, continuous UVs — reads as one bole, not stacked segments.
- Each twig gets a unique random `radMul` in a natural range; thicker near the trunk via parent radius at the attach point.
- Weld rings (4) flare from ~parent radius down to branch radius; first-ring verts lerp onto the parent cylinder; normals blend with the parent surface.

## Ground cover (short grass, not moss)
- **Ghost of Tsushima** (Wohllaib, GDC 2021): terrain material + dense procedural blades; short grass can fold verts for denser near-ground cover.
- Terrain albedo retuned: anisotropic high-frequency fiber noise (vertical streaks) mixed with soil flecks and lighter blade tips — not spongy moss FBM. Grass clumps add a ring of tiny short under-blades.

## Tools
- Durability consumption disabled in play (`useTool` no-op); green durability bars hidden. Tools never break or disappear.

## RAE pass (HyperGrass + pine bark)
- **Grass**: original layered sprouts (short underlayer + mid + tall accents), noise-clumped density, per-instance yaw/lean, soft per-blade wind phase. Ethos from Greg Zdunek HyperGrass principles — our own geo/shaders, no Gumroad pack.
- **Bark**: original procedural pine bark (512 color/normal/roughness): deep vertical fissures, rugged plates, grey-brown faces with ochre/grey in cracks. Ethos from HyperTrees Bark Pinewood look — **not** Vertex Library / paid textures. Canopies unchanged.

## RAE 3.49 — stripe kill + crown-cap
- **Grass/ground stripes**: removed anisotropic terrain fiber streaks and low-freq `sin(x·a+z·b)` grass density/dry bands that painted diagonal light/dark carpet stripes. Terrain + instance tint now use domain-warped multi-octave noise; near-field instance density raised so meadow carpet cannot read through.
- **Crown crescent**: after branch leaf cards, a procedural upper-hemisphere crown-cap of leaf clusters closes the empty half-moon void at the top of the foliage mass. Flat cards OK; volume must read solid. Bark unchanged; trunk flare left alone.

