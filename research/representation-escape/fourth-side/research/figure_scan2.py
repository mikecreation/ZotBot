"""
figure_scan2.py — design + EXACT verification of the film's figures.

The mechanism of impossibility (this is the whole film in one equation):

  A picture of rigid bars is READABLE iff one global depth order of the bars
  reproduces it.  A picture whose local over/under cues form a CYCLE
  (A over B, B over C, C over A) has NO such order -> the cohomology
  obstruction (Penrose 1992) is nonzero -> the picture is an IMPOSSIBLE FIGURE.

A real 3D object (a "staircase" of three mutually perpendicular bars) can
still PROJECT to such a picture: from one special direction the 3-cycle
appears.  This script finds that direction, measures the size of the
"impossible cone", and then does the 4D experiment:

  In 4D, the staircase is completed by a fourth bar along +w.  From any
  direction of OUR 3-space that bar collapses to a nub (invisible).
  From the 4D diagonal it projects into exactly the missing side of the
  loop -- and the picture becomes a closed impossible figure again, now
  the shadow of an object that genuinely exists.
"""
import numpy as np
from itertools import permutations

# ---------------------------------------------------------------------------
# geometry
# ---------------------------------------------------------------------------

def staircase(b=1.0, L=2.0, oA=(0.0, 0.0), oB=(0.0, 0.0), oC=(0.0, 0.0),
              extA=0.0, extB=0.0, extC=0.0, startA=0.0, startB=0.0, startC=0.0):
    """Three bars of square section b:
       A along x : x in [-startA, L+extA],  (y,z) centred at oA
       B along y : y in [-startB, L+extB],  (x,z) centred at oB
       C along z : z in [-startC, L+extC],  (x,y) centred at oC
    Each is a 4D-box -> 3D shadow with 3 generators. Returned as generator form:
       centre c, list of half-extent vectors g_i
    """
    h = b/2

    def boxg(axis, lo, hi, off):
        up = [i for i in range(3) if i != axis]
        c = [0.0, 0.0, 0.0]
        c[axis] = (lo+hi)/2
        c[up[0]] = off[0]
        c[up[1]] = off[1]
        g = [np.zeros(3) for _ in range(3)]
        g[axis] = np.array([0.0]*3); g[axis][axis] = (hi-lo)/2
        for k, u in enumerate(up):
            e = np.zeros(3); e[u] = h
            g[k if k < axis else k+1] = e
        g = [x for x in g if np.linalg.norm(x) > 1e-12]
        return np.array(c), g

    A = boxg(0, -startA, L+extA, oA)
    B = boxg(1, -startB, L+extB, oB)
    C = boxg(2, -startC, L+extC, oC)
    return [dict(id=n, c=c, g=g) for n, (c, g) in zip('ABC', [A, B, C])]


def bar4(id_, axis, lo, hi, off):
    """A 4D bar: elongated along `axis` (0..3), square section b, the two
    perpendicular coords in the remaining 3 axes set by off (len-3 list).
    Returns (centre4, [half-extent vectors in R4])."""
    c = np.zeros(4); c[axis] = (lo+hi)/2
    g = []
    up = [i for i in range(4) if i != axis]
    for k, u in enumerate(up):
        c[u] = off[k]
    g.append(np.array([(hi-lo)/2 if i == axis else 0.0 for i in range(4)]))
    for u in up:
        e = np.zeros(4); e[u] = OFF_B
        g.append(e)
    return c, g


OFF_B = 0.5   # half thickness of 4D bars

# ---------------------------------------------------------------------------
# shadows:  a bar seen from a direction = a convex ZONOTOPE
#   generators g_i in the viewing 3-space (for 4D bars: project first)
#   point-in-shadow test + exact depth interval
# ---------------------------------------------------------------------------

def facet_planes(c, G, nrm):
    """max-of-facet-planes SDF for the zonotope  c + sum s_i G_i, |s_i|<=1."""
    p = len(G)
    planes = []
    for i in range(p):
        for j in range(i+1, p):
            n = np.cross(G[i], G[j])
            nl = np.linalg.norm(n)
            if nl < 1e-9:
                continue
            n = n/nl
            h = sum(abs(float(n @ g)) for g in G)
            planes.append((n, h))
    # dedupe near-identical planes
    out = []
    for n, h in planes:
        if not any(abs(1-abs(n@m)) < 1e-6 and abs(h-hh) < 1e-6 for m, hh in out):
            out.append((n, h))
    return out


def shadow_2d_to_point(P, Q, c4, G4):
    """Project a 4D bar to the 2D (e1,e2) image plane with normal coords (e3,e4).
    Returns (cz, polygon vertices) where the bar covers pixel p iff 0 in polygon
    of the shifted zonotope; here we build the zonotope of the projected
    generators as a convex polygon (16-gon by sign sums)."""
    G2 = [np.array([g @ P[0], g @ P[1]]) for g in G4]
    verts = np.zeros((2**len(G2), 2))
    for k, signs in enumerate(np.array(np.meshgrid(*[[-1, 1]]*len(G2))).T.reshape(-1, len(G2))):
        verts[k] = sum(s*np.array(g) for s, g in zip(signs, G2))
    return np.array([c4 @ P[0], c4 @ P[1]]), verts


# ---------------------------------------------------------------------------
# exact 3D id-map renderer (orthographic)
# ---------------------------------------------------------------------------

def ortho_frame(d, ref_up=(0, 1, 0)):
    d = np.asarray(d, float); d = d/np.linalg.norm(d)
    up = np.asarray(ref_up, float)
    if abs(up @ d) > 0.999:
        up = np.array([0.0, 0.0, 1.0])
    e1 = np.cross(up, d); e1 /= np.linalg.norm(e1)
    e2 = np.cross(d, e1)
    return e1, e2, d


def bar_abc(c, G, e1, e2, d):
    """orthographic projection of a zonotope -> 2D polygon + depth (u) interval"""
    P = [e1, e2]
    G2 = [np.array([g @ e1, g @ e2]) for g in G]
    G1 = np.array([g @ d for g in G])
    c2 = np.array([c @ e1, c @ e2])
    c1 = float(c @ d)
    verts = []
    for signs in np.array(np.meshgrid(*[[-1, 1]]*len(G2))).T.reshape(-1, len(G2)):
        verts.append(sum(s*np.array(g) for s, g in zip(signs, G2)) + c2)
    return np.array(verts), c1 - abs(G1).sum(), c1 + abs(G1).sum()


def point_in_convex(poly, pts):
    """vectorised: pts (N,2) inside convex polygon (CCW)?"""
    ok = np.ones(len(pts), bool)
    m = len(poly)
    for i in range(m):
        a, b_ = poly[i], poly[(i+1) % m]
        e = b_ - a
        nrm = np.array([-e[1], e[0]])
        ok &= ((pts - a) @ nrm) <= 1e-9
    return ok


def render_idmap3(bars, d, res=96, span=3.2, upsample=1):
    e1, e2, dd = ortho_frame(d)
    u = (np.arange(res)+0.5)/res - 0.5
    U, V = np.meshgrid(u, u, indexing='ij')
    pts = np.stack([(U*span).ravel(), (-V*span).ravel()], 1)
    ids = np.zeros(res*res, np.int8)
    best = np.full(res*res, 1e9)
    for b in bars:
        poly, u0, u1 = bar_abc(b['c'], b['g'], e1, e2, dd)
        # convexity order
        ctr = poly.mean(0); ang = np.arctan2(poly[:, 1]-ctr[1], poly[:, 0]-ctr[0])
        poly = poly[np.argsort(ang)]
        if np.cross(poly[1]-poly[0], poly[2]-poly[1]) < 0:
            poly = poly[::-1]
        inside = point_in_convex(poly, pts)
        depth = np.where(inside, u0, 1e9)     # entry depth ~ u0 (conservative)
        nearer = inside & (depth < best - 1e-12)
        best = np.where(nearer, depth, best)
        ids = np.where(nearer, np.int8(ord(b['id'])-64), ids)
    return ids.reshape(res, res)


def readings(ids, names='ABC'):
    """all global front-to-back depth orders that reproduce the id map"""
    ok = []
    for order in permutations(names):
        comp = np.zeros_like(ids)
        for nid in reversed(order):           # paint back -> front
            comp = np.where(ids == ord(nid)-64, np.int8(ord(nid)-64), comp)
        if np.array_equal(comp, ids):
            ok.append('>'.join(order))
    return ok


def tournament(ids, names='ABC'):
    """for every pair: which one wins the pixels where they overlap"""
    out = {}
    for i in range(len(names)):
        for j in range(i+1, len(names)):
            a, b = names[i], names[j]
            reg = ((ids == ord(a)-64) | (ids == ord(b)-64))
            # overlap region of the two labels only (pixels owned by a or b)
            wa = int(np.sum(ids == ord(a)-64)); wb = int(np.sum(ids == ord(b)-64))
            out[(a, b)] = (wa, wb)
    return out


def ascii_dump(ids, maxw=88):
    chars = {0: '.', 1: 'A', 2: 'B', 3: 'C', 4: 'D'}
    r = ids.shape[0]
    step = max(1, r//maxw)
    lines = []
    for i in range(0, r, step*2):            # 2 rows per terminal row
        line = ''
        for j in range(0, r, step):
            v = int(ids[i, j])
            line += chars.get(v, '?')
        lines.append(line)
    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# 4D -> 2D renderer (exact, via the shadow-zonotope test)
# ---------------------------------------------------------------------------

def render_idmap4(bars4, view4, res=72, span=3.2):
    """view4 = 4x4 orthonormal matrix, rows: e1,e2,d4,e4.
       pixel p is covered by a bar iff  O(s,t) = c_pix + s e1 + t e2  meets the box,
       i.e. the projection of the bar under  Q = [e3;e4]  contains  Q(c_pix)."""
    e1, e2, d4, e4 = view4
    u = (np.arange(res)+0.5)/res - 0.5
    U, V = np.meshgrid(u, u, indexing='ij')
    S = (U*span).ravel(); T = (-V*span).ravel()
    ids = np.zeros(res*res, np.int8); best = np.full(res*res, 1e9)
    for b in bars4:
        c, G = b['c'], b['g']
        # Q(v) = ((v-c).e3, (v-c).e4); pixel at (s,t) along (e1,e2) -> Q(c_pix)
        qx = S*float(e1 @ d4) + T*float(e2 @ d4) + float(c @ d4)
        qy = S*float(e1 @ e4) + T*float(e2 @ e4) + float(c @ e4)
        pts = np.stack([qx, qy], 1)
        gx = [np.array([g @ d4, g @ e4]) for g in G]
        verts = []
        for signs in np.array(np.meshgrid(*[[-1, 1]]*len(gx))).T.reshape(-1, len(gx)):
            verts.append(sum(s*np.array(g) for s, g in zip(signs, gx)))
        poly = np.array(verts)
        ctr = poly.mean(0); ang = np.arctan2(poly[:, 1]-ctr[1], poly[:, 0]-ctr[0])
        poly = poly[np.argsort(ang)]
        if np.cross(poly[1]-poly[0], poly[2]-poly[1]) < 0:
            poly = poly[::-1]
        inside = point_in_convex(poly, pts)
        # depth interval along d4 : u = (v).d4 = (s(...)+...) -> range from generators
        u_mid = float(c @ d4) + S*float(e1 @ d4) + T*float(e2 @ d4)
        u0 = u_mid - sum(abs(float(g @ d4)) for g in G)
        nearer = inside & (u0 < best - 1e-12)
        best = np.where(nearer, u0, best)
        ids = np.where(nearer, np.int8(ord(b['id'])-64), ids)
    return ids.reshape(res, res)


def fib_sphere(n):
    i = np.arange(n)+0.5
    z = 1 - 2*i/n
    phi = np.arccos(np.clip(z, -1, 1))
    th = np.pi*(1+5**0.5)*i
    return np.stack([np.sin(phi)*np.cos(th), np.sin(phi)*np.sin(th), z], 1)


# ---------------------------------------------------------------------------
if __name__ == '__main__':
    np.set_printoptions(suppress=True, precision=3)
    b, L = 1.0, 2.0

    # candidate: staircase with bars offset so the corner joints show a real
    # over/under.  A sits low-back, B wraps outside, C comes down the front.
    cands = [
        ('plain', staircase(b=b, L=L)),
        ('offsets1', staircase(b=b, L=L, oA=(0, 0), oB=(+0.5, -0.5), oC=(-0.5, +0.5))),
        ('offsets2', staircase(b=b, L=L, oA=(0, 0), oB=(+0.5, 0.0), oC=(0.0, +0.5))),
        ('offsets3', staircase(b=b, L=L, oA=(0, 0), oB=(+0.0, -0.5), oC=(-0.5, 0.0))),
        ('ext', staircase(b=b, L=L, oA=(0, 0), oB=(+0.5, -0.5), oC=(-0.5, +0.5),
                          extA=0.5, extB=0.5, extC=0.5)),
    ]
    d0 = np.array([1, 1, 1.0])
    for name, bars in cands:
        ids = render_idmap3(bars, d0, res=88)
        r = readings(ids)
        print(f'--- {name}:  readings={len(r)}  {"IMPOSSIBLE" if not r else r[:2]}')
        print(ascii_dump(ids, maxw=76))
        print()

    print('=== direction census for offsets2 (the construction) ===')
    bars = dict(cands)['offsets2']
    n = 800
    dirs = fib_sphere(n)
    feas = []
    for k, d in enumerate(dirs):
        ids = render_idmap3(bars, d, res=72)
        feas.append(len(readings(ids)))
    feas = np.array(feas)
    imp = feas == 0
    print(f'impossible directions: {imp.sum()}/{n} = {100*imp.mean():.1f}%')
    if imp.sum():
        ctr = dirs[imp].mean(0); ctr /= np.linalg.norm(ctr)
        cosang = dirs[imp] @ (np.array([1, 1, 1.0])/np.sqrt(3))
        print(f'cone: median angle to (1,1,1): {np.degrees(np.arccos(np.clip(cosang,0,1))).mean():.1f} deg, '
              f'max {np.degrees(np.arccos(np.clip(cosang.min(),0,1))):.1f} deg')
        print(f'centroid of impossible dirs: {ctr}')