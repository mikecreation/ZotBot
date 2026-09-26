import NavierStokes.MeanChartCompatibility
import NavierStokes.VariableGaugeMean

/-!
# Subtraction for the temporal reconstruction, and the flat temporal step

`commonTemporalFields_sub` certifies componentwise subtraction for the fixed
geometry temporal reconstruction. `temporalIncrementState_difference_classes`
certifies the temporal difference bridge at one exponent `α` and
`temporalIncrementState_flat_classes` its all-exponent corollary (radial
`A + 1` downgraded via `mono_exponent`).  Status: source proof only — the
Lean toolchain and `.olean` artifacts are absent; nothing is certified.
-/

noncomputable section

namespace NavierStokes.MeanChartCompatibility

open scoped ContDiff

private theorem familyInverse_sub
    {P : Type} [NormedAddCommGroup P] [NormedSpace ℝ P]
    (d : TorusInverse.Direction) {f g : SmoothFamilyTorusInverse.Source P}
    (hf : ContDiff ℝ ∞ f) (hg : ContDiff ℝ ∞ g)
    (hpf : SmoothFamilyTorusInverse.Periodic f)
    (hpg : SmoothFamilyTorusInverse.Periodic g)
    (z : SmoothFamilyTorusInverse.Point P) :
    SmoothFamilyTorusInverse.inverse d (fun x => f x - g x) z =
      SmoothFamilyTorusInverse.inverse d f z - SmoothFamilyTorusInverse.inverse d g z := by
  let C := SmoothFamilyTorusInverse.coefficient (P := P)
  have hc (p : P) (k : TorusInverse.Frequency) :
      C (fun x => f x - g x) p k = C f p k - C g p k := by
    have he : SmoothFamilyTorusInverse.slice (fun x => f x - g x) p =
        fun x => SmoothFamilyTorusInverse.slice f p x +
          (-1 : ℂ) * SmoothFamilyTorusInverse.slice g p x := by
      funext x
      simp only [SmoothFamilyTorusInverse.slice, neg_one_mul, sub_eq_add_neg]
    change SmoothFourierData.coefficient
      (SmoothFamilyTorusInverse.slice (fun x => f x - g x) p) k =
        SmoothFourierData.coefficient (SmoothFamilyTorusInverse.slice f p) k -
          SmoothFourierData.coefficient (SmoothFamilyTorusInverse.slice g p) k
    rw [he, TemporalMeanUpdate.coefficient_add
      (SmoothFamilyTorusInverse.slice_smooth hf p)
      (contDiff_const.mul (SmoothFamilyTorusInverse.slice_smooth hg p)),
      TemporalMeanUpdate.coefficient_const_mul]
    simp only [neg_one_mul, sub_eq_add_neg]
  have hsf := TorusInverse.summable_terms
    ((SmoothFourierData.rapid_coefficient
      (SmoothFamilyTorusInverse.slice_smooth hf z.1) (hpf z.1)).inverseCoeff d) z.2
  have hsg := TorusInverse.summable_terms
    ((SmoothFourierData.rapid_coefficient
      (SmoothFamilyTorusInverse.slice_smooth hg z.1) (hpg z.1)).inverseCoeff d) z.2
  change TorusInverse.directionalInverse d (C (fun x => f x - g x) z.1) z.2 =
    TorusInverse.directionalInverse d (C f z.1) z.2 -
      TorusInverse.directionalInverse d (C g z.1) z.2
  simp only [TorusInverse.directionalInverse, TorusInverse.series,
    TorusInverse.inverseCoeff, hc, mul_sub, sub_mul]
  exact hsf.tsum_sub hsg

private theorem temporalAtIndex_sub
    {S : Type} [NormedAddCommGroup S] [NormedSpace ℝ S]
    (h : ℝ) (n i : ℕ) {f g : PressureStream.Lift S → ℝ}
    (hf : ContDiff ℝ ∞ f) (hg : ContDiff ℝ ∞ g)
    (hpf : PressureStream.TorusPeriodicLift f)
    (hpg : PressureStream.TorusPeriodicLift g) :
    temporalAtIndex h n i (fun z => f z - g z) =
      fun z => temporalAtIndex h n i f z - temporalAtIndex h n i g z := by
  have hc : TemporalMeanUpdate.centered (fun z => f z - g z) =
      fun z => TemporalMeanUpdate.centered f z - TemporalMeanUpdate.centered g z := by
    funext z
    simp only [TemporalMeanUpdate.centered,
      PressureStream.torusAverage_sub hf.continuous hg.continuous]
    ring
  have hs : TemporalMeanUpdate.sourceToFamily
      (TemporalMeanUpdate.centered (fun z => f z - g z)) =
      fun z => TemporalMeanUpdate.sourceToFamily (TemporalMeanUpdate.centered f) z -
        TemporalMeanUpdate.sourceToFamily (TemporalMeanUpdate.centered g) z := by
    rw [hc]
    funext z
    simp only [TemporalMeanUpdate.sourceToFamily, Complex.ofReal_sub]
  funext z
  simp only [temporalAtIndex, TemporalMeanUpdate.temporalInverse]
  rw [hs, familyInverse_sub .temporal
    (TemporalMeanUpdate.sourceToFamily_smooth (TemporalMeanUpdate.centered_smooth hf))
    (TemporalMeanUpdate.sourceToFamily_smooth (TemporalMeanUpdate.centered_smooth hg))
    (TemporalMeanUpdate.sourceToFamily_periodic (TemporalMeanUpdate.centered_periodic hpf))
    (TemporalMeanUpdate.sourceToFamily_periodic (TemporalMeanUpdate.centered_periodic hpg))]
  simp only [Complex.sub_re, mul_sub]

private theorem streamPotential_sub
    {E : Type} [NormedAddCommGroup E] [NormedSpace ℝ E]
    {d a b M : ℝ} (ha : 0 < a) (hab : a < b) (hd : 0 < d)
    (v : E) {f g : ℝ × E → ℝ} (hf : ContDiff ℝ ∞ f) (hg : ContDiff ℝ ∞ g)
    (hsf : RadialAlias.RadiallySupported a b f)
    (hsg : RadialAlias.RadiallySupported a b g) :
    PressureStream.streamPotential d a b M v (fun z => f z - g z) =
      fun z => PressureStream.streamPotential d a b M v f z -
        PressureStream.streamPotential d a b M v g z := by
  have hnf := (RadialPullback.normalizeSource_contDiff ha hd
    (PressureStream.weightedSource_contDiff hf)).continuous
  have hng := (RadialPullback.normalizeSource_contDiff ha hd
    (PressureStream.weightedSource_contDiff hg)).continuous
  have hsf' := RadialPullback.normalizeSource_supported ha hab hd
    (PressureStream.weightedSource_supported hsf)
  have hsg' := RadialPullback.normalizeSource_supported ha hab hd
    (PressureStream.weightedSource_supported hsg)
  have hn : RadialPullback.normalizeSource d a
      (PressureStream.weightedSource (fun z => f z - g z)) =
      fun z => RadialPullback.normalizeSource d a (PressureStream.weightedSource f) z -
        RadialPullback.normalizeSource d a (PressureStream.weightedSource g) z := by
    funext z
    simp only [RadialPullback.normalizeSource, PressureStream.weightedSource,
      mul_sub, smul_sub]
  funext z
  let q := RadialPullback.liftChart (RadialPullback.powerChart d a) z
  have hiF := TransportPrimitive.shifted_integrable (M := M) (v := v) hnf hsf' q
  have hiG := TransportPrimitive.shifted_integrable (M := M) (v := v) hng hsg' q
  simp only [PressureStream.streamPotential, PressureStream.divideRadius,
    RadialPullback.physicalCompact, RadialPullback.pullback, Function.comp_apply,
    hn, TransportPrimitive.compactIntegral, TransportPrimitive.pastIntegral,
    TransportPrimitive.totalIntegral]
  rw [MeasureTheory.integral_sub hiF.integrableOn hiG.integrableOn,
    MeasureTheory.integral_sub hiF hiG]
  simp only [smul_eq_mul]
  ring

/-- Componentwise subtraction on smooth periodic sources with supported axial
sources. All reconstruction parameters are shared by the two inputs. -/
theorem commonTemporalFields_sub
    {S : Type} [NormedAddCommGroup S] [NormedSpace ℝ S] [FiniteDimensional ℝ S]
    (r : ℕ → CorrectionState.ReconstructionData)
    (h : ℝ) (index : ℕ → ℕ) (epsilon : ℕ → ℝ) (axial : S × PressureStream.Plane)
    (fθ₁ fz₁ fθ₂ fz₂ : ℕ → PressureStream.Lift S → ℝ)
    (ha : ∀ n, 0 < (r n).inner) (hd : ∀ n, 0 < (r n).exponent)
    (hθ₁ : ∀ n, ContDiff ℝ ∞ (fθ₁ n)) (hθ₂ : ∀ n, ContDiff ℝ ∞ (fθ₂ n))
    (hz₁ : ∀ n, ContDiff ℝ ∞ (fz₁ n)) (hz₂ : ∀ n, ContDiff ℝ ∞ (fz₂ n))
    (hpθ₁ : ∀ n, PressureStream.TorusPeriodicLift (fθ₁ n))
    (hpθ₂ : ∀ n, PressureStream.TorusPeriodicLift (fθ₂ n))
    (hpz₁ : ∀ n, PressureStream.TorusPeriodicLift (fz₁ n))
    (hpz₂ : ∀ n, PressureStream.TorusPeriodicLift (fz₂ n))
    (hsz₁ : ∀ n, RadialAlias.RadiallySupported (r n).inner (r n).outer (fz₁ n))
    (hsz₂ : ∀ n, RadialAlias.RadiallySupported (r n).inner (r n).outer (fz₂ n)) :
    (∀ n z,
      (commonTemporalFields r h index epsilon axial fθ₁ fz₁).radial n z -
      (commonTemporalFields r h index epsilon axial fθ₂ fz₂).radial n z =
      (commonTemporalFields r h index epsilon axial
        (fun n z => fθ₁ n z - fθ₂ n z) (fun n z => fz₁ n z - fz₂ n z)).radial n z) ∧
    (∀ n z,
      (commonTemporalFields r h index epsilon axial fθ₁ fz₁).angular n z -
      (commonTemporalFields r h index epsilon axial fθ₂ fz₂).angular n z =
      (commonTemporalFields r h index epsilon axial
        (fun n z => fθ₁ n z - fθ₂ n z) (fun n z => fz₁ n z - fz₂ n z)).angular n z) ∧
    (∀ n z,
      (commonTemporalFields r h index epsilon axial fθ₁ fz₁).axial n z -
      (commonTemporalFields r h index epsilon axial fθ₂ fz₂).axial n z =
      (commonTemporalFields r h index epsilon axial
        (fun n z => fθ₁ n z - fθ₂ n z) (fun n z => fz₁ n z - fz₂ n z)).axial n z) := by
  have hpot (n : ℕ) :
      commonTemporalPotential r h index (fun n z => fz₁ n z - fz₂ n z) n =
        fun z => commonTemporalPotential r h index fz₁ n z -
          commonTemporalPotential r h index fz₂ n z := by
    simp only [commonTemporalPotential,
      temporalAtIndex_sub h n (index n) (hz₁ n) (hz₂ n) (hpz₁ n) (hpz₂ n)]
    exact streamPotential_sub (ha n) (r n).inner_lt_outer (hd n) _
      (temporalAtIndex_smooth h n (index n) (hz₁ n) (hpz₁ n))
      (temporalAtIndex_smooth h n (index n) (hz₂ n) (hpz₂ n))
      (temporalAtIndex_supported h n (index n) (hsz₁ n))
      (temporalAtIndex_supported h n (index n) (hsz₂ n))
  have hd₁ (n : ℕ) := (commonTemporalPotential_smooth r h index fz₁ n
    (ha n) (hd n) (hz₁ n) (hpz₁ n) (hsz₁ n)).differentiable (by simp)
  have hd₂ (n : ℕ) := (commonTemporalPotential_smooth r h index fz₂ n
    (ha n) (hd n) (hz₂ n) (hpz₂ n) (hsz₂ n)).differentiable (by simp)
  refine ⟨?_, ?_, ?_⟩
  · intro n z
    simp only [commonTemporalFields, hpot n, PressureStream.streamBeta,
      PressureStream.graphDz, fderiv_fun_sub (hd₁ n z) (hd₂ n z),
      ContinuousLinearMap.sub_apply]
    ring
  · intro n z
    exact (congrFun
      (temporalAtIndex_sub h n (index n) (hθ₁ n) (hθ₂ n) (hpθ₁ n) (hpθ₂ n)) z).symm
  · intro n z
    simp only [commonTemporalFields, hpot n, PressureStream.streamGamma,
      PressureStream.graphDr, PressureStream.divideRadius,
      fderiv_fun_sub (hd₁ n z) (hd₂ n z), ContinuousLinearMap.sub_apply]
    ring

end NavierStokes.MeanChartCompatibility

namespace NavierStokes.VariableGaugeMean

open scoped ContDiff Topology
open LocalSignedRequest WeightedClasses

/-!
## Subtraction on the admissible (moving) class

Mirrors `meanPressure_sub_on`: freeze the slow variable, subtract globally on
the frozen fibers with the fixed-endpoint lemmas, and return with the
fiber-locality of the moving operators.  Only smoothness, periodicity and
gauge support of the two sources are used.
-/

private theorem periodicOn_sub {S : Type} [NormedAddCommGroup S] [NormedSpace ℝ S]
    {U : Set S} {f g : PressureStream.Lift S → ℝ}
    (hf : PhysicalMeanDomain.PeriodicOn U f) (hg : PhysicalMeanDomain.PeriodicOn U g) :
    PhysicalMeanDomain.PeriodicOn U (fun z => f z - g z) := by
  intro r s hs Y k
  exact congrArg₂ (fun a b : ℝ => a - b) (hf r s hs Y k) (hg r s hs Y k)

private theorem temporalAtIndex_sub_on
    {S : Type} [NormedAddCommGroup S] [NormedSpace ℝ S] [FiniteDimensional ℝ S]
    (h : ℝ) (n i : ℕ) {U : Set S} (hU : IsOpen U) {f g : PressureStream.Lift S → ℝ}
    (hf : ContDiffOn ℝ ∞ f (PhysicalMeanDomain.slowDomain U))
    (hg : ContDiffOn ℝ ∞ g (PhysicalMeanDomain.slowDomain U))
    (hpf : PhysicalMeanDomain.PeriodicOn U f) (hpg : PhysicalMeanDomain.PeriodicOn U g)
    {z : PressureStream.Lift S} (hz : z.2.1 ∈ U) :
    MeanChartCompatibility.temporalAtIndex h n i (fun p => f p - g p) z =
      MeanChartCompatibility.temporalAtIndex h n i f z -
        MeanChartCompatibility.temporalAtIndex h n i g z := by
  let F := PhysicalMeanDomain.freezeSlow z.2.1 f
  let G := PhysicalMeanDomain.freezeSlow z.2.1 g
  have hF : ContDiff ℝ ∞ F := freezeSlow_contDiff hU hz hf
  have hG : ContDiff ℝ ∞ G := freezeSlow_contDiff hU hz hg
  have hFP : PressureStream.TorusPeriodicLift F := by
    intro r s Y k
    exact hpf r z.2.1 hz Y k
  have hGP : PressureStream.TorusPeriodicLift G := by
    intro r s Y k
    exact hpg r z.2.1 hz Y k
  have hsub := congrFun (MeanChartCompatibility.temporalAtIndex_sub h n i hF hG hFP hGP) z
  have hFval := temporalAtIndex_fiberLocal h n i F f z.2.1 (fun _ _ => rfl) z.1 z.2.2
  have hGval := temporalAtIndex_fiberLocal h n i G g z.2.1 (fun _ _ => rfl) z.1 z.2.2
  rw [← temporalAtIndex_fiberLocal h n i (fun p => F p - G p) (fun p => f p - g p)
      z.2.1 (fun _ _ => rfl) z.1 z.2.2,
    hsub, hFval, hGval]

private theorem temporalPotential_sub_on
    {S : Type} [NormedAddCommGroup S] [NormedSpace ℝ S] [FiniteDimensional ℝ S]
    {a b d M : ℝ} (ha : 0 < a) (hab : a < b) (hd : 0 < d)
    (ell : S → ℝ) (v : PressureStream.Plane) {U : Set S} (hU : IsOpen U)
    (h : ℝ) (n i : ℕ) {f g : PressureStream.Lift S → ℝ}
    (hf : ContDiffOn ℝ ∞ f (PhysicalMeanDomain.slowDomain U))
    (hg : ContDiffOn ℝ ∞ g (PhysicalMeanDomain.slowDomain U))
    (hpf : PhysicalMeanDomain.PeriodicOn U f) (hpg : PhysicalMeanDomain.PeriodicOn U g)
    (hsf : SupportedGauge a b ell U f) (hsg : SupportedGauge a b ell U g)
    {z : PressureStream.Lift S} (hz : z.2.1 ∈ U) (hl : 0 < ell z.2.1) :
    streamPotential d a b M ell v
        (MeanChartCompatibility.temporalAtIndex h n i (fun p => f p - g p)) z =
      streamPotential d a b M ell v (MeanChartCompatibility.temporalAtIndex h n i f) z -
        streamPotential d a b M ell v (MeanChartCompatibility.temporalAtIndex h n i g) z := by
  let F := PhysicalMeanDomain.freezeSlow z.2.1 f
  let G := PhysicalMeanDomain.freezeSlow z.2.1 g
  have hF : ContDiff ℝ ∞ F := freezeSlow_contDiff hU hz hf
  have hG : ContDiff ℝ ∞ G := freezeSlow_contDiff hU hz hg
  have hFP : PressureStream.TorusPeriodicLift F := by
    intro r s Y k
    exact hpf r z.2.1 hz Y k
  have hGP : PressureStream.TorusPeriodicLift G := by
    intro r s Y k
    exact hpg r z.2.1 hz Y k
  have hsF : RadialAlias.RadiallySupported (ell z.2.1 * a) (ell z.2.1 * b) F :=
    fun p hp => hsf (p.1, (z.2.1, p.2.2)) hz hp
  have hsG : RadialAlias.RadiallySupported (ell z.2.1 * a) (ell z.2.1 * b) G :=
    fun p hp => hsg (p.1, (z.2.1, p.2.2)) hz hp
  have hTA := MeanChartCompatibility.temporalAtIndex_sub h n i hF hG hFP hGP
  have hsTA₁ : RadialAlias.RadiallySupported (ell z.2.1 * a) (ell z.2.1 * b)
      (MeanChartCompatibility.temporalAtIndex h n i F) :=
    MeanChartCompatibility.temporalAtIndex_supported h n i hsF
  have hsTA₂ : RadialAlias.RadiallySupported (ell z.2.1 * a) (ell z.2.1 * b)
      (MeanChartCompatibility.temporalAtIndex h n i G) :=
    MeanChartCompatibility.temporalAtIndex_supported h n i hsG
  have hsp := congrFun (MeanChartCompatibility.streamPotential_sub
      (a := ell z.2.1 * a) (b := ell z.2.1 * b) (d := d) (M := M)
      (mul_pos hl ha) (mul_lt_mul_of_pos_left hab hl) hd ((0 : S), v)
      (MeanChartCompatibility.temporalAtIndex_smooth h n i hF hFP)
      (MeanChartCompatibility.temporalAtIndex_smooth h n i hG hGP) hsTA₁ hsTA₂) z
  have hFval := PhysicalMeanDomain.streamPotential_fiberLocal d (ell z.2.1 * a) (ell z.2.1 * b)
      M v (MeanChartCompatibility.temporalAtIndex h n i F)
      (MeanChartCompatibility.temporalAtIndex h n i f) z.2.1
      (fun r Y => temporalAtIndex_fiberLocal h n i F f z.2.1 (fun _ _ => rfl) r Y) z.1 z.2.2
  have hGval := PhysicalMeanDomain.streamPotential_fiberLocal d (ell z.2.1 * a) (ell z.2.1 * b)
      M v (MeanChartCompatibility.temporalAtIndex h n i G)
      (MeanChartCompatibility.temporalAtIndex h n i g) z.2.1
      (fun r Y => temporalAtIndex_fiberLocal h n i G g z.2.1 (fun _ _ => rfl) r Y) z.1 z.2.2
  have heD : ∀ r Y, (fun p => MeanChartCompatibility.temporalAtIndex h n i F p -
        MeanChartCompatibility.temporalAtIndex h n i G p) (r, (z.2.1, Y)) =
      MeanChartCompatibility.temporalAtIndex h n i (fun p => f p - g p) (r, (z.2.1, Y)) := by
    intro r Y
    exact (congrFun hTA (r, (z.2.1, Y))).symm.trans
      (temporalAtIndex_fiberLocal h n i (fun p => F p - G p) (fun p => f p - g p)
        z.2.1 (fun _ _ => rfl) r Y)
  rw [streamPotential_eq_fixed d a b M ell v
      (MeanChartCompatibility.temporalAtIndex h n i (fun p => f p - g p)) z,
    ← PhysicalMeanDomain.streamPotential_fiberLocal d (ell z.2.1 * a) (ell z.2.1 * b) M v
      (fun p => MeanChartCompatibility.temporalAtIndex h n i F p -
        MeanChartCompatibility.temporalAtIndex h n i G p)
      (MeanChartCompatibility.temporalAtIndex h n i (fun p => f p - g p)) z.2.1 heD z.1 z.2.2,
    hsp, hFval, hGval,
    ← streamPotential_eq_fixed d a b M ell v (MeanChartCompatibility.temporalAtIndex h n i f) z,
    ← streamPotential_eq_fixed d a b M ell v (MeanChartCompatibility.temporalAtIndex h n i g) z]

private theorem streamBeta_sub_apply {E : Type} [NormedAddCommGroup E] [NormedSpace ℝ E]
    {w : E} {f g : ℝ × E → ℝ} {z : ℝ × E}
    (hf : DifferentiableAt ℝ f z) (hg : DifferentiableAt ℝ g z) :
    PressureStream.streamBeta w (fun p => f p - g p) z =
      PressureStream.streamBeta w f z - PressureStream.streamBeta w g z := by
  simp only [PressureStream.streamBeta, PressureStream.graphDz,
    fderiv_fun_sub hf hg, ContinuousLinearMap.sub_apply]
  ring

private theorem streamGamma_sub_apply {E : Type} [NormedAddCommGroup E] [NormedSpace ℝ E]
    {k : ℝ → ℝ} {v : E} {f g : ℝ × E → ℝ} {z : ℝ × E}
    (hf : DifferentiableAt ℝ f z) (hg : DifferentiableAt ℝ g z) :
    PressureStream.streamGamma k v (fun p => f p - g p) z =
      PressureStream.streamGamma k v f z - PressureStream.streamGamma k v g z := by
  simp only [PressureStream.streamGamma, PressureStream.graphDr, PressureStream.divideRadius,
    fderiv_fun_sub hf hg, ContinuousLinearMap.sub_apply, sub_div, div_eq_mul_inv]
  ring

/-- The moving temporal potential of an admissible source is smooth at every
moving-strip point (the strip keeps `z.1` away from zero). -/
theorem temporalPotential_contDiffAt {coord a b d : ℝ} (U : SlowRegion coord)
    (ha : 0 < a) (hab : a < b) (hd : 0 < d)
    (h : ℝ) (n i : ℕ) (M : ℝ) (v : PressureStream.Plane) {f : Point → ℝ}
    (hf : ContDiffOn ℝ ∞ f (PhysicalMeanDomain.slowDomain U.carrier))
    (hp : PhysicalMeanDomain.PeriodicOn U.carrier f)
    (hs : SupportedGauge a b (qLength coord) U.carrier f)
    {z : Point} (hz : z.2.1 ∈ U.carrier) (hz1 : z.1 ≠ 0) :
    ContDiffAt ℝ ∞ (streamPotential d a b M (qLength coord) v
      (MeanChartCompatibility.temporalAtIndex h n i f)) z := by
  have hTA := temporalAtIndex_contDiffOn h n i U.isOpen hf hp
  have hsTA := temporalAtIndex_supportedGauge h n i hs
  have hws : ContDiffOn ℝ ∞ (PressureStream.weightedSource
      (MeanChartCompatibility.temporalAtIndex h n i f))
      (PhysicalMeanDomain.slowDomain U.carrier) :=
    contDiffOn_fst.mul hTA
  have hwsg : SupportedGauge a b (qLength coord) U.carrier
      (PressureStream.weightedSource (MeanChartCompatibility.temporalAtIndex h n i f)) :=
    fun z hz hn => hsTA z hz (right_ne_zero_of_mul hn)
  have hcp := compactPrimitive_q_contDiffOn U ha hab hd M v hws hwsg
  show ContDiffAt ℝ ∞ (fun p => (compactPrimitive d a b M (qLength coord) v
    (PressureStream.weightedSource (MeanChartCompatibility.temporalAtIndex h n i f))) p / p.1) z
  exact (hcp.contDiffAt ((PhysicalMeanDomain.slowDomain_open U.isOpen).mem_nhds hz)).div
    contDiffAt_fst hz1

/-!
## The finite-grade difference theorem
-/

section TemporalDifferenceClasses
open LocalSignedRequest WeightedClasses
variable {coord cL cR : ℝ} (U : SlowRegion coord) (g : GaugeData PressureStream.Plane)
    (ha : 0 < g.radial.inner) (hd : 0 < g.radial.exponent) (hcL : 0 < cL) (hcR : 0 < cR)
    (ε L : ℕ → ℝ) (hε : ∀ n, 0 < ε n) (hεone : ∀ n, ε n ≤ 1) (hL : ∀ n, 1 ≤ L n)
    (hell : ∀ n, g.length n = qLength coord)

include hd hell

/-- Difference of two admissible states at one arbitrary exponent `α`.  On the
difference of the residual sources in `MeanClass α`, the differences of the
temporal increments lie in `MeanClass (α + 1)` (radial) and `MeanClass α`
(angular, axial).  The analytic estimates come from
`meanClass_scaledTemporalStreamBeta`, `meanClass_temporalAtIndex_moving` and
`meanClass_temporalStreamGamma` applied to the difference sources; the
subtraction rewrites come from `temporalPotential_sub_on` and
`temporalAtIndex_sub_on`. -/
theorem temporalIncrementState_difference_classes
    {h α : ℝ} (hh : 0 ≤ h) (hscale : ∀ n, ChartScales.S n ≤ L n) (index : ℕ → ℕ) (D : ℕ)
    (hgap : ∀ n, ChartScales.nativeIndex h n ≤ index n + D)
    (axial : PressureStream.Plane × PressureStream.Plane)
    (c : CorrectionState.Context Point) (u₁ u₂ : CorrectionState.State Point)
    (heps : c.operators.epsilon = ε)
    (hθ₁ : ∀ n, ContDiffOn ℝ ∞ (u₁.thetaResidual c n) (PhysicalMeanDomain.slowDomain U.carrier))
    (hθ₂ : ∀ n, ContDiffOn ℝ ∞ (u₂.thetaResidual c n) (PhysicalMeanDomain.slowDomain U.carrier))
    (hz₁ : ∀ n, ContDiffOn ℝ ∞ (u₁.axialResidual c n) (PhysicalMeanDomain.slowDomain U.carrier))
    (hz₂ : ∀ n, ContDiffOn ℝ ∞ (u₂.axialResidual c n) (PhysicalMeanDomain.slowDomain U.carrier))
    (hpθ₁ : ∀ n, PhysicalMeanDomain.PeriodicOn U.carrier (u₁.thetaResidual c n))
    (hpθ₂ : ∀ n, PhysicalMeanDomain.PeriodicOn U.carrier (u₂.thetaResidual c n))
    (hpz₁ : ∀ n, PhysicalMeanDomain.PeriodicOn U.carrier (u₁.axialResidual c n))
    (hpz₂ : ∀ n, PhysicalMeanDomain.PeriodicOn U.carrier (u₂.axialResidual c n))
    (hsz₁ : ∀ n, SupportedGauge g.radial.inner g.radial.outer (qLength coord) U.carrier
      (u₁.axialResidual c n))
    (hsz₂ : ∀ n, SupportedGauge g.radial.inner g.radial.outer (qLength coord) U.carrier
      (u₂.axialResidual c n))
    (hcθ : MeanClass (movingStripData U g.radial.inner g.radial.outer cL cR ha hcL hcR
      ε L hε hεone hL) α (fun n z => u₁.thetaResidual c n z - u₂.thetaResidual c n z))
    (hcz : MeanClass (movingStripData U g.radial.inner g.radial.outer cL cR ha hcL hcR
      ε L hε hεone hL) α (fun n z => u₁.axialResidual c n z - u₂.axialResidual c n z)) :
    MeanClass (movingStripData U g.radial.inner g.radial.outer cL cR ha hcL hcR ε L hε hεone hL)
      (α + 1) ((temporalIncrementState g h index axial c u₁).radial -
        (temporalIncrementState g h index axial c u₂).radial) ∧
    MeanClass (movingStripData U g.radial.inner g.radial.outer cL cR ha hcL hcR ε L hε hεone hL)
      α ((temporalIncrementState g h index axial c u₁).angular -
        (temporalIncrementState g h index axial c u₂).angular) ∧
    MeanClass (movingStripData U g.radial.inner g.radial.outer cL cR ha hcL hcR ε L hε hεone hL)
      α ((temporalIncrementState g h index axial c u₁).axial -
        (temporalIncrementState g h index axial c u₂).axial) := by
  have hfθ (n : ℕ) : ContDiffOn ℝ ∞ (fun z => u₁.thetaResidual c n z - u₂.thetaResidual c n z)
      (PhysicalMeanDomain.slowDomain U.carrier) :=
    (hθ₁ n).sub (hθ₂ n)
  have hfz (n : ℕ) : ContDiffOn ℝ ∞ (fun z => u₁.axialResidual c n z - u₂.axialResidual c n z)
      (PhysicalMeanDomain.slowDomain U.carrier) :=
    (hz₁ n).sub (hz₂ n)
  have hpθ (n : ℕ) : PhysicalMeanDomain.PeriodicOn U.carrier
      (fun z => u₁.thetaResidual c n z - u₂.thetaResidual c n z) :=
    periodicOn_sub (hpθ₁ n) (hpθ₂ n)
  have hpz (n : ℕ) : PhysicalMeanDomain.PeriodicOn U.carrier
      (fun z => u₁.axialResidual c n z - u₂.axialResidual c n z) :=
    periodicOn_sub (hpz₁ n) (hpz₂ n)
  have hsz (n : ℕ) : SupportedGauge g.radial.inner g.radial.outer (qLength coord) U.carrier
      (fun z => u₁.axialResidual c n z - u₂.axialResidual c n z) :=
    SupportedGauge.sub (hsz₁ n) (hsz₂ n)
  have hB := meanClass_scaledTemporalStreamBeta U ha g.radial.inner_lt_outer hd hcL hcR
    ε L hε hεone hL hh hscale index D hgap hfz hpz hsz hcz
    g.radial.frequency (fun _ => g.radial.radialDirection) axial
  have hT := meanClass_temporalAtIndex_moving U ha hcL hcR ε L hε hεone hL
    hh hscale index D hgap hfθ hpθ hcθ
  have hG := meanClass_temporalStreamGamma U ha g.radial.inner_lt_outer hd hcL hcR
    ε L hε hεone hL hh hscale index D hgap hfz hpz hsz hcz
    g.radial.frequency (fun _ => g.radial.radialDirection)
  refine ⟨?_, ?_, ?_⟩
  · apply MeanRankUpdate.meanClass_congr_on hB
    intro n z hz
    simp only [temporalIncrementState, temporalPotential, Pi.sub_apply, hell, heps]
    have hzm := (movingStrip_domain U g.radial.inner g.radial.outer cL cR ha hcL hcR
      ε L hε hεone hL z).mp hz
    have hpos := qLength_pos U.coord_pos U.coord_lt_one (U.time_pos _ hzm.1)
    have hz1 : z.1 ≠ 0 := ne_of_gt (by
      have hp : 0 < z.1 / qLength coord z.2.1 := ha.trans hzm.2.1
      simpa only [zero_mul] using (lt_div_iff₀ hpos).mp hp)
    have hP₁ : DifferentiableAt ℝ (streamPotential g.radial.exponent g.radial.inner
        g.radial.outer (g.radial.frequency n) (qLength coord) g.radial.radialDirection
        (MeanChartCompatibility.temporalAtIndex h n (index n) (u₁.axialResidual c n))) z :=
      (temporalPotential_contDiffAt U ha g.radial.inner_lt_outer hd h n (index n)
        (g.radial.frequency n) g.radial.radialDirection (hz₁ n) (hpz₁ n) (hsz₁ n) hzm.1
        hz1).differentiableAt (by simp)
    have hP₂ : DifferentiableAt ℝ (streamPotential g.radial.exponent g.radial.inner
        g.radial.outer (g.radial.frequency n) (qLength coord) g.radial.radialDirection
        (MeanChartCompatibility.temporalAtIndex h n (index n) (u₂.axialResidual c n))) z :=
      (temporalPotential_contDiffAt U ha g.radial.inner_lt_outer hd h n (index n)
        (g.radial.frequency n) g.radial.radialDirection (hz₂ n) (hpz₂ n) (hsz₂ n) hzm.1
        hz1).differentiableAt (by simp)
    have ho : IsOpen {p : Point | p.2.1 ∈ U.carrier} :=
      U.isOpen.preimage continuous_snd.fst
    have hgerm : (fun p => streamPotential g.radial.exponent g.radial.inner g.radial.outer
            (g.radial.frequency n) (qLength coord) g.radial.radialDirection
            (MeanChartCompatibility.temporalAtIndex h n (index n) (u₁.axialResidual c n)) p -
          streamPotential g.radial.exponent g.radial.inner g.radial.outer
            (g.radial.frequency n) (qLength coord) g.radial.radialDirection
            (MeanChartCompatibility.temporalAtIndex h n (index n) (u₂.axialResidual c n)) p) =ᶠ[𝓝 z]
        streamPotential g.radial.exponent g.radial.inner g.radial.outer
          (g.radial.frequency n) (qLength coord) g.radial.radialDirection
          (MeanChartCompatibility.temporalAtIndex h n (index n)
            (fun p => u₁.axialResidual c n p - u₂.axialResidual c n p)) := by
      filter_upwards [ho.mem_nhds hzm.1] with p hp
      exact (temporalPotential_sub_on ha g.radial.inner_lt_outer hd (qLength coord)
        g.radial.radialDirection U.isOpen h n (index n) (hz₁ n) (hz₂ n) (hpz₁ n) (hpz₂ n)
        (hsz₁ n) (hsz₂ n) hp
        (qLength_pos U.coord_pos U.coord_lt_one (U.time_pos _ hp))).symm
    have hβ : PressureStream.streamBeta (ε n • axial)
        (fun p => streamPotential g.radial.exponent g.radial.inner g.radial.outer
            (g.radial.frequency n) (qLength coord) g.radial.radialDirection
            (MeanChartCompatibility.temporalAtIndex h n (index n) (u₁.axialResidual c n)) p -
          streamPotential g.radial.exponent g.radial.inner g.radial.outer
            (g.radial.frequency n) (qLength coord) g.radial.radialDirection
            (MeanChartCompatibility.temporalAtIndex h n (index n) (u₂.axialResidual c n)) p) z =
        PressureStream.streamBeta (ε n • axial)
          (streamPotential g.radial.exponent g.radial.inner g.radial.outer
            (g.radial.frequency n) (qLength coord) g.radial.radialDirection
            (MeanChartCompatibility.temporalAtIndex h n (index n)
              (fun p => u₁.axialResidual c n p - u₂.axialResidual c n p))) z := by
      simp only [PressureStream.streamBeta, PressureStream.graphDz]
      rw [hgerm.fderiv_eq]
    rw [← streamBeta_sub_apply hP₁ hP₂, hβ]
  · apply MeanRankUpdate.meanClass_congr_on hT
    intro n z hz
    simp only [temporalIncrementState, Pi.sub_apply]
    have hzm := (movingStrip_domain U g.radial.inner g.radial.outer cL cR ha hcL hcR
      ε L hε hεone hL z).mp hz
    exact (temporalAtIndex_sub_on h n (index n) U.isOpen (hθ₁ n) (hθ₂ n) (hpθ₁ n) (hpθ₂ n)
      hzm.1).symm
  · apply MeanRankUpdate.meanClass_congr_on hG
    intro n z hz
    simp only [temporalIncrementState, temporalPotential, Pi.sub_apply, hell, heps]
    have hzm := (movingStrip_domain U g.radial.inner g.radial.outer cL cR ha hcL hcR
      ε L hε hεone hL z).mp hz
    have hpos := qLength_pos U.coord_pos U.coord_lt_one (U.time_pos _ hzm.1)
    have hz1 : z.1 ≠ 0 := ne_of_gt (by
      have hp : 0 < z.1 / qLength coord z.2.1 := ha.trans hzm.2.1
      simpa only [zero_mul] using (lt_div_iff₀ hpos).mp hp)
    have hP₁ : DifferentiableAt ℝ (streamPotential g.radial.exponent g.radial.inner
        g.radial.outer (g.radial.frequency n) (qLength coord) g.radial.radialDirection
        (MeanChartCompatibility.temporalAtIndex h n (index n) (u₁.axialResidual c n))) z :=
      (temporalPotential_contDiffAt U ha g.radial.inner_lt_outer hd h n (index n)
        (g.radial.frequency n) g.radial.radialDirection (hz₁ n) (hpz₁ n) (hsz₁ n) hzm.1
        hz1).differentiableAt (by simp)
    have hP₂ : DifferentiableAt ℝ (streamPotential g.radial.exponent g.radial.inner
        g.radial.outer (g.radial.frequency n) (qLength coord) g.radial.radialDirection
        (MeanChartCompatibility.temporalAtIndex h n (index n) (u₂.axialResidual c n))) z :=
      (temporalPotential_contDiffAt U ha g.radial.inner_lt_outer hd h n (index n)
        (g.radial.frequency n) g.radial.radialDirection (hz₂ n) (hpz₂ n) (hsz₂ n) hzm.1
        hz1).differentiableAt (by simp)
    have ho : IsOpen {p : Point | p.2.1 ∈ U.carrier} :=
      U.isOpen.preimage continuous_snd.fst
    have hgerm : (fun p => streamPotential g.radial.exponent g.radial.inner g.radial.outer
            (g.radial.frequency n) (qLength coord) g.radial.radialDirection
            (MeanChartCompatibility.temporalAtIndex h n (index n) (u₁.axialResidual c n)) p -
          streamPotential g.radial.exponent g.radial.inner g.radial.outer
            (g.radial.frequency n) (qLength coord) g.radial.radialDirection
            (MeanChartCompatibility.temporalAtIndex h n (index n) (u₂.axialResidual c n)) p) =ᶠ[𝓝 z]
        streamPotential g.radial.exponent g.radial.inner g.radial.outer
          (g.radial.frequency n) (qLength coord) g.radial.radialDirection
          (MeanChartCompatibility.temporalAtIndex h n (index n)
            (fun p => u₁.axialResidual c n p - u₂.axialResidual c n p)) := by
      filter_upwards [ho.mem_nhds hzm.1] with p hp
      exact (temporalPotential_sub_on ha g.radial.inner_lt_outer hd (qLength coord)
        g.radial.radialDirection U.isOpen h n (index n) (hz₁ n) (hz₂ n) (hpz₁ n) (hpz₂ n)
        (hsz₁ n) (hsz₂ n) hp
        (qLength_pos U.coord_pos U.coord_lt_one (U.time_pos _ hp))).symm
    have hγ : PressureStream.streamGamma
        (PressureStream.physicalSpeed g.radial.exponent (g.radial.frequency n))
        ((0 : PressureStream.Plane), g.radial.radialDirection)
        (fun p => streamPotential g.radial.exponent g.radial.inner g.radial.outer
            (g.radial.frequency n) (qLength coord) g.radial.radialDirection
            (MeanChartCompatibility.temporalAtIndex h n (index n) (u₁.axialResidual c n)) p -
          streamPotential g.radial.exponent g.radial.inner g.radial.outer
            (g.radial.frequency n) (qLength coord) g.radial.radialDirection
            (MeanChartCompatibility.temporalAtIndex h n (index n) (u₂.axialResidual c n)) p) z =
        PressureStream.streamGamma
          (PressureStream.physicalSpeed g.radial.exponent (g.radial.frequency n))
          ((0 : PressureStream.Plane), g.radial.radialDirection)
          (streamPotential g.radial.exponent g.radial.inner g.radial.outer
            (g.radial.frequency n) (qLength coord) g.radial.radialDirection
            (MeanChartCompatibility.temporalAtIndex h n (index n)
              (fun p => u₁.axialResidual c n p - u₂.axialResidual c n p))) z := by
      simp only [PressureStream.streamGamma, PressureStream.graphDr,
        PressureStream.divideRadius]
      rw [hgerm.fderiv_eq]
      have hval : streamPotential g.radial.exponent g.radial.inner g.radial.outer
          (g.radial.frequency n) (qLength coord) g.radial.radialDirection
          (MeanChartCompatibility.temporalAtIndex h n (index n) (u₁.axialResidual c n)) z -
          streamPotential g.radial.exponent g.radial.inner g.radial.outer
          (g.radial.frequency n) (qLength coord) g.radial.radialDirection
          (MeanChartCompatibility.temporalAtIndex h n (index n) (u₂.axialResidual c n)) z =
          streamPotential g.radial.exponent g.radial.inner g.radial.outer
          (g.radial.frequency n) (qLength coord) g.radial.radialDirection
          (MeanChartCompatibility.temporalAtIndex h n (index n)
            (fun p => u₁.axialResidual c n p - u₂.axialResidual c n p)) z :=
        hgerm.self_of_nhds
      rw [hval]
    rw [← streamGamma_sub_apply hP₁ hP₂, hγ]

/-- Genuine all-order statement of the temporal difference step: for EVERY
exponent `A` the three temporal reconstruction differences lie in
`MeanClass A` whenever the differences of the residual sources do.  The radial
output is obtained at `A + 1` and downgraded with `mono_exponent`. -/
theorem temporalIncrementState_flat_classes
    {h : ℝ} (hh : 0 ≤ h) (hscale : ∀ n, ChartScales.S n ≤ L n) (index : ℕ → ℕ) (D : ℕ)
    (hgap : ∀ n, ChartScales.nativeIndex h n ≤ index n + D)
    (axial : PressureStream.Plane × PressureStream.Plane)
    (c : CorrectionState.Context Point) (u₁ u₂ : CorrectionState.State Point)
    (heps : c.operators.epsilon = ε)
    (hθ₁ : ∀ n, ContDiffOn ℝ ∞ (u₁.thetaResidual c n) (PhysicalMeanDomain.slowDomain U.carrier))
    (hθ₂ : ∀ n, ContDiffOn ℝ ∞ (u₂.thetaResidual c n) (PhysicalMeanDomain.slowDomain U.carrier))
    (hz₁ : ∀ n, ContDiffOn ℝ ∞ (u₁.axialResidual c n) (PhysicalMeanDomain.slowDomain U.carrier))
    (hz₂ : ∀ n, ContDiffOn ℝ ∞ (u₂.axialResidual c n) (PhysicalMeanDomain.slowDomain U.carrier))
    (hpθ₁ : ∀ n, PhysicalMeanDomain.PeriodicOn U.carrier (u₁.thetaResidual c n))
    (hpθ₂ : ∀ n, PhysicalMeanDomain.PeriodicOn U.carrier (u₂.thetaResidual c n))
    (hpz₁ : ∀ n, PhysicalMeanDomain.PeriodicOn U.carrier (u₁.axialResidual c n))
    (hpz₂ : ∀ n, PhysicalMeanDomain.PeriodicOn U.carrier (u₂.axialResidual c n))
    (hsz₁ : ∀ n, SupportedGauge g.radial.inner g.radial.outer (qLength coord) U.carrier
      (u₁.axialResidual c n))
    (hsz₂ : ∀ n, SupportedGauge g.radial.inner g.radial.outer (qLength coord) U.carrier
      (u₂.axialResidual c n))
    (hθflat : ∀ A : ℝ, MeanClass (movingStripData U g.radial.inner g.radial.outer cL cR
      ha hcL hcR ε L hε hεone hL) A (fun n z => u₁.thetaResidual c n z - u₂.thetaResidual c n z))
    (hzflat : ∀ A : ℝ, MeanClass (movingStripData U g.radial.inner g.radial.outer cL cR
      ha hcL hcR ε L hε hεone hL) A (fun n z => u₁.axialResidual c n z - u₂.axialResidual c n z)) :
    ∀ A : ℝ,
      MeanClass (movingStripData U g.radial.inner g.radial.outer cL cR ha hcL hcR ε L hε hεone hL)
        A ((temporalIncrementState g h index axial c u₁).radial -
          (temporalIncrementState g h index axial c u₂).radial) ∧
      MeanClass (movingStripData U g.radial.inner g.radial.outer cL cR ha hcL hcR ε L hε hεone hL)
        A ((temporalIncrementState g h index axial c u₁).angular -
          (temporalIncrementState g h index axial c u₂).angular) ∧
      MeanClass (movingStripData U g.radial.inner g.radial.outer cL cR ha hcL hcR ε L hε hεone hL)
        A ((temporalIncrementState g h index axial c u₁).axial -
          (temporalIncrementState g h index axial c u₂).axial) := by
  intro A
  obtain ⟨hR, hTa, hZ⟩ := temporalIncrementState_difference_classes U g ha hd hcL hcR
    ε L hε hεone hL hell hh hscale index D hgap axial c u₁ u₂ heps
    hθ₁ hθ₂ hz₁ hz₂ hpθ₁ hpθ₂ hpz₁ hpz₂ hsz₁ hsz₂ (hθflat A) (hzflat A)
  exact ⟨hR.mono_exponent (by linarith), hTa, hZ⟩

end TemporalDifferenceClasses

end NavierStokes.VariableGaugeMean
