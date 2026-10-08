# Build domin8te-v61.zip = the live v60 archive with the growth cursor on the client portal too (2026-10-08, Karan:
# "i want the same new cursor on dashboard and console. deploy when done"): /dashboard/ gets it for the first time;
# /dashboard/demo/ and /console/ already had it and lose two unused style rules from the old version
# (portal/growth-cursor.js). Everything else in v60 is carried over byte for byte (the homepage too, so local-only
# work such as the Meta Pixel does not ship with this). Roll back = redeploy v60.
import zipfile, os

BASE = r'C:\Work\domin8te-v60.zip'
OUT = r'C:\Work\domin8te-v61.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html', 'dashboard/index.html', 'dashboard/demo/index.html']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v60: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v60:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
