# The Not-So-Hard Problem of Consciousness

**Author:** Michael Zot  
**Article type:** Empirically constrained theoretical and methodological paper  
**Date:** 1 October 2026  
**Repository:** https://github.com/mikecreation/ZotBot/tree/main/research/not-so-hard-problem-of-consciousness

This directory contains the current polished manuscript and editable LaTeX source for the **Systemic Continuity Theory of Consciousness (SCTC)**.

**[Read the current paper PDF](paper/The-Not-So-Hard-Problem-of-Consciousness_FINAL.pdf)** · **[LaTeX source](paper/The-Not-So-Hard-Problem-of-Consciousness_FINAL.tex)**

## Current manuscript

The current build includes:

- the revised high-contrast first page with navy-to-teal title treatment;
- a dedicated, legible abstract card;
- the canonical research-repository link on page 1;
- the footer: **SCTC | Theoretical & Methodological Paper | 1 October 2026**;
- the article classification: **Empirically constrained theoretical and methodological paper**;
- explicit separation of the continuing biological individual, changing faculties/states, and the evidence used to infer them;
- an AI-assistance statement covering manuscript formatting, language editing, LaTeX preparation, layout iteration, literature organization, and adversarial stress-testing while leaving the research questions, theoretical claims, literature interpretation, and final manuscript decisions to the author.

## Core claim

The paper separates three scientific questions that are often collapsed:

1. Does the same biological individual continue?
2. What state or faculty is present, including phenomenal experience?
3. What does the available evidence actually establish?

SCTC defines its minimal system-level target as:

```text
C_sys,B(t) := L_B(t)
```

where `L_B(t)` denotes the viable existence of the biological individual at time `t`, while organismal continuity across times is tracked separately.

Phenomenal experience, memory, wakefulness, responsiveness, cognitive access, report, and recorded evidence are treated as separate variables rather than interchangeable measures.

## Empirical basis

The manuscript evaluates the definition against published dissociations, including neural command following without observable command response, dreaming during sleep, severe memory impairment with other abilities preserved, and explicit separation of responsiveness, connectedness, experience, and instrumental evidence.

No new experimental dataset is reported. Existing studies provide the empirical constraints.

## Files

```text
paper/
  The-Not-So-Hard-Problem-of-Consciousness_FINAL.pdf
  The-Not-So-Hard-Problem-of-Consciousness_FINAL.tex

README.md
CITATION.cff
```

## Build

The PDF is rebuilt from the checked-in LaTeX source by GitHub Actions.

From the `paper/` directory:

```bash
pdflatex -interaction=nonstopmode -halt-on-error The-Not-So-Hard-Problem-of-Consciousness_FINAL.tex
pdflatex -interaction=nonstopmode -halt-on-error The-Not-So-Hard-Problem-of-Consciousness_FINAL.tex
```
