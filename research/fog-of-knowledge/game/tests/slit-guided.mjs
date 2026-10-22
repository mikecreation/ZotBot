import assert from 'node:assert/strict';
import {guidedGeometry,drawnScreenIntensity,screenPattern,sampleHitsMm,binHits,measuredSpacing,centralVisibility,predictedSpacingMm} from '../double-slit-guided-model.js';
import {slitSettings,slitDistribution} from '../double-slit-model.js';
let checks=0;const ok=(c,m)=>{assert(c,m);checks++};
let seed=12345;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const norm=a=>{const s=a.reduce((x,y)=>x+y,0);return a.map(v=>v/s)};
const cases=[{},{wavelength:400,separation:400,distance:.5},{wavelength:700,separation:150,distance:2.5,width:60},{separation:300,distance:1}];
for(const c of cases){
 for(const detector of [0,1]){const p=slitSettings({...c,detector});
  // 1) the drawn wave field's screen line equals the model intensity ("this line = that screen")
  const a=norm(drawnScreenIntensity(p,400)),b=norm(screenPattern(p,400));ok(Math.max(...a.map((v,i)=>Math.abs(v-b[i])))<2e-4,`drawn screen line matches model ${JSON.stringify(c)} det=${detector}`);
  // 2) histogram of sampled detections agrees with the intensity curve
  const d=slitDistribution(p,800),h=binHits(sampleHitsMm(d,200000,rand),160),e=new Float64Array(160);for(let i=0;i<800;i++)e[i/5|0]+=d.pdf[i];
  let tv=0;for(let i=0;i<160;i++)tv+=Math.abs(h[i]/200000-e[i]);ok(tv/2<.02,`histogram total-variation distance ${(tv/2).toFixed(4)} < 0.02`);
  const sp=predictedSpacingMm(p),vis=centralVisibility(h,p),m=measuredSpacing(h);
  if(!detector){
   // 3) detector off: clear fringes with spacing lambda L / d
   if(sp>=.8&&sp<=8){ok(vis>.7,`fringe visibility ${vis.toFixed(2)} high with marker OFF`);ok(m!==null&&Math.abs(m-sp)/sp<.05,`measured spacing ${m} ~ ${sp.toFixed(3)} mm`)}
  }else{
   // 4) which-path marker on: fringes vanish
   ok(vis<.08,`visibility ${vis.toFixed(3)} near zero with marker ON`);ok(measuredSpacing(h)===null,'no fringe spacing measurable with marker ON');
  }
 }
}
// geometry sanity: drawn wavelength reproduces model phase slope
for(const c of cases){const g=guidedGeometry(c),s=g.s;const lhs=g.kV*(g.slitX[1]-g.slitX[0])/g.Lp,rhs=2*Math.PI*s.separation*1e-6/(s.wavelength*1e-9*s.distance*g.pxPerM);ok(Math.abs(lhs-rhs)/rhs<1e-9,'drawn phase slope equals model phase slope')}
console.log(`${checks} guided-lab checks passed (screen line = model, histogram vs |psi1+psi2|^2, spacing lambda*L/d, which-path removes fringes)`);
