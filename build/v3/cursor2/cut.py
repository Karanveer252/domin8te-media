# Karan's cursor design (source.webp, 2000x2000 on a flat cream) cut out: the sticker solid, its soft drop
# shadow kept as a translucent dark layer, the cream gone.
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
im = np.asarray(Image.open('source.webp').convert('RGB')).astype(np.float32)
bg = np.array([247, 242, 232], np.float32)
lum = im.mean(axis=2); lbg = bg.mean()
sat = im.max(axis=2) - im.min(axis=2)
d = np.abs(im - bg).max(axis=2)
# the sticker: its white rim (brighter than the cream), anything coloured, anything clearly darker (outline, the rim's side)
core = (lum > lbg + 5) | (sat > 40) | (lum < lbg - 34)
core = ndi.binary_opening(core, iterations=2)
lab, n = ndi.label(core); sizes = ndi.sum(core, lab, range(1, n + 1))
keep = lab == (1 + int(np.argmax(sizes)))
keep = ndi.binary_fill_holes(ndi.binary_closing(keep, iterations=6))
# a soft, exact edge
a_st = np.asarray(Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
# the shadow: how much darker than the cream, outside the sticker, as a warm dark at that strength
dark = np.clip((lbg - lum) / lbg, 0, 1)
sh_col = np.array([70, 52, 30], np.float32)
a_sh = np.clip(dark / (1 - sh_col.mean() / lbg), 0, .5) * (1 - a_st)
alpha = np.clip(a_st + a_sh, 0, 1)
rgb = (im * a_st[..., None] + sh_col * a_sh[..., None]) / np.maximum(alpha[..., None], 1e-4)
out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
img = Image.fromarray(out, 'RGBA')
bb = Image.fromarray((alpha > .03).astype(np.uint8) * 255).getbbox(); print('bbox', bb)
img.save('cut-full.png')
ys, xs = np.nonzero(keep); print('sticker', xs.min(), ys.min(), xs.max(), ys.max())
