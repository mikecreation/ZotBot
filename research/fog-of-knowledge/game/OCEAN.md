# FFT ocean (ocean.js, ocean-spectrum.js)

Our own WebGL2 implementation of the published ocean technique (no third-party ocean code or assets):

- **Spectrum** – JONSWAP (Hasselmann et al. 1973) for the local wind sea (wind speed, fetch, γ) plus a long narrow swell
  (peak wavelength, height), with Hasselmann/Mitsuyasu cos^2s((θ−θw)/2) directional spreading. Seeded Gaussian
  amplitudes (`DEFAULT_OCEAN.seed`), deep-water dispersion ω²=gk quantised to a 600 s loop (Tessendorf §4.3) so phases are
  deterministic functions of time and stay precise in float32.
- **Cascades** – 3 tiles: swell 420 m, waves 64 m, ripples 9.5 m; each owns a wavenumber band so nothing is counted twice.
- **GPU IFFT** – one spectrum pass writes h̃, choppy D̃=iλk̂h̃ and the 6 derivatives as 4 complex signals into a float atlas
  (3N×2N); log2N horizontal + log2N vertical radix-2 Stockham passes; a finalize pass writes per cascade
  displacement (Dx,h,Dz,Jacobian) and derivatives (hx,hz,Dxx,Dzz) to mip-mapped half-float targets.
- **Foam** – Jacobian J=(1+Dxx)(1+Dzz)−Dxz² injects crest foam into a ping-pong texture that decays (τ≈2.2 s);
  shoreline foam and wash bands come from water depth over the terrain (CPU `heightAt` baked into a moving 768 m height texture).
- **Shading** – normals from derivatives, exact dielectric Fresnel n=1.33, sky reflection from a cube render of the existing
  Sky/moon/stars/clouds (layer 1), GGX sun/moon glints and subtle fire-light glints, crest subsurface glow, per-channel
  Beer–Lambert absorption over the refracted path. Transmission uses two blend passes (dst×T, then +radiance) so the
  ground shows through shallow water with true per-channel colour.
- **Mesh** – camera-following clipmap (7 rings, cell size doubles, geomorphed edges, 4 m snapping); displacement mip level
  follows vertex spacing and ripples/waves/foam fade out with distance (no shimmer). Waves die out in shallow water.
- **Night** – everything is lit by the scene's own key light (sun/moon), hemisphere light and fire point lights, so the
  water stays dark; moon glints are scaled down further.
- **Quality** – Low preset → 64² FFT, coarser mesh; High → 128² (medium, default); Ultra → 256². `?water=low|med|high` overrides.
- **Buoyancy** – `GFX.waveHeight(x,z,ground)` sums the strongest swell + wave modes on the CPU (same h̃0 and ω as the GPU);
  rafts heave/pitch/roll and floating drops bob with it.

Tests: `node --experimental-detect-module tests/ocean-spectrum.mjs` (IFFT vs DFT, JONSWAP peak/Hs, spreading normalisation,
determinism, FFT field == CPU direct sum, exact looping, sampler accuracy).

Sources: J. Tessendorf, *Simulating Ocean Water* (2001); Hasselmann et al., *JONSWAP* (1973); Hasselmann, Dunckel & Ewing (1980)
directional spectrum; Beer–Lambert law; GGX (Walter et al. 2007).
