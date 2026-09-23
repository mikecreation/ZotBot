# Source Crosswalk

Primary source: OpenAI, *Finite Time Blowup for Navier-Stokes* (2026).

This crosswalk records not only which source result is used, but the exact exponent/type inheritance needed by the Structural Path Compression (SPC) compiler.

## Fixed source parameter

The loss parameter is a source parameter, not an SPC insertion. OpenAI fixes

```tex
\kappa_s = 10^{-5}
```

in equation (6.2) and repeats that convention at the start of Section 9.

## Primitive operators

| Source item | Source statement used | SPC role |
| --- | --- | --- |
| Lemma 5.4 | Shrinking-cutoff realization from finite increasing-order corrections. | Final smooth realization interface. |
| Proposition 7.2 | Supported nonzero-angular-harmonic pulse inverse with fixed phase/background coefficients. | Wave correction primitive. |
| Proposition 7.6, (7.32), (7.34) | If \(\Sigma\in M^\alpha\), the signed-stress correction lies in \(W^{\alpha-1/2}\), and \(B(W_0,L\Sigma)=\Sigma\). | Typed averaged-mean -> signed-wave primitive. |
| Proposition 8.3 | Exact mean residual / pressure readout after pressure reconstruction. | Mean-state readout. |
| Proposition 8.4 / Corollary 8.5 | Exact integrated compatibility identities and preparation of the compact averaged stress target. | Admissibility + stress preparation. |
| Lemma 8.6 | Zero-auxiliary-average temporal mean inverse. | \(M^\circ\) correction primitive. |
| Lemmas 8.7-8.8 | Fixed five-equation compatibility correction with higher-order defect remainder. | \(S\) correction primitive. |
| Proposition 9.1 | A wave source in \(W^\alpha\) leaves supported linear residual in \(W^{\alpha+1/2-3\kappa_s}\), modulo flat cutoff tails. | Linear wave-return estimate. |
| Lemma 9.2 | Wave-mean: \(W^\alpha\times M^\mu\to W^{\alpha+\mu-1/2}\). Same-label wave-wave: nonzero harmonic and zero harmonic in exponent \(\alpha+\alpha'-\kappa_s\). Distinct labels have zero products on closed supports. | Quadratic return estimates. |
| Proposition 9.3 | Any finite sequence of the named pulse, signed-stress, and Section 8 mean primitives is legal around the fixed base/primary waves, with exact pressure reconstruction, complete-field products, and retained + flat residual decomposition. | Compiler/execution legality. |
| Proposition 9.5 | Initialized state \(U_0\) with seed grade \(\sigma_0=1/5\). | Fixed compiler background. |
| Proposition 9.6, Step 1 | For wave order \(B\), supported linear wave error is \(B+1/2-3\kappa_s\); other listed channels are no worse. | \(W\to W\) linear return. |
| Proposition 9.6, Step 2 | The prepared stress lies in the required mean class; the signed correction lies in \(W^{B-\kappa_s}\); its linear error is \(W^{B+1/2-4\kappa_s}\). | Bottleneck \(\bar M\to W\) return. |
| Proposition 9.6, Step 3 | With \(H=C^*-2\kappa_s\), the zero-average mean inverse produces corrections in \(M^H\); wave interaction is in \(W^H\), and mean residual changes are in \(M^{H+1-2\kappa_s}\). | Higher-order \(M^\circ\) return. |
| Proposition 9.6, Step 4 | Compatibility defects return at exponent \(H+0.9-2\kappa_s\). | Higher-order \(S\) return. |
| Lemma 9.7 | One common domain for every finite construction; fixed background, primary covariance, supports, and inverse operators. | Target-depth-independent domain. |
| Lemma 9.8 | Physical derivative exponent losses depend on fixed derivative order, not correction stage. | Stage-free derivative interface. |
| Proposition 9.9 | Final assembly into the realization interface and use of Lemma 5.4. | Downstream target interface. |

## Linear return trace

Write a filtered source at relative grade \(s\) as

```tex
\mathfrak F^s =
W_{1/2+s}
\oplus \bar M_{1+s-\kappa_s}
\oplus M^\circ_{1+s-2\kappa_s}
\oplus S_{1+s-2\kappa_s}.
```

The source-addressed return degrees are:

| Input sector | Source inheritance | Relative return gain |
| --- | --- | ---: |
| \(W\) | Proposition 9.1 / Proposition 9.6 Step 1: \(W_B\to W_{B+1/2-3\kappa_s}\), \(B=1/2+s\). | \(1/2-3\kappa_s\) |
| \(\bar M\) | Corollary 8.5 prepares the typed stress; Proposition 7.6 gives the signed correction \(W_{B-\kappa_s}\); Proposition 9.1 / Proposition 9.6 Step 2 gives residual \(W_{B+1/2-4\kappa_s}\). | **\(1/2-4\kappa_s\)** |
| \(M^\circ\) | Lemma 8.6 / Proposition 9.6 Step 3: with \(H=1+s-2\kappa_s\), the wave return is \(W_H\) and the mean remainder gains at least \(1-2\kappa_s\). | at least \(1/2-2\kappa_s\) |
| \(S\) | Lemmas 8.7-8.8 / Proposition 9.6 Step 4: \(S_H\to S_{H+0.9-2\kappa_s}\). | \(0.9-2\kappa_s\) |

Hence the minimum positive linear return degree is

```tex
\delta_L = \frac12 - 4\kappa_s.
```

For the source value \(\kappa_s=10^{-5}\), \(\delta_L=0.49996\).

## Quadratic return trace

Use the conservative correction envelope generated from grade \(s\):

```tex
\text{wave part of }\mathcal X^s \subset W_{1/2+s-\kappa_s},
\qquad
\text{tangential mean part of }\mathcal X^s \subset M_{1+s-2\kappa_s},
```

with the radial mean one order better as in the source mean classes.

For two correction waves of grades \(s,t\), Lemma 9.2 gives the zero harmonic

```tex
M_{(1/2+s-\kappa_s)+(1/2+t-\kappa_s)-\kappa_s}
=
M_{1+s+t-3\kappa_s}.
```

But the \(\bar M\) component of \(\mathfrak F^{s+t-2\kappa_s}\) is exactly

```tex
\bar M_{1+(s+t-2\kappa_s)-\kappa_s}
=
\bar M_{1+s+t-3\kappa_s}.
```

Thus the wave-wave zero harmonic saturates

```tex
Q_{\mathrm{ret}}(\mathcal X^s,\mathcal X^t)
\subseteq
\mathfrak F_{\mathrm{adm}}^{s+t-2\kappa_s}.
```

The nonzero wave-wave harmonic has the same source exponent and therefore lies strictly above the required wave threshold. Lemma 9.2 gives positive slack for wave-mean interactions, distinct labels have zero products on their closed supports, and the exact mean equations in Section 8 / Proposition 9.6 give higher-order mean-mean remainders.

With \(\sigma_0=1/5\), the nonlinear difference gain is

```tex
\eta = \sigma_0 - 2\kappa_s = 0.19998.
```

## Compiler legality trace

The one-pass compiler is the finite source-legal block

1. Proposition 7.2 pulse inverse + curl for the current \(W\) source.
2. Reconstruct pressure from the complete updated velocity.
3. Corollary 8.5 stress preparation + Proposition 7.6 signed-stress correction for \(\bar M\).
4. Reconstruct pressure.
5. Lemma 8.6 zero-average mean correction for \(M^\circ\).
6. Reconstruct pressure.
7. Lemmas 8.7-8.8 compatibility correction for \(S\).
8. Reconstruct pressure and form the retained/flat residual decomposition of Proposition 9.3.

Proposition 9.3 explicitly permits finite sequences of these primitives around the fixed slow base and primary waves. Therefore a finite polynomial
\(P_A=P_0\sum_{n=0}^{N_A-1}K^n\)
does not introduce a new inverse family: it is a finite repetition of the same legal block on successively higher-grade retained sources.

For example, at target grade \(A=1\),

```tex
N_1=2,
\qquad
P_1 e = P_0 e + P_0 K e.
```

Execution is literally two legal one-pass blocks: the first produces retained linear error \(Ke\); the second applies the same fixed primitive sequence to \(Ke\). Nonlinear Picard calls to \(P_A\) expand in the same way.

## Retained / replaced / deleted

| Source architecture | SPC treatment |
| --- | --- |
| Sections 7-8 local inverse, stress, mean, and compatibility machinery | retained |
| Proposition 9.3 finite-sequence legality and exact pressure reconstruction | retained |
| Proposition 9.6 repeated chronological \(+0.1\) clock | replaced |
| Stage genealogy \(j\mapsto j+1\) as the driver of accuracy | replaced by requested filtration depth |
| Lemmas 9.7-9.8 common-domain / physical-derivative interfaces | retained |
| Proposition 9.9 / Lemma 5.4 final realization interface | retained |
| Flat pulse/cutoff remainders | retained outside the finite-order compiler |
