import assert from 'node:assert/strict';
import {ITEMS,RECIPES} from '../world-data.js';
import {advanceDrill,drillProblem,DRILL_SECONDS} from '../friction-fire.js';
import {primitiveItem,workbenchMesh} from '../primitive-models.js';
const r=k=>RECIPES.find(r=>r.out===k);
for(const k of ['knife_stone','axe_stone','pickaxe_stone','hand_drill','bench_joint','workbench','workbench_bundle']){
  assert.ok(ITEMS[k]&&r(k));assert.ok(primitiveItem(k));assert.ok(!r(k).req,'bootstrap recipes never locked behind a later discovery');
}
assert.equal(ITEMS.axe_stone.tool,'axe');assert.equal(ITEMS.pickaxe_stone.tool,'pickaxe');
assert.equal(r('hand_drill').tool,'knife_stone');assert.equal(r('hand_drill').in.log,1);
for(const k of ['axe_stone','pickaxe_stone']){assert.equal(r(k).tool,'knife_stone');assert.ok(r(k).in.stick&&r(k).in.fiber)}
for(const k of ['workbench','workbench_bundle']){assert.equal(r(k).in.bench_joint,4);assert.ok(r(k).in.log&&r(k).in.stick&&r(k).in.fiber)}
const ordinary=workbenchMesh(),bundle=workbenchMesh(true);assert.equal(ordinary.userData.legs,4);assert.equal(ordinary.userData.boards,6);assert.ok(bundle.children.length>ordinary.children.length);
const base={fire:{type:'fire',lit:false,fuel:5,wet:0},other:null,stamina:100,rain:false,swimming:false,tinder:1};assert.equal(drillProblem(base),'');
for(const [key,value] of [['other','flint'],['stamina',0],['rain',true],['swimming',true],['tinder',0],['fire',null]])assert.ok(drillProblem({...base,[key]:value}),key+' blocked');
assert.ok(drillProblem({...base,fire:{...base.fire,wet:.8}}));assert.ok(drillProblem({...base,fire:{...base.fire,lit:true}}));assert.ok(drillProblem({...base,fire:{...base.fire,fuel:0}}));
assert.equal(drillProblem({...base,tinder:0,fire:{...base.fire,_drill:{tinder:true}}}),'','prepared tinder is reused');
const s={};for(let i=0;i<DRILL_SECONDS*60+1;i++)advanceDrill(s,1/60,true);assert.equal(s.progress,1);advanceDrill(s,1/30,false);assert.ok(s.progress<1,'interruption cools friction heat');
console.log('Primitive tool progression, both four-support bench models, crafting dependencies, friction ignition and interruption checks passed.');
