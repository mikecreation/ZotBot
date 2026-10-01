# The Not-So-Hard Problem of Consciousness

## Defining the System Before Explaining Experience

**Author:** Michael Zot  
**Status:** theoretical / methodological manuscript, awaiting publication  
**Repository:** https://github.com/mikecreation/ZotBot/tree/main/research/not-so-hard-problem-of-consciousness

This repository contains the manuscript, complete LaTeX source, empirical test specifications, falsifiers, reviewer-facing clarifications, social-post copy, and explainer-video materials for the **Systemic Continuity Theory of Consciousness (SCTC)**.

**[Read the paper PDF](https://github.com/mikecreation/ZotBot/blob/main/research/not-so-hard-problem-of-consciousness/paper/The-Not-So-Hard-Problem-of-Consciousness_SCTC-v4.pdf)** · **[Watch/download the 51-second explainer](https://github.com/mikecreation/ZotBot/raw/refs/heads/main/research/not-so-hard-problem-of-consciousness/video/SCTC-explainer.mp4)** · **[LaTeX source](paper/SCTC-v4.tex)**

> **Core proposal:** minimal system-level consciousness is defined as the continued viable existence of an integrated biological individual. Phenomenal experience, wakefulness, memory, responsiveness, reportability, self-awareness, intelligence, and other capacities are represented separately.

The point is not that experience is unimportant. The point is that **an unresolved theory of experience is not automatically an unresolved definition of the continuing system**.

---

## 1. The target problem

The word *consciousness* is routinely used for several scientifically separable variables:

- organism-level biological continuity;
- wakefulness / arousal;
- phenomenal experience;
- environmental connectedness;
- behavioral responsiveness;
- memory;
- sensory / perceptual capacity;
- cognitive access;
- self-awareness / metacognition;
- intelligence;
- reportability.

If these variables are allowed to rotate under one noun, a mechanism can appear mysterious because the dependent variable changed between experiments.

SCTC therefore fixes the system-level target first.

## 2. Primitive definition

Let `B` be a biological individual, and let `L_B(t)` indicate whether that individual still exists as a viable, integrated biological system at time `t`.

```text
C_B(t) := L_B(t)
```

In the paper:

$$C_B(t) \equiv L_B(t).$$

This is a **primitive definition within SCTC**. Anesthesia, amnesia, sensory loss, and clinical dissociations do **not** prove the definition. They show what follows once the target is fixed.

## 3. Faculty / state vector

The declared faculty vector used for the closed falsification test is:

$$\mathbf F_B^*(t)=(W,E,K,R,M,P,Q,S,I).$$

| Symbol | Variable |
|---|---|
| `W` | wakefulness / arousal |
| `E` | phenomenal experience |
| `K` | cognitive or experiential connectedness |
| `R` | behavioral responsiveness |
| `M` | memory |
| `P` | perceptual / sensory capacity |
| `Q` | cognitive access |
| `S` | self-awareness / metacognition |
| `I` | intelligence / related cognitive capacities |

The architecture is descriptive:

```text
continuing biological individual
        ↓
biological / neural architecture
        ↓
faculty-state space
        ↓
current state
```

## 4. Target-substitution error

The central firewall is:

$$F_j \not\equiv C_B \quad\Rightarrow\quad \mathrm{Unexplained}(F_j) \not\Rightarrow \mathrm{Unexplained}(C_B).$$

> **A hard question about a faculty does not become a hard question about the bearer merely because both were given the same noun.**

The anesthesia example makes this concrete:

```text
L_B = 1
R   = 0
E   = 1, 0, or unknown
```

The question *“Why did a dream occur?”* is a question about `E`. It does not become a counterexample to the system-level definition unless one first establishes the rival identity `C := E`.

## 5. What the empirical literature actually separates

The manuscript uses existing work to establish dissociations, not to pretend that the primitive definition was empirically derived.

- **Sanders et al. (2012):** separates subjective experience, responsiveness, and connectedness.
- **Noreika et al. (2011):** later subjective reports occurred in almost 60% of experimentally induced unresponsive sessions.
- **Casey et al. (2024):** evaluates EEG signatures against explicit definitions of responsiveness, connectedness, and subjective experience.
- **Bodien et al. (2024):** 60 of 241 participants without observable command responses showed task-based command following on fMRI or EEG.
- **Milner (2005):** severe amnesia illustrates that memory can be selectively devastated while the individual continues.

The recurring structure is that evidence about one coordinate cannot simply be imported into another.

## 6. The hard problem after decomposition

SCTC does **not** claim to explain phenomenal experience.

Under its notation, the classic Chalmers-style problem becomes:

$$\text{Which physical organizations instantiate }E\text{, and why?}$$

That can remain an extremely difficult problem. The narrower SCTC claim is that this unresolved problem of `E` does not automatically determine the definition of `C`.

## 7. Support is not identity

A mechanism may be necessary for maintaining a system without being identical to the system-level category.

Examples:

- a heart can be necessary for circulation without being the organism;
- brainstem function can be necessary for unsupported respiration without being the individual;
- neural circuitry can be necessary for memory, wakefulness, or report without being identical to the continuing biological individual.

Replacement and rescue therefore test implementation and continuity, not whether a particular component *is* consciousness.

## 8. Biological individuality is an explicit dependency

SCTC does not pretend that biology has solved every individuality boundary.

Where biology can identify one integrated, relatively autonomous biological individual, SCTC inherits that classification. Where individuality itself is genuinely indeterminate, SCTC inherits the indeterminacy.

This is especially important for brain-death / intensive-support boundary cases.

## 9. Named rivals

The paper does not allow rival definitions to enter silently.

### Experience-centered assignment

$$\mathcal R_E: C := E$$

### SCTC assignment

$$\mathcal R_\Gamma: C := L_B$$

### Capacity-transition assignment

$$\mathcal R_T: C := T$$

where `T` is a proposed transition marker, such as Unlimited Associative Learning (UAL).

These are competing target assignments and should be compared explicitly rather than swapped mid-argument.

## 10. Direct comparative experiment

Three randomized vocabularies are proposed:

1. **Arm U:** ordinary umbrella language.
2. **Arm E:** decomposed vocabulary with `consciousness := E`.
3. **Arm Γ:** decomposed vocabulary with `consciousness := L_B` and experience represented separately as `E`.

All arms answer the same forced outputs:

- individual status: same / ended / indeterminate;
- phenomenal experience: present / absent / unknown;
- responsiveness: present / absent / unknown;
- connectedness: present / absent / unknown.

`Unknown` is not scored as a reclassification.

The distinctive SCTC prediction is conjunctive:

$$V_\Gamma < V_E \quad\land\quad \mathrm{Err}_E(\Gamma)-\mathrm{Err}_E(E)\leq\varepsilon_E.$$

SCTC only earns the vocabulary change if it reduces unsupported system-level reclassification **without making phenomenal-state judgments worse**.

## 11. Closed-inventory system-level discontinuity test

The faculty inventory is frozen in advance:

$$\mathbf F_B^*=(W,E,K,R,M,P,Q,S,I).$$

A new candidate system-level variable `Z` counts against SCTC only if it:

1. changes while `L_B = 1`;
2. is not reducible to the preregistered faculty inventory or measurement availability;
3. adds independent predictive or interventional information after those variables are controlled;
4. survives across at least two preregistered paradigms with outcomes and reduction criteria fixed in advance.

If such a variable is required to recover what science intends by *consciousness*, then `C := L_B` is insufficient.

## 12. Explicit failure conditions

SCTC should be abandoned or revised if:

- the direct target-assignment experiment favors `C := E` or another rival;
- an independent preregistered system-level variable survives the discontinuity test;
- biological individuality cannot be operationalized reliably enough for the intended domain;
- the biological substrate restriction fails because a nonbiological system satisfies the deeper organizational criterion the theory actually requires.

## 13. Non-entailments

Under SCTC:

$$C_B=1 \not\Rightarrow E=1.$$

Minimal system-level consciousness does **not** by itself imply pain, sentience, interests, personhood, moral status, legal status, memory, intelligence, or self-awareness. Those require their own evidence or normative arguments.

## 14. Repository map

```text
paper/
  The-Not-So-Hard-Problem-of-Consciousness_SCTC-v4.pdf
  SCTC-v4.tex

docs/
  THEORY.md
  EXPERIMENTS.md
  FAQ.md
  REFERENCES.md

post/
  X_POST.md
  FIRST_REPLY.md

video/
  SCTC-explainer.mp4
  VIDEO_SCRIPT.md
  build_video.py

README.md
CITATION.cff
```

## 15. Build the paper

```bash
cd paper
pdflatex SCTC-v4.tex
pdflatex SCTC-v4.tex
```

The manuscript uses common LaTeX packages including `newtxtext`, `newtxmath`, `amsmath`, `booktabs`, `tabularx`, `tikz`, `hyperref`, `fancyhdr`, and `microtype`.

## 16. Research status

This is a theoretical and methodological proposal. It reports no new human or animal experiment and is not clinical, legal, or ethical guidance. The central definition is revisionary and is evaluated by coherence, comparative scientific utility, and the explicit failure conditions above.

---

> **Before asking how consciousness is produced, fix what the word is allowed to mean.**
