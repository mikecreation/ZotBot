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
