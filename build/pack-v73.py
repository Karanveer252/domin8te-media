# Build domin8te-v73.zip = the live v72 archive with (2026-10-09, Karan: "deploy"): every form dropdown styled, Messages
# checks every 10 s plus Reload conversation, new placeholders, "Secured by Stripe" on Billing, console steps rows aligned.
# Only console/index.html, dashboard/index.html and dashboard/demo/index.html change. Roll back = redeploy v72.
import zipfile, os

BASE = r'C:\Work\domin8te-v72.zip'
OUT = r'C:\Work\domin8te-v73.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html', 'dashboard/index.html', 'dashboard/demo/index.html']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v72: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v72:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
