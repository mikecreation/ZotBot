#!/usr/bin/env bash
set -euo pipefail

BASELINE_REPO="https://github.com/openai/NavierStokesAndEuler.git"
BASELINE_COMMIT="f9e8bc5b38b6e212696e8a30e3e91517af887bbd"
EXPECTED_SHA="13a6350607d73d101f107810986fcefbc73f5b41f308be8bf78c878f43e46c95"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROOF="$PACKAGE_DIR/certification/PandoraTemporalFlat.lean"
WORKDIR="${1:-$PWD/_navier_stokes_temporal_verify}"

command -v git >/dev/null
command -v curl >/dev/null

actual_sha="$(sha256sum "$PROOF" | awk '{print $1}')"
if [[ "$actual_sha" != "$EXPECTED_SHA" ]]; then
  echo "FAIL: proof SHA mismatch"
  echo "expected: $EXPECTED_SHA"
  echo "actual:   $actual_sha"
  exit 1
fi

rm -rf "$WORKDIR"
git clone "$BASELINE_REPO" "$WORKDIR"
cd "$WORKDIR"
git checkout "$BASELINE_COMMIT"

if ! command -v elan >/dev/null 2>&1; then
  curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y
  export PATH="$HOME/.elan/bin:$PATH"
fi

cp "$PROOF" NavierStokes/PandoraTemporalFlat.lean

lake exe cache get

set -o pipefail
lake build NavierStokes.PandoraTemporalFlat 2>&1 | tee pandora-build.log
status=${PIPESTATUS[0]}
echo "TRUE_LAKE_EXIT_CODE=$status"
test "$status" -eq 0

if grep -nE '\bsorry\b|\badmit\b' NavierStokes/PandoraTemporalFlat.lean; then
  echo "FAIL: sorry/admit found"
  exit 1
fi
if grep -nE '^[[:space:]]*axiom\b' NavierStokes/PandoraTemporalFlat.lean; then
  echo "FAIL: custom axiom declaration found"
  exit 1
fi

cat > /tmp/PandoraAxioms.lean <<'LEAN'
import NavierStokes.PandoraTemporalFlat
#print axioms NavierStokes.VariableGaugeMean.temporalIncrementState_difference_classes
#print axioms NavierStokes.VariableGaugeMean.temporalIncrementState_flat_classes
#check NavierStokes.VariableGaugeMean.temporalIncrementState_difference_classes
#check NavierStokes.VariableGaugeMean.temporalIncrementState_flat_classes
LEAN

lake env lean /tmp/PandoraAxioms.lean | tee pandora-axioms.txt

grep -q 'hθflat : ∀ A : ℝ' NavierStokes/PandoraTemporalFlat.lean
grep -q 'hzflat : ∀ A : ℝ' NavierStokes/PandoraTemporalFlat.lean
grep -q 'hR.mono_exponent (by linarith)' NavierStokes/PandoraTemporalFlat.lean

echo "PASS: temporal closure module rebuilt and audited"
