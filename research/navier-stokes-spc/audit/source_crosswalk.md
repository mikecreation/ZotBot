# Source Crosswalk

Primary source: OpenAI, *Finite Time Blowup for Navier-Stokes* (2026).

| Source item | Role in the reconstruction |
| --- | --- |
| Lemma 5.4 | Shrinking-cutoff summation / realization from finite increasing-order corrections. |
| Proposition 7.2 | Supported nonzero angular harmonic pulse inverse and oscillatory pressure coefficient. |
| Proposition 7.6 | Signed-stress realization and exact covariance identity for the typed signed-wave image. |
| Proposition 8.3 | Mean residual / pressure readout after pressure reconstruction. |
| Proposition 8.4 | Exact integrated compatibility identities. |
| Corollary 8.5 | Preparation of compact averaged stress target. |
| Lemma 8.6 | Zero-auxiliary-average temporal mean inverse. |
| Lemmas 8.7-8.8 | Five-dimensional compatibility correction and higher-order defect remainder. |
| Proposition 9.1 | Supported wave residual improvement and flat pulse/cutoff remainder separation. |
| Lemma 9.2 | Wave-wave and wave-mean product rules. |
| Proposition 9.3 | Legality of finite correction sequences, exact pressure recomputation, retained + flat residual decomposition. |
| Proposition 9.5 | Initialized state `U_0`; sharper fixed-background envelopes. |
| Proposition 9.6 | Published repeated `+0.1` stage improvement targeted by the compression. |
| Lemma 9.7 | Common physical domain; stage-free content extracted from its proof. |
| Lemma 9.8 | Physical derivative conversion with losses independent of stage. |
| Proposition 9.9 | Final assembly into the realization interface and use of Lemma 5.4. |

## Bottlenecks

- Linear: averaged mean -> signed-stress wave -> wave residual, gain `1/2 - 4 kappa_s`.
- Nonlinear: wave x wave -> auxiliary-averaged mean, giving the `2 kappa_s` filtration loss.
