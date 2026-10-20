import assert from 'node:assert/strict';
import {fireSize,stepCombustion,addFuel,lightningPulse} from '../fire-model.js';
const fire=(fuel=3)=>({type:'fire',lit:true,heat:1,fuel});
function run(s,secs,rain=0,shelter=false,step=.1){for(let t=0;t<secs;t+=step)stepCombustion(s,step,step*30,rain,shelter);return s}
const small=fire(1.5),big=fire(16);run(small,30,1);run(big,30,1);
assert(small.lit&&big.lit,'rain must not erase fires in seconds');
run(small,330,1);assert(!small.lit&&small.fuel>0,'prolonged heavy rain extinguishes, preserves wood');
run(big,330,1);assert(big.lit,'large beds resist rain longer');
const roof=run(fire(16),600,1,true);assert(roof.lit&&roof.heat>.95,'shelter protects fire');
const a=run(fire(),90,.7,false,.1),b=run(fire(),90,.7,false,.02);
assert(Math.abs(a.heat-b.heat)<.005&&Math.abs(a.fuel-b.fuel)<.01,'frame independent');
const burned=run(fire(1.5),1500);assert(!burned.lit&&burned.ash>0&&burned.charcoal>0,'burned pile leaves residue');
const before=fireSize(big);addFuel(big,5);assert(fireSize(big)>before,'fuel increases size above old 14kg cap');
const save=JSON.parse(JSON.stringify(small));assert.equal(save.wet,small.wet);assert.equal(save.fuel,small.fuel);
assert.equal(lightningPulse(0),0);assert.equal(lightningPulse(.5),0);assert(lightningPulse(.32)>.99);assert(lightningPulse(.225)>.5);
console.log('8 fire/rain/residue/frame-time/flash checks passed',JSON.stringify({small,big,roof,burned}));

for(const fuel of [15,20,30,48,60,120,500])assert.ok(fireSize({fuel:fuel+5})>fireSize({fuel}),'every added log grows even above the old cap');
