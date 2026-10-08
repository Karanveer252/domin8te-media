# Build domin8te-v64.zip = the live v63 archive + the site's icon files (2026-10-08, Karan: "add the favicon file too and
# deploy"): /favicon.ico (16 to 256 px) and /apple-touch-icon.png (180 px), made by site-icons.py's notes from the
# rainbow infinity the pages already use, and the 15 public pages with the two icon tags (otherwise identical to v63,
# checked before packing). Roll back = redeploy v63.
import zipfile, os, importlib.util
_spec = importlib.util.spec_from_file_location('si', r'C:\Work\domin8te-build\site-icons.py')
_si = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_si)
BASE = r'C:\Work\domin8te-v63.zip'
OUT = r'C:\Work\domin8te-v64.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = list(_si.PAGES)
ADDED = ['favicon.ico', 'apple-touch-icon.png']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v63: ' + c)
for a in ADDED:
    if a in names: raise SystemExit('already in v63: ' + a)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED + ADDED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v63:', kept, '; replaced:', len(CHANGED), '; added:', ADDED)
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
