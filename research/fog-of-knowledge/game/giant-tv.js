/* Fog of Knowledge: giant telescopic house-TV (C SEED M1 / Bugatti fold-into-floor vibe).
 * House-tall when open (= foresthouse chimney top 4.75 m). Closed = recessed floor track + folded column.
 * Opens by rising + unfolding N vertical MicroLED-style panels into one seamless wide screen.
 * Watch UI: Piped (no-ads) primary; optional Official YouTube; Google sign-in via window.open popup.
 * Chassis color presets + color wheel (persisted per structure). 3D spatial TV audio mixes ON TOP of
 * world ambience (never mutes wind/rain/birds). Rainproof - outdoor OK in rain.
 */
import * as T from "./vendor/three.module.min.js";

export const GIANT_TV = "giant_tv";
export const isGiantTv = t => t === GIANT_TV;

/** Match woodland HOUSE.chimney.top - open stack height (pedestal + risen screen). */
export const TV_OPEN_H = 4.75;
export const TV_CLOSED_H = 0.55;
export const TV_PANEL_N = 5;
export const TV_SCREEN_H = 3.55;
export const TV_PANEL_W = 0.72;
export const TV_SCREEN_W = TV_PANEL_N * TV_PANEL_W;
export const TV_FRAME = 0.08;
export const TV_TRACK_L = 3.4;
export const TV_TRACK_W = 1.15;

export const TV_COLOR_PRESETS = [
  { id: "black", name: "Black", hex: 0x0a0a0c },
  { id: "red", name: "Red", hex: 0x8b1218 },
  { id: "deep_blue", name: "Deep blue", hex: 0x0c1a3a },
  { id: "cool_orange", name: "Deep cool orange", hex: 0xb54a18 }
];

const PIPED_HOME = "https://piped.video/";
const PIPED_EMBED = id => `https://piped.video/embed/${id}`;
const YT_NOCOOKIE = id => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
const YT_HOME = "https://www.youtube.com/";
const GOOGLE_ACCOUNTS = "https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fwww.youtube.com%2F";

let watchS = null;
let overlay = null;
let iframeEl = null;
let audioApi = null; // { ctx, panner, gain, src, analyser? }
let tvVol = 0.55;
let tvMuted = false;
let frontend = "piped"; // "piped" | "youtube"
let pendingVideoId = null;
const _v = new T.Vector3();
const _cam = new T.Vector3();

function hexCss(h) {
  const n = (h >>> 0) & 0xffffff;
  return "#" + n.toString(16).padStart(6, "0");
}
function parseHex(s, fallback = 0x0a0a0c) {
  if (typeof s === "number" && isFinite(s)) return s >>> 0;
  const m = String(s || "").trim().match(/^#?([0-9a-fA-F]{6})$/);
  return m ? parseInt(m[1], 16) : fallback;
}

function chassisMat(hex, metal = 0.55, rough = 0.32) {
  return new T.MeshStandardMaterial({
    color: hex,
    metalness: metal,
    roughness: rough,
    envMapIntensity: 0.85
  });
}

/** Build placeable mesh: floor track + pedestal + telescopic column of N fold panels. */
export function buildGiantTvMesh(s = {}) {
  const root = new T.Group();
  root.name = "giant_tv";
  const color = parseHex(s.tvColor ?? TV_COLOR_PRESETS[0].hex);
  const mat = chassisMat(color);
  const metal = chassisMat(0x2a3340, 0.85, 0.22);
  const dark = chassisMat(0x050508, 0.4, 0.5);
  const screenMat = new T.MeshStandardMaterial({
    color: 0x0b1020,
    emissive: 0x1a2848,
    emissiveIntensity: 0.35,
    metalness: 0.1,
    roughness: 0.55
  });

  // Floor track / recessed base (metallic pedestal on a track)
  const track = new T.Group();
  track.name = "tvTrack";
  const rail = new T.Mesh(new T.BoxGeometry(TV_TRACK_L, 0.06, TV_TRACK_W), metal);
  rail.position.y = 0.03;
  rail.castShadow = rail.receiveShadow = true;
  track.add(rail);
  const recess = new T.Mesh(new T.BoxGeometry(TV_TRACK_L - 0.12, 0.04, TV_TRACK_W - 0.18), dark);
  recess.position.y = 0.055;
  track.add(recess);
  for (const x of [-TV_TRACK_L * 0.42, TV_TRACK_L * 0.42]) {
    const stop = new T.Mesh(new T.BoxGeometry(0.12, 0.1, TV_TRACK_W + 0.06), metal);
    stop.position.set(x, 0.05, 0);
    track.add(stop);
  }
  const pedestal = new T.Mesh(new T.BoxGeometry(1.05, 0.22, 0.78), mat);
  pedestal.position.y = 0.14;
  pedestal.castShadow = true;
  pedestal.name = "tvPedestal";
  track.add(pedestal);
  root.add(track);

  // Rising column that holds folded panels
  const column = new T.Group();
  column.name = "tvColumn";
  column.position.y = 0.28;
  const mast = new T.Mesh(new T.BoxGeometry(0.55, TV_OPEN_H - 0.4, 0.42), mat);
  mast.geometry.translate(0, (TV_OPEN_H - 0.4) / 2, 0);
  mast.castShadow = true;
  mast.name = "tvMast";
  column.add(mast);

  const panels = new T.Group();
  panels.name = "tvPanels";
  panels.position.set(0, 0.35, 0.28);
  const panelMeshes = [];
  for (let i = 0; i < TV_PANEL_N; i++) {
    const g = new T.Group();
    g.name = "tvPanel_" + i;
    const frame = new T.Mesh(
      new T.BoxGeometry(TV_PANEL_W + TV_FRAME * 2, TV_SCREEN_H + TV_FRAME * 2, 0.07),
      mat
    );
    frame.castShadow = true;
    const screen = new T.Mesh(new T.BoxGeometry(TV_PANEL_W, TV_SCREEN_H, 0.02), screenMat.clone());
    screen.position.z = 0.04;
    screen.name = "tvScreenFace";
    g.add(frame, screen);
    panels.add(g);
    panelMeshes.push(g);
  }
  column.add(panels);

  // Soft emissive glow strip behind screens when open
  const glow = new T.PointLight(0x6aa8ff, 0, 14, 2);
  glow.position.set(0, TV_SCREEN_H * 0.55, 0.6);
  glow.name = "tvGlow";
  column.add(glow);

  root.add(column);
  root.userData = {
    type: GIANT_TV,
    track,
    column,
    panels,
    panelMeshes,
    mast,
    pedestal,
    glow,
    chassisMats: [],
    screenMats: [],
    open: 0,
    targetOpen: s.tvOpen ? 1 : 0,
    highlight: false,
    color
  };
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    if (o.name === "tvScreenFace") root.userData.screenMats.push(o.material);
    else if (o.material === mat || (o.material.color && o.parent === pedestal) || o === pedestal || o === mast)
      root.userData.chassisMats.push(o.material);
  });
  // Collect chassis materials by matching color reference
  root.userData.chassisMats = [];
  root.traverse(o => {
    if (o.isMesh && o.material && o.material !== metal && o.material !== dark && o.name !== "tvScreenFace") {
      if (o.material.color && !root.userData.screenMats.includes(o.material)) {
        // pedestal, mast, frames share mat clones - re-tint via applyTvColor
        if (o === pedestal || o === mast || (o.parent && String(o.parent.name || "").startsWith("tvPanel"))) {
          root.userData.chassisMats.push(o.material);
        }
      }
    }
  });

  applyTvColor(root, color);
  setTvOpenFrac(root, s.tvOpen ? 1 : 0);
  return root;
}

export function applyTvColor(root, hex) {
  if (!root?.userData) return;
  const c = parseHex(hex);
  root.userData.color = c;
  root.traverse(o => {
    if (!o.isMesh || !o.material || o.name === "tvScreenFace") return;
    const n = o.name || "";
    const pn = o.parent?.name || "";
    // Keep track rails metallic grey; tint chassis (pedestal, mast, panel frames)
    if (n === "tvPedestal" || n === "tvMast" || pn.startsWith("tvPanel")) {
      if (o.material.color) o.material.color.setHex(c);
    }
  });
}

/** openFrac 0 = folded column near ground; 1 = fully risen + panels fanned into wide screen. */
export function setTvOpenFrac(root, t) {
  if (!root?.userData) return;
  const u = root.userData;
  const k = Math.max(0, Math.min(1, t));
  u.open = k;
  const col = u.column;
  if (col) {
    // Rise: column lifts so screen center reaches house height
    const yClosed = 0.12;
    const yOpen = TV_OPEN_H - TV_SCREEN_H - 0.15;
    col.position.y = yClosed + (yOpen - yClosed) * easeInOut(k);
  }
  const panels = u.panelMeshes || [];
  const n = panels.length || TV_PANEL_N;
  // Fold phase: first half rises as stacked column; second half fans panels horizontally
  const rise = Math.min(1, k * 1.35);
  const fold = Math.max(0, (k - 0.28) / 0.72);
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const p = panels[i];
    if (!p) continue;
    // Closed: stacked as thick monolithic T/column (slight depth stagger)
    const closedX = 0;
    const closedZ = (i - mid) * 0.055;
    const closedRy = 0;
    // Open: side-by-side seamless wide screen
    const openX = (i - mid) * TV_PANEL_W;
    const openZ = 0;
    const openRy = 0;
    // Mid-unfold: slight accordion fan
    const fan = Math.sin(fold * Math.PI) * 0.18 * (i - mid);
    const x = closedX + (openX - closedX) * fold;
    const z = closedZ + (openZ - closedZ) * fold + fan * 0.15;
    const ry = closedRy + (openRy - closedRy) * fold + fan * 0.08;
    p.position.set(x, 0, z);
    p.rotation.y = ry;
    p.rotation.x = (1 - rise) * 0.02;
    p.visible = true;
  }
  if (u.glow) u.glow.intensity = 0.15 + 1.4 * k * k;
  for (const m of u.screenMats || []) {
    if (m) m.emissiveIntensity = 0.12 + 0.85 * k;
  }
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function setTvHighlight(root, on) {
  if (!root?.userData) return;
  root.userData.highlight = !!on;
  const pulse = on ? 0x3ec8ff : null;
  root.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.emissive) return;
    if (o.name === "tvScreenFace") return;
    if (on) {
      o.userData._emi = o.material.emissive.getHex();
      o.userData._emiI = o.material.emissiveIntensity;
      o.material.emissive.setHex(0x1a6a88);
      o.material.emissiveIntensity = 0.45;
    } else if (o.userData._emi != null) {
      o.material.emissive.setHex(o.userData._emi);
      o.material.emissiveIntensity = o.userData._emiI || 0;
      delete o.userData._emi;
      delete o.userData._emiI;
    }
  });
  void pulse;
}

export function stepGiantTv(s, dt) {
  if (!s?.obj?.userData) return;
  const u = s.obj.userData;
  const tgt = s.tvOpen ? 1 : 0;
  u.targetOpen = tgt;
  if (Math.abs(u.open - tgt) < 0.001) {
    if (u.open !== tgt) setTvOpenFrac(s.obj, tgt);
    return;
  }
  const spd = 0.55; // ~1.8s full open
  const next = u.open + Math.sign(tgt - u.open) * Math.min(Math.abs(tgt - u.open), spd * dt);
  setTvOpenFrac(s.obj, next);
}

export function screenWorldCenter(s) {
  const o = s?.obj;
  if (!o) return new T.Vector3(s.x, s.y + TV_OPEN_H * 0.55, s.z);
  const mid = Math.floor(TV_PANEL_N / 2);
  const panel = o.userData?.panelMeshes?.[mid];
  if (panel) {
    panel.getWorldPosition(_v);
    _v.y += TV_SCREEN_H * 0.45;
    return _v.clone();
  }
  return new T.Vector3(s.x, s.y + (s.tvOpen ? TV_OPEN_H * 0.55 : 1.2), s.z);
}

export function screenFacing(s) {
  const ry = s.ry || 0;
  // Local +z is screen face (panels sit at +z on column)
  return new T.Vector3(Math.sin(ry), 0, Math.cos(ry));
}

/** Face-on camera: look at screen, keep player visible in frame (offset to the side/back). */
export function applyTvWatchCamera(camera, player, s) {
  if (!camera || !player || !s) return false;
  const face = screenFacing(s);
  const center = screenWorldCenter(s);
  const dist = 7.5;
  const side = new T.Vector3(-face.z, 0, face.x); // perpendicular
  // Camera stands in front of screen, slightly elevated, nudged so player stays in view
  const camPos = center.clone().addScaledVector(face, dist).add(new T.Vector3(0, 0.6, 0));
  // Bias toward player's side so character remains visible
  const pp = player.pos;
  const toPlayer = new T.Vector3(pp.x - center.x, 0, pp.z - center.z);
  if (toPlayer.lengthSq() > 0.01) {
    toPlayer.normalize();
    const sideDot = toPlayer.dot(side);
    camPos.addScaledVector(side, Math.sign(sideDot || 1) * 1.8);
  } else {
    camPos.addScaledVector(side, 1.6);
  }
  camera.position.lerp(camPos, 0.18);
  _cam.copy(center);
  // Look slightly toward player so both screen and character frame
  _cam.x = center.x * 0.82 + pp.x * 0.18;
  _cam.z = center.z * 0.82 + pp.z * 0.18;
  camera.lookAt(_cam);
  if (Math.abs(camera.fov - 48) > 0.2) {
    camera.fov = 48;
    camera.updateProjectionMatrix();
  }
  if (player.model) player.model.visible = true;
  return true;
}

export function isTvWatchOpen() {
  return !!watchS;
}
export function watchTvStruct() {
  return watchS;
}

function ensureOverlay() {
  if (overlay) return overlay;
  const el = document.createElement("div");
  el.id = "tvOverlay";
  el.className = "tvOverlay";
  el.hidden = true;
  el.innerHTML = `
    <div class="tvBox">
      <div class="tvHead">
        <div>
          <h3>House TV</h3>
          <small>C SEED-style fold-out MicroLED · Piped no-ads by default</small>
        </div>
        <div class="tvActs">
          <button type="button" data-tv="toggleOpen">Open / Close</button>
          <button type="button" data-tv="close" class="ghost">Exit</button>
        </div>
      </div>
      <div class="tvToolbar">
        <button type="button" data-tv="frontend" data-mode="piped" class="primary">Piped (no ads)</button>
        <button type="button" data-tv="frontend" data-mode="youtube">Official YouTube</button>
        <button type="button" data-tv="google" class="primary">Sign in with Google</button>
        <label class="tvVolLab">Vol <input type="range" min="0" max="100" value="55" data-tv="vol" /> <span data-tv="volLbl">55%</span></label>
        <button type="button" data-tv="mute">Mute</button>
      </div>
      <div class="tvColors">
        <span>Chassis</span>
        ${TV_COLOR_PRESETS.map(p => `<button type="button" data-tv="preset" data-hex="${hexCss(p.hex)}" title="${p.name}" style="background:${hexCss(p.hex)}"></button>`).join("")}
        <label>Wheel <input type="color" data-tv="wheel" value="#0a0a0c" /></label>
      </div>
      <div class="tvSearch">
        <input type="search" data-tv="q" placeholder="Paste YouTube URL or video ID…" />
        <button type="button" data-tv="go" class="primary">Watch</button>
        <button type="button" data-tv="home">Home</button>
      </div>
      <div class="tvFrameSlot"><iframe class="tvFrame" title="House TV" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
      <p class="tvNote">Default watch path is <b>Piped</b> (open-source YT frontend, no ads). Google sign-in opens an account-picker popup (user gesture) - not iframe OAuth. TV audio is spatial and mixes with world ambience; rainproof chassis.</p>
    </div>`;
  (document.querySelector("#mode-world") || document.body).appendChild(el);
  overlay = el;
  iframeEl = el.querySelector("iframe.tvFrame");
  el.addEventListener("click", onOverlayClick);
  el.addEventListener("input", onOverlayInput);
  el.addEventListener("keydown", e => e.stopPropagation());
  return el;
}

function extractVideoId(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s, "https://youtube.com");
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0] || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/\/(?:embed|v|shorts)\/([\w-]{11})/);
    if (m) return m[1];
    const pm = u.pathname.match(/\/watch\/([\w-]{11})/);
    if (pm) return pm[1];
  } catch (_) {}
  return null;
}

function loadHome() {
  pendingVideoId = null;
  if (!iframeEl) return;
  if (frontend === "piped") iframeEl.src = PIPED_HOME;
  else iframeEl.src = YT_HOME;
}

function loadVideo(id) {
  pendingVideoId = id;
  if (!iframeEl || !id) return loadHome();
  if (frontend === "piped") iframeEl.src = PIPED_EMBED(id);
  else iframeEl.src = YT_NOCOOKIE(id);
  startSpatialBed();
}

function onOverlayClick(e) {
  const b = e.target.closest("[data-tv]");
  if (!b) return;
  const act = b.dataset.tv;
  if (act === "close") {
    closeTvWatch();
    return;
  }
  if (act === "toggleOpen" && watchS) {
    watchS.tvOpen = !watchS.tvOpen;
    if (watchS.tvOpen) startSpatialBed();
    else stopSpatialBed(false);
    return;
  }
  if (act === "frontend") {
    frontend = b.dataset.mode === "youtube" ? "youtube" : "piped";
    overlay.querySelectorAll("[data-tv=frontend]").forEach(x => x.classList.toggle("primary", x.dataset.mode === frontend));
    if (pendingVideoId) loadVideo(pendingVideoId);
    else loadHome();
    return;
  }
  if (act === "google") {
    // User-gesture popup - browsers allow this; not trapped in iframe OAuth
    const w = window.open(GOOGLE_ACCOUNTS, "fogGoogleLogin", "popup=yes,width=520,height=640");
    if (!w) toastSafe("Popup blocked - allow popups for Google sign-in.");
    else toastSafe("Complete Google / YouTube sign-in in the popup, then return here.");
    return;
  }
  if (act === "mute") {
    tvMuted = !tvMuted;
    applyTvGain();
    b.textContent = tvMuted ? "Unmute" : "Mute";
    return;
  }
  if (act === "preset") {
    setWatchColor(parseHex(b.dataset.hex));
    return;
  }
  if (act === "home") {
    loadHome();
    return;
  }
  if (act === "go") {
    const q = overlay.querySelector("[data-tv=q]")?.value;
    const id = extractVideoId(q);
    if (!id) {
      // Piped search home with query
      if (frontend === "piped" && q) iframeEl.src = PIPED_HOME + "results?search_query=" + encodeURIComponent(q);
      else toastSafe("Paste a YouTube URL or 11-char video ID.");
      return;
    }
    loadVideo(id);
  }
}

function onOverlayInput(e) {
  const t = e.target;
  if (t.dataset.tv === "vol") {
    tvVol = Math.max(0, Math.min(1, (+t.value || 0) / 100));
    tvMuted = false;
    const lbl = overlay.querySelector("[data-tv=volLbl]");
    if (lbl) lbl.textContent = Math.round(tvVol * 100) + "%";
    const mb = overlay.querySelector("[data-tv=mute]");
    if (mb) mb.textContent = "Mute";
    applyTvGain();
  }
  if (t.dataset.tv === "wheel") setWatchColor(parseHex(t.value));
}

function setWatchColor(hex) {
  if (!watchS) return;
  watchS.tvColor = hex;
  if (watchS.obj) applyTvColor(watchS.obj, hex);
  const wheel = overlay?.querySelector("[data-tv=wheel]");
  if (wheel) wheel.value = hexCss(hex);
}

function toastSafe(msg) {
  if (toastFn) { try { toastFn(msg); return } catch (_) {} }
  try { console.info("[TV]", msg) } catch (_) {}
}

let toastFn = null;
export function setTvToast(fn) {
  toastFn = fn;
}
function toast(msg) {
  if (toastFn) toastFn(msg);
  else toastSafe(msg);
}

export function openTvWatch(s, opts = {}) {
  if (!s || !isGiantTv(s.type)) return false;
  if (opts.toast) toastFn = opts.toast;
  watchS = s;
  s.tvOpen = true;
  setTvHighlight(s.obj, true);
  const el = ensureOverlay();
  el.hidden = false;
  try {
    document.exitPointerLock?.();
  } catch (_) {}
  const wheel = el.querySelector("[data-tv=wheel]");
  if (wheel) wheel.value = hexCss(s.tvColor ?? TV_COLOR_PRESETS[0].hex);
  const vol = el.querySelector("[data-tv=vol]");
  if (vol) vol.value = String(Math.round(tvVol * 100));
  const lbl = el.querySelector("[data-tv=volLbl]");
  if (lbl) lbl.textContent = Math.round(tvVol * 100) + "%";
  el.querySelectorAll("[data-tv=frontend]").forEach(x => x.classList.toggle("primary", x.dataset.mode === frontend));
  loadHome();
  startSpatialBed();
  toast("TV watch mode - face-on camera. Piped (no ads) home. Esc exits.");
  return true;
}

export function closeTvWatch() {
  if (!watchS) return;
  setTvHighlight(watchS.obj, false);
  // leave open state as user left it (risen or closed via toggle)
  watchS = null;
  if (overlay) overlay.hidden = true;
  if (iframeEl) iframeEl.src = "about:blank";
  stopSpatialBed(true);
}

export function toggleTvOpen(s) {
  if (!s) return;
  s.tvOpen = !s.tvOpen;
  return s.tvOpen;
}

export function tvKeydown(e) {
  if (!watchS) return false;
  if (e.code === "Escape") {
    closeTvWatch();
    return true;
  }
  if (e.code === "Equal" || e.code === "NumpadAdd" || (e.key === "+" && !e.ctrlKey)) {
    tvVol = Math.min(1, tvVol + 0.05);
    tvMuted = false;
    syncVolUi();
    applyTvGain();
    return true;
  }
  if (e.code === "Minus" || e.code === "NumpadSubtract" || e.key === "-") {
    tvVol = Math.max(0, tvVol - 0.05);
    syncVolUi();
    applyTvGain();
    return true;
  }
  if (e.code === "KeyM" && !e.ctrlKey && !e.metaKey) {
    tvMuted = !tvMuted;
    applyTvGain();
    const mb = overlay?.querySelector("[data-tv=mute]");
    if (mb) mb.textContent = tvMuted ? "Unmute" : "Mute";
    return true;
  }
  return false;
}

function syncVolUi() {
  if (!overlay) return;
  const vol = overlay.querySelector("[data-tv=vol]");
  if (vol) vol.value = String(Math.round(tvVol * 100));
  const lbl = overlay.querySelector("[data-tv=volLbl]");
  if (lbl) lbl.textContent = Math.round(tvVol * 100) + "%";
}

/** Soft procedural bed under the embed - spatialized; does NOT touch world ambience graph. */
function startSpatialBed() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioApi) {
      const ctx = new AC();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 4;
      panner.maxDistance = 48;
      panner.rolloffFactor = 1.1;
      // Soft noise bed (TV "presence"); real video audio stays in iframe - this is positional cue
      const n = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 0.35;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 1800;
      src.connect(filt);
      filt.connect(panner);
      panner.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      audioApi = { ctx, gain, panner, src };
    }
    if (audioApi.ctx.state === "suspended") audioApi.ctx.resume();
    applyTvGain();
  } catch (_) {}
}

function stopSpatialBed(hard) {
  if (!audioApi) return;
  try {
    audioApi.gain.gain.setTargetAtTime(0, audioApi.ctx.currentTime, 0.05);
  } catch (_) {}
  if (hard) {
    try {
      audioApi.src.stop();
    } catch (_) {}
    try {
      audioApi.ctx.close();
    } catch (_) {}
    audioApi = null;
  }
}

function applyTvGain() {
  if (!audioApi) return;
  const v = tvMuted ? 0 : tvVol * 0.22; // quiet presence bed; iframe carries program
  try {
    audioApi.gain.gain.setTargetAtTime(v, audioApi.ctx.currentTime, 0.08);
  } catch (_) {}
}

/** Update HRTF panner from screen world pos vs camera - call each frame while watching/open. */
export function updateTvAudio(s, camera) {
  if (!audioApi || !s || !camera) return;
  const c = screenWorldCenter(s);
  const p = audioApi.panner;
  const ctx = audioApi.ctx;
  const now = ctx.currentTime;
  try {
    if (p.positionX) {
      p.positionX.setValueAtTime(c.x, now);
      p.positionY.setValueAtTime(c.y, now);
      p.positionZ.setValueAtTime(c.z, now);
    } else p.setPosition(c.x, c.y, c.z);
    const face = screenFacing(s);
    if (p.orientationX) {
      p.orientationX.setValueAtTime(face.x, now);
      p.orientationY.setValueAtTime(0, now);
      p.orientationZ.setValueAtTime(face.z, now);
    } else p.setOrientation(face.x, 0, face.z);
    // Listener follows camera (separate from Fog ambience AudioContext - mix at OS/speaker level)
    const L = ctx.listener;
    const cp = camera.position;
    if (L.positionX) {
      L.positionX.setValueAtTime(cp.x, now);
      L.positionY.setValueAtTime(cp.y, now);
      L.positionZ.setValueAtTime(cp.z, now);
    } else L.setPosition(cp.x, cp.y, cp.z);
    const fwd = new T.Vector3();
    camera.getWorldDirection(fwd);
    if (L.forwardX) {
      L.forwardX.setValueAtTime(fwd.x, now);
      L.forwardY.setValueAtTime(fwd.y, now);
      L.forwardZ.setValueAtTime(fwd.z, now);
      L.upX.setValueAtTime(0, now);
      L.upY.setValueAtTime(1, now);
      L.upZ.setValueAtTime(0, now);
    } else L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
  } catch (_) {}
}

export function adjustTvVolume(delta) {
  tvVol = Math.max(0, Math.min(1, tvVol + delta));
  tvMuted = false;
  syncVolUi();
  applyTvGain();
  return tvVol;
}

export function getTvVolume() {
  return { vol: tvVol, muted: tvMuted, frontend };
}
