# Build domin8te-v71.zip = the live v70 archive with the Delete bin column after Done on the console boards
# (2026-10-09, Karan: drag a card in, confirm, deleted; then "deploy"). Only console/index.html changes.
# Roll back = redeploy v70.
import zipfile, os

BASE = r'C:\Work\domin8te-v70.zip'
OUT = r'C:\Work\domin8te-v71.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v70: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v70:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
