# Direct research: cuprate superconductivity, REBCO tapes, and fusion magnets

Research date: 2026-10-08. This is a bounded research contribution, not a survey of all results available in 2026 or a claim of a newly discovered physical phenomenon. No Nemesis service, Brain worker, extension, or automation was used or changed.

## Existing coverage

At the starting main commit `9f4d034b34474a4fd559f2c536c8e4429c32c81c` (the exact commit is recorded in Git history), the graph had 450 canonical nodes and 675 discoverable records including the registry. Only the broad `physical.superconductivity` and `physical.nuclear-fusion` records matched this mission. Their existing links connect condensed-matter physics, quantum mechanics, and nuclear physics. Both broad records are explicitly legacy-unreviewed. This contribution does not replace or strengthen them, and does not alter any historical, disputed, or invalidated record.

## Candidate findings

Immutable candidate for publication: `nemesis/batches/direct-rebco-fusion-20261008-v2`. The original `direct-rebco-fusion-20261008-v1` is retained with its two independent decisions and quarantine record.

| Record | Evidence-backed contribution | Limit preserved |
|---|---|---|
| Ba-La-Cu-O onset, 1986 | Resistivity drop and tentative onset in the 30 K range | Multiphase samples; percolative interpretation, not a retroactive claim of complete bulk confirmation |
| Y-Ba-Cu-O transition, 1987 | Stable 80–93 K transition at ambient pressure in a nitrogen Dewar | Explicit attribution to NASA's secondary catalogue summary; original scan is supplementary |
| Grain-boundary orientation, 1988 | Measured misorientation dependence motivates normal and in-plane texture | No numerical ratio taken from the malformed institutional abstract |
| Textured tape substrates, 1996 | Thermomechanical biaxial texture, epitaxial buffers, and YBCO films | Abstract-only evidence; no ambiguous exponent converted into a quantitative Jc claim |
| Tricrystal experiment, 1994 | Half-flux result at 4.2 K consistent with d-wave symmetry | Consistency with a symmetry does not identify a unique pairing interaction |
| BaZrO3 additions, 2004 | In-field Jc enhancement in specified PLD films at 75.5 K | Field-dependent factors, substrate and orientation conditions; not a universal tape improvement |
| Industrial YBCO/Y2O3 wire, 2021 | Production scale and specified high-field engineering-current measurements | Selected test specimens and delivered production lengths are distinct populations |
| TFMC NINT architecture | Built 16-pancake stack-in-plate magnet using 270 km of tape | Construction demonstration does not imply unconditional quench protection |
| TFMC field test | 20.1 T peak on conductor at 40.5 kA, with reported loading and case stress | Conductor field differs from plasma-axis field; magnet test is not a power-plant demonstration |
| Internal demountable joints | Fifteen joints at 0.5–2.0 nΩ, 20 K, and fields up to 12 T | Local joint field and resistance are scoped; repeated reactor maintenance is not established |
| Intentional quench | Localized thermal damage following an open circuit at 31.5 kA | Preserved adverse result in a design deliberately not optimized for quench resiliency |
| High-field fusion pathway | Proposed coil/plasma field distinction and representative-scale qualification | A model/proposal with demonstrated components, not demonstrated net fusion electricity |

All proposed records use `reported` status and explicit `frontier:false`. Historical twentieth-century records retain their source dates; newer records use the policy's neutral `undated` era rather than asserting current frontier currency. Each record's entire representation and assertion scope are submitted for both reviews. No taxonomy placement or identity merge is inferred.

## Scientific relationships

Six individually sourced assertions, with no hard dependencies:

1. Grain-boundary orientation findings **support** the biaxial-texture design rationale. This is an explicit synthesis, not replication or a claim about historical causation.
2. Implemented NINT architecture **enabled** the TFMC high-field experiment in that apparatus.
3. Internal low-resistance joints **enabled** current transfer between the assembled TFMC pancake modules.
4. The deliberate quench **tests** passive self-protection in that NINT apparatus; its damaging result is retained.
5. The TFMC field demonstration **supports** the magnet component of the proposed high-field fusion pathway.
6. Tested industrial wire **supports** materials feasibility for that pathway, without inferring the identity of every TFMC supplier or tape lot.

## Source record and access limitations

Eight compiler-owned captures retain original HTTP bytes, reproducible extraction, exact Unicode offsets, and PDF page bounds. Full captured papers are the TFMC program author preprint, the BaZrO3 author manuscript, and the industrial wire publication supplied on an author's company site. The other captures contain narrowly used abstracts: three author-institution reproductions, one publisher-deposited Crossref abstract, and the explicitly secondary NASA catalogue summary.

Supplementary full PDFs preserve the original historical scans and the IEEE design and experimental-assessment papers. Their URL, byte count, and SHA256 are in the original v1 batch's `supplementary/index.json`; v2 reuses these unchanged originals. These are independent-review material, **not** substitutes for compiler support receipts. The scans have no extractable text layer; the design and assessment PDFs exceed the unchanged 8 MB capture bound. No invented OCR, clipping, or gate exception was used. Assertions about TFMC architecture and tests bind to the independently capturable program preprint, which reports those results. Independent reviewers receive both that source and the full companion papers to look for discrepancies.

The program preprint's historical REBCO-discovery sentence has a mismatched reference to the 1986 Bednorz paper. It is not used to establish the date or composition of the 1987 discovery. Likewise, distorted numerical typography in the IBM grain-boundary abstract and Crossref tape abstract is not silently repaired into a scientific claim.

Primary publications investigated:

- Bednorz and Müller (1986), [Possible high Tc superconductivity in the Ba-La-Cu-O system](https://doi.org/10.1007/BF01303701). Bound support: author-institution abstract; original scan retained for inspection.
- Wu et al. (1987), [Superconductivity at 93 K in a new mixed-phase Y-Ba-Cu-O compound system at ambient pressure](https://doi.org/10.1103/PhysRevLett.58.908). Bound support: explicitly secondary NASA catalogue summary; original scan retained for inspection.
- Dimos et al. (1988), [Orientation Dependence of Grain-Boundary Critical Currents in YBa2Cu3O7-delta Bicrystals](https://doi.org/10.1103/PhysRevLett.61.219). Bound support: author-institution abstract.
- Goyal et al. (1996), [High critical current density superconducting tapes by epitaxial deposition of YBa2Cu3Ox thick films on biaxially textured metals](https://doi.org/10.1063/1.117489). Bound support: publisher-deposited abstract via Crossref.
- Tsuei et al. (1994), [Pairing Symmetry and Flux Quantization in a Tricrystal Superconducting Ring of YBa2Cu3O7-delta](https://doi.org/10.1103/PhysRevLett.73.593). Bound support: author-institution abstract.
- MacManus-Driscoll et al. (2004), [Strongly enhanced current densities in superconducting coated conductors of YBa2Cu3O7-x + BaZrO3](https://doi.org/10.1038/nmat1156). Bound support: complete [author manuscript](https://arxiv.org/abs/cond-mat/0406087).
- Molodyk et al. (2021), [Development and large volume production of extremely high current density YBa2Cu3O7 superconducting wires for fusion](https://doi.org/10.1038/s41598-021-81559-z). Bound support: complete published paper.
- Hartwig et al., [The SPARC Toroidal Field Model Coil Program](https://doi.org/10.1109/TASC.2023.3332613). Bound support: complete [arXiv:2308.12301v1](https://arxiv.org/abs/2308.12301v1), distinguished from the journal version.
- Vieira et al., [Design, Fabrication, and Assembly of the SPARC Toroidal Field Model Coil](https://doi.org/10.1109/TASC.2024.3356571). Complete supplementary published paper.
- Whyte et al., [Experimental Assessment and Model Validation of the SPARC Toroidal Field Model Coil](https://doi.org/10.1109/TASC.2023.3332823). Complete supplementary published paper. Its nominal parameter table is not conflated with the program's reported achieved field.

## Questions this evidence does not settle

The cited symmetry experiment does not settle a unique microscopic cuprate pairing interaction. The conductor studies do not establish every tape lot's performance under all orientations, irradiation doses, strain histories, or lifetimes. The deliberate TFMC quench leaves an explicit need to establish resilient protection for subsequent coil designs and operating conditions. Magnet qualification does not settle plasma gain, power conversion, reactor economics, or net electricity generation. These are evidence boundaries of this batch, not claims that no later public research exists.

## Review and publication status

Both separate reviewers independently returned 17 supported and one uncertain decision on v1. The Dimos abstract omits a chemical-formula symbol that the author had restored. Its texture conclusion was supported, but the complete representation was not. The compiler blocked v1 and retained its quarantine record. V2 removes that unsupported formula completion, leaves the defective notation unresolved, and preserves all source bytes and other scientific assertions.

V2 candidate SHA256: `b3756a2919e5bae78d05500b6297f5a130d0d4c5e2b8a3b66c246651ab270dea`. Both separately launched Codex review agents inspected the complete candidate and retained sources without consulting each other's conclusions. `/root/entailment_review` and `/root/adversarial_review` each returned 18 supported decisions with all five required checks true. Exact runtime model/version metadata is unavailable and recorded as such; no provider/version identity is invented. These are model evidence reviews, not independent experimental replication or a scientific truth certificate.

The existing compiler's check and apply both passed. Application added 12 canonical nodes and 6 scientific edges; zero legacy nodes were strengthened. All 450 previous canonical nodes, 384 previous edges, and 17 graph review records remain identical. Canonical totals are now 462 nodes and 390 edges, or 687 discoverable records including registry inventory. The new records remain taxonomy-placement pending because no scientific ancestry was inferred or certified.

Validation results:

- `scripts/validate.py`: passes with fresh navigation, evidence index, source snapshots, retained captures, batch history and current canonical representations.
- `scripts/test_evidence_compiler.py`: 37 tests pass.
- `scripts/test_nemesis_exchange.py`: 33 tests pass with Python UTF-8 mode. The initial Windows-default run had four CP1252 decoding errors in test-fixture reads; the UTF-8 rerun passes without changing code.
- `scripts/test_atlas_integrity.py`: 6 tests pass after application.
- Second application: all 222 compared data and ledger files remain byte-identical, with exactly one ledger entry for v2.
- All four supplementary original PDF hashes and lengths verify; all 36 final decisions are retained under `nemesis/adjudications/`. Complete independent reports are retained beside each batch; v1's rejection and quarantine are preserved.
- Git whitespace checking uses `core.whitespace=cr-at-eol` for the compiler-generated Windows CRLF files; retained source bytes and batch inputs are protected by the repository's existing `.gitattributes`.

The dedicated branch is `codex/rebco-high-field-fusion-evidence`. Publication requires the existing GitHub integrity workflow to succeed at the exact PR head before merge. GitHub's PR and Actions records provide the authoritative CI and merge status; this report does not substitute local unit-test success for that publication check. No Nemesis runtime, transport, extension, service, or automation changes are included.
