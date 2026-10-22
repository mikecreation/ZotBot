/* Fog of Knowledge: The Game — vegetation (v1).
 * Procedural trees (recursive branch tubes + bark normal map, alpha leaf cards with back-light translucency,
 * hierarchical wind, baked cross-quad impostors), Ghost-of-Tsushima-style grass clumps (curved Bezier blades,
 * clump lean, scrolling-noise gusts, blade LOD, rounded normals, translucency) and instanced flowers with real petals.
 * Everything is generated here at load time; no external assets. See VEGETATION.md. */
import * as THREE from "./vendor/three.module.min.js";
import {mergeGeometries} from "./vendor/addons/utils/BufferGeometryUtils.js";

let CTX=null;
const V3=THREE.Vector3;
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296}}
const srgb=(r,g,b)=>new THREE.Color().setRGB(r,g,b,THREE.SRGBColorSpace);

/* ---------- shared GLSL: wind + translucency ---------- */
const WIND_GLSL=`
uniform float uTime;uniform float uWind;
float vg_h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vg_n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(vg_h(i),vg_h(i+vec2(1,0)),f.x),mix(vg_h(i+vec2(0,1)),vg_h(i+vec2(1,1)),f.x),f.y);}
const vec2 VG_WDIR=vec2(.94,.34);
// travelling gust field: bands of stronger wind roll across the land in the wind direction
float vg_gust(vec2 xz){return vg_n(xz*.045-VG_WDIR*uTime*.55)*.65+vg_n(xz*.13-VG_WDIR*uTime*1.3)*.35;}
`;
const TRANSL=(amt)=>`
#include <lights_fragment_begin>
#if NUM_DIR_LIGHTS > 0
{ vec3 Ld=directionalLights[0].direction; vec3 Vd=normalize(vViewPosition);
  float fwd=pow(clamp(dot(-Vd,Ld),0.,1.),4.);
  float wrapL=clamp(dot(-normal,Ld)*.5+.5,0.,1.);
  float sh=1.;
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
   sh=receiveShadow?getShadow(directionalShadowMap[0],directionalLightShadows[0].shadowMapSize,directionalLightShadows[0].shadowBias,directionalLightShadows[0].shadowRadius,vDirectionalShadowCoord[0]):1.;
  #endif
  reflectedLight.directDiffuse+=diffuseColor.rgb*directionalLights[0].color*(fwd*1.5+wrapL*.3)*${amt.toFixed(2)}*mix(.15,1.,sh)*vTransl;
}
#endif`;

/* ---------- procedural textures ---------- */
function canvas(w,h){const c=document.createElement("canvas");c.width=w;c.height=h;return c}
function barkTextures(){
  const N=256,hgt=new Float32Array(N*N),R=rng(77);
  // vertical furrows (fbm stretched along v) + plates
  const oct=[];for(let o=0;o<5;o++){const g=new Float32Array(17*17);for(let i=0;i<g.length;i++)g[i]=R();oct.push(g)}
  const smp=(g,x,y,n)=>{x=((x%n)+n)%n;y=((y%n)+n)%n;const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,a=g[yi*17+xi],b=g[yi*17+(xi+1)%n],c=g[((yi+1)%n)*17+xi],d=g[((yi+1)%n)*17+(xi+1)%n],sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy};
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){let v=0,amp=1,tot=0;for(let o=0;o<5;o++){const fx=(2<<o),fy=(1<<o);v+=amp*smp(oct[o],x/N*fx*2,y/N*fy,16);tot+=amp;amp*=.55}
    v/=tot;const furrow=Math.pow(Math.abs(Math.sin((x/N*7+v*1.6)*Math.PI)),.5);hgt[y*N+x]=v*.55+furrow*.45}
  const cn=canvas(N,N),cc=canvas(N,N),xn=cn.getContext("2d"),xc=cc.getContext("2d"),dn=xn.createImageData(N,N),dc=xc.createImageData(N,N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x,hl=hgt[y*N+(x+N-1)%N],hr=hgt[y*N+(x+1)%N],hd=hgt[((y+N-1)%N)*N+x],hu=hgt[((y+1)%N)*N+x];
    let nx=(hl-hr)*6,ny=(hd-hu)*6,nz=1;const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;
    dn.data[i*4]=(nx*.5+.5)*255;dn.data[i*4+1]=(ny*.5+.5)*255;dn.data[i*4+2]=(nz*.5+.5)*255;dn.data[i*4+3]=255;
    const h=hgt[i],c=60+h*150;dc.data[i*4]=c;dc.data[i*4+1]=c*.93;dc.data[i*4+2]=c*.86;dc.data[i*4+3]=255}
  xn.putImageData(dn,0,0);xc.putImageData(dc,0,0);
  const nt=new THREE.CanvasTexture(cn),ct=new THREE.CanvasTexture(cc);
  for(const t of [nt,ct]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4}
  ct.colorSpace=THREE.SRGBColorSpace;return {normal:nt,color:ct}
}
/* leaf atlas 1024²: [0] broadleaf cluster, [1] conifer sprig, [2] palm leaflets, [3] small-leaf shrub cluster */
const TILE=[[0,.5],[.5,.5],[0,0],[.5,0]];
function leafAtlas(){
  const S=1024,c=canvas(S,S),x=c.getContext("2d"),R=rng(91);
  const leaf=(cx,cy,len,wid,ang,col)=>{x.save();x.translate(cx,cy);x.rotate(ang);
    const g=x.createLinearGradient(0,-wid,0,wid);g.addColorStop(0,col[0]);g.addColorStop(.5,col[1]);g.addColorStop(1,col[2]);x.fillStyle=g;
    x.beginPath();x.moveTo(0,0);x.bezierCurveTo(len*.25,-wid*1.1,len*.7,-wid*.9,len,0);x.bezierCurveTo(len*.7,wid*.9,len*.25,wid*1.1,0,0);x.fill();
    x.strokeStyle="rgba(210,230,150,.35)";x.lineWidth=Math.max(1,wid*.12);x.beginPath();x.moveTo(len*.05,0);x.lineTo(len*.9,0);x.stroke();x.restore()};
  const greens=()=>{const h=R(),l=.8+R()*.4;return [`rgb(${40*l|0},${68*l|0},${22*l|0})`,`rgb(${78*l|0},${112*l|0},${36*l|0})`,`rgb(${52*l|0},${86*l|0},${26*l|0})`].map((s,i)=>h>.85&&i===1?`rgb(${100*l|0},${118*l|0},${40*l|0})`:s)};
  // tile 0 broadleaf cluster: twig + 34 leaves
  const cluster=(ox,oy,n,len,wid)=>{x.strokeStyle="#3b2c1c";x.lineWidth=5;x.beginPath();x.moveTo(ox+256,oy+500);x.quadraticCurveTo(ox+240,oy+300,ox+262,oy+90);x.stroke();
    for(let i=0;i<n;i++){const t=i/n,px=ox+256+(R()-.5)*260*(1-t*.4),py=oy+470-t*380+(R()-.5)*60,a=-Math.PI/2+(R()-.5)*2.6;
      x.strokeStyle="#3b2c1c";x.lineWidth=2;x.beginPath();x.moveTo(ox+256,py+20);x.lineTo(px,py);x.stroke();leaf(px,py,len*(.75+R()*.5),wid*(.8+R()*.4),a,greens())}};
  cluster(0,0,34,120,38);
  // tile 1 conifer sprig: main twig with dense needles
  {const ox=512,oy=0;for(let b=0;b<5;b++){const sx=ox+60+b*20,sy=oy+460-b*80,ex=ox+452-b*30,ey=oy+60+b*60;x.strokeStyle="#3a2a1a";x.lineWidth=4;x.beginPath();x.moveTo(sx,sy);x.lineTo(ex,ey);x.stroke();
    const L=Math.hypot(ex-sx,ey-sy),ux=(ex-sx)/L,uy=(ey-sy)/L;for(let i=0;i<L;i+=4){const px=sx+ux*i,py=sy+uy*i,f=1-i/L;
      for(const s of [-1,1]){const a=Math.atan2(uy,ux)+s*(.9+R()*.3),nl=(26+R()*16)*(.5+f*.6),l=.75+R()*.5;x.strokeStyle=`rgb(${28*l|0},${58*l|0},${34*l|0})`;x.lineWidth=2.2;x.beginPath();x.moveTo(px,py);x.lineTo(px+Math.cos(a)*nl,py+Math.sin(a)*nl);x.stroke()}}}}
  // tile 2 palm frond leaflets (rachis along v, i.e. vertical; leaflets droop to both sides)
  {const ox=0,oy=512;x.strokeStyle="#6b6a35";x.lineWidth=7;x.beginPath();x.moveTo(ox+256,oy+512);x.lineTo(ox+256,oy);x.stroke();
    for(let i=0;i<60;i++){const py=oy+505-i*8.3,f=Math.sin(Math.PI*(i/60))*.8+.2;for(const s of [-1,1]){x.save();x.translate(ox+256,py);x.rotate(s>0?-.35:Math.PI+.35);
      const l=.8+R()*.3;x.fillStyle=`rgb(${64*l|0},${96*l|0},${34*l|0})`;x.beginPath();x.moveTo(0,0);x.quadraticCurveTo(120*f,-9,245*f,4);x.quadraticCurveTo(120*f,6,0,5);x.fill();x.restore()}}}
  // tile 3 small-leaf shrub cluster
  cluster(512,512,60,70,22);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.generateMipmaps=true;return t
}

/* ---------- geometry builders ---------- */
class GB{constructor(){this.p=[];this.n=[];this.c=[];this.uv=[];this.w=[];this.tr=[];this.i=[]}
  v(p,n,c,u,v,w,tr){this.p.push(p.x,p.y,p.z);this.n.push(n.x,n.y,n.z);this.c.push(c.r,c.g,c.b);this.uv.push(u,v);this.w.push(w[0],w[1],w[2]);this.tr.push(tr);return this.p.length/3-1}
  geo(){const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(this.p,3));g.setAttribute("normal",new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute("color",new THREE.Float32BufferAttribute(this.c,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(this.uv,2));g.setAttribute("aWind",new THREE.Float32BufferAttribute(this.w,3));
    g.setAttribute("aTransl",new THREE.Float32BufferAttribute(this.tr,1));g.setIndex(this.i);g.computeBoundingSphere();g.computeBoundingBox();return g}}

/* recursive branching (Weber & Penn / SpeedTree style). Trunk is one continuous tapered
   tube (many rings, smooth radius curve — no stacked-log seams). Child branches use SpeedTree
   "welding": they sit on the parent skin with a flared collar (spread→radius over weld rings),
   unique random radius per twig, continuous bark UVs/normals. See VEGETATION.md. */
function grow(sp,seed){const R=rng(seed),out=[];
  const rec=(o,dir,len,rad,depth,ph,w0,wl,pr)=>{const n=sp.seg[depth],pts=[],rr=[],ws=[];let p,d=dir.clone().normalize();
    if(pr!=null){ // SpeedTree weld: start on parent skin, flare collar, then taper
      const weldN=4,weldLen=Math.max(rad*3.8,pr*.75),spread=Math.min(pr*.9,rad*2.7);
      const start=o.clone().addScaledVector(d,pr*.08); // sit just on/into the bark
      for(let i=0;i<=weldN;i++){const t=i/weldN,e=t*t*(3-2*t); // smoothstep
        pts.push(start.clone().addScaledVector(d,t*weldLen));
        // flare: spread at t=0 → rad at t=1 (slight overshoot mid-collar for organic web)
        rr.push(spread*(1-e)*(1-e)+rad*(1.18*e*(1-e)*2+e*e));
        ws.push(w0)}
      p=pts[pts.length-1].clone();
      for(let i=1;i<=n;i++){d.x+=(R()-.5)*sp.gnarl[depth];d.z+=(R()-.5)*sp.gnarl[depth];d.y+=sp.trop[depth];d.normalize();
        p=p.clone().addScaledVector(d,len/n);pts.push(p);
        const tip=Math.pow(i/n,1.1)*sp.taper[depth];rr.push(Math.max(sp.minR*.6,rad*(1-tip)));ws.push(w0+wl*(i/n))}
    }else{ // trunk: dense rings + power taper (reads as one continuous bole, not stacked logs)
      pts.push(o.clone());rr.push(rad*1.32);ws.push(w0);p=o.clone();
      for(let i=1;i<=n;i++){d.x+=(R()-.5)*sp.gnarl[depth];d.z+=(R()-.5)*sp.gnarl[depth];d.y+=sp.trop[depth];d.normalize();
        p=p.clone().addScaledVector(d,len/n);pts.push(p);
        const t=i/n,tip=Math.pow(t,1.2)*sp.taper[depth];
        rr.push(rad*(1-tip)*(1+(R()-.5)*.03));ws.push(w0+wl*t)}
    }
    const b={pts,rr,ws,depth,ph,weld:pr!=null?{pr,o:o.clone(),d:dir.clone().normalize()}:null};out.push(b);
    if(depth<sp.depth){const k=sp.kids[depth],o0=pr!=null?4:0; // kids spawn past the collar
      for(let j=0;j<k;j++){const t=sp.kStart[depth]+(1-sp.kStart[depth])*Math.min(.98,(j+R()*.6)/k);
        const fi=t*(pts.length-1-o0),i0=o0+Math.min(pts.length-2-o0,Math.floor(fi)),f=fi-(i0-o0);
        const at=pts[i0].clone().lerp(pts[i0+1],f),ar=rr[i0]+(rr[i0+1]-rr[i0])*f,aw=ws[i0]+(ws[i0+1]-ws[i0])*f;
        const pd=pts[i0+1].clone().sub(pts[i0]).normalize(),az=j*2.39996+R()*.7;
        const perp=new V3(1,0,0);if(Math.abs(pd.x)>.9)perp.set(0,0,1);perp.cross(pd).normalize().applyAxisAngle(pd,az);
        const ang=sp.angle[depth]*(.8+R()*.4),cd=pd.clone().multiplyScalar(Math.cos(ang)).addScaledVector(perp,Math.sin(ang)).normalize();
        const cl=len*sp.lenR[depth]*(1-sp.lenFall[depth]*t)*(.75+R()*.5);
        // unique random radius per twig (natural range), thicker near trunk via ar
        const radMul=sp.radR[depth]*(.5+R()*.95);
        rec(at,cd,cl,Math.max(sp.minR,ar*radMul),depth+1,depth===0?R()*6.28:ph,aw,cl*sp.flex[depth],ar)}}};
  rec(new V3(0,-.3,0),new V3(0,1,0),sp.H,sp.R0,0,0,0,sp.flex0,null);return out}

function tubes(gb,branches,H,col,sides){const tmp=new V3(),nrm=new V3(),bin=new V3(),tan=new V3(),wpos=new V3();
  for(const b of branches){const S=sides[Math.min(b.depth,sides.length-1)],base=gb.p.length/3,P=b.pts;
    // continuous bark UVs: U tiles by circumference (texel density), V = arc length keeping aspect (SpeedTree Relative)
    const rRef=b.rr[Math.min(1,b.rr.length-1)],uTiles=Math.max(.5,rRef*2*Math.PI/.42),vScale=uTiles/(2*Math.PI*Math.max(rRef,.01));
    let ref=new V3(1,0,0),vacc=0;
    const weldN=b.weld?4:0,pr=b.weld?b.weld.pr:0,po=b.weld?b.weld.o:null;
    for(let i=0;i<P.length;i++){tan.copy(i<P.length-1?P[i+1]:P[i]).sub(i<P.length-1?P[i]:P[i-1]).normalize();
      if(i>0)vacc+=P[i].distanceTo(P[i-1]);
      bin.crossVectors(tan,ref);if(bin.lengthSq()<1e-4){ref.set(0,0,1);bin.crossVectors(tan,ref)}bin.normalize();nrm.crossVectors(bin,tan).normalize();ref.copy(nrm);
      const r=b.rr[i],ao=.72+.28*Math.min(1,Math.max(0,P[i].y)/2.2),c={r:col.r*ao,g:col.g*ao,b:col.b*ao};
      const wt=weldN?Math.min(1,i/weldN):1; // 0 at collar → 1 past weld
      for(let s=0;s<=S;s++){const a=s/S*Math.PI*2;tmp.copy(nrm).multiplyScalar(Math.cos(a)).addScaledVector(bin,Math.sin(a)).normalize();
        wpos.copy(P[i]).addScaledVector(tmp,r);
        let nn=tmp.clone();
        if(b.weld&&i<=weldN&&po){ // project toward parent cylinder skin; blend normals (SpeedTree light-seam reduction)
          const ax=po,to=wpos.clone().sub(ax);to.y=0; // parent axis ~ vertical at attach for weld
          const flat=to.length();if(flat>1e-5){to.multiplyScalar(1/flat);const onSkin=ax.clone().addScaledVector(to,pr);onSkin.y=wpos.y;
            const e=wt*wt*(3-2*wt);wpos.lerpVectors(onSkin,wpos,e);nn.lerpVectors(to,tmp,e).normalize()}}
        gb.v(wpos.clone(),nn,c,(s/S)*uTiles,vacc*vScale,[b.ws[i],b.ph,Math.max(0,P[i].y)/H],0)}}
    for(let i=0;i<P.length-1;i++)for(let s=0;s<S;s++){const a=base+i*(S+1)+s,bb=a+S+1;gb.i.push(a,a+1,bb,a+1,bb+1,bb)}}}

function card(gb,c,ax,ay,w,h,tile,nrm,col,wind,anchorBottom,nf){const [u0,v0]=TILE[tile],base=gb.p.length/3;
  const corners=anchorBottom?[[-.5,0],[.5,0],[.5,1],[-.5,1]]:[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]];
  for(const [sx,sy] of corners){const p=c.clone().addScaledVector(ax,sx*w).addScaledVector(ay,sy*h);gb.v(p,nf?nf(p):nrm,col,u0+(sx+.5)*.5,v0+(anchorBottom?sy:(sy+.5))*.5,wind,1)}
  gb.i.push(base,base+1,base+2,base,base+2,base+3)}

const SPECS={
  broad:{H:3.6,R0:.24,depth:3,seg:[14,5,4,3],gnarl:[.08,.32,.48,.55],trop:[0,.1,.1,.05],taper:[.42,.58,.68,.78],kids:[5,4,3],kStart:[.48,.18,.22],angle:[.85,.75,.7],
    lenR:[.72,.6,.55],lenFall:[.5,.4,.3],radR:[.55,.58,.62],minR:.01,flex0:.0,flex:[.10,.16,.2],leafDepth:2,leafPer:3,leaf:[.85,.85],tile:0,leafAll:true},
  conifer:{H:6.2,R0:.2,depth:1,seg:[14,4],gnarl:[.02,.14],trop:[0,-.06],taper:[.9,.78],kids:[26],kStart:[.22],angle:[1.45],lenR:[.42],lenFall:[.92],radR:[.32],minR:.012,flex0:.0,flex:[.14],leafDepth:1,leafPer:5,leaf:[1.5,1.1],tile:1},
  dead:{H:3.6,R0:.22,depth:2,seg:[12,5,3],gnarl:[.14,.45,.55],trop:[0,.05,.02],taper:[.55,.65,.75],kids:[5,3],kStart:[.38,.28],angle:[.9,.8],lenR:[.6,.55],lenFall:[.4,.3],radR:[.48,.52],minR:.012,flex0:0,flex:[.06,.1]}
};
function treeGeo(type){const sp=SPECS[type],R=rng(type.length*991+7);
  const br=grow(sp,type==="broad"?4242:type==="conifer"?1717:913);
  let H=0;for(const b of br)for(const p of b.pts)H=Math.max(H,p.y);
  const barkCol=type==="conifer"?srgb(.6,.47,.38):type==="dead"?srgb(.6,.57,.52):srgb(.62,.56,.48);
  const tg=new GB();tubes(tg,br,H,barkCol,type==="conifer"?[9,4]:[10,6,4,3]);
  let crown=null;
  if(sp.leaf){const cg=new GB();const ctr=new V3(0,type==="conifer"?H*.5:H*.72,0),tmp=new V3(),ax=new V3(),ay=new V3(),nm=new V3();
    for(const b of br){if(b.depth<sp.leafDepth)continue;const P=b.pts;
      for(let i=1;i<P.length;i++){const dir=P[i].clone().sub(P[i-1]).normalize();
        for(let k=0;k<sp.leafPer;k++){const t=(k+R())/sp.leafPer,c=P[i-1].clone().lerp(P[i],t);
          if(type==="conifer"){ // sprig lying along the branch, faces up; second card crossed for volume
            const f=1-Math.min(1,c.y/H)*.6;ax.copy(dir).setY(0).normalize();ay.set(-ax.z,0,ax.x);
            nm.copy(c).sub(ctr).setY(0).normalize().multiplyScalar(.6).add(new V3(0,.8,0)).normalize();
            const sh=.75+.25*Math.min(1,c.y/H)+R()*.15,col={r:sh,g:sh,b:sh},w=[b.ws[i],b.ph,c.y/H];
            const az=ay.clone().multiplyScalar(.93).add(new V3(0,.37,0)).normalize(),pos=c.clone().addScaledVector(ax,sp.leaf[0]*.35*f);
            card(cg,pos,ax.clone().multiplyScalar(f),az,sp.leaf[0],sp.leaf[1]*f,1,nm,col,w,false);
            if(k===0)card(cg,pos,ax.clone().multiplyScalar(f),new V3(0,1,0).addScaledVector(ay,.3).normalize(),sp.leaf[0],sp.leaf[1]*.7*f,1,nm,col,w,false);
          }else{ // broadleaf: a cluster of 3 crossed small cards scattered in 3D around the twig, bent normals = mix of
                 // cluster-sphere and crown-sphere normals so it shades like a soft volume from any angle
            if(k>=sp.leafPer-1&&i<P.length-1)continue;
            const cc=c.clone().add(new V3(R()-.5,R()-.5,R()-.5).multiplyScalar(.35));
            nm.copy(cc).sub(ctr).normalize();
            const out=Math.min(1,cc.distanceTo(ctr)/(H*.45)),fl=R(),w=[b.ws[i]+.05,fl*6.283,cc.y/H];
            const nf=p=>{const a=p.clone().sub(cc).normalize(),q=p.clone().sub(ctr).normalize();return a.multiplyScalar(.55).addScaledVector(q,.6).add(new V3(0,.18,0)).normalize()};
            for(let q=0;q<3;q++){tmp.set(R()-.5,R()-.5,R()-.5).normalize();
              const base=q===0?nm:q===1?new V3(0,1,0):tmp.clone().cross(nm).normalize();
              ax.crossVectors(base,tmp).normalize();ay.crossVectors(base,ax).normalize();if(ay.y<0)ay.negate();
              const sh=.6+.4*out+R()*.12,col={r:sh,g:sh*(.96+R()*.08),b:sh*.95},sz=sp.leaf[0]*(.5+R()*.25);
              card(cg,cc.clone().addScaledVector(nm,.06*q),ax,ay,sz,sz,sp.tile,nm,col,w,false,nf)}}}}}
    crown=cg.geo()}
  return {trunk:tg.geo(),crown,H}}

function palmGeo(){const R=rng(31),tg=new GB(),H=5.2,pts=[],rr=[],ws=[];
  for(let i=0;i<=10;i++){const t=i/10;pts.push(new V3(Math.sin(t*1.4)*.9*t,-.3+t*H,0));rr.push(.2*(1-t*.35)*(1+.08*((i%2))));ws.push(0)}
  tubes(tg,[{pts,rr,ws,depth:0,ph:0}],H,srgb(.55,.48,.38),[8]);
  const cg=new GB(),top=pts[10];
  for(let f=0;f<9;f++){const az=f/9*Math.PI*2+R()*.3,dir=new V3(Math.cos(az),0,Math.sin(az)),side=new V3(-dir.z,0,dir.x),L=2.6+R()*.6,ph=R()*6.28,base=cg.p.length/3,N=7;
    for(let i=0;i<=N;i++){const t=i/N,droop=-(t*t)*1.9+t*.9*(.6+R()*.1),p=top.clone().addScaledVector(dir,t*L).add(new V3(0,droop,0)),w=(.15+Math.sin(Math.PI*Math.min(1,t*1.1))*.85)*.95;
      const tn=new V3(0,1,0).addScaledVector(dir,-(-2*t*1.9+.9)*.3).normalize();const sh=.85+t*.15,col={r:sh,g:sh,b:sh};
      for(const s of [-1,1]){const q=p.clone().addScaledVector(side,s*w).add(new V3(0,-Math.abs(s)*w*.25,0));cg.v(q,tn,col,s<0?0:.5,t*.5*.999,[t*L*.08,ph,q.y/H],1)}}
    for(let i=0;i<N;i++){const a=base+i*2;cg.i.push(a,a+1,a+2,a+1,a+3,a+2)}}
  return {trunk:tg.geo(),crown:cg.geo(),H}}

function shrubGeo(){const R=rng(55),g=new GB(),ctr=new V3(0,.55,0),nm=new V3(),tmp=new V3(),ax=new V3(),ay=new V3();
  for(let i=0;i<26;i++){const c=new V3((R()-.5)*1.4,.15+R()*.9,(R()-.5)*1.4);nm.copy(c).sub(ctr).normalize();tmp.set(R()-.5,R()-.5,R()-.5).normalize();ax.crossVectors(nm,tmp).normalize();ay.crossVectors(nm,ax).normalize();if(ay.y<0)ay.negate();
    const sh=.6+.4*Math.min(1,c.distanceTo(ctr)/.8);card(g,c,ax,ay,.75,.75,3,nm.clone().add(new V3(0,.3,0)).normalize(),{r:sh,g:sh,b:sh},[.05+c.y*.04,R()*6.28,c.y/1.4],false)}
  return g.geo()}

/* grass clump: 7 blades x 6 levels, positions computed in the vertex shader (Bezier per blade) */
function grassGeo(){const R=rng(5),B=7,L=6,p=[],bl=[],rt=[],col=[],idx=[];
  // tall expressive blades + a ring of tiny short under-blades (Tsushima-style dense ground cover)
  for(let b=0;b<B+5;b++){const short=b>=B,r=b===0?0:(short?.04+R()*.14:.06+R()*.2),a=R()*6.283,bx=Math.cos(a)*r,bz=Math.sin(a)*r,face=R()*6.283,hm=short?.07+R()*.1:.36+R()*.36,rnd=R(),base=p.length/3,Lv=short?3:L;
    for(let l=0;l<Lv;l++){const t=l/(Lv-1);for(const s of [-1,1]){p.push(bx+s*.02,t*hm*.6,bz);bl.push(t,s,b,rnd);rt.push(bx,bz,face,hm);
      const dry=rnd>.8?1:0;col.push(...[.20+t*.26+dry*.16,.34+t*.32+dry*.06,.10+t*.10].map(v=>Math.pow(v,2.2)*1.6))}}
    for(let l=0;l<Lv-1;l++){const a=base+l*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(p,3));g.setAttribute("normal",new THREE.Float32BufferAttribute(p.map((v,i)=>i%3===1?1:0),3));
  g.setAttribute("aBlade",new THREE.Float32BufferAttribute(bl,4));g.setAttribute("aRoot",new THREE.Float32BufferAttribute(rt,4));g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  g.setIndex(idx);g.boundingSphere=new THREE.Sphere(new V3(0,.4,0),1.2);return g}

/* flower: curved stem, two leaves, 6 cupped spoon-shaped petals, domed centre; aPetal tints only petals */
function flowerGeo(){const R=rng(9),parts=[],stemH=.36;
  const mk=(pos,nrm,colr,pet,idx)=>{const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("normal",new THREE.Float32BufferAttribute(nrm,3));
    g.setAttribute("color",new THREE.Float32BufferAttribute(colr,3));g.setAttribute("aPetal",new THREE.Float32BufferAttribute(pet,1));g.setIndex(idx);return g};
  {const pos=[],nrm=[],c=[],pe=[],idx=[],S=4,N=5;for(let i=0;i<=N;i++){const t=i/N,cx=Math.sin(t*1.2)*.03,y=t*stemH;for(let s=0;s<=S;s++){const a=s/S*6.283;pos.push(cx+Math.cos(a)*.008,y,Math.sin(a)*.008);nrm.push(Math.cos(a),0,Math.sin(a));c.push(.09,.2,.05);pe.push(0)}}
    for(let i=0;i<N;i++)for(let s=0;s<S;s++){const a=i*(S+1)+s,b=a+S+1;idx.push(a,b,a+1,a+1,b,b+1)}parts.push(mk(pos,nrm,c,pe,idx))}
  for(const [ang,h] of [[.4,.06],[3.6,.12]]){const pos=[],nrm=[],c=[],pe=[],idx=[],dx=Math.cos(ang),dz=Math.sin(ang);for(let i=0;i<=4;i++){const t=i/4,w=Math.sin(Math.PI*t)*.025,l=t*.13;for(const s of [-1,1]){pos.push(dx*l-dz*w*s,h+t*.05-t*t*.06,dz*l+dx*w*s);nrm.push(0,1,0);c.push(.07,.17,.04);pe.push(0)}}
    for(let i=0;i<4;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}parts.push(mk(pos,nrm,c,pe,idx))}
  {const pos=[],nrm=[],c=[],pe=[],idx=[],P=6,top=new V3(Math.sin(1.2)*.03,stemH,0);
    for(let k=0;k<P;k++){const az=k/P*6.283+R()*.2,dx=Math.cos(az),dz=Math.sin(az),base=pos.length/3;
      for(let i=0;i<=3;i++){const t=i/3,l=t*.075,w=Math.sin(Math.PI*Math.min(1,t*.85+.1))*.026*(t<.2?.5:1),lift=t*t*.035+t*.012;
        for(const s of [-1,1]){const cup=s*s*w*w*6;pos.push(top.x+dx*l-dz*w*s,top.y+lift+cup,top.z+dz*l+dx*w*s);const n=new V3(-dx*t*.6,1,-dz*t*.6).normalize();nrm.push(n.x,n.y,n.z);c.push(1,1,1);pe.push(1)}}
      for(let i=0;i<3;i++){const a=base+i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}}
    const cb=pos.length/3;pos.push(top.x,top.y+.022,top.z);nrm.push(0,1,0);c.push(.55,.38,.06);pe.push(0);
    for(let s=0;s<8;s++){const a=s/8*6.283;pos.push(top.x+Math.cos(a)*.016,top.y+.008,top.z+Math.sin(a)*.016);nrm.push(Math.cos(a)*.5,1,Math.sin(a)*.5);c.push(.45,.3,.04);pe.push(0)}
    for(let s=0;s<8;s++)idx.push(cb,cb+1+(s+1)%8,cb+1+s);parts.push(mk(pos,nrm,c,pe,idx))}
  const g=mergeGeometries(parts.map(p=>p.toNonIndexed()));g.computeBoundingSphere();return g}

/* ---------- materials ---------- */
function windVertex(sh,leaf){sh.uniforms.uTime=CTX.U.time;sh.uniforms.uWind=CTX.U.wind;
  sh.vertexShader=WIND_GLSL+"attribute vec3 aWind;attribute float aTransl;varying float vTransl;\n"+sh.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
  vTransl=aTransl;
  vec3 ip=vec3(instanceMatrix[3][0],instanceMatrix[3][1],instanceMatrix[3][2]);
  float g=vg_gust(ip.xz),str=uWind*(.35+1.1*g);
  float hn=aWind.z;                                     // trunk: whole-tree bend grows with height^2
  float main=hn*hn*str*(.22+.07*sin(uTime*.9+ip.x*.07+ip.z*.05));
  transformed.xz+=VG_WDIR*main*position.y*.12;
  transformed.y-=main*main*position.y*.004;
  float ph=ip.x*.13+ip.z*.11+dot(position,vec3(.45,.25,.55));   // spatially smooth phase: child branches move with their parent at the collar
  vec3 sway=vec3(sin(uTime*1.9+ph),.45*sin(uTime*2.6+ph*1.3),cos(uTime*1.6+ph))*aWind.x*str*.55;
  transformed+=sway;
  ${leaf?`float lp=aWind.y;   // per-cluster random phase: each cluster flutters on its own, faster in gusts
  float fq=6.5+2.5*fract(lp*7.13);
  float fl=sin(uTime*fq+lp+dot(position,vec3(2.1,1.7,2.9)))*.6+sin(uTime*fq*1.73+lp*2.)*.3;
  vec3 tw=vec3(sin(uTime*fq*.8+lp*3.),0.,cos(uTime*fq*.9+lp*5.));
  transformed+=(normal*fl*.06+tw*.025)*(.25+str)*aTransl;`:""}`);
  sh.fragmentShader="varying float vTransl;\n"+sh.fragmentShader}
function leafMaterial(map){const m=new THREE.MeshStandardMaterial({vertexColors:true,map,alphaTest:.42,side:THREE.DoubleSide,roughness:.72,metalness:0});
  m.onBeforeCompile=sh=>{windVertex(sh,true);sh.fragmentShader=sh.fragmentShader.replace("#include <lights_fragment_begin>",TRANSL(.9))
    .replace("#include <normal_fragment_begin>","#include <normal_fragment_begin>\n normal=normalize(vNormal);")};
  m.customProgramCacheKey=()=>"vgleaf";return m}

export function initVegetation(ctx){CTX=ctx;const {GEO,MAT,U}=ctx;
  const bark=barkTextures(),atlas=leafAtlas();CTX.atlas=atlas;CTX.bark=bark;
  MAT.treeBark=new THREE.MeshStandardMaterial({vertexColors:true,map:bark.color,normalMap:bark.normal,normalScale:new THREE.Vector2(1.6,1.6),roughness:.95});
  MAT.treeBark.onBeforeCompile=sh=>{windVertex(sh,false);   // skylight under the canopy: a trunk in crown shade still reads as brown bark, not a black pole
    sh.fragmentShader=sh.fragmentShader.replace("#include <aomap_fragment>","#include <aomap_fragment>\n reflectedLight.indirectDiffuse*=1.9;")};MAT.treeBark.customProgramCacheKey=()=>"vgbark";
  MAT.treeLeaf=leafMaterial(atlas);
  const br=treeGeo("broad"),co=treeGeo("conifer"),de=treeGeo("dead"),pa=palmGeo();
  GEO.broadTrunk=br.trunk;GEO.broadCrown=br.crown;GEO.pineTrunk=co.trunk;GEO.pineCrown=co.crown;GEO.deadTrunk=de.trunk;GEO.palmTrunk=pa.trunk;GEO.palmCrown=pa.crown;
  CTX.trees={broad:br,conifer:co,dead:de,palm:pa};
  GEO.bush=shrubGeo();MAT.bush=MAT.treeLeaf;
  GEO.grass=grassGeo();GEO.flower=flowerGeo();
  MAT.grass=grassMaterial();MAT.flower=flowerMaterial();
  const tris=g=>g?(g.index?g.index.count:g.attributes.position.count)/3:0;
  CTX.stats={broad:tris(br.trunk)+tris(br.crown),conifer:tris(co.trunk)+tris(co.crown),palm:tris(pa.trunk)+tris(pa.crown),dead:tris(de.trunk),grassClump:tris(GEO.grass),flower:tris(GEO.flower)};
  return CTX.stats}

function grassMaterial(){const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.62,side:THREE.DoubleSide,metalness:0});
  m.onBeforeCompile=sh=>{const U=CTX.U;sh.uniforms.uTime=U.time;sh.uniforms.uWind=U.wind;sh.uniforms.uFar=U.grassFar;
    sh.vertexShader=WIND_GLSL+"uniform float uFar;attribute vec4 aBlade;attribute vec4 aRoot;varying float vTransl;varying float vT;\n"+sh.vertexShader
     .replace("#include <beginnormal_vertex>",`
  vec3 ip=vec3(instanceMatrix[3][0],instanceMatrix[3][1],instanceMatrix[3][2]);
  float t=aBlade.x,side=aBlade.y,bid=aBlade.z,rnd=aBlade.w;
  float ih=vg_h(ip.xz),h=aRoot.w*(.8+.4*rnd);
  float face=aRoot.z+ih*6.283;vec2 f=vec2(cos(face),sin(face));
  vec2 root=aRoot.xy;vec2 outw=length(root)>1e-3?normalize(root):vec2(cos(ih*40.),sin(ih*40.));
  float g=vg_gust(ip.xz+root*4.);
  float wk=uWind*(.12+1.05*g*g);
  float flick=sin(uTime*(3.+rnd*2.)+rnd*6.283+ip.x*.7+ip.z*.5)*(.05+.12*g)*uWind;
  vec2 lean=outw*(.18+.32*rnd)+VG_WDIR*wk*.95+f*flick;
  float ll=length(lean);float ty=h*sqrt(max(.05,1.-min(.9,ll*ll*.55)));
  vec3 P0=vec3(root.x,0.,root.y),P2=P0+vec3(lean.x*h,ty,lean.y*h),P1=P0+vec3(0.,ty*.72,0.)+vec3(lean.x,0.,lean.y)*h*.22;
  vec3 pos=mix(mix(P0,P1,t),mix(P1,P2,t),t);
  vec3 tng=normalize(2.*(1.-t)*(P1-P0)+2.*t*(P2-P1));
  vec3 sd=vec3(-f.y,0.,f.x);
  float wid=.024*(1.-t*.92)*(.8+.4*rnd);
  float dc=distance(ip.xz,cameraPosition.xz);
  float keep=bid<2.?1.:bid<4.?1.-smoothstep(uFar*.5,uFar*.65,dc):1.-smoothstep(uFar*.3,uFar*.45,dc);
  wid*=1.+smoothstep(uFar*.3,uFar*.7,dc)*1.6;   // far blades get wider to keep coverage
  pos+=sd*side*wid;
  pos*=keep*(1.-smoothstep(uFar*.62,uFar,dc));
  vec3 objectNormal=normalize(cross(sd,tng));
  if(objectNormal.y<0.)objectNormal=-objectNormal;
  objectNormal=normalize(objectNormal+sd*side*.45+vec3(0.,.35,0.));
  vT=t;vTransl=1.;
  #ifdef USE_TANGENT
   vec3 objectTangent=vec3(1,0,0);
  #endif`).replace("#include <begin_vertex>","vec3 transformed=pos;");
    sh.fragmentShader="varying float vTransl;varying float vT;\n"+sh.fragmentShader
     .replace("#include <lights_fragment_begin>",CTX.GRASS_LIGHTS+TRANSL(.75).replace("#include <lights_fragment_begin>",""))
     .replace("#include <aomap_fragment>","#include <aomap_fragment>\n reflectedLight.indirectDiffuse*=.45+.55*vT;")};
  m.customProgramCacheKey=()=>"vggrass";return m}

function flowerMaterial(){const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,side:THREE.DoubleSide,metalness:0});
  m.onBeforeCompile=sh=>{const U=CTX.U;sh.uniforms.uTime=U.time;sh.uniforms.uWind=U.wind;sh.uniforms.uFar=U.grassFar;
    sh.vertexShader=WIND_GLSL+"uniform float uFar;attribute float aPetal;varying float vTransl;\n"+sh.vertexShader
     .replace("#include <color_vertex>",`vColor=vec4(color,1.).rgb;
  #ifdef USE_INSTANCING_COLOR
   vColor.rgb=mix(color,instanceColor.rgb,aPetal);
  #endif
  vTransl=aPetal*.8+.2;`)
     .replace("#include <begin_vertex>",`#include <begin_vertex>
  vec3 ip=vec3(instanceMatrix[3][0],instanceMatrix[3][1],instanceMatrix[3][2]);
  float g=vg_gust(ip.xz),k=pow(max(position.y,0.)/.36,2.)*uWind*(.25+.9*g);
  float ph=uTime*2.4+ip.x*.9+ip.z*.7;
  transformed.xz+=(VG_WDIR*(.06+.05*sin(ph))+vec2(cos(ph*1.3),sin(ph*.9))*.025)*k;
  transformed.y-=k*k*.01;`)
     .replace("#include <color_pars_vertex>","varying vec3 vColor;");
    sh.fragmentShader="varying float vTransl;\n"+sh.fragmentShader.replace("#include <lights_fragment_begin>",TRANSL(.8))};
  m.customProgramCacheKey=()=>"vgflower";return m}

/* ---------- impostors: each tree type baked once into an RGBA target, drawn as 3 crossed alpha quads ---------- */
const IMP={};
export function impostor(type,renderer){if(IMP[type]!==undefined)return IMP[type];
  const T=CTX&&CTX.trees&&CTX.trees[type==="conifer"?"conifer":type];if(!T||!renderer)return IMP[type]=null;
  const box=new THREE.Box3();T.trunk.computeBoundingBox();box.copy(T.trunk.boundingBox);if(T.crown){T.crown.computeBoundingBox();box.union(T.crown.boundingBox)}
  const W=Math.max(box.max.x-box.min.x,box.max.z-box.min.z)*1.04,H=box.max.y-box.min.y,y0=box.min.y,cx=(box.max.x+box.min.x)/2,cz=(box.max.z+box.min.z)/2;
  const RW=256,RH=Math.min(512,Math.round(256*H/W/32)*32||256),rt=new THREE.WebGLRenderTarget(RW*3,RH,{samples:0});rt.texture.colorSpace=THREE.SRGBColorSpace;
  const sc=new THREE.Scene(),cam=new THREE.OrthographicCamera(-W/2,W/2,H,0,.1,200);
  const bm=new THREE.MeshBasicMaterial({vertexColors:true,map:CTX.bark.color,fog:false}),lm=new THREE.MeshBasicMaterial({vertexColors:true,map:CTX.atlas,alphaTest:.42,side:THREE.DoubleSide,fog:false});
  const g=new THREE.Group();g.add(new THREE.Mesh(T.trunk,bm));if(T.crown)g.add(new THREE.Mesh(T.crown,lm));g.position.set(-cx,-y0,-cz);const holder=new THREE.Group();holder.add(g);sc.add(holder);
  const prevRT=renderer.getRenderTarget(),pc=new THREE.Color();renderer.getClearColor(pc);const pa=renderer.getClearAlpha(),pt=renderer.toneMapping;
  const pAuto=renderer.autoClear;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(type==="dead"?0x4a4038:0x26361a,0);renderer.setRenderTarget(rt);renderer.clear();renderer.autoClear=false;
  cam.position.set(0,0,100);cam.lookAt(0,0,0);cam.updateMatrixWorld();
  for(let v=0;v<3;v++){holder.rotation.y=v*Math.PI/3;holder.updateMatrixWorld(true);
    rt.viewport.set(v*RW,0,RW,RH);rt.scissor.set(v*RW,0,RW,RH);rt.scissorTest=true;renderer.setRenderTarget(rt);renderer.render(sc,cam)}
  rt.viewport.set(0,0,RW*3,RH);rt.scissorTest=false;renderer.autoClear=pAuto;renderer.setRenderTarget(prevRT);renderer.setClearColor(pc,pa);renderer.toneMapping=pt;
  bm.dispose();lm.dispose();
  // geometry: 3 quads at 0/60/120 deg, each sampling its own third of the texture
  const gb=new GB();
  for(let v=0;v<3;v++){const a=-v*Math.PI/3,ax=new V3(Math.cos(a),0,-Math.sin(a)),base=gb.p.length/3;
    for(const [sx,sy] of [[-.5,0],[.5,0],[.5,1],[-.5,1]]){const p=new V3(cx,y0,cz).addScaledVector(ax,sx*W).add(new V3(0,sy*H,0));
      const n=ax.clone().multiplyScalar(sx*1.2).add(new V3(0,.9,0)).normalize();gb.v(p,n,{r:1,g:1,b:1},(v+sx+.5)/3,sy,[0,0,Math.max(0,p.y)/H],1)}
    gb.i.push(base,base+1,base+2,base,base+2,base+3)}
  const geo=gb.geo();
  const mat=new THREE.MeshStandardMaterial({map:rt.texture,alphaTest:.5,side:THREE.DoubleSide,roughness:.85,metalness:0});
  mat.onBeforeCompile=sh=>{windVertex(sh,false);sh.fragmentShader=sh.fragmentShader.replace("#include <lights_fragment_begin>",TRANSL(.5))};mat.customProgramCacheKey=()=>"vgimp";
  return IMP[type]={geo,mat}}
export const stats=()=>CTX&&CTX.stats;
