# Reproducibility files

This directory contains the empirical files used by the paper.

## Consequence-targeted distinction search

Run:

```bash
python3 -m pip install -r ../requirements.txt
python3 ctds_benchmark.py
```

The benchmark regenerates:

- `expressible_worlds.csv`
- `ctds_controls.csv`
- `primitive_withheld_worlds.csv`
- `ctds_summary.json`

The checked-in outputs are the values reported in the manuscript.

## Evidence-ceiling experiment

`representation_ceiling_results.csv` is the 400-trial raw result table used by the evidence-ceiling section and figure. It records the hidden world, trial seed, evidence regime, simple/latent BIC values, selected representation, and fitted parameters.

## Interpretation boundary

The synthetic experiments test three separable failure modes: evidence that does not force a distinction, search that fails to select an available distinction, and a representation language that lacks the required primitive. They are controlled demonstrations of those mechanisms, not claims of autonomous rediscovery of relativity.
