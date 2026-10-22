/* Fog of Knowledge: The Game — procedural hand-built woodland buildings (original, CC0).
 * Everything is generated: irregular bark-covered logs with axe-cut end grain, fieldstones, woven wattle,
 * coursed thatch, bark slabs, sod with grass cards, hand-smoothed cob with straw and hairline cracks,
 * moss, fur and feathers. Textures are DataTextures (no DOM, so this runs under Node for tests) and are
 * shared by every building; geometry is merged into one mesh per (stage, material) so a house costs a few
 * dozen draw calls. Each stage's parts are appended bottom-up and revealed with drawRange as materials
 * are delivered. Interior surfaces carry a per-vertex `ao` attribute that darkens only the INDIRECT
 * (sky/ambient) light, so a closed room is dim by day but a fire (direct light) still lights it fully.
 * Local frame: +z is the front (door), y up from the site's ground level; sizes are metres.
 */
import * as T from "./vendor/three.module.min.js";
import {HUT,HOUSE,HUT_STAGES,HOUSE_STAGES,WHEELSITE} from "./woodland-progression.js?v=3.28.0";
import {WHEEL} from "./waterwheel.js?v=3.28.0";

/* ---------------- deterministic noise ---------------- */
function rng(seed){let s=(seed*2654435761)>>>0||1;return()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296}
const LAT=(()=>{const r=rng(9173),a=new Float32Array(65536);for(let i=0;i<a.length;i++)a[i]=r();return a})();
const fract=x=>x-Math.floor(x),sstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},mix=(a,b,t)=>a+(b-a)*t;
// periodic 2D value noise (period px,py ≤ 256)
function pn(x,y,px,py,s=0){const X=Math.floor(x),Y=Math.floor(y),fx=x-X,fy=y-Y,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
 const x0=((X%px)+px)%px,x1=(x0+1)%px,y0=((Y%py)+py)%py,y1=(y0+1)%py,o=(s*97)&255,q=(s*41)&255;
 const L=(i,j)=>LAT[(((j+q)&255)<<8)|((i+o)&255)];
 return (L(x0,y0)*(1-u)+L(x1,y0)*u)*(1-v)+(L(x0,y1)*(1-u)+L(x1,y1)*u)*v}
function fb(u,v,pu,pv,oct,s){let a=.5,r=0,n=0;for(let i=0;i<oct;i++){const f=1<<i;r+=a*pn(u*pu*f,v*pv*f,pu*f,pv*f,s+i*13);n+=a;a*=.5}return r/n}
function h3(x,y,z,s){let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(z|0,1440662683)+Math.imul(s|0,1274126177))|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296}
function n3(x,y,z,s=0){const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z),fx=x-X,fy=y-Y,fz=z-Z,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),w=fz*fz*(3-2*fz);
 const c=(i,j,k)=>h3(X+i,Y+j,Z+k,s);
 return mix(mix(mix(c(0,0,0),c(1,0,0),u),mix(c(0,1,0),c(1,1,0),u),v),mix(mix(c(0,0,1),c(1,0,1),u),mix(c(0,1,1),c(1,1,1),u),v),w)}

/* ---------------- textures ---------------- */
const cl=v=>v<0?0:v>255?255:v;
function dtex(d,w,h,srgb){const t=new T.DataTexture(d,w,h);t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;if(srgb)t.colorSpace=T.SRGBColorSpace;t.needsUpdate=true;return t}
// fn(u,v,o,x,y) writes o=[r,g,b,height,alpha]
function makeTex(w,h,fn,{alpha=false,normal=0}={}){const d=new Uint8Array(w*h*4),H=normal?new Float32Array(w*h):null,o=[0,0,0,0,255];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){o[3]=0;o[4]=255;fn(x/w,y/h,o,x,y);const i=(y*w+x)*4;d[i]=cl(o[0]);d[i+1]=cl(o[1]);d[i+2]=cl(o[2]);d[i+3]=alpha?cl(o[4]):255;if(H)H[y*w+x]=o[3]}
 const map=dtex(d,w,h,true);let nrm=null;
 if(H){const nd=new Uint8Array(w*h*4),at=(x,y)=>H[((y+h)%h)*w+((x+w)%w)];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const dx=(at(x+1,y)-at(x-1,y))*normal,dy=(at(x,y+1)-at(x,y-1))*normal,l=Math.hypot(dx,dy,1),i=(y*w+x)*4;
   nd[i]=(-dx/l*.5+.5)*255;nd[i+1]=(-dy/l*.5+.5)*255;nd[i+2]=(1/l*.5+.5)*255;nd[i+3]=255}
  nrm=dtex(nd,w,h,false)}
 return {map,nrm}}
// overlay mask helpers (wrap-around drawing) for straw, pebbles, blades
function lineInto(M,w,h,x0,y0,x1,y1,width,val){const n=Math.ceil(Math.hypot(x1-x0,y1-y0))+1;for(let k=0;k<=n;k++){const t=k/n,x=x0+(x1-x0)*t,y=y0+(y1-y0)*t;
  for(let dy=-width;dy<=width;dy++)for(let dx=-width;dx<=width;dx++){if(dx*dx+dy*dy>width*width+.5)continue;const xi=((Math.round(x+dx)%w)+w)%w,yi=((Math.round(y+dy)%h)+h)%h;M[yi*w+xi]=Math.max(M[yi*w+xi],val)}}}
function voronoi(u,v,n,s){// periodic F1,F2 on an n×n cell lattice
 const x=u*n,y=v*n,X=Math.floor(x),Y=Math.floor(y);let f1=9,f2=9;
 for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const cx=X+i,cy=Y+j,wx=((cx%n)+n)%n,wy=((cy%n)+n)%n,px=cx+h3(wx,wy,1,s),py=cy+h3(wx,wy,2,s),d=Math.hypot(px-x,py-y);if(d<f1){f2=f1;f1=d}else if(d<f2)f2=d}
 return [f1,f2]}
let TEX=null;
export function woodTextures(){if(TEX)return TEX;
 // bark: vertical plates split by fissures, horizontal breaks, fine fibres, lichen patches
 const bark=makeTex(256,512,(u,v,o)=>{const w=u*9+.55*fb(u,v,2,2,3,1),f=fract(w),plate=Math.pow(Math.sin(Math.PI*f),.42),brk=pn(u*9,v*7,9,7,3),
   fine=fb(u,v,32,64,2,5),hh=plate*(.72+.28*brk)*(1-.55*sstep(.66,.74,pn(u*18,v*11,18,11,8)))*.75+.25*fine,lich=sstep(.6,.74,fb(u,v,3,6,3,9))*sstep(.45,.7,hh);
   o[0]=mix(74,184,hh)+lich*24;o[1]=mix(54,142,hh)+lich*32;o[2]=mix(36,98,hh)+lich*16;o[3]=hh},{normal:4});
 // peeled / split wood: fibres along v, growth streaks, a few knots, weathering
 const wood=makeTex(128,512,(u,v,o)=>{const ww=u+.04*fb(u,v,2,1,2,3),g=.3*Math.pow(.5+.5*Math.sin(ww*Math.PI*2*11+3*pn(u*8,v*2,8,2,4)),4)+.45*fb(u,v,64,2,3,5)+.25*pn(u*128,v*24,128,24,9),
   knot=sstep(.86,.92,pn(u*3,v*10,3,10,12)),wea=fb(u,v,2,4,2,7);const g2=g*(1-.6*knot);
   o[0]=mix(206,150,g2)-wea*34-knot*50;o[1]=mix(172,120,g2)-wea*26-knot*44;o[2]=mix(128,88,g2)-wea*14-knot*34;o[3]=g-knot*.5},{normal:2.5});
 // end grain: growth rings, pith, radial checks, sapwood and a bark rim
 const end=makeTex(256,256,(u,v,o)=>{const x=u-.5+.03*(pn(u*4,v*4,4,4,21)-.5),y=v-.5,r=Math.hypot(x,y)*2,a=Math.atan2(y,x),warp=.05*fb(u,v,6,6,2,23),
   ring=Math.pow(.5+.5*Math.sin((r+warp)*Math.PI*2*13),3),chk=r>.12&&r<.9&&(Math.abs(Math.sin(a*2.5+1.3+warp*12))<.025*(1.4-r)||Math.abs(Math.sin(a*1.5+.4))<.012),
   saw=sstep(.62,.8,r),rim=sstep(.86,.9,r),fine=pn(u*96,v*96,96,96,24),age=fb(u,v,4,4,3,25);
   let R=mix(214,182,ring)-saw*14,G=mix(176,144,ring)-saw*10,B=mix(128,98,ring)-saw*4;R-=age*40;G-=age*36;B-=age*28;
   if(chk){R*=.45;G*=.42;B*=.4}if(rim>0){R=mix(R,64,rim);G=mix(G,52,rim);B=mix(B,40,rim)}
   o[0]=R+fine*10;o[1]=G+fine*8;o[2]=B+fine*6;o[3]=ring*.4+fine*.2-(chk?.8:0)-rim*.3},{normal:2.2});
 // cob: earthy clay with straw, pebbles, hand smears and hairline cracks
 const CW=512,straw=new Float32Array(CW*CW),peb=new Float32Array(CW*CW),r1=rng(77);
 for(let i=0;i<1700;i++){const x=r1()*CW,y=r1()*CW,a=r1()*6.283,l=5+r1()*16;lineInto(straw,CW,CW,x,y,x+Math.cos(a)*l,y+Math.sin(a)*l,0,.55+.45*r1())}
 for(let i=0;i<420;i++){const x=r1()*CW,y=r1()*CW,rr=1+r1()*2.6,val=.4+.6*r1();for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const d=Math.hypot(dx,dy);if(d<=rr){const xi=((Math.floor(x)+dx)%CW+CW)%CW,yi=((Math.floor(y)+dy)%CW+CW)%CW;peb[yi*CW+xi]=Math.max(peb[yi*CW+xi],val*(1-d/(rr+1)))}}}
 const cob=makeTex(CW,CW,(u,v,o,x,y)=>{const base=fb(u,v,4,4,4,11),smear=fb(u+.1*pn(u*3,v*3,3,3,14),v,12,3,2,13),[f1,f2]=voronoi(u,v,9,15),
   crack=(f2-f1<.035+.02*pn(u*16,v*16,16,16,16))?sstep(.42,.62,pn(u*6,v*6,6,6,17)):0,s=straw[y*CW+x],p=peb[y*CW+x],fine=pn(u*256,v*256,256,256,18);
   let R=mix(118,178,base)+smear*14,G=mix(90,142,base)+smear*10,B=mix(60,100,base)+smear*6;
   if(s>0){R=mix(R,206,s*.75);G=mix(G,174,s*.75);B=mix(B,108,s*.75)}if(p>0){const g=mix(.75,1.25,h3(x>>2,y>>2,3,19));R=mix(R,120*g,p);G=mix(G,116*g,p);B=mix(B,108*g,p)}
   R*=1-.5*crack;G*=1-.5*crack;B*=1-.5*crack;o[0]=R+fine*8;o[1]=G+fine*7;o[2]=B+fine*5;o[3]=.45*base+.3*smear+.18*s+.35*p-.7*crack+.06*fine},{normal:3});
 // fieldstone: granite speckle with lichen
 const stone=makeTex(256,256,(u,v,o)=>{const g=fb(u,v,8,8,4,31),sp=pn(u*128,v*128,128,128,32),dk=sp>.78?.55:sp<.12?1.25:1,li=sstep(.64,.75,fb(u,v,4,4,3,33));
   const c=mix(108,170,g)*dk;o[0]=c*1.05+li*18;o[1]=c*.99+li*30;o[2]=c*.86+li*6;o[3]=g*.7+sp*.3},{normal:2.5});
 // thatch: dense straw strands along v, gold to weathered grey
 const thatch=makeTex(256,512,(u,v,o)=>{const sx=u*128+2*pn(u*4,v*2,4,2,41),st=pn(sx,v*4,128,4,42),st2=pn(u*256,v*8,256,8,43),wea=fb(u,v,3,3,3,44),gap=sstep(.25,.05,st)*.6;
   const hh=st*.6+st2*.4-gap;o[0]=mix(178,214,st)*(1-gap)-wea*58;o[1]=mix(146,184,st)*(1-gap)-wea*58;o[2]=mix(82,108,st)*(1-gap)-wea*36;o[3]=hh},{normal:3});
 // sod: matted short grass and moss over dark soil
 const sod=makeTex(256,256,(u,v,o)=>{const p=fb(u,v,6,6,4,51),bl=pn(u*128,v*64,128,64,52),soil=sstep(.62,.72,fb(u,v,5,5,3,53)),dry=sstep(.55,.7,fb(u,v,3,3,3,54));
   let R=mix(46,92,bl*p)+dry*48,G=mix(70,124,bl*p)+dry*28,B=mix(28,52,bl*p);R=mix(R,70,soil);G=mix(G,54,soil);B=mix(B,36,soil);o[0]=R;o[1]=G;o[2]=B;o[3]=bl*.6+p*.4-soil*.4},{normal:3});
 // grass / straw cards: blades with alpha
 const GW=128,GH=256,blade=new Float32Array(GW*GH),shade=new Float32Array(GW*GH),r2=rng(61);
 for(let i=0;i<22;i++){let x=10+r2()*(GW-20),y=GH-1;const lean=(r2()-.5)*.9,len=GH*(.55+.45*r2()),wd=2.2+r2()*1.6,sh=.6+.4*r2();
  for(let k=0;k<len;k+=1){const t=k/len,ww=Math.max(.6,wd*(1-t*t));for(let dx=-Math.ceil(ww);dx<=Math.ceil(ww);dx++){const xi=Math.round(x+dx),yi=Math.round(y-k);if(xi<0||xi>=GW||yi<0)continue;if(Math.abs(dx)<=ww){blade[yi*GW+xi]=1;shade[yi*GW+xi]=sh*(.55+.45*t)}}x+=lean*(.2+t)}}
 const grass=makeTex(GW,GH,(u,v,o,x,y)=>{const b=blade[y*GW+x],s=shade[y*GW+x];o[0]=255*s*.82;o[1]=255*s;o[2]=255*s*.62;o[4]=b?255:0},{alpha:true});
 // moss: clumped cushions
 const moss=makeTex(256,256,(u,v,o)=>{const [f1]=voronoi(u,v,14,71),c=1-Math.min(1,f1*1.5),fine=pn(u*192,v*192,192,192,72),y=fb(u,v,4,4,3,73);
   o[0]=mix(48,104,c*fine)+y*30;o[1]=mix(66,142,c*fine)+y*12;o[2]=mix(22,46,c);o[3]=c*.7+fine*.3},{normal:4});
 // fur: flowing hair strands
 const fur=makeTex(256,256,(u,v,o)=>{const fl=fb(u,v,3,3,3,81),hx=u*96+fl*6,st=pn(hx,v*6,96,6,82),st2=pn(u*192+fl*9,v*10,192,10,83),tone=fb(u,v,2,2,2,84);
   const h=st*.6+st2*.4;o[0]=mix(60,150,h)+tone*40;o[1]=mix(44,118,h)+tone*30;o[2]=mix(30,84,h)+tone*20;o[3]=h},{normal:3});
 // feather card
 const feather=makeTex(64,128,(u,v,o)=>{const y=1-v,x=(u-.5)*2,wd=.82*Math.sin(Math.PI*Math.min(1,y*1.05))*Math.pow(y,.2),inV=Math.abs(x)<wd&&y>.08,shaft=Math.abs(x)<.06&&y<.98,bar=.5+.5*Math.sin(y*38+Math.abs(x)*8);
   const ragged=pn(u*16,v*32,16,32,91)>.2||Math.abs(x)<wd*.8;o[0]=shaft?236:mix(150,240,bar);o[1]=shaft?230:mix(132,232,bar);o[2]=shaft?218:mix(112,222,bar);o[4]=(inV&&ragged)||shaft?255:0},{alpha:true});
 // cord: three twisted plies
 const cord=makeTex(64,64,(u,v,o)=>{const t=fract((u+v)*3),h=Math.pow(Math.sin(t*Math.PI),.6)*.8+.2*pn(u*32,v*32,32,32,95);o[0]=120+70*h;o[1]=100+60*h;o[2]=66+44*h;o[3]=h},{normal:4});
 // water: soft downstream streaks and foam flecks (scrolled along v by the water wheel)
 const water=makeTex(64,256,(u,v,o)=>{const s=fb(u,v,2,8,3,31),st=pn(u*8,v*2,8,2,33),fl=sstep(.7,.85,fb(u,v,8,24,2,35)),c=.62+.3*s+.22*sstep(.55,.8,st)+.35*fl;o[0]=170*c;o[1]=205*c;o[2]=220*c;o[3]=s*.6+st*.4},{normal:1.6});
 return TEX={bark,wood,end,cob,stone,thatch,sod,grass,moss,fur,feather,cord,water}}

/* ---------------- materials (shared) ---------------- */
// indirect-only ambient occlusion from the per-vertex `ao` attribute
function aoPatch(m){m.onBeforeCompile=sh=>{
 sh.vertexShader=sh.vertexShader.replace("#include <common>","#include <common>\nattribute float ao;\nvarying float vWAO;").replace("#include <begin_vertex>","#include <begin_vertex>\n\tvWAO=ao;");
 sh.fragmentShader=sh.fragmentShader.replace("#include <common>","#include <common>\nvarying float vWAO;").replace("#include <aomap_fragment>","#include <aomap_fragment>\n\treflectedLight.indirectDiffuse*=vWAO;\n\treflectedLight.indirectSpecular*=vWAO;")};
 m.customProgramCacheKey=()=>"fk-wood-ao"+(m.alphaTest?"-a":"");return m}
let MATS=null;
export function woodMaterials(){if(MATS)return MATS;const t=woodTextures(),S=(name,tx,o={})=>aoPatch(new T.MeshStandardMaterial({name:"fk-wood-"+name,map:tx.map,normalMap:tx.nrm||null,normalScale:new T.Vector2(o.ns??1,o.ns??1),roughness:o.rough??.95,metalness:0,vertexColors:true,side:o.side??T.FrontSide,alphaTest:o.alphaTest||0,color:o.color??0xffffff}));
 MATS={bark:S("bark",t.bark,{ns:1.2}),wood:S("wood",t.wood,{rough:.85,side:T.DoubleSide}),end:S("end",t.end,{rough:.9,side:T.DoubleSide}),cob:S("cob",t.cob,{side:T.DoubleSide,ns:.9}),
  stone:S("stone",t.stone,{rough:.9,ns:1}),thatch:S("thatch",t.thatch,{side:T.DoubleSide,ns:1.2}),sod:S("sod",t.sod,{side:T.DoubleSide}),grass:S("grass",t.grass,{side:T.DoubleSide,alphaTest:.5,rough:.9}),
  moss:S("moss",t.moss,{side:T.DoubleSide,ns:1.3}),fur:S("fur",t.fur,{side:T.DoubleSide,ns:1.2}),feather:S("feather",t.feather,{side:T.DoubleSide,alphaTest:.5,rough:.8}),cord:S("cord",t.cord,{rough:.9,side:T.DoubleSide})};
 MATS.water=new T.MeshStandardMaterial({name:"fk-wood-water",map:t.water.map,normalMap:t.water.nrm,normalScale:new T.Vector2(.6,.6),roughness:.12,metalness:0,vertexColors:true,transparent:true,opacity:.8,depthWrite:false,side:T.DoubleSide});
 return MATS}

/* ---------------- geometry accumulation ---------------- */
class Bin{constructor(mat,fine,shadow){this.mat=mat;this.fine=fine;this.shadow=shadow;this.p=[];this.n=[];this.t=[];this.c=[];this.a=[];this.marks=[]}
 get count(){return this.p.length/3}
 v(p,n,t,c,a){this.p.push(p[0],p[1],p[2]);this.n.push(n[0],n[1],n[2]);this.t.push(t[0],t[1]);this.c.push(c[0],c[1],c[2]);this.a.push(a)}}
class Builder{
 constructor(seed,aoAt){this.r=rng(seed);this.seed=seed;this.aoAt=aoAt||(()=>1);this.stage=0;this.bins=new Map();this.parts=[];this.M=woodMaterials()}
 bin(mat,fine=false,shadow=!fine){const k=this.stage+"|"+mat+"|"+(fine?1:0);let b=this.bins.get(k);if(!b){b=new Bin(this.M[mat],fine,shadow);b.stage=this.stage;b.matName=mat;b.marks=new Array(this.parts[this.stage]||0).fill(0);this.bins.set(k,b)}return b}
 part(){const s=this.stage;this.parts[s]=(this.parts[s]||0)+1;for(const b of this.bins.values())if(b.stage===s)b.marks.push(b.count)}
 rnd(a=0,b=1){return a+(b-a)*this.r()}
 // grid surface: P(i,j,u,v) -> [x,y,z]; UV(u,v,i,j)->[u,v]; col -> [r,g,b]; ao constant multiplier or function
 grid(bin,nu,nv,P,UV,col,o={}){const W=nu+1,H=nv+1,pos=new Float32Array(W*H*3);
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){const q=P(i,j,i/nu,j/nv),k=(j*W+i)*3;pos[k]=q[0];pos[k+1]=q[1];pos[k+2]=q[2]}
  const at=(i,j)=>(j*W+i)*3,nor=new Float32Array(W*H*3);
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){let im=i-1,ip=i+1;if(o.wrapU){if(i===0)im=nu-1;if(i===nu)ip=1}im=Math.max(0,im);ip=Math.min(nu,ip);const jm=Math.max(0,j-1),jp=Math.min(nv,j+1);
   const a=at(im,j),b=at(ip,j),c=at(i,jm),d=at(i,jp),ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2],vx=pos[d]-pos[c],vy=pos[d+1]-pos[c+1],vz=pos[d+2]-pos[c+2];
   let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz);const k=at(i,j);
   if(l<1e-9&&o.center){nx=pos[k]-o.center[0];ny=pos[k+1]-o.center[1];nz=pos[k+2]-o.center[2];l=Math.hypot(nx,ny,nz)||1}else if(l<1e-9){nx=0;ny=1;nz=0;l=1}
   if(o.flip){nx=-nx;ny=-ny;nz=-nz}nor[k]=nx/l;nor[k+1]=ny/l;nor[k+2]=nz/l}
  const V=(i,j)=>{const k=at(i,j),p=[pos[k],pos[k+1],pos[k+2]];const aa=typeof o.ao==="function"?o.ao(p):(o.ao??1)*(o.noAO?1:this.aoAt(p[0],p[1],p[2]));
   return [p,[nor[k],nor[k+1],nor[k+2]],UV(i/nu,j/nv,i,j),col?col(i/nu,j/nv,i,j):[1,1,1],aa]};
  const cache=new Array(W*H);const G=(i,j)=>cache[j*W+i]||(cache[j*W+i]=V(i,j));
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){if(o.skip&&o.skip(i,j))continue;const a=G(i,j),b=G(i+1,j),c=G(i+1,j+1),d=G(i,j+1);
   if(o.flip){bin.v(...a);bin.v(...c);bin.v(...b);bin.v(...a);bin.v(...d);bin.v(...c)}else{bin.v(...a);bin.v(...b);bin.v(...c);bin.v(...a);bin.v(...c);bin.v(...d)}}}
 tri(bin,ps,n,uvs,c,a){for(let k=0;k<3;k++)bin.v(ps[k],n,uvs[k],c,a??this.aoAt(ps[k][0],ps[k][1],ps[k][2]))}
 /* irregular round log / pole / stick from a to b */
 log(a,b,r,o={}){const mat=o.mat||"bark",bin=this.bin(mat,o.fine,o.shadow),d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],len=Math.hypot(...d);if(len<1e-4)return;d[0]/=len;d[1]/=len;d[2]/=len;
  const up=Math.abs(d[1])<.9?[0,1,0]:[1,0,0];let e1=[up[1]*d[2]-up[2]*d[1],up[2]*d[0]-up[0]*d[2],up[0]*d[1]-up[1]*d[0]];const l1=Math.hypot(...e1);e1=e1.map(x=>x/l1);
  const e2=[d[1]*e1[2]-d[2]*e1[1],d[2]*e1[0]-d[0]*e1[2],d[0]*e1[1]-d[1]*e1[0]];
  const sd=o.seed??Math.floor(this.r()*1e6),nu=o.nu||(r>.1?12:r>.05?9:r>.025?7:5),nv=Math.max(2,Math.ceil(len/(o.step||(r>.05?.21:.32)))),ba=o.ba??this.r()*6.283,bend=o.bend??len*.012*(.5+this.r()),
   bx=Math.cos(ba),by=Math.sin(ba),taper=o.taper??.1,tint=o.tint||this.tint(o.tone),bump=o.bump??.07,uc=Math.max(1,Math.round(2*Math.PI*r/.4)),vo=this.r()*7;
  const R=(t,th)=>r*(1+taper*(.5-t))*(1+bump*(n3(Math.cos(th)*1.3+sd%97,Math.sin(th)*1.3,t*len*2.2,sd)-.5)*2+.12*Math.max(0,n3(Math.cos(th)*2.5,Math.sin(th)*2.5,t*len*3,sd+5)-.78)*4);
  const sag=o.sag||0,C=t=>{const s=Math.sin(Math.PI*t)*bend;return [a[0]+d[0]*len*t+(e1[0]*bx+e2[0]*by)*s,a[1]+d[1]*len*t+(e1[1]*bx+e2[1]*by)*s-Math.sin(Math.PI*t)*sag,a[2]+d[2]*len*t+(e1[2]*bx+e2[2]*by)*s]};
  const P=(i,j,u,t)=>{const th=u*6.283,rr=R(t,th),c=C(t),cs=Math.cos(th),sn=Math.sin(th);return [c[0]+(e1[0]*cs+e2[0]*sn)*rr,c[1]+(e1[1]*cs+e2[1]*sn)*rr,c[2]+(e1[2]*cs+e2[2]*sn)*rr]};
  this.grid(bin,nu,nv,P,(u,t)=>[u*uc,t*len/.9+vo],()=>tint,{wrapU:true,ao:o.ao});
  if(o.caps===false)return;const eb=this.bin(o.capMat||"end",o.fine,o.shadow),cuts=[[0,-1],[1,1]];
  for(const [t,sg] of cuts){if(o.caps==="end"&&t===0||o.caps==="start"&&t===1)continue;const c=C(t),n=[d[0]*sg,d[1]*sg,d[2]*sg],ct=[c[0]+n[0]*r*.08,c[1]+n[1]*r*.08,c[2]+n[2]*r*.08],tc=this.tint("end"),cu=.5+(this.r()-.5)*.1,cv=.5+(this.r()-.5)*.1;
   for(let i=0;i<nu;i++){const t0=i/nu,t1=(i+1)/nu,p0=P(0,0,t0,t),p1=P(0,0,t1,t),uv=th=>[cu+Math.cos(th*6.283)*.47,cv+Math.sin(th*6.283)*.47];
    const ps=sg>0?[ct,p0,p1]:[ct,p1,p0],uvs=sg>0?[[cu,cv],uv(t0),uv(t1)]:[[cu,cv],uv(t1),uv(t0)];this.tri(eb,ps,n,uvs,tc,o.ao)}}}
 tint(kind){const r=this.r,v=.82+.32*r();if(kind==="end")return [.9+.15*r(),.88+.14*r(),.84+.12*r()];if(kind==="stick")return [v*.95,v*.92,v*.86];if(kind==="grey")return [v*.92,v*.92,v*.92];return [v,v*(.94+.08*r()),v*(.88+.1*r())]}
 /* fieldstone: squashed, lumpy superellipsoid; rot = yaw */
 stone(cx,cy,cz,sx,sy,sz,yaw=0,o={}){const bin=this.bin("stone",o.fine),sd=Math.floor(this.r()*1e6),tone=this.r(),tint=o.tint||[mix(.75,1.08,tone)*(1+.06*this.r()),mix(.74,1.04,tone),mix(.7,.98,tone)*(1-.08*this.r())],cs=Math.cos(yaw),sn=Math.sin(yaw),ex=o.box??.55;
  const P=(i,j,u,v)=>{const th=u*6.283,ph=v*Math.PI;let x=Math.sin(ph)*Math.cos(th),y=Math.cos(ph),z=Math.sin(ph)*Math.sin(th);
   const dd=1+.22*(n3(x*1.6+sd%13,y*1.6,z*1.6,sd)-.5)+.09*(n3(x*4,y*4,z*4,sd+1)-.5);const sp=(q)=>Math.sign(q)*Math.pow(Math.abs(q),ex);x=sp(x)*dd*sx;y=sp(y)*dd*sy;z=sp(z)*dd*sz;
   return [cx+x*cs+z*sn,cy+y,cz-x*sn+z*cs]};
  this.grid(bin,o.nu||7,o.nv||5,P,(u,v)=>[u*2+tone*3,v],()=>tint,{wrapU:true,center:[cx,cy,cz],ao:o.ao})}
 /* crossed alpha cards (grass, straw, feathers) */
 card(mat,c,w,h,yaw,lean,tint,o={}){const bin=this.bin(mat,o.fine??true,o.shadow??false),aa=o.ao??this.aoAt(c[0],c[1]+h*.5,c[2]);const lx=Math.sin(lean)*h,n=o.n||2;
  for(let k=0;k<n;k++){const a=yaw+k*Math.PI/n,dx=Math.cos(a)*w*.5,dz=-Math.sin(a)*w*.5,tx=Math.cos(yaw+.7)*lx,tz=Math.sin(yaw+.7)*lx,tp=[c[0]+tx,c[1]+Math.cos(lean)*h,c[2]+tz];
   const p0=[c[0]-dx,c[1],c[2]-dz],p1=[c[0]+dx,c[1],c[2]+dz],p2=[tp[0]+dx,tp[1],tp[2]+dz],p3=[tp[0]-dx,tp[1],tp[2]-dz],nn=o.up?[0,1,0]:[Math.sin(a)*.4,.9,Math.cos(a)*.4];
   const u0=o.u0??0,u1=o.u1??1;bin.v(p0,nn,[u0,1],tint,aa);bin.v(p1,nn,[u1,1],tint,aa);bin.v(p2,nn,[u1,0],tint,aa*1.05);bin.v(p0,nn,[u0,1],tint,aa);bin.v(p2,nn,[u1,0],tint,aa*1.05);bin.v(p3,nn,[u0,0],tint,aa*1.05)}}
 /* flat quad (u along a, v along b from origin) */
 quad(mat,o0,a,b,tint,o={}){const bin=this.bin(mat,o.fine,o.shadow),p=(s,t)=>[o0[0]+a[0]*s+b[0]*t,o0[1]+a[1]*s+b[1]*t,o0[2]+a[2]*s+b[2]*t];
  this.grid(bin,o.nu||1,o.nv||1,(i,j,s,t)=>{const q=p(s,t);if(o.disp){const dd=o.disp(s,t);q[0]+=o.dn[0]*dd;q[1]+=o.dn[1]*dd;q[2]+=o.dn[2]*dd}return q},(s,t)=>[s*(o.us||1),t*(o.vs||1)],()=>tint,{ao:o.ao,skip:o.skip,flip:o.flip})}
 /* lashing: a few cord wraps around a joint */
 lash(c,axis,r,turns=4,o={}){const bin=this.bin("cord",o.fine??false),A=axis.map(x=>x/Math.hypot(...axis));const up=Math.abs(A[1])<.9?[0,1,0]:[1,0,0];let e1=[up[1]*A[2]-up[2]*A[1],up[2]*A[0]-up[0]*A[2],up[0]*A[1]-up[1]*A[0]];const l=Math.hypot(...e1);e1=e1.map(x=>x/l);const e2=[A[1]*e1[2]-A[2]*e1[1],A[2]*e1[0]-A[0]*e1[2],A[0]*e1[1]-A[1]*e1[0]];
  const rc=o.rc||.009,tilt=o.tilt??.5;
  for(let k=0;k<turns;k++){const off=(k-(turns-1)/2)*rc*2.3,tl=(k%2?1:-1)*tilt;
   const P=(i,j,u,v)=>{const th=u*6.283,ph=v*6.283,cs=Math.cos(th),sn=Math.sin(th),rr=r+rc+rc*Math.cos(ph),ax=off+rc*Math.sin(ph)+tl*r*cs*.35;
    return [c[0]+(e1[0]*cs+e2[0]*sn)*rr+A[0]*ax,c[1]+(e1[1]*cs+e2[1]*sn)*rr+A[1]*ax,c[2]+(e1[2]*cs+e2[2]*sn)*rr+A[2]*ax]};
   this.grid(bin,14,4,P,(u,v)=>[u*4,v],()=>[1,1,1],{wrapU:true})}}
 finish(root){const stages=[];for(const b of this.bins.values()){if(!b.count)continue;b.marks.push(b.count);
   const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(b.p,3));g.setAttribute("normal",new T.Float32BufferAttribute(b.n,3));g.setAttribute("uv",new T.Float32BufferAttribute(b.t,2));
   g.setAttribute("color",new T.Float32BufferAttribute(b.c,3));g.setAttribute("ao",new T.Float32BufferAttribute(b.a,1));g.computeBoundingSphere();
   const m=new T.Mesh(g,b.mat);m.castShadow=b.shadow;m.receiveShadow=true;m.raycast=()=>{};m.userData.marks=b.marks;m.userData.parts=this.parts[b.stage]||1;m.userData.fine=b.fine;m.name=`stage${b.stage}-${b.matName}`;
   (stages[b.stage]||(stages[b.stage]=new T.Group())).add(m)}
  for(let i=0;i<stages.length;i++){if(!stages[i])stages[i]=new T.Group();stages[i].name="stage"+i;root.add(stages[i])}
  return stages}
}
const ZERO=()=>0;

/* ---------------- proxies for raycasting (invisible, cheap) ---------------- */
const PROXY_MAT=new T.MeshBasicMaterial({visible:false});
const BOX=new T.BoxGeometry(1,1,1);
function proxy(root,stage,cx,cy,cz,sx,sy,sz,rx=0,ry=0,rz=0,parent){const m=new T.Mesh(BOX,PROXY_MAT);m.position.set(cx,cy,cz);m.scale.set(sx,sy,sz);m.rotation.set(rx,ry,rz);m.userData.proxyStage=stage;(parent||root).add(m);root.userData.proxies.push(m);return m}

/* ================= WOODLAND HUT (lashed A-frame) ================= */
function hutAO(x,y,z){const H=HUT,roof=H.ridge*(1-Math.abs(x)/H.hx);
 if(Math.abs(z)<H.hz-.05&&y<roof-.06&&y>-.2){const door=Math.exp(-Math.hypot(x,y-.8,z-H.hz)/1.1),back=Math.max(0,(z+H.hz)/(2*H.hz));return Math.min(.9,.22+.55*door+.12*back*0+.1*Math.max(0,y/H.ridge))}
 return 1-.28*Math.exp(-Math.max(0,y)/.3)}
export function buildHut(opt={}){const H=HUT,B=new Builder(opt.seed??1201,hutAO),root=new T.Group();root.name="woodhut";root.userData={type:"woodhut",proxies:[]};const g=opt.ground||ZERO;
 const RH=H.ridge,X=H.hx,L=H.hz,sideN=sg=>{const l=Math.hypot(RH,X);return [sg*RH/l,X/l,0]},roofPt=(sg,s,z,off)=>{const n=sideN(sg);return [sg*X*(1-s)+n[0]*off,RH*s+n[1]*off,z]};
 // ---- stage 0: frame ----
 B.stage=0;
 for(const zz of [-L+.18,L-.18]){for(const sg of [-1,1]){B.stone(sg*(X+.02),g(sg*X,zz)+.03,zz+(B.rnd()-.5)*.1,.16,.1,.14,B.rnd()*3)}B.part()}
 for(const zz of [-L+.2,L-.2]){const tip=.38;
  for(const sg of [-1,1]){B.log([sg*(X+.05),g(sg*X,zz)-.08,zz+sg*.02],[-sg*tip,RH+tip*RH/X+.04,zz-sg*.02],.068,{bend:.04,taper:.25})}
  B.lash([0,RH,zz],[0,0,1],.09,5,{tilt:.7});B.part()}
 B.log([0,RH+.02,-L-.28],[0,RH+.03,L+.3],.072,{bend:.05});B.part();
 for(const zz of [-L+.2,L-.2])B.lash([0,RH+.03,zz],[1,0,.2],.08,3,{tilt:.2});B.part();
 // ---- stage 1: rafters & wattle ----
 B.stage=1;const nR=11;
 for(let k=0;k<nR;k++){const zz=-L+.32+k*(2*L-.64)/(nR-1)+(B.rnd()-.5)*.06;for(const sg of [-1,1]){const foot=roofPt(sg,-.02,zz,0),top=roofPt(sg,1.04,zz+(B.rnd()-.5)*.05,.02);B.log(foot,top,.034+B.rnd()*.01,{taper:.3,tone:"stick",bend:.03})}B.part()}
 for(let k=0;k<13;k++){const s=.06+k*.074;for(const sg of [-1,1]){const zs=-L-.05,ze=L+.05,n=24,pts=[];
   const bin=B.bin("bark");// woven withy: alternates over/under the rafters
   B.grid(bin,6,n,(i,j,u,t)=>{const zz=mix(zs,ze,t),w=.022*Math.sin(t*nR*Math.PI*1.0+k),c=roofPt(sg,s,zz,.05+w),th=u*6.283,r=.014,n2=sideN(sg);return [c[0]+n2[0]*Math.cos(th)*r+0,c[1]+n2[1]*Math.cos(th)*r+0,c[2]+Math.sin(th)*r]},(u,t)=>[u,t*8],()=>B.tint("stick"),{wrapU:true});void pts}
  if(k%3===2)B.part()}
 // gable wattle: stakes + weavers (front gable leaves the door gap)
 for(const front of [false,true]){const zz=front?L-.24:-L+.24;
  for(let x=-X+.28;x<=X-.28;x+=.17){if(front&&Math.abs(x)<H.door+.02)continue;const top=RH*(1-Math.abs(x)/X)-.05;B.log([x,g(x,zz)-.05,zz],[x+(B.rnd()-.5)*.04,top,zz],.016,{tone:"stick",caps:"end",taper:.2})}
  if(front){B.log([-H.door-.04,g(-H.door,zz)-.05,zz],[-H.door,H.doorH+.08,zz],.035,{tone:"stick"});B.log([H.door+.04,g(H.door,zz)-.05,zz],[H.door,H.doorH+.08,zz],.035,{tone:"stick"});B.log([-H.door-.2,H.doorH,zz+.02],[H.door+.2,H.doorH+.02,zz+.02],.032,{tone:"stick"})}
  for(let y=.12;y<RH-.3;y+=.11){const half=X*(1-y/RH)-.25;if(half<.08)break;const segs=front&&y<H.doorH?[[-half,-H.door],[H.door,half]]:[[-half,half]];
   for(const [x0,x1] of segs){if(x1-x0<.1)continue;const bin=B.bin("bark");B.grid(bin,5,Math.max(3,Math.ceil((x1-x0)/.09)),(i,j,u,t)=>{const x=mix(x0,x1,t),w=.02*Math.sin((x-x0)/.17*Math.PI+y*30),th=u*6.283,r=.012;return [x,y+Math.cos(th)*r,zz+w+Math.sin(th)*r]},(u,t)=>[u,t*4],()=>B.tint("stick"),{wrapU:true})}}
  B.part()}
 // ---- stage 2: bark & thatch roof ----
 B.stage=2;
 for(const sg of [-1,1]){for(let k=0;k<7;k++){const z0=-L-.2+k*(2*L+.4)/7-.06,z1=z0+(2*L+.4)/7+.12;const sd=B.r()*100;
   B.grid(B.bin("bark"),6,4,(i,j,u,v)=>{const zz=mix(z0,z1,u),s=mix(.0,.21,v),c=roofPt(sg,s,zz,.07+.03*Math.sin(u*Math.PI)+.01*n3(u*4,v*4,sd));return c},(u,v)=>[u*1.2,v*1.5],()=>B.tint(),{})}
  B.part()}
 const thatchCourse=(sg,s0,len,fringe)=>{const sd=B.r()*100,tt=s=>.035+.13*Math.pow(Math.max(0,1-s),.7);const z0=-L-.22,z1=L+.22,nz=Math.ceil((z1-z0)/.12);
  const butt=zz=>s0+.012*(n3(zz*3,sd,0,7)-.5)*2;
  B.grid(B.bin("thatch"),nz,6,(i,j,u,v)=>{const zz=mix(z0,z1,u),sb=butt(zz),s=sb+v*len,c=roofPt(sg,s,zz,.08+tt(v)+.025*(n3(zz*2.5,s*9,sd)-.5));return c},(u,v)=>[u*(z1-z0)/.9,v*1.3],(u,v)=>{const w=.86+.2*n3(u*9,v*3,sd);return [w,w*.97,w*.9]},{});
  // butt face (cut straw ends)
  B.grid(B.bin("thatch"),nz,1,(i,j,u,v)=>{const zz=mix(z0,z1,u),sb=butt(zz);return roofPt(sg,sb-.006,zz,mix(.08,.08+tt(0),v))},(u,v)=>[u*(z1-z0)/.3,v*.25],()=>[.72,.66,.52],{});
  if(fringe)for(let zz=z0+.04;zz<z1;zz+=.07+B.rnd()*.05){const sb=butt(zz),c=roofPt(sg,sb+.01,zz,.1);const w=.86+.2*B.rnd();B.card("grass",[c[0]+sg*.02,c[1]-.02,c[2]],.13,.2+.1*B.rnd(),Math.PI/2,Math.PI*.62*sg/Math.abs(sg),[w*1.05,w*.85,w*.5],{n:1,shadow:false})}};
 for(let k=0;k<6;k++){for(const sg of [-1,1])thatchCourse(sg,.12+k*.14,.25,k===0);B.part()}
 // underside (seen from inside)
 for(const sg of [-1,1])B.grid(B.bin("thatch"),14,8,(i,j,u,v)=>roofPt(sg,mix(.03,.99,v),mix(-L-.2,L+.2,u),.066),(u,v)=>[u*4,v*3],()=>[.62,.56,.44],{});
 // ridge cap: rolled thatch bundle pinned with crossed ridge sticks
 {const sd=B.r()*100;B.grid(B.bin("thatch"),10,24,(i,j,u,t)=>{const zz=mix(-L-.25,L+.25,t),th=mix(-.15,Math.PI+.15,u),rr=.17*(1+.15*(n3(zz*3,u*4,sd)-.5));return [Math.cos(th)*rr*1.2,RH+.12+Math.sin(th)*rr*.75,zz]},(u,t)=>[u*1.5,t*5],()=>[.84,.8,.7],{});
  for(let zz=-L;zz<=L+.01;zz+=.55){for(const sg of [-1,1])B.log([-sg*.42,RH-.06,zz-.05],[sg*.18,RH+.42,zz+.05],.018,{tone:"stick"});}}
 B.part();
 // ---- stage 3: daub gables, floor, bed, hurdle ----
 B.stage=3;
 for(const front of [false,true]){const zz=front?L-.24:-L+.24,sd=B.r()*100,nx=34,ny=28;
  for(const side of [-1,1]){const zf=zz+side*.045;
   B.grid(B.bin("cob"),nx,ny,(i,j,u,v)=>{const x=mix(-X,X,u),y=mix(0,RH,v),lump=.018*(n3(x*3,y*3,sd)-.5)+.008*(n3(x*9,y*9,sd+2)-.5);return [x,y,zf+side*lump]},(u,v)=>[u*X*2/.9,v*RH/.9],(u,v)=>{const w=.92+.12*n3(u*5,v*5,sd+4);return [w,w*.97,w*.93]},
    {flip:side<0,skip:(i,j)=>{const x=mix(-X,X,(i+.5)/nx),y=mix(0,RH,(j+.5)/ny),top=RH*(1-Math.abs(x)/X)-.1;if(y>top)return true;if(front&&Math.abs(x)<H.door+.03&&y<H.doorH+.03)return true;
     const rag=2.05+.22*(n3(x*4,0,sd+9)-.5);return y>rag||y<g(x,zz)-.05}})}
  B.part()}
 // floor: dry bracken / grass litter, bough bed with grass & moss
 {const sd=B.r()*100;B.grid(B.bin("thatch"),16,16,(i,j,u,v)=>{const x=mix(-1.45,1.45,u),z=mix(-L+.25,L-.15,v);return [x,g(x,z)+.03+.025*n3(x*3,z*3,sd),z]},(u,v)=>[u*3,v*3.5],(u,v)=>{const w=.5+.25*n3(u*6,v*6,sd);return [w,w*.85,w*.6]},{});}
 B.part();
 B.log([-.5,g(-.5,0)+.08,-L+.35],[-.5,g(-.5,0)+.08,L-.55],.07,{bend:.03});
 {const sd=B.r()*100;B.grid(B.bin("thatch"),10,14,(i,j,u,v)=>{const x=mix(-1.3,-.55,u),z=mix(-L+.35,L-.55,v),h=.2*Math.sin(Math.PI*u)**.5*Math.sin(Math.PI*v)**.3+.04*n3(x*5,z*5,sd);return [x,g(x,z)+.04+h,z]},(u,v)=>[u*1.5,v*3],()=>[.9,.82,.62],{});
  B.grid(B.bin("moss"),9,12,(i,j,u,v)=>{const x=mix(-1.22,-.6,u),z=mix(-L+.45,L-.7,v),h=.24*Math.sin(Math.PI*u)**.5*Math.sin(Math.PI*v)**.3+.05*n3(x*7,z*7,sd+3);return [x,g(x,z)+.06+h,z]},(u,v)=>[u*1.3,v*3],()=>[1,1,1],{});}
 B.part();
 // a woven hurdle leaning beside the doorway + a few loose sticks
 {const zz=L+.12,x0=.55,x1=1.25;for(let x=x0;x<=x1;x+=.11)B.log([x,g(x,zz)-.02,zz],[x+.05,1.05,zz-.28],.014,{tone:"stick"});
  for(let k=0;k<8;k++){const y=.1+k*.12;B.log([x0-.04,y,zz-y*.27],[x1+.07,y,zz-y*.27],.011,{tone:"stick",bend:.01})}}
 B.part();
 // site markers (before the frame is up)
 B.stage=4;for(const [x,z] of [[-X,-L],[X,-L],[X,L],[-X,L]])B.log([x,g(x,z)-.05,z],[x,g(x,z)+.55,z],.022,{tone:"stick"});
 for(const [a,b] of [[[-X,-L],[X,-L]],[[X,-L],[X,L]],[[X,L],[-X,L]],[[-X,L],[-X,-L]]])B.log([a[0],g(a[0],a[1])+.45,a[1]],[b[0],g(b[0],b[1])+.45,b[1]],.005,{mat:"cord",caps:false,bend:.02});
 B.part();
 const st=B.finish(root);root.userData.stages=st.slice(0,4);root.userData.site=st[4];
 // proxies
 proxy(root,-1,0,.15,0,2*X,.3,2*L);
 const ang=Math.atan2(RH,X),sl=Math.hypot(RH,X);for(const sg of [-1,1])proxy(root,2,sg*X/2,RH/2,0,sl,.16,2*L+.4,0,0,sg*ang);
 proxy(root,1,0,RH*.4,-L+.24,2*X*.7,RH*.8,.12);
 root.userData.hearth=null;return root}

/* ================= FOREST HOUSE ================= */
function houseRoofY(z){return 4.1-.687*Math.abs(z)}
function houseAO(x,y,z){const H=HOUSE;
 if(Math.abs(x)<H.hx-.03&&Math.abs(z)<H.hz-.03&&y<houseRoofY(z)-.03&&y>-.3){
  const D=H.door,door=Math.exp(-Math.hypot(x-(D.x0+D.x1)/2,(y-1.1)*.8,z-H.hz)/1.25);let win=0;for(const w of H.windows){const wx=w.wall==="front"?w.c:H.hx,wz=w.wall==="front"?H.hz:w.c;win+=Math.exp(-Math.hypot(x-wx,y-w.y,z-wz)/.85)}
  return Math.min(.92,.2+.5*door+.28*win+.06*Math.min(1,y/2))}
 let a=1-.3*Math.exp(-Math.max(0,y)/.35);if(Math.abs(z)>H.hz-.05&&y>H.plate-.5&&y<houseRoofY(z)+.05&&Math.abs(x)<H.hx+H.ovX)a*=.72;return a}
export function buildHouse(opt={}){const H=HOUSE,B=new Builder(opt.seed??2311,houseAO),root=new T.Group();root.name="foresthouse";root.userData={type:"foresthouse",proxies:[]};const g=opt.ground||ZERO;
 const hx=H.hx,hz=H.hz,base=H.base,FL=H.floor,cr=H.course,D=H.door,HE=H.hearth,CH=H.chimney;
 // lowest ground under the plot: footings start below it so the downhill side never floats
 const gLo=(()=>{let m=0;for(let i=0;i<=12;i++)for(let j=0;j<=12;j++)m=Math.min(m,g(mix(-4.2,3.6,i/12),mix(-3,3,j/12)));return m})(),yFoot=Math.min(-.55,gLo-.3);
 const STONE_TONES=[[1.02,1,.98],[1.18,1,.78],[.72,.7,.7],[1.2,.96,.72],[.92,1,.86],[1.08,.86,.72],[1.22,1.16,1.06],[.86,.82,.78]],stoneTint=()=>{const t=STONE_TONES[Math.floor(B.r()*STONE_TONES.length)],k=.85+.3*B.r();return [t[0]*k,t[1]*k,t[2]*k]};
 // wall descriptors: c = along-wall coordinate, point(c,y,off) with off>0 = outward
 const WALLS={front:{pt:(c,y,o)=>[c,y,hz+o],len:hx,openings:[{c0:D.x0,c1:D.x1,y0:-1,y1:D.top,kind:"door"},{c0:H.windows[0].c-.34,c1:H.windows[0].c+.34,y0:H.windows[0].y-.34,y1:H.windows[0].y+.34,kind:"win",w:H.windows[0]}]},
  back:{pt:(c,y,o)=>[-c,y,-hz-o],len:hx,openings:[]},
  right:{pt:(c,y,o)=>[hx+o,y,-c],len:hz,openings:[{c0:-H.windows[1].c-.34,c1:-H.windows[1].c+.34,y0:H.windows[1].y-.34,y1:H.windows[1].y+.34,kind:"win",w:H.windows[1]}]},
  left:{pt:(c,y,o)=>[-hx-o,y,c],len:hz,openings:[{c0:HE.z0,c1:HE.z1,y0:-1,y1:HE.top-.04,kind:"hearth"}]}};
 // ---- stage 0: fieldstone foundation + packed clay floor ----
 B.stage=0;
 for(const [name,W] of Object.entries(WALLS)){const top=name==="front"||name==="back"?base:base+.15,c0=-W.len-.3,c1=W.len+.3;let y=yFoot;
  while(y<top-.02){const hgt=Math.min(top-y,.13+B.rnd()*.12);let c=c0-B.rnd()*.2;
   while(c<c1){const big=B.rnd()<.22,l=(big?.5:.22)+B.rnd()*(big?.3:.26),cc=Math.min(c1,c+l/2);const gp=W.pt(cc,0,0),gr=g(gp[0],gp[2]);
    const skip=name==="left"&&cc>HE.z0-.05&&cc<HE.z1+.05;
    if(!skip&&y+hgt>gr-.12){const p=W.pt(cc,y+hgt/2,(B.rnd()-.5)*.04);const flat=y+hgt>=top-.01;B.stone(p[0],flat?y+hgt*.42:y+hgt/2,p[2],l/2*1.05,hgt/2*(flat?.85:1.1+(big?.25:0)),.24+.05*B.rnd(),name==="front"||name==="back"?0:Math.PI/2+(B.rnd()-.5)*.1,{box:.45,tint:stoneTint()})}
    c+=l}
   y+=hgt}
  // mud mortar packed behind and between the stones (shows in every joint)
  {const sd=B.r()*100;B.grid(B.bin("cob"),Math.ceil((c1-c0)/.3),3,(i,j,u,v)=>{const c=mix(c0,c1,u),yy=mix(yFoot,top-.03,v);return W.pt(c,yy,.17+.02*n3(c*3,yy*3,sd))},(u,v)=>[u*(c1-c0)/.8,v*(top-yFoot)/.8],(u,v)=>{const w=.58+.1*n3(u*9,v*3,sd+1);return [w,w*.86,w*.7]},{noAO:true})}
  B.part()}
 {const sd=B.r()*100,rx=2.66,rz=2.16;B.grid(B.bin("cob"),26,22,(i,j,u,v)=>{const x=mix(-rx,rx,u),z=mix(-rz,rz,v);return [x,FL+.012*n3(x*2,z*2,sd)+.006*n3(x*7,z*7,sd+1),z]},(u,v)=>[u*rx*2/1.1,v*rz*2/1.1],(u,v)=>{const w=.5+.12*n3(u*7,v*7,sd+2);return [w,w*.9,w*.8]},{});}
 // door threshold & front step
 {const tg=g((D.x0+D.x1)/2,hz+.7);B.stone((D.x0+D.x1)/2,base-.06,hz+.02,.5,.07,.24,0,{box:.35});const rise=base-.08-tg;if(rise>.12){const n=Math.min(3,Math.ceil(rise/.2));for(let k=0;k<n;k++){const z=hz+.36+.3*(n-1-k),gz=g((D.x0+D.x1)/2,z),topk=tg+(k+1)*rise/n,bot=Math.min(gz,tg)-.08;
   for(const sx of [-1,1])B.stone((D.x0+D.x1)/2+sx*(.22+.03*B.rnd())+(B.rnd()-.5)*.04,(topk+bot)/2,z+(B.rnd()-.5)*.05,.25-.02*k+.04*B.rnd(),(topk-bot)/2,.18+.03*B.rnd(),(B.rnd()-.5)*.3,{box:.18,tint:stoneTint()})}}}
 B.part();
 // ---- stage 1: saddle-notched log walls ----
 B.stage=1;
 const wallLog=(W,y,cS,cE,r)=>{// cut the log around openings
  let segs=[[cS,cE]];for(const op of W.openings){const ov=Math.min(y+r,op.y1)-Math.max(y-r,op.y0);if(ov<=.05)continue;const out=[];for(const [a,b] of segs){if(op.c1<=a||op.c0>=b){out.push([a,b]);continue}if(op.c0>a)out.push([a,op.c0]);if(op.c1<b)out.push([op.c1,b])}segs=out}
  for(const [a,b] of segs){if(b-a<.12)continue;B.log(W.pt(a,y,0),W.pt(b,y+(B.rnd()-.5)*.02,0),r,{bend:.01+.015*B.rnd(),sag:(b-a)>2?.012+.016*B.rnd():.004,taper:.08,bump:.09,tint:logTint()})}return segs};
 const logTint=()=>{const v=.92+.34*B.r(),w=B.r();return w<.22?[v*.97,v*.94,v*.9]:w<.4?[v*1.1,v*.92,v*.76]:[v*1.04,v*.96,v*.84]};
 const chinks=[],chink=(W,y,a,b)=>{if(b-a>=.15)chinks.push([W,y,a,b])},chinkNow=(W,y,a,b)=>{const sd=B.r()*100;B.grid(B.bin("cob"),5,Math.max(3,Math.ceil((b-a)/.25)),(i,j,u,t)=>{const c=mix(a,b,t),th=-u*6.283,rr=.078*(1+.35*(n3(c*4,y,sd)-.5));return W.pt(c,y-Math.sin(Math.PI*t)*.012+Math.sin(th)*rr*.62,.112+Math.cos(th)*rr*.5)},(u,t)=>[u,t*(b-a)/.6],()=>[1.6,1.46,1.22],{wrapU:true})};
 const fbLogs=[],sdLogs=[];for(let k=0;k<H.courses;k++)fbLogs.push(base+.16+k*cr);for(let k=0;k<6;k++)sdLogs.push(base+.15+.16+k*cr);
 for(let k=0;k<H.courses;k++){for(const name of ["front","back"]){const W=WALLS[name],o=.38+B.rnd()*.2;const r=.145+B.rnd()*.05;const sg=wallLog(W,fbLogs[k],-hx-o,hx+.38+B.rnd()*.2,r);if(k>0)for(const [a,b] of sg)chink(W,fbLogs[k]-cr/2,Math.max(a,-hx+.1),Math.min(b,hx-.1))}
  if(k<6)for(const name of ["left","right"]){const W=WALLS[name],o=.38+B.rnd()*.2;const r=.145+B.rnd()*.05;const sg=wallLog(W,sdLogs[k],-hz-o,hz+.38+B.rnd()*.2,r);if(k>0)for(const [a,b] of sg)chink(W,sdLogs[k]-cr/2,Math.max(a,-hz+.1),Math.min(b,hz-.1))}
  B.part()}
 // log gables (shortened courses under the roof line) on both side walls
 for(let k=0;k<6;k++){const y=base+.15+.16+(6+k)*cr,r=.14+B.rnd()*.02,Lz=(4.1-y-r*.7)/.687;if(Lz<.32)break;for(const name of ["left","right"]){const W=WALLS[name];wallLog(W,y,-Lz,Lz,r);chink(W,y-cr/2,-Lz+.1,Lz-.1)}B.part()}
 // door jambs: split-log posts pegged to the cut log ends
 B.log([D.x0-.2,D.top+.1,hz+.21],[D.x1+.2,D.top+.11,hz+.21],.08,{mat:"wood",taper:.02,bend:.006,tint:[1.3,1.18,1.02]});
 for(const x of [D.x0,D.x1]){B.log([x+(x===D.x0?.06:-.06),FL+.16,hz],[x+(x===D.x0?.06:-.06),D.top+.02,hz],.085,{taper:.02,mat:"wood",bend:.01});for(const yy of [.8,1.6])B.log([x,yy,hz-.2],[x,yy,hz+.2],.018,{mat:"wood",caps:"end"})}
 B.part();
 // ---- stage 2: interior cob plaster + round clay windows ----
 B.stage=2;
 // exterior cob chinking between the logs goes in with the cob stage, so the plaster stage reads from outside
 for(let k=0;k<chinks.length;k++){chinkNow(...chinks[k]);if(k%12===11)B.part()}B.part();
 const PL=.6,plasterTop=c=>2.2+.06*(n3(c*2.2,0,7)-.5);
 const wallInner=(name,c,y,sd)=>{const W=WALLS[name],lump=.014*(n3(c*2.6,y*2.6,sd)-.5)+.006*(n3(c*8,y*8,sd+1)-.5);// rounded fillets in the corners and at the floor
   const cornerD=W.len-.2-Math.abs(c),fil=cornerD<.2?.06*Math.pow(1-cornerD/.2,2):0,flo=y<FL+.18?.05*Math.pow(1-(y-FL)/.18,2):0;return W.pt(c,y,-(.2+fil+flo)+lump)};
 for(const [name,W] of Object.entries(WALLS)){const sd=B.r()*100,cs=new Set(),ys=new Set(),L=W.len-.2;
  for(let c=-L;c<=L+1e-6;c+=.1)cs.add(+c.toFixed(3));for(let y=FL;y<=2.3;y+=.1)ys.add(+y.toFixed(3));
  const holes=[];for(const op of W.openings){if(op.kind==="win"){const cc=(op.c0+op.c1)/2,yy=op.w.y,R=.44;holes.push({k:"win",c0:cc-R,c1:cc+R,y0:yy-R,y1:yy+R,cc,yy,r:op.w.r});}
   else if(op.kind==="door")holes.push({k:"door",c0:op.c0,c1:op.c1,y0:FL-.01,y1:op.y1});else holes.push({k:"hearth",c0:-.9,c1:.9,y0:FL-.01,y1:1.5})}
  for(const h of holes){cs.add(+h.c0.toFixed(3));cs.add(+h.c1.toFixed(3));ys.add(+Math.max(FL,h.y0).toFixed(3));ys.add(+h.y1.toFixed(3))}
  const C=[...cs].filter(c=>c>=-L-1e-6&&c<=L+1e-6).sort((a,b)=>a-b),Y=[...ys].filter(y=>y>=FL-1e-6&&y<=2.3).sort((a,b)=>a-b);
  B.grid(B.bin("cob"),C.length-1,Y.length-1,(i,j)=>{const c=C[i];let y=Y[j];if(j===Y.length-1)y=plasterTop(c);return wallInner(name,c,y,sd)},(u,v,i,j)=>[C[i]/.8,Y[j]/.8],(u,v,i,j)=>{const w=.95+.1*n3(C[i]*3,Y[j]*3,sd+3);return [w,w*.97,w*.92]},
   {skip:(i,j)=>{const cm=(C[i]+C[i+1])/2,ym=(Y[j]+Y[j+1])/2;return holes.some(h=>cm>h.c0&&cm<h.c1&&ym>h.y0&&ym<h.y1)}});
  // window: polar patch from the square edge into the round reveal, the reveal itself, exterior clay panel and stick frames
  for(const h of holes.filter(h=>h.k==="win")){const N=40,R=.44,sq=th=>{const cs2=Math.cos(th),sn=Math.sin(th);return R/Math.max(Math.abs(cs2),Math.abs(sn))};
   B.grid(B.bin("cob"),N,6,(i,j,u,v)=>{const th=u*6.283,rr=mix(sq(th),h.r+.07,Math.pow(v,.8)),c=h.cc+Math.cos(th)*rr,y=h.yy+Math.sin(th)*rr;const p=wallInner(name,c,y,sd),fl=v>.6?(v-.6)/.4:0;const q=W.pt(c,y,-.2-.03*fl);return v>.6?q:p},(u,v)=>[u*3,v],()=>[.97,.94,.9],{wrapU:true});
   // reveal: flared at both lips
   B.grid(B.bin("cob"),N,6,(i,j,u,v)=>{const th=u*6.283,o=mix(-.23,.13,v),fl=1+.25*Math.pow(Math.abs(v-.5)*2,3),rr=h.r*fl,c=h.cc+Math.cos(th)*rr,y=h.yy+Math.sin(th)*rr;return W.pt(c,y,o)},(u,v)=>[u*3,v*.6],()=>[.92,.88,.82],{wrapU:true,flip:true,ao:.75});
   // exterior clay panel filling the cut in the logs
   const sq2=th=>{const cs2=Math.cos(th),sn=Math.sin(th);return Math.min(.38/Math.max(1e-3,Math.abs(cs2)),.5/Math.max(1e-3,Math.abs(sn)))};
   B.grid(B.bin("cob"),N,5,(i,j,u,v)=>{const th=u*6.283,rr=mix(sq2(th),h.r*1.25,v),c=h.cc+Math.cos(th)*rr,y=h.yy+Math.sin(th)*rr;return W.pt(c,y,.1+.02*(n3(c*5,y*5,sd+7)-.5)-.03*v)},(u,v)=>[u*3,v],()=>[.86,.82,.76],{wrapU:true,flip:true,ao:1});
   // split-log sill and header on the outside so the window reads from the yard
   B.log(W.pt(h.cc-.5,h.yy-.5,.2),W.pt(h.cc+.5,h.yy-.5,.21),.06,{mat:"wood",taper:.02,bend:.004,tint:[1.3,1.18,1.02]});B.log(W.pt(h.cc-.46,h.yy+.5,.19),W.pt(h.cc+.46,h.yy+.5,.19),.05,{mat:"wood",taper:.02,bend:.004,tint:[1.25,1.14,1]});
   // stick ring (octagon of short sticks lashed at the corners) on the outside; sunburst sticks inside
   const ring=[];for(let k=0;k<8;k++){const a=k/8*6.283+.2,rr=h.r*1.32;ring.push([h.cc+Math.cos(a)*rr,h.yy+Math.sin(a)*rr])}
   for(let k=0;k<8;k++){const a=ring[k],b=ring[(k+1)%8],ex=.05;const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);B.log(W.pt(a[0]-dx/l*ex,a[1]-dy/l*ex,.13),W.pt(b[0]+dx/l*ex,b[1]+dy/l*ex,.13),.017,{tone:"stick",bend:.004});
    const p=W.pt(b[0],b[1],.13),ax=W.pt(0,0,1),o0=W.pt(0,0,0);B.lash(p,[ax[0]-o0[0],ax[1]-o0[1],ax[2]-o0[2]],.02,2,{rc:.006})}
   for(let k=0;k<12;k++){const a=k/12*6.283+.13,r0=h.r*1.42,r1=r0+.12+.04*B.rnd();B.log(W.pt(h.cc+Math.cos(a)*r0,h.yy+Math.sin(a)*r0,-.215),W.pt(h.cc+Math.cos(a)*r1,h.yy+Math.sin(a)*r1,-.215),.013,{tone:"stick",fine:false})}
   B.log(W.pt(h.cc-h.r*1.05,h.yy,-.06),W.pt(h.cc+h.r*1.05,h.yy,-.06),.012,{tone:"stick"});B.log(W.pt(h.cc,h.yy-h.r*1.05,-.06),W.pt(h.cc,h.yy+h.r*1.05,-.06),.012,{tone:"stick"});B.lash(W.pt(h.cc,h.yy,-.06),(()=>{const a=W.pt(0,0,1),o=W.pt(0,0,0);return [a[0]-o[0],a[1]-o[1],a[2]-o[2]]})(),.014,3,{rc:.005})}
  // door reveal: clay returns onto the jambs
  for(const h of holes.filter(h=>h.k==="door"))for(const c of [h.c0,h.c1]){const s=c===h.c0?1:-1;B.grid(B.bin("cob"),1,12,(i,j,u,v)=>{const y=mix(FL,h.y1,v);return W.pt(c+s*.005,y,mix(-.21,-.03,u))},(u,v)=>[u*.3,v*2],()=>[.94,.9,.86],{flip:s<0,ao:.6})}
  B.part()}
 // ---- stage 3: hearth (cob surround + firebox) and fieldstone chimney ----
 B.stage=3;
 {const W=WALLS.left,sd=B.r()*100,cy=.62,arch=(th)=>{// opening boundary along a ray from (0,cy)
   const cs=Math.cos(th),sn=Math.sin(th),hw=.46,yb=.3;// rect bottom part + elliptic arch top (a=.46,b=.4) centred at y=.7
   if(sn<0){const tb=(yb-cy)/sn,tw=hw/Math.max(1e-4,Math.abs(cs));return Math.min(tb,tw)}
   let lo=0,hi=1;for(let k=0;k<22;k++){const m=(lo+hi)/2,z=cs*m,y=cy+sn*m;const inside=Math.abs(z)<hw&&(y<.7||((z/hw)**2+((y-.7)/.4)**2)<1);if(inside)lo=m;else hi=m}return lo};
  const outer=th=>{const cs=Math.cos(th),sn=Math.sin(th),tz=.9/Math.max(1e-4,Math.abs(cs)),ty=sn>0?(1.5-cy)/sn:(cy-FL)/Math.max(1e-4,-sn);return Math.min(tz,ty)};
  const bulge=(z,y)=>.26*sstep(.9,.62,Math.abs(z))*sstep(1.5,1.22,y);
  const face=(z,y)=>{const lump=.014*(n3(z*3,y*3,sd)-.5);return W.pt(z,y,-(.2+bulge(z,y))+lump)};
  const N=56;B.grid(B.bin("cob"),N,10,(i,j,u,v)=>{const th=u*6.283,rr=mix(outer(th),arch(th),v),z=Math.cos(th)*rr,y=cy+Math.sin(th)*rr;return face(z,y)},(u,v)=>[u*4,v],()=>[.96,.92,.86],{wrapU:true,flip:true});
  // firebox tunnel: sooty clay from the surround face back into the stack
  const back=-3.56;B.grid(B.bin("cob"),N,6,(i,j,u,v)=>{const th=u*6.283,rr=arch(th),z=Math.cos(th)*rr,y=cy+Math.sin(th)*rr,f=face(z,y);return [mix(f[0],back,v),y,z]},(u,v)=>[u*4,v],(u,v)=>{const s=mix(.55,.13,Math.min(1,v*1.3));return [s,s*.92,s*.85]},{wrapU:true,ao:.4});
  B.grid(B.bin("cob"),N,3,(i,j,u,v)=>{const th=u*6.283,rr=arch(th)*(1-v),z=Math.cos(th)*rr,y=cy+Math.sin(th)*rr;return [back,y,z]},(u,v)=>[u*2,v],()=>[.1,.09,.08],{wrapU:true,ao:.3});
  // hearth stones (floor of the firebox and the apron in the room)
  B.stone(-3.05,.24,0,.52,.06,.5,0,{box:.3,tint:[.55,.52,.5]});for(const [x,z] of [[-2.32,-.42],[-2.3,.38],[-2.0,0]])B.stone(x,FL+.03,z,.3,.045,.36,B.rnd(),{box:.35});
  B.part();
  // mantel shelf: split log on two pegs
  B.log([-2.34,1.5,-1.0],[-2.34,1.5,1.0],.11,{bend:.01,mat:"wood"});B.part()}
 {const sd=B.r()*100,xs=(y)=>y<2.0?[CH.x0,CH.x1,CH.z0,CH.z1]:y<2.5?[mix(CH.x0,-3.88,(y-2)/.5),mix(CH.x1,-3.22,(y-2)/.5),mix(CH.z0,-.38,(y-2)/.5),mix(CH.z1,.38,(y-2)/.5)]:[-3.88,-3.22,-.38,.38];
  // mortar core
  const core=(face)=>{B.grid(B.bin("cob"),6,30,(i,j,u,v)=>{const y=mix(yFoot,CH.top-.05,v),[x0,x1,z0,z1]=xs(y),e=.05;if(face==="x0")return [x0+e,y,mix(z1-e,z0+e,u)];if(face==="z0")return [mix(x0+e,x1-e,u),y,z0+e];if(face==="z1")return [mix(x1-e,x0+e,u),y,z1-e];return [x1-e,y,mix(z0+e,z1-e,u)]},(u,v)=>[u,v*4],()=>[.7,.68,.64],{})};
  for(const f of ["x0","z0","z1","x1"])core(f);
  let y=yFoot,row=0;while(y<CH.top-.02){const hh=Math.min(CH.top-y,.12+B.rnd()*.1),ym=y+hh/2,[x0,x1,z0,z1]=xs(ym);
   const faces=[["x0",z1,z0,c=>[x0,c],Math.PI/2],["z0",x0,x1,c=>[c,z0],0],["z1",x1,x0,c=>[c,z1],0]];if(ym>2.0)faces.push(["x1",z0,z1,c=>[x1,c],Math.PI/2]);
   for(const [f,a,b,P,yaw] of faces){const dir=Math.sign(b-a),len=Math.abs(b-a);let c=(B.rnd()*.15)*(row%2?1:.3);
    while(c<len){const l=Math.min(len-c,.18+B.rnd()*.24);if(l<.08)break;const cc=a+dir*(c+l/2),[px,pz]=P(cc),gr=g(px,pz);
     if(ym+hh/2>gr-.1){const ox=f==="x0"?-1:f==="x1"?1:0,oz=f==="z0"?-1:f==="z1"?1:0,dep=.08+B.rnd()*.04;B.stone(px+ox*.02,ym,pz+oz*.02,l/2*1.06,hh/2*1.1,dep,yaw,{box:.5})}
     c+=l}}
   y+=hh;row++;if(row%4===0)B.part()}
  // cap slab and the dark flue
  B.stone(-3.55,CH.top+.03,0,.4,.05,.44,.05,{box:.3});B.quad("cob",[-3.72,CH.top+.081,-.2],[.34,0,0],[0,0,.4],[.05,.045,.04],{ao:.2});
  B.part()}
 // ---- stage 4: roof — tie beams, ridge, purlins, rafters, stick ceiling, bark, sod and grass ----
 B.stage=4;const XL=-hx-.3,XR=hx+H.ovX,ZE=hz+H.ovZ,yR=houseRoofY;
 for(const x of [-1.35,.3,1.75])B.log([x,H.plate-.07,-hz-.32],[x,H.plate-.07,hz+.32],.12,{bend:.02});B.part();
 B.log([XL-.12,3.96,0],[XR+.12,3.96,0],.14,{bend:.03});for(const sg of [-1,1])B.log([XL-.1,yR(1.15)-.13,sg*1.15],[XR+.1,yR(1.15)-.13,sg*1.15],.13,{bend:.03});B.part();
 const nRf=Math.round((XR-XL-.2)/.6);for(let k=0;k<=nRf;k++){const x=XL+.1+k*(XR-XL-.2)/nRf+(B.rnd()-.5)*.05;for(const sg of [-1,1])B.log([x,yR(ZE)-.065,sg*ZE],[x,4.1-.03,sg*.05],.065,{taper:.15,bend:.02});if(k%3===2)B.part()}
 B.part();
 // stick ceiling laid across the rafters
 for(const sg of [-1,1]){for(let d=.05;d<ZE-.02;d+=.052){const z=sg*(ZE-d),y=yR(z)+.024,split=mix(XL,XR,.45+.1*B.rnd());for(const [a,b] of [[XL-.02,split+.12],[split-.12,XR+.02]])B.log([a,y+(B.rnd()-.5)*.008,z],[b,y+(B.rnd()-.5)*.008,z+(B.rnd()-.5)*.02],.02+B.rnd()*.006,{tone:"stick",bend:.015,nu:5,step:.5,fine:false,shadow:true})}B.part()}
 // bark layer and sod (smooth crest over the ridge)
 const ySod=z=>4.1-.687*Math.sqrt(z*z+.05)+.687*Math.sqrt(.05);
 {const sd=B.r()*100,nX=Math.ceil((XR-XL)/.18),nZ=34;
  B.grid(B.bin("bark"),nX,nZ,(i,j,u,v)=>{const x=mix(XL-.06,XR+.06,u),z=mix(-ZE-.04,ZE+.04,v);return [x,ySod(z)+.06+.008*n3(x*3,z*3,sd),z]},(u,v)=>[u*(XR-XL)/.6,v*2*ZE/.9],(u,v)=>{const w=.8+.3*n3(u*12,v*8,sd+1);return [w,w*.95,w*.9]},{});
  const sodT=(x,z)=>{const e=Math.min(1,(ZE-Math.abs(z))/.12,(x-XL)/.12,(XR-x)/.12);return .14+.12*Math.max(0,e)+.05*(n3(x*1.7,z*1.7,sd+2)-.5)+.02*(n3(x*6,z*6,sd+3)-.5)};
  B.grid(B.bin("sod"),Math.ceil((XR-XL)/.12),44,(i,j,u,v)=>{const x=mix(XL,XR,u),z=mix(-ZE,ZE,v);return [x,ySod(z)+.07+sodT(x,z),z]},(u,v)=>[u*(XR-XL)/1.2,v*2*ZE/1.2],(u,v)=>{const w=.85+.25*n3(u*10,v*6,sd+4);return [w,w,w*.95]},{ao:1,noAO:true});
  // soil edges of the sod (eaves and verges)
  for(const sg of [-1,1])B.grid(B.bin("sod"),Math.ceil((XR-XL)/.15),1,(i,j,u,v)=>{const x=mix(XL,XR,u),z=sg*ZE;return [x,ySod(z)+.06+v*(.07+sodT(x,z)),z+sg*.01]},(u,v)=>[u*(XR-XL)/.4,v*.3],()=>[.42,.36,.3],{flip:sg<0,noAO:true});
  for(const [x,sg] of [[XL,-1],[XR,1]])B.grid(B.bin("sod"),40,1,(i,j,u,v)=>{const z=mix(-ZE,ZE,u);return [x+sg*.01,ySod(z)+.06+v*(.07+sodT(x,z)),z]},(u,v)=>[u*2*ZE/.4,v*.3],()=>[.42,.36,.3],{flip:sg>0,noAO:true});
  B.part();
  // turf-retaining eave logs on wooden hooks
  for(const sg of [-1,1]){const z=sg*(ZE-.08);B.log([XL-.05,ySod(z)+.17,z],[XR+.05,ySod(z)+.17,z],.085,{bend:.03});for(let x=XL+.3;x<XR;x+=.95)B.log([x,ySod(z)+.06,z-sg*.05],[x,ySod(z)+.26,z+sg*.03],.02,{tone:"stick"})}
  B.part();
  // grass cards: denser and taller along the ridge and the edges
  const gc=Math.round((XR-XL)*2*ZE*70);for(let k=0;k<gc;k++){const x=mix(XL+.05,XR-.05,B.r()),z=mix(-ZE+.05,ZE-.05,B.r()),edge=Math.min(ZE-Math.abs(z),x-XL,XR-x),rid=Math.abs(z)<.4?1:0;
   if(n3(x*1.3,z*1.3,sd+9)<.25&&B.r()<.6)continue;const h=(.12+.2*B.r())*(1+.5*rid+(edge<.3?.4:0)),dry=B.r()<.18;const tint=dry?[1.15,.95,.55]:[.55+.3*B.r(),.75+.3*B.r(),.4+.15*B.r()];
   B.card("grass",[x,ySod(z)+.07+sodT(x,z)-.03,z],.14+.1*B.r(),h,B.r()*6.28,(B.r()-.5)*.6,tint,{ao:1})}
  // turf overhang: long grass and moss tufts hanging over the eaves and verges
  {const hang=(x,z,ox,oz)=>{const phi=Math.atan2(oz,ox),h=.2+.22*B.r(),dry=B.r()<.15,tint=dry?[1.1,.92,.55]:B.r()<.3?[.42+.15*B.r(),.55+.2*B.r(),.28]:[.6+.3*B.r(),.8+.25*B.r(),.42+.12*B.r()];
    B.card("grass",[x,ySod(z)+.06+sodT(x,z)*.8,z],.16+.12*B.r(),h,phi-.7+(B.r()-.5)*.5,1.3+.7*B.r(),tint,{ao:1})};
   for(const sg of [-1,1])for(let x=XL;x<XR;x+=.07+.05*B.r())hang(x,sg*(ZE-.03),0,sg);
   for(const [x,sg] of [[XL+.03,-1],[XR-.03,1]])for(let z=-ZE;z<ZE;z+=.08+.05*B.r())hang(x,z,sg,0);
   for(let k=0;k<160;k++){const ed=B.r()<.5,sg=B.r()<.5?-1:1,x=ed?mix(XL,XR,B.r()):(sg<0?XL+.1:XR-.1),z=ed?sg*(ZE-.12):mix(-ZE,ZE,B.r());
    B.card("moss",[x,ySod(z)+.05+sodT(x,z),z],.22+.18*B.r(),.08+.06*B.r(),B.r()*6.28,1.35,[.65+.2*B.r(),.8+.2*B.r(),.5],{ao:1,n:1})}}
  // a few yellow and white wildflowers
  for(let k=0;k<70;k++){const x=mix(XL+.2,XR-.2,B.r()),z=mix(-ZE+.2,ZE-.2,B.r());B.card("grass",[x,ySod(z)+.07+sodT(x,z)-.02,z],.07,.18+.1*B.r(),B.r()*6.28,.1,B.r()<.5?[1.6,1.4,.4]:[1.7,1.7,1.6],{ao:1,n:1})}
  B.part()}
 // ---- stage 5: fit-out (bed, shelves, stool, firewood, herbs); the door leaf is its own pivot ----
 B.stage=5;
 {const Bd=H.bed,sd=B.r()*100,top=FL+Bd.h,prof=(t)=>{// profile across the bench (z from wall to front edge), then rounded down the front face
   const d=Bd.z1-Bd.z0;if(t<.72)return [Bd.z0+t/.72*(d-.1),top+.012*Math.sin(t*9)];const a=(t-.72)/.28*Math.PI/2;return [Bd.z1-.1+Math.sin(a)*.1,top-(1-Math.cos(a))*.1-(t>.98?(top-FL-.1)*((t-.98)/.02):0)]};
  B.grid(B.bin("cob"),Math.ceil((Bd.x1-Bd.x0)/.1),20,(i,j,u,v)=>{const x=mix(Bd.x1,Bd.x0+.12,u);let [z,y]=prof(v);if(v>.97){y=mix(top-.1,FL,(v-.97)/.03)}return [x,y+.01*(n3(x*4,z*4,sd)-.5),z]},(u,v)=>[u*2,v*1.2],()=>[.9,.84,.78],{flip:true});
  // rounded end of the bench
  B.grid(B.bin("cob"),8,16,(i,j,u,v)=>{const a=u*Math.PI/2,[z,y0]=prof(v*.72),yb=FL,y=v>.92?mix(y0,yb,(v-.92)/.08):y0,r=.12;return [Bd.x0+.12-Math.sin(a)*r*(1-.0),y-(1-Math.cos(a))*.05,z]},(u,v)=>[u,v],()=>[.9,.84,.78],{});
  B.grid(B.bin("cob"),8,6,(i,j,u,v)=>{const z=mix(Bd.z0,Bd.z1-.02,u),y=mix(FL,top-.06,v);return [Bd.x0+.0+.01*(n3(z*5,y*5,sd)-.5),y,z]},(u,v)=>[u,v],()=>[.88,.82,.76],{flip:true});
  B.part();
  // woven grass mat, moss mattress, fur pelt draped over the front, feather pillow
  const mt=(x,z)=>top+.02;B.grid(B.bin("thatch"),12,8,(i,j,u,v)=>{const x=mix(Bd.x0+.08,Bd.x1-.05,u),z=mix(Bd.z0+.03,Bd.z1-.04,v);return [x,mt(x,z)+.015*n3(x*6,z*6,sd),z]},(u,v)=>[u*2.4,v*1.6],()=>[.95,.88,.7],{});
  B.grid(B.bin("moss"),14,10,(i,j,u,v)=>{const x=mix(Bd.x0+.14,Bd.x1-.1,u),z=mix(Bd.z0+.07,Bd.z1-.1,v),h=.09*Math.pow(Math.sin(Math.PI*u),.3)*Math.pow(Math.sin(Math.PI*v),.4)+.025*n3(x*6,z*6,sd+5);return [x,mt(x,z)+.02+h,z]},(u,v)=>[u*2,v*1.2],()=>[1,1,1],{});
  const pelt=(x,z)=>{const e=(x-Bd.x0-.35)/1.5,f=(z-Bd.z0-.1)/.95,r=Math.hypot((e-.5)*2,(f-.5)*2)+.25*(n3(x*3,z*3,sd+6)-.5);return r};
  B.grid(B.bin("fur"),22,16,(i,j,u,v)=>{const x=mix(Bd.x0+.3,Bd.x1-.35,u),zr=mix(Bd.z0+.12,Bd.z1+.16,v);let z=zr,y=mt(x,z)+.13+.03*n3(x*5,z*5,sd+7)+.03*Math.sin(Math.PI*u);if(zr>Bd.z1-.08){const o=zr-(Bd.z1-.08);z=Bd.z1-.08+Math.min(o,.07)+.015;y=top+.1-o*1.4}return [x,y,z]},(u,v)=>[u*1.6,v*1.1],(u,v)=>{const w=.95+.12*n3(u*4,v*4,sd+8);return [w,w*.96,w*.92]},
   {skip:(i,j)=>{const u=(i+.5)/22,v=(j+.5)/16;return Math.hypot((u-.5)*2,(v-.5)*2)+.3*(n3(u*5,v*5,sd+6)-.5)>1.18}});
  // pillow: lumpy hide bag stuffed with feathers
  B.grid(B.bin("fur"),12,8,(i,j,u,v)=>{const th=u*6.283,ph=v*Math.PI,x=Bd.x1-.28+Math.sin(ph)*Math.cos(th)*.2,y=mt(0,0)+.2+Math.cos(ph)*.08,z=(Bd.z0+Bd.z1)/2-.04+Math.sin(ph)*Math.sin(th)*.32;const l=1+.08*(n3(x*9,y*9,sd)-.5);return [x*1+(x-(Bd.x1-.28))*(l-1),y,z]},(u,v)=>[u*2,v],()=>[1.15,1.08,.98],{wrapU:true,center:[Bd.x1-.28,mt(0,0)+.2,(Bd.z0+Bd.z1)/2]});
  for(let k=0;k<16;k++){const x=k<9?mix(Bd.x1-.5,Bd.x1-.08,B.r()):mix(Bd.x0-.2,Bd.x1,B.r()),z=k<9?mix(Bd.z0+.1,Bd.z1-.1,B.r()):mix(Bd.z1+.05,Bd.z1+.55,B.r()),y=k<9?mt(0,0)+.25+.04*B.r():FL+.005;
   B.card("feather",[x,y,z],.05+.02*B.r(),.11+.05*B.r(),B.r()*6.28,1.35+.2*B.r(),[1,1,1],{n:1,shadow:false,up:true})}
  B.part();
  // shelves on the back wall: split planks on driven pegs, with pots, a bowl, cordage and a bundle of herbs
  const S=H.shelf,zW=-hz+.2;for(const y of [1.32,1.78]){B.grid(B.bin("wood"),10,3,(i,j,u,v)=>{const x=mix(S.x0,S.x1,u),z=mix(zW+.005,zW+.3,v),y2=y+.035*Math.sin(Math.PI*v)**.4;return [x,y2,z]},(u,v)=>[u*.5,v*2.2],()=>B.tint(),{});
   B.grid(B.bin("wood"),10,1,(i,j,u,v)=>{const x=mix(S.x0,S.x1,u);return [x,y-v*.035,zW+.3]},(u,v)=>[u*.5,v*.1],()=>[.8,.76,.7],{});
   for(const x of [S.x0+.18,S.x1-.18])B.log([x,y-.04,zW-.08],[x,y-.06,zW+.26],.025,{mat:"wood",caps:"end"})}
  const pot=(x,y,z,s,tone)=>{B.grid(B.bin("cob"),12,8,(i,j,u,v)=>{const th=u*6.283,r=s*(.55+.45*Math.sin(Math.PI*Math.min(1,v*1.1+.05))-(v>.9?.15:0)),yy=y+v*s*1.6;return [x+Math.cos(th)*r,yy,z+Math.sin(th)*r]},(u,v)=>[u*2,v],()=>tone,{wrapU:true})};
  pot(S.x0+.3,1.35,zW+.15,.09,[.75,.5,.36]);pot(S.x0+.55,1.35,zW+.15,.07,[.6,.42,.3]);pot(S.x1-.35,1.81,zW+.15,.1,[.7,.5,.38]);pot(-2.2,1.61,-.55,.06,[.55,.4,.3]);
  B.grid(B.bin("wood"),12,4,(i,j,u,v)=>{const th=u*6.283,r=.12*Math.sin(Math.PI/2*Math.min(1,v*1.2+.2));return [S.x1-.55+Math.cos(th)*r,1.82+v*.06,zW+.15+Math.sin(th)*r]},(u,v)=>[u,v],()=>[.7,.6,.5],{wrapU:true});
  B.lash([S.x0+.25,1.86,zW+.15],[0,1,0],.06,5,{rc:.012,tilt:.1});
  B.part();
  // herbs drying from the tie beam, a log stool by the fire, split firewood stacked beside the hearth
  for(const [x,z] of [[-1.35,.7],[-1.35,-.2],[.3,1.1]]){B.log([x,H.plate-.2,z],[x,H.plate-.5,z],.003,{mat:"cord",caps:false});for(let k=0;k<9;k++){const a=k/9*6.28;B.log([x,H.plate-.5,z],[x+Math.cos(a)*.08,H.plate-.85-.06*B.r(),z+Math.sin(a)*.08],.008,{tone:"stick",caps:false,nu:4})}
   for(let k=0;k<6;k++)B.card("grass",[x+(B.r()-.5)*.1,H.plate-.95,z+(B.r()-.5)*.1],.12,.35,B.r()*6,3.0,[.6,.75,.35],{n:1,shadow:false})}
  B.log([-1.55,FL,1.0],[-1.55,FL+.42,1.0],.2,{taper:0,bend:0,bump:.04});
  for(let k=0;k<7;k++){const row=k<4?0:1,x=-2.35+(row?.08:0)+(B.rnd()-.5)*.03,z=-1.55+(k%4)*.16-row*.08+(B.rnd()-.5)*.03,y=FL+.07+row*.13;B.log([x-.28,y,z],[x+.28,y+(B.rnd()-.5)*.03,z],.065+B.rnd()*.015,{bend:.01})}
  B.part()}
 // outside: split-log woodpile under the right eave, a chopping stump with a split log, stepping stones down from the door
 {const wx=hx+.62,z0=-2.15,z1=-.95;let row=0;for(let y=0;y<.85;y+=.15,row++){for(let z=z0+(row%2)*.07;z<z1-.05;z+=.15){const gy=g(wx,z)+.07+y,rr=.06+.025*B.rnd(),L=.42+.08*B.rnd(),jx=(B.rnd()-.5)*.06;
   B.log([wx-L/2+jx,gy,z],[wx+L/2+jx,gy+(B.rnd()-.5)*.02,z+(B.rnd()-.5)*.03],rr,{bend:.005,taper:.04,nu:7,tint:logTint(),fine:true,shadow:true})}}
  for(const z of [z0-.08,z1+.08])B.log([wx,g(wx,z)-.05,z],[wx+(B.rnd()-.5)*.05,g(wx,z)+.95,z],.035,{tone:"stick",fine:true});B.part()
  const sx=hx+1.25,sz=hz+1.05,sg=g(sx,sz);B.log([sx,sg-.1,sz],[sx,sg+.42,sz],.27,{taper:.1,bend:0,bump:.1,caps:"end"});
  B.log([sx+.42,g(sx+.42,sz+.15)+.07,sz+.15],[sx+.85,g(sx+.85,sz+.35)+.08,sz+.35],.085,{bend:.01,tint:logTint()});
  for(let k=0;k<26;k++){const a=B.r()*6.283,rd=.35+.55*B.r(),x=sx+Math.cos(a)*rd,z=sz+Math.sin(a)*rd;B.card("wood",[x,g(x,z)+.012,z],.06+.05*B.r(),.03+.03*B.r(),B.r()*6.28,1.45,[.95,.9,.8],{n:1,up:true,ao:1})}
  const px=(D.x0+D.x1)/2;for(let k=0;k<6;k++){const z=hz+1.15+k*.55+(B.rnd()-.5)*.08,x=px+.12*Math.sin(k*1.3)+(B.rnd()-.5)*.1,gz=g(x,z);B.stone(x,gz+.005,z,.2+.06*B.rnd(),.05,.17+.05*B.rnd(),B.rnd()*3,{box:.35,tint:stoneTint()})}
  B.part()}
 // site markers
 B.stage=6;for(const [x,z] of [[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]])B.log([x,g(x,z)-.05,z],[x,g(x,z)+.6,z],.025,{tone:"stick"});
 for(const [a,b] of [[[-hx,-hz],[hx,-hz]],[[hx,-hz],[hx,hz]],[[hx,hz],[-hx,hz]],[[-hx,hz],[-hx,-hz]]])B.log([a[0],g(a[0],a[1])+.5,a[1]],[b[0],g(b[0],b[1])+.5,b[1]],.005,{mat:"cord",caps:false,bend:.02});B.part();
 const st=B.finish(root);root.userData.stages=st.slice(0,6);root.userData.site=st[6];
 // ---- door leaf on its pole hinge (own builder → own pivot group) ----
 const pivot=new T.Group();pivot.name="door";pivot.position.set(D.x0+.02,FL,hz-.02);root.add(pivot);
 {const DB=new Builder((opt.seed??2311)+7,(x,y,z)=>1),w=D.x1-D.x0-.07,h=D.top-FL-.04;DB.stage=0;
  // hinge pole
  DB.log([0,-.02,0],[0,h+.12,0],.045,{mat:"wood",taper:.05,bend:.005});
  let x=.03;const widths=[];while(x<w-.02){const pw=Math.min(w-x,.19+DB.rnd()*.06);widths.push([x,pw]);x+=pw}
  for(const [x0,pw] of widths){const sd=DB.r()*100,top=h-.01-.04*DB.r();
   // split plank: convex outer face, flat inner face
   DB.grid(DB.bin("wood"),5,10,(i,j,u,v)=>{const xx=x0+u*pw,yy=v*top,b=.022*Math.sin(Math.PI*u)+.004*n3(xx*20,yy*3,sd);return [xx,yy,.02+b]},(u,v)=>[u*pw/.5+sd,v*top/1.6],()=>DB.tint(),{});
   DB.grid(DB.bin("wood"),1,1,(i,j,u,v)=>[x0+u*pw,v*top,-.02],(u,v)=>[u*.4,v*1.2],()=>[.9,.86,.8],{flip:true,ao:.5});
   for(const [ea,sg] of [[x0,-1],[x0+pw,1]])DB.grid(DB.bin("wood"),1,1,(i,j,u,v)=>[ea,v*top,mix(-.02,.02,u)],(u,v)=>[u*.05,v],()=>[.7,.65,.6],{flip:sg<0});
   DB.grid(DB.bin("end"),5,1,(i,j,u,v)=>{const xx=x0+u*pw;return [xx,top,mix(-.02,.02+.022*Math.sin(Math.PI*u),v)]},(u,v)=>[u*.3+.2,v*.1+.5],()=>[.8,.75,.7],{flip:true})}
  // inside battens + diagonal brace, wrapped round the hinge pole with cordage
  for(const y of [.32,h-.35]){DB.log([-.02,y,-.045],[w-.05,y,-.045],.032,{mat:"wood",bend:.005});DB.lash([0,y,0],[0,1,0],.05,3,{rc:.008})}
  DB.log([w-.1,.36,-.05],[.1,h-.4,-.05],.028,{mat:"wood"});
  // latch: a wooden drop-bar pinned on the leaf, a pull cord through a hole, and a bent-branch handle outside
  DB.log([w-.42,1.05,-.075],[w+.1,1.07,-.075],.02,{mat:"wood"});DB.log([w-.38,1.05,-.1],[w-.38,1.05,-.02],.012,{mat:"wood"});
  DB.log([w-.15,1.12,.03],[w-.15,1.12,.12],.004,{mat:"cord",caps:false});
  {const hb=DB.bin("bark");DB.grid(hb,6,12,(i,j,u,v)=>{const a=v*Math.PI,cx=w-.16,cy=1.0+Math.cos(a)*.11,cz=.05+Math.sin(a)*.06,th=u*6.283,r=.013;return [cx+Math.cos(th)*r,cy,cz+Math.sin(th)*r]},(u,v)=>[u,v*2],()=>[.8,.75,.7],{wrapU:true})}
  DB.part();const dst=DB.finish(pivot);for(const g2 of dst)for(const m of g2.children){m.castShadow=true}
  proxy(root,6,w/2,h/2,0,w,h,.1,0,0,0,pivot)}
 // static latch catch on the jamb, hinge sockets
 const extra=new Builder((opt.seed??2311)+9,houseAO);extra.stage=0;extra.log([D.x1-.08,FL+1.02,hz-.16],[D.x1-.08,FL+1.13,hz-.16],.035,{mat:"wood"});extra.log([D.x0+.02,D.top+.0,hz-.02],[D.x0+.02,D.top+.12,hz-.02],.07,{mat:"wood"});extra.stone(D.x0+.02,FL+.0,hz-.02,.1,.05,.1,0,{tint:[.6,.58,.55]});extra.part();
 const ex=extra.finish(root);ex[0].name="doorStatic";root.userData.doorStatic=ex[0];
 root.userData.door=pivot;
 // proxies (walls, roof, chimney, bed)
 proxy(root,-1,0,.2,0,2*hx+.5,.4,2*hz+.5);
 proxy(root,1,0,1.35,hz,2*hx+.4,2.4,.34);proxy(root,1,0,1.35,-hz,2*hx+.4,2.4,.34);proxy(root,1,hx,1.35,0,.34,2.4,2*hz);proxy(root,1,-hx,1.35,0,.34,2.4,2*hz);
 const ang=Math.atan2(4.1-yR(ZE),ZE),sl=Math.hypot(4.1-yR(ZE),ZE);for(const sg of [-1,1])proxy(root,4,(XL+XR)/2,(4.1+yR(ZE))/2+.15,sg*ZE/2,XR-XL,.3,sl,-sg*ang);
 proxy(root,3,(CH.x0+CH.x1)/2,CH.top/2,0,CH.x1-CH.x0,CH.top,CH.z1-CH.z0);
 const Bd=H.bed;proxy(root,5,(Bd.x0+Bd.x1)/2,FL+Bd.h/2,(Bd.z0+Bd.z1)/2,Bd.x1-Bd.x0,Bd.h+.1,Bd.z1-Bd.z0);
 root.userData.hearth={fire:HE.fire.slice(),smoke:[-3.55,CH.top+.12,0],dir:[1,0,0]};
 return root}

/* ================= WATER WHEEL (spring-fed overshot wheel with a trip-hammer) ================= */
function wheelAO(x,y,z){return 1-.3*Math.exp(-Math.max(0,y)/.35)}
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
/* split board / block: centre c, half-extent vectors u (grain) and v, half-thickness t along u×v */
function slab(B,mat,c,u,v,t,tint,o={}){const n=cross3(u,v),l=Math.hypot(...n)||1,w=n.map(q=>q/l*t),bin=B.bin(mat,o.fine,o.shadow),sd=B.r()*9;
 const P=(a,b,d)=>[c[0]+a*u[0]+b*v[0]+d*w[0],c[1]+a*u[1]+b*v[1]+d*w[1],c[2]+a*u[2]+b*v[2]+d*w[2]],D=x=>x.map(q=>q*2),lu=Math.hypot(...u)*2,lv=Math.hypot(...v)*2,lw=t*2,dk=tint.map(q=>q*.8);
 const F=(o0,a,b,la,lb,grainA,tn)=>B.grid(bin,1,1,(i,j,s,q)=>[o0[0]+a[0]*s+b[0]*q,o0[1]+a[1]*s+b[1]*q,o0[2]+a[2]*s+b[2]*q],(s,q)=>grainA?[q*lb/.5+sd,s*la/1.6]:[s*la/.5+sd,q*lb/1.6],()=>tn,{ao:o.ao});
 F(P(-1,-1,1),D(u),D(v),lu,lv,true,tint);F(P(-1,-1,-1),D(v),D(u),lv,lu,false,tint);
 F(P(-1,1,-1),D(w),D(u),lw,lu,false,dk);F(P(-1,-1,-1),D(u),D(w),lu,lw,true,dk);
 F(P(1,-1,-1),D(v),D(w),lv,lw,false,dk);F(P(-1,-1,-1),D(w),D(v),lw,lv,false,dk)}
/* water: a flattened tube along a polyline (falls, spouts) or a flat ribbon (streams, flume); v runs downstream so the
   shared water texture scrolls with the flow */
function waterTube(B,pts,wa,wb,tint){const bin=B.bin("water",false,false),n=pts.length,L=[0];for(let i=1;i<n;i++)L.push(L[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1],pts[i][2]-pts[i-1][2]));
 const fr=i=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(n-1,i+1)];let t=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];const l=Math.hypot(...t)||1;t=t.map(q=>q/l);
  let e1=Math.abs(t[1])>.95?[1,0,0]:cross3([0,1,0],t);const l1=Math.hypot(...e1)||1;e1=e1.map(q=>q/l1);return [e1,cross3(t,e1)]};
 B.grid(bin,8,n-1,(i,j,u)=>{const p=pts[j],[e1,e2]=fr(j),th=u*6.283,A=(typeof wa==="function"?wa(j/(n-1)):wa),Bb=(typeof wb==="function"?wb(j/(n-1)):wb);
  return [p[0]+e1[0]*Math.cos(th)*A+e2[0]*Math.sin(th)*Bb,p[1]+e1[1]*Math.cos(th)*A+e2[1]*Math.sin(th)*Bb,p[2]+e1[2]*Math.cos(th)*A+e2[2]*Math.sin(th)*Bb]},
  (u,v,i,j)=>[u*2,L[j]/1.1],()=>tint,{wrapU:true,noAO:true,ao:1})}
function waterRibbon(B,pts,w,tint,mat="water"){const bin=B.bin(mat,false,mat!=="water"),n=pts.length,L=[0];for(let i=1;i<n;i++)L.push(L[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][2]-pts[i-1][2]));
 B.grid(bin,2,n-1,(i,j,u)=>{const p=pts[j],a=pts[Math.max(0,j-1)],b=pts[Math.min(n-1,j+1)],tx=b[0]-a[0],tz=b[2]-a[2],l=Math.hypot(tx,tz)||1,ww=(typeof w==="function"?w(j/(n-1)):w)*(u-.5);
  return [p[0]-tz/l*ww,p[1]+(mat==="water"?0:-.015)*Math.abs(u-.5)*0,p[2]+tx/l*ww]},(u,v,i,j)=>[u*.8,L[j]/1.1],()=>tint,{noAO:mat==="water",ao:mat==="water"?1:undefined})}
let SPRAY_MAT=null;
export function buildWaterwheel(opt={}){const S=WHEELSITE,WH=WHEEL,seed=opt.seed??3301,g=opt.ground||ZERO,root=new T.Group();root.name="waterwheel";root.userData={type:"waterwheel",proxies:[]};
 const B=new Builder(seed,wheelAO),RB=new Builder(seed+1,wheelAO),WB=new Builder(seed+2,()=>.95),HB=new Builder(seed+3,()=>.95),GB=new Builder(seed+4,()=>.95),AQ=new Builder(seed+5,()=>1);
 const K=S.rock,FL=S.flume,R=WH.R,hw=WH.width/2,HM=WH.hammer,[hpx,hpy]=HM.pivot,hz=S.hammer.z;
 const TONES=[[1.02,1,.98],[1.12,1.02,.86],[.8,.78,.76],[1.15,.98,.8],[.92,.98,.88],[1.06,.9,.78],[1.2,1.15,1.06],[.86,.84,.8]],stoneTint=(b,k=1)=>{const t=TONES[Math.floor(b.r()*TONES.length)],q=(.82+.3*b.r())*k;return [t[0]*q,t[1]*q,t[2]*q]};
 const wet=t=>[t[0]*.6,t[1]*.6,t[2]*.58],wood=b=>b.tint(),fy=x=>FL.y+.16+.05*(FL.x1-x)/(FL.x1-FL.x0);   // flume axis height (falls 5 cm to the wheel)
 // ---------- spring outcrop (always there): stacked boulders, ledges, grass ----------
 {// a weathered outcrop: big bedded blocks at the foot, smaller ones stepping in toward the spring on top,
  // each course offset like rough bond, with random bedding tilt, size and squareness
  const cx=(K.x0+K.x1)/2,cz=(K.z0+K.z1)/2,hx0=(K.x1-K.x0)/2,hz0=(K.z1-K.z0)/2;let y=0,k=0;
  while(y<K.top-.35){const f=y/K.top,hx=hx0*(1-.28*f),hz=hz0*(1-.2*f),sz=mix(.95,.5,f),h=sz*RB.rnd(.62,.85),per=2*(hx+hz),n=Math.max(6,Math.round(per/(sz*1.35))),ph=RB.r();
   for(let i=0;i<n;i++){const t=((i+ph+(k%2)*.5)/n)%1,L=t*per;let x,z,nx,nz;
    if(L<2*hx){x=cx-hx+L;z=cz+hz;nx=0;nz=1}else if(L<2*hx+2*hz){x=cx+hx;z=cz+hz-(L-2*hx);nx=1;nz=0}else if(L<4*hx+2*hz){x=cx+hx-(L-2*hx-2*hz);z=cz-hz;nx=0;nz=-1}else{x=cx-hx;z=cz-hz+(L-4*hx-2*hz);nx=-1;nz=0}
    const s=sz*RB.rnd(.75,1.25),in_=RB.rnd(-.12,.08)+s*.35;x-=nx*in_;z-=nz*in_;if(z>K.z1-.4&&Math.abs(x+4.3)<.36&&y>.4)z-=.25;   // the fall cuts a notch in the front face
    const yy=y<.2?g(x,z)+h*.45:y+h*.5+RB.rnd(-.07,.07);RB.stone(x,yy,z,s*RB.rnd(.85,1.1),h*.52,s*RB.rnd(.7,.95),(nx?Math.PI/2:0)+RB.rnd(-.35,.35),{tint:stoneTint(RB,mix(.82,1.02,f)),nu:9,nv:6,box:RB.rnd(.3,.55)})}
   // fill the core so no gap shows through
   RB.stone(cx,y+h*.5,cz,hx*.8,h*.55,hz*.8,RB.rnd(0,.3),{tint:stoneTint(RB,.75),nu:7,nv:5,box:.3});
   y+=h*.9;k++;RB.part()}
  // capping slabs around the spring hollow, moss-tinted
  for(let i=0;i<9;i++){const a=i/9*6.283+RB.rnd(-.2,.2),rr=RB.rnd(1.0,1.45),x=-4.45+Math.cos(a)*rr*.8,z=Math.sin(a)*rr*.95;if(x<K.x0+.3||x>K.x1-.15||Math.abs(z)>hz0-.15)continue;
   RB.stone(x,K.top-.22+RB.rnd(-.05,.05),z,RB.rnd(.35,.55),RB.rnd(.12,.2),RB.rnd(.3,.45),RB.rnd(0,3),{tint:[.82,.9,.7].map(q=>q*RB.rnd(.85,1.05)),nu:8,nv:5,box:.4})}
  RB.part()
  // spring hollow lip, the front lip the overflow spills from, and a few fallen stones in the pool below
  for(let k=0;k<7;k++){const a=k/7*6.283,x=-4.45+Math.cos(a)*.62,z=Math.sin(a)*.55;RB.stone(x,3.42,z,.26,.16,.22,a,{tint:stoneTint(RB)})}
  RB.stone(-4.3,3.34,1.6,.3,.1,.22,.3,{tint:stoneTint(RB,.85)});
  for(let k=0;k<6;k++){const a=k/6*6.283,x=-4.3+Math.cos(a)*.55,z=2.2+Math.sin(a)*.42;RB.stone(x,g(x,z)+.04,z,.2,.12,.17,a,{tint:stoneTint(RB,.9)})}
  // brook from the fall pool down to the head of the tailrace, edged with pebbles
  const brook=[];for(let i=0;i<=12;i++){const t=i/12,x=mix(-4.25,S.race.x0,t),z=mix(2.2,0,t*t*(3-2*t))+.12*Math.sin(t*7);brook.push([x,g(x,z)+.04,z])}
  for(let i=1;i<brook.length;i+=1)for(const sg of [-1,1]){const [x,,z]=brook[i],[px,,pz]=brook[i-1],tx=x-px,tz=z-pz,l=Math.hypot(tx,tz)||1,ox=x-tz/l*.36*sg,oz=z+tx/l*.36*sg;RB.stone(ox,g(ox,oz)+.03,oz,RB.rnd(.1,.18),RB.rnd(.06,.1),RB.rnd(.1,.16),RB.rnd(0,3),{tint:stoneTint(RB,.85),nu:6,nv:4})}
  for(let k=0;k<60;k++){const a=RB.rnd(0,6.283),rr=RB.rnd(.1,.6),onTop=k<14,x=onTop?RB.rnd(K.x0+.4,K.x1-.4):(a<3.14?K.x1+rr*.6:K.x0-rr*.5)+RB.rnd(-.2,.2),z=onTop?RB.rnd(K.z0+.3,K.z1-.3):RB.rnd(K.z0-.3,K.z1+.4);
   if(onTop&&Math.hypot(x+4.45,z)<.8)continue;const y=onTop?3.55+RB.rnd(-.1,.1):g(x,z)-.02;RB.card("grass",[x,y,z],RB.rnd(.25,.45),RB.rnd(.2,.42),RB.rnd(0,3),RB.rnd(-.25,.25),[.8+.3*RB.r(),.9+.2*RB.r(),.7],{ao:1})}
  RB.part();
  // water that is always flowing: spring pool, overflow runnel, the fall down the rock face, its pool, the brook and tailrace
  AQ.stage=0;const race=[];for(let i=0;i<=16;i++){const x=mix(S.race.x0,S.race.x1,i/16),z=.08*Math.sin(i*.9);race.push([x,g(x,z)+.04,z])}
  waterRibbon(AQ,brook.concat(race.slice(1)),t=>t<.4?.5:.78,[.62,.78,.86]);AQ.part();
  AQ.stage=1;{const pts=[];for(let i=0;i<=14;i++){const tm=i/14*.85,x=-4.3+.05*Math.sin(i),y=3.42-4.9*tm*tm,z=1.72+.5*tm;pts.push([x,Math.max(g(x,z)+.02,y),z])}
   waterTube(AQ,pts,t=>.2+.08*t,t=>.035+.05*t,[1.18,1.24,1.26]);
   waterRibbon(AQ,[[-4.45,3.58,.3],[-4.42,3.56,.7],[-4.35,3.5,1.1],[-4.32,3.46,1.45],[-4.3,3.43,1.72]],.24,[.8,.95,1]);
   const pool=[];for(let i=0;i<=6;i++){const z=1.9+i*.1;pool.push([-4.3,g(-4.3,z)+.05,z])}waterRibbon(AQ,pool,t=>.9-.3*Math.abs(t-.5)*2,[.62,.78,.86])}AQ.part();
  AQ.stage=2;{const pts=[];for(let i=0;i<=6;i++){const x=mix(S.spring.x0+.04,S.spring.x1-.04,i/6);pts.push([x,3.66,0])}waterRibbon(AQ,pts,.68,[.5,.68,.8])}AQ.part();
  // flume water, the spout onto the wheel top, and the long spout to the race before the wheel is hung
  AQ.stage=3;{const pts=[];for(let i=0;i<=10;i++){const x=mix(S.gate+.05,FL.x1+.02,i/10);pts.push([x,fy(x)-.1,0])}waterRibbon(AQ,pts,.25,[.75,.9,1])}AQ.part();
  AQ.stage=4;{const pts=[];for(let i=0;i<=14;i++){const tm=i/14*.86,x=FL.x1+1.2*tm,y=FL.y+.06-4.9*tm*tm;pts.push([x,Math.max(g(x,0)+.03,y),0])}waterTube(AQ,pts,.11,t=>.04+.03*t,[1.1,1.18,1.22])}AQ.part();
  AQ.stage=5;{const pts=[];for(let i=0;i<=8;i++){const tm=i/8*.2,x=FL.x1+1.2*tm,y=FL.y+.06-4.9*tm*tm;pts.push([x,y,0])}waterTube(AQ,pts,.12,.045,[1.1,1.18,1.22]);
   // water carried round in the buckets and dumped at the bottom into the race
   const dump=[];for(let i=0;i<=8;i++){const a=-.25-i/8*1.05,x=Math.cos(a)*(R-.12)+.02,y=WH.cy+Math.sin(a)*(R-.12);dump.push([x,y,0])}
   for(let i=0;i<=5;i++){const x=dump[8][0]+.08*i,y=mix(dump[8][1],g(x,0)+.04,i/5);dump.push([x,y,0])}waterTube(AQ,dump,.2,.03,[1.02,1.12,1.18])}AQ.part()}
 // ---------- stage 0: footings & tailrace ----------
 B.stage=0;
 {const race=[];for(let i=0;i<=16;i++){const x=mix(S.race.x0-.1,S.race.x1,i/16),z=.08*Math.sin(i*.9);race.push([x,g(x,z)+.02,z])}waterRibbon(B,race,1.02,[.78,.66,.55],"cob");B.part();
  for(let i=0;i<=15;i++)for(const sg of [-1,1]){const x=mix(S.race.x0,S.race.x1,i/15)+B.rnd(-.08,.08),z=sg*(S.race.hw+.05)+B.rnd(-.04,.04)+.08*Math.sin(i*.9*16/15);
   B.stone(x,g(x,z)+.05,z,B.rnd(.16,.26),B.rnd(.09,.14),B.rnd(.1,.15),B.rnd(-.3,.3),{tint:stoneTint(B),nu:7,nv:5})}B.part()}
 const foot=(x,z,s)=>{const gy=g(x,z);B.stone(x,gy+.02,z,s,.13,s*.85,B.rnd(0,3),{tint:stoneTint(B)});B.stone(x+B.rnd(-.05,.05),gy+.15,z+B.rnd(-.05,.05),s*.75,.1,s*.65,B.rnd(0,3),{tint:stoneTint(B,.92)})};
 for(const z of S.bearings.slice(0,2))for(const x of [-.7,.7])foot(x,z,.22);foot(-.2,S.bearings[2],.2);foot(.2,S.bearings[2],.2);B.part();
 for(const x of S.trestles)for(const z of [-.4,.4])foot(x,z,.2);foot(hpx,hz-.27,.17);foot(hpx,hz+.27,.17);B.part();
 // ---------- stage 1: spring box, sluice, split-log flume on trestles ----------
 B.stage=1;const SB=S.spring;
 {const yb=3.42,yt=3.82;for(const z of [SB.z0,SB.z1])slab(B,"wood",[(SB.x0+SB.x1)/2,(yb+yt)/2,z],[(SB.x1-SB.x0)/2+.03,0,0],[0,(yt-yb)/2,0],.025,wood(B));
  slab(B,"wood",[SB.x0,(yb+yt)/2,0],[0,0,(SB.z1-SB.z0)/2],[0,(yt-yb)/2,0],.025,wood(B));
  for(const [x,z] of [[SB.x0,SB.z0],[SB.x0,SB.z1],[SB.x1,SB.z0],[SB.x1,SB.z1]])B.log([x,yb-.1,z],[x,yt+.08,z],.03,{mat:"wood",tone:"stick"});
  for(const z of [SB.z0-.02,SB.z1+.02])B.stone(SB.x1+.02,yb-.02,z,.12,.06,.1,0,{tint:[.78,.6,.45]});B.part()
  // sluice posts with a slot, and the pull pole that lifts the gate board from the ground
  for(const z of [-.22,.22])B.log([S.gate,3.3,z],[S.gate,4.25,z],.045,{mat:"wood"});B.log([S.gate,4.22,-.3],[S.gate,4.22,.3],.035,{mat:"wood"});
  const [plx,plz]=S.pole;B.log([S.gate+.05,4.18,.05],[plx,g(plx,plz)+1.05,plz],.03,{mat:"bark",tone:"stick"});B.lash([S.gate,4.22,0],[0,0,1],.04,3);B.part()}
 GB.stage=1;slab(GB,"wood",[0,3.66,0],[0,0,.2],[0,.18,0],.02,wood(GB));GB.log([0,3.86,-.04],[0,3.86,.08],.012,{mat:"cord",caps:false});GB.part();
 {const seg=[[FL.x0,-1.85],[-1.85,FL.x1]];
  for(const [xa,xb] of seg){const sd=B.r()*50,ba=B.bin("bark"),bw=B.bin("wood"),be=B.bin("end"),tn=wood(B),r0=.2,r1=.155;
   B.grid(ba,10,8,(i,j,u,v)=>{const x=mix(xa,xb,v),th=Math.PI+u*Math.PI,rr=r0*(1+.06*(n3(u*4,x*2,sd,7)-.5));return [x,fy(x)+Math.sin(th)*rr,Math.cos(th)*rr]},(u,v)=>[u*1.6,v*(xb-xa)/.9],()=>B.tint());
   B.grid(bw,8,8,(i,j,u,v)=>{const x=mix(xa,xb,v),th=Math.PI+u*Math.PI,rr=r1*(1+.03*Math.sin(x*23+u*9));return [x,fy(x)+Math.sin(th)*rr,Math.cos(th)*rr]},(u,v)=>[u*.6,v*(xb-xa)/1.6],()=>tn.map(q=>q*.72),{flip:true});
   for(const sg of [-1,1])B.grid(bw,1,6,(i,j,u,v)=>{const x=mix(xa,xb,v);return [x,fy(x),sg*mix(r1,r0,u)]},(u,v)=>[u*.1,v*(xb-xa)/1.6],()=>tn);
   for(const x of [xa,xb])B.grid(be,8,1,(i,j,u,v)=>{const th=Math.PI+u*Math.PI,rr=mix(r1,r0,v);return [x,fy(x)+Math.sin(th)*rr,Math.cos(th)*rr]},(u,v)=>[.5+Math.cos(Math.PI+u*Math.PI)*.45*mix(.75,1,v),.5+Math.sin(Math.PI+u*Math.PI)*.45*mix(.75,1,v)],()=>B.tint("end"))}
  B.lash([-1.85,fy(-1.85),0],[1,0,0],.205,4,{rc:.011});B.lash([FL.x1-.25,fy(FL.x1-.25),0],[1,0,0],.205,3,{rc:.01});B.part();
  for(const x of S.trestles){const top=fy(x)-.2;for(const z of [-.4,.4])B.log([x+B.rnd(-.03,.03),g(x,z)+.1,z],[x,top-.03,z*.55],.065,{tone:"stick",bend:.01});
   B.log([x,top-.06,-.34],[x,top-.06,.34],.06,{});B.log([x,g(x,-.4)+.5,-.36],[x,top-.4,.26],.035,{mat:"wood"});
   for(const z of [-.22,.22])B.lash([x,top-.06,z],[0,0,1],.065,3);B.part()}
  // clay packed where the flume meets the spring box
  B.stone(S.gate+.03,fy(S.gate)-.12,0,.18,.14,.26,0,{tint:[.75,.58,.42]});B.part()}
 // ---------- stage 2: axle on A-frame bearings ----------
 B.stage=2;
 for(const z of S.bearings.slice(0,2)){const capY=WH.cy-WH.axleR-.1;for(const sg of [-1,1])B.log([sg*.7,g(sg*.7,z)+.18,z],[sg*.17,WH.cy+.38,z],.085,{tone:"stick",bend:.008});
  B.log([-.55,capY,z],[.55,capY,z],.075,{});slab(B,"wood",[0,capY+.1,z],[.17,0,0],[0,.045,0],.09,wood(B).map(q=>q*.8));
  B.log([-.32,capY+.55,z],[.32,capY+.55,z],.05,{mat:"wood"});for(const sg of [-1,1]){B.lash([sg*.42,capY,z],[0,0,1],.085,3);B.log([sg*.42,capY+.05,z-.12],[sg*.42,capY+.05,z+.12],.016,{mat:"wood"})}B.part()}
 {const z=S.bearings[2],capY=WH.cy-WH.axleR-.08;for(const x of [-.2,.2])B.log([x,g(x,z)+.18,z],[x*.8,WH.cy+.25,z],.075,{tone:"stick"});slab(B,"wood",[0,capY,z],[.25,0,0],[0,.05,0],.09,wood(B).map(q=>q*.8));
  B.log([-.24,WH.cy+.2,z],[.24,WH.cy+.2,z],.04,{mat:"wood"});B.part()}
 const wheel=new T.Group();wheel.name="wheel";wheel.position.set(WH.cx,WH.cy,0);root.add(wheel);
 WB.stage=2;WB.log([0,0,S.axle.z0],[0,0,S.axle.z1],WH.axleR,{mat:"wood",nu:10,bend:0,bump:.03,taper:.03});
 for(const z of [-hw+.04,hw-.04])WB.log([0,0,z-.08],[0,0,z+.08],.24,{mat:"wood",nu:12,bend:0,bump:.04,taper:0});WB.part();
 // ---------- stage 3: spokes & rims (shrouds) ----------
 WB.stage=3;const sR0=1.3,sR1=R,nS=WH.spokes;
 for(const sg of [-1,1]){const zc=sg*(hw-.035);
  for(let k=0;k<nS;k++){const a=k/nS*6.283+(sg>0?0:.0),ca=Math.cos(a),sa=Math.sin(a),r0=.22,r1=sR0+.1,rm=(r0+r1)/2;
   slab(WB,"wood",[ca*rm,sa*rm,zc-sg*.03],[ca*(r1-r0)/2,sa*(r1-r0)/2,0],[-sa*.05,ca*.05,0],.025,wet(WB.tint()).map((q,i)=>q*1.25))}WB.part();
  const bw=WB.bin("wood");for(let k=0;k<8;k++){const a0=k/8*6.283+.004,a1=(k+1)/8*6.283-.004,tn=wet(WB.tint()).map(q=>q*1.1),z0=zc-.02,z1=zc+.02,sd=WB.r()*9;
   const col=(u,v)=>{const m=1-.25*v;return [tn[0]*m,tn[1]*m*1.04,tn[2]*m*.95]};
   for(const z of [z0,z1])WB.grid(bw,8,1,(i,j,u,v)=>{const a=mix(a0,a1,u),r=mix(sR0,sR1,v);return [Math.cos(a)*r,Math.sin(a)*r,z]},(u,v)=>[v*.9+sd,u*(a1-a0)*1.36/1.6*1.0],col);
   for(const r of [sR0,sR1])WB.grid(bw,8,1,(i,j,u,v)=>{const a=mix(a0,a1,u);return [Math.cos(a)*r,Math.sin(a)*r,mix(z0,z1,v)]},(u,v)=>[v*.1+sd,u*(a1-a0)*r/1.6],()=>tn.map(q=>q*.8));
   for(const a of [a0,a1])WB.grid(WB.bin("end"),1,1,(i,j,u,v)=>{const r=mix(sR0,sR1,u);return [Math.cos(a)*r,Math.sin(a)*r,mix(z0,z1,v)]},(u,v)=>[.3+u*.3,.5+v*.05],()=>[.7,.66,.6])}
  WB.part();
  for(let k=0;k<nS;k++){const a=k/nS*6.283,ca=Math.cos(a),sa=Math.sin(a);for(const r of [sR0+.04,1.52])WB.log([ca*r,sa*r,zc-sg*.075],[ca*r,sa*r,zc+sg*.035],.017,{mat:"wood",bend:0,nu:6});
   const am=a+3.1416/nS;WB.log([Math.cos(am)*1.45,Math.sin(am)*1.45,zc-sg*.02],[Math.cos(am)*1.45,Math.sin(am)*1.45,zc+sg*.035],.015,{mat:"wood",bend:0,nu:5})}
  WB.lash([0,0,zc*1.0+sg*.12],[0,0,1],WH.axleR+.005,3,{rc:.01});WB.part()}
 // ---------- stage 4: sole boards & buckets ----------
 WB.stage=4;const nB=WH.buckets,zin=hw-.06;
 for(let k=0;k<nB;k++){const a=k/nB*6.283,da=6.283/nB,am=a+da/2,tn=wet(WB.tint());
  slab(WB,"wood",[Math.cos(am)*sR0,Math.sin(am)*sR0,0],[0,0,zin],[-Math.sin(am)*sR0*da/2,Math.cos(am)*sR0*da/2,0],.018,tn.map(q=>q*.9));
  const p0=[Math.cos(a)*sR0,Math.sin(a)*sR0],p1=[Math.cos(a+.22)*(sR1-.02),Math.sin(a+.22)*(sR1-.02)];
  slab(WB,"wood",[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2,0],[0,0,zin],[(p1[0]-p0[0])/2,(p1[1]-p0[1])/2,0],.016,tn);
  if(k%3===0)WB.part()}
 WB.part();
 // ---------- stage 5: cam lugs, helve, trip-hammer head, mortar ----------
 WB.stage=5;WB.log([0,0,S.lugs.z-.12],[0,0,S.lugs.z+.12],.17,{mat:"wood",nu:10,bend:0,taper:0});
 for(let k=0;k<WH.lugs;k++){const a=WH.lugPhase+k*6.283/WH.lugs,ca=Math.cos(a),sa=Math.sin(a),r0=.12,r1=S.lugs.r,rm=(r0+r1)/2;
  slab(WB,"wood",[ca*rm,sa*rm,S.lugs.z],[ca*(r1-r0)/2,sa*(r1-r0)/2,0],[-sa*.05,ca*.05,0],.065,WB.tint().map(q=>q*.85));
  WB.log([ca*.2,sa*.2,S.lugs.z-.16],[ca*.2,sa*.2,S.lugs.z+.16],.016,{mat:"wood",bend:0,nu:5})}WB.part();
 B.stage=5;for(const dz of [-.27,.27]){const z=hz+dz;B.log([hpx,g(hpx,z)+.2,z],[hpx,hpy+.32,z],.075,{tone:"stick"})}
 B.log([hpx,hpy,hz-.36],[hpx,hpy,hz+.36],.03,{mat:"wood",bend:0});B.log([hpx,hpy+.28,hz-.34],[hpx,hpy+.28,hz+.34],.045,{});B.part();
 {const [mx,mz]=S.hammer.mortar,gy=g(mx,mz),top=.78;B.log([mx,gy-.08,mz],[mx,top,mz],.3,{mat:"bark",nu:14,bend:0,bump:.08,taper:-.1,caps:"end"});
  B.grid(B.bin("wood"),12,2,(i,j,u,v)=>{const th=u*6.283,rr=mix(.2,.04,v*v);return [mx+Math.cos(th)*rr,top+.002-v*.22,mz+Math.sin(th)*rr]},(u,v)=>[u*.8,v*.2],()=>[.55,.48,.4],{wrapU:true,ao:.6});
  for(let k=0;k<11;k++){const a=B.rnd(0,6.283),rr=B.rnd(0,.12);B.stone(mx+Math.cos(a)*rr,top-.12+rr*.6,mz+Math.sin(a)*rr,.035,.02,.03,B.rnd(0,3),{tint:[1.35,1.2,.82],nu:5,nv:3})}
  for(let k=0;k<5;k++){const a=k/5*6.283+.3;B.stone(mx+Math.cos(a)*.5,g(mx+Math.cos(a)*.5,mz+Math.sin(a)*.45)+.04,mz+Math.sin(a)*.45,.1,.07,.09,a,{tint:stoneTint(B)})}B.part()}
 const helve=new T.Group();helve.name="helve";helve.position.set(hpx,hpy,hz);root.add(helve);
 const tailL=hpx-HM.tail,armL=HM.head[0]-hpx;
 HB.stage=5;HB.log([-tailL-.04,0,0],[armL+.12,0,0],.075,{bend:.01});slab(HB,"wood",[-tailL+.1,.075,0],[.14,0,0],[0,0,.07],.012,[.75,.7,.62]);
 HB.log([armL,.12,0],[armL,HM.head[1]-hpy+.4,0],.055,{mat:"wood",nu:8,bend:0});HB.log([armL,HM.head[1]-hpy+.48,0],[armL,HM.head[1]-hpy,0],.13,{mat:"wood",nu:12,bend:0,bump:.06,taper:.12,caps:"end"});HB.lash([armL,HM.head[1]-hpy+.44,0],[0,1,0],.13,3,{rc:.012});HB.lash([armL,0,0],[0,1,0],.13,4,{rc:.012});
 HB.log([armL-.05,.08,-.14],[armL-.05,.08,.14],.018,{mat:"wood",bend:0});HB.part();
 // ---------- site (before any stage): stakes, cord line and the marked wheel pit ----------
 B.stage=6;{const pts=[[-3.6,-.9],[3.2,-.9],[3.2,1.9],[-3.6,1.9]];for(const [x,z] of pts)B.log([x,g(x,z)-.05,z],[x,g(x,z)+.6,z],.025,{tone:"stick"});
  for(let i=0;i<4;i++){const a=pts[i],b=pts[(i+1)%4];B.log([a[0],g(a[0],a[1])+.5,a[1]],[b[0],g(b[0],b[1])+.5,b[1]],.005,{mat:"cord",caps:false,bend:.02})}
  for(let k=0;k<12;k++){const a=k/12*6.283,x=Math.cos(a)*R,z=0;B.log([x,g(x,z)-.03,z+(k%2?.3:-.3)],[x,g(x,z)+.25,z+(k%2?.3:-.3)],.015,{tone:"stick"})}
  for(const x of S.trestles)B.stone(x,g(x,0)+.04,0,.12,.06,.1,0,{tint:[.9,.88,.84]});B.part()}
 const st=B.finish(root),ws=WB.finish(wheel),hs=HB.finish(helve),gate=new T.Group();gate.name="gate";gate.position.set(S.gate,0,0);root.add(gate);const gs=GB.finish(gate);
 const base=new T.Group();base.name="base";root.add(base);RB.finish(base);
 const waterG=new T.Group();waterG.name="water";root.add(waterG);const wq=AQ.finish(waterG);for(const grp of wq)for(const m of grp.children){m.castShadow=false;m.renderOrder=2}
 for(const grp of ws.concat(hs))for(const m of grp.children)m.castShadow=true;
 root.userData.stages=[0,1,2,3,4,5].map(i=>[st[i],ws[i],hs[i],gs[i]].filter(x=>x&&x.children.length));root.userData.site=st[6];
 root.userData.wheel=wheel;root.userData.helve=helve;root.userData.gate=gate;root.userData.water=wq;for(const k of [3,4,5])if(wq[k])wq[k].visible=false;
 // spray: one small Points cloud (not a mesh; no shadow) fed at the spout, the fall and where the buckets empty
 if(!SPRAY_MAT)SPRAY_MAT=new T.PointsMaterial({color:0xeaf6ff,size:.055,transparent:true,opacity:.6,depthWrite:false,sizeAttenuation:true});
 const N=160,pg=new T.BufferGeometry(),pa=new Float32Array(N*3).fill(-100);pg.setAttribute("position",new T.BufferAttribute(pa,3));pg.boundingSphere=new T.Sphere(new T.Vector3(-1,2,0),9);
 const spray=new T.Points(pg,SPRAY_MAT);spray.name="spray";spray.frustumCulled=true;root.add(spray);
 root.userData.spray={pts:spray,vel:new Float32Array(N*3),life:new Float32Array(N),next:0,acc:[0,0,0],
  fall:[-4.3,g(-4.3,2.1)+.08,2.1],ground:[FL.x1+1.0,g(FL.x1+1.0,0)+.06,0],top:[FL.x1+.2,WH.cy+R-.05,0],dump:[.95,g(.95,0)+.08,0],rng:rng(seed+77)};
 // proxies: always the rock; then footings, flume, wheel, hammer as they are built
 proxy(root,-1,(K.x0+K.x1)/2,K.top/2,(K.z0+K.z1)/2,K.x1-K.x0,K.top,K.z1-K.z0);proxy(root,-1,-1,.15,.4,6,.3,3.6);
 proxy(root,1,(FL.x0+FL.x1)/2,FL.y,0,FL.x1-FL.x0,.4,.45);proxy(root,1,S.pole[0],.9,S.pole[1],.6,1.8,.6);
 proxy(root,3,0,WH.cy,0,2*R,2*R,WH.width+.1);proxy(root,5,(hpx+HM.head[0])/2,1.4,hz,2.6,1.6,.8);
 return root}
/* per-frame motion: angle (rad, clockwise seen from the hammer side), helve (rad, + lifts the head), gate 0..1, t = clock (s) */
export function animateWaterwheel(root,dt,o={}){const u=root.userData;if(u.type!=="waterwheel")return;
 const stage=o.stage??u.stage??0,gate=Math.max(0,Math.min(1,o.gate??0));u.wheel.rotation.z=-(o.angle||0);u.helve.rotation.z=o.helve||0;u.gate.position.y=gate*.24;
 const flowing=stage>=2&&gate>.05,hung=stage>=5,W=u.water;if(W[3])W[3].visible=flowing;if(W[4])W[4].visible=flowing&&!hung;if(W[5])W[5].visible=flowing&&hung;
 for(const k of [3,4,5])if(W[k])W[k].scale.set(1,1,.55+.45*gate);
 const M=woodMaterials().water,off=-(((o.t||0)*.9)%1);M.map.offset.y=off;if(M.normalMap)M.normalMap.offset.y=off;
 const S=u.spray;if(!S||o.spray===false)return;const p=S.pts.geometry.attributes.position.array,N=S.life.length,r=S.rng,flow=o.flow??1;
 const emit=(src,rate,k,spread,up)=>{S.acc[k]+=rate*dt;while(S.acc[k]>=1){S.acc[k]-=1;const i=S.next;S.next=(i+1)%N;S.life[i]=.45+.45*r();
   p[i*3]=src[0]+(r()-.5)*spread;p[i*3+1]=src[1];p[i*3+2]=src[2]+(r()-.5)*spread;const a=r()*6.283,h=.4+r()*.9;S.vel[i*3]=Math.cos(a)*h+(k===1?.5:0);S.vel[i*3+1]=up*(.6+r());S.vel[i*3+2]=Math.sin(a)*h}};
 emit(S.fall,40,0,.35,1.6);if(flowing)emit(hung?S.top:S.ground,70*gate*flow,1,.22,hung?1.1:1.8);if(flowing&&hung&&Math.abs(o.omega||0)>.05)emit(S.dump,45*gate*flow,2,.4,1.2);
 for(let i=0;i<N;i++){if(S.life[i]<=0)continue;S.life[i]-=dt;if(S.life[i]<=0){p[i*3+1]=-100;continue}S.vel[i*3+1]-=9.8*dt;p[i*3]+=S.vel[i*3]*dt;p[i*3+1]+=S.vel[i*3+1]*dt;p[i*3+2]+=S.vel[i*3+2]*dt}
 S.pts.geometry.attributes.position.needsUpdate=true}

/* ---------------- shared API ---------------- */
export function buildWoodland(type,opt){return type==="woodhut"?buildHut(opt):type==="waterwheel"?buildWaterwheel(opt):buildHouse(opt)}
// stage = completed stages, frac = progress of the stage under construction
export function setWoodStage(root,stage,frac=0){const st=root.userData.stages,n=st.length;stage=Math.max(0,Math.min(n,stage|0));frac=Math.max(0,Math.min(1,frac||0));
 for(let i=0;i<n;i++)for(const g of (Array.isArray(st[i])?st[i]:[st[i]])){if(i<stage){g.visible=true;for(const m of g.children)m.geometry.setDrawRange(0,Infinity)}
  else if(i===stage&&frac>0){g.visible=true;for(const m of g.children){const mk=m.userData.marks;m.geometry.setDrawRange(0,mk[Math.min(mk.length-1,Math.round(frac*m.userData.parts))]??mk[mk.length-1])}}
  else g.visible=false}
 if(root.userData.site)root.userData.site.visible=stage<1;
 const done=stage>=n;if(root.userData.door)root.userData.door.visible=done;if(root.userData.doorStatic)root.userData.doorStatic.visible=done;
 for(const p of root.userData.proxies){const s=p.userData.proxyStage,on=s<0||(s===6?done:stage>s);p.layers.set(on?0:31)}
 root.userData.stage=stage;root.userData.frac=frac}
export function setDoor(root,open){const d=root.userData.door;if(d)d.rotation.y=Math.max(0,Math.min(1,open))*1.75}
export function woodLOD(root,dist){const near=dist<55;if(root.userData._near===near)return;root.userData._near=near;root.traverse(m=>{if(m.isMesh&&m.userData.fine)m.visible=near})}
/* triangle count; visibleOnly counts what would draw now (stage reveal, LOD and drawRange) */
export function woodTriangles(root,visibleOnly=false){let n=0;const vis=o=>{for(;o;o=o.parent)if(!o.visible)return false;return true};
 root.traverse(m=>{if(!m.isMesh||m.material===PROXY_MAT)return;const c=m.geometry.attributes.position.count;if(!visibleOnly){n+=c/3;return}if(!vis(m))return;n+=Math.min(c,m.geometry.drawRange.count)/3});return Math.round(n)}
export {PROXY_MAT};
