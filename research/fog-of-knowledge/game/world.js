import {createExpeditions} from "./expeditions.js?v=3.24.0";
import {GEAR_RECIPES,GEAR_STEPS,gearProblem,CLIMB_GUIDE} from "./gear-progression.js?v=3.24.0";
/* Fog of Knowledge: The Game — OPEN WORLD mode.
 * Real-time 3D world (three.js r160, vendored, MIT) with simple real physics:
 * gravity 9.81 m/s², friction-limited acceleration, quadratic air/water drag, Archimedes buoyancy,
 * heat balance (metabolism, convection/conduction, radiant fire heat with inverse-square falloff, wetness),
 * combustion (fuel + oxygen + heat; rain and fuel exhaustion put fires out; spread to trees),
 * inverse-square sound falloff for animal hearing, and boiling point vs altitude.
 * Discoveries happen by doing things in the world and reveal real atlas nodes.
 */
import * as THREE from "./vendor/three.module.min.js";
import {ITEMS,WORLD_DISCOVERIES,RECIPES} from "./world-data.js?v=3.24.0";
import {walkPath} from "./walk-path.js?v=3.24.0";
import {drillProblem,advanceDrill} from "./friction-fire.js?v=3.24.0";
import {primitiveItem,workbenchMesh} from "./primitive-models.js?v=3.24.0";
import * as GFX from "./gfx.js?v=3.24.0";
import * as AU from "./audio.js";
import {ESSENTIAL_QUICKBAR,quickbarOrder} from "./quickbar.js?v=3.24.0";
import {temperature,temperatureDelta} from "./units.js";
import {createBirds} from "./birds.js";
import {fireSize,stepCombustion,addFuel,lightningPulse} from "./fire-model.js?v=3.24.0";
import {ensureFuelBed,recordFuelPiece,stepFuelBed,fuelLayout} from "./fuel-bed.js?v=3.24.0";
import {createFireBed,updateFireBed} from "./fire-visuals.js?v=3.24.0";
import {CURIOSITY,OBJECTIVES} from "./content.js?v=3.8.3";
import {createPets,PET_INFO,MAX_ACTIVE} from "./pets.js";
import {createObserve,NOTES} from "./observe.js?v=3.24.0";
let PETS=null,OBS=null,EX=null;
const E=window.FogGameEngine,TREE=E.G;
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const SAVE_KEY="fog-of-knowledge:game:world:v1"+(new URLSearchParams(location.search).has("sandbox")?":sandbox-crafting":"");
const G_ACC=9.81, RHO_AIR=1.225, RHO_WATER=1000, BODY_MASS=70, BODY_HEAT_CAP=70*3500;
const GAME_SPEED=96;             // legacy constant (kept for reference); the clock now runs at gameSpeed()
// Long days, short nights: on "Long" (default) a full cycle is ~30 real minutes — 06:00–18:12 daylight (incl. golden hour) takes ~24 min,
// the 11.8-hour night (incl. dusk & dawn) only ~6 min. "Normal" halves that, "Short" quarters it.
const DAY_H0=6,DAY_H1=18.2,DAYLEN_MUL={long:1,normal:2,short:4};
let dayLenPref=(()=>{try{const v=localStorage.getItem("fog-of-knowledge:game:daylen");return DAYLEN_MUL[v]?v:"long"}catch(_){return "long"}})();
let weatherPref=(()=>{try{return localStorage.getItem("fog-of-knowledge:game:weather")==="natural"?"natural":"calm"}catch(_){return "calm"}})();
function gameSpeed(t){const h=(((t??world?.gameTime??0)/3600)%24+24)%24,m=DAYLEN_MUL[dayLenPref]||1;return (h>=DAY_H0&&h<DAY_H1?(DAY_H1-DAY_H0)*3600/1440:(24-DAY_H1+DAY_H0)*3600/360)*m}
function setDayLen(v){if(!DAYLEN_MUL[v])return;dayLenPref=v;try{localStorage.setItem("fog-of-knowledge:game:daylen",v)}catch(_){}}
function setWeatherPref(v){weatherPref=v==="natural"?"natural":"calm";try{localStorage.setItem("fog-of-knowledge:game:weather",weatherPref)}catch(_){}if(world&&weatherPref==="calm"){world.snap=null;if(["rain","storm","drystorm"].includes(world.weather.kind)){world.weather.kind="clear";world.weather.next=null;world.weather.t=3*3600}}}
// saves from before the long-day build (no timeV) never start in the dark or the rain: jump to the next morning, clear skies
function migrateTime(w){if(!w)return w;if(!w.timeV){const h=((w.gameTime||0)/3600)%24;if(h>=17||h<7)w.gameTime=(Math.floor((w.gameTime||0)/86400)+(h>=17?1:0))*86400+8*3600;w.timeV=2;w.weather={kind:"clear",t:3*3600,amt:0}}
  if(weatherPref==="calm"&&w.weather&&["rain","storm","drystorm"].includes(w.weather.kind))w.weather={kind:"clear",t:3*3600,amt:0};return w}
const CHUNK=64, VIEW=6, OBJ_VIEW=3, NEAR_LOD=2;
const WD=new Map(WORLD_DISCOVERIES.map(d=>[d.id,d]));

/* ---------------- seeded noise ---------------- */
function mulberry(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function hash3(a,b,c){let h=2166136261^a;h=Math.imul(h^b,16777619);h=Math.imul(h^c,16777619);h^=h>>>13;h=Math.imul(h,0x5bd1e995);return(h^h>>>15)>>>0}
function makeNoise(seed){
  const r=mulberry(seed),p=new Uint8Array(512),perm=[...Array(256).keys()];
  for(let i=255;i>0;i--){const j=Math.floor(r()*(i+1));[perm[i],perm[j]]=[perm[j],perm[i]]}
  for(let i=0;i<512;i++)p[i]=perm[i&255];
  const gx=[1,-1,1,-1,1,-1,0,0],gy=[1,1,-1,-1,0,0,1,-1],F2=.5*(Math.sqrt(3)-1),G2=(3-Math.sqrt(3))/6;
  return function(x,y){
    const s=(x+y)*F2,i=Math.floor(x+s),j=Math.floor(y+s),t=(i+j)*G2,x0=x-i+t,y0=y-j+t;
    const i1=x0>y0?1:0,j1=1-i1,x1=x0-i1+G2,y1=y0-j1+G2,x2=x0-1+2*G2,y2=y0-1+2*G2,ii=i&255,jj=j&255;
    let n=0,tt;
    tt=.5-x0*x0-y0*y0;if(tt>0){const g=p[ii+p[jj]]&7;tt*=tt;n+=tt*tt*(gx[g]*x0+gy[g]*y0)}
    tt=.5-x1*x1-y1*y1;if(tt>0){const g=p[ii+i1+p[jj+j1]]&7;tt*=tt;n+=tt*tt*(gx[g]*x1+gy[g]*y1)}
    tt=.5-x2*x2-y2*y2;if(tt>0){const g=p[ii+1+p[jj+1]]&7;tt*=tt;n+=tt*tt*(gx[g]*x2+gy[g]*y2)}
    return 70*n;
  };
}
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};
const clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;

/* ---------------- world definition ---------------- */
let N1,N2,N3,N4,N5;
function initNoise(seed){N1=makeNoise(seed);N2=makeNoise(seed^0x9e3779b9);N3=makeNoise(seed^0x85ebca6b);N4=makeNoise(seed^0xc2b2ae35);N5=makeNoise(seed^0x27d4eb2f)}
function fbm(n,x,z,oct){let a=1,f=1,s=0,w=0;for(let i=0;i<oct;i++){s+=a*n(x*f,z*f);w+=a;a*=.5;f*=2.03}return s/w}
function heightAt(x,z){
  const cont=fbm(N1,x*.0006,z*.0006,4)+.18;
  let h=cont*70;
  const ridge=1-Math.abs(fbm(N2,x*.0022,z*.0022,4));
  h+=Math.pow(ridge,3)*190*smooth(.12,.55,cont);
  h+=fbm(N3,x*.012,z*.012,3)*5;
  if(h>-1){const rv=Math.abs(N4(x*.0011+31.7,z*.0011-17.3));const k=smooth(.015,.06,rv);h=lerp(Math.min(h,-2.2),h,k*(1-smooth(60,110,h))+smooth(60,110,h))}
  return h;
}
function climate(x,z,h){
  const t=16+fbm(N5,x*.0004,z*.0004,3)*16-.0065*Math.max(0,h);
  const m=fbm(N3,x*.0013+100,z*.0013-50,3);
  return {t,m};
}
function biomeAt(x,z,h){
  if(h<0)return "water";
  const {t,m}=climate(x,z,h);
  if(h<1.6)return t>24&&m<-.1?"desert":"beach";
  if(t<1||h>150)return "snow";
  if(h>95)return "rock";
  if(t>23&&m<-.12)return "desert";
  if(m>.04)return "forest";
  return "grass";
}
const BIOME_COL={water:0x5a5240,beach:0xdccb8f,desert:0xd2b479,snow:0xeef3f7,rock:0x7c766d,forest:0x3c6a2b,grass:0x6a9a3e};
function slopeAt(x,z){const e=1.5;return Math.hypot(heightAt(x+e,z)-heightAt(x-e,z),heightAt(x,z+e)-heightAt(x,z-e))/(2*e)}

/* ---------------- three.js scene ---------------- */
let renderer,scene,camera,moonMesh,clock,birds;
const chunks=new Map();
const MAT=GFX.MAT,GEO=GFX.GEO;
function initScene(container){
  GFX.initGfx(container,GFX.loadQualityPref());GFX.initMaterials();
  renderer=GFX.renderer;scene=GFX.scene;camera=GFX.camera;moonMesh=GFX.moonMesh;
  clock=new THREE.Clock();GFX.loadHuman();birds=createBirds(scene,heightAt);
}

/* ---------------- chunks: terrain + instanced objects ---------------- */
const RES_TYPES={
  grass:[["stick",.22],["fiber",.22],["berry_red",.07],["berry_dark",.08],["seeds",.16],["flint",.1],["stone",.1],["pyrite",.03],["clay",.02]],
  forest:[["stick",.34],["fiber",.1],["berry_dark",.1],["berry_red",.09],["flint",.08],["stone",.08],["pyrite",.05],["seeds",.03],["clay",.03]],
  desert:[["stone",.28],["sand",.3],["quartz",.06],["copper_ore",.12],["flint",.12],["tin_ore",.05],["iron_ore",.07]],
  rock:[["stone",.25],["quartz",.12],["copper_ore",.13],["tin_ore",.09],["iron_ore",.13],["lodestone",.06],["pyrite",.08],["flint",.14]],
  snow:[["stone",.35],["quartz",.15],["iron_ore",.15],["lodestone",.07],["flint",.15],["tin_ore",.08],["pyrite",.05]],
  beach:[["sand",.45],["stick",.15],["clay",.28],["stone",.12]]
};
function pickWeighted(list,r){let s=0;for(const [,w] of list)s+=w;let x=r*s;for(const [k,w] of list){x-=w;if(x<=0)return k}return list[0][0]}
function chunkKey(cx,cz){return cx+","+cz}
function genObjects(cx,cz){
  const rnd=mulberry(hash3(world.seed,cx+1e5,cz+7e5)),x0=cx*CHUNK,z0=cz*CHUNK;
  const trees=[],res=[],boulders=[];
  for(let i=0;i<80;i++){
    const x=x0+rnd()*CHUNK,z=z0+rnd()*CHUNK,h=heightAt(x,z),b=biomeAt(x,z,h),r=rnd();
    const dens={forest:.8,grass:.1,snow:h<165?.22:0,rock:.04,desert:.015,beach:0,water:0}[b];
    if(r<dens&&slopeAt(x,z)<.9)trees.push({x,y:h,z,s:.8+rnd()*.7,kind:b==="snow"||b==="rock"||(b==="forest"&&rnd()<.35)?"conifer":b==="desert"?"dead":"broad",i:trees.length});
  }
  for(let i=0;i<7;i++){const x=x0+rnd()*CHUNK,z=z0+rnd()*CHUNK,h=heightAt(x,z),b=biomeAt(x,z,h);if(b!=="water"&&rnd()<(b==="rock"||b==="snow"?.8:.4))boulders.push({x,y:h,z,s:.9+rnd()*1.1,i:boulders.length})}
  for(let i=0;i<30;i++){
    const x=x0+rnd()*CHUNK,z=z0+rnd()*CHUNK,h=heightAt(x,z);let b=biomeAt(x,z,h);if(b==="water")continue;
    let type=pickWeighted(RES_TYPES[b]||RES_TYPES.grass,rnd());
    if(h<4&&b!=="beach"&&rnd()<.35)type="clay";
    if(h>45&&b!=="snow"&&rnd()<.18)type=rnd()<.5?"iron_ore":"copper_ore";
    res.push({type,x,y:h,z,i:res.length});
  }
  // Guaranteed deposits: every 3×3 block of chunks holds one cluster of each key resource, so nothing a
  // discovery needs is ever more than ~2 chunks (≈130 m) from anywhere on land. Appended after the random
  // resources so older saves keep their indices.
  const DEP=["copper_ore","tin_ore","iron_ore","lodestone","quartz","sand","clay","pyrite","flint"];
  const lat=(((cx%3)+3)%3)*3+(((cz%3)+3)%3),dtype=DEP[(lat+world.seed%9)%9],rd=mulberry(hash3(world.seed,cx*7+3,cz*13+5));
  for(let tries=0;tries<16;tries++){const x=x0+5+rd()*(CHUNK-10),z=z0+5+rd()*(CHUNK-10),h=heightAt(x,z);if(h<.8||slopeAt(x,z)>.75)continue;
    const n=3+Math.floor(rd()*2);for(let k=0;k<n;k++){const xx=x+(rd()-.5)*3.2,zz=z+(rd()-.5)*3.2;res.push({type:dtype,x:xx,y:heightAt(xx,zz),z:zz,i:res.length,dep:true})}
    if(dtype!=="sand"&&dtype!=="clay")boulders.push({x:x+2.2,y:heightAt(x+2.2,z),z,s:.75,i:boulders.length,dep:true});
    break}
  // marvels: shells on beaches, feathers in meadows, leaves in woods, snow up high — nothing needs them; they're for wonder
  const rm=mulberry(hash3(world.seed,cx*31+7,cz*17+11));for(let k=0;k<3;k++){const x=x0+rm()*CHUNK,z=z0+rm()*CHUNK,h=heightAt(x,z),b=biomeAt(x,z,h),t={beach:"shell",grass:"feather",forest:"leaf",snow:"snow"}[b];
    if(t&&rm()<(t==="feather"?.5:.8))res.push({type:t,x,y:h,z,i:res.length,marvel:true})}
  // Independent appended stream preserves all existing resource and save IDs.
  const rf=mulberry(hash3(world.seed,cx+8191,cz-131071));
  for(let iz=0;iz<CHUNK;iz+=5)for(let ix=0;ix<CHUNK;ix+=5){
    const x=x0+ix+1+rf()*3,z=z0+iz+1+rf()*3,h=heightAt(x,z),b=biomeAt(x,z,h);
    if(h>.5&&(b==="grass"||b==="forest")&&slopeAt(x,z)<.7)
      res.push({type:"fiber",flower:true,x,y:h,z,i:res.length});
  }
  return {trees,res,boulders};
}
const BI={water:0,beach:1,desert:2,snow:3,rock:4,forest:5,grass:6},BN=Object.keys(BI);
function buildTerrain(cx,cz,res){
  const n=res+3,pos=new Float32Array(n*n*3),col=new Float32Array(n*n*3),nor=new Float32Array(n*n*3),c=new THREE.Color(),step=CHUNK/res;
  const grid=res>16?{res,step,h:new Float32Array((res+1)*(res+1)),b:new Uint8Array((res+1)*(res+1))}:null;
  let k=0;
  for(let j=-1;j<=res+1;j++)for(let i=-1;i<=res+1;i++){
    const ii=clamp(i,0,res),jj=clamp(j,0,res),x=cx*CHUNK+ii*step,z=cz*CHUNK+jj*step;
    let h=heightAt(x,z);const b=biomeAt(x,z,h);
    const e=.8,hx=heightAt(x+e,z)-heightAt(x-e,z),hz=heightAt(x,z+e)-heightAt(x,z-e),nl=Math.hypot(hx,2*e,hz),sl=Math.hypot(hx,hz)/(2*e);
    c.setHex(BIOME_COL[b]);
    if(sl>1.1&&b!=="water")c.setHex(0x7a7268);
    const v=(hash3(Math.floor(x/3),Math.floor(z/3),3)%1000)/1000*.06-.03;c.r+=v*c.r;c.g+=v*c.g;c.b+=v*c.b;
    if(grid&&i===ii&&j===jj){grid.h[jj*(res+1)+ii]=h;grid.b[jj*(res+1)+ii]=BI[b]}
    if(i!==ii||j!==jj)h-=4; // skirt hides LOD cracks
    pos[k*3]=x;pos[k*3+1]=h;pos[k*3+2]=z;col[k*3]=c.r;col[k*3+1]=c.g;col[k*3+2]=c.b;nor[k*3]=-hx/nl;nor[k*3+1]=2*e/nl;nor[k*3+2]=-hz/nl;k++;
  }
  const idx=[];for(let j=0;j<n-1;j++)for(let i=0;i<n-1;i++){const a=j*n+i,b=a+1,d=a+n,e=d+1;idx.push(a,d,b,b,d,e)}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(pos,3));g.setAttribute("color",new THREE.BufferAttribute(col,3));g.setAttribute("normal",new THREE.BufferAttribute(nor,3));g.setIndex(idx);
  g.computeBoundingSphere();
  const m=new THREE.Mesh(g,MAT.terrain);m.receiveShadow=true;m.castShadow=res>16;m.userData.grid=grid;return m;
}
function grassSampler(ch){const G=ch.terrain&&ch.terrain.userData.grid;if(!G)return null;const x0=ch.cx*CHUNK,z0=ch.cz*CHUNK,R=G.res+1,clearings=world.structures.filter(s=>s.type==="fire"&&s.x>x0-2&&s.x<x0+CHUNK+2&&s.z>z0-2&&s.z<z0+CHUNK+2);
  return (x,z)=>{const fx=clamp((x-x0)/G.step,0,G.res-.001),fz=clamp((z-z0)/G.step,0,G.res-.001),i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j;
    const a=G.h[j*R+i],b=G.h[j*R+i+1],c=G.h[(j+1)*R+i],d=G.h[(j+1)*R+i+1];
    const h=(a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v,sl=Math.max(Math.abs(b-a),Math.abs(c-a),Math.abs(d-b))/G.step;
    return {h,biome:clearings.some(s=>Math.hypot(s.x-x,s.z-z)<(s._clearRadius||1.1))?"rock":BN[G.b[Math.round(fz)*R+Math.round(fx)]],slope:sl}}}
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_s=new THREE.Vector3(),_p=new THREE.Vector3(),_e=new THREE.Euler(),_c=new THREE.Color();
const ZERO=new THREE.Matrix4().makeScale(0,0,0);
function setInst(mesh,i,x,y,z,sx,sy,sz,ry=0,rx=0){_e.set(rx,ry,0);_q.setFromEuler(_e);_p.set(x,y,z);_s.set(sx,sy,sz);_m.compose(_p,_q,_s);mesh.setMatrixAt(i,_m)}
const TREE_TYPES=["conifer","broad","palm","dead"],TREE_GEO={conifer:["pineTrunk","pineCrown"],broad:["broadTrunk","broadCrown"],palm:["palmTrunk","palmCrown"],dead:["deadTrunk",null]};
function treeVis(t){if(t.vis)return t.vis;let v=t.kind;if(v==="broad"&&t.y<7&&climate(t.x,t.z,t.y).t>19)v="palm";t.vis=v;return v}
function buildObjects(ch){
  const o=ch.obj,grp=new THREE.Group(),key=ch.key;
  const T=o.trees.length;ch.tr={};ch.cr={};
  for(const ty of TREE_TYPES){const [tg,cg]=TREE_GEO[ty];
    const tm=new THREE.InstancedMesh(GEO[tg],MAT.bark,Math.max(1,T));tm.count=T;tm.castShadow=tm.receiveShadow=true;ch.tr[ty]=tm;
    if(cg){const cm=new THREE.InstancedMesh(GEO[cg],MAT.leaf,Math.max(1,T));cm.count=T;cm.castShadow=cm.receiveShadow=true;ch.cr[ty]=cm}}
  o.trees.forEach(t=>refreshTree(ch,t,true));
  ch.boulders=new THREE.InstancedMesh(GEO.boulder,MAT.rock,Math.max(1,o.boulders.length));ch.boulders.count=o.boulders.length;
  o.boulders.forEach(b=>{const mv=world.moved[key+"|"+b.i];if(mv){b.x=mv[0];b.z=mv[1];b.y=heightAt(b.x,b.z)}setInst(ch.boulders,b.i,b.x,b.y+b.s*.35,b.z,b.s*1.2,b.s*.8,b.s,b.i);const v=.85+(b.i*37%10)/40;_c.setRGB(v,v,v*.97);ch.boulders.setColorAt(b.i,_c)});
  const smalls=o.res.filter(r=>!r.flower&&!["stick","fiber","seeds","berry_red","berry_dark"].includes(r.type));
  const sticks=o.res.filter(r=>r.type==="stick"),plants=o.res.filter(r=>!r.flower&&["fiber","seeds","berry_red","berry_dark"].includes(r.type)),flowers=o.res.filter(r=>r.flower);
  ch.small=new THREE.InstancedMesh(GEO.small,MAT.rock,Math.max(1,smalls.length));ch.small.count=smalls.length;
  ch.sticks=new THREE.InstancedMesh(GEO.stick,MAT.bark,Math.max(1,sticks.length));ch.sticks.count=sticks.length;
  ch.plants=new THREE.InstancedMesh(GEO.tuft,MAT.leaf,Math.max(1,plants.length));ch.plants.count=plants.length;
  ch.flowers=new THREE.InstancedMesh(GEO.flower,MAT.flower,Math.max(1,flowers.length));ch.flowers.count=flowers.length;
  flowers.forEach((r,j)=>{r.mesh=ch.flowers;r.slot=j;setInst(ch.flowers,j,r.x,r.y-.02,r.z,1.3,1.5+(r.i%5)*.12,1.3,r.i);_c.setHex([0xffffff,0xffd84a,0xb48cff,0xff6a7a,0x8ac8ff][r.i%5]);ch.flowers.setColorAt(j,_c)});
  smalls.forEach((r,j)=>{r.mesh=ch.small;r.slot=j;const s=r.marvel?.11:r.type==="clay"?.28:r.type==="sand"?.3:.17;setInst(ch.small,j,r.x,r.y+s*.4,r.z,s,s*.7,s,r.i);_c.setHex(ITEMS[r.type].color);ch.small.setColorAt(j,_c)});
  sticks.forEach((r,j)=>{r.mesh=ch.sticks;r.slot=j;setInst(ch.sticks,j,r.x,r.y+.05,r.z,.9,1,1,r.i)});
  plants.forEach((r,j)=>{r.mesh=ch.plants;r.slot=j;const berry=r.type.startsWith("berry");setInst(ch.plants,j,r.x,r.y-.05,r.z,berry?.55:.32,berry?.5:.42,berry?.55:.32,r.i);_c.setHex(berry?(r.type==="berry_red"?0xc04848:0x5a5ac0):r.type==="seeds"?0xd8c46a:0x9ccc5a);ch.plants.setColorAt(j,_c)});
  for(const r of o.res)if(world.removed.has(key+"|r"+r.i)){r.gone=true;r.mesh.setMatrixAt(r.slot,ZERO)}
  // decorative bushes (visual only, own random stream)
  const rd=mulberry(hash3(world.seed,ch.cx+31337,ch.cz-4242)),bl=[];
  for(let i=0;i<34;i++){const x=ch.cx*CHUNK+rd()*CHUNK,z=ch.cz*CHUNK+rd()*CHUNK,h=heightAt(x,z),b=biomeAt(x,z,h);if((b==="forest"&&rd()<.8)||(b==="grass"&&rd()<.35)||(b==="beach"&&rd()<.1))bl.push([x,h,z,.45+rd()*.7,b])}
  ch.bushes=new THREE.InstancedMesh(GEO.bush,MAT.bush,Math.max(1,bl.length));ch.bushes.count=bl.length;ch.bushes.castShadow=true;ch.bushes.receiveShadow=true;
  bl.forEach(([x,h,z,s,b],j)=>{setInst(ch.bushes,j,x,h-.1,z,s*1.2,s,s*1.2,j*1.7);_c.setRGB(b==="forest"?.16:.28,b==="forest"?.33:.42,b==="forest"?.12:.14);ch.bushes.setColorAt(j,_c)});
  const all=[...Object.values(ch.tr),...Object.values(ch.cr),ch.boulders,ch.small,ch.sticks,ch.plants,ch.flowers,ch.bushes];
  for(const m of all){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();m.receiveShadow=true;if(m!==ch.small&&m!==ch.sticks)m.castShadow=true;grp.add(m)}
  ch.group=grp;scene.add(grp);
}
function refreshTree(ch,t,init){
  const key=ch.key+"|t"+t.i,vis=treeVis(t);
  const hideAll=()=>{for(const ty of TREE_TYPES){ch.tr[ty].setMatrixAt(t.i,ZERO);if(ch.cr[ty])ch.cr[ty].setMatrixAt(t.i,ZERO)}};
  if(world.removed.has(key)){t.gone=true;hideAll()}
  else{
    const burnt=world.burnt.has(key);t.burnt=burnt;const rot=t.i*2.39996,s=t.s,sy=s*(.9+((t.i*7)%5)*.05);
    for(const ty of TREE_TYPES){
      if(ty!==vis){ch.tr[ty].setMatrixAt(t.i,ZERO);if(ch.cr[ty])ch.cr[ty].setMatrixAt(t.i,ZERO);continue}
      setInst(ch.tr[ty],t.i,t.x,t.y-.15,t.z,s,sy,s,rot);_c.setRGB(burnt?.12:1,burnt?.1:1,burnt?.09:1);ch.tr[ty].setColorAt(t.i,_c);
      const cm=ch.cr[ty];if(!cm)continue;
      if(burnt){cm.setMatrixAt(t.i,ZERO);continue}
      setInst(cm,t.i,t.x,t.y-.15,t.z,s,sy,s,rot);
      const v=.86+((t.i*13)%7)*.045,snow=biomeAt(t.x,t.z,t.y)==="snow";
      if(t.burning)_c.setRGB(2.4,.9,.3);else if(snow)_c.setRGB(1.25*v,1.32*v,1.4*v);else _c.setRGB(v,v*(.95+((t.i*5)%3)*.04),v*.9);
      cm.setColorAt(t.i,_c)}
  }
  for(const m of [...Object.values(ch.tr),...Object.values(ch.cr)]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true}
}
function disposeChunk(ch){if(ch.grass){GFX.disposeGroup(ch.grass);ch.grass=null}if(ch.terrain){scene.remove(ch.terrain);ch.terrain.geometry.dispose()}if(ch.group){scene.remove(ch.group);for(const m of ch.group.children)m.dispose?.()}}
let lastChunkUpdate=0;
function updateChunks(force){
  const px=Math.floor(player.pos.x/CHUNK),pz=Math.floor(player.pos.z/CHUNK);let built=0;const budget=force?999:2;
  const want=[];let grassBuilt=force?-99:0;
  for(let dz=-VIEW;dz<=VIEW;dz++)for(let dx=-VIEW;dx<=VIEW;dx++){const d=Math.max(Math.abs(dx),Math.abs(dz));if(d*d>VIEW*VIEW+2)continue;want.push([px+dx,pz+dz,d])}
  want.sort((a,b)=>a[2]-b[2]);
  const keep=new Set();
  for(const [cx,cz,d] of want){
    const key=chunkKey(cx,cz);keep.add(key);let ch=chunks.get(key);
    if(!ch){ch={key,cx,cz,lod:-1};chunks.set(key,ch)}
    const lod=d<=NEAR_LOD?32:10;
    if(ch.lod!==lod&&built<budget){if(ch.terrain){scene.remove(ch.terrain);ch.terrain.geometry.dispose()}ch.terrain=buildTerrain(cx,cz,lod);scene.add(ch.terrain);ch.lod=lod;built++}
    if(d<=OBJ_VIEW&&!ch.group&&built<budget){ch.obj=ch.obj||genObjects(cx,cz);buildObjects(ch);built++}
    if(d>OBJ_VIEW+1&&ch.group){scene.remove(ch.group);for(const m of ch.group.children)m.dispose?.();ch.group=null}
    if(GFX.Q.grass&&d<=GFX.Q.grassR&&!ch.grass&&ch.lod===32&&grassBuilt<1){const smp=grassSampler(ch);if(smp){ch.grass=GFX.buildGrass(cx,cz,CHUNK,smp,hash3(world.seed,cx,cz));if(ch.grass)scene.add(ch.grass);grassBuilt++}}
    if(ch.grass&&(d>GFX.Q.grassR+1||!GFX.Q.grass)){GFX.disposeGroup(ch.grass);ch.grass=null}
  }
  for(const [key,ch] of chunks)if(!keep.has(key)){disposeChunk(ch);chunks.delete(key)}
}
function nearbyChunks(x,z,r){const out=[];const a=Math.floor((x-r)/CHUNK),b=Math.floor((x+r)/CHUNK),c=Math.floor((z-r)/CHUNK),d=Math.floor((z+r)/CHUNK);for(let cx=a;cx<=b;cx++)for(let cz=c;cz<=d;cz++){const ch=chunks.get(chunkKey(cx,cz));if(ch&&ch.group)out.push(ch)}return out}

/* ---------------- state ---------------- */
let world=null, player=null, atlas=null, paused=true, started=false;
function freshKS(){return {known:[],revealed:[],fields:[],era:0,studyField:"auto",studyPool:0,log:[],progress:{},recent:[],stats:{discoveries:0},turn:0,won:false,complete:false}}
function dryAround(x,z){for(const r of [6,12,18])for(let k=0;k<8;k++){const h=heightAt(x+Math.cos(k*.785)*r,z+Math.sin(k*.785)*r);if(h<1.2||h>40)return false}return true} // camp on dry, walkable ground
function newWorld(seed){
  seed=(seed>>>0)||((Math.random()*4294967296)>>>0);
  initNoise(seed);
  let sx=0,sz=0;
  for(let r=0;r<4000;r+=24){let ok=false;for(let a=0;a<12&&!ok;a++){const x=Math.cos(a/12*6.283)*r,z=Math.sin(a/12*6.283)*r,h=heightAt(x,z),b=biomeAt(x,z,h);if(h>3&&h<25&&(b==="grass"||b==="forest")&&slopeAt(x,z)<.35&&dryAround(x,z)){sx=x;sz=z;ok=true}}if(ok)break}
  return {v:1,seed,camp:[sx,sz],pos:[sx,heightAt(sx,sz)+.1,sz],yaw:0,cam:[0,.35,6],gameTime:8*3600,dayStart:8*3600,timeV:2,
    st:{health:100,hunger:85,thirst:85,stamina:100,tb:37,wet:0,sick:0,sprain:0},inv:{},held:null,worn:null,dur:{},seenQ:[],pets:[],observed:[],ideas:[],
    disc:[],counters:{falls:0,throws:[],nights:[],species:[],berries:[],tally:0,raftDist:0,lookT:0,warmFrom:0,boils:[],pend:[],drops:[],sick:0,packs:0,wolvesKilled:0,sleeps:0,strikes:0,deathsBy:{}},
    weather:{kind:"clear",t:3*3600,amt:0},structures:[],drops:[],removed:[],burnt:[],moved:{},ks:freshKS(),deaths:0};
}
function hydrate(w){w.removed=new Set(w.removed);w.burnt=new Set(w.burnt);
  // migrate older saves: fill in anything newer versions track
  const d=newWorldDefaults();for(const k of ["dur","seenQ","pets","observed","ideas","order","left"])if(w[k]===undefined)w[k]=d[k];
  w.counters={...d.counters,...(w.counters||{})};w.st={...d.st,...(w.st||{})};if(!w.weather.next)w.weather.next=null;return w}
function newWorldDefaults(){return {dur:{},seenQ:[],pets:[],observed:[],ideas:[],order:[],left:null,st:{health:100,hunger:85,thirst:85,stamina:100,tb:37,wet:0,sick:0,sprain:0},
  counters:{falls:0,throws:[],nights:[],species:[],berries:[],tally:0,raftDist:0,lookT:0,warmFrom:0,boils:[],pend:[],drops:[],sick:0,packs:0,wolvesKilled:0,sleeps:0,strikes:0,deathsBy:{}}}}
function serialize(){const o={...world,removed:[...world.removed].slice(-6000),burnt:[...world.burnt].slice(-3000),pos:[player.pos.x,player.pos.y,player.pos.z],yaw:player.yaw,cam:[player.camYaw,player.camPitch,player.camDist]};
  o.structures=world.structures.map(s=>{const c={...s};delete c.obj;delete c.light;delete c.flame;delete c.residue;delete c.wood;delete c.shadow;delete c.arm;for(const k of Object.keys(c))if(k[0]==="_")delete c[k];return c});
  o.drops=world.drops.filter(d=>!d.flying).slice(-120).map(d=>({item:d.item,x:d.pos.x,y:d.pos.y,z:d.pos.z,n:d.n||1}));
  o.ks={...world.ks};delete o.ks._k;delete o.ks._r;return JSON.stringify(o)}
function save(){try{localStorage.setItem(SAVE_KEY,serialize())}catch(_){toast("Could not save (storage full or blocked)")}}
function loadSave(){try{const s=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");if(s&&s.v===1)return s}catch(_){}return null}

/* ---------------- props ---------------- */
function box(w,h,d,col,y=0){const g=new THREE.BoxGeometry(w,h,d);g.translate(0,y,0);const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:col,roughness:.85}));m.castShadow=m.receiveShadow=true;return m}
const makeHuman=GFX.makeHuman,animateHuman=GFX.animateHuman;
const BURN=new Set(["fire","kiln","torch"]),MEATS=new Set(["meat_raw","meat_cooked","meat_dried"]);
const EXPERIMENTS=new Set(["gravity","motion","buoyancy","pendulum","freefall","prism","galilean","telescope","pressure","boiling","lightning","compass","magnetism","lever","sundial","optics","astronomy","evaporative","warmth","impact","combustion"]);
/* ---------------- animals ---------------- */
const SPECIES={
  rabbit:{biomes:["grass","forest","snow"],col:0xb8a58a,size:.35,hp:30,speed:7,meat:1,hide:0,hear:25},
  deer:{biomes:["grass","forest"],col:0x9a6b3e,size:1,hp:140,speed:9,meat:3,hide:2,hear:30},
  boar:{biomes:["forest"],col:0x4e3b2e,size:.8,hp:180,speed:6,meat:3,hide:1,hear:32,bold:true},
  goat:{biomes:["rock","snow"],col:0xd8d2c4,size:.75,hp:110,speed:7,meat:2,hide:1,hear:30},
  wolf:{biomes:["forest","snow","grass"],col:0x6a6a70,size:.8,hp:120,speed:8.2,meat:1,hide:1,hear:28,predator:true},
  dog:{biomes:[],col:0xb08a5a,size:.75,hp:220,speed:9,meat:0,hide:0,hear:40,friendly:true}
};
const animals=[];
function makeAnimal(kind){
  const sp=SPECIES[kind],{g,legs}=GFX.makeAnimalModel(kind==="dog"?"wolf":kind,sp.col,sp.size);
  return {kind,sp,g,legs,hp:sp.hp,pos:new THREE.Vector3(),vel:new THREE.Vector3(),target:null,flee:0,phase:Math.random()*6,attackCd:0,tame:0,calm:0,ang:Math.random()*6.283,dir:Math.random()<.5?1:-1};
}
function addAnimal(kind,x,z){const a=makeAnimal(kind);a.pos.set(x,heightAt(x,z),z);a.g.position.copy(a.pos);scene.add(a.g);animals.push(a);if(kind==="dog")tintDog(a);return a}
function tintDog(a){const c=new THREE.Color(0xc89a62);a.g.traverse(o=>{if(o.isMesh&&o.material&&o.material.color){o.material=o.material.clone();o.material.color.lerp(c,.55)}})}
function dayNum(){return Math.floor(world.gameTime/86400)}
function packSize(){return Math.min(6,2+Math.floor(dayNum()/2)+Math.min(2,world.ks.era))}
const isNight=()=>sunElevation()<-.05;
function spawnAnimals(dt){
  for(let i=animals.length-1;i>=0;i--){const a=animals[i];if(a.kind==="dog"&&!a.dead)continue;const d=a.pos.distanceTo(player.pos);
    if(d>230||a.dead>4||(a.leaving&&d>110)){scene.remove(a.g);animals.splice(i,1)}}
  const h=hourOf(),night=isNight(),C=world.counters;
  // night packs: a warning howl at dusk, then a hunting pack that grows with the days and your age
  if(night&&h>=18.3&&C.howled!==dayNum()+1){C.howled=dayNum()+1;AU.howl(120);toast("Wolves howl somewhere in the dark. They hunt at night — but they fear fire.")}
  const wolves=animals.filter(a=>a.kind==="wolf"&&a.pack&&!a.dead).length;   // roaming (non-pack) wolves no longer suppress the night pack
  if(night&&wolves<2&&(h>=(dayNum()===0?21:19.5)||h<4.5)&&Math.random()<dt*.02*(1+dayNum()*.25)){
    const ang=Math.random()*6.283,n=packSize();let made=0;
    for(let k=0;k<n*5&&made<n;k++){const r=70+Math.random()*30,aa=ang+(Math.random()-.5)*.7,x=player.pos.x+Math.cos(aa)*r,z=player.pos.z+Math.sin(aa)*r;if(heightAt(x,z)>.6&&!nearLight(x,z,4)){addAnimal("wolf",x,z).pack=true;made++}}
    if(made){C.packs++;AU.howl(80);toast(SURV()?`A pack of ${made} wolves is hunting nearby. Stay in the firelight — or fight.`:`${made} wolves pad through the dark at a wary distance. Watch their eyes shine at the edge of your firelight.`)}
  }
  if(!night)for(const a of animals)if(a.kind==="wolf"&&a.pack)a.leaving=true;
  if(animals.filter(a=>!a.pack&&a.kind!=="dog").length>=10||Math.random()>dt*1.5)return;
  const ang=Math.random()*6.283,r=60+Math.random()*90,x=player.pos.x+Math.cos(ang)*r,z=player.pos.z+Math.sin(ang)*r,hh=heightAt(x,z),b=biomeAt(x,z,hh);
  if(hh<.5)return;
  const kinds=Object.keys(SPECIES).filter(k=>SPECIES[k].biomes.includes(b)&&(!SPECIES[k].predator||b==="snow"||(night&&Math.random()<.3)));
  if(!kinds.length)return;
  addAnimal(kinds[Math.floor(Math.random()*kinds.length)],x,z);
}
function playerNoiseDb(){ // sound level at 1 m, dB — crouching (C) is quiet, running is loud
  const sp=Math.hypot(player.vel.x,player.vel.z);if(player.swimming)return 50;if(player.crouch)return sp>.3?26:16;return sp>3.5?58:sp>.5?42:22}
function lightR(s){return s.type==="torch"?8:s.type==="kiln"?7:10}
function lightGuard(x,z){let best=null;for(const s of world.structures){if(!s.lit)continue;const r=lightR(s),d=Math.hypot(s.x-x,s.z-z);if(d<r&&(!best||d/r<best.d/best.r))best={s,d,r}}return best}
function nearLight(x,z,pad){for(const s of world.structures){if(!s.lit)continue;if(Math.hypot(s.x-x,s.z-z)<lightR(s)+(pad||0))return s}return null}
function wander(a,dt){if(!a.target||a.pos.distanceTo(a.target)<1.5||Math.random()<dt*.05){const t=a.pos.clone();t.x+=(Math.random()-.5)*30;t.z+=(Math.random()-.5)*30;a.target=t}}
function stepWolf(a,dt,d,night){
  const P=player.pos;
  if(a.calm>0){a.target=d>3?P.clone():a.pos.clone();return d>3?2:0}
  if(!SURV())return waryWolf(a,dt,d,night);
  const L=nearLight(a.pos.x,a.pos.z,-.5);
  if(L){const away=a.pos.clone().sub(new THREE.Vector3(L.x,a.pos.y,L.z)).setY(0).normalize();a.target=a.pos.clone().addScaledVector(away,6);return a.sp.speed*.7}
  if(a.flee>0||a.leaving){a.flee-=dt;const away=a.pos.clone().sub(P).setY(0).normalize();a.target=a.pos.clone().addScaledVector(away,10);return a.leaving&&a.flee<=0?a.sp.speed*.6:a.sp.speed}
  const hunting=(a.pack&&night)||d<12;
  if(!hunting||player.dead){wander(a,dt);return 1.2}
  const guard=lightGuard(P.x,P.z),safe=guard||shelterLevel(P.x,P.z)>=2;
  if(safe){ // circle just outside the light, growling
    const c=guard?guard.s:{x:P.x,z:P.z},R=(guard?guard.r:3)+2.5;a.ang+=dt*.18*a.dir;a.target=new THREE.Vector3(c.x+Math.cos(a.ang)*R,0,c.z+Math.sin(a.ang)*R);
    if(d<30&&Math.random()<dt*.02)AU.growl();world.counters.wolfCircled=1;return 2.6}
  a.target=P.clone();
  if(d<1.7&&a.attackCd<=0){const dmg=7+Math.min(8,dayNum());hurt(dmg,"A wolf bites you","wolves");a.attackCd=1.5+Math.random()*.6;AU.growl()}
  return d>25?a.sp.speed*.7:a.sp.speed*.95;
}
// Discovery mode: wolves are wary wildlife. They keep their distance (closer at night, circling the dark edge of your light),
// and only a crouched, patient person holding food by a fire will draw one close enough to offer it.
const WOLF_FOOD=new Set(["meat_raw","meat_cooked","meat_dried","nuts_roasted","flatbread"]);
function waryWolf(a,dt,d,night){const P=player.pos,keep=night?11:18;
  const lure=player.crouch&&WOLF_FOOD.has(world.held)&&nearLight(P.x,P.z)&&d<35;
  if(lure&&d>2.3){a.target=P.clone();a.curious=1;return 1.4}if(lure){a.target=a.pos.clone();return 0}a.curious=0;
  if(d<keep){const away=a.pos.clone().sub(P).setY(0);if(away.lengthSq()<1e-4)away.set(1,0,0);away.normalize();a.target=a.pos.clone().addScaledVector(away,6);return d<keep*.6?a.sp.speed*.55:2}
  if(a.pack&&night&&d<45){a.ang+=dt*.12*a.dir;a.target=new THREE.Vector3(P.x+Math.cos(a.ang)*(keep+4),0,P.z+Math.sin(a.ang)*(keep+4));return 1.8}
  wander(a,dt);return 1.1}
let dogWarnT=0;
function stepDog(a,dt,d){
  const P=player.pos;
  if(d>60){const b=forward();a.pos.set(P.x-b.x*3,0,P.z-b.z*3);a.target=null;return 0}
  let foe=null,fd=16;for(const w of animals)if(w.kind==="wolf"&&!w.dead&&!w.calm){const dd=w.pos.distanceTo(P);if(dd<fd){fd=dd;foe=w}}
  dogWarnT-=dt;if(dogWarnT<=0)for(const w of animals)if(w.kind==="wolf"&&!w.dead&&w.pos.distanceTo(P)<40){toast("Your dog growls into the dark: wolves are close.");AU.growl();dogWarnT=40;break}
  if(foe){a.target=foe.pos.clone();if(a.pos.distanceTo(foe.pos)<1.6&&a.attackCd<=0){foe.hp-=40;foe.flee=5;a.attackCd=1;AU.growl();if(foe.hp<=0)killAnimal(foe)}return a.sp.speed}
  if(d>4){a.target=P.clone();return d>10?a.sp.speed*.8:2.4}
  if(!a.target||a.pos.distanceTo(a.target)<.8||Math.random()<dt*.1)a.target=P.clone().add(new THREE.Vector3((Math.random()-.5)*4,0,(Math.random()-.5)*4));
  return 1.1;
}
function updateAnimals(dt){
  const night=isNight(),rainMask=isRaining()?8:0,P=player.pos;
  for(const a of animals){
    if(a.dead){a.dead+=dt;continue}
    const d=a.pos.distanceTo(P);
    // inverse-square spreading: level drops 20·log10(r) dB
    const heard=playerNoiseDb()-20*Math.log10(Math.max(1,d))>(a.sp.hear-12)+rainMask,seen=!night&&d<(player.crouch?6:15);
    if(d<15&&a.kind!=="dog"&&!world.counters.species.includes(a.kind)){world.counters.species.push(a.kind);if(world.counters.species.length>=3)discover("tracking")}
    if(a.kind==="wolf"&&d<30)world.counters.wolfSeen=1;
    let speed=1.2;a.attackCd-=dt;a.calm=Math.max(0,a.calm-dt);
    if(a.kind==="dog")speed=stepDog(a,dt,d);
    else if(a.sp.predator)speed=stepWolf(a,dt,d,night);
    else if(((heard||seen)&&d<60)||a.flee>0){if(heard||seen)a.flee=Math.max(a.flee,4);a.flee-=dt;const away=a.pos.clone().sub(P).setY(0).normalize();a.target=a.pos.clone().addScaledVector(away,10);speed=a.sp.speed;
      if(a.sp.bold&&d<1.8&&a.attackCd<=0&&a.hp<a.sp.hp){hurt(7,"The wounded boar gores you","a boar");a.attackCd=2}}
    else wander(a,dt);
    if(!a.target)a.target=a.pos.clone();
    const dir=a.target.clone().sub(a.pos).setY(0);const len=dir.length();
    if(len>.2&&speed>0){dir.multiplyScalar(1/len);let moved=false;
      // steer around water / light edges instead of freezing at the shore (a pack across a lake used to stall forever)
      for(const off of [0,.6,-.6,1.2,-1.2,1.9,-1.9]){const o=off*a.dir,c=Math.cos(o),sn=Math.sin(o),dx=dir.x*c-dir.z*sn,dz=dir.x*sn+dir.z*c,nx=a.pos.x+dx*speed*dt,nz=a.pos.z+dz*speed*dt;
        const intoLight=a.kind==="wolf"&&a.calm<=0&&!a.curious&&nearLight(nx,nz)&&!nearLight(a.pos.x,a.pos.z);
        if(heightAt(nx,nz)>.2&&!intoLight){a.pos.x=nx;a.pos.z=nz;a.g.rotation.y=Math.atan2(dx,dz);moved=true;break}}
      if(!moved){a.target=null;a.dir=-a.dir}}
    collide(a.pos,.45);
    a.pos.y=heightAt(a.pos.x,a.pos.z);a.g.position.copy(a.pos);
    a.phase+=dt*speed*3;const sw=Math.min(1,speed/3)*.7;a.legs.forEach((l,i)=>l.rotation.x=Math.sin(a.phase+(i%2?Math.PI:0)+(i>1?Math.PI/2:0))*sw);const ud=a.g.userData;if(ud.head){ud.head.rotation.x=speed<1.5?.25+.2*Math.sin(a.phase*.3+a.pos.x):-.05;ud.tail.rotation.y=Math.sin(a.phase*2)*.4}
  }
}
function killAnimal(a){
  a.dead=.01;a.g.rotation.z=Math.PI/2;a.g.position.y+=.2;
  const drops={meat_raw:a.sp.meat,hide:a.sp.hide};
  for(const k in drops)for(let i=0;i<drops[k];i++)addDrop(k,a.pos.x+(Math.random()-.5),a.pos.y+.3,a.pos.z+(Math.random()-.5));
  if(a.kind==="wolf")world.counters.wolvesKilled++;
  toast(`You brought down a ${a.kind}.`);AU.hit(true);discover("hunting");
}
function feedWolf(a,k){
  if(!nearLight(player.pos.x,player.pos.z))return toast("The wolf won't come close out here. Try at the edge of your firelight.");
  take(k);a.tame++;a.calm=45;a.flee=0;AU.eat();
  if(a.tame>=2){world.dog={since:world.gameTime};const x=a.pos.x,z=a.pos.z;scene.remove(a.g);animals.splice(animals.indexOf(a),1);if(PETS)PETS.tame("dog",x,z);
    toast("The wolf lies down by your fire. You have a companion: it follows you, warns of danger and fights wolves.");discover("dog")}
  else toast("The wolf takes the food gently and backs off a little, watching you. Its ears are up — curious, not afraid.");
}
const isMelee=k=>k==="spear"||ITEMS[k]?.tool==="axe";
function melee(a,k){player.actCd=.6;GFX.playOnce(player.model,"Punch_Cross",.45);const dmg=k==="spear"?75:Math.round(45*(ITEMS[k].power||1));a.hp-=dmg;a.flee=a.sp.predator?3:6;AU.hit(true);
  toast(`You strike the ${a.kind} (${dmg} damage).`);if(ITEMS[k].tool)useTool(k,2);if(a.hp<=0)killAnimal(a)}

/* ---------------- items, drops & projectiles ---------------- */
/* inventory: one entry per item type, stacks of STACK, BASE_SLOTS grid slots (+SATCHEL_SLOTS with a hide satchel); no weight penalty.
   world.order = grid/hotbar order of item types; world.held = RIGHT hand, world.left = LEFT hand (both point at carried stacks). */
const STACK=99,BASE_SLOTS=60,SATCHEL_SLOTS=30;
let activeHand="R";
function selectHand(side){activeHand=side==="L"?"L":"R";renderHotbar();renderInventory()}
function toggleHand(){selectHand(activeHand==="R"?"L":"R");toast(`${activeHand==="L"?"Left":"Right"} hand selected — 1–0 or click a hotbar item to equip. Q uses this hand.`)}
// Legacy actions use held. Adapt only at the input boundary; consumption and
// item replacements return to the correct physical hand, including on errors.
function withActiveHand(action){if(activeHand!=="L")return action();const r=world.held;world.held=world.left;world.left=r;
 try{return action()}finally{const l=world.held;world.held=world.left;world.left=l;renderHotbar()}}

function inv(k){return world.inv[k]||0}
const capacity=()=>BASE_SLOTS+(world&&world.inv.satchel?SATCHEL_SLOTS:0);
const slotsUsed=()=>Object.values(world.inv).reduce((a,n)=>a+Math.ceil(n/STACK),0);
function roomFor(k){const c=inv(k),free=(capacity()-slotsUsed())*STACK+(c?Math.ceil(c/STACK)*STACK-c:0);return Math.max(0,free)}
function ordered(){const o=(world.order||(world.order=[])).filter((k,i,a)=>world.inv[k]&&a.indexOf(k)===i);for(const k of Object.keys(world.inv))if(!o.includes(k))o.push(k);world.order=o;return o}
function hotbarItems(){return quickbarOrder(ordered(),world.inv)}
function give(k,n=1){if(!ITEMS[k]||n<=0)return 0;const fit=Math.min(n,roomFor(k)+(k==="satchel"&&!inv("satchel")?SATCHEL_SLOTS*STACK:0));
  if(fit>0){world.inv[k]=(world.inv[k]||0)+fit;ordered();if(!world.held&&world.left!==k)world.held=k}
  if(fit<n&&player){const f=forward();dropSpawn(k,n-fit,f);toast(`Your pack is full (${capacity()} slots) — ${n-fit}× ${ITEMS[k].name} fell at your feet.`)}
  renderHotbar();return fit}
function take(k,n=1){if(inv(k)<n)return false;world.inv[k]-=n;if(world.inv[k]===1&&world.held===k&&world.left===k)world.held=null;if(world.inv[k]<=0){delete world.inv[k];if(world.left===k)world.left=null;if(world.held===k)world.held=ordered().find(x=>x!==world.left)||null}renderHotbar();return true}
function setHand(side,k){if(k&&!inv(k))return false;const other=side==="L"?"held":"left",me=side==="L"?"left":"held";if(k&&world[other]===k&&inv(k)<2)world[other]=null;world[me]=k||null;renderHotbar();renderInventory();return true}
function stowMsg(k,n){toast(`+${n} ${ITEMS[k].name} → Backpack (I)`);const C=world.counters;if(!C.tipPickup&&tipsOn()){C.tipPickup=1;toast("💡 Everything you pick up goes into your Backpack — press I to open it. V switches hands; 1–0 equips the selected hand; R puts its item back (Shift+R: both hands); right-click an item for more.")}}
function stow(both){const field=activeHand==="L"?"left":"held",had=(both?[world.held,world.left]:[world[field]]).filter(Boolean);if(!had.length)return toast("Your hands are already empty.");world[field]=null;if(both)world.held=world.left=null;renderHotbar();renderInventory();AU.pickup?.();toast(`Stowed ${had.map(k=>ITEMS[k].name).join(" and ")} in your Backpack.`);return true}
function swapHands(){const r=world.held;world.held=world.left||null;world.left=r||null;renderHotbar();renderInventory()}
/* drop: real physics drops in front of you (fall, bounce, roll on slopes, float if buoyant); E picks them up again */
function dropSpawn(k,n,f){f=f||forward();const piles=Math.min(n,8),per=Math.floor(n/piles);let rest=n-per*piles;
  for(let i=0;i<piles;i++){const c=per+(rest-->0?1:0),a=(i-(piles-1)/2)*.35;const dx=f.x*Math.cos(a)-f.z*Math.sin(a),dz=f.z*Math.cos(a)+f.x*Math.sin(a);
    const d=addDrop(k,player.pos.x+dx*.7,player.pos.y+1.1,player.pos.z+dz*.7,new THREE.Vector3(dx*(1.6+Math.random()*.8),1.2+Math.random()*.6,dz*(1.6+Math.random()*.8)));d.n=c;d.dropped=true}}
function dropItem(k,n=1){n=Math.min(Math.max(1,Math.floor(n)),inv(k));if(!n)return 0;take(k,n);dropSpawn(k,n);AU.pickup?.();toast(`Dropped ${n}× ${ITEMS[k].name}.`);renderInventory();return n}
function dropEverything(){let n=0;for(const k of ordered().slice()){if(k===world.worn)continue;n+=inv(k);dropItem(k,inv(k))}world.held=world.left=null;renderHotbar();renderInventory();return n}
function bestAxe(){return inv("axe_iron")?"axe_iron":inv("axe_bronze")?"axe_bronze":inv("axe_copper")?"axe_copper":inv("axe_stone")?"axe_stone":null}
function bestKnife(){return ["knife_iron","knife_bronze","knife_copper","knife_stone"].find(k=>inv(k))||null}
function craftTool(k){return k==="knife_stone"?bestKnife():inv(k)?k:null}
function bestPick(){return inv("pickaxe_stone")?"pickaxe_stone":null}
function hasAxe(){const a=bestAxe();return a?ITEMS[a].power:0}
function useTool(k,cost){const it=ITEMS[k];if(!it||!it.dur)return;if(world.dur[k]==null)world.dur[k]=it.dur;world.dur[k]-=cost;
  if(world.dur[k]<=0){delete world.dur[k];take(k);toast(`Your ${it.name.toLowerCase()} broke!${inv(k)?" You take out a spare.":""}`);AU.hit(false)}}
const STICKY=new Set(["stick","log","spear","arrow"]);
function itemMesh(k){const detailed=primitiveItem(k,k==="tally"?world?.counters.tally||0:0);if(detailed)return detailed;const it=ITEMS[k];const st=STICKY.has(k);const m=new THREE.Mesh(st?GEO.stick:GEO.small,st?MAT.bark:new THREE.MeshStandardMaterial({color:it.color,roughness:.75}));m.castShadow=true;
  const s=k==="log"?1.4:k==="spear"?1.8:k==="stick"?.9:k==="arrow"?.8:Math.max(.06,it.r*1.4);m.scale.set(s,k==="log"?3.5:k==="arrow"?.45:st?1:s,k==="log"?3.5:k==="arrow"?.45:st?1:s);return m}
function addDrop(item,x,y,z,vel){const d={item,pos:new THREE.Vector3(x,y,z),vel:vel?vel.clone():new THREE.Vector3(),mesh:itemMesh(item),flying:!!vel,t:0};d.mesh.position.copy(d.pos);scene.add(d.mesh);world.drops.push(d);return d}
function throwSpeed(k){return Math.min(20,Math.sqrt(2*90/ITEMS[k].mass))} // ~90 J from a human arm
function launchItem(k,v){
  const dir=aimDir(),o=player.pos.clone().add(new THREE.Vector3(0,player.crouch?1.1:1.55,0)).addScaledVector(new THREE.Vector3(dir.x,0,dir.z).normalize(),.4);
  const d=addDrop(k,o.x,o.y,o.z,dir.clone().multiplyScalar(v).add(new THREE.Vector3(player.vel.x,0,player.vel.z)));
  d.launch=o.clone();d.v0=v;d.vy0=d.vel.y;d.theta=Math.asin(clamp(dir.y,-1,1));d.thrown=true;if(PETS&&hasD("counting")&&Math.random()<.3)PETS.distract("drop");return d}
function throwHeld(){
  const k=world.held;if(!k||!inv(k))return toast("Nothing in hand to throw.");
  const it=ITEMS[k];if(it.place)return toast(`${it.name} is placed, not thrown.`);
  if(it.weapon)return fireWeapon(k);
  take(k);launchItem(k,throwSpeed(k));GFX.playOnce(player.model,"Spell_Simple_Shoot",.45);AU.whoosh(false);
}
function fireWeapon(k){const it=ITEMS[k];if(!inv(it.ammo))return toast(`You need ${it.ammo==="stone"?"stones":"arrows"} to use the ${it.name.toLowerCase()}.`);
  take(it.ammo);launchItem(it.ammo,it.launch).shot=k;GFX.playOnce(player.model,"Spell_Simple_Shoot",.4);if(k==="bow")AU.twang();else AU.whoosh(true);
  world.counters.shots=(world.counters.shots||0)+1;discover("elastic")}
function aimDir(){const p=clamp(-player.camPitch+(player.camPitch<-.35?0:.32),-1.2,1.5),y=player.camYaw;return new THREE.Vector3(-Math.sin(y)*Math.cos(p),Math.sin(p),-Math.cos(y)*Math.cos(p)).normalize()}
function stepDrops(dt){
  for(const d of world.drops){
    if(!d.flying){if(d.floating){d.t+=dt;d.pos.y=Math.sin(d.t*2)*.03-.02;d.mesh.position.copy(d.pos);d.mesh.rotation.y+=dt*.2}continue}
    const it=ITEMS[d.item];d.t+=dt;
    const ground=heightAt(d.pos.x,d.pos.z),inWater=d.pos.y<0&&ground<0;if(inWater&&!d.splashed){d.splashed=true;GFX.FX.splash(d.pos.x,d.pos.z,14);if(d.pos.distanceTo(player.pos)<40)AU.splash(false)}
    const vol=it.mass/it.density,area=Math.PI*it.r*it.r*(STICKY.has(d.item)?2:1);
    const sp=d.vel.length();
    const rho=inWater?RHO_WATER:RHO_AIR,Cd=d.item==="spear"||d.item==="arrow"?.3:.6;
    const drag=sp>0?.5*rho*Cd*area*sp*sp/it.mass:0;            // quadratic drag
    if(sp>0)d.vel.addScaledVector(d.vel,-Math.min(1,drag*dt/sp));
    d.vel.y-=G_ACC*dt;                                            // gravity
    if(inWater){const sub=clamp(-d.pos.y/(it.r*2),0,1);d.vel.y+=G_ACC*(RHO_WATER*vol*sub)/it.mass*dt; // Archimedes
      d.vel.multiplyScalar(Math.max(0,1-2*dt));
      if(it.density<RHO_WATER&&Math.abs(d.vel.y)<.3&&d.pos.y>-it.r*2){d.flying=false;d.floating=true;
        if(d.item==="stick"||d.item==="log")discover("buoyancy");else toast(`${it.name} floats: it is less dense than water.`)}
      if(d.pos.y<=ground+.05){d.flying=false;d.pos.y=ground+.05;if(it.density>RHO_WATER&&d.thrown)toast(`${it.name} sank (${it.density} kg/m³ > 1000 kg/m³).`)}}
    d.pos.addScaledVector(d.vel,dt);
    if(d.thrown&&d.launch){const tt=nearestTree(d.pos.x,d.pos.z,.75);if(tt&&d.pos.y<tt.t.y+2.6*tt.t.s&&d.pos.y>tt.t.y-.2){const ke=.5*it.mass*sp*sp,dist=Math.hypot(d.pos.x-d.launch.x,d.pos.z-d.launch.z);d.vel.multiplyScalar(-.15);d.thrown=false;AU.hit(false);
        toast(`Thunk! The ${it.name.toLowerCase()} strikes the trunk ${dist.toFixed(1)} m away with ${Math.round(ke)} J (½mv², v ≈ ${sp.toFixed(1)} m/s).`);if(dist>=8)discover("hunting");else toast("A hit! Try again from at least 8 m.")}}
    if(d.thrown&&SURV())for(const a of animals){if(a.dead||a.kind==="dog")continue;if(d.pos.distanceTo(a.pos.clone().setY(a.pos.y+.7*a.sp.size))<.55+a.sp.size*.4){
      const ke=.5*it.mass*sp*sp*(it.dmg||1);a.hp-=ke;a.flee=a.sp.predator?6:6;d.vel.multiplyScalar(-.2);AU.hit(false);toast(`Hit! ${Math.round(ke)} J delivered.`);if(a.hp<=0)killAnimal(a);d.thrown=false;break}}
    const g2=heightAt(d.pos.x,d.pos.z);
    if(d.pos.y<=g2+.03&&!(d.pos.y<0&&g2<0)){d.pos.y=g2+.03;
      if(d.dropped&&(d.bounces||0)<4&&(Math.abs(d.vel.y)>1.1||(!STICKY.has(d.item)&&slopeAt(d.pos.x,d.pos.z)>.3))){d.bounces=(d.bounces||0)+1;d.vel.y=Math.abs(d.vel.y)*.32;d.vel.x*=.55;d.vel.z*=.55;
        const e=.6,gx=(heightAt(d.pos.x+e,d.pos.z)-heightAt(d.pos.x-e,d.pos.z))/(2*e),gz=(heightAt(d.pos.x,d.pos.z+e)-heightAt(d.pos.x,d.pos.z-e))/(2*e);if(!STICKY.has(d.item)){d.vel.x-=gx*1.4;d.vel.z-=gz*1.4}d.pos.y=g2+.05}
      else{d.flying=false;d.vel.set(0,0,0);onLanded(d);d.dropped=false}}
    d.mesh.position.copy(d.pos);if(d.flying)d.mesh.rotation.x+=dt*4;
  }
}
function onLanded(d){
  world.counters.falls++;if(world.counters.falls>=5)discover("gravity");
  if(d.launch&&d.vy0!=null){
    const R=Math.hypot(d.pos.x-d.launch.x,d.pos.z-d.launch.z),pred=d.v0*d.v0*Math.sin(2*d.theta)/G_ACC,dh=d.launch.y-d.pos.y;
    if(hasD("counting")&&dh>=6&&d.t>.4){const t=d.t,g=2*(d.vy0*t+dh)/(t*t);world.counters.drops.push({dh:+dh.toFixed(1),t:+t.toFixed(2),g:+g.toFixed(2)});
      toast(`Timed fall: ${dh.toFixed(1)} m below you in ${t.toFixed(2)} s → g ≈ ${g.toFixed(2)} m/s² (air drag makes it a little under 9.81).`);discover("freefall")}
    if(d.thrown||d.shot){if(hasD("counting")&&R>2){world.counters.throws.push({item:d.item,v:+d.v0.toFixed(1),deg:Math.round(d.theta*180/Math.PI),R:+R.toFixed(1),pred:+pred.toFixed(1),dh:+(d.pos.y-d.launch.y).toFixed(1)});
      toast(`Measured: ${ITEMS[d.item].name} flew ${R.toFixed(1)} m (vacuum prediction ${pred.toFixed(1)} m).`);
      if(world.counters.throws.length>=5)discover("motion")}
    else toast(`${ITEMS[d.item].name} landed ${R.toFixed(1)} m away.`)}
    d.thrown=false;d.launch=null;
  }
}
/* aim arc: dotted trajectory preview while holding something throwable */
let arc=null;const ARC_N=48;
function updateArc(){
  const k=world.held,it=k&&ITEMS[k];let v=0,item=k;
  if(it&&it.weapon){if(inv(it.ammo)){v=it.launch;item=it.ammo}}else if(it&&!it.place&&!it.tool&&(k==="spear"||k==="stone"||k==="flint"||k==="arrow"))v=throwSpeed(k);
  if(!arc){const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(new Float32Array(ARC_N*3),3));arc=new THREE.Points(g,new THREE.PointsMaterial({color:0xfff2c8,size:.09,transparent:true,opacity:.75,depthWrite:false}));arc.frustumCulled=false;scene.add(arc);GFX.MIRROR_HIDE.add(arc)}
  arc.visible=v>0&&!player.dead&&!player.raft&&!paused;if(!arc.visible)return;
  const dir=aimDir(),p=player.pos.clone().add(new THREE.Vector3(0,player.crouch?1.1:1.55,0)).addScaledVector(new THREE.Vector3(dir.x,0,dir.z).normalize(),.4),vel=dir.multiplyScalar(v),a=arc.geometry.attributes.position.array,itm=ITEMS[item];
  const area=Math.PI*itm.r*itm.r*(STICKY.has(item)?2:1),Cd=item==="spear"||item==="arrow"?.3:.6;let n=0,hitAt=-1;
  for(let i=0;i<ARC_N;i++){for(let s=0;s<3;s++){const sp=vel.length(),dr=.5*RHO_AIR*Cd*area*sp*sp/itm.mass;if(sp>0)vel.addScaledVector(vel,-Math.min(1,dr*.02/sp));vel.y-=G_ACC*.02;p.addScaledVector(vel,.02)}
    if(hitAt<0&&p.y<heightAt(p.x,p.z))hitAt=i;if(hitAt>=0){a[i*3]=a[hitAt*3];a[i*3+1]=a[hitAt*3+1];a[i*3+2]=a[hitAt*3+2]}else{a[i*3]=p.x;a[i*3+1]=p.y;a[i*3+2]=p.z;n++}}
  arc.geometry.attributes.position.needsUpdate=true;
}

/* ---------------- structures ---------------- */
const stdMat=(col,r=.9)=>new THREE.MeshStandardMaterial({color:col,roughness:r});
function cyl(rt,rb,h,col,y=0,seg=8){const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),stdMat(col));m.position.y=y;m.castShadow=m.receiveShadow=true;return m}
const PEND_L=[.5,1,2];
function setPendLen(s){const a=s.arm;if(!a)return;a.userData.str.scale.y=s.L;a.userData.str.position.y=-s.L/2;a.userData.bob.position.y=-s.L}
function updateRack(s){if(!s.obj)return;s.obj.userData.strips?.forEach((m,i)=>{m.visible=i<s.meat.length;if(m.visible)m.material.color.setHex(world.gameTime-s.meat[i]>=4*3600?0x6b3a24:0xb53a3a)})}
function clearFireGrass(s,radius=1.1){
  for(const ch of chunks.values()){if(!ch.grass||Math.abs((ch.cx+.5)*CHUNK-s.x)>CHUNK||Math.abs((ch.cz+.5)*CHUNK-s.z)>CHUNK)continue;
    ch.grass.traverse(m=>{if(!m.isInstancedMesh)return;let changed=false;for(let i=0;i<m.count;i++){m.getMatrixAt(i,_m);const e=_m.elements;if(Math.hypot(e[12]-s.x,e[14]-s.z)<radius){m.setMatrixAt(i,ZERO);changed=true}}if(changed)m.instanceMatrix.needsUpdate=true});
  }
}
function structMesh(s){
  const g=new THREE.Group();
  if(s.type==="workbench"||s.type==="workbench_bundle")g.add(workbenchMesh(s.type==="workbench_bundle"));
  if(s.type==="fire"||s.type==="kiln"){
    if(s.type==="kiln"){const d=new THREE.Mesh(new THREE.SphereGeometry(.9,20,10,0,Math.PI*2,0,Math.PI/2),stdMat(0x9c5a3c,.95));d.castShadow=d.receiveShadow=true;g.add(d);const hole=box(.45,.4,.2,0x1a0d08,.2);hole.position.z=.82;g.add(hole)}
    else{clearFireGrass(s);const wood=createFireBed(s,heightAt);s.wood=wood;g.add(wood);
      for(let i=0;i<9;i++){const r=new THREE.Mesh(GEO.small,MAT.stone);r.scale.set(.13,.09,.11);r.position.set(Math.cos(i/9*6.283)*.5,.04,Math.sin(i/9*6.283)*.5);g.add(r)}}
    const f=GFX.makeFlame(s.type==="kiln");f.visible=false;if(s.type==="kiln")f.position.z=.8;g.add(f);s.flame=f;
    if(s.type==="fire"){const bed=new THREE.Mesh(new THREE.CylinderGeometry(.47,.53,.035,18),new THREE.MeshStandardMaterial({color:0x373739,roughness:1,emissive:0}));bed.position.y=.025;bed.receiveShadow=true;g.add(bed);s.residue=bed}
  }else if(s.type==="torch"){g.add(cyl(.035,.045,1.35,0x5a3e22,.67,6));g.add(cyl(.07,.055,.2,0x2a1a10,1.38,7));const f=GFX.makeFlame(false);f.position.y=1.42;f.visible=false;g.add(f);s.flame=f}
  else if(s.type==="leanto"){const r=box(2.4,.08,2.2,0x7a6a3e);r.rotation.x=-.85;r.position.set(0,1,-.2);g.add(r);const p1=box(.08,1.6,.08,0x6b4a2b,.8);p1.position.set(-1.1,0,.55);const p2=p1.clone();p2.position.x=1.1;g.add(p1,p2)}
  else if(s.type==="hut"){const roof=new THREE.Mesh(new THREE.ConeGeometry(2.25,2.9,14,1,true),new THREE.MeshStandardMaterial({color:0x8a6e42,roughness:.97,side:THREE.DoubleSide}));roof.position.y=1.45;roof.castShadow=roof.receiveShadow=true;g.add(roof);
    for(let i=0;i<14;i++){const a=i/14*6.283,l=cyl(.04,.05,3.3,0x6b4a2b,0,5);l.position.set(Math.cos(a)*1.1,1.5,Math.sin(a)*1.1);l.rotation.set(Math.sin(a)*.62,0,-Math.cos(a)*.62);g.add(l)}
    const door=box(.8,1.3,.06,0x140c06,.65);door.position.z=1.72;door.rotation.x=-.2;g.add(door)}
  else if(s.type==="house"){const C=0x9a948a,w=[[4.4,2.4,.3,0,-2.05],[.3,2.4,4.4,-2.05,0],[.3,2.4,4.4,2.05,0],[1.6,2.4,.3,-1.4,2.05],[1.6,2.4,.3,1.4,2.05],[1.2,.5,.3,0,2.05,2.15]];
    for(const [a,b,c,x,z,y] of w){const m=box(a,b,c,C,y??b/2);m.position.x=x;m.position.z=z;if(y)m.position.y=y;g.add(m)}
    const roof=new THREE.Mesh(new THREE.ConeGeometry(3.6,1.7,4),stdMat(0x6b4a2b,.95));roof.rotation.y=Math.PI/4;roof.position.y=3.25;roof.castShadow=roof.receiveShadow=true;g.add(roof)}
  else if(s.type==="chest"){g.add(box(.9,.5,.55,0x7a5230,.25));const lid=box(.94,.1,.59,0x5e3e22,.55);g.add(lid);const band=box(.96,.06,.08,0x3a3a3a,.3);g.add(band)}
  else if(s.type==="rack"){for(const x of [-.75,.75]){const a=box(.06,1.5,.06,0x6b4a2b,.75);a.position.x=x;a.rotation.x=.2;g.add(a);const b=a.clone();b.rotation.x=-.2;g.add(b)}
    const bar=box(1.7,.05,.05,0x6b4a2b,1.42);g.add(bar);g.userData.strips=[];for(let i=0;i<4;i++){const m=box(.12,.45,.03,0xb53a3a,1.15);m.material=m.material.clone();m.position.x=-.5+i*.33;m.visible=false;g.add(m);g.userData.strips.push(m)}}
  else if(s.type==="well"){const ring=new THREE.Mesh(new THREE.CylinderGeometry(.78,.85,.75,18,1,true),new THREE.MeshStandardMaterial({color:0x8d8a86,roughness:.95,side:THREE.DoubleSide}));ring.position.y=.37;ring.castShadow=ring.receiveShadow=true;g.add(ring);
    const wtr=new THREE.Mesh(new THREE.CircleGeometry(.72,18),new THREE.MeshStandardMaterial({color:0x1d4a66,roughness:.15,metalness:.1}));wtr.rotation.x=-Math.PI/2;wtr.position.y=.15;g.add(wtr);
    for(const x of [-.85,.85]){const p=box(.09,1.7,.09,0x6b4a2b,.85);p.position.x=x;g.add(p)}const bar=box(1.8,.07,.07,0x6b4a2b,1.65);g.add(bar)}
  else if(s.type==="wall"){for(let i=0;i<7;i++){const l=cyl(.13,.15,2.2,0x6e4f2c,1.1,7);l.position.x=-1.5+i*.5;g.add(l);const tip=new THREE.Mesh(new THREE.ConeGeometry(.13,.3,7),stdMat(0x6e4f2c));tip.position.set(-1.5+i*.5,2.35,0);g.add(tip)}
    const tie=box(3.2,.08,.05,0x9cc25a,1.5);tie.position.z=.15;g.add(tie)}
  else if(s.type==="pendulum"){for(const x of [-.65,.65]){const p=box(.08,2.7,.08,0x8a6a3e,1.35);p.position.x=x;g.add(p)}g.add(box(1.45,.08,.08,0x8a6a3e,2.7));
    const arm=new THREE.Group();arm.position.y=2.66;const str=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,1,4),stdMat(0x9cc25a));const bob=new THREE.Mesh(new THREE.SphereGeometry(.09,12,8),stdMat(0x8d8a86,.7));bob.castShadow=true;arm.add(str,bob);arm.userData={str,bob};g.add(arm);s.arm=arm;setPendLen(s)}
  else if(s.type==="raft"){for(let i=0;i<4;i++){const l=new THREE.Mesh(GEO.stick,MAT.bark);l.scale.set(2.6,4,4);l.position.set(0,.05,(i-1.5)*.32);g.add(l)}}
  else if(s.type==="table"){g.add(box(1.4,.08,.8,0x7a5a34,.8));for(const [x,z] of [[-.6,-.3],[.6,-.3],[-.6,.3],[.6,.3]]){const l=box(.08,.8,.08,0x6b4a2b,.4);l.position.set(x,0,z);g.add(l)}const t=box(.3,.05,.22,0xb67a52,.87);g.add(t)}
  else if(s.type==="crop"){for(let i=0;i<5;i++){const t=new THREE.Mesh(GEO.tuft,new THREE.MeshStandardMaterial({color:0x7fb04a,roughness:.8}));t.scale.setScalar(.4);t.position.set((i%3-1)*.35,0,(Math.floor(i/3)-.5)*.4);g.add(t)}}
  else if(s.type==="pack"){const m=new THREE.Mesh(new THREE.SphereGeometry(.28,12,8),stdMat(0x6b4a2e,.95));m.scale.set(1.2,.75,1);m.position.y=.2;m.castShadow=true;g.add(m);const k=box(.1,.14,.1,0x3a2414,.42);g.add(k)}
  else if(s.type==="gnomon"){g.add(box(.05,1,.05,0xa07a4a,.5));const sh=box(.04,.01,1,0x1a1a1a,.01);sh.geometry.translate(0,0,-.5);g.add(sh);s.shadow=sh}
  g.position.set(s.x,s.y,s.z);g.rotation.y=s.ry||0;scene.add(g);s.obj=g;if(s.type==="rack")updateRack(s);return g;
}
const PLACE_DIST={hut:3.6,house:4.2,well:2.2,wall:2,chest:1.5,rack:1.8,pendulum:2,torch:1.4};
function place(type,extra={}){
  const f=forward(),pd=PLACE_DIST[type]||1.8;let x=player.pos.x+f.x*pd,z=player.pos.z+f.z*pd;
  if(type==="raft"){let ok=false;for(let r=1.5;r<9&&!ok;r+=.5){const tx=player.pos.x+f.x*r,tz=player.pos.z+f.z*r;if(heightAt(tx,tz)<-.4){x=tx;z=tz;ok=true}}if(!ok){toast("Rafts must be launched on water — face open water.");return null}}
  else if(heightAt(x,z)<0){toast("You can't build in the water.");return null}
  if(type==="well"&&heightAt(x,z)>16){toast(`The ground here is ${Math.round(heightAt(x,z))} m above sea level — too far above the water table. Dig lower down, below about 16 m.`);return null}
  const y=type==="raft"?0:heightAt(x,z);
  const s={type,x,y,z,ry:type==="hut"||type==="house"?Math.atan2(-f.x,-f.z):Math.atan2(f.x,f.z),...extra};
  if(type==="fire")Object.assign(s,{fuel:1.5,lit:false,heat:0,temp:15});
  if(type==="kiln")Object.assign(s,{fuel:0,lit:false,heat:0,temp:15,bellows:false});
  if(type==="torch")Object.assign(s,{fuel:1,lit:false,heat:0,temp:15});
  if(type==="chest")s.items={};if(type==="rack")s.meat=[];if(type==="pendulum")s.L=1;
  world.structures.push(s);structMesh(s);AU.place();return s;
}
function structuresNear(x,z,r,type){return world.structures.filter(s=>(!type||s.type===type)&&Math.hypot(s.x-x,s.z-z)<r)}
function shelterLevel(x,z){let lv=0;for(const s of world.structures){if(s.type!=="house"&&s.type!=="hut"&&s.type!=="leanto")continue;const d=Math.hypot(s.x-x,s.z-z);
  if(s.type==="house"&&d<2.1)lv=Math.max(lv,3);else if(s.type==="hut"&&d<2)lv=Math.max(lv,2);else if(s.type==="leanto"&&d<2.6)lv=Math.max(lv,1)}return lv}
function sheltered(x,z){return shelterLevel(x,z)>0}
function structSegs(s){if(s._seg)return s._seg;const c=Math.cos(s.ry||0),sn=Math.sin(s.ry||0),W=(lx,lz)=>[s.x+lx*c+lz*sn,s.z-lx*sn+lz*c];
  const segs=s.type==="wall"?[[-1.65,0,1.65,0]]:s.type==="house"?[[-2.2,-2.2,2.2,-2.2],[-2.2,-2.2,-2.2,2.2],[2.2,-2.2,2.2,2.2],[-2.2,2.2,-.6,2.2],[.6,2.2,2.2,2.2]]:[];
  s._seg=segs.map(([a,b,c2,d])=>[...W(a,b),...W(c2,d)]);return s._seg}
function collide(pos,rad){let hit=false;for(const s of world.structures){if(s.type!=="wall"&&s.type!=="house")continue;if(Math.abs(s.x-pos.x)>6||Math.abs(s.z-pos.z)>6)continue;
  for(const [ax,az,bx,bz] of structSegs(s)){const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz,t=clamp(((pos.x-ax)*dx+(pos.z-az)*dz)/l2,0,1),cx=ax+dx*t,cz=az+dz*t,ex=pos.x-cx,ez=pos.z-cz,d=Math.hypot(ex,ez),r=rad+.18;
    if(d<r){hit=true;if(d<1e-4){pos.x+=r;continue}pos.x=cx+ex/d*r;pos.z=cz+ez/d*r}}}return hit}
// Discovery mode (default): no hunger, thirst, illness or injuries — setbacks instead of damage. Classic survival is an opt-in setting.
let survivalMode=(()=>{try{return localStorage.getItem("fog-of-knowledge:game:survival")==="1"}catch(_){return false}})();const SURV=()=>survivalMode;
function setSurvival(v){survivalMode=!!v;try{localStorage.setItem("fog-of-knowledge:game:survival",v?"1":"0")}catch(_){}if(world)Object.assign(world.st,{hunger:Math.max(world.st.hunger,85),thirst:Math.max(world.st.thirst,85),sick:0,sprain:0,health:Math.max(world.st.health,60)});if(player)renderHUD()}
const fireLights=[],fireFillLights=[];let fireShFrame=0;const fireFps={ema:60,low:0,high:0,on:true,t:0};let eyeAdapt=0,brightBoost=(()=>{try{return +localStorage.getItem("fog-of-knowledge:game:bright")||0}catch(_){return 0}})();
/* Fire size & light, from fuel physics.
   size  F = clamp(√(fuel/3 kg), 0.45, 4.0)       — a bigger fuel load builds a bigger, taller fire
   burn  ṁ = F kg/h  (fresh 1.5 kg pile ≈ 0.7 kg/h; 14 kg bonfire ≈ 2.2 kg/h, lasting ~13 h as it shrinks)
   power P = ṁ · 16 MJ/kg · heat                    — dry wood's heat of combustion
   light Φ = η·P lumens, η = 0.3·F^1.2 lm/W        — larger flames burn hotter and sootier, so a larger share is visible light
   I = Φ/4π candela; E(d) = I/d² lux; "usable" radius where E = 3 lux (enough to see ground and faces with dark-adapted eyes).
   Torch: 0.125 kg/h, η 0.4. Colour: blackbody ≈1900 K at full heat, cooling to ≈1000 K dull red as embers.
   Scene units: 1 lux → 0.09 (so the 3-lux edge of the circle renders just readable at night exposure). */
const LUX_TO_SCENE=.18;

function kelvinColor(K,out){const t=K/100;let r=255,g=t<=66?99.47*Math.log(t)-161.12:288*Math.pow(t-60,-.133),b=t<=19?0:138.5*Math.log(t-10)-305;out.setRGB(clamp(r,0,255)/255,clamp(g,0,255)/255,clamp(b,0,255)/255);out.convertSRGBToLinear?.();return out}
function fireLight(s){const torch=s.type==="torch",kiln=s.type==="kiln",F=torch?.45:kiln?1:fireSize(s),heat=clamp(s.heat,0,1.2);
  const mdot=torch?.125:kiln?1.3:F,P=mdot/3600*16e6*heat*(s.lit?1:.25),eta=torch?.4:kiln?.08:.3*Math.pow(F,1.2),lm=eta*P,cd=lm/(4*Math.PI);
  const K=1000+900*clamp(heat*(s.lit?1:.4)*(torch?1:Math.min(1,.6+.4*F)),0,1);const color=kelvinColor(K,new THREE.Color());
  return {size:F,watts:Math.round(P),lumens:Math.round(lm),cd:+cd.toFixed(1),rUse:+Math.sqrt(cd/3).toFixed(2),kelvin:Math.round(K),color,scene:cd*LUX_TO_SCENE}}
function stepFires(dt,dtg){
  const raining=isRaining(),P=player.pos;
  for(const s of world.structures){
    if(!BURN.has(s.type))continue;
    const near=Math.hypot(s.x-P.x,s.z-P.z);
    if(s.type==="fire")ensureFuelBed(s);
    const out=stepCombustion(s,dt,dtg,raining?world.weather.amt:0,!!sheltered(s.x,s.z));
    if(out){if(near<60)toast(out==="fuel"?"The fire has burned down to embers. Let it cool to collect the remains.":"Rain has extinguished the flames. The fuel bed remains — shelter it and relight it.");discover("combustion")}
    if(s.type==="fire"){stepFuelBed(s,dt);const pile=fuelLayout(s);if(pile.radius>(s._clearRadius||1.1)+.3){clearFireGrass(s,pile.radius+.2);s._clearRadius=pile.radius+.2}if(s.wood&&near<Math.max(120,pile.radius*3))updateFireBed(s.wood,s,performance.now()/1000)}
    if(s.residue){s.residue.visible=(s.charcoal||0)+(s.ash||0)>.005;s.residue.material.emissive.setHex(s.heat>.08?0x9b2605:0);s.residue.material.emissiveIntensity=s.heat*.7}
    if(s.lit){
      const target=s.type==="kiln"?(s.bellows?1300:1150):s.type==="torch"?600:850;
      s.temp=lerp(s.temp,target*s.heat,Math.min(1,dt*.15));
      // spread to dry trees (needs oxygen & dry fuel)
      if(s.type==="fire"&&!raining&&s.heat>.8&&Math.random()<dt*.01){const t=nearestTree(s.x,s.z,3.2);if(t&&!t.t.burnt&&!t.t.burning&&biomeAt(t.t.x,t.t.z,t.t.y)!=="snow")igniteTree(t)}
    }else{s.temp=lerp(s.temp,airTemp(s.x,s.z,s.y),Math.min(1,dt*.05));s.heat=Math.max(0,s.heat)}
    if(s.flame){s.flame.visible=s.lit;if(s.lit){const k=(.6+.4*s.heat+Math.sin(performance.now()/220+s.x)*.035)*(s.type==="torch"?.38:s.type==="fire"?Math.pow(fireSize(s),.8):1);const pile=s.type==="fire"?fuelLayout(s):null,width=pile?Math.max(Math.pow(fireSize(s),.68),pile.radius*1.8):1,height=pile?Math.max(fireSize(s)*1.18,pile.height+1.2):1,base=s.type==="fire"?(.6+.4*s.heat):k;s.flame.scale.set(base*width,base*height,base*width);if(pile)pile.surfaceMass=s.fuel;GFX.animateFlame(s.flame,performance.now()/1000,s.heat,pile?pile.height/(base*height):0,pile,s.wood?.userData.support);
      if(near<(s.type==="torch"?60:120))GFX.FX.fire("s"+s.x.toFixed(1)+s.z.toFixed(1),s.x,s.y+(s.type==="kiln"?.9:s.type==="torch"?1.45:.1),s.z,s.heat,dt,s.type==="kiln"?.45:s.type==="torch"?.28:Math.pow(fireSize(s),.85),.25+.65*(s.wet||0)+.55*(1-s.heat))}}
  }
  // the 4 nearest glowing fires get physically-scaled point lights (inverse-square decay); nearest 1 (High) / 2 (Ultra) cast flickering shadows
  const glow=world.structures.filter(s=>(s.lit||s.heat>.03)&&s.type!=="pack").sort((a,b)=>Math.hypot(a.x-P.x,a.z-P.z)-Math.hypot(b.x-P.x,b.z-P.z)).slice(0,4);
  while(fireLights.length<4){const l=new THREE.PointLight(0xff8a3a,0,20,2);l.shadow.bias=-.0005;l.shadow.normalBias=.025;l.shadow.radius=2;l.shadow.autoUpdate=false;l.shadow.camera.near=.3;scene.add(l);fireLights.push(l)}
  const tt=performance.now()/1000;let eAtPlayer=0;fireShFrame++;
  // shadow budget: fire shadows only matter at night; and if the frame rate sags below ~55 fps they switch off (back on above 75) so High stays smooth
  const rdt=Math.max(1e-3,tt-(fireFps.t||tt-.016));fireFps.t=tt;fireFps.ema+=(1/rdt-fireFps.ema)*Math.min(1,rdt*2);
  if(fireFps.ema<55)fireFps.low+=rdt;else fireFps.low=0;if(fireFps.ema>75)fireFps.high+=rdt;else fireFps.high=0;
  if(fireFps.low>2.5)fireFps.on=false;if(fireFps.high>6)fireFps.on=true;
  const nSh=(fireFps.on&&GFX.ENV.night>.6)?(GFX.Q.fireShadow||0):0;
  fireLights.forEach((l,i)=>{const s=glow[i];const L=s&&fireLight(s);const want=!!L&&i<nSh&&s.type!=="torch"&&Math.hypot(s.x-P.x,s.z-P.z)<35;
    if(l.castShadow!==want){l.castShadow=want;if(want){const m=Math.max(512,GFX.Q.fireShadowMap||256);l.shadow.mapSize.set(m,m);l.shadow.map?.dispose();l.shadow.map=null}}
    if(l.castShadow)l.shadow.needsUpdate=!l.shadow.map||(fireShFrame+i)%2===0;   // cube shadows re-render every other frame (6 faces each): halves their cost, flicker still reads
    if(L){const fl=1+.05*Math.sin(tt*9.3+i)+.035*Math.sin(tt*21.7+i*3)+.02*Math.sin(tt*37+i*5);
      l.position.set(s.x+.04*Math.sin(tt*13+i),s.y+(s.type==="torch"?1.6:s.type==="kiln"?1:Math.max(.9+.55*Math.min(4,fireSize(s)),fuelLayout(s).height+.8)),s.z+.04*Math.cos(tt*11+i));
      l.intensity=L.scene*fl*(1-.7*GFX.ENV.day)*(i===0&&s.type==="fire"?.55:1);l.distance=Math.max(4,L.rUse*3.2);l.shadow.camera.far=l.distance;l.color.copy(L.color);
      const d=Math.max(.5,l.position.distanceTo(P));eAtPlayer+=L.cd/(d*d)}else{l.intensity=0}});
  // Approximate the broad emitting flame and nearby ground bounce without
  // six more shadow renders: share two unshadowed fills with the nearest fire.
  while(fireFillLights.length<2){const l=new THREE.PointLight(0xffa45c,0,20,2);scene.add(l);fireFillLights.push(l)}
  const closest=glow[0],fill=closest?.type==="fire"?fireLight(closest):null;
  fireFillLights.forEach((l,i)=>{if(!fill){l.intensity=0;return}const pile=fuelLayout(closest),spread=Math.max(.45+.35*Math.sqrt(fireSize(closest)),pile.radius*.55),a=i*Math.PI+.6;
    l.position.set(closest.x+Math.cos(a)*spread,closest.y+Math.max(.7+.22*fireSize(closest),pile.height*.6+.5),closest.z+Math.sin(a)*spread);
    l.intensity=fill.scene*.225*(1-.7*GFX.ENV.day);l.distance=Math.max(6,fill.rUse*3.5);l.color.copy(fill.color);
  });
  world._luxAtPlayer=eAtPlayer;
  // eye adaptation: after ~a minute in the dark the eye gains a little (≤ +30%); firelight resets it. Plus the optional brightness slider.
  const dark=isNight()&&eAtPlayer<1.5;eyeAdapt+=((dark?1:0)-eyeAdapt)*Math.min(1,dt/(dark?40:4));GFX.ENV.expMul=(1+.3*eyeAdapt)*(1+brightBoost);
}
const burning=[];
function nearestTree(x,z,r){let best=null,bd=r;for(const ch of nearbyChunks(x,z,r))for(const t of ch.obj.trees){if(t.gone)continue;const d=Math.hypot(t.x-x,t.z-z);if(d<bd){bd=d;best={ch,t,d}}}return best}
function igniteTree(tt){if(burning.length>25)return;tt.t.burning=true;burning.push({...tt,time:0});refreshTree(tt.ch,tt.t);if(Math.hypot(tt.t.x-player.pos.x,tt.t.z-player.pos.z)<150)toast("A tree caught fire!")}
let burnHurtT=0;
function stepBurning(dt){
  const raining=isRaining();burnHurtT-=dt;
  for(let i=burning.length-1;i>=0;i--){const b=burning[i];b.time+=dt*(raining?3:1);GFX.FX.fire("t"+b.ch.key+b.t.i,b.t.x,b.t.y+2.2*b.t.s,b.t.z,1,dt,2.2);
    if(!raining&&Math.random()<dt*.06){const n=nearestTree(b.t.x+(Math.random()-.5)*6,b.t.z+(Math.random()-.5)*6,4);if(n&&!n.t.burning&&!n.t.burnt)igniteTree(n)}
    const pd=Math.hypot(b.t.x-player.pos.x,b.t.z-player.pos.z);if(pd<3&&!player.dead){hurt(dt*5,burnHurtT<=0?"The wildfire burns you":null,"a wildfire");if(burnHurtT<=0)burnHurtT=3}
    if(b.time>25){b.t.burning=false;world.burnt.add(b.ch.key+"|t"+b.t.i);refreshTree(b.ch,b.t);burning.splice(i,1)}}
}

/* ---------------- environment ---------------- */
function hourOf(t=world.gameTime){return (t/3600)%24}
function sunElevation(){return Math.sin(2*Math.PI*(hourOf()-6)/24)}
function waterTemp(x,z){return clamp(climate(x,z,0).t*.6+3,1,26)}
function isRaining(){const w=world.weather;return (w.kind==="rain"||w.kind==="storm")&&w.amt>.3}
function snapNow(){const s=world.snap;return s&&world.gameTime>=s.start&&world.gameTime<s.end?s.dT:0}
function airTemp(x,z,y){
  const {t,m}=climate(x,z,Math.max(0,y));const b=biomeAt(x,z,heightAt(x,z));
  const amp=b==="desert"?11:b==="beach"?3:6;
  const diurnal=amp*Math.cos(2*Math.PI*(hourOf()-15)/24);
  const k=world.weather.kind,w=k==="rain"||k==="storm"?-3*world.weather.amt:k==="cloudy"||k==="drystorm"?-1:0;
  return t+(b==="desert"?6:0)+diurnal+w-snapNow();   // includes −6.5 °C / 43.7 °F/km lapse rate via climate()
}
function rollWeather(){const b=biomeAt(player.pos.x,player.pos.z,player.pos.y),r=Math.random(),storm=Math.min(.2,.05+.03*dayNum());
  // Calm (default): sunny for the first 3 days and until your first fire; after that mostly fair, a short shower ~10% of days, no storms
  if(weatherPref==="calm"){if(dayNum()<3||!hasD("fire"))return "clear";return r<.03?"rain":r<.18?"cloudy":"clear"}
  if(b==="desert")return r<.8?"clear":r<.9?"cloudy":r<.97?"drystorm":"rain";
  return r<storm?"storm":r<storm+.05?"drystorm":r<.5?"clear":r<.72?"cloudy":"rain"}
function stepWeather(dtg){
  const w=world.weather;w.t-=dtg;
  if(!w.next)w.next=rollWeather();
  if(w.t<=3600&&!w.warned&&w.next!==w.kind&&(w.next==="storm"||w.next==="drystorm"||w.next==="rain")){w.warned=true;toast(w.next==="rain"?"Clouds are building on the horizon — rain is coming within the hour.":"The air turns heavy and the sky darkens — a thunderstorm is coming. Shelter your fire.")}
  if(w.t<=0){w.kind=w.next;w.next=rollWeather();w.warned=false;w.t=(w.kind==="storm"||w.kind==="drystorm"?1.2+Math.random()*1.8:weatherPref==="calm"&&w.kind==="rain"?.6+Math.random()*.6:2+Math.random()*5)*3600}   // calm showers: a few real minutes
  const target={rain:1,storm:1,drystorm:.12}[w.kind]||0;
  w.amt=lerp(w.amt,target,Math.min(1,dtg/1800));
  // cold snaps: announced two hours ahead, bitter for 8–18 hours, harsher as the days pass
  const s=world.snap;
  if(s){if(world.gameTime>s.end){world.snap=null;toast("The cold snap breaks; the air softens.")}else if(!s.arrived&&world.gameTime>=s.start){s.arrived=true;toast(`The cold snap arrives: air ${temperatureDelta(s.dT)} colder than usual. Keep your fire fed.`)}}
  else if(weatherPref==="natural"&&dayNum()>=1&&Math.random()<dtg/86400*(.22+.06*dayNum())){const start=world.gameTime+2*3600;world.snap={start,end:start+(8+Math.random()*10)*3600,dT:6+Math.min(8,dayNum())+Math.random()*3};
    toast("A bitter north wind is rising — a cold snap will arrive in about two hours. Gather fuel and get to shelter.");}
}
/* lightning: flash now, thunder after d / 343 m/s; strikes on tall trees can start wildfires when the storm is dry */
let flashT=0,flashStrength=0,bolt=null;const thunders=[];
function stepLightning(dt){
  const w=world.weather;
  if(weatherPref==="natural"&&((w.kind==="storm"&&w.amt>.5)||w.kind==="drystorm")&&Math.random()<dt*.07)strike();   // lightning only in Natural weather
  for(let i=thunders.length-1;i>=0;i--){const t=thunders[i];t.t-=dt;if(t.t<=0){thunders.splice(i,1);AU.thunder(t.d);onThunder(t)}}
  flashT=Math.max(0,flashT-dt);if(bolt&&bolt.visible){bolt.userData.t-=dt;bolt.material.opacity=Math.max(0,bolt.userData.t/.3);if(bolt.userData.t<=0)bolt.visible=false}
}
function strike(at){
  let x,z,tree=null;
  if(at){x=at[0];z=at[1];tree=nearestTree(x,z,1.5)}   // a strike aimed at a tree can set it alight too (was: only random strikes)
  else if(Math.random()<.5){const list=[];for(const ch of chunks.values())if(ch.group)for(const t of ch.obj.trees)if(!t.gone&&!t.burnt&&!t.burning)list.push({ch,t});if(list.length){tree=list[Math.floor(Math.random()*list.length)];x=tree.t.x;z=tree.t.z}}
  if(x===undefined){const a=Math.random()*6.283,r=150+Math.random()*1800;x=player.pos.x+Math.cos(a)*r;z=player.pos.z+Math.sin(a)*r}
  const d=Math.max(30,Math.hypot(x-player.pos.x,z-player.pos.z));
  flashT=.32;flashStrength=clamp(900/d,.15,1);showBolt(x,heightAt(x,z),z,d);
  thunders.push({t:d/343,d});world.counters.strikes++;
  if(tree&&world.weather.amt<.55&&biomeAt(tree.t.x,tree.t.z,tree.t.y)!=="snow")igniteTree(tree);
}
function showBolt(x,y,z,d){if(d>1400)return;if(!bolt){bolt=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xe8f0ff,transparent:true,fog:false}));bolt.frustumCulled=false;scene.add(bolt)}
  const pts=[];let px=x,pz=z;for(let i=0;i<=14;i++){pts.push(px,y+250*i/14,pz);px+=(Math.random()-.5)*14;pz+=(Math.random()-.5)*14}
  bolt.geometry.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));bolt.visible=true;bolt.userData.t=.3}
function onThunder(t){const s=t.d/343;
  if(hasD("counting"))toast(`Flash… ${s.toFixed(1)} s… thunder. Sound travels 343 m/s, so it struck about ${(t.d/1000).toFixed(1)} km away.`);
  else toast(`A flash — then, ${Math.max(1,Math.round(s))} heartbeat${s>=1.5?"s":""} later, thunder.`);
  if(t.d<4000)discover("lightning")}
const _sunDir=new THREE.Vector3(),_md=new THREE.Vector3(),_jd=new THREE.Vector3();
function sunDirV(){const a=2*Math.PI*(hourOf()-6)/24;return _sunDir.set(Math.cos(a),Math.sin(a),.25).normalize()}
function moonDirV(){return _md.copy(sunDirV()).multiplyScalar(-1)}
function jupDir(){const r=world.gameTime/86164*2*Math.PI+1.1,el=.66;return _jd.set(Math.cos(r)*Math.cos(el),Math.sin(el),Math.sin(r)*Math.cos(el))}
let jupiter=null;
function initSkyExtras(){
  const mk=(c,s)=>{const m=new THREE.Sprite(new THREE.SpriteMaterial({map:GFX.glowTexture(),color:c,transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));m.scale.setScalar(s);m.renderOrder=-1;return m};
  jupiter=new THREE.Group();const disk=mk(0xfff0d0,12);jupiter.add(disk);jupiter.userData.disk=disk;jupiter.userData.moons=[-9,-4.2,3.1,7.6].map((o,i)=>{const m=mk(0xfffaf0,1.4);m.userData.o=o;m.userData.v=(i%2?.6:-.5);jupiter.add(m);return m});
  scene.add(jupiter);GFX.MIRROR_HIDE.add(jupiter);
}
function updateSky(dt=.016){
  const el=sunElevation(),sd=sunDirV();
  const snow=airTemp(player.pos.x,player.pos.z,player.pos.y)<.5;
  const under=camera.position.y<-.05&&heightAt(camera.position.x,camera.position.z)<0;
  const k=world.weather.kind;
  GFX.updateEnvironment({sunDir:sd,el,amt:world.weather.amt,kind:k==="drystorm"?"cloudy":k==="storm"?"rain":k,pos:player.pos,cam:camera.position,snow,gameTime:world.gameTime,dt,under,flash:lightningPulse(flashT,flashStrength)});
  GFX.setUnderwater(under?1:0);
  if(jupiter){const vis=el<-.08&&world.weather.amt<.5;jupiter.visible=vis;if(vis){const jd=jupDir();jupiter.position.copy(camera.position).addScaledVector(jd,800);
    const zoom=!!player.zoom,u=jupiter.userData;u.disk.scale.setScalar(zoom?3.6:12);u.disk.material.opacity=zoom?1:.85;
    const right=new THREE.Vector3().crossVectors(jd,new THREE.Vector3(0,1,0)).normalize();
    u.moons.forEach(m=>{m.visible=zoom;m.position.copy(right).multiplyScalar(m.userData.o+Math.sin(world.gameTime/86400*m.userData.v*6)*1.5).addScaledVector(new THREE.Vector3(0,1,0),m.userData.o*.08)})}}
}

/* ---------------- player physics & survival ---------------- */
const keys=new Set();
function forward(){return new THREE.Vector3(-Math.sin(player.camYaw),0,-Math.cos(player.camYaw))}
function makePlayer(w){
  const p={pos:new THREE.Vector3(...w.pos),vel:new THREE.Vector3(),yaw:w.yaw||0,camYaw:w.cam[0],camPitch:w.cam[1],camDist:w.cam[2],onGround:true,swimming:false,raft:null,model:makeHuman(),dead:false,throwAnim:0,lookUpT:0,fall:0,crouch:false,actCd:0,stepAcc:0,scopeMoon:0,scopeJup:0};
  scene.add(p.model);return p;
}
function groundMu(){const b=biomeAt(player.pos.x,player.pos.z,heightAt(player.pos.x,player.pos.z));return b==="snow"?.35:b==="beach"||b==="desert"?.6:.8} // friction coefficients
function stepPlayer(dt){
  const p=player,st=world.st;if(p.dead||document.hidden||["wInv","wJournal","wChest","wCtx","wSettings","wPopup","wHelp","wClimbHelp","wExpeditions"].some(id=>$("#"+id)&&!$("#"+id).hidden)){stopMovement();return;}
  const startX=p.pos.x,startZ=p.pos.z;p.moveSpeed=0;
  p.actCd=Math.max(0,p.actCd-dt);
  const f=forward(),r=new THREE.Vector3(-f.z,0,f.x);
  const mv=new THREE.Vector3();
  if(keys.has("KeyW")||keys.has("ArrowUp"))mv.add(f);if(keys.has("KeyS")||keys.has("ArrowDown"))mv.sub(f);
  if(keys.has("KeyD")||keys.has("ArrowRight"))mv.add(r);if(keys.has("KeyA")||keys.has("ArrowLeft"))mv.sub(r);
  if(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].some(k=>keys.has(k))&&autoPickup)stopMovement(false);
  if(autoPickup&&!p.swimming&&!p.raft){
    const a=autoPickup,pt=pickupPoint(a.target);
    if(!pt||a.target.kind==="res"&&a.target.obj.r.gone||a.target.kind==="drop"&&!world.drops.includes(a.target.obj)){stopMovement(false)}
    else if(Math.hypot(pt.x-p.pos.x,pt.z-p.pos.z)<1.7){stopMovement(false);interact(a.target)}
    else{while(a.path.length&&Math.hypot(a.path[0].x-p.pos.x,a.path[0].z-p.pos.z)<.35)a.path.shift();
      const next=a.path[0]||pt;mv.set(next.x-p.pos.x,0,next.z-p.pos.z);
      if(p.pos.distanceToSquared(a.last)<.00003)a.stuck+=dt;else a.stuck=0;a.last.copy(p.pos);
      a.elapsed+=dt;
      if(a.stuck>2.5||a.elapsed>120||heightAt(next.x,next.z)<.05){stopMovement();mv.set(0,0,0);toast("Automatic walking stopped: the route is blocked or taking too long. Choose another approach.")}
    }
  }
  if(mv.lengthSq())mv.normalize();
  const ground=heightAt(p.pos.x,p.pos.z);
  if(p.raft){
    const s=p.raft,sp=3.2,nx=s.x+mv.x*sp*dt,nz=s.z+mv.z*sp*dt;
    if(heightAt(nx,nz)<-.25){world.counters.raftDist+=Math.hypot(nx-s.x,nz-s.z);s.x=nx;s.z=nz;s.obj.position.set(s.x,.02+Math.sin(performance.now()/600)*.03,s.z);if(world.counters.raftDist>10)discover("raft")}
    else if(mv.lengthSq()){p.raft=null;p.pos.set(nx,heightAt(nx,nz),nz);toast("You stepped ashore.");return}
    p.pos.set(s.x,.12,s.z);p.vel.set(mv.x*sp,0,mv.z*sp);p.moveSpeed=mv.length()*sp;p.onGround=true;p.swimming=false;if(mv.lengthSq())p.yaw=Math.atan2(mv.x,mv.z);return;
  }
  const depth=-p.pos.y;p.swimming=ground<-.6&&p.pos.y<-.55;if(p.swimming)p.crouch=false;
  p.climbing=false;
  const terrainSlope=slopeAt(p.pos.x,p.pos.z),grip=inv("climbing_gloves")>0;
  p.climbing=grip&&!p.swimming&&terrainSlope>.7&&mv.lengthSq()>0;
  if(!grip&&!p.swimming&&p.onGround&&terrainSlope>.7){
    const gx=heightAt(p.pos.x+.5,p.pos.z)-heightAt(p.pos.x-.5,p.pos.z),gz=heightAt(p.pos.x,p.pos.z+.5)-heightAt(p.pos.x,p.pos.z-.5),len=Math.hypot(gx,gz)||1,up=mv.x*gx/len+mv.z*gz/len;
    if(up>0){mv.x-=up*gx/len;mv.z-=up*gz/len}
    if(!world.counters.climbGuideSeen){world.counters.climbGuideSeen=1;openClimbGuide();return}
  }
  const lame=st.sprain>0;
  const wantsSprint=keys.has("ShiftLeft")||keys.has("ShiftRight");
  if(st.stamina<=5)p.sprintExhausted=true;
  if(st.stamina>=35||!wantsSprint)p.sprintExhausted=false;
  const running=wantsSprint&&!p.sprintExhausted&&st.stamina>5&&mv.lengthSq()>0&&!p.swimming&&!p.crouch&&!lame;
  const maxV=(p.climbing?1.1:p.swimming?1.3:p.crouch?1.1:running?5.2:2.2)*(lame&&!p.swimming?.55:1)*(!SURV()&&st.tb<35.6?.7:1);   // shivering slows you (Discovery mode)
  const desired=mv.multiplyScalar(maxV);
  const accel=p.swimming?3:p.onGround?groundMu()*G_ACC:1.2;   // friction limits how fast feet can change velocity
  const dvx=desired.x-p.vel.x,dvz=desired.z-p.vel.z,dl=Math.hypot(dvx,dvz),lim=accel*dt;
  if(dl>0){const k=Math.min(1,lim/dl);p.vel.x+=dvx*k;p.vel.z+=dvz*k}
  if(p.swimming){
    const sub=clamp((depth+.25)/1.75,0,1),rhoBody=st.stamina>0?950:1030;          // lungs full ⇒ ~950 kg/m³
    p.vel.y+=(G_ACC*RHO_WATER*sub/rhoBody-G_ACC)*dt;                                // Archimedes vs gravity
    if(keys.has("Space")&&st.stamina>0)p.vel.y+=3*dt;
    p.vel.y-=p.vel.y*Math.min(1,.5*RHO_WATER*1.0*.25*Math.abs(p.vel.y)/BODY_MASS*dt+1.5*dt); // water drag (vertical)
    st.stamina-=dt*(mv.lengthSq()?1.6:.8);if(st.stamina<=0){st.stamina=0;hurt(dt*3,null,"drowning")}   // ~60 s (≈80 m) of swimming from full stamina
    st.wet=1;
  }else{
    p.vel.y-=G_ACC*dt;                                                              // gravity
    const sp=p.vel.length();if(sp>0)p.vel.addScaledVector(p.vel,-.5*RHO_AIR*1*.7*sp/BODY_MASS*dt); // air drag (terminal ≈ 40 m/s)
    if(keys.has("Space")&&p.onGround&&st.stamina>8&&!p.crouch){p.vel.y=Math.sqrt(2*G_ACC*.55);p.onGround=false;st.stamina-=8}
    if(running)st.stamina-=dt*14;
  }
  // edge caution: you stop at the lip of a sheer drop instead of walking off it (jump with Space to go over on purpose)
  if(p.onGround&&!p.swimming&&!keys.has("Space")){const hv=Math.hypot(p.vel.x,p.vel.z);if(hv>.2){const ax=p.pos.x+p.vel.x/hv*.6,az=p.pos.z+p.vel.z/hv*.6,gh=heightAt(ax,az);
    if(gh<p.pos.y-2.2&&gh>-1.2){p.vel.x=0;p.vel.z=0;if(!p.edgeT||performance.now()-p.edgeT>4000){p.edgeT=performance.now();toast(`A sheer ${Math.round(p.pos.y-gh)} m drop! Falls over ~3 m hurt. Jump (Space) to go over the edge on purpose.`)}}}}
  p.pos.addScaledVector(p.vel,dt);
  if(p.pos.y<-.2&&ground<0)st.wet=Math.max(st.wet,.8);
  const g=heightAt(p.pos.x,p.pos.z);
  if(!p.swimming&&p.pos.y<=g){
    const impact=-p.vel.y;if(impact>3.2)GFX.FX.dust(p.pos.x,g,p.pos.z,Math.min(30,impact*3));
    if(impact>6.5){AU.hit(true);world.counters.maxImpact=Math.max(world.counters.maxImpact||0,+impact.toFixed(1))}
    if(impact>8){const dmg=(impact-8)*11;hurt(dmg,`Hard landing at ${impact.toFixed(1)} m/s`,"a fall")}
    if(SURV()&&impact>7&&!p.dead&&Math.random()<.5&&!(st.sprain>0)){st.sprain=120;toast("You land badly and sprain your ankle — you can't run for a while. Resting by a fire or in shelter heals it faster.")}
    if(impact>6.5&&!p.dead)discover("impact");
    p.pos.y=g;p.vel.y=0;p.onGround=true;
    const sl=slopeAt(p.pos.x,p.pos.z);if(sl>.7&&!grip){const e=1;const gx=(heightAt(p.pos.x+e,p.pos.z)-heightAt(p.pos.x-e,p.pos.z)),gz=(heightAt(p.pos.x,p.pos.z+e)-heightAt(p.pos.x,p.pos.z-e));p.vel.x-=gx*2*dt*G_ACC*.3;p.vel.z-=gz*2*dt*G_ACC*.3}
  }else if(p.pos.y>g+.05)p.onGround=false;
  if(p.swimming&&p.pos.y<g)p.pos.y=g;
  // boulders, walls and stone houses block the way
  for(const ch of nearbyChunks(p.pos.x,p.pos.z,4))for(const b of ch.obj.boulders){const dx=p.pos.x-b.x,dz=p.pos.z-b.z,d=Math.hypot(dx,dz),rr=b.s*.95+.3;if(d<rr&&p.pos.y<b.y+b.s*1.2){p.pos.x=b.x+dx/d*rr;p.pos.z=b.z+dz/d*rr}}
  collide(p.pos,.35);
  p.moveSpeed=mv.lengthSq()?Math.min(maxV,Math.hypot(p.pos.x-startX,p.pos.z-startZ)/Math.max(dt,.001)):0;
  const hs=p.moveSpeed;if(hs>.3)p.yaw=Math.atan2(p.vel.x,p.vel.z);
  if(!running&&!p.swimming&&!drilling&&world.st.hunger>5)st.stamina=Math.min(100,st.stamina+dt*12);
  // footsteps by surface
  if(p.onGround&&hs>.5){p.stepAcc+=hs*dt;const stride=running?1.15:p.crouch?.5:.75;if(p.stepAcc>stride){p.stepAcc=0;AU.step(p.pos.y<-.15?"water":biomeAt(p.pos.x,p.pos.z,g),hs,false)}}
  else if(p.swimming&&hs>.3){p.stepAcc+=hs*dt;if(p.stepAcc>1.4){p.stepAcc=0;AU.step("water",hs,true)}}
}
function fireHeatAt(x,z){ // radiant power received (W): P·A/(4πd²), body cross-section ≈ 0.7 m²
  let q=0;for(const s of world.structures){if(!s.lit)continue;const d=Math.max(.8,Math.hypot(s.x-x,s.z-z));q+=Math.min(380,(s.type==="kiln"?2500:s.type==="torch"?900:18000*fireSize(s))*s.heat*.7/(4*Math.PI*d*d))}return q} // a 3 kg campfire radiates ~18 kW; radiant output scales with fire size (a small pile ~8 kW, a bonfire ~40 kW)
function makeSick(sec,msg){const st=world.st;st.sick=Math.max(st.sick,sec);world.counters.sick++;toast(msg);AU.hurt()}
function stepSurvival(dt){
  if(player.dead)return;
  const st=world.st,dtg=dt*gameSpeed(),x=player.pos.x,z=player.pos.z,lv=player.swimming?0:shelterLevel(x,z);
  let Ta=player.swimming?waterTemp(x,z):airTemp(x,z,player.pos.y);
  if(lv===3)Ta=lerp(Ta,17,.65);else if(lv===2)Ta+=3;          // thermal mass of stone walls / still air in a hut
  const speed=Math.hypot(player.vel.x,player.vel.z),activity=player.swimming?4:speed>3.5?3:speed>.5?1:0;
  let M=100+activity*90+(st.tb<36.3?80:0)+((st.warmT||0)>0?70:0);if(st.warmT>0)st.warmT-=dt;   // a hot meal warms from the inside                                  // metabolic heat (W), shivering adds heat
  const clothed=world.worn==="clothing";
  let hA=player.swimming?22:9*(world.weather.amt>.3&&!lv?1.4:1)*[1,.6,.4,.3][lv];  // heat transfer coefficient·area (W/K)
  if(snapNow()&&!lv)hA*=1.25;                                                    // north wind during a cold snap
  if(!player.swimming)hA*=1+.6*st.wet;
  const I=clothed?2.4:1;
  const sunW=sunElevation()>0&&world.weather.kind==="clear"&&lv<2?60*sunElevation():0;
  const fire=fireHeatAt(x,z);
  let L=hA*(st.tb-5-Ta)/I+st.wet*30;                    // skin sits ~5 °C / 41.0 °F below the core; wet skin loses heat by evaporation
  if(st.tb>37.3){const sweat=Math.min(650,(st.tb-37.3)*500);L+=sweat;st.thirst-=sweat/350*dt*.15}
  const net=M+sunW+fire-L;
  const prev=st.tb;st.tb=clamp(st.tb+net*dtg/BODY_HEAT_CAP,28,43);
  if(prev<36&&fire>60&&st.tb>prev){world.counters.warmFrom=world.counters.warmFrom||prev;if(st.tb-world.counters.warmFrom>.3)discover("warmth")}else if(st.tb>=36.5)world.counters.warmFrom=0;
  // wetness: rain soaks, warmth and fire dry
  if(isRaining()&&!lv)st.wet=Math.min(1,st.wet+dt*.02*world.weather.amt);
  else if(!player.swimming)st.wet=Math.max(0,st.wet-dt*.01*(1+Math.max(0,Ta)/15+fire/60));
  if(st.wet>.6&&Ta<10)discover("evaporative");
  const meta=1+(M-100)/200;                          // basal metabolism + a share of activity
  if(SURV()){st.hunger=Math.max(0,st.hunger-dtg*100/129600*meta*(st.sick>0?2:1));
  st.thirst=Math.max(0,st.thirst-dtg*100/86400*(Ta>30?1.8:1)*(st.sick>0?2:1))}else{st.hunger=Math.max(st.hunger,85);st.thirst=Math.max(st.thirst,85);st.sick=0;st.sprain=0;st.tb=Math.max(st.tb,34.6)}
  if(st.sick>0){st.sick-=dt;hurt(dt*.15,null,"illness");if(st.sick<=0&&!player.dead){st.sick=0;toast("The sickness passes. You feel yourself again.");discover("hygiene")}}
  if(st.sprain>0){st.sprain-=dt*(lv||fire>40?2:1);if(st.sprain<=0){st.sprain=0;toast("Your ankle feels strong again.")}}
  if(st.hunger<=0)hurt(dt*.4,null,"starvation");if(st.thirst<=0)hurt(dt*.6,null,"thirst");
  if(st.tb<35)hurt(dt*.6*(35-st.tb),null,"the cold");if(st.tb>39.5)hurt(dt*.6*(st.tb-39.5),null,"heatstroke");
  if(st.hunger>30&&st.thirst>30&&st.tb>35.5&&st.tb<38.5&&st.sick<=0)st.health=Math.min(100,st.health+dt*.25);
  player.Ta=Ta;player.netW=net;player.fireW=fire;player.shelter=lv;duskCheck();
  warnings(dt);
}
let warnT=0;
function warnings(dt){warnT-=dt;if(warnT>0)return;const st=world.st;let m=null;
  if(player.swimming&&st.stamina<35)m=`You are tiring in the water (stamina ${Math.round(st.stamina)}) — swim for the shore!`;
  else if(st.tb<35.7)m=SURV()?`You are dangerously cold (body ${temperature(st.tb.toFixed(1))}). Get to a fire or shelter now!`:`You are shivering (body ${temperature(st.tb.toFixed(1))}) and moving slowly. A fire or shelter will warm you.`;
  else if(st.tb<36.2&&(player.netW||0)<0)m=`You're getting cold (body ${temperature(st.tb.toFixed(1))}, losing ${Math.round(-(player.netW||0))} W). A fire, shelter or clothing would help.`;
  else if(SURV()&&st.thirst<15)m="You are badly dehydrated — drink soon.";
  else if(SURV()&&st.hunger<15)m="You are starving — eat something soon.";
  else if(SURV()&&st.health<30)m="Your health is low — rest by a fire, eat and drink.";
  else if(st.tb>39)m="You are overheating — find shade or water.";
  if(m){toast("⚠ "+m);warnT=14;world.counters.warnings=(world.counters.warnings||0)+1}else warnT=2}
let lastHurtSnd=0;
function hurt(n,why,cause){if(!SURV())return setback(n,why,cause);const st=world.st;st.health-=n;if(why){toast(why+` (−${Math.round(n)} health)`);if(performance.now()-lastHurtSnd>400){AU.hurt();lastHurtSnd=performance.now()}}
  if(st.health<=0&&!player.dead)die(why||"Your body gave out",cause||"unknown")}
let setbackSnd=0,rescueT=0;
function setback(n,why,cause){   // Discovery mode: danger never hurts, drains or shoves you; only an exhausted swim needs a rescue
  if(cause==="drowning")return washAshore();
  if(cause==="a wildfire"&&performance.now()-setbackSnd>4000){setbackSnd=performance.now();toast("Too hot — step back from the burning trees.")}}
function washAshore(){if(performance.now()-rescueT<3000)return;rescueT=performance.now();const P=player.pos;
  for(let r=4;r<600;r+=4)for(let a=0;a<24;a++){const x=P.x+Math.cos(a/24*6.283)*r,z=P.z+Math.sin(a/24*6.283)*r;if(heightAt(x,z)>.6){player.pos.set(x,heightAt(x,z),z);player.vel.set(0,0,0);player.swimming=false;world.st.stamina=40;
    world.counters.rescues=(world.counters.rescues||0)+1;toast("Exhausted, you let the current carry you — you wash up on the shore, cold and wet but alive.");updateChunks(true);return}}}
function die(why,cause){
  player.dead=true;world.deaths++;world.counters.deathsBy[cause]=(world.counters.deathsBy[cause]||0)+1;player.zoom=false;
  const o=$("#wDeath");o.hidden=false;o.innerHTML=`<div class="box"><h2>YOU DIED</h2><p>${esc(why)}.</p><p class="muted">Cause: ${esc(cause)}. Your knowledge survives. What you carried stays in a bundle where you fell — walk back to recover it. You will wake at your camp.</p><button class="primary" id="wRespawn">RETURN TO CAMP</button></div>`;
  $("#wRespawn").onclick=respawn;try{document.exitPointerLock?.()}catch(_){}AU.hurt();
}
function respawn(){
  // what you carried stays where you fell, in a bundle you can walk back to (on the shore if you drowned)
  if(Object.keys(world.inv).length){let x=player.pos.x,z=player.pos.z;if(heightAt(x,z)<.2){const [cx,cz]=world.camp;for(let k=0;k<=1;k+=.02){const xx=x+(cx-x)*k,zz=z+(cz-z)*k;if(heightAt(xx,zz)>.3){x=xx;z=zz;break}}}
    for(let i=world.structures.length-1;i>=0;i--)if(world.structures[i].type==="pack"){const o=world.structures[i];for(const k in o.items)world.inv[k]=(world.inv[k]||0)+o.items[k];scene.remove(o.obj);world.structures.splice(i,1)}
    const pk={type:"pack",x,y:heightAt(x,z),z,ry:0,items:{...world.inv}};world.structures.push(pk);structMesh(pk)}
  const keep=world.worn;world.inv={};if(keep)world.worn=keep;world.held=null;world.left=null;world.order=[];world.dur={};
  Object.assign(world.st,{health:70,hunger:60,thirst:60,stamina:100,tb:37,wet:0,sick:0,sprain:0});
  player.dead=false;player.raft=null;player.vel.set(0,0,0);player.pos.set(world.camp[0],heightAt(world.camp[0],world.camp[1])+.2,world.camp[1]);
  for(let i=animals.length-1;i>=0;i--)if(animals[i].kind==="wolf"&&animals[i].pos.distanceTo(player.pos)<60){scene.remove(animals[i].g);animals.splice(i,1)}
  $("#wDeath").hidden=true;renderHotbar();save();
}

/* ---------------- discoveries & atlas ---------------- */
function hasD(id){return world.disc.includes(id)}
const treeById=new Map(TREE.DISCOVERIES.map(d=>[d.id,d]));
function applyKnowledge(d){
  const ks=world.ks;let before=ks.revealed.length;
  for(const t of d.tree){const td=treeById.get(t);if(td)E.discover(ks,td,atlas)}
  if(atlas)for(const a of d.atlas)if(atlas.index.has(a))E.revealNode(ks,atlas,a,true);
  return ks.revealed.length-before;
}
const discLog=[];
const COOK_DISC=["cooking","maillard","caramel","baking","stew","fermentation","drying"];
// Cookbook: [discovery, dish, ingredients, method, effect]
const COOKBOOK=[["cooking","Cooking over fire","Hazelnuts, dough or meat","Hold it at a burning fire, Q","Hot meal: warms you, restores stamina"],
 ["maillard","Roasted hazelnuts","Hazelnuts","Hold them at a fire hotter than ~140 °C / 284.0 °F, Q","Hot snack"],
 ["caramel","Berry jam","Pot of boiled water + 3 dark berries","Hold the pot at a fire, Q","Sweet energy; the pot comes back"],
 ["baking","Flatbread","2 grain + pot of boiled water → dough (craft)","Bake the dough at a fire, Q","Hot meal"],
 ["stew","Stew","Pot of boiled water + hazelnuts (or meat) + grain or seeds","Hold the pot at a fire, Q","Big hot meal; the pot comes back"],
 ["fermentation","Fermented berries","4 dark berries + empty pot → mash (craft)","Wait about a day, then taste it (Q)","Fizzy and sour"],
 ["drying","Dried meat","Raw meat","Hang it on a drying rack for ~4 hours","Keeps for months"]];
function discover(id,quiet){
  if(!world||hasD(id))return false;const d=WD.get(id);if(!d)return false;
  world.disc.push(id);const added=applyKnowledge(d);discLog.push({id,gameTime:Math.round(world.gameTime),day:+(world.gameTime/86400).toFixed(2)});
  const unlocked=RECIPES.filter(r=>r.req===id).map(r=>ITEMS[r.out].name);
  if(!quiet)showDiscovery(d,added,unlocked);
  if(id!=="gastronomy"&&COOK_DISC.includes(id)&&COOK_DISC.filter(hasD).length>=5)discover("gastronomy");
  save();return true;
}
function linkedAtlasIds(d){const out=[];for(const t of d.tree){const td=treeById.get(t);if(td)out.push(...td.atlas)}out.push(...d.atlas);return [...new Set(out)].filter(a=>!atlas||atlas.index.has(a))}
function chip(id){if(!atlas)return "";const i=atlas.index.get(id);if(i===undefined)return "";const n=atlas.nodes[i],f=atlas.famById.get(n.field)||{color:"#67dcff",short:n.field};
  return `<span class="chip${n.frontier?" frontier":""}" title="${esc(n.label)} — ${esc(f.short)}\n${esc(n.summary)}"><i style="background:${f.color}"></i>${esc(n.label)}</span>`}
function showDiscovery(d,added,unlocked){
  const ids=linkedAtlasIds(d),eureka=EXPERIMENTS.has(d.id)||d.id==="sparks"||d.id==="hafting"||d.id==="refraction"||d.id.startsWith("wonder");if(PETS)PETS.eureka();
  const o=$("#wPopup");o.hidden=false;paused=true;try{document.exitPointerLock?.()}catch(_){}
  o.innerHTML=`<div class="box disc-pop${eureka?" eureka":""}">${eureka?`<div class="eurekaTag">EUREKA!</div>`:""}<small>${eureka?"EXPERIMENT":"DISCOVERY"} · ${esc(TREE.ERAS[d.age].name.toUpperCase())} · ${world.disc.length} / ${WORLD_DISCOVERIES.length}</small><h2>${esc(d.name)}</h2>
    <p class="how">${esc(d.how)}</p><h4>THE PRINCIPLE</h4><p>${esc(d.principle)}</p>
    ${ids.length?`<h4>ATLAS NODES ${atlas?`REVEALED (+${added})`:"(will appear when the atlas finishes loading)"}</h4><div class="chips">${ids.map(chip).join("")}</div>`:`<p class="muted">No matching atlas node yet — the atlas keeps this discovery unlinked.</p>`}
    ${unlocked.length?`<h4>NEW CRAFTING</h4><p>${unlocked.map(esc).join(" · ")}</p>`:""}
    <button class="primary" id="wPopOk">CONTINUE (Enter)</button></div>`;
  $("#wPopOk").onclick=closePopup;renderJournal();
  AU.milestone("discovery",d.id);const fl=$("#wFlash");if(fl){fl.classList.remove("go");void fl.offsetWidth;fl.classList.add("go")}
  if(player&&player.pos)GFX.FX.sparks(player.pos.x,player.pos.y+1.2,player.pos.z,40);
}
function closePopup(){$("#wPopup").hidden=true;paused=!!(OBS&&OBS.isOpen);clock.getDelta()}
function onAtlas(A){atlas=A;for(const id of world.disc)applyKnowledge(WD.get(id));renderJournal();toast(`Atlas loaded: ${A.total.toLocaleString()} nodes in the fog.`)}

/* ---------------- interaction ---------------- */
function frontPoint(r=1){const f=forward();return {x:player.pos.x+f.x*r,z:player.pos.z+f.z*r}}
const STRUCT_R={workbench:1,workbench_bundle:1,pack:.3,kiln:.6,table:.6,hut:1.6,house:2,well:.5,chest:.3,rack:.4,wall:.8,pendulum:.4};
const cursorAim={x:0,y:0,inside:false},hoverRay=new THREE.Raycaster(),hoverNDC=new THREE.Vector2();
let hoverAt=0,hovered=null,autoPickup=null;
// Clear route, stale input and horizontal inertia together, before modal handlers.
function stopMovement(clearKeys=true){
  const wasWalking=!!autoPickup;autoPickup=null;
  if(player)player.climbing=false;
  if(clearKeys)keys.clear();
  if(player?.vel){player.vel.x=0;player.vel.z=0;player.moveSpeed=0}
  dragging=false;if(canvasEl)canvasEl._down=null;
  const button=$("#wStopWalk");if(button)button.hidden=true;
  return wasWalking;
}
const pickupPoint=t=>t?.kind==="drop"?t.obj.pos:t?.kind==="res"?t.obj.r:null;
function cursorTarget(force=false){
  if(!started||!player||paused)return null;
  const locked=document.pointerLockElement===canvasEl;if(!locked&&!cursorAim.inside)return null;
  if(!force&&performance.now()-hoverAt<100)return hovered;hoverAt=performance.now();hovered=null;
  const rect=canvasEl.getBoundingClientRect();hoverNDC.set(locked?0:(cursorAim.x-rect.left)/rect.width*2-1,locked?0:1-(cursorAim.y-rect.top)/rect.height*2);hoverRay.setFromCamera(hoverNDC,camera);hoverRay.far=180;
  const roots=[],meta=new Map();
  for(const ch of chunks.values())if(ch.group?.visible){
    for(const [mesh,kind] of [[ch.small,"res"],[ch.sticks,"res"],[ch.plants,"res"],[ch.flowers,"res"],[ch.boulders,"boulder"],...Object.values(ch.tr).map(m=>[m,"tree"]),...Object.values(ch.cr).map(m=>[m,"tree"])])if(mesh){roots.push(mesh);meta.set(mesh,{ch,kind})}
    if(ch.terrain)roots.push(ch.terrain);if(ch.bushes)roots.push(ch.bushes);
  }
  for(const s of world.structures)if(s.obj){roots.push(s.obj);meta.set(s.obj,{kind:"struct",obj:s})}
  for(const d of world.drops)if(!d.flying){roots.push(d.mesh);meta.set(d.mesh,{kind:"drop",obj:d})}
  for(const hit of hoverRay.intersectObjects(roots,true)){
    let root=hit.object;while(root&&!meta.has(root))root=root.parent;
    const m=root&&meta.get(root);if(!m)break; // terrain and opaque scenery occlude objects behind them
    if(m.kind==="res"){const r=m.ch.obj.res.find(r=>!r.gone&&r.mesh===hit.object&&r.slot===hit.instanceId);if(r)hovered={kind:"res",obj:{ch:m.ch,r}}}
    else if(m.kind==="tree"){const t=m.ch.obj.trees.find(t=>!t.gone&&t.i===hit.instanceId);if(t)hovered={kind:"tree",obj:{ch:m.ch,t}}}
    else if(m.kind==="boulder"){const b=m.ch.obj.boulders.find(b=>b.i===hit.instanceId);if(b)hovered={kind:"boulder",obj:{ch:m.ch,b}}}
    else hovered={kind:m.kind,obj:m.obj};
    if(hovered){hovered.point=hit.point;break}
  }
  return hovered;
}
function queuePickup(t){
  if(t.kind!=="res"&&t.kind!=="drop")return false;const point=pickupPoint(t);
  if(t.kind==="res"&&["copper_ore","tin_ore","iron_ore","quartz","lodestone","pyrite"].includes(t.obj.r.type)&&!bestPick()){toast("You need a pickaxe to mine this mineral deposit.");return true}
  const obstacles=[];for(const ch of chunks.values())if(ch.group){for(const b of ch.obj.boulders)obstacles.push({x:b.x,z:b.z,r:b.s*.95});for(const tr of ch.obj.trees)if(!tr.gone)obstacles.push({x:tr.x,z:tr.z,r:.25})}
  for(const s of world.structures)if(s.type==="wall"||s.type==="house")obstacles.push({x:s.x,z:s.z,r:structureRadius(s)});
  const path=walkPath(player.pos,point,heightAt,slopeAt,obstacles);if(!path){toast("No clear land route to that item. Move closer or approach from another side.");return true}
  autoPickup={target:t,path,last:player.pos.clone(),stuck:0,elapsed:0};$("#wStopWalk").hidden=false;toast(`Walking to ${ITEMS[t.kind==="res"?t.obj.r.type:t.obj.item].name} · E / Esc / WASD / STOP cancels`);return true;
}
function updateHover(){
  let tip=$("#wHover");if(!tip){tip=document.createElement("div");tip.id="wHover";tip.setAttribute("role","tooltip");tip.className="wHover";$("#mode-world").append(tip)}
  const t=cursorTarget();if(!t||player.dead||!['wInv','wJournal','wChest','wCtx'].every(id=>$("#"+id).hidden)){tip.hidden=true;return}
  const pt=pickupPoint(t)||t.point,d=Math.hypot(pt.x-player.pos.x,pt.z-player.pos.z),far=d>2.6;
  const name=t.kind==="res"?(t.obj.r.flower?"Wildflower stem / Plant fiber":ITEMS[t.obj.r.type].name):t.kind==="drop"?ITEMS[t.obj.item].name:t.kind==="tree"?"Tree":t.kind==="boulder"?"Boulder":Object.values(ITEMS).find(i=>i.place===t.obj.type)?.name||t.obj.type;
  const action=far&&(t.kind==="res"||t.kind==="drop")?`E · walk over & ${t.kind==="res"&&["copper_ore","tin_ore","iron_ore","quartz","lodestone","pyrite"].includes(t.obj.r.type)?"mine (pickaxe required)":"pick up"}`:far?"Move closer to interact":targetLabel(t);
  tip.textContent=`${name} · ${Math.round(d)} m\n${action}`;tip.hidden=false;
  const rect=$("#mode-world").getBoundingClientRect(),locked=document.pointerLockElement===canvasEl;
  tip.style.left=Math.max(8,Math.min(rect.width-300,(locked?rect.width/2:cursorAim.x-rect.left)+18))+"px";tip.style.top=Math.max(8,Math.min(rect.height-85,(locked?rect.height/2:cursorAim.y-rect.top)+18))+"px";
}
function structureRadius(s){return s.type==="fire"?fuelLayout(s).radius:STRUCT_R[s.type]??.2}
function findTarget(){
  const cursor=cursorTarget();if(cursor){const p=pickupPoint(cursor)||cursor.point;if(p&&Math.hypot(p.x-player.pos.x,p.z-player.pos.z)<=2.6)return cursor}
  const fp=frontPoint(.9),x=fp.x,z=fp.z;let best=null,bd=2.4;
  const cons=(kind,obj,d)=>{if(d<bd){bd=d;best={kind,obj}}};
  for(const d of world.drops)if(!d.flying)cons("drop",d,Math.hypot(d.pos.x-x,d.pos.z-z)+(d.floating?.3:0));
  for(const ch of nearbyChunks(x,z,4)){
    for(const r of ch.obj.res)if(!r.gone)cons("res",{ch,r},Math.hypot(r.x-x,r.z-z));
    for(const t of ch.obj.trees)if(!t.gone)cons("tree",{ch,t},Math.hypot(t.x-x,t.z-z)-.4);
    for(const b of ch.obj.boulders)cons("boulder",{ch,b},Math.hypot(b.x-x,b.z-z)-b.s);
  }
  if(PETS){const pt=PETS.target(x,z);if(pt)cons("pet",pt.e,pt.d)}
  for(const a of animals)if(!a.dead)cons("animal",a,Math.hypot(a.pos.x-x,a.pos.z-z)-.25-a.sp.size*.4+(a.kind==="dog"?1.2:0)); // the dog never hides what you're reaching for
  for(const s of world.structures)if(s.type!=="raft"||!player.raft)cons("struct",s,Math.hypot(s.x-x,s.z-z)-structureRadius(s));
  if(!best&&(heightAt(x,z)<0||player.swimming))best={kind:"water"};
  return best;
}
const sleepable=t=>t==="leanto"||t==="hut"||t==="house";
function feedFire(s,kg,kind){if(s.type==="fire")recordFuelPiece(s,kg,kind);addFuel(s,kg)}
const HAND_FUEL={stick:.5,log:5,charcoal:.08};
function fireSiteError(){
  const p=frontPoint(1.8);
  if(player.swimming||heightAt(p.x,p.z)<0)return "Move onto land to build a firewood pile";
  if(slopeAt(p.x,p.z)>.6)return "Face flatter ground to build a firewood pile";
  if(world.structures.some(s=>Math.hypot(s.x-p.x,s.z-p.z)<structureRadius(s)+.7))return "Face clear ground away from other structures";
  return "";
}
// The HUD and Q share this decision: advertised costs and requirements are the
// same ones checked before consuming anything. k/other are relative to selection.
function nearbyHandFire(){const distance=s=>Math.hypot(s.x-player.pos.x,s.z-player.pos.z)-(s.type==="fire"?Math.max(1.7,structureRadius(s)):1.7);return world.structures.filter(s=>BURN.has(s.type)&&distance(s)<.9).sort((a,b)=>distance(a)-distance(b))[0]}
function drillRain(fire){return isRaining()&&(!sheltered(player.pos.x,player.pos.z)||fire&&!sheltered(fire.x,fire.z))}
let drilling=null,drillProp=null;
function clearDrill(){drilling=null;if(drillProp){drillProp.traverse(m=>{m.geometry?.dispose();m.material?.dispose()});GFX.disposeGroup(drillProp);drillProp=null}if(player?.model){const u=player.model.userData;u.held.visible=u.heldL.visible=true}}
function stepDrill(dt){
  const k=world[activeHand==="L"?"left":"held"],other=world[activeHand==="L"?"held":"left"],fire=nearbyHandFire();
  if(!keys.has("KeyQ"))player.drillRest=false;
  const wants=!player.drillRest&&keys.has("KeyQ")&&k==="hand_drill"&&!player.dead&&!player.swimming&&['wInv','wJournal','wChest','wCtx'].every(id=>document.getElementById(id).hidden)&&Math.hypot(player.vel.x,player.vel.z)<.2&&!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].some(c=>keys.has(c));
  const error=wants?drillProblem({fire,other,stamina:world.st.stamina,rain:drillRain(fire),swimming:player.swimming,tinder:inv("fiber")}):'';
  for(const s of world.structures)if(s._drill&&(!wants||error||s!==fire))advanceDrill(s._drill,dt,false);
  if(!wants||error){if(drilling&&error){toast(error);if(world.st.stamina<8)player.drillRest=true}clearDrill();return}
  if(!fire._drill)fire._drill={progress:0,tinder:!!fire.drillTinder};
  if(!fire._drill.tinder){if(!take("fiber"))return;fire._drill.tinder=fire.drillTinder=true;toast("Tinder nest prepared (1 plant fiber). Keep Q held to rotate the spindle; release to rest.")}
  drilling=fire;world.st.stamina=Math.max(0,world.st.stamina-dt*6);
  const result=advanceDrill(fire._drill,dt,true);
  if(!drillProp){drillProp=primitiveItem("hand_drill");scene.add(drillProp)}
  const f=forward();player.yaw=Math.atan2(f.x,f.z);
  const p=frontPoint(.38),y=heightAt(p.x,p.z);drillProp.position.set(p.x,y+.16,p.z);drillProp.children[1].rotation.y+=dt*32;
  if(result.smoke&&Math.random()<dt*12)GFX.FX.emit(GFX.FX.alpha,{t:"smoke",x:p.x,y:y+.1,z:p.z,vx:.03,vy:.2,vz:0,life:1.5,s:.1});
  if(result.ember){fire.lit=true;fire.heat=.3;delete fire._drill;delete fire.drillTinder;AU.ignite();toast("Friction makes an ember; the tinder catches and lights the wood! Your hand-drill kit is kept.");clearDrill();discover("fire")}
}
function quickCarve(){const k=world[activeHand==="L"?"left":"held"];
  if(k==="log")return craft("hand_drill");if(k==="flake")return craft("knife_stone");if(ITEMS[k]?.tool==="knife")return craft("bench_joint");
  toast("Hold a flake + B for a knife; log + B for a hand drill; knife + B for a notched bench joint.");
}
function handFireAction(k,other,t=findTarget()){
  if(t?.kind==="pet"&&PET_INFO[t.obj.kind].likes.includes(k)||t?.kind==="animal"||t?.kind==="struct"&&t.obj.type==="pendulum")return null;
  const fire=nearbyHandFire();
  if(k==="hand_drill"){
    const problem=player.drillRest?"Release Q and rest, then hold Q to try again":drillProblem({fire,other,stamina:world.st.stamina,rain:drillRain(fire),swimming:player.swimming,tinder:inv("fiber")});
    const pct=Math.floor((fire?._drill?.progress||0)*100);
    return {kind:"drill",fire,error:problem,text:problem||`Hold Q rotate spindle · ${pct}% · ${pct>70?"hot dust → ember":pct>35?"smoking wood dust":"building friction heat"} · release to rest`};
  }
  if(k in HAND_FUEL&&!(k==="log"&&t?.kind==="boulder")){
    if(fire)return {kind:"fuel",fire,text:`Q add ${ITEMS[k].name.toLowerCase()} to ${fire.type==="fire"?"fire":fire.type} (+${HAND_FUEL[k]} kg fuel)`};
    if(k==="stick"){const error=inv("stick")<3?`Need ${3-inv("stick")} more stick${inv("stick")===2?"":"s"} (3 total)`:fireSiteError();return {kind:"build",error,text:error||"Q build firewood pile here · uses 3 sticks · then equip flint + pyrite"}}
  }
  if((k==="flint"||k==="pyrite")&&fire){
    const need=k==="flint"?"pyrite":"flint",slot=hotbarItems().indexOf(need),equip=`V → ${slot>=0&&slot<10?(slot+1)%10:ITEMS[need].name} in the other hand`;
    const error=fire.lit?"The fire is already burning. Neither stone was consumed.":fire.fuel<=0?"No fuel — hold sticks or a log and press Q to add it":!inv(need)?`Find ${ITEMS[need].name.toLowerCase()} to strike against ${ITEMS[k].name.toLowerCase()}`:other&&other!==need?`Need ${ITEMS[need].name.toLowerCase()} in the other hand · ${equip}`:"";
    return {kind:"spark",fire,need,error,text:error||(other===need?"Q strike flint + pyrite → light fire · stones kept":`Q ready ${ITEMS[need].name.toLowerCase()} in empty hand & light fire · stones kept`)};
  }
  if((k==="flint"||k==="pyrite")&&t?.kind!=="boulder")return {kind:"guide",text:"Need a firewood pile first · hold 3 sticks, then Q on clear ground"};
  return null;
}
function handActionLabel(t){const left=activeHand==="L",k=left?world.left:world.held,a=handFireAction(k,left?world.held:world.left,t);let text=a?.text||"";
  if(k==="log")text+=(text?" · ":"")+"B carve fire-drill kit (knife required)";
  if(k==="tally")text=`Q carve a counting notch · ${world.counters.tally} recorded · Tab → Experiments shows your record`;
  if(k==="spear")text="Q throw spear · click nearby wildlife to thrust · E recover thrown spear";
  if(k==="flake")text="B shape stone knife · flake becomes the blade";
  if(ITEMS[k]?.tool==="knife")text="B carve notched joint (1 log) · I craft axe, pickaxe or workbench";
  if(k==="stone"&&world[left?"held":"left"]==="stone")text="Q strike suitable stones → sharp flakes (uses one stone)";
  return text?`${left?"LEFT":"RIGHT"} HAND · ${text}`:""}
function targetLabel(t){
  if(!t)return "";const k=world.held;
  if(t.kind==="pet")return PETS.label(t.obj,k);
  if(t.kind==="drop")return `E  pick up ${ITEMS[t.obj.item].name}`;
  if(t.kind==="res"&&t.obj.r.flower)return "E gather stem → Plant fiber (no tool needed)";
  if(t.kind==="res")return `E  ${["copper_ore","tin_ore","iron_ore","quartz","lodestone","pyrite"].includes(t.obj.r.type)?"mine (pickaxe)":"gather"} ${ITEMS[t.obj.r.type].name}`;
  if(t.kind==="tree")return t.obj.t.burning?"Burning tree":bestAxe()?`E  chop tree (${ITEMS[bestAxe()].name.toLowerCase()})`:"E  break off sticks";
  if(t.kind==="boulder")return k==="log"?"Q  lever the boulder with the log":k==="flint"||k==="stone"?"Q knap suitable stone → 2 flakes (uses 1 stone)":bestPick()?"E mine boulder with pickaxe":"E pry loose stone · pickaxe needed for further mining";
  if(t.kind==="animal"){const a=t.obj;if(a.kind==="dog")return "Your dog";if(a.kind==="wolf"&&WOLF_FOOD.has(k))return "Q  offer food to the wolf";if(k&&isMelee(k))return `Q  strike the ${a.kind}`;return a.kind[0].toUpperCase()+a.kind.slice(1)}
  if(t.kind==="water")return "E  drink"+(k==="pot"?" · Q fill pot":"");
  const s=t.obj;
  if(s.type==="fire"){const residue=(s.charcoal||0)>=.05||(s.ash||0)>=.01;
    return s.lit?`Fire ${temperature(s.temp)} · ${s.fuel.toFixed(1)} kg fuel · E add fuel`:residue?(s.heat>.08||s.temp>55?`Cooling fire bed · ${temperature(s.temp)} · wait to collect charcoal & ash`:`Cold fire bed · E collect charcoal & ash · ${s.fuel.toFixed(1)} kg unburned fuel · Q relight`):`Firewood pile (${s.fuel.toFixed(1)} kg) · Q light with flint+pyrite, hand drill or lens`;}
  if(s.type==="torch")return s.lit?`Torch · about ${Math.round(s.fuel*8)} h of fuel · E add a stick`:`Unlit torch · Q light it (flint + pyrite) · E add a stick`;
  if(s.type==="kiln")return `Kiln ${temperature(Math.round(s.temp))}${s.bellows?" · bellows":""} · ${s.fuel.toFixed(1)} kg fuel · E add fuel · Q put held item in`;
  if(s.type==="table")return "E  study (1 hour)";
  if(s.type==="workbench"||s.type==="workbench_bundle")return "E workbench · four supports, notched joints, wedges & plant-fiber lashings";
  if(s.type==="raft")return "E  board raft";
  if(s.type==="crop")return cropGrowth(s)>=1?"E  harvest crop":`Crop ${Math.round(cropGrowth(s)*100)}% grown`;
  if(sleepable(s.type))return `${{leanto:"Lean-to",hut:"Hut",house:"Stone house"}[s.type]} · E sleep until dawn (at night)`;
  if(s.type==="gnomon")return "Shadow stick";
  if(s.type==="pack")return `E  recover your belongings (${Object.values(s.items||{}).reduce((a,b)=>a+b,0)} items)`;
  if(s.type==="chest")return `E  open storage chest (${Object.values(s.items||{}).reduce((a,b)=>a+b,0)} items)`;
  if(s.type==="rack"){const ready=s.meat.filter(t0=>world.gameTime-t0>=4*3600).length;return `Drying rack · ${s.meat.length-ready} drying, ${ready} ready · Q hang dark berries or meat · E collect`}
  if(s.type==="well")return `Well · E drink${k==="pot"?" · Q fill pot":""}`;
  if(s.type==="wall")return "Palisade wall";
  if(s.type==="pendulum")return s.swingT!=null?`Counting swings… ${Math.floor(s.swingT/(2*Math.PI*Math.sqrt(s.L/G_ACC)))} / 10`:`Pendulum, length ${s.L} m · E time 10 swings · Q change length`;
  return "";
}
function cropGrowth(s){const wellNear=structuresNear(s.x,s.z,12,"well").length>0;return clamp((world.gameTime-s.planted)/(20*3600)*(s.cold?.5:1)*(wellNear?1.6:1),0,1)}
function interact(override=null){
  if(player.actCd>0||player.dead)return;const aim=override||cursorTarget(true);
  if(aim&&!override){const p=pickupPoint(aim)||aim.point;if(Math.hypot(p.x-player.pos.x,p.z-player.pos.z)>2.6){queuePickup(aim);return}}
  const t=override||aim||findTarget();if(!t)return;
  if(t.kind==="drop"||t.kind==="res"){GFX.playOnce(player.model,"PickUp_Table",.6);AU.pickup()}
  if(t.kind==="pet"){PETS.pet(t.obj);return}
  if(t.kind==="drop"){const d=t.obj,n=d.n||1;if(!roomFor(d.item)&&!(d.item==="satchel"))return toast(`Your pack is full (${capacity()} slots). Drop something first.`);
    const fit=Math.min(n,roomFor(d.item)||n);scene.remove(d.mesh);world.drops.splice(world.drops.indexOf(d),1);give(d.item,fit);if(fit<n){const r=addDrop(d.item,d.pos.x,d.pos.y,d.pos.z);r.n=n-fit}stowMsg(d.item,fit);return}
  if(t.kind==="res"){const {ch,r}=t.obj;if(r.gone)return;if(!roomFor(r.type))return toast("Your backpack is full. Make room before gathering.");const ore=["copper_ore","tin_ore","iron_ore","quartz","lodestone","pyrite"].includes(r.type);if(ore&&!bestPick())return toast("This mineral deposit needs a pickaxe. Craft a stone knife, then lash a stone head to a handle with plant fiber (I).");if(ore){useTool(bestPick(),1);AU.chop()}
    r.gone=true;r.mesh.setMatrixAt(r.slot,ZERO);r.mesh.instanceMatrix.needsUpdate=true;world.removed.add(ch.key+"|r"+r.i);
    const n=r.type==="stick"?2:1;give(r.type,n);if(r.type==="fiber"&&Math.random()<.4)give("seeds");stowMsg(r.type,n);return}
  if(t.kind==="tree"){const {ch,t:tr}=t.obj;if(tr.burning)return toast("Too hot — it's burning!");const ax=bestAxe();
    if(ax){player.actCd=.3;tr.hits=(tr.hits||0)+ITEMS[ax].power;useTool(ax,1);AU.chop();GFX.playOnce(player.model,"Punch_Cross",.4);
      if(tr.hits>=6){tr.gone=true;world.removed.add(ch.key+"|t"+tr.i);refreshTree(ch,tr);give("log",tr.burnt?1:2);give("stick",2);toast("Timber! Logs gathered.")}else toast(`Chop… ${Math.min(99,Math.round(tr.hits/6*100))}%`)}
    else{tr.sticks=(tr.sticks||0)+1;if(tr.sticks>3)return toast("No more reachable branches here. An axe could fell the tree.");give("stick");AU.pickup();toast("Broke off a stick.")}return}
  if(t.kind==="boulder"){const {b}=t.obj,pk=bestPick(),max=pk?12:1;b.mined=b.mined||0;if(b.mined>=max)return toast(pk?"This boulder is worked out. Find another outcrop.":"No more loose stones. A pickaxe can mine deeper; an axe is for trees.");
    b.mined++;player.actCd=.45;give("stone");if(pk)useTool(pk,1);AU.chop();GFX.playOnce(player.model,"Punch_Cross",.4);GFX.FX.dust(b.x,b.y+.5,b.z,6);toast(pk?"The pickaxe breaks stone from the boulder.":"You pry a loose stone from the boulder.");return}
  if(t.kind==="animal"){const a=t.obj;if(a.kind==="dog"){toast("Your dog wags its tail.");return}return toast(`A ${a.kind}. ${a.kind==="wolf"?"Careful.":"It watches you warily."}`)}
  if(t.kind==="water"){world.st.thirst=Math.min(100,world.st.thirst+25);AU.drink();if(!SURV()){world.counters.untreated=1;toast("You drink from the water. It tastes of earth — untreated water can carry microbes you cannot see.")}else if(Math.random()<.12)makeSick(60,"You drank untreated water and feel ill.");else toast("You drink from the water.");return}
  const s=t.obj;
  if(s.type==="fire"&&!s.lit&&((s.charcoal||0)>=.05||(s.ash||0)>=.01)){
    if(s.heat>.08||s.temp>55)return toast("The embers are still hot. Wait for the fire bed to cool before collecting it.");
    let collected=0;for(const [k,unit] of [["charcoal",.05],["ash",.01]]){const n=Math.floor(((s[k]||0)+1e-8)/unit);if(n){const got=give(k,n);s[k]-=got*unit;collected+=got}}
    toast(collected?"Collected cooled fire remains. Unburned wood stays here.":"Your Backpack is full. Make room for the fire remains.");return}
  if(BURN.has(s.type)){if(s.type!=="torch"&&take("log")){feedFire(s,5,"log");toast("Added a log (5 kg).")}else if(take("stick")){feedFire(s,.5,"stick");toast(`Added a stick (0.5 kg${s.type==="torch"?" ≈ 4 hours of torchlight":""}).`)}else if(take("charcoal")){feedFire(s,.08,"charcoal");toast("Added charcoal from a previous fire.")}else toast("No firewood left in your Backpack. Gather more logs or sticks (E); the fire can take more.");AU.place();return}
  if(s.type==="pack"){for(const k in s.items)give(k,s.items[k]);scene.remove(s.obj);world.structures.splice(world.structures.indexOf(s),1);AU.pickup();toast("You recover your belongings.");renderHotbar();return}
  if(s.type==="raft"){player.raft=s;toast("You board the raft. Move with WASD; walk into land to step ashore.");return}
  if(s.type==="table")return study(s);
  if(s.type==="workbench"||s.type==="workbench_bundle"){invCraftFor=null;$("#wInv").hidden=false;renderInventory();toast("Workbench: four corner supports carry split boards. Housed notches locate the frame; wooden wedges and twisted plant-fiber lashings hold it together. No nails.");return}
  if(s.type==="crop"){if(cropGrowth(s)>=1){s.obj&&scene.remove(s.obj);world.structures.splice(world.structures.indexOf(s),1);give("grain",3);give("seeds",2);AU.pickup();toast("Harvested 3 grain and 2 seeds.");discover("agriculture")}else toast(`The crop is ${Math.round(cropGrowth(s)*100)}% grown. Crops take about a day; a well nearby speeds them up.`);return}
  if(sleepable(s.type))return sleep(s);
  if(s.type==="chest")return openChest(s);
  if(s.type==="rack")return rackCollect(s);
  if(s.type==="well"){world.st.thirst=Math.min(100,world.st.thirst+40);AU.drink();toast("Cool, clean water from deep underground.");discover("groundwater");return}
  if(s.type==="pendulum")return pendStart(s);
}
function useHeld(){
  if(player.actCd>0||player.dead)return;
  const k=world.held,t=findTarget(),s=t&&t.kind==="struct"?t.obj:null;
  if(s&&s.type==="pendulum"&&s.swingT==null){s.L=PEND_L[(PEND_L.indexOf(s.L)+1)%PEND_L.length];setPendLen(s);toast(`Pendulum length set to ${s.L} m.`);return}
  if(!k)return toast("Nothing in hand.");
  if(ITEMS[k]?.tool==="knife")return toast("Stone knife: hold a log + B to carve a hand drill, or hold this knife + B to carve a bench joint. I shows lashed axe and pickaxe recipes.");
  if(ITEMS[k]?.tool==="axe"&&t?.kind==="tree"||ITEMS[k]?.tool==="pickaxe"&&(t?.kind==="boulder"||t?.kind==="res"))return interact();
  if(ITEMS[k]?.tool==="axe"||ITEMS[k]?.tool==="pickaxe")return toast(ITEMS[k].tool==="axe"?"Face a tree and E or Q to chop; use a pickaxe for rock.":"Face a boulder or mineral deposit and E or Q to mine.");
  if(k==="hand_drill"){const a=handFireAction(k,world.left,t);if(a?.error)return toast(a.error);return toast("Hold Q continuously to rotate the spindle. Wood on wood makes hot dust, then an ember in the tinder.")}
  if((k==="stone"&&(t?.kind==="boulder"||world.left==="stone"))||(k==="flint"&&world.left==="stone"&&t?.kind!=="struct")){
    if(k==="stone"&&world.left==="stone"&&inv("stone")<2)return toast("You need two stones: a suitable core and a hammerstone.");
    take(k);give("flake",2);player.actCd=.4;AU.strike();GFX.playOnce(player.model,"Punch_Cross",.4);discover("knapping");toast("Knapped a suitable stone core into 2 sharp flakes. Hold a flake and B to make a stone knife; the hammerstone is kept.");return;
  }
  const fireNear=nearbyHandFire();
  const raining=isRaining()&&!sheltered(player.pos.x,player.pos.z);
  if(t?.kind==="pet"&&k&&PET_INFO[t.obj.kind].likes.includes(k))return void PETS.offer(t.obj,k);
  if(WOLF_FOOD.has(k)){const cw=animals.find(a=>a.kind==="wolf"&&!a.dead&&a.curious&&a.pos.distanceTo(player.pos)<3.2);if(cw)return feedWolf(cw,k)}   // a curious wolf right beside you takes priority over a pet in view
  if(t?.kind==="animal"){const a=t.obj;if(a.kind==="wolf"&&WOLF_FOOD.has(k))return feedWolf(a,k);if(SURV()&&isMelee(k)&&a.kind!=="dog")return melee(a,k)}
  const handAction=handFireAction(k,world.left,t);
  if(handAction?.kind==="build"){
    if(handAction.error)return toast(handAction.error);
    const p=place("fire");if(!p)return;
    take("stick",3);world.counters.crafted=(world.counters.crafted||0)+1;player.actCd=.35;
    toast("Built a firewood pile with 3 sticks. Equip flint + pyrite in your hands (V switches hand, 1–0 equips), then Q to light it.");renderInventory();return;
  }
  if(handAction?.kind==="fuel"){
    const f=handAction.fire;take(k);feedFire(f,HAND_FUEL[k],k);player.actCd=.35;AU.place();
    toast(`Added ${ITEMS[k].name.toLowerCase()} (+${HAND_FUEL[k]} kg fuel).${f.lit?" The fire will grow as it heats up.":" Equip flint + pyrite and Q to light it."}`);return;
  }
  if(k==="flint"||k==="pyrite"){
    if(handAction?.kind==="spark"){
      if(handAction.error)return toast(handAction.error);
      if(!world.left){world.left=handAction.need;renderHotbar()}
    }
    const canSpark=inv("flint")&&inv("pyrite");
    if(canSpark&&fireNear?.lit)return toast("The fire is already burning. Neither stone was consumed.");
    if(canSpark&&fireNear&&!fireNear.lit){GFX.playOnce(player.model,"Punch_Cross",.5);GFX.FX.sparks(fireNear.x,fireNear.y+.35,fireNear.z,30);AU.strike();player.actCd=.3;
      if(fireNear.fuel<=0)return toast("Sparks fly, but there's no fuel. Add sticks first.");if(raining&&Math.random()<.7)return toast("Sparks fly, but the tinder is soaked by rain.");
      fireNear.lit=true;fireNear.heat=.3;AU.ignite();toast(fireNear.type==="torch"?"The torch flares into light.":"Sparks catch the dry tinder — fire!");discover("fire");if(fireNear.type==="kiln")discover("kiln");return}
    if(k==="flint"&&t?.kind==="boulder"){GFX.playOnce(player.model,"Punch_Cross",.5);const fp=frontPoint(.6);GFX.FX.sparks(fp.x,player.pos.y+1,fp.z,10);GFX.FX.dust(fp.x,player.pos.y+.6,fp.z,6);AU.strike();player.actCd=.3;
      take("flint");give("flake",2);toast("Knapped 1 flint into 2 sharp stone flakes — check your Backpack.");discover("knapping");return}
    if(canSpark){GFX.playOnce(player.model,"Punch_Cross",.5);const fp=frontPoint(.7);GFX.FX.sparks(fp.x,player.pos.y+.35,fp.z,30);AU.strike();return toast(fireNear?"The fire is already burning.":"Sparks need fuel: hold 3 sticks and press Q on clear ground to build a firewood pile.")}
    return toast(k==="flint"?"Flint + pyrite in your hands strike sparks. V switches hand; numbers equip. Hold 3 sticks and Q to build a pile. Aim at a boulder to knap (uses 1 flint).":"Pyrite + flint in your hands strike sparks without consuming either stone. V switches hand; numbers equip. Hold 3 sticks and Q to build a pile.");
  }
  if(k==="lens"){if(fireNear&&!fireNear.lit){if(sunElevation()>.25&&world.weather.kind==="clear"){fireNear.lit=true;fireNear.heat=.3;AU.ignite();toast("The lens focuses sunlight to a burning point — smoke, then flame!");discover("optics");if(fireNear.type==="kiln")discover("kiln")}else toast("You need strong, direct sunlight to focus.");return}return toast("A lens: try focusing the sun onto a firewood pile.")}
  if(k==="log"&&t?.kind==="boulder"){const {ch,b}=t.obj,f=forward();b.x+=f.x*1.6;b.z+=f.z*1.6;b.y=heightAt(b.x,b.z);setInst(ch.boulders,b.i,b.x,b.y+b.s*.35,b.z,b.s*1.2,b.s*.8,b.s,b.i);ch.boulders.instanceMatrix.needsUpdate=true;world.moved[ch.key+"|"+b.i]=[b.x,b.z];AU.place();toast("With a long lever, the boulder rolls.");discover("lever");return}
  if(k==="berry_dark"&&s?.type==="rack"){s.fruit=s.fruit||[];if(s.meat.length+s.fruit.length>=6)return toast("The rack is full.");take("berry_dark");s.fruit.push(world.gameTime);toast("You spread the berries on the rack to dry in the air. About 4 hours.");return}
  if(k==="meat_raw"&&s?.type==="rack"){if(s.meat.length>=4)return toast("The rack is full.");take("meat_raw");s.meat.push(world.gameTime);updateRack(s);toast("You hang the meat in strips to dry. It will take about 4 hours.");return}
  if(k==="meat_raw"&&fireNear?.lit&&fireNear.temp>70){take("meat_raw");give("meat_cooked");AU.ignite();if(PETS)PETS.distract("cook");toast("The meat sizzles and cooks through.");discover("cooking");return}
  if(k==="nuts"&&fireNear?.lit&&fireNear.temp>140){take("nuts");give("nuts_roasted");AU.ignite();toast("The hazelnuts crackle and turn golden-brown — a toasty smell rises.");discover("cooking");discover("maillard");return}
  if(k==="dough"&&fireNear?.lit&&fireNear.temp>180){take("dough");give("flatbread");AU.ignite();if(PETS)PETS.distract("cook");toast("The dough puffs and browns on the hot stones: flatbread!");discover("cooking");discover("baking");return}
  if(k==="pot_clean"&&fireNear?.lit&&fireNear.temp>120){const main=inv("meat_raw")?"meat_raw":inv("nuts")?"nuts":null,veg=["grain","seeds"].find(v=>inv(v));
    if(main&&veg){take("pot_clean");take(main);take(veg);give("stew");AU.ignite();if(PETS)PETS.distract("cook");toast(`${ITEMS[main].name} and ${ITEMS[veg].name.toLowerCase()} simmer gently in the pot: stew.`);discover("stew");return}
    if(inv("berry_dark")>=3){take("pot_clean");take("berry_dark",3);give("jam");AU.ignite();toast("The berries bubble down, darken and thicken into sticky jam.");discover("caramel");return}
    return toast("A pot of clean water simmers. Add ingredients to your pack: hazelnuts (or meat) + grain or seeds for stew, or 3 dark berries for jam.")}
  if(k==="berry_mash")return tasteMash();
  if(k==="clay"&&fireNear?.lit&&fireNear.temp>550&&fireNear.type!=="kiln"){take("clay");give("pot");toast(`Fired at ${temperature(Math.round(fireNear.temp))}, the clay becomes a ceramic pot.`);discover("ceramics");return}
  if(k==="clay"&&fireNear?.lit&&fireNear.type!=="kiln")return toast(`The fire is only ${temperature(Math.round(fireNear.temp))} — let it build up (clay needs ~600 °C / 1,112.0 °F).`);
  if(k==="pot"&&s?.type==="well"){take("pot");give("pot_clean");AU.drink();toast("You draw a pot of clean, filtered well water.");discover("groundwater");return}
  if(k==="pot"&&(t?.kind==="water"||player.swimming||heightAt(frontPoint(1.2).x,frontPoint(1.2).z)<0)){take("pot");give("pot_water");AU.splash(false);toast("Filled the pot with water.");return}
  if(k==="pot_water"&&fireNear?.lit&&fireNear.temp>150){const alt=Math.max(0,player.pos.y),bp=100-alt/285;take("pot_water");give("pot_clean");AU.ignite();
    toast(`The water boils at ${temperature(bp.toFixed(1))} here (altitude ${Math.round(alt)} m).`);const B=world.counters.boils;B.push(+alt.toFixed(1));discover("boiling");if(world.counters.untreated)discover("hygiene");
    const lo=Math.min(...B),hi=Math.max(...B);if(hi-lo>=150){toast(`Compared: ${temperature((100-lo/285).toFixed(1))} at ${Math.round(lo)} m vs ${temperature((100-hi/285).toFixed(1))} at ${Math.round(hi)} m — lower air pressure, lower boiling point.`);discover("pressure")}
    else if(B.length>1)toast(`Your boiling tests so far span ${Math.round(hi-lo)} m of altitude. Try one at least 150 m higher or lower.`);return}
  if(k==="pot_water"&&fireNear?.lit)return toast(`The flame is still only ${temperature(Math.round(fireNear.temp))} — give it a moment to build up heat before boiling.`);
  if(fireNear?.type==="kiln"&&fireNear.lit&&["copper_ore","tin_ore","iron_ore","sand","copper","tin","clay"].includes(k))return kilnUse(fireNear,k);
  if(k==="bellows"&&fireNear?.type==="kiln")return kilnUse(fireNear,k);
  if(k==="seeds"){if(player.swimming)return;let wet=structuresNear(player.pos.x,player.pos.z,12,"well").length>0;for(let a=0;a<16&&!wet;a++)for(const r of [6,12,18])if(heightAt(player.pos.x+Math.cos(a/16*6.283)*r,player.pos.z+Math.sin(a/16*6.283)*r)<0)wet=true;
    if(!wet)return toast("These seeds need water nearby to grow — plant within ~18 m of water, or next to a well.");
    take("seeds");place("crop",{planted:world.gameTime,cold:airTemp(player.pos.x,player.pos.z,player.pos.y)<8});toast("Planted. Crops need water, light and warmth — about a day to grow.");return}
  if(k==="tally"){world.counters.tally++;AU.chop();renderHotbar();toast(`Tally: ${world.counters.tally} notches recorded.${world.counters.tally===1?" Q adds one; Tab → Experiments keeps your count. Ten notches unlock measured throw records.":""}`);if(world.counters.tally>=10)discover("counting");return}
  if(k==="tablet"){if(!hasD("counting"))return toast("You have nothing to record yet — learn to count first.");toast("You press counted marks into the wet clay.");discover("writing");return}
  if(k==="gnomon"){take("gnomon");place("gnomon",{planted:world.gameTime});toast("Shadow stick planted. Watch its shadow over the next hour of daylight.");return}
  if(k==="lodestone"){const near=nearbyChunks(player.pos.x,player.pos.z,4).some(ch=>ch.obj.res.some(r=>!r.gone&&r.type==="iron_ore"&&Math.hypot(r.x-player.pos.x,r.z-player.pos.z)<3));
    if(inv("iron_ore")||near){toast("The lodestone tugs at the iron ore!");discover("magnetism")}else toast("A heavy black stone. Try it near iron ore.");return}
  if(k==="compass"){const h=((Math.atan2(-forward().x,-forward().z)*180/Math.PI)+360)%360;toast(`The floating lodestone settles north–south. You face ${Math.round(h)}° from north.`);discover("compass");return}
  if(k==="telescope"){player.zoom=!player.zoom;if(player.zoom){if(PETS)PETS.distract("telescope");player.camPitch=Math.min(player.camPitch,-.55);toast(isNight()?"You raise the telescope. Aim with the mouse at the Moon or the bright planet; Q to lower it.":"You raise the telescope. The sky objects are best seen at night. Q to lower it.")}return}
  if(k==="prism")return usePrism();
  const it=ITEMS[k];
  if(it.weapon)return fireWeapon(k);
  if(it.place){take(k);const p=place(it.place);if(!p){give(k);return}
    if(it.place==="leanto"||it.place==="hut"||it.place==="house"){world.camp=[p.x,p.z];toast(`${ITEMS[k].name.replace(" kit","")} built. This is your camp now: you'll wake here if you die. E inside to sleep at night.`);if(it.place==="leanto")discover("shelter");if(it.place==="house")discover("masonry")}
    else if(it.place==="torch"){const src=world.structures.find(o=>o!==p&&o.lit&&Math.hypot(o.x-p.x,o.z-p.z)<8);if(src){p.lit=true;p.heat=.4;AU.ignite();toast("You light the torch from the fire. Wolves avoid its light.")}else toast("Torch placed. Light it with flint + pyrite (Q), or place it near a fire.")}
    else if(it.place==="raft")toast("Raft launched. E to board.");else if(it.place==="table")toast("Study table ready. E to study.");
    else if(it.place==="well")toast(`You dig down about ${Math.max(1,Math.round(heightAt(p.x,p.z)))} m and water seeps in from the ground. E to drink, Q with a pot to fill it.`);
    else if(it.place==="pendulum")toast("Pendulum frame built. E to start timing ten swings; Q to change the length.");
    else if(it.place==="chest")toast("Storage chest built. E to open it.");else if(it.place==="rack")toast("Drying rack built. Hang raw meat on it with Q.");
    else toast(`${it.name} placed.`);return}
  if(it.food||it.drink)return eat();
  throwHeld();
}
function tasteMash(){const t=world.counters.mashT,age=t==null?0:(world.gameTime-t)/3600;
  if(age<18)return toast(`The berry mash smells sweet and flat. Give it time (${Math.max(1,Math.round(18-age))} more hours) — something invisible needs to work.`);
  take("berry_mash");give("pot");world.st.stamina=Math.min(100,world.st.stamina+10);AU.eat();toast("Fizzy, sour and faintly alcoholic! Tiny bubbles rise — the mash has fermented.");discover("fermentation");return true}
function kilnUse(k,item){
  if(item==="bellows"){if(!k.bellows){take("bellows");k.bellows=true;AU.place();toast("Bellows fitted: forced air raises the kiln temperature.")}return}
  const T=k.temp;
  const need={copper_ore:1085,tin_ore:1000,iron_ore:1200,sand:1000,clay:550,copper:1085,tin:232};
  if(need[item]&&T<need[item])return toast(`The kiln is ${temperature(Math.round(T))} — this needs about ${temperature(need[item])}.${item==="iron_ore"?" Fit bellows for more air.":""}`);
  if(item==="copper_ore"){take(item);give("copper");AU.ignite();toast("Molten copper beads out of the ore.");discover("smelting");return}
  if(item==="tin_ore"){take(item);give("tin");AU.ignite();toast("Bright tin is reduced from the cassiterite.");return}
  if(item==="iron_ore"){if(!hasD("bronze"))return toast("Your furnace craft isn't advanced enough yet — master bronze first.");take(item);give("iron");AU.ignite();toast("A spongy iron bloom forms. Hammer it into shape.");discover("iron");return}
  if(item==="sand"){take(item);give("glass");AU.ignite();toast("The sand fuses into glass.");discover("glass");return}
  if(item==="clay"){take(item);give("pot");discover("ceramics");return}
  if((item==="copper"&&inv("tin"))||(item==="tin"&&inv("copper"))){if(T<1085)return toast(`The kiln is ${temperature(Math.round(T))} — copper must melt (about 1085 °C / 1,985.0 °F) to alloy.`);take("copper");take("tin");give("bronze");AU.ignite();toast("Copper and tin melt together into bronze.");discover("bronze");return}
  toast(item==="copper"||item==="tin"?"Molten metal alone won't change. Add the other metal for an alloy.":"Nothing happens in the kiln.");
}
function eat(){
  const k=world.held,it=k&&ITEMS[k];if(!it||!(it.food||it.drink))return toast("You can't eat or drink that.");
  const st=world.st;
  if(it.drink){take(k);give("pot");st.thirst=Math.min(100,st.thirst+it.drink);AU.drink();if(k==="pot_water"&&!SURV())world.counters.untreated=1;if(k==="pot_water"&&SURV()&&Math.random()<.12)makeSick(60,"Unboiled water — you feel ill.");else toast("Refreshing.");return}
  if(k==="berry_mash")return tasteMash();
  take(k);if(it.pot)give("pot");st.hunger=Math.min(100,st.hunger+it.food);AU.eat();
  if(!SURV()){st.stamina=Math.min(100,st.stamina+it.food);if(it.hot){st.warmT=Math.max(st.warmT||0,180);st.tb=Math.min(37.4,st.tb+.3)}}
  if(k==="berry_red")SURV()?makeSick(45,"Bitter… these red berries make you sick."):toast("Bitter! You spit them out — many bitter plants carry toxic alkaloids. Your tongue is an old chemical detector.");
  else if(k==="meat_raw")SURV()&&Math.random()<.35?makeSick(60,"Raw meat — food poisoning!"):toast(SURV()?"You chew the raw meat.":"Raw meat is tough and risky — cooking kills parasites. Try it at a fire.");
  else toast(`You eat the ${it.name.toLowerCase()}.${!SURV()&&it.hot?" It warms you from the inside.":""}`);
  if(k.startsWith("berry")&&!world.counters.berries.includes(k)){world.counters.berries.push(k);if(world.counters.berries.length>=2)discover("edible")}
}
function craft(out){
  const r=RECIPES.find(x=>x.out===out);if(!r)return false;
  if(r.req&&!hasD(r.req))return false;if(r.tool&&!craftTool(r.tool)){toast(`You need a ${ITEMS[r.tool].name}.`);return false}
  const problem=gearProblem(r,inv,world.structures,player.pos);if(problem){toast(problem);return false}
  for(const k in r.in)if(inv(k)<r.in[k]){toast("Missing ingredients.");return false}
  for(const k in r.in)take(k,r.in[k]);if(r.ret)give(r.ret);if(out==="berry_mash")world.counters.mashT=world.gameTime;give(out,r.n||1);setHand(activeHand,out);AU.craft();if(PETS)PETS.distract("craft");
  world.counters.crafted=(world.counters.crafted||0)+1;
  toast(`Crafted ${r.n>1?r.n+"× ":""}${ITEMS[out].name}.${ITEMS[out].place?" Press Q to place it.":""}`);
  if(out==="clothing"){take("clothing");world.worn="clothing";toast("You wear the hide clothing.");discover("clothing")}
  if(out==="wheel")discover("wheel");
  if(out==="tally")toast("Tally stick: a reusable counting record. Equip it and Q to carve a notch; Tab → Experiments shows the saved total. Ten notches unlock measured throw records.");
  if(out==="spear")toast("Spear ready: Q throws it; click nearby wildlife to thrust. Recover the thrown spear with E.");
  if(out==="knife_stone")toast("Stone knife ready. Hold a log + B for a fire-drill kit; hold the knife + B to carve a notched bench joint. I shows the axe and pickaxe recipes.");
  if(out==="hand_drill")toast("Hand drill carved: spindle + notched hearth board. Stow your other hand, carry plant fiber and HOLD Q beside a dry firewood pile.");
  if(out==="bench_joint")toast("Notched joint carved. F inspects the open shoulders and matching tongue. Four joints make a workbench frame (I).");
  if(r.tool)useTool(craftTool(r.tool),3);
  if(r.unlock)discover(r.unlock);if(out==="pot")discover("ceramics");
  if(out==="climbing_gloves"){stow(true);toast("Climbing gloves equipped. Walk uphill to climb; your hands grip steep ground.")}
  if(GEAR_STEPS[out]){craftStory=out;GFX.playOnce(player.model,"Interact",.9)}
  renderHotbar();renderInventory();return true;
}
function study(table){
  const ks=world.ks;if(PETS)PETS.distract("study",{table});
  world.gameTime+=3600;world.st.hunger=Math.max(0,world.st.hunger-3);world.st.thirst=Math.max(0,world.st.thirst-4);
  discover("scholarship",true);
  const known=ks.known.length,insight=12+3*known+(inv("telescope")?20:0)+(inv("lens")?8:0);
  ks.turn=Math.floor(world.gameTime/86400);
  const av=E.available(ks);let newTree=[];
  if(av.length){const target=av.slice().sort((a,b)=>E.costOf(a)-E.costOf(b)||(b.gateway-a.gateway)||(a.id<b.id?-1:1))[0];
    ks.progress[target.id]=(ks.progress[target.id]||0)+insight*.5;
    if(ks.progress[target.id]>=E.costOf(target)){E.discover(ks,target,atlas);newTree.push(target.name)}}
  const before=ks.revealed.length;
  if(atlas)E.studyAtlas(ks,atlas,av.length?insight*.5:insight);
  const mapped=ks.revealed.length-before;
  toast(`An hour of study: ${Math.round(insight)} insight${newTree.length?` — rediscovered ${newTree.join(", ")}`:""}${atlas?`; mapped ${mapped} atlas node${mapped===1?"":"s"}`:" (atlas still loading)"}.`);
  renderJournal();save();
}
function sleep(s){
  const h=hourOf();if(!(h>=19||h<5))return toast("You can only sleep through the night (after 19:00).");
  if(animals.some(a=>a.kind==="wolf"&&!a.dead&&!a.calm&&a.pos.distanceTo(player.pos)<30))return toast("Wolves are prowling close by — too dangerous to sleep.");
  const hrs=h>=19?24-h+6.5:6.5-h,st=world.st,lv=Math.max(shelterLevel(player.pos.x,player.pos.z),{leanto:1,hut:2,house:3}[s.type]||1);
  const warmFire=world.structures.some(o=>o.lit&&o.type!=="torch"&&Math.hypot(o.x-player.pos.x,o.z-player.pos.z)<6&&o.fuel>hrs*.6);
  for(const o of world.structures)if(o.lit){o.fuel-=hrs*(o.type==="torch"?.125:o.type==="kiln"?1.3:1);if(o.fuel<=0){o.fuel=0;o.lit=false;o.heat=0}}
  world.gameTime+=hrs*3600;st.hunger=Math.max(0,st.hunger-hrs*2.4);st.thirst=Math.max(0,st.thirst-hrs*3);st.stamina=100;st.wet=0;
  const night=airTemp(player.pos.x,player.pos.z,player.pos.y);
  if(lv<2&&!warmFire&&night<10&&world.worn!=="clothing"){st.tb=35.4;st.health=Math.max(5,st.health-15);toast("You wake in the grey dawn, shivering and stiff — the night was too cold without a fire.")}
  else{st.tb=37;if(st.hunger>10&&st.thirst>10)st.health=Math.min(100,st.health+hrs*3);toast(`You sleep ${hrs.toFixed(1)} hours and wake at dawn, rested.`)}
  if(st.sprain>0)st.sprain=0;
  for(let i=animals.length-1;i>=0;i--)if(animals[i].kind==="wolf"){scene.remove(animals[i].g);animals.splice(i,1)}
  world.counters.sleeps++;world.counters.howled=dayNum()+1;save();
}
let chestOpen=null;
function openChest(s){chestOpen=s;s.items=s.items||{};const el=$("#wChest");el.hidden=false;try{document.exitPointerLock?.()}catch(_){}renderChest()}
function renderChest(){const el=$("#wChest");if(!el||el.hidden||!chestOpen)return;const s=chestOpen;
  const row=(k,n,act)=>`<div class="invItem"><i style="background:#${ITEMS[k].color.toString(16).padStart(6,"0")}"></i>${esc(ITEMS[k].name)} <b>×${n}</b><button data-${act}="${k}">${act==="store"?"STORE ▸":"◂ TAKE"}</button></div>`;
  el.innerHTML=`<div class="pHead"><h3>STORAGE CHEST</h3><button data-close>✕</button></div><div class="chestCols"><div><h4>CARRIED</h4>${Object.keys(world.inv).map(k=>row(k,world.inv[k],"store")).join("")||"<p class=muted>Nothing carried.</p>"}<button data-storeall="1" class="ghost">Store everything except tools</button></div>
   <div><h4>IN THE CHEST</h4>${Object.keys(s.items).map(k=>row(k,s.items[k],"take")).join("")||"<p class=muted>Empty.</p>"}</div></div>`}
function chestMove(k,store,all){const s=chestOpen;if(!s)return;const n=all?(store?inv(k):s.items[k]||0):1;if(store){if(!take(k,n))return;s.items[k]=(s.items[k]||0)+n}else{if(!(s.items[k]>=n))return;s.items[k]-=n;if(s.items[k]<=0)delete s.items[k];give(k,n)}AU.pickup();renderChest()}
function rackCollect(s){const fr=(s.fruit||[]).filter(t=>world.gameTime-t>=4*3600).length;if(fr){s.fruit=s.fruit.filter(t=>world.gameTime-t<4*3600);give("berries_dried",fr);AU.pickup();toast(`Collected ${fr} dried berries — shrivelled, sweet and long-keeping.`);discover("drying");if(!s.meat.some(t=>world.gameTime-t>=4*3600))return}
  const ready=s.meat.filter(t=>world.gameTime-t>=4*3600).length;
  if(!ready)return toast(s.meat.length?`Still drying — about ${Math.max(.1,(4*3600-(world.gameTime-Math.min(...s.meat)))/3600).toFixed(1)} h to go.`:"The rack is empty. Hold raw meat and press Q to hang it.");
  s.meat=s.meat.filter(t=>world.gameTime-t<4*3600);give("meat_dried",ready);updateRack(s);AU.pickup();toast(`Collected ${ready} dried meat. Dried meat keeps and is safe to eat.`);discover("drying")}
function pendStart(s){if(s.swingT!=null)return toast("Already counting swings…");if(!hasD("counting"))return toast("It swings back and forth with a steady beat — but you can't keep count yet.");
  s.swingT=0;const nd=PETS&&PETS.distract("pendulum");s._jig=nd?nd.jiggle:0;toast(`Counting ten swings of the ${s.L} m pendulum…`)}
function stepPendulums(dt){for(const s of world.structures){if(s.type!=="pendulum"||!s.arm)continue;const T=2*Math.PI*Math.sqrt(s.L/G_ACC);
  if(s.swingT==null){s.arm.rotation.z*=Math.max(0,1-dt*.5);continue}
  s.swingT+=dt;s.arm.rotation.z=.32*Math.cos(2*Math.PI*s.swingT/T);
  if(s.swingT>=10*T){const meas=10*T+(Math.random()-.5)*.4+(s._jig||0)*(Math.random()<.5?-1:1),Tm=meas/10,g=4*Math.PI*Math.PI*s.L/(Tm*Tm);s.swingT=null;world.counters.pend.push({L:s.L,T:+Tm.toFixed(3),g:+g.toFixed(2)});
    toast(`Ten swings took ${meas.toFixed(1)} s → T = ${Tm.toFixed(2)} s, so g = 4π²L/T² ≈ ${g.toFixed(2)} m/s².`);
    if(new Set(world.counters.pend.map(p=>p.L)).size>=2)discover("pendulum");else toast("Now change the length (Q) and time it again. Does the beat change? Does the weight matter?")}}}
let spectrum=null;
function usePrism(){
  if(!(sunElevation()>.12&&world.weather.amt<.3&&world.weather.kind!=="cloudy"&&!sheltered(player.pos.x,player.pos.z)))return toast("The prism needs direct sunlight — try on a clear day, out in the open.");
  if(!spectrum){spectrum=new THREE.Group();[0xff2020,0xff8a10,0xffee20,0x30e040,0x2080ff,0x4b30c0,0x9a40e0].forEach((c,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(.16,1.3),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}));m.rotation.x=-Math.PI/2;m.position.x=(i-3)*.16;spectrum.add(m)});scene.add(spectrum)}
  const fp=frontPoint(1.6);spectrum.position.set(fp.x,heightAt(fp.x,fp.z)+.04,fp.z);spectrum.rotation.y=player.camYaw;spectrum.visible=true;spectrum.userData.t=8;
  toast("Sunlight fans out into a band of colours on the ground: red, orange, yellow, green, blue, indigo, violet.");discover("prism");
}

/* ---------------- UI ---------------- */
const contextSeen=new Set();
function contextNotice(text){
  const key=text.replace(/-?\d+(?:\.\d+)?/g,"#");
  if(!text||contextSeen.has(key))return;
  contextSeen.add(key);if(contextSeen.size>200)contextSeen.delete(contextSeen.values().next().value);
  toast(text);
}
function toast(m){const el=$("#wToast");if(!el)return;const d=document.createElement("div");d.textContent=m;el.prepend(d);while(el.children.length>5)el.lastChild.remove();setTimeout(()=>d.remove(),5000);toastLog.push(m);if(toastLog.length>400)toastLog.shift()}
const toastLog=[];
function bar(n,v,col,txt,warn){return `<div class="hb${warn?" warn":""}"><span>${n}</span><div class="t"><i style="width:${clamp(v,0,100)}%;background:${col}"></i></div><b>${txt}</b></div>`}
let hudT=0;
function renderHUD(){
  const st=world.st,h=hourOf(),hh=Math.floor(h),mm=Math.floor((h-hh)*60);
  $("#wBars").innerHTML=(SURV()?bar("HEALTH",st.health,"#ff4d67",Math.round(st.health),st.health<30)+bar("FOOD",st.hunger,"#ffc857",Math.round(st.hunger),st.hunger<15)+bar("WATER",st.thirst,"#55a8ff",Math.round(st.thirst),st.thirst<15):"")+bar("STAMINA",st.stamina,"#64e886",Math.round(st.stamina))+
    bar("BODY",(st.tb-30)/(42-30)*100,st.tb<35.5?"#7fb4ff":st.tb>38.5?"#ff7a3a":"#c8e9ff",temperature(st.tb),st.tb<35.8||st.tb>39)+(st.wet>.05?bar("WET",st.wet*100,"#3a7bd5",Math.round(st.wet*100)+"%"):"")+
    (!SURV()&&st.tb<35.6?`<div class="hb sick">SHIVERING · slowed</div>`:"")+(!SURV()&&st.warmT>0?`<div class="hb tag">WARM MEAL</div>`:"")+(st.sick>0?`<div class="hb sick">SICK</div>`:"")+(st.sprain>0?`<div class="hb sick">SPRAINED ANKLE</div>`:"")+(player.crouch?`<div class="hb tag">CROUCHING · quiet</div>`:"")+(player.shelter?`<div class="hb tag">${["","LEAN-TO","HUT","STONE HOUSE"][player.shelter]} · sheltered</div>`:"");
  const day=Math.floor(world.gameTime/86400)+1,w=world.weather,Ta=player.Ta??airTemp(player.pos.x,player.pos.z,player.pos.y);
  const wk=w.kind==="storm"?"Thunderstorm":w.kind==="drystorm"?"Dry storm":w.amt>.3?(Ta<.5?"Snow":"Rain"):w.kind==="cloudy"?"Cloudy":"Clear";
  $("#wTime").innerHTML=`<b>Day ${day} · ${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}</b><span>${wk}${snapNow()?" · COLD SNAP":""} · air ${temperature(Ta.toFixed(1))}</span><span>${esc(TREE.ERAS[world.ks.era].name)} · ${world.disc.length}/${WORLD_DISCOVERIES.length} discoveries</span><span>${atlas?`Knowledge ${world.ks.revealed.length.toLocaleString()} / ${atlas.total.toLocaleString()}`:"Atlas loading…"}</span>`;
  if(player.readout){const sp=player.vel.length(),alt=player.pos.y;
    $("#wReadout").hidden=false;$("#wReadout").innerHTML=`speed ${sp.toFixed(2)} m/s · vertical ${player.vel.y.toFixed(2)} m/s<br>altitude ${alt.toFixed(1)} m · g = ${G_ACC} m/s²<br>air ${temperature(Ta.toFixed(1))} · body ${temperature(st.tb.toFixed(2))} · net heat ${Math.round(player.netW||0)} W<br>fire radiant ${Math.round(player.fireW||0)} W · wet ${Math.round(st.wet*100)}%<br>water boils at ${temperature((100-Math.max(0,alt)/285).toFixed(1))} here<br>your noise ${playerNoiseDb()} dB @1 m (−20·log₁₀ r)${inv("compass")?`<br>heading ${Math.round(((Math.atan2(-forward().x,-forward().z)*180/Math.PI)+360)%360)}°`:""}<br>biome ${biomeAt(player.pos.x,player.pos.z,heightAt(player.pos.x,player.pos.z))}`}
  else $("#wReadout").hidden=true;
    {const cursor=cursorTarget(),t=cursor||findTarget(),pt=pickupPoint(cursor),distant=pt&&Math.hypot(pt.x-player.pos.x,pt.z-player.pos.z)>2.6,action=distant?"":handActionLabel(t),target=distant?`E walk to ${ITEMS[t.kind==="res"?t.obj.r.type:t.obj.item].name} & collect · WASD cancels`:targetLabel(t);const text=player.dead?"":action?(target?`${action} · ${target}`:action):target;const prompt=$("#wPrompt");prompt.textContent=text;prompt.hidden=true;contextNotice(text);}
  renderObjectives();
}
function guideCtx(){return {has:hasD,inv,night:isNight(),hour:hourOf(),day:dayNum(),cold:(player.Ta??20)<10||world.st.tb<36.3,wet:world.st.wet>.5,sick:world.st.sick>0,sickCount:world.counters.sick,untreated:!!world.counters.untreated,
  nearWater:nearWater(player.pos.x,player.pos.z,14),struct:t=>world.structures.some(s=>s.type===t),seen:world.counters.species.length,storm:world.weather.kind==="storm"||world.weather.kind==="drystorm",
  wolfSeen:!!world.counters.wolfSeen,era:world.ks.era,allDone:world.disc.length>=WORLD_DISCOVERIES.length}}
function nearWater(x,z,r){for(let a=0;a<12;a++)for(const rr of [r*.5,r])if(heightAt(x+Math.cos(a/12*6.283)*rr,z+Math.sin(a/12*6.283)*rr)<0)return true;return false}
let objHTML="";
function duskNeedsFire(){const h=hourOf();if(!(h>=16.8||h<5))return false;return !world.structures.some(s=>s.lit&&s.type==="fire"&&Math.hypot(s.x-player.pos.x,s.z-player.pos.z)<25)}
function duskCheck(){const h=hourOf(),C=world.counters;if(h>=16.8&&h<20&&C.duskWarned!==dayNum()&&duskNeedsFire()){C.duskWarned=dayNum();toast(hasD("fire")?"🔥 The sun is low. First priority: get a fire burning before dark — nights here are truly dark, and wolves fear the flames.":"🔥 The sun is low. First priority: hold 3 sticks and Q to build a pile, then flint + pyrite and Q to light it — nights here are truly dark.")}}
function renderObjectives(){const el=$("#wObj");if(!el)return;const c=guideCtx(),open=(duskNeedsFire()?[["o_dusk","🔥 Dusk: light a fire before nightfall",()=>false]]:[]).concat(OBJECTIVES.filter(o=>!o[2](c))).slice(0,3),done=OBJECTIVES.length-OBJECTIVES.filter(o=>!o[2](c)).length;
  const html=`<h5>OBJECTIVES <small>${done}/${OBJECTIVES.length}</small></h5>`+open.map((o,i)=>`<div class="ob${i?"":" now"}"><i></i>${esc(o[1])}</div>`).join("");if(html!==objHTML){el.innerHTML=html;objHTML=html}}
let thoughtT=8,thoughtShowT=0;
function stepCuriosity(dt){thoughtT-=dt;thoughtShowT-=dt;const el=$("#wThought");if(el&&thoughtShowT<=0&&!el.hidden)el.hidden=true;if(thoughtT>0)return;thoughtT=4;
  const since=(world.counters.lastThought??-1e9),now=world.gameTime;if(now-since<(world.seenQ.length<4?1800:3600))return;
  const c=guideCtx();const q=CURIOSITY.find(q=>!world.seenQ.includes(q.id)&&!hasD(q.ans)&&q.when(c));if(!q)return;
  world.seenQ.push(q.id);world.counters.lastThought=now;if(el){el.innerHTML=`<small>CURIOSITY · press J for your journal</small>${esc(q.q)}`;el.hidden=false;thoughtShowT=11}}
const ICON={bark:"🪵",thread:"🧵",leather:"🟫",hammer_stone:"🔨",tongs:"🗜",needle_iron:"🪡",iron_spike:"📌",leather_gloves:"🧤",climbing_gloves:"🧤",knife_copper:"🔪",knife_bronze:"🔪",knife_iron:"🔪",knife_stone:"🔪",pickaxe_stone:"⛏",hand_drill:"🪵",bench_joint:"🧩",workbench:"🛠",workbench_bundle:"🛠",charcoal:"◼",ash:"◻",berries_dried:"🍇",nuts_roasted:"🌰",jam:"🍯",dough:"🫓",flatbread:"🫓",stew:"🍲",berry_mash:"🍷",stick:"🥢",log:"🪵",stone:"🪨",flint:"🔪",pyrite:"✨",clay:"🟫",fiber:"🌾",berry_red:"🍒",berry_dark:"🫐",seeds:"🌱",grain:"🌾",meat_raw:"🥩",meat_dried:"🥓",meat_cooked:"🍖",hide:"🟤",flake:"🔺",
  axe_stone:"🪓",axe_copper:"🪓",axe_bronze:"🪓",axe_iron:"🪓",spear:"🔱",tally:"🧮",clothing:"🧥",pot:"🏺",pot_water:"💧",pot_clean:"♨️",copper_ore:"🟢",tin_ore:"⚪",iron_ore:"🔴",copper:"🟠",tin:"🔘",bronze:"🥉",iron:"⚫",
  quartz:"💎",sand:"⏳",glass:"🔷",lens:"🔍",lodestone:"🧲",tablet:"📜",gnomon:"🕐",bellows:"🪗",wheel:"☸️",telescope:"🔭",compass:"🧭",campfire:"🔥",leanto:"⛺",kiln:"🏭",raft:"🛶",table:"📚",sling:"🪃",bow:"🏹",arrow:"➶",
  prism:"🌈",torch:"🕯️",hut:"🛖",house:"🏠",chest:"🧰",rack:"🪜",well:"🪣",wall:"🧱",pendulum:"⏱️",shell:"🐚",feather:"🪶",leaf:"🍃",snow:"❄️",nuts:"🌰",satchel:"🎒"};
const icon=k=>ICON[k]||"•";
const hex=k=>"#"+ITEMS[k].color.toString(16).padStart(6,"0");
function handMesh(anchor,k){if(!anchor)return;const revision=k==="tally"?world.counters.tally:0;if(anchor.userData.k===k&&anchor.userData.revision===revision)return;anchor.userData.revision=revision;while(anchor.children.length){const c=anchor.children[0];anchor.remove(c)}anchor.userData.k=k||null;if(!k)return;
  const m=itemMesh(k);m.castShadow=true;const bs=new THREE.Box3().setFromObject(m),sz=bs.getSize(new THREE.Vector3()),mx=Math.max(sz.x,sz.y,sz.z);const limit=k==="spear"?1.95:.45;if(mx>limit)m.scale.multiplyScalar(limit/mx);m.position.set(0,.02,0);m.userData.item=k;anchor.add(m)}
function renderHotbar(){
  const el=$("#wHotbar");if(!el||!world)return;const ks=hotbarItems();
  if(world.held&&!world.inv[world.held])world.held=ks.find(x=>x!==world.left)||null;if(world.left&&!world.inv[world.left])world.left=null;
  el.innerHTML=ks.slice(0,10).map((k,i)=>{const it=ITEMS[k],du=it.dur&&world.dur[k]!=null?world.dur[k]/it.dur:null;return `<div class="slot${k===world.held?" on":""}${k===world.left?" onL":""}" data-k="${k}" data-hot="${i}" title="${esc(it.name)}${ESSENTIAL_QUICKBAR.includes(k)?" · essential quickbar item":""}" draggable="true">${ESSENTIAL_QUICKBAR.includes(k)?"<small class=essentialPin>◆</small>":""}<i style="--c:${hex(k)}">${icon(k)}</i><span>${i<9?i+1:0}</span><b>${world.inv[k]}</b><em>${esc(it.name)}</em>${du!=null?`<u style="width:${Math.round(du*100)}%"></u>`:""}</div>`}).join("")||`<div class="muted">Empty hands — press E to pick things up.</div>`;
  const h=$("#wHands");if(h)h.innerHTML=[["L","left","LEFT HAND"],["R","held","RIGHT HAND"]].map(([sd,f,label])=>{const k=world[f],selected=activeHand===sd;return `<button type="button" class="hand${k?" full":""}${selected?" selected":""}" aria-pressed="${selected}" title="Select ${label.toLowerCase()} (V)" data-select-hand="${sd}" data-hand="${sd}" ${k?`data-k="${k}"`:""}><small>${label}</small>${k?`<i style="--c:${hex(k)}">${icon(k)}</i><em>${esc(ITEMS[k].name)}</em>`:"<em class=muted>empty</em>"}<b class="stowK">${selected?"SELECTED · 1–0 · R stow":"Click to select"}</b></button>`}).join("")+`<button class="handToggle" data-toggle-hand title="Switch selected hand (V)">V ⇄<small>Switch hand</small></button>`;
  const u=player?.model?.userData;if(u){handMesh(u.held,world.held);handMesh(u.heldL,world.left)}
}
const CAT_NAMES={cooking:"COOKING & KITCHEN",build:"BUILDING & CAMP",tools:"TOOLS & GEAR",weapons:"HUNTING & DEFENCE",science:"SCIENCE & RECORDS"};
let invQ="",invSort="",invCraftFor=null,dropAllArm=false,craftStory=null,invChain=false;
function assemblyCard(){if(!craftStory)return "";const r=RECIPES.find(r=>r.out===craftStory),steps=GEAR_STEPS[craftStory];return `<section class="craftAssembly"><h4>ASSEMBLY · ${esc(ITEMS[craftStory].name)}</h4><div class="assemblyParts">${Object.keys(r.in).map(k=>`<span>${icon(k)} ${esc(ITEMS[k].name)}</span>`).join("<b> + </b>")}<b> → </b><strong>${icon(craftStory)} ${esc(ITEMS[craftStory].name)}</strong></div><ol>${steps.map(t=>`<li>${esc(t)}</li>`).join("")}</ol><small>Materials and tools come from your inventory; no hand juggling. Process time is compressed.</small></section>`}
function itemTip(k){const it=ITEMS[k],n=NOTES[k]||[],seen=(world.observed||[]).includes(k);
  return `<b>${icon(k)} ${esc(it.name)}</b><p>${esc(n[0]||"")}</p>${seen&&n.length>1?`<p class="obs">Observed: ${esc(n.slice(1).join(" "))}</p>`:`<p class="muted">${seen?"":"Not observed yet — hold it and press F."}</p>`}<small>${it.mass} kg · ${it.density} kg/m³${it.food?` · +${it.food} food`:""}${it.power?` · power ${it.power}`:""}${it.place?" · placeable":""}</small>`}
function renderInventory(){
  const el=$("#wInv");if(!el||el.hidden)return;
  let ks=ordered();if(invQ)ks=ks.filter(k=>ITEMS[k].name.toLowerCase().includes(invQ));
  const cells=[];for(const k of ks){let n=world.inv[k];while(n>0){const c=Math.min(STACK,n);cells.push([k,c]);n-=c}}
  const cap=capacity(),used=slotsUsed();while(cells.length<(invQ?cells.length:cap))cells.push(null);
  const grid=cells.map(c=>{if(!c)return `<div class="cell empty"></div>`;const [k,n]=c,it=ITEMS[k],du=it.dur&&world.dur[k]!=null?world.dur[k]/it.dur:null;
    return `<div class="cell${k===world.held?" on":""}${k===world.left?" onL":""}" data-k="${k}" draggable="true"><i style="--c:${hex(k)}">${icon(k)}</i><b>${n}</b>${k===world.held?"<s>R</s>":""}${k===world.left?"<s class=l>L</s>":""}${du!=null?`<u style="width:${Math.round(du*100)}%"></u>`:""}</div>`}).join("");
  const chain=new Set([...GEAR_RECIPES.map(r=>r.out),"knife_stone","pickaxe_stone","campfire","kiln","bellows"]);
  const avail=RECIPES.filter(r=>(!invChain||chain.has(r.out))&&(!r.req||hasD(r.req))&&(!invCraftFor||r.in[invCraftFor])),locked=RECIPES.length-RECIPES.filter(r=>!r.req||hasD(r.req)).length;
  const rec=Object.keys(CAT_NAMES).map(cat=>{const list=avail.filter(r=>r.cat===cat);if(!list.length)return "";return `<h4>${CAT_NAMES[cat]}</h4>`+list.map(r=>{const ok=Object.entries(r.in).every(([k,n])=>inv(k)>=n)&&(!r.tool||craftTool(r.tool))&&!gearProblem(r,inv,world.structures,player.pos);
    return `<div class="rec${ok?" ok":" no"}"><b>${icon(r.out)} ${esc(ITEMS[r.out].name)}${r.n>1?` ×${r.n}`:""}</b><span>${["tally","spear"].includes(r.out)?esc(NOTES[r.out][0])+"<br>":""}${Object.entries(r.in).map(([k,n])=>`<em class="${inv(k)>=n?"have":"miss"}">${n}× ${esc(ITEMS[k].name)}</em>`).join(" ")}${r.tool?` · needs ${esc(ITEMS[r.tool].name)} or better`:""}${r.tools?` · tools: ${r.tools.map(k=>esc(ITEMS[k].name)).join(", ")}`:""}${r.knife?" · needs a knife":""}${r.station?` · ${esc(gearProblem(r,inv,world.structures,player.pos)||"station ready")}`:""}${r.out.startsWith("workbench")?" · four supports + rectangular board top; housed joints, wedges & plant-fiber lashings (no nails)":r.out==="bench_joint"?" · carve shoulders and matching tongue; F inspects the joint":r.out==="hand_drill"?" · carve spindle + hearth; tinder needs 1 plant fiber per prepared fire":""}</span><button data-craft="${r.out}" ${ok?"":"disabled"}>CRAFT</button>${GEAR_STEPS[r.out]?`<details><summary>How it is made</summary><ol>${GEAR_STEPS[r.out].map(t=>`<li>${esc(t)}</li>`).join("")}</ol></details>`:""}</div>`}).join("")}).join("");
  const hands=[["L","left","LEFT HAND"],["R","held","RIGHT HAND"]].map(([sd,f,l])=>{const k=world[f];return `<div class="handBig${k?" full":""}" data-hand="${sd}" ${k?`data-k="${k}"`:""}><small>${l}</small>${k?`<i style="--c:${hex(k)}">${icon(k)}</i><em>${esc(ITEMS[k].name)}</em>`:"<em class=muted>drag an item here</em>"}</div>`}).join("");
  el.innerHTML=`<div class="pHead"><h3>BACKPACK <small class="cap">${used} / ${cap} slots · stacks of ${STACK}${world.inv.satchel?" · satchel +"+SATCHEL_SLOTS:""}</small></h3><button data-close>✕ (I)</button></div>
  <button data-open-expeditions>PLAY DISCOVERY EXPEDITIONS · L</button><button data-climb-guide>CLIMBING GLOVES · Materials & guide</button> <button data-climb-filter>${invChain?"SHOW ALL RECIPES":"CLIMBING CRAFT PATH"}</button>${assemblyCard()}<div class="invBar"><input id="wInvQ" placeholder="Search…" value="${esc(invQ)}" aria-label="Search inventory"><button data-isort="type">Sort: type</button><button data-isort="name">A–Z</button><button data-isort="count">Count</button>
  ${dropAllArm?`<span class="warnTxt">Drop everything on the ground?</span><button data-dropall="yes" class="danger">Yes, drop all</button><button data-dropall="no">Cancel</button>`:`<button data-dropall="arm" class="danger">Drop All Items</button>`}</div>
  <div class="hands">${hands}</div><div class="invCells">${grid}</div>
  <p class="muted">Click: equip selected hand (V switches) · right-click: more (hands, observe, use, drop…) · drag to rearrange, onto the hotbar or a hand. E pick up · F observe · R stow held item · I backpack.${world.worn?" Wearing: "+esc(ITEMS[world.worn].name)+".":""}</p>
  <h3>CRAFTING${invCraftFor?` <small>with ${esc(ITEMS[invCraftFor]?.name||"")} <button data-craftfor="">show all</button></small>`:""}</h3><div class="recs">${rec||`<p class="muted">No known recipe uses that.</p>`}</div><p class="muted">${locked?`${locked} more recipe${locked>1?"s are":" is"} still hidden in the fog — make discoveries to reveal them.`:"Every recipe is known."}</p>`;
  const q=$("#wInvQ");if(q){q.oninput=()=>{invQ=q.value.trim().toLowerCase();renderInventory();const q2=$("#wInvQ");q2.focus();q2.setSelectionRange(q2.value.length,q2.value.length)}}
}
const SORT_RANK=k=>{const r=RECIPES.find(x=>x.out===k);return ITEMS[k].tool||ITEMS[k].weapon?0:ITEMS[k].food||ITEMS[k].drink?2:r&&ITEMS[k].place?3:1};
function sortInv(by){const o=ordered();o.sort(by==="name"?(a,b)=>ITEMS[a].name.localeCompare(ITEMS[b].name):by==="count"?(a,b)=>inv(b)-inv(a):(a,b)=>SORT_RANK(a)-SORT_RANK(b)||ITEMS[a].name.localeCompare(ITEMS[b].name));world.order=o;renderHotbar();renderInventory()}
function moveTo(k,idx){const o=ordered().filter(x=>x!==k);o.splice(Math.max(0,Math.min(idx,o.length)),0,k);world.order=o;renderHotbar();renderInventory()}
/* right-click context menu */
function nearLitFire(r=3){return world.structures.find(s=>s.lit&&(s.type==="fire"||s.type==="kiln")&&Math.hypot(s.x-player.pos.x,s.z-player.pos.z)<r)||null}
function ctxActions(k,hand){const it=ITEMS[k],n=inv(k),a=[];if(!it)return a;
  if(hand){a.push(["away","Put Away"]);a.push(["swap","Swap Hands"]);a.push(["observe","Observe (F)"]);a.push(["drop1","Drop"]);return a}
  if(world.held!==k)a.push(["right","Place in Right Hand"]);if(world.left!==k)a.push(["left","Place in Left Hand"]);a.push(["observe","Observe (F)"]);
  if(it.food||it.drink)a.push(["use",it.drink||k.startsWith("pot_")?"Drink":"Eat"]);else if(it.place)a.push(["use","Place in world"]);else if(it.tool||it.weapon||["flint","pyrite","lens","log","tally","gnomon","telescope","compass","pot"].includes(k))a.push(["use","Use"]);
  if(["meat_raw","pot_water","clay","nuts","dough","pot_clean"].includes(k)&&nearLitFire())a.push(["cook",k==="clay"?"Fire in the flames":k==="pot_water"?"Boil on the fire":k==="pot_clean"?"Cook in the pot (stew / jam)":"Cook on the fire"]);
  if(RECIPES.some(r=>r.in[k]&&(!r.req||hasD(r.req))))a.push(["craftwith","Craft with…"]);
  a.push(["drop1","Drop 1"]);if(n>1){a.push(["dropx","Drop X…"]);a.push(["dropall","Drop All ("+n+")"])}return a}
function openCtx(k,x,y,hand){const m=$("#wCtx");if(!m||!inv(k))return;const tip=$("#wTip");if(tip)tip.hidden=true;const acts=ctxActions(k,hand);
  m.innerHTML=`<div class="ctxHead">${icon(k)} ${esc(ITEMS[k].name)} <b>×${inv(k)}</b></div>`+acts.map(([id,l])=>`<button data-ctx="${id}">${esc(l)}</button>`).join("")+
    `<div class="ctxX" hidden><input type="range" min="1" max="${inv(k)}" value="${Math.max(1,Math.floor(inv(k)/2))}" id="wCtxR"><input type="number" min="1" max="${inv(k)}" value="${Math.max(1,Math.floor(inv(k)/2))}" id="wCtxN"><button data-ctx="dropxgo">Drop</button></div>`;
  m.dataset.k=k;m.dataset.hand=hand||"";m.hidden=false;const r=m.parentElement.getBoundingClientRect();m.style.left=Math.min(x-r.left,r.width-210)+"px";m.style.top=Math.min(y-r.top,r.height-m.offsetHeight-8)+"px";
  const R2=$("#wCtxR"),N=$("#wCtxN");R2.oninput=()=>N.value=R2.value;N.oninput=()=>R2.value=N.value}
function closeCtx(){const m=$("#wCtx");if(m)m.hidden=true}
function ctxDo(id,k,hand,n){const side=hand==="L"?"left":"held";closeCtx();if(!inv(k))return false;
  switch(id){
    case "right":return setHand("R",k);
    case "left":return setHand("L",k);
    case "away":world[side]=null;renderHotbar();renderInventory();return true;
    case "swap":swapHands();return true;
    case "observe":$("#wInv").hidden=true;if(world.held!==k&&world.left!==k)world.held=k;renderHotbar();observeHeld(k);return true;
    case "use":case "cook":{world.held=k;renderHotbar();if(id==="use"&&(ITEMS[k].food||ITEMS[k].drink)){eat();renderInventory();return true}$("#wInv").hidden=true;useHeld();renderInventory();return true}
    case "craftwith":invCraftFor=k;renderInventory();$("#wInv").querySelector(".recs")?.scrollIntoView({block:"nearest"});return true;
    case "drop1":return dropItem(k,1)>0;
    case "dropx":{const x=$("#wCtx");x.hidden=false;x.querySelector(".ctxX").hidden=false;return true}
    case "dropxgo":return dropItem(k,n)>0;
    case "dropall":return dropItem(k,inv(k))>0}
  return false}
let jTab="disc";
function renderJournal(){
  const el=$("#wJournal");if(!el||el.hidden)return;
  const ks=world.ks;let body="";
  if(jTab==="disc")body=WORLD_DISCOVERIES.map(d=>{const k=hasD(d.id);return `<div class="jd${k?"":" fog"}"><b>${k?esc(d.name):"???"}</b><small>${esc(TREE.ERAS[d.age].name)}${EXPERIMENTS.has(d.id)?" · experiment":""}</small><p>${k?esc(d.principle):"Hint: "+esc(d.how)}</p>${k?`<div class="chips">${linkedAtlasIds(d).map(chip).join("")}</div>`:""}</div>`}).join("");
  if(jTab==="cur"){const seen=CURIOSITY.filter(q=>world.seenQ.includes(q.id));body=`<p class="muted">Questions you have wondered about. They point toward discoveries — but finding the answer is up to you.</p>`+(seen.map(q=>`<div class="jq${hasD(q.ans)?" done":""}"><i>${hasD(q.ans)?"✓":"?"}</i>${esc(q.q)}${hasD(q.ans)?`<small>Answered: ${esc(WD.get(q.ans).name)}</small>`:""}</div>`).join("")||"<p class=muted>Nothing yet — explore, gather and watch the world.</p>")}
  if(jTab==="exp"){const th=world.counters.throws,C=world.counters;body=`<p>Objects seen falling: <b>${C.falls}</b>. ${hasD("counting")?"Measured throws (vacuum prediction R = v²·sin2θ / g, g = 9.81 m/s²):":"Learn to count (tally stick) before you can measure throws."}</p>`+
    (th.length?`<table class="tt"><tr><th>item</th><th>v₀ m/s</th><th>θ°</th><th>Δh m</th><th>measured m</th><th>predicted m</th></tr>${th.slice(-12).map(t=>`<tr><td>${esc(ITEMS[t.item].name)}</td><td>${t.v}</td><td>${t.deg}</td><td>${t.dh}</td><td>${t.R}</td><td>${t.pred}</td></tr>`).join("")}</table><p class="muted">Measured range falls short of the vacuum prediction because of air drag, and differs from it when the landing is higher or lower than the launch point.</p>`:"")+
    (C.pend.length?`<h4>PENDULUM (T = 2π√(L/g))</h4><table class="tt"><tr><th>length m</th><th>period s</th><th>g m/s²</th></tr>${C.pend.slice(-8).map(p=>`<tr><td>${p.L}</td><td>${p.T}</td><td>${p.g}</td></tr>`).join("")}</table>`:"")+
    (C.drops.length?`<h4>TIMED FALLS (g = 2(v₀t + h)/t²)</h4><table class="tt"><tr><th>drop m</th><th>time s</th><th>g m/s²</th></tr>${C.drops.slice(-8).map(p=>`<tr><td>${p.dh}</td><td>${p.t}</td><td>${p.g}</td></tr>`).join("")}</table>`:"")+
    (C.boils.length?`<h4>BOILING POINT VS ALTITUDE</h4><p>${C.boils.map(a=>`${Math.round(a)} m → ${temperature((100-a/285).toFixed(1))}`).join(" · ")}</p>`:"")+
    `<p>Nights spent studying the stars: <b>${C.nights.length}</b>/3 · species observed: <b>${C.species.join(", ")||"none"}</b> · tally notches: <b>${C.tally}</b> · lightning strikes seen: <b>${C.strikes}</b></p>`}
  if(jTab==="know"){
    if(!atlas)body=`<p class="muted">The atlas is loading in the background…</p>`;
    else{const counts=E.fieldRevealCounts(ks,atlas);
      body=`<div class="bigCount"><b>${ks.revealed.length.toLocaleString()}</b> / ${atlas.total.toLocaleString()} atlas nodes revealed</div><div class="fieldBars">${atlas.families.map(f=>{const n=counts[f.id]||0,t=atlas.fieldTotals[f.id]||1,p=n/t*100;return `<div class="fb"><span style="color:${f.color}">${f.icon||""} ${esc(f.short)}</span><span class="t"><i style="width:${p.toFixed(2)}%;background:${f.color}"></i></span><span>${p>0&&p<10?p.toFixed(1):Math.round(p)}%</span></div>`}).join("")}</div>
      <h4>RECENTLY REVEALED</h4><div class="chips">${(ks.recent||[]).slice(-30).reverse().map(chip).join("")||"<span class=muted>Nothing yet.</span>"}</div>`}}
  if(jTab==="tree"){const av=E.available(ks);body=`<p>Age: <b>${esc(TREE.ERAS[ks.era].name)}</b> · discovery tree ${ks.known.length} / ${TREE.DISCOVERIES.length}. Hands-on discoveries rediscover tree entries; build a <b>study table</b> (needs Writing) and press E at it to advance the rest and map the atlas.</p><h4>OPEN TO STUDY</h4><div class="chips">${av.map(d=>`<span class="chip" title="${esc(d.note)}">${esc(d.name)} · ${Math.floor(ks.progress[d.id]||0)}/${E.costOf(d)}</span>`).join("")||"<span class=muted>none</span>"}</div><h4>KNOWN</h4><p class="muted">${ks.known.map(id=>esc(treeById.get(id)?.name||id)).join(" · ")||"none"}</p>`}
  if(jTab==="cook"){const n=COOKBOOK.filter(c=>hasD(c[0])).length;body=`<p class="muted">Your Cookbook: every dish is a small experiment in heat, chemistry and microbes. ${n} / ${COOKBOOK.length} recipes found${hasD("gastronomy")?" · <b>You are a chef.</b>":" · master five to become a chef"}.</p>`+
    COOKBOOK.map(([id,dish,ing,how,eff])=>{const k=hasD(id),d=WD.get(id);return `<div class="jd${k?"":" fog"} cookRow"><b>${k?esc(dish):"??? — "+esc(d.name)}</b><small>${k?esc(eff):"undiscovered"}</small><p>${k?`<b>Ingredients:</b> ${esc(ing)}<br><b>Method:</b> ${esc(how)}<br><i>${esc(d.principle)}</i>`:"Hint: "+esc(d.how)}</p></div>`}).join("")}
  if(jTab==="pets"){const P=world.pets;body=`<p class="muted">Companions are befriended, never caught: move quietly (C), offer food they like (Q), be patient, then pet them (E). Up to ${MAX_ACTIVE} follow you; the rest rest by your camp fire. Perks are gentle nudges, never required.</p>`+
    (P.length?P.map(p=>{const i=PET_INFO[p.kind];return `<div class="petRow"><span class="petE">${i.emoji}</span><div><input class="petName" data-petname="${p.id}" value="${esc(p.name)}" maxlength="18" aria-label="Name"><small>${esc(i.label)} · ${p.active?"following you":"resting at camp"}</small><p>${esc(i.perk)}</p></div><button data-petact="${p.id}">${p.active?"Rest at camp":"Follow me"}</button></div>`}).join(""):`<p>No companions yet. A stray cat has been seen near your camp…</p>`)+
    `<p class="muted">${PETS?PETS.activeCount():0} / ${MAX_ACTIVE} following · behaviours noticed: ${(world.counters.behav||[]).length}</p>`}
  el.innerHTML=`<div class="pHead"><h3>KNOWLEDGE JOURNAL</h3><button data-close>✕ (Tab)</button></div><div class="jTabs">${[["disc",`Discoveries ${world.disc.length}/${WORLD_DISCOVERIES.length}`],["cur",`Curiosity ${world.seenQ.length}`],["exp","Experiments"],["know","Your Knowledge"],["tree","Discovery tree"],["cook",`Cookbook ${COOKBOOK.filter(c=>hasD(c[0])).length}/${COOKBOOK.length}`],["pets",`Companions ${world.pets.length}`]].map(([k,l])=>`<button data-jtab="${k}" class="${k===jTab?"on":""}">${l}</button>`).join("")}</div><div class="jBody">${body}</div>`;
}
function togglePanel(id){stopMovement();const el=$(id);el.hidden=!el.hidden;if(!el.hidden){try{document.exitPointerLock?.()}catch(_){}if(id==="#wInv")renderInventory();else renderJournal()}}

/* ---------------- input ---------------- */
let dragging=false,lastX=0,lastY=0,canvasEl;

/* ---------------- companions & observing (pets.js / observe.js glue) ---------------- */
const DIRS=["N","NE","E","SE","S","SW","W","NW"];
function bearing(dx,dz){const h=Math.atan2(-dx,-dz);return DIRS[((Math.round(-h/(Math.PI/4))%8)+8)%8]}
function nearestRes(x,z,types,r,skip){let b=null,bd=r;for(const ch of nearbyChunks(x,z,r))for(const rr of ch.obj.res){if(rr.gone||!types.includes(rr.type))continue;const k=Math.round(rr.x)+","+Math.round(rr.z);if(skip&&skip(k))continue;const d=Math.hypot(rr.x-x,rr.z-z);if(d<bd){bd=d;b={x:rr.x,z:rr.z,type:rr.type,key:k,d}}}return b}
function nearestBoulder(x,z,r){let b=null,bd=r;for(const ch of nearbyChunks(x,z,r))for(const o of ch.obj.boulders){if(o.gone)continue;const d=Math.hypot(o.x-x,o.z-z);if(d<bd){bd=d;b={x:o.x,z:o.z,d}}}return b}
function nearestShore(x,z,r){for(let d=4;d<=r;d+=4)for(let a=0;a<12;a++){const t=a/12*Math.PI*2,px=x+Math.cos(t)*d,pz=z+Math.sin(t)*d;if(heightAt(px,pz)<-.2){const bx=x+Math.cos(t)*(d-3),bz=z+Math.sin(t)*(d-3);if(heightAt(bx,bz)>.1)return {x:bx,z:bz,d}}}return null}
function nearestDrop(x,z,r){for(let d=6;d<=r;d+=5)for(let a=0;a<12;a++){const t=a/12*Math.PI*2,px=x+Math.cos(t)*d,pz=z+Math.sin(t)*d,h=heightAt(px,pz);if(h<.3)continue;
  if(h-heightAt(px+Math.cos(t)*4,pz+Math.sin(t)*4)>5&&slopeAt(px,pz)<.9)return {x:px,z:pz,d}}return null}
function curiousSpot(x,z,exclude){ // the cat wanders to a place where an undiscovered experiment can happen
  const c=[];const add=(id,o,label,hint)=>{if(o&&!hasD(id)&&id!==exclude)c.push({...o,label,hint,key:id})};
  if(!hasD("knapping")||!hasD("lever"))add(hasD("knapping")?"lever":"knapping",nearestBoulder(x,z,40),"a big boulder",hasD("knapping")?"Could a long log move something this heavy?":"Hard stone on hard stone… what breaks off?");
  add("buoyancy",nearestShore(x,z,48),"the water's edge","Does everything float? Try tossing things in.");
  add("freefall",nearestDrop(x,z,46),"the edge of a drop","How long does a stone take to fall from up here?");
  add("edible",nearestRes(x,z,["berry_red","berry_dark"],45),"a berry bush","Two kinds of berries. Which ones are safe?");
  add("ceramics",nearestRes(x,z,["clay"],50),"a patch of clay","Clay goes soft in water and hard in fire…");
  add("magnetism",nearestRes(x,z,["lodestone"],60),"a strange dark stone","Why do iron filings cling to this one?");
  add("agriculture",nearestRes(x,z,["seeds"],40),"wild grass seeds","What happens if you plant these and water them?");
  add("sparks",nearestRes(x,z,["pyrite"],60),"a glittering stone","Fool's gold. What happens if you strike it with flint?");
  c.sort((a,b)=>a.d-b.d);return c[0]||null}
function oreSpot(x,z,seen){const r=nearestRes(x,z,["copper_ore","tin_ore","iron_ore","lodestone","pyrite","flint","quartz","clay"],55,k=>seen&&seen.includes(k));return r?{x:r.x,z:r.z,label:ITEMS[r.type].name.toLowerCase(),key:r.key}:null}
function landmark(x,z){const r=nearestRes(x,z,["iron_ore","copper_ore","tin_ore","lodestone","quartz"],260);if(r)return {dir:bearing(r.x-x,r.z-z),label:ITEMS[r.type].name.toLowerCase(),d:Math.round(r.d)};
  let best=null,bh=heightAt(x,z)+15;for(let a=0;a<16;a++)for(let d=60;d<=300;d+=60){const px=x+Math.cos(a/16*Math.PI*2)*d,pz=z+Math.sin(a/16*Math.PI*2)*d,h=heightAt(px,pz);if(h>bh){bh=h;best={dir:bearing(px-x,pz-z),label:`high ground (${Math.round(h)} m)`,d}}}return best}
function revealAtlas(n){if(!atlas)return 0;let k=0;try{const c=E.studyCandidates(world.ks,atlas,null);for(const nd of c.slice(0,n)){if(E.revealNode(world.ks,atlas,nd.id||nd))k++}}catch(_){}return k}
function dropAtFeet(item){const f=forward();addDrop(item,player.pos.x+f.x*.9,player.pos.y+.4,player.pos.z+f.z*.9,new THREE.Vector3(f.x*.6,.5,f.z*.6))}
function knockOff(table){const opts=["stick","stone","flake","berry_red","seeds","fiber","tally","nuts"].filter(k=>inv(k)>(k===world.held?1:0));const k=opts[0];if(!k)return null;take(k,1);
  const a=Math.random()*Math.PI*2;addDrop(k,table.x,heightAt(table.x,table.z)+.95,table.z,new THREE.Vector3(Math.cos(a)*1.4,.6,Math.sin(a)*1.4));renderHotbar();toast(`…and knocks your ${ITEMS[k].name.toLowerCase()} off the table. It clatters to the ground.`);return k}
let needyT=0;
function needyUI(o){const el=$("#wNeedy");if(!el)return;if(!o){el.hidden=true;return}el.hidden=false;el.innerHTML=`<span class="nE">${o.emoji}</span>${esc(o.text)}`;needyT=12}
function dogGuard(a,dt,d){const P=player.pos;let foe=null,fd=16;for(const w of animals)if(w.kind==="wolf"&&!w.dead&&!w.calm){const dd=w.pos.distanceTo(P);if(dd<fd){fd=dd;foe=w}}
  dogWarnT-=dt;if(dogWarnT<=0)for(const w of animals)if(w.kind==="wolf"&&!w.dead&&w.pos.distanceTo(P)<40){toast(`${a.data.name} growls into the dark: wolves are close.`);AU.growl();dogWarnT=40;break}
  if(!foe)return false;a.target=foe.pos.clone();a.speed=6;a.state="walk";a.atk=(a.atk||0)-dt;if(a.pos.distanceTo(foe.pos)<1.6&&a.atk<=0){foe.hp-=40;foe.flee=5;a.atk=1;AU.growl();if(foe.hp<=0)killAnimal(foe)}return true}
function dogModel(){const {g,legs}=GFX.makeAnimalModel("wolf",0xc89a62,.8);tintDog({g});return {g,legs}}
function observeHeld(k){const a=k||world.held||world.left;if(!a)return toast("Hold something to observe it closely (pick it with 1–0, then F).");OBS.open(a);const b=a===world.held?world.left:world.held;if(b&&b!==a)OBS.second(b)}
function petCtx(){return {get world(){return world},get player(){return player},scene,heightAt,slope:slopeAt,toast,AU,discover,give:(k,n)=>{give(k,n);renderHotbar()},take:(k,n)=>{take(k,n);renderHotbar()},inv,
  itemName:k=>ITEMS[k]?.name||k,clock:()=>performance.now()/1000,forward,isNight,litFireNear:(x,z,r)=>world.structures.find(s=>s.lit&&(s.type==="fire")&&Math.hypot(s.x-x,s.z-z)<r)||null,
  nearTree:(x,z,r)=>{const t=nearestTree(x,z,r);return t?t.t:null},noiseDb:playerNoiseDb,crouching:()=>!!player.crouch,curiousSpot,oreSpot,landmark,revealAtlas,dropAtFeet,knockOff,needyUI,dogModel,dogGuard}}
function obsCtx(){return {get world(){return world},ITEMS,itemMesh,esc,hasD,inv,discover,toast,insight:n=>{world.ks.studyPool=(world.ks.studyPool||0)+n;world.counters.insight=(world.counters.insight||0)+n},
  sunny:()=>sunElevation()>.15&&!isRaining()&&(world.weather?.cloud??0)<.7&&!sheltered(player.pos.x,player.pos.z),
  idea:c=>{PETS&&PETS.eureka();const f=$("#wFlash");if(f){f.classList.remove("go");void f.offsetWidth;f.classList.add("go")}toast("💡 "+c.text,7)},
  onOpen:()=>{paused=true;try{document.exitPointerLock?.()}catch(_){}},onClose:()=>{paused=!$("#wPopup").hidden;clock.getDelta();},distract:k=>PETS&&PETS.distract(k)}}
/* ---------- How to play: a short, basics-only tutorial (new game, H, ? button, settings) ---------- */
const TIPS_KEY="fog-of-knowledge:game:tips";
const tipsOn=()=>localStorage.getItem(TIPS_KEY)!=="0";
const kb=k=>`<kbd>${k}</kbd>`;
function helpPages(){return [
  {art:"🚶",t:"Move & look",b:`${kb("W")}${kb("A")}${kb("S")}${kb("D")} walk · hold ${kb("Shift")} to run · ${kb("Space")} jump or swim up · ${kb("C")} crouch (quiet).<br>Move the <b>mouse</b> to look around (click the world first to capture it). Drag up to see the sky.`},
  {art:"✋",t:"Pick things up",b:`Look at an item on the ground and press ${kb("E")}. It goes into your <b>Backpack</b> — open it with ${kb("I")}.<br>${kb("R")} puts the item in your hand back into the Backpack (${kb("Shift")}+${kb("R")}: both hands).`},
  {art:"🎒",t:"Backpack & hands",b:`Press ${kb("V")} (or click a hand below) to select left or right, then ${kb("1")}–${kb("0")} or click a hotbar item to equip it. No Backpack needed.<br>${kb("Q")} uses the selected hand; ${kb("X")} swaps held objects.<br><b>Right-click</b> an item for options: left / right hand, observe, drop, put away.`},
  {art:"🔍",t:"Observe",b:`Press ${kb("F")} to look at what you hold up close. Turn it with the mouse and read your field notes.<br>Press another item's number to look at two things together — sometimes that sparks an idea. ${kb("F")} or ${kb("Esc")} to put it away.`},
  {art:"🪨",t:"Stone tools & joinery",b:`Find <b>two suitable stones</b>. Hold one per hand (V switches hands) and Q to knap flakes; a boulder also works as the hammerstone. Hold a flake and <b>B</b> to make a stone knife.<br><b>I</b> lists the axe and pickaxe recipes: shape a wooden handle and bind its stone head with gathered plant fiber. <b>E</b> chops trees with the axe or mines outcrops with the pickaxe.<br>Hold your knife and <b>B</b> to carve notched joints from logs. <b>F</b> inspects the cutaway notch and tongue. Craft a workbench with four legs and a rectangular board top; choose single or bundled corner supports. Notches, wedges and lashings replace nails.`},
  {art:"🪵",t:"Friction fire",b:`Hold a <b>log</b> and press <b>B</b> with a stone knife in your pack: carve a thin spindle and a notched wooden hearth. Equip the reusable kit; stow the other hand.<br>Beside a dry firewood pile, <b>hold Q</b>. One plant fiber prepares a tinder nest. Both hands rotate the spindle; hot wood dust smokes, an ember forms, then the tinder lights the pile.<br>Releasing Q or moving lets the friction heat fade. Rain, wet wood and exhaustion prevent ignition. This is wood-on-wood friction; flint + pyrite remain a separate spark method.`},
  {art:"🪵",t:"Craft",b:`The Backpack has a <b>crafting list</b>. Recipes you can make light up — click one to craft it.<br><b>Quick fire:</b> hold sticks and press ${kb("Q")} on clear ground to build a pile with 3 sticks — no Backpack needed. More recipes appear as you discover things.`},
  {art:"📍",t:"Place things",b:`Hold something placeable (like the Firewood pile), look at the ground in front of you and press ${kb("Q")} to put it down.<br>${kb("Q")} (or left-click) also uses what you hold: eat, drink, throw…`},
  {art:"🔥",t:"Your first fire",b:`1. Hold <b>sticks</b> and press ${kb("Q")} on clear ground: 3 sticks become a placed <b>Firewood pile</b>.<br>2. Equip <b>flint + pyrite</b>, one per hand: ${kb("V")} switches hands, numbers equip. Beside the pile, ${kb("Q")} strikes sparks without consuming the stones. An empty second hand can ready the matching stone from your pack automatically; an occupied hand is never replaced.<br>3. Hold a <b>log or stick</b> and ${kb("Q")} beside the fire to add fuel. Read the action prompt before pressing.`},
  {art:"📖",t:"Journal, pets & settings",b:`${kb("Tab")} / ${kb("J")} journal: discoveries, knowledge and curious thoughts. Objectives are shown on the right.<br>Friendly animals may follow you — ${kb("P")} to pet a companion. ${kb("Esc")} opens settings.`,last:true}
]}
let helpPage=0,helpWasPaused=false;
function helpIsOpen(){const el=$("#wHelp");return !!el&&!el.hidden}
function renderHelp(){const el=$("#wHelp");if(!el)return;const P=helpPages(),p=P[helpPage];
  el.innerHTML=`<div class="helpCard" role="dialog" aria-label="How to play"><div class="hTop"><small>HOW TO PLAY · BASICS</small><span>${helpPage+1} / ${P.length}</span></div>
  <div class="hArt">${p.art}</div><h2>${esc(p.t)}</h2><p>${p.b}</p>
  <p class="hAgain">Minimize and reopen here anytime: press ${kb("H")} or the <b>?</b> button in the corner.</p>
  <div class="hDots">${P.map((_,i)=>`<i class="${i===helpPage?"on":""}"></i>`).join("")}</div>
  <div class="hBtns"><button data-help="back" ${helpPage?"":"disabled"}>◀ Back</button>${p.last?`<button data-help="done" class="primary">Got it</button>`:`<button data-help="minimize" class="ghost">MINIMIZE</button><button data-help="next" class="primary">Next ▶</button>`}</div></div>`}
function openClimbGuide(){stopMovement();const el=$("#wClimbHelp");el.innerHTML=`<div class="box">${CLIMB_GUIDE}<p><button data-climb-craft>OPEN BACKPACK</button> <button data-climb-min>MINIMIZE</button></p></div>`;el.hidden=false;paused=true;try{document.exitPointerLock?.()}catch(_){}}
function closeClimbGuide(){const el=$("#wClimbHelp");if(el)el.hidden=true;paused=false;stopMovement()}
function openHelp(page=(world?.counters?.helpPage??helpPage)){stopMovement();const el=$("#wHelp");if(!el)return;helpPage=clamp(Number(page)||0,0,helpPages().length-1);if(el.hidden)helpWasPaused=paused;el.hidden=false;paused=true;keys.clear();try{document.exitPointerLock?.()}catch(_){}renderHelp()}
function closeHelp(){const el=$("#wHelp");if(!el||el.hidden)return;el.hidden=true;paused=helpWasPaused&&!!(OBS&&OBS.isOpen);keys.clear();clock.getDelta();if(world){world.counters.helpSeen=1;world.counters.helpPage=helpPage}}
function helpNav(a){const n=helpPages().length;if(a==="next"){if(helpPage<n-1){helpPage++;renderHelp()}else closeHelp()}else if(a==="back"){if(helpPage>0){helpPage--;renderHelp()}}else closeHelp()}
// just-in-time tips for the basics, each shown once per world (can be turned off in settings)
let tipT=1;
function tipOnce(id,text){const C=world.counters;if(C["tip_"+id]||!tipsOn())return false;C["tip_"+id]=1;toast("💡 "+text);return true}
function stepTips(dt){tipT-=dt;if(tipT>0||helpIsOpen())return;tipT=.5;const P=player.pos,held=world.held;
  if(held==="campfire")tipOnce("placePile","Look at the ground in front of you and press Q to place the firewood pile.");
  const pile=world.structures.find(s=>s.type==="fire"&&!s.lit&&Math.hypot(s.x-P.x,s.z-P.z)<4);
  if(pile&&inv("flint")&&!hasD("fire"))tipOnce("strike",inv("pyrite")?"Hold flint (click it in the Backpack or press its number) and press Q next to the pile to strike sparks — V selects the other hand; equip pyrite by its number. An empty hand readies it automatically.":"Hold flint and press Q next to the pile to strike sparks — you'll also need a piece of pyrite (a brassy, heavy stone) in your Backpack.");
  if(!pile&&inv("stick")>=3&&!inv("campfire")&&!world.structures.some(s=>s.type==="fire"))tipOnce("craftPile","You have 3 sticks: hold sticks (their hotbar number), face clear ground and press Q to build a firewood pile. No Backpack needed.");
}
function bindInput(container){
  canvasEl=renderer.domElement;
  window.addEventListener("keydown",e=>{
    if(!started)return;
    if(EX?.isOpen&&(e.code==="Escape"||e.code==="KeyL")){EX.close();e.preventDefault();e.stopImmediatePropagation();return}
    if(e.code==="Escape"){stopMovement();if(!$("#wClimbHelp").hidden){closeClimbGuide();e.preventDefault();e.stopImmediatePropagation()}return}
    if(autoPickup&&!e.repeat&&!["ShiftLeft","ShiftRight","ControlLeft","ControlRight","AltLeft","AltRight","MetaLeft","MetaRight"].includes(e.code)){
      stopMovement();if(e.code==="KeyE"){e.preventDefault();e.stopImmediatePropagation()}
    }
  },true);
  document.addEventListener("click",e=>{if(e.target.closest("[data-climb-filter]")){invChain=!invChain;renderInventory()}if(e.target.closest("[data-climb-guide]"))openClimbGuide();if(e.target.closest("[data-climb-min]"))closeClimbGuide();if(e.target.closest("[data-climb-craft]")){closeClimbGuide();invChain=true;$("#wInv").hidden=false;renderInventory()}});
  $("#wStopWalk").onclick=()=>stopMovement();
  document.addEventListener("pointerdown",e=>{if(e.target!==canvasEl)stopMovement()},true);
  document.addEventListener("focusin",e=>{if(e.target!==canvasEl)stopMovement()});
  document.addEventListener("pointerlockchange",()=>{if(document.pointerLockElement!==canvasEl)stopMovement()});
  window.addEventListener("pointercancel",()=>stopMovement());
  window.addEventListener("keydown",e=>{
    if(!started||$("#mode-world").hidden||EX?.isOpen)return;if(["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName)||e.target.isContentEditable)return;
    if(e.code==="KeyL"){e.preventDefault();EX.open();return}
    if(helpIsOpen()){e.preventDefault();if(e.code==="ArrowRight"||e.code==="Enter"||e.code==="Space"||e.code==="KeyD")helpNav("next");else if(e.code==="ArrowLeft"||e.code==="KeyA")helpNav("back");else if(e.code==="Escape"||e.code==="KeyH")closeHelp();return}
    if(!$("#wPopup").hidden){if(e.code==="KeyE"||e.code==="KeyF"||e.code==="Enter"||e.code==="Space"||e.code==="Escape")closePopup();e.preventDefault();return}
    if(OBS&&OBS.isOpen){e.preventDefault();if(e.repeat)return;if(e.code==="KeyF"||e.code==="Escape")OBS.close();else if(e.code==="KeyP")PETS&&PETS.pet();else if(/^Digit[0-9]$/.test(e.code)){const k=hotbarItems()[(+e.code.slice(5)+9)%10];OBS.second(k)}return}
    if(e.code==="Tab"||e.code==="KeyK"||e.code==="KeyJ"){e.preventDefault();if(e.code==="KeyJ"){jTab="cur";$("#wJournal").hidden=true}togglePanel("#wJournal");return}
    if(e.code==="KeyI"){if($("#wInv").hidden)invCraftFor=null;togglePanel("#wInv");return}   // a fresh open clears any old "Craft with…" filter
    if(e.code==="KeyH"){openHelp();return}
    if(e.code==="KeyG"){player.readout=!player.readout;return}
    if(e.code==="Escape"){autoPickup=null;if(!$("#wCtx").hidden){closeCtx();return}if(player.zoom){player.zoom=false;return}if($("#wInv").hidden&&$("#wJournal").hidden&&$("#wChest").hidden)window.__openSettings?.();else $("#wInv").hidden=$("#wJournal").hidden=$("#wChest").hidden=true;return}
    if(paused)return;
    if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();
    keys.add(e.code);
    if(e.repeat)return;
    if(e.code==="KeyV"){e.preventDefault();toggleHand();return}if(e.code==="KeyX"){swapHands();return}
    if(e.code==="KeyB")quickCarve();if(e.code==="KeyE")interact();if(e.code==="KeyR")stow(e.shiftKey);if(e.code==="KeyQ")withActiveHand(useHeld);if(e.code==="KeyF")observeHeld(world[activeHand==="L"?"left":"held"]);if(e.code==="KeyP"&&PETS&&!PETS.pet())toast("No companion close enough to pet.");
    if(e.code==="KeyC"||e.code==="ControlLeft"){player.crouch=!player.crouch&&!player.swimming;toast(player.crouch?"Crouching: slow and quiet. Animals hear you less.":"Standing up.")}
    if(/^Digit[0-9]$/.test(e.code)){const i=(+e.code.slice(5)+9)%10,k=hotbarItems()[i];if(k){setHand(e.shiftKey?"L":activeHand,k)}}
  });
  window.addEventListener("keyup",e=>keys.delete(e.code),true);
  window.addEventListener("blur",()=>stopMovement());
  window.addEventListener("focus",()=>stopMovement());
  canvasEl.addEventListener("mousedown",e=>{if(autoPickup){stopMovement();e.preventDefault();return}dragging=true;lastX=e.clientX;lastY=e.clientY;canvasEl._down=[e.clientX,e.clientY,document.pointerLockElement===canvasEl]});
  window.addEventListener("mouseup",e=>{dragging=false;if(!canvasEl._down)return;if(paused){canvasEl._down=null;return;}const moved=Math.hypot(e.clientX-canvasEl._down[0],e.clientY-canvasEl._down[1]);const wasLocked=canvasEl._down[2];canvasEl._down=null;
    if(e.target!==canvasEl)return;if(document.pointerLockElement===canvasEl){if(e.button===0&&wasLocked)withActiveHand(useHeld)}else if(moved<4&&e.button===0){try{canvasEl.requestPointerLock?.()}catch(_){}}});
  window.addEventListener("mousemove",e=>{if(!player)return;const locked=document.pointerLockElement===canvasEl;if(!locked&&!dragging)return;
    const dx=locked?e.movementX:e.clientX-lastX,dy=locked?e.movementY:e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;const k=player.zoom?.25:1;
    player.camYaw-=dx*.004*k;player.camPitch=clamp(player.camPitch+dy*.003*k,-1.45,1.25)});
  canvasEl.tabIndex=0;canvasEl.addEventListener("pointerenter",()=>canvasEl.focus({preventScroll:true}));
  canvasEl.addEventListener("pointermove",e=>{cursorAim.x=e.clientX;cursorAim.y=e.clientY;cursorAim.inside=true});
  canvasEl.addEventListener("pointerleave",()=>{stopMovement();cursorAim.inside=false;hovered=null;hoverAt=0});
  canvasEl.addEventListener("wheel",e=>{e.preventDefault();player.camDist=clamp(player.camDist+Math.sign(e.deltaY)*.6,2.5,14)},{passive:false});
  document.addEventListener("click",e=>{
    if(!started||$("#mode-world").hidden)return;
    const hs=e.target.closest("[data-select-hand]");if(hs){selectHand(hs.dataset.selectHand);return}
    if(e.target.closest("[data-toggle-hand]")){toggleHand();return}
    const c=e.target.closest("[data-craft]");if(c){craft(c.dataset.craft);return}
    const st=e.target.closest("[data-store]");if(st){chestMove(st.dataset.store,true,e.shiftKey);return}
    const tk=e.target.closest("[data-take]");if(tk){chestMove(tk.dataset.take,false,e.shiftKey);return}
    if(e.target.closest("[data-storeall]")){for(const k of Object.keys(world.inv))if(!ITEMS[k].tool&&!ITEMS[k].weapon)chestMove(k,true,true);return}
    const cx=e.target.closest("[data-ctx]");if(cx){const m=$("#wCtx");ctxDo(cx.dataset.ctx,m.dataset.k,m.dataset.hand,+($("#wCtxN")?.value||1));return}
    if(!e.target.closest("#wCtx"))closeCtx();
    const so=e.target.closest("[data-isort]");if(so){sortInv(so.dataset.isort);return}
    const da=e.target.closest("[data-dropall]");if(da){const v=da.dataset.dropall;if(v==="arm")dropAllArm=true;else{dropAllArm=false;if(v==="yes")dropEverything()}renderInventory();return}
    const cf=e.target.closest("[data-craftfor]");if(cf){invCraftFor=null;renderInventory();return}
    const it=e.target.closest(".invItem,.slot,.cell");if(it&&it.dataset.k){setHand(e.shiftKey?"L":activeHand,it.dataset.k);return}
    if(e.target.closest("[data-close]")){e.target.closest(".wPanel").hidden=true;return}
    const pa=e.target.closest("[data-petact]");if(pa){const p=world.pets.find(x=>x.id===pa.dataset.petact);if(p&&PETS.setActive(p.id,!p.active))renderJournal();return}
    const jt=e.target.closest("[data-jtab]");if(jt){jTab=jt.dataset.jtab;renderJournal()}
  });
  document.addEventListener("contextmenu",e=>{if(!started||$("#mode-world").hidden)return;const c=e.target.closest?.(".cell,.slot,[data-hand]");if(c&&c.dataset.k){e.preventDefault();openCtx(c.dataset.k,e.clientX,e.clientY,c.dataset.hand||"")}else if(e.target.closest?.("#wInv,#wHotbar,#wHands"))e.preventDefault()});
  // drag & drop: rearrange, to the hotbar, onto a hand
  let dragK=null;
  document.addEventListener("dragstart",e=>{const c=e.target.closest?.(".cell,.slot");if(c&&c.dataset.k){dragK=c.dataset.k;e.dataTransfer?.setData("text/plain",dragK);c.classList.add("drag")}});
  document.addEventListener("dragover",e=>{if(dragK&&e.target.closest?.(".cell,.slot,[data-hand],.invCells,#wHotbar"))e.preventDefault()});
  document.addEventListener("drop",e=>{if(!dragK)return;const k=dragK;dragK=null;const h=e.target.closest?.("[data-hand]");if(h){e.preventDefault();setHand(h.dataset.hand,k);return}
    const hs=e.target.closest?.("[data-hot]");if(hs){e.preventDefault();moveTo(k,+hs.dataset.hot);return}
    const c=e.target.closest?.(".cell");if(c){e.preventDefault();const o=ordered();const t=c.dataset.k;moveTo(k,t?o.indexOf(t):o.length)}});
  document.addEventListener("dragend",()=>{dragK=null;document.querySelectorAll(".drag").forEach(x=>x.classList.remove("drag"))});
  // tooltips
  document.addEventListener("mouseover",e=>{const t=$("#wTip");if(!t)return;const c=e.target.closest?.(".cell[data-k],.slot[data-k],[data-hand][data-k]");if(!c||!$("#wCtx").hidden){t.hidden=true;return}t.innerHTML=itemTip(c.dataset.k);t.hidden=false;const r=t.parentElement.getBoundingClientRect(),b=c.getBoundingClientRect();t.style.left=Math.min(b.right-r.left+8,r.width-270)+"px";t.style.top=Math.max(4,Math.min(b.top-r.top,r.height-t.offsetHeight-6))+"px"});
  document.addEventListener("change",e=>{const n=e.target.closest?.("[data-petname]");if(n){PETS.rename(n.dataset.petname,n.value);renderJournal()}});
}

/* ---------------- main loop ---------------- */
const camTarget=new THREE.Vector3(),_cd=new THREE.Vector3();
function inCrown(x,y,z){for(const ch of nearbyChunks(x,z,4))for(const t of ch.obj.trees){if(t.gone||t.burnt)continue;const v=t.vis||t.kind;if(v==="dead")continue;
  const r=(v==="conifer"?1.9:v==="palm"?2.2:2.3)*t.s,y0=t.y+(v==="conifer"?.8:v==="palm"?4:2.2)*t.s,y1=t.y+(v==="conifer"?5.6:v==="palm"?5.6:5.4)*t.s;
  if(y>y0&&y<y1&&Math.hypot(x-t.x,z-t.z)<r)return true}return false}
let camDistNow=6;
function firstPerson(){return !!player.firstPersonView||!!player.zoom||player.camPitch<-.35}
function updateCamera(dt){
  const p=player,fp=firstPerson();
  if(p.model)p.model.visible=!fp;
  if(fp){ // first person: look at the sky (drag the view up) or through the telescope
    const eye=camTarget.set(p.pos.x,p.pos.y+(p.swimming?.3:p.crouch?1.05:1.62),p.pos.z),el=clamp(-p.camPitch,-.9,1.52);
    camera.position.copy(eye);_cd.set(-Math.sin(p.camYaw)*Math.cos(el),Math.sin(el),-Math.cos(p.camYaw)*Math.cos(el));camera.lookAt(eye.x+_cd.x,eye.y+_cd.y,eye.z+_cd.z);
  }else{
    const pitch=Math.max(-.35,p.camPitch),t=camTarget.set(p.pos.x,p.pos.y+(p.swimming?.3:p.crouch?1.1:1.6),p.pos.z);
    const sy=Math.sin(p.camYaw)*Math.cos(pitch),cy=Math.cos(p.camYaw)*Math.cos(pitch),sp=Math.sin(pitch);
    let d=p.camDist;while(d>1.6&&inCrown(t.x+sy*d,t.y+sp*d,t.z+cy*d))d-=.5;
    camDistNow=d<camDistNow?d:lerp(camDistNow,d,Math.min(1,dt*3));
    camera.position.set(t.x+sy*camDistNow,t.y+sp*camDistNow,t.z+cy*camDistNow);
    const gh=Math.max(heightAt(camera.position.x,camera.position.z),p.swimming?-9:0)+.5;if(camera.position.y<gh)camera.position.y=gh;
    camera.lookAt(t);
  }
  const fov=p.zoom?9:62;if(Math.abs(camera.fov-fov)>.1){camera.fov=lerp(camera.fov,fov,Math.min(1,dt*8));camera.updateProjectionMatrix()}
}
let saveT=0,chunkT=0,frames=0,fps=0,fpsN=0,fpsT=0,fpsLast=0,titleMode=false,titleT=0,ambT=0;
function tick(){
  requestAnimationFrame(tick);
  const dt=Math.min(.05,clock.getDelta());
  if(started&&!paused&&!$("#mode-world").hidden&&!simming)stepWorld(dt);
  if(started){updateCamera(dt);updateSky(dt);birds.update(clock.elapsedTime,player.pos,GFX.ENV.day,world.weather.amt);updateHover()}
  else if(titleMode)stepTitle(dt);
  if(!simming&&!EX?.isOpen){GFX.render(dt);frames++}
  fpsN++;fpsT+=clock.elapsedTime-fpsLast;fpsLast=clock.elapsedTime;if(fpsT>=1){fps=fpsN/fpsT;fpsN=0;fpsT=0;const fe=$("#wFps");if(fe&&!fe.hidden)fe.textContent=`${Math.round(fps)} fps · ${GFX.Q.label}`}
  ambT-=dt;if(ambT<=0&&started&&world){ambT=.1;const P=player.pos;let wv=0;for(let a=0;a<8;a++)if(heightAt(P.x+Math.cos(a*.785)*22,P.z+Math.sin(a*.785)*22)<0)wv+=.125;
    AU.ambience({wind:clamp(.2+Math.max(0,P.y)/180+world.weather.amt*.5+(world.weather.kind==="storm"||world.weather.kind==="drystorm"?.3:0)+(snapNow()?.2:0),0,1),waves:wv,rain:isRaining()?world.weather.amt:0,night:isNight(),biome:biomeAt(P.x,P.z,P.y),fire:clamp(fireHeatAt(P.x,P.z)/120,0,1),under:camera.position.y<0,paused:paused||$("#mode-world").hidden,slow:!!(OBS&&OBS.isOpen)})}
}
const _v1=new THREE.Vector3();
function stepWorld(dt){
  const dtg=dt*gameSpeed();
  world.gameTime+=dtg;
  stepWeather(dtg);stepPlayer(dt);stepSurvival(dt);stepDrill(dt);stepDrops(dt);stepFires(dt,dtg);stepBurning(dt);stepLightning(dt);spawnAnimals(dt);updateAnimals(dt);if(PETS)PETS.update(dt);stepPendulums(dt);stepCuriosity(dt);stepTips(dt);
  const p=player;p.model.position.copy(p.pos);if(p.raft)p.model.position.y=.12;p.model.rotation.y=p.yaw;
  animateHuman(p.model,(p.moveSpeed||0)*(p.crouch?1.6:1),dt,p.swimming,!p.onGround&&!p.swimming&&p.pos.y>heightAt(p.pos.x,p.pos.z)+.25,p.dead);
  GFX.fitClimbingGloves(p.model,inv("climbing_gloves")>0);
  if(p.climbing)GFX.poseClimbing(p.model,clock.elapsedTime);
  p.model.scale.y=drilling?.72:p.crouch?.72:1;
  if(drilling&&drillProp)GFX.poseHandDrill(p.model,drillProp.position,clock.elapsedTime);
  if(p.swimming&&!p.wasSwim){GFX.FX.splash(p.pos.x,p.pos.z,40);AU.splash(true)}p.wasSwim=p.swimming;
  // sky watching (astronomy) — night, clear-ish sky, looking up
  camera.getWorldDirection(_v1);
  if(sunElevation()<-.1&&world.weather.amt<.5){if(_v1.y>.45){p.lookUpT+=dt;const night=Math.floor((world.gameTime-6*3600)/86400);
    if(p.lookUpT>6&&!world.counters.nights.includes(night)){world.counters.nights.push(night);toast(`You study the stars (night ${world.counters.nights.length}/3). They wheel slowly around the pole.`);p.lookUpT=0;if(world.counters.nights.length>=3)discover("astronomy")}}else p.lookUpT=0}
  // telescope: hold the Moon or Jupiter in view
  if(p.zoom&&sunElevation()<-.05&&world.weather.amt<.6){const md=moonDirV();if(md.y>-.05&&_v1.angleTo(md)<.12){p.scopeMoon+=dt;if(p.scopeMoon>1.2&&!hasD("telescope")){toast("Craters and mountains on the Moon!");discover("telescope")}}else p.scopeMoon=0;
    if(_v1.angleTo(jupDir())<.06){p.scopeJup+=dt;if(p.scopeJup>1.5&&!hasD("galilean")){toast("Four tiny points of light in a line beside the planet — moons, orbiting Jupiter!");discover("galilean")}}else p.scopeJup=0}
  if(world.gameTime-world.dayStart>=86400)discover("daynight");
  for(const s of world.structures){
    if(s.type==="gnomon"&&s.shadow){const el=sunElevation(),a=2*Math.PI*(hourOf()-6)/24;s.shadow.visible=el>.05;if(el>.05){s.shadow.rotation.y=Math.atan2(-Math.cos(a),-.25)-s.obj.rotation.y;s.shadow.scale.z=clamp(1/Math.tan(Math.asin(clamp(el,.05,1))),.2,6)}
      if(el>.05){s.watch=(s.watch||0)+(Math.hypot(s.x-p.pos.x,s.z-p.pos.z)<40?dtg:0);if(s.watch>3600)discover("sundial")}}
    if(s.type==="crop"&&s.obj){const g=cropGrowth(s);s.obj.scale.setScalar(.3+g*.9);s.obj.children.forEach(c=>c.material.color.setHex(g>=1?0xd8c060:0x7fb04a))}
    if(s.type==="rack"&&s.meat.length&&Math.random()<dt)updateRack(s);
  }
  if(spectrum&&spectrum.visible){spectrum.userData.t-=dt;spectrum.children.forEach(m=>m.material.opacity=.8*clamp(spectrum.userData.t/2,0,1));if(spectrum.userData.t<=0)spectrum.visible=false}
  updateArc();
  chunkT-=dt;if(chunkT<=0){updateChunks(false);chunkT=.15}
  hudT-=dt;if(hudT<=0){renderHUD();hudT=.2}
  saveT-=dt;if(saveT<=0){save();saveT=10}
}

/* ---------------- boot ---------------- */
function startWorld(w){
  if(EX?.isOpen)EX.close();
  autoPickup=null;hovered=null;hoverAt=0;cursorAim.inside=false;
  clearDrill();
  titleMode=false;document.body.classList.remove("titleOn");$("#wTip").hidden=true;
  for(const s of world?.structures||[])if(s.obj)GFX.disposeGroup(s.obj);
  for(const d of world?.drops||[])if(d.mesh)scene.remove(d.mesh);
  world=hydrate(migrateTime(w));AU.resetMilestones();eyeAdapt=0;GFX.ENV.expMul=1+brightBoost;activeHand="R";flashT=0;flashStrength=0;thunders.length=0;initNoise(world.seed);
  for(const ch of chunks.values())disposeChunk(ch);chunks.clear();
  for(const s of world.structures)if(s.obj)scene.remove(s.obj);
  if(player&&player.model)scene.remove(player.model);
  for(const a of animals)scene.remove(a.g);animals.length=0;
  player=makePlayer(world);
  for(const s of world.structures)structMesh(s);
  const drops=world.drops;world.drops=[];for(const d of drops){const dd=addDrop(d.item,d.x,d.y,d.z);if(d.n>1)dd.n=d.n}
  updateChunks(true);
  started=true;paused=false;$("#wExpLaunch").hidden=false;renderHotbar();renderHUD();AU.init();if(PETS)PETS.sync();
  if(atlas)onAtlas(atlas);
}
function newGame(seed){
  const w=newWorld(seed);initNoise(w.seed);
  const [cx,cz]=w.camp;
  const start=[["flint",2],["pyrite",1],["stone",1],["stick",4],["clay",1]];let a=0;
  for(const [k,n] of start)for(let i=0;i<n;i++){a+=.9;const x=cx+Math.cos(a)*(2+a*.3),z=cz+Math.sin(a)*(2+a*.3);w.drops.push({item:k,x,y:heightAt(x,z)+.03,z})}
  w.removed=[...w.removed];w.burnt=[...w.burnt];
  startWorld(w);save();openHelp(0);
  toast("You wake at the edge of the fog. Gather what you can — E to pick up (it goes in your Backpack, I), F to observe what you hold, R to stow it again, Tab for your journal. A stray cat lives near your camp: move quietly (C) and it may come to you.");
}
/* title screen: slow time-lapse flyover of the world */
let titleCenter=null;
function beginTitle(preview){
  initNoise(preview.seed);
  world=hydrate({...preview,removed:[...(preview.removed||[])],burnt:[...(preview.burnt||[])],structures:[],drops:[],gameTime:Math.floor((preview.gameTime||0)/86400)*86400+9*3600,weather:{kind:"clear",t:9e9,amt:0}});
  const [cx,cz]=preview.camp||[0,0];titleCenter=new THREE.Vector3(cx,heightAt(cx,cz),cz);
  player={pos:titleCenter.clone(),vel:new THREE.Vector3(),camYaw:0,camPitch:.3,camDist:6,model:null,swimming:false};
  titleMode=true;titleT=0;document.body.classList.add("titleOn");updateChunks(true);
}
function stepTitle(dt){
  titleT+=dt;world.gameTime+=dt*55;
  const a=titleT*.045,R=78+14*Math.sin(titleT*.07),c=titleCenter;
  const x=c.x+Math.cos(a)*R,z=c.z+Math.sin(a)*R;
  const gy=Math.max(heightAt(x,z),0);
  camera.position.set(x,Math.max(gy+9,c.y+16+5*Math.sin(titleT*.11)),z);
  camera.lookAt(c.x+Math.cos(a+1.25)*90,c.y+4,c.z+Math.sin(a+1.25)*90);
  if(camera.fov!==62){camera.fov=62;camera.updateProjectionMatrix()}
  chunkT-=dt;if(chunkT<=0){updateChunks(false);chunkT=.25}
  updateSky(dt);
}
function applyQuality(q){
  GFX.setQuality(q);GFX.saveQualityPref(q);
  for(const ch of chunks.values())if(ch.grass){GFX.disposeGroup(ch.grass);ch.grass=null}
  document.querySelectorAll("[data-q]").forEach(b=>b.classList.toggle("on",b.dataset.q===GFX.qName));
  if(player&&player.pos)updateChunks(true);
}
/* fast simulation for the automated playtests: runs the real game rules (stepWorld) without rendering */
let simming=false;
function sim(sec,ctl,step=1/30){const n=Math.round(sec/step);simming=true;let i=0;
  try{for(;i<n;i++){if(!$("#wPopup").hidden)closePopup();if(player.dead){if(ctl&&ctl.onDeath)ctl.onDeath();else break}
    if(ctl){const r=ctl(step,i);if(r==="stop")break}stepWorld(step);updateCamera(step)}}finally{simming=false;paused=false}return i*step}
function scan(kind,type,r=180,ok){ // bot perception: nearest thing of a kind (what the player could see); ok(x,z) filters
  const P=player.pos;let best=null,bd=r;const c=(o,x,z)=>{const d=Math.hypot(x-P.x,z-P.z);if(d<bd&&(!ok||ok(x,z))){bd=d;best={...o,x,z,d}}};
  if(kind==="res"||kind==="drop"){for(const d of world.drops)if(!d.flying&&!d.floating&&(!type||d.item===type))c({kind:"drop",item:d.item},d.pos.x,d.pos.z);
    if(kind==="res")for(const ch of chunks.values())if(ch.group)for(const rr of ch.obj.res)if(!rr.gone&&(!type||rr.type===type))c({kind:"res",item:rr.type,flower:!!rr.flower},rr.x,rr.z)}
  if(kind==="tree")for(const ch of chunks.values())if(ch.group)for(const t of ch.obj.trees)if(!t.gone&&!t.burning&&(!type||t.kind===type)&&slopeAt(t.x,t.z)<.6)c({kind:"tree",sticks:t.sticks||0},t.x,t.z);
  if(kind==="boulder")for(const ch of chunks.values())if(ch.group)for(const b of ch.obj.boulders)c({kind:"boulder",s:b.s,mined:b.mined||0},b.x,b.z);
  if(kind==="animal")for(const a of animals)if(!a.dead&&(!type||a.kind===type))c({kind:"animal",type:a.kind,y:a.pos.y,size:a.sp.size},a.pos.x,a.pos.z);
  if(kind==="struct")for(const s of world.structures)if(!type||s.type===type)c({kind:"struct",type:s.type,lit:!!s.lit,fuel:s.fuel},s.x,s.z);
  if(kind==="water"){for(let rr=4;rr<r;rr+=4){let hit=null;for(let a=0;a<24;a++){const x=P.x+Math.cos(a/24*6.283)*rr,z=P.z+Math.sin(a/24*6.283)*rr;if(heightAt(x,z)<-.4){hit={kind:"water",x,z,d:rr};break}}if(hit)return hit}return null}
  return best}
export function initWorld(){
  const container=$("#wCanvas");
  initScene(container);bindInput(container);initSkyExtras();PETS=createPets(petCtx());OBS=createObserve(obsCtx());
  const saved=loadSave();
  $("#wTitle").hidden=false;
  $("#wContinue").hidden=!saved;
  $("#wPlay").onclick=()=>{AU.init();$("#wTitle").hidden=true;if(saved&&!started)startWorld(saved);else if(!started)newGame();paused=false};
  $("#wContinue").onclick=$("#wPlay").onclick;
  $("#wNew").onclick=()=>{if(saved&&!confirm("Start a new world? Your current world and knowledge will be replaced."))return;AU.init();$("#wTitle").hidden=true;newGame()};
  if(saved){$("#wPlay").textContent="CONTINUE";$("#wContinue").hidden=true}
  beginTitle(saved||newWorld(1234));
  // settings
  const openSettings=()=>{stopMovement();const el=$("#wSettings");el.hidden=!el.hidden;document.querySelectorAll("[data-q]").forEach(b=>b.classList.toggle("on",b.dataset.q===GFX.qName));if(!el.hidden){try{document.exitPointerLock?.()}catch(_){}}};
  $("#wGear")&&($("#wGear").onclick=openSettings);
  $("#wHelpBtn")&&($("#wHelpBtn").onclick=()=>{if(started)openHelp()});$("#wHelpSet")&&($("#wHelpSet").onclick=()=>{$("#wSettings").hidden=true;openHelp()});
  $("#wHelp")&&$("#wHelp").addEventListener("click",e=>{const b=e.target.closest("[data-help]");if(b)helpNav(b.dataset.help)});
  const tchk=$("#wTipsChk");if(tchk){tchk.checked=tipsOn();tchk.onchange=()=>localStorage.setItem(TIPS_KEY,tchk.checked?"1":"0")}$("#wTitleSettings")&&($("#wTitleSettings").onclick=openSettings);
  document.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>applyQuality(b.dataset.q));
  $("#wShowFps")&&($("#wShowFps").onchange=e=>{$("#wFps").hidden=!e.target.checked;try{localStorage.setItem("fog-of-knowledge:game:fps",e.target.checked?"1":"")}catch(_){}});
  try{if(localStorage.getItem("fog-of-knowledge:game:fps")){$("#wFps").hidden=false;$("#wShowFps").checked=true}}catch(_){}
  const vol=$("#wVol");if(vol){vol.value=Math.round(AU.volume*100);$("#wVolV").textContent=vol.value+"%";vol.oninput=()=>{AU.init();AU.setVolume(vol.value/100);$("#wVolV").textContent=vol.value+"%";}}
  EX=createExpeditions({root:$("#wExpeditions"),state:()=>world,save,atlasNode:id=>{const i=atlas?.index.get(id);return i===undefined?null:atlas.nodes[i]},
    open:()=>{stopMovement();for(const id of ["wInv","wJournal","wSettings","wHelp","wClimbHelp","wPopup","wChest","wCtx"])$("#"+id).hidden=true;paused=true;try{document.exitPointerLock?.()}catch(_){}},
    close:()=>{stopMovement();paused=false;clock.getDelta()},
    mastered:l=>{if(discover("exp_"+l.id,true)){AU.milestone("discovery","exp_"+l.id);toast(`Expedition mastered: ${l.name}. Atlas context mapped.`)}}});
  $("#wExpLaunch").onclick=()=>EX.open();document.addEventListener("click",e=>{if(e.target.closest("[data-open-expeditions]"))EX.open()});
  window.__openSettings=openSettings;
  tick();
  (window.__fogAtlasPromise||Promise.reject()).then(A=>{atlas=A;if(world&&started)onAtlas(A)}).catch(()=>{});
  window.addEventListener("beforeunload",()=>{if(started&&world)save()});
  document.addEventListener("visibilitychange",()=>{stopMovement();if(document.hidden&&started&&world)save()});
  // debug / test hook (used by the headless verification and the automated playtests)
  const br=$("#wBright");if(br){br.value=Math.round(brightBoost*100);$("#wBrightV").textContent="+"+br.value+"%";br.oninput=()=>{brightBoost=clamp(br.value/100,0,.4);$("#wBrightV").textContent="+"+br.value+"%";try{localStorage.setItem("fog-of-knowledge:game:bright",String(brightBoost))}catch(_){}}}
  const dl=$("#wDayLen");if(dl){dl.value=dayLenPref;dl.onchange=()=>setDayLen(dl.value)}const wp=$("#wWeatherSel");if(wp){wp.value=weatherPref;wp.onchange=()=>setWeatherPref(wp.value)}
  const schk=$("#wSurvChk");if(schk){schk.checked=survivalMode;schk.onchange=()=>{setSurvival(schk.checked);toast(schk.checked?"Classic survival on: hunger, thirst, illness and injuries.":"Discovery mode: no hunger, illness or injuries — just you, the world and its puzzles.")}}
  const nchk=$("#wNeedyChk");if(nchk){nchk.checked=PETS.needyOn;nchk.onchange=()=>{PETS.needyOn=nchk.checked}}
  window.__fogWorld={help:{open:p=>openHelp(p||0),close:closeHelp,nav:helpNav,get isOpen(){return helpIsOpen()},get page(){return helpPage},pages:()=>helpPages().map(p=>p.t+" "+p.b.replace(/<[^>]+>/g,""))},tipsOn,get pets(){return PETS},updateSky:()=>updateSky(.016),stow,curiosityAll:()=>CURIOSITY.map(q=>q.q),throwSpeed:k=>throwSpeed(k),setSurvival,get survival(){return survivalMode},gameSpeed:t=>gameSpeed(t),setDayLen,get dayLen(){return dayLenPref},setWeatherPref,get weatherPref(){return weatherPref},rollWeather:()=>rollWeather(),migrateTime:w=>migrateTime(w),hud:()=>{renderHUD();renderObjectives();return {bars:$("#wBars").textContent,obj:$("#wObj").textContent}},cookbook:()=>COOKBOOK.map(c=>c[0]),duskNeedsFire:()=>duskNeedsFire(),fireHeatAt:(x,z)=>fireHeatAt(x,z),get lightningState(){return {remaining:flashT,strength:flashStrength,pulse:lightningPulse(flashT,flashStrength),pendingThunder:thunders.map(t=>({...t}))}},fireShadowBudget:reset=>{if(reset)Object.assign(fireFps,{on:true,low:0,high:0,ema:60});return {...fireFps}},envLight:()=>({sun:GFX.sun.intensity,hemi:GFX.hemi.intensity,moon:GFX.ENV.moonFrac,exposure:GFX.renderer?.toneMappingExposure,expMul:GFX.ENV.expMul,fills:fireFillLights.map(l=>({i:l.intensity,sh:l.castShadow})),lights:fireLights.map(l=>({i:+l.intensity.toFixed(2),y:l.position.y,d:+l.distance.toFixed(1),sh:l.castShadow}))}),moonPhase:t=>GFX.moonPhase(t),fireLight:(fuel,heat=1,type="fire",lit=true)=>{const r=fireLight({fuel,heat,type,lit});delete r.color;return r},get lux(){return world._luxAtPlayer||0},get exposure(){return GFX.renderer?.toneMappingExposure},setBright:v=>{brightBoost=clamp(v,0,.4)},inventory:{hotbarItems,essentialQuickbar:ESSENTIAL_QUICKBAR,get activeHand(){return activeHand},selectHand,toggleHand,withActiveHand,capacity,slotsUsed,roomFor,ordered,setHand,swapHands,dropItem,dropEverything,ctxActions,ctxDo,openCtx,sortInv,moveTo,STACK,BASE_SLOTS,handItems:()=>{const u=player.model.userData;return {R:u.held?.userData.k||null,L:u.heldL?.userData.k||null,Rbone:u.held?.parent?.name,Lbone:u.heldL?.parent?.name,Rpos:u.held?.getWorldPosition(new THREE.Vector3()),Lpos:u.heldL?.getWorldPosition(new THREE.Vector3())}}},get paused(){return paused},items:ITEMS,drop:(k,x,z)=>addDrop(k,x,heightAt(x,z)+.15,z),get obs(){return OBS},observeHeld,needyUI,curiousSpot,oreSpot,landmark,PET_INFO,MAX_ACTIVE,get state(){return world},get player(){return player},get animals(){return animals},discover:id=>discover(id),closePopup,
    addFireFuel:feedFire,quickCarve,hover:()=>cursorTarget(true),autoPickup:()=>autoPickup?{remaining:autoPickup.path.length,item:autoPickup.target.kind==="res"?autoPickup.target.obj.r.type:autoPickup.target.obj.item}:null,drill:()=>({active:!!drilling,progress:drilling?._drill?.progress||0,prop:!!drillProp}),give:(k,n)=>give(k,n),press:(code,ms)=>{keys.add(code);setTimeout(()=>keys.delete(code),ms)},keyEvent:code=>window.dispatchEvent(new KeyboardEvent("keydown",{code,bubbles:true})),keyDown:c=>keys.add(c),keyUp:c=>keys.delete(c),keysClear:()=>keys.clear(),
    teleport:(x,z)=>{player.pos.set(x,heightAt(x,z),z);player.vel.set(0,0,0);updateChunks(true)},stats:()=>({pos:player&&player.pos.toArray().map(v=>+v.toFixed(2)),chunks:chunks.size,animals:animals.length,frames,
      revealed:world?.ks.revealed.length,disc:world?.disc.length,atlas:!!atlas,drawCalls:renderer.info.render.calls,tris:renderer.info.render.triangles,fps:+fps.toFixed(1),quality:GFX.qName,birds:{...birds.stats},human:!!player?.model?.userData?.mixer,audio:{...AU.stats}}),
    start:()=>$("#wPlay").click(),height:(x,z)=>heightAt(x,z),biome:(x,z)=>biomeAt(x,z,heightAt(x,z)),slope:(x,z)=>slopeAt(x,z),reseed:seed=>{const w=newWorld(seed);w.removed=[];w.burnt=[];startWorld(w)},newGame:seed=>newGame(seed),fps:()=>fps,quality:q=>{if(q)applyQuality(q);return GFX.qName},
    setHour:h=>{world.gameTime=Math.floor(world.gameTime/86400)*86400+h*3600},setWeather:(kind,amt)=>{world.weather.kind=kind;world.weather.amt=amt??(kind==="rain"||kind==="storm"?1:0);world.weather.t=9e9;world.weather.next=kind},
    look:(yaw,pitch,dist)=>{player.camYaw=yaw;if(pitch!==undefined)player.camPitch=pitch;if(dist!==undefined)player.camDist=dist},throwHeld,useHeld,interact,craft,eat,hold:k=>{if(world&&world.inv[k]){world.held=k;renderHotbar();return true}return false},
    sim,scan,target:()=>{const t=findTarget();return t?{kind:t.kind,label:targetLabel(t),type:t.obj?.type||t.obj?.item||t.obj?.r?.type||t.obj?.kind}:null},respawn:()=>$("#wRespawn")?.click(),
    toasts:()=>toastLog.slice(),discLog:()=>discLog.slice(),hourOf:()=>hourOf(),sunElevation:()=>sunElevation(),airTemp:()=>airTemp(player.pos.x,player.pos.z,player.pos.y),shelterLevel:()=>shelterLevel(player.pos.x,player.pos.z),
    strike:(x,z)=>strike([x,z]),jupDir:()=>jupDir().toArray(),moonDir:()=>moonDirV().toArray(),firstPerson,save,crouch:v=>{player.crouch=!!v},sleepNow:()=>{const s=world.structures.find(o=>sleepable(o.type)&&Math.hypot(o.x-player.pos.x,o.z-player.pos.z)<4);return s?(sleep(s),true):false},
    get expeditions(){return EX},
    recipes:()=>RECIPES.map(r=>({out:r.out,req:r.req,in:r.in,tool:r.tool||null,n:r.n||1})),discoveries:()=>WORLD_DISCOVERIES.map(d=>d.id),curiosity:()=>world.seenQ.slice(),objectives:()=>{const c=guideCtx();return OBJECTIVES.map(o=>({id:o[0],text:o[1],done:!!o[2](c)}))},
    audio:()=>({...AU.stats,volume:AU.volume}),
    spawn:(kind,x,z)=>{const a=addAnimal(kind,x,z);return a},
    // resource reachability: nearest instance of each resource type to (x,z), straight from the world generator
    resMap:(x,z,R=420)=>{const out={},c0=Math.floor(x/CHUNK),c1=Math.floor(z/CHUNK),n=Math.ceil(R/CHUNK);let boulder=1e9,tree=1e9,water=1e9;
      for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const o=genObjects(c0+i,c1+j);
        for(const r of o.res){const d=Math.hypot(r.x-x,r.z-z);if(d<(out[r.type]??1e9))out[r.type]=d}
        for(const b of o.boulders)boulder=Math.min(boulder,Math.hypot(b.x-x,b.z-z));for(const t of o.trees)tree=Math.min(tree,Math.hypot(t.x-x,t.z-z))}
      for(let r=2;r<R&&water>1e8;r+=3)for(let a=0;a<48;a++){const xx=x+Math.cos(a/48*6.283)*r,zz=z+Math.sin(a/48*6.283)*r;if(heightAt(xx,zz)<-.4){water=r;break}}
      let hi=-1e9,lo=1e9;for(let r=0;r<=1000;r+=25)for(let a=0;a<32;a++){const h=heightAt(x+Math.cos(a/32*6.283)*r,z+Math.sin(a/32*6.283)*r);if(h>0){hi=Math.max(hi,h);lo=Math.min(lo,h)}}
      for(const k in out)out[k]=Math.round(out[k]);return {res:out,boulder:Math.round(boulder),tree:Math.round(tree),water,relief1km:Math.round(hi-lo),hi:Math.round(hi)}},
    clearStructs:()=>{for(const o of world.structures)o.obj&&scene.remove(o.obj);world.structures.length=0;player.raft=null},
    clearDrops:()=>{for(const d of world.drops)scene.remove(d.mesh);world.drops.length=0},
    clearAnimals:kind=>{for(let i=animals.length-1;i>=0;i--)if(!kind||animals[i].kind===kind){scene.remove(animals[i].g);animals.splice(i,1)}},
    fireAt:()=>fireHeatAt(player.pos.x,player.pos.z),noise:()=>playerNoiseDb?playerNoiseDb():null};
}
