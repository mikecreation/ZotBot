// Pure, dependency-free galleon geometry + sailing physics (node-testable).
// Ship-local axes: +x = port side (three.js: an object facing +z has +x on its left), +y up (keel bottom = 0), +z toward the bow.
// World heading psi: bow direction = (sin psi, cos psi) in world (x, z), the same
// convention as THREE's rotation.y, so a ship group uses rotation.y = psi.
export const HULL={
  sternZ:-13,bowZ:14.5,           // hull ends (27.5 m on deck; ~35 m with bowsprit)
  beam:8,                         // extreme breadth
  maxBreadthY:3.6,                // height of the widest waterline section
  draft:2.8,                      // design draft (keel bottom below the waterline)
  mainDeck:4.8,quarterDeck:7.2,poopDeck:9.2,foreDeck:6.8,
  quarterZ:-6.5,poopZ:-10.5,foreZ:9,
  bulwark:1.1,
  Cb:.5,Cw:.75,rho:1025,
  helm:{x:0,z:-7.6},              // ship's wheel on the quarterdeck
  gangway:{x:4.2,z:0},            // boarding ladder (port side, local +x)
};
HULL.length=HULL.bowZ-HULL.sternZ;
// displacement mass that puts the design draft on the waterline (Archimedes)
HULL.mass=HULL.rho*HULL.Cb*(HULL.length*.88)*HULL.beam*HULL.draft;
const clamp=(v,a,b)=>v<a?a:v>b?b:v,ss=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
/** draft that a hull of the given mass floats at (flat water). */
export function draftFor(mass,h=HULL){return mass/(h.rho*h.Cb*(h.length*.88)*h.beam)}
// Stairs between deck levels: ramps only within +-w of their centre line; elsewhere a bulkhead.
export const RAMPS=[
  {z0:HULL.quarterZ,z1:HULL.quarterZ+2.4,y0:HULL.quarterDeck,y1:HULL.mainDeck,xc:0},   // main deck -> quarterdeck
  {z0:HULL.poopZ,z1:HULL.poopZ+1.8,y0:HULL.poopDeck,y1:HULL.quarterDeck,xc:2.3},       // quarterdeck -> poop
  {z0:HULL.foreZ-2.2,z1:HULL.foreZ,y0:HULL.mainDeck,y1:HULL.foreDeck,xc:0},            // main deck -> forecastle
];
export const RAMP_W=.95;
/** deck level (no stairs) at local z. */
export function levelY(z,h=HULL){return z<h.poopZ?h.poopDeck:z<h.quarterZ?h.quarterDeck:z>h.foreZ?h.foreDeck:h.mainDeck}
/** walkable deck height at local (z, x): flat decks joined by stairs. */
export function deckY(z,x=0,h=HULL){
  for(const r of RAMPS)if(z>=r.z0&&z<=r.z1&&Math.abs(x-r.xc)<=RAMP_W)return r.y0+(r.y1-r.y0)*(z-r.z0)/(r.z1-r.z0);
  return levelY(z,h);
}
/** smooth deck line used for the hull's sheer. */
function smoothLevel(z,h){let y=h.mainDeck;y+=(h.quarterDeck-h.mainDeck)*(1-ss(h.quarterZ-.4,h.quarterZ+.4,z));y+=(h.poopDeck-h.quarterDeck)*(1-ss(h.poopZ-.4,h.poopZ+.4,z));y+=(h.foreDeck-h.mainDeck)*ss(h.foreZ-.4,h.foreZ+.4,z);return y}
/** top of the hull side (sheer line incl. bulwark) at local z. */
export function sheerY(z,h=HULL){return smoothLevel(z,h)+h.bulwark+.35*ss(h.bowZ-3,h.bowZ,z)}
/** keel (bottom profile) height at local z: raked stem, slightly lifted stern. */
export function keelY(z,h=HULL){const t=(z-h.sternZ)/h.length;return t>.78?3.1*Math.pow((t-.78)/.22,1.8):t<.05?.35*(1-t/.05):0}
/** plan-view half breadth at the widest waterline, as a function of local z. */
export function planHalf(z,h=HULL){const t=clamp((z-h.sternZ)/h.length,0,1),B=h.beam/2;
  if(t<.4)return B*(.74+.26*ss(0,.4,t));
  if(t<.56)return B;
  return B*Math.max(0,1-Math.pow((t-.56)/.44,2.1));}
/** half breadth of the hull at local (z, y): U-section below, tumblehome above. */
export function halfBreadth(z,y,h=HULL){
  const pb=planHalf(z,h),k=keelY(z,h),top=sheerY(z,h);if(y<k)return 0;
  if(y<=h.maxBreadthY){const s=clamp((y-k)/Math.max(.3,h.maxBreadthY-k),0,1);return Math.max(.14,pb*(1-Math.pow(1-s,2.4)))}
  const s=clamp((y-h.maxBreadthY)/(top-h.maxBreadthY),0,1);return Math.max(.14,pb*(1-.13*Math.pow(s,1.4)));
}
/** half width of walkable deck at local z (inside the bulwark). */
export function deckHalf(z,h=HULL){return Math.max(0,halfBreadth(z,levelY(z,h),h)-.45)}
/** clamp a deck position to the walkable area, returns [x,z]. */
export const MASTS=[{z:7.6,base:4.8},{z:.8,base:4.8},{z:-11.6,base:9.2}];
export function clampDeck(x,z,h=HULL){z=clamp(z,h.sternZ+.8,h.bowZ-2.2);const w=deckHalf(z,h);return [clamp(x,-w,w),z]}

/** relative sail drive vs. angle between heading and the direction the wind blows TO (0 = dead downwind). */
export function sailPolar(alpha){const d=Math.abs(alpha)*180/Math.PI,P=[[0,.72],[45,.92],[75,1],[100,.82],[115,.45],[125,.12],[135,0],[180,0]];
  for(let i=1;i<P.length;i++)if(d<=P[i][0]){const [a,va]=P[i-1],[b,vb]=P[i];return va+(vb-va)*(d-a)/(b-a)}return 0}
export function pointOfSail(alpha){const d=Math.abs(alpha)*180/Math.PI;return d<20?"Running downwind":d<70?"Broad reach":d<105?"Beam reach":d<128?"Close-hauled":"In irons (head to wind)"}
/** angle between bow and wind-TO direction, 0..PI. windDir = direction the wind blows toward. */
export function windAngle(psi,windDir){let a=Math.abs(((psi-windDir)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI);return a}
export const SHIP_TUNE={speedK:.42,tauU:9,maxTurn:.12,tauR:2.2,sailRate:.45,rudderRate:1.6,stopDepth:.45};
export function newShipState(x,z,psi){return {x,z,psi,u:0,r:0,sail:0,sailSet:0,rudder:0,y:-HULL.draft,vy:0,pitch:0,vp:0,roll:0,vr:0,heel:0,grounded:false,dist:0}}
/** world direction of the ship-local +x axis (port) for heading psi. */
export const localX=psi=>[Math.cos(psi),-Math.sin(psi)];
/** right-hand (starboard) unit vector for heading psi. */
export const rightOf=psi=>[-Math.cos(psi),Math.sin(psi)];
export const fwdOf=psi=>[Math.sin(psi),Math.cos(psi)];
/**
 * Advance one ship. env: {wave(x,z)->surface height, ground(x,z)->seabed height (negative = underwater),
 *  windDir, windSpeed}. ctl: {sail:-1|0|1 (lower/hold/raise), rudder:-1..1 (+1 = turn to starboard / right)}.
 */
export function stepShip(s,dt,env,ctl={},T=SHIP_TUNE,h=HULL){
  dt=Math.min(dt,.1);
  s.sailSet=clamp(s.sailSet+(ctl.sail||0)*T.sailRate*dt,0,1);
  const rt=clamp(ctl.rudder||0,-1,1);s.rudder+=clamp(rt-s.rudder,-T.rudderRate*dt,T.rudderRate*dt);
  s.sail+=(s.sailSet-s.sail)*Math.min(1,dt*1.5); // canvas takes a moment to fill / be taken in
  const alpha=windAngle(s.psi,env.windDir),drive=sailPolar(alpha);s.drive=drive;s.alpha=alpha;
  const target=s.sail*env.windSpeed*drive*T.speedK;
  s.u+=(target-s.u)*Math.min(1,dt/T.tauU)-Math.abs(s.rudder)*.02*s.u*dt;
  // rudder needs water flowing past it; a little steerage way even when slow (sweeps/kedging)
  const steer=clamp(Math.abs(s.u)/2,.2,1);s.r+=(-s.rudder*T.maxTurn*steer-s.r)*Math.min(1,dt/T.tauR);
  s.psi+=s.r*dt;
  const [fx,fz]=fwdOf(s.psi),[rx,rz]=localX(s.psi);
  // grounding: keep the keel off the seabed (probe ahead of the bow and along the hull)
  const nx=s.x+fx*s.u*dt,nz=s.z+fz*s.u*dt,need=h.draft+T.stopDepth,probe=(lx,lz)=>-env.ground(nx+rx*lx+fx*lz,nz+rz*lx+fz*lz);
  const ahead=h.bowZ+Math.max(2,s.u*1.5);
  const shallow=Math.min(probe(0,ahead),probe(0,h.bowZ-2),probe(-3.4,1),probe(3.4,1),probe(0,h.sternZ+1));
  if(shallow<need&&s.u>0){s.grounded=true;s.u=Math.max(0,s.u-dt*2.5);if(probe(0,ahead)<need-.2)s.u=0}
  else s.grounded=false;
  if(!(shallow<need-.2)){s.dist+=Math.hypot(nx-s.x,nz-s.z);s.x=nx;s.z=nz}
  // buoyancy: sample the sea at bow, stern, port, starboard and centre
  const L2=h.length*.38,B2=h.beam*.5,w=(lx,lz)=>env.wave(s.x+rx*lx+fx*lz,s.z+rz*lx+fz*lz);
  const hb=w(0,L2),hs=w(0,-L2),hp=w(-B2,0),hst=w(B2,0),hc=w(0,0),mean=(hb+hs+hp+hst+2*hc)/6;
  const k=9.81*h.Cw/(h.Cb*h.draft);       // restoring stiffness per unit mass (rho g Aw / M)
  const yEq=mean-h.draft;s.vy+=(k*(yEq-s.y)-2*.45*Math.sqrt(k)*s.vy)*dt;s.y+=s.vy*dt;
  const pT=Math.atan2(hb-hs,2*L2),kp=3.2;s.vp+=(kp*(pT-s.pitch)-2*.5*Math.sqrt(kp)*s.vp)*dt;s.pitch+=s.vp*dt;
  // heel: wind on the sails pushes the masts to leeward (strongest on a beam reach)
  const windSide=Math.sign(Math.sin(env.windDir-s.psi))||1;s.heel+=(windSide*-.11*s.sail*Math.min(1,env.windSpeed/12)*Math.sin(alpha)-s.heel)*Math.min(1,dt*.5);
  const rT=Math.atan2(hst-hp,2*B2)+s.heel,kr=.75;s.vr+=(kr*(rT-s.roll)-2*.35*Math.sqrt(kr)*s.vr)*dt;s.roll+=s.vr*dt;
  return s;
}
/** local (lx, ly, lz) on the ship -> world [x,y,z] (heave, pitch, roll and heading applied; YXZ order). */
export function shipToWorld(s,lx,ly,lz){
  // roll about z (positive = local +x / port side up), then pitch about x (positive = bow up), then yaw
  const cr=Math.cos(s.roll),sr=Math.sin(s.roll);let x=lx*cr-ly*sr,y=lx*sr+ly*cr,z=lz;
  const cp=Math.cos(-s.pitch),sp=Math.sin(-s.pitch);const y2=y*cp-z*sp,z2=y*sp+z*cp;y=y2;z=z2;
  const cy=Math.cos(s.psi),sy=Math.sin(s.psi);return [s.x+x*cy+z*sy,s.y+y,s.z-x*sy+z*cy];
}
/** world (x, z) -> ship-local (lx, lz) ignoring pitch/roll. */
export function worldToShip(s,x,z){const dx=x-s.x,dz=z-s.z,[rx,rz]=localX(s.psi),[fx,fz]=fwdOf(s.psi);return [dx*rx+dz*rz,dx*fx+dz*fz]}
/** move a walker on deck from (x,z) toward (nx,nz): stays inside the bulwarks, uses the stairs, avoids masts. */
export function deckStep(x,z,nx,nz,h=HULL){
  [nx,nz]=clampDeck(nx,nz,h);const y0=deckY(z,x,h),ok=(a,b)=>Math.abs(deckY(b,a,h)-y0)<=.6&&!MASTS.some(m=>Math.hypot(a,b-m.z)<.55);
  if(ok(nx,nz))return [nx,nz];if(ok(nx,z))return [nx,z];if(ok(x,nz))return [x,nz];return [x,z];
}
