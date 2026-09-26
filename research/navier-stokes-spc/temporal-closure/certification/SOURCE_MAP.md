# Source Map for the Temporal Closure Certificate

Baseline repository: `openai/NavierStokesAndEuler`  
Pinned commit: `f9e8bc5b38b6e212696e8a30e3e91517af887bbd`

This map names the public baseline objects reused by the new module.

## `NavierStokes/WeightedClasses.lean`

### `MeanClass`

The baseline defines:

```lean
abbrev MeanClass (s : StripData D) (α : ℝ) (f : ℕ → D → E) : Prop :=
  MemClass s (fun _ x => s.zeta x) α f
```

### `MemClass.mono_exponent`

The baseline proves:

```lean
theorem mono_exponent (hf : MemClass s w α f) (hβα : β ≤ α) :
    MemClass s w β f := by
  ...
```

This is the theorem used to lower the radial all-order result from `A+1` to `A`.

Public pinned source:
https://github.com/openai/NavierStokesAndEuler/blob/f9e8bc5b38b6e212696e8a30e3e91517af887bbd/NavierStokes/WeightedClasses.lean

## `NavierStokes/VariableGaugeMean.lean`

### `temporalIncrementState`

The baseline defines the temporal mean increment. Its radial branch is built through `streamBeta` and the temporal potential; its angular branch is the temporal inverse of the theta residual; its axial branch is built through `streamGamma` and the temporal potential.

### Existing one-state estimate

The same file already contains:

- `temporalIncrementState_classes`

which provides the one-state transfer `α -> (α+1, α, α)`.

### Existing component estimates reused by the new proof

- `meanClass_scaledTemporalStreamBeta`
- `meanClass_temporalAtIndex_moving`
- `meanClass_temporalStreamGamma`

The new proof does not re-prove their analytic filtration bounds. It proves subtraction/admissibility bridges and applies these existing estimates to the difference source.

Public pinned source:
https://github.com/openai/NavierStokesAndEuler/blob/f9e8bc5b38b6e212696e8a30e3e91517af887bbd/NavierStokes/VariableGaugeMean.lean

## `NavierStokes/MeanChartCompatibility.lean`

The new proof uses the baseline temporal reconstruction/Fourier machinery and supplies exact subtraction lemmas needed to transport two-state differences through that machinery.

Public pinned source:
https://github.com/openai/NavierStokesAndEuler/blob/f9e8bc5b38b6e212696e8a30e3e91517af887bbd/NavierStokes/MeanChartCompatibility.lean

## New public module

`certification/PandoraTemporalFlat.lean` imports:

```lean
import NavierStokes.MeanChartCompatibility
import NavierStokes.VariableGaugeMean
```

It adds subtraction bridges for the temporal reconstruction and the two public target theorems:

- `NavierStokes.VariableGaugeMean.temporalIncrementState_difference_classes`
- `NavierStokes.VariableGaugeMean.temporalIncrementState_flat_classes`

## Proof architecture

1. Fourier-family inverse subtraction (`familyInverse_sub`).
2. Temporal-at-index subtraction (`temporalAtIndex_sub`).
3. Stream-potential subtraction (`streamPotential_sub`).
4. Moving-fiber transport (`temporalAtIndex_sub_on`, `temporalPotential_sub_on`).
5. Existing `MeanClass` estimates applied to the difference source.
6. `mono_exponent` to obtain the radial all-order downgrade.

The key source-level distinction is that the new result is a congruence/closure theorem built from existing analytic estimates plus exact subtraction/fiber-locality plumbing.
