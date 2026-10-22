import assert from 'node:assert/strict';
import {buildWaveField,observedProfile} from '../slit-wave-field.js';
import {slitSettings,slitDistribution} from '../double-slit-model.js';
let checks=0;
for(const positions of [[0],[-100,100],[-200,0,200]])for(const detector of [0,1]){
 const s=slitSettings({positions,detector}),f=buildWaveField(s,8,800),d=slitDistribution(s);
 for(const i of [0,157,399,400,642,799]){
  assert.ok(Math.abs(f.power[i*8+7]-d.weights[i]/s.slits)<1e-7);checks++;
  if(!detector){assert.ok(Math.abs(f.re[i*8+7]**2+f.im[i*8+7]**2-f.power[i*8+7])<1e-7);checks++;}
 }
}
assert.deepEqual(observedProfile([0,0,4,0,0]),[0,1,2,1,0]);checks++;
assert.deepEqual(observedProfile([0,0,0]),[0,0,0]);checks++;
console.log(`${checks} field/sensor agreement and observed-dot profile checks passed`);
