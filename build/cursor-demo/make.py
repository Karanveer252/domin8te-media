# -*- coding: utf-8 -*-
"""The growth cursor demo's GIF and storyboard, from render.js's frames (rendered at 2x).
  python make.py frames   -> C:/Work/domin8te-media/cursor-demo/merged.gif + merged-strip.png"""
import sys, os, glob, subprocess, shutil
from PIL import Image, ImageDraw, ImageFont
FR = sys.argv[1] if len(sys.argv) > 1 else 'frames'
OUT = 'C:/Work/domin8te-media/cursor-demo'
FF = 'C:/Program Files/Virtual Desktop Streamer/ffmpeg.exe'
GIF_W = int(os.environ.get('GIF_W', 600))
CREAM = (247, 241, 232)
files = sorted(glob.glob(os.path.join(FR, 'f*.png')))
assert files, 'no frames'

# the GIF: each 2x frame down to size, then a palette made from the whole loop
seq = os.path.join(FR, '..', 'seq'); shutil.rmtree(seq, ignore_errors=True); os.makedirs(seq)
for i, f in enumerate(files):
    Image.open(f).convert('RGB').resize((GIF_W, GIF_W), Image.LANCZOS).save(os.path.join(seq, 'g%04d.png' % i))
pal = os.path.join(seq, 'pal.png')
subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '30', '-i', os.path.join(seq, 'g%04d.png'),
                '-vf', 'palettegen=max_colors=256:stats_mode=full:reserve_transparent=0', pal], check=True)
subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '30', '-i', os.path.join(seq, 'g%04d.png'), '-i', pal,
                '-lavfi', 'paletteuse=dither=sierra2_4a:diff_mode=rectangle', '-loop', '0', os.path.join(OUT, 'merged.gif')], check=True)

# the storyboard: six moments, labelled like the reference strip
SHOTS = [('Idle', 12), ('Tilt L', 40), ('Tilt R', 56), ('Click mid', 59), ('Click peak', 63), ('Settle', 72)]
K = 2; CW, CH, IMG = 260 * K, 348 * K, 260 * K
strip = Image.new('RGB', (CW * len(SHOTS), CH), CREAM)
d = ImageDraw.Draw(strip)
f1 = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 15 * K)
f2 = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 11 * K)
for n, (name, i) in enumerate(SHOTS):
    im = Image.open(files[i]).convert('RGB').resize((IMG, IMG), Image.LANCZOS)
    x = n * CW
    strip.paste(im, (x, 22 * K))
    for txt, font, y, col in ((name, f1, 310 * K, (74, 66, 58)), ('%d/%d' % (n + 1, len(SHOTS)), f2, 330 * K, (150, 141, 130))):
        w = d.textlength(txt, font=font)
        d.text((x + (CW - w) / 2, y), txt, font=font, fill=col, anchor='ls')
    if n: d.line([(x, 10 * K), (x, CH - 10 * K)], fill=(221, 212, 199), width=K)
strip.save(os.path.join(OUT, 'merged-strip.png'), optimize=True)
print('gif', os.path.getsize(os.path.join(OUT, 'merged.gif')), 'strip', strip.size)
