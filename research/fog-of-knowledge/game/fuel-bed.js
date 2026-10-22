// Each added piece remains represented. Renderer capacity grows independently.
export const INITIAL_FUEL_CAPACITY=32;
export function ensureFuelBed(s){
  if(Array.isArray(s.fuelPieces)&&!s.fuelPieces.some(p=>p.mass>(p.kind==='split'?.50001:p.kind==='charcoal'?.08001:5.00001)))return s.fuelPieces;
  const old=s.fuelPieces;s.fuelPieces=[];s.fuelNext=0;s._pile=null;
  const append=(mass,left,kind,char=0)=>s.fuelPieces.push({id:s.fuelNext++,kind,mass,left,char,fire:0});
  if(old){for(const p of old){let mass=p.mass;while(mass>1e-8){const part=Math.min(p.kind==='split'?.5:p.kind==='charcoal'?.08:5,mass);append(part,p.left*part/p.mass,p.kind,p.char||0);mass-=part}}}
  else{let fuel=Math.max(0,s.fuel||0);while(fuel>1e-8){const mass=Math.min(fuel,fuel<=1.5?.5:5);append(mass,mass,mass<2?'split':'log');fuel-=mass}}
  return s.fuelPieces;
}
export function recordFuelPiece(s,kg,kind='log'){
  const pieces=ensureFuelBed(s);s.fuelNext=Math.max(s.fuelNext||0,pieces.length?pieces.at(-1).id+1:0);
  const p={id:s.fuelNext++,kind:kind==='stick'?'split':kind,mass:kg,left:kg,char:kind==='charcoal'?1:0,fire:0};pieces.push(p);return p;
}
export function stepFuelBed(s,dt=0){
  const pieces=ensureFuelBed(s);let used=Math.max(0,pieces.reduce((n,p)=>n+p.left,0)-Math.max(0,s.fuel||0));
  for(const p of pieces){const burn=Math.min(p.left,used);p.left=Math.max(0,p.left-burn);used-=burn;const spent=1-p.left/p.mass;
    if(s.lit&&p.left>0){p.char=Math.min(1,(p.char||0)+Math.max(0,dt)*(s.heat||0)*.007);p.fire=Math.min(1,(p.fire||0)+dt*(s.heat||0)/4)}else p.fire=Math.max(0,(p.fire||0)-dt*.15);
    p.char=Math.max(p.char||0,spent*.95);
  }
  return pieces;
}
const CELL=.3,key=(x,z)=>x+z*65536;
function shape(p){const split=p.kind==='split',coal=p.kind==='charcoal';return {radius:coal?.09:split?.115:.17,length:coal?.3:split?.72:1.05}}
// Deterministic support packing. Initial courses stack at the center. Overflow
// chooses the lowest nearby supported surface, with a slope penalty toward the
// edge: it touches the existing mound rather than forming detached rings.
export function fuelLayout(s){
  const residue=(s.charcoal||0)>.005,pieces=ensureFuelBed(s).filter(p=>p.left>1e-8||residue);let pile=s._pile;
  if(!pile||pile.ids.length>pieces.length||pile.ids.some((id,i)=>pieces[i]?.id!==id))pile=s._pile={ids:[],poses:[],poseById:new Map(),grid:new Map(),extent:2,radius:0,height:0};
  const cells=(x,z,a)=>{const out=[];for(let j=-1;j<=1;j++)out.push(a%2?[x,z+j]:[x+j,z]);return out};
  const level=cs=>Math.max(0,...cs.map(([x,z])=>pile.grid.get(key(x,z))||0));
  for(let i=pile.ids.length;i<pieces.length;i++){
    const p=pieces[i],dim=shape(p),axis=Math.floor(i/3)%2;let gx=0,gz=0,top=0,score=Infinity;
    if(i<15){const cross=i%3-1;gx=axis?cross:0;gz=axis?0:cross;top=level(cells(gx,gz,axis))}
    else{for(let x=-pile.extent;x<=pile.extent;x++)for(let z=-pile.extent;z<=pile.extent;z++){
      const radial=.7*Math.hypot(x*CELL,z*CELL);if(radial>score)continue;let h=0,attached=false;
      for(let j=-1;j<=1;j++){const u=x+(axis?0:j),v=z+(axis?j:0),k=key(u,v),value=pile.grid.get(k)||0;h=Math.max(h,value);if(value||pile.grid.has(k-1)||pile.grid.has(k+1)||pile.grid.has(k-65536)||pile.grid.has(k+65536))attached=true}
      if(!attached)continue;const cost=h+radial+.003*Math.sin(x*9+z*13+i);if(cost<score){score=cost;gx=x;gz=z;top=h}
    }}
    const cs=cells(gx,gz,axis);for(const [x,z] of cs){pile.grid.set(key(x,z),top+dim.radius*2);pile.extent=Math.max(pile.extent,Math.abs(x)+2,Math.abs(z)+2)}
    // Capacity is spatial, not a fixed piece count. A larger mound grows upward
    // and outward; the support grid guarantees contact between neighboring fuel.
    const pose={x:gx*CELL,z:gz*CELL,y:top+dim.radius,a:axis*Math.PI/2,tilt:0,cells:cs,...dim,spill:i>=15};pile.ids.push(p.id);pile.poses.push(pose);pile.poseById.set(p.id,pose);
    pile.radius=Math.max(pile.radius,Math.hypot(pose.x,pose.z)+dim.length/2);pile.height=Math.max(pile.height,pose.y+dim.radius);
  }
  return pile;
}
