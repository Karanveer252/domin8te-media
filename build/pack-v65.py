# Build domin8te-v65.zip = the live v64 archive with the console's board fix (2026-10-08, Karan: "Fix this", the toast
# "Cannot read properties of undefined (reading 'push')"): the background refresh rebuilt the open client without its
# board cards, so the board went empty and "Add the card" failed after the card was already saved. Only
# console/index.html changes. Roll back = redeploy v64.
import zipfile, os

BASE = r'C:\Work\domin8te-v64.zip'
OUT = r'C:\Work\domin8te-v65.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v64: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v64:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
