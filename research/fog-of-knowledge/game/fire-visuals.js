import * as THREE from './vendor/three.module.min.js';
import {INITIAL_FUEL_CAPACITY,ensureFuelBed,fuelLayout} from './fuel-bed.js?v=3.24.0';
let maps;
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
function textures(){if(maps)return maps;
  const make=draw=>{const c=document.createElement('canvas');c.width=c.height=256;draw(c.getContext('2d'));const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t};
  const bark=make(g=>{g.fillStyle='#765039';g.fillRect(0,0,256,256);for(let i=0;i<340;i++){const x=hash(i)*256,y=hash(i+500)*256;g.strokeStyle=i%3?'#35241b':'#af7950';g.lineWidth=.6+hash(i+800)*3;g.beginPath();g.moveTo(x,y);g.bezierCurveTo(x+6,y+12,x-6,y+25,x+2,y+45+hash(i+40)*65);g.stroke()}});
  const end=make(g=>{g.fillStyle='#ba8e61';g.fillRect(0,0,256,256);for(let r=6;r<180;r+=7){g.strokeStyle=r%3?'#80532f':'#d6ad77';g.lineWidth=1.4;g.beginPath();g.ellipse(124,133,r,r*.93,.15,0,Math.PI*2);g.stroke()}for(let i=0;i<7;i++){const a=hash(i+70)*6.283;g.strokeStyle='#463020';g.beginPath();g.moveTo(128+Math.cos(a)*50,128+Math.sin(a)*50);g.lineTo(128+Math.cos(a+.08)*160,128+Math.sin(a+.08)*160);g.stroke()}});
  const cracks=make(g=>{g.fillStyle='#000';g.fillRect(0,0,256,256);g.strokeStyle='#fff';g.lineWidth=1.1;for(let i=0;i<65;i++){let x=hash(i+31)*256,y=hash(i+89)*256;g.beginPath();g.moveTo(x,y);for(let j=0;j<5;j++){x+=hash(i*9+j)*16-8;y+=5+hash(i*3+j)*8;g.lineTo(x,y)}g.stroke()}});cracks.colorSpace=THREE.NoColorSpace;
  return maps={bark,end,cracks};
}
function burningMaterial(map){const t=textures(),m=new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.035,roughness:.97});
  m.onBeforeCompile=shader=>{shader.uniforms.uCracks={value:t.cracks};shader.vertexShader='attribute float aChar; attribute float aGlow; varying float vChar; varying float vGlow;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvChar=aChar;vGlow=aGlow;');
    shader.fragmentShader='uniform sampler2D uCracks; varying float vChar; varying float vGlow;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.026,0.019,0.015),vChar*.96);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>','#include <lights_fragment_end>\nfloat woodPeak=max(reflectedLight.directDiffuse.r,max(reflectedLight.directDiffuse.g,reflectedLight.directDiffuse.b));reflectedLight.directDiffuse/=1.+woodPeak/mix(.8,.045,vChar);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat fissure=texture2D(uCracks,vMapUv).r;totalEmissiveRadiance+=vec3(4.0,.46,.018)*fissure*vGlow;');
  };m.customProgramCacheKey=()=> 'burning-log-v1';return m;
}
export function createFireBed(s,sampleGround=()=>s.y){
  const g=new THREE.Group(),t=textures(),geo=new THREE.CylinderGeometry(1,1,1,16,5),pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){const y=pos.getY(i),x=pos.getX(i),z=pos.getZ(i),r=1+.045*Math.sin(Math.atan2(z,x)*5+y*7);pos.setXYZ(i,x*r,y,z*r)}geo.computeVertexNormals();
  const chars=new THREE.InstancedBufferAttribute(new Float32Array(INITIAL_FUEL_CAPACITY),1),glows=new THREE.InstancedBufferAttribute(new Float32Array(INITIAL_FUEL_CAPACITY),1);geo.setAttribute('aChar',chars);geo.setAttribute('aGlow',glows);
  const logs=new THREE.InstancedMesh(geo,[burningMaterial(t.bark),burningMaterial(t.end),burningMaterial(t.end)],INITIAL_FUEL_CAPACITY);logs.count=0;logs.castShadow=false;logs.receiveShadow=true;logs.frustumCulled=false;g.add(logs);
  const coal=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0x302621,roughness:1,emissive:0xff3006,emissiveIntensity:0}),36);coal.frustumCulled=false;g.add(coal);
  g.userData={logs,coal,chars,glows,arrivals:new Map(),ground:new Map(),support:new Map(),capacity:INITIAL_FUEL_CAPACITY,sampleGround,initial:true,matrix:new THREE.Matrix4(),q:new THREE.Quaternion(),p:new THREE.Vector3(),scale:new THREE.Vector3(),axis:new THREE.Vector3(),up:new THREE.Vector3(0,1,0)};
  ensureFuelBed(s);updateFireBed(g,s,0);g.userData.initial=false;return g;
}
export function updateFireBed(g,s,time){
  const u=g.userData,pieces=ensureFuelBed(s),pile=fuelLayout(s),heat=Math.max(0,s.heat||0),hasChar=(s.charcoal||0)>.005;
  if(pieces.length>u.capacity){let cap=u.capacity;while(cap<pieces.length)cap*=2;const old=u.logs,geo=old.geometry.clone();u.chars=new THREE.InstancedBufferAttribute(new Float32Array(cap),1);u.glows=new THREE.InstancedBufferAttribute(new Float32Array(cap),1);geo.setAttribute('aChar',u.chars);geo.setAttribute('aGlow',u.glows);const logs=new THREE.InstancedMesh(geo,old.material,cap);logs.castShadow=false;logs.receiveShadow=true;logs.frustumCulled=false;g.remove(old);old.dispose();old.geometry.dispose();g.add(logs);u.logs=logs;u.capacity=cap}
  if(u.layout!==pile){u.ground.clear();u.layout=pile}u.support.clear();let n=0;
  for(let index=0;index<pieces.length;index++){
    const piece=pieces[index],fraction=Math.max(0,piece.left/piece.mass);if(fraction<.001&&!hasChar)continue;
    if(!u.arrivals.has(piece.id))u.arrivals.set(piece.id,u.initial?time-1:time);
    const age=time-u.arrivals.get(piece.id),i=n++,pose=pile.poseById.get(piece.id),t=Math.min(1,Math.max(0,age/.9)),ease=t*t*(3-2*t),travel=pose.spill?.85+.15*ease:1;
    if(!u.ground.has(piece.id)){const x=s.x+pose.x,z=s.z+pose.z;const dx=Math.cos(pose.a)*pose.length/2,dz=Math.sin(pose.a)*pose.length/2;u.ground.set(piece.id,{y:u.sampleGround(x,z)-s.y,tilt:Math.max(-.5,Math.min(.5,(u.sampleGround(x+dx,z+dz)-u.sampleGround(x-dx,z-dz))/pose.length))})}
    const ground=u.ground.get(piece.id),shrink=.42+.58*Math.sqrt(fraction),radius=pose.radius*shrink,length=pose.length*(.6+.4*Math.sqrt(fraction));
    let top=ground.y;for(const [x,z] of pose.cells)top=Math.max(top,u.support.get(x+z*65536)||ground.y);for(const [x,z] of pose.cells)u.support.set(x+z*65536,top+radius*2);
    const finalY=top+radius,drop=age<.9?(1-ease)*(pose.spill?Math.max(.25,pile.height-finalY):.25):0;
    const roll=pose.spill?(1-ease)*.3:0,a=pose.a+roll;u.axis.set(Math.cos(a),roll+(top<=ground.y+.02?ground.tilt:0),Math.sin(a)).normalize();u.q.setFromUnitVectors(u.up,u.axis);
    u.p.set(pose.x*travel,finalY+drop,pose.z*travel);u.scale.set(radius,length,radius);u.matrix.compose(u.p,u.q,u.scale);u.logs.setMatrixAt(i,u.matrix);
    u.chars.setX(i,piece.char||0);u.glows.setX(i,heat*Math.max(.03,piece.char||0,(piece.fire||0)*.25)*(1-.7*(s.wet||0))*(.78+.14*Math.sin(time*2.2+piece.id)+.08*Math.sin(time*5.7+piece.id*3)));
  }
  u.logs.count=n;u.logs.instanceMatrix.needsUpdate=true;u.chars.needsUpdate=u.glows.needsUpdate=true;
  u.coal.visible=heat>.025||hasChar;u.coal.material.emissiveIntensity=heat*(.65+.12*Math.sin(time*2.5));
  for(let i=0;i<36;i++){const a=i*2.399,r=Math.max(.48,pile.radius*.75)*Math.sqrt((i+.5)/36);u.p.set(Math.cos(a)*r,.025+hash(i)*.025,Math.sin(a)*r);u.q.setFromAxisAngle(u.up,a);u.scale.set(.055+hash(i+3)*.035,.025,.04+hash(i+11)*.04);u.matrix.compose(u.p,u.q,u.scale);u.coal.setMatrixAt(i,u.matrix)}u.coal.instanceMatrix.needsUpdate=true;
  g.visible=n>0||u.coal.visible;
}
