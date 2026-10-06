# Version 3's moving cloud tiles, by day (2026-10-05): sky-tiles.py's layout, with the clouds cut from the
# day film's own transparent frames (daysky/out) instead of keyed out of the night film. The alpha is the
# render's; the colour is the render's, lifted toward white with distance (far palest).
#   python day-tiles.py <outDir> [--sheet <preview.jpg>]
import sys, os
import numpy as np
from PIL import Image, ImageFilter

D = 'C:/Work/domin8te-build/daysky/out/'
OUT = sys.argv[1]
SHEET = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
A = 'C:/Work/domin8te-media/assets/'


def key(path, floor):
    """the render's own cover; the colour lifted toward white by floor (0: as rendered, 1: white)"""
    im = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32) / 255
    c = im[..., :3] * (1 - floor) + floor
    return np.dstack([c, im[..., 3]])


def pieces(rgba, min_px=1800, pad=24):
    """separate clouds: connected areas of cover on a coarse grid, returned as padded crops"""
    a = rgba[..., 3]
    s = 8
    h, w = a.shape
    g = a[:h - h % s, :w - w % s].reshape(h // s, s, w // s, s).max(axis=(1, 3)) > .06
    lab = np.zeros(g.shape, np.int32)
    n = 0
    for y in range(g.shape[0]):
        for x in range(g.shape[1]):
            if g[y, x] and not lab[y, x]:
                n += 1
                st = [(y, x)]
                lab[y, x] = n
                while st:
                    cy, cx = st.pop()
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            yy, xx = cy + dy, cx + dx
                            if 0 <= yy < g.shape[0] and 0 <= xx < g.shape[1] and g[yy, xx] and not lab[yy, xx]:
                                lab[yy, xx] = n
                                st.append((yy, xx))
    out = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(ys) * s * s < min_px:
            continue
        y0, y1 = max(0, ys.min() * s - pad), min(h, (ys.max() + 1) * s + pad)
        x0, x1 = max(0, xs.min() * s - pad), min(w, (xs.max() + 1) * s + pad)
        crop = rgba[y0:y1, x0:x1].copy()
        # a cloud cut by the frame's edge gets a soft edge there instead of a straight one
        ch, cw = crop.shape[:2]
        f = 90
        if y1 >= h - 2:
            crop[..., 3] *= np.clip((ch - 1 - np.arange(ch)) / f, 0, 1)[:, None]
        if x0 <= 1:
            crop[..., 3] *= np.clip(np.arange(cw) / f, 0, 1)[None, :]
        if x1 >= w - 2:
            crop[..., 3] *= np.clip((cw - 1 - np.arange(cw)) / f, 0, 1)[None, :]
        if y0 <= 1:
            crop[..., 3] *= np.clip(np.arange(ch) / f, 0, 1)[:, None]
        out.append({'img': crop, 'box': (x0, y0, x1, y1), 'area': int(len(ys) * s * s)})
    return out


def to_im(rgba):
    return Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8))


def place(tile, piece, x, y, scale, flip=False, blur=0, alpha=1.0):
    im = to_im(piece['img'])
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if scale != 1:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    if alpha != 1:
        r, g, b, a = im.split()
        a = a.point(lambda v: int(v * alpha))
        im = Image.merge('RGBA', (r, g, b, a))
    assert x >= 0 and y >= 0 and x + im.width <= tile.width and y + im.height <= tile.height, \
        'piece crosses the tile edge at %d,%d size %dx%d' % (x, y, im.width, im.height)
    tile.alpha_composite(im, (x, y))
    return im.size


def biggest(lst, k=0):
    return sorted(lst, key=lambda p: -p['area'])[k]


def top_most(lst):
    return sorted(lst, key=lambda p: p['box'][1])[0]


src = {}
for floor, tag in ((.42, 'far'), (.22, 'mid'), (.08, 'near')):
    src[tag] = {
        'f12': pieces(key(D + 'a/f0012.png', floor)),
        'f20': pieces(key(D + 'a/f0020.png', floor)),
        'f24': pieces(key(D + 'a/f0024.png', floor)),
        'f108': pieces(key(D + 'b/f0012.png', floor)),
        'f114': pieces(key(D + 'b/f0018.png', floor)),
        'f120': pieces(key(D + 'b/f0024.png', floor)),
        'sa': pieces(key(D + 'still-a.png', floor)),
        'sb': pieces(key(D + 'still-b.png', floor)),
    }
for k, v in src['mid'].items():
    print(k, [(p['box'], p['area']) for p in sorted(v, key=lambda p: -p['area'])[:5]])

# ---- far: small clouds, palest, a little soft ----
far = Image.new('RGBA', (2400, 1600), (0, 0, 0, 0))
F = src['far']
place(far, top_most(F['f20']), 120, 140, .9, blur=1.2, alpha=.95)
place(far, top_most(F['f108']), 1380, 420, 1.0, flip=True, blur=1.2, alpha=.95)
place(far, top_most(F['f114']), 520, 980, .8, blur=1.2, alpha=.9)
place(far, biggest(F['f12']), 1350, 1180, .55, flip=True, blur=1.4, alpha=.85)

# ---- mid: the long floating clouds ----
mid = Image.new('RGBA', (2800, 2000), (0, 0, 0, 0))
M = src['mid']
place(mid, top_most(M['sa']), 1500, 180, .8, blur=.6)
place(mid, top_most(M['sb']), 160, 1080, .85, flip=True, blur=.6)
place(mid, biggest(M['f20']), 1500, 1520, .5, blur=.8, alpha=.85)

# ---- near: soft banks, out of focus ----
near = Image.new('RGBA', (3200, 2400), (0, 0, 0, 0))
N = src['near']
place(near, biggest(N['f24']), 100, 260, .95, blur=3.0, alpha=.92)
place(near, biggest(N['f120']), 1560, 1500, .95, flip=True, blur=3.0, alpha=.92)

os.makedirs(OUT, exist_ok=True)
for name, t in (('far', far), ('mid', mid), ('near', near)):
    p = os.path.join(OUT, 'dx-cloud-%s.webp' % name)
    t.save(p, 'WEBP', quality=80, method=6, alpha_quality=80)
    print(p, t.size, os.path.getsize(p), 'bytes')

if SHEET:
    # the three tiles over the pale sky and over the beat's blue, at their display proportions
    out = []
    for top, bot in (((190, 214, 241), (236, 230, 221)), ((63, 134, 218), (214, 228, 242))):
        bg = Image.new('RGBA', (1600, 900))
        for y in range(900):
            t = y / 899
            col = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,)
            bg.paste(col, (0, y, 1600, y + 1))
        for t, h in ((far, 900), (mid, 1125), (near, 1440)):
            w = int(t.width * h / t.height)
            tt = t.resize((w, h), Image.LANCZOS)
            for ox in range(-200, 1600, w):
                for oy in range(-150, 900, h):
                    bg.alpha_composite(tt, (ox, oy)) if ox >= 0 and oy >= 0 else bg.alpha_composite(tt.crop((max(0, -ox), max(0, -oy), w, h)), (max(0, ox), max(0, oy)))
        out.append(bg.convert('RGB'))
    sh = Image.new('RGB', (1600, 1810), (60, 60, 60))
    sh.paste(out[0], (0, 0)); sh.paste(out[1], (0, 910))
    sh.save(SHEET, quality=84)
    print(SHEET)
