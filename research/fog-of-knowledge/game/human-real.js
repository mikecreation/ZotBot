/* Fog of Knowledge: The Game - realistic player character.
 * Mesh: MakeHuman base mesh + system assets generated with MPFB2 (CC0), clothed in procedurally
 * built Stone Age hide/fur/wraps, skinned onto the SAME 53-bone skeleton (identical names and rest
 * rotations) as the Quaternius UAL mannequin, so every existing clip, hand anchor and IK pose works
 * unchanged. The clips are baked into the asset. See assets/CREDITS.txt and assets/human-real/LICENSE.txt.
 * ?char=classic keeps the old mannequin; gfx.js also falls back to it if this asset fails to load. */
import * as THREE from "./vendor/three.module.min.js";
import {GLTFLoader} from "./vendor/addons/loaders/GLTFLoader.js";

export const REAL_HUMAN_URL="assets/human-real.gltf.json";
export const REAL_HUMAN_TEX="assets/human-real/";
/** mesh name -> material recipe (textures in assets/human-real/, all <= 2048 px) */
export const REAL_HUMAN_PARTS=Object.freeze({
  Body:{kind:"skin",map:"skin.jpg",normal:"skin_n.jpg",rough:"skin_r.jpg",detail:"skin_detail_n.jpg"},
  Eyes:{kind:"eye",map:"eye.webp",alphaTest:.5},
  Eyebrows:{kind:"card",map:"brow.webp",color:0x7a6556,alphaTest:.28,solid:true},
  Eyelashes:{kind:"card",map:"lash.webp",color:0x2a1c14,alphaTest:.04},
  Hair:{kind:"hair",map:"hair.webp",normal:"hair_n.jpg",color:0xc4b09c,alphaTest:.5},
  Beard:{kind:"beard",map:"beard.webp",alpha:"beard_mask.jpg",color:0xd0c0b0,alphaTest:.5},
  Tunic:{kind:"cloth",map:"leather_d.jpg",normal:"leather_n.jpg",color:0xffffff,rough:.8},
  Skirt:{kind:"cloth",map:"leather_d.jpg",normal:"leather_n.jpg",color:0xe8ddd0,rough:.82},
  Belt:{kind:"cloth",map:"leather_d.jpg",normal:"leather_n.jpg",color:0x5a3f2c,rough:.6},
  Fur:{kind:"cloth",map:"fur_d.webp",normal:"fur_n.jpg",color:0xffffff,rough:.95},
  FurTips:{kind:"fur",map:"fur_d.webp",normal:"fur_n.jpg",color:0xffffff,rough:.95,alphaTest:.5},
  Wraps:{kind:"cloth",map:"wrap_d.jpg",normal:"wrap_n.jpg",color:0xffffff,rough:.9},
  Bracers:{kind:"cloth",map:"wrap_d.jpg",normal:"wrap_n.jpg",color:0xd8c8b0,rough:.9}
});
export function wantClassicHuman(search){const s=search??(globalThis.location?.search||"");return /[?&]char=classic(&|$)/.test(s)}

// Skin: wrapped diffuse with a warm red tint where the light falls off - a cheap subsurface look.
const SSS=`float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	float fkWrap = saturate( ( dot( geometryNormal, directLight.direction ) + 0.5 ) / 1.5 );
	reflectedLight.directDiffuse += max( fkWrap - dotNL, 0.0 ) * directLight.color * vec3( 0.42, 0.16, 0.10 ) * BRDF_Lambert( material.diffuseColor );`;
const DIRECT_RE=/float dotNL = saturate\( dot\( geometryNormal, directLight\.direction \) \);\s*vec3 irradiance = dotNL \* directLight\.color;/;
// Pores: a tiled detail normal blended (whiteout) over the body-space macro normal map.
const DETAIL_RE=/mapN\.xy \*= normalScale;/;
const DETAIL=`mapN.xy *= normalScale;
	vec3 fkD = texture2D( fkDetail, vNormalMapUv * fkDetailRep ).xyz * 2.0 - 1.0;
	mapN = normalize( vec3( mapN.xy + fkD.xy * fkDetailScale, mapN.z ) );`;
export function skinPatch(sh,detail){const chunk=THREE.ShaderChunk.lights_physical_pars_fragment;
  if(DIRECT_RE.test(chunk))sh.fragmentShader=sh.fragmentShader.replace("#include <lights_physical_pars_fragment>",chunk.replace(DIRECT_RE,SSS));
  const nm=THREE.ShaderChunk.normal_fragment_maps;
  if(detail&&DETAIL_RE.test(nm)){sh.uniforms.fkDetail={value:detail};sh.uniforms.fkDetailRep={value:28};sh.uniforms.fkDetailScale={value:.22};
    sh.fragmentShader="uniform sampler2D fkDetail;\nuniform float fkDetailRep;\nuniform float fkDetailScale;\n"+sh.fragmentShader.replace("#include <normal_fragment_maps>",nm.replace(DETAIL_RE,DETAIL))}}
// Hair volume: extra shells pushed out along the bind-pose normal, alpha-tested against a fine strand noise.
function shellPatch(off){return sh=>{sh.uniforms.fkShell={value:off};
  sh.vertexShader="uniform float fkShell;\n"+sh.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\n\ttransformed += normal * fkShell;")}}
function strandNoise(n=256){const d=new Uint8Array(n*n*4);let s=12345;const r=()=>(s=(s*1103515245+12345)&0x7fffffff)/0x7fffffff;
  for(let i=0;i<n*n;i++){d[i*4]=d[i*4+1]=d[i*4+2]=0;d[i*4+3]=255}
  for(let k=0;k<n*n*.09;k++){const x=r()*n|0,y=r()*n|0,L=2+r()*5|0,v=150+r()*105|0;for(let j=0;j<L;j++){const yy=(y+j)%n,i=(yy*n+x)*4;d[i]=d[i+1]=d[i+2]=Math.max(d[i],v-j*12)}}
  const t=new THREE.DataTexture(d,n,n);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.repeat.set(10,10);t.needsUpdate=true;return t}

let mats=null;
function buildMaterials(){
  const il=new THREE.ImageLoader(),cache={};
  // Retry: the local dev server can drop connections for a few seconds while it restarts.
  const fetchInto=(t,url,n)=>il.load(url,img=>{t.image=img;t.needsUpdate=true},undefined,()=>{if(n>0)setTimeout(()=>fetchInto(t,url,n-1),1500);else console.warn("human-real: texture failed",url)});
  const tex=(f,srgb=true,rep=1)=>{const k=f+rep;if(cache[k])return cache[k];const t=new THREE.Texture();fetchInto(t,REAL_HUMAN_TEX+f,40);t.flipY=false;t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=8;if(rep!==1)t.repeat.set(rep,rep);return cache[k]=t};
  const out={};
  for(const [name,p] of Object.entries(REAL_HUMAN_PARTS)){
    let m;
    if(p.kind==="skin"){const detail=tex(p.detail,false);
      m=new THREE.MeshPhysicalMaterial({map:tex(p.map),normalMap:tex(p.normal,false),roughnessMap:tex(p.rough,false),roughness:1,
        specularIntensity:.55});m.onBeforeCompile=sh=>skinPatch(sh,detail);m.customProgramCacheKey=()=>"fk-skin2"}
    else if(p.kind==="eye")m=new THREE.MeshPhysicalMaterial({map:tex(p.map),color:new THREE.Color(1.22,1.18,1.16),roughness:.3,clearcoat:1,clearcoatRoughness:.03,specularIntensity:1,envMapIntensity:.6,alphaTest:p.alphaTest}); // wet cornea; its texels are alpha 0
    else if(p.kind==="card")m=new THREE.MeshStandardMaterial({map:tex(p.map),color:p.color,roughness:.85,alphaTest:p.alphaTest,transparent:!p.solid,depthWrite:!!p.solid,side:THREE.DoubleSide}); // blended strands (brows: solid cut-out so they read)
    else if(p.kind==="hair"){
      m=new THREE.MeshPhysicalMaterial({map:tex(p.map),normalMap:tex(p.normal,false),color:p.color,roughness:.6,anisotropy:.75,anisotropyRotation:Math.PI/2,specularIntensity:.3,alphaTest:p.alphaTest,side:THREE.DoubleSide});
      const fuzz=strandNoise();
      // soft fringe (blended, no depth write) + two fuzzy shells for volume
      m.userData.extra=[new THREE.MeshStandardMaterial({map:m.map,color:p.color,roughness:.75,transparent:true,alphaTest:.06,depthWrite:false,side:THREE.DoubleSide})];
      for(const [off,a] of [[.004,.5]]){const s=new THREE.MeshStandardMaterial({map:m.map,alphaMap:fuzz,color:new THREE.Color(p.color).multiplyScalar(1.08),normalMap:m.normalMap,roughness:.82,alphaTest:a,side:THREE.DoubleSide});
        s.onBeforeCompile=shellPatch(off);s.customProgramCacheKey=()=>"fk-shell"+off;m.userData.extra.push(s)}}
    else if(p.kind==="beard"){const st=tex(p.map);st.repeat.set(36,36);
      m=new THREE.MeshStandardMaterial({map:st,alphaMap:tex(p.alpha,false),color:p.color,roughness:.7,alphaTest:p.alphaTest})}
    else m=new THREE.MeshStandardMaterial({map:tex(p.map),normalMap:tex(p.normal,false),normalScale:new THREE.Vector2(.6,.6),color:p.color,roughness:p.rough,
      alphaTest:p.alphaTest||0,side:THREE.DoubleSide});
    m.name="fk-human-"+name;out[name]=m;
  }
  return out;
}
const NO_SHADOW=new Set(["Hair","Beard","Eyes","Eyebrows","Eyelashes"]); // hair shells would shadow the whole face
/** Dress every mesh of a (cloned) realistic human scene; unknown meshes keep a neutral material. */
export function dressRealHuman(root){mats||=buildMaterials();const add=[];
  root.traverse(o=>{if(!o.isMesh)return;const m=mats[o.name];if(m)o.material=m;o.castShadow=!NO_SHADOW.has(o.name);o.receiveShadow=true;o.frustumCulled=false;
    if(m?.userData.extra)m.userData.extra.forEach((x,i)=>add.push([o,x,i]))});
  for(const [o,x,i] of add){const s=o.isSkinnedMesh?new THREE.SkinnedMesh(o.geometry,x):new THREE.Mesh(o.geometry,x);s.name=o.name+"_layer"+(i+1);
    if(o.isSkinnedMesh)s.bind(o.skeleton,o.bindMatrix);s.position.copy(o.position);s.quaternion.copy(o.quaternion);s.scale.copy(o.scale);
    s.castShadow=false;s.receiveShadow=true;s.frustumCulled=false;s.renderOrder=x.transparent?2:1;o.parent.add(s)}
  return root}
/** Grip offset in hand-bone space, scaled from the classic rig (0,.09,.04 for a .1217 m hand). */
export function realGrip(hand){const f=hand?.children.find(c=>/f_middle\.01/.test(c.name)),L=f?f.position.length():.1217;return new THREE.Vector3(0,.09*L/.1217,.04*L/.1217)}
export function loadRealHuman(url=REAL_HUMAN_URL){return new Promise((res,rej)=>new GLTFLoader().load(url,g=>{g.userData.real=true;res(g)},undefined,rej))}

/* ---- Hands: the UAL clips keep every finger in a rigid fist, so after the mixer update each hand is
 * re-posed on its own: a relaxed curl when empty, a power grip (fingers wrapped round the handle, thumb
 * opposed) when it carries something. Fingers curl about their local +X (same convention as the clips).
 * Half of the wrist's twist is moved into the forearm so the wrist does not candy-wrap. */
const FINGERS=["f_index","f_middle","f_ring","f_pinky"];
// degrees about local X for joints 1..3; thumb uses [x,z] per joint
export const HAND_POSES=({
  relaxed:{f_index:[6,24,14],f_middle:[18,30,17],f_ring:[22,35,19],f_pinky:[26,34,19],thumb:[[6,-8],[10,0],[16,0]]},
  // re-solved in-page against the stone-tool hafts (axe ~31 mm, knife ~28 mm): every finger joint clears the wood, tips just touch
  grip:{f_index:[9,60,65],f_middle:[46,81,68],f_ring:[49,68,63],f_pinky:[36,50,47],thumb:[[27,-1],[-10,1],[-10,-1]],
    handle:{c:[-.0283,.1063,-.0058],axis:[-.0053,.4034,.915],below:.055}}  // right-hand space; the left hand mirrors x
});
const _q=new THREE.Quaternion(),_qi=new THREE.Quaternion(),_e=new THREE.Euler(),_Y=new THREE.Vector3(0,1,0),_v=new THREE.Vector3();
function poseQuats(rest,def){const out={};
  for(const f of FINGERS)for(let i=0;i<3;i++){const k=f+i;out[k]=rest[k].clone().multiply(_q.setFromEuler(_e.set(def[f][i]*Math.PI/180,0,0)))}
  for(let i=0;i<3;i++){const k="thumb"+i,[x,z]=def.thumb[i];out[k]=rest[k].clone().multiply(_q.setFromEuler(_e.set(x*Math.PI/180,0,z*Math.PI/180)))}
  return out}
/** Find finger bones, cache rest/relaxed/grip rotations and seat both hand anchors in the grip. */
export function initRealHands(u,model){
  const rig={};
  for(const [s,anchor] of [["R",u.held],["L",u.heldL]]){
    const hand=model.getObjectByName("DEF-hand"+s);if(!hand)continue;
    const bones={};for(const f of [...FINGERS,"thumb"])for(let i=0;i<3;i++){const b=model.getObjectByName(`DEF-${f}0${i+1}${s}`);if(!b)return null;bones[f+i]=b}
    const rest={};for(const k in bones)rest[k]=(bones[k].userData.restQ||=bones[k].quaternion.clone()).clone();hand.userData.restQ||=hand.quaternion.clone();
    const h={hand,fore:hand.parent,anchor,bones,rest,restHand:hand.userData.restQ.clone(),relaxed:poseQuats(rest,HAND_POSES.relaxed),grip:poseQuats(rest,HAND_POSES.grip),w:0,o:1};
    seatGrip(h,s);rig[s]=h;
  }
  u.handRig=rig;return rig}
// Seat the anchor in the closed fist: item +Y runs along the handle axis (pinky -> index), +X points out of the fist.
function seatGrip(h,side){const H=HAND_POSES.grip.handle,m=side==="L"?-1:1;
  const c=new THREE.Vector3(H.c[0]*m,H.c[1],H.c[2]),axis=new THREE.Vector3(H.axis[0]*m,H.axis[1],H.axis[2]).normalize();
  const x=new THREE.Vector3(0,1,0).projectOnPlane(axis).normalize(),z=new THREE.Vector3().crossVectors(x,axis);
  h.anchor.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,axis,z));
  h.anchor.position.copy(c).addScaledVector(axis,-H.below);h.gripCentre=c;h.axis=axis;h.item=null}
// Slide the anchor along the handle axis so the fist closes GRIP_FROM_END above the item's lower (-Y) end.
export const GRIP_FROM_END=.055;
const _b=new THREE.Box3(),_m=new THREE.Matrix4(),_bb=new THREE.Box3();
function seatItem(h){const a=h.anchor,it=a.children[0];h.item=it;it.updateMatrixWorld(true);_b.makeEmpty();
  _m.copy(a.matrixWorld).invert();
  it.traverse(o=>{if(!o.isMesh||!o.geometry)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();_bb.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(_m,o.matrixWorld));_b.union(_bb)});
  if(_b.isEmpty())return;const lo=_b.min.y,len=_b.max.y-lo,from=it.userData.grip!=null?it.userData.grip*it.scale.y:Math.min(GRIP_FROM_END,len*.3); // tools name their own grip point
  a.position.copy(h.gripCentre).addScaledVector(h.axis,-(lo+from))}
/** Call right after mixer.update(dt). Each hand blends independently to grip while its anchor has an item. */
export function poseRealHands(u,dt){const rig=u.handRig;if(!rig)return;const k=1-Math.exp(-dt*10);
  for(const s in rig){const h=rig[s],full=h.anchor.children.length>0;
    if(full&&h.item!==h.anchor.children[0])seatItem(h);
    h.w+=((full?1:0)-h.w)*k;
    // one-shot actions (punch, pick-up...) keep the clip's own fist when the hand is empty
    h.o+=(((u.once>0&&!full)?0:1)-h.o)*k;
    for(const n in h.bones){const b=h.bones[n];_q.copy(h.relaxed[n]).slerp(h.grip[n],h.w);b.quaternion.slerp(_q,h.o)}
    // twist distribution: move half of the hand's roll about the forearm axis into the forearm
    const d=_q.copy(h.hand.quaternion).multiply(_qi.copy(h.restHand).invert());
    const th=2*Math.atan2(d.y,d.w)*.5;if(Math.abs(th)>1e-4){const t=new THREE.Quaternion().setFromAxisAngle(_Y,th);h.fore.quaternion.multiply(t);h.hand.quaternion.premultiply(t.invert())}
  }}
