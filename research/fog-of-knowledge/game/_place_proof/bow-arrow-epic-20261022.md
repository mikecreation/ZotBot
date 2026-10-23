# Bow + Arrow epic pass (2026-10-22 America/Chicago)

## BEFORE
- Bow/arrow fell through primitiveItem -> generic stub stick/blob meshes.
- Fire was instant click (no draw pose); arrows spun on X in flight.
- Hit SFX was generic AU.hit; no shockwave.

## AFTER
- Convincing 3D bow: grip wrap, curved limbs, two-segment string, nocks; draw flexes limbs, pulls string into taut V, shows nocked arrow.
- Hold LMB to draw (~0.55s full, smooth ease); release for hard launch (power scales 35%-115% of launch).
- Arrows: long shaft, flint tip, 3-fin fletching, nock; orient along velocity in flight.
- Land/pierce: expanding ring shockwave (mesh + particle ring) + premium arrowThump (deep body + air crack). Release: bowRelease thwip. NO smoke.
- Launch base 52 m/s; cache-bust world/gfx/primitive/audio/world-data v=3.35.0.

## How to try
1. Hard-refresh http://127.0.0.1:18437/
2. DEV: unlock hunting / craft bow (2 stick + 3 fiber) and arrows (stick + flake).
3. Equip bow in hand, click-lock canvas, HOLD LMB to draw, RELEASE to fire.
4. Listen for thwip on release; THUMP + shockwave ring on land/tree/animal pierce.
