/* Fog of Knowledge — procedural three-masted galleon (all geometry and textures generated in code;
 * no external model or assets). Local axes: +x port (three.js left when facing +z), +y up (keel = 0), +z bow.
 * Parts are grouped by build stage so the shipyard can reveal them one stage at a time:
 * keel (keel, stem, sternpost, frames) → hull (planking, wales, gunports, transom) →
 * deck (decks, castles, rails, cannons, helm, gangway) → masts (masts, tops, yards, bowsprit) →
 * rigging (shrouds, ratlines, stays, braces) → sails (canvas + pennant). */
import * as THREE from "./vendor/three.module.min.js";
import {mergeGeometries} from "./vendor/addons/utils/BufferGeometryUtils.js";
import {HULL,RAMPS,RAMP_W,levelY,sheerY,keelY,halfBreadth,MASTS} from "./ship-physics.js?v=3.29.0";

export const STAGE_PARTS=["keel","hull","deck","masts","rigging","sails"];
const TAU=Math.PI*2;
/* ---------- procedural textures ---------- */
function canvasTex(w,h,draw,repeat=true){const c=document.createElement("canvas");c.width=w;c.height=h;draw(c.getContext("2d"),w,h);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;if(repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t}
function rnd(seed){let s=seed>>>0||1;return()=>((s=Math.imul(s^s>>>15,1|s)+0x6d2b79f5|0,((s^s>>>14)>>>0)/4294967296))}
let TEX=null;
function textures(){if(TEX)return TEX;const R=rnd(7);
  const planks=(base,rows,seam,var_)=>canvasTex(512,512,(g,w,h)=>{g.fillStyle=base;g.fillRect(0,0,w,h);const ph=h/rows;
    for(let r=0;r<rows;r++){const off=(r*.37%1)*w;for(let k=-1;k<3;k++){const x0=off+k*w/2;const l=60+R()*var_;g.fillStyle=`hsla(28,${30+R()*20}%,${l*.5}%,.35)`;g.fillRect(x0,r*ph,w/2,ph)
        for(let gr=0;gr<7;gr++){g.strokeStyle=`rgba(40,22,10,${.05+R()*.08})`;g.lineWidth=1+R()*1.5;g.beginPath();const yy=r*ph+R()*ph;g.moveTo(x0,yy);g.bezierCurveTo(x0+w*.15,yy+(R()-.5)*6,x0+w*.35,yy+(R()-.5)*6,x0+w/2,yy+(R()-.5)*4);g.stroke()}
        g.fillStyle=seam;g.fillRect(x0,r*ph,2,ph);g.fillStyle="rgba(20,12,6,.8)";g.beginPath();g.arc(x0+8,r*ph+ph*.3,1.6,0,TAU);g.arc(x0+8,r*ph+ph*.7,1.6,0,TAU);g.fill()}
      g.fillStyle=seam;g.fillRect(0,r*ph,w,2.5)}});
  const hull=planks("#b79b7c",8,"rgba(18,10,5,.95)",40),deck=planks("#d6c09a",10,"rgba(60,40,22,.9)",25);
  const sail=canvasTex(512,512,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,"#efe7d2");gr.addColorStop(1,"#ddd0b0");g.fillStyle=gr;g.fillRect(0,0,w,h);
    for(let i=1;i<10;i++){g.fillStyle="rgba(120,100,70,.28)";g.fillRect(i*w/10-1,0,2,h)}
    for(let i=0;i<260;i++){g.fillStyle=`rgba(${120+R()*40},${100+R()*30},70,${R()*.05})`;const r=10+R()*60;g.beginPath();g.arc(R()*w,R()*h,r,0,TAU);g.fill()}
    g.fillStyle="rgba(110,90,60,.45)";g.fillRect(0,0,w,10);g.fillRect(0,h-10,w,10);g.fillRect(0,0,8,h);g.fillRect(w-8,0,8,h);
    for(const yy of [.13,.22])for(let i=0;i<22;i++){g.fillStyle="rgba(90,70,45,.6)";g.fillRect(i*w/22+8,yy*h,3,9)}},false);
  const flag=canvasTex(128,64,(g,w,h)=>{g.fillStyle="#8e1b16";g.fillRect(0,0,w,h);g.fillStyle="#e5c060";g.fillRect(0,h*.42,w,h*.16);g.fillRect(w*.28,0,w*.08,h)},false);
  return TEX={hull,deck,sail,flag}}
/* ---------- materials ---------- */
function materials(){const T=textures();const std=(o)=>new THREE.MeshStandardMaterial({roughness:.85,metalness:0,...o});
  return {
    hull:std({map:T.hull,vertexColors:true,side:THREE.DoubleSide,roughness:.78}),
    deck:std({map:T.deck,color:0xc9b38e,roughness:.9}),
    wood:std({color:0x7a5030,roughness:.82}),
    dark:std({color:0x2e1f14,roughness:.7}),
    trim:std({color:0x8e2a1a,roughness:.6}),
    gold:std({color:0xb08a3c,roughness:.4,metalness:.6}),
    mast:std({color:0xa07850,roughness:.75}),
    iron:std({color:0x1c1c1e,roughness:.45,metalness:.7}),
    glass:std({color:0x2a1a08,emissive:0xffb24a,emissiveIntensity:.9,roughness:.3}),
    rope:new THREE.LineBasicMaterial({color:0x2b2117,transparent:true,opacity:.92}),
    ropeMesh:std({color:0x6b5434,roughness:.95}),
  }}
/* sails billow in the vertex shader: uFill (wind in the canvas 0..1), uLuff (flapping), uTime */
function sailMaterial(map){const m=new THREE.MeshStandardMaterial({map,side:THREE.DoubleSide,roughness:.95,color:0xffffff});
  const U={uFill:{value:.8},uLuff:{value:0},uTime:{value:0},uDir:{value:1}};m.userData.U=U;
  m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,U);
    sh.vertexShader=sh.vertexShader.replace("#include <common>",`#include <common>
uniform float uFill,uLuff,uTime,uDir;attribute vec3 sailUV; // u across, v down, depth scale
float sailD(vec2 q,float B){float s=sin(3.14159*q.x),d=uDir*uFill*B*s*(.35+.65*sin(3.14159*clamp(q.y*1.08,0.,1.)));
 d+=uLuff*.18*B*s*sin(uTime*7.+q.y*9.+q.x*6.)*(.3+q.y);return d;}`)
    .replace("#include <beginnormal_vertex>",`#include <beginnormal_vertex>
{float e=.02,B=sailUV.z;float dx=(sailD(sailUV.xy+vec2(e,0.),B)-sailD(sailUV.xy-vec2(e,0.),B))/(2.*e*max(1.,B*6.));
 float dy=(sailD(sailUV.xy+vec2(0.,e),B)-sailD(sailUV.xy-vec2(0.,e),B))/(2.*e*max(1.,B*5.));objectNormal=normalize(vec3(-dx,dy,1.));}`)
    .replace("#include <begin_vertex>",`#include <begin_vertex>
transformed.z+=sailD(sailUV.xy,sailUV.z);`)};
  m.customProgramCacheKey=()=>"fok-sail";return m}
/* ---------- geometry helpers ---------- */
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
function prep(g){g=g.index?g.toNonIndexed():g;if(!g.attributes.uv)g.setAttribute("uv",new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  for(const k of Object.keys(g.attributes))if(!["position","normal","uv"].includes(k))g.deleteAttribute(k);if(!g.attributes.normal)g.computeVertexNormals();return g}
class Bin{constructor(){this.m=new Map()}add(mat,g){if(!this.m.has(mat))this.m.set(mat,[]);this.m.get(mat).push(prep(g))}
  build(parent,shadow=true){for(const [mat,gs] of this.m){const mesh=new THREE.Mesh(mergeGeometries(gs),mat);mesh.castShadow=shadow;mesh.receiveShadow=true;parent.add(mesh)}this.m.clear()}}
function boxAt(w,h,d,x,y,z,ry=0,rx=0,rz=0){const g=new THREE.BoxGeometry(w,h,d);g.rotateZ(rz);g.rotateX(rx);g.rotateY(ry);g.translate(x,y,z);return g}
function cylBetween(a,b,r0,r1,seg=8){const d=b.clone().sub(a),L=d.length(),g=new THREE.CylinderGeometry(r1,r0,L,seg,1);g.translate(0,L/2,0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),d.normalize()));g.translate(a.x,a.y,a.z);return g}
function tube(pts,r,seg=6){const c=new THREE.CatmullRomCurve3(pts);return new THREE.TubeGeometry(c,Math.max(8,pts.length*3),r,seg,false)}
/* ---------- hull ---------- */
const NS=84,NV=30;
function hullGeometry(){const H=HULL,pos=[],uv=[],col=[],idx=[];const c=new THREE.Color();
  const shade=(y,z)=>{const top=sheerY(z);
    if(y<H.draft+.18)return c.setHex(0x55402e);
    if(top-y<.32)return c.setHex(0x9a3020);if(top-y<.42)return c.setHex(0xd0a84c);
    return c.setHex(y>H.mainDeck+.2?0x9a6840:0x8a5a36)};
  for(const sgn of [1,-1]){const base=pos.length/3;
    for(let j=0;j<=NV;j++)for(let i=0;i<=NS;i++){const z=H.sternZ+H.length*i/NS,k=keelY(z),top=sheerY(z),y=k+(top-k)*Math.pow(j/NV,1.05),x=sgn*halfBreadth(z,y);
      pos.push(x,y,z);uv.push(z/4.2,y/2.4);shade(y,z);col.push(c.r,c.g,c.b)}
    for(let j=0;j<NV;j++)for(let i=0;i<NS;i++){const a=base+j*(NS+1)+i,b=a+(NS+1),c2=a+1,d=b+1;if(sgn>0)idx.push(a,b,c2,b,d,c2);else idx.push(a,c2,b,b,c2,d)}}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  // order the index by height (row-major across both sides) so a partial drawRange shows planking rising from the keel
  const tris=[];for(let t=0;t<idx.length;t+=3)tris.push([idx[t],idx[t+1],idx[t+2]]);
  tris.sort((p,q)=>Math.min(pos[p[0]*3+1],pos[p[1]*3+1],pos[p[2]*3+1])-Math.min(pos[q[0]*3+1],pos[q[1]*3+1],pos[q[2]*3+1]));
  g.setIndex(tris.flat());g.computeVertexNormals();return g}
function sectionPts(z,inset=0,ymax=null){const k=keelY(z),top=ymax??sheerY(z),pts=[];for(let j=0;j<=16;j++){const y=k+(top-k)*j/16;pts.push([Math.max(0,halfBreadth(z,y)-inset),y])}return pts}
function transomGeometry(){const z=HULL.sternZ,pts=sectionPts(z),sh=new THREE.Shape();sh.moveTo(0,pts[0][1]);for(const [x,y] of pts)sh.lineTo(x,y);for(let i=pts.length-1;i>=0;i--)sh.lineTo(-pts[i][0],pts[i][1]);
  const g=new THREE.ShapeGeometry(sh);g.translate(0,0,z+.02);return g}
function deckGeometry(z0,z1,y,inset=.04){const n=Math.max(4,Math.ceil((z1-z0)/.6)),pos=[],uv=[],idx=[];
  for(let i=0;i<=n;i++){const z=z0+(z1-z0)*i/n,w=Math.max(.05,halfBreadth(z,y)-inset);pos.push(-w,y,z,w,y,z);uv.push(z/4,-w/2.2,z/4,w/2.2)}
  for(let i=0;i<n;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  // make sure the deck faces up
  const nrm=g.attributes.normal;if(nrm.getY(0)<0){g.setIndex(idx.map((v,i)=>idx[i-i%3+[0,2,1][i%3]]));g.computeVertexNormals()}return g}
function bulkhead(z,yLo,yHi,mats,B,rampX){const w=halfBreadth(z,(yLo+yHi)/2)-.08;
  // wall pieces either side of the stairs opening
  const gap0=rampX-RAMP_W-.05,gap1=rampX+RAMP_W+.05;
  if(gap0>-w)B.add(mats.wood,boxAt(gap0+w,yHi-yLo,.16,(-w+gap0)/2,(yLo+yHi)/2,z));
  if(gap1<w)B.add(mats.wood,boxAt(w-gap1,yHi-yLo,.16,(gap1+w)/2,(yLo+yHi)/2,z));
  for(const x of [-w*.62,w*.62])if(Math.abs(x-rampX)>1.4){B.add(mats.dark,boxAt(.85,1.75,.06,x,yLo+.9,z+.1));B.add(mats.gold,boxAt(.08,.08,.04,x+.28,yLo+.95,z+.14))}
  for(const x of [-w*.25,w*.25])if(Math.abs(x-rampX)>1.2)B.add(mats.glass,boxAt(.45,.35,.05,x,yHi-.6,z+.1));
}
function stairs(r,mats,B){const n=Math.round(Math.abs(r.y1-r.y0)/.24);for(let k=0;k<n;k++){const f=(k+.5)/n,z=r.z0+(r.z1-r.z0)*f,y=r.y0+(r.y1-r.y0)*f;
    B.add(mats.deck,boxAt(RAMP_W*2-.1,.07,(r.z1-r.z0)/n+.04,r.xc,y-.04,z))}
  for(const s of [-1,1])B.add(mats.wood,cylBetween(V(r.xc+s*RAMP_W,r.y0,r.z0),V(r.xc+s*RAMP_W,r.y1,r.z1),.06,.06,5))}
function railRun(pts,mats,B,posts){B.add(mats.wood,tube(pts,.07,5));if(posts){for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],L=a.distanceTo(b),n=Math.max(1,Math.round(L/.42));
    for(let k=0;k<n;k++){const p=a.clone().lerp(b,k/n);B.add(mats.wood,boxAt(.07,.85,.07,p.x,p.y-.42,p.z))}}}}
/* ---------- sails ---------- */
function squareSail(wTop,wBot,h,belly){const NU=14,NVs=12,pos=[],uv=[],suv=[],idx=[];
  for(let j=0;j<=NVs;j++)for(let i=0;i<=NU;i++){const v=j/NVs,u=i/NU,w=wTop+(wBot-wTop)*v;pos.push((u-.5)*w,-v*h,0);uv.push(u,1-v);suv.push(u,v,belly)}
  for(let j=0;j<NVs;j++)for(let i=0;i<NU;i++){const a=j*(NU+1)+i,b=a+NU+1;idx.push(a,b,a+1,a+1,b,b+1)}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute("sailUV",new THREE.Float32BufferAttribute(suv,3));g.setIndex(idx);g.computeVertexNormals();return g}
function lateenSail(L,cx,h,belly){const N=12,pos=[],uv=[],suv=[],idx=[];// triangle: (0,0)-(L,0) along the yard, clew at (cx,-h)
  const vid=(i,j)=>i*(N+1)-i*(i-1)/2+j;
  for(let i=0;i<=N;i++)for(let j=0;j<=N-i;j++){const a=j/N,b=i/N;const x=a*L+b*(cx-0)+0,y=-b*h;const xx=x-a*b*0;pos.push(x*(1)+0,y,0);
    const u=N-i>0?j/(N-i):.5;uv.push(x/L,1+y/h);suv.push(u,b,belly)}
  for(let i=0;i<N;i++)for(let j=0;j<N-i;j++){const a=vid(i,j),b=vid(i,j+1),c=vid(i+1,j);idx.push(a,c,b);if(j<N-i-1){const d=vid(i+1,j+1);idx.push(b,c,d)}}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute("sailUV",new THREE.Float32BufferAttribute(suv,3));g.setIndex(idx);g.computeVertexNormals();return g}

/* ---------- the ship ---------- */
export function buildGalleon(opts={}){
  const H=HULL,mats=materials(),root=new THREE.Group();root.name="galleon";
  const parts={};for(const k of STAGE_PARTS){parts[k]=new THREE.Group();parts[k].name=k;root.add(parts[k])}
  /* keel, stem, sternpost, frames */
  {const B=new Bin(),P=parts.keel;const kp=[];for(let i=0;i<=40;i++){const z=H.sternZ+.3+(H.length-.3)*i/40;kp.push(V(0,keelY(z)+.12,z))}
    B.add(mats.wood,tube(kp,.24,6));
    const stem=[];for(let i=0;i<=10;i++){const z=H.bowZ-2.2+2.4*i/10;stem.push(V(0,Math.max(keelY(z),0)+.1+(i/10)*0,z))}
    B.add(mats.wood,cylBetween(V(0,0,H.sternZ+.3),V(0,sheerY(H.sternZ)+.2,H.sternZ-.15),.24,.2,6));
    B.add(mats.wood,cylBetween(V(0,keelY(H.bowZ-.4),H.bowZ-.4),V(0,sheerY(H.bowZ)+.5,H.bowZ+.25),.24,.2,6));
    const frames=new Bin();
    for(let z=H.sternZ+1;z<H.bowZ-1.2;z+=1.15){const pts=sectionPts(z,.12),c=[];for(let i=pts.length-1;i>=0;i--)c.push(V(-pts[i][0],pts[i][1],z));for(const [x,y] of pts)c.push(V(x,y,z));frames.add(mats.wood,tube(c,.09,4))}
    // deck beams
    for(let z=H.sternZ+1.5;z<H.bowZ-2;z+=1.15){const y=levelY(z)-.15,w=halfBreadth(z,y)-.1;B.add(mats.wood,boxAt(w*2,.2,.22,0,y,z))}
    B.build(P);const F=new THREE.Group();F.name="frames";frames.build(F);P.add(F)}
  /* hull planking */
  {const P=parts.hull,hg=hullGeometry(),hull=new THREE.Mesh(hg,mats.hull);hull.name="planking";hull.castShadow=hull.receiveShadow=true;P.add(hull);
    const B=new Bin();B.add(mats.hull,(()=>{const g=transomGeometry();const n=g.attributes.position.count,cc=new Float32Array(n*3);for(let i=0;i<n;i++){const y=g.attributes.position.getY(i),c=new THREE.Color(y<H.draft?0x55402e:0x8a5a36);cc.set([c.r,c.g,c.b],i*3)}
      g.setAttribute("color",new THREE.BufferAttribute(cc,3));return g})());
    // wales: heavy dark strakes along the sides
    for(const sgn of [1,-1])for(const wy of [3.55,4.55]){const pts=[];for(let z=H.sternZ+.1;z<=H.bowZ-.3;z+=.7){if(keelY(z)>wy-.3)break;pts.push(V(sgn*(halfBreadth(z,wy)+.06),wy,z))}if(pts.length>3)B.add(mats.dark,tube(pts,.13,5))}
    for(const sgn of [1,-1]){const pts=[];for(let z=H.sternZ+.1;z<=H.quarterZ-.2;z+=.6)pts.push(V(sgn*(halfBreadth(z,H.quarterDeck-.2)+.05),H.quarterDeck-.2,z));B.add(mats.dark,tube(pts,.1,5))}
    // gunports: open on the weather deck, lidded below
    for(const sgn of [1,-1])for(let k=0;k<6;k++){const z=-4.4+k*2.35,y=H.mainDeck+.55,x=halfBreadth(z,y),dx=(halfBreadth(z+.3,y)-halfBreadth(z-.3,y))/.6,ry=Math.atan(dx)*sgn;
      B.add(mats.dark,boxAt(.08,.55,.62,sgn*(x+.02),y,z,ry));B.add(mats.trim,boxAt(.06,.62,.7,sgn*(x+.1),y+.55,z,ry,0,sgn*.9));
      const y2=3.95,x2=halfBreadth(z,y2);B.add(mats.trim,boxAt(.08,.48,.56,sgn*(x2+.04),y2,z,ry));B.add(mats.dark,boxAt(.1,.56,.06,sgn*(x2+.05),y2,z-.31,ry))}
    // stern galleries & windows on the transom
    for(const [y,n,wd] of [[H.quarterDeck+.95,5,.42],[H.mainDeck+1.05,4,.5]]){const w=halfBreadth(H.sternZ,y)*.75;for(let i=0;i<n;i++){const x=-w+2*w*(i+.5)/n;B.add(mats.glass,boxAt(wd,.6,.05,x,y,H.sternZ-.03));B.add(mats.gold,boxAt(wd+.12,.08,.08,x,y+.36,H.sternZ-.05))}
      B.add(mats.wood,boxAt(w*2+.6,.12,.9,0,y-.45,H.sternZ-.4));B.add(mats.gold,boxAt(w*2+.6,.1,.08,0,y-.38,H.sternZ-.83))}
    // quarter galleries (side bays aft)
    for(const sgn of [1,-1]){const z=H.sternZ+1.6,y=H.quarterDeck+.4,x=halfBreadth(z,y);B.add(mats.trim,boxAt(.5,1.5,1.6,sgn*(x+.2),y,z));B.add(mats.glass,boxAt(.06,.5,.9,sgn*(x+.46),y+.15,z));B.add(mats.gold,boxAt(.6,.12,1.7,sgn*(x+.2),y+.8,z))}
    // beakhead and catheads at the bow
    B.add(mats.wood,boxAt(1.2,.25,2.4,0,H.foreDeck-.9,H.bowZ+.7));B.add(mats.gold,boxAt(.25,1.1,.35,0,H.foreDeck-.5,H.bowZ+1.6,0,-.5));
    for(const sgn of [1,-1])B.add(mats.wood,boxAt(1.4,.25,.25,sgn*1.4,H.foreDeck+.6,H.bowZ-2.6,sgn*.25));
    // rudder
    B.add(mats.wood,boxAt(.2,H.quarterDeck-.5,1.1,0,(H.quarterDeck-.5)/2,H.sternZ-.65));
    B.build(P)}
  /* decks, castles, rails, cannons, helm, gangway */
  {const P=parts.deck,B=new Bin();
    B.add(mats.deck,deckGeometry(H.quarterZ-.2,H.foreZ+.2,H.mainDeck));
    B.add(mats.deck,deckGeometry(H.poopZ-.1,H.quarterZ,H.quarterDeck));
    B.add(mats.deck,deckGeometry(H.sternZ+.05,H.poopZ,H.poopDeck));
    B.add(mats.deck,deckGeometry(H.foreZ,H.bowZ-.35,H.foreDeck));
    const R=RAMPS;bulkhead(H.quarterZ,H.mainDeck,H.quarterDeck,mats,B,R[0].xc);bulkhead(H.poopZ,H.quarterDeck,H.poopDeck,mats,B,R[1].xc);
    {const z=H.foreZ,w=halfBreadth(z,H.foreDeck-1)-.08;const gap=RAMP_W+.05;B.add(mats.wood,boxAt(w-gap,H.foreDeck-H.mainDeck,.16,-(w+gap)/2,(H.mainDeck+H.foreDeck)/2,z));B.add(mats.wood,boxAt(w-gap,H.foreDeck-H.mainDeck,.16,(w+gap)/2,(H.mainDeck+H.foreDeck)/2,z));
      for(const x of [-w*.6,w*.6]){B.add(mats.dark,boxAt(.8,1.6,.06,x,H.mainDeck+.85,z-.1))}}
    for(const r of R)stairs(r,mats,B);
    // cap rails along the sheer (port & starboard)
    for(const sgn of [1,-1]){const pts=[];for(let z=H.sternZ+.05;z<=H.bowZ-.1;z+=.5)pts.push(V(sgn*(halfBreadth(z,sheerY(z))+.03),sheerY(z)+.05,z));B.add(mats.trim,tube(pts,.1,5))}
    // castle edge railings with balusters (gap at the stairs)
    const edge=(z,y,xc,face)=>{const w=halfBreadth(z,y)-.15,yt=y+1.0;for(const [a,b] of [[-w,xc-RAMP_W],[xc+RAMP_W,w]])if(b-a>.3)railRun([V(a,yt,z+face*.1),V(b,yt,z+face*.1)],mats,B,true)};
    edge(H.quarterZ,H.quarterDeck,R[0].xc,1);edge(H.poopZ,H.poopDeck,R[1].xc,1);edge(H.foreZ,H.foreDeck,R[2].xc,-1);
    // transom rail and lanterns
    {const y=H.poopDeck+1.1,w=halfBreadth(H.sternZ+.2,y)-.1;railRun([V(-w,y,H.sternZ+.25),V(w,y,H.sternZ+.25)],mats,B,true);
      for(const x of [-w,0,w]){B.add(mats.iron,cylBetween(V(x,y,H.sternZ+.1),V(x,y+.9,H.sternZ-.25),.04,.04,5));B.add(mats.gold,boxAt(.42,.08,.42,x,y+1.0,H.sternZ-.3));
        B.add(mats.glass,new THREE.CylinderGeometry(.16,.2,.55,8).translate(x,y+1.32,H.sternZ-.3));B.add(mats.gold,new THREE.ConeGeometry(.24,.3,8).translate(x,y+1.75,H.sternZ-.3))}}
    // cannons: barrels through the weather-deck ports, on wooden carriages
    for(const sgn of [1,-1])for(let k=0;k<6;k++){const z=-4.4+k*2.35,y=H.mainDeck+.55,x=halfBreadth(z,y);
      B.add(mats.iron,cylBetween(V(sgn*(x-1.7),y,z),V(sgn*(x+.45),y,z),.17,.12,10));B.add(mats.iron,new THREE.SphereGeometry(.18,8,6).translate(sgn*(x-1.72),y,z));
      B.add(mats.wood,boxAt(1.2,.38,.62,sgn*(x-1.05),H.mainDeck+.2,z));for(const dz of [-.3,.3])B.add(mats.dark,new THREE.CylinderGeometry(.16,.16,.08,10).rotateX(Math.PI/2).translate(sgn*(x-1.05),H.mainDeck+.16,z+dz))}
    // ship's wheel + binnacle on the quarterdeck
    {const hz=H.helm.z,y=H.quarterDeck;B.add(mats.wood,boxAt(.25,1.1,.25,0,y+.55,hz-.35));B.add(mats.wood,boxAt(.7,.25,.3,0,y+.12,hz-.35));
      const wheel=new THREE.Group();wheel.name="wheel";const wb=new Bin();wb.add(mats.wood,new THREE.TorusGeometry(.6,.045,6,28));wb.add(mats.gold,new THREE.CylinderGeometry(.09,.09,.2,10).rotateX(Math.PI/2));
      for(let k=0;k<8;k++){const a=k/8*TAU;wb.add(mats.wood,cylBetween(V(0,0,0),V(Math.cos(a)*.82,Math.sin(a)*.82,0),.03,.025,5))}wb.build(wheel);wheel.position.set(0,y+1.15,hz-.15);P.add(wheel);
      B.add(mats.wood,boxAt(.45,.9,.4,1.3,y+.45,hz+.2));B.add(mats.gold,new THREE.SphereGeometry(.18,10,8).translate(1.3,y+1.0,hz+.2))}
    // capstan, hatch gratings, belaying rails
    B.add(mats.wood,new THREE.CylinderGeometry(.45,.55,.9,12).translate(0,H.mainDeck+.45,-3.2));for(let k=0;k<6;k++){const a=k/6*TAU;B.add(mats.wood,boxAt(1.9,.08,.08,0,H.mainDeck+.8,-3.2,a))}
    for(const z of [3.4,-1.2]){B.add(mats.dark,boxAt(2.2,.12,1.6,0,H.mainDeck+.06,z));for(let k=-3;k<=3;k++)B.add(mats.wood,boxAt(.06,.06,1.6,k*.3,H.mainDeck+.15,z))}
    for(const m of MASTS)for(const sgn of [1,-1]){const y=m.base+1.0;B.add(mats.wood,boxAt(.12,.12,1.6,sgn*.9,y,m.z-.9));for(let k=0;k<4;k++)B.add(mats.wood,cylBetween(V(sgn*.9,y-.3,m.z-1.5+k*.4),V(sgn*.9,y+.25,m.z-1.5+k*.4),.035,.035,4))}
    // boarding ladder on the port side (local +x), midships
    {const z=H.gangway.z;for(let y=2.3;y<H.mainDeck+1.0;y+=.32){const x=halfBreadth(z,y)+.12;B.add(mats.wood,boxAt(.08,.08,.75,x,y,z))}
      for(const dz of [-.38,.38]){const pts=[];for(let y=2.2;y<=sheerY(z)+.2;y+=.4)pts.push(V(halfBreadth(z+dz,y)+.14,y,z+dz));B.add(mats.ropeMesh,tube(pts,.035,4))}}
    // anchors at the bow
    for(const sgn of [1,-1]){const z=H.bowZ-3,y=H.foreDeck-.6,x=halfBreadth(z,y)+.25;B.add(mats.iron,cylBetween(V(sgn*x,y-2.2,z),V(sgn*x,y,z),.07,.07,6));B.add(mats.iron,new THREE.TorusGeometry(.6,.06,5,12,Math.PI).rotateZ(Math.PI).rotateY(Math.PI/2).translate(sgn*x,y-2.1,z))}
    B.build(P)}
  /* masts, tops, yards, bowsprit */
  const SP={};
  {const P=parts.masts,B=new Bin();
    const mast=(z,base,segs,tops)=>{for(const [y0,y1,r0,r1] of segs)B.add(mats.mast,cylBetween(V(0,y0,z),V(0,y1,z),r0,r1,10));
      for(const [y,w] of tops){B.add(mats.wood,boxAt(w,.16,w*.85,0,y,z-.1));for(const sgn of [1,-1])B.add(mats.wood,boxAt(.05,.5,w*.85,sgn*w/2,y+.3,z-.1));B.add(mats.wood,boxAt(w,.5,.05,0,y+.3,z-.1-w*.42))}};
    const [F,M,Z]=MASTS;
    mast(F.z,F.base,[[F.base-.3,16,.36,.3],[15.2,23.6,.22,.15],[23,27.2,.11,.06]],[[15.6,2.6],[23.2,1.4]]);
    mast(M.z,M.base,[[M.base-.3,18.6,.42,.34],[17.6,26.6,.27,.17],[26,31.2,.12,.07]],[[18.2,3.0],[26.2,1.6]]);
    mast(Z.z,Z.base,[[Z.base-.3,19.2,.27,.18],[18.6,23.4,.12,.07]],[[17.0,1.8]]);
    const yard=(z,y,L,r=.16)=>{B.add(mats.mast,cylBetween(V(-L/2,y,z+.45),V(0,y,z+.45),r*.45,r,8));B.add(mats.mast,cylBetween(V(L/2,y,z+.45),V(0,y,z+.45),r*.45,r,8))};
    SP.square=[ // [mastZ, yardY, yardLen, bottomY, bottomWidth]
      [F.z,14.6,13.5,8.6,14.2],[F.z,21.8,9.6,15.9,12.6],[F.z,25.9,5.6,22.2,8.6],
      [M.z,17.0,16,7.6,16.6],[M.z,25.0,11.2,18.5,14.8],[M.z,29.8,6.6,25.4,10]];
    for(const [z,y,L] of SP.square)yard(z,y,L);
    // mizzen lateen yard
    SP.lat={a:V(0,10.8,Z.z+3.6),b:V(0,22.4,Z.z-5.4)};B.add(mats.mast,cylBetween(SP.lat.a,SP.lat.b,.15,.08,8));
    // bowsprit + spritsail yard + jib-boom
    SP.bs={a:V(0,H.foreDeck-.2,H.bowZ-3.5),b:V(0,12.2,H.bowZ+8.8)};B.add(mats.mast,cylBetween(SP.bs.a,SP.bs.b,.32,.13,10));
    SP.spritY=8.9;SP.spritZ=H.bowZ+4.4;B.add(mats.mast,cylBetween(V(-4,SP.spritY,SP.spritZ),V(4,SP.spritY,SP.spritZ),.08,.08,6));
    // pennant staff + crow's nest lantern
    B.add(mats.gold,new THREE.SphereGeometry(.12,8,6).translate(0,31.3,M.z));
    B.build(P)}
  /* rigging */
  {const L=[],seg=(a,b)=>L.push(a.x,a.y,a.z,b.x,b.y,b.z);const B=new Bin();
    const shrouds=(mz,topY,n,spread,chainZ0,ratStep=.5)=>{for(const sgn of [1,-1]){const lines=[];
        for(let k=0;k<n;k++){const zc=chainZ0+k*spread,y=sheerY(zc)-.25,x=sgn*(halfBreadth(zc,y)+.35);const a=V(x,y,zc),b=V(sgn*.42,topY,mz-.05);lines.push([a,b]);seg(a,b);B.add(mats.dark,boxAt(.12,.5,.14,x,y-.3,zc))}
        // channel (chain wale) the shrouds are set up on
        B.add(mats.wood,boxAt(.5,.12,n*spread+.4,sgn*(halfBreadth(chainZ0+n*spread/2,sheerY(mz)-.3)+.2),sheerY(mz)-.45,chainZ0+(n-1)*spread/2));
        for(let f=ratStep/(topY-lines[0][0].y);f<.93;f+=ratStep/(topY-lines[0][0].y))for(let k=0;k<n-1;k++)seg(lines[k][0].clone().lerp(lines[k][1],f),lines[k+1][0].clone().lerp(lines[k+1][1],f))}};
    const [F,M,Z]=MASTS;
    shrouds(F.z,15.4,5,.62,F.z-2.6);shrouds(M.z,17.9,6,.62,M.z-3.2);shrouds(Z.z,16.6,4,.55,Z.z-1.4,.55);
    const top=(mz,platY,w,headY)=>{for(const sgn of [1,-1]){const ls=[];for(let k=0;k<3;k++){const a=V(sgn*w/2,platY+.1,mz-.5+k*.4),b=V(sgn*.2,headY,mz);ls.push([a,b]);seg(a,b)}
        for(let f=.08;f<.9;f+=.08)for(let k=0;k<2;k++)seg(ls[k][0].clone().lerp(ls[k][1],f),ls[k+1][0].clone().lerp(ls[k+1][1],f))}};
    top(F.z,15.6,2.6,23.2);top(M.z,18.2,3.0,26.2);top(F.z,23.2,1.4,26.8);top(M.z,26.2,1.6,30.6);
    // stays
    const bs=SP.bs,bsAt=f=>bs.a.clone().lerp(bs.b,f);
    seg(V(0,15.9,F.z),bsAt(.55));seg(V(0,23.4,F.z),bsAt(1));seg(V(0,27,F.z),bsAt(1));
    seg(V(0,18.5,M.z),V(0,H.mainDeck+1.2,F.z-.3));seg(V(0,26.4,M.z),V(0,15.9,F.z));seg(V(0,31,M.z),V(0,23.4,F.z));
    seg(V(0,19,Z.z),V(0,11,M.z));seg(V(0,23.2,Z.z),V(0,18.2,M.z));
    // backstays
    for(const sgn of [1,-1]){seg(V(sgn*.2,26.4,M.z),V(sgn*3.9,sheerY(M.z-4.5),M.z-4.5));seg(V(sgn*.2,23.4,F.z),V(sgn*3.8,sheerY(F.z-3.6),F.z-3.6));seg(V(sgn*.2,31,M.z),V(sgn*3.7,sheerY(M.z-6),M.z-6))}
    // braces, lifts and sheets for the square yards
    for(const [z,y,Lr,by,bw] of SP.square)for(const sgn of [1,-1]){const arm=V(sgn*Lr/2,y,z+.45);
      seg(arm,V(sgn*(halfBreadth(z-6,sheerY(z-6))),sheerY(z-6)+.1,z-6));seg(arm,V(0,y+2.4,z));
      if(by<12)seg(V(sgn*bw/2,by,z+.45),V(sgn*(halfBreadth(z-3.5,sheerY(z-3.5))-.1),sheerY(z-3.5)+.1,z-3.5))}
    // spritsail, lateen and pennant halyards
    for(const sgn of [1,-1])seg(V(sgn*4,SP.spritY,SP.spritZ),V(sgn*1.2,H.foreDeck+1.2,H.bowZ-2.5));
    seg(SP.lat.b,V(0,H.poopDeck+1,H.sternZ+.4));seg(SP.lat.a,V(0,H.quarterDeck+1,Z.z+4));
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(L,3));const lines=new THREE.LineSegments(g,mats.rope);lines.raycast=()=>{};lines.name="lines";
    parts.rigging.add(lines);B.build(parts.rigging)}
  /* sails */
  const sailMat=sailMaterial(textures().sail),sails=[];
  {const P=parts.sails;
    for(const [z,y,L,by,bw] of SP.square){const h=y-by-.25,g=squareSail(L*.94,bw*.94,h,Math.min(1.6,h*.16));const m=new THREE.Mesh(g,sailMat);m.castShadow=true;m.raycast=()=>{};
      const grp=new THREE.Group();grp.position.set(0,y-.15,z+.6);grp.add(m);P.add(grp);sails.push(grp)}
    {const g=squareSail(7.4,8,3.6,.5),m=new THREE.Mesh(g,sailMat);m.castShadow=true;m.raycast=()=>{};const grp=new THREE.Group();grp.position.set(0,SP.spritY-.15,SP.spritZ+.25);grp.add(m);P.add(grp);sails.push(grp)}
    {const a=SP.lat.a,b=SP.lat.b,d=b.clone().sub(a),Ly=d.length();d.normalize();const zA=V(1,0,0),yA=zA.clone().cross(d);
      const g=lateenSail(Ly*.92,Ly*.62,8.6,.9),m=new THREE.Mesh(g,sailMat);m.castShadow=true;m.raycast=()=>{};const grp=new THREE.Group();
      grp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d,yA,zA));grp.position.copy(a).addScaledVector(d,.3);grp.add(m);P.add(grp);sails.push(grp);grp.userData.lateen=true}
    const fm=new THREE.MeshStandardMaterial({map:textures().flag,side:THREE.DoubleSide,roughness:.9});const fu={uTime:{value:0}};fm.userData.U=fu;
    fm.onBeforeCompile=sh=>{sh.uniforms.uTime=fu.uTime;sh.vertexShader=sh.vertexShader.replace("#include <common>","#include <common>\nuniform float uTime;").replace("#include <begin_vertex>","#include <begin_vertex>\nfloat fu=clamp(position.x/3.,0.,1.);transformed.z+=sin(uTime*5.-position.x*2.2)*.35*fu;transformed.y-=fu*fu*.25;")};
    fm.customProgramCacheKey=()=>"fok-flag";
    const fg=new THREE.PlaneGeometry(3,1.1,12,2);fg.translate(1.5,0,0);const flag=new THREE.Mesh(fg,fm);flag.position.set(0,30.6,MASTS[1].z);flag.rotation.y=-Math.PI/2;flag.raycast=()=>{};flag.name="flag";P.add(flag);
    root.userData.flag=flag}
  root.userData={...root.userData,parts,sailMat,sails,set:1,stage:6};
  root.traverse(o=>{if(o.isMesh&&o.material===mats.glass)o.castShadow=false});
  if(opts.stage!=null)setStage(root,opts.stage);
  return root;
}
/** show the parts of a ship under construction. stage = number of completed stages (0..6); frac = progress inside the current stage. */
export function setStage(root,stage,frac=0){const {parts}=root.userData;const sf=Math.round(frac*64)/64;if(root.userData._ss===stage&&root.userData._sf===sf)return;root.userData._ss=stage;root.userData._sf=sf;root.userData.stage=stage;
  STAGE_PARTS.forEach((k,i)=>{parts[k].visible=i<stage||(i===stage&&frac>0&&k==="hull")});
  const pl=parts.hull.getObjectByName("planking");if(pl){const n=pl.geometry.index.count,show=stage>1?1:stage===1?Math.max(.04,frac):1;pl.geometry.setDrawRange(0,Math.floor(n*show/3)*3)}
  const fr=parts.keel.getObjectByName("frames");if(fr)fr.visible=stage<3; // frames hidden behind planking once decked
  if(stage===1&&frac>0)parts.hull.children.forEach(c=>{if(c.name!=="planking")c.visible=frac>=1});else parts.hull.children.forEach(c=>c.visible=true);
}
/** animate sails/flag: set 0..1 (furled..set), fill 0..1 (wind in the canvas), luff 0..1 (flapping). */
export function animateGalleon(root,t,set,fill,luff){const U=root.userData.sailMat.userData.U;U.uTime.value=t;U.uFill.value=fill*set;U.uLuff.value=luff*set;
  for(const s of root.userData.sails){s.scale.y=.06+.94*set;s.visible=root.userData.parts.sails.visible}
  const f=root.userData.flag;if(f)f.material.userData.U.uTime.value=t}
/** shipyard slipway: keel blocks/cradle down to the ground, staging poles and timber piles. groundAt(lx,lz) gives local ground height. */
export function buildSlipway(groundAt,keelH){const mats=materials(),B=new Bin(),g=new THREE.Group();g.name="slipway";const H=HULL;
  for(let z=H.sternZ+1;z<H.bowZ-1;z+=2.2){const gy=groundAt(0,z),k=keelY(z);B.add(mats.wood,boxAt(1.1,Math.max(.3,keelH+k-gy),1.1,0,(keelH+k+gy)/2,z))}
  for(const sgn of [1,-1]){const pts=[];for(let z=H.sternZ-1;z<H.bowZ+2;z+=3){const x=sgn*(HULL.beam/2+1.6),gy=groundAt(x,z),top=keelH+sheerY(z)+.6;B.add(mats.mast,cylBetween(V(x,gy-.3,z),V(x,top,z),.09,.08,6));
      for(const sh of [.3,.62]){const yy=keelH+(sheerY(z))*sh;if(yy>gy+.5&&z+3<H.bowZ+2)B.add(mats.deck,boxAt(.8,.08,2.9,x-sgn*.5,yy,z+1.5))}
      // shores propping the hull
      const yy=keelH+H.maxBreadthY;B.add(mats.wood,cylBetween(V(x,Math.max(gy,keelH-.5),z),V(sgn*halfBreadth(z,H.maxBreadthY),yy,z),.08,.08,5))}}
  // timber piles at the stern end
  for(let k=0;k<6;k++){const gy=groundAt(-6.5,H.sternZ-3);B.add(mats.mast,new THREE.CylinderGeometry(.22,.22,5,8).rotateX(Math.PI/2).translate(-7+(k%3)*.46,gy+.22+Math.floor(k/3)*.42,H.sternZ-3))}
  for(let k=0;k<5;k++){const gy=groundAt(6.5,H.sternZ-3);B.add(mats.deck,boxAt(.5,.08,4.5,6.5+(k%2)*.1,gy+.05+k*.09,H.sternZ-3))}
  B.build(g);return g}
