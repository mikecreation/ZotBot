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
  Body:{kind:"skin",map:"skin.jpg",normal:"skin_detail_n.jpg"},
  Eyes:{kind:"eye",map:"eye.webp",alphaTest:.5},
  Eyebrows:{kind:"card",map:"brow.webp",color:0x8a7060,alphaTest:.3},
  Eyelashes:{kind:"card",map:"lash.webp",color:0x241812,alphaTest:.3},
  Hair:{kind:"hair",map:"hair.webp",normal:"hair_n.jpg",color:0xc8b4a0,alphaTest:.42},
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
	float fkWrap = saturate( ( dot( geometryNormal, directLight.direction ) + 0.4 ) / 1.4 );
	reflectedLight.directDiffuse += max( fkWrap - dotNL, 0.0 ) * directLight.color * vec3( 0.36, 0.13, 0.08 ) * BRDF_Lambert( material.diffuseColor );`;
const DIRECT_RE=/float dotNL = saturate\( dot\( geometryNormal, directLight\.direction \) \);\s*vec3 irradiance = dotNL \* directLight\.color;/;
export function skinPatch(sh){const chunk=THREE.ShaderChunk.lights_physical_pars_fragment;
  if(DIRECT_RE.test(chunk))sh.fragmentShader=sh.fragmentShader.replace("#include <lights_physical_pars_fragment>",chunk.replace(DIRECT_RE,SSS))}

let mats=null;
function buildMaterials(){
  const tl=new THREE.TextureLoader(),cache={};
  const tex=(f,srgb=true,rep=1)=>{const k=f+rep;if(cache[k])return cache[k];const t=tl.load(REAL_HUMAN_TEX+f);t.flipY=false;t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=8;if(rep!==1)t.repeat.set(rep,rep);return cache[k]=t};
  const out={};
  for(const [name,p] of Object.entries(REAL_HUMAN_PARTS)){
    let m;
    if(p.kind==="skin"){m=new THREE.MeshPhysicalMaterial({map:tex(p.map),normalMap:tex(p.normal,false,28),normalScale:new THREE.Vector2(.16,.16),roughness:.5,
      specularIntensity:.5,sheen:.12,sheenRoughness:.6,sheenColor:new THREE.Color(0.8,0.55,0.45)});m.onBeforeCompile=skinPatch;m.customProgramCacheKey=()=>"fk-skin"}
    else if(p.kind==="eye")m=new THREE.MeshStandardMaterial({map:tex(p.map),roughness:.22,envMapIntensity:.35,alphaTest:p.alphaTest}); // cornea texels are alpha 0
    else if(p.kind==="card")m=new THREE.MeshStandardMaterial({map:tex(p.map),color:p.color,roughness:.85,alphaTest:p.alphaTest,side:THREE.DoubleSide});
    else if(p.kind==="hair")m=new THREE.MeshStandardMaterial({map:tex(p.map),normalMap:tex(p.normal,false),color:p.color,roughness:.6,alphaTest:p.alphaTest,side:THREE.DoubleSide});
    else m=new THREE.MeshStandardMaterial({map:tex(p.map),normalMap:tex(p.normal,false),normalScale:new THREE.Vector2(.6,.6),color:p.color,roughness:p.rough,
      alphaTest:p.alphaTest||0,side:THREE.DoubleSide});
    m.name="fk-human-"+name;out[name]=m;
  }
  return out;
}
/** Dress every mesh of a (cloned) realistic human scene; unknown meshes keep a neutral material. */
export function dressRealHuman(root){mats||=buildMaterials();
  root.traverse(o=>{if(!o.isMesh)return;const m=mats[o.name];if(m)o.material=m;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false});return root}
/** Grip offset in hand-bone space, scaled from the classic rig (0,.09,.04 for a .1217 m hand). */
export function realGrip(hand){const f=hand?.children.find(c=>/f_middle\.01/.test(c.name)),L=f?f.position.length():.1217;return new THREE.Vector3(0,.09*L/.1217,.04*L/.1217)}
export function loadRealHuman(url=REAL_HUMAN_URL){return new Promise((res,rej)=>new GLTFLoader().load(url,g=>{g.userData.real=true;res(g)},undefined,rej))}
