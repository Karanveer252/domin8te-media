# Build domin8te-v93.zip = the live v92 archive + the new client dashboard and agency console (2026-10-16, Karan: "deploy
# when done", then "Full release"). The plans/picks/caps release (13 to 15 Oct) and today's dashboard usage plan
# (narrow Home, weekly summary, usage tracking, close the loop, hours and specials, first week, jump and show, spacing
# sweep). Its 40 database changes were applied to prod first. REPLACED only: dashboard/index.html,
# dashboard/demo/index.html, console/index.html. Everything else byte for byte. Other sessions' unreleased local work
# (onboarding, send.php, ads) stays out. Roll back = redeploy v92 (the old pages are also in
# C:\Work\domin8te-archive\portal-pages-before-v93-*).
import zipfile, os

BASE = r'C:\Work\domin8te-v92.zip'
OUT = r'C:\Work\domin8te-v93.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['dashboard/index.html', 'dashboard/demo/index.html', 'console/index.html']
PROD, TEST = b'cxnohsykstdudsrummzs', b'leuvzsouqsdpdpyjspjr'

if os.path.exists(OUT): raise SystemExit(OUT + ' exists already: another session may have used v93; pick the next number')
page = {f: open(os.path.join(SITE, f), 'rb').read() for f in CHANGED}
# the live pages talk to prod with the live sign-in key; the demo has no live settings; none carries the Meta Pixel
for f in ('dashboard/index.html', 'console/index.html'):
    assert PROD in page[f] and TEST not in page[f] and b'pk_live_' in page[f] and b'"mode":"live"' in page[f], f + ': live settings'
assert b'"mode":"live"' not in page['dashboard/demo/index.html'] and PROD not in page['dashboard/demo/index.html'], 'demo must not carry live settings'
for f in CHANGED:
    assert b'fbq(' not in page[f], f + ': no pixel on portal pages'
    assert '\u2014'.encode() not in page[f], f + ': long dash'

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
missing = [f for f in CHANGED if f not in names]
if missing: raise SystemExit('not in v92: ' + ', '.join(missing))
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
carried = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); carried += 1
for f in CHANGED:
    out.writestr(f, page[f])
out.close()
z = zipfile.ZipFile(OUT)
for f in CHANGED: assert z.read(f) == page[f], f
print('wrote', OUT, '| carried', carried, '| replaced', len(CHANGED), '|', os.path.getsize(OUT), 'bytes')
