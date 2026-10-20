// Persist only fuel identity/mass and surface charring, never renderer objects.
// Individual pieces follow the existing gameplay fuel budget; this is not a combustion solver.
export const MAX_FUEL_PIECES=24;
export function ensureFuelBed(s){
  if(Array.isArray(s.fuelPieces))return s.fuelPieces;
  s.fuelPieces=[];s.fuelNext=0;
  let fuel=Math.max(0,s.fuel||0);
  while(fuel>1e-8){const mass=Math.min(fuel,fuel<=1.5?.5:5);s.fuelPieces.push({id:s.fuelNext++,kind:mass<2?'split':'log',mass,left:mass,char:0});fuel-=mass;if(s.fuelPieces.length===MAX_FUEL_PIECES){s.fuelPieces.at(-1).mass+=fuel;s.fuelPieces.at(-1).left+=fuel;break}}
  return s.fuelPieces;
}
export function recordFuelPiece(s,kg,kind='log'){
  const pieces=ensureFuelBed(s);
  if(pieces.length>=MAX_FUEL_PIECES){const a=pieces.shift(),b=pieces[0];b.mass+=a.mass;b.left+=a.left;b.char=Math.max(a.char,b.char)}
  s.fuelNext=Math.max(s.fuelNext||0,...pieces.map(p=>p.id+1));
  const p={id:s.fuelNext++,kind:kind==='stick'?'split':kind,mass:kg,left:kg,char:kind==='charcoal'?1:0};pieces.push(p);return p;
}
export function stepFuelBed(s,dt=0){
  const pieces=ensureFuelBed(s);let used=Math.max(0,pieces.reduce((n,p)=>n+p.left,0)-Math.max(0,s.fuel||0));
  // Older wood burns first so a newly placed log remains visibly fresh.
  for(const p of pieces){const burn=Math.min(p.left,used);p.left=Math.max(0,p.left-burn);used-=burn;const spent=1-p.left/p.mass;
    if(s.lit&&p.left>0)p.char=Math.min(1,(p.char||0)+Math.max(0,dt)*(s.heat||0)*.007);
    p.char=Math.max(p.char||0,spent*.95);
  }
  return pieces;
}

// Two low interlocked courses; further fuel rolls onto the surrounding ground.
export function fuelPiecePose(index,piece){
  const fraction=Math.max(0,piece.left/piece.mass),split=piece.kind==='split',coal=piece.kind==='charcoal';
  const radius=(coal?.09:split?.115:.17)*(.42+.58*Math.sqrt(fraction)),length=(coal?.3:split?.72:1.05)*(.6+.4*Math.sqrt(fraction));
  if(index<6){const layer=Math.floor(index/3),a=layer*Math.PI/2+.1*Math.sin(piece.id*3.7),cross=(index%3-1)*(split?.22:.31);return {x:-Math.sin(a)*cross,z:Math.cos(a)*cross,y:radius+layer*.19,a,tilt:.02*Math.sin(piece.id),radius,length,spill:false}}
  const j=index-6,angle=j*2.39996323+.35,ring=Math.floor(j/8),r=.83+ring*.37+.07*Math.sin(piece.id*2.7);
  return {x:Math.cos(angle)*r,z:Math.sin(angle)*r,y:radius+.025,a:angle+Math.PI/2+.3*Math.sin(piece.id),tilt:.06*Math.sin(piece.id*2),radius,length,spill:true};
}
