"""
verify_object.py — the definitive test of the film's central object.

For a candidate 3D sculpture (3 bars) rendered from the magic direction:
  1. render the exact id-map                   (the picture)
  2. compute each bar's own footprint          (what it covers if drawn alone)
  3. compute all 6 global depth orders -> does ANY reproduce the picture?
     -> if none does, the picture is IMPOSSIBLE, i.e. a real 3D object
        casts a picture that no single depth-ordering of its parts can explain.
  4. report the corner over/under cycle        (the cohomology obstruction)
  5. report the minimum gap between bars       (physical validity)
"""
import numpy as np, itertools, json
import design as D
import sculpture as S


def footprints(bars, res, span, e1=D.E1, e2=D.E2, d=D.D3, center2=S.CENTER):
    masks = {}
    for b in bars:
        ids, _, _ = D.render_hull3([b], res=res, span=span,
                                       e1=e1, e2=e2, d=d, center2=center2)
        masks[b['id']] = ids > 0
    return masks


def readings(ids, masks):
    ok = []
    for order in itertools.permutations('ABC'):
        comp = np.zeros_like(ids)
        for nid in reversed(order):
            comp = np.where(masks[nid], np.int8(ord(nid)-64), comp)
        if np.array_equal(comp, ids):
            ok.append('>'.join(order) + '  (leftmost = frontmost)')
    return ok


def corner_winners(ids, masks):
    """for each pair corner: which bar owns the majority of the shared region"""
    out = {}
    for i, j in itertools.combinations('ABC', 2):
        reg = masks[i] & masks[j]
        if reg.sum() == 0:
            out[(i, j)] = None
            continue
        ni = int(np.sum(reg & (ids == ord(i)-64)))
        nj = int(np.sum(reg & (ids == ord(j)-64)))
        out[(i, j)] = (i if ni > nj else j, ni, nj)
    return out


def pair_gap(barA, barB):
    """min separation (approx) between two bars + the argmin point"""
    P = S.sample_bar(barA, 13)
    c, G = np.asarray(barB['c'], float), [np.asarray(x, float) for x in barB['g']]
    planes = D.facets(c, G)
    d = np.full(len(P), -1e9)
    for n, h in planes:
        d = np.maximum(d, (P - c) @ n - h)
    k = int(np.argmin(d))
    return float(d[k]), P[k]


def report(s, res=200, span=S.SPAN, verbose=True):
    fig = D.Figure(L=S.L, b=S.B, cut=(0, 0, 0))
    bars = D.bars_from_figure(fig, s)
    ids, _, _ = D.render_hull3(bars, res=res, span=span, center2=S.CENTER)
    masks = footprints(bars, res, span)
    r = readings(ids, masks)
    cw = corner_winners(ids, masks)
    g = S.min_gap(bars)
    gmin = min(g.values())
    if verbose:
        print(f'depth profile s = {np.round(s,3).tolist()}')
        print(f'gap between bars  = {gmin:+.3f}   (must be > 0)   {[(k, round(v,3)) for k,v in g.items()]}')
        cyc = ' -> '.join(f'{w[0]} beats {a}{b}' for (a, b), w in cw.items() if w)
        print(f'corner winners    : {cyc}')
        print(f'global readings   : {r if r else "NONE — the picture is IMPOSSIBLE"}')
    return dict(s=list(map(float, s)), readings=r, winners={f'{k[0]}{k[1]}': (v[0] if v else None) for k, v in cw.items()},
                min_gap=float(gmin), gaps={f'{k[0]}{k[1]}': float(v) for k, v in g.items()})


if __name__ == '__main__':
    sol = json.load(open('out/sculpture.json'))
    print('=== SOLUTION FOUND BY THE SEARCH ===')
    rep = report(np.array(sol['s']), res=200)
    print()
    print('=== known-good reference: plain 3D staircase (should be READABLE) ===')
    report(np.array([0.0, 1.5, 1.5, 3.0, 3.0, 4.5]), res=200)
    print()
    print('=== the pentagonal variant (2D figure: 5 joints) ===')
    # sanity: superposition theorem says we may treat 2D pentagon figure the same way