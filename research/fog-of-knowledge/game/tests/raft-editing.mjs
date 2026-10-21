import assert from 'node:assert/strict';
import {buoyancyState,displacedVolume,simulateHeave,KG_PER_LB} from '../buoyancy.js';
let count=0;const near=(a,b,t=1e-6)=>{assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);count++};
for(let n=3;n<=12;n++){const b=buoyancyState(n,100);near(displacedVolume(b,b.topHeight)*1000,b.totalMass);const motion=simulateHeave(b);near(motion.at(-1)[1],b.topHeight,.002)}
const big=buoyancyState(3,100,[{diameter:.8}]);near(big.logs[0].volume,.4);near(big.logs[0].mass,240);near(displacedVolume(big,big.topHeight)*1000,big.totalMass);
const heavy=buoyancyState(3,100,[{diameter:.8,mass:300}]);near(heavy.logs[0].volume,big.logs[0].volume);assert.ok(heavy.topHeight<big.topHeight);count++;
for(const mass of [0,100,180,1000])near(mass/KG_PER_LB*KG_PER_LB,mass);
const a=simulateHeave(big,8,1/120),b=simulateHeave(big,8,1/240);near(a.at(-1)[1],b.at(-1)[1],.0001);
assert.ok(buoyancyState(2,100).sinks);assert.ok(!buoyancyState(3,100).sinks);count+=2;
// Independent midpoint integration of submerged circular strips.
let numerical=0;for(const l of big.logs){const dx=l.diameter/20000;for(let i=0;i<20000;i++){const x=-l.radius+(i+.5)*dx,half=Math.sqrt(l.radius*l.radius-x*x),waterFromCenter=l.radius-big.topHeight;numerical+=Math.max(0,Math.min(2*half,half+waterFromCenter))*dx*l.length}}
near(numerical*1000,big.totalMass,.01);
console.log(`${count} hydrostatic, editing, unit and integrator checks passed`);
