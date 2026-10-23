/* Fog of Knowledge: Galileo placeable telescope + real-sky viewer.
 * Sky is ALWAYS public Stellarium Web (real ephemeris / catalogs) for a lat/lon.
 * Location priority (documented):
 *   1) saved viewpoint from a prior globe pick or successful geolocation
 *   2) browser geolocation (when permitted)
 *   3) fallback Florence, Italy (Galileo's workshop ~43.77N, 11.25E) -- documented default
 * E on telescope -> "Switch location?"  Yes = interactive globe (countries + ocean).
 * No / default path = current saved or geolocated / Florence sky (no fake stars).
 * Tier 2 Observatory (mid): Aladin Lite DSS2 HiPS, deep ~2 deg FoV.
 * Tier 3 James Webb (jwst): Aladin JWST HiPS + ESASky, deep FoV / 360 pan.
 */
import * as T from "./vendor/three.module.min.js";

const STORE_KEY = "fog-of-knowledge:game:telescope:viewpoint";
const FALLBACK = { lat: 43.7696, lon: 11.2558, name: "Florence, Italy (Galileo default)", source: "fallback" };

/** Major countries + a few ocean sample points for the globe picker (centroids / capitals). */
const PLACES = [
  { name: "United States", lat: 38.9, lon: -77.0 },
  { name: "Canada", lat: 45.4, lon: -75.7 },
  { name: "Mexico", lat: 19.4, lon: -99.1 },
  { name: "Brazil", lat: -15.8, lon: -47.9 },
  { name: "Argentina", lat: -34.6, lon: -58.4 },
  { name: "Chile", lat: -33.4, lon: -70.7 },
  { name: "United Kingdom", lat: 51.5, lon: -0.1 },
  { name: "Ireland", lat: 53.3, lon: -6.3 },
  { name: "France", lat: 48.9, lon: 2.3 },
  { name: "Spain", lat: 40.4, lon: -3.7 },
  { name: "Portugal", lat: 38.7, lon: -9.1 },
  { name: "Italy", lat: 41.9, lon: 12.5 },
  { name: "Germany", lat: 52.5, lon: 13.4 },
  { name: "Netherlands", lat: 52.4, lon: 4.9 },
  { name: "Poland", lat: 52.2, lon: 21.0 },
  { name: "Sweden", lat: 59.3, lon: 18.1 },
  { name: "Norway", lat: 59.9, lon: 10.8 },
  { name: "Finland", lat: 60.2, lon: 24.9 },
  { name: "Greece", lat: 37.98, lon: 23.7 },
  { name: "Turkey", lat: 39.9, lon: 32.9 },
  { name: "Russia", lat: 55.8, lon: 37.6 },
  { name: "Ukraine", lat: 50.4, lon: 30.5 },
  { name: "Egypt", lat: 30.0, lon: 31.2 },
  { name: "South Africa", lat: -25.7, lon: 28.2 },
  { name: "Nigeria", lat: 9.1, lon: 7.5 },
  { name: "Kenya", lat: -1.3, lon: 36.8 },
  { name: "Morocco", lat: 34.0, lon: -6.8 },
  { name: "India", lat: 28.6, lon: 77.2 },
  { name: "China", lat: 39.9, lon: 116.4 },
  { name: "Japan", lat: 35.7, lon: 139.7 },
  { name: "South Korea", lat: 37.6, lon: 126.98 },
  { name: "Australia", lat: -35.3, lon: 149.1 },
  { name: "New Zealand", lat: -41.3, lon: 174.8 },
  { name: "Indonesia", lat: -6.2, lon: 106.8 },
  { name: "Thailand", lat: 13.8, lon: 100.5 },
  { name: "Saudi Arabia", lat: 24.7, lon: 46.7 },
  { name: "United Arab Emirates", lat: 24.5, lon: 54.4 },
  { name: "Israel", lat: 31.8, lon: 35.2 },
  { name: "Iran", lat: 35.7, lon: 51.4 },
  { name: "Pakistan", lat: 33.7, lon: 73.1 },
  { name: "Iceland", lat: 64.1, lon: -21.9 },
  { name: "Greenland", lat: 64.2, lon: -51.7 },
  { name: "Peru", lat: -12.0, lon: -77.0 },
  { name: "Colombia", lat: 4.7, lon: -74.1 },
  { name: "Pacific Ocean", lat: 0, lon: -160, ocean: true },
  { name: "Atlantic Ocean", lat: 20, lon: -40, ocean: true },
  { name: "Indian Ocean", lat: -20, lon: 80, ocean: true },
  { name: "Southern Ocean", lat: -60, lon: 0, ocean: true },
  { name: "Arctic Ocean", lat: 80, lon: 0, ocean: true }
];

export const TELESCOPE_GALILEO = "telescope_galileo";
export const TELESCOPE_MID = "telescope_mid";
export const TELESCOPE_JWST = "telescope_jwst";
export function isTelescope(type){ return type === TELESCOPE_GALILEO || type === TELESCOPE_MID || type === TELESCOPE_JWST }
export function isMidTelescope(type){ return type === TELESCOPE_MID }
export function isJwstTelescope(type){ return type === TELESCOPE_JWST }
let activeTier = "galileo";
/** Famous JWST deep fields (RA/Dec deg) for early-universe feel. */
export const JWST_DEEP_FIELDS = {
  smacs: { ra: 110.8375, dec: -73.4545, name: "SMACS 0723 (JWST First Deep Field)" },
  ceers: { ra: 214.91, dec: 52.91, name: "CEERS / EGS deep field" },
  stephans: { ra: 338.23, dec: 33.86, name: "Stephan Quintet (JWST)" },
};

function woodMat(c){ return new T.MeshStandardMaterial({ color: c, roughness: 0.88, metalness: 0.02 }) }
function brassMat(c){ return new T.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.75 }) }
function leatherMat(c){ return new T.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0 }) }

/** Small wooden refractor on a simple tripod -- Galileo / early look. */
export function buildGalileoMesh(){
  const g = new T.Group(); g.name = TELESCOPE_GALILEO; g.userData.telescope = TELESCOPE_GALILEO;
  const wood = woodMat(0x8a6238), dark = woodMat(0x5a3e22), brass = brassMat(0xc4a35a), leather = leatherMat(0x4a3020);
  // tripod legs
  for(let i = 0; i < 3; i++){
    const a = i * Math.PI * 2 / 3, leg = new T.Mesh(new T.CylinderGeometry(0.028, 0.038, 1.55, 7), wood);
    leg.position.set(Math.cos(a) * 0.42, 0.72, Math.sin(a) * 0.42);
    leg.rotation.z = Math.cos(a) * 0.28; leg.rotation.x = -Math.sin(a) * 0.28;
    leg.castShadow = leg.receiveShadow = true; g.add(leg);
  }
  const hub = new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 0.12, 10), dark);
  hub.position.y = 1.42; hub.castShadow = true; g.add(hub);
  // altitude cradle
  const yoke = new T.Mesh(new T.BoxGeometry(0.28, 0.08, 0.12), brass);
  yoke.position.y = 1.52; g.add(yoke);
  // wooden tube (main barrel) -- modest Galileo scale
  const tube = new T.Mesh(new T.CylinderGeometry(0.055, 0.065, 0.95, 14), wood);
  tube.rotation.z = Math.PI / 2; tube.rotation.y = 0.35; tube.position.set(0.12, 1.58, 0);
  tube.castShadow = true; g.add(tube);
  const wrap = new T.Mesh(new T.CylinderGeometry(0.068, 0.068, 0.18, 14), leather);
  wrap.rotation.z = Math.PI / 2; wrap.rotation.y = 0.35; wrap.position.copy(tube.position); g.add(wrap);
  const obj = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.06, 14), brass);
  obj.rotation.z = Math.PI / 2; obj.rotation.y = 0.35; obj.position.set(0.55, 1.58 + 0.02, 0.02); g.add(obj);
  const eye = new T.Mesh(new T.CylinderGeometry(0.035, 0.04, 0.1, 10), brass);
  eye.rotation.z = Math.PI / 2; eye.rotation.y = 0.35; eye.position.set(-0.38, 1.56, -0.02); g.add(eye);
  // small finder / sight
  const sight = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.22, 6), dark);
  sight.rotation.z = Math.PI / 2; sight.rotation.y = 0.35; sight.position.set(0.15, 1.68, 0); g.add(sight);
  g.userData.placeY = 0;
  return g;
}

/** Much larger pier-mounted refractor -- mid / observatory (obviously bigger than Galileo). */
export function buildMidMesh(){
  const g = new T.Group(); g.name = TELESCOPE_MID; g.userData.telescope = TELESCOPE_MID;
  const wood = woodMat(0x6b4a28), dark = woodMat(0x3d2a16), brass = brassMat(0xb8924a);
  const iron = new T.MeshStandardMaterial({ color: 0x5a5c60, roughness: 0.45, metalness: 0.55 });
  const paint = woodMat(0x2a3a4a);
  const base = new T.Mesh(new T.CylinderGeometry(0.55, 0.65, 0.35, 12), dark);
  base.position.y = 0.175; base.castShadow = base.receiveShadow = true; g.add(base);
  const pier = new T.Mesh(new T.CylinderGeometry(0.22, 0.28, 1.35, 12), wood);
  pier.position.y = 1.0; pier.castShadow = true; g.add(pier);
  const collar = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 0.12, 12), iron);
  collar.position.y = 1.7; g.add(collar);
  const head = new T.Mesh(new T.BoxGeometry(0.55, 0.28, 0.4), iron);
  head.position.y = 1.95; g.add(head);
  const axis = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.7, 10), brass);
  axis.rotation.z = Math.PI / 2; axis.position.set(0, 2.05, 0); g.add(axis);
  const tube = new T.Mesh(new T.CylinderGeometry(0.13, 0.15, 2.35, 16), paint);
  tube.rotation.z = Math.PI / 2; tube.rotation.y = 0.4; tube.position.set(0.35, 2.15, 0);
  tube.castShadow = true; g.add(tube);
  for(const o of [-0.7, 0, 0.7]){
    const ring = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.08, 16), brass);
    ring.rotation.z = Math.PI / 2; ring.rotation.y = 0.4;
    ring.position.set(0.35 + o * 0.85, 2.15, 0); g.add(ring);
  }
  const dew = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.22, 16), brass);
  dew.rotation.z = Math.PI / 2; dew.rotation.y = 0.4; dew.position.set(1.45, 2.22, 0.08); g.add(dew);
  const glass = new T.MeshStandardMaterial({ color: 0x88c8e8, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.85 });
  const obj = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.04, 16), glass);
  obj.rotation.z = Math.PI / 2; obj.rotation.y = 0.4; obj.position.set(1.55, 2.24, 0.1); g.add(obj);
  const eye = new T.Mesh(new T.CylinderGeometry(0.045, 0.055, 0.28, 10), brass);
  eye.rotation.z = Math.PI / 2; eye.rotation.y = 0.4; eye.position.set(-0.75, 2.05, -0.08); g.add(eye);
  const find = new T.Mesh(new T.CylinderGeometry(0.03, 0.035, 0.55, 8), dark);
  find.rotation.z = Math.PI / 2; find.rotation.y = 0.4; find.position.set(0.4, 2.38, 0); g.add(find);
  const cwShaft = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.9, 8), iron);
  cwShaft.rotation.z = Math.PI / 2; cwShaft.position.set(-0.55, 1.85, 0); g.add(cwShaft);
  const cw = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.1, 12), iron);
  cw.rotation.z = Math.PI / 2; cw.position.set(-0.95, 1.85, 0); g.add(cw);
  g.userData.placeY = 0;
  return g;
}

/** Huge JWST-class observatory -- segmented gold primary, sunshield, bus (obviously bigger than mid). */
export function buildJwstMesh(){
  const g = new T.Group(); g.name = TELESCOPE_JWST; g.userData.telescope = TELESCOPE_JWST;
  const gold = new T.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.28, metalness: 0.85 });
  const dark = new T.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.7, metalness: 0.35 });
  const silver = new T.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.4, metalness: 0.65 });
  const foil = new T.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.55, metalness: 0.2, side: T.DoubleSide });
  const bus = new T.Mesh(new T.BoxGeometry(1.1, 0.7, 1.4), dark);
  bus.position.set(0, 1.1, -0.2); bus.castShadow = true; g.add(bus);
  const tower = new T.Mesh(new T.CylinderGeometry(0.12, 0.16, 1.6, 10), silver);
  tower.position.set(0, 2.2, -0.15); g.add(tower);
  // sunshield stack (5 layers, diamond-ish)
  for(let i = 0; i < 5; i++){
    const w = 3.2 + i * 0.15, d = 2.2 + i * 0.1;
    const layer = new T.Mesh(new T.PlaneGeometry(w, d), foil);
    layer.rotation.x = -Math.PI / 2;
    layer.position.set(0, 0.55 - i * 0.06, 0.35);
    g.add(layer);
  }
  // hexagonal primary (18 segments approx as hex ring + center)
  const mirrorY = 3.15;
  const hexR = 0.38;
  const positions = [[0,0]];
  for(let k = 0; k < 6; k++){
    const a = (k / 6) * Math.PI * 2;
    positions.push([Math.cos(a) * hexR * 1.85, Math.sin(a) * hexR * 1.85]);
  }
  for(let k = 0; k < 6; k++){
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    positions.push([Math.cos(a) * hexR * 3.2, Math.sin(a) * hexR * 3.2]);
  }
  for(let k = 0; k < 6; k++){
    const a = (k / 6) * Math.PI * 2;
    positions.push([Math.cos(a) * hexR * 3.7, Math.sin(a) * hexR * 3.7]);
  }
  for(const [x, z] of positions){
    const seg = new T.Mesh(new T.CylinderGeometry(hexR * 0.92, hexR * 0.92, 0.06, 6), gold);
    seg.position.set(x, mirrorY, z - 0.1);
    seg.castShadow = true; g.add(seg);
  }
  // secondary on tripod boom
  const boom = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 2.4, 8), silver);
  boom.rotation.z = 0.55; boom.position.set(1.0, 3.9, -0.1); g.add(boom);
  const boom2 = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 2.1, 8), silver);
  boom2.rotation.z = -0.55; boom2.position.set(-0.95, 3.85, -0.1); g.add(boom2);
  const boom3 = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 2.0, 8), silver);
  boom3.rotation.x = 0.5; boom3.position.set(0, 3.8, 0.9); g.add(boom3);
  const sec = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.08, 12), gold);
  sec.position.set(0, 4.55, -0.05); g.add(sec);
  // ISIM / instrument bay hint
  const isim = new T.Mesh(new T.BoxGeometry(0.7, 0.45, 0.55), dark);
  isim.position.set(0, 2.55, -0.55); g.add(isim);
  // ground pad so placeable sits huge
  const pad = new T.Mesh(new T.CylinderGeometry(1.6, 1.75, 0.25, 12), dark);
  pad.position.y = 0.12; pad.receiveShadow = true; g.add(pad);
  const strut = new T.Mesh(new T.CylinderGeometry(0.18, 0.22, 0.9, 10), silver);
  strut.position.y = 0.7; g.add(strut);
  g.userData.placeY = 0;
  return g;
}

export function loadViewpoint(){
  try{
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if(s && typeof s.lat === "number" && typeof s.lon === "number") return s;
  }catch(_){}
  return null;
}
export function saveViewpoint(v){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify({ lat: v.lat, lon: v.lon, name: v.name || "", source: v.source || "globe", t: Date.now() })) }catch(_){}
}

/** Approximate local civil night (~22:00 local mean solar) as UTC ISO for Stellarium. */
export function nightUtcIso(lon, when = new Date()){
  const localHour = 22;
  const utcH = ((localHour - lon / 15) % 24 + 24) % 24;
  const d = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate(), 0, 0, 0));
  const h = Math.floor(utcH), m = Math.round((utcH - h) * 60);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Stellarium Web share URL -- real public sky for lat/lon at local night. Galileo FOV ~45 deg. */
export function stellariumUrl(lat, lon, opts = {}){
  const fov = opts.fov ?? 45;
  const alt = opts.alt ?? 55;
  const az = opts.az ?? 180;
  const date = encodeURIComponent(opts.date || nightUtcIso(lon));
  return `https://stellarium-web.org/?lat=${(+lat).toFixed(5)}&lng=${(+lon).toFixed(5)}&date=${date}&fov=${fov}&alt=${alt}&az=${az}`;
}

/** Zenith RA/Dec (deg) at local night from observer lat/lon. */
export function zenithRaDec(lat, lon, when = new Date()){
  const d = new Date(nightUtcIso(lon, when));
  const jd = d.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T;
  gmst = ((gmst % 360) + 360) % 360;
  const lst = ((gmst + (+lon)) % 360 + 360) % 360;
  let dec = +lat;
  if(dec > 89) dec = 89; if(dec < -89) dec = -89;
  return { ra: lst, dec };
}

/** Aladin Lite DSS2 color -- mid deep FoV (~2 deg). Real public HiPS. */
export function aladinUrl(lat, lon, opts = {}){
  const { ra, dec } = zenithRaDec(lat, lon);
  const fov = opts.fov ?? 2;
  const survey = encodeURIComponent(opts.survey || "P/DSS2/color");
  const target = encodeURIComponent(ra.toFixed(4) + " " + dec.toFixed(4));
  return "https://aladin.cds.unistra.fr/AladinLite/?target=" + target + "&fov=" + fov + "&survey=" + survey;
}

/** Aladin Lite with public JWST HiPS (CDS/P/JWST/OPEN). opts.ra/dec override zenith. Deep FoV default. */
export function jwstAladinUrl(lat, lon, opts = {}){
  let ra, dec;
  if(opts.ra != null && opts.dec != null){ ra = +opts.ra; dec = +opts.dec; }
  else { const z = zenithRaDec(lat, lon); ra = z.ra; dec = z.dec; }
  const fov = opts.fov ?? 0.2;
  const survey = encodeURIComponent(opts.survey || "CDS/P/JWST/OPEN");
  const target = encodeURIComponent(ra.toFixed(4) + " " + dec.toFixed(4));
  return "https://aladin.cds.unistra.fr/AladinLite/?target=" + target + "&fov=" + fov + "&survey=" + survey;
}

/** ESASky -- full 360 pan/zoom, science mode, real mission HiPS / JWST tools. */
export function esaskyUrl(lat, lon, opts = {}){
  let ra, dec;
  if(opts.ra != null && opts.dec != null){ ra = +opts.ra; dec = +opts.dec; }
  else { const z = zenithRaDec(lat, lon); ra = z.ra; dec = z.dec; }
  const fov = opts.fov ?? 0.35;
  const target = encodeURIComponent(ra.toFixed(4) + " " + dec.toFixed(4));
  let url = "https://sky.esa.int/esasky?hide_welcome=true&hide_banner=true&sci=true&projection=SIN&cooframe=J2000"
    + "&target=" + target + "&fov=" + fov;
  if(opts.hips) url += "&hips=" + encodeURIComponent(opts.hips);
  return url;
}

function ensureOverlay(){
  let el = document.getElementById("wTelescope");
  if(el) return el;
  el = document.createElement("div");
  el.id = "wTelescope";
  el.className = "wOverlay telOverlay";
  el.hidden = true;
  el.innerHTML = "";
  const host = document.getElementById("mode-world") || document.body;
  host.appendChild(el);
  return el;
}

function exitFs(){
  try{
    if(document.fullscreenElement) document.exitFullscreen();
  }catch(_){}
}

function enterFs(el){
  try{
    const req = el && (el.requestFullscreen || el.webkitRequestFullscreen);
    if(req){
      const p = req.call(el);
      if(p && typeof p.catch === "function") p.catch(() => {});
    }
  }catch(_){}
}

function closeOverlay(){
  const el = document.getElementById("wTelescope");
  exitFs();
  if(!el) return;
  el.classList.remove("telSkyFs");
  el.hidden = true;
  el.innerHTML = "";
  el.onclick = null;
}

function askSwitch(onYes, onNo, title){
  const el = ensureOverlay();
  el.classList.remove("telSkyFs");
  exitFs();
  el.hidden = false;
  const ttl = title || (activeTier === "jwst" ? "JAMES WEBB TELESCOPE" : activeTier === "mid" ? "OBSERVATORY TELESCOPE" : "GALILEO TELESCOPE");
  el.innerHTML = `<div class="box telAsk" role="dialog" aria-label="Switch telescope location">
    <h3>` + ttl + `</h3>
    <p>Switch location?</p>
    <p class="muted">Yes opens an Earth globe (countries and oceans). No keeps your last viewpoint, or uses your current location.</p>
    <div class="telActs"><button data-tel="yes" class="primary">Yes</button><button data-tel="no">No</button><button data-tel="cancel" class="ghost">Cancel</button></div>
  </div>`;
  el.onclick = e => {
    const b = e.target.closest("[data-tel]"); if(!b) return;
    const v = b.getAttribute("data-tel");
    if(v === "cancel"){ closeOverlay(); return }
    if(v === "yes"){ onYes(); return }
    if(v === "no"){ onNo(); return }
  };
}

function resolveDefaultViewpoint(cb){
  const saved = loadViewpoint();
  if(saved){ cb(saved); return }
  if(typeof navigator !== "undefined" && navigator.geolocation){
    let done = false;
    const finish = v => { if(done) return; done = true; saveViewpoint(v); cb(v) };
    const t = setTimeout(() => finish({ ...FALLBACK }), 3500);
    try{
      navigator.geolocation.getCurrentPosition(
        pos => { clearTimeout(t); finish({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: "Your current location", source: "geolocation" }) },
        () => { clearTimeout(t); finish({ ...FALLBACK }) },
        { enableHighAccuracy: false, timeout: 3000, maximumAge: 600000 }
      );
    }catch(_){ clearTimeout(t); finish({ ...FALLBACK }) }
    return;
  }
  saveViewpoint({ ...FALLBACK });
  cb({ ...FALLBACK });
}

function openSky(view, tierKey){
  if(tierKey === "mid" || tierKey === "galileo" || tierKey === "jwst") activeTier = tierKey;
  const mid = activeTier === "mid";
  const jwst = activeTier === "jwst";
  const el = ensureOverlay();
  el.hidden = false;
  el.classList.add("telSkyFs");
  const zd = zenithRaDec(view.lat, view.lon);
  let url, skyTitle, srcLabel, extra;
  let jwstMode = "aladin"; // aladin | esasky
  let jwstTarget = { ra: JWST_DEEP_FIELDS.smacs.ra, dec: JWST_DEEP_FIELDS.smacs.dec, label: JWST_DEEP_FIELDS.smacs.name };

  function buildJwstUrl(){
    if(jwstMode === "esasky"){
      return esaskyUrl(view.lat, view.lon, { ra: jwstTarget.ra, dec: jwstTarget.dec, fov: 0.4 });
    }
    return jwstAladinUrl(view.lat, view.lon, { ra: jwstTarget.ra, dec: jwstTarget.dec, fov: 0.18 });
  }

  if(jwst){
    url = buildJwstUrl();
    skyTitle = "DEEP UNIVERSE -- James Webb";
    srcLabel = jwstMode === "esasky" ? "ESASky (360 pan/zoom)" : "Aladin JWST HiPS";
    extra = `${esc(jwstTarget.label)} - FoV deep - pan/zoom in viewer`;
  } else if(mid){
    url = aladinUrl(view.lat, view.lon);
    skyTitle = "DEEP SKY -- Observatory";
    srcLabel = "Aladin Lite DSS2";
    extra = `zenith RA ${zd.ra.toFixed(1)} Dec ${zd.dec.toFixed(1)} - deep FoV ~2 deg`;
  } else {
    url = stellariumUrl(view.lat, view.lon);
    skyTitle = "REAL SKY -- Galileo";
    srcLabel = "Stellarium Web";
    const night = nightUtcIso(view.lon);
    extra = `local night ~${esc(night)} UTC - wide FoV ~45 deg`;
  }
  const label = esc(view.name || `${view.lat.toFixed(2)}, ${view.lon.toFixed(2)}`);
  const src = esc(view.source || "saved");

  function render(){
    const jwstBtns = jwst ? `
        <button data-tel="jwst-smacs">SMACS deep</button>
        <button data-tel="jwst-ceers">CEERS</button>
        <button data-tel="jwst-zenith">Local zenith</button>
        <button data-tel="jwst-aladin">Aladin JWST</button>
        <button data-tel="jwst-esasky">ESASky 360</button>` : "";
    const note = jwst
      ? "Sky data: public CDS Aladin JWST HiPS (CDS/P/JWST/OPEN) and ESA ESASky. Pan/zoom in the viewer -- real deep fields, not shaders. Coverage is sparse outside JWST pointings; use SMACS/CEERS jumps."
      : `Sky data: public ${srcLabel} (real catalogs / HiPS for the chosen lat/lon). Open-world night sky stays stylized; only telescope mode is 100% real.`;
    el.innerHTML = `<div class="box telSky" role="dialog" aria-label="Real sky viewer">
    <header class="telHead">
      <div>
        <h3>${skyTitle}</h3>
        <small>Viewpoint: <b>${label}</b> (${src}) - ${srcLabel} - ${extra}</small>
      </div>
      <div class="telActs">
        <button data-tel="relocate">Switch location</button>${jwstBtns}
        <button data-tel="close" class="primary">Exit (Esc)</button>
      </div>
    </header>
    <iframe class="telFrame" title="${srcLabel} real sky" src="${esc(url)}" allow="fullscreen; clipboard-read; clipboard-write" referrerpolicy="no-referrer-when-downgrade"></iframe>
    <p class="telNote muted">${note}</p>
  </div>`;
  }
  render();
  el.onclick = e => {
    const b = e.target.closest("[data-tel]"); if(!b) return;
    const v = b.getAttribute("data-tel");
    if(v === "close"){ closeOverlay(); return }
    if(v === "relocate"){ exitFs(); el.classList.remove("telSkyFs"); openGlobe(picked => { saveViewpoint(picked); openSky(picked, activeTier) }); return }
    if(!jwst) return;
    if(v === "jwst-smacs"){ jwstTarget = { ra: JWST_DEEP_FIELDS.smacs.ra, dec: JWST_DEEP_FIELDS.smacs.dec, label: JWST_DEEP_FIELDS.smacs.name }; url = buildJwstUrl(); extra = `${esc(jwstTarget.label)} - FoV deep`; srcLabel = jwstMode === "esasky" ? "ESASky (360 pan/zoom)" : "Aladin JWST HiPS"; render(); enterFs(el); return }
    if(v === "jwst-ceers"){ jwstTarget = { ra: JWST_DEEP_FIELDS.ceers.ra, dec: JWST_DEEP_FIELDS.ceers.dec, label: JWST_DEEP_FIELDS.ceers.name }; url = buildJwstUrl(); extra = `${esc(jwstTarget.label)} - FoV deep`; srcLabel = jwstMode === "esasky" ? "ESASky (360 pan/zoom)" : "Aladin JWST HiPS"; render(); enterFs(el); return }
    if(v === "jwst-zenith"){ jwstTarget = { ra: zd.ra, dec: zd.dec, label: "Local zenith (from viewpoint)" }; url = buildJwstUrl(); extra = `zenith RA ${zd.ra.toFixed(1)} Dec ${zd.dec.toFixed(1)}`; srcLabel = jwstMode === "esasky" ? "ESASky (360 pan/zoom)" : "Aladin JWST HiPS"; render(); enterFs(el); return }
    if(v === "jwst-aladin"){ jwstMode = "aladin"; url = buildJwstUrl(); srcLabel = "Aladin JWST HiPS"; extra = `${esc(jwstTarget.label)} - FoV deep`; render(); enterFs(el); return }
    if(v === "jwst-esasky"){ jwstMode = "esasky"; url = buildJwstUrl(); srcLabel = "ESASky (360 pan/zoom)"; extra = `${esc(jwstTarget.label)} - FoV deep - drag to pan`; render(); enterFs(el); return }
  };
  enterFs(el);
}

function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])) }

function openGlobe(onPick){
  const el = ensureOverlay();
  el.classList.remove("telSkyFs");
  exitFs();
  el.hidden = false;
  el.innerHTML = `<div class="box telGlobe" role="dialog" aria-label="Choose Earth viewpoint">
    <header class="telHead">
      <div><h3>CHOOSE VIEWPOINT</h3><small>Click a labeled country or the ocean. Arrow marks the selection. This sets the real-sky lat/lon.</small></div>
      <div class="telActs"><button data-tel="cancel" class="ghost">Cancel</button></div>
    </header>
    <div class="telGlobeWrap"><canvas id="telGlobeCanvas" width="900" height="450"></canvas>
      <div id="telGlobeArrow" class="telArrow" hidden></div>
      <div id="telGlobeHint" class="telHint">Move over the map &middot; click country or ocean</div>
    </div>
    <div class="telActs"><button data-tel="use" class="primary" disabled>Use this viewpoint</button></div>
  </div>`;
  const canvas = el.querySelector("#telGlobeCanvas");
  const arrow = el.querySelector("#telGlobeArrow");
  const hint = el.querySelector("#telGlobeHint");
  const useBtn = el.querySelector('[data-tel="use"]');
  let pick = null;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext("2d");

  function lonLatToXY(lon, lat){
    const x = (lon + 180) / 360 * W;
    const y = (90 - lat) / 180 * H;
    return [x, y];
  }
  function xyToLonLat(x, y){
    const lon = x / W * 360 - 180;
    const lat = 90 - y / H * 180;
    return { lat: Math.max(-85, Math.min(85, lat)), lon: ((lon + 540) % 360) - 180 };
  }
  function nearestPlace(lat, lon){
    let best = null, bd = 1e9;
    for(const p of PLACES){
      const dlat = p.lat - lat, dlon = ((p.lon - lon + 540) % 360) - 180;
      const d = dlat * dlat + dlon * dlon;
      if(d < bd){ bd = d; best = p }
    }
    // snap to country if within ~12 deg, else ocean click
    if(Math.sqrt(bd) < 12) return { ...best, source: best.ocean ? "ocean" : "country" };
    return { lat, lon, name: `Ocean ${lat.toFixed(1)} deg, ${lon.toFixed(1)} deg`, source: "ocean", ocean: true };
  }
  function draw(){
    // equirectangular "globe" card: ocean + land tint + graticule + country labels with leader lines
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0a2744"); g.addColorStop(0.5, "#0d3a5c"); g.addColorStop(1, "#082033");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // soft land bands (stylized continents hint -- labels are authoritative)
    ctx.fillStyle = "#1a5a3a88";
    const blobs = [[-100, 45, 80, 40], [-60, -15, 50, 55], [20, 50, 55, 35], [20, 5, 45, 50], [80, 30, 70, 40], [135, -25, 50, 35], [40, -25, 40, 30]];
    for(const [lon, lat, rw, rh] of blobs){
      const [cx, cy] = lonLatToXY(lon, lat);
      ctx.beginPath(); ctx.ellipse(cx, cy, rw * W / 360, rh * H / 180, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "#ffffff18"; ctx.lineWidth = 1;
    for(let lon = -180; lon <= 180; lon += 30){
      const [x] = lonLatToXY(lon, 0); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for(let lat = -60; lat <= 60; lat += 30){
      const [, y] = lonLatToXY(0, lat); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.font = "600 11px system-ui,Segoe UI,sans-serif";
    for(const p of PLACES){
      const [x, y] = lonLatToXY(p.lon, p.lat);
      const ocean = !!p.ocean;
      ctx.fillStyle = ocean ? "#7ec8ff" : "#ffe6a8";
      ctx.beginPath(); ctx.arc(x, y, ocean ? 3.5 : 4.2, 0, Math.PI * 2); ctx.fill();
      // leader line + label
      const lx = x + (x > W * 0.7 ? -14 : 14), ly = y - 10;
      ctx.strokeStyle = ocean ? "#7ec8ff88" : "#ffe6a888"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.fillStyle = ocean ? "#cfefff" : "#fff3d0";
      ctx.textAlign = x > W * 0.7 ? "right" : "left";
      ctx.fillText(p.name, lx + (x > W * 0.7 ? -2 : 2), ly + 3);
    }
    if(pick){
      const [x, y] = lonLatToXY(pick.lon, pick.lat);
      ctx.strokeStyle = "#ff6b4a"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 26); ctx.lineTo(x - 7, y - 12); ctx.lineTo(x + 7, y - 12); ctx.closePath();
      ctx.fillStyle = "#ff6b4a"; ctx.fill();
    }
  }
  function setPick(p){
    pick = p;
    useBtn.disabled = !pick;
    hint.textContent = pick ? `Selected: ${pick.name}  (${pick.lat.toFixed(2)}, ${pick.lon.toFixed(2)})` : "Move over the map | click country or ocean";
    const wrap = canvas.parentElement.getBoundingClientRect();
    const [x, y] = lonLatToXY(pick.lon, pick.lat);
    const sx = x / W * wrap.width, sy = y / H * wrap.height;
    arrow.hidden = false;
    arrow.style.left = sx + "px"; arrow.style.top = sy + "px";
    draw();
  }
  draw();
  canvas.onclick = ev => {
    const r = canvas.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width * W;
    const y = (ev.clientY - r.top) / r.height * H;
    const ll = xyToLonLat(x, y);
    setPick(nearestPlace(ll.lat, ll.lon));
  };
  el.onclick = e => {
    const b = e.target.closest("[data-tel]"); if(!b) return;
    const v = b.getAttribute("data-tel");
    if(v === "cancel"){ closeOverlay(); return }
    if(v === "use" && pick){ onPick({ lat: pick.lat, lon: pick.lon, name: pick.name, source: pick.source || "globe" }); return }
  };
}

/** Public entry: E on a placed Galileo telescope. */
function usePlaceableTelescope(tierKey, opts = {}){
  activeTier = tierKey === "jwst" ? "jwst" : tierKey === "mid" ? "mid" : "galileo";
  const toast = opts.toast || (() => {});
  const title = activeTier === "jwst" ? "JAMES WEBB TELESCOPE"
    : activeTier === "mid" ? "OBSERVATORY TELESCOPE" : "GALILEO TELESCOPE";
  askSwitch(
    () => openGlobe(v => { saveViewpoint(v); toast(`Viewpoint set: ${v.name}`); openSky(v, activeTier) }),
    () => resolveDefaultViewpoint(v => { toast(`Sky from ${v.name}`); openSky(v, activeTier) }),
    title
  );
}

export function useGalileoTelescope(opts = {}){ usePlaceableTelescope("galileo", opts) }
export function useMidTelescope(opts = {}){ usePlaceableTelescope("mid", opts) }
export function useJwstTelescope(opts = {}){ usePlaceableTelescope("jwst", opts) }
export function useTelescopeFor(type, opts = {}){
  if(type === TELESCOPE_JWST) useJwstTelescope(opts);
  else if(type === TELESCOPE_MID) useMidTelescope(opts);
  else useGalileoTelescope(opts);
}

export function telescopeKeydown(e){
  const el = document.getElementById("wTelescope");
  if(!el || el.hidden) return false;
  if(e.code === "Escape"){ closeOverlay(); e.preventDefault(); return true }
  return false;
}

export function telescopeIsOpen(){
  const el = document.getElementById("wTelescope");
  return !!(el && !el.hidden);
}

export { FALLBACK, PLACES, STORE_KEY, activeTier };
