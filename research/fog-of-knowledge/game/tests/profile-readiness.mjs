import assert from 'node:assert/strict';
import {profileReady} from '../slit-wave-field.js';
import {slitDistribution,sampleSlit} from '../double-slit-model.js';
let checks=0;
for(const settings of [{slits:1},{slits:2},{positions:[-200,0,200]},{slits:2,detector:1}]){
 const d=slitDistribution(settings),bins=new Uint32Array(80),tracker={};let readyAt=0;
 for(let n=1;n<=3000;n++){
  const index=sampleSlit(d.cdf,(n*.618033988749895)%1);bins[Math.min(79,Math.floor(index/10))]++;
  if(profileReady(bins,d.pdf,n,tracker)){readyAt=n;break;}
 }
 assert.equal(readyAt,2250);checks++;
}
const d=slitDistribution({slits:2}),wrong=new Uint32Array(80),tracker={};
for(let n=250;n<=5000;n+=250){wrong[0]=n;assert.equal(profileReady(wrong,d.pdf,n,tracker),false);checks++;}
console.log(`${checks} automatic profile readiness checks passed`);
