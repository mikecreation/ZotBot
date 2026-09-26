# Navier-Stokes: Recovering Minimal Structure from Representation-Induced Complexity

**Author:** Michael Zot  
**Affiliation:** Independent Researcher  
**Status:** Working preprint / proposed stage-free reconstruction  
**Initial release:** 2026-09-22  
**Contact:** mike@ZotBot.Ai  
**Repository:** https://github.com/mikecreation/ZotBot/tree/main/research/navier-stokes-spc

This directory contains the Structural Path Compression (SPC) manuscript, source-addressed audit materials, and follow-on machine-certification work.

## Paper 1 - Structural Path Compression

**Navier-Stokes: Recovering Minimal Structure from Representation-Induced Complexity**

- `paper/Navier_Stokes_Representation_Induced_Complexity.pdf` - compiled preprint.
- `paper/main.tex` - LaTeX source.
- `audit/verification_checklist.md` - explicit failure tests.
- `audit/source_crosswalk.md` - source-addressed exponent/type trace, compiler legality map, and retained/replaced scope ledger.

The paper's proposed stage-free kernel is

```tex
K \mathfrak F_{\mathrm{adm}}^s \subseteq \mathfrak F_{\mathrm{adm}}^{s+\frac12-4\kappa_s}
```

and

```tex
Q_{\mathrm{ret}}(\mathcal X^s,\mathcal X^t) \subseteq \mathfrak F_{\mathrm{adm}}^{s+t-2\kappa_s}.
```

For the source value `kappa_s = 10^-5`, the linear return gain is `0.49996`; with seed grade `sigma_0 = 1/5`, the nonlinear difference gain is `0.19998`. The source crosswalk traces these claims to named propositions/lemmas in the OpenAI construction.

## Paper 2 - Machine-certified temporal congruence

**When Invisible Differences Stay Invisible: Machine-Certified All-Order Congruence for Temporal Reconstruction in a Formal Navier-Stokes Architecture**

- [`temporal-closure/`](temporal-closure/) - full public proof and reproducibility package.
- [Reproduction instructions](temporal-closure/REPRODUCE.md)
- [Exact proof source](temporal-closure/certification/PandoraTemporalFlat.lean)
- [Canonical proof checksum](temporal-closure/certification/SHA256SUMS.txt)
- [Claim boundary](temporal-closure/CLAIM_BOUNDARY.md)

This follow-on result is intentionally narrower than Paper 1. It does not claim a new temporal gain estimate. The OpenAI baseline already has the one-state estimate. The new Lean module proves the two-state congruence needed by the emerging quotient program and its genuine all-order corollary.

The exact 598-line proof, canonical SHA-256, recorded build/axiom evidence, verification-session evidence, reproduction script, public CI verifier, source crosswalk, reviewer-response crosswalk, revised paper source, and compiled PDF are published under `temporal-closure/`.

The public verifier is configured to rebuild against the pinned OpenAI commit and publish its machine-generated build/axiom logs under `temporal-closure/certification/ci/` after a successful independent GitHub Actions run.

## Source under analysis

OpenAI, *Finite Time Blowup for Navier-Stokes* (2026):  
https://cdn.openai.com/pdf/32d9f210-8b73-45e0-91bc-82a30aef8a9a/navier-stokes.pdf

Formal repository used by Paper 2:  
https://github.com/openai/NavierStokesAndEuler  
Pinned commit: `f9e8bc5b38b6e212696e8a30e3e91517af887bbd`

## AI assistance disclosure

AI systems were used as research tools for literature retrieval, source organization, adversarial proof-dependency examination, formal-proof drafting/debugging, symbolic and mathematical checking, alternative formulations, and editorial drafting. The research direction, conceptual framework, selection and interpretation of claims, acceptance or rejection of proposed arguments, and final manuscript decisions were determined by the author.

## Rights

Copyright (c) 2026 Michael Zot. No open-source or Creative Commons license has been selected. Scholarly citation and linking are encouraged.
