"""
solve_lp.py — the definitive solver.  A real 3D sculpture whose render is an
impossible figure, found by linear programming and then verified exactly.

Formulation
-----------
View direction fixed (magic angle) so the image is the tribar.  Depth of the
spine of bar X at parameter t:   z_X(t) = s_{2k} + (s_{2k+1}-s_{2k}) t .
Each bar is a box of half-thickness b/2; its depth extent at parameter t is
z_X(t) +- W  with  W = (b/2) * (|AY.D3| + |AZ.D3|)  (constant).

For two bars whose image shadows overlap ONLY in their corner region:
     shadows disjoint elsewhere  =>  no intersections elsewhere (projection argument)
so separation only has to be enforced in the three corner boxes, where it is a
linear constraint on the six endpoint depths:

        z_front(t) + W  <=  z_back(t') - W      for all t,t' at the box corners

("front" = the bar that must win the corner over/under; the same constraint
delivers BOTH the illusion and the physical non-intersection.)

The winner pattern must be a CYCLE  (B beats A, C beats B, A beats C)  or no
global depth order can explain the picture.
"""
import numpy as np, itertools, json, os
from scipy.optimize import linprog
import design as D

L, B = 2.6, 0.6
SPAN, CENTER = 3.845, np.array([2.6*D.EX[0]*0.7, 0.0])
MARGIN = 0.06


def w_depth():
    return 0.5*B*(abs(float(D.AY @ D.D3)) + abs(float(D.AZ @ D.D3)))


def corner_boxes(res=440):
    fig = D.Figure(L=L, b=B, cut=(0, 0, 0))
    polys = fig.polys()
    u = (np.arange(res)+0.5)/res*SPAN - SPAN/2 + CENTER[0]
    v = (np.arange(res)+0.5)/res*SPAN - SPAN/2
    U, V = np.meshgrid(u, v, indexing='ij')
    pts = np.stack([U.ravel(), V.ravel()], 1)
    masks = {k: D.in_poly(polys[k], pts) for k in 'ABC'}
    out = {}
    for i, j in [('A', 'B'), ('B', 'C'), ('C', 'A')]:
        reg = masks[i] & masks[j]
        P = pts[reg]
        oi, di = fig.spine[i][0], fig.spine[i][1]-fig.spine[i][0]
        oj, dj = fig.spine[j][0], fig.spine[j][1]-fig.spine[j][0]
        ti = ((P-oi) @ di)/(di @ di)
        tj = ((P-oj) @ dj)/(dj @ dj)
        out[(i, j)] = (float(ti.min()), float(ti.max()), float(tj.min()), float(tj.max()))
    return fig, out


def solve():
    fig, boxes = corner_boxes()
    W = w_depth()
    R = 2*W + MARGIN
    print(f'corner half-depth contribution W = {W:.4f}   required separation R = {R:.4f}')

    # variables: s0..s5 (endpoint depths), lo, hi     minimise hi - lo
    NV = 8
    rows, rhs = [], []
    IDX = {'A': 0, 'B': 2, 'C': 4}

    def zc(bar, t):
        r = np.zeros(NV); k = IDX[bar]
        r[k] = 1-t; r[k+1] = t
        return r

    # winner cycle: at corner AB -> B wins; at BC -> C wins; at CA -> A wins
    winners = {('A', 'B'): 'B', ('B', 'C'): 'C', ('C', 'A'): 'A'}
    for key, (a0, a1, b0, b1) in boxes.items():
        front = winners[key]
        back = key[0] if front == key[1] else key[1]
        if front == key[0]:
            tf_r, tb_r = (a0, a1), (b0, b1)
        else:
            tf_r, tb_r = (b0, b1), (a0, a1)
        for tf in tf_r:
            for tb in tb_r:
                rows.append(zc(front, tf) - zc(back, tb)); rhs.append(-R)

    for k in range(6):                       # lo <= s_k <= hi
        lo = np.zeros(NV); lo[k] = -1; lo[6] = 1; rows.append(lo); rhs.append(0)
        hi = np.zeros(NV); hi[k] = 1; hi[7] = -1; rows.append(hi); rhs.append(0)
    c = np.zeros(NV); c[7] = 1; c[6] = -1
    bounds = [(-9, 9)]*8
    res = linprog(c, A_ub=np.array(rows), b_ub=np.array(rhs), bounds=bounds, method='highs')
    assert res.success, res.message
    s = res.x[:6]
    return fig, s, res.x[7]-res.x[6]


def exact_check(fig, s, res=260):
    import verify_object as V
    bars = D.bars_from_figure(fig, s)
    ids, _, _ = D.render_hull3(bars, res=res, span=SPAN, center2=CENTER)
    masks = V.footprints(bars, res, SPAN)
    r = V.readings(ids, masks)
    cw = V.corner_winners(ids, masks)
    g = {}
    for i, j in itertools.combinations(range(3), 2):
        gi, _ = V.pair_gap(bars[i], bars[j]) if hasattr(V, 'pair_gap') else (None, None)
    return bars, ids, r, cw


if __name__ == '__main__':
    os.makedirs('out', exist_ok=True)
    fig, s, spread = solve()
    print('LP solution: s =', np.round(s, 4).tolist(), ' depth spread =', round(spread, 4))

    bars = D.bars_from_figure(fig, s)
    ids_ideal, _ = fig.idmap(res=260, span=SPAN)
    rids, _, _ = D.render_hull3(bars, res=260, span=SPAN, center2=CENTER)
    print('image agreement with the ideal figure: %.5f' % np.mean(rids == ids_ideal))

    import verify_object as V
    rep = V.report(s, res=260)
    D.idmap_png(rids, 'out/sculpt_lp.png')
    json.dump(dict(s=list(map(float, s)), margin=MARGIN, W=w_depth(),
                   bars=[dict(id=b['id'], c=np.asarray(b['c']).tolist(),
                              g=[np.asarray(g).tolist() for g in b['g']]) for b in bars],
                   report=rep),
              open('out/sculpture_lp.json', 'w'), indent=1)
    print('wrote out/sculpture_lp.json + out/sculpt_lp.png')