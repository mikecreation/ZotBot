/* FFT ocean for three.js r160 / WebGL2 — our own implementation of published techniques:
 *  Tessendorf "Simulating Ocean Water" (FFT surface, choppy displacement, Jacobian), JONSWAP spectrum (ocean-spectrum.js),
 *  3 cascades (swell / waves / ripples) with a GPU Stockham butterfly IFFT in render targets,
 *  Jacobian crest foam in a decaying ping-pong texture + depth-driven shore foam,
 *  physical Fresnel (n=1.33), sky reflection from a cube render of the existing Sky, GGX sun/moon/fire glints,
 *  crest subsurface glow and per-channel Beer–Lambert absorption over the terrain (two blend passes: ×T then +radiance),
 *  camera-following clipmap rings with geomorphing and distance-faded detail. */
import * as THREE from "./vendor/three.module.min.js";
import {DEFAULT_OCEAN,cascadeBands,initialSpectrum,makeSpectrum,makeWaveSampler,LOOP_T,G} from "./ocean-spectrum.js?v=3.29.0";

export const OCEAN_QUALITY={
  low:{label:"Low",N:64,s0:1,R:48,levels:6,envSize:64,envEvery:12},
  med:{label:"Medium",N:128,s0:.5,R:64,levels:7,envSize:128,envEvery:6},
  high:{label:"High",N:256,s0:.4,R:80,levels:7,envSize:256,envEvery:3}};

const FS_VERT=`void main(){gl_Position=vec4(position.xy,0.,1.);}`;
const CMUL=`vec2 cmul(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
vec2 ci(vec2 a){return vec2(-a.y,a.x);}`;
// h̃(k,t) and its 8 derived spectra packed as 4 complex signals (two real fields per complex IFFT)
const SPECTRUM_FRAG=`precision highp float;precision highp int;
uniform sampler2D uH0a,uH0b,uH0c;uniform vec3 uL,uChop;uniform float uT;uniform int uN;
${CMUL}
void main(){ivec2 p=ivec2(gl_FragCoord.xy);int c=p.x/uN,x=p.x-c*uN,hb=p.y/uN,y=p.y-hb*uN;
 vec4 h0;float L,lam;
 if(c==0){h0=texelFetch(uH0a,ivec2(x,y),0);L=uL.x;lam=uChop.x;}else if(c==1){h0=texelFetch(uH0b,ivec2(x,y),0);L=uL.y;lam=uChop.y;}else{h0=texelFetch(uH0c,ivec2(x,y),0);L=uL.z;lam=uChop.z;}
 vec2 k=(vec2(x,y)-float(uN/2))*6.28318530718/L;float kl=length(k);
 if(kl<1e-6){gl_FragColor=vec4(0.);return;}
 float w0=6.28318530718/${LOOP_T.toFixed(1)};float w=floor(sqrt(${G}*kl)/w0)*w0;float ph=w*uT;vec2 e=vec2(cos(ph),sin(ph));
 vec2 h=cmul(h0.xy,e)+cmul(h0.zw,vec2(e.x,-e.y));
 vec2 kn=k/kl;
 vec2 Dx=ci(h)*kn.x*lam,Dz=ci(h)*kn.y*lam,hx=ci(h)*k.x,hz=ci(h)*k.y;
 vec2 Dxx=-h*lam*k.x*k.x/kl,Dzz=-h*lam*k.y*k.y/kl,Dxz=-h*lam*k.x*k.y/kl;
 if(hb==0)gl_FragColor=vec4(h+ci(Dx),Dz+ci(hx));else gl_FragColor=vec4(hz+ci(Dxx),Dzz+ci(Dxz));}`;
// one radix-2 Stockham stage (inverse), horizontal or vertical, inside each N-sized block of the atlas
const FFT_FRAG=`precision highp float;precision highp int;
uniform sampler2D uSrc;uniform int uN,uStage,uDir;
${CMUL}
void main(){ivec2 p=ivec2(gl_FragCoord.xy);int o=uDir==0?p.x:p.y;int base=(o/uN)*uN;o-=base;
 int span=1<<uStage,k=o&(span-1),q=o>>uStage,i=(q>>1)*span+k;
 ivec2 a=uDir==0?ivec2(base+i,p.y):ivec2(p.x,base+i),b=uDir==0?ivec2(base+i+uN/2,p.y):ivec2(p.x,base+i+uN/2);
 float an=3.14159265359*float(k)/float(span);vec2 w=vec2(cos(an),sin(an));
 vec4 va=texelFetch(uSrc,a,0),vb=texelFetch(uSrc,b,0);vec4 t=vec4(cmul(w,vb.xy),cmul(w,vb.zw));
 gl_FragColor=(q&1)==0?va+t:va-t;}`;
const FINAL_FRAG=`precision highp float;precision highp int;
uniform sampler2D uSrc;uniform int uN,uC,uWhich;
void main(){ivec2 p=ivec2(gl_FragCoord.xy);float sg=((p.x+p.y)&1)==1?-1.:1.;
 vec4 A=texelFetch(uSrc,ivec2(uC*uN+p.x,p.y),0)*sg,B=texelFetch(uSrc,ivec2(uC*uN+p.x,uN+p.y),0)*sg; // A=(h,Dx,Dz,hx) B=(hz,Dxx,Dzz,Dxz)
 if(uWhich==0){float J=(1.+B.y)*(1.+B.z)-B.w*B.w;gl_FragColor=vec4(A.y,A.x,A.z,J);}
 else gl_FragColor=vec4(A.w,B.x,B.y,B.z);}`;
const FOAM_FRAG=`precision highp float;
uniform sampler2D uPrev,uDisp;uniform float uDecay,uThr,uGain;
void main(){ivec2 p=ivec2(gl_FragCoord.xy);float J=texelFetch(uDisp,p,0).w;float prev=texelFetch(uPrev,p,0).r;
 float inj=clamp((uThr-J)*uGain,0.,1.);gl_FragColor=vec4(max(prev*uDecay,inj),J,0.,1.);}`;

const OCEAN_VERT=`precision highp float;
attribute float aLevel;
uniform sampler2D uDisp0,uDisp1,uDisp2,uTerr;uniform vec3 uL;uniform float uN,uS0,uR,uMaxLevel;uniform vec2 uCenter,uTerrO;uniform float uTerrE;
varying vec3 vWorld;varying vec2 vXZ;varying float vDepth,vAttW,vDist;
float terrH(vec2 xz){vec2 uv=(xz-uTerrO)/uTerrE;float h=texture2D(uTerr,uv).r;vec2 e=smoothstep(vec2(0.),vec2(.04),uv)*smoothstep(vec2(0.),vec2(.04),1.-uv);return mix(-40.,h,e.x*e.y);}
vec3 disp(sampler2D t,vec2 xz,float L,float s){float lod=max(0.,log2(1.5*s*uN/L));return textureLod(t,xz/L+.5/uN,lod).xyz;}
void main(){
 float s=uS0*exp2(aLevel);vec2 p=position.xz;
 float e=max(abs(p.x),abs(p.y))/(uR*s);float km=aLevel<uMaxLevel?smoothstep(.8,1.,e):0.;
 vec2 fr=p-2.*s*floor(p/(2.*s)+.001);p-=fr*km;
 vec2 wp=uCenter+p;
 float depth=-terrH(wp);
 float aW=smoothstep(.3,9.,depth),aR=smoothstep(.02,.5,depth);
 float dist=length(wp-cameraPosition.xz);
 vec3 d=disp(uDisp0,wp,uL.x,s)*aW;
 d+=disp(uDisp1,wp,uL.y,s)*aW*(1.-smoothstep(500.,1100.,dist));
 d+=disp(uDisp2,wp,uL.z,s)*aR*(1.-smoothstep(25.,70.,dist));
 vec3 pos=vec3(wp.x+d.x,d.y,wp.y+d.z);
 vWorld=pos;vXZ=wp;vDepth=depth;vAttW=aW;vDist=dist;
 gl_Position=projectionMatrix*viewMatrix*vec4(pos,1.);}`;

const OCEAN_FRAG=`precision highp float;
uniform sampler2D uDeriv0,uDeriv1,uDeriv2,uFoam0,uFoam1,uFoam2,uTerr;uniform samplerCube uEnv;
uniform vec3 uL;uniform float uN,uTime,uTerrE,uFogD,uEnvMaxLod,uExposureNight;uniform vec2 uTerrO;
uniform vec3 uSunDir,uSunCol,uAmb,uFogCol,uSigma,uScatter,uSSS,uFoamCol;
uniform vec3 uPLp[4],uPLc[4];uniform float uPLr[4];
varying vec3 vWorld;varying vec2 vXZ;varying float vDepth,vAttW,vDist;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float terrH(vec2 xz){vec2 uv=(xz-uTerrO)/uTerrE;float h=texture2D(uTerr,uv).r;vec2 e=smoothstep(vec2(0.),vec2(.04),uv)*smoothstep(vec2(0.),vec2(.04),1.-uv);return mix(-40.,h,e.x*e.y);}
float fresnel(float c){c=clamp(c,0.,1.);float n=1.33,g2=n*n-1.+c*c;if(g2<0.)return 1.;float g=sqrt(g2),a=(g-c)/(g+c),b=(c*(g+c)-1.)/(c*(g-c)+1.);return .5*a*a*(1.+b*b);}
float ggx(float nh,float a){float a2=a*a,d=nh*nh*(a2-1.)+1.;return a2/(3.14159*d*d);}
vec3 glint(vec3 N,vec3 V,vec3 L,vec3 col,float a){vec3 H=normalize(L+V);float nl=max(dot(N,L),0.),lh=max(dot(L,H),.05);return col*min(ggx(max(dot(N,H),0.),a)*fresnel(lh)*nl/(4.*lh*lh),60.);}
void main(){
 vec3 toCam=cameraPosition-vWorld;float dist=length(toCam);vec3 V=toCam/dist;
 // detail fades with distance (ripples first, then wind waves) so nothing shimmers far away
 float fR=1.-smoothstep(30.,140.,dist),fW=1.-smoothstep(350.,1200.,dist);
 float aR=smoothstep(.02,.5,vDepth);
 vec4 d0=texture2D(uDeriv0,vXZ/uL.x+.5/uN)*vAttW,d1=texture2D(uDeriv1,vXZ/uL.y+.5/uN)*vAttW*fW,d2=texture2D(uDeriv2,vXZ/uL.z+.5/uN)*aR*fR;
 vec4 dd=d0+d1+d2;
 vec3 N=normalize(vec3(-dd.x/max(.2,1.+dd.z),1.,-dd.y/max(.2,1.+dd.w)));
 bool under=!gl_FrontFacing;if(under)N=-N;
 float rough=mix(.06,.22,smoothstep(40.,900.,dist))+.1*(1.-fR)*(1.-fW*.5);
 float NV=max(dot(N,V),.001);float F=fresnel(NV);
 // terrain under this pixel → water column; refracted path length for Beer–Lambert
 float depth=max(-terrH(vWorld.xz)+vWorld.y,0.);
 vec3 Tr=refract(-V,N,1./1.33);float path=min(depth/max(-Tr.y,.18),300.);
 vec3 T=exp(-uSigma*path);
 // sky / moon reflection from the cube render of the Sky
 vec3 R=reflect(-V,N);R.y=max(R.y,.015);R=normalize(R);
 vec3 refl=textureLod(uEnv,R,rough*uEnvMaxLod).rgb;
 // light from the sun by day, the moon by night (uSunDir/uSunCol follow the key light)
 vec3 L=normalize(uSunDir);
 vec3 spec=glint(N,V,L,uSunCol,rough*rough+.0015);
 // fire light: subtle glints (no shadows) from the nearest point lights
 vec3 fireDiff=vec3(0.);
 for(int i=0;i<4;i++){vec3 d=uPLp[i]-vWorld;float r2=dot(d,d),r=sqrt(r2);if(uPLr[i]<=0.||r>uPLr[i])continue;float win=pow(clamp(1.-pow(r/uPLr[i],4.),0.,1.),2.);vec3 c=uPLc[i]*win/max(r2,.25);
   spec+=glint(N,V,d/r,c,.09)*.6;fireDiff+=c*max(dot(N,d/r),0.);}
 // body colour: in-scattered light of an infinitely deep column, attenuated where the floor shows through
 float sunUp=max(L.y,0.);
 vec3 inscat=uScatter*(uAmb*.6+uSunCol*sunUp*.45+fireDiff*.25);
 vec3 body=inscat*(1.-T);
 // subsurface glow through thin, sunlit crests
 float crest=clamp(vWorld.y*.9+.25,0.,1.5)*vAttW;
 float back=pow(clamp(dot(L,-V),0.,1.),4.)*pow(clamp(.5-.5*dot(L,N),0.,1.),2.);
 vec3 sss=uSSS*uSunCol*(crest*(2.2*back+.08*pow(1.-NV,2.)))*sunUp;
 // foam: Jacobian crest foam (decaying ping-pong) + shoreline foam over shallow terrain
 vec2 fuv=vXZ;float fn=vn(fuv*.9+uTime*.05)*.55+mix(.15,vn(fuv*3.1-uTime*.08),1.-smoothstep(80.,400.,dist))*.3+mix(.5,vn(fuv*9.),fR)*.15; // fine breakup fades out with distance
 float jf=texture2D(uFoam0,vXZ/uL.x+.5/uN).r*.6+texture2D(uFoam1,vXZ/uL.y+.5/uN).r*fW+texture2D(uFoam2,vXZ/uL.z+.5/uN).r*.35*fR;
 jf*=vAttW*(1.-smoothstep(250.,900.,dist));
 float shore=1.-smoothstep(0.,1.6,depth);
 float bands=smoothstep(.45,1.,sin(depth*5.5-uTime*1.7+fn*5.))*(1.-smoothstep(0.,2.6,depth));
 float foamRaw=jf+pow(1.-smoothstep(0.,.9,depth),2.)*.8+bands*.5;
 float foam=smoothstep(.35,.85,foamRaw*(.45+1.1*fn))*(1.-smoothstep(600.,1400.,dist));
 vec3 foamCol=uFoamCol*(uSunCol*max(dot(vec3(0,1,0),L),0.)*.32+uAmb*.4+fireDiff*.3);
 vec3 add,mul;
 if(under){mul=vec3(.12,.42,.48)*T;add=inscat*.6;foam=0.;}
 else{
  add=refl*F+spec*(1.-foam)+(body+sss)*(1.-F);
  add=mix(add,foamCol,foam);
  mul=T*(1.-F)*(1.-foam);
 }
 float f=1.-exp(-uFogD*uFogD*dist*dist);
#ifdef PASS_MUL
 gl_FragColor=vec4(mix(mul,vec3(1.),f),1.);
#else
 gl_FragColor=vec4(add*(1.-f)+uFogCol*f*(1.-mix(mul,vec3(1.),f)),1.);
#endif
}`;

function rt(w,h,type,mip){return new THREE.WebGLRenderTarget(w,h,{type,format:THREE.RGBAFormat,depthBuffer:false,stencilBuffer:false,
  minFilter:mip?THREE.LinearMipmapLinearFilter:THREE.NearestFilter,magFilter:mip?THREE.LinearFilter:THREE.NearestFilter,
  wrapS:mip?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping,wrapT:mip?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping,generateMipmaps:!!mip,anisotropy:mip?4:1})}
function fsMat(frag,uniforms){return new THREE.ShaderMaterial({vertexShader:FS_VERT,fragmentShader:frag,uniforms,depthTest:false,depthWrite:false})}

/** camera-following clipmap: level 0 full grid, levels 1.. rings (cell size doubles), geomorphed at each ring's outer edge */
export function clipmapGeometry(s0,R,levels){const pos=[],lev=[],idx=[];
  for(let l=0;l<levels;l++){const s=s0*2**l,base=pos.length/3,W=2*R+1;
    for(let j=0;j<W;j++)for(let i=0;i<W;i++){pos.push((i-R)*s,0,(j-R)*s);lev.push(l)}
    for(let j=0;j<2*R;j++)for(let i=0;i<2*R;i++){if(l>0&&i>=R/2&&i<R*1.5&&j>=R/2&&j<R*1.5)continue;
      const a=base+j*W+i,b=a+W,c=a+1,d=b+1;idx.push(a,b,c,c,b,d)}}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("aLevel",new THREE.Float32BufferAttribute(lev,1));
  g.setIndex(idx);g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e7);return g}

class TerrainDepth{
  constructor(S=256,E=768){this.S=S;this.E=E;this.fn=null;this.data=[new Float32Array(S*S).fill(-40),new Float32Array(S*S).fill(-40)];
    this.tex=this.data.map(()=>{const t=new THREE.DataTexture(new Uint16Array(S*S).fill(THREE.DataUtils.toHalfFloat(-40)),S,S,THREE.RedFormat,THREE.HalfFloatType);t.minFilter=t.magFilter=THREE.LinearFilter;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.needsUpdate=true;return t});
    this.origin=[new THREE.Vector2(-1e7,-1e7),new THREE.Vector2(-1e7,-1e7)];this.cur=0;this.job=null;this.dirty=true}
  setSampler(fn){this.fn=fn;this.dirty=true;this.job=null}
  fill(slot,ox,oz,from,to){const S=this.S,st=this.E/(S-1),d=this.data[slot],h=this.tex[slot].image.data;
    for(let i=from;i<to;i++){const x=i%S,z=(i/S)|0,v=this.fn(ox+x*st,oz+z*st);d[i]=v;h[i]=THREE.DataUtils.toHalfFloat(Math.max(-60,Math.min(400,v)))}}
  update(cx,cz,budget=3072){if(!this.fn)return;const step=this.E/8,tx=Math.round(cx/step)*step-this.E/2,tz=Math.round(cz/step)*step-this.E/2,o=this.origin[this.cur];
    const off=Math.max(Math.abs(cx-(o.x+this.E/2)),Math.abs(cz-(o.y+this.E/2)));
    if(this.dirty||off>this.E*.42){this.dirty=false;this.job=null;this.fill(this.cur,tx,tz,0,this.S*this.S);o.set(tx,tz);this.tex[this.cur].needsUpdate=true;return}
    if(!this.job&&(Math.abs(tx-o.x)>=step||Math.abs(tz-o.y)>=step))this.job={slot:1-this.cur,ox:tx,oz:tz,i:0};
    if(this.job){const j=this.job,n=Math.min(this.S*this.S,j.i+budget);this.fill(j.slot,j.ox,j.oz,j.i,n);j.i=n;
      if(n>=this.S*this.S){this.origin[j.slot].set(j.ox,j.oz);this.tex[j.slot].needsUpdate=true;this.cur=j.slot;this.job=null}}}
  get texture(){return this.tex[this.cur]}get originV(){return this.origin[this.cur]}
}

export class Ocean{
  constructor(renderer,scene,opts={}){this.renderer=renderer;this.scene=scene;this.cfg={...DEFAULT_OCEAN,...(opts.config||{})};
    this.time=0;this.frame=0;this.terrain=new TerrainDepth();this.lights=[];this.lightScan=0;
    this.half=renderer.capabilities.isWebGL2?THREE.HalfFloatType:THREE.FloatType;
    this.simScene=new THREE.Scene();this.simCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));this.quad.frustumCulled=false;this.simScene.add(this.quad);
    this.group=new THREE.Group();this.group.name="ocean";scene.add(this.group);
    this.setQuality(opts.quality||"med")}
  setQuality(name){const q=OCEAN_QUALITY[name]||OCEAN_QUALITY.med;if(this.q===q)return;this.q=q;this.qName=OCEAN_QUALITY[name]?name:"med";this.disposeSim();this.buildSim();this.buildEnv();this.buildMesh()}
  buildSim(){const N=this.q.N,cfg=this.cfg,bands=cascadeBands(cfg),spec=makeSpectrum(cfg);this.N=N;this.L=cfg.cascades.map(c=>c.L);
    this.h0=this.L.map((L,i)=>initialSpectrum(N,L,bands[i],cfg,i,spec));
    this.h0Tex=this.h0.map(d=>{const t=new THREE.DataTexture(d,N,N,THREE.RGBAFormat,THREE.FloatType);t.needsUpdate=true;return t});
    // CPU buoyancy: swell cascade + the strongest wind-wave modes
    this.samplers=[makeWaveSampler(this.h0[0],N,this.L[0],700),makeWaveSampler(this.h0[1],N,this.L[1],120)];
    this.atlas=[rt(3*N,2*N,THREE.FloatType,false),rt(3*N,2*N,THREE.FloatType,false)];
    this.disp=[0,1,2].map(()=>rt(N,N,this.half,true));this.deriv=[0,1,2].map(()=>rt(N,N,this.half,true));
    this.foam=[0,1,2].map(()=>[rt(N,N,this.half,true),rt(N,N,this.half,true)]);this.foamCur=0;
    const L=new THREE.Vector3(...this.L),chop=new THREE.Vector3(...cfg.choppy);
    this.mSpec=fsMat(SPECTRUM_FRAG,{uH0a:{value:this.h0Tex[0]},uH0b:{value:this.h0Tex[1]},uH0c:{value:this.h0Tex[2]},uL:{value:L},uChop:{value:chop},uT:{value:0},uN:{value:N}});
    this.mFFT=fsMat(FFT_FRAG,{uSrc:{value:null},uN:{value:N},uStage:{value:0},uDir:{value:0}});
    this.mFinal=fsMat(FINAL_FRAG,{uSrc:{value:null},uN:{value:N},uC:{value:0},uWhich:{value:0}});
    this.mFoam=fsMat(FOAM_FRAG,{uPrev:{value:null},uDisp:{value:null},uDecay:{value:.98},uThr:{value:.92},uGain:{value:2.2}});
    for(const pair of this.foam)for(const t of pair)this.clearRT(t)}
  clearRT(t){const r=this.renderer,prev=r.getRenderTarget();r.setRenderTarget(t);r.setClearColor(0x000000,0);r.clear(true,false,false);r.setRenderTarget(prev)}
  buildEnv(){if(this.envRT)this.envRT.dispose();const s=this.q.envSize;
    this.envRT=new THREE.WebGLCubeRenderTarget(s,{type:this.half,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
    this.cubeCam=new THREE.CubeCamera(1,4000,this.envRT);this.cubeCam.children.forEach(c=>c.layers.set(1));this.envLod=Math.log2(s);this.envAge=1e9}
  buildMesh(){for(const m of this.meshes||[]){this.group.remove(m);m.geometry.dispose();m.material.dispose()}
    const q=this.q,geo=clipmapGeometry(q.s0,q.R,q.levels);this.snap=2*q.s0*4;
    const U={uDisp0:{value:this.disp[0].texture},uDisp1:{value:this.disp[1].texture},uDisp2:{value:this.disp[2].texture},
      uDeriv0:{value:this.deriv[0].texture},uDeriv1:{value:this.deriv[1].texture},uDeriv2:{value:this.deriv[2].texture},
      uFoam0:{value:null},uFoam1:{value:null},uFoam2:{value:null},uTerr:{value:this.terrain.texture},uTerrO:{value:new THREE.Vector2()},uTerrE:{value:this.terrain.E},
      uEnv:{value:this.envRT.texture},uEnvMaxLod:{value:this.envLod},uL:{value:new THREE.Vector3(...this.L)},uN:{value:this.N},uS0:{value:q.s0},uR:{value:q.R},uMaxLevel:{value:q.levels-1},
      uCenter:{value:new THREE.Vector2()},uTime:{value:0},uFogD:{value:0},uFogCol:{value:new THREE.Color()},uExposureNight:{value:1},
      uSunDir:{value:new THREE.Vector3(0,1,0)},uSunCol:{value:new THREE.Color(1,1,1)},uAmb:{value:new THREE.Color(.5,.6,.7)},
      uSigma:{value:new THREE.Vector3(.45,.075,.06)},uScatter:{value:new THREE.Vector3(.007,.050,.068)},uSSS:{value:new THREE.Vector3(.06,.42,.36)},uFoamCol:{value:new THREE.Vector3(.85,.9,.92)},
      uPLp:{value:[0,1,2,3].map(()=>new THREE.Vector3())},uPLc:{value:[0,1,2,3].map(()=>new THREE.Vector3())},uPLr:{value:[0,0,0,0]}};
    this.uniforms=U;
    const mk=(mul)=>{const m=new THREE.ShaderMaterial({vertexShader:OCEAN_VERT,fragmentShader:OCEAN_FRAG,uniforms:U,side:THREE.DoubleSide,transparent:true,depthWrite:!mul,depthTest:true,fog:false,
      blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:mul?THREE.ZeroFactor:THREE.OneFactor,blendDst:mul?THREE.SrcColorFactor:THREE.OneFactor,defines:mul?{PASS_MUL:1}:{}});
      const o=new THREE.Mesh(geo,m);o.frustumCulled=false;o.renderOrder=mul?-1.2:-1.1;o.name=mul?"ocean-transmit":"ocean-surface";return o};
    this.meshes=[mk(true),mk(false)];this.meshes.forEach(m=>this.group.add(m))}
  disposeSim(){for(const t of [...(this.atlas||[]),...(this.disp||[]),...(this.deriv||[]),...(this.foam||[]).flat(),...(this.h0Tex||[])])t.dispose()}
  setTerrainSampler(fn){this.terrain.setSampler(fn)}
  pass(mat,target){this.quad.material=mat;this.renderer.setRenderTarget(target);this.renderer.render(this.simScene,this.simCam)}
  simulate(dt){const r=this.renderer,prev=r.getRenderTarget(),ac=r.autoClear,xr=r.xr.enabled;r.autoClear=false;r.xr.enabled=false;
    const N=this.N,S=Math.log2(N);this.mSpec.uniforms.uT.value=this.time%LOOP_T;this.pass(this.mSpec,this.atlas[0]);
    let src=0;for(let dir=0;dir<2;dir++)for(let s=0;s<S;s++){const u=this.mFFT.uniforms;u.uSrc.value=this.atlas[src].texture;u.uStage.value=s;u.uDir.value=dir;this.pass(this.mFFT,this.atlas[1-src]);src=1-src}
    const fu=this.mFinal.uniforms;fu.uSrc.value=this.atlas[src].texture;
    for(let c=0;c<3;c++){fu.uC.value=c;fu.uWhich.value=0;this.pass(this.mFinal,this.disp[c]);fu.uWhich.value=1;this.pass(this.mFinal,this.deriv[c])}
    const fo=this.mFoam.uniforms,next=1-this.foamCur;fo.uDecay.value=Math.exp(-dt/2.2);
    for(let c=0;c<3;c++){fo.uPrev.value=this.foam[c][this.foamCur].texture;fo.uDisp.value=this.disp[c].texture;fo.uThr.value=[.7,.84,.76][c];this.pass(this.mFoam,this.foam[c][next])}
    this.foamCur=next;r.setRenderTarget(prev);r.autoClear=ac;r.xr.enabled=xr}
  updateEnv(camPos,force){if(!force&&++this.envAge<this.q.envEvery)return;this.envAge=0;const r=this.renderer,sm=r.shadowMap,au=sm.autoUpdate,nu=sm.needsUpdate;sm.autoUpdate=false;sm.needsUpdate=false;
    this.cubeCam.position.copy(camPos);this.cubeCam.update(r,this.scene);sm.autoUpdate=au;sm.needsUpdate=nu}
  scanLights(){if(--this.lightScan>0)return;this.lightScan=30;this.lights=[];this.scene.traverse(o=>{if(o.isPointLight)this.lights.push(o)})}
  /** per frame: o={dt,camera,sunDir,sunColor(intensity-scaled),ambient,fog} */
  update(o){const dt=Math.min(o.dt||0,.1);this.time+=dt;this.frame++;const cam=o.camera.position,U=this.uniforms;
    this.terrain.update(cam.x,cam.z);U.uTerr.value=this.terrain.texture;U.uTerrO.value.copy(this.terrain.originV);
    this.simulate(dt||1/60);U.uFoam0.value=this.foam[0][this.foamCur].texture;U.uFoam1.value=this.foam[1][this.foamCur].texture;U.uFoam2.value=this.foam[2][this.foamCur].texture;
    U.uCenter.value.set(Math.round(cam.x/this.snap)*this.snap,Math.round(cam.z/this.snap)*this.snap);U.uTime.value=this.time;
    if(o.sunDir)U.uSunDir.value.copy(o.sunDir);if(o.sunColor)U.uSunCol.value.copy(o.sunColor);if(o.ambient)U.uAmb.value.copy(o.ambient);
    if(o.fog){U.uFogD.value=o.fog.density||0;U.uFogCol.value.copy(o.fog.color)}
    this.scanLights();const ls=this.lights.filter(l=>l.intensity>0&&l.visible).map(l=>[l,l.intensity/Math.max(1,l.position.distanceToSquared(cam))]).sort((a,b)=>b[1]-a[1]).slice(0,4);
    for(let i=0;i<4;i++){const l=ls[i]?.[0];if(l){U.uPLp.value[i].copy(l.position);U.uPLc.value[i].set(l.color.r,l.color.g,l.color.b).multiplyScalar(l.intensity);U.uPLr.value[i]=l.distance||60}else U.uPLr.value[i]=0}
    // re-render the sky cube at its cadence, or at once when the light or fog changes (time skips, sleeping, weather)
    const ls0=this._envKey||(this._envKey=new THREE.Vector4(0,0,0,-1)),fc=o.fog?o.fog.color:null,key=(o.sunDir?o.sunDir.x+o.sunDir.y*3+o.sunDir.z*7:0)+(fc?fc.r+fc.g*3+fc.b*7:0);
    const jump=Math.abs(key-ls0.w)>.004;ls0.w=key;this.updateEnv(cam,o.forceEnv||jump)}
  /** CPU wave height (m) at world x,z for buoyancy; groundY (terrain height) attenuates waves in shallows like the shader */
  heightAt(x,z,groundY=-40){const depth=-groundY,aW=sstep(.3,9,depth);if(aW<=0)return 0;const t=this.time%LOOP_T;return aW*(this.samplers[0](x,z,t)+this.samplers[1](x,z,t))}
  set visible(v){this.group.visible=v}get visible(){return this.group.visible}
}
function sstep(a,b,x){const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)}
