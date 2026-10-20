// Gameplay approximation, not a calibrated combustion solver. Real seconds govern
// rain/cooling; accelerated world seconds govern fuel use. Old saves need no migration.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function fireSize(s){return clamp(Math.sqrt(Math.max(0,s.fuel||0)/3),.45,4)}
export function burnRate(s){return s.type==='torch'?.125:s.type==='kiln'?(s.bellows?2:1)*1.3:fireSize(s)}
export function stepCombustion(s,dt,dtg,rain=0,sheltered=false){
  s.wet=clamp(Number.isFinite(s.wet)?s.wet:0,0,1);
  const size=s.type==='torch'?.4:fireSize(s),exposed=sheltered||s.type==='kiln'?0:clamp(rain,0,1);
  // Large fuel beds have more thermal inertia. Rain wets them over time;
  // heat evaporates some moisture rather than losing a fixed heat chunk per frame.
  s.wet=clamp(s.wet+dt*(exposed*.0025/size-(exposed?0:.0007)*(s.lit?2:1)),0,1);
  if(!s.lit){s.heat=Math.max(0,(s.heat||0)*Math.exp(-dt/(exposed?45:110)));return null}
  const used=Math.min(Math.max(0,s.fuel),dtg/3600*burnRate(s)*clamp(s.heat||0,.15,1));
  s.fuel=Math.max(0,s.fuel-used);
  if(s.type==='fire'){
    // A small recoverable char fraction, plus ash. Prolonged burning consumes
    // the char as well; extinguishing a fuel bed preserves more of it.
    s.charcoal=Math.max(0,(s.charcoal||0)+used*.08-dtg/3600*.012*(s.heat||0));
    s.ash=(s.ash||0)+used*.015;
  }
  const target=clamp(1-s.wet*1.15-exposed*.16/size,0,1);
  s.heat=clamp((s.heat||0)+(target-(s.heat||0))*(1-Math.exp(-dt/(target>s.heat?12:22))),0,1);
  if(s.fuel<=1e-8){s.fuel=0;s.lit=false;return 'fuel'}
  if(s.heat<.12){s.lit=false;return 'rain'}
  return null;
}
export function addFuel(s,kg){
  s.fuel=Math.max(0,s.fuel||0)+kg;
  if(s.lit)s.heat=Math.min(1,(s.heat||0)+.08); // immediate visible response; rest builds over seconds
}
export function lightningPulse(remaining,strength=1){
  if(remaining<=0||remaining>.32)return 0;
  const age=.32-remaining;
  return strength*(Math.exp(-age*42)+.65*Math.exp(-Math.pow((age-.095)/.018,2)));
}
