// Galleon tests: crafting chain is obtainable and ordered; ship floats at its design draft,
// turns with the rudder, and sails faster on a reach than into the wind; never runs aground.
import assert from "node:assert/strict";
import {ITEMS,RECIPES,WORLD_DISCOVERIES} from "../world-data.js";
import {SHIP_STAGES,SHIP_RECIPES,deliver,remaining,stageTotals,AXES} from "../ship-progression.js";
import {HULL,draftFor,stepShip,newShipState,sailPolar,windAngle,deckY,deckStep,shipToWorld,worldToShip,fwdOf,rightOf} from "../ship-physics.js";
let n=0;const test=(name,fn)=>{fn();n++;console.log("ok -",name)};

// things the player gathers directly in the world (E on resources, felling trees with an axe)
const GATHERED=new Set(["flake",/* knapped from flint or stone (Q at a boulder) */"log","stick","stone","flint","fiber","pyrite","clay","berry","hide","copper_ore","tin_ore"]);
test("every ship material is gatherable or craftable from gathered things",()=>{
  const can=new Set(GATHERED),byOut=new Map(RECIPES.map(r=>[r.out,r]));
  for(let pass=0;pass<20;pass++)for(const r of RECIPES)if(Object.keys(r.in).every(k=>can.has(k)))can.add(r.out);
  const need=new Set(["shipyard",...SHIP_STAGES.flatMap(s=>Object.keys(s.need)),...AXES.slice(0,1),"knife_stone"]);
  for(const k of need){assert.ok(ITEMS[k],`item ${k} exists`);assert.ok(can.has(k),`${k} is obtainable`)}
  for(const r of SHIP_RECIPES){assert.ok(byOut.get(r.out),`${r.out} recipe registered`);assert.equal(byOut.get(r.out).cat,"ships");
    if(r.req)assert.ok(WORLD_DISCOVERIES.some(d=>d.id===r.req),`${r.out} gate ${r.req} is a real discovery`)}
  assert.ok(WORLD_DISCOVERIES.some(d=>d.id==="shipbuilding")&&WORLD_DISCOVERIES.some(d=>d.id==="sailing"));
  assert.equal(ITEMS.shipyard.place,"shipyard");
});
test("the build needs a reasonable amount of gathering (no survival grind)",()=>{
  const t=stageTotals(),R=Object.fromEntries(SHIP_RECIPES.map(r=>[r.out,r]));
  const raw={log:0,stick:0,fiber:0};const add=(k,q)=>{if(raw[k]!=null&&!R[k]){raw[k]+=q;return}const r=R[k];const crafts=Math.ceil(q/(r.n||1));for(const [i,m] of Object.entries(r.in))add(i,m*crafts)};
  for(const [k,q] of Object.entries(t))add(k,q);add("shipyard",1);
  assert.ok(raw.log<=20,`logs ${raw.log}`);assert.ok(raw.fiber<=50,`fiber ${raw.fiber}`);assert.ok(raw.stick<=20,`sticks ${raw.stick}`);
  console.log("   raw totals:",JSON.stringify(raw));
});
test("stages are keel→hull→deck→masts→rigging→sails and must be completed in order",()=>{
  assert.deepEqual(SHIP_STAGES.map(s=>s.id),["keel","hull","deck","masts","rigging","sails"]);
  const site={stage:0,got:{}},bag={plank:40,trenail:5,pitch:5,log:3};const inv=k=>bag[k]||0,take=(k,q)=>{bag[k]-=q};
  let r=deliver(site,inv,take);assert.equal(site.stage,0,"keel not done with only 5 trenails");assert.equal(bag.plank,40,"planks are not taken before the hull stage");
  assert.deepEqual(remaining(site),{trenail:3});bag.trenail=100;r=deliver(site,inv,take);assert.equal(r.completed,"keel");assert.equal(site.stage,1);
  r=deliver(site,inv,take);assert.equal(r.completed,"hull");assert.equal(bag.plank,28);
  r=deliver(site,inv,take);assert.equal(r.completed,"deck");r=deliver(site,inv,take);assert.equal(site.stage,3,"no masts yet");
  Object.assign(bag,{mast_spar:3,rope:7,sailcloth:3});for(let i=0;i<3;i++)r=deliver(site,inv,take);assert.equal(site.stage,6);assert.ok(r.done);
});
const flat={wave:()=>0,ground:()=>-60};
const run=(s,secs,env,ctl)=>{for(let t=0;t<secs;t+=1/30)stepShip(s,1/30,env,ctl);return s};
test("floats at the design draft (Archimedes)",()=>{
  assert.ok(Math.abs(draftFor(HULL.mass)-HULL.draft)<1e-9);
  const s=newShipState(0,0,0);s.y=3;run(s,40,{...flat,windDir:0,windSpeed:0},{});
  assert.ok(Math.abs(s.y+HULL.draft)<.02,`keel at ${s.y.toFixed(3)} m`);
  const s2=newShipState(0,0,0);run(s2,40,{...flat,wave:()=>.8,windDir:0,windSpeed:0},{});assert.ok(Math.abs(s2.y-(.8-HULL.draft))<.03,"rides up with the sea");
  assert.ok(HULL.mainDeck-HULL.draft>1.5,"freeboard keeps waves off the deck");
  assert.ok(HULL.length>=25&&HULL.length+8<=37,"25–35 m ship");
});
test("pitches and rolls with the waves",()=>{
  const s=newShipState(0,0,0);run(s,30,{...flat,wave:(x,z)=>z*.05+x*.04,windDir:0,windSpeed:0},{});
  assert.ok(s.pitch>.03,`bow follows the rising sea (pitch ${s.pitch.toFixed(3)})`);assert.ok(s.roll<-.02||s.roll>.02,`roll ${s.roll.toFixed(3)}`);
});
test("rudder turns the ship to starboard / port",()=>{
  const env={...flat,windDir:0,windSpeed:9};
  for(const [rud,sgn] of [[1,1],[-1,-1]]){const s=newShipState(0,0,Math.PI/2);s.sailSet=s.sail=1;s.u=3;const f0=fwdOf(s.psi),r0=rightOf(s.psi);run(s,6,env,{rudder:rud});
    const f=fwdOf(s.psi),side=f[0]*r0[0]+f[1]*r0[1];assert.ok(side*sgn>.1,`rudder ${rud} → bow swings ${sgn>0?"starboard":"port"} (${side.toFixed(2)})`)}
});
test("sail speed depends on the wind angle and sail set",()=>{
  const speed=(psi,set=1,W=9)=>{const s=newShipState(0,0,psi);run(s,90,{...flat,windDir:0,windSpeed:W},{sail:set?1:-1});return s.u};
  const run_=speed(0),beam=speed(Math.PI/2),close=speed(Math.PI*.64),irons=speed(Math.PI),furled=speed(Math.PI/2,0);
  console.log(`   speeds m/s: downwind ${run_.toFixed(2)} beam ${beam.toFixed(2)} close ${close.toFixed(2)} irons ${irons.toFixed(2)} furled ${furled.toFixed(2)}`);
  assert.ok(beam>run_&&run_>close&&close>irons,"beam reach > running > close-hauled > in irons");
  assert.ok(irons<.05&&furled<.05,"no drive head to wind or with sails furled");
  assert.ok(beam>2.5&&beam<6,"plausible galleon speed (5–11 kn)");
  assert.ok(speed(Math.PI/2,1,14)>speed(Math.PI/2,1,6),"stronger wind, faster");
  assert.ok(Math.abs(windAngle(0,0))<1e-9&&Math.abs(windAngle(Math.PI,0)-Math.PI)<1e-9&&sailPolar(Math.PI)===0);
});
test("stops before running aground on a shoal",()=>{
  const shore={wave:()=>0,ground:(x,z)=>z>120?2:-30,windDir:0,windSpeed:12};
  const s=newShipState(0,0,0);s.sailSet=s.sail=1;run(s,200,shore,{sail:1});
  assert.ok(s.z+HULL.bowZ<120,`bow stays off the beach (bow at ${(s.z+HULL.bowZ).toFixed(1)})`);assert.ok(s.u<.2&&s.grounded);
  run(s,40,shore,{rudder:1,sail:1});assert.ok(Math.abs(s.psi)>.5,"can still turn away");
});
test("deck walking: stairs connect decks, bulkheads block, ship transform is consistent",()=>{
  assert.equal(deckY(0,0),HULL.mainDeck);assert.equal(deckY(HULL.helm.z,0),HULL.quarterDeck);
  let p=[3,-4];for(let i=0;i<80;i++)p=deckStep(p[0],p[1],p[0],p[1]-.1);assert.ok(p[1]>HULL.quarterZ,"bulkhead blocks off the stairs");
  p=[0,-4];for(let i=0;i<80;i++)p=deckStep(p[0],p[1],p[0],p[1]-.1);assert.ok(p[1]<HULL.quarterZ-1,"stairs lead up to the quarterdeck");
  p=[0,0];for(let i=0;i<200;i++)p=deckStep(p[0],p[1],p[0]+.1,p[1]);assert.ok(p[0]<HULL.beam/2,"stays inside the bulwark");
  const s={...newShipState(10,20,.7),pitch:.05,roll:-.04,y:-2.8};const w=shipToWorld(s,1.5,4.8,3);const [lx,lz]=worldToShip({...s,pitch:0,roll:0},w[0],w[2]);
  assert.ok(Math.abs(lx-1.5)<.35&&Math.abs(lz-3)<.35);
});
console.log(`ship: ${n} tests passed`);
