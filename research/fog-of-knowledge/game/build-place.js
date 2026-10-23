/* Fog of Knowledge: The Game - Satisfactory-style build placement ghost.
 * Pure helpers for hologram materials, yaw snap, aim-to-ground, and HUD chips.
 * world.js owns the session (begin/confirm/cancel) and calls these.
 */
const COARSE_DEG = 45;
const FINE_DEG = 15;
const VALID_HEX = 0x5ec8b0;
const INVALID_HEX = 0xd45a5a;
const GHOST_OPACITY = 0.42;

export function placeStepDeg(fine){ return fine ? FINE_DEG : COARSE_DEG }

export function snapYaw(ry, fine = false){
  const step = placeStepDeg(fine) * Math.PI / 180;
  return Math.round(ry / step) * step;
}

export function yawDegrees(ry){
  let d = ((ry * 180 / Math.PI) % 360 + 360) % 360;
  return Math.round(d);
}

export function rotateYaw(ry, dir, fine = false){
  const step = placeStepDeg(fine) * Math.PI / 180;
  return snapYaw(ry + dir * step, fine);
}

/** Project camera aim onto the terrain height field (soft ground hit). */
export function aimGroundHit(eye, dir, heightAt, opts = {}){
  const maxDist = opts.maxDist ?? 28;
  const minDist = opts.minDist ?? 1.2;
  const step = opts.step ?? 0.35;
  let best = null;
  let prevAbove = null;
  for(let t = minDist; t <= maxDist; t += step){
    const x = eye.x + dir.x * t, y = eye.y + dir.y * t, z = eye.z + dir.z * t;
    const h = heightAt(x, z);
    const above = y >= h;
    if(prevAbove === true && !above){
      const t0 = t - step, t1 = t;
      let lo = t0, hi = t1;
      for(let i = 0; i < 6; i++){
        const mid = (lo + hi) * 0.5;
        const my = eye.y + dir.y * mid;
        const mh = heightAt(eye.x + dir.x * mid, eye.z + dir.z * mid);
        if(my >= mh) lo = mid; else hi = mid;
      }
      const ft = (lo + hi) * 0.5;
      const fx = eye.x + dir.x * ft, fz = eye.z + dir.z * ft, fy = heightAt(fx, fz);
      best = { x: fx, y: fy, z: fz, dist: ft };
      break;
    }
    if(above && Math.abs(y - h) < 0.55) best = { x, y: h, z, dist: t };
    prevAbove = above;
  }
  if(best) return best;
  const flat = Math.hypot(dir.x, dir.z) || 1e-6;
  const dist = Math.min(maxDist, Math.max(minDist, (eye.y - heightAt(eye.x, eye.z)) / Math.max(0.08, -dir.y || 0.25)));
  const x = eye.x + dir.x / flat * Math.min(maxDist, Math.max(minDist, dist * flat));
  const z = eye.z + dir.z / flat * Math.min(maxDist, Math.max(minDist, dist * flat));
  return { x, y: heightAt(x, z), z, dist: Math.hypot(x - eye.x, z - eye.z) };
}

/** Make every mesh in a group a translucent hologram (mutates materials in place). */
export function ghostifyGroup(THREE, root, valid = true){
  const tint = valid ? VALID_HEX : INVALID_HEX;
  root.traverse(o => {
    if(!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const next = mats.map(m => {
      const g = m.clone();
      g.transparent = true;
      g.opacity = GHOST_OPACITY;
      g.depthWrite = false;
      g.depthTest = true;
      g.side = THREE.DoubleSide;
      if(g.color) g.color.setHex(tint);
      if(g.emissive){ g.emissive.setHex(tint); g.emissiveIntensity = 0.22 }
      if("metalness" in g) g.metalness = 0;
      if("roughness" in g) g.roughness = 1;
      g.userData = g.userData || {};
      g.userData._placeGhost = true;
      return g;
    });
    o.material = Array.isArray(o.material) ? next : next[0];
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = false;
  });
  root.userData.placeGhost = true;
  root.userData.placeValid = !!valid;
  return root;
}

export function setGhostValid(THREE, root, valid){
  if(!root || root.userData.placeValid === !!valid) return;
  root.userData.placeValid = !!valid;
  const tint = valid ? VALID_HEX : INVALID_HEX;
  root.traverse(o => {
    if(!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for(const m of mats){
      if(!m?.userData?._placeGhost) continue;
      if(m.color) m.color.setHex(tint);
      if(m.emissive){ m.emissive.setHex(tint); m.emissiveIntensity = 0.22 }
    }
  });
}

export function disposePlaceGhost(THREE, scene, root){
  if(!root) return;
  scene.remove(root);
  root.traverse(o => {
    if(!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for(const m of mats){
      if(m?.userData?._placeGhost) m.dispose?.();
    }
  });
}

/** On-screen key chips for place mode (ASCII only). */
export function placeHintHtml(yawDeg){
  const yaw = yawDeg == null ? "" : ` <span class="placeYaw">${yawDeg}&deg;</span>`;
  return `<span class="placeChip"><b>Scroll / R</b> Rotate</span>`
    + `<span class="placeChip"><b>Ctrl</b> Fine</span>`
    + `<span class="placeChip"><b>LMB</b> Place</span>`
    + `<span class="placeChip"><b>Esc</b> Cancel</span>`
    + yaw;
}

export { COARSE_DEG, FINE_DEG, GHOST_OPACITY, VALID_HEX, INVALID_HEX };