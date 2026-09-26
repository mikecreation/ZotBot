# Publication Manifest

This manifest states what a skeptical reader needs to inspect or rerun the temporal-closure result without relying on prose assertions.

## Identity and authorship

- Author: **Michael Zot**
- Affiliation: **Independent Researcher**
- Contact: **mike@ZotBot.Ai**
- Public repository: `mikecreation/ZotBot`
- Project path: `research/navier-stokes-spc/temporal-closure/`

## Exact theorem artifact

- `certification/PandoraTemporalFlat.lean`
- 598 lines
- SHA-256: `13a6350607d73d101f107810986fcefbc73f5b41f308be8bf78c878f43e46c95`

Certified declarations:

- `NavierStokes.VariableGaugeMean.temporalIncrementState_difference_classes`
- `NavierStokes.VariableGaugeMean.temporalIncrementState_flat_classes`

## Baseline

- Repository: `openai/NavierStokesAndEuler`
- Commit: `f9e8bc5b38b6e212696e8a30e3e91517af887bbd`
- Lean toolchain: `leanprover/lean4:v4.34.0-rc2`

## Evidence supplied

- exact Lean source;
- SHA-256 manifest;
- recorded certification command/result;
- recorded axiom/proof-hole audit;
- full verification-session transcript;
- source map to the baseline OpenAI declarations;
- theorem-delta note distinguishing the existing one-state estimate from the new congruence/all-order result;
- independent reproduction instructions;
- executable reproduction shell script;
- public GitHub Actions verifier;
- public CI logs automatically committed after a successful independent rerun;
- paper LaTeX source and compiled PDF;
- reviewer concern-to-fix crosswalk;
- explicit claim boundary.

## What a third party should not have to trust

A third party should not need to trust the paper's wording, an AI summary, or the author's certification record. The intended highest-value check is to run the public verifier or `scripts/reproduce.sh` and inspect the resulting Lean output directly.
