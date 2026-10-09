# Build domin8te-v69.zip = the live v68 archive with the console's Settings "Reading and spacing" removed (2026-10-09,
# Karan: "Remove the reading and spacing function", then "deploy"). Only console/index.html changes.
# Roll back = redeploy v68.
import zipfile, os

BASE = r'C:\Work\domin8te-v68.zip'
OUT = r'C:\Work\domin8te-v69.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v68: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v68:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
