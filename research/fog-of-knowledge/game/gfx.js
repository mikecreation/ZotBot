/* Fog of Knowledge: The Game — graphics layer (v2).
 * PBR lighting, Preetham sky, FFT ocean (ocean.js), clouds, terrain/vegetation shaders,
 * animated glTF human, procedural animals, particles and post-processing.
 * three.js r160 + addons are vendored under ./vendor (MIT). Human model and animations:
 * Quaternius "Universal Animation Library" (CC0), see ./assets/CREDITS.txt. */
import * as THREE from "./vendor/three.module.min.js";
import {Sky} from "./vendor/addons/objects/Sky.js";
import {Ocean,OCEAN_QUALITY} from "./ocean.js?v=3.28.0";
import {GLTFLoader} from "./vendor/addons/loaders/GLTFLoader.js";
import {mergeGeometries,mergeVertices} from "./vendor/addons/utils/BufferGeometryUtils.js";
import {clone as cloneSkinned} from "./vendor/addons/utils/SkeletonUtils.js";
import {loadRealHuman,dressRealHuman,realGrip,wantClassicHuman,initRealHands,poseRealHands} from "./human-real.js";
import {EffectComposer} from "./vendor/addons/postprocessing/EffectComposer.js";
import {RenderPass} from "./vendor/addons/postprocessing/RenderPass.js";
import {UnrealBloomPass} from "./vendor/addons/postprocessing/UnrealBloomPass.js";
import {OutputPass} from "./vendor/addons/postprocessing/OutputPass.js";
import {ShaderPass} from "./vendor/addons/postprocessing/ShaderPass.js";
import {SMAAPass} from "./vendor/addons/postprocessing/SMAAPass.js";
import {FXAAShader} from "./vendor/addons/shaders/FXAAShader.js";

/* ---------------- quality presets ---------------- */
export const QUALITY={
  low:  {label:"Low",  pr:1,   shadows:0,    post:false,bloom:false,aa:"none",ocean:"low",   grass:0,    grassR:0,flowers:0,  clouds:true, fireShadow:false,particles:.5},
  high: {label:"High", pr:1.25,shadows:2048, post:true, bloom:true, aa:"fxaa",ocean:"med", grass:9000, grassR:1,flowers:140,clouds:true, fireShadow:1,fireShadowMap:256,particles:1},
  ultra:{label:"Ultra",pr:2,   shadows:4096, post:true, bloom:true, aa:"smaa",ocean:"high",grass:18000,grassR:1,flowers:260,clouds:true, fireShadow:2,fireShadowMap:512,particles:1.4}
};
const QKEY="fog-of-knowledge:game:quality";
export function loadQualityPref(){try{const q=localStorage.getItem(QKEY);if(QUALITY[q])return q}catch(_){}return "high"}
export function saveQualityPref(q){try{localStorage.setItem(QKEY,q)}catch(_){}}
export let Q=QUALITY.high, qName="high";

/* shared animated uniforms */
export const U={time:{value:0},wind:{value:1},grassFar:{value:55},wet:{value:0},sunDir:{value:new THREE.Vector3(0,1,0)}};

/* ---------------- height + distance fog (patched into every material) ---------------- */
THREE.ShaderChunk.fog_pars_vertex=`#ifdef USE_FOG
 varying float vFogDepth; varying float vFogY;
#endif`;
THREE.ShaderChunk.fog_vertex=`#ifdef USE_FOG
 vFogDepth = - mvPosition.z;
 vFogY = ( transpose( mat3( viewMatrix ) ) * mvPosition.xyz ).y + cameraPosition.y;
#endif`;
THREE.ShaderChunk.fog_pars_fragment=`#ifdef USE_FOG
 uniform vec3 fogColor; varying float vFogDepth; varying float vFogY;
 #ifdef FOG_EXP2
  uniform float fogDensity;
 #else
  uniform float fogNear; uniform float fogFar;
 #endif
#endif`;
THREE.ShaderChunk.fog_fragment=`#ifdef USE_FOG
 #ifdef FOG_EXP2
  float fogH = exp( - max( vFogY - 6.0, 0.0 ) / 70.0 );
  float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth * ( 0.45 + 0.9 * fogH ) );
  fogFactor = max( fogFactor, smoothstep( 300.0, 372.0, vFogDepth ) );
 #else
  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
 #endif
 gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

/* ---------------- GLSL helpers ---------------- */
const NOISE_GLSL=`
float fk_h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float fk_vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fk_h21(i),fk_h21(i+vec2(1,0)),f.x),mix(fk_h21(i+vec2(0,1)),fk_h21(i+vec2(1,1)),f.x),f.y);}
float fk_fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*fk_vn(p);p=p*2.03+17.1;a*=.5;}return s;}
`;

/* ---------------- renderer / scene / post ---------------- */
export let renderer,scene,camera,composer,sun,hemi,sky,water,ocean,clouds,stars,moonMesh,moonGlow,rainLines,snowPts,bloomPass;
let container,renderPass,outputPass,aaPass,gradePass,lightningLight;
export function initGfx(el,q){
  container=el;
  renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:"high-performance",preserveDrawingBuffer:true,stencil:false});
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.62;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setSize(el.clientWidth,el.clientHeight);
  el.appendChild(renderer.domElement);
  scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x9fb8cc,.0042);
  camera=new THREE.PerspectiveCamera(62,el.clientWidth/el.clientHeight,.1,1500);
  hemi=new THREE.HemisphereLight(0xbcd6ff,0x4f4434,1.1);scene.add(hemi);
  sun=new THREE.DirectionalLight(0xfff0d8,3.2);scene.add(sun);scene.add(sun.target);
  const sc=sun.shadow.camera;sc.left=-70;sc.right=70;sc.top=70;sc.bottom=-70;sc.near=1;sc.far=420;
  sun.shadow.bias=-.0004;sun.shadow.normalBias=.04;
  lightningLight=new THREE.DirectionalLight(0xdceaff,0);scene.add(lightningLight);scene.add(lightningLight.target);
  // sky (Preetham) with night, overcast and horizon blending added
  sky=new Sky();sky.scale.setScalar(1200);sky.renderOrder=-10;
  const su=sky.material.uniforms;su.turbidity.value=2.2;su.rayleigh.value=2.4;su.mieCoefficient.value=.0045;su.mieDirectionalG.value=.86;
  su.flash={value:0};su.fogCol={value:new THREE.Color()};su.skyGain={value:.32};su.skySat={value:1.9};su.nightAmt={value:0};su.overcast={value:0};su.overcastCol={value:new THREE.Color(.42,.46,.5)};
  sky.material.fragmentShader="uniform float flash; uniform vec3 fogCol; uniform float nightAmt; uniform float overcast; uniform vec3 overcastCol; uniform float skyGain; uniform float skySat;\n"+
    sky.material.fragmentShader.replace("gl_FragColor = vec4( retColor, 1.0 );",`
      retColor *= skyGain; { float sl = dot(retColor, vec3(.2126,.7152,.0722)); retColor = max(mix(vec3(sl), retColor, skySat), 0.); }
      vec3 nightC = mix(vec3(0.010,0.018,0.045), vec3(0.0015,0.003,0.012), clamp(direction.y*1.6,0.,1.));
      retColor = mix(retColor, nightC, nightAmt);
      retColor = mix(retColor, overcastCol*(0.75+0.35*clamp(direction.y,0.,1.)), overcast);
      float hz = 1.0 - smoothstep(-0.03, 0.11, direction.y);
      retColor = mix(retColor, fogCol, hz);
      retColor += vec3(.62,.75,1.) * flash * .75;
      gl_FragColor = vec4( retColor, 1.0 );`);
  scene.add(sky);
  // stars + moon
  const sp=[],sc2=[],r=rng(7);for(let i=0;i<2600;i++){const u=r()*2-1,a=r()*Math.PI*2,s=Math.sqrt(1-u*u);sp.push(Math.cos(a)*s*900,Math.abs(u)*900+20,Math.sin(a)*s*900);const t=r();sc2.push(.75+t*.25,.8+t*.15,1);}
  const sg=new THREE.BufferGeometry();sg.setAttribute("position",new THREE.Float32BufferAttribute(sp,3));sg.setAttribute("color",new THREE.Float32BufferAttribute(sc2,3));
  stars=new THREE.Points(sg,new THREE.PointsMaterial({size:1.8,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:0,fog:false,depthWrite:false}));stars.renderOrder=-9;scene.add(stars);
  moonMesh=new THREE.Mesh(new THREE.SphereGeometry(14,24,16),new THREE.MeshBasicMaterial({color:new THREE.Color(2.2,2.3,2.5),fog:false,transparent:true}));moonMesh.renderOrder=-8;scene.add(moonMesh);
  moonGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:0x9fb6ff,transparent:true,opacity:.5,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));moonGlow.scale.setScalar(140);moonGlow.renderOrder=-8;scene.add(moonGlow);
  // clouds layer
  clouds=makeClouds();scene.add(clouds);
  // water: FFT ocean (ocean.js). Sky, stars, moon and clouds also live on layer 1 so the ocean's cube camera reflects them.
  for(const o of [sky,stars,moonMesh,moonGlow,clouds])o.layers.enable(1);
  ocean=new Ocean(renderer,scene,{quality:waterQualityName(QUALITY[q]?.ocean)});water=ocean.group;
  // precipitation
  rainLines=makeRain();scene.add(rainLines);snowPts=makeSnow();scene.add(snowPts);
  FX.init();
  setQuality(q);
  window.addEventListener("resize",resize);
}
export function resize(){const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(composer){composer.setSize(w,h);updateAA()}FX.resize()}
function updateAA(){const w=container.clientWidth,h=container.clientHeight,pr=renderer.getPixelRatio();if(aaPass&&aaPass.material&&aaPass.material.uniforms.resolution)aaPass.material.uniforms.resolution.value.set(1/(w*pr),1/(h*pr))}
// water quality follows the graphics preset (Low→low, High→medium, Ultra→high); ?water=low|med|high overrides it
function waterQualityName(fromPreset){let o=null;try{o=new URLSearchParams(location.search).get("water")}catch(_){}return OCEAN_QUALITY[o]?o:OCEAN_QUALITY[fromPreset]?fromPreset:"med"}
export function setWaterQuality(name){if(ocean&&OCEAN_QUALITY[name])ocean.setQuality(name);return ocean?.qName}
export function setWaterTerrain(fn){if(ocean)ocean.setTerrainSampler(fn)}
/** CPU wave height (m above sea level 0) for floating objects; ground = terrain height there (waves die out in shallows) */
export function waveHeight(x,z,ground){return ocean?ocean.heightAt(x,z,ground):0}
export function oceanStats(){return ocean?{quality:ocean.qName,N:ocean.N,time:+ocean.time.toFixed(2),cascades:ocean.L.slice()}:null}
export function setQuality(name){
  qName=QUALITY[name]?name:"high";Q=QUALITY[qName];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,Q.pr));
  renderer.setSize(container.clientWidth,container.clientHeight);
  // shadows
  renderer.shadowMap.enabled=Q.shadows>0;sun.castShadow=Q.shadows>0;
  if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null}
  sun.shadow.mapSize.set(Q.shadows||512,Q.shadows||512);
  scene.traverse(o=>{if(o.material){const m=Array.isArray(o.material)?o.material:[o.material];m.forEach(x=>x.needsUpdate=true)}});
  // water
  if(ocean)ocean.setQuality(waterQualityName(Q.ocean));
  // post-processing chain: render → bloom → tone map/sRGB → AA → grade/vignette
  if(composer){composer.dispose?.();composer=null}
  composer=new EffectComposer(renderer);
  renderPass=new RenderPass(scene,camera);composer.addPass(renderPass);
  bloomPass=null;aaPass=null;
  if(Q.bloom){bloomPass=new UnrealBloomPass(new THREE.Vector2(container.clientWidth,container.clientHeight),.32,.55,.92);composer.addPass(bloomPass)}
  outputPass=new OutputPass();composer.addPass(outputPass);
  if(Q.aa==="fxaa"){aaPass=new ShaderPass(FXAAShader);composer.addPass(aaPass)}
  else if(Q.aa==="smaa"){aaPass=new SMAAPass(container.clientWidth*renderer.getPixelRatio(),container.clientHeight*renderer.getPixelRatio());composer.addPass(aaPass)}
  if(Q.post){gradePass=new ShaderPass(GradeShader);composer.addPass(gradePass)}else gradePass=null;
  composer.setSize(container.clientWidth,container.clientHeight);updateAA();
  FX.resize();
}
export const MIRROR_HIDE=new Set();   // legacy: objects that were skipped by the old planar mirror (the FFT ocean reflects only the sky layer)
const GradeShader={uniforms:{tDiffuse:{value:null},uVig:{value:.32},uTint:{value:new THREE.Vector3(1,1,1)},uUnder:{value:0}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform sampler2D tDiffuse;uniform float uVig;uniform vec3 uTint;uniform float uUnder;varying vec2 vUv;
  void main(){vec4 c=texture2D(tDiffuse,vUv);vec2 d=vUv-.5;float v=1.-uVig*smoothstep(.25,.85,length(d*vec2(1.25,1.)));
  vec3 col=c.rgb*uTint; float l=dot(col,vec3(.299,.587,.114)); col=mix(vec3(l),col,1.08); // slight saturation
  col=mix(col,col*vec3(.35,.75,.85)+vec3(0.,.04,.06),uUnder);
  gl_FragColor=vec4(col*v,c.a);}`};
export function setUnderwater(k){if(gradePass)gradePass.uniforms.uUnder.value=k}
const _oSun=new THREE.Color(),_oAmb=new THREE.Color();
export function render(dt){
  U.time.value+=dt;
  if(ocean){_oSun.copy(sun.color).multiplyScalar(sun.intensity*(.3+.7*ENV.day));   // moonlight on water stays a faint glitter: nights are meant to be dark
    _oAmb.copy(hemi.color).multiplyScalar(hemi.intensity);
    ocean.update({dt,camera,sunDir:ENV.lightDir,sunColor:_oSun,ambient:_oAmb,fog:scene.fog})}
  if(clouds)clouds.material.uniforms.uTime.value+=dt;
  FX.update(dt);
  composer.render(dt);
}

/* ---------------- helpers ---------------- */
export function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
let _glow=null;
export function glowTexture(){if(_glow)return _glow;const c=document.createElement("canvas");c.width=c.height=64;const g=c.getContext("2d"),gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,"rgba(255,255,255,1)");gr.addColorStop(.25,"rgba(255,255,255,.55)");gr.addColorStop(1,"rgba(255,255,255,0)");g.fillStyle=gr;g.fillRect(0,0,64,64);_glow=new THREE.CanvasTexture(c);_glow.colorSpace=THREE.SRGBColorSpace;return _glow}
const sm=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};

/* ---------------- clouds ---------------- */
function makeClouds(){
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false,
    uniforms:{uTime:{value:0},uCover:{value:.4},uLit:{value:new THREE.Color(1,1,1)},uShade:{value:new THREE.Color(.5,.55,.62)},uFog:{value:new THREE.Color()},uSun:U.sunDir,uOpacity:{value:1}},
    vertexShader:`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:NOISE_GLSL+`uniform float uTime,uCover,uOpacity;uniform vec3 uLit,uShade,uFog,uSun;varying vec3 vW;
    void main(){vec2 uv=vW.xz*.0021+vec2(uTime*.006,uTime*.0025);
      float d=fk_fbm(uv)+.5*fk_fbm(uv*2.7+3.1)-.25;
      float d2=fk_fbm(uv+normalize(uSun.xz+1e-4)*.035)+.5*fk_fbm((uv+normalize(uSun.xz+1e-4)*.035)*2.7+3.1)-.25;
      float a=smoothstep(1.-uCover,1.-uCover+.16,d)*.92;
      float light=clamp(.55+(d-d2)*3.5,0.,1.);
      vec3 col=mix(uShade,uLit,light);
      float dist=length(vW.xz-cameraPosition.xz);
      col=mix(col,uFog,smoothstep(500.,1300.,dist));
      a*=1.-smoothstep(1100.,1450.,dist);
      gl_FragColor=vec4(col,a*uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const c=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000),m);c.rotation.x=-Math.PI/2;c.position.y=270;c.renderOrder=-5;c.frustumCulled=false;return c;
}
/* ---------------- precipitation ---------------- */
function makeRain(){const n=2600,p=new Float32Array(n*6),r=rng(3);for(let i=0;i<n;i++){const x=(r()-.5)*60,y=r()*36-12,z=(r()-.5)*60;p.set([x,y,z,x+.04,y-.55,z+.02],i*6)}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(p,3));
  const l=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xa8bccf,transparent:true,opacity:.38,depthWrite:false}));l.frustumCulled=false;l.visible=false;return l}
function makeSnow(){const n=3200,p=new Float32Array(n*3),r=rng(4);for(let i=0;i<n;i++)p.set([(r()-.5)*60,r()*30-10,(r()-.5)*60],i*3);
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(p,3));
  const s=new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:.11,map:glowTexture(),transparent:true,opacity:.9,depthWrite:false}));s.frustumCulled=false;s.visible=false;return s}
function stepPrecip(o,dt,cam,fall,drift){const p=o.geometry.attributes.position,a=p.array,line=o.isLineSegments,st=line?6:3;
  for(let i=0;i<a.length;i+=st){a[i+1]-=fall*dt;a[i]+=drift*dt;if(line){a[i+4]-=fall*dt;a[i+3]+=drift*dt}
    if(a[i+1]<-12){a[i+1]+=36;if(line)a[i+4]+=36}if(a[i]>30){a[i]-=60;if(line)a[i+3]-=60}}
  p.needsUpdate=true;o.position.copy(cam)}

/* ---------------- environment: sun, moon, sky, fog, light ---------------- */
const C={dayFog:new THREE.Color(0xa9c6e2),duskFog:new THREE.Color(0xd8a27c),nightFog:new THREE.Color(0x0b1424),rainFog:new THREE.Color(0x7d8894),
  sunNoon:new THREE.Color(0xfff3e0),sunGold:new THREE.Color(0xffa860),moon:new THREE.Color(0x9db4ff),
  hemiDay:new THREE.Color(0xbcd6ff),hemiNight:new THREE.Color(0x2a3c66),gDay:new THREE.Color(0x5a4c38),gNight:new THREE.Color(0x0e1218),
  wDay:new THREE.Color(0x0a3444),wNight:new THREE.Color(0x02080e)};
const _c1=new THREE.Color(),_v=new THREE.Vector3(),_tgt=new THREE.Vector3();
export const ENV={fogColor:new THREE.Color(),day:1,lightDir:new THREE.Vector3(0,1,0),moonFrac:.5,moonPhase:0,expMul:1,night:0};
// moon phase from the game calendar: synodic month 29.53 days; illuminated fraction f = (1 − cos 2π·phase)/2
export function moonPhase(gameTime){const ph=((gameTime/86400+11)/29.53)%1;return {phase:ph,frac:(1-Math.cos(2*Math.PI*ph))/2}}
export function updateEnvironment(o){
  // o: {sunDir, el, amt, kind, pos (player), cam, snow, gameTime, dt, under}
  const {sunDir,el,amt}=o,day=sm(-.12,.25,el),gold=1-sm(.04,.42,Math.abs(el)),cloudy=o.kind==="cloudy"?1:0;
  ENV.day=day;
  const flash=Math.max(0,Math.min(1,o.flash||0));
  lightningLight.intensity=flash*7;
  lightningLight.target.position.copy(o.pos);lightningLight.position.set(o.pos.x+50,o.pos.y+180,o.pos.z-70);
  U.wet.value+=(amt-U.wet.value)*Math.min(1,(o.dt||0)*.07);

  // fog colour (also the sky's horizon colour)
  _c1.copy(C.nightFog).lerp(C.duskFog,sm(-.2,.06,el)).lerp(C.dayFog,sm(.06,.4,el));
  _c1.lerp(C.rainFog.clone().multiplyScalar(.25+.75*day),Math.min(1,amt*.8+cloudy*.25));
  _c1.multiplyScalar(1-(1-day)*(.6-.35*ENV.moonFrac));   // moonless nights: the horizon is nearly black too
  ENV.fogColor.copy(_c1);
  if(o.under){ENV.fogColor.setRGB(.02,.16,.2).multiplyScalar(.3+.7*day);scene.fog.density=.05}
  else scene.fog.density=(.0023+.0075*amt+cloudy*.0008)*(1+.3*(1-day));
  scene.fog.color.copy(ENV.fogColor);
  // sky
  const su=sky.material.uniforms;su.sunPosition.value.copy(sunDir);su.fogCol.value.copy(ENV.fogColor);
  su.flash.value=flash;su.nightAmt.value=1-sm(-.16,.06,el);su.overcast.value=Math.min(.92,amt*.85+cloudy*.35)*(.3+.7*day);
  su.overcastCol.value.copy(C.rainFog).multiplyScalar(.35+.65*day);
  su.rayleigh.value=2.4+1.2*gold;su.turbidity.value=2.2+7*amt;
  sky.position.copy(o.cam);
  // key light: sun by day, moon by night (bluish, dim)
  const moonDir=_v.copy(sunDir).multiplyScalar(-1);
  const useSun=el>-.04;ENV.lightDir.copy(useSun?sunDir:moonDir);
  if(ENV.lightDir.y<.08){ENV.lightDir.y=.08;ENV.lightDir.normalize()}
  if(useSun){sun.color.copy(C.sunNoon).lerp(C.sunGold,gold);sun.intensity=4.2*sm(-.04,.22,el)*(1-.7*amt)*(1-.3*cloudy)}
  // night: moonlight only (faint, phase-dependent: full moon ≈ 0.25 lux), starlight minimal; no exposure boost
  const mp=moonPhase(o.gameTime||0);ENV.moonFrac=mp.frac;ENV.moonPhase=mp.phase;ENV.night=1-day;
  if(!useSun){sun.color.copy(C.moon);sun.intensity=(.006+.15*mp.frac)*sm(-.04,.3,moonDir.y)*(1-.85*amt)}
  U.sunDir.value.copy(ENV.lightDir);
  // shadow camera follows the player, snapped to texels to avoid shimmering
  const ts=140/(Q.shadows||512);_tgt.set(Math.round(o.pos.x/ts)*ts,o.pos.y,Math.round(o.pos.z/ts)*ts);
  sun.target.position.copy(_tgt);sun.position.copy(_tgt).addScaledVector(ENV.lightDir,200);
  hemi.color.copy(C.hemiNight).lerp(C.hemiDay,day);hemi.groundColor.copy(C.gNight).lerp(C.gDay,day);hemi.intensity=(.035+.07*mp.frac*sm(-.04,.3,moonDir.y)*(1-.8*amt))*(1-day)+1.3*day;
  renderer.toneMappingExposure=.62*ENV.expMul; // eye adaptation + optional brightness slider (world.js); never an automatic night boost
  hemi.intensity+=flash*2.5;
  scene.fog.color.lerp(new THREE.Color(.65,.76,.95),flash*.6);
  // stars & moon
  stars.material.opacity=(1-day)*(1-amt*.9)*(1-cloudy*.5);stars.position.copy(o.cam);stars.rotation.y=o.gameTime/86164*2*Math.PI;stars.visible=stars.material.opacity>.01;
  moonMesh.position.copy(o.cam).addScaledVector(moonDir,820);moonGlow.position.copy(moonMesh.position);
  moonMesh.visible=moonGlow.visible=moonDir.y>-.08;moonGlow.material.opacity=.45*(1-day*.8)*(1-amt)*(.15+.85*mp.frac);moonMesh.material.opacity=(1-amt*.85)*(.2+.8*mp.frac);
  // clouds
  const cu=clouds.material.uniforms;cu.uCover.value=.4+cloudy*.2+amt*.35;cu.uFog.value.copy(ENV.fogColor);
  cu.uLit.value.copy(sun.color).multiplyScalar(.35+1.25*day).lerp(C.rainFog,amt*.6);cu.uShade.value.copy(ENV.fogColor).multiplyScalar(.55+.2*day);cu.uLit.value.addScalar(flash*1.7);cu.uShade.value.addScalar(flash*.7);
  clouds.position.set(o.cam.x,270,o.cam.z);
  // water: the ocean (ocean.js) is lit from sun/moon/hemi/fog in render(); nothing to tint here
  // precipitation
  const prec=amt>.15;rainLines.visible=prec&&!o.snow;snowPts.visible=prec&&o.snow;
  if(rainLines.visible){rainLines.material.opacity=.15+.3*amt;stepPrecip(rainLines,o.dt,o.cam,13,2)}
  if(snowPts.visible)stepPrecip(snowPts,o.dt,o.cam,1.3,.6);
  U.wind.value=1+amt*1.6+cloudy*.5;
  if(gradePass)gradePass.uniforms.uVig.value=.3+.15*(1-day);
}

/* ---------------- procedural noise for geometry ---------------- */
function h3(x,y,z){let h=Math.imul((x|0)^0x27d4eb2d,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,2147483647);h=Math.imul(h^h>>>13,1274126177);return((h^h>>>16)>>>0)/4294967296}
function vn3(x,y,z){const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z),fx=x-X,fy=y-Y,fz=z-Z,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),w=fz*fz*(3-2*fz);
  const l=(a,b,t)=>a+(b-a)*t;
  return l(l(l(h3(X,Y,Z),h3(X+1,Y,Z),u),l(h3(X,Y+1,Z),h3(X+1,Y+1,Z),u),v),l(l(h3(X,Y,Z+1),h3(X+1,Y,Z+1),u),l(h3(X,Y+1,Z+1),h3(X+1,Y+1,Z+1),u),v),w)}
function displace(g,amp,freq,seed=0){if(!g.index){g.deleteAttribute("uv");g.deleteAttribute("normal");g=mergeVertices(g)}const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),l=Math.hypot(x,y,z)||1;
  const n=(vn3(x*freq+seed,y*freq,z*freq)-.5)*2+(vn3(x*freq*2.3,y*freq*2.3+seed,z*freq*2.3)-.5);const k=1+n*amp;p.setXYZ(i,x*k,y*k,z*k)}g.computeVertexNormals();return g}
function vcolor(g,fn){const p=g.attributes.position,c=new Float32Array(p.count*3),col=new THREE.Color();for(let i=0;i<p.count;i++){fn(col,p.getX(i),p.getY(i),p.getZ(i),i);c[i*3]=col.r;c[i*3+1]=col.g;c[i*3+2]=col.b}g.setAttribute("color",new THREE.BufferAttribute(c,3));return g}
const lin=v=>Math.pow(v,2.2);
function clean(g){const n=g.index?g.toNonIndexed():g;for(const k of Object.keys(n.attributes))if(!["position","normal","color","uv"].includes(k))n.deleteAttribute(k);if(!n.attributes.uv)n.setAttribute("uv",new THREE.BufferAttribute(new Float32Array(n.attributes.position.count*2),2));return n}
function merge(list){return mergeGeometries(list.map(clean),false)}

/* ---------------- materials ---------------- */
export const MAT={},GEO={};
function windPatch(amp){return function(sh){sh.uniforms.uTime=U.time;sh.uniforms.uWind=U.wind;
  sh.vertexShader="uniform float uTime;uniform float uWind;\n"+sh.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
  #ifdef USE_INSTANCING
   vec3 ip=vec3(instanceMatrix[3][0],instanceMatrix[3][1],instanceMatrix[3][2]);
  #else
   vec3 ip=vec3(modelMatrix[3][0],modelMatrix[3][1],modelMatrix[3][2]);
  #endif
  float k=max(position.y-1.2,0.)*${amp.toFixed(3)}*uWind;
  float ph=uTime*1.25+ip.x*.21+ip.z*.17;
  transformed.x+=k*(sin(ph)+.35*sin(ph*2.7+1.3));transformed.z+=k*.6*cos(ph*.8+.5);`)}}
function grassPatch(sh){sh.uniforms.uTime=U.time;sh.uniforms.uWind=U.wind;sh.uniforms.uFar=U.grassFar;
  sh.vertexShader="uniform float uTime;uniform float uWind;uniform float uFar;\n"+sh.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
   vec3 ip=vec3(instanceMatrix[3][0],instanceMatrix[3][1],instanceMatrix[3][2]);
   float hh=position.y*position.y;
   float ph=uTime*1.9+ip.x*.33+ip.z*.29;
   float gust=.5+.5*sin(uTime*.6+ip.x*.04+ip.z*.03);
   transformed.x+=hh*(.55*sin(ph)+.25*sin(ph*2.3))*uWind*(.5+gust);
   transformed.z+=hh*.35*cos(ph*.9)*uWind;
   float dc=distance(ip.xz,cameraPosition.xz);
   transformed*=1.-smoothstep(uFar*.6,uFar,dc);`);
  sh.fragmentShader=sh.fragmentShader.replace("#include <normal_fragment_begin>","#include <normal_fragment_begin>\n normal=normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz);")}
function terrainPatch(sh){sh.uniforms.uTime=U.time;sh.uniforms.uWet=U.wet;
  sh.vertexShader="varying vec3 vTW;varying vec3 vTN;\n"+sh.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\n vTW=(modelMatrix*vec4(transformed,1.)).xyz; vTN=normalize(mat3(modelMatrix)*objectNormal);");
  sh.fragmentShader="varying vec3 vTW;varying vec3 vTN;uniform float uWet;uniform float uTime;\n"+NOISE_GLSL+sh.fragmentShader
   .replace("#include <color_fragment>",`#include <color_fragment>
    vec2 tp=vTW.xz;
    float n1=fk_vn(tp*.31),n2=fk_vn(tp*1.9+7.),n3=fk_fbm(tp*.045),n4=fk_vn(tp*6.5);
    float slope=1.-clamp(vTN.y,0.,1.);
    vec3 base=diffuseColor.rgb*(.78+.34*n1+.12*n2+.08*n4)*(.88+.24*n3);
    // grass ↔ dry patches
    base=mix(base,base*vec3(1.18,1.05,.72),smoothstep(.55,.8,n3)*step(.0,base.g-base.r)*.6);
    // rock on steep slopes (triplanar-ish noise using y)
    float rn=fk_vn(vec2(vTW.x+vTW.z,vTW.y)*.9)*.6+fk_vn(tp*3.1)*.4;
    vec3 rock=vec3(.26,.245,.225)*(.7+.6*rn);
    float rk=smoothstep(.36,.55,slope+(n1-.5)*.14);
    base=mix(base,rock,rk);
    // snow caps on high, flat ground
    float sl=148.+n3*45.;
    float sn=smoothstep(sl-14.,sl+8.,vTW.y)*(1.-smoothstep(.42,.66,slope));
    base=mix(base,vec3(.86,.9,.95)*(.92+.08*n2),sn);
    // wet sand band, underwater darkening
    float tWet=smoothstep(.6,-.05,vTW.y);
    base*=1.-.38*tWet;
    base=mix(base,vec3(.05,.12,.12),smoothstep(-.4,-7.,vTW.y)*.3);   // the ocean's Beer–Lambert pass does the real depth tint
    // shoreline foam
    float wave=.07*sin(uTime*1.4+n2*6.28+tp.x*.05);
    float fo=(1.-smoothstep(0.,.2,abs(vTW.y-.06-wave)))*smoothstep(.45,.75,fk_vn(tp*1.3+vec2(uTime*.25,0.)));
    base=mix(base,vec3(.85,.9,.92),fo*.85);
    // Soil flecks, pebbles and weather-driven wetness, stable in world space.
    float grit=fk_vn(tp*22.0),pebbles=smoothstep(.80,.94,fk_vn(tp*8.0));
    base*=.90+.16*grit; base=mix(base,base*vec3(.68,.64,.58),pebbles*.24);
    base*=1.-uWet*.18*(1.-sn);
    diffuseColor.rgb=base;`)
   .replace("#include <roughnessmap_fragment>",`#include <roughnessmap_fragment>
    roughnessFactor=mix(roughnessFactor,.32,tWet*(1.-smoothstep(-.3,-1.,vTW.y)));roughnessFactor=mix(roughnessFactor,.55,sn);roughnessFactor=mix(roughnessFactor,.4,uWet*(1.-sn));`)
   .replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
    float closeDetail=1.-smoothstep(18.,55.,distance(vTW,cameraPosition));
    float relief=fk_vn(vTW.xz*7.)*.035+fk_vn(vTW.xz*23.)*.008;
    vec3 q0=dFdx(vViewPosition),q1=dFdy(vViewPosition);
    vec3 surfR=cross(q1,normal),surfS=cross(normal,q0);
    normal=normalize(normal-(surfR*dFdx(relief)+surfS*dFdy(relief))*closeDetail/max(abs(dot(q0,surfR)),.0001));`)}
function surfaceDetail(kind){return sh=>{
  sh.uniforms.uWet=U.wet;
  sh.vertexShader="varying vec3 vSurface;\n"+sh.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
    #ifdef USE_INSTANCING
    vSurface=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;
    #else
    vSurface=(modelMatrix*vec4(transformed,1.)).xyz;
    #endif`);
  sh.fragmentShader="varying vec3 vSurface;uniform float uWet;\n"+NOISE_GLSL+sh.fragmentShader.replace("#include <color_fragment>",`#include <color_fragment>
    float fleck=fk_vn(vSurface.xz*15.+vSurface.y*3.);
    float groove=${kind==="bark"?"pow(abs(sin(vSurface.y*1.7+fk_vn(vSurface.xz*6.)*12.)),12.)":"smoothstep(.35,.7,fk_fbm(vSurface.xz*2.+vSurface.y))"};
    diffuseColor.rgb*=.78+.28*fleck-.16*groove;
    diffuseColor.rgb*=1.-uWet*.2;`).replace("#include <roughnessmap_fragment>",`#include <roughnessmap_fragment>
    roughnessFactor=mix(roughnessFactor,.42,uWet*.65);`);
}}
export function initMaterials(){
  MAT.terrain=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93,metalness:0});MAT.terrain.onBeforeCompile=terrainPatch;
  MAT.bark=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95});MAT.bark.onBeforeCompile=surfaceDetail("bark");
  MAT.leaf=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,side:THREE.DoubleSide});MAT.leaf.onBeforeCompile=windPatch(.035);
  MAT.bush=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85});MAT.bush.onBeforeCompile=windPatch(.0);
  MAT.rock=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,metalness:.02});MAT.rock.onBeforeCompile=surfaceDetail("rock");
  MAT.item=new THREE.MeshStandardMaterial({vertexColors:false,roughness:.7});
  MAT.grass=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,side:THREE.DoubleSide});MAT.grass.onBeforeCompile=grassPatch;
  MAT.flower=new THREE.MeshStandardMaterial({vertexColors:false,roughness:.6,emissive:0x111111});MAT.flower.onBeforeCompile=grassPatch;
  MAT.trunk=MAT.bark;MAT.crown=MAT.leaf;
  buildGeometries();
}
function buildGeometries(){
  const bark=(c,x,y,z)=>{const n=vn3(x*9,y*3,z*9);c.setRGB(lin(.30+.1*n),lin(.21+.06*n),lin(.14+.04*n))};
  // pine
  const pt=new THREE.CylinderGeometry(.07,.24,3.8,8,4);pt.translate(0,1.9,0);vcolor(pt,bark);
  const cones=[];[[1.0,1.75,2.0],[1.9,1.42,1.8],[2.75,1.08,1.6],[3.5,.7,1.45],[4.15,.36,1.1]].forEach(([y,r,h],i)=>{let c=new THREE.ConeGeometry(r,h,11,2,true);c=displace(c,.09,1.6,i*7);c.translate(0,y+h/2,0);
    vcolor(c,(col,x,yy,z)=>{const t=(yy-y)/h,n=vn3(x*3,yy*3,z*3);col.setRGB(lin(.11+.05*n+.06*t),lin(.24+.08*n+.12*t),lin(.13+.04*n+.04*t))});cones.push(c)});
  GEO.pineTrunk=merge([pt]);GEO.pineCrown=merge(cones);
  // broadleaf
  const bt=new THREE.CylinderGeometry(.13,.27,3,8,4);bt.translate(0,1.5,0);
  const br1=new THREE.CylinderGeometry(.05,.1,1.4,6);br1.rotateZ(.8);br1.translate(.5,2.6,0);const br2=br1.clone();br2.rotateY(2.4);
  const forks=[];for(let j=0;j<5;j++){const branch=new THREE.CylinderGeometry(.025,.09,1.55,6,2);branch.rotateZ(.7+j*.08);branch.translate(.52,2.6+j*.13,0);branch.rotateY(j*2.4);forks.push(vcolor(branch,bark))}
  GEO.broadTrunk=merge([vcolor(bt,bark),vcolor(br1,bark),vcolor(br2,bark),...forks]);
  const blobs=[];const r=rng(11);for(let i=0;i<14;i++){const rad=.62+r()*.48;let g=new THREE.IcosahedronGeometry(rad,1);const angle=i*2.39996,spread=.35+Math.sqrt(r())*1.05;const cx=Math.cos(angle)*spread,cy=3.0+r()*1.65,cz=Math.sin(angle)*spread;
    g=displace(g,.13,1.3,i*3);g.translate(cx,cy,cz);
    const p=g.attributes.position,nrm=g.attributes.normal;for(let k=0;k<p.count;k++){_v.set(p.getX(k),p.getY(k)-3.5,p.getZ(k)).normalize();nrm.setXYZ(k,(nrm.getX(k)+_v.x*2)/3,(nrm.getY(k)+_v.y*2)/3,(nrm.getZ(k)+_v.z*2)/3)}
    vcolor(g,(col,x,y,z)=>{const n=vn3(x*2.5,y*2.5,z*2.5),ao=.55+.45*Math.min(1,Math.max(0,(y-2.4)/2.4));col.setRGB(lin((.2+.08*n)*ao),lin((.38+.12*n)*ao),lin((.12+.05*n)*ao))});blobs.push(g);
    // Pointed leaves break up the old smooth ball silhouette; merged into the
    // same instanced canopy geometry, without one draw call per leaf.
    for(let j=0;j<12;j++){const leaf=new THREE.BufferGeometry(),w=.11+r()*.12,len=.22+r()*.19;
      leaf.setAttribute("position",new THREE.Float32BufferAttribute([0,0,-len,w,.035,0,0,0,len,0,0,-len,0,0,len,-w,.035,0],3));leaf.computeVertexNormals();
      leaf.rotateX(r()*3);leaf.rotateY(r()*6.283);const a=r()*6.283,yy=r()*2-1,rr=Math.sqrt(1-yy*yy)*rad;
      leaf.translate(cx+Math.cos(a)*rr,cy+yy*rad,cz+Math.sin(a)*rr);vcolor(leaf,col=>col.setRGB(lin(.22+r()*.12),lin(.40+r()*.12),lin(.10+r()*.08)));blobs.push(leaf)}
  }
  GEO.broadCrown=merge(blobs);
  // palm: curved trunk + drooping fronds
  const segs=[];for(let i=0;i<6;i++){const c=new THREE.CylinderGeometry(.15-i*.012,.18-i*.012,.85,8);c.rotateZ(-.06*i);c.translate(.05*i*i,.42+i*.8,0);vcolor(c,(col,x,y,z)=>{const ring=.5+.5*Math.sin(y*14);col.setRGB(lin(.42+.08*ring),lin(.33+.05*ring),lin(.22+.03*ring))});segs.push(c)}
  GEO.palmTrunk=merge(segs);
  const fr=[];for(let i=0;i<8;i++){const g=new THREE.PlaneGeometry(.55,2.6,1,6);const p=g.attributes.position;for(let k=0;k<p.count;k++){const v=p.getY(k)+1.3,w=p.getX(k)*(1-v/2.8);p.setXYZ(k,w,-.32*v*v,v)}
    g.computeVertexNormals();g.rotateY(i/8*Math.PI*2+.3);g.translate(1.25,4.85,0);vcolor(g,(col,x,y,z)=>{const t=Math.min(1,Math.hypot(x-1.25,z)/2.6);col.setRGB(lin(.24+.1*t),lin(.42+.06*t),lin(.13))});fr.push(g)}
  GEO.palmCrown=merge(fr);
  // dead tree
  const dt=new THREE.CylinderGeometry(.08,.22,2.6,7);dt.translate(0,1.3,0);const d1=new THREE.CylinderGeometry(.03,.07,1.1,5);d1.rotateZ(.9);d1.translate(.45,2.1,0);const d2=d1.clone();d2.rotateY(2.2);const d3=d1.clone();d3.rotateY(4.1);d3.translate(0,-.5,0);
  GEO.deadTrunk=merge([dt,d1,d2,d3].map(g=>vcolor(g,(c,x,y,z)=>{const n=vn3(x*9,y*3,z*9);c.setRGB(lin(.36+.08*n),lin(.31+.05*n),lin(.27+.04*n))})));
  // boulder & small stones
  const bo=displace(new THREE.IcosahedronGeometry(1,3),.2,1.1,5);vcolor(bo,(c,x,y,z)=>{const n=vn3(x*3,y*3,z*3),m=Math.max(0,y-.35)*1.6*vn3(x*1.5+9,y,z*1.5);c.setRGB(lin(.42+.12*n-.12*m),lin(.4+.1*n+.02*m),lin(.37+.08*n-.12*m))});
  GEO.boulder=merge([bo]);
  GEO.small=merge([vcolor(displace(new THREE.IcosahedronGeometry(1,1),.18,1.6,2),c=>c.setRGB(1,1,1))]);MAT.stone=new THREE.MeshStandardMaterial({color:0x6d6860,roughness:.9});
  GEO.stick=vcolor(new THREE.CylinderGeometry(.035,.045,1,6),bark);GEO.stick.rotateZ(Math.PI/2);
  // bushes / plant tufts
  let bu=displace(new THREE.IcosahedronGeometry(1,2),.22,1.7,9);{const p=bu.attributes.position,nn=bu.attributes.normal;for(let k=0;k<p.count;k++){_v.set(p.getX(k),p.getY(k),p.getZ(k)).normalize();nn.setXYZ(k,(nn.getX(k)+_v.x*2)/3,(nn.getY(k)+_v.y*2)/3,(nn.getZ(k)+_v.z*2)/3)}}bu.scale(1,.7,1);bu.translate(0,.45,0);
  vcolor(bu,(c,x,y,z)=>{const n=vn3(x*4,y*4,z*4),ao=.5+.5*Math.min(1,y/1.1);c.setRGB(ao*(.75+.25*n),ao*(.8+.2*n),ao*(.75+.25*n))});
  GEO.bush=merge([bu]);GEO.tuft=GEO.bush;
  // grass clump: 3 curved tapered blades
  const blades=[];for(let i=0;i<5;i++){const g=new THREE.PlaneGeometry(.085,.6,1,2);const p=g.attributes.position;
    for(let k=0;k<p.count;k++){const t=(p.getY(k)+.3)/.6;p.setXYZ(k,p.getX(k)*(1-t*.85),t*.6,t*t*.12)}
    g.rotateY(i*2.1+.4);g.translate(Math.cos(i*2.1)*.06,0,Math.sin(i*2.1)*.06);
    vcolor(g,(c,x,y)=>{const t=y/.6;c.setRGB(lin(.24+.2*t),lin(.4+.22*t),lin(.1+.1*t))});
    const nn=g.attributes.normal;for(let k=0;k<nn.count;k++)nn.setXYZ(k,0,1,0);blades.push(g)}
  GEO.grass=merge(blades);
  const fl=new THREE.IcosahedronGeometry(.055,0);fl.translate(0,.36,0);const st=new THREE.CylinderGeometry(.012,.018,.36,5);st.translate(0,.18,0);
  GEO.flower=mergeGeometries([fl.toNonIndexed(),st.toNonIndexed()].map(g=>{g.deleteAttribute("uv");return g}),false);
}

/* ---------------- grass, flowers & bushes for near chunks ---------------- */
const BIOME_GRASS={grass:[.95,1.0,.9],forest:[.7,.85,.65],beach:null,desert:null,rock:null,snow:null,water:null};
export function buildGrass(cx,cz,size,sample,seed){
  // sample(x,z) → {h, biome, slope}
  if(!Q.grass)return null;
  const r=rng(seed),n=Q.grass,m=new THREE.InstancedMesh(GEO.grass,MAT.grass,n),c=new THREE.Color();
  // Flowers are harvestable resource instances, independent of grass quality.
  let k=0;const x0=cx*size,z0=cz*size;
  for(let i=0;i<n;i++){const x=x0+r()*size,z=z0+r()*size,s=sample(x,z),t=BIOME_GRASS[s.biome];
    if(!t||s.h<.5||s.slope>.7)continue;
    const sc=.45+r()*.5;_m4.compose(_p3.set(x,s.h-.03,z),_q4.setFromAxisAngle(_up,r()*6.283),_s3.set(sc,sc*(.7+r()*.6),sc));m.setMatrixAt(k,_m4);
    const v=.85+r()*.3;c.setRGB(t[0]*v,t[1]*v,t[2]*v*(.9+r()*.2));m.setColorAt(k,c);k++;}
  m.count=k;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.receiveShadow=true;m.frustumCulled=true;m.computeBoundingSphere();
  const g=new THREE.Group();g.add(m);MIRROR_HIDE.add(g);
  return g;
}
const _m4=new THREE.Matrix4(),_q4=new THREE.Quaternion(),_p3=new THREE.Vector3(),_s3=new THREE.Vector3(),_up=new THREE.Vector3(0,1,0);
export function disposeGroup(g){if(!g)return;MIRROR_HIDE.delete(g);g.parent?.remove(g);g.traverse(o=>{if(o.isInstancedMesh)o.dispose()})}

/* ---------------- fire visuals ---------------- */
let emptyFireBed;
export function makeFlame(kiln){
  if(!emptyFireBed){emptyFireBed=new THREE.DataTexture(new Uint8Array([255]),1,1,THREE.RedFormat);emptyFireBed.needsUpdate=true}
  const g=new THREE.Group(),geo=new THREE.BoxGeometry(1.3,1.6,1.3);geo.translate(0,.8,0);
  // A small ray-marched volume: turbulent density fills space rather than
  // exposing intersecting flat flame cards when the camera moves around it.
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,uniforms:{uBedMap:{value:emptyFireBed},uUseBed:{value:0},uHeight:{value:1},uBed:{value:0},uInside:{value:0},uTime:{value:0},uHeat:{value:1},uEye:{value:new THREE.Vector3()},uSteps:{value:Q.label==='Low'?12:20}},
    vertexShader:`varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D uBedMap;uniform float uUseBed;uniform float uHeight;uniform float uTime;uniform float uHeat;uniform float uSteps;uniform float uBed;uniform float uInside;uniform vec3 uEye;varying vec3 vP;
    float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    void main(){if((uInside<.5&&!gl_FrontFacing)||(uInside>.5&&gl_FrontFacing))discard;vec3 ray=normalize(vP-uEye),invRay=1./mix(vec3(.00001),ray,step(vec3(.00001),abs(ray)));vec3 t0=(vec3(-.65,0.,-.65)-uEye)*invRay,t1=(vec3(.65,1.6,.65)-uEye)*invRay,lo=min(t0,t1),hi=max(t0,t1);float entry=max(0.,max(lo.x,max(lo.y,lo.z))),exit=min(hi.x,min(hi.y,hi.z));if(exit<=entry)discard;float stepSize=(exit-entry)/uSteps,alpha=0.;vec3 p=uEye+ray*(entry+stepSize*.5),sum=vec3(0.);
      for(int i=0;i<24;i++){if(float(i)>=uSteps||alpha>.97)break;if(abs(p.x)>.655||abs(p.z)>.655||p.y<0.||p.y>1.605)break;
        float y=p.y/1.6;vec3 q=p*4.1-vec3(uTime*.13,uTime*1.9,uTime*.09);float n=noise(q)*.65+noise(q*2.03+7.1)*.35;
        vec2 curl=vec2(sin(y*6.-uTime*1.6),cos(y*7.+uTime*1.3))*.095*y;float radial=length(p.xz),surface=texture2D(uBedMap,p.xz/1.3+.5).r,bed=uUseBed>.5?surface*1.6:uBed*pow(clamp(1.-radial/.65,0.,1.),2.);float radius=.53*pow(1.-y,.38);
        float density=clamp((radius-length(p.xz+curl))*2.8+(n-.52)*1.8,0.,1.)*smoothstep(max(.04/uHeight,bed-.08/uHeight),bed+.12/uHeight,p.y)*(uUseBed>.5?smoothstep(0.,.002,surface):1.)*(1.-smoothstep(.78,1.,y));
        density=smoothstep(.22,.84,density);float a=density*(.055+.02*uHeat)*(stepSize/.1125),hot=clamp(density*.7+(1.-y)*.35,0.,1.);vec3 color=mix(vec3(1.5,.105,.003),vec3(1.85,.8,.1),hot);color=mix(color,vec3(2.1,1.55,.55),pow(hot,8.)*.4);
        sum+=(1.-alpha)*a*color*3.;alpha+=(1.-alpha)*a;p+=ray*stepSize;
      }
      if(alpha<.008)discard;gl_FragColor=vec4(sum/max(alpha,.001),alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const core=new THREE.Mesh(geo,mat);core.position.y=.04;if(kiln)core.scale.setScalar(.62);core.onBeforeRender=(_r,_s,cam)=>{const eye=core.worldToLocal(mat.uniforms.uEye.value.copy(cam.position));const inside=Math.abs(eye.x)<.65&&Math.abs(eye.z)<.65&&eye.y>0&&eye.y<1.6;mat.uniforms.uInside.value=inside?1:0;mat.depthTest=!inside};g.add(core);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:0xff862b,transparent:true,opacity:.025,depthWrite:false,blending:THREE.AdditiveBlending}));halo.scale.setScalar(kiln?1:1.65);halo.position.y=.5;g.add(halo);g.userData={core,halo};return g;
}
export function animateFlame(g,time,heat,bed=0,pile=null,support=null){const m=g.userData.core?.material;if(!m?.uniforms)return;m.uniforms.uTime.value=time;m.uniforms.uHeat.value=heat;m.uniforms.uBed.value=bed;m.uniforms.uHeight.value=g.scale.y;m.uniforms.uSteps.value=g.scale.x>8?12:Q.label==='Low'?12:20;
  if(!pile)return;
  const stamp=pile.ids.length+':'+Math.round(g.scale.x*20)+':'+Math.round(g.scale.y*20)+':'+Math.floor((pile.surfaceMass||0)*2);if(g.userData.bedStamp===stamp)return;g.userData.bedStamp=stamp;
  if(!g.userData.bedMap){const t=new THREE.DataTexture(new Uint8Array(32*32),32,32,THREE.RedFormat);t.minFilter=t.magFilter=THREE.LinearFilter;g.userData.bedMap=t;m.uniforms.uBedMap.value=t;m.uniforms.uUseBed.value=1}
  const texture=g.userData.bedMap,data=texture.image.data;data.fill(0);
  for(const [k,h] of support||pile.grid){const z=Math.round(k/65536),x=k-z*65536,value=Math.max(1,Math.min(255,Math.round(h/g.scale.y/1.6*255)));
    const x0=Math.max(0,Math.floor(((x*.3-.16)/g.scale.x/1.3+.5)*32)),x1=Math.min(31,Math.ceil(((x*.3+.16)/g.scale.x/1.3+.5)*32)),z0=Math.max(0,Math.floor(((z*.3-.16)/g.scale.z/1.3+.5)*32)),z1=Math.min(31,Math.ceil(((z*.3+.16)/g.scale.z/1.3+.5)*32));
    for(let iz=z0;iz<=z1;iz++)for(let ix=x0;ix<=x1;ix++){const i=iz*32+ix;data[i]=Math.max(data[i],value)}
  }texture.needsUpdate=true;
}


/* ---------------- particles ---------------- */
export const FX={
  sys:[],acc:new Map(),
  init(){this.add=this.make(2600,THREE.AdditiveBlending);this.alpha=this.make(1600,THREE.NormalBlending);},
  make(n,blending){
    const g=new THREE.BufferGeometry(),pos=new Float32Array(n*3),col=new Float32Array(n*4),size=new Float32Array(n);
    g.setAttribute("position",new THREE.BufferAttribute(pos,3));g.setAttribute("aColor",new THREE.BufferAttribute(col,4));g.setAttribute("aSize",new THREE.BufferAttribute(size,1));
    const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending,uniforms:{uScale:{value:400}},
      vertexShader:`attribute vec4 aColor;attribute float aSize;uniform float uScale;varying vec4 vC;void main(){vC=aColor;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uScale/max(.1,-mv.z);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying vec4 vC;void main(){float r=length(gl_PointCoord-.5);float a=smoothstep(.5,.05,r);if(a<.01)discard;gl_FragColor=vec4(vC.rgb,vC.a*a);}`});
    const pts=new THREE.Points(g,m);pts.frustumCulled=false;pts.renderOrder=6;scene.add(pts);MIRROR_HIDE.add(pts);
    const s={pts,n,live:[],free:[...Array(n).keys()].reverse(),pos,col,size};this.sys.push(s);return s},
  resize(){const h=container.clientHeight*renderer.getPixelRatio();for(const s of this.sys)s.pts.material.uniforms.uScale.value=h/(2*Math.tan(camera.fov*Math.PI/360))},
  emit(s,o){if(!s.free.length)return;const i=s.free.pop();s.live.push({i,...o,age:0})},
  rate(key,perSec,dt){const a=(this.acc.get(key)||0)+perSec*dt*Q.particles;const n=Math.floor(a);this.acc.set(key,a-n);return n},
  fire(key,x,y,z,heat,dt,big=1,smoke=1){
    for(let k=this.rate(key+"f",10*heat*big,dt);k>0;k--)this.emit(this.add,{t:"flame",x:x+(Math.random()-.5)*.35*big,y:y+.05,z:z+(Math.random()-.5)*.35*big,vx:(Math.random()-.5)*.2,vy:1.1+Math.random()*1.1,vz:(Math.random()-.5)*.2,life:.45+Math.random()*.4,s:(.12+Math.random()*.16)*big});
    for(let k=this.rate(key+"e",6*heat,dt);k>0;k--)this.emit(this.add,{t:"ember",x,y:y+.3,z,vx:(Math.random()-.5)*.6,vy:1.5+Math.random()*2,vz:(Math.random()-.5)*.6,life:1.4+Math.random()*1.4,s:.06});
    for(let k=this.rate(key+"s",7*heat*big*smoke,dt);k>0;k--)this.emit(this.alpha,{t:"smoke",x:x+(Math.random()-.5)*.3,y:y+.9*big,z:z+(Math.random()-.5)*.3,vx:.25+(Math.random()-.5)*.2,vy:.7+Math.random()*.5,vz:(Math.random()-.5)*.2,life:3+Math.random()*2.5,s:.5*big});
  },
  sparks(x,y,z,n=24){for(let i=0;i<n*Q.particles;i++){const a=Math.random()*6.283,u=Math.random()*2-1,sp=2+Math.random()*4,q=Math.sqrt(1-u*u);this.emit(this.add,{t:"spark",x,y,z,vx:Math.cos(a)*q*sp,vy:Math.abs(u)*sp+1,vz:Math.sin(a)*q*sp,life:.25+Math.random()*.45,s:.05,g:1})}},
  dust(x,y,z,n=12){for(let i=0;i<n*Q.particles;i++){const a=Math.random()*6.283,sp=.5+Math.random()*1.2;this.emit(this.alpha,{t:"dust",x,y:y+.05,z,vx:Math.cos(a)*sp,vy:.2+Math.random()*.4,vz:Math.sin(a)*sp,life:.7+Math.random()*.6,s:.35})}},
  splash(x,z,n=40){for(let i=0;i<n*Q.particles;i++){const a=Math.random()*6.283,sp=.6+Math.random()*1.8;this.emit(this.alpha,{t:"splash",x,y:.05,z,vx:Math.cos(a)*sp,vy:2+Math.random()*3,vz:Math.sin(a)*sp,life:.6+Math.random()*.5,s:.14,g:1})}},
  update(dt){
    for(const s of this.sys){const {pos,col,size}=s;
      for(let j=s.live.length-1;j>=0;j--){const p=s.live[j];p.age+=dt;const i=p.i;
        if(p.age>=p.life){size[i]=0;col[i*4+3]=0;s.free.push(i);s.live[j]=s.live[s.live.length-1];s.live.pop();continue}
        const t=p.age/p.life;if(p.g)p.vy-=9.81*dt;if(p.t==="ember"){p.vx+=(Math.random()-.5)*dt*3;p.vz+=(Math.random()-.5)*dt*3}
        p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.t==="splash"&&p.y<0)p.age=p.life;
        pos[i*3]=p.x;pos[i*3+1]=p.y;pos[i*3+2]=p.z;
        let r,g,b,a,sz;
        if(p.t==="flame"){const f=1-t;r=2.1*f+.3;g=1.1*f*f+.12;b=.22*f*f*f;a=f;sz=p.s*(1-t*.65)}
        else if(p.t==="ember"){r=3;g=1.1*(1-t);b=.2;a=1-t;sz=p.s}
        else if(p.t==="spark"){r=4;g=2.6*(1-t)+.6;b=1*(1-t);a=1-t;sz=p.s}
        else if(p.t==="smoke"){const v=.28-.08*t;r=v;g=v;b=v*1.04;a=.32*Math.sin(Math.PI*Math.min(1,t*1.4))*(1-t);sz=p.s*(1+3.2*t)}
        else if(p.t==="dust"){r=.5;g=.45;b=.37;a=.45*(1-t);sz=p.s*(1+1.8*t)}
        else {r=.8;g=.9;b=.95;a=.85*(1-t);sz=p.s}
        col[i*4]=r;col[i*4+1]=g;col[i*4+2]=b;col[i*4+3]=a;size[i]=sz}
      s.pts.geometry.attributes.position.needsUpdate=s.pts.geometry.attributes.aColor.needsUpdate=s.pts.geometry.attributes.aSize.needsUpdate=true}
  }
};

/* ---------------- human: Quaternius UAL mannequin (CC0), dressed by shader ---------------- */
let humanAsset=null,humanPromise=null;
function loadClassicHuman(){return new Promise(res=>{new GLTFLoader().load("assets/human.gltf.json",g=>res(g),undefined,e=>{console.warn("Human model unavailable, using procedural fallback:",e&&e.message);res(null)})})}
// realistic MakeHuman character (human-real.js) by default; ?char=classic or a failed load keeps the UAL mannequin
export function loadHuman(){if(!humanPromise)humanPromise=(wantClassicHuman()?loadClassicHuman():loadRealHuman().catch(e=>{console.warn("Realistic human unavailable, using classic mannequin:",e&&e.message);return loadClassicHuman()})).then(g=>humanAsset=g);return humanPromise}
const DRESS={skin:new THREE.Color(0xc68c64),hair:new THREE.Color(0x2a1a10),tunic:new THREE.Color(0x6b7449),trousers:new THREE.Color(0x4a3a2a),belt:new THREE.Color(0x2c1d12),boots:new THREE.Color(0x30221a)};
function dressedMaterial(){
  const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.78,metalness:0});
  m.onBeforeCompile=function dressPatch(sh){for(const k in DRESS)sh.uniforms["c_"+k]={value:DRESS[k]};
    sh.vertexShader="varying vec3 vBind;\n"+sh.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\n vBind=position;");
    sh.fragmentShader="varying vec3 vBind;\n"+Object.keys(DRESS).map(k=>`uniform vec3 c_${k};`).join("")+NOISE_GLSL+sh.fragmentShader.replace("#include <color_fragment>",`#include <color_fragment>
      vec3 b=vBind;float ax=abs(b.x);vec3 cc;float rough=.8;
      if(b.y<.11) cc=c_boots;
      else if(b.y<.97&&ax<.32) cc=c_trousers*(.9+.2*fk_vn(b.xy*40.));
      else if(b.y<1.04&&ax<.3) cc=c_belt;
      else if(b.y>1.2&&ax>.2) cc=(ax<.47)?c_tunic:c_skin;
      else if(b.y<1.47) cc=c_tunic*(.88+.24*fk_vn(b.xy*55.));
      else cc=c_skin;
      if(b.y>1.71||(b.y>1.57&&b.z<-.015&&ax<.12)) cc=c_hair*(.8+.4*fk_vn(b.xz*90.));
      if(b.y>1.04&&b.y<1.47&&ax<.24&&abs(b.x)<.012&&b.z>0.) cc*=.6; // lacing
      diffuseColor.rgb=cc;`)};
  return m;
}
const _dressMat=()=>(_dm||(_dm=dressedMaterial()));let _dm=null;
const SWIM_DROP=-.62;
export function makeHuman(){
  const g=new THREE.Group();
  // hand anchors: the game puts real item meshes inside them (right = main hand, left = off hand)
  const held=new THREE.Group(),heldL=new THREE.Group();held.name="heldR";heldL.name="heldL";
  const fb=makeFallbackHuman();g.add(fb.root);fb.hand.add(held);held.position.set(0,-.6,.05);(fb.handL||fb.root).add(heldL);heldL.position.set(fb.handL?0:-.32,fb.handL?-.6:1,.05);
  g.userData={held,heldL,fb,mixer:null,actions:{},cur:null,once:0,onceName:null,phase:0,dead:false,inner:null};
  loadHuman().then(a=>{if(a)attachHuman(g,a)});
  return g;
}
function attachHuman(g,asset){
  const u=g.userData,real=!!asset.userData?.real,model=cloneSkinned(asset.scene),sc=real?1:1.75/1.83;model.scale.setScalar(sc);u.real=real;
  if(real)dressRealHuman(model);else model.traverse(o=>{if(o.isMesh){o.material=_dressMat();o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false}});
  const hand=model.getObjectByName("DEF-handR")||model.getObjectByName("DEF-hand.R");
  if(hand){u.held.removeFromParent();hand.add(u.held);u.held.position.copy(real?realGrip(hand):new THREE.Vector3(0,.09,.04));u.held.scale.setScalar(1/sc)}
  const handL=model.getObjectByName("DEF-handL")||model.getObjectByName("DEF-hand.L");
  if(handL){u.heldL.removeFromParent();handL.add(u.heldL);u.heldL.position.copy(real?realGrip(handL):new THREE.Vector3(0,.09,.04));u.heldL.scale.setScalar(1/sc)}
  u.handBones={R:hand?.name||null,L:handL?.name||null};
  u.handRig=real?initRealHands(u,model):null; // real hands: per-hand finger pose + grip seat (human-real.js)
  g.remove(u.fb.root);g.add(model);u.inner=model;
  u.mixer=new THREE.AnimationMixer(model);
  for(const c of asset.animations){const a=u.mixer.clipAction(c);if(/Death|Jump_Land|Jump_Start|Shoot|Punch|PickUp|Interact/.test(c.name)){a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true}u.actions[c.name]=a}
  u.cur=null;
}
function fade(u,name,t=.2,restart=false){if(u.cur===name&&!restart)return;const n=u.actions[name];if(!n)return;const o=u.actions[u.cur];n.reset();n.enabled=true;n.setEffectiveWeight(1);n.play();if(o&&o!==n)o.crossFadeTo(n,t,false);u.cur=name}
export function playOnce(h,name,dur){const u=h.userData;if(u.mixer&&u.actions[name]){u.onceName=name;u.once=dur||u.actions[name].getClip().duration*.85;fade(u,name,.12,true)}else u.fbThrow=.3}
export function animateHuman(h,speed,dt,swim,air,dead){
  const u=h.userData;
  if(!u.mixer){animateFallback(u,speed,dt,swim,air,dead);return}
  if(u.inner)u.inner.position.y=swim?SWIM_DROP:0;
  let want;
  if(dead)want="Death01";
  else if(u.once>0){u.once-=dt;want=u.onceName;if(swim||u.once<=0)u.once=0}
  if(!want||(!dead&&u.once<=0)){want=swim?(speed>.35?"Swim_Fwd_Loop":"Swim_Idle_Loop"):air?"Jump_Loop":speed>4.2?"Sprint_Loop":speed>2.6?"Jog_Fwd_Loop":speed>.2?"Walk_Loop":"Idle_Loop"}
  if(u.dead&&!dead)u.cur=null;u.dead=dead;
  fade(u,want,want==="Death01"?.3:.2);
  const a=u.actions[want];if(a){a.timeScale=want==="Walk_Loop"?Math.min(1.6,Math.max(.6,speed/1.55)):want==="Jog_Fwd_Loop"?Math.min(1.5,Math.max(.7,speed/3.4)):want==="Sprint_Loop"?Math.min(1.4,Math.max(.8,speed/5.4)):want==="Swim_Fwd_Loop"?Math.max(.6,speed/1.1):1}
  u.mixer.update(dt);
  if(u.handRig)poseRealHands(u,dt);
}
function makeFallbackHuman(){
  const skin=new THREE.MeshStandardMaterial({color:0xc68c64,roughness:.7}),cloth=new THREE.MeshStandardMaterial({color:0x8a6238,roughness:.9}),dark=new THREE.MeshStandardMaterial({color:0x4a3a2a,roughness:.9});
  const cap=(r,l,m)=>{const g=new THREE.CapsuleGeometry(r,l,4,10);g.translate(0,-l/2-r,0);const x=new THREE.Mesh(g,m);x.castShadow=true;return x};
  const root=new THREE.Group(),hips=new THREE.Group();hips.position.y=.95;root.add(hips);
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.17,.38,4,12),cloth);torso.position.y=.33;torso.castShadow=true;hips.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.12,16,12),skin);head.position.y=.74;head.castShadow=true;hips.add(head);
  const pivot=(x,y,m,r,l)=>{const p=new THREE.Group();p.position.set(x,y,0);p.add(cap(r,l,m));hips.add(p);return p};
  const armL=pivot(-.24,.56,skin,.05,.5),armR=pivot(.24,.56,skin,.05,.5),legL=pivot(-.1,.02,dark,.07,.72),legR=pivot(.1,.02,dark,.07,.72);
  const hand=new THREE.Group();hand.position.y=0;armR.add(hand);const handL=new THREE.Group();armL.add(handL);
  return {root,hips,armL,armR,legL,legR,hand,handL};
}
// Apply after the normal mixer: a two-bone reach keeps both real hands at the spindle.
export function poseHandDrill(h,point,time,climbing=false){
  const u=h.userData;u.held.visible=u.heldL.visible=false;h.updateMatrixWorld(true);
  for(const [side,anchor] of [[1,u.held],[-1,u.heldL]]){
    const hand=anchor.parent,lower=hand?.parent,upper=lower?.parent;
    if(!u.mixer||!hand?.isBone||!lower?.isBone||!upper?.isBone){
      const arm=side===1?u.fb.armR:u.fb.armL;arm.rotation.x=-1.1;arm.rotation.z=side*.35;continue;
    }
    const a=upper.getWorldPosition(new THREE.Vector3()),b=lower.getWorldPosition(new THREE.Vector3()),c=hand.getWorldPosition(new THREE.Vector3());
    const target=point.clone();target.y+=(climbing?1.25+Math.sin(time*5+side)*.15:.38+Math.sin(time*8)*.025);target.x+=Math.cos(h.rotation.y)*side*(climbing?.24:.025);target.z-=Math.sin(h.rotation.y)*side*(climbing?.24:.025);
    const l1=a.distanceTo(b),l2=b.distanceTo(c),dir=target.clone().sub(a),d=Math.max(.001,Math.min(dir.length(),(l1+l2)*.98));dir.normalize();
    const pole=new THREE.Vector3(side,-.2,0).applyAxisAngle(new THREE.Vector3(0,1,0),h.rotation.y);pole.addScaledVector(dir,-pole.dot(dir)).normalize();
    const along=(l1*l1-l2*l2+d*d)/(2*d),elbow=a.clone().addScaledVector(dir,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
    for(const [bone,child,dest] of [[upper,lower,elbow],[lower,hand,a.clone().addScaledVector(dir,d)]]){
      const pos=bone.getWorldPosition(new THREE.Vector3()),v=child.getWorldPosition(new THREE.Vector3()).sub(pos).normalize(),want=dest.clone().sub(pos).normalize();
      const q=new THREE.Quaternion().setFromUnitVectors(v,want).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));h.updateMatrixWorld(true);
    }
    if(!climbing)hand.rotateY(Math.sin(time*32)*.35);
  }
}
function animateFallback(u,speed,dt,swim,air,dead){const f=u.fb;u.phase+=dt*(2+speed*2.6);const sw=Math.min(1,speed/2.5)*.9;
  f.root.rotation.z=dead?Math.PI/2:0;
  if(swim){f.hips.rotation.x=1.2;f.armL.rotation.x=Math.sin(u.phase*1.4)*1.6-1.6;f.armR.rotation.x=-Math.sin(u.phase*1.4)*1.6-1.6;f.legL.rotation.x=Math.sin(u.phase*2)*.5;f.legR.rotation.x=-f.legL.rotation.x;f.hips.position.y=.45;return}
  f.hips.rotation.x=0;f.hips.position.y=.95+Math.abs(Math.sin(u.phase))*.05*sw;const a=air?.6:Math.sin(u.phase)*sw;
  f.legL.rotation.x=a;f.legR.rotation.x=air?-.3:-a;f.armL.rotation.x=-a*.8;f.armR.rotation.x=air?-1.2:a*.8;
  if(u.fbThrow>0){u.fbThrow-=dt;f.armR.rotation.x=-2.6+u.fbThrow*6}}

/* ---------------- animals (procedural, smooth PBR) ---------------- */
export function makeAnimalModel(kind,col,s){
  const g=new THREE.Group(),coat=new THREE.MeshStandardMaterial({color:col,roughness:.92}),dark=new THREE.MeshStandardMaterial({color:new THREE.Color(col).multiplyScalar(.45),roughness:.8}),
    light=new THREE.MeshStandardMaterial({color:new THREE.Color(col).lerp(new THREE.Color(0xffffff),.55),roughness:.9}),horn=new THREE.MeshStandardMaterial({color:0xd9ccb0,roughness:.6});
  const M=(geo,mat,x,y,z,parent=g)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m};
  const P={rabbit:{bl:.35,br:.2,leg:.16,lr:.045,neck:.0,hr:.13,legZ:.17,legX:.09},deer:{bl:.9,br:.27,leg:.75,lr:.05,neck:.45,hr:.15,legZ:.42,legX:.15},
    boar:{bl:.75,br:.34,leg:.36,lr:.07,neck:.05,hr:.2,legZ:.36,legX:.16},goat:{bl:.6,br:.25,leg:.48,lr:.05,neck:.2,hr:.14,legZ:.3,legX:.13},
    wolf:{bl:.75,br:.24,leg:.52,lr:.055,neck:.18,hr:.15,legZ:.36,legX:.13}}[kind];
  const k=s/({rabbit:.35,deer:1,boar:.8,goat:.75,wolf:.8}[kind]);
  const body=new THREE.Group();body.scale.setScalar(k);g.add(body);
  const bodyY=P.leg+P.br*.8;
  const tor=M(new THREE.CapsuleGeometry(P.br,P.bl,6,14),coat,0,bodyY,0,body);tor.rotation.x=Math.PI/2;
  if(kind==="boar")tor.scale.set(1,1,1.15);
  const head=new THREE.Group();head.position.set(0,bodyY+P.neck*.8+P.br*.3,P.bl/2+P.br*.6);body.add(head);
  if(P.neck>0){const n=M(new THREE.CapsuleGeometry(P.br*.45,P.neck,4,10),coat,0,bodyY+P.neck*.4,P.bl/2+P.br*.25,body);n.rotation.x=.5}
  const sk=M(new THREE.SphereGeometry(P.hr,14,10),coat,0,0,0,head);sk.scale.set(1,.95,1.15);
  const snout=M(new THREE.CapsuleGeometry(P.hr*.55,P.hr*(kind==="boar"?1.1:kind==="rabbit"?.2:.9),4,10),kind==="boar"?dark:coat,0,-P.hr*.25,P.hr*.95,head);snout.rotation.x=Math.PI/2;
  M(new THREE.SphereGeometry(P.hr*.16,8,6),dark,0,-P.hr*.25,P.hr*(kind==="boar"?1.75:kind==="rabbit"?1.1:1.55),head);
  for(const sx of [-1,1]){M(new THREE.SphereGeometry(P.hr*.12,8,6),new THREE.MeshStandardMaterial({color:0x080808,roughness:.2}),sx*P.hr*.62,P.hr*.25,P.hr*.6,head);
    const earL=kind==="rabbit"?P.hr*2.2:P.hr*.9;const e=M(new THREE.ConeGeometry(P.hr*(kind==="rabbit"?.3:.32),earL,6),kind==="rabbit"?light:coat,sx*P.hr*.5,P.hr*.75+earL*.4,-P.hr*.15,head);e.rotation.z=-sx*.35;e.scale.z=.45;
    if(kind==="deer"){const a=new THREE.Group();a.position.set(sx*P.hr*.35,P.hr*.9,0);head.add(a);const main=M(new THREE.CylinderGeometry(.015,.03,.55,5),horn,0,.27,0,a);main.rotation.z=-sx*.35;
      for(let t=0;t<3;t++){const tine=M(new THREE.CylinderGeometry(.01,.018,.22,4),horn,sx*(.06+t*.07),.18+t*.13,.05,a);tine.rotation.x=-.6;tine.rotation.z=-sx*.2}}
    if(kind==="goat"){const h=M(new THREE.TorusGeometry(.09,.025,6,10,Math.PI*1.1),horn,sx*P.hr*.4,P.hr*.9,-P.hr*.2,head);h.rotation.y=Math.PI/2}
    if(kind==="boar"){const t=M(new THREE.ConeGeometry(.02,.12,5),horn,sx*P.hr*.35,-P.hr*.35,P.hr*1.5,head);t.rotation.x=-.9}}
  if(kind==="goat")M(new THREE.ConeGeometry(.04,.16,5),light,0,-P.hr*.8,P.hr*.9,head).rotation.x=Math.PI;
  // tail
  const tail=new THREE.Group();tail.position.set(0,bodyY+P.br*.4,-P.bl/2-P.br*.6);body.add(tail);
  if(kind==="wolf"){const t=M(new THREE.CapsuleGeometry(.06,.42,4,8),coat,0,-.2,-.05,tail);t.rotation.x=-.5}
  else if(kind==="rabbit"||kind==="deer")M(new THREE.SphereGeometry(kind==="rabbit"?.06:.07,8,6),light,0,0,0,tail);
  else {const t=M(new THREE.CylinderGeometry(.015,.02,.22,4),dark,0,-.1,0,tail);t.rotation.x=-.3}
  const legs=[];
  for(const [x,z] of [[-P.legX,P.legZ],[P.legX,P.legZ],[-P.legX,-P.legZ],[P.legX,-P.legZ]]){
    const piv=new THREE.Group();piv.position.set(x,P.leg+P.br*.3,z);body.add(piv);
    const lg=new THREE.CapsuleGeometry(P.lr,P.leg,4,8);lg.translate(0,-P.leg/2-P.lr*.5,0);M(lg,coat,0,0,0,piv);
    M(new THREE.SphereGeometry(P.lr*1.05,8,6),dark,0,-P.leg-P.lr*.6,0,piv);legs.push(piv)}
  g.userData={head,tail};
  return {g,legs};
}

export function fitClimbingGloves(h,on){
 const u=h.userData;if(u.gloveInner===u.inner&&u.glovesOn===on)return;
 for(const g of u.gloves||[]){g.removeFromParent();g.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.dispose()}})}u.gloves=[];u.gloveInner=u.inner;u.glovesOn=on;if(!on)return;
 for(const anchor of [u.held,u.heldL]){const g=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:0x805236,roughness:.9});
 const palm=new THREE.Mesh(new THREE.BoxGeometry(.085,.12,.055),skin);g.add(palm);
 for(let i=0;i<3;i++){const spike=new THREE.Mesh(new THREE.ConeGeometry(.012,.055,6),new THREE.MeshStandardMaterial({color:0x9ba0a6,metalness:.8,roughness:.35}));spike.rotation.x=Math.PI/2;spike.position.set((i-1)*.025,0,.045);g.add(spike)}
 g.position.copy(anchor.position);anchor.parent.add(g);u.gloves.push(g);
 }
}
export function poseClimbing(h,time){const p=h.position.clone();p.x+=Math.sin(h.rotation.y)*.4;p.z+=Math.cos(h.rotation.y)*.4;poseHandDrill(h,p,time,true)}
