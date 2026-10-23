/* Fog of Knowledge: giant telescopic house-TV (C SEED M1 / Bugatti fold-into-floor vibe).
 * House-tall when open (= foresthouse chimney top 4.75 m). Closed = recessed floor track + folded column.
 * Opens by rising + unfolding N vertical MicroLED-style panels into one seamless wide screen.
 * Watch UI: Piped (no-ads) primary; optional Official YouTube; Google sign-in via window.open popup.
 * Video/home render ON the 3D glass via CSS3DObject (not a side HUD panel). Thin HUD = chrome only.
 * Chassis color presets + color wheel (persisted per structure). 3D spatial TV audio mixes ON TOP of
 * world ambience (never mutes wind/rain/birds). Rainproof - outdoor OK in rain.
 */
import * as T from "./vendor/three.module.min.js";

/* CSS3D is OPTIONAL/LAZY: static import of CSS3DRenderer used to 404 its three.js path and
 * broke the whole world.js module graph (black Open World). Load only when TV watch opens. */
let CSS3DObject = null;
let CSS3DRenderer = null;
let cssApiPromise = null;
let cssContainer = null;

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

/** ~90° frontal viewing cone (half-angle 45°) — re-yaw only when hero leaves this cone. */
const FACE_CONE_COS = Math.cos(Math.PI / 4);

export const TV_COLOR_PRESETS = [
  { id: "black", name: "Black", hex: 0x0a0a0c },
  { id: "red", name: "Red", hex: 0x8b1218 },
  { id: "deep_blue", name: "Deep blue", hex: 0x0c1a3a },
  { id: "cool_orange", name: "Deep cool orange", hex: 0xb54a18 }
];

const PIPED_HOME = "https://piped.video/";
const PIPED_EMBED = id => `https://piped.video/embed/${id}`;
const YT_NOCOOKIE = id => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&autoplay=1`;
const YT_HOME = "https://www.youtube.com/";
const GOOGLE_ACCOUNTS = "https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fwww.youtube.com%2F";

const CSS_PX_W = 960;
const CSS_PX_H = Math.round(CSS_PX_W * (TV_SCREEN_H / TV_SCREEN_W));

let watchS = null; // HUD / chrome only (NOT camera lock, NOT playback ownership)
let mediaS = null; // structure that owns glass embed + spatial bed (survives Exit/minimize)
let overlay = null;
let iframeEl = null;
let cssObj = null;
let cssRenderer = null;
let cssHost = null;
let audioApi = null;
let tvVol = 0.55;
let tvMuted = false;
let frontend = "piped";
let pendingVideoId = null;
let fillScreen = false;
const _v = new T.Vector3();
const _cam = new T.Vector3();
const _toP = new T.Vector3();

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

/** Mesh root with fold userData — structMesh wraps this in s.obj and stores s._tv. */
export function tvRoot(s) {
  if (!s) return null;
  if (s._tv?.userData?.type === GIANT_TV) return s._tv;
  if (s.obj?.userData?.type === GIANT_TV) return s.obj;
  return s.obj?.getObjectByName?.("giant_tv") || null;
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Yaw so screen +Z faces the player (hero looks at the glass front). Persist on s.ry. */
export function faceTvTowardPlayer(s, playerPos) {
  if (!s || !playerPos) return;
  const dx = playerPos.x - s.x;
  const dz = playerPos.z - s.z;
  if (dx * dx + dz * dz < 1e-6) return;
  s.ry = Math.atan2(dx, dz);
  if (s.obj) s.obj.rotation.y = s.ry;
}

/**
 * While open/watching: only re-yaw when hero leaves the ~90° frontal cone of the screen.
 * Does not constantly spin while still in front view.
 */
export function stepTvFacing(s, playerPos, dt) {
  if (!s || !playerPos) return;
  if (!(s.tvOpen || watchS === s || mediaS === s)) return;
  _toP.set(playerPos.x - s.x, 0, playerPos.z - s.z);
  if (_toP.lengthSq() < 0.25) return;
  _toP.normalize();
  const face = screenFacing(s);
  if (face.dot(_toP) >= FACE_CONE_COS) return;
  const tgt = Math.atan2(_toP.x, _toP.z);
  s.ry = lerpAngle(s.ry || 0, tgt, Math.min(1, 3.2 * (dt || 0.016)));
  if (s.obj) s.obj.rotation.y = s.ry;
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

  const column = new T.Group();
  column.name = "tvColumn";
  column.position.y = 0.28;

  // Short telescopic mast — scales up on open (was always house-tall = fake monolith).
  const mastH = TV_OPEN_H - 0.55;
  const mast = new T.Mesh(new T.BoxGeometry(0.42, mastH, 0.28), mat);
  mast.geometry.translate(0, mastH / 2, 0);
  mast.castShadow = true;
  mast.name = "tvMast";
  column.add(mast);

  const panels = new T.Group();
  panels.name = "tvPanels";
  panels.position.set(0, 0.2, 0.22);
  const panelMeshes = [];
  for (let i = 0; i < TV_PANEL_N; i++) {
    const g = new T.Group();
    g.name = "tvPanel_" + i;
    const frame = new T.Mesh(
      new T.BoxGeometry(TV_PANEL_W + TV_FRAME * 2, TV_SCREEN_H + TV_FRAME * 2, 0.07),
      mat
    );
    frame.geometry.translate(0, (TV_SCREEN_H + TV_FRAME * 2) / 2, 0);
    frame.castShadow = true;
    const screen = new T.Mesh(new T.BoxGeometry(TV_PANEL_W, TV_SCREEN_H, 0.02), screenMat.clone());
    screen.geometry.translate(0, TV_SCREEN_H / 2, 0);
    screen.position.z = 0.04;
    screen.name = "tvScreenFace";
    g.add(frame, screen);
    panels.add(g);
    panelMeshes.push(g);
  }
  column.add(panels);

  // Single glass plane spanning the open MicroLED — CSS3D iframe parents here.
  const glassMat = new T.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.04,
    depthWrite: false,
    side: T.DoubleSide
  });
  const glass = new T.Mesh(new T.PlaneGeometry(TV_SCREEN_W, TV_SCREEN_H), glassMat);
  glass.name = "tvGlass";
  glass.position.set(0, TV_SCREEN_H / 2, 0.09);
  glass.visible = false;
  panels.add(glass);

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
    glass,
    glow,
    chassisMats: [],
    screenMats: [],
    open: 0,
    targetOpen: s.tvOpen ? 1 : 0,
    highlight: false,
    color
  };
  root.userData.screenMats = [];
  root.traverse(o => {
    if (o.isMesh && o.name === "tvScreenFace") root.userData.screenMats.push(o.material);
  });
  root.userData.chassisMats = [];
  root.traverse(o => {
    if (o.isMesh && o.material && o.material !== metal && o.material !== dark && o.name !== "tvScreenFace" && o.name !== "tvGlass") {
      if (o === pedestal || o === mast || (o.parent && String(o.parent.name || "").startsWith("tvPanel"))) {
        root.userData.chassisMats.push(o.material);
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
    if (!o.isMesh || !o.material || o.name === "tvScreenFace" || o.name === "tvGlass") return;
    const n = o.name || "";
    const pn = o.parent?.name || "";
    if (n === "tvPedestal" || n === "tvMast" || pn.startsWith("tvPanel")) {
      if (o.material.color) o.material.color.setHex(c);
    }
  });
}

/** openFrac 0 = low folded cassette; 1 = risen + panels fanned into wide T screen. */
export function setTvOpenFrac(root, t) {
  if (!root?.userData) return;
  const u = root.userData;
  const k = Math.max(0, Math.min(1, t));
  u.open = k;
  const col = u.column;
  if (col) {
    const yClosed = 0.1;
    const yOpen = 0.35;
    col.position.y = yClosed + (yOpen - yClosed) * easeInOut(k);
  }
  if (u.mast) {
    // Closed: stub; open: full telescopic mast behind panels (thin, not a slab).
    u.mast.scale.set(1, 0.1 + 0.9 * easeInOut(k), 1);
    u.mast.visible = k < 0.92;
  }
  const panels = u.panelMeshes || [];
  const n = panels.length || TV_PANEL_N;
  const rise = Math.min(1, k * 1.45);
  const fold = Math.max(0, (k - 0.22) / 0.78);
  const mid = (n - 1) / 2;
  const hScale = 0.07 + 0.93 * easeInOut(rise);
  for (let i = 0; i < n; i++) {
    const p = panels[i];
    if (!p) continue;
    const closedX = 0;
    const closedZ = (i - mid) * 0.048;
    const openX = (i - mid) * TV_PANEL_W;
    const openZ = 0;
    const fan = Math.sin(fold * Math.PI) * 0.22 * (i - mid);
    const x = closedX + (openX - closedX) * fold;
    const z = closedZ + (openZ - closedZ) * fold + fan * 0.12;
    const ry = fan * 0.1 * (1 - fold);
    p.position.set(x, 0, z);
    p.rotation.set(0, ry, 0);
    p.scale.set(1, hScale, 1);
    p.visible = true;
    // Dim individual LED faces once glass/CSS3D takes over
    p.traverse(o => {
      if (o.name === "tvScreenFace") o.visible = fold < 0.85 || !cssObj;
    });
  }
  if (u.glass) {
    const gw = (TV_PANEL_W + (TV_SCREEN_W - TV_PANEL_W) * fold) / TV_SCREEN_W;
    u.glass.scale.set(Math.max(0.15, gw), hScale, 1);
    u.glass.position.set(0, (TV_SCREEN_H * hScale) / 2, 0.09);
    u.glass.visible = k > 0.35;
  }
  if (u.glow) u.glow.intensity = 0.15 + 1.4 * k * k;
  for (const m of u.screenMats || []) {
    if (m) m.emissiveIntensity = 0.12 + 0.85 * k;
  }
  syncCssToGlass(root);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function setTvHighlight(root, on) {
  const mesh = root?.userData?.type === GIANT_TV ? root : root;
  if (!mesh?.userData) return;
  mesh.userData.highlight = !!on;
  mesh.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.emissive) return;
    if (o.name === "tvScreenFace" || o.name === "tvGlass") return;
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
}

export function stepGiantTv(s, dt, playerPos) {
  const root = tvRoot(s);
  if (!root?.userData) return;
  const u = root.userData;
  const tgt = s.tvOpen ? 1 : 0;
  u.targetOpen = tgt;
  if (Math.abs(u.open - tgt) >= 0.001) {
    const spd = 0.62;
    const next = u.open + Math.sign(tgt - u.open) * Math.min(Math.abs(tgt - u.open), spd * dt);
    setTvOpenFrac(root, next);
  } else if (u.open !== tgt) {
    setTvOpenFrac(root, tgt);
  }
  if (playerPos) stepTvFacing(s, playerPos, dt);
}

export function screenWorldCenter(s) {
  const root = tvRoot(s);
  if (!root) return new T.Vector3(s.x, s.y + TV_OPEN_H * 0.55, s.z);
  const glass = root.userData?.glass;
  if (glass && glass.visible) {
    glass.getWorldPosition(_v);
    return _v.clone();
  }
  const mid = Math.floor(TV_PANEL_N / 2);
  const panel = root.userData?.panelMeshes?.[mid];
  if (panel) {
    panel.getWorldPosition(_v);
    _v.y += TV_SCREEN_H * 0.45 * (panel.scale?.y || 1);
    return _v.clone();
  }
  return new T.Vector3(s.x, s.y + (s.tvOpen ? TV_OPEN_H * 0.55 : 1.2), s.z);
}

export function screenFacing(s) {
  const ry = s.ry || 0;
  return new T.Vector3(Math.sin(ry), 0, Math.cos(ry));
}

/** Disabled: never trap the player in a forced face-on cam. Free roam always.
 *  TV yaw follow (~90° cone) lives in stepTvFacing; spatial audio in updateTvAudio.
 *  Kept exported so world.js call sites stay valid; always returns false.
 */
export function applyTvWatchCamera(camera, player, s) {
  return false;
}

export function isTvWatchOpen() {
  return !!watchS; // HUD chrome visible (not camera lock)
}
export function isTvPlaying() {
  return !!mediaS && !!(mediaS.tvOpen);
}
export function watchTvStruct() {
  return watchS || mediaS;
}
export function mediaTvStruct() {
  return mediaS;
}

/* ---------------- CSS3D embed on glass ---------------- */

function loadCss3dApi() {
  if (CSS3DObject && CSS3DRenderer) return Promise.resolve(true);
  if (cssApiPromise) return cssApiPromise;
  cssApiPromise = import("./vendor/addons/renderers/CSS3DRenderer.js?v=3.52.3")
    .then(m => {
      CSS3DObject = m.CSS3DObject;
      CSS3DRenderer = m.CSS3DRenderer;
      return true;
    })
    .catch(err => {
      console.warn("[TV] CSS3D unavailable; fold-open still works without glass embed", err);
      cssApiPromise = null;
      return false;
    });
  return cssApiPromise;
}

/** Stash the world canvas container at boot. Does NOT mount CSS3D (avoids black overlay / boot crash). */
export function initTvCss3d(container) {
  if (container) cssContainer = container;
  return cssRenderer;
}

async function ensureCssRenderer() {
  if (cssRenderer) return cssRenderer;
  if (!cssContainer) return null;
  const ok = await loadCss3dApi();
  if (!ok || !CSS3DRenderer) return null;
  if (cssRenderer) return cssRenderer;
  cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(cssContainer.clientWidth, cssContainer.clientHeight);
  const el = cssRenderer.domElement;
  el.id = "tvCss3d";
  el.className = "tvCss3d";
  el.style.position = "absolute";
  el.style.inset = "0";
  el.style.pointerEvents = "none";
  el.style.overflow = "hidden";
  el.style.background = "transparent";
  cssContainer.style.position = cssContainer.style.position || "relative";
  cssContainer.appendChild(el);
  cssHost = el;
  window.addEventListener("resize", () => {
    if (!cssRenderer || !cssContainer) return;
    cssRenderer.setSize(cssContainer.clientWidth, cssContainer.clientHeight);
  });
  return cssRenderer;
}

function ensureScreenIframe() {
  if (!CSS3DObject) return null;
  if (iframeEl && cssObj) return iframeEl;
  killScreenMedia();
  const wrap = document.createElement("div");
  wrap.className = "tvScreenWrap";
  wrap.style.width = CSS_PX_W + "px";
  wrap.style.height = CSS_PX_H + "px";
  wrap.style.background = "#000";
  wrap.style.overflow = "hidden";
  wrap.style.borderRadius = "4px";
  wrap.style.pointerEvents = "none";
  const iframe = document.createElement("iframe");
  iframe.className = "tvScreenFrame";
  iframe.title = "House TV";
  iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  iframe.referrerPolicy = "no-referrer-when-downgrade";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";
  iframe.style.background = "#000";
  wrap.appendChild(iframe);
  cssObj = new CSS3DObject(wrap);
  cssObj.scale.set(TV_SCREEN_W / CSS_PX_W, TV_SCREEN_H / CSS_PX_H, 1);
  iframeEl = iframe;
  return iframe;
}

function attachCssToGlass(root) {
  if (!CSS3DObject || !cssRenderer) return;
  ensureScreenIframe();
  const glass = root?.userData?.glass;
  if (!glass || !cssObj) return;
  if (cssObj.parent !== glass) {
    if (cssObj.parent) cssObj.parent.remove(cssObj);
    // PlaneGeometry faces +Z; sit just in front of glass
    cssObj.position.set(0, 0, 0.02);
    cssObj.rotation.set(0, 0, 0);
    glass.add(cssObj);
  }
  cssObj.visible = true;
  // Host must stay pointer-events:none -- full-viewport layer would steal mouse-look.
  // Screen wrap may accept clicks only while HUD (watchS) is open; Exit clears that.
  if (cssHost) cssHost.style.pointerEvents = "none";
  if (cssObj.element) cssObj.element.style.pointerEvents = watchS ? "auto" : "none";
  syncCssToGlass(root);
}

function syncCssToGlass(root) {
  if (!cssObj || !root?.userData?.glass) return;
  const glass = root.userData.glass;
  const open = root.userData.open || 0;
  // Glass stays lit while folded-open + media owned — Exit/minimize must NOT blank it.
  cssObj.visible = !!mediaS && open > 0.4 && glass.visible;
  if (fillScreen && cssObj.element) {
    cssObj.element.classList.add("tvScreenFill");
  } else if (cssObj.element) {
    cssObj.element.classList.remove("tvScreenFill");
  }
}

/** Tear down the single active media element (no orphan iframes / audio). */
function killScreenMedia() {
  if (iframeEl) {
    try {
      iframeEl.src = "about:blank";
    } catch (_) {}
    try {
      iframeEl.remove();
    } catch (_) {}
    iframeEl = null;
  }
  if (cssObj) {
    try {
      if (cssObj.parent) cssObj.parent.remove(cssObj);
    } catch (_) {}
    try {
      cssObj.element?.remove();
    } catch (_) {}
    cssObj = null;
  }
  if (cssHost) cssHost.style.pointerEvents = "none";
  fillScreen = false;
  pendingVideoId = null;
  mediaS = null;
}

export function renderTvCss3d(camera, scene) {
  if (!cssRenderer || !camera || !scene) return;
  if (!mediaS || !cssObj || !cssObj.visible) return;
  cssRenderer.render(scene, camera);
}

function ensureOverlay() {
  if (overlay) return overlay;
  const el = document.createElement("div");
  el.id = "tvOverlay";
  el.className = "tvOverlay tvOverlayThin";
  el.hidden = true;
  el.innerHTML = `
    <div class="tvBox">
      <div class="tvHead">
        <div>
          <h3>House TV</h3>
          <small>Controls · video plays on the glass</small>
        </div>
        <div class="tvActs">
          <button type="button" data-tv="toggleOpen" title="Fold or unfold the physical chassis only">Fold / Unfold</button>
          <button type="button" data-tv="exit" class="ghost" title="Minimize HUD — keep TV playing, free roam">Exit</button>
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
      <p class="tvNote">Piped/YouTube render <b>on the TV screen</b> in the world. <b>Exit / Esc</b> = minimize HUD + free roam (playback stays on). <b>Fold</b> = chassis only.</p>
    </div>`;
  (document.querySelector("#mode-world") || document.body).appendChild(el);
  overlay = el;
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
  fillScreen = false;
  if (!CSS3DObject || !cssRenderer) return;
  ensureScreenIframe();
  if (!iframeEl) return;
  // Replace src via blank first to kill prior media
  iframeEl.src = "about:blank";
  requestAnimationFrame(() => {
    if (!iframeEl) return;
    iframeEl.src = frontend === "piped" ? PIPED_HOME : YT_HOME;
  });
  syncCssToGlass(tvRoot(watchS));
}

function loadVideo(id) {
  pendingVideoId = id;
  if (!id) return loadHome();
  if (!CSS3DObject || !cssRenderer) return;
  ensureScreenIframe();
  fillScreen = true;
  if (!iframeEl) return;
  iframeEl.src = "about:blank";
  requestAnimationFrame(() => {
    if (!iframeEl) return;
    iframeEl.src = frontend === "piped" ? PIPED_EMBED(id) : YT_NOCOOKIE(id);
  });
  startSpatialBed();
  const root = tvRoot(watchS);
  if (root) {
    root.userData.panelMeshes?.forEach(p => {
      p.traverse(o => {
        if (o.name === "tvScreenFace") o.visible = false;
      });
    });
  }
  syncCssToGlass(root);
}

function onOverlayClick(e) {
  const b = e.target.closest("[data-tv]");
  if (!b) return;
  const act = b.dataset.tv;
  // Exit = minimize HUD only (never fold, never kill playback)
  if (act === "exit" || act === "close") {
    exitWatch();
    return;
  }
  if (act === "toggleOpen" && watchS) {
    setTvChassisOpen(watchS, !watchS.tvOpen);
    return;
  }
  if (act === "frontend") {
    frontend = b.dataset.mode === "youtube" ? "youtube" : "piped";
    overlay.querySelectorAll("[data-tv=frontend]").forEach(x => x.classList.toggle("primary", x.dataset.mode === frontend));
    const keepId = pendingVideoId;
    killScreenMedia();
    pendingVideoId = keepId;
    if (watchS) attachCssToGlass(tvRoot(watchS));
    if (keepId) loadVideo(keepId);
    else loadHome();
    return;
  }
  if (act === "google") {
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
    fillScreen = false;
    loadHome();
    return;
  }
  if (act === "go") {
    const q = overlay.querySelector("[data-tv=q]")?.value;
    const id = extractVideoId(q);
    if (!id) {
      if (frontend === "piped" && q) {
        ensureScreenIframe();
        iframeEl.src = PIPED_HOME + "results?search_query=" + encodeURIComponent(q);
        fillScreen = false;
        return;
      }
      toastSafe("Paste a YouTube URL or 11-char video ID.");
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
  const root = tvRoot(watchS);
  if (root) applyTvColor(root, hex);
  const wheel = overlay?.querySelector("[data-tv=wheel]");
  if (wheel) wheel.value = hexCss(hex);
}

function toastSafe(msg) {
  if (toastFn) {
    try {
      toastFn(msg);
      return;
    } catch (_) {}
  }
  try {
    console.info("[TV]", msg);
  } catch (_) {}
}

let toastFn = null;
export function setTvToast(fn) {
  toastFn = fn;
}
function toast(msg) {
  if (toastFn) toastFn(msg);
  else toastSafe(msg);
}

/** Fold/unfold physical chassis only. Closing may hide embed; opening restores. Never touches HUD/camera. */
export function setTvChassisOpen(s, open) {
  if (!s || !isGiantTv(s.type)) return false;
  const want = !!open;
  s.tvOpen = want;
  const root = tvRoot(s);
  if (want) {
    mediaS = s;
    startSpatialBed();
    if (root) {
      attachCssToGlass(root);
      syncCssToGlass(root);
    }
    // Restore prior video if we blanked on fold; else leave whatever is on glass.
    if (pendingVideoId) loadVideo(pendingVideoId);
    else if (iframeEl && (!iframeEl.src || iframeEl.src === "about:blank")) loadHome();
  } else {
    // Folded away: hide glass + soft-mute spatial bed; keep pendingVideoId for restore.
    stopSpatialBed(false);
    if (cssObj) cssObj.visible = false;
    if (iframeEl) {
      try { iframeEl.src = "about:blank"; } catch (_) {}
    }
    if (mediaS === s) {
      /* keep mediaS so Exit≠fold ownership stays clear; embed blanked until unfold */
    }
  }
  return s.tvOpen;
}

export function openTvWatch(s, opts = {}) {
  if (!s || !isGiantTv(s.type)) return false;
  if (opts.toast) toastFn = opts.toast;
  // Switching to a different TV kills prior media; same TV re-entry keeps playback.
  if (mediaS && mediaS !== s) {
    killScreenMedia();
    stopSpatialBed(true);
    mediaS = null;
  }
  watchS = s;
  mediaS = s;
  s.tvOpen = true;
  const pos = opts.playerPos || opts.player?.pos;
  if (pos) faceTvTowardPlayer(s, pos);
  const root = tvRoot(s);
  if (root) setTvHighlight(root, true);
  const el = ensureOverlay();
  el.hidden = false;
  // Pointer unlock so HUD is clickable; camera stays free-roam (applyTvWatchCamera disabled).
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
  startSpatialBed();
  const alreadyPlaying = !!(iframeEl && iframeEl.src && iframeEl.src !== "about:blank");
  ensureCssRenderer().then(ok => {
    if (mediaS !== s) return;
    if (!ok) {
      toastSafe("Glass embed offline - TV still folds open. Hard-refresh if black screen persists.");
      return;
    }
    if (root) attachCssToGlass(root);
    // Re-entering watch must NOT reset an already-playing video.
    if (!alreadyPlaying && !pendingVideoId) loadHome();
    else if (!alreadyPlaying && pendingVideoId) loadVideo(pendingVideoId);
    else syncCssToGlass(root);
  });
  toast("TV HUD open — free roam. Exit/Esc minimizes (keeps playing). Fold closes the chassis.");
  return true;
}

/** Exit / Esc = minimize HUD only. Do NOT fold, stop Piped/YT, or blank the glass. */
export function exitWatch() {
  if (!watchS && !(overlay && !overlay.hidden)) return;
  const s = watchS;
  const root = s ? tvRoot(s) : null;
  if (root) setTvHighlight(root, false);
  watchS = null;
  if (overlay) overlay.hidden = true;
  // mediaS, iframe, spatial bed, tvOpen all stay -- player walks + crafts with audio.
  // Critical: CSS3D host is full-viewport; leaving pointer-events:auto steals mouse-look.
  if (cssHost) cssHost.style.pointerEvents = "none";
  if (cssObj && cssObj.element) cssObj.element.style.pointerEvents = "none";
  if (iframeEl) iframeEl.style.pointerEvents = "none";
  // Restore normal hero look immediately (same as never having opened the HUD).
  try {
    const canvas = document.querySelector("#mode-world canvas") || document.querySelector("canvas");
    if (canvas && document.pointerLockElement !== canvas) {
      canvas.focus && canvas.focus({ preventScroll: true });
      canvas.requestPointerLock && canvas.requestPointerLock();
    }
  } catch (_) {}
}

/** Back-compat alias used by world.js Esc / debug.tv.close — same as Exit (minimize). */
export function closeTvWatch() {
  exitWatch();
}

export function toggleTvOpen(s) {
  if (!s) return;
  s.tvOpen = !s.tvOpen;
  return s.tvOpen;
}

export function tvKeydown(e) {
  if (!watchS) return false;
  if (e.code === "Escape") {
    // Esc = minimize HUD + free roam; playback stays on the open glass.
    exitWatch();
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
      // Near = loud; walk away = falloff. Tuned so proximity is obvious after Exit/minimize.
      panner.refDistance = 3;
      panner.maxDistance = 56;
      panner.rolloffFactor = 1.35;
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
  const v = tvMuted ? 0 : tvVol * 0.22;
  try {
    audioApi.gain.gain.setTargetAtTime(v, audioApi.ctx.currentTime, 0.08);
  } catch (_) {}
}

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
