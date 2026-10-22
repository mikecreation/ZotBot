// Water wheel: flow-driven physics, cam trip-hammer geometry, recipes/stages and the procedural model.
import assert from "node:assert/strict";
import * as W from "../waterwheel.js?v=3.29.0";
import * as P from "../woodland-progression.js?v=3.29.0";
import {ITEMS,RECIPES,WORLD_DISCOVERIES} from "../world-data.js?v=3.29.0";
import {buildWoodland,setWoodStage,animateWaterwheel,woodTriangles} from "../woodland-buildings.js?v=3.29.0";

let n=0;const ok=(name,fn)=>{fn();n++;console.log("ok -",name)};
const near=(a,b,e,m)=>assert.ok(Math.abs(a-b)<=e,`${m||""} ${a} vs ${b}`);

ok("flow follows the gate and rain swells the spring",()=>{
  assert.equal(W.flowOf(0),0);near(W.flowOf(1),W.WHEEL.Q0,1e-9);near(W.flowOf(.5),W.WHEEL.Q0/2,1e-9);
  assert.ok(W.flowOf(1,1)>W.flowOf(1,0));assert.equal(W.rainOf({kind:"drystorm"}),0);assert.equal(W.rainOf({kind:"storm"}),1);assert.equal(W.rainOf(null),0);
});
ok("power P = rho g Q H eta",()=>{near(W.powerOf(.03),1000*9.81*.03*W.WHEEL.head*W.WHEEL.eff,1e-6);assert.equal(W.powerOf(0),0)});
ok("wheel spins up from rest to the analytic steady speed and holds it",()=>{
  const st={};let t=0;while(t<60){W.stepWheel(st,1/30,W.flowOf(1));t+=1/30}
  const ws=W.steadyOmega(W.flowOf(1));assert.ok(ws>.3&&ws<2,`steady ${ws}`);near(st.omega,ws,ws*.03,"omega");
  const r=W.rpm(st.omega);assert.ok(r>3&&r<15,`rpm ${r}`);
});
ok("rotation speed is driven by flow: more water, faster wheel; shut gate, it stops",()=>{
  const sp=q=>{const st={};for(let i=0;i<1800;i++)W.stepWheel(st,1/30,q);return st.omega};
  const a=sp(W.flowOf(.5)),b=sp(W.flowOf(1)),c=sp(W.flowOf(1,1));assert.ok(a<b&&b<c,`${a} ${b} ${c}`);
  const st={};for(let i=0;i<1800;i++)W.stepWheel(st,1/30,W.flowOf(1));for(let i=0;i<1800;i++)W.stepWheel(st,1/30,0);assert.equal(st.omega,0);
  const s2={};W.stepWheel(s2,1,0);assert.equal(s2.omega,0,"no water, no start");
});
ok("dt-independent integration (substeps)",()=>{const a={},b={};for(let i=0;i<600;i++)W.stepWheel(a,1/60,W.flowOf(1));for(let i=0;i<100;i++)W.stepWheel(b,.1,W.flowOf(1));near(a.omega,b.omega,.02);near(a.angle,b.angle,.2)});
ok("three cam lugs give three hammer strikes per revolution",()=>{
  assert.equal(W.strikesBetween(0,2*Math.PI),3);assert.equal(W.strikesBetween(0,20*Math.PI),30);assert.equal(W.strikesBetween(1,1),0);
  const st={};let hits=0;for(let i=0;i<3600;i++)hits+=W.stepWheel(st,1/30,W.flowOf(1));assert.equal(hits,st.strikes);near(hits,Math.floor(st.angle/(2*Math.PI)*3),1);
});
ok("cam lift rises, holds then drops; the helve angle follows",()=>{
  const L=W.camLift;assert.equal(L(0),0);const H=W.WHEEL.hammer,pitch=2*Math.PI/3;near(L(pitch*H.rise),1,1e-9);assert.equal(L(pitch*(H.fall+.01)),0);
  let mx=0;for(let a=0;a<2*Math.PI;a+=.01)mx=Math.max(mx,W.helveAngle(a));assert.ok(mx>.3&&mx<1.2,`helve ${mx}`);
});
ok("trip-hammer is a lever: short tail, long arm (mechanical advantage)",()=>{
  const v=W.hammerLever();assert.ok(v.arm>v.tail);near(v.ratio,v.arm/v.tail,1e-9);near(v.MA*v.ratio,1,1e-9);near(W.headLift(),v.ratio*W.WHEEL.hammer.drop,1e-9);assert.ok(W.headLift()>.3);
});
ok("physics constants agree with the built site geometry",()=>{
  const S=P.WHEELSITE,H=W.WHEEL;assert.deepEqual(S.hammer.pivot,H.hammer.pivot);near(S.hammer.head,H.hammer.head[0],1e-9);
  near(S.wheel.R,H.R,1e-9);near(S.wheel.y,H.cy,1e-9);near(S.lugs.r,H.lugR,1e-9);near(S.flume.y,H.flumeY,1e-9);
  // at full press the helve tail tip lies inside the lug circle, so a lug can drive it
  assert.ok(Math.hypot(H.hammer.tail,H.hammer.pivot[1]-H.hammer.drop-H.cy)<=H.lugR+1e-9);
});
ok("recipe, stages, materials and discoveries",()=>{
  const r=RECIPES.find(r=>r.out==="waterwheel_site");assert.ok(r);assert.equal(r.cat,"build");assert.equal(r.req,"wattle_daub");assert.equal(ITEMS.waterwheel_site.place,"waterwheel");
  const S=P.STAGES.waterwheel;assert.equal(S.length,7);assert.equal(S[6].id,"mill");for(const k of ["plank","trenail","log","millstone","cordage"])assert.ok(S[6].need[k],k);const all=new Set();for(const st of S)for(const k in st.need){assert.ok(ITEMS[k],k);all.add(k)}
  for(const k of ["log","plank","trenail","cordage","stone","clay"])assert.ok(all.has(k),k);
  for(const id of ["water_power","rotational_motion","cam_lever","gear_ratio","millstones"])assert.ok(WORLD_DISCOVERIES.find(d=>d.id===id),id);
  assert.equal(P.isDwelling("waterwheel"),false);assert.equal(P.floorRect("waterwheel"),null);
});
ok("model builds, stages reveal in order and water shows only when it should",()=>{
  const root=buildWoodland("waterwheel");const u=root.userData;assert.ok(u.wheel&&u.helve&&u.gate&&u.water);
  const tris=woodTriangles(root);assert.ok(tris>5000&&tris<140000,`tris ${tris}`);
  let prev=-1;for(let k=0;k<=7;k++){setWoodStage(root,k);const v=woodTriangles(root,true);assert.ok(v>=prev,`stage ${k}`);prev=v}
  const vis=k=>u.water[k].visible;
  animateWaterwheel(root,.1,{stage:1,gate:1});assert.ok(!vis(3)&&!vis(4)&&!vis(5),"no flume yet");
  animateWaterwheel(root,.1,{stage:3,gate:1});assert.ok(vis(3)&&vis(4)&&!vis(5),"spills past the empty axle");
  animateWaterwheel(root,.1,{stage:6,gate:1,angle:1,omega:.8,helve:.5});assert.ok(vis(3)&&!vis(4)&&vis(5),"fills buckets");near(u.wheel.rotation.z,-1,1e-9);near(u.helve.rotation.z,.5,1e-9);
  animateWaterwheel(root,.1,{stage:6,gate:0});assert.ok(!vis(3)&&!vis(5),"gate shut");
  animateWaterwheel(root,.1,{stage:7,gate:1,angle:2,omega:.6,stoneAngle:10});assert.ok(vis(6),"tail foam at the paddles");near(u.runner.rotation.y,10,1e-9);
  setWoodStage(root,6);assert.ok(!u.stages[6].some(g=>g.visible),"mill hidden before stage 7");setWoodStage(root,7);assert.ok(u.stages[6].every(g=>g.visible),"mill shown");
});
ok("gearing: 40-peg pit wheel on 8-stave lantern, stone 5x faster, load reflected through the ratio",()=>{
  const n=W.gearRatio();assert.equal(n,5);near(W.stoneRpm(1),W.rpm(1)*5,1e-9);
  const q=W.flowOf(1),a=W.steadyOmega(q),b=W.steadyOmega(q,W.WHEEL,{hammer:true,mill:true,grinding:false}),c=W.steadyOmega(q,W.WHEEL,{hammer:true,mill:true,grinding:true}),d=W.steadyOmega(q,W.WHEEL,{hammer:false,mill:true,grinding:true});
  assert.ok(c<b&&b<a,`${a} ${b} ${c}`);assert.ok(d>c,"lifting the hammer frees power for the stones");near(a,W.steadyOmega(q,W.WHEEL,W.HAMMER_ONLY),1e-12,"default = hammer only");
  const sr=W.stoneRpm(c);assert.ok(sr>15&&sr<40,`stone rpm ${sr}`);const fr=W.flourRate(c);assert.ok(1/fr>8&&1/fr<30,`s per flour ${1/fr}`);
  // power balance at the stones: wheel-side mill torque = n * stone torque
  const Lp=W.loadParams({hammer:false,mill:true,grinding:true}),L0=W.loadParams({hammer:false,mill:false});near((Lp.tau0-L0.tau0)+(Lp.k-L0.k)*c,n*W.stoneTorque(c,{grinding:true}),1e-6);
  const st={};for(let i=0;i<1800;i++)W.stepWheel(st,1/30,q,W.WHEEL,{hammer:true,mill:true,grinding:true});near(st.omega,c,c*.03);
});
ok("mill geometry: pit-wheel pegs reach the lantern, stones on the shaft, flour items and recipes",()=>{
  const M=P.WHEELSITE.mill;
  assert.ok(M.pit.z-M.pit.peg<=M.lantern.z+M.lantern.r&&M.pit.z-M.pit.peg>=M.lantern.z-M.lantern.r,"pegs reach into the lantern");
  near(P.WHEELSITE.wheel.y+M.pit.R,(M.lantern.y0+M.lantern.y1)/2,.03,"peg top meets the lantern staves");
  assert.ok(M.stone.bed[1]<M.stone.run[0]&&M.stone.bed[0]>=M.floor,"runner above bed above floor");assert.ok(P.WHEELSITE.axle.z0<M.pit.z,"axle passes the pit wheel");
  for(const k of ["millstone","flour","bread_dough","bread"])assert.ok(ITEMS[k],k);assert.ok(ITEMS.bread.food>ITEMS.flatbread.food,"bread beats flatbread");
  const ms=RECIPES.find(r=>r.out==="millstone");assert.equal(ms.tool,"hammer_stone");const bd=RECIPES.find(r=>r.out==="bread_dough");assert.equal(bd.in.flour,2);assert.deepEqual(P.MILL_INPUTS,{grain:1,seeds:3});
  const [mx,mz]=[M.lantern.x,M.lantern.z];
  assert.equal(P.partAt("waterwheel",7,mx,3.2,mz),"mill");assert.equal(P.partAt("waterwheel",7,...[P.WHEELSITE.hammer.mortar[0],.6,P.WHEELSITE.hammer.mortar[1]]),"hammer");
  assert.ok(P.wallSegs("waterwheel",7).length>P.wallSegs("waterwheel",6).length,"mill frame collides");
  // hammer moved behind the wheel: the hero side (+z) of the wheel is clear
  assert.ok(P.WHEELSITE.hammer.z+.5<-W.WHEEL.width/2,"hammer behind the wheel");
});
console.log(`waterwheel: ${n} checks passed`);
