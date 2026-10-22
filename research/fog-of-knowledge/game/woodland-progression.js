/* Fog of Knowledge: The Game — hand-built woodland buildings (pure data + rules, no three.js).
 * Two staged builds that work like the shipyard: craft a site kit, place it (Q), then carry the
 * gathered materials to the site (E) stage by stage.
 *   woodhut     : lashed A-frame hut — pole frame, wattle, bark + thatch roof, daubed gables.
 *   foresthouse : fieldstone + saddle-notched round-log house, cob plaster, round clay windows,
 *                 stone chimney hearth, sod roof, split-plank door on a wooden pole hinge, mud bed.
 * Layout numbers are in the building's local frame (metres): +z is the front (door side),
 * y is up from the site's ground level s.y. world.js and woodland-buildings.js share them.
 */
export const AXES=["axe_stone","axe_copper","axe_bronze","axe_iron"];

export const WOOD_ITEMS={
 mud:{name:"River mud (wet clay-silt)",mass:1.2,density:1800,r:.09,color:0x6e5a40},
 moss:{name:"Moss (chinking & bedding)",mass:.15,density:200,r:.08,color:0x5f7a34},
 thatch:{name:"Long grass bundle (thatch)",mass:.4,density:150,r:.1,color:0xc2a65a},
 cordage:{name:"Twisted cordage",mass:.08,density:600,r:.05,color:0xa88a5a},
 cob:{name:"Cob (mud, straw & sand)",mass:1.5,density:1700,r:.1,color:0x9c7a52},
 woodhut_site:{name:"Woodland hut — staked site & cord",mass:2,density:600,r:.2,color:0x8a6a44,place:"woodhut"},
 house_site:{name:"Forest house — staked site & plan",mass:3,density:600,r:.2,color:0x8a6a44,place:"foresthouse"},
};
export const WOOD_RECIPES=[
 {out:"cordage",req:null,in:{fiber:3},n:2,cat:"tools"},
 {out:"cob",req:null,in:{mud:2,thatch:1},n:2,cat:"build"},
 {out:"woodhut_site",req:null,in:{stick:4,cordage:1},cat:"build"},
 {out:"mud",req:null,in:{clay:1,pot_water:1},n:3,ret:"pot",cat:"build"},
 {out:"house_site",req:"wattle_daub",in:{stick:6,cordage:2,stone:2},cat:"build"},
];
/* stages: id, name, need (items), note (what you are doing), axe = needs an axe in the pack */
export const HUT_STAGES=[
 {id:"frame",name:"A-frame & ridge pole",need:{log:2,stick:4,cordage:2,stone:4},axe:true,note:"Two bipods of poles lashed at the crotch carry a ridge pole; sill stones pin the feet."},
 {id:"wattle",name:"Rafters & woven wattle",need:{stick:14,cordage:2},note:"Rafters lean on the ridge; thin withies are woven through them as battens."},
 {id:"roof",name:"Bark & thatch roof",need:{bark:4,thatch:8},note:"Bark slabs at the eaves, then courses of long grass laid butt-down from the bottom up so rain runs off."},
 {id:"daub",name:"Daubed gables, door & bedding",need:{mud:4,moss:3,thatch:2},note:"Mud daub is pressed into the gable wattle; moss and grass make the bed."},
];
export const HOUSE_STAGES=[
 {id:"found",name:"Fieldstone foundation",need:{stone:14,mud:2},note:"Fieldstones laid dry on a trench of packed earth keep the bottom logs out of the wet."},
 {id:"logs",name:"Saddle-notched log walls",need:{log:14,moss:4},axe:true,note:"Round logs are saddle-notched so each course locks the corner; moss chinks the seams."},
 {id:"cob",name:"Cob plaster & round windows",need:{cob:8,stick:6},note:"Cob is pressed into the gaps and smoothed by hand; stick rings frame the round clay windows."},
 {id:"hearth",name:"Hearth & stone chimney",need:{stone:8,cob:6,clay:2},note:"A clay-lined firebox in a stone stack: the tall flue draws smoke up and out."},
 {id:"roof",name:"Log rafters, bark & sod roof",need:{log:6,bark:8,thatch:6,mud:4},axe:true,note:"Rafters and a stick ceiling carry overlapping bark; sod on top insulates and sheds rain."},
 {id:"fitout",name:"Door, mud bed & shelves",need:{log:2,cordage:2,cob:4,feather:4,moss:4},axe:true,note:"Split planks on a wooden pole hinge with a drop latch; a cob bench-bed topped with moss, grass and feathers."},
];
export const STAGES={woodhut:HUT_STAGES,foresthouse:HOUSE_STAGES};
export const WOOD_TYPES=["woodhut","foresthouse"];
export const isWoodland=t=>t==="woodhut"||t==="foresthouse";
export function stagesOf(s){return STAGES[s.type]||[]}
export function remainingOf(s){const st=stagesOf(s)[s.stage||0];if(!st)return {};const out={};for(const k in st.need){const n=st.need[k]-((s.got||{})[k]||0);if(n>0)out[k]=n}return out}
export function stageFracOf(s){const st=stagesOf(s)[s.stage||0];if(!st)return 1;let need=0,got=0;for(const k in st.need){need+=st.need[k];got+=Math.min(st.need[k],(s.got||{})[k]||0)}return need?got/need:1}
export function isComplete(s){return (s.stage||0)>=stagesOf(s).length}
export function stageProblem(s,inv){const st=stagesOf(s)[s.stage||0];if(!st)return "";if(st.axe&&!AXES.some(k=>inv(k)))return "Needs an axe (fell and notch logs)";return ""}
/* move what the pack has into the current stage; completes the stage when everything is in */
export function deliverStage(s,inv,take){s.got=s.got||{};s.stage=s.stage||0;const st=stagesOf(s)[s.stage];if(!st)return {delivered:{},completed:false,done:true};
 const delivered={};for(const k in st.need){const n=Math.min(st.need[k]-(s.got[k]||0),inv(k));if(n>0){take(k,n);s.got[k]=(s.got[k]||0)+n;delivered[k]=n}}
 let completed=false;if(!Object.keys(remainingOf(s)).length){completed=st.id;s.stage++;s.got={}}
 return {delivered,completed,done:isComplete(s)}}
export function stageTotalsOf(type){const t={};for(const st of STAGES[type])for(const k in st.need)t[k]=(t[k]||0)+st.need[k];return t}

/* ---------- layout (local frame, metres) ---------- */
export const HUT={hx:1.7,hz:1.75,ridge:2.7,door:.42,doorH:1.55,floor:0};
export const HOUSE={hx:2.8,hz:2.3,logR:.16,course:.3,courses:7,base:.4,floor:.22,
 get plate(){return this.base+this.courses*this.course},get ridge(){return this.plate+1.55},ovX:.65,ovZ:.55,
 door:{x0:.25,x1:1.15,top:2.05},
 windows:[{wall:"front",c:-1.3,y:1.45,r:.26},{wall:"right",c:-.35,y:1.45,r:.26}],
 hearth:{z0:-.55,z1:.55,top:1.2,fire:[-3.08,.3,0]},
 chimney:{x0:-4.02,x1:-2.96,z0:-.8,z1:.8,top:4.75},
 bed:{x0:.45,x1:2.6,z0:-2.12,z1:-1.2,h:.5},
 shelf:{x0:-1.95,x1:-.55}};
export function toLocal(s,x,z){const dx=x-s.x,dz=z-s.z,c=Math.cos(s.ry||0),n=Math.sin(s.ry||0);return [dx*c-dz*n,dx*n+dz*c]}
export function toWorld(s,lx,lz){const c=Math.cos(s.ry||0),n=Math.sin(s.ry||0);return [s.x+lx*c+lz*n,s.z-lx*n+lz*c]}
/* footprint used for placement checks, shelter and the floor (local rect) */
export function footprint(type){return type==="woodhut"?{x0:-1.85,x1:1.85,z0:-1.95,z1:1.95}:{x0:-4.1,x1:3.5,z0:-2.9,z1:2.9}}
/* floor rectangle: inside it the ground is the building's floor */
export function floorRect(type){return type==="woodhut"?{x0:-1.6,x1:1.6,z0:-1.7,z1:1.7,y:HUT.floor}:{x0:-2.66,x1:2.66,z0:-2.16,z1:2.16,y:HOUSE.floor}}
/* is a local point inside the enclosed volume (camera clamp) */
export function insideVolume(type,lx,ly,lz,stage){
 if(type==="woodhut"){if(Math.abs(lz)>HUT.hz-.12)return false;return ly>.05&&ly<HUT.ridge*(1-Math.abs(lx)/HUT.hx)-.14}
 const H=HOUSE;if(Math.abs(lx)>H.hx-.24||Math.abs(lz)>H.hz-.24||ly<H.floor+.05)return false;
 const roof=stage>=5?H.plate+(H.ridge-H.plate)*(1-Math.abs(lz)/(H.hz+H.ovZ))-.2:H.plate-.15;return ly<Math.min(roof,H.plate-.12)}
/* collision segments [x0,z0,x1,z1] in local coords for the built stage; open = door open fraction */
export function wallSegs(type,stage,open){
 const S=[];if(type==="woodhut"){const H=HUT,w=1.05;
  if(stage>=2){S.push([-w,-H.hz+.1,-w,H.hz-.05],[w,-H.hz+.1,w,H.hz-.05],[-w,-H.hz+.1,w,-H.hz+.1])}
  if(stage>=4){S.push([-w,H.hz-.05,-H.door,H.hz-.05],[H.door,H.hz-.05,w,H.hz-.05])}
  return S}
 const H=HOUSE,x=H.hx,z=H.hz;if(stage<2)return S;
 S.push([-x,-z,x,-z],[-x,-z,-x,z],[x,-z,x,z],[-x,z,H.door.x0,z],[H.door.x1,z,x,z]);
 const C=H.chimney;S.push([C.x0,C.z0,C.x1,C.z0],[C.x0,C.z1,C.x1,C.z1],[C.x0,C.z0,C.x0,C.z1]);
 if(stage>=6){const a=(open||0)*1.75,L=H.door.x1-H.door.x0,ex=H.door.x0+Math.cos(a)*L,ez=z-Math.sin(a)*L;S.push([H.door.x0,z,ex,ez]);
  const B=H.bed;S.push([B.x0,B.z1,B.x1,B.z1],[B.x0,B.z0,B.x0,B.z1]);
  S.push([H.hx+.4,-2.2,H.hx+.4,-.9],[H.hx+.85,-2.2,H.hx+.85,-.9],[H.hx+1.05,H.hz+1.05,H.hx+1.45,H.hz+1.05])}   // woodpile and chopping stump outside
 return S}
/* where E at a point means "door", "bed" or "site" */
export function partAt(type,stage,lx,ly,lz){
 if(type==="foresthouse"&&stage>=6){const H=HOUSE,D=H.door;if(lx>D.x0-.35&&lx<D.x1+.35&&Math.abs(lz-H.hz)<1.3&&ly<D.top+.5)return "door";
  const B=H.bed;if(lx>B.x0-.4&&lx<B.x1+.2&&lz>B.z0-.2&&lz<B.z1+.6)return "bed"}
 if(type==="woodhut"&&stage>=4&&Math.abs(lx)<1.4&&Math.abs(lz)<1.6)return "bed";
 return "site"}

export const WOOD_DISCOVERIES=[
 ["wattle_daub","Wattle & daub",0,"Finish the daub stage of a woodland hut.","Thin rods woven between stakes (wattle) make a springy lattice; wet clay-rich mud with straw or dung (daub) pressed into it dries into a wall that blocks wind and sheds rain. The straw fibres resist cracking as the mud shrinks. People built this way for at least 6,000 years.",["shelters"],[]],
 ["cob","Cob walls",1,"Plaster the forest house with cob.","Cob is subsoil clay, sand and straw kneaded with water. Clay binds, sand gives body and limits shrinkage, straw ties it together in tension. Layered and hand-smoothed, it sets hard without any firing and can stand for centuries if it has 'good boots and a good hat' — a stone base and a roof overhang.",["shelters"],[]],
 ["stack_effect","Chimney draft (stack effect)",1,"Light a fire in the forest house hearth.","Hot flue gas is less dense than the outside air, so a column of it weighs less: the pressure difference is about g·h·(ρ_outside − ρ_inside). A 4 m flue at 200 °C / 392.0 °F pulls with roughly 19 Pa — enough to draw smoke up and out while fresh air feeds the fire through the room.",["fire"],["field.thermodynamics"]],
];
/* gatherable placement rules for the new woodland stream (pure; used by world.js and tests) */
export const WOOD_GATHER={
 mud:{near:"water",h:[.05,2.3],p:.9,max:3},
 moss:{biome:["forest"],p:.6,max:3},
 thatch:{biome:["grass"],p:.7,max:4},
 bark:{biome:["forest"],p:.35,max:2},
 feather:{p:.35,max:1},
};
