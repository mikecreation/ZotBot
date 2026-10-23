# Galileo telescope (real sky)

Placeable **Galileo telescope** only in this change. Mid-tier and JWST are deferred.

## Craft / place / use
1. Discover **optics** (existing path: glass -> lens).
2. Craft **Galileo telescope** (`telescope_galileo`): 2 lens + 1 bronze + 1 log + 3 stick.
3. Hold kit, **Q** (or place mode) to place; aim hologram, LMB confirm.
4. Walk up and press **E**:
   - Prompt: **Switch location?**
   - **Yes** -> interactive equirectangular globe with labeled countries + ocean points; click then **Use this viewpoint**.
   - **No** -> keep last saved viewpoint, else browser geolocation, else Florence fallback (see below).
5. Real sky opens **fullscreen** immediately (CSS full-viewport cover + Fullscreen API when the browser allows) with an iframe of **Stellarium Web** for that lat/lon at approximate local night (~22:00 local mean solar, converted to UTC). Same when choosing No and reopening the last / geolocated / Florence viewpoint.
6. **Esc** or Exit leaves fullscreen and closes telescope mode. **Switch location** inside the viewer exits fullscreen and reopens the globe.

Handheld inventory `telescope` (lens zoom for Moon/Jupiter discoveries) is unchanged.

## Location priority (global persist)
Key: `fog-of-knowledge:game:telescope:viewpoint` (one global last viewpoint, not per-structure).

1. Saved viewpoint (prior globe pick or successful geolocation write)
2. `navigator.geolocation` (3s timeout)
3. **Fallback:** Florence, Italy 43.7696 N, 11.2558 E (Galileo workshop default) -- documented, not silent

## Data sources
- **PRIMARY (this tier):** [Stellarium Web](https://stellarium-web.org/) URL params `lat`, `lng`, `date`, `fov`, `alt`, `az` -- real catalogs/ephemeris for the observer site. No API key.
- **Not used yet (later tiers):** Aladin Lite v3 (CDS HiPS), ESASky iframe/postMessage, JWST HiPS.
- Open-world night sky in `gfx.js` stays stylized; only telescope mode is 100% public real sky.

## Residuals
- Stellarium Web requires network; iframe may be blocked by browser third-party / cookie policy.
- Day/night: viewer forces approximate local night UTC so the sky is night-readable regardless of in-game hour.
- Ocean clicks: free lat/lon on the map, or snap to named ocean samples when near them.
- Geolocation needs user permission; denied -> Florence fallback.
- Country markers are a curated centroid list, not a full GIS boundary dataset.

## Tier 2 -- Observatory telescope (mid)

Craft **Observatory telescope** (`telescope_mid`): 4 lens + 2 bronze + 2 glass + 3 log + 6 stick + 1 iron bloom. Requires optics.
Place with Q (ghost). Much larger pier-mounted mesh than Galileo.
E -> Switch location? same UX. Sky: **Aladin Lite** DSS2 color HiPS at ~2 deg FoV aimed at local-night zenith (from lat/lon). Fullscreen on open.

## Tier 3 -- James Webb telescope (jwst)

Craft **James Webb telescope** (`telescope_jwst`): 8 lens + 4 bronze + 6 glass + 4 iron + 3 quartz + 5 log + 10 stick + 1 prism. Requires optics (late-game cost).
Place with Q -- huge segmented-mirror + sunshield mesh.
E -> Switch location? same globe/fullscreen UX.
Sky: **Aladin Lite** colorful JWST HiPS -- SMACS uses `CDS/P/JWST/Deep-Field-SMAC0723/NIRCam` (~0.04 deg FoV); CEERS/zenith use `CDS/P/JWST/EPO`; **ESASky** toggle for 360 deg. Buttons: SMACS, CEERS, local zenith, Aladin JWST, ESASky 360. Warm JWST cache keys versioned (`jwst2`) so old OPEN sessions auto-bust without Dump.
Real public survey data only (no fake nebula shaders).

## Sky cache (persist until Dump)

Telescope skies are kept **warm forever** until you dump them:
- **Warm iframe pool**: closing E parks the Aladin/Stellarium/ESASky iframe off-screen; reopening the same tier+viewpoint (and JWST target/mode) reattaches it with **no src reload**.
- **IndexedDB** (`fog-of-knowledge-telescope` / `skySessions`) + **localStorage** (`fog-of-knowledge:game:telescope:sessions`) store last URL, FoV, survey, RA/Dec, tier prefs.
- Viewpoint still in `fog-of-knowledge:game:telescope:viewpoint`.
- **Dump telescope cache** button in the sky overlay (also `window.__fogWorld.telescope.dumpCache()`) clears warm iframes, sessions, viewpoint, and any `fog-of-knowledge-telescope*` Cache API entries.

### What is truly cached vs network
- **Cached by us**: last URLs, targets, FoV, survey id, JWST mode, warm DOM iframes (instant reopen in-session).
- **Residual network**: Stellarium Web / Aladin / ESASky are third-party. HiPS tiles live on their CDNs; we cannot fully offline-cache cross-origin tiles. After a full browser restart, the first reopen still hits their HTTP cache when possible, then warms again. Dump forces a cold load.

## Galileo: Look deeper (FoV)

Stellarium Web accepts `fov` (degrees). **Look deeper** steps 45 -> 20 -> 10 -> 5 -> 2; **Widen view** goes back.
This is **optical zoom into the same real star/planet catalogs**, not deeper photographic survey data. For survey-image depth use Observatory (Aladin DSS2) or James Webb (JWST HiPS / ESASky). Each FoV is a separate warm-cache key.

