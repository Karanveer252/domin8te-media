#!/bin/bash
# The flag film, end to end: render the EXRs, grade them, encode the page's scrub film and cut its stills.
#   bash make.sh            (desktop: render/exr -> render/out -> deliver/)
#   bash make.sh --phone    (phone:   render/exr-phone -> render/out-phone -> deliver-phone/)
# Re-running skips a stage whose output is already complete. Encoding is NVENC (this ffmpeg has no
# libx264), a group of pictures every 8 frames and no B-frames, which the page's decoders rely on.
set -e
cd /c/Work/domin8te-build/flag3d
BL=/c/Work/tools/blender-4.5.14-windows-x64/blender.exe
FF="/c/Program Files/Virtual Desktop Streamer/ffmpeg.exe"
G="--bloom 1.0 --thresh 0.6 --size 0.7 --exp 0.3 --lift 0.003 --vig 0.72 --vsize 1.22"
if [ "$1" = "--phone" ]; then
  EXR=render/exr-phone; OUT=render/out-phone; DEL=deliver-phone
  [ "$(ls $EXR 2>/dev/null | wc -l)" -ge 289 ] || "$BL" -b --python-exit-code 1 -P flag.py -- --anim --phone 2>&1 | grep -E "Fra:.*Finished|ANIM DONE|Error|Traceback" | awk 'NR%20==1 || /DONE|Error|Trace/'
  [ "$(ls $OUT 2>/dev/null | wc -l)" -ge 289 ] || "$BL" -b --python-exit-code 1 -P grade.py -- --seq $EXR --out $OUT --w 720 --h 1080 $G --vblur 227 2>&1 | grep -iE "graded seq|error"
  mkdir -p $DEL
  # every second frame, as the phone page plays it (FRAMES = 145)
  "$FF" -hide_banner -y -framerate 15 -start_number 0 -i $OUT/f%04d.png -an -sn -dn -map_metadata -1 \
    -vf "select='not(mod(n\,2))',setpts=N/15/TB,format=yuv420p" -fps_mode passthrough -c:v h264_nvenc -preset p7 -tune hq -rc vbr -cq 30 -b:v 0 -maxrate 2.5M -bufsize 5M \
    -profile:v high -g 8 -bf 0 -forced-idr 1 -no-scenecut 1 \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv -movflags +faststart $DEL/cl-film.mp4 > $DEL/encode.log 2>&1
  python - <<'E'
from PIL import Image
import os
for f, name, q in [(0, 'cl-ph0', 80), (200, 'cl-mark-ph', 78)]:
    im = Image.open('render/out-phone/f%04d.png' % f).convert('RGB')
    im.save('deliver-phone/%s.webp' % name, 'WEBP', quality=q, method=6)
    print(name, im.size, os.path.getsize('deliver-phone/%s.webp' % name) // 1024, 'KB')
E
else
  EXR=render/exr; OUT=render/out; DEL=deliver
  [ "$(ls $EXR 2>/dev/null | wc -l)" -ge 289 ] || "$BL" -b --python-exit-code 1 -P flag.py -- --anim 2>&1 | grep -E "Fra:.*Finished|ANIM DONE|Error|Traceback" | awk 'NR%20==1 || /DONE|Error|Trace/'
  [ "$(ls $OUT 2>/dev/null | wc -l)" -ge 289 ] || "$BL" -b --python-exit-code 1 -P grade.py -- --seq $EXR --out $OUT $G --vblur 340 2>&1 | grep -iE "graded seq|error"
  mkdir -p $DEL
  "$FF" -hide_banner -y -framerate 30 -start_number 0 -i $OUT/f%04d.png -an -sn -dn -map_metadata -1 \
    -vf "format=yuv420p" -fps_mode passthrough -video_track_timescale 15360 -c:v h264_nvenc -preset p7 -tune hq -rc vbr -cq ${CQ:-23} -b:v 0 -maxrate 14M -bufsize 28M \
    -profile:v high -g 8 -bf 0 -forced-idr 1 -no-scenecut 1 \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv -movflags +faststart $DEL/hero-scrub.mp4 > $DEL/encode.log 2>&1
  # the poster is frame 0 as the page will decode it, so the film takes over without a shift
  "$FF" -v error -y -i $DEL/hero-scrub.mp4 -frames:v 1 -q:v 2 $DEL/hero-poster.jpg
  python - <<'E'
from PIL import Image
import os
im = Image.open('render/out/f0000.png').convert('RGB').resize((1600, 900), Image.LANCZOS)
im.save('deliver/hero-still.jpg', 'JPEG', quality=84, optimize=True, progressive=True)
E
  cp ../cloche3d/hero-data.json $DEL/hero-data.json   # the same dim, frame for frame
fi
ls -la $DEL
