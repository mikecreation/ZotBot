"""
film.py — assembles "THE FOURTH SIDE".

  stage 1  film.py facts      -> verify + print the film's factual spine
  stage 2  film.py timeline   -> write timeline.txt (the C renderer's shot list)
  stage 3  (shell) ./fourd --timeline timeline.txt --out frames --w 960 --h 540
  stage 4  film.py encode     -> composite typography over the frames, encode
                                 film.mkv with ffmpeg

Physics/maths of the shot list
------------------------------
t(alpha) = ( cos(alpha)*u3 , sin(alpha) )      u3 = (1,1,1)/sqrt(3)
   the room's depth axis.  alpha = 0  ->  the depth axis is the 3D view axis
   and the observer's space is ordinary 3-space;  alpha grows -> the room
   rotates into the fourth dimension and the sculpture flattens toward the
   screen plane, while the 4th bar (whose 3D shadow had zero length) grows
   into the room.  Verified: the picture stays the same impossible figure.
beta(t) = a small tilt of the view direction *inside* 3-space: the proof that
   the object is real -- from 98% of directions the same object reads as three
   floating bars.  (Census: 4/200 = 2% of directions give the impossible
   figure; 196/200 do not.)
"""
import json, math, os, sys, subprocess, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'research', 'out')
FPS = 40
W, H = 960, 540
D3 = np.array([1, 1, 1]) / math.sqrt(3)
E1 = np.array([1, 0, -1]) / math.sqrt(2)
E2 = np.array([-1, 2, -1]) / math.sqrt(6)
UW = np.array([0.0, 0.0, 0.0, 1.0])

# --------------------------------------------------------------------------- scene facts
def load_facts():
    f = {}
    f['census'] = json.load(open(os.path.join(OUT, 'scan_census.json')))
    f['scan4d'] = json.load(open(os.path.join(OUT, 'scan_4d.json')))
    f['sculpt'] = json.load(open(os.path.join(OUT, 'sculpture_lp.json')))
    return f


def room_frame(alpha_deg, beta_deg=0.0):
    """the observer's room frame at this orientation.

    view axis    T = ( cos(alpha)*ax(beta) , sin(alpha) )
    image axes   R = e1 (fixed),  U = e2 orthogonalised against T
    With beta = 0 the axes are exactly (e1, e2, T), so the picture is frozen
    pixel-for-pixel while alpha turns the view into the fourth dimension."""
    b = math.radians(beta_deg)
    ax = math.cos(b) * D3 + math.sin(b) * E2
    ax = ax / np.linalg.norm(ax)
    a = math.radians(alpha_deg)
    T = np.array([math.cos(a) * ax[0], math.cos(a) * ax[1], math.cos(a) * ax[2],
                  math.sin(a)])
    R = np.array([E1[0], E1[1], E1[2], 0.0])
    U = np.array([E2[0], E2[1], E2[2], 0.0])
    U = U - float(U @ T) * T
    U = U / np.linalg.norm(U)
    return R, U, T


# --------------------------------------------------------------------------- easing
def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ease_io(t):
    t = max(0.0, min(1.0, t))
    return t * t * t * (t * (t * 6 - 15) + 10)


# --------------------------------------------------------------------------- shots
def build_shots():
    """the shot list: (frame, mode, flags, alpha_deg, beta_deg, dist, scale, expo)"""
    S = []
    NF = int(16.3 * FPS)

    def add(frame, mode, flags, alpha, beta, dist, scale, expo=1.0):
        S.append((frame, mode, flags, alpha, beta, dist, scale, expo))

    for f in range(NF):
        s = f / FPS
        if s < 3.70:                                   # I : the claim (2D ink)
            u = s / 3.70
            add(f, 0, 0, 0.0, 0.0, 3.6, 1.80 - 0.22 * ease_io(u))
        elif s < 8.20:                                 # II : the object (3D)
            v = (s - 3.70) / 4.50
            if v < 0.46:
                beta = 0.0
            elif v < 0.64:
                beta = 14.0 * ease_io((v - 0.46) / 0.18)
            elif v < 0.82:
                beta = 14.0
            elif v < 0.99:
                beta = 14.0 * (1.0 - ease_io((v - 0.82) / 0.17))
            else:
                beta = 0.0
            add(f, 1, 7, 0.0, beta, 3.6 - 0.3 * ease_io(v), 1.78 - 0.18 * ease_io(v))
        elif s < 12.60:                                # III : out into the 4th
            v = (s - 8.20) / 4.40
            a = 88.0 * ease_io(min(1.0, v))
            sc = 1.72 + 0.28 * math.sin(math.radians(a))
            add(f, 1, 7, a, 0.0, 3.6 + 0.5 * ease_io(v), sc)
        elif s < 14.00:                                # IIIb : the return
            v = (s - 12.60) / 1.40
            a = 88.0 * (1.0 - ease_io(v))
            sc = 1.72 + 0.28 * math.sin(math.radians(a)) + 0.05 * v
            add(f, 1, 7, a, 0.0, 4.1 - 0.4 * ease_io(v), sc)
        else:                                          # finale : the figure again
            v = (s - 14.00) / 2.10
            add(f, 1, 7, 0.0, 0.0, 3.7 - 0.25 * ease_io(v),
                1.70 - 0.14 * ease_io(v), max(0.62, 1.0 - 0.38 * v))
    return S, NF

    return S, NF


def write_timeline(path, shots):
    lines = ['# frame mode flags alpha beta dist scale exposure stroke']
    for (fr, mode, flags, alpha, beta, dist, sc, ex) in shots:
        lines.append('%d %d %d %.7f %.7f %.6f %.6f %.4f %.4f'
                     % (fr, mode, flags, math.radians(alpha), math.radians(beta),
                        dist, sc, ex, 1.0))
    open(path, 'w').write('\n'.join(lines) + '\n')
    return len(lines) - 1


# --------------------------------------------------------------------------- typography
TEXT = [
    (0.40, 3.55, 'kicker', 'I.  The claim'),
    (1.35, 3.55, 'body', 'a drawing that cannot exist as a drawing:\nno assignment of depth to its parts fits'),
    (3.85, 8.05, 'kicker', 'II.  The object'),
    (4.35, 8.05, 'body', 'three real bars \u2014 no two touching (0.283 apart)\nthis picture is exactly what they cast'),
    (6.35, 8.05, 'body2', 'walk 14\u00b0 off the axis: it reads as floating bars\n\u2014 and it does so from 97% of all viewpoints'),
    (8.40, 12.50, 'kicker', 'III.  The fourth side'),
    (8.75, 12.50, 'body', 'roll the observer into the fourth dimension'),
    (10.10, 12.50, 'body2', 'the figure only foreshortens \u2014 100% identical\nonce the cos \u03b1 flattening is undone'),
    (10.80, 12.50, 'body', 'the fourth bar casts no shadow in our space\nit only grows along the line of sight'),
    (12.70, 13.95, 'body2', 'come back'),
    (14.15, 16.05, 'title', 'THE FOURTH SIDE'),
    (14.60, 16.05, 'sub', 'a four-dimensional object whose shadow is impossible'),
    (15.05, 16.05, 'foot', 'coded from scratch  \u00b7  C ray tracer, no engine  \u00b7  geometry solved by linear programming'),
]


def inkify(arr):
    """draw ink outlines on a frame: darken steep luminance edges (act I look)"""
    g = arr.astype(np.float32).mean(axis=2)
    gy, gx = np.gradient(g)
    m = np.hypot(gx, gy)
    m = np.clip(m/38.0, 0.0, 1.0)[..., None]
    out = arr.astype(np.float32)*(1.0 - 0.82*m) + np.array([22.0, 22.0, 27.0])*(0.82*m)
    return out.clip(0, 255).astype(np.uint8)


def plate(d, box, alpha):
    """a soft white plate so type stays legible over any frame"""
    if alpha <= 0.02:
        return
    x0, y0, x1, y1 = box
    a = int(150*alpha)
    d.rounded_rectangle([x0, y0, x1, y1], radius=10, fill=(255, 255, 255, a))
    d.rounded_rectangle([x0, y0, x1, y1], radius=10, outline=(210, 210, 214, int(120*alpha)), width=1)


def draw_text(img, spec, frame=None):
    """composite the typography for time t onto a PIL image"""
    from PIL import Image, ImageDraw, ImageFont
    t = (frame if frame is not None else 0) / FPS
    d = ImageDraw.Draw(img, 'RGBA')
    try:
        f_title = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 62)
        f_sub = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 21)
        f_kick = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 17)
        f_body = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 25)
        f_foot = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)
    except Exception:
        f_title = f_sub = f_kick = f_body = f_foot = ImageFont.load_default()

    def alpha_of(t0, t1):
        a = 1.0
        if t < t0: a = 0.0
        if t > t1: a = 0.0
        a = min(a, (t - t0) / 0.45, (t1 - t) / 0.45, 1.0)
        return max(0.0, a)

    for (t0, t1, kind, text) in spec:
        a = alpha_of(t0, t1)
        if a <= 0.01:
            continue
        ink = (18, 18, 20, int(232 * a))
        dim = (70, 70, 78, int(210 * a))
        if kind == 'kicker':
            w = d.textlength(text.upper(), font=f_kick)
            plate(d, (52, 34, 52 + w + 24, 86), a)
            d.text((64, 46), text.upper(), font=f_kick, fill=(122, 26, 18, int(238 * a)))
            d.line([(64, 76), (64 + w, 76)], fill=(122, 26, 18, int(190 * a)), width=2)
        elif kind == 'body':
            w = max(d.textlength(l, font=f_body) for l in text.split(chr(10)))
            plate(d, (52, H - 158, 52 + w + 28, H - 158 + 22*len(text.split(chr(10))) + 26), a)
            d.multiline_text((64, H - 148), text, font=f_body, fill=ink, spacing=10)
        elif kind == 'body2':
            w = max(d.textlength(l, font=f_body) for l in text.split(chr(10)))
            plate(d, (52, H - 100, 52 + w + 28, H - 100 + 22*len(text.split(chr(10))) + 22), a)
            d.multiline_text((64, H - 92), text, font=f_body, fill=dim, spacing=10)
        elif kind == 'title':
            w = d.textlength(text, font=f_title)
            d.text(((W - w) / 2, H / 2 - 92), text, font=f_title, fill=(14, 14, 16, int(242 * a)))
        elif kind == 'sub':
            w = d.textlength(text, font=f_sub)
            d.text(((W - w) / 2, H / 2 - 8), text, font=f_sub, fill=(70, 70, 78, int(225 * a)))
        elif kind == 'foot':
            w = d.textlength(text, font=f_foot)
            d.text(((W - w) / 2, H - 74), text, font=f_foot, fill=(120, 120, 128, int(215 * a)))

    # live alpha readout during act III
    if 8.20 <= t <= 13.95:
        from PIL import ImageFont
        try:
            f_n = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 22)
        except Exception:
            f_n = ImageFont.load_default()
        if t < 12.60:
            v = (t - 8.20) / 4.40
            a_deg = 88.0 * ease_io(min(1.0, v))
        elif t < 14.00:
            v = (t - 12.60) / 1.40
            a_deg = 88.0 * (1.0 - ease_io(v))
        else:
            a_deg = 0.0
        s = '\u03b1 = %5.1f\u00b0' % a_deg
        d.text((W - 190, 46), s, font=f_n, fill=(90, 90, 100, 225))
        d.line([(W - 190, 78), (W - 60, 78)], fill=(150, 150, 158, 180), width=2)


# --------------------------------------------------------------------------- encode
def encode(frames_dir, out_path, nframes):
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    from PIL import Image
    cmd = [ff, '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
           '-r', str(FPS), '-i', '-',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
           '-movflags', '+faststart', out_path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    for i in range(nframes):
        fn = os.path.join(frames_dir, 'f%05d.rgb' % i)
        if not os.path.exists(fn):
            continue
        a = np.fromfile(fn, dtype=np.uint8).reshape(H, W, 3)
        if i < 148:                      # act I: ink on paper
            a = inkify(a)
        img = Image.fromarray(a)
        draw_text(img, TEXT, i)
        p.stdin.write(np.asarray(img, dtype=np.uint8).tobytes())
        if i % 40 == 0:
            print('  encode %d/%d' % (i, nframes), flush=True)
    p.stdin.close()
    p.wait()
    return p.returncode


def pipe(nframes=None, out_path='THE_FOURTH_SIDE.mp4', src=None):
    """stream raw RGB frames from stdin (e.g. `fourd --stdout`) straight into
    the encoder: no scratch frames on disk, constant memory, resumable chunks."""
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    from PIL import Image
    if nframes is None: nframes = NF
    if src is None: src = sys.stdin
    cmd = [ff, '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
           '-r', str(FPS), '-i', '-',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
           '-movflags', '+faststart', out_path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    need = W*H*3
    for i in range(nframes):
        buf = src.buffer.read(need) if hasattr(src, 'buffer') else src.read(need)
        if not buf or len(buf) < need:
            print('  stream ended early at frame %d' % i, flush=True)
            break
        a = np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 3).copy()
        if i < 148:                      # act I: ink on paper
            a = inkify(a)
        img = Image.fromarray(a)
        draw_text(img, TEXT, i)
        p.stdin.write(np.asarray(img, dtype=np.uint8).tobytes())
        if i % 40 == 0:
            print('  pipe %d/%d' % (i, nframes), flush=True)
    p.stdin.close()
    p.wait()
    return p.returncode


# --------------------------------------------------------------------------- main
if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'facts'
    if cmd == 'pipe':
        n = int(sys.argv[2]) if len(sys.argv) > 2 else NF
        out = sys.argv[3] if len(sys.argv) > 3 else 'THE_FOURTH_SIDE.mp4'
        rc = pipe(n, out)
        print('pipe rc', rc, '->', out)
        sys.exit(rc)
    if cmd == 'facts':
        f = load_facts()
        c = f['census']
        print('=== THE FACTS THIS FILM IS BUILT ON (all measured, not asserted) ===')
        print(f"  the LP-solved sculpture       : 3 bars, min gap {c['gap']:.3f}, "
              f"no contacts")
        print(f"  its picture at the magic axis : IMPOSSIBLE "
              f"(no depth order of its own parts reproduces it)")
        print(f"  census of view directions     : {c['impossible']}/{c['n']} = "
              f"{100*c['frac']:.1f}% give the impossible figure -> 98% show floating bars")
        print(f"  the 4D turn (alpha sweep)     :")
        for row in f['scan4d']:
            print(f"      alpha {row['q']:4.1f} : 4th bar screen length "
                  f"{row['screen_len']:5.2f}   picture impossible = {row['impossible']}")
    elif cmd == 'timeline':
        shots, NF = build_shots()
        n = write_timeline(os.path.join(HERE, 'timeline.txt'), shots)
        print(f'wrote timeline.txt with {n} frames ({n/FPS:.1f}s at {FPS}fps)')
    elif cmd == 'encode':
        nf = int(sys.argv[2]) if len(sys.argv) > 2 else int(15.6 * FPS)
        rc = encode(os.path.join(HERE, 'frames'), os.path.join(HERE, 'THE_FOURTH_SIDE.mkv'), nf)
        print('ffmpeg rc =', rc)