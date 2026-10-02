"""
sculpture.py — solve for the REAL 3D object that renders as the impossible figure.

Freedom exploited:  an orthographic projection forgets one coordinate.
Slide any point of a bar along the view direction and its image does not move.
So the three bars can be tilted in depth however we like *without touching the
picture* -- we spend that freedom to make the corner overlaps come out in the
cyclic (impossible) order, and to keep the bars from intersecting.

Outputs: out/sculpture.json  (bars as zonotope generators)
         out/sculpt_magic.png, out/sculpt_off.png  (previews to eyeball)
"""
import numpy as np, json, itertools, os
import design as D

L, B = 2.6, 0.6
SPAN = 3.9


fig0 = D.Figure(L=L, b=B, cut=(0, 0, 0))
_u = (np.arange(400)+0.5)/400*SPAN - SPAN/2
_uu, _vv = np.meshgrid(_u, _u, indexing='ij')
_m = {k: D.in_poly(p, np.stack([_uu.ravel(), _vv.ravel()], 1))
      for k, p in fig0.polys().items()}
_any = _m['A'] | _m['B'] | _m['C']
CENTER = np.array([0.0, 0.0])   # the object is recentred on the origin


def agreement(fig, ids_ref, s, res):
    bars = D.bars_from_figure(fig, s)
    rids, _, _ = D.render_zonotopes(bars, res=res, span=SPAN, center2=CENTER)
    ids_r, _ = fig.idmap(res=res, span=SPAN)
    return np.mean(rids == ids_r), bars


def sample_bar(b, n=9):
    c, g = np.asarray(b['c'], float), [np.asarray(x, float) for x in b['g']]
    t = np.linspace(-1, 1, n)
    T = np.stack(np.meshgrid(t, t, t, indexing='ij'), -1).reshape(-1, 3)
    return c + T @ np.array(g)


def min_gap(bars):
    """smallest surface separation between every pair of bars (approx)."""
    gaps = {}
    for i, j in itertools.combinations(range(3), 2):
        P = sample_bar(bars[i], 11)
        c, G = np.asarray(bars[j]['c'], float), [np.asarray(x, float) for x in bars[j]['g']]
        d = -1e9
        for n, h in D.facets(c, G):
            d = np.maximum(d, (P - c) @ n - h)
        gaps[(bars[i]['id'], bars[j]['id'])] = float(d.min())
    return gaps


def depth_spread(b):
    c, G = np.asarray(b['c'], float), [np.asarray(x, float) for x in b['g']]
    return abs(sum(g @ D.D3 for g in G))


if __name__ == '__main__':
    os.makedirs('out', exist_ok=True)
    fig = D.Figure(L=L, b=B, cut=(0.0, 0.0, 0.0))
    ids_ref, masks = fig.idmap(res=170, span=SPAN)
    print('ideal figure readings :', fig.readings(ids_ref, masks), ' ([] = impossible)')

    # ---- search the 6 endpoint depths -------------------------------------
    rng = np.random.default_rng(7)
    candidates = []
    # a) the plain staircase (known: acyclic)
    candidates.append(np.array([0.0, 1.5, 1.5, 3.0, 3.0, 4.5]))
    # b) uniform tilt  near -> far along the loop
    for Dd in (1.0, 1.4, 1.8, 2.2):
        candidates.append(np.array([0.0, Dd, 0.0, Dd, 0.0, Dd]))
    # c) random
    for _ in range(300):
        candidates.append(rng.uniform(-0.5, 5.0, 6))

    results = []
    for s in candidates:
        sc, bars = agreement(fig, ids_ref, s, res=110)
        results.append((sc, s))
    results.sort(key=lambda r: -r[0])
    print('top scores:', [round(r[0], 4) for r in results[:6]])

    # ---- coordinate-descent polish on the best 5 --------------------------
    finals = []
    for sc0, s0 in results[:5]:
        s = s0.copy()
        step = 0.5
        best = agreement(fig, ids_ref, s, res=150)[0]
        for it in range(60):
            improved = False
            for k in range(6):
                for dlt in (step, -step):
                    t = s.copy(); t[k] += dlt
                    sc, _ = agreement(fig, ids_ref, t, res=150)
                    if sc > best + 1e-9:
                        best, s, improved = sc, t, True
            if not improved:
                step *= 0.5
                if step < 0.02:
                    break
        finals.append((best, s))
    finals.sort(key=lambda r: -r[0])
    print('polished:', [(round(a, 5), np.round(b, 3).tolist()) for a, b in finals[:4]])

    # ---- pick a winner: perfect match, biggest gaps, compact depth --------
    pick = None
    for sc, s in finals:
        if sc < 0.999:
            continue
        bars = D.bars_from_figure(fig, s)
        g = min_gap(bars)
        gmin = min(g.values())
        spread = max(D.lift([0, 0], s[i*2]).dot(D.D3) for i in range(3))
        score = gmin - 0.02*spread
        if pick is None or score > pick[0]:
            pick = (score, sc, s, bars, g, gmin)
    if pick is None:
        print('!!! no exact match found, best =', finals[0][0])
        sc, s = finals[0]
        bars = D.bars_from_figure(fig, s)
        pick = (0, sc, s, bars, min_gap(bars), min(min_gap(bars).values()))

    score, sc, s, bars, gaps, gmin = pick
    print(f'CHOSEN   agreement={sc:.5f}  min gap between bars={gmin:.3f}  depths={np.round(s,3).tolist()}')
    for k, v in gaps.items():
        print(f'   gap {k}: {v:.3f}')

    # final high-res verification
    a216, bars = agreement(fig, ids_ref, s, res=216)
    print(f'high-res (216) agreement: {a216:.5f}')
    rids, _, _ = D.render_zonotopes(bars, res=216, span=SPAN, center2=CENTER)
    ids_r, m_r = fig.idmap(res=216, span=SPAN)

    # ---- what does the sculpture look like from the WRONG direction? ------
    def rot_view(deg, axis=0):
        a = np.radians(deg)
        R = {'x': np.array([[1,0,0],[0,np.cos(a),-np.sin(a)],[0,np.sin(a),np.cos(a)]]),
             'y': np.array([[np.cos(a),0,np.sin(a)],[0,1,0],[-np.sin(a),0,np.cos(a)]]),
             'z': np.array([[np.cos(a),-np.sin(a),0],[np.sin(a),np.cos(a),0],[0,0,1]])}[axis]
        return R @ D.E1, R @ D.E2, R @ D.D3

    e1, e2, d = rot_view(14, 'y')
    rids14, _, _ = D.render_zonotopes(bars, res=216, span=SPAN, e1=e1, e2=e2, d=d, center2=CENTER)

    D.idmap_png(rids, 'out/sculpt_magic.png')
    D.idmap_png(rids14, 'out/sculpt_off.png')
    # side view: how the three bars look separated
    e1, e2, d = rot_view(65, 'y')
    rids65, _, _ = D.render_zonotopes(bars, res=216, span=SPAN, e1=e1, e2=e2, d=d, center2=CENTER)
    D.idmap_png(rids65, 'out/sculpt_side.png')

    # ---- save ------------------------------------------------------------
    json.dump(dict(L=L, b=B, s=list(map(float, s)),
                   bars=[dict(id=b['id'], c=np.asarray(b['c']).tolist(),
                              g=[np.asarray(x).tolist() for x in b['g']]) for b in bars],
                   agreement=float(a216), min_gap=float(gmin),
                   gaps={f'{k[0]}-{k[1]}': float(v) for k, v in gaps.items()}),
              open('out/sculpture.json', 'w'), indent=1)

    # export the 2D figure too (for Act I: ink + overlay)
    polys = {k: v.tolist() for k, v in fig.polys().items()}
    json.dump(dict(L=L, b=B, span=SPAN, polys=polys,
                   spines={k: [p.tolist() for p in fig.spine[k]] for k in 'ABC'},
                   P=[p.tolist() for p in fig.P]),
              open('out/fig2d.json', 'w'), indent=1)
    print('wrote out/sculpture.json + out/fig2d.json + previews')