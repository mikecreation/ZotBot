import assert from 'node:assert/strict';
import {SLIT_DEFAULTS as p,slitIntensity as I,slitDistribution as D,sampleSlit,evaluateSlit} from '../double-slit-model.js';
let checks=0;const near=(a,b,t=1e-10)=>{assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);checks++};
const lambda=p.wavelength*1e-9,d=p.separation*1e-6,a=p.width*1e-6,L=p.distance;
near(I(0,p),2);near(I(0,{...p,detector:1}),1);near(I(0,{...p,slits:1}),1);
const exactY=sin=>L*sin/Math.sqrt(1-sin*sin);
near(I(exactY(lambda/(2*d)),p),0);near(I(exactY(lambda/a),p),0);
for(const y of [-.02,-.01,-.003,0,.003,.01,.02]){near(I(y,p),I(-y,p));near(I(y,{...p,detector:1}),I(y,{...p,slits:1}));assert.ok(I(y,p)>=0);checks++}
for(const setting of [p,{...p,detector:1},{...p,slits:1}]){const dist=D(setting);near(dist.pdf.reduce((x,y)=>x+y,0),1);near(dist.cdf.at(-1),1);assert.ok(dist.cdf.every((v,i)=>!i||v>=dist.cdf[i-1]));checks++;const counts=new Uint32Array(8);for(let j=0;j<40000;j++)counts[Math.floor(sampleSlit(dist.cdf,(j+.5)/40000)/100)]++;for(let k=0;k<8;k++)near(counts[k]/40000,dist.pdf.slice(k*100,(k+1)*100).reduce((x,y)=>x+y,0),.0001)}
near(D({...p,separation:100}).spacing,2*D(p).spacing);near(D({...p,distance:3}).spacing,2*D(p).spacing);near(D({...p,wavelength:660}).spacing,1.2*D(p).spacing);
assert.ok(!evaluateSlit({...p,detected:199},0).success);assert.ok(evaluateSlit({...p,detected:200},0).success);assert.ok(evaluateSlit({...p,detector:1,detected:200},1).success);assert.ok(evaluateSlit({...p,separation:100,detected:200},2).success);assert.ok(!evaluateSlit({...p,separation:100,detector:1,detected:200},2).success);checks+=5;
console.log(`${checks} diffraction, probability, sampler and challenge checks passed`);
