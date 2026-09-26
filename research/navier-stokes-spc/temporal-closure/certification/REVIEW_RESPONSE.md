# Reviewer Concern -> Public Fix Crosswalk

This package was revised after an external review correctly distinguished a recorded certification from a publicly reproducible certification.

| Concern | Fix |
| --- | --- |
| The load-bearing `.lean` module was not public. | Published the exact 598-line `certification/PandoraTemporalFlat.lean`. |
| SHA-256 could not be checked. | Published `certification/SHA256SUMS.txt` and the expected proof hash in README/reproduction docs. |
| Build success was self-reported in prose. | Published the recorded build result, raw verification-session transcript, independent reproduction procedure, and public CI verifier. |
| `#print axioms` was only described. | Published the recorded axiom audit and configured CI to commit its raw `#print axioms` / `#check` output after a successful rerun. |
| The baseline OpenAI theorem already carried the one-state exponent transfer. | Added `THEOREM_DELTA.md` and revised the paper to state that the new result is a two-state congruence/all-order closure, not a new analytic gain. |
| The moving-domain step could hide the real proof risk. | Expanded the paper and `SOURCE_MAP.md` to identify the moving-fiber/fixed-geometry hypotheses and local-point positivity obligations. |
| "157 modules" could be mistaken for repository size. | Reworded it as the **project-side import closure of the target module**. |
| "Machine-certified" should be independently rebuildable. | Added `REPRODUCE.md`, `scripts/reproduce.sh`, and a public CI verifier that publishes its logs after success. |
| Scope could be read as full quotient closure. | Strengthened the explicit non-claim boundary in the paper, README, and `CLAIM_BOUNDARY.md`. |

The review did not identify a counterexample to the theorem or an invalid all-order step. Its principal reproducibility criticism was that the exact proof artifact was not public. This directory addresses that failure directly.
