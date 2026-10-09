# Map display

The atlas has a compact display dock with the original Knowledge Circuit and
Public Frontier tabs. FULLSCREEN uses the browser Fullscreen API on the embedded
atlas document; Escape or EXIT FULLSCREEN restores the previous panel choice.
MAP ONLY fills the page and hides the title/navigation, search/counters, details,
caption, zoom controls and parent shell. PANELS toggles each section separately.
The minus button minimizes the dock to the two view tabs and a restore button.
Display preferences survive atlas refresh within the tab.

The drawing surface uses overflow:clip and absolutely positioned canvas/SVG.
This prevents hidden SVG geometry and decoration from creating an internal scroll
offset that leaves the lower part of the map blank. Layout changes resize and
refit the overview while retaining a manually zoomed camera. Every node remains
in the map; presentation toggles do not change scientific or worker state.

The 8097 preview accepts display messages only from its current frame and pinned
origin. Native accepts them only from its own same-origin atlas frame. Auto-sync
continues while headers are hidden and preserves the current frame on unchanged
published commits. Both wrappers explicitly allow fullscreen.

`atlas-display/native/static/` retains the three Native frontend postimages,
with SHA-256 hashes and a reversible `upgrade.patch`. Deploy these frontend files
with backups; refresh the atlas page once to load the wrapper. No Native process
restart, Brain extension reload or worker refresh is required.

Validation: `node scripts/test_atlas_display.js`,
`node scripts/test_live_preview.js`, `python scripts/test_atlas_preview.py`,
`python scripts/validate.py`, plus real browser checks for fullscreen, collapsed
panels, public-frontier tabs, restored controls and aligned map/canvas bounds.
