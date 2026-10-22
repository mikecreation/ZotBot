import assert from 'node:assert/strict';
import {slitAmplitudes,slitDistribution,slitSettings} from '../double-slit-model.js';
let checks=0;
const near=(a,b)=>{assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);checks++};
for(const positions of [[0],[-100,100],[-200,0,200],[-250,-60,90,310]]){
 for(const detector of [0,1]){
  const s=slitSettings({positions,detector}),d=slitDistribution(s);
  for(const i of [0,173,399,400,521,799]){
   const y=-.02+(i+.5)*.04/800,a=slitAmplitudes(y,s);
   near(a.intensity,d.weights[i]);
   near(a.intensity,detector?a.envelope:a.envelope*(a.re*a.re+a.im*a.im)/positions.length);
  }
 }
}
// Three coherent apertures: phases spaced by 120 degrees cancel at this angle.
const d=200e-6,lambda=550e-9,q=lambda/(3*d),y=1.5*q/Math.sqrt(1-q*q);
near(slitAmplitudes(y,{positions:[-200,0,200]}).intensity,0);
near(slitAmplitudes(0,{positions:[-200,0,200]}).intensity,3);
assert.ok(slitAmplitudes(y,{positions:[-200,0,200],detector:1}).intensity>.9);checks++;
console.log(`${checks} shared probe/sampler and three-slit cancellation checks passed`);
