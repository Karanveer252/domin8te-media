# Build domin8te-v63.zip = the live v62 archive with the Meta Pixel (id 2195448994715770) on the 15 public pages
# (2026-10-08, Karan: "deploy the meta pixel too"), added by meta-pixel.py, and the privacy page saying so. The
# pages are otherwise identical to v62 (checked before packing). Not on dashboard, console, onboarding or the
# Lecookie copy. Roll back = redeploy v62.
import importlib.util
_spec = importlib.util.spec_from_file_location('mp', r'C:\Work\domin8te-build\meta-pixel.py')
_mp = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_mp)
import zipfile, os

BASE = r'C:\Work\domin8te-v62.zip'
OUT = r'C:\Work\domin8te-v63.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = list(_mp.PAGES)

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v62: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v62:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
