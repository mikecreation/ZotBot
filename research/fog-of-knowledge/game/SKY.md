# Sky system (JOB 2)

Research-inspired, all procedural in `gfx.js` (no third-party sky assets).

## References applied
- **Preetham / Hosek-Wilkie** style sky already via three.js `Sky` — we boost Rayleigh/turbidity at low sun for richer PBR sunsets/golden hour.
- **Hipparcos / spectral classes**: star colours mix O→M (blue-white → orange-red) with a magnitude power-law (few bright, many faint).
- **Atmospheric scintillation**: per-star phase in the starfield shader (`uTime` + hash seed) for twinkle.
- **Milky Way**: dense additive point band along a tilted great-circle plane with a central bulge — reads as a bright galactic band, also on ocean reflection layer.
- **Moon phases**: synodic month (`moonPhase`) drives a terminator shader (lit crescent → full → new) plus earthshine on the dark side; glow sprite scales with illuminated fraction.
- **Moonlight / night exposure**: stronger moon key + hemi fill and a modest night exposure lift so grass/trees stay readable instead of pure black silhouettes; fog density eases at night.
- **Shooting stars**: short additive line-segment meteors, sporadic spawns when `nightAmt` is high.
- **Ocean star reflections**: sky, stars, Milky Way, meteors, aurora, moon stay on layer 1 for the ocean cube camera (see `ocean.js`).
- **Aurora**: additive waving curtain (clear dark nights).
- **Rainbow**: spectral torus arc after rain when the sun is up.
- **Lightning**: existing flash light + sky uniform (unchanged path, still drives exposure pulse).

## Controls
- Time: `__fogWorld.setHour(h)`
- Weather: `__fogWorld.setWeather(kind, amt)` / calm preference
- Brightness slider still multiplies `ENV.expMul`
