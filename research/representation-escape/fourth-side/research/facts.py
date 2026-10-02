"""
facts.py — recompute every claim the film makes, with the corrected methods,
and write research/out/facts.json.

  1. the sculpture      : min gap, picture == ideal figure, readings == NONE,
                          corner winner cycle
  2. census of views    : fraction of 3D view directions giving the impossible
                          figure (the rest read as floating bars)
  3. the 4D turn        : for alpha in [0,90], is the picture still impossible,
                          how long is the 4th bar in the room, and is the
                          picture the SAME figure (frozen test: after undoing
                          the cos(alpha) foreshortening, agreement in %)
"""
import numpy as np, json, os, sys, itertools, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design as D
import sculpture as S
import export_scene as E
import verify_object as V

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
MAGIC3 = E.MAGIC3
E1, E2 = np.array(D.E1), np.array(D.E2)
UW = np.array([0.0, 0.0, 0.0, 1.0])
SPAN = E.SPAN


def load_world():
    sol, bars3 = E.load_bars()
    return [dict(id=b['id'], c=np.array(b['c'], float),
                 g=[np.array(g, float) for g in b['g']]) for b in sol['bars']]


def bars4_of(world, nub=0.30, w_half=2.6):
    host = world[0]
    barD = dict(id='D', c=np.append(host['c'], 0.0),
                g=[np.array([g[0], g[1], g[2], 0.0])*nub for g in host['g']]
                  + [np.array([0.0, 0.0, 0.0, w_half])])
    return [E.to_4d(b) for b in world] + [barD]


def basis_of(alpha_deg, beta_deg=0.0):
    """the observer's room frame.

    view axis   T = ( cos(alpha)*ax(beta) , sin(alpha) )
    image axes  R = e1 (fixed),  U = e2 orthogonalised against T
    For beta = 0 the frame is exactly (e1, e2, T): the picture is then literally
    frozen while alpha turns the view into the 4th dimension."""
    b = np.radians(beta_deg)
    ax = np.cos(b)*MAGIC3 + np.sin(b)*E2
    ax = ax/np.linalg.norm(ax)
    a = np.radians(alpha_deg)
    T = np.concatenate([np.cos(a)*ax, [np.sin(a)]])
    R = np.concatenate([E1, [0.0]])
    U = np.concatenate([E2, [0.0]])
    U = U - (U @ T)*T
    U = U/np.linalg.norm(U)
    return R, U, T


def view_frame(v3):
    """orthonormal frame for an ordinary 3-space view direction"""
    v = np.asarray(v3, float); v = v/np.linalg.norm(v)
    up = np.array([0.0, 1.0, 0.0]) if abs(v[1]) < 0.99 else np.array([0.0, 0.0, 1.0])
    e1 = np.cross(up, v); e1 /= np.linalg.norm(e1)
    e2 = np.cross(v, e1)
    return (np.concatenate([e1, [0.0]]), np.concatenate([e2, [0.0]]),
            np.concatenate([v, [0.0]]))


def film_frame(alpha_deg, beta_deg=0.0):
    """EXACTLY the construction fourd.c uses:

       view axis   T  = ax(beta)                     (a real 3-space direction)
       screen axes R  = e1          (fixed)
                   U  = cos(a) e2 + sin(a) u_w       (orthonormalised against T)

    The room's three coordinates of a 4D point are (p.R, p.U, p.T); the bars'
    shadows are those coordinates, and the picture is that shadow seen along
    -T in the (R, U) image plane.  Because R and U never see the w-dependence
    of the three 3-space bars, the figure is frozen while alpha turns the
    screen's up-axis into the fourth dimension."""
    b = math.radians(beta_deg)
    ax = math.cos(b)*MAGIC3 + math.sin(b)*E2
    ax = ax/np.linalg.norm(ax)
    a = math.radians(alpha_deg)
    R = np.concatenate([E1, [0.0]])
    U = np.concatenate([np.cos(a)*E2, [math.sin(a)]])
    T = np.concatenate([ax, [0.0]])
    U = U - float(U @ T)*T
    U = U/np.linalg.norm(U)
    return R, U, T


def room_shadow(bars4, R, U, T, span, res):
    """project the 4D object into the room (dropping its w-coordinate) and
    render it along -T in the (R, U) image plane."""
    sh = []
    for b in bars4:
        c = np.array([b['c'] @ R, b['c'] @ U, b['c'] @ T])
        g = [np.array([gg @ R, gg @ U, gg @ T]) for gg in b['g']]
        g = [x for x in g if np.linalg.norm(x) > 1e-9]
        sh.append(dict(id=b['id'], c=c, g=g))
    e1 = np.array([1.0, 0, 0]); e2 = np.array([0.0, 1, 0]); dd = np.array([0.0, 0, 1.0])
    ids, _, _ = D.render_hull3(sh, res=res, span=span, e1=e1, e2=e2, d=dd,
                               center2=np.array([0.0, 0.0]))
    masks = {b['id']: D.render_hull3([b], res=res, span=span, e1=e1, e2=e2, d=dd,
                                     center2=np.array([0.0, 0.0]))[0] > 0 for b in sh}
    return ids, masks, sh


if __name__ == '__main__':
    world = load_world()
    bars4 = bars4_of(world)
    facts = {}

    # ---- 1. the sculpture -------------------------------------------------
    fig = D.Figure(L=S.L, b=S.B, cut=(0, 0, 0))
    res = 240
    ids_ideal, _ = fig.idmap(res=res, span=SPAN, center2=E.CENTER)
    rb = [E.to_4d(b) for b in world if b['id'] in 'ABC']
    Ra, Ua, Ta = film_frame(0.0, 0.0)
    ids_r, masks_r, _ = room_shadow(rb, Ra, Ua, Ta, SPAN, res)
    agree = float(np.mean(ids_r == ids_ideal))
    readings = V.readings(ids_r, masks_r)
    winners = V.corner_winners(ids_r, masks_r)
    gap = float(min(S.min_gap(world).values()))
    facts['sculpture'] = dict(agreement=agree, readings=readings, gap=gap,
                              winners={f'{a}{b}': (w[0] if w else None)
                                       for (a, b), w in winners.items()},
                              px_overlap={f'{a}{b}': (int((masks_r[a] & masks_r[b]).sum()))
                                          for a, b in itertools.combinations('ABC', 2)})
    print('=== 1. the sculpture ===')
    print(f'  screen picture == the ideal impossible figure : {agree:.5f} agreement')
    print(f'  depth orders that explain the picture         : '
          f'{readings if readings else "NONE  -> IMPOSSIBLE"}')
    print(f'  corner over/under winners                     : {facts["sculpture"]["winners"]}')
    print(f'  minimum gap between bars                      : {gap:.3f}')
    print(f'  pixels contested at each corner               : '
          f'{facts["sculpture"]["px_overlap"]}')

    # ---- 2. census of view directions -------------------------------------
    rng = np.random.default_rng(20251002)
    N = 400
    dirs = rng.normal(size=(N, 3))
    dirs /= np.linalg.norm(dirs, axis=1)[:, None]
    # include the magic axis itself
    dirs[0] = MAGIC3
    cnt = 0
    for v in dirs:
        # the film's census: we keep the camera at the origin looking along a
        # direction v of 3-space (that is beta), with alpha = 0
        R, U, T = film_frame(0.0, 0.0)
        # rotate the VIEW AXIS to v while keeping the room orthonormal
        up = np.array([0.0, 1.0, 0.0]) if abs(v[1]) < 0.99 else np.array([0.0, 0.0, 1.0])
        x = np.cross(up, v); x /= np.linalg.norm(x)
        y = np.cross(v, x)
        Rv = np.concatenate([x, [0.0]]); Uv = np.concatenate([y, [0.0]])
        Tv = np.concatenate([v, [0.0]])
        ids, masks, _ = room_shadow(bars4[:3], Rv, Uv, Tv, SPAN, 90)
        if len(V.readings(ids, masks)) == 0:
            cnt += 1
    facts['census'] = dict(n=N, impossible=int(cnt), frac=cnt/N,
                           readable=N-cnt, readable_frac=(N-cnt)/N)
    print()
    print('=== 2. census of view directions ===')
    print(f'  impossible figure from {cnt}/{N} = {100*cnt/N:.1f}% of directions')
    print(f'  -> from {N-cnt}/{N} = {100*(N-cnt)/N:.1f}% the same object reads as '
          f'three floating bars')

    # ---- 3. the 4D turn ---------------------------------------------------
    print()
    print('=== 3. rotating the observer into the fourth dimension ===')
    print('  alpha | 4th bar in room | picture impossible | frozen (vs alpha=0)')
    ref = None
    sweep = []
    for deg in [0, 10, 20, 30, 45, 60, 75, 88]:
        R, U, T = film_frame(deg, 0.0)
        ids, masks, sh = room_shadow(bars4, R, U, T, SPAN, 150)
        imp = (len(V.readings(ids, masks)) == 0)
        if ref is None:
            ref = ids
        frozen = float(np.mean(ids == ref))
        Lw = 2*np.linalg.norm([b for b in sh if b['id'] == 'D'][0]['g'][-1])
        sweep.append(dict(alpha=deg, bar=float(Lw), impossible=bool(imp),
                          frozen=frozen))
        print(f'   {deg:3d}  |     {Lw:5.2f}       | {str(imp):5s}              | {frozen:.4f}')
    facts['turn'] = sweep

    # the frozen test, done the strict way: identical camera, only alpha turns
    R0, U0, T0 = film_frame(0.0, 0.0)
    ids0, _, _ = room_shadow(bars4, R0, U0, T0, SPAN, 220)
    rows = []
    for deg in [15, 30, 45, 60, 75, 88]:
        R, U, T = film_frame(deg, 0.0)
        ids1, _, _ = room_shadow(bars4, R, U, T, SPAN, 220)
        rows.append(dict(alpha=deg, figure_identical=float(np.mean(ids0 == ids1))))
        print(f'  frozen test  alpha={deg:3d}: figure pixel-identical = '
              f'{100*float(np.mean(ids0==ids1)):.2f}%')
    facts['frozen'] = rows

    # the clean claim: the THREE-bar figure alone is pixel-identical while alpha turns
    rows3 = []
    print()
    print('  three-bar figure only (4th bar removed from the measurement):')
    i0, _, _ = room_shadow(bars4[:3], R0, U0, T0, SPAN, 220)
    for deg in [15, 30, 45, 60, 75, 88]:
        R, U, T = film_frame(deg, 0.0)
        i1, _, _ = room_shadow(bars4[:3], R, U, T, SPAN, 220)
        frac = float(np.mean(i0 == i1))
        rows3.append(dict(alpha=deg, identical=frac))
        nz = int(((i0 > 0) | (i1 > 0)).sum())
        print(f'    alpha={deg:3d}: {100*frac:.3f}% identical   ({nz} object pixels)')
    facts['frozen_three_bars'] = rows3
    facts['foreshortening'] = []
    print()
    print('  undo the cos(alpha) foreshortening and the figure is the same picture:')
    for deg in [15, 30, 45, 60, 75, 88]:
        R, U, T = film_frame(deg, 0.0)
        ca = math.cos(math.radians(deg))
        ids1, _, _ = room_shadow(bars4[:3], R, U/ca, T, SPAN, 220)
        frac = float(np.mean(i0 == ids1))
        facts['foreshortening'].append(dict(alpha=deg, identical=frac))
        print(f'    alpha={deg:3d}: {100*frac:.3f}% identical to the alpha=0 figure')
    j = json.dumps(facts, indent=1)
    open(os.path.join(OUT, 'facts.json'), 'w').write(j)

    json.dump(facts, open(os.path.join(OUT, 'facts.json'), 'w'), indent=1)
    print()
    print('wrote out/facts.json')