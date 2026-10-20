/* Fog of Knowledge: The Game — OPEN WORLD mode.
 * Real-time 3D world (three.js r160, vendored, MIT) with simple real physics:
 * gravity 9.81 m/s², friction-limited acceleration, quadratic air/water drag, Archimedes buoyancy,
 * heat balance (metabolism, convection/conduction, radiant fire heat with inverse-square falloff, wetness),
 * combustion (fuel + oxygen + heat; rain and fuel exhaustion put fires out; spread to trees),
 * inverse-square sound falloff for animal hearing, and boiling point vs altitude.
 * Discoveries happen by doing things in the world and reveal real atlas nodes.
 */
import * as THREE from "./vendor/three.module.min.js";
import {ITEMS,WORLD_DISCOVERIES,RECIPES} from "./world-data.js";
import * as GFX from "./gfx.js";
const E=window.FogGameEngine,TREE=E.G;
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const SAVE_KEY="fog-of-knowledge:game:world:v1";
const G_ACC=9.81, RHO_AIR=1.225, RHO_WATER=1000, BODY_MASS=70, BODY_HEAT_CAP=70*3500;
const GAME_SPEED=96;             // 1 real second = 96 game seconds → a day lasts 15 real minutes
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
let renderer,scene,camera,moonMesh,clock;
const chunks=new Map();
const MAT=GFX.MAT,GEO=GFX.GEO;
function initScene(container){
  GFX.initGfx(container,GFX.loadQualityPref());GFX.initMaterials();
  renderer=GFX.renderer;scene=GFX.scene;camera=GFX.camera;moonMesh=GFX.moonMesh;
  clock=new THREE.Clock();GFX.loadHuman();
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
function grassSampler(ch){const G=ch.terrain&&ch.terrain.userData.grid;if(!G)return null;const x0=ch.cx*CHUNK,z0=ch.cz*CHUNK,R=G.res+1;
  return (x,z)=>{const fx=clamp((x-x0)/G.step,0,G.res-.001),fz=clamp((z-z0)/G.step,0,G.res-.001),i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j;
    const a=G.h[j*R+i],b=G.h[j*R+i+1],c=G.h[(j+1)*R+i],d=G.h[(j+1)*R+i+1];
    const h=(a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v,sl=Math.max(Math.abs(b-a),Math.abs(c-a),Math.abs(d-b))/G.step;
    return {h,biome:BN[G.b[Math.round(fz)*R+Math.round(fx)]],slope:sl}}}
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
  const smalls=o.res.filter(r=>!["stick","fiber","seeds","berry_red","berry_dark"].includes(r.type));
  const sticks=o.res.filter(r=>r.type==="stick"),plants=o.res.filter(r=>["fiber","seeds","berry_red","berry_dark"].includes(r.type));
  ch.small=new THREE.InstancedMesh(GEO.small,MAT.rock,Math.max(1,smalls.length));ch.small.count=smalls.length;
  ch.sticks=new THREE.InstancedMesh(GEO.stick,MAT.bark,Math.max(1,sticks.length));ch.sticks.count=sticks.length;
  ch.plants=new THREE.InstancedMesh(GEO.tuft,MAT.leaf,Math.max(1,plants.length));ch.plants.count=plants.length;
  smalls.forEach((r,j)=>{r.mesh=ch.small;r.slot=j;const s=r.type==="clay"?.28:r.type==="sand"?.3:.17;setInst(ch.small,j,r.x,r.y+s*.4,r.z,s,s*.7,s,r.i);_c.setHex(ITEMS[r.type].color);ch.small.setColorAt(j,_c)});
  sticks.forEach((r,j)=>{r.mesh=ch.sticks;r.slot=j;setInst(ch.sticks,j,r.x,r.y+.05,r.z,.9,1,1,r.i)});
  plants.forEach((r,j)=>{r.mesh=ch.plants;r.slot=j;const berry=r.type.startsWith("berry");setInst(ch.plants,j,r.x,r.y-.05,r.z,berry?.55:.32,berry?.5:.42,berry?.55:.32,r.i);_c.setHex(berry?(r.type==="berry_red"?0xc04848:0x5a5ac0):r.type==="seeds"?0xd8c46a:0x9ccc5a);ch.plants.setColorAt(j,_c)});
  for(const r of o.res)if(world.removed.has(key+"|r"+r.i)){r.gone=true;r.mesh.setMatrixAt(r.slot,ZERO)}
  // decorative bushes (visual only, own random stream)
  const rd=mulberry(hash3(world.seed,ch.cx+31337,ch.cz-4242)),bl=[];
  for(let i=0;i<34;i++){const x=ch.cx*CHUNK+rd()*CHUNK,z=ch.cz*CHUNK+rd()*CHUNK,h=heightAt(x,z),b=biomeAt(x,z,h);if((b==="forest"&&rd()<.8)||(b==="grass"&&rd()<.35)||(b==="beach"&&rd()<.1))bl.push([x,h,z,.45+rd()*.7,b])}
  ch.bushes=new THREE.InstancedMesh(GEO.bush,MAT.bush,Math.max(1,bl.length));ch.bushes.count=bl.length;ch.bushes.castShadow=true;ch.bushes.receiveShadow=true;
  bl.forEach(([x,h,z,s,b],j)=>{setInst(ch.bushes,j,x,h-.1,z,s*1.2,s,s*1.2,j*1.7);_c.setRGB(b==="forest"?.16:.28,b==="forest"?.33:.42,b==="forest"?.12:.14);ch.bushes.setColorAt(j,_c)});
  const all=[...Object.values(ch.tr),...Object.values(ch.cr),ch.boulders,ch.small,ch.sticks,ch.plants,ch.bushes];
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
function newWorld(seed){
  seed=(seed>>>0)||((Math.random()*4294967296)>>>0);
  initNoise(seed);
  let sx=0,sz=0;
  for(let r=0;r<4000;r+=24){let ok=false;for(let a=0;a<12&&!ok;a++){const x=Math.cos(a/12*6.283)*r,z=Math.sin(a/12*6.283)*r,h=heightAt(x,z),b=biomeAt(x,z,h);if(h>3&&h<25&&(b==="grass"||b==="forest")&&slopeAt(x,z)<.35){sx=x;sz=z;ok=true}}if(ok)break}
  return {v:1,seed,camp:[sx,sz],pos:[sx,heightAt(sx,sz)+.1,sz],yaw:0,cam:[0,.35,6],gameTime:8*3600,dayStart:8*3600,
    st:{health:100,hunger:85,thirst:85,stamina:100,tb:37,wet:0,sick:0},inv:{},held:null,worn:null,
    disc:[],counters:{falls:0,throws:[],nights:[],species:[],berries:[],tally:0,raftDist:0,lookT:0,warmFrom:0},
    weather:{kind:"clear",t:3*3600,amt:0},structures:[],drops:[],removed:[],burnt:[],moved:{},ks:freshKS(),deaths:0};
}
function hydrate(w){w.removed=new Set(w.removed);w.burnt=new Set(w.burnt);return w}
function serialize(){const o={...world,removed:[...world.removed].slice(-6000),burnt:[...world.burnt].slice(-3000),pos:[player.pos.x,player.pos.y,player.pos.z],yaw:player.yaw,cam:[player.camYaw,player.camPitch,player.camDist]};
  o.structures=world.structures.map(s=>{const c={...s};delete c.obj;delete c.light;delete c.flame;delete c.shadow;return c});
  o.drops=world.drops.filter(d=>!d.flying).slice(-80).map(d=>({item:d.item,x:d.pos.x,y:d.pos.y,z:d.pos.z}));
  o.ks={...world.ks};delete o.ks._k;delete o.ks._r;return JSON.stringify(o)}
function save(){try{localStorage.setItem(SAVE_KEY,serialize())}catch(_){toast("Could not save (storage full or blocked)")}}
function loadSave(){try{const s=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");if(s&&s.v===1)return s}catch(_){}return null}

/* ---------------- props ---------------- */
function box(w,h,d,col,y=0){const g=new THREE.BoxGeometry(w,h,d);g.translate(0,y,0);const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:col,roughness:.85}));m.castShadow=m.receiveShadow=true;return m}
const makeHuman=GFX.makeHuman,animateHuman=GFX.animateHuman;
/* ---------------- animals ---------------- */
const SPECIES={
  rabbit:{biomes:["grass","forest","snow"],col:0xb8a58a,size:.35,hp:30,speed:7,meat:1,hide:0,hear:25},
  deer:{biomes:["grass","forest"],col:0x9a6b3e,size:1,hp:140,speed:9,meat:3,hide:2,hear:30},
  boar:{biomes:["forest"],col:0x4e3b2e,size:.8,hp:180,speed:6,meat:3,hide:1,hear:32,bold:true},
  goat:{biomes:["rock","snow"],col:0xd8d2c4,size:.75,hp:110,speed:7,meat:2,hide:1,hear:30},
  wolf:{biomes:["forest","snow","grass"],col:0x6a6a70,size:.8,hp:120,speed:8,meat:1,hide:1,hear:28,predator:true}
};
const animals=[];
function makeAnimal(kind){
  const sp=SPECIES[kind],{g,legs}=GFX.makeAnimalModel(kind,sp.col,sp.size);
  return {kind,sp,g,legs,hp:sp.hp,pos:new THREE.Vector3(),vel:new THREE.Vector3(),target:null,flee:0,phase:Math.random()*6,attackCd:0};
}
function spawnAnimals(dt){
  for(let i=animals.length-1;i>=0;i--){const a=animals[i];if(a.pos.distanceTo(player.pos)>230||a.dead>4){scene.remove(a.g);animals.splice(i,1)}}
  if(animals.length>=12||Math.random()>dt*1.5)return;
  const ang=Math.random()*6.283,r=60+Math.random()*90,x=player.pos.x+Math.cos(ang)*r,z=player.pos.z+Math.sin(ang)*r,h=heightAt(x,z),b=biomeAt(x,z,h);
  if(h<.5)return;
  const night=sunElevation()<-.05;
  const kinds=Object.keys(SPECIES).filter(k=>SPECIES[k].biomes.includes(b)&&(!SPECIES[k].predator||night||b==="snow"));
  if(!kinds.length)return;
  const a=makeAnimal(kinds[Math.floor(Math.random()*kinds.length)]);a.pos.set(x,h,z);a.g.position.copy(a.pos);scene.add(a.g);animals.push(a);
}
function playerNoiseDb(){ // sound level at 1 m, dB
  const sp=Math.hypot(player.vel.x,player.vel.z);return player.swimming?55:sp>3.5?68:sp>.5?50:30;
}
function updateAnimals(dt){
  const night=sunElevation()<-.05, rainMask=world.weather.kind==="rain"?8:0;
  for(const a of animals){
    if(a.dead){a.dead+=dt;continue}
    const d=a.pos.distanceTo(player.pos);
    // inverse-square spreading: level drops 20·log10(r) dB
    const heard=playerNoiseDb()-20*Math.log10(Math.max(1,d))>(a.sp.hear-25)+rainMask;
    if(d<15&&!world.counters.species.includes(a.kind)){world.counters.species.push(a.kind);if(world.counters.species.length>=3)discover("tracking")}
    let speed=1.2;
    if(a.sp.predator&&(night||d<14)&&d<35&&!player.dead){a.target=player.pos.clone();speed=a.sp.speed*.8;
      if(d<1.6&&a.attackCd<=0){hurt(9,"A wolf bit you");a.attackCd=1.4}}
    else if((heard&&d<60)||a.flee>0){if(heard)a.flee=4;a.flee-=dt;const away=a.pos.clone().sub(player.pos).setY(0).normalize();a.target=a.pos.clone().addScaledVector(away,10);speed=a.sp.speed}
    else if(!a.target||a.pos.distanceTo(a.target)<1.5||Math.random()<dt*.05){const t=a.pos.clone();t.x+=(Math.random()-.5)*30;t.z+=(Math.random()-.5)*30;a.target=t;speed=1.2}
    a.attackCd-=dt;
    const dir=a.target.clone().sub(a.pos).setY(0);const len=dir.length();
    if(len>.2){dir.multiplyScalar(1/len);const nx=a.pos.x+dir.x*speed*dt,nz=a.pos.z+dir.z*speed*dt;const nh=heightAt(nx,nz);if(nh>.2){a.pos.x=nx;a.pos.z=nz}else a.target=null;
      a.g.rotation.y=Math.atan2(dir.x,dir.z)}
    a.pos.y=heightAt(a.pos.x,a.pos.z);a.g.position.copy(a.pos);
    a.phase+=dt*speed*3;const sw=Math.min(1,speed/3)*.7;a.legs.forEach((l,i)=>l.rotation.x=Math.sin(a.phase+(i%2?Math.PI:0)+(i>1?Math.PI/2:0))*sw);const ud=a.g.userData;if(ud.head){ud.head.rotation.x=speed<1.5?.25+.2*Math.sin(a.phase*.3+a.pos.x):-.05;ud.tail.rotation.y=Math.sin(a.phase*2)*.4}
  }
}
function killAnimal(a){
  a.dead=.01;a.g.rotation.z=Math.PI/2;a.g.position.y+=.2;
  const drops={meat_raw:a.sp.meat,hide:a.sp.hide};
  for(const k in drops)for(let i=0;i<drops[k];i++)addDrop(k,a.pos.x+(Math.random()-.5),a.pos.y+.3,a.pos.z+(Math.random()-.5));
  toast(`You brought down a ${a.kind}.`);discover("hunting");
}

/* ---------------- items, drops & projectiles ---------------- */
function inv(k){return world.inv[k]||0}
function give(k,n=1){if(!ITEMS[k])return;world.inv[k]=(world.inv[k]||0)+n;if(!world.held)world.held=k;renderHotbar()}
function take(k,n=1){if(inv(k)<n)return false;world.inv[k]-=n;if(world.inv[k]<=0){delete world.inv[k];if(world.held===k)world.held=Object.keys(world.inv)[0]||null}renderHotbar();return true}
function itemMesh(k){const it=ITEMS[k];const m=new THREE.Mesh(k==="stick"||k==="log"||k==="spear"?GEO.stick:GEO.small,k==="stick"||k==="log"||k==="spear"?MAT.bark:new THREE.MeshStandardMaterial({color:it.color,roughness:.75}));m.castShadow=true;
  const s=k==="log"?1.4:k==="spear"?1.8:k==="stick"?.9:Math.max(.06,it.r*1.4);m.scale.set(s,k==="log"?3.5:k==="stick"||k==="spear"?1:s,k==="log"?3.5:k==="stick"||k==="spear"?1:s);return m}
function addDrop(item,x,y,z,vel){const d={item,pos:new THREE.Vector3(x,y,z),vel:vel?vel.clone():new THREE.Vector3(),mesh:itemMesh(item),flying:!!vel,t:0};d.mesh.position.copy(d.pos);scene.add(d.mesh);world.drops.push(d);return d}
function throwHeld(){
  const k=world.held;if(!k||!inv(k))return toast("Nothing in hand to throw.");
  const it=ITEMS[k];if(it.place)return toast(`${it.name} is placed, not thrown.`);
  take(k);
  const m=it.mass,E=90;const v=Math.min(20,Math.sqrt(2*E/m));
  const dir=aimDir();
  const o=player.pos.clone().add(new THREE.Vector3(0,1.55,0)).addScaledVector(new THREE.Vector3(dir.x,0,dir.z).normalize(),.4);
  const d=addDrop(k,o.x,o.y,o.z,dir.clone().multiplyScalar(v).add(new THREE.Vector3(player.vel.x,0,player.vel.z)));
  d.launch=o.clone();d.v0=v;d.theta=Math.asin(clamp(dir.y,-1,1));d.thrown=true;
  GFX.playOnce(player.model,"Spell_Simple_Shoot",.45);
}
function aimDir(){const p=clamp(-player.camPitch+.32,-1.2,1.2),y=player.camYaw;return new THREE.Vector3(-Math.sin(y)*Math.cos(p),Math.sin(p),-Math.cos(y)*Math.cos(p)).normalize()}
function stepDrops(dt){
  for(const d of world.drops){
    if(!d.flying){if(d.floating){d.t+=dt;d.pos.y=Math.sin(d.t*2)*.03-.02;d.mesh.position.copy(d.pos);d.mesh.rotation.y+=dt*.2}continue}
    const it=ITEMS[d.item];d.t+=dt;
    const ground=heightAt(d.pos.x,d.pos.z),inWater=d.pos.y<0&&ground<0;if(inWater&&!d.splashed){d.splashed=true;GFX.FX.splash(d.pos.x,d.pos.z,14)}
    const vol=it.mass/it.density,area=Math.PI*it.r*it.r*(d.item==="stick"||d.item==="spear"||d.item==="log"?2:1);
    const sp=d.vel.length();
    const rho=inWater?RHO_WATER:RHO_AIR,Cd=d.item==="spear"?.3:.6;
    const drag=sp>0?.5*rho*Cd*area*sp*sp/it.mass:0;            // quadratic drag
    if(sp>0)d.vel.addScaledVector(d.vel,-Math.min(1,drag*dt/sp));
    d.vel.y-=G_ACC*dt;                                            // gravity
    if(inWater){const sub=clamp(-d.pos.y/(it.r*2),0,1);d.vel.y+=G_ACC*(RHO_WATER*vol*sub)/it.mass*dt; // Archimedes
      d.vel.multiplyScalar(Math.max(0,1-2*dt));
      if(it.density<RHO_WATER&&Math.abs(d.vel.y)<.3&&d.pos.y>-it.r*2){d.flying=false;d.floating=true;
        if(d.item==="stick"||d.item==="log")discover("buoyancy");else toast(`${it.name} floats: it is less dense than water.`)}
      if(d.pos.y<=ground+.05){d.flying=false;d.pos.y=ground+.05;if(it.density>RHO_WATER&&d.thrown)toast(`${it.name} sank (${it.density} kg/m³ > 1000 kg/m³).`)}}
    d.pos.addScaledVector(d.vel,dt);
    for(const a of animals){if(a.dead)continue;if(d.pos.distanceTo(a.pos.clone().setY(a.pos.y+.7*a.sp.size))<.55+a.sp.size*.4){
      const ke=.5*it.mass*sp*sp*(it.dmg||1);a.hp-=ke;a.flee=6;d.vel.multiplyScalar(-.2);toast(`Hit! ${Math.round(ke)} J delivered.`);if(a.hp<=0)killAnimal(a);break}}
    const g2=heightAt(d.pos.x,d.pos.z);
    if(d.pos.y<=g2+.03&&!(d.pos.y<0&&g2<0)){d.pos.y=g2+.03;d.flying=false;d.vel.set(0,0,0);onLanded(d)}
    d.mesh.position.copy(d.pos);if(d.flying)d.mesh.rotation.x+=dt*4;
  }
}
function onLanded(d){
  world.counters.falls++;if(world.counters.falls>=5)discover("gravity");
  if(d.thrown&&d.launch){
    const R=Math.hypot(d.pos.x-d.launch.x,d.pos.z-d.launch.z),pred=d.v0*d.v0*Math.sin(2*d.theta)/G_ACC;
    if(hasD("counting")&&R>2){world.counters.throws.push({item:d.item,v:+d.v0.toFixed(1),deg:Math.round(d.theta*180/Math.PI),R:+R.toFixed(1),pred:+pred.toFixed(1),dh:+(d.pos.y-d.launch.y).toFixed(1)});
      toast(`Measured: ${ITEMS[d.item].name} flew ${R.toFixed(1)} m (vacuum prediction ${pred.toFixed(1)} m).`);
      if(world.counters.throws.length>=5)discover("motion")}
    else toast(`${ITEMS[d.item].name} landed ${R.toFixed(1)} m away.`);
    d.thrown=false;
  }
}

/* ---------------- structures ---------------- */
function structMesh(s){
  const g=new THREE.Group();
  if(s.type==="fire"||s.type==="kiln"){
    if(s.type==="kiln"){const d=new THREE.Mesh(new THREE.SphereGeometry(.9,20,10,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0x9c5a3c,roughness:.95}));d.castShadow=d.receiveShadow=true;g.add(d);const hole=box(.45,.4,.2,0x1a0d08,.2);hole.position.z=.82;g.add(hole)}
    else{for(let i=0;i<5;i++){const l=new THREE.Mesh(GEO.stick,MAT.bark);l.scale.set(.85,1.4,1.4);l.rotation.set(0,i*1.256,.45);l.position.set(Math.cos(i*1.256)*.12,.16,-Math.sin(i*1.256)*.12);l.castShadow=true;g.add(l)}
      for(let i=0;i<9;i++){const r=new THREE.Mesh(GEO.small,MAT.stone);r.scale.set(.13,.09,.11);r.position.set(Math.cos(i/9*6.283)*.5,.04,Math.sin(i/9*6.283)*.5);g.add(r)}}
    const f=GFX.makeFlame(s.type==="kiln");f.visible=false;if(s.type==="kiln")f.position.z=.8;g.add(f);s.flame=f;
  }else if(s.type==="leanto"){const r=box(2.4,.08,2.2,0x7a6a3e);r.rotation.x=-.85;r.position.set(0,1,-.2);g.add(r);const p1=box(.08,1.6,.08,0x6b4a2b,.8);p1.position.set(-1.1,0,.55);const p2=p1.clone();p2.position.x=1.1;g.add(p1,p2)}
  else if(s.type==="raft"){for(let i=0;i<4;i++){const l=new THREE.Mesh(GEO.stick,MAT.bark);l.scale.set(2.6,4,4);l.position.set(0,.05,(i-1.5)*.32);g.add(l)}}
  else if(s.type==="table"){g.add(box(1.4,.08,.8,0x7a5a34,.8));for(const [x,z] of [[-.6,-.3],[.6,-.3],[-.6,.3],[.6,.3]]){const l=box(.08,.8,.08,0x6b4a2b,.4);l.position.set(x,0,z);g.add(l)}const t=box(.3,.05,.22,0xb67a52,.87);g.add(t)}
  else if(s.type==="crop"){for(let i=0;i<5;i++){const t=new THREE.Mesh(GEO.tuft,new THREE.MeshStandardMaterial({color:0x7fb04a,roughness:.8}));t.scale.setScalar(.4);t.position.set((i%3-1)*.35,0,(Math.floor(i/3)-.5)*.4);g.add(t)}}
  else if(s.type==="gnomon"){g.add(box(.05,1,.05,0xa07a4a,.5));const sh=box(.04,.01,1,0x1a1a1a,.01);sh.geometry.translate(0,0,-.5);g.add(sh);s.shadow=sh}
  g.position.set(s.x,s.y,s.z);g.rotation.y=s.ry||0;scene.add(g);s.obj=g;return g;
}
function place(type,extra={}){
  const f=forward();let x=player.pos.x+f.x*1.8,z=player.pos.z+f.z*1.8;
  if(type==="raft"){let ok=false;for(let r=1.5;r<9&&!ok;r+=.5){const tx=player.pos.x+f.x*r,tz=player.pos.z+f.z*r;if(heightAt(tx,tz)<-.4){x=tx;z=tz;ok=true}}if(!ok){toast("Rafts must be launched on water — face open water.");return null}}
  const y=type==="raft"?0:heightAt(x,z);
  const s={type,x,y,z,ry:player.yaw,...extra};
  if(type==="fire")Object.assign(s,{fuel:1.5,lit:false,heat:0,temp:15});
  if(type==="kiln")Object.assign(s,{fuel:0,lit:false,heat:0,temp:15,bellows:false});
  world.structures.push(s);structMesh(s);return s;
}
function structuresNear(x,z,r,type){return world.structures.filter(s=>(!type||s.type===type)&&Math.hypot(s.x-x,s.z-z)<r)}
function sheltered(x,z){return structuresNear(x,z,2.6,"leanto").length>0}
const fireLights=[];
function stepFires(dt,dtg){
  const raining=world.weather.kind==="rain"&&world.weather.amt>.3;
  for(const s of world.structures){
    if(s.type!=="fire"&&s.type!=="kiln")continue;
    if(s.lit){
      s.fuel-=dtg/3600*(s.bellows?2:1)*(s.type==="kiln"?1.3:1);              // kg of wood per hour
      if(raining&&!sheltered(s.x,s.z)&&s.type==="fire")s.heat-=dt*.025*world.weather.amt; else s.heat=Math.min(1,s.heat+dt*.08);
      if(s.fuel<=0){s.lit=false;s.fuel=0;toast("The fire died: it ran out of fuel.");discover("combustion")}
      else if(s.heat<.12){s.lit=false;toast("The rain put the fire out.");discover("combustion")}
      const target=s.type==="kiln"?(s.bellows?1300:1150):850;
      s.temp=lerp(s.temp,target*s.heat,Math.min(1,dt*.15));
      // spread to dry trees (needs oxygen & dry fuel)
      if(s.type==="fire"&&!raining&&s.heat>.8&&Math.random()<dt*.01){const t=nearestTree(s.x,s.z,3.2);if(t&&!t.t.burnt&&!t.t.burning&&biomeAt(t.t.x,t.t.z,t.t.y)!=="snow")igniteTree(t)}
    }else{s.temp=lerp(s.temp,airTemp(s.x,s.z,s.y),Math.min(1,dt*.05));s.heat=Math.max(0,s.heat-dt*.1)}
    if(s.flame){s.flame.visible=s.lit;if(s.lit){const k=.6+.4*s.heat+Math.sin(performance.now()/90+s.x)*.08;s.flame.scale.set(k,k*(.8+Math.random()*.3),k);if(Math.hypot(s.x-player.pos.x,s.z-player.pos.z)<120)GFX.FX.fire("s"+s.x.toFixed(1)+s.z.toFixed(1),s.x+(s.type==="kiln"?0:0),s.y+(s.type==="kiln"?.9:.1),s.z,s.heat,dt,s.type==="kiln"?.45:1)}}
  }
  // up to 4 nearest lit fires get real point lights (physically-based 1/d² decay)
  const lit=world.structures.filter(s=>s.lit).sort((a,b)=>Math.hypot(a.x-player.pos.x,a.z-player.pos.z)-Math.hypot(b.x-player.pos.x,b.z-player.pos.z)).slice(0,4);
  while(fireLights.length<4){const l=new THREE.PointLight(0xff8a3a,0,45,2);l.shadow.mapSize.set(512,512);l.shadow.bias=-.002;scene.add(l);fireLights.push(l)}
  const tt=performance.now()/1000;
  fireLights.forEach((l,i)=>{const s=lit[i];l.castShadow=i===0&&GFX.Q.fireShadow&&!!s;if(s){l.position.set(s.x,s.y+1.1,s.z);const fl=.82+.1*Math.sin(tt*11+i)+.08*Math.sin(tt*23.7+i*3);l.intensity=(s.type==="kiln"?14:34)*s.heat*fl}else l.intensity=0});
}
const burning=[];
function nearestTree(x,z,r){let best=null,bd=r;for(const ch of nearbyChunks(x,z,r))for(const t of ch.obj.trees){if(t.gone)continue;const d=Math.hypot(t.x-x,t.z-z);if(d<bd){bd=d;best={ch,t,d}}}return best}
function igniteTree(tt){if(burning.length>25)return;tt.t.burning=true;burning.push({...tt,time:0});refreshTree(tt.ch,tt.t);toast("A tree caught fire!")}
function stepBurning(dt){
  const raining=world.weather.kind==="rain"&&world.weather.amt>.3;
  for(let i=burning.length-1;i>=0;i--){const b=burning[i];b.time+=dt*(raining?3:1);GFX.FX.fire("t"+b.ch.key+b.t.i,b.t.x,b.t.y+2.2*b.t.s,b.t.z,1,dt,2.2);
    if(!raining&&Math.random()<dt*.06){const n=nearestTree(b.t.x+(Math.random()-.5)*6,b.t.z+(Math.random()-.5)*6,4);if(n&&!n.t.burning&&!n.t.burnt)igniteTree(n)}
    if(b.time>25){b.t.burning=false;world.burnt.add(b.ch.key+"|t"+b.t.i);refreshTree(b.ch,b.t);burning.splice(i,1)}}
}

/* ---------------- environment ---------------- */
function hourOf(t=world.gameTime){return (t/3600)%24}
function sunElevation(){return Math.sin(2*Math.PI*(hourOf()-6)/24)}
function waterTemp(x,z){return clamp(climate(x,z,0).t*.6+3,1,26)}
function airTemp(x,z,y){
  const {t,m}=climate(x,z,Math.max(0,y));const b=biomeAt(x,z,heightAt(x,z));
  const amp=b==="desert"?11:b==="beach"?3:6;
  const diurnal=amp*Math.cos(2*Math.PI*(hourOf()-15)/24);
  const w=world.weather.kind==="rain"?-3*world.weather.amt:world.weather.kind==="cloudy"?-1:0;
  return t+(b==="desert"?6:0)+diurnal+w;   // includes −6.5 °C/km lapse rate via climate()
}
function stepWeather(dtg){
  const w=world.weather;w.t-=dtg;
  if(w.t<=0){const b=biomeAt(player.pos.x,player.pos.z,player.pos.y),r=Math.random();
    w.kind=b==="desert"?(r<.85?"clear":r<.97?"cloudy":"rain"):(r<.5?"clear":r<.72?"cloudy":"rain");w.t=(2+Math.random()*5)*3600}
  w.amt=lerp(w.amt,w.kind==="rain"?1:0,Math.min(1,dtg/1800));
}
const _sunDir=new THREE.Vector3();
function updateSky(dt=.016){
  const el=sunElevation(),a=2*Math.PI*(hourOf()-6)/24;
  _sunDir.set(Math.cos(a),Math.sin(a),.25).normalize();
  const snow=airTemp(player.pos.x,player.pos.z,player.pos.y)<.5;
  const under=camera.position.y<-.05&&heightAt(camera.position.x,camera.position.z)<0;
  GFX.updateEnvironment({sunDir:_sunDir,el,amt:world.weather.amt,kind:world.weather.kind,pos:player.pos,cam:camera.position,snow,gameTime:world.gameTime,dt,under});
  GFX.setUnderwater(under?1:0);
}

/* ---------------- player physics & survival ---------------- */
const keys=new Set();
function forward(){return new THREE.Vector3(-Math.sin(player.camYaw),0,-Math.cos(player.camYaw))}
function makePlayer(w){
  const p={pos:new THREE.Vector3(...w.pos),vel:new THREE.Vector3(),yaw:w.yaw||0,camYaw:w.cam[0],camPitch:w.cam[1],camDist:w.cam[2],onGround:true,swimming:false,raft:null,model:makeHuman(),dead:false,throwAnim:0,lookUpT:0,fall:0};
  scene.add(p.model);return p;
}
function groundMu(){const b=biomeAt(player.pos.x,player.pos.z,heightAt(player.pos.x,player.pos.z));return b==="snow"?.35:b==="beach"||b==="desert"?.6:.8} // friction coefficients
function stepPlayer(dt){
  const p=player,st=world.st;if(p.dead)return;
  const f=forward(),r=new THREE.Vector3(-f.z,0,f.x);
  const mv=new THREE.Vector3();
  if(keys.has("KeyW")||keys.has("ArrowUp"))mv.add(f);if(keys.has("KeyS")||keys.has("ArrowDown"))mv.sub(f);
  if(keys.has("KeyD")||keys.has("ArrowRight"))mv.add(r);if(keys.has("KeyA")||keys.has("ArrowLeft"))mv.sub(r);
  if(mv.lengthSq())mv.normalize();
  const ground=heightAt(p.pos.x,p.pos.z);
  if(p.raft){
    const s=p.raft,sp=3.2,nx=s.x+mv.x*sp*dt,nz=s.z+mv.z*sp*dt;
    if(heightAt(nx,nz)<-.25){world.counters.raftDist+=Math.hypot(nx-s.x,nz-s.z);s.x=nx;s.z=nz;s.obj.position.set(s.x,.02+Math.sin(performance.now()/600)*.03,s.z);if(world.counters.raftDist>10)discover("raft")}
    else if(mv.lengthSq()){p.raft=null;p.pos.set(nx,heightAt(nx,nz),nz);toast("You stepped ashore.");return}
    p.pos.set(s.x,.12,s.z);p.vel.set(mv.x*sp,0,mv.z*sp);p.onGround=true;p.swimming=false;if(mv.lengthSq())p.yaw=Math.atan2(mv.x,mv.z);return;
  }
  const depth=-p.pos.y;p.swimming=ground<-.6&&p.pos.y<-.55;
  const running=(keys.has("ShiftLeft")||keys.has("ShiftRight"))&&st.stamina>5&&mv.lengthSq()>0&&!p.swimming;
  const maxV=p.swimming?1.3:running?5.2:2.2;
  const desired=mv.multiplyScalar(maxV);
  const accel=p.swimming?3:p.onGround?groundMu()*G_ACC:1.2;   // friction limits how fast feet can change velocity
  const dvx=desired.x-p.vel.x,dvz=desired.z-p.vel.z,dl=Math.hypot(dvx,dvz),lim=accel*dt;
  if(dl>0){const k=Math.min(1,lim/dl);p.vel.x+=dvx*k;p.vel.z+=dvz*k}
  if(p.swimming){
    const sub=clamp((depth+.25)/1.75,0,1),rhoBody=st.stamina>0?950:1030;          // lungs full ⇒ ~950 kg/m³
    p.vel.y+=(G_ACC*RHO_WATER*sub/rhoBody-G_ACC)*dt;                                // Archimedes vs gravity
    if(keys.has("Space")&&st.stamina>0)p.vel.y+=3*dt;
    p.vel.y-=p.vel.y*Math.min(1,.5*RHO_WATER*1.0*.25*Math.abs(p.vel.y)/BODY_MASS*dt+1.5*dt); // water drag (vertical)
    st.stamina-=dt*(mv.lengthSq()?5:2);if(st.stamina<=0){st.stamina=0;hurt(dt*3,null)}
    st.wet=1;
  }else{
    p.vel.y-=G_ACC*dt;                                                              // gravity
    const sp=p.vel.length();if(sp>0)p.vel.addScaledVector(p.vel,-.5*RHO_AIR*1*.7*sp/BODY_MASS*dt); // air drag (terminal ≈ 40 m/s)
    if(keys.has("Space")&&p.onGround&&st.stamina>8){p.vel.y=Math.sqrt(2*G_ACC*.55);p.onGround=false;st.stamina-=8}
    if(running)st.stamina-=dt*14;
  }
  p.pos.addScaledVector(p.vel,dt);
  if(p.pos.y<-.2&&ground<0)st.wet=Math.max(st.wet,.8);
  const g=heightAt(p.pos.x,p.pos.z);
  if(!p.swimming&&p.pos.y<=g){
    const impact=-p.vel.y;if(impact>3.2)GFX.FX.dust(p.pos.x,g,p.pos.z,Math.min(30,impact*3));
    if(impact>9){const dmg=(impact-9)*11;hurt(dmg,`Hard landing at ${impact.toFixed(1)} m/s`);if(!p.dead)discover("impact")}
    p.pos.y=g;p.vel.y=0;p.onGround=true;
    const sl=slopeAt(p.pos.x,p.pos.z);if(sl>1.05){const e=1;const gx=(heightAt(p.pos.x+e,p.pos.z)-heightAt(p.pos.x-e,p.pos.z)),gz=(heightAt(p.pos.x,p.pos.z+e)-heightAt(p.pos.x,p.pos.z-e));p.vel.x-=gx*2*dt*G_ACC*.3;p.vel.z-=gz*2*dt*G_ACC*.3}
  }else if(p.pos.y>g+.05)p.onGround=false;
  if(p.swimming&&p.pos.y<g)p.pos.y=g;
  // boulders block the way
  for(const ch of nearbyChunks(p.pos.x,p.pos.z,4))for(const b of ch.obj.boulders){const dx=p.pos.x-b.x,dz=p.pos.z-b.z,d=Math.hypot(dx,dz),rr=b.s*.95+.3;if(d<rr&&p.pos.y<b.y+b.s*1.2){p.pos.x=b.x+dx/d*rr;p.pos.z=b.z+dz/d*rr}}
  const hs=Math.hypot(p.vel.x,p.vel.z);if(hs>.3)p.yaw=Math.atan2(p.vel.x,p.vel.z);
  if(!running&&!p.swimming&&world.st.hunger>5)st.stamina=Math.min(100,st.stamina+dt*12);
}
function fireHeatAt(x,z){ // radiant power received (W): P·A/(4πd²), body cross-section ≈ 0.7 m²
  let q=0;for(const s of world.structures){if(!s.lit)continue;const d=Math.max(.8,Math.hypot(s.x-x,s.z-z));q+=Math.min(400,(s.type==="kiln"?2500:8000)*s.heat*.7/(4*Math.PI*d*d))}return q}
function stepSurvival(dt){
  if(player.dead)return;
  const st=world.st,dtg=dt*GAME_SPEED,x=player.pos.x,z=player.pos.z;
  const Ta=player.swimming?waterTemp(x,z):airTemp(x,z,player.pos.y);
  const speed=Math.hypot(player.vel.x,player.vel.z),activity=player.swimming?4:speed>3.5?3:speed>.5?1:0;
  let M=90+activity*90+(st.tb<36.3?120:0);                                  // metabolic heat (W), shivering adds heat
  const clothed=world.worn==="clothing",shelter=sheltered(x,z);
  let hA=player.swimming?60:9*(world.weather.amt>.3&&!shelter?1.4:1)*(shelter?.6:1);  // heat transfer coefficient·area (W/K)
  hA*=1+1.5*st.wet;
  const I=clothed?2.4:1;
  const sunW=sunElevation()>0&&world.weather.kind==="clear"?60*sunElevation():0;
  const fire=fireHeatAt(x,z);
  let L=hA*(st.tb-Ta)/I+st.wet*90;
  if(st.tb>37.3){const sweat=Math.min(350,(st.tb-37.3)*400);L+=sweat;st.thirst-=sweat/350*dt*.15}
  const net=M+sunW+fire-L;
  const prev=st.tb;st.tb=clamp(st.tb+net*dtg/BODY_HEAT_CAP,28,43);
  if(prev<36&&fire>60&&st.tb>prev){world.counters.warmFrom=world.counters.warmFrom||prev;if(st.tb-world.counters.warmFrom>.3)discover("warmth")}else if(st.tb>=36.5)world.counters.warmFrom=0;
  // wetness: rain soaks, warmth and fire dry
  if(world.weather.amt>.3&&!shelter)st.wet=Math.min(1,st.wet+dt*.02*world.weather.amt);
  else if(!player.swimming)st.wet=Math.max(0,st.wet-dt*.004*(1+Math.max(0,Ta)/15+fire/80));
  if(st.wet>.6&&Ta<10)discover("evaporative");
  const meta=M/90;
  st.hunger=Math.max(0,st.hunger-dtg*100/129600*meta*(st.sick>0?2:1));
  st.thirst=Math.max(0,st.thirst-dtg*100/86400*(Ta>30?1.8:1)*(st.sick>0?2:1));
  if(st.sick>0){st.sick-=dt;hurt(dt*.15,null)}
  if(st.hunger<=0)hurt(dt*.4,null);if(st.thirst<=0)hurt(dt*.6,null);
  if(st.tb<35)hurt(dt*.6*(35-st.tb),null);if(st.tb>39.5)hurt(dt*.6*(st.tb-39.5),null);
  if(st.hunger>30&&st.thirst>30&&st.tb>35.5&&st.tb<38.5&&st.sick<=0)st.health=Math.min(100,st.health+dt*.25);
  player.Ta=Ta;player.netW=net;player.fireW=fire;
}
function hurt(n,why){const st=world.st;st.health-=n;if(why)toast(why+` (−${Math.round(n)} health)`);if(st.health<=0&&!player.dead)die(why||"Your body gave out")}
function die(why){
  player.dead=true;world.deaths++;
  const o=$("#wDeath");o.hidden=false;o.innerHTML=`<div class="box"><h2>YOU DIED</h2><p>${esc(why)}.</p><p class="muted">Your knowledge survives. You lose what you carried.</p><button class="primary" id="wRespawn">RETURN TO CAMP</button></div>`;
  $("#wRespawn").onclick=respawn;try{document.exitPointerLock?.()}catch(_){}
}
function respawn(){
  const keep=world.worn;world.inv={};if(keep)world.worn=keep;world.held=null;
  Object.assign(world.st,{health:70,hunger:60,thirst:60,stamina:100,tb:37,wet:0,sick:0});
  player.dead=false;player.raft=null;player.vel.set(0,0,0);player.pos.set(world.camp[0],heightAt(world.camp[0],world.camp[1])+.2,world.camp[1]);
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
function discover(id,quiet){
  if(!world||hasD(id))return false;const d=WD.get(id);if(!d)return false;
  world.disc.push(id);const added=applyKnowledge(d);
  const unlocked=RECIPES.filter(r=>r.req===id).map(r=>ITEMS[r.out].name);
  if(!quiet)showDiscovery(d,added,unlocked);
  save();return true;
}
function linkedAtlasIds(d){const out=[];for(const t of d.tree){const td=treeById.get(t);if(td)out.push(...td.atlas)}out.push(...d.atlas);return [...new Set(out)].filter(a=>!atlas||atlas.index.has(a))}
function chip(id){if(!atlas)return "";const i=atlas.index.get(id);if(i===undefined)return "";const n=atlas.nodes[i],f=atlas.famById.get(n.field)||{color:"#67dcff",short:n.field};
  return `<span class="chip${n.frontier?" frontier":""}" title="${esc(n.label)} — ${esc(f.short)}\n${esc(n.summary)}"><i style="background:${f.color}"></i>${esc(n.label)}</span>`}
function showDiscovery(d,added,unlocked){
  const ids=linkedAtlasIds(d);
  const o=$("#wPopup");o.hidden=false;paused=true;try{document.exitPointerLock?.()}catch(_){}
  o.innerHTML=`<div class="box disc-pop"><small>DISCOVERY · ${esc(TREE.ERAS[d.age].name.toUpperCase())}</small><h2>${esc(d.name)}</h2>
    <p class="how">${esc(d.how)}</p><h4>THE PRINCIPLE</h4><p>${esc(d.principle)}</p>
    ${ids.length?`<h4>ATLAS NODES ${atlas?`REVEALED (+${added})`:"(will appear when the atlas finishes loading)"}</h4><div class="chips">${ids.map(chip).join("")}</div>`:`<p class="muted">No matching atlas node yet — the atlas keeps this discovery unlinked.</p>`}
    ${unlocked.length?`<h4>NEW CRAFTING</h4><p>${unlocked.map(esc).join(" · ")}</p>`:""}
    <button class="primary" id="wPopOk">CONTINUE (E)</button></div>`;
  $("#wPopOk").onclick=closePopup;renderJournal();
}
function closePopup(){$("#wPopup").hidden=true;paused=false;clock.getDelta()}
function onAtlas(A){atlas=A;for(const id of world.disc)applyKnowledge(WD.get(id));renderJournal();toast(`Atlas loaded: ${A.total.toLocaleString()} nodes in the fog.`)}

/* ---------------- interaction ---------------- */
function frontPoint(r=1){const f=forward();return {x:player.pos.x+f.x*r,z:player.pos.z+f.z*r}}
function findTarget(){
  const fp=frontPoint(.9),x=fp.x,z=fp.z;let best=null,bd=2.4;
  const cons=(kind,obj,d)=>{if(d<bd){bd=d;best={kind,obj}}};
  for(const d of world.drops)if(!d.flying)cons("drop",d,Math.hypot(d.pos.x-x,d.pos.z-z)+(d.floating?.3:0));
  for(const ch of nearbyChunks(x,z,4)){
    for(const r of ch.obj.res)if(!r.gone)cons("res",{ch,r},Math.hypot(r.x-x,r.z-z));
    for(const t of ch.obj.trees)if(!t.gone)cons("tree",{ch,t},Math.hypot(t.x-x,t.z-z)-.4);
    for(const b of ch.obj.boulders)cons("boulder",{ch,b},Math.hypot(b.x-x,b.z-z)-b.s);
  }
  for(const s of world.structures)if(s.type!=="raft"||!player.raft)cons("struct",s,Math.hypot(s.x-x,s.z-z)-(s.type==="kiln"||s.type==="table"?.6:.2));
  if(!best&&(heightAt(x,z)<0||player.swimming))best={kind:"water"};
  return best;
}
function targetLabel(t){
  if(!t)return "";
  if(t.kind==="drop")return `E  pick up ${ITEMS[t.obj.item].name}`;
  if(t.kind==="res")return `E  gather ${ITEMS[t.obj.r.type].name}`;
  if(t.kind==="tree")return t.obj.t.burning?"Burning tree":hasAxe()?"E  chop tree (axe)":"E  break off sticks";
  if(t.kind==="boulder")return world.held==="log"?"Q  lever the boulder with the log":world.held==="flint"?"Q  knap flint on the boulder":"Boulder (~500 kg)";
  if(t.kind==="water")return "E  drink"+(world.held==="pot"?" · Q fill pot":"");
  const s=t.obj;
  if(s.type==="fire")return s.lit?`Fire ${Math.round(s.temp)} °C · ${s.fuel.toFixed(1)} kg fuel · E add fuel`:`Firewood pile (${s.fuel.toFixed(1)} kg) · Q light with flint+pyrite or lens`;
  if(s.type==="kiln")return `Kiln ${Math.round(s.temp)} °C${s.bellows?" · bellows":""} · ${s.fuel.toFixed(1)} kg fuel · E add fuel · Q put held item in`;
  if(s.type==="table")return "E  study (1 hour)";
  if(s.type==="raft")return "E  board raft";
  if(s.type==="crop")return cropGrowth(s)>=1?"E  harvest crop":`Crop ${Math.round(cropGrowth(s)*100)}% grown`;
  if(s.type==="leanto")return "Lean-to shelter (blocks wind & rain)";
  if(s.type==="gnomon")return "Shadow stick";
  return "";
}
function hasAxe(){return inv("axe_iron")?3:inv("axe_bronze")?2:inv("axe_stone")?1:0}
function cropGrowth(s){return clamp((world.gameTime-s.planted)/(6*3600)*(s.cold?.5:1),0,1)}
function interact(){
  const t=findTarget();if(!t)return;
  if(t.kind==="drop"||t.kind==="res")GFX.playOnce(player.model,"PickUp_Table",.6);
  if(t.kind==="drop"){const d=t.obj;scene.remove(d.mesh);world.drops.splice(world.drops.indexOf(d),1);give(d.item);toast(`Picked up ${ITEMS[d.item].name}.`);return}
  if(t.kind==="res"){const {ch,r}=t.obj;r.gone=true;r.mesh.setMatrixAt(r.slot,ZERO);r.mesh.instanceMatrix.needsUpdate=true;world.removed.add(ch.key+"|r"+r.i);
    const n=r.type==="stick"?2:1;give(r.type,n);if(r.type==="fiber"&&Math.random()<.4)give("seeds");toast(`Gathered ${n>1?n+"× ":""}${ITEMS[r.type].name}.`);return}
  if(t.kind==="tree"){const {ch,t:tr}=t.obj;if(tr.burning)return toast("Too hot — it's burning!");
    if(hasAxe()){tr.hits=(tr.hits||0)+hasAxe();if(tr.hits>=3){tr.gone=true;world.removed.add(ch.key+"|t"+tr.i);refreshTree(ch,tr);give("log",tr.burnt?1:2);give("stick",2);toast("Timber! Logs gathered.")}else toast("Chop…");}
    else{tr.sticks=(tr.sticks||0)+1;if(tr.sticks>3)return toast("No more reachable branches here.");give("stick");toast("Broke off a stick.")}return}
  if(t.kind==="boulder")return toast("Too heavy to move by hand. A long lever might do it.");
  if(t.kind==="water"){world.st.thirst=Math.min(100,world.st.thirst+25);if(Math.random()<.12){world.st.sick=60;toast("You drank untreated water and feel ill.")}else toast("You drink from the water.");return}
  const s=t.obj;
  if(s.type==="fire"||s.type==="kiln"){if(take("log")){s.fuel+=5;toast("Added a log (5 kg).")}else if(take("stick")){s.fuel+=.5;toast("Added a stick (0.5 kg).")}else toast("You need sticks or logs as fuel.");return}
  if(s.type==="raft"){player.raft=s;toast("You board the raft. Move with WASD; walk into land to step ashore.");return}
  if(s.type==="table")return study();
  if(s.type==="crop"&&cropGrowth(s)>=1){s.obj&&scene.remove(s.obj);world.structures.splice(world.structures.indexOf(s),1);give("grain",3);give("seeds",2);toast("Harvested 3 grain and 2 seeds.");discover("agriculture");return}
}
function useHeld(){
  const k=world.held,t=findTarget(),s=t&&t.kind==="struct"?t.obj:null;
  if(!k)return toast("Nothing in hand.");
  const fireNear=structuresNear(player.pos.x,player.pos.z,2.6).find(x=>(x.type==="fire"||x.type==="kiln"));
  const raining=world.weather.amt>.4&&!sheltered(player.pos.x,player.pos.z);
  if((k==="flint"&&inv("pyrite"))||(k==="pyrite"&&inv("flint"))){GFX.playOnce(player.model,"Punch_Cross",.5);{const fp=fireNear||frontPoint(.7);GFX.FX.sparks(fp.x,(fireNear?fireNear.y:player.pos.y)+.35,fp.z,30)}
    if(fireNear&&!fireNear.lit){if(fireNear.fuel<=0)return toast("Sparks fly, but there's no fuel. Add sticks first.");if(raining&&Math.random()<.7)return toast("Sparks fly, but the tinder is soaked by rain.");
      fireNear.lit=true;fireNear.heat=.3;toast("Sparks catch the dry tinder — fire!");discover("fire");if(fireNear.type==="kiln")discover("kiln");return}
    if(!fireNear)return toast("Sparks fly from the pyrite! You need dry fuel nearby — craft a firewood pile.");
  }
  if(k==="flint"&&(t?.kind==="boulder"||inv("stone"))){GFX.playOnce(player.model,"Punch_Cross",.5);{const fp=frontPoint(.6);GFX.FX.sparks(fp.x,player.pos.y+1,fp.z,10);GFX.FX.dust(fp.x,player.pos.y+.6,fp.z,6)}take("flint");give("flake",2);toast("Conchoidal flakes split off: 2 sharp stone flakes.");discover("knapping");return}
  if(k==="flint")return toast("Flint on ordinary stone barely sparks. Try pyrite, or a hammerstone for knapping.");
  if(k==="lens"){if(fireNear&&!fireNear.lit){if(sunElevation()>.25&&world.weather.kind==="clear"){fireNear.lit=true;fireNear.heat=.3;toast("The lens focuses sunlight to a burning point — smoke, then flame!");discover("optics");if(fireNear.type==="kiln")discover("kiln")}else toast("You need strong, direct sunlight to focus.");return}return toast("A lens: try focusing the sun onto a firewood pile.")}
  if(k==="log"&&t?.kind==="boulder"){const {ch,b}=t.obj,f=forward();b.x+=f.x*1.6;b.z+=f.z*1.6;b.y=heightAt(b.x,b.z);setInst(ch.boulders,b.i,b.x,b.y+b.s*.35,b.z,b.s*1.2,b.s*.8,b.s,b.i);ch.boulders.instanceMatrix.needsUpdate=true;world.moved[ch.key+"|"+b.i]=[b.x,b.z];toast("With a long lever, the boulder rolls.");discover("lever");return}
  if(k==="meat_raw"&&fireNear?.lit&&fireNear.temp>70){take("meat_raw");give("meat_cooked");toast("The meat sizzles and cooks through.");discover("cooking");return}
  if(k==="clay"&&fireNear?.lit&&fireNear.temp>550){take("clay");give("pot");toast(`Fired at ${Math.round(fireNear.temp)} °C, the clay becomes a ceramic pot.`);discover("ceramics");return}
  if(k==="clay"&&fireNear?.lit)return toast(`The fire is only ${Math.round(fireNear.temp)} °C — let it build up (clay needs ~600 °C).`);
  if(k==="pot"&&(t?.kind==="water"||player.swimming||heightAt(frontPoint(1.2).x,frontPoint(1.2).z)<0)){take("pot");give("pot_water");toast("Filled the pot with water.");return}
  if(k==="pot_water"&&fireNear?.lit&&fireNear.temp>150){const alt=Math.max(0,player.pos.y),bp=100-alt/285;take("pot_water");give("pot_clean");toast(`The water boils at ${bp.toFixed(1)} °C here (altitude ${Math.round(alt)} m).`);discover("boiling");if(alt>900)discover("pressure");return}
  if(fireNear?.type==="kiln"&&fireNear.lit&&["copper_ore","tin_ore","iron_ore","sand","copper","tin"].includes(k))return kilnUse(fireNear,k);
  if(k==="bellows"&&fireNear?.type==="kiln")return kilnUse(fireNear,k);
  if(k==="seeds"){if(player.swimming)return;let wet=false;for(let a=0;a<16&&!wet;a++)for(const r of [6,12,18])if(heightAt(player.pos.x+Math.cos(a/16*6.283)*r,player.pos.z+Math.sin(a/16*6.283)*r)<0)wet=true;
    if(!wet)return toast("These seeds need water nearby to grow — plant within ~18 m of water.");
    take("seeds");const c=place("crop",{planted:world.gameTime,cold:airTemp(player.pos.x,player.pos.z,player.pos.y)<8});toast("Planted. Crops need water, light and warmth — about 6 hours to grow.");return}
  if(k==="tally"){world.counters.tally++;toast(`Notch ${world.counters.tally} carved.`);if(world.counters.tally>=10)discover("counting");return}
  if(k==="tablet"){if(!hasD("counting"))return toast("You have nothing to record yet — learn to count first.");toast("You press counted marks into the wet clay.");discover("writing");return}
  if(k==="gnomon"){take("gnomon");place("gnomon",{planted:world.gameTime});toast("Shadow stick planted. Watch its shadow over the next hour of daylight.");return}
  if(k==="lodestone"){const near=nearbyChunks(player.pos.x,player.pos.z,4).some(ch=>ch.obj.res.some(r=>!r.gone&&r.type==="iron_ore"&&Math.hypot(r.x-player.pos.x,r.z-player.pos.z)<3));
    if(inv("iron_ore")||near){toast("The lodestone tugs at the iron ore!");discover("magnetism")}else toast("A heavy black stone. Try it near iron ore.");return}
  if(k==="compass"){const h=((Math.atan2(-forward().x,-forward().z)*180/Math.PI)+360)%360;toast(`The floating lodestone settles north–south. You face ${Math.round(h)}° from north.`);discover("compass");return}
  if(k==="telescope"){player.zoom=!player.zoom;if(player.zoom&&sunElevation()<-.05){const dir=new THREE.Vector3();camera.getWorldDirection(dir);const md=moonMesh.position.clone().sub(camera.position).normalize();if(dir.angleTo(md)<.35){toast("Craters and mountains on the Moon!");discover("telescope")}else toast("Find the Moon and look again.")}return}
  const it=ITEMS[k];
  if(it.place){take(k);const p=place(it.place);if(!p){give(k);return}if(it.place==="leanto"){world.camp=[p.x,p.z];toast("Lean-to built. This is your camp now.");discover("shelter")}else if(it.place==="raft")toast("Raft launched. E to board.");else if(it.place==="table")toast("Study table ready. E to study.");else toast(`${it.name} placed.`);return}
  if(it.food||it.drink)return eat();
  throwHeld();
}
function kilnUse(k,item){
  if(item==="bellows"){if(!k.bellows){take("bellows");k.bellows=true;toast("Bellows fitted: forced air raises the kiln temperature.")}return}
  const T=k.temp;
  const need={copper_ore:1085,tin_ore:1000,iron_ore:1200,sand:1000,clay:550,copper:1085};
  if(need[item]&&T<need[item])return toast(`The kiln is ${Math.round(T)} °C — this needs about ${need[item]} °C.${item==="iron_ore"?" Fit bellows for more air.":""}`);
  if(item==="copper_ore"){take(item);give("copper");toast("Molten copper beads out of the ore.");discover("smelting");return}
  if(item==="tin_ore"){take(item);give("tin");toast("Bright tin is reduced from the cassiterite.");return}
  if(item==="iron_ore"){if(!hasD("bronze"))return toast("Your furnace craft isn't advanced enough yet — master bronze first.");take(item);give("iron");toast("A spongy iron bloom forms. Hammer it into shape.");discover("iron");return}
  if(item==="sand"){take(item);give("glass");toast("The sand fuses into glass.");discover("glass");return}
  if(item==="clay"){take(item);give("pot");discover("ceramics");return}
  if((item==="copper"&&inv("tin"))||(item==="tin"&&inv("copper"))){take("copper");take("tin");give("bronze");toast("Copper and tin melt together into bronze.");discover("bronze");return}
  toast("Nothing happens in the kiln.");
}
function eat(){
  const k=world.held,it=k&&ITEMS[k];if(!it||!(it.food||it.drink))return toast("You can't eat or drink that.");
  const st=world.st;
  if(it.drink){take(k);give("pot");st.thirst=Math.min(100,st.thirst+it.drink);if(k==="pot_water"&&Math.random()<.12){st.sick=60;toast("Unboiled water — you feel ill.")}else toast("Refreshing.");return}
  take(k);st.hunger=Math.min(100,st.hunger+it.food);
  if(k==="berry_red"){st.sick=45;toast("Bitter… these red berries make you sick.")}
  else if(k==="meat_raw"&&Math.random()<.35){st.sick=60;toast("Raw meat — food poisoning!")}
  else toast(`You eat the ${it.name.toLowerCase()}.`);
  if(k.startsWith("berry")&&!world.counters.berries.includes(k)){world.counters.berries.push(k);if(world.counters.berries.length>=2)discover("edible")}
}
function craft(out){
  const r=RECIPES.find(x=>x.out===out);if(!r)return;
  if(r.req&&!hasD(r.req))return;if(r.tool&&!inv(r.tool))return toast(`You need a ${ITEMS[r.tool].name}.`);
  for(const k in r.in)if(inv(k)<r.in[k])return toast("Missing ingredients.");
  for(const k in r.in)take(k,r.in[k]);give(out);world.held=out;
  toast(`Crafted ${ITEMS[out].name}.${ITEMS[out].place?" Press Q to place it.":""}`);
  if(out==="clothing"){take("clothing");world.worn="clothing";toast("You wear the hide clothing.");discover("clothing")}
  if(out==="wheel")discover("wheel");
  renderInventory();
}
function study(){
  const ks=world.ks;
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

/* ---------------- UI ---------------- */
let toastT=0;
function toast(m){const el=$("#wToast");if(!el)return;const d=document.createElement("div");d.textContent=m;el.prepend(d);while(el.children.length>5)el.lastChild.remove();setTimeout(()=>d.remove(),6000)}
function bar(n,v,col,txt){return `<div class="hb"><span>${n}</span><div class="t"><i style="width:${clamp(v,0,100)}%;background:${col}"></i></div><b>${txt}</b></div>`}
let hudT=0;
function renderHUD(){
  const st=world.st,h=hourOf(),hh=Math.floor(h),mm=Math.floor((h-hh)*60);
  $("#wBars").innerHTML=bar("HEALTH",st.health,"#ff4d67",Math.round(st.health))+bar("FOOD",st.hunger,"#ffc857",Math.round(st.hunger))+bar("WATER",st.thirst,"#55a8ff",Math.round(st.thirst))+bar("STAMINA",st.stamina,"#64e886",Math.round(st.stamina))+
    bar("BODY",(st.tb-30)/(42-30)*100,st.tb<35.5?"#7fb4ff":st.tb>38.5?"#ff7a3a":"#c8e9ff",st.tb.toFixed(1)+" °C")+(st.wet>.05?bar("WET",st.wet*100,"#3a7bd5",Math.round(st.wet*100)+"%"):"")+(st.sick>0?`<div class="hb sick">SICK</div>`:"");
  const day=Math.floor(world.gameTime/86400)+1,w=world.weather,Ta=player.Ta??airTemp(player.pos.x,player.pos.z,player.pos.y);
  const wk=w.amt>.3?(Ta<.5?"Snow":"Rain"):w.kind==="cloudy"?"Cloudy":"Clear";
  $("#wTime").innerHTML=`<b>Day ${day} · ${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}</b><span>${wk} · air ${Ta.toFixed(1)} °C</span><span>${esc(TREE.ERAS[world.ks.era].name)}</span><span>${atlas?`Knowledge ${world.ks.revealed.length.toLocaleString()} / ${atlas.total.toLocaleString()}`:"Atlas loading…"}</span>`;
  if(player.readout){const sp=player.vel.length(),alt=player.pos.y;
    $("#wReadout").hidden=false;$("#wReadout").innerHTML=`speed ${sp.toFixed(2)} m/s · vertical ${player.vel.y.toFixed(2)} m/s<br>altitude ${alt.toFixed(1)} m · g = ${G_ACC} m/s²<br>air ${Ta.toFixed(1)} °C · body ${st.tb.toFixed(2)} °C · net heat ${Math.round(player.netW||0)} W<br>fire radiant ${Math.round(player.fireW||0)} W · wet ${Math.round(st.wet*100)}%<br>water boils at ${(100-Math.max(0,alt)/285).toFixed(1)} °C here<br>your noise ${playerNoiseDb()} dB @1 m (−20·log₁₀ r)${inv("compass")?`<br>heading ${Math.round(((Math.atan2(-forward().x,-forward().z)*180/Math.PI)+360)%360)}°`:""}<br>biome ${biomeAt(player.pos.x,player.pos.z,heightAt(player.pos.x,player.pos.z))}`}
  else $("#wReadout").hidden=true;
  $("#wPrompt").textContent=player.dead?"":targetLabel(findTarget());
}
function renderHotbar(){
  const el=$("#wHotbar");if(!el||!world)return;const ks=Object.keys(world.inv);
  if(world.held&&!world.inv[world.held])world.held=ks[0]||null;
  el.innerHTML=ks.slice(0,10).map((k,i)=>`<div class="slot${k===world.held?" on":""}" data-k="${k}" title="${esc(ITEMS[k].name)}"><i style="background:#${ITEMS[k].color.toString(16).padStart(6,"0")}"></i><span>${i<9?i+1:0}</span><b>${world.inv[k]}</b><em>${esc(ITEMS[k].name)}</em></div>`).join("")||`<div class="muted">Empty hands — press E to gather.</div>`;
  const hm=player?.model?.userData.held;if(hm){hm.visible=!!world.held;if(world.held)hm.material.color.setHex(ITEMS[world.held].color)}
}
function renderInventory(){
  const el=$("#wInv");if(el.hidden)return;
  const items=Object.keys(world.inv).map(k=>`<div class="invItem${k===world.held?" on":""}" data-k="${k}"><i style="background:#${ITEMS[k].color.toString(16).padStart(6,"0")}"></i>${esc(ITEMS[k].name)} <b>×${world.inv[k]}</b><small>${ITEMS[k].density} kg/m³</small></div>`).join("")||`<p class="muted">Nothing carried.</p>`;
  const rec=RECIPES.filter(r=>!r.req||hasD(r.req)).map(r=>{const ok=Object.entries(r.in).every(([k,n])=>inv(k)>=n)&&(!r.tool||inv(r.tool));
    return `<div class="rec${ok?"":" no"}"><b>${esc(ITEMS[r.out].name)}</b><span>${Object.entries(r.in).map(([k,n])=>`${n}× ${esc(ITEMS[k].name)}`).join(", ")}${r.tool?` · needs ${esc(ITEMS[r.tool].name)}`:""}</span><button data-craft="${r.out}" ${ok?"":"disabled"}>CRAFT</button></div>`}).join("");
  el.innerHTML=`<div class="pHead"><h3>INVENTORY</h3><button data-close>✕ (I)</button></div><div class="invGrid">${items}</div><p class="muted">Click an item to hold it. Q uses or throws it, F eats or drinks it.${world.worn?" Wearing: "+esc(ITEMS[world.worn].name)+".":""}</p><h3>CRAFTING</h3><div class="recs">${rec}</div><p class="muted">New recipes appear as you make discoveries.</p>`;
}
let jTab="disc";
function renderJournal(){
  const el=$("#wJournal");if(!el||el.hidden)return;
  const ks=world.ks;let body="";
  if(jTab==="disc")body=WORLD_DISCOVERIES.map(d=>{const k=hasD(d.id);return `<div class="jd${k?"":" fog"}"><b>${k?esc(d.name):"???"}</b><small>${esc(TREE.ERAS[d.age].name)}</small><p>${k?esc(d.principle):"Hint: "+esc(d.how)}</p>${k?`<div class="chips">${linkedAtlasIds(d).map(chip).join("")}</div>`:""}</div>`}).join("");
  if(jTab==="exp"){const th=world.counters.throws;body=`<p>Objects seen falling: <b>${world.counters.falls}</b>. ${hasD("counting")?"Measured throws (vacuum prediction R = v²·sin2θ / g, g = 9.81 m/s²):":"Learn to count (tally stick) before you can measure throws."}</p>`+
    (th.length?`<table class="tt"><tr><th>item</th><th>v₀ m/s</th><th>θ°</th><th>Δh m</th><th>measured m</th><th>predicted m</th></tr>${th.slice(-12).map(t=>`<tr><td>${esc(ITEMS[t.item].name)}</td><td>${t.v}</td><td>${t.deg}</td><td>${t.dh}</td><td>${t.R}</td><td>${t.pred}</td></tr>`).join("")}</table><p class="muted">Measured range falls short of the vacuum prediction because of air drag, and differs from it when the landing is higher or lower than the launch point.</p>`:"")+
    `<p>Nights spent studying the stars: <b>${world.counters.nights.length}</b>/3 · species observed: <b>${world.counters.species.join(", ")||"none"}</b> · tally notches: <b>${world.counters.tally}</b></p>`}
  if(jTab==="know"){
    if(!atlas)body=`<p class="muted">The atlas is loading in the background…</p>`;
    else{const counts=E.fieldRevealCounts(ks,atlas);
      body=`<div class="bigCount"><b>${ks.revealed.length.toLocaleString()}</b> / ${atlas.total.toLocaleString()} atlas nodes revealed</div><div class="fieldBars">${atlas.families.map(f=>{const n=counts[f.id]||0,t=atlas.fieldTotals[f.id]||1,p=n/t*100;return `<div class="fb"><span style="color:${f.color}">${f.icon||""} ${esc(f.short)}</span><span class="t"><i style="width:${p.toFixed(2)}%;background:${f.color}"></i></span><span>${p>0&&p<10?p.toFixed(1):Math.round(p)}%</span></div>`}).join("")}</div>
      <h4>RECENTLY REVEALED</h4><div class="chips">${(ks.recent||[]).slice(-30).reverse().map(chip).join("")||"<span class=muted>Nothing yet.</span>"}</div>`}}
  if(jTab==="tree"){const av=E.available(ks);body=`<p>Age: <b>${esc(TREE.ERAS[ks.era].name)}</b> · discovery tree ${ks.known.length} / ${TREE.DISCOVERIES.length}. Hands-on discoveries rediscover tree entries; build a <b>study table</b> (needs Writing) and press E at it to advance the rest and map the atlas.</p><h4>OPEN TO STUDY</h4><div class="chips">${av.map(d=>`<span class="chip" title="${esc(d.note)}">${esc(d.name)} · ${Math.floor(ks.progress[d.id]||0)}/${E.costOf(d)}</span>`).join("")||"<span class=muted>none</span>"}</div><h4>KNOWN</h4><p class="muted">${ks.known.map(id=>esc(treeById.get(id)?.name||id)).join(" · ")||"none"}</p>`}
  el.innerHTML=`<div class="pHead"><h3>KNOWLEDGE JOURNAL</h3><button data-close>✕ (Tab)</button></div><div class="jTabs">${[["disc",`Discoveries ${world.disc.length}/${WORLD_DISCOVERIES.length}`],["exp","Experiments"],["know","Your Knowledge"],["tree","Discovery tree"]].map(([k,l])=>`<button data-jtab="${k}" class="${k===jTab?"on":""}">${l}</button>`).join("")}</div><div class="jBody">${body}</div>`;
}
function togglePanel(id){const el=$(id);el.hidden=!el.hidden;if(!el.hidden){try{document.exitPointerLock?.()}catch(_){}if(id==="#wInv")renderInventory();else renderJournal()}}

/* ---------------- input ---------------- */
let dragging=false,lastX=0,lastY=0,canvasEl;
function bindInput(container){
  canvasEl=renderer.domElement;
  window.addEventListener("keydown",e=>{
    if(!started||$("#mode-world").hidden)return;if(e.target.tagName==="INPUT"||e.target.tagName==="SELECT")return;
    if(!$("#wPopup").hidden){if(e.code==="KeyE"||e.code==="Enter"||e.code==="Escape")closePopup();e.preventDefault();return}
    if(e.code==="Tab"||e.code==="KeyK"){e.preventDefault();togglePanel("#wJournal");return}
    if(e.code==="KeyI"){togglePanel("#wInv");return}
    if(e.code==="KeyH"){player.readout=!player.readout;return}
    if(e.code==="Escape"){if($("#wInv").hidden&&$("#wJournal").hidden)window.__openSettings?.();else $("#wInv").hidden=$("#wJournal").hidden=true;return}
    if(paused)return;
    if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();
    keys.add(e.code);
    if(e.repeat)return;
    if(e.code==="KeyE")interact();if(e.code==="KeyQ")useHeld();if(e.code==="KeyF")eat();
    if(/^Digit[0-9]$/.test(e.code)){const i=(+e.code.slice(5)+9)%10,k=Object.keys(world.inv)[i];if(k){world.held=k;renderHotbar()}}
  });
  window.addEventListener("keyup",e=>keys.delete(e.code));
  window.addEventListener("blur",()=>keys.clear());
  canvasEl.addEventListener("mousedown",e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvasEl._down=[e.clientX,e.clientY]});
  window.addEventListener("mouseup",e=>{dragging=false;if(!canvasEl._down||paused)return;const moved=Math.hypot(e.clientX-canvasEl._down[0],e.clientY-canvasEl._down[1]);canvasEl._down=null;
    if(e.target!==canvasEl)return;if(document.pointerLockElement===canvasEl){if(e.button===0)throwHeld()}else if(moved<4&&e.button===0){try{canvasEl.requestPointerLock?.()}catch(_){}}});
  window.addEventListener("mousemove",e=>{if(!player)return;const locked=document.pointerLockElement===canvasEl;if(!locked&&!dragging)return;
    const dx=locked?e.movementX:e.clientX-lastX,dy=locked?e.movementY:e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;
    player.camYaw-=dx*.004;player.camPitch=clamp(player.camPitch+dy*.003,-.6,1.25)});
  canvasEl.addEventListener("wheel",e=>{e.preventDefault();player.camDist=clamp(player.camDist+Math.sign(e.deltaY)*.6,2.5,14)},{passive:false});
  document.addEventListener("click",e=>{
    const c=e.target.closest("[data-craft]");if(c){craft(c.dataset.craft);return}
    const it=e.target.closest(".invItem,.slot");if(it&&it.dataset.k){world.held=it.dataset.k;renderHotbar();renderInventory();return}
    if(e.target.closest("[data-close]")){e.target.closest(".wPanel").hidden=true;return}
    const jt=e.target.closest("[data-jtab]");if(jt){jTab=jt.dataset.jtab;renderJournal()}
  });
}

/* ---------------- main loop ---------------- */
const camTarget=new THREE.Vector3();
function inCrown(x,y,z){for(const ch of nearbyChunks(x,z,4))for(const t of ch.obj.trees){if(t.gone||t.burnt)continue;const v=t.vis||t.kind;if(v==="dead")continue;
  const r=(v==="conifer"?1.9:v==="palm"?2.2:2.3)*t.s,y0=t.y+(v==="conifer"?.8:v==="palm"?4:2.2)*t.s,y1=t.y+(v==="conifer"?5.6:v==="palm"?5.6:5.4)*t.s;
  if(y>y0&&y<y1&&Math.hypot(x-t.x,z-t.z)<r)return true}return false}
let camDistNow=6;
function updateCamera(dt){
  const p=player,t=camTarget.set(p.pos.x,p.pos.y+(p.swimming?.3:1.6),p.pos.z);
  const sy=Math.sin(p.camYaw)*Math.cos(p.camPitch),cy=Math.cos(p.camYaw)*Math.cos(p.camPitch),sp=Math.sin(p.camPitch);
  // keep the camera out of tree crowns (pull in towards the player)
  let d=p.camDist;while(d>1.6&&inCrown(t.x+sy*d,t.y+sp*d,t.z+cy*d))d-=.5;
  camDistNow=d<camDistNow?d:lerp(camDistNow,d,Math.min(1,dt*3));
  camera.position.set(t.x+sy*camDistNow,t.y+sp*camDistNow,t.z+cy*camDistNow);
  const gh=Math.max(heightAt(camera.position.x,camera.position.z),p.swimming?-9:0)+.5;if(camera.position.y<gh)camera.position.y=gh;
  camera.lookAt(t);
  const fov=p.zoom?14:62;if(Math.abs(camera.fov-fov)>.1){camera.fov=lerp(camera.fov,fov,Math.min(1,dt*8));camera.updateProjectionMatrix()}
}
let saveT=0,chunkT=0,frames=0,fps=0,fpsN=0,fpsT=0,fpsLast=0,titleMode=false,titleT=0;
function tick(){
  requestAnimationFrame(tick);
  const dt=Math.min(.05,clock.getDelta());
  if(started&&!paused&&!$("#mode-world").hidden)stepWorld(dt);
  if(started){updateCamera(dt);updateSky(dt)}
  else if(titleMode)stepTitle(dt);
  GFX.render(dt);frames++;fpsN++;fpsT+=clock.elapsedTime-fpsLast;fpsLast=clock.elapsedTime;if(fpsT>=1){fps=fpsN/fpsT;fpsN=0;fpsT=0;const fe=$("#wFps");if(fe&&!fe.hidden)fe.textContent=`${Math.round(fps)} fps · ${GFX.Q.label}`}
}
function stepWorld(dt){
  const dtg=dt*GAME_SPEED,prevDay=Math.floor(world.gameTime/86400);
  world.gameTime+=dtg;
  stepWeather(dtg);stepPlayer(dt);stepSurvival(dt);stepDrops(dt);stepFires(dt,dtg);stepBurning(dt);spawnAnimals(dt);updateAnimals(dt);
  const p=player;p.model.position.copy(p.pos);if(p.raft)p.model.position.y=.12;p.model.rotation.y=p.yaw;
  animateHuman(p.model,Math.hypot(p.vel.x,p.vel.z),dt,p.swimming,!p.onGround&&!p.swimming&&p.pos.y>heightAt(p.pos.x,p.pos.z)+.25,p.dead);
  if(p.swimming&&!p.wasSwim)GFX.FX.splash(p.pos.x,p.pos.z,40);p.wasSwim=p.swimming;
  // sky watching (astronomy) — night, clear-ish sky, looking up
  if(sunElevation()<-.1&&world.weather.amt<.5){const dir=new THREE.Vector3();camera.getWorldDirection(dir);if(dir.y>.45){p.lookUpT+=dt;const night=Math.floor((world.gameTime-6*3600)/86400);
    if(p.lookUpT>6&&!world.counters.nights.includes(night)){world.counters.nights.push(night);toast(`You study the stars (night ${world.counters.nights.length}/3). They wheel slowly around the pole.`);p.lookUpT=0;if(world.counters.nights.length>=3)discover("astronomy")}}else p.lookUpT=0}
  if(world.gameTime-world.dayStart>=86400)discover("daynight");
  for(const s of world.structures){
    if(s.type==="gnomon"&&s.shadow){const el=sunElevation(),a=2*Math.PI*(hourOf()-6)/24;s.shadow.visible=el>.05;if(el>.05){s.shadow.rotation.y=Math.atan2(-Math.cos(a),-.25)-s.obj.rotation.y;s.shadow.scale.z=clamp(1/Math.tan(Math.asin(clamp(el,.05,1))),.2,6)}
      if(el>.05){s.watch=(s.watch||0)+(Math.hypot(s.x-p.pos.x,s.z-p.pos.z)<40?dtg:0);if(s.watch>3600)discover("sundial")}}
    if(s.type==="crop"&&s.obj){const g=cropGrowth(s);s.obj.scale.setScalar(.3+g*.9);s.obj.children.forEach(c=>c.material.color.setHex(g>=1?0xd8c060:0x7fb04a))}
  }
  chunkT-=dt;if(chunkT<=0){updateChunks(false);chunkT=.15}
  hudT-=dt;if(hudT<=0){renderHUD();hudT=.2}
  saveT-=dt;if(saveT<=0){save();saveT=10}
}

/* ---------------- boot ---------------- */
function startWorld(w){
  titleMode=false;document.body.classList.remove("titleOn");
  world=hydrate(w);initNoise(world.seed);
  for(const ch of chunks.values())disposeChunk(ch);chunks.clear();
  for(const s of world.structures)if(s.obj)scene.remove(s.obj);
  if(player&&player.model)scene.remove(player.model);
  for(const a of animals)scene.remove(a.g);animals.length=0;
  player=makePlayer(world);
  for(const s of world.structures)structMesh(s);
  const drops=world.drops;world.drops=[];for(const d of drops)addDrop(d.item,d.x,d.y,d.z);
  updateChunks(true);
  started=true;paused=false;renderHotbar();renderHUD();
  if(atlas)onAtlas(atlas);
}
function newGame(){
  const w=newWorld();world=hydrate(w);initNoise(w.seed);
  const [cx,cz]=w.camp;
  const start=[["flint",2],["pyrite",1],["stone",1],["stick",4],["clay",1]];let a=0;
  for(const [k,n] of start)for(let i=0;i<n;i++){a+=.9;const x=cx+Math.cos(a)*(2+a*.3),z=cz+Math.sin(a)*(2+a*.3);w.drops.push({item:k,x,y:heightAt(x,z)+.03,z})}
  w.removed=[...w.removed];w.burnt=[...w.burnt];
  startWorld(w);save();
  toast("You wake at the edge of the fog. Gather what you can — E to pick up, I for inventory, Tab for your journal.");
}
/* title screen: slow time-lapse flyover of the world */
let titleCenter=null;
function beginTitle(preview){
  initNoise(preview.seed);
  world=hydrate({...preview,removed:[...(preview.removed||[])],burnt:[...(preview.burnt||[])],structures:[],drops:[],gameTime:Math.floor((preview.gameTime||0)/86400)*86400+16.6*3600,weather:{kind:"clear",t:9e9,amt:0}});
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
export function initWorld(){
  const container=$("#wCanvas");
  initScene(container);bindInput(container);
  const saved=loadSave();
  $("#wTitle").hidden=false;
  $("#wContinue").hidden=!saved;
  $("#wPlay").onclick=()=>{$("#wTitle").hidden=true;if(saved&&!started)startWorld(saved);else if(!started)newGame();paused=false};
  $("#wContinue").onclick=$("#wPlay").onclick;
  $("#wNew").onclick=()=>{if(saved&&!confirm("Start a new world? Your current world and knowledge will be replaced."))return;$("#wTitle").hidden=true;newGame()};
  if(saved){$("#wPlay").textContent="CONTINUE";$("#wContinue").hidden=true}
  // animated world flyover behind the title
  beginTitle(saved||newWorld(1234));
  // settings
  const openSettings=()=>{const el=$("#wSettings");el.hidden=!el.hidden;document.querySelectorAll("[data-q]").forEach(b=>b.classList.toggle("on",b.dataset.q===GFX.qName));if(!el.hidden){try{document.exitPointerLock?.()}catch(_){}}};
  $("#wGear")&&($("#wGear").onclick=openSettings);$("#wTitleSettings")&&($("#wTitleSettings").onclick=openSettings);
  document.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>applyQuality(b.dataset.q));
  $("#wShowFps")&&($("#wShowFps").onchange=e=>{$("#wFps").hidden=!e.target.checked;try{localStorage.setItem("fog-of-knowledge:game:fps",e.target.checked?"1":"")}catch(_){}});
  try{if(localStorage.getItem("fog-of-knowledge:game:fps")){$("#wFps").hidden=false;$("#wShowFps").checked=true}}catch(_){}
  window.__openSettings=openSettings;
  tick();
  (window.__fogAtlasPromise||Promise.reject()).then(A=>{atlas=A;if(world)onAtlas(A)}).catch(()=>{});
  window.addEventListener("beforeunload",()=>{if(started&&world)save()});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&started&&world)save()});
  // debug / test hook (used by the headless verification)
  window.__fogWorld={get state(){return world},get player(){return player},discover:id=>discover(id),closePopup,
    give:(k,n)=>give(k,n),press:(code,ms)=>{keys.add(code);setTimeout(()=>keys.delete(code),ms)},
    teleport:(x,z)=>{player.pos.set(x,heightAt(x,z),z);updateChunks(true)},stats:()=>({pos:player&&player.pos.toArray().map(v=>+v.toFixed(2)),chunks:chunks.size,animals:animals.length,frames,
      revealed:world?.ks.revealed.length,disc:world?.disc.length,atlas:!!atlas,drawCalls:renderer.info.render.calls,tris:renderer.info.render.triangles,fps:+fps.toFixed(1),quality:GFX.qName,human:!!player?.model?.userData?.mixer}),
    start:()=>$("#wPlay").click(),height:(x,z)=>heightAt(x,z),reseed:seed=>{const w=newWorld(seed);w.removed=[];w.burnt=[];startWorld(w)},fps:()=>fps,quality:q=>{if(q)applyQuality(q);return GFX.qName},
    setHour:h=>{world.gameTime=Math.floor(world.gameTime/86400)*86400+h*3600},setWeather:(kind,amt)=>{world.weather.kind=kind;world.weather.amt=amt??(kind==="rain"?1:0);world.weather.t=9e9},
    look:(yaw,pitch,dist)=>{player.camYaw=yaw;if(pitch!==undefined)player.camPitch=pitch;if(dist!==undefined)player.camDist=dist},throwHeld,useHeld,interact,craft,hold:k=>{if(world&&world.inv[k]){world.held=k;renderHotbar()}}};
}
