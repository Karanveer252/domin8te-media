# Build domin8te-v82.zip = the live v81 archive + send.php only (2026-10-12/13): thank-you reply to the visitor.
# Roll back = redeploy v81.
import zipfile, os, hashlib, re
BASE = r'C:\Work\domin8te-v81.zip'; OUT = r'C:\Work\domin8te-v82.zip'; SITE = r'C:\Work\domin8te-media'
CHANGED = ['send.php']
h = lambda b: hashlib.sha256(b).hexdigest()
src = zipfile.ZipFile(BASE); names = set(src.namelist())
raw = open(os.path.join(SITE, 'send.php'), 'rb').read(); t = raw.decode('utf8')
if h(raw) == h(src.read('send.php')): raise SystemExit('send.php unchanged vs v81')
if 'calendly.com/kvsd100/30min' not in t or 'thank-you reply failed' not in t: raise SystemExit('thank-you block missing')
if t.lstrip().startswith('\ufeff') or t.rstrip().endswith('?>'): raise SystemExit('BOM or closing tag')
def bal(x):
    x = re.sub(r"'(?:[^'\
]|\.)*'", "''", x)
    return [x.count(a) - x.count(b) for a, b in ('()', '[]', '{}')]
o = bal(src.read('send.php').decode('utf8')); n = bal(t)
if o != n: raise SystemExit('bracket balance changed vs v81: %s -> %s' % (o, n))
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9); kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
out.write(os.path.join(SITE, 'send.php'), 'send.php'); out.close()
src = zipfile.ZipFile(BASE); chk = zipfile.ZipFile(OUT); assert chk.testzip() is None
diff = [n for n in src.namelist() if not n.endswith('/') and h(src.read(n)) != h(chk.read(n))]
assert diff == CHANGED and set(chk.namelist()) == names, diff
print('carried:', kept, 'differs from v81:', diff, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
