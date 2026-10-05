# The day film's ending, done after the render (version 3). Each graded frame of the full pass is laid on
# the page's cream; from F_DIM0 the kitchen dissolves into the cream, and the ribbon is laid back over it
# from the ribbon-only pass in the same measure, so the line stays whole while the room goes.
#   python end.py <graded full pass dir> <graded ribbon-only dir> <out dir>
import sys, os
import numpy as np
from PIL import Image
CREAM = np.array([244, 241, 236], dtype=float)
F_DIM0, F_DIM1, N = 234, 282, 289
def smooth(x, a, b):
    t = min(1.0, max(0.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
src, rib, dst = sys.argv[1:4]
os.makedirs(dst, exist_ok=True)
for f in range(N):
    a = np.asarray(Image.open(os.path.join(src, 'f%04d.png' % f)).convert('RGBA')).astype(float) / 255
    out = a[..., :3] * 255 * a[..., 3:4] + CREAM * (1 - a[..., 3:4])
    d = smooth(f, F_DIM0, F_DIM1); d = d * d * (3 - 2 * d)          # build.py's ease_io(smooth(...))
    if d > 0:
        out = out * (1 - d) + CREAM * d
        r = np.asarray(Image.open(os.path.join(rib, 'f%04d.png' % f)).convert('RGBA')).astype(float) / 255
        ra = r[..., 3:4] * d
        out = r[..., :3] * 255 * ra + out * (1 - ra)
    Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(dst, 'f%04d.png' % f))
print('ended', N, '->', dst)
