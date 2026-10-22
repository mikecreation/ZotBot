import * as THREE from './vendor/three.module.min.js';
// Three small flocks, two instanced draws. Independent banking/gliding phases
// avoid synchronous flapping and keep sky wildlife inexpensive on Low too.
export function createBirds(scene,heightAt){
  const n=12,mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88,side:THREE.DoubleSide});
  const bg=new THREE.SphereGeometry(1,7,5);bg.scale(.075,.065,.22);
  const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute([0,0,.08,.53,0,-.16,.27,0,.13,0,0,.08,.27,0,.13,0,0,.21],3));wg.computeVertexNormals();
  const body=new THREE.InstancedMesh(bg,mat,n),wings=new THREE.InstancedMesh(wg,mat,n*2);
  body.frustumCulled=wings.frustumCulled=false;scene.add(body,wings);
  const wingMatrix=new THREE.Matrix4(),wingRotation=new THREE.Matrix4(),d=new THREE.Object3D(),q=new THREE.Quaternion(),axis=new THREE.Vector3(0,0,1),c=new THREE.Color();
  const flocks=Array.from({length:3},(_,i)=>({x:0,z:0,ready:false,phase:i*2.1,r:18+i*9}));
  for(let i=0;i<n;i++){c.setHex(i<4?0xbac3c8:0x3f3028);body.setColorAt(i,c);wings.setColorAt(i*2,c);wings.setColorAt(i*2+1,c)}
  const stats={visible:0,count:n};
  return {stats,update(t,pos,day,rain){
    const visible=day>.25&&rain<.65;body.visible=wings.visible=visible;stats.visible=visible?n:0;if(!visible)return;
    for(let i=0;i<n;i++){
      const f=flocks[Math.floor(i/4)],j=i%4;
      if(!f.ready||Math.hypot(f.x-pos.x,f.z-pos.z)>150){const a=f.phase+t*.03;f.x=pos.x+Math.cos(a)*(34+Math.floor(i/4)*22);f.z=pos.z+Math.sin(a)*45;f.ready=true}
      const a=t*(.08+Math.floor(i/4)*.018)+f.phase+j*.12,x=f.x+Math.cos(a)*f.r,z=f.z+Math.sin(a)*f.r;
      const y=Math.max(pos.y+10,heightAt(x,z)+9)+Math.sin(t*.7+i)*1.2+j*.65;
      d.position.set(x,y,z);d.rotation.set(Math.sin(t*.4+i)*.08,-a,.20);d.scale.setScalar(i<4?1.35:1);d.updateMatrix();body.setMatrixAt(i,d.matrix);
      const glide=Math.sin(t*.37+i)>-.1,flap=glide?.10:Math.sin(t*(8+i*.27)+i)*.65;
      for(let side=0;side<2;side++){d.updateMatrix();q.setFromAxisAngle(axis,side?Math.PI-flap:flap);wingMatrix.copy(d.matrix).multiply(wingRotation.makeRotationFromQuaternion(q));wings.setMatrixAt(i*2+side,wingMatrix)}
    }
    body.instanceMatrix.needsUpdate=wings.instanceMatrix.needsUpdate=true;
  }};
}
