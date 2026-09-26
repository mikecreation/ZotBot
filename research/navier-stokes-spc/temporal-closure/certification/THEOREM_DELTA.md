# Theorem Delta: Existing Baseline vs. New Certified Statements

This file makes the mathematical increment explicit so that the result is not mistaken for a new one-state analytic estimate.

## Existing theorem in the pinned OpenAI baseline

At commit `f9e8bc5b38b6e212696e8a30e3e91517af887bbd`, `NavierStokes/VariableGaugeMean.lean` already contains:

```text
temporalIncrementState_classes
```

Schematically, for one admissible state `u`:

```text
MeanClass α (u.thetaResidual)
MeanClass α (u.axialResidual)
        |
        v
MeanClass (α+1) (temporalIncrementState u).radial
MeanClass α     (temporalIncrementState u).angular
MeanClass α     (temporalIncrementState u).axial
```

That is the analytic grade-transfer theorem.

## New theorem 1: two-state congruence

This package adds:

```text
NavierStokes.VariableGaugeMean.temporalIncrementState_difference_classes
```

For two admissible states `u₁,u₂` sharing the fixed reconstruction geometry/parameters, it proves schematically:

```text
MeanClass α (u₁.thetaResidual - u₂.thetaResidual)
MeanClass α (u₁.axialResidual - u₂.axialResidual)
        |
        v
MeanClass (α+1) (Δ temporal radial)
MeanClass α     (Δ temporal angular)
MeanClass α     (Δ temporal axial)
```

This is the congruence/difference statement required by the compression program.

## New theorem 2: all-order closure

This package also adds:

```text
NavierStokes.VariableGaugeMean.temporalIncrementState_flat_classes
```

with hypotheses

```text
hθflat : ∀ A : ℝ, MeanClass A (theta residual difference)
hzflat : ∀ A : ℝ, MeanClass A (axial residual difference)
```

and conclusion

```text
∀ A : ℝ,
  MeanClass A (radial temporal difference) ∧
  MeanClass A (angular temporal difference) ∧
  MeanClass A (axial temporal difference)
```

The radial branch is first obtained at `A+1` from the finite-grade theorem and then downgraded to `A` using:

```lean
hR.mono_exponent (by linarith)
```

## Why this distinction matters

A one-state estimate answers: **how regular/small is this output?**

A congruence theorem answers: **can this operator distinguish two states that a proposed compression identifies?**

The second question is the one needed to make quotient-based proof compression mathematically legitimate.
