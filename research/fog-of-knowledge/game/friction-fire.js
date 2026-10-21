// Deliberately accelerated gameplay, not calibrated fire-making times.
export const DRILL_SECONDS=14;
export function drillProblem({fire,other,stamina,rain,swimming,tinder}){
  if(swimming)return 'Move onto dry land';
  if(other)return 'Stow the other hand (V, R): hand drilling needs both hands';
  if(!fire||fire.type!=='fire')return 'Build a firewood pile first: hold 3 sticks and Q';
  if(fire.lit)return 'This fire is already burning';
  if(!(fire.fuel>0))return 'Add wood to the firewood pile first';
  if(rain)return 'Shelter the hearth and yourself from rain first';
  if((fire.wet||0)>.25)return 'The hearth is too wet: let it dry under shelter';
  if(stamina<8)return 'Rest before drilling: you are exhausted';
  if(!fire.drillTinder&&!fire._drill?.tinder&&!tinder)return 'Gather plant fiber for a dry tinder nest';
  return '';
}
export function advanceDrill(state,dt,working){
  const step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  state.progress=Math.max(0,Math.min(1,(state.progress||0)+(working?step/DRILL_SECONDS:-step/8)));
  return {progress:state.progress,ember:state.progress>=1,smoke:state.progress>.35};
}
