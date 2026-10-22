// Shipbuilding progression (pure data + logic, node-testable).
// Chain: logs → planks (axe) · plant fiber → rope · fiber → sailcloth (woven) · pine wood + fire → pitch (tar)
//        sticks → trenails (wooden pegs, knife) · log + rope → mast (axe) · shipyard kit placed at a shore.
// The galleon is then raised at the shipyard in six stages by delivering materials with E.
export const SHIP_ITEMS={
  plank:{name:'Split plank',mass:6,density:600,r:.12,color:0xc49a64},
  rope:{name:'Laid rope',mass:.6,density:900,r:.08,color:0xb39a62},
  sailcloth:{name:'Woven sailcloth (flax linen)',mass:1.2,density:900,r:.1,color:0xe8dfc8},
  pitch:{name:'Pine pitch (tar)',mass:1,density:1100,r:.08,color:0x241a12},
  trenail:{name:'Trenails (wooden pegs)',mass:.1,density:700,r:.05,color:0xa57f52},
  mast_spar:{name:'Mast spar',mass:40,density:550,r:.3,color:0x9a7448},
  shipyard:{name:'Shipyard (slipway kit)',mass:30,density:600,r:.4,color:0x7a5a34,place:'shipyard'},
};
export const AXES=['axe_stone','axe_copper','axe_bronze','axe_iron'];
export const SHIP_RECIPES=[
  {out:'plank',req:'raft',in:{log:1},n:4,axe:true},
  {out:'rope',req:'raft',in:{fiber:4},n:3},
  {out:'trenail',req:'raft',in:{stick:2},n:8,knife:true},
  {out:'pitch',req:'fire',in:{log:1,stick:2},n:2,heat:250,station:'fire'},
  {out:'sailcloth',req:'clothing',in:{fiber:5,rope:1}},
  {out:'mast_spar',req:'raft',in:{log:1,rope:1},axe:true},
  {out:'shipyard',req:'raft',in:{log:2,stick:4,rope:1}},
];
export const SHIP_STEPS={
  plank:['Fell and buck a straight log','Split it along the grain with the axe and wedges into four planks'],
  rope:['Twist plant fiber into yarns','Twist yarns into strands, then lay three strands together against the twist'],
  trenail:['Split straight sticks into pegs','Whittle them round and taper them; driven through bored holes they swell tight when wet'],
  pitch:['Pile resinous pine wood and sticks by the fire','Heat it slowly: the resin sweats out and is boiled down to sticky pitch'],
  sailcloth:['Spin plant fiber (flax) into thread','Weave a tight, heavy cloth','Sew a bolt-rope around the edge'],
  mast_spar:['Choose a tall straight trunk','Trim and taper it with the axe','Whip rope woldings around it so it cannot split'],
  shipyard:['Lay a slipway of logs sloping to the water','Set keel blocks and staging poles'],
};
export const SHIP_STAGES=[
  {id:'keel',name:'Keel, stem & frames',need:{log:3,trenail:8},note:'Lay the keel on the blocks, raise stem and sternpost, and pin the frames (ribs) to it with trenails.'},
  {id:'hull',name:'Hull planking & caulking',need:{plank:12,trenail:12,pitch:2},note:'Fasten planks to the frames with trenails; pay the seams with hot pitch so they stay watertight.'},
  {id:'deck',name:'Decks & castles',need:{plank:8,trenail:8},note:'Lay the main deck, raise the forecastle and the stern castle, and fit rails, cannons and the wheel.'},
  {id:'masts',name:'Masts & yards',need:{mast_spar:3,rope:1},note:'Step the fore, main and mizzen masts on the keel and sway up the yards.'},
  {id:'rigging',name:'Standing & running rigging',need:{rope:6},note:'Set up shrouds and stays to hold the masts, and reeve braces and sheets to work the yards.'},
  {id:'sails',name:'Sails',need:{sailcloth:3},note:'Bend the sails to the yards. When this is done the ship can be launched (E).'},
];
/** total raw materials for the whole chain (for docs/tests). */
export function stageTotals(){const t={};for(const s of SHIP_STAGES)for(const k in s.need)t[k]=(t[k]||0)+s.need[k];return t}
/** current stage index (0..6). site.stage = completed stages. */
export const stageOf=site=>site.stage||0;
export function remaining(site){const st=SHIP_STAGES[stageOf(site)];if(!st)return {};const got=site.got||{},r={};for(const k in st.need){const left=st.need[k]-(got[k]||0);if(left>0)r[k]=left}return r}
/** fraction of the current stage delivered (0..1). */
export function stageFrac(site){const st=SHIP_STAGES[stageOf(site)];if(!st)return 1;let tot=0,got=0;for(const k in st.need){tot+=st.need[k];got+=Math.min(st.need[k],(site.got||{})[k]||0)}return tot?got/tot:1}
/**
 * Deliver what the player carries toward the current stage only (stages must go in order).
 * inv(k) -> count; take(k,n) removes. Returns {delivered:{k:n}, completed:stageId|null, done:boolean}.
 */
export function deliver(site,inv,take){const delivered={};const st=SHIP_STAGES[stageOf(site)];if(!st)return {delivered,completed:null,done:true};
  site.got=site.got||{};const r=remaining(site);
  for(const k in r){const n=Math.min(r[k],inv(k));if(n>0&&take(k,n)!==false){site.got[k]=(site.got[k]||0)+n;delivered[k]=n}}
  let completed=null;if(!Object.keys(remaining(site)).length){completed=st.id;site.stage=stageOf(site)+1;site.got={}}
  return {delivered,completed,done:site.stage>=SHIP_STAGES.length}}
export function shipProblem(r,inv){if(r.axe&&!AXES.some(k=>inv(k)))return 'Needs an axe';return ''}
export const SHIP_DISCOVERIES=[
  ["shipbuilding","Shipbuilding",1,"Build and launch a galleon at a shipyard.","A large wooden ship is a frame of ribs on a keel, skinned with planks pinned by trenails and made watertight with pitch. It floats because the hull displaces its own weight of water: this 28 m galleon weighs about 280 tonnes and sinks about 2.8 m (its draft) before the displaced sea water balances it.",["boats","sail"],[]],
  ["sailing","Sailing by the wind",1,"Sail your galleon 150 m under canvas.","A square sail is pushed by the wind from behind, but a curved sail also works like a wing: air flowing around it creates lift across the wind. With the keel resisting sideways drift, a ship can sail across the wind (a beam reach is often fastest) but not straight into it — about 60° off the wind is the limit for square-riggers.",["sail"],["field.navigation"]],
];
