# Build domin8te-v72.zip = the live v71 archive with (2026-10-09, Karan: "deploy when done"): Messages on the client
# dashboard and in the console, Start fresh on Work > What they see, the Stripe wiring (console controls, dashboard billing
# buttons; the Stripe server functions are deployed separately to Supabase), the connect guide v2 (one Meta trip, Booking
# system, our Google email), the Done filter and Results spacing. Only console/index.html, dashboard/index.html and
# dashboard/demo/index.html change. Roll back = redeploy v71.
import zipfile, os

BASE = r'C:\Work\domin8te-v71.zip'
OUT = r'C:\Work\domin8te-v72.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html', 'dashboard/index.html', 'dashboard/demo/index.html']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v71: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v71:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
