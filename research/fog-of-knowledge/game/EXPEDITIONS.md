# Discovery expeditions

Press L or use the Discovery Expeditions button; also available from Backpack. The portable experiment interface pauses the world and does not consume world inventory. Twelve authored model-based activities have three contracts each: projectile delivery, lever torque, raft freeboard, pendulum timing, friction braking, gravity-fed jet pressure, thermal insulation, refraction, Ohmic circuits, driven resonance, logistic fisheries and binary search.

This update creates 36 playable contracts and 12 game mastery records, not 36 new canonical research claims. All twelve context links were checked against the current canonical knowledge graph. Multiple activities share a broad field context; those are context links, not claims that the atlas already contains the exact simulated apparatus. Canonical graph files are untouched.

## Learning loop

Choose a contract, change a design, run the apparatus, read its measurement, compare notebook trials and revise. The prior projectile path remains as a comparison trace. Target zones, power limits, material budgets, collapse outcomes and limited search probes create different failure conditions. Replays cannot farm mastery. Each activity reveals its existing atlas context once after all three contracts. Reward audio is reserved for that first mastery. The notebook retains eight recent trials per activity, along with settings and bounded curve samples. Progress persists in the ordinary saved world.

Input controls, deterministic equations and targets are in expedition-models.js. Rendering, keyboard lifecycle, simulation animation and saved progress are in expeditions.js. Opening, closing, switching activities and resetting the world cancel pending animation and grading callbacks. Reduced-motion mode uses brief transitions. The activity grid becomes a horizontal navigation rail on small screens.

## Scope

These are explicitly labeled portable educational sandboxes, not new interactions with every object in the 3D world. Simplifications are stated in each activity: no-drag equal-height projectiles; perpendicular-force lever torque; ideal log displacement; small-angle mass-independent pendulums; constant kinetic friction; ideal lossless water jets; lumped constant-resistance cooling; geometric optics; an ideal Ohmic resistor; linear steady-state forced oscillation; a fixed-carrying-capacity logistic lake; sorted-array search. Targets, quotas and danger bands are authored game goals. They are not experimentally established safety limits. Models demonstrate principles and do not constitute engineering designs or real ecosystem predictions.

Cooling uses 0.5 kg water, heat capacity 4184 J/(kg K), exposed area 0.2 m², base resistance 0.1 m² K/W and insulation conductivity 0.04 W/(m K). Fish population is stepped monthly with bounded actual catch and zero lower population limit. Lever force and arm length are treated perpendicular to each other. Circuit current and dissipated power are checked independently.

## Sources

Every activity includes a readable explanation and a source link to its relevant OpenStax chapter or NIST DADS entry. See the per-activity source field in expedition-models.js for exact URLs. OpenStax chapters were checked for projectile motion, friction, static equilibrium, buoyancy, Bernoulli flow, pendulums, thermal transfer, refraction, Ohm's law, forced oscillation and population regulation. Binary search links directly to NIST DADS. These sources support the principles, not the game-specific winning thresholds.

## Checks

Run `node game/tests/expedition-models.mjs` from the atlas directory for 47 model/solvability checks. Separate browser verification plays all 36 contracts, checks single mastery, pause/cancel, narrow-screen layout and saved progress after reload; cancellation/failure tests also exercise actual controls. Reports and screenshots are retained in the local GAME_UPGRADE_REVIEW audit directory.
