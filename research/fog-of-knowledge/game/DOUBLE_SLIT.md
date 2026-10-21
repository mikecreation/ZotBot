# Double-slit experiment

43 catalog experiments, 129 contracts. Linked to existing atlas node physical.quantum-mechanics. No canonical graph changes.

Model: scalar monochromatic Fraunhofer diffraction, equal coherent rectangular slits. sinθ=y/sqrt(L²+y²), β=πa sinθ/λ, δ=2πd sinθ/λ. Two-slit intensity is sinc²(β)[1+Vcosδ]; V=1 without path marking, V=0 for perfectly distinguishable detector states. One slit uses sinc²(β). This ideal endpoint model excludes partial decoherence, detector Hamiltonians, absorption/scattering and interacting photons.

An 800-bin normalized CDF samples localized detections within a finite ±20 mm window, conditional on arrival there. Rate is fixed: no throughput comparison is implied. Vertical spread is illustrative. No unmeasured path is assigned or animated. The wave arcs illustrate amplitudes; they are not measured trajectories or a numerical time-dependent wavefunction. Apparatus and playback are not to scale. Histogram and expected counts share a vertical scale once detections accumulate. The phase-arrow probe isolates relative phase from the single-slit envelope; arrows do not represent photon travel directions.

Changing apparatus clears the screen instead of rewriting old dots. Human viewing only hides/reveals the recorded display and never enters the physics. Path marking is a physical interaction, not awareness; losing interference is not attributed solely to mechanical kicks. Its ideal pattern is a broad diffraction envelope, not necessarily two piles. There are no quantum eraser or backward-causation claims.

Play: one photon, stream/pause, one/two slits, path detector, hide/reveal screen, predicted comparison overlay, bright/dark amplitude probe, wavelength/separation/width/distance controls. Phones default to screen close-up. Three contracts require 200 sampled detections and explicit recording: interference, path detection, and designing fringe spacing ≥8 mm. Mastery is awarded once via existing saves. Closing/navigating disposes callbacks; hidden documents suspend sampling; hit count is capped at 20,000 with a cached rendering layer.

Sources: https://www.feynmanlectures.caltech.edu/III_01.html and https://www.feynmanlectures.caltech.edu/III_03.html; https://lecdem.physics.umd.edu/p/p2/1307-p2-11.html.

Validation: 67 model checks (interference and diffraction zeros, symmetry, normalized distributions, sampler quantiles, geometry scaling, challenge conditions); 16 browser checks (catalog/link, single hit, all contracts, detector/viewing, geometry/probe, duplicate mastery protection, phone controls, minimize, raft-release location). Original 47 and foundational 75 model checks pass.


## Apparatus and interaction update

Send 1 photon interrupts streaming and schedules one finite illustrative sequence: heralded preparation, slit amplitudes, then one sampled screen detection. Arcs appear only during that sequence or streaming; an idle guide no longer loops. The sensor edge and front view highlight the same horizontal coordinate using a dashed view-mapping connector, not a photon trajectory. The front view has a pixel grid. Additional hardware diagrams show a pump/crystal source, herald avalanche photodiode, slit mask, path markers and position-sensitive single-photon sensor/readout. These are schematic components of an ideal apparatus, not a calibrated commercial instrument.

For two paths, H/V polarization markers are one implementation of distinguishable records. For three or more, the simulator explicitly assumes an ideal distinct record per opening; two polarization states alone cannot label all paths. Up to sixteen nonoverlapping equal-width slits may be added/removed by tapping the mask or the main barrier. The intensity uses the squared modulus of the sum over all aperture phases, divided by aperture count (conditional normalization), or an incoherent sum with perfect path marking. Arbitrary positions change the pattern; the two-slit separation control restores a two-slit geometry. Width changes that would overlap apertures are rejected. Wave arcs are illustrative, not the calculated field.

Hardware references: https://www.thorlabs.com/newgrouppage9.cfm?objectgroup_id=17247 (SPDC source), https://journals.aps.org/prper/abstract/10.1103/PhysRevPhysEducRes.13.020115 (polarization and which-path reasoning). Rare multi-pair events, losses and detection efficiency remain excluded.

Seventeen further browser checks cover mass/diameter unit suffixes, exact inches conversion, canonical-size preservation, popup reopening, mobile field fit, fullscreen placement/expand/restore, hardware illustrations, finite single emission, stream interruption, and adding/removing a third aperture. Four additional model checks cover multi-slit coherent/incoherent limits, normalization and changed distributions.


## Synchronized stream events

Source events now own individual timestamped packets and a pre-sampled screen coordinate. Each packet is drawn at its own phase; only its arrival produces its one dot. There is no independent looping stream wave animation or separate rate-based dot generator. The same virtual playback clock drives emission, packet position and arrival. Pause freezes the clock, packet drawing and detector counts together. At high rates many packets overlap visually. Flight animation lasts an illustrative 1.4 playback seconds, not the physical photon time of flight. A packet's slit branches represent amplitudes of one event, not extra photons.

Counters show emitted, in flight, detected and (when applicable) explicitly discarded packets. Entering single-step discards existing pending packets while retaining already-recorded dots, then launches one event. Changing geometry/clearing starts new accounting. Source-event IDs are retained on corresponding detections. A 20,000-event limit drains already-launched events before stopping.

Verification: 655 timestamp, identity, exactly-once and accounting checks across 1/60/500 events/s; 7 browser checks for initial propagation delay, 60/s and 500/s conservation, paused clocks, single-step interruption, clearing and slow rate.


Incoming amplitude correction: removed the moving dot between source and slit mask. Each event now has a broad coherent incoming amplitude front spanning all open apertures, followed by outgoing slit amplitudes; the localized dot appears only at detection. This is a schematic amplitude illustration, not a solved propagating wavefunction or a measured trajectory. Timing/accounting is unchanged. Canvas verification renders incoming, transmitted and localized-detection stages, checks illumination spans the aperture heights, and catches runtime errors. Reference: Feynman III chapters 1–3, especially the distinction between amplitudes and localized detection events.


Slit-mask pointer correction: screen coordinates now transform through the SVG screen CTM inverse, accounting for aspect-ratio letterboxing, browser scaling and fullscreen. Clicks outside the rendered solid bar are ignored; no rounding shifts the opening. Seven browser assertions verify sub-pixel centering and same-point removal at 390/1500/1900 px and fullscreen.


## Sensor probability explanation (supersedes outgoing arc animation)

Removed the outgoing expanding arcs: their first geometric intersection with a screen is not the rule for selecting a photon absorption site. The display now shows a stationary sensor probability ribbon calculated from the exact same 800-bin distribution used for random detections. Tap the ribbon or front-view sensor to select a coordinate. Dashed aperture connectors identify the contributions evaluated there; they are explicitly labeled as contributions, not tracks. The always-open phase probe shows individual phases, head-to-tail coherent addition and relative intensity, including the diffraction envelope. All slit counts use the same shared slitAmplitudes calculation as the sampler. Perfect path records instead add probabilities. The preparation pulse and 1.4-second event schedule remain schematic playback, not a numerical wave evolution or detector absorption model. This change does not claim that the visual predicts individual hit positions or physical arrival times.

Added 99 independent shared-model comparisons and three-slit reinforcement/cancellation checks. Browser checks cover sensor coordinate selection, visible explanation, one-event/one-hit accounting and desktop/mobile rendering.
