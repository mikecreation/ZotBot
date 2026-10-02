# THE FOURTH SIDE

**A 16.3 s film in three acts — a 2D impossible figure, lifted into a real 3D
sculpture, then climbed into the fourth dimension.
Coded from scratch: geometry solved by linear programming, rendered by a 4D ray
tracer written in C. No game engine, no Blender, no rendering library, no 3D
software of any kind. Silent, as requested: typography carries the argument.**

Deliverables:

| file | what it is |
|---|---|
| `THE_FOURTH_SIDE.mp4` | the film (960×540, 40 fps, 16.3 s, silent) |
| `THE_FOURTH_SIDE.mkv` | same, lossless-ish container copy |
| `THE_FOURTH_SIDE_ref.mp4` | the first-generation render of the same film (superseded) |
| `poster.png` | hero still (frame 603) |
| `compare_ref_vs_new.png` | old pipeline vs new pipeline, three beats |
| `timeline.txt` | the shot list the renderer consumed |

---

## The idea

An impossible figure is not a drawing problem; it is a **visibility** problem.
Give every part of the drawing a depth, in some fixed order — if *some* global
stacking of the parts reproduces the picture, the picture is real. If **no**
stacking does, the picture is impossible. Penrose (1958, 1992) showed this
obstruction is literally a non-trivial *cocycle*: the over/under relations at
the corners close a loop that no global depth assignment can satisfy.

That gives a design problem that can be solved exactly:

> Build three real bars. Make them project, from one direction, an image whose
> corner over/under relations form a **cycle** (A over B, B over C, C over A).
> Then no depth ordering of the bars explains the image. The bars are real and
> never intersect the whole time.

**It exists.** Solved by LP, verified by exhaustive search over all 6 depth
orderings, and — the check that matters — re-verified by an independent ray
tracer that reproduces the picture *pixel-for-pixel*.

Then the fourth dimension does the rest. Add a bar along the 4th axis, and roll
the observer's up-axis into the 4th dimension:

```
T  = view axis            (unchanged, stays in 3-space)
U(α) = cos α · e₂ + sin α · u_w      the up-axis rotates out of our space
```

Because the three bars have no extent along `u_w`, their measured heights change
by exactly `cos α` — i.e. the **figure stays the same picture**, while the 4th
bar, which has *zero* shadow in our space, grows to length `5.2 sin α`.

---

## What is verified, and how

Every number in the film comes from `research/facts.py` (`out/facts.json`):

| claim | measured |
|---|---|
| the sculpture's picture is the ideal impossible figure | **1.00000** pixel agreement (240²) |
| no depth order explains that picture | **0 of 6** orderings reproduce it |
| the over/under relations form a cycle | B beats A, C beats B, A beats C |
| the bars never touch | min gap **0.283** (they are separate objects) |
| the figure is special | impossible from **13/400 = 3.2%** of view directions; from the other **96.8%** the same object reads as floating bars |
| the turn is frozen | the three-bar figure is **100.000% pixel-identical** at α = 15°…88° once the pure cos α foreshortening is undone (74–99% identical raw, the difference being exactly that uniform vertical scale) |
| the over/under never breaks | corner winners B / C / A at **every** α tested (10°, 20°, 30°, 45°, 60°, 75°, 88°) |
| the 4th bar is new matter | its length in the room goes **0.18 → 5.20** as α goes 0° → 88° |
| it stays impossible the whole way | **YES at every tested α** (10°…88°) |

The corner contest in the final object (this is the obstruction, in pixels):

```
corner A&B : B wins 1465 px
corner B&C : C wins 1465 px      B > C > A > B   — a cycle: no global depth order
corner C&A : A wins 1670 px
```

---

## How it was built

```
research/design.py            the tribar as exact geometry; the reading test
                              (painter's algorithm) that defines "impossible"
research/solve_lp.py          the LP: six endpoint depths, cyclic corner
                              constraints + separation  ->  the sculpture
research/verify_object.py     exhaustive re-verification (all 6 orderings)
research/export_scene.py      the 4D object, the room frames, scene_vals.h
research/facts.py             recomputes every claim above; writes facts.json
fourd.c                       the renderer: 4D scene, 3D ray casting in the
                              observer's room, soft shadows, tone mapping
film.py                       shot list, typography, encode (ffmpeg)
```

Pipeline:

The whole film regenerates in one streaming pass — the renderer writes raw
frames straight down a pipe into the encoder, so **no scratch frames ever touch
the disk** and memory stays at a few megabytes:

```bash
cd research && python3 solve_lp.py && python3 facts.py && python3 export_scene.py
cd .. && cp research/scene_vals.h . && gcc -O3 -march=native -o fourd fourd.c -lm -lpthread
python3 film.py timeline
./fourd --timeline timeline.txt --stdout --w 960 --h 540 --threads 2 \
  | python3 film.py pipe 652 THE_FOURTH_SIDE.mp4          # 652 frames: ~24 s total
```

Every stage is incremental and resumable: `--from/--to` re-render any frame
range, `--out DIR` writes a single frame, and `film.py pipe N out.mp4` is happy
to receive a chunk. Nothing is staged, nothing is quadratic, nothing dies at
frame 74.

### The renderer

`fourd.c` is ~600 lines of C: a 4×4 matrix inverse per bar, slab intersection in
the generator basis (each bar is a box `{ c + Σ sᵢgᵢ , |sᵢ| ≤ 1 }`), a room
frame rebuilt per shot from `(α, β)`, soft shadows by 5-tap light sampling,
a 4D-generalised cross product for face normals, and a Reinhard-like tone map.
Two threads, **0.024 s/frame** at 960×540 — the full 652-frame film plus its
H.264 encode takes about **24 seconds** wall-clock on this 2-core machine, with
a constant ~2 MB footprint.

---

## Honest notes (what is not perfect)

* At α = 88° the 4th bar reaches its maximum room length but is still clipped a
  little at the frame edge; the film pulls the camera back for the finale.
* The "97%" figure is a 400-direction Monte-Carlo census (seeded, reproducible):
  13/400 give the impossible figure, 387/400 do not.
* Act I is the same 3D scene rendered with flat ink shading rather than a
  separate 2D drawing engine — the geometry is identical, and the reading test
  is the same one used everywhere else.
* The new streaming renderer is geometrically identical to the first-generation
  one (same silhouettes, same framing — a shift search over ±14 px finds zero
  offset) but not bit-identical in shading: about 2–4% mean channel error,
  concentrated in the darkest faces. Fixing two real bugs did that: shadow rays
  from a bar's own surface no longer count as occluded, and a facet's shading
  normal is now taken from the *active* supporting plane instead of an
  arbitrary sign rule (the old sign rule striped the bars with false facets).
  `THE_FOURTH_SIDE_ref.mp4` is kept for side-by-side.
* 4K would take roughly 9× longer per frame; 960×540 keeps the whole film
  re-renderable in ~24 seconds on this 2-core machine.