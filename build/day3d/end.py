# The day film's ending, done after the render (version 3). Each graded frame of the full pass is laid on
# the page's cream; from F_DIM0 the kitchen dissolves into the cream, and the ribbon is laid back over it
# from the ribbon-only pass in the same measure, so the line stays whole while the room goes.
#   python end.py <graded full pass dir> <graded ribbon-only dir> <out dir>
import sys, os
import numpy as np
from PIL import Image
# the page's ground (v3.css --bg): the sand #ECE6DD since 2026-10-05 (Karan: "the rest of the website
# looks washed out because of the white background"); CREAM=r,g,b overrides it
CREAM = np.array([float(x) for x in os.environ.get('CREAM', '236,230,221').split(',')], dtype=float)
F_DIM0, F_DIM1, N = 234, 282, 289
def smooth(x, a, b):
    t = min(1.0, max(0.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
# the ribbon's glow (Karan, 2026-10-05: "make the logo glow more"). Light on a light room cannot glow by
# adding light, so the glow is a coloured aura: the ribbon-only pass, blurred at two sizes, its colour
# pushed brighter and more saturated, laid over the room under the ribbon, then the ribbon itself again
# on top so it stays sharp. It goes as the room dissolves, so the line the page takes over has none.
GLOW = float(os.environ.get('GLOW', '1'))
from PIL import ImageFilter
def glow(out, r, k):
    """out: HxWx3 0..255, r: the ribbon pass HxWx4 0..1, k: strength 0..1"""
    pm = r[..., :3] * r[..., 3:4]
    H, W = pm.shape[:2]; s = W / 1920
    res = out
    for rad, amt in ((14 * s, .62), (46 * s, .5)):
        def bl(x): return np.asarray(Image.fromarray(np.clip(x * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad))).astype(float) / 255
        ga = bl(r[..., 3])[..., None]
        gc = np.dstack([bl(pm[..., c]) for c in range(3)]) / np.maximum(ga, 1e-3)
        lum = gc.mean(axis=2, keepdims=True)
        gc = np.clip(lum + (gc - lum) * 1.7, 0, 1)                   # more saturated
        gc = 1 - (1 - gc) * .7                                        # and brighter: lit, not painted
        al = np.clip(ga * amt * k * 1.6, 0, 1)
        res = res * (1 - al) + gc * 255 * al
    ra = r[..., 3:4]
    return res * (1 - ra) + deepen(r[..., :3]) * 255 * ra
# the ribbon deeper (Karan, 2026-10-05: "make the logo darker"): its colours pulled down and saturated
# (gamma on a saturation lift), the white glints kept; used wherever the ribbon is laid back over the frame
DEEP = float(os.environ.get('DEEP', '0'))
def deepen(rgb):
    """rgb: HxWx3 0..1 -> deeper"""
    if DEEP <= 0: return rgb
    lum = (rgb * [.2126, .7152, .0722]).sum(axis=2, keepdims=True)
    sat = np.clip(lum + (rgb - lum) * (1 + .6 * DEEP), 0, 1)
    d = sat ** (1 + .9 * DEEP)
    glint = np.clip((lum - .82) / .15, 0, 1)                # the speculars stay bright
    return d * (1 - glint) + rgb * glint
src, rib, dst = sys.argv[1:4]
os.makedirs(dst, exist_ok=True)
for f in range(N):
    a = np.asarray(Image.open(os.path.join(src, 'f%04d.png' % f)).convert('RGBA')).astype(float) / 255
    out = a[..., :3] * 255 * a[..., 3:4] + CREAM * (1 - a[..., 3:4])
    d = smooth(f, F_DIM0, F_DIM1); d = d * d * (3 - 2 * d)          # build.py's ease_io(smooth(...))
    if GLOW > 0 and d < 1:
        r = np.asarray(Image.open(os.path.join(rib, 'f%04d.png' % f)).convert('RGBA')).astype(float) / 255
        if r[..., 3].max() > .02: out = glow(out, r, GLOW * (1 - d))
    if d > 0:
        out = out * (1 - d) + CREAM * d
        r = np.asarray(Image.open(os.path.join(rib, 'f%04d.png' % f)).convert('RGBA')).astype(float) / 255
        ra = r[..., 3:4] * d
        out = deepen(r[..., :3]) * 255 * ra + out * (1 - ra)
    Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(dst, 'f%04d.png' % f))
print('ended', N, '->', dst)
