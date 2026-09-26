# Independent Reproduction

This procedure rebuilds the public proof against the exact OpenAI baseline used by the certification run.

## 1. Clone the baseline

```bash
git clone https://github.com/openai/NavierStokesAndEuler.git
cd NavierStokesAndEuler
git checkout f9e8bc5b38b6e212696e8a30e3e91517af887bbd
```

The pinned repository declares:

```text
leanprover/lean4:v4.34.0-rc2
```

in `lean-toolchain`.

## 2. Install Lean/elan if needed

```bash
curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y
export PATH="$HOME/.elan/bin:$PATH"
```

## 3. Copy the proof module

From this ZotBot repository:

```bash
cp /path/to/ZotBot/research/navier-stokes-spc/temporal-closure/certification/PandoraTemporalFlat.lean \
   NavierStokes/PandoraTemporalFlat.lean
```

Verify its checksum:

```bash
sha256sum NavierStokes/PandoraTemporalFlat.lean
```

Expected:

```text
13a6350607d73d101f107810986fcefbc73f5b41f308be8bf78c878f43e46c95  NavierStokes/PandoraTemporalFlat.lean
```

## 4. Fetch the published Mathlib cache

```bash
lake exe cache get
```

The original certification run fetched 8747 cache artifacts. The exact cache count is not part of the theorem statement and may change with cache packaging; the pinned dependency revisions are what matter.

## 5. Build the target module

```bash
set -o pipefail
lake build NavierStokes.PandoraTemporalFlat 2>&1 | tee /tmp/pandora-build.log
status=${PIPESTATUS[0]}
echo "TRUE_LAKE_EXIT_CODE=$status"
test "$status" -eq 0
```

The original certification run recorded:

```text
Build completed successfully (3243 jobs).
TRUE_LAKE_EXIT_CODE=0
```

The job count is diagnostic, not a proof condition. Exit code zero is the build condition.

## 6. Audit proof holes

```bash
if grep -nE '\bsorry\b|\badmit\b' NavierStokes/PandoraTemporalFlat.lean; then
  echo "FAIL: proof hole marker found"
  exit 1
fi

if grep -nE '^[[:space:]]*axiom\b' NavierStokes/PandoraTemporalFlat.lean; then
  echo "FAIL: custom axiom declaration found"
  exit 1
fi
```

## 7. Ask Lean which axioms the target declarations use

Create `/tmp/PandoraAxioms.lean`:

```lean
import NavierStokes.PandoraTemporalFlat

#print axioms NavierStokes.VariableGaugeMean.temporalIncrementState_difference_classes
#print axioms NavierStokes.VariableGaugeMean.temporalIncrementState_flat_classes

#check NavierStokes.VariableGaugeMean.temporalIncrementState_difference_classes
#check NavierStokes.VariableGaugeMean.temporalIncrementState_flat_classes
```

Then run:

```bash
lake env lean /tmp/PandoraAxioms.lean | tee /tmp/pandora-axioms.txt
```

The original certification run reported only:

```text
propext
Classical.choice
Quot.sound
```

for both target declarations.

## 8. Verify the all-order source statement

```bash
grep -n 'hθflat : ∀ A : ℝ' NavierStokes/PandoraTemporalFlat.lean
grep -n 'hzflat : ∀ A : ℝ' NavierStokes/PandoraTemporalFlat.lean
grep -n 'hR.mono_exponent (by linarith)' NavierStokes/PandoraTemporalFlat.lean
```

This guards against accidentally reproducing the older `α = 0` draft.

## What counts as an independent pass

An independent run passes if:

1. the proof file has the expected SHA-256;
2. `lake build NavierStokes.PandoraTemporalFlat` exits 0;
3. no `sorry`/`admit`/custom `axiom` is present;
4. both target declarations are present and `#print axioms` shows no custom axioms;
5. the all-order theorem retains the `∀ A : ℝ` hypotheses/conclusion.

The public CI verifier automates the same checks and, after a successful run, commits its machine-generated build/axiom logs under `certification/ci/`.
