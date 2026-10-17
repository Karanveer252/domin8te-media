# Build domin8te-v94.zip = the live v93 archive + the loader (the Domin8te mark lights up along its own figure-eight while the
# console and the client dashboard open; 2026-10-17, Karan: "Let's go with the number two, and when you're done, deploy it")
# and Revenue's Business / Personal tabs on the console (migration 20261016040000 applied to prod first, personal_ledger.sql
# 25/25 there). REPLACED only: dashboard/index.html, dashboard/demo/index.html, console/index.html. Everything else byte for
# byte. Other sessions' unreleased local work stays out. Roll back = redeploy v93 (the old pages are also in
# C:\Work\domin8te-archive\portal-pages-before-v94-*).
import zipfile, os

BASE = r'C:\Work\domin8te-v93.zip'
OUT = r'C:\Work\domin8te-v94.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['dashboard/index.html', 'dashboard/demo/index.html', 'console/index.html']
PROD, TEST = b'cxnohsykstdudsrummzs', b'leuvzsouqsdpdpyjspjr'

if os.path.exists(OUT): raise SystemExit(OUT + ' exists already: another session may have used v94; pick the next number')
page = {f: open(os.path.join(SITE, f), 'rb').read() for f in CHANGED}
for f in ('dashboard/index.html', 'console/index.html'):
    assert PROD in page[f] and TEST not in page[f] and b'pk_live_' in page[f] and b'"mode":"live"' in page[f], f + ': live settings'
assert b'"mode":"live"' not in page['dashboard/demo/index.html'] and PROD not in page['dashboard/demo/index.html'], 'demo must not carry live settings'
for f in CHANGED:
    assert b'fbq(' not in page[f], f + ': no pixel on portal pages'
    assert '\u2014'.encode() not in page[f], f + ': long dash'
    assert b'd8-load' in page[f], f + ': the loader is missing'
assert b'revenue/personal' in page['console/index.html'], 'console: the Personal tab is missing'

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
missing = [f for f in CHANGED if f not in names]
if missing: raise SystemExit('not in v93: ' + ', '.join(missing))
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
