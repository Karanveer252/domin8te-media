# RECONSTRUCTED 2026-10-07: the original pack-v52.py (written by another session) was overwritten by mistake when the
# portfolio session named its own package v52 without seeing that v52 and v53 had already gone live. Its zip
# (domin8te-v52.zip) was overwritten too and has been removed; domin8te-v53.zip, built on it, is intact and supersedes it.
# What v52 was (RESUME.md): v51 + /work/lecookie/live/ refreshed from the Lecookie v6-little-oven tree. Re-running this
# would rebuild that shape from the site folder as it is now, not the exact bytes that went live as v52.
import zipfile, os

BASE = r'C:\Work\domin8te-v51.zip'
OUT = r'C:\Work\domin8te-v52.zip'
SITE = r'C:\Work\domin8te-media'
LIVE = 'work/lecookie/live/'

live = []
for root, _, files in os.walk(os.path.join(SITE, LIVE)):
    for f in files:
        live.append(os.path.relpath(os.path.join(root, f), SITE).replace('\', '/'))
src = zipfile.ZipFile(BASE)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
for info in src.infolist():
    if info.filename.startswith(LIVE): continue
    out.writestr(info, src.read(info))
for l in sorted(live): out.write(os.path.join(SITE, l), l)
out.close()
print('wrote', OUT)
