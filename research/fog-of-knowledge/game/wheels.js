/* Fog of Knowledge: portable rolling wheels (NOT the stream water mill).
 * Meshes stand on the rim (axle horizontal). Physics helpers for mass / bounce / smash.
 */
import * as T from "./vendor/three.module.min.js";

export const WHEEL_IDS = [
  "wheel_disk",
  "wheel",
  "wheel_iron",
  "wheel_modern",
  "wheel_bouncy",
  "wheel_heavy_bouncy",
  "wheel_heavy"
];

export function isWheel(k){ return WHEEL_IDS.includes(k) }

function woodMat(hex=0xb58250){
  return new T.MeshStandardMaterial({ color:hex, roughness:.92, flatShading:true });
}
function metalMat(hex=0x8a9098){
  return new T.MeshStandardMaterial({ color:hex, metalness:.75, roughness:.35, flatShading:true });
}
function rubberMat(hex=0x2a2a2e){
  return new T.MeshStandardMaterial({ color:hex, roughness:.85, flatShading:true });
}
function bounceMat(hex=0xd45a8a){
  return new T.MeshStandardMaterial({ color:hex, roughness:.55, flatShading:true });
}

/** Build a stylized wheel standing on its rim; axle along +X, rolls along Z by default. */
export function buildWheelMesh(kind){
  const g = new T.Group();
  g.name = kind || "wheel";
  g.userData.wheel = true;
  g.userData.trueScale = true;
  g.userData.lieFlat = false;

  const R = kind === "wheel_modern" ? 0.28
    : kind === "wheel_disk" ? 0.34
    : kind === "wheel_heavy" || kind === "wheel_heavy_bouncy" ? 0.4
    : kind === "wheel_bouncy" ? 0.3
    : 0.32;
  const thick = kind === "wheel_disk" ? 0.16
    : kind === "wheel_modern" ? 0.07
    : kind === "wheel_heavy" || kind === "wheel_heavy_bouncy" ? 0.18
    : kind === "wheel_bouncy" ? 0.12
    : 0.1;
  g.userData.wheelR = R;

  const wood = woodMat(kind === "wheel_iron" ? 0x8a6238 : 0xa87842);
  const hubR = R * (kind === "wheel_disk" ? 0.22 : kind === "wheel_modern" ? 0.08 : 0.14);
  const hub = new T.Mesh(new T.CylinderGeometry(hubR, hubR, thick * 1.15, 10), kind === "wheel_modern" ? metalMat(0xb0b4ba) : wood);
  hub.rotation.z = Math.PI / 2;
  hub.castShadow = hub.receiveShadow = true;
  g.add(hub);

  if(kind === "wheel_disk"){
    const disk = new T.Mesh(new T.CylinderGeometry(R, R, thick, 22), wood);
    disk.rotation.z = Math.PI / 2;
    disk.castShadow = disk.receiveShadow = true;
    g.add(disk);
    const hole = new T.Mesh(new T.CylinderGeometry(hubR * 0.55, hubR * 0.55, thick * 1.3, 8), woodMat(0x5a3a22));
    hole.rotation.z = Math.PI / 2;
    g.add(hole);
  } else if(kind === "wheel_bouncy" || kind === "wheel_heavy_bouncy"){
    const mat = bounceMat(kind === "wheel_heavy_bouncy" ? 0xc44a6a : 0xe070a0);
    const tire = new T.Mesh(new T.TorusGeometry(R * 0.82, thick * 0.55, 8, 24), mat);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    g.add(tire);
    const spokes = kind === "wheel_heavy_bouncy" ? 8 : 6;
    for(let i = 0; i < spokes; i++){
      const a = (i / spokes) * Math.PI * 2;
      const sp = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, R * 1.5, 5), wood);
      sp.position.set(0, Math.sin(a) * R * 0.42, Math.cos(a) * R * 0.42);
      sp.rotation.x = a;
      g.add(sp);
    }
    const rim = new T.Mesh(new T.TorusGeometry(R, 0.022, 6, 28), wood);
    rim.rotation.y = Math.PI / 2;
    g.add(rim);
  } else if(kind === "wheel_modern"){
    const tire = new T.Mesh(new T.TorusGeometry(R * 0.88, thick * 0.7, 8, 28), rubberMat());
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    g.add(tire);
    const rim = new T.Mesh(new T.TorusGeometry(R * 0.72, 0.014, 6, 28), metalMat(0xc8ccd2));
    rim.rotation.y = Math.PI / 2;
    g.add(rim);
    for(let i = 0; i < 12; i++){
      const a = (i / 12) * Math.PI * 2;
      const sp = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, R * 1.35, 4), metalMat(0xd0d4d8));
      sp.position.set(0, Math.sin(a) * R * 0.36, Math.cos(a) * R * 0.36);
      sp.rotation.x = a;
      g.add(sp);
    }
  } else if(kind === "wheel_heavy"){
    const disk = new T.Mesh(new T.CylinderGeometry(R * 0.92, R * 0.92, thick * 0.85, 20), woodMat(0x6a4a2e));
    disk.rotation.z = Math.PI / 2;
    disk.castShadow = true;
    g.add(disk);
    const tire = new T.Mesh(new T.TorusGeometry(R * 0.9, thick * 0.35, 8, 28), metalMat(0x4a4e54));
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    g.add(tire);
    for(let i = 0; i < 4; i++){
      const a = (i / 4) * Math.PI * 2;
      const sp = new T.Mesh(new T.BoxGeometry(thick * 0.7, R * 1.5, 0.05), woodMat(0x5a3a20));
      sp.position.set(0, Math.sin(a) * R * 0.35, Math.cos(a) * R * 0.35);
      sp.rotation.x = a;
      g.add(sp);
    }
  } else {
    // spoked wood / iron-rimmed wagon
    const rim = new T.Mesh(new T.TorusGeometry(R, thick * 0.28, 8, 28), wood);
    rim.rotation.y = Math.PI / 2;
    rim.castShadow = rim.receiveShadow = true;
    g.add(rim);
    if(kind === "wheel_iron"){
      const tire = new T.Mesh(new T.TorusGeometry(R * 1.02, thick * 0.14, 6, 28), metalMat(0x6a7078));
      tire.rotation.y = Math.PI / 2;
      tire.castShadow = true;
      g.add(tire);
    }
    const spokes = kind === "wheel_iron" ? 8 : 6;
    for(let i = 0; i < spokes; i++){
      const a = (i / spokes) * Math.PI * 2;
      const sp = new T.Mesh(new T.CylinderGeometry(0.014, 0.018, R * 1.55, 6), wood);
      sp.position.set(0, Math.sin(a) * R * 0.4, Math.cos(a) * R * 0.4);
      sp.rotation.x = a;
      sp.castShadow = true;
      g.add(sp);
    }
    const felloe = new T.Mesh(new T.TorusGeometry(R * 0.55, 0.016, 5, 20), woodMat(0x8a6238));
    felloe.rotation.y = Math.PI / 2;
    g.add(felloe);
  }

  // axle stub so it reads as a wheel, not a pot
  const axle = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, thick * 1.8, 8), metalMat(kind === "wheel_bouncy" ? 0xc08060 : 0x7a7e84));
  axle.rotation.z = Math.PI / 2;
  g.add(axle);

  g.traverse(m => { if(m.isMesh){ m.castShadow = true; m.receiveShadow = true } });
  // sit so lowest point is near y=0 when upright
  g.position.y = 0;
  return g;
}

/** Fragile placeables a smash-wheel may break (never waterwheel / houses / wells). */
export const SMASHABLE = new Set(["torch", "rack", "crop", "wall", "leanto", "chest", "pendulum"]);
