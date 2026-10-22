# Realistic human build scripts

Offline pipeline that produced `assets/human-real.gltf.json` + `assets/human-real/*` (all CC0).
Run on Linux with Blender 4.2 LTS + MPFB 2.0.18 installed as an extension and the
`makehuman_system_assets_cc0.zip` pack unzipped into MPFB's user data dir; `ual.gltf` is a copy of
`assets/human.gltf.json` (paths at the top of each script point at the build box, adjust as needed).

1. `python3 textures.py` - procedural leather / fur / wraps / pore-detail textures (numpy)
2. `blender -b --python build.py` - MPFB human, pose into the UAL T-pose, move UAL joints onto it
3. `blender -b --python clothes.py` - hide tunic, fringed skirt, belt, fur mantle, wraps; beard mask
4. `python3 skin.py` - warm-tinted skin texture with painted stubble
5. `blender -b --python export.py` then `python3 package.py` - glTF export, embed buffer, copy textures
6. optional: `blender -b --python preview.py` - Cycles preview renders
