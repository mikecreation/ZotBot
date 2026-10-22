# The galleon (shipbuilding & sailing)

A 28 m three-masted galleon (≈35 m with the bowsprit, 8 m beam, 2.8 m draft, ≈280 t) that you
build at a shipyard and then sail. **Model source:** every mesh and texture is generated in code
(`galleon.js`), no model or texture files were downloaded or copied, and nothing comes from Three.js Water Pro.
It falls under the repository's license like the rest of the game code.

| File | What |
|---|---|
| `galleon.js` | Procedural model: lofted planked hull with tumblehome, sheer, wales, gunports, transom with stern windows and quarter galleries, beakhead, 4 decks (main, quarterdeck, poop, forecastle), bulkheads with doors and stairs, rails with balusters, 12 cannons, capstan, gratings, ship's wheel and binnacle, port boarding ladder, anchors, rudder; fore/main/mizzen masts with tops, topmasts and topgallants, 6 square yards, a lateen mizzen and a spritsail; shrouds with ratlines, stays, backstays, braces, lifts and sheets; billowing canvas sails (vertex shader) and a pennant. Parts are grouped by build stage. |
| `ship-physics.js` | Pure (node-testable) hull geometry, deck walking, buoyancy (heave, pitch, roll from 5 sea samples), sail polar (point of sail), rudder, heel and grounding. |
| `ship-progression.js` | Items, recipes, the 6 build stages and their delivery logic, and 2 discoveries. |
| `tests/ship.mjs` | Recipe chain, stage order, draft, rudder, sail speed vs wind, shoal stop, deck walking. |

## Crafting chain (Backpack → SHIPBUILDING & SAILING)
Unlocked by **Watercraft** (build and ride a raft). Sailcloth also needs **Insulation** (clothing), and pitch needs **Fire making**.

* Split plank ×4: 1 log (axe)
* Laid rope ×3: 4 plant fiber
* Trenails ×8 (wooden pegs): 2 sticks (knife)
* Pine pitch ×2: 1 log + 2 sticks, beside a lit fire ≥ 250 °C
* Woven sailcloth: 5 plant fiber + 1 rope
* Mast spar: 1 log + 1 rope (axe)
* Shipyard (slipway kit): 2 logs + 4 sticks + 1 rope, then **Q** while standing on a beach **facing open sea** (water at least about 4 m deep within about 90 m ahead).

Build stages. Press **E** at the shipyard to deliver what you carry. Partial deliveries count, and the stages must go in order:

1. Keel, stem & frames: 3 logs, 8 trenails
2. Hull planking & caulking: 12 planks, 12 trenails, 2 pitch (the planking rises from the keel as you deliver)
3. Decks & castles: 8 planks, 8 trenails
4. Masts & yards: 3 mast spars, 1 rope
5. Rigging: 6 rope
6. Sails: 3 sailcloth

After stage 6, **E** launches the galleon down the ways into the nearest deep water (discovery: *Shipbuilding*).
The whole ship takes about 14 logs, 14 sticks and 39 plant fiber, which is about 7 trees.

## Riding
* Swim or wade to the hull and press **E** to climb aboard.
* **WASD** walks the deck while it pitches and rolls. Stairs lead to the quarterdeck, poop and forecastle, and bulkheads and bulwarks block you.
* At the **wheel** on the quarterdeck (aft), press **E** to take the helm.
  * **W / S**: set / take in sail
  * **A / D**: rudder (port / starboard)
  * The mouse wheel zooms out to 48 m.
  * The HUD shows the wind arrow, point of sail, sail %, speed in knots and rudder.
  * Wind direction drifts slowly and is stronger in rain and storms. You sail fastest on a beam reach, and you cannot sail closer than about 60° to the wind.
  * Sailing 150 m unlocks *Sailing by the wind*.
* **E** again leaves the wheel. **E** anywhere else on deck leaves the ship: onto land if there is any within about 15 m, otherwise into the water beside the hull.
* The ship slows and stops before the keel would touch bottom (shoals and shore). Nobody at the helm means the crew takes in sail.
* Rafts and the raft lab are unchanged.

## Fast test (browser console, works in a `?sandbox` save too)
```js
const W=__fogWorld, S=W.ship;
W.start(); W.help.close();
S.kit();            // unlock gates + every material for the whole build, incl. the shipyard kit
S.placeYard();      // stand at a beach facing the sea first (W.look(yaw) to face it)
S.deliver();        // = pressing E at the shipyard; repeat 6× (or S.advance(6))
S.launch();         // launch it
S.helm();           // board and take the wheel
S.wind(Math.PI/2, 9); S.sails(1); // optional: fix the wind (direction it blows toward, m/s) / set sails
S.state();          // speed u (m/s), heading psi, sail, rudder, pitch/roll, grounded, aboard/helm
// shortcut without building: S.spawn() puts a launched galleon in deep water ahead of you
```
