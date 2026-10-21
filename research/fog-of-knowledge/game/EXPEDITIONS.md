# Discovery expeditions

Press L or use the Discovery Expeditions button; also available from Backpack. The portable experiment interface pauses the world and does not consume world inventory. Twenty-four authored model-based activities have three contracts each. The original twelve cover projectile delivery, lever torque, raft freeboard, pendulum timing, friction braking, gravity-fed jet pressure, thermal insulation, refraction, Ohmic circuits, driven resonance, logistic fisheries and binary search.

The two batches provide 72 playable contracts and 24 game mastery records, not new canonical research claims. All twelve context links were checked against the current canonical knowledge graph. Multiple activities share a broad field context; those are context links, not claims that the atlas already contains the exact simulated apparatus. Canonical graph files are untouched.

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


## Second batch

Twelve additional expeditions add 36 contracts: ideal strong-acid/base equivalence; solute-conserving dilution; abstract limiting-reagent assembly; competitive Michaelis–Menten kinetics; Hardy–Weinberg genotype frequencies; a deliberately simplified limiting-factor garden; closed-sample exponential isotope decay; three-station S−P timing; Kepler orbital periods; complete Boolean truth tables; a clickable weighted-route maze; and coherent-wave interference.

The map puzzle accepts actual clicks in responsive SVG coordinates. The route puzzle accepts only neighboring traversable cells, charges terrain cost on every move including backtracking, and rejects teleportation without consuming cost. Contracts permit two cost units beyond the calculated optimal path. Truth-table games use named gate selectors and check all four input combinations. Maze progress and failed paths use the same bounded notebook as the first batch. No mastery from the first batch is renamed or reset.

New assumptions: titration uses a 0.1 mol/L ideal monoprotic strong acid/base at 25 °C / 77 °F, including autoionization; dilution treats volumes as additive; particle assembly uses an invented 2A + B → A₂B reaction solely to teach atom accounting; enzyme rates and concentrations are arbitrary model units. The genotype model assumes random mating and Hardy–Weinberg conditions, rather than guaranteeing individual offspring. Garden growth is the minimum of three supplied factors and is explicitly a teaching abstraction. The decay specimen has a hypothetical one-million-year half-life, known initial parent amount, and no leakage. Epicenters are flat two-dimensional examples with constant P/S speeds, not real earthquake solutions. Kepler units are AU, Earth years and solar masses, with negligible planet mass. Interference assumes coherent equal-amplitude monochromatic waves; cancellation at one location does not destroy energy.

Source links are in expedition-extra-models.js. The principles are grounded in OpenStax Chemistry/Biology/University Physics, USGS earthquake/geologic-age explanations, NASA Kepler material and NIST DADS Boolean / Dijkstra entries. All new atlas context IDs were verified against the current graph. Run `node game/tests/expedition-extra-models.mjs` for 50 additional model, conservation, routing and contract-solvability checks. The original 47 model checks remain separate and still pass.
