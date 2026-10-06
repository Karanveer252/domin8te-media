#!/bin/bash
# The day sky film, from the transparent renders to the page's files (version 3).
#   bash deliver.sh     -> deliver/sky-scrub.mp4 (192 frames, 1600x900, GOP 8, no B-frames: the chip film's
#                          scrub recipe, on NVENC), deliver/v3-sky-a.jpg + v3-sky-b.jpg (each beat's
#                          finished picture: the poster until the film is in), deliver/sky-a-still.jpg +
#                          sky-b-still.jpg (the clouds-only stills the story layout sets its words over),
#                          tiles/dx-cloud-*.webp (the moving clouds around the beats)
# Every frame is laid over the page's sky first (compose.py), so the film and the page are one colour.
set -e
cd /c/Work/domin8te-build/daysky
FF="/c/Program Files/Virtual Desktop Streamer/ffmpeg.exe"
mkdir -p deliver seq tiles
rm -f seq/*.png
python - <<'EOF'
import glob, os
from PIL import Image
from compose import one
files = sorted(glob.glob('out/a/f*.png')) + sorted(glob.glob('out/b/f*.png'))
assert len(files) == 192, len(files)
for n, f in enumerate(files): one(f, 'seq/f%04d.png' % n, 1600)
for b, last in (('a', 'out/a/f0095.png'), ('b', 'out/b/f0095.png')):
    one(last, 'deliver/_p.png', 1600)
    Image.open('deliver/_p.png').convert('RGB').save('deliver/v3-sky-%s.jpg' % b, 'JPEG', quality=80, optimize=True, progressive=True)
    one('out/still-%s.png' % b, 'deliver/_p.png', 1600)
    Image.open('deliver/_p.png').convert('RGB').save('deliver/sky-%s-still.jpg' % b, 'JPEG', quality=80, optimize=True, progressive=True)
os.remove('deliver/_p.png')
print('frames', len(files))
EOF
"$FF" -hide_banner -y -framerate 30 -start_number 0 -i seq/f%04d.png -an -sn -dn -map_metadata -1 \
  -vf "format=yuv420p" -fps_mode passthrough -video_track_timescale 15360 -c:v h264_nvenc -preset p7 -tune hq -rc vbr -cq ${CQ:-24} -b:v 0 -maxrate 12M -bufsize 24M \
  -profile:v high -g 8 -bf 0 -forced-idr 1 -no-scenecut 1 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv -movflags +faststart deliver/sky-scrub.mp4 > deliver/encode.log 2>&1
python day-tiles.py tiles --sheet tiles/sheet.jpg | tail -4
ls -la deliver tiles
