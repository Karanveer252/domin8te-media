# Stitch shoot.js frames into contact sheets: python sheet.py <prefix> <cols> <thumbW> <perSheet>
import sys, glob
from PIL import Image, ImageDraw
prefix, cols, tw, per = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
fs = sorted(glob.glob(prefix + '-[0-9][0-9].jpg'))
for s in range(0, len(fs), per):
    chunk = fs[s:s + per]
    ims = [Image.open(f) for f in chunk]
    th = int(ims[0].height * tw / ims[0].width)
    rows = (len(ims) + cols - 1) // cols
    c = Image.new('RGB', (cols * tw + (cols - 1) * 6, rows * (th + 18)), (90, 90, 90))
    d = ImageDraw.Draw(c)
    for i, im in enumerate(ims):
        x = (i % cols) * (tw + 6); y = (i // cols) * (th + 18)
        c.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 18)); d.text((x + 4, y + 3), str(s + i), fill='white')
    out = f'{prefix}-sheet{s // per}.jpg'; c.save(out, quality=82); print(out, c.size)
