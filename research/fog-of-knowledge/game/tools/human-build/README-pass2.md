# Realistic human - pass 2 (hands, face, hair)

Runs after the pass-1 pipeline (README.md) on the same box; all inputs/outputs CC0.

1. `blender -b --python refine.py` - stage C: one Catmull-Clark level on the body (rounded fingers and
   knuckles, weights/UVs interpolated), smoother hair cap, 3 stubble shells for the beard; bakes the
   body's rest position / normal / ambient occlusion into its UV space (2048).
2. `python3 textures2.py` (numpy, Pillow, scipy) - procedural maps from the bakes: knuckle wrinkles,
   MCP bumps, finger/palm/wrist creases, nail plates (normal + roughness), AO-shaded diffuse with
   deeper lips, nails and a hair-coloured scalp; beard strands + density mask.
3. `blender -b --python export2.py` (BLEND=out/stageC.blend EXP=out/export2) then `python3 package2.py`.
4. `grip-solver.js` - the in-browser helper used to solve `HAND_POSES.grip` in human-real.js: each
   finger's joints are placed on a circle round a ~34 mm handle, the thumb by a small grid search.

Runtime (human-real.js): `initRealHands` / `poseRealHands` re-pose each hand after the mixer update
(relaxed curl when empty, wrapped grip when the hand anchor holds an item, the clip's own fist during
one-shot actions with an empty hand) and move half of the wrist roll into the forearm (no candy-wrap).
