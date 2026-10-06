#!/bin/bash
# Version 3's day film end to end: render the full pass and the ribbon-only pass, grade both (RGBA),
# dissolve the ending into the cream (end.py), encode with NVENC (-g 8, no B-frames) and cut the stills.
#   bash make_day.sh            desktop -> deliver/
#   bash make_day.sh --phone    phone   -> deliver-phone/
set -e
cd /c/Work/domin8te-build/day3d
BL=/c/Work/tools/blender-4.5.14-windows-x64/blender.exe
FF="/c/Program Files/Virtual Desktop Streamer/ffmpeg.exe"
G="${G:---exp 0 --bloom .35 --thresh 1.4 --size .5 --vig .42 --vsize 1.3 --vblur 380 --warm 1.12,1.0,.84}"
PH=""; S=""; WH=""
if [ "$1" = "--phone" ]; then PH="--phone"; S="-phone"; WH="--w 720 --h 1080"; G="${G/--vblur 380/--vblur 260}"; fi
n() { ls "$1" 2>/dev/null | wc -l; }
[ "$(n render/exr$S)" -ge 289 ] || "$BL" -b --python-exit-code 1 -P build_day.py -- --anim $PH 2>&1 | grep -E "Fra:.*Finished|ANIM DONE|Error|Traceback" | awk 'NR%25==1 || /DONE|Error|Trace/'
[ "$(n render/exr-rib$S)" -ge 289 ] || "$BL" -b --python-exit-code 1 -P build_day.py -- --anim --ribbon-only $PH 2>&1 | grep -E "ANIM DONE|Error|Traceback"
[ "$(n render/g$S)" -ge 289 ] || "$BL" -b --python-exit-code 1 -P grade.py -- --seq render/exr$S --out render/g$S $WH $G 2>&1 | grep -iE "graded seq|error"
[ "$(n render/grib$S)" -ge 289 ] || "$BL" -b --python-exit-code 1 -P grade.py -- --seq render/exr-rib$S --out render/grib$S $WH $G 2>&1 | grep -iE "graded seq|error"
python end.py render/g$S render/grib$S render/out$S
if [ -n "$PH" ]; then
  mkdir -p deliver-phone
  "$FF" -hide_banner -y -framerate 15 -start_number 0 -i render/out-phone/f%04d.png -an -sn -dn -map_metadata -1 \
    -vf "select='not(mod(n\,2))',setpts=N/15/TB,format=yuv420p" -fps_mode passthrough -c:v h264_nvenc -preset p7 -tune hq -rc vbr -cq 30 -b:v 0 -maxrate 2.5M -bufsize 5M \
    -profile:v high -g 8 -bf 0 -forced-idr 1 -no-scenecut 1 \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv -movflags +faststart deliver-phone/cl-film.mp4 > deliver-phone/encode.log 2>&1
  python -c "
from PIL import Image
for f, name, q in [(0, 'cl-ph0', 80), (200, 'cl-mark-ph', 78)]:
    Image.open('render/out-phone/f%04d.png' % f).convert('RGB').save('deliver-phone/%s.webp' % name, 'WEBP', quality=q, method=6)
"
  ls -la deliver-phone
else
  mkdir -p deliver
  "$FF" -hide_banner -y -framerate 30 -start_number 0 -i render/out/f%04d.png -an -sn -dn -map_metadata -1 \
    -vf "format=yuv420p" -fps_mode passthrough -video_track_timescale 15360 -c:v h264_nvenc -preset p7 -tune hq -rc vbr -cq ${CQ:-23} -b:v 0 -maxrate 14M -bufsize 28M \
    -profile:v high -g 8 -bf 0 -forced-idr 1 -no-scenecut 1 \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv -movflags +faststart deliver/hero-scrub.mp4 > deliver/encode.log 2>&1
  "$FF" -v error -y -i deliver/hero-scrub.mp4 -frames:v 1 -q:v 2 deliver/hero-poster.jpg
  python -c "
from PIL import Image
Image.open('render/out/f0000.png').convert('RGB').resize((1600, 900), Image.LANCZOS).save('deliver/hero-still.jpg', 'JPEG', quality=84, optimize=True, progressive=True)
"
  cp ../cloche3d/hero-data.json deliver/hero-data.json
  ls -la deliver
fi
