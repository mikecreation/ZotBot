# Primitive tools, joinery and friction fire

Controls are shown beside the held item; the Backpack lists all recipes.

1. Gather two suitable stones. Equip one in each hand (V selects a hand; number keys equip), then Q to knap a core into sharp flakes. A boulder can serve as the hammerstone too. The game's generic stone represents a suitable knappable core here; not every real rock fractures into a useful cutting edge.
2. Hold a flake and press B to shape a stone knife. The knife remains available as a carving tool and wears when used for crafting.
3. In I, make an axe or pickaxe: shaped stone, a wooden handle, and gathered plant fiber used as twisted bindings. E or Q chops trees with an axe; a pickaxe mines mineral deposits and works boulders beyond their loose surface stones. Tools have separate durability.
4. Hold a log and B to carve a reusable hand-drill kit with the knife. It includes a thin wooden spindle and notched hearth board. Hold the kit, stow the other hand, and hold Q beside a dry firewood pile with plant fiber in the pack. One fiber prepares the tinder nest. Rotation produces smoke and then an ember, which lights the tinder and fuel. Movement, releasing Q, menus, rain, wet fuel, and exhaustion interrupt drilling. Rest restores stamina. Prepared tinder survives saving; transient friction progress does not.
5. Hold the knife and B to carve a notched bench joint from a log. F opens an inspectable 3D cutaway with a separated matching tongue. Four joints, additional wood and fiber make a bench. The ordinary bench has four legs; the alternate design bundles three poles at each of four corners. Both have a rectangular six-board top, housed shoulders, visible wedges, cross rails and lashings. Q places the kit; E opens crafting at it.

These are accelerated, illustrative crafting and combustion rules, not calibrated manufacturing or fire-making instructions. The assembled bench models illustrate joints rather than simulate their structural strength. Crafting abstracts whittling, splitting, cord twisting, head shaping and assembly into recipes.

The friction mechanic deliberately uses wood against wood, not wood against flint. The National Park Service describes the wooden spindle and base producing an ember: https://www.nps.gov/articles/000/archaic-period-3-200-to-11-450-years-ago.htm . Its Forces & Tools teaching material explains hot friction dust forming a coal: https://www.nps.gov/teachers/classrooms/forces-tools.htm . Flint/pyrite remains the independent spark method.

Verification: `tests/primitive-crafting.test.mjs` checks recipe dependencies, geometry, and friction rules; `tests/primitive-integration.js` exercises the real game mutators and input state in the isolated browser. Existing `tests/upgrades.js` covers hand selection, fuel persistence and 1,000-log rendering.
