# Build domin8te-v95.zip = the live v94 archive with the loader pinned to the middle of the screen (2026-10-17, Karan: "the
# loading is not centered on the page. make sure it is always in the middle in all screen sizes"). It sat in the content
# column, which the sidebar and padding push off centre; now it is fixed to the viewport (0 px off at 1920 to 360 wide, both
# apps). REPLACED only: dashboard/index.html, dashboard/demo/index.html, console/index.html. Roll back = redeploy v94.
import zipfile, os

BASE = r'C:\Work\domin8te-v94.zip'
OUT = r'C:\Work\domin8te-v95.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['dashboard/index.html', 'dashboard/demo/index.html', 'console/index.html']
PROD, TEST = b'cxnohsykstdudsrummzs', b'leuvzsouqsdpdpyjspjr'

if os.path.exists(OUT): raise SystemExit(OUT + ' exists already: another session may have used v95; pick the next number')
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
if missing: raise SystemExit('not in v94: ' + ', '.join(missing))
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
