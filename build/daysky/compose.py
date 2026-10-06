# -*- coding: utf-8 -*-
"""Lays the day film's transparent frames over the page's own sky (v3.css .dx-sky__deep:
the same stops, top to bottom of the frame, which is the full height of the screen), so
the film's sky and the page's are one colour and the frame's edges never show.
  python compose.py <in.png | in_dir> <out.png | out_dir> [--w 1600]"""
import sys, os, glob
import numpy as np
from PIL import Image

# keep in step with v3.css (.dx-sky__deep): position (0..1 of the height), sRGB
STOPS = [(0, (63, 134, 218)), (.30, (92, 155, 227)), (.56, (146, 189, 236)), (.80, (214, 228, 242)), (1.0, (236, 230, 221))]

FOOT = (.84, .985)   # where the foot's fade begins and ends, of the height

def sky(w, h):
    y = (np.arange(h) + .5) / h
    col = np.zeros((h, 3), np.float32)
    for c in range(3):
        col[:, c] = np.interp(y, [p for p, _ in STOPS], [v[c] for _, v in STOPS])
    return np.repeat(col[:, None, :], w, axis=1)

def one(src, dst, W=None):
    im = Image.open(src).convert('RGBA')
    if W and im.width != W: im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    rgb, al = a[:, :, :3], a[:, :, 3:4] / 255.0
    # the frame's foot melts into the page's sky: the words rising from below the bank no longer
    # show under it, and the bank sinks into the sand instead of stopping at the frame's edge
    y = (np.arange(im.height) + .5) / im.height
    t = np.clip((y - FOOT[0]) / (FOOT[1] - FOOT[0]), 0, 1)
    al = al * (1 - t * t * (3 - 2 * t))[:, None, None]
    out = rgb * al + sky(im.width, im.height) * (1 - al)   # Blender's PNG alpha is straight
    Image.fromarray(np.clip(out + .5, 0, 255).astype(np.uint8)).save(dst)

if __name__ == '__main__':
    args = sys.argv[1:]
    W = int(args[args.index('--w') + 1]) if '--w' in args else None
    src, dst = args[0], args[1]
    if os.path.isdir(src):
        os.makedirs(dst, exist_ok=True)
        fs = sorted(glob.glob(os.path.join(src, '*.png')))
        for f in fs: one(f, os.path.join(dst, os.path.basename(f)), W)
        print('composed', len(fs))
    else:
        one(src, dst, W); print('composed', dst)
