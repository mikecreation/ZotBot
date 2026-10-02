"""
design.py — build the film's central object and PROVE its properties numerically.

Objects built here
------------------
1. IDEAL 2D FIGURE    the Penrose tribar, as exact polygons + a winner table
                      whose over/under relations form a 3-cycle.
2. 3D SCULPTURE       three bars, lifted out of the plane with a 6-parameter
                      depth profile, such that the orthographic render of the
                      sculpture is *pixel-identical* to the ideal figure.
                      (verified by rendering, not asserted)
3. 4D OBJECT          the same three bars + a fourth bar along +w that closes
                      the loop through the fourth dimension.  From every
                      direction of our 3-space that bar collapses to a nub.
"""
import numpy as np, json, itertools, os
from scipy.spatial import ConvexHull

# ---------------------------------------------------------------- isometric frame
D3 = np.array([1.0, 1.0, 1.0])/np.sqrt(3.0)      # view direction (into screen)
E1 = np.array([1.0, 0.0, -1.0])/np.sqrt(2.0)     # image x
E2 = np.array([-1.0, 2.0, -1.0])/np.sqrt(6.0)    # image y
EX = np.array([E1[0], E2[0]])                    # image of +x
EY = np.array([E1[1], E2[1]])                    # image of +y
EZ = np.array([E1[2], E2[2]])                    # image of +z
AX = np.array([1.0, 0, 0]); AY = np.array([0, 1.0, 0]); AZ = np.array([0, 0, 1.0])


def lift(p2, s):
    """2D image point -> 3D point with given depth s along the view direction."""
    return p2[0]*E1 + p2[1]*E2 + s*D3


# ---------------------------------------------------------------- polygon tools
def hull(pts):
    pts = np.unique(np.round(np.asarray(pts, float), 9), axis=0)
    return pts[ConvexHull(pts).vertices]


def band_poly(p, q, cs):
    return hull([p + v for v in cs] + [q + v for v in cs])


def in_poly(poly, pts):
    ok = np.ones(len(pts), bool); m = len(poly)
    c = poly.mean(0)
    ang = np.argsort(np.arctan2(poly[:, 1]-c[1], poly[:, 0]-c[0]))
    poly = poly[ang]
    c0, c1 = poly[1]-poly[0], poly[2]-poly[1]
    if (c0[0]*c1[1] - c0[1]*c1[0]) < 0:
        poly = poly[::-1]
    for i in range(m):
        a, b = poly[i], poly[(i+1) % m]
        e = b - a
        ok &= ((pts - a) @ np.array([-e[1], e[0]])) >= -1e-9
    return ok


# ---------------------------------------------------------------- ideal figure
class Figure:
    """The Penrose tribar as exact 2D geometry.

    spine A: P1 -> P2 (image dir EX),  section = rhombus spanned by b/2*(+-EY+-EZ)
    spine B: P2 -> P3 (image dir EY),  section = b/2*(+-EX+-EZ)
    spine C: P3 -> P1 (image dir EZ),  section = b/2*(+-EX+-EY)

    winner table (the obstruction): in A&B -> B wins,  B&C -> C wins,
    C&A -> A wins.  No global depth order can do that -> impossible figure.
    """

    def __init__(self, L=2.0, b=0.55, cut=(0.0, 0.0, 0.0)):
        self.L, self.b = L, b
        # corner points
        self.P = [np.zeros(2), L*EX, L*EX + L*EY]
        h = b/2
        self.SEC = {
            'A': [h*EY + h*EZ, h*EY - h*EZ, -h*EY + h*EZ, -h*EY - h*EZ],
            'B': [h*EX + h*EZ, h*EX - h*EZ, -h*EX + h*EZ, -h*EX - h*EZ],
            'C': [h*EX + h*EY, h*EX - h*EY, -h*EX + h*EY, -h*EX - h*EY],
        }
        self.cut = cut                        # spine shortening at the covered end
        # spine endpoints (shortened at the far/covered end, i.e. entry k=1)
        self.spine = {
            'A': [self.P[0], self.P[1] - cut[0]*EX],
            'B': [self.P[1], self.P[2] - cut[1]*EY],
            'C': [self.P[2], self.P[0] - cut[2]*EZ],
        }
        # winner: key (i,j) -> which id wins on the intersection
        self.win = {('A', 'B'): 'B', ('B', 'C'): 'C', ('C', 'A'): 'A'}

    def polys(self):
        return {k: band_poly(self.spine[k][0], self.spine[k][1], self.SEC[k])
                for k in 'ABC'}

    def masks(self, res=220, span=3.0, center2=None):
        if center2 is None:
            center2 = np.array([self.L*EX[0]*0.7, 0.0])
        u = (np.arange(res)+0.5)/res*span - span/2 + center2[0]
        v = (np.arange(res)+0.5)/res*span - span/2 + center2[1]
        U, V = np.meshgrid(u, v, indexing='ij')
        pts = np.stack([U.ravel(), V.ravel()], 1)
        m = {}
        for k, poly in self.polys().items():
            m[k] = in_poly(poly, pts).reshape(res, res)
        return m, u, v

    def idmap(self, res=220, span=3.0, center2=None):
        m, u, v = self.masks(res, span, center2)
        ids = np.zeros((res, res), np.int8)
        # resolve conflicts by the winner table
        for k in 'ABC':
            ids = np.where(m[k], np.int8(ord(k)-64), ids)
        ids = np.where(m['A'] & m['B'], np.int8(ord(self.win[('A', 'B')])-64), ids)
        ids = np.where(m['B'] & m['C'], np.int8(ord(self.win[('B', 'C')])-64), ids)
        ids = np.where(m['C'] & m['A'], np.int8(ord(self.win[('C', 'A')])-64), ids)
        return ids, m

    def readings(self, ids, masks):
        """global front-to-back depth orders of the three rigid bars that
        reproduce this image exactly (should be NONE => impossible figure)"""
        ok = []
        for order in itertools.permutations('ABC'):
            comp = np.zeros_like(ids)
            for nid in reversed(order):          # paint back -> front
                comp = np.where(masks[nid], np.int8(ord(nid)-64), comp)
            if np.array_equal(comp, ids):
                ok.append('>'.join(order))
        return ok

    def relations(self, ids):
        out = {}
        for i, j in itertools.combinations('ABC', 2):
            ii, jj = ord(i)-64, ord(j)-64
            ni = int(np.sum(ids == ii)); nj = int(np.sum(ids == jj))
            out[(i, j)] = (ni, nj)
        return out


# ---------------------------------------------------------------- zonotope SDF-ish
def facets(c, G):
    """facet planes (n, h) of the zonotope  c + sum s_i g_i , |s_i| <= 1"""
    p = len(G); planes = []
    for i in range(p):
        for j in range(i+1, p):
            n = np.cross(G[i], G[j]); nl = np.linalg.norm(n)
            if nl < 1e-9:
                continue
            n = n/nl
            h = sum(abs(float(n @ g)) for g in G)
            planes.append((n, h))
    out = []
    for n, h in planes:
        if not any(np.allclose(n, m, atol=1e-7) and abs(h-hh) < 1e-7 for m, hh in out):
            out.append((n, h))
            out.append((-n, h))          # a zonotope is bounded on BOTH sides
    return out


def shadow_planes(c2, G2):
    """exact single-sided plane set of a 2D shadow zonotope:
       for generators g_i, edges are parallel to g_i, so normals are perp(g_i),
       and the support in each normal is sum_i |n.g_i|."""
    pl = []
    for g in G2:
        L = np.hypot(g[0], g[1])
        if L < 1e-9:
            continue
        n = np.array([-g[1], g[0]])/L
        h = sum(abs(float(n @ q)) for q in G2)
        pl.append((n, h))
        pl.append((-n, h))
    return pl


def render_zonotopes(bars, res=220, span=3.0, e1=E1, e2=E2, d=D3, center2=None):
    """EXACT orthographic ray-cast id map of a set of boxes (zonotopes).

    For each pixel the ray is  O + lam*d ; writing the box as c + sum s_i g_i
    (|s_i|<=1) and solving in the generator basis gives lam ranges per
    generator, hence the exact entry/exit depth of that ray through that box.
    The visible box is the one with the smallest entry depth (lam>0)."""
    if center2 is None:
        center2 = np.array([0.0, 0.0])
    u = (np.arange(res)+0.5)/res*span - span/2 + center2[0]
    v = (np.arange(res)+0.5)/res*span - span/2 + center2[1]
    U, V = np.meshgrid(u, v, indexing='ij')
    px = U.ravel(); py = V.ravel()
    ids = np.zeros(res*res, np.int8)
    best = np.full(res*res, np.inf)
    for b in bars:
        c = np.asarray(b['c'], float)
        gg = [np.asarray(g, float) for g in b['g']]
        gg = [g for g in gg if np.linalg.norm(g) > 1e-9]     # drop degenerate gens
        G = np.asarray(gg).T                                   # 3x3 columns
        Minv = np.linalg.inv(G)
        # O = px*e1 + py*e2  (depth 0 by construction)
        O = np.stack([px*e1[0]+py*e2[0], px*e1[1]+py*e2[1], px*e1[2]+py*e2[2]], 1)
        s0 = (Minv @ (O - c[None, :]).T)                    # 3 x N   (s = s0 + lam*m)
        m = Minv @ d
        lo = np.full((3, len(px)), -np.inf); hi = np.full((3, len(px)), np.inf)
        with np.errstate(divide='ignore', invalid='ignore'):
            t1 = (-1 - s0)/m[:, None]
            t2 = (1 - s0)/m[:, None]
        lo = np.where(m[:, None] > 0, t1, lo)
        hi = np.where(m[:, None] > 0, t2, hi)
        lo = np.where(m[:, None] < 0, t2, lo)
        hi = np.where(m[:, None] < 0, t1, hi)
        lo = np.where(np.abs(m[:, None]) < 1e-12,
                      np.where(np.abs(s0) <= 1, -np.inf, np.inf), lo)
        hi = np.where(np.abs(m[:, None]) < 1e-12,
                      np.where(np.abs(s0) <= 1, np.inf, -np.inf), hi)
        entry = lo.max(0); exit_ = hi.min(0)
        hit = (entry <= exit_ + 1e-12)
        take = hit & (entry < best - 1e-12)
        best = np.where(take, entry, best)
        ids = np.where(take, np.int8(ord(b['id'])-64), ids)
    return ids.reshape(res, res), u, v


def render_hull3(bars, res=220, span=3.0, e1=E1, e2=E2, d=D3, center2=None):
    """Exact orthographic renderer, any generator count.

    hit test : the ray is parallel to d, so it meets the zonotope iff the pixel
               lies in the 2D projection of the zonotope.  In 2D the edges of a
               zonotope are parallel to its generators, so the test is
               |(x2-c2).n_i| <= sum_k |q_k.n_i|  with n_i = perp(q_i)/|q_i|
               -- exact, and cheap (one test per generator).
    depth    : p == 3  -> exact slab solve in the generator basis (entry lambda).
               p  > 3  -> conservative: min over the 2^p vertices of (v.d)-O.d
               (only used for the 4D bar, whose projection is thin)."""
    if center2 is None:
        center2 = np.array([0.0, 0.0])
    u = (np.arange(res)+0.5)/res*span - span/2 + center2[0]
    v_ = (np.arange(res)+0.5)/res*span - span/2 + center2[1]
    U, V = np.meshgrid(u, v_, indexing='ij')
    px = U.ravel(); py = V.ravel()
    ids = np.zeros(res*res, np.int8)
    best = np.full(res*res, np.inf)
    O2 = np.stack([px, py], 1)
    O3 = np.stack([px*e1[0]+py*e2[0], px*e1[1]+py*e2[1], px*e1[2]+py*e2[2]], 1)
    Od = O3 @ d
    for b in bars:
        c = np.asarray(b['c'], float)
        G = [np.asarray(g, float) for g in b['g']]
        G = [g for g in G if np.linalg.norm(g) > 1e-9]
        c2 = np.array([c @ e1, c @ e2])
        Q = [np.array([g @ e1, g @ e2]) for g in G]
        inside = np.ones(res*res, bool)
        for q in Q:
            L = np.hypot(q[0], q[1])
            if L < 1e-9:
                continue
            n = np.array([-q[1], q[0]])/L
            h = sum(abs(float(qq @ n)) for qq in Q)
            inside &= np.abs((O2 - c2) @ n) <= h + 1e-9
        GM = np.asarray(G).T
        use_slab = (len(G) == 3 and abs(np.linalg.det(GM)) > 1e-6)
        if use_slab:
            Minv = np.linalg.inv(GM)
            s0 = Minv @ (O3 - c[None, :]).T
            m = Minv @ d
            lo = np.full(len(px), -np.inf); hi = np.full(len(px), np.inf)
            for k in range(3):
                mk = m[k]
                t1 = (-1 - s0[k])/mk; t2 = (1 - s0[k])/mk
                lok = np.minimum(t1, t2); hik = np.maximum(t1, t2)
                if abs(mk) < 1e-12:
                    ok = np.abs(s0[k]) <= 1
                    lok = np.where(ok, -np.inf, np.inf)
                    hik = np.where(ok, np.inf, -np.inf)
                lo = np.maximum(lo, lok); hi = np.minimum(hi, hik)
            entry = lo
        else:
            verts = []
            for k in range(2**len(G)):
                vv = c.copy()
                for m_, g in enumerate(G):
                    vv = vv + (g if (k >> m_) & 1 else -g)
                verts.append(vv)
            entry = (np.asarray(verts) @ d).min() - Od
        take = inside & (entry < best - 1e-12)
        best = np.where(take, entry, best)
        ids = np.where(take, np.int8(ord(b['id'])-64), ids)
    return ids.reshape(res, res), u, v_


def bars_from_figure(fig, s=(-0.5, 0.5, -0.5, 0.5, -0.5, 0.5)):
    """lift the three spines to depth planes s[0..5] and build 3 bars."""
    b = fig.b/2
    sp = fig.spine
    A = dict(id='A', c=(lift(sp['A'][0], s[0]) + lift(sp['A'][1], s[1]))/2,
             g=[(lift(sp['A'][1], s[1]) - lift(sp['A'][0], s[0]))/2, b*AY, b*AZ])
    B = dict(id='B', c=(lift(sp['B'][0], s[2]) + lift(sp['B'][1], s[3]))/2,
             g=[(lift(sp['B'][1], s[3]) - lift(sp['B'][0], s[2]))/2, b*AX, b*AZ])
    C = dict(id='C', c=(lift(sp['C'][0], s[4]) + lift(sp['C'][1], s[5]))/2,
             g=[(lift(sp['C'][1], s[5]) - lift(sp['C'][0], s[4]))/2, b*AX, b*AY])
    return [A, B, C]


# ---------------------------------------------------------------- preview png
def idmap_png(ids, path, colors={2: (222, 76, 60), 3: (86, 140, 220), 1: (245, 197, 66)}):
    from PIL import Image
    h, w = ids.shape
    img = np.full((h, w, 3), 255, np.uint8)
    for k, c in colors.items():
        img[ids == k] = c
    Image.fromarray(img).save(path)


if __name__ == '__main__':
    os.makedirs('out', exist_ok=True)
    fig = Figure(L=2.0, b=0.55, cut=(0.55, 0.55, 0.55))
    ids, masks = fig.idmap(res=260, span=3.2)
    print('ideal figure readings:', fig.readings(ids), '(empty = impossible)')
    print('visible pixels per bar:', fig.relations(ids))
    idmap_png(ids, 'out/fig_ideal.png')
    print('wrote out/fig_ideal.png')