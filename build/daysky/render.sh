#!/bin/bash
# the day sky film: both beats, then the clouds-only stills (the fallback under the words)
cd /c/Work/domin8te-build/daysky
B="C:/Work/tools/blender-4.5.14-windows-x64/blender.exe"
LOOK="--scale .75 --samples 24 --vb 6 $(cat look.txt)"
"$B" -b --python-exit-code 1 -P build_sky_day.py -- --beat a --anim $LOOK > render-a.log 2>&1 || exit 1
"$B" -b --python-exit-code 1 -P build_sky_day.py -- --beat b --anim $LOOK > render-b.log 2>&1 || exit 1
"$B" -b --python-exit-code 1 -P build_sky_day.py -- --beat a --still 95 --notext --out C:/Work/domin8te-build/daysky/out/still-a $LOOK > render-sa.log 2>&1
"$B" -b --python-exit-code 1 -P build_sky_day.py -- --beat b --still 95 --notext --out C:/Work/domin8te-build/daysky/out/still-b $LOOK > render-sb.log 2>&1
echo DONE > render.done
