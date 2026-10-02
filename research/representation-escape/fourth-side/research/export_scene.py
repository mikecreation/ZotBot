"""
export_scene.py — the film's scene, its verified facts, and the C header.

THE OBJECT (final form)
-----------------------
4D object = 3 bars A,B,C (the LP-solved sculpture: a REAL 3D object whose
orthographic picture is the impossible tribar) + 1 bar D along the 4th axis.

THE CONSTRUCTION USED BY THE FILM
---------------------------------
For a 4D view direction d, the museum is the orthogonal projection of the 4D
object onto the hyperplane H = d^perp, expressed in the orthonormal basis
     ( e1 , e2 , t )      e1,e2 : an image plane perpendicular to d3
                          t = ( -d4*u3 , |d3| ) : unit, in H, perpendicular to e1,e2
When d4 = 0, t = the 4th axis itself: the room's third axis IS the fourth
dimension.  Two facts fall out (both verified below):
  * the 2D picture = the projection of the room along t = the (e1,e2) image,
    and this does not depend on d4 at all -> the impossible figure is FROZEN
    while a bar grows along the line of sight.
"""
import numpy as np, json, itertools, os
import design as D
import sculpture as S
import verify_object as V

L, B = S.L, S.B
SPAN, CENTER, OUT = S.SPAN, S.CENTER, 'out'
MAGIC3 = np.array([1.0, 1.0, 1.0])/np.sqrt(3.0)


def load_bars():
    sol = json.load(open(f'{OUT}/sculpture_lp.json'))
    return sol, [dict(id=b['id'], c=np.array(b['c'], float),
                      g=[np.array(g, float) for g in b['g']]) for b in sol['bars']]


def to_4d(bar, w_c=0.0, w_half=0.0, nub_scale=1.0):
    c4 = np.array([bar['c'][0], bar['c'][1], bar['c'][2], w_c])
    g4 = [np.array([g[0], g[1], g[2], 0.0]) for g in bar['g']]
    if w_half > 0:
        g4 = [np.array([g[0], g[1], g[2], 0.0])*nub_scale for g in bar['g']]
        g4.append(np.array([0.0, 0.0, 0.0, w_half]))
    return dict(id=bar['id'], c=c4, g=g4)


def screen_basis(d):
    d = np.asarray(d, float); d = d/np.linalg.norm(d)
    d3, d4 = d[:3], d[3]
    n3 = np.linalg.norm(d3)
    u3 = d3/n3 if n3 > 1e-12 else np.array([0.0, 0.0, 1.0])
    up = np.array([0.0, 1.0, 0.0])
    if abs(up @ u3) > 0.999:
        up = np.array([0.0, 0.0, 1.0])
    e1 = np.cross(up, u3); e1 /= np.linalg.norm(e1)
    e2 = np.cross(u3, e1)
    t = np.concatenate([-d4*u3, [n3]])
    E1 = np.concatenate([e1, [0.0]]); E2 = np.concatenate([e2, [0.0]])
    return E1, E2, t                      # all three perpendicular to d


def screen3(bar4, d):
    """project a 4D bar into the museum (3 coordinates along E1,E2,t)"""
    E1, E2, t = screen_basis(d)
    c = np.array([bar4['c'] @ E1, bar4['c'] @ E2, bar4['c'] @ t])
    g = [np.array([gg @ E1, gg @ E2, gg @ t]) for gg in bar4['g']]
    return dict(id=bar4['id'], c=c, g=g)


def picture_of(bars4, d, res=140):
    """the 2D picture: project the museum content along t, plus the depth order
       (the museum's t-axis IS the 4th axis when d4 = 0)."""
    E1, E2, t = screen_basis(d)
    bars_m = [screen3(b, d) for b in bars4]
    # rendering along t, with the image basis (E1,E2)
    e1 = np.array([1.0, 0.0, 0.0]); e2 = np.array([0.0, 1.0, 0.0]); dd = np.array([0.0, 0.0, 1.0])
    ids, _, _ = D.render_hull3(bars_m, res=res, span=SPAN, e1=e1, e2=e2, d=dd, center2=CENTER)
    masks = {}
    for b in bars_m:
        m, _, _ = D.render_hull3([b], res=res, span=SPAN, e1=e1, e2=e2, d=dd, center2=CENTER)
        masks[b['id']] = m > 0
    return ids, masks


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    sol, bars3 = load_bars()
    s = np.array(sol['s'])

    # ---- world placement: shift ONLY along the view axis (picture unchanged)
    corners = np.vstack([np.array([b['c'] + sum(tf*g for tf, g in zip(sg, b['g']))
                                   for sg in itertools.product([-1, 1], repeat=3)])
                         for b in bars3])
    # recentre in two steps: (1) remove the big depth offset found by the LP,
    # (2) slide inside the image plane so the figure is centred in frame.
    # Step (2) does not change the picture at all; step (1) keeps the distance
    # to the camera sane (the LP solution lives ~8 units down the view axis).
    shift = corners.mean(0)
    w1 = [dict(id=b['id'], c=b['c']-shift, g=list(b['g'])) for b in bars3]
    c1 = np.vstack([np.array([b['c'] + sum(tf*g for tf, g in zip(sg, b['g']))
                              for sg in itertools.product([-1, 1], repeat=3)]) for b in w1])
    uu = c1 @ D.E1; vv = c1 @ D.E2
    shift = shift + (0.5*(uu.min()+uu.max()))*D.E1 + (0.5*(vv.min()+vv.max()))*D.E2
    world = [dict(id=b['id'], c=b['c'] - shift, g=list(b['g'])) for b in bars3]
    corners = np.vstack([np.array([b['c'] + sum(tf*g for tf, g in zip(sg, b['g']))
                                   for sg in itertools.product([-1, 1], repeat=3)])
                         for b in world])

    print('=== the sculpture (world coords) ===')
    print('  extent', np.round(corners.max(0)-corners.min(0), 3).tolist(),
          ' ymin %.3f' % corners[:, 1].min())

    # ---- F1/F2/F3 on the world bars --------------------------------------
    fig = D.Figure(L=L, b=B, cut=(0, 0, 0))
    ids_ideal, _ = fig.idmap(res=240, span=SPAN, center2=CENTER)
    rids, _, _ = D.render_hull3(world, res=240, span=SPAN, center2=CENTER)
    F1 = float(np.mean(rids == ids_ideal))
    masks = {b['id']: D.render_hull3([b], res=240, span=SPAN, center2=CENTER)[0] > 0
             for b in world}
    F2 = V.readings(rids, masks)
    F3 = V.corner_winners(rids, masks)
    print(f'  F1 picture agreement with the ideal impossible figure : {F1:.5f}')
    print(f'  F2 depth orders that explain the picture              : '
          f'{F2 if F2 else "NONE  -> IMPOSSIBLE PICTURE"}')
    print(f'  F3 corner winners                                     : '
          f'{ {f"{a}{b}": w for (a, b), w in F3.items()} }')
    print(f'     gaps between the bars                              : '
          f'{ {f"{k[0]}{k[1]}": round(v, 3) for k, v in S.min_gap(world).items()} }')

    # ---- the 4D object ----------------------------------------------------
    nub = 0.30
    w_half = 2.6
    host = world[0]
    barD = dict(id='D', c=np.append(host['c'], 0.0),
                g=[np.array([g[0], g[1], g[2], 0.0])*nub for g in host['g']] +
                  [np.array([0.0, 0.0, 0.0, w_half])])
    bars4 = [to_4d(b) for b in world] + [barD]
    for b in bars4:
        b['g'] = [g for g in b['g'] if np.linalg.norm(g) > 1e-9]

    # ---- F5: sweep d4; the picture must be FROZEN, the bar must grow ------
    print()
    print('=== F5: rotating the view into the 4th dimension ===')
    print('   q     |d3|   4th-bar length in the room   picture identical to q=0?'
          '  picture impossible?')
    ref = None
    rows = []
    for q in [0.0, 0.5, 1.0, 1.4, 1.7, 2.0]:
        d = np.array([1.0, 1.0, 1.0, q]); d /= np.linalg.norm(d)
        ids, masks = picture_of(bars4, d, res=150)
        if ref is None:
            ref = ids
        same = float(np.mean(ids == ref))
        imp = (len(V.readings(ids, masks)) == 0)
        bm = screen3(barD, d)
        glen = 2*np.linalg.norm(bm['g'][-1])
        rows.append(dict(q=q, d4=float(d[3]), bar_len=float(glen),
                         frozen=float(same), impossible=bool(imp)))
        print(f'  {q:4.1f}   {np.linalg.norm(d[:3]):.3f}        {glen:.3f}'
              f'                   {same:.4f}                  {imp}')
    json.dump(rows, open(f'{OUT}/scan_4d.json', 'w'), indent=1)

    # ---- F4: census of 3D view directions --------------------------------
    print()
    print('=== F4: how special is the magic direction? ===')
    rng = np.random.default_rng(5)
    n = 300
    V3 = rng.normal(size=(n, 3)); V3 /= np.linalg.norm(V3, axis=1)[:, None]
    cnt = 0; near = 0; near_cnt = 0
    for v in V3:
        ids, masks = picture_of(bars4[:3] + [dict(id='D', c=np.append(host['c'], 0.0),
                                                  g=[np.array([1e-9, 0, 0, 0])])],  # dummy, invisible
                                 np.append(v, 0.0), res=90)
        ok = (len(V.readings(ids, masks)) == 0)
        cnt += ok
        if np.dot(v, MAGIC3) > 0.985:
            near += 1; near_cnt += ok
    print(f'  impossible from {cnt}/{n} = {100*cnt/n:.1f}% of all 3D directions')
    print(f'  within 10 deg of the magic axis: {near_cnt}/{near} impossible')
    json.dump(dict(n=n, impossible=cnt, frac=cnt/n, near=near, near_impossible=near_cnt,
                   F1=F1, F2_none=len(F2) == 0, F3={f'{a}{b}': w for (a, b), w in F3.items()},
                   gap=float(min(S.min_gap(world).values()))),
              open(f'{OUT}/scan_census.json', 'w'), indent=1)

    # ---- export C ---------------------------------------------------------
    def flat(a):
        return ', '.join('%.9ff' % x for x in np.asarray(a, float).ravel())
    L4 = ['/* generated by export_scene.py */', '#ifndef SCENE_VALS_H', '#define SCENE_VALS_H', '']
    L4.append('#define N_BARS4 4')
    L4.append('#define N_BARS3 3')
    L4.append(f'#define BAR_B {B:.6f}f')
    L4.append(f'#define OBJ_SPAN {SPAN:.6f}f')
    L4.append(f'#define NUB_SCALE {nub:.6f}f')
    for k, b in enumerate(bars4):
        L4.append(f'static const float BAR{k}_C[4] = {{ {flat(b["c"])} }};')
        L4.append(f'static const int BAR{k}_NG = {len(b["g"])};')
        for j, g in enumerate(b['g']):
            L4.append(f'static const float BAR{k}_G{j}[4] = {{ {flat(g)} }};')
    L4.append('static const float MAGIC3[3] = { ' + flat(MAGIC3) + ' };')
    L4.append('static const float E1_V[3] = { ' + flat(D.E1) + ' };')
    L4.append('static const float E2_V[3] = { ' + flat(D.E2) + ' };')
    L4.append('static const float OBJ_MIN[3] = { ' + flat(corners.min(0)) + ' };')
    L4.append('static const float OBJ_MAX[3] = { ' + flat(corners.max(0)) + ' };')
    L4.append('static const float OBJ_CENTER[3] = { ' + flat(corners.mean(0)) + ' };')
    L4.append('#endif')
    open('scene_vals.h', 'w').write('\n'.join(L4) + '\n')
    print()
    print('wrote scene_vals.h, out/scan_4d.json, out/scan_census.json')