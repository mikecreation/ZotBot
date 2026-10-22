// Woodland buildings: staged progression, recipes, collision geometry and the procedural builders.
import assert from "node:assert/strict";
import * as T from "../vendor/three.module.min.js";
import * as P from "../woodland-progression.js?v=3.28.0";
import {ITEMS,RECIPES,WORLD_DISCOVERIES} from "../world-data.js?v=3.28.0";
import {buildWoodland,setWoodStage,setDoor,woodLOD,woodTriangles,woodMaterials} from "../woodland-buildings.js?v=3.28.0";

let n=0;const ok=(name,fn)=>{fn();n++;console.log("ok -",name)};

ok("every stage ingredient and recipe output is a real item",()=>{
  for(const type of P.WOOD_TYPES)for(const st of P.STAGES[type]){assert.ok(st.name);for(const k in st.need)assert.ok(ITEMS[k],`${type}/${st.id}: ${k}`)}
  for(const r of P.WOOD_RECIPES){assert.ok(ITEMS[r.out],r.out);for(const k in r.in)assert.ok(ITEMS[k],`${r.out}: ${k}`)}
});
ok("recipes are merged into the game with categories and discoveries",()=>{
  for(const out of ["cordage","cob","mud","woodhut_site","house_site"])assert.ok(RECIPES.find(r=>r.out===out),out);
  assert.equal(RECIPES.find(r=>r.out==="woodhut_site").cat,"build");
  assert.equal(RECIPES.find(r=>r.out==="house_site").req,"wattle_daub");
  for(const id of ["wattle_daub","cob","stack_effect"])assert.ok(WORLD_DISCOVERIES.find(d=>d.id===id),id);
  assert.equal(ITEMS.woodhut_site.place,"woodhut");assert.equal(ITEMS.house_site.place,"foresthouse");
});
ok("no cement, cinder block or mud brick in any stage",()=>{
  for(const type of P.WOOD_TYPES)for(const st of P.STAGES[type])for(const k in st.need)assert.ok(!/cement|cinder|brick|concrete/.test(k+ITEMS[k].name.toLowerCase()),k);
});
ok("hut has 4 stages, house 6; axes gate felling stages",()=>{
  assert.equal(P.STAGES.woodhut.length,4);assert.equal(P.STAGES.foresthouse.length,6);
  const s={type:"foresthouse",stage:1,got:{}};assert.match(P.stageProblem(s,k=>0),/axe/i);assert.equal(P.stageProblem(s,k=>k==="axe_stone"?1:0),"");
});
ok("deliverStage takes only what is missing and advances",()=>{
  const inv={log:1,stick:40,cordage:10,stone:10};const take=(k,q)=>{inv[k]-=q;return true},have=k=>inv[k]||0;
  const s={type:"woodhut",stage:0,got:{}};let r=P.deliverStage(s,have,take);
  assert.equal(s.stage,0);assert.equal(r.delivered.log,1);assert.equal(inv.stone,6);assert.ok(P.stageFracOf(s)>0&&P.stageFracOf(s)<1);
  inv.log=5;r=P.deliverStage(s,have,take);assert.equal(r.completed,"frame");assert.equal(s.stage,1);assert.equal(inv.log,4);assert.deepEqual(s.got,{});
  const tot=P.stageTotalsOf("woodhut");const s2={type:"woodhut",stage:0,got:{}},bag={...tot};
  for(let i=0;i<4;i++)P.deliverStage(s2,k=>bag[k]||0,(k,q)=>{bag[k]-=q;return true});
  assert.ok(P.isComplete(s2));assert.ok(Object.values(bag).every(v=>v===0));
});
ok("walls block, door opens a gap, bed and door are targetable",()=>{
  assert.equal(P.wallSegs("foresthouse",1,0).length,0);
  const closed=P.wallSegs("foresthouse",6,0),open=P.wallSegs("foresthouse",6,1);assert.equal(closed.length,open.length);
  const leaf=s=>s.find(([x0,z0])=>x0===P.HOUSE.door.x0&&z0===P.HOUSE.hz);assert.ok(Math.abs(leaf(closed)[3]-P.HOUSE.hz)<1e-9);assert.ok(leaf(open)[3]<P.HOUSE.hz-.8);
  assert.equal(P.partAt("foresthouse",6,.7,1,P.HOUSE.hz),"door");assert.equal(P.partAt("foresthouse",6,1.5,.6,-1.6),"bed");assert.equal(P.partAt("foresthouse",5,.7,1,P.HOUSE.hz),"site");
  assert.ok(P.insideVolume("foresthouse",0,1.6,0,6));assert.ok(!P.insideVolume("foresthouse",3.2,1.6,0,6));
  const [wx,wz]=P.toWorld({x:5,z:-3,ry:.7},1.2,-.4),[lx,lz]=P.toLocal({x:5,z:-3,ry:.7},wx,wz);assert.ok(Math.abs(lx-1.2)<1e-9&&Math.abs(lz+.4)<1e-9);
});
for(const type of P.WOOD_TYPES){
  let root;
  ok(`${type} builds with finite geometry and shared materials`,()=>{
    root=buildWoodland(type,{seed:7,ground:(x,z)=>-.15-.05*Math.sin(x*1.3+z)});
    const mats=new Set(Object.values(woodMaterials()));let meshes=0;
    root.traverse(m=>{if(!m.isMesh||m.userData.proxyStage!=null)return;meshes++;assert.ok(mats.has(m.material),`${type}: unshared material ${m.material.name}`);
      const a=m.geometry.attributes.position.array;for(let i=0;i<a.length;i++)assert.ok(Number.isFinite(a[i]),`${type}: NaN vertex`)});
    assert.ok(meshes>8&&meshes<90,`${type}: ${meshes} meshes`);
    const tris=woodTriangles(root);assert.ok(tris<(type==="woodhut"?60000:220000),`${type}: ${tris} triangles`);
  });
  ok(`${type} stage reveal grows, LOD drops fine detail`,()=>{
    const counts=[];for(let k=0;k<=P.STAGES[type].length;k++){setWoodStage(root,k,0);counts.push(woodTriangles(root,true))}
    for(let k=1;k<counts.length;k++)assert.ok(counts[k]>counts[k-1],`${type}: stage ${k} adds geometry (${counts})`);
    setWoodStage(root,1,.5);const half=woodTriangles(root,true);assert.ok(half>counts[1]&&half<counts[2]);
    setWoodStage(root,P.STAGES[type].length,0);woodLOD(root,200);const far=woodTriangles(root,true);woodLOD(root,5);assert.ok(far<woodTriangles(root,true));
    if(type==="foresthouse"){setDoor(root,1);const piv=root.userData.door;assert.ok(piv&&Math.abs(piv.rotation.y-1.75)<1e-6)}
  });
}
console.log(`woodland: ${n} checks passed`);
