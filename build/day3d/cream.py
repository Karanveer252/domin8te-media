# Lay graded RGBA frames on the page's cream (#F4F1EC), in display space, so the film's background is
# exactly the page where the kitchen has dissolved.  python cream.py <in.png|dir> <out.png|dir>
import sys, os, glob
from PIL import Image
CREAM = (244, 241, 236)
src, dst = sys.argv[1], sys.argv[2]
files = [src] if os.path.isfile(src) else sorted(glob.glob(os.path.join(src, 'f*.png')))
if not os.path.isfile(src): os.makedirs(dst, exist_ok=True)
for f in files:
    im = Image.open(f).convert('RGBA')
    bg = Image.new('RGBA', im.size, CREAM + (255,))
    bg.alpha_composite(im)
    out = dst if os.path.isfile(src) else os.path.join(dst, os.path.basename(f))
    bg.convert('RGB').save(out)
print('creamed', len(files))
