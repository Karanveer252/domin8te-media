#!/bin/bash
# the phone's cloud layers by day: the night layers' geometry (sky3d/cy/look.txt), the day's light first (arg() takes the first)
cd /c/Work/domin8te-build/sky3d
B="C:/Work/tools/blender-4.5.14-windows-x64/blender.exe"
while [ ! -f /c/Work/domin8te-build/daysky/render.done ]; do sleep 20; done
DAY=$(cat /c/Work/domin8te-build/daysky/cy/day.txt); LOOK=$(cat cy/look.txt)
for L in l1 l2 l3 l4; do
  "$B" -b --python-exit-code 1 -P canyon.py -- --layer $L --scale 1 --samples 64 --vb 8 $DAY $LOOK --out C:/Work/domin8te-build/daysky/cy/f-$L > /c/Work/domin8te-build/daysky/cy/f-$L.log 2>&1
  grep CANYON /c/Work/domin8te-build/daysky/cy/f-$L.log
done
echo DONE > /c/Work/domin8te-build/daysky/cy/done
