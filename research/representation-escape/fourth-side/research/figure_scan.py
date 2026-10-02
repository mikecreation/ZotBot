"""
figure_scan.py — EXACT numerical study of 3D "impossible figure" sculptures.

Idea
----
An impossible figure is not a drawing problem, it is a VISIBILITY problem.
Build a real 3D object out of straight bars. From a given orthographic view,
render the image as a material-id map (which bar is visible at each pixel).

The image is FIGURAL / "drawable"  iff  there exists a global depth order of
the bars (a strict stacking) whose painter's-algorithm composite reproduces
exactly that image.  If no order reproduces it, the image is IMPOSSIBLE.

This is the operational version of Penrose's cohomology of impossible figures:
the obstruction is a non-trivial cocycle around the object's joint cycle.

Everything here is exact orthographic ray casting (no sampling noise):
for each pixel we slab-test the orthographic ray against every bar and take
the nearest hit.
"""
import numpy as np
from itertools import permutations

# ----------------------------------------------------------------------------
# Object model: bars are axis-aligned boxes.
#   "easy frame": figure lies in the xy plane, z is the depth/stacking axis.
#   bar = dict(id, x0,x1, y0,y1, z0,z1)
# ----------------------------------------------------------------------------

def bar(i, x0, x1, y0, y1, z0, z1):
    return dict(id=i, x0=x0, x1=x1, y0=y0, y1=y1, z0=z0, z1=z1)


def ubars(b=1.0, L=2.2, gap=1.0, la=0.0, lb=1.0, lc=2.0,
          ext_a=0.0, ext_b=0.0, ext_c=0.0):
    """The 3-bar construction in the easy frame.

    A : bottom horizontal bar   (the "long" bar)      layer la
    B : top    horizontal bar   (parallel to A)       layer lb
    C : right  vertical   bar   (crosses both)        layer lc

    ext_* = how far each bar's end pokes PAST its nominal corner (this is the
    knob that creates the ambiguous joint: the poking end can be drawn as
    either the near or the far bar).
    """
    A = bar('A', 0.0, L + ext_a, 0.0, b, la, la + 1.0)          # bottom
    B = bar('B', 0.0, L + ext_b, L + gap, L + gap + b, lb, lb + 1.0)  # top
    C = bar('C', L, L + b, 0.0 - ext_c, L + gap + b, lc, lc + 1.0)    # right
    return [A, B, C]


# ----------------------------------------------------------------------------
# Orthographic ray casting  ->  id map
# ----------------------------------------------------------------------------

def ortho_frame(d):
    """right-handed screen basis for view direction d (unit, into the scene)."""
    d = d / np.linalg.norm(d)
    up = np.array([0.0, 1.0, 0.0])
    if abs(np.dot(up, d)) > 0.999:
        up = np.array([0.0, 0.0, 1.0])
    e1 = np.cross(up, d); e1 /= np.linalg.norm(e1)
    e2 = np.cross(d, e1)
    return e1, e2, d


def render_idmap(bars, d, res=112, span=3.4, center=None):
    """Exact orthographic material-id map.  Nearest hit along +d wins."""
    e1, e2, dd = ortho_frame(d)
    if center is None:
        allc = np.array([[b['x0']+b['x1'], b['y0']+b['y1'], b['z0']+b['z1']]
                         for b in bars]) * 0.5
        center = allc.mean(axis=0)
    u = (np.arange(res) + 0.5) / res - 0.5
    U, V = np.meshgrid(u, u, indexing='ij')
    scale = span
    # origins: (res, res, 3)
    O = center[None, None, :] + (U*scale)[..., None]*e1[None, None, :] \
        + (-V*scale)[..., None]*e2[None, None, :]
    ids = np.zeros((res, res), dtype=np.int8)
    best = np.full((res, res), np.inf)
    for b in bars:
        lo = np.array([b['x0'], b['y0'], b['z0']])
        hi = np.array([b['x1'], b['y1'], b['z1']])
        # slab method, vectorised over pixels
        with np.errstate(divide='ignore', invalid='ignore'):
            t1 = (lo - O) / dd
            t2 = (hi - O) / dd
        tn = np.maximum.reduce(np.minimum(t1, t2), axis=2)
        tf = np.minimum.reduce(np.maximum(t1, t2), axis=2)
        hit = (tn <= tf) & (tf >= 0.0)
        nearer = hit & (tn < best)
        best = np.where(nearer, tn, best)
        ids = np.where(nearer, np.int8(ord(b['id']) - 64), ids)
    return ids


def composite(ids, order):
    """Painter's algorithm: later entries in `order` are drawn ON TOP."""
    out = np.zeros_like(ids)
    for bid in order[1:]:                     # first in order = most in front
        out = np.where(ids == ord(bid) - 64, np.int8(ord(bid) - 64), out)
    return out


def readings(bars, ids):
    """All global stacking orders that reproduce this image exactly."""
    ok = []
    names = [b['id'] for b in bars]
    for order in permutations(names):
        # order[0] is front-most
        comp = np.zeros_like(ids)
        for bid in reversed(order):           # paint back to front
            comp = np.where(ids == ord(bid) - 64, np.int8(ord(bid) - 64), comp)
        if np.array_equal(comp, ids):
            ok.append('>'.join(order))
    return ok


def is_impossible(bars, d, res=112, span=3.4):
    ids = render_idmap(bars, d, res=res, span=span)
    return len(readings(bars, ids)) == 0


# ----------------------------------------------------------------------------
# Direction scans
# ----------------------------------------------------------------------------

def fib_sphere(n):
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2*i/n)          # polar from +z
    gold = np.pi * (1 + 5**0.5)
    theta = gold * i
    return np.stack([np.sin(phi)*np.cos(theta),
                     np.sin(phi)*np.sin(theta),
                     np.cos(phi)], axis=1)


def scan(bars, dirs, res=112, span=3.4, verbose=False):
    res_feas = []
    for k, d in enumerate(dirs):
        ids = render_idmap(bars, d, res=res, span=span)
        res_feas.append(len(readings(bars, ids)))
        if verbose and k % 200 == 0:
            print(f'  {k}/{len(dirs)}', flush=True)
    return np.array(res_feas)


def joint_over_under(bars, d, res=160, span=3.4):
    """Which bar wins at each pairwise corner overlap (the over/under cycle)."""
    ids = render_idmap(bars, d, res=res, span=span)
    out = {}
    names = [b['id'] for b in bars]
    for i in range(len(names)):
        for j in range(i+1, len(names)):
            a, b = names[i], names[j]
            ia, ib = ord(a)-64, ord(b)-64
            # region where either bar is the visible one at a pixel they compete for
            # (approximate: pixels labelled a that lie inside b's projected bbox test omitted;
            #  exact competition tested directly with a 2-bar render)
            two = [x for x in bars if x['id'] in (a, b)]
            ids2 = render_idmap(two, d, res=res, span=span)
            both = np.zeros_like(ids2, dtype=bool)
            for x in two:
                idsx = render_idmap([x], d, res=res, span=span)
                both |= (idsx > 0)
            # pixels where BOTH bars project -> competition zone
            idsA = render_idmap([two[0]], d, res=res, span=span) > 0
            idsB = render_idmap([two[1]], d, res=res, span=span) > 0
            comp = idsA & idsB
            if comp.sum() == 0:
                out[(a, b)] = None
                continue
            win_a = np.sum(comp & (ids2 == ia))
            win_b = np.sum(comp & (ids2 == ib))
            out[(a, b)] = (win_a, win_b)
    return out


if __name__ == '__main__':
    print('=== base construction: impossible-direction census ===')
    bars = ubars()
    n = 500
    dirs = fib_sphere(n)
    feas = scan(bars, dirs, res=96)
    imp = feas == 0
    print(f'directions sampled       : {n}')
    print(f'impossible directions    : {imp.sum()}  ({100*imp.mean():.1f}%)')
    print(f'2-reading directions     : {(feas==2).sum()}')
    print(f'1-reading directions     : {(feas==1).sum()}')
    print(f'ambiguous (>=3 readings) : {(feas>=3).sum()}')

    print()
    print('=== a few specific views ===')
    for name, d in [('front (along -z)', np.array([0, 0, -1.0])),
                    ('front flipped (along +z)', np.array([0, 0, 1.0])),
                    ('oblique (1,-0.4,-1)', np.array([1, -0.4, -1.0])),
                    ('oblique (-1,0.4,-1)', np.array([-1, 0.4, -1.0])),
                    ('top-ish (0.3,1,-0.4)', np.array([0.3, 1, -0.4]))]:
        ids = render_idmap(bars, d, res=112)
        r = readings(bars, ids)
        print(f'{name:26s} readings={len(r):2d}  {"IMPOSSIBLE" if not r else r[:3]}')

    print()
    print('=== joint over/under at an oblique view ===')
    d = np.array([1, -0.4, -1.0])
    ou = joint_over_under(bars, d)
    for k, v in ou.items():
        print(f'  {k}: {v}')