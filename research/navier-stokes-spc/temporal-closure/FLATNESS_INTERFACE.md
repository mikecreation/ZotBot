# Flatness Interface Boundary

Paper 1 and Paper 2 use two different all-order notions for two different jobs. They are deliberately **not identified here**.

## Paper 1: flat pulse/cutoff remainders

Paper 1 writes the pulse/cutoff remainder ideal as `I_flat` and keeps those tails outside the finite-order compiler state. In the pinned OpenAI formalization, the corresponding source machinery includes results such as `constructed_particular_wave_with_flat_error`, whose excluded-slot error satisfies

```text
∀ β : ℝ, UnweightedClass s β excludedSlotError
```

and the later physical-stage theorem absorbs the flat remainder into the final residual estimate.

This is the interface used by the source construction's cutoff/realization machinery.

## Paper 2: all-order MeanClass equivalence

Paper 2 defines the quotient-side all-order relation schematically by

```text
I_infinity(s) = { f | ∀ A : ℝ, MeanClass s A f }.
```

The certified temporal theorem proves preservation of this relation for differences of the theta and axial residual sources under the stated shared-geometry hypotheses.

## Why the distinction is real

In the pinned OpenAI source,

```lean
MeanClass s α f       := MemClass s (fun _ x => s.zeta x) α f
UnweightedClass s α f := MemClass s (fun _ _ => 1) α f
```

so the two predicates carry different weights. The library contains a general direction from `MeanClass` to `UnweightedClass` when `zeta ≤ 1`; the reverse direction is not a generic consequence of the definitions.

Therefore this repository does not infer

```text
I_flat = I_infinity
```

or even a blanket implication between them.

## Consequence for the SPC program

No such identification is needed for the local temporal theorem proved in Paper 2.

If a future argument wants to feed a specific Paper 1 flat pulse/cutoff tail directly into the Paper 2 `MeanClass` quotient relation, it must prove the required typed translation for that specific remainder family, including its weight/support geometry.

Until such a theorem is supplied, the two interfaces remain separate:

```text
Paper 1: flat cutoff/pulse tails -> source flat-remainder / final-realization machinery
Paper 2: all-order MeanClass differences -> operator-by-operator quotient congruence
```

This separation prevents the shared word "flat" from silently carrying a theorem that has not been proved.
