// Equal cylindrical logs in fresh water. Cargo displacement, deck mass and waves are neglected.
export function buoyancyState(logs,cargo){
 const timberMass=logs*60,maxDisplacedMass=logs*100,totalMass=timberMass+cargo;
 const displacementFraction=totalMass/maxDisplacedMass,reservePercent=100*(1-displacementFraction);
 // Circular-segment area fraction below a horizontal waterline. depth is measured in radii from the bottom.
 let lo=0,hi=2;
 for(let i=0;i<50;i++){const h=(lo+hi)/2,q=1-h,f=(Math.acos(q)-q*Math.sqrt(Math.max(0,1-q*q)))/Math.PI;if(f<Math.min(1,displacementFraction))lo=h;else hi=h}
 const depthRadii=(lo+hi)/2;
 return {timberMass,maxDisplacedMass,totalMass,cargoCapacity:maxDisplacedMass-timberMass,displacementFraction,reservePercent,depthRadii,heightFreeboardPercent:100*(1-depthRadii/2),sinks:totalMass>maxDisplacedMass};
}
export function raftPose(state,t){
 const waterline=185,radius=24,release=150,progress=Math.min(1,Math.max(0,t)),ease=progress*progress*(3-2*progress);
 const equilibrium=waterline-radius+radius*state.depthRadii;
 // An overloaded raft never acquires a false surface equilibrium. The end state is below the viewport.
 const end=state.sinks?440:equilibrium;
 return {waterline,radius,centerY:release+(end-release)*ease,equilibrium,sunk:state.sinks&&progress===1};
}
