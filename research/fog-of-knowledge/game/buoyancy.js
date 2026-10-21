// Hydrostatics for a level raft: individual horizontal cylindrical logs, fresh water.
export const WATER_DENSITY=1000,WOOD_DENSITY=600,GRAVITY=9.81,LOG_LENGTH=.1/(Math.PI*.2*.2);
export const KG_PER_LB=.45359237;
export const massText=(kg,unit='kg')=>unit==='lb'?`${(kg/KG_PER_LB).toFixed(1)} lb`:`${Number(kg.toFixed(2))} kg`;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function logSpec(spec={}){const diameter=clamp(Number.isFinite(+spec.diameter)?+spec.diameter:.4,.1,1),radius=diameter/2,volume=Math.PI*radius**2*LOG_LENGTH;
 const mass=Number.isFinite(spec.mass)&&spec.mass>0?clamp(spec.mass,.1,1000):volume*WOOD_DENSITY;return {diameter,radius,volume,mass,length:LOG_LENGTH,density:mass/volume};}
export function segmentFraction(depth){const h=clamp(depth,0,2),q=1-h;return (Math.acos(q)-q*Math.sqrt(Math.max(0,1-q*q)))/Math.PI;}
export function displacedVolume(state,top){return state.logs.reduce((v,l)=>v+l.volume*segmentFraction(2-top/l.radius),0);}
export function buoyancyState(count,cargo,specs=[]){
 const logs=Array.from({length:count},(_,i)=>logSpec(specs[i]));cargo=Math.max(0,Number(cargo)||0);
 const timberMass=logs.reduce((s,l)=>s+l.mass,0),volume=logs.reduce((s,l)=>s+l.volume,0),maxDisplacedMass=volume*WATER_DENSITY,totalMass=timberMass+cargo;
 const state={logs,cargo,timberMass,volume,maxDisplacedMass,totalMass,cargoCapacity:maxDisplacedMass-timberMass,displacementFraction:totalMass/maxDisplacedMass,reservePercent:100*(1-totalMass/maxDisplacedMass),sinks:totalMass>maxDisplacedMass+1e-8};
 let lo=0,hi=Math.max(...logs.map(l=>l.diameter));for(let i=0;i<60;i++){const top=(lo+hi)/2;if(displacedVolume(state,top)*WATER_DENSITY>totalMass)lo=top;else hi=top}
 state.topHeight=state.sinks?0:(lo+hi)/2;state.depthRadii=2-state.topHeight/logs[0].radius;state.heightFreeboardPercent=100*state.topHeight/logs[0].diameter;state.weightForce=totalMass*GRAVITY;state.buoyantForce=Math.min(totalMass,maxDisplacedMass)*GRAVITY;return state;
}
// Vertical force balance: Archimedes + gravity + an explicitly approximate drag model.
// RK4 integration, SI units; raft held level, no rotational/capsize/wave dynamics.
export function simulateHeave(state,seconds=16,dt=1/240){
 let h=Math.max(...state.logs.map(l=>l.diameter))+.1,v=0;const motion=[[0,h,0]],area=state.logs.reduce((s,l)=>s+l.diameter*l.length,0);
 const acc=(top,speed)=>{const vol=displacedVolume(state,top),wet=vol/state.volume,drag=wet*(.5*WATER_DENSITY*area*Math.abs(speed)*speed+200*state.logs.length*speed);return (WATER_DENSITY*GRAVITY*vol-state.weightForce-drag)/state.totalMass};
 const steps=Math.ceil(seconds/dt);for(let i=1;i<=steps;i++){const a=acc(h,v),b=acc(h+v*dt/2,v+a*dt/2),c=acc(h+(v+a*dt/2)*dt/2,v+b*dt/2),d=acc(h+(v+b*dt/2)*dt,v+c*dt);h+=dt/6*(v+2*(v+a*dt/2)+2*(v+b*dt/2)+(v+c*dt));v+=dt/6*(a+2*b+2*c+d);if(i%8===0||i===steps)motion.push([i*dt,h,v]);}
 return motion;
}
export function raftPose(state,t){const waterline=185,radius=state.logs[0].radius*120,equilibrium=185-120*(state.topHeight-state.logs[0].radius),progress=clamp(t,0,1);let top;
 if(state.motion){const a=state.motion[Math.min(state.motion.length-1,Math.round(progress*(state.motion.length-1)))];top=185-120*a[1];}
 else{const ease=progress*progress*(3-2*progress);top=126+((state.sinks?416:185-120*state.topHeight)-126)*ease;}
 return {waterline,radius,centerY:top+radius,topY:top,equilibrium,sunk:state.sinks&&top>350};}
