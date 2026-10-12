# Build domin8te-v80.zip = the live v79 archive + send.php only (2026-10-12, Karan: "add the ad fields").
# send.php adds a "Where it came from:" block under "Page:" in the lead email: utm_source/medium/campaign/content/term,
# ad (the page's "v"), fbclid, landing_page, referrer, event_id, as the /marketing/ page sends them. The homepage
# sends none, so its emails are unchanged. Each value is header-cleaned (one line, 300 chars max).
# Tested with PHP 8.5.11 against the fake SMTPS server: block present with all fields; absent without them.
# Roll back = redeploy v79.
import zipfile, os
BASE = r'C:\Work\domin8te-v79.zip'; OUT = r'C:\Work\domin8te-v80.zip'; SITE = r'C:\Work\domin8te-media'
CHANGED = ['send.php']
src = zipfile.ZipFile(BASE)
for c in CHANGED:
    if c not in src.namelist(): raise SystemExit('not in v79: ' + c)
    if src.read(c) == open(os.path.join(SITE, c), 'rb').read(): raise SystemExit('unchanged vs v79: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9); kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v79:', kept, '; replaced:', len(CHANGED)); print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
