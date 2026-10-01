# The Not-So-Hard Problem of Consciousness

**Author:** Michael Zot  
**Article type:** Empirically constrained theoretical and methodological paper  
**Date:** 1 October 2026  
**Repository:** https://github.com/mikecreation/ZotBot/tree/main/research/not-so-hard-problem-of-consciousness

This repository contains the current paper and editable LaTeX source for the **Systemic Continuity Theory of Consciousness (SCTC)**.

**[Read the current paper PDF](paper/The-Not-So-Hard-Problem-of-Consciousness_FINAL.pdf)** · **[LaTeX source](paper/The-Not-So-Hard-Problem-of-Consciousness_FINAL.tex)**

## Core claim

The paper separates three scientific questions that are often collapsed into one:

1. **Does the same biological individual continue?**
2. **What state or faculty is present, including phenomenal experience?**
3. **What does the available evidence actually establish?**

SCTC defines its minimal system-level target as:

```text
C_sys,B(t) := L_B(t)
```

where `L_B(t)` denotes the viable existence of the biological individual at time `t`, while organismal continuity across times is tracked separately.

Phenomenal experience, memory, wakefulness, responsiveness, cognitive access, report, and recorded evidence are not treated as interchangeable variables.

## Empirical basis

The paper evaluates this definition against already-published dissociations, including:

- neural command following without observable command response;
- dreaming during sleep;
- severe memory impairment with other abilities preserved;
- explicit separation of responsiveness, connectedness, experience, and instrumental evidence.

The paper does **not** report a new experimental dataset. Existing studies provide the empirical constraints.

## What the paper argues

A faculty that can fail while the biological individual continues cannot be a necessary condition of that individual's persistence.

The paper therefore distinguishes:

- the **continuing biological individual**;
- its **changing states and faculties**;
- the **signals and channels used to infer those states**.

The hard problem of why phenomenal experience occurs remains a legitimate problem about experience `E`. It does not by itself settle whether the biological individual persists.

## Files

```text
paper/
  The-Not-So-Hard-Problem-of-Consciousness_FINAL.pdf
  The-Not-So-Hard-Problem-of-Consciousness_FINAL.tex

README.md
CITATION.cff
```

## Build

From the `paper/` directory:

```bash
pdflatex -interaction=nonstopmode -halt-on-error The-Not-So-Hard-Problem-of-Consciousness_FINAL.tex
pdflatex -interaction=nonstopmode -halt-on-error The-Not-So-Hard-Problem-of-Consciousness_FINAL.tex
```

The GitHub Actions workflow rebuilds the PDF from the checked-in LaTeX source.

## Scope

This is an empirically constrained theoretical and methodological paper. Published studies provide the empirical basis; no new experimental dataset is reported. The paper makes no inference from system-level consciousness alone to pain, clinical awareness, prognosis, personhood, moral status, or legal status.
