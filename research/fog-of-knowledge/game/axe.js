/* Real axe chopping: procedural two-handed diagonal swing (two-bone IK on the UAL rig), raycast contact with the
   actual trunk, hit-stop + wood chips, a progressively deepening V face-notch (trunk fragments discarded inside the
   wedge, pale inner-wood faces fill it) and felling that hinges at the notch, leaving a cut stump. */
import * as THREE from "./vendor/three.module.min.js";
const V3=THREE.Vector3,UP=new V3(0,1,0),MAXN=4;
let C=null;
const NA=[...Array(MAXN)].map(()=>new THREE.Vector4()),NB=[...Array(MAXN)].map(()=>new THREE.Vector4());
const notches=new Map();   // key -> {slot,mesh,mat,c,n,axis,R,depth,h0,t}
let swing=null,falling=[],chips=null,chipV=[],chipN=0,stopT=0;
const NOTCH_GLSL=`uniform vec4 uNotchA[${MAXN}];uniform vec4 uNotchB[${MAXN}];varying vec3 vNW;
bool inNotch(vec3 p){for(int i=0;i<${MAXN};i++){vec4 a=uNotchA[i],b=uNotchB[i];if(b.w<.5)continue;vec3 d=p-a.xyz;
 float q=-(d.x*b.x+d.z*b.y),k=1.-q/max(a.w,1e-3);if(q>-.03&&q<a.w&&length(d.xz)<a.w*1.05&&d.y<b.z*k&&d.y>-b.z*.55*k)return true;}return false;}
`;
function patchBark(m){if(!m||m.userData.notch)return;m.userData.notch=1;const prev=m.onBeforeCompile,pk=m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile=(sh,r)=>{prev&&prev.call(m,sh,r);sh.uniforms.uNotchA={value:NA};sh.uniforms.uNotchB={value:NB};
    sh.vertexShader="varying vec3 vNW;\n"+sh.vertexShader.replace("#include <project_vertex>","#include <project_vertex>\n{vec4 nw=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nnw=instanceMatrix*nw;\n#endif\nvNW=(modelMatrix*nw).xyz;}");
    sh.fragmentShader=NOTCH_GLSL+sh.fragmentShader.replace("#include <clipping_planes_fragment>","#include <clipping_planes_fragment>\nif(inNotch(vNW))discard;")};
  m.customProgramCacheKey=()=>(pk?pk():"")+"|notch";m.needsUpdate=true}
function woodTex(){const c=document.createElement("canvas");c.width=c.height=256;const g=c.getContext("2d");
  g.fillStyle="#d9b98a";g.fillRect(0,0,256,256);for(let i=0;i<220;i++){const y=Math.random()*256;g.strokeStyle=`rgba(${150+Math.random()*40|0},${105+Math.random()*30|0},60,${.15+Math.random()*.25})`;g.lineWidth=.5+Math.random()*1.5;g.beginPath();g.moveTo(0,y);for(let x=0;x<=256;x+=32)g.lineTo(x,y+Math.sin(x*.05+i)*2);g.stroke()}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t}
function ringTex(){const c=document.createElement("canvas");c.width=c.height=256;const g=c.getContext("2d");g.fillStyle="#4a3424";g.fillRect(0,0,256,256);
  const gr=g.createRadialGradient(128,128,4,128,128,116);gr.addColorStop(0,"#c99d68");gr.addColorStop(.8,"#e2c393");gr.addColorStop(1,"#b08458");g.fillStyle=gr;g.beginPath();g.arc(128,128,116,0,7);g.fill();
  for(let r=6;r<114;r+=4+Math.random()*4){g.strokeStyle=`rgba(120,80,45,${.25+Math.random()*.3})`;g.lineWidth=1;g.beginPath();g.arc(128+Math.random()*2,128,r,0,7);g.stroke()}
  for(let a=0;a<14;a++){g.strokeStyle="rgba(90,60,35,.35)";g.beginPath();g.moveTo(128,128);const t=a/14*6.283+Math.random()*.3;g.lineTo(128+Math.cos(t)*110,128+Math.sin(t)*110);g.stroke()}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
let WOOD,RINGS;
export function initAxe(ctx){C=ctx;ctx.renderer.localClippingEnabled=true;patchBark(ctx.MAT.treeBark||ctx.MAT.bark);WOOD=woodTex();RINGS=ringTex();
  const cg=new THREE.BoxGeometry(.045,.012,.028);chips=new THREE.InstancedMesh(cg,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.85}),48);
  chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);chips.castShadow=true;chips.frustumCulled=false;chips.count=0;ctx.scene.add(chips);
  for(let i=0;i<48;i++){chipV.push({p:new V3(),v:new V3(),r:new V3(),w:new V3(),t:9});chips.setColorAt(i,new THREE.Color(i%4?0xe8cfa0:0x5a4030))}}
export const busy=()=>!!swing;
export const hitStop=()=>stopT>0;
/* --- notch --- */
function notchMat(n){const m=new THREE.MeshStandardMaterial({map:WOOD,roughness:.9,side:THREE.DoubleSide,emissive:0x8a6a44,emissiveMap:WOOD,emissiveIntensity:.55});
  m.onBeforeCompile=sh=>{sh.uniforms.uAx={value:n.axis};sh.uniforms.uR={value:n.R};
    sh.vertexShader="varying vec3 vNW2;\n"+sh.vertexShader.replace("#include <project_vertex>","#include <project_vertex>\nvNW2=(modelMatrix*vec4(transformed,1.)).xyz;");
    sh.fragmentShader="uniform vec3 uAx;uniform float uR;varying vec3 vNW2;\n"+sh.fragmentShader.replace("#include <map_fragment>",`#include <map_fragment>
     float rr=length(vNW2.xz-uAx.xz),jag=fract(sin(dot(floor(vNW2*vec3(60.,90.,60.)),vec3(12.9898,78.233,37.719)))*43758.5453);
     if(rr>uR-.002)discard;
     float rim=smoothstep(uR-.035-jag*.02,uR-.005,rr);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.23,.15,.09)*(.7+.6*jag),rim);
     totalEmissiveRadiance*=1.-rim;
     diffuseColor.rgb*=.9+.1*jag;`)};
  m.customProgramCacheKey=()=>"notchface";return m}
function notchGeo(n){const R=n.R,d=Math.min(n.depth,R*.92),hu=n.h0,hl=n.h0*.55,g=new THREE.BufferGeometry();
  // Clip to trunk cylinder: local z=0 is bark (outward), z=-d is inward. Inside iff x^2+(z+R)^2 <= R^2.
  const mx=z=>Math.sqrt(Math.max(0,-2*R*z-z*z))*.9;const z0=-.006,z1=-d,x0=mx(z0),x1=mx(z1);
  const P=[-x0,hu,z0, x0,hu,z0, x1,0,z1, -x1,0,z1,  -x0,-hl,z0, x0,-hl,z0, x1,0,z1, -x1,0,z1];
  g.setAttribute("position",new THREE.Float32BufferAttribute(P,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute([0,0,2,0,2,1,0,1, 0,0,2,0,2,1,0,1],2));g.setIndex([0,2,1,0,3,2,4,5,6,4,6,7]);g.computeVertexNormals();return g}
function placeNotch(n){const z=new V3(n.n.x,0,n.n.z).normalize(),x=new V3().crossVectors(UP,z);n.mesh.matrix.makeBasis(x,UP,z).setPosition(n.c);n.mesh.matrixAutoUpdate=false;n.mesh.matrixWorldNeedsUpdate=true}
export function notch(key,info,frac){let n=notches.get(key);
  if(!n){if(notches.size>=MAXN){let o=null;for(const v of notches.values())if(!o||v.t<o.t)o=v;dropNotch([...notches].find(e=>e[1]===o)[0])}
    const used=new Set([...notches.values()].map(v=>v.slot));let slot=0;while(used.has(slot))slot++;
    n={slot,c:info.c.clone(),n:info.n.clone(),axis:info.axis.clone(),R:info.R,depth:0,h0:0,t:0};n.mat=notchMat(n);notches.set(key,n)}
  n.t=performance.now();n.depth=Math.min(n.R*1.15,n.R*1.25*frac);n.h0=Math.max(.06,n.depth*1.25+.03);
  if(n.mesh){n.mesh.geometry.dispose();n.mesh.geometry=notchGeo(n)}else{n.mesh=new THREE.Mesh(notchGeo(n),n.mat);n.mesh.castShadow=n.mesh.receiveShadow=true;C.scene.add(n.mesh)}
  placeNotch(n);NA[n.slot].set(n.c.x,n.c.y,n.c.z,n.depth);NB[n.slot].set(n.n.x,n.n.z,n.h0,1);return n}
export function dropNotch(key){const n=notches.get(key);if(!n)return;C.scene.remove(n.mesh);n.mesh.geometry.dispose();n.mat.dispose();NB[n.slot].w=0;notches.delete(key)}
/* --- aim: real trunk surface by raycast --- */
const _rc=new THREE.Raycaster();
export function aim(trunkMesh,inst,tx,tz,ground,from,s){const axisY=ground+1.05,toP=new V3(from.x-tx,0,from.z-tz);if(toP.lengthSq()<1e-4)toP.set(1,0,0);toP.normalize();
  const o=new V3(tx,axisY,tz).addScaledVector(toP,3);let c=null,nrm=toP.clone();
  if(trunkMesh){trunkMesh.updateMatrixWorld();_rc.set(o,toP.clone().negate());_rc.far=3.2;const h=_rc.intersectObject(trunkMesh,false).find(h=>h.instanceId===inst);if(h){c=h.point.clone();if(h.face){nrm=h.face.normal.clone();const m=new THREE.Matrix4();trunkMesh.getMatrixAt(inst,m);nrm.transformDirection(m);nrm.y=0;if(nrm.lengthSq()<.1||nrm.dot(toP)<.3)nrm.copy(toP);nrm.normalize()}}}
  if(!c)c=new V3(tx,axisY,tz).addScaledVector(toP,.22*(s||1));
  let axis=new V3(tx,axisY,tz),R=Math.max(.06,Math.hypot(c.x-tx,c.z-tz));
  // trunks lean/gnarl: find the far surface too, so the notch axis/radius match the real cross-section at the cut height
  if(trunkMesh){_rc.set(c.clone().addScaledVector(nrm,-3),nrm.clone());_rc.far=3;const h2=_rc.intersectObject(trunkMesh,false).find(h=>h.instanceId===inst);if(h2){const d=c.distanceTo(h2.point);if(d>.06&&d<3){axis=c.clone().add(h2.point).multiplyScalar(.5);axis.y=c.y;R=d/2}}}
  return {c,n:nrm,axis,R,stand:new V3(c.x,0,c.z).addScaledVector(nrm,.80).addScaledVector(new V3().crossVectors(UP,nrm),-.05),yaw:Math.atan2(-nrm.x,-nrm.z)}}
/* --- swing --- */
// body frame keyframes (forward, right, up) for blade point B and right-hand grip G
const K={ready:{B:[.45,.30,1.20],G:[.25,.22,.95]},wind:{B:[-.22,.44,1.95],G:[.04,.30,1.52]},contactG:[.40,.15,1.12]};
const T_WIND=.38,T_HIT=.53,T_HOLD=.68,T_END=1.0;
export const depthFor=(R,frac)=>Math.min(R*1.15,R*1.25*frac);
let freeze=false;export function setFreeze(v){freeze=!!v}
export function start(info,onContact){if(swing)return false;const d=depthFor(info.R,info.frac||0);swing={t:0,info,onContact,hit:false,e:new V3(),lastB:null,bite:info.c.clone().addScaledVector(info.n,-(.03+d*.8))};return true}
const _f=new V3(),_r=new V3(),S0=new V3();
function bodyPt(m,a,out){return out.copy(m.position).addScaledVector(_f,a[0]).addScaledVector(_r,a[1]).addScaledVector(UP,a[2])}
function arc(a,b,t,out){const sa=a.clone().sub(S0),sb=b.clone().sub(S0),la=sa.length(),lb=sb.length();const qa=new THREE.Quaternion().setFromUnitVectors(sa.clone().normalize(),sb.clone().normalize());
  const q=new THREE.Quaternion().slerp(qa,t);return out.copy(sa.normalize().applyQuaternion(q).multiplyScalar(la+(lb-la)*t)).add(S0)}
const ease=t=>t*t*(3-2*t);
function up(o,re){for(let p=o?.parent;p;p=p.parent)if(re.test(p.name||""))return p;return null}
function bones(h){const u=h.userData;if(u._axeB)return u._axeB;const B={};h.traverse(o=>{const n=o.name||"";if(!o.isBone&&!/DEF|hand|arm/i.test(n))return;if(!B.R&&/hand[._-]?R$/i.test(n))B.R=o;if(!B.L&&/hand[._-]?L$/i.test(n))B.L=o});
  for(const k of["R","L"])if(B[k]){const lo=up(B[k],/fore|lower/i)||B[k].parent,upr=up(lo,/upper|arm/i)||lo?.parent;B[k+"c"]=[upr,lo,B[k]]}
  return u._axeB=B}
export function chainInfo(h){const B=bones(h);return["R","L"].map(k=>(B[k+"c"]||[]).map(o=>o?.name).join(">"))}
function ik(chain,target,pole){const [upper,lower,hand]=chain||[];if(!hand||!lower||!upper)return;
  const a=upper.getWorldPosition(new V3()),b=lower.getWorldPosition(new V3()),c=hand.getWorldPosition(new V3());
  const l1=a.distanceTo(b),l2=b.distanceTo(c),dir=target.clone().sub(a),d=Math.max(.001,Math.min(dir.length(),(l1+l2)*.995));dir.normalize();
  const p=pole.clone().addScaledVector(dir,-pole.dot(dir)).normalize(),along=(l1*l1-l2*l2+d*d)/(2*d),elbow=a.clone().addScaledVector(dir,along).addScaledVector(p,Math.sqrt(Math.max(0,l1*l1-along*along)));
  for(const [bone,child,dest] of [[upper,lower,elbow],[lower,hand,a.clone().addScaledVector(dir,d)]]){
    const pos=bone.getWorldPosition(new V3()),v=child.getWorldPosition(new V3()).sub(pos).normalize(),want=dest.clone().sub(pos).normalize();
    const q=new THREE.Quaternion().setFromUnitVectors(v,want).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));bone.updateMatrixWorld(true)}}
/* measure the held axe in its own local frame (handle axis, head end, blade side) so the swing works whatever way the prop was modelled/attached */
function frameOf(held){const ud=held.userData;if(ud._axeF)return ud._axeF;held.updateMatrixWorld(true);const inv=held.matrixWorld.clone().invert(),P=[],v=new V3();
  held.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes?.position)return;const pa=o.geometry.attributes.position,m=inv.clone().multiply(o.matrixWorld);for(let i=0;i<pa.count;i++)P.push(v.fromBufferAttribute(pa,i).applyMatrix4(m).toArray())});
  if(P.length<4)return ud._axeF={LA:new V3(.165,.38,0).normalize(),LB:new V3(.38,-.165,0).normalize(),GRIP:new V3(0,-.22,0),GRIP2:new V3(0,-.42,0),BLADE:new V3(.165,.16,0)};
  const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(const p of P)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k])}
  const ax=[0,1,2].sort((a,b)=>(mx[b]-mn[b])-(mx[a]-mn[a]))[0],L=mx[ax]-mn[ax],o2=[0,1,2].filter(k=>k!==ax);
  const band=(lo,hi)=>P.filter(p=>p[ax]>=lo&&p[ax]<=hi),spread=S=>Math.max(...o2.map(k=>Math.max(...S.map(p=>p[k]))-Math.min(...S.map(p=>p[k]))));
  const top=band(mx[ax]-L*.25,mx[ax]),bot=band(mn[ax],mn[ax]+L*.25),sg=spread(top)>=spread(bot)?1:-1,head=sg>0?top:bot;
  const mid=band(mn[ax]+L*.4,mn[ax]+L*.6),cl=o2.map(k=>mid.reduce((a,p)=>a+p[k],0)/Math.max(1,mid.length));
  const bAx=o2.sort((a,b)=>{const r=k=>Math.max(...head.map(p=>p[k]))-Math.min(...head.map(p=>p[k]));return r(b)-r(a)})[0],ci=[0,1,2].filter(k=>k!==ax).indexOf(bAx);
  const c0=cl[ci],hi=Math.max(...head.map(p=>p[bAx]))-c0,lo=c0-Math.min(...head.map(p=>p[bAx])),bs=hi>=lo?1:-1;
  const hy=head.reduce((a,p)=>a+p[ax],0)/head.length,mk=(a,b)=>{const r=new V3();r.setComponent(ax,a);for(let i=0;i<2;i++)r.setComponent([0,1,2].filter(k=>k!==ax)[i],cl[i]);if(b)r.setComponent(bAx,b);return r};
  const BLADE=mk(hy,c0+bs*Math.max(hi,lo)),GRIP=mk(hy-sg*.38),GRIP2=mk(hy-sg*.58),LA=BLADE.clone().sub(GRIP).normalize(),bd=new V3();bd.setComponent(bAx,bs);
  const LB=bd.addScaledVector(LA,-bd.dot(LA)).normalize();return ud._axeF={LA,LB,GRIP,GRIP2,BLADE}}
export let dbg=null;
function poseSwing(h,dt){const u=h.userData,sw=swing;if(stopT>0){stopT-=dt}else if(!(freeze&&sw.t>=T_HIT&&sw.t<T_HOLD-.05))sw.t+=dt;const t=sw.t;
  h.updateMatrixWorld(true);_f.set(Math.sin(h.rotation.y),0,Math.cos(h.rotation.y));_r.crossVectors(_f,UP);bodyPt(h,[0,.12,1.40],S0);
  const b0=bodyPt(h,K.ready.B,new V3()),g0=bodyPt(h,K.ready.G,new V3()),b1=bodyPt(h,K.wind.B,new V3()),g1=bodyPt(h,K.wind.G,new V3()),b2=sw.bite.clone(),g2=bodyPt(h,K.contactG,new V3());
  const B=new V3(),G=new V3();
  if(t<T_WIND){const k=ease(t/T_WIND);arc(b0,b1,k,B);arc(g0,g1,k,G)}
  else if(t<T_HIT){const k=Math.pow((t-T_WIND)/(T_HIT-T_WIND),2.2);arc(b1,b2,k,B);arc(g1,g2,k,G)}
  else if(t<T_HOLD){B.copy(b2);G.copy(g2);const j=stopT>0?Math.sin(t*170)*.006:0;B.y+=j;G.y+=j}
  else{const k=ease(Math.min(1,(t-T_HOLD)/(T_END-T_HOLD)));arc(b2,b0,k,B);arc(g2,g0,k,G)}
  if(!sw.hit&&t>=T_HIT){sw.hit=true;stopT=.085;burst(sw.info.c,sw.info.n);sw.onContact&&sw.onContact()}
  // blade edge leads along the travel direction (into the wood at contact)
  if(sw.lastB&&B.distanceToSquared(sw.lastB)>1e-6)sw.e.lerp(B.clone().sub(sw.lastB).normalize(),.5);else if(sw.e.lengthSq()<.1)sw.e.copy(_f);
  if(t>=T_HIT-.04&&t<T_HOLD)sw.e.copy(sw.info.n).negate();sw.lastB=B.clone();
  const A=B.clone().sub(G).normalize(),Bw=sw.e.clone().addScaledVector(A,-sw.e.dot(A));if(Bw.lengthSq()<1e-4)Bw.copy(_f);Bw.normalize();const Cw=new V3().crossVectors(A,Bw);
  const F=frameOf(u.held),LC=new V3().crossVectors(F.LA,F.LB);const R=new THREE.Matrix4().makeBasis(A,Bw,Cw).multiply(new THREE.Matrix4().makeBasis(F.LA,F.LB,LC).transpose());
  // place the axe so the blade point sits exactly on B (contact = trunk surface)
  const O=B.clone().sub(F.BLADE.clone().applyMatrix4(R));const Mw=R.clone().setPosition(O);
  const held=u.held;if(!sw.saved)sw.saved={p:held.position.clone(),q:held.quaternion.clone(),s:held.scale.clone()};
  const Gw=F.GRIP.clone().applyMatrix4(Mw),Lw=F.GRIP2.clone().applyMatrix4(Mw);
  const back=_f.clone().negate().multiplyScalar(.3);
  ik(bones(h).Rc,Gw,_r.clone().add(back).addScaledVector(UP,-.4));
  ik(bones(h).Lc,Lw,_r.clone().negate().add(back).addScaledVector(UP,-.4));
  h.updateMatrixWorld(true);held.parent.updateMatrixWorld(true);
  const hb=bones(h);dbg={t,B:B.toArray(),G:G.toArray(),Gw:Gw.toArray(),hR:hb.R?.getWorldPosition(new V3()).toArray(),hL:hb.L?.getWorldPosition(new V3()).toArray(),rotY:h.rotation.y,chain:chainInfo(h),heldParent:held.parent?.name,F:Object.fromEntries(Object.entries(F).map(([k,v])=>[k,v.toArray()]))};
  const loc=held.parent.matrixWorld.clone().invert().multiply(Mw);loc.decompose(held.position,held.quaternion,held.scale);held.updateMatrixWorld(true);
  if(t>=T_END){held.position.copy(sw.saved.p);held.quaternion.copy(sw.saved.q);held.scale.copy(sw.saved.s);swing=null}}
/* --- chips --- */
function burst(c,n){for(let k=0;k<14;k++){const i=chipN++%48,p=chipV[i];p.p.copy(c).addScaledVector(n,.02);p.v.copy(n).multiplyScalar(1.2+Math.random()*2.2).add(new V3((Math.random()-.5)*2.4,.6+Math.random()*2,(Math.random()-.5)*2.4));
  p.r.set(Math.random()*6,Math.random()*6,Math.random()*6);p.w.set(Math.random()*30-15,Math.random()*30-15,Math.random()*30-15);p.t=0}chips.count=48}
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_s=new V3();
function stepChips(dt){let live=0;for(let i=0;i<48;i++){const p=chipV[i];if(p.t>4){chips.setMatrixAt(i,_m.makeScale(0,0,0));continue}live++;p.t+=dt;
  const gy=C.heightAt(p.p.x,p.p.z)+.006;if(p.p.y>gy){p.v.y-=9.8*dt;p.v.multiplyScalar(1-dt*.6);p.p.addScaledVector(p.v,dt);p.r.addScaledVector(p.w,dt)}else{p.p.y=gy;p.v.set(0,0,0);p.r.x=p.r.z=0}
  const sc=p.t>3.4?Math.max(0,(4-p.t)/.6):1;chips.setMatrixAt(i,_m.compose(p.p,_q.setFromEuler(_e.set(p.r.x,p.r.y,p.r.z)),_s.set(sc,sc,sc)))}
  chips.instanceMatrix.needsUpdate=true;if(chips.instanceColor)chips.instanceColor.needsUpdate=true;if(!live)chips.count=0}
/* --- felling: the trunk hinges at the notch; stump keeps the flat cut --- */
function cloneMat(m,planes,col){const c=m.clone();c.clippingPlanes=planes;c.clipShadows=true;if(col&&c.color)c.color.multiply(col);return c}
export function fell(key,parts,parent){const n=notches.get(key);if(!n)return;const cutY=n.c.y-n.h0*.1;dropNotch(key);
  const fd=n.n.clone().applyAxisAngle(UP,1.25).normalize(),hinge=n.c.clone().addScaledVector(n.n,-n.depth);hinge.y=cutY;
  const pivot=new THREE.Group();pivot.position.copy(hinge);C.scene.add(pivot);pivot.updateMatrixWorld();const inv=pivot.matrixWorld.clone().invert();
  const topPlane=new THREE.Plane(new V3(0,1,0),-cutY),stumpPlane=new THREE.Plane(new V3(0,-1,0),cutY),topLocal=topPlane.clone().applyMatrix4(inv);let H=6;
  const stump=new THREE.Group();
  for(const p of parts){const m=new THREE.Mesh(p.geo,cloneMat(p.mat,[topPlane],p.color));m.matrixAutoUpdate=false;m.matrix.copy(inv).multiply(p.matrix);m.castShadow=true;pivot.add(m);
    const bb=p.geo.boundingBox||(p.geo.computeBoundingBox(),p.geo.boundingBox);H=Math.max(H*0,(bb.max.y)*new V3().setFromMatrixScale(p.matrix).y,H);
    if(p.trunk){const s=new THREE.Mesh(p.geo,cloneMat(p.mat,[stumpPlane]));s.matrixAutoUpdate=false;s.matrix.copy(p.matrix);s.castShadow=s.receiveShadow=true;stump.add(s)}}
  const cap=new THREE.Mesh(new THREE.CircleGeometry(n.R*1.04,28),new THREE.MeshStandardMaterial({map:RINGS,roughness:.85}));cap.rotation.x=-Math.PI/2;cap.position.set(n.axis.x,cutY+.002,n.axis.z);cap.receiveShadow=true;stump.add(cap);
  const capTop=cap.clone();capTop.rotation.x=Math.PI/2;capTop.position.copy(new V3(n.axis.x,cutY+.004,n.axis.z).applyMatrix4(inv));pivot.add(capTop);
  (parent||C.scene).add(stump);
  falling.push({pivot,axis:new V3().crossVectors(UP,fd).normalize(),th:0,w:0,H,t:0,landed:0,topLocal,topPlane,fd});return stump}
function stepFalling(dt){for(let i=falling.length-1;i>=0;i--){const f=falling[i];f.t+=dt;
  if(!f.landed){const a=1.5*9.8/Math.max(2,f.H)*Math.sin(f.th+.04);f.w+=a*dt;f.th+=f.w*dt;if(f.th>=1.48){f.th=1.48;if(f.w>.6){f.w*=-.18}else{f.landed=f.t;const p=f.pivot.position.clone().addScaledVector(f.fd,f.H*.6);C.FX?.dust?.(p.x,C.heightAt(p.x,p.z)+.3,p.z,40);C.thud&&C.thud()}}}
  f.pivot.quaternion.setFromAxisAngle(f.axis,f.th);f.pivot.updateMatrixWorld(true);f.topPlane.copy(f.topLocal).applyMatrix4(f.pivot.matrixWorld);
  if(f.landed&&f.t-f.landed>3.5){f.pivot.position.y-=dt*.6;if(f.t-f.landed>5){C.scene.remove(f.pivot);f.pivot.traverse(o=>{if(o.material)o.material.dispose()});falling.splice(i,1)}}}}
export function update(dt,h){if(swing&&h)poseSwing(h,dt);if(chips&&chips.count)stepChips(dt);if(falling.length)stepFalling(dt)}
