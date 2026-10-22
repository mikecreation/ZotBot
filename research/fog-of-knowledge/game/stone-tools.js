/* Fog of Knowledge: The Game - procedural primitive hand tools (original, CC0).
 * Knapped flint heads: a biconvex lens whose two faces are cut by flake removals. Each removal is a concave
 * scar that starts at the edge (point of percussion, small bulb) and rises inward until it feathers out; the
 * stone that is left is the MIN of the lens and every scar surface, so neighbouring scars meet in sharp ridges
 * (aretes) just as on real knapped stone, with faint conchoidal ripples round the point of impact. Small dense
 * scars along the working edge are the retouch; unflaked lens surface keeps a chalky cortex.
 * Hafts: whittled, slightly bent sticks with knife facets and leftover bark; lashings are twisted plant-fiber
 * cords (helical whippings + diagonal lashing across the head joint).
 * Every geometry and material is built once per kind and shared by all copies (hand, ground, inspection).
 * Tool space: +Y runs up the handle from its butt (y = 0), the working edge faces +X, thickness is along Z.
 * Sizes are real metres; groups carry userData.trueScale (no rescale in the hand), userData.grip (distance
 * from the butt to the centre of the fist) and userData.lieFlat (rest on the ground on a flat face). */
import * as T from './vendor/three.module.min.js';

// ---------- deterministic noise ----------
const fract=x=>x-Math.floor(x);
const hash=(x,y,z,s)=>fract(Math.sin(x*127.1+y*311.7+z*74.7+s*19.19)*43758.5453);
const sm=t=>t*t*(3-2*t);
function vnoise(x,y,z,s=0){const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z),fx=sm(x-X),fy=sm(y-Y),fz=sm(z-Z);let r=0;
  for(let k=0;k<8;k++){const i=k&1,j=k>>1&1,l=k>>2&1;r+=hash(X+i,Y+j,Z+l,s)*(i?fx:1-fx)*(j?fy:1-fy)*(l?fz:1-fz)}return r}
function fbm(x,y,z,s=0,o=4){let a=.5,f=1,r=0,n=0;for(let i=0;i<o;i++){r+=a*vnoise(x*f,y*f,z*f,s+i*7);n+=a;a*=.5;f*=2.03}return r/n}
// tileable 2D value noise (period p cells)
function pnoise(x,y,p,s){const X=Math.floor(x),Y=Math.floor(y),fx=sm(x-X),fy=sm(y-Y),w=(a,m)=>((a%m)+m)%m;
  const h=(i,j)=>hash(w(X+i,p[0]),w(Y+j,p[1]),0,s);return h(0,0)*(1-fx)*(1-fy)+h(1,0)*fx*(1-fy)+h(0,1)*(1-fx)*fy+h(1,1)*fx*fy}
function pfbm(x,y,p,s,o=4){let a=.5,f=1,r=0,n=0;for(let i=0;i<o;i++){r+=a*pnoise(x*f,y*f,[p[0]*f,p[1]*f],s+i);n+=a;a*=.5;f*=2}return r/n}
function rng(seed){let s=(seed*2654435761)>>>0||1;return()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296}

// ---------- shared textures (DataTextures: no DOM needed, so the builders also run under Node) ----------
function dataTex(w,h,fn,srgb){const d=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=fn(x/w,y/h),i=(y*w+x)*4;
    d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255}
  const t=new T.DataTexture(d,w,h);t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;
  t.anisotropy=4;if(srgb)t.colorSpace=T.SRGBColorSpace;t.needsUpdate=true;return t}
// tangent-space normal map from a tileable height function
function normalTex(w,h,height,strength){const H=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)H[y*w+x]=height(x/w,y/h);
  const at=(x,y)=>H[((y+h)%h)*w+((x+w)%w)];
  return dataTex(w,h,(u,v)=>{const x=Math.round(u*w),y=Math.round(v*h),dx=(at(x+1,y)-at(x-1,y))*strength,dy=(at(x,y+1)-at(x,y-1))*strength,l=Math.hypot(dx,dy,1);
    return [(-dx/l*.5+.5)*255,(-dy/l*.5+.5)*255,(1/l*.5+.5)*255]},false)}
let TEX=null;
function textures(){if(TEX)return TEX;
  // wood: fine fibres along v (the stick's length), a few darker growth streaks, rays and pores
  const woodH=(u,v)=>{const w=u+.05*pfbm(u*4,v*2,[4,2],3);return .25*Math.pow(.5+.5*Math.sin(w*Math.PI*2*17+3*pfbm(u*8,v,[8,1],4)),4)+.5*pfbm(u*64,v*2,[64,2],5,3)+.25*pfbm(u*128,v*16,[128,16],9,2)};
  const wood=dataTex(128,256,(u,v)=>{const g=woodH(u,v),p=pfbm(u*96,v*40,[96,40],11,2)>.68?.7:1;return [ (204-64*g)*p,(170-58*g)*p,(128-48*g)*p ]},true);
  const woodN=normalTex(128,256,woodH,5);
  // cord: three twisted plies (diagonal ridges) with stray fibres
  const cordH=(u,v)=>{const t=fract((u+v)*3);return Math.pow(Math.sin(t*Math.PI),.6)*.8+.2*pfbm(u*32,v*32,[32,32],21,2)};
  const cord=dataTex(64,64,(u,v)=>{const h=cordH(u,v),n=pfbm(u*64,v*8,[64,8],23,2);return [128+72*h-26*n,116+64*h-26*n,94+50*h-22*n]},true);
  const cordN=normalTex(64,64,cordH,6);
  // stone grain: a speckle bump for the flake surfaces and the pecked cobble
  const grain=dataTex(128,128,(u,v)=>{const g=pfbm(u*32,v*32,[32,32],31,3)*.7+.3*hash(Math.floor(u*128),Math.floor(v*128),0,33);const c=g*255;return [c,c,c]},false);
  return TEX={wood,woodN,cord,cordN,grain}}

// Per-vertex roughness: geometries carry an `fkRough` attribute that scales the material roughness.
function roughPatch(m,key){m.onBeforeCompile=sh=>{
    sh.vertexShader="attribute float fkRough;\nvarying float vFkRough;\n"+sh.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\n\tvFkRough=fkRough;");
    sh.fragmentShader="varying float vFkRough;\n"+sh.fragmentShader.replace("#include <roughnessmap_fragment>","#include <roughnessmap_fragment>\n\troughnessFactor=clamp(roughnessFactor*vFkRough,.04,1.);")};
  m.customProgramCacheKey=()=>key;return m}
let MAT=null;
export function toolMaterials(){if(MAT)return MAT;const t=textures();
  MAT={
    stone:roughPatch(new T.MeshStandardMaterial({name:"fk-tool-cobble",vertexColors:true,roughness:1,metalness:0,bumpMap:t.grain,bumpScale:.25}),"fk-tool-rough"),
    wood:roughPatch(new T.MeshStandardMaterial({name:"fk-tool-wood",vertexColors:true,map:t.wood,normalMap:t.woodN,normalScale:new T.Vector2(.7,.7),roughness:1,metalness:0}),"fk-tool-rough"),
    cord:new T.MeshStandardMaterial({name:"fk-tool-cord",map:t.cord,normalMap:t.cordN,normalScale:new T.Vector2(1,1),color:0xc4b49a,roughness:.97,metalness:0}),
    copper:new T.MeshStandardMaterial({name:"fk-tool-copper",color:0xc8784a,roughness:.42,metalness:.9,bumpMap:t.grain,bumpScale:.2}),
    bronze:new T.MeshStandardMaterial({name:"fk-tool-bronze",color:0xb48a45,roughness:.38,metalness:.9,bumpMap:t.grain,bumpScale:.2}),
    iron:new T.MeshStandardMaterial({name:"fk-tool-iron",color:0x6f7176,roughness:.5,metalness:.85,bumpMap:t.grain,bumpScale:.35})};
  return MAT}

// ---------- knapped stone ----------
const C=(h)=>new T.Color(h);
const FLINT={dark:C(0x4a443e),mid:C(0x7a6f63),thin:C(0xa69886),cortex:C(0xb3a68c),band:C(0x5a5048)};
/**
 * Biconvex knapped piece in its own frame: length along X (a in [-L, L]), width along Y, thickness along Z.
 * o: {L, W, widen, nPos, nNeg, bend, H, Htaper, q, seed, segs, rings, scars:[top,bottom], retouch, retouchSpan(theta)->0..1,
 *     cortex (0..1 chance of keeping lens surface as cortex), metal (smooth, no scars)}
 */
export function knappedGeometry(o){
  const R=rng(o.seed||1),L=o.L,W=o.W,S=o.segs||80,NR=o.rings||12,q=o.q??.55,cx=o.cx||0;
  const nP=o.nPos||2,nN=o.nNeg||2,widen=o.widen||0,bend=o.bend||0;
  // retouch notches scallop the outline (each small removal bites a shallow arc out of the edge)
  const notches=[];if(!o.metal){const n=o.retouch||0;for(let i=0;i<n;i++){const th=(i+.5+(R()-.5)*.6)/n*Math.PI*2,span=o.retouchSpan?o.retouchSpan(th):1;
      if(span>0)notches.push({th,w:Math.PI*2/n*(.55+R()*.35),d:(.008+R()*.014)*span})}}
  const notch=th=>{let f=0;for(const nt of notches){let d=th-nt.th;d-=Math.round(d/(Math.PI*2))*Math.PI*2;const x=d/nt.w;if(x>-1&&x<1)f=Math.max(f,nt.d*(1-x*x))}return 1-f};
  const outline=th=>{const c=Math.cos(th),s=Math.sin(th),n=c>=0?nP:nN,a=L*Math.sign(c)*Math.pow(Math.abs(c),2/n),k=notch(th);
    const b=W*(1+widen*a/L)*Math.sign(s)*Math.pow(Math.abs(s),2/n)+bend*L*(1-(a/L)**2);return [cx+a*k,b*k]};
  const Hat=a=>o.H*Math.max(.15,1-(o.Htaper||0)*(a-cx)/L);
  // polar lookup table for lensAt(x, y)
  const TAB=[];for(let i=0;i<=720;i++){const th=i/720*Math.PI*2,[x,y]=outline(th);TAB.push({phi:Math.atan2(y,x-cx),r:Math.hypot(x-cx,y)})}
  TAB.sort((p,q)=>p.phi-q.phi);
  const lensAt=(x,y)=>{const phi=Math.atan2(y,x-cx);let lo=0,hi=TAB.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(TAB[m].phi<phi)lo=m;else hi=m}
    const r=TAB[lo].r+(TAB[hi].r-TAB[lo].r)*((phi-TAB[lo].phi)/Math.max(1e-6,TAB[hi].phi-TAB[lo].phi)),rho=Math.hypot(x-cx,y)/Math.max(1e-6,r);
    return rho>=1?0:Hat(x)*Math.pow(1-rho*rho,q)};
  // flake scars per face
  const mkScars=(count,small)=>{const out=[];if(o.metal)return out;
    for(let i=0;i<count;i++){const th=small?(i+R())/count*Math.PI*2:(i+.5+(R()-.5)*.7)/count*Math.PI*2;
      if(small&&o.retouchSpan&&R()>o.retouchSpan(th))continue;
      const [ox,oy]=outline(th),P=new T.Vector2(ox,oy),inward=new T.Vector2(cx-ox,-oy*(.6+R()*.5)).normalize().rotateAround(new T.Vector2(),(R()-.5)*.5);
      const reach=Math.hypot(ox-cx,oy),Ls=small?.004+R()*.006:reach*(.5+R()*.45),Ws=small?.004+R()*.005:Math.max(.008,reach*(.45+R()*.4));
      const end=P.clone().addScaledVector(inward,Ls),g=Math.max(lensAt(end.x,end.y),.0006)/Ls*(1.02+R()*.15);
      out.push({P,d:inward,pd:new T.Vector2(-inward.y,inward.x),Ls,Ws,g,kv:g*Ls*.3/((Ws*.5)**2),h0:-.0002-R()*.0004,
        bulb:small?0:.0003+R()*.0004,rip:small?0:.00004+R()*.00006,lam:.0035+R()*.003,tint:(R()-.5)*.16,rough:.26+R()*.16})}
    return out};
  const faces=(o.scars||[9,8]).map((n,f)=>[...mkScars(n,false),...mkScars(o.retouchScars?.[f]??0,true)]);
  // surface height on one face with its analytic gradient: [z, winner, lens, dz/dx, dz/dy]
  const _p=new T.Vector2();
  const lensG=(x,y)=>{const e=.00025;return [(lensAt(x+e,y)-lensAt(x-e,y))/(2*e),(lensAt(x,y+e)-lensAt(x,y-e))/(2*e)]};
  const surf=(x,y,face,grad)=>{const lz=lensAt(x,y);let z=lz,win=-1,gx=0,gy=0;
    for(let i=0;i<face.length;i++){const s=face[i];_p.set(x-s.P.x,y-s.P.y);const u=_p.dot(s.d);if(u<-.002)continue;const v=_p.dot(s.pd),r=Math.max(1e-6,_p.length());
      const eb=Math.exp(-((r/(.22*s.Ls))**2)),er=Math.exp(-r/s.Ls),ph=r/s.lam*Math.PI*2;
      const h=s.h0+s.g*u+s.kv*v*v-s.bulb*eb+s.rip*er*Math.sin(ph);
      if(h<z){z=h;win=i;if(grad){const dr=s.bulb*eb*2*r/((.22*s.Ls)**2)+s.rip*er*(Math.cos(ph)*Math.PI*2/s.lam-Math.sin(ph)/s.Ls);
        gx=s.g*s.d.x+2*s.kv*v*s.pd.x+dr*_p.x/r;gy=s.g*s.d.y+2*s.kv*v*s.pd.y+dr*_p.y/r}}}
    if(grad&&win<0)[gx,gy]=lensG(x,y);
    if(z<lz*.14){z=lz*.14;if(grad){const [lx,ly]=lensG(x,y);gx=lx*.14;gy=ly*.14}}
    return [z,win,lz,gx,gy]};
  const rhoAt=(x,y)=>{const l=lensAt(x,y);if(l>0)return Math.sqrt(Math.max(0,1-Math.pow(l/Hat(x),1/q)));return 1};
  // planform bounds -> uv (top face in v 0..0.5, bottom in 0.5..1)
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(let i=0;i<=360;i++){const [x,y]=outline(i/360*Math.PI*2);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
  const pad=.002;x0-=pad;x1+=pad;y0-=pad;y1+=pad;
  const UV=(x,y,f)=>[(x-x0)/(x1-x0),f*.5+.01+(y-y0)/(y1-y0)*.48];
  const rot=o.rotZ||0,cr=Math.cos(rot),sr=Math.sin(rot);
  const bandDir=new T.Vector3(R()-.5,R()-.5,R()-.5).normalize(),cc=new T.Color();
  // colour + roughness of the stone at a surface point
  const shade=(x,y,z,f,w,lz,face)=>{
    const band=.5+.5*Math.sin((x*bandDir.x+y*bandDir.y+z*bandDir.z)*260+fbm(x*60,y*60,z*60,o.seed)*5);
    cc.copy(FLINT.dark).lerp(FLINT.mid,.2+.5*fbm(x*90,y*90,f*3,o.seed+1)).lerp(FLINT.band,band*.35);
    let rgh;const ck=w<0&&o.cortex?T.MathUtils.smoothstep(lz,.001,.004)*T.MathUtils.smoothstep(o.cortex-fbm(x*30,y*30,f*5,o.seed+2),0,.08)*(o.cortexAt?o.cortexAt(x,y):1):0;
    if(ck>0){cc.lerp(FLINT.cortex.clone().multiplyScalar(.8+.25*fbm(x*200,y*200,f,o.seed+3)),ck);rgh=.45+.52*ck}
    else{const s=w>=0?face[w]:null;if(s)cc.offsetHSL(0,s.tint*.1,s.tint*.45);rgh=s?s.rough:.45;
      const thin=Math.max(0,1-Math.abs(z)/.003);cc.lerp(FLINT.thin,thin*.6);rgh+=thin*.06}
    return rgh};
  // ---- mesh ----
  const pos=[],nor=[],uv=[],idx=[];
  const rhoK=k=>1-Math.pow(1-k/NR,1.45);
  for(let f=0;f<2;f++){const face=faces[f],sign=f?-1:1,base=pos.length/3;
    for(let k=0;k<=NR;k++){const rho=rhoK(k);for(let j=0;j<=S;j++){const th=j/S*Math.PI*2,[ex,ey]=outline(th),x=cx+(ex-cx)*rho,y=ey*rho,[z,,,gx,gy]=surf(x,y,face,true);
        const n=new T.Vector3(-gx,-gy,1).multiplyScalar(sign);if(rho>=.999){n.set((x-cx)*30,y*30,sign*.3)}n.normalize();
        pos.push(x*cr-y*sr,x*sr+y*cr,sign*z);nor.push(n.x*cr-n.y*sr,n.x*sr+n.y*cr,n.z);uv.push(...UV(x,y,f))}}
    for(let k=0;k<NR;k++)for(let j=0;j<S;j++){const a=base+k*(S+1)+j,b=a+S+1;if(f)idx.push(a,a+1,b,b,a+1,b+1);else idx.push(a,b,a+1,b,b+1,a+1)}}
  const g=new T.BufferGeometry();g.setIndex(idx);g.setAttribute("position",new T.Float32BufferAttribute(pos,3));g.setAttribute("normal",new T.Float32BufferAttribute(nor,3));
  g.setAttribute("uv",new T.Float32BufferAttribute(uv,2));
  g.computeBoundingBox();g.computeBoundingSphere();
  g.userData={scars:faces[0].length+faces[1].length,outline,lensAt,halfW:x=>W*(1+widen*(x-cx)/L)*Math.sqrt(Math.max(0,1-Math.pow(Math.abs((x-cx)/L),nP)))};
  if(o.metal)return g;
  // ---- baked maps: object-space normals (crisp scar ridges at texel resolution), colour and roughness ----
  const TW=o.tex||256,TH=TW,nd=new Uint8Array(TW*TH*4),cd=new Uint8Array(TW*TH*4),rd=new Uint8Array(TW*TH*4),lin=new T.Color();
  for(let j=0;j<TH;j++){const vv=(j+.5)/TH,f=vv<.5?0:1,face=faces[f],sign=f?-1:1;
    for(let i=0;i<TW;i++){let x=x0+(i+.5)/TW*(x1-x0),y=y0+(vv-f*.5-.01)/.48*(y1-y0);
      const rho=rhoAt(x,y);if(rho>.985){const k=.985/Math.max(rho,1e-3);x=cx+(x-cx)*k;y*=k} // bleed the rim outward
      const [z,w,lz,gx,gy]=surf(x,y,face,true),mx=(hash(i,j,1,o.seed)-.5)*.06,my=(hash(i,j,2,o.seed)-.5)*.06;
      const n=new T.Vector3(-gx+mx,-gy+my,1).multiplyScalar(sign).normalize(),nx=n.x*cr-n.y*sr,ny=n.x*sr+n.y*cr,t=(j*TW+i)*4;
      nd[t]=(nx*.5+.5)*255;nd[t+1]=(ny*.5+.5)*255;nd[t+2]=(n.z*.5+.5)*255;nd[t+3]=255;
      const rg=shade(x,y,sign*z,f,w,lz,face);lin.copy(cc).convertLinearToSRGB();
      cd[t]=lin.r*255;cd[t+1]=lin.g*255;cd[t+2]=lin.b*255;cd[t+3]=255;rd[t]=rd[t+2]=0;rd[t+1]=Math.min(1,rg)*255;rd[t+3]=255}}
  const mk=(d,srgb)=>{const t=new T.DataTexture(d,TW,TH);t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;if(srgb)t.colorSpace=T.SRGBColorSpace;t.needsUpdate=true;return t};
  g.userData.maps={map:mk(cd,true),normalMap:mk(nd,false),roughnessMap:mk(rd,false)};
  return g}

// ---------- whittled haft ----------
/** Haft along +Y from 0 to len. r(s) gives the radius at s in [0,1]. Returns {geo, radiusAt(y,theta), centreAt(y)}. */
export function haftGeometry(o){
  const R=rng(o.seed||7),len=o.len,S=o.sides||14,N=o.rings||36,ov=o.oval??.93,F=o.facets||7,ph=R()*6,bx=(o.bend??.006),bz=bx*.6*(R()-.5),p1=R()*6;
  const clear=o.clear||[]; // [y0,y1] ranges kept smooth (no bark) under lashings / in the hand
  const centre=y=>{const s=y/len;return [bx*Math.sin(Math.PI*s+p1*.1)+bx*.35*Math.sin(Math.PI*2*s+p1),bz*Math.sin(Math.PI*s*1.3+p1)]};
  const barkAt=(y,th)=>{if(o.bark===0||clear.some(([a,b])=>y>a-.004&&y<b+.004))return 0;const n=fbm(Math.cos(th)*1.4,Math.sin(th)*1.4,y*7,o.seed||7);return T.MathUtils.smoothstep(n,.6-(o.bark||.25)*.2,.66-(o.bark||.25)*.2)};
  const radiusAt=(y,th)=>{const s=T.MathUtils.clamp(y/len,0,1),r=o.r(s),fa=Math.PI*2/F,m=((th+ph+y*1.7)%fa+fa)%fa,poly=Math.cos(Math.PI/F)/Math.cos(m-fa/2);
    const knot=.04*Math.max(0,fbm(Math.cos(th),Math.sin(th),y*5,(o.seed||7)+4)-.55)*4;
    return r*(1+.55*(poly-1)+knot+.025*(fbm(Math.cos(th)*2,Math.sin(th)*2,y*14,(o.seed||7)+5)-.5))*(1+.075*barkAt(y,th)*(.012/r))};
  const pos=[],uv=[],col=[],rough=[],idx=[];
  const ys=[];const cap=o.cap??Math.min(.012,o.r(1)*.8),capB=o.capB??Math.min(.008,o.r(0)*.6);
  for(let k=0;k<=3;k++)ys.push({y:capB*(1-Math.sin(k/3*Math.PI/2)),f:Math.cos((1-k/3)*Math.PI/2)});
  for(let k=1;k<N;k++)ys.push({y:capB+(len-capB-cap)*k/N,f:1});
  for(let k=0;k<=3;k++)ys.push({y:len-cap+cap*Math.sin(k/3*Math.PI/2),f:Math.cos(k/3*Math.PI/2)});
  const cc=new T.Color();
  for(const {y,f} of ys){const [cxp,czp]=centre(y);for(let j=0;j<=S;j++){const th=j/S*Math.PI*2,r=radiusAt(Math.min(len,Math.max(0,y)),th)*Math.max(f,.04);
      pos.push(cxp+Math.cos(th)*r,y,czp+Math.sin(th)*r*ov);uv.push(j/S*2,y*3);
      const b=barkAt(y,th),end=(f<.999);
      if(end){cc.setRGB(.82,.68,.5).multiplyScalar(.85+.3*fbm(th,y*50,1,9));rough.push(.9)} // end grain
      else{cc.setRGB(1,1,1).lerp(new T.Color(.36,.27,.2).multiplyScalar(.75+.5*fbm(Math.cos(th)*8,Math.sin(th)*8,y*60,3)),b);
        cc.multiplyScalar(.9+.18*fbm(Math.cos(th)*3,Math.sin(th)*3,y*9,o.seed||7)); // handled = slightly darker near the grip
        if(o.worn)cc.multiplyScalar(1-.18*Math.max(0,1-Math.abs(y-o.worn[0])/o.worn[1]));
        rough.push(.78+.17*b+(o.worn?-.15*Math.max(0,1-Math.abs(y-o.worn[0])/o.worn[1]):0))}
      col.push(cc.r,cc.g,cc.b)}}
  for(let k=0;k<ys.length-1;k++)for(let j=0;j<S;j++){const a=k*(S+1)+j,b=a+S+1;idx.push(a,b,a+1,b,b+1,a+1)}
  const g=new T.BufferGeometry();g.setIndex(idx);g.setAttribute("position",new T.Float32BufferAttribute(pos,3));g.setAttribute("uv",new T.Float32BufferAttribute(uv,2));
  g.setAttribute("color",new T.Float32BufferAttribute(col,3));g.setAttribute("fkRough",new T.Float32BufferAttribute(rough,1));g.computeVertexNormals();
  // weld the seam normals
  const n=g.attributes.normal;for(let k=0;k<ys.length;k++){const a=k*(S+1),b=a+S;const v=new T.Vector3(n.getX(a)+n.getX(b),n.getY(a)+n.getY(b),n.getZ(a)+n.getZ(b)).normalize();n.setXYZ(a,v.x,v.y,v.z);n.setXYZ(b,v.x,v.y,v.z)}
  g.computeBoundingBox();g.computeBoundingSphere();
  return {geo:g,radiusAt:(y,th)=>radiusAt(y,th),centreAt:centre,oval:ov}}

// ---------- cords ----------
function tube(points,rc,closed,segPer=10){const curve=new T.CatmullRomCurve3(points,closed,"centripetal");const L=curve.getLength();
  const g=new T.TubeGeometry(curve,Math.max(8,Math.round(L/.004)),rc,5,closed);const u=g.attributes.uv;for(let i=0;i<u.count;i++)u.setX(i,u.getX(i)*L/(rc*5.5));
  return g}
/** Helical whipping round a haft between y0 and y1 (turns touch, cord bites slightly into the wood). */
function whipping(h,y0,y1,rc,extra=0){const turns=Math.max(2,Math.round((y1-y0)/(rc*2.1))),pts=[];const M=turns*10;
  for(let i=0;i<=M;i++){const t=i/M,th=t*turns*Math.PI*2,y=y0+(y1-y0)*t,[cxp,czp]=h.centreAt(y),r=h.radiusAt(y,th)+rc*.8+extra;pts.push(new T.Vector3(cxp+Math.cos(th)*r,y,czp+Math.sin(th)*r*h.oval))}
  return tube(pts,rc,false)}
/** Diagonal lashing binding a head that crosses the haft at (0, yc). Each turn runs through two opposite crotches
 *  between head and haft and hugs the front and back surfaces; the turns of one diagonal fan out over the joint. */
function diagonalLashing(h,yc,headLens,halfH,rc,loops=3,sign=1){const gs=[],R=h.radiusAt(yc,0),[hx,hz]=h.centreAt(yc);
  const depth=(x,y)=>{const hz=Math.abs(x)<R?Math.sqrt(R*R-x*x)*h.oval:0;return Math.max(hz,headLens(x,y-yc))+rc*.9};
  const cx=R+rc*1.2,cy=halfH(cx)+rc*1.2,A=[cx,yc+sign*cy],B=[-cx,yc-sign*(halfH(-cx)+rc*1.2)];
  for(let i=0;i<loops;i++){const o=(i-(loops-1)/2)*rc*2.3,pts=[];
    for(const side of [1,-1])for(let k=0;k<=12;k++){const t=k/12,u=side>0?t:1-t,x=A[0]+(B[0]-A[0])*u,y=A[1]+(B[1]-A[1])*u,f=Math.sin(Math.PI*u),
      ox=-o*f*.7071*sign,oy=o*f*.7071,z=side*depth(x+ox,y+oy)*Math.pow(f,.25);if((k===0||k===12)&&side<0)continue;pts.push(new T.Vector3(hx+x+ox,y+oy,hz+z))}
    gs.push(tube(pts,rc,true))}
  return gs}
function merge(geos){const m=mergeGeos(geos);for(const g of geos)g.dispose();return m}
// minimal merge (position/normal/uv[/color/fkRough]) so we do not depend on BufferGeometryUtils here
function mergeGeos(geos){const names=Object.keys(geos[0].attributes).filter(n=>geos.every(g=>g.attributes[n]));const out=new T.BufferGeometry(),idx=[];let off=0;
  const data={};for(const n of names)data[n]=[];
  for(const g of geos){const c=g.attributes.position.count;for(const n of names)data[n].push(...g.attributes[n].array);
    if(g.index)for(const i of g.index.array)idx.push(i+off);else for(let i=0;i<c;i++)idx.push(i+off);off+=c}
  for(const n of names)out.setAttribute(n,new T.Float32BufferAttribute(data[n],geos[0].attributes[n].itemSize));out.setIndex(idx);out.computeBoundingBox();out.computeBoundingSphere();return out}

// ---------- the tools ----------
const metalOf=k=>k.endsWith("_copper")?"copper":k.endsWith("_bronze")?"bronze":k.endsWith("_iron")?"iron":null;
function axeParts(k){const metal=metalOf(k),pick=k==="pickaxe_stone",len=pick?.56:.54,yc=len-.055;
  const h=haftGeometry({len,seed:pick?17:11,r:s=>s<.05?.0185-.05*s:s<.72?.0162+.002*s:.0177+.0062*T.MathUtils.smoothstep(s,.72,.86),bend:.008,bark:.3,
    clear:[[0,.16],[yc-.07,yc+.06]],worn:[.06,.07]});
  const head=pick?knappedGeometry({L:.105,W:.021,widen:-.45,nPos:1.35,nNeg:2.2,H:.0165,Htaper:.25,q:.42,cx:.045,seed:27,segs:84,rings:12,scars:[10,10],retouchScars:[16,16],retouch:22,cortex:.4,cortexAt:(x)=>1-T.MathUtils.smoothstep(x,-.01,.03),
      retouchSpan:th=>Math.cos(th)>.3?1:.2})
    :knappedGeometry({L:.082,W:.026,widen:.42,nPos:3.2,nNeg:2.1,H:.015,Htaper:.7,q:.62,cx:.036,seed:metal?5:13,segs:120,rings:18,scars:[15,14],retouchScars:[40,36],retouch:30,cortex:.5,cortexAt:(x)=>1-T.MathUtils.smoothstep(x,.0,.04),metal:!!metal,
      retouchSpan:th=>Math.cos(th)>.55?1:Math.cos(th)>0?.35:0});
  const [hx,hz]=h.centreAt(yc);head.translate(hx,yc,hz);
  const rc=.0016;
  const hl=head.userData.lensAt,hw=head.userData.halfW,cords=merge([whipping(h,yc-.07,yc-.034,rc),whipping(h,yc+.032,yc+.05,rc),...diagonalLashing(h,yc,hl,hw,rc,3,1),...diagonalLashing(h,yc,hl,hw,rc,3,-1)]);
  return {parts:[[h.geo,"wood"],[head,metal||"flint"],[cords,"cord"]],grip:.075}}
function knifeParts(k){const metal=metalOf(k),hl=.098;
  const h=haftGeometry({len:hl,seed:metal?23:19,sides:14,rings:14,oval:.76,facets:6,bend:.002,bark:.15,r:s=>.0138+.0012*Math.sin(s*Math.PI)-(s<.06?.002*(1-s/.06):0),cap:.006,capB:.006,clear:[[.058,hl]]});
  const blade=knappedGeometry({L:.057,W:.0158,widen:-.18,nPos:1.55,nNeg:2.6,bend:.025,H:metal?.0024:.0052,Htaper:.15,q:metal?.7:.5,seed:metal?3:41,segs:84,rings:12,
    rotZ:Math.PI/2,scars:[8,7],retouchScars:[42,36],retouch:36,cortex:.35,cortexAt:(x)=>1-T.MathUtils.smoothstep(x,-.03,0),metal:!!metal,retouchSpan:th=>Math.cos(th)>-.55?1:0});
  blade.translate(-.0012,hl+.043,0);
  const rc=.0013,cords=merge([whipping(h,.06,hl-.004,rc),whipping(h,.008,.03,rc*.9)]);
  return {parts:[[h.geo,"wood"],[blade,metal||"flint"],[cords,"cord"]],grip:.05}}
function spearParts(){const len=1.62,y0=-.545;
  const h=haftGeometry({len,seed:29,sides:12,rings:44,r:s=>.0135-.003*s,bend:.012,bark:.35,clear:[[len-.075,len]],cap:.008});
  h.geo.translate(0,y0,0);
  const head=knappedGeometry({L:.078,W:.021,widen:-.22,nPos:1.45,nNeg:1.9,H:.0058,Htaper:.2,q:.5,seed:37,segs:72,rings:10,scars:[8,8],retouchScars:[30,30],retouch:30,cortex:.3,rotZ:Math.PI/2,cortexAt:(x)=>1-T.MathUtils.smoothstep(x,-.05,-.02)});
  head.translate(0,y0+len+.04,0);
  const hh={centreAt:y=>h.centreAt(y-y0),radiusAt:(y,th)=>h.radiusAt(y-y0,th),oval:h.oval};
  const cords=whipping(hh,y0+len-.07,y0+len-.005,.0014);
  return {parts:[[h.geo,"wood"],[head,"flint"],[cords,"cord"]],grip:.62}}
function hammerParts(){const len=.34,yc=len-.045;
  const h=haftGeometry({len,seed:31,r:s=>.0145+.002*s,bend:.006,bark:.3,clear:[[0,.13],[yc-.07,yc+.05]]});
  const g=new T.SphereGeometry(1,22,14),p=g.attributes.position,cols=[],rough=[],cc=new T.Color();
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=fbm(x*1.6+3,y*1.6,z*1.6,51),f=.92+.16*n;
    p.setXYZ(i,(x*.052+.012)*f,y*.036*f,z*.033*f);const sp=hash(Math.round(x*40),Math.round(y*40),Math.round(z*40),5);
    cc.setRGB(.15,.14,.125).multiplyScalar(.8+.35*fbm(x*6,y*6,z*6,52));if(sp>.82)cc.lerp(new T.Color(.06,.055,.05),.6);else if(sp<.1)cc.lerp(new T.Color(.34,.31,.27),.5);
    if(x>.85)cc.lerp(new T.Color(.25,.24,.22),.5); // battered, pecked striking end
    cols.push(cc.r,cc.g,cc.b);rough.push(x>.85?1:.9)}
  g.setAttribute("color",new T.Float32BufferAttribute(cols,3));g.setAttribute("fkRough",new T.Float32BufferAttribute(rough,1));g.computeVertexNormals();g.translate(0,yc,0);
  const cobZ=(x,y)=>{const e=1-(x-.012)**2/.052**2-y*y/.036**2;return e>0?.033*Math.sqrt(e):0};
  const rc=.0016,cords=merge([whipping(h,yc-.075,yc-.04,rc),whipping(h,yc+.036,yc+.046,rc),...diagonalLashing(h,yc,cobZ,()=>.036,rc,3,1),...diagonalLashing(h,yc,cobZ,()=>.036,rc,3,-1)]);
  return {parts:[[h.geo,"wood"],[g,"stone"],[cords,"cord"]],grip:.07}}

export const TOOL_KINDS=Object.freeze(["axe_stone","axe_copper","axe_bronze","axe_iron","pickaxe_stone","knife_stone","knife_copper","knife_bronze","knife_iron","hammer_stone","spear"]);
const CACHE=new Map();
/** A new Group for a tool kind; geometries and materials are shared with every other copy of that kind. */
export function buildTool(k){if(!TOOL_KINDS.includes(k))return null;
  let c=CACHE.get(k);if(!c){c=k==="spear"?spearParts():k==="hammer_stone"?hammerParts():k.startsWith("knife_")?knifeParts(k):axeParts(k);CACHE.set(k,c)}
  const M=toolMaterials(),g=new T.Group();g.name=k;
  for(const [geo,m] of c.parts){const mat=m==="flint"?(geo.userData.mat||=new T.MeshStandardMaterial({name:"fk-tool-flint-"+k,...geo.userData.maps,normalMapType:T.ObjectSpaceNormalMap,roughness:1,metalness:0})):M[m];const mesh=new T.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.shared=true;g.add(mesh)}
  g.userData={trueScale:true,grip:c.grip,lieFlat:true,sharedGeometry:true};return g}
export function toolTriangles(k){const g=buildTool(k);let n=0;g.traverse(m=>{if(m.isMesh)n+=(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)/3});return n}
