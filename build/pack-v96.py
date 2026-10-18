# Build domin8te-v96.zip = the live v95 archive with the agency console's owner-only "Ask bots" pill on Bot chat (#/bot)
# (2026-10-17/18, Karan: "Yes, patch, test and deploy the Ask bots tab to production", then "continue deploying").
# Source change: portal/console/mod-bot.js + css/58-bot.css only (backups *.bak-20261017-askbots).
# REPLACED only: console/index.html. Roll back = redeploy v95 (deploy.js.bak-v95).
import zipfile, os

BASE = r'C:\Work\domin8te-v95.zip'
OUT = r'C:\Work\domin8te-v96.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html']
PROD, TEST = b'cxnohsykstdudsrummzs', b'leuvzsouqsdpdpyjspjr'

if os.path.exists(OUT): raise SystemExit(OUT + ' exists already: another session may have used v96; pick the next number')
page = {f: open(os.path.join(SITE, f), 'rb').read() for f in CHANGED}
f = 'console/index.html'
assert PROD in page[f] and TEST not in page[f] and b'pk_live_' in page[f] and b'"mode":"live"' in page[f], f + ': live settings'
assert b'fbq(' not in page[f], f + ': no pixel on portal pages'
assert '\u2014'.encode() not in page[f], f + ': long dash'
assert b'd8-load' in page[f], f + ': the loader is missing'
assert b'revenue/personal' in page[f], 'console: the Personal tab is missing'
assert b'bot_owner_send' in page[f] and b'Ask bots' in page[f], 'console: the Ask bots pill is missing'

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
missing = [x for x in CHANGED if x not in names]
if missing: raise SystemExit('not in v95: ' + ', '.join(missing))
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
carried = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); carried += 1
for x in CHANGED:
    out.writestr(x, page[x])
out.close()
z = zipfile.ZipFile(OUT)
for x in CHANGED: assert z.read(x) == page[x], x
assert len(z.namelist()) == len(src.namelist()), 'entry count changed'
ref = zipfile.ZipFile(BASE)  # fresh handle: writestr() above rewrote the shared ZipInfo offsets
for info in ref.infolist():
    if info.filename not in CHANGED: assert z.read(info.filename) == ref.read(info), info.filename
print('wrote', OUT, '| carried', carried, '| replaced', len(CHANGED), '|', os.path.getsize(OUT), 'bytes | all other entries byte-identical to v95')
