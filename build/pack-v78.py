# Build domin8te-v78.zip = the live v77 archive + two PHP files (2026-10-12).
# Why: a test enquiry from a real browser (homepage and /marketing/) showed "Got it" but was never mailed: the hidden
# bot-trap field silently dropped it (browser autofill most likely filled it). From now on a filled hidden field drops
# a post only when it ALSO looks like a bot (no page timing, or faster than a person); anyone else is delivered with
# "[check: hidden field]" in the subject. Also: leads from /marketing/ (source marketing-checkup) are labelled
# "Page: Marketing page" instead of "Homepage".
# REPLACED only: send.php, onboarding/submit.php. Everything else carried byte for byte. Roll back = redeploy v77.
import zipfile, os, hashlib

BASE = r'C:\Work\domin8te-v77.zip'
OUT = r'C:\Work\domin8te-v78.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['send.php', 'onboarding/submit.php']
h = lambda b: hashlib.sha256(b).hexdigest()

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
if os.path.exists(OUT) and False: pass
for c in CHANGED:
    if c not in names: raise SystemExit('not in v77: ' + c)
    local = open(os.path.join(SITE, *c.split('/')), 'rb').read()
    if h(local) == h(src.read(c)): raise SystemExit('unchanged vs v77 (did the edit not apply?): ' + c)
    t = local.decode('utf8')
    if 'hidden field filled' not in t or "[check: hidden field]" not in t: raise SystemExit('the hidden-field fix is not in ' + c)
    if t.lstrip().startswith('\ufeff') or t.rstrip().endswith('?>'): raise SystemExit('BOM or closing tag in ' + c)
    if t.count('{') != t.count('}') or t.count('(') != t.count(')'): raise SystemExit('unbalanced braces/parentheses in ' + c)
if "strpos(headerSafe((string)($_POST['source'] ?? ''), 40), 'marketing') === 0" not in open(os.path.join(SITE, 'send.php'), encoding='utf-8').read():
    raise SystemExit('send.php lacks the marketing label fix')

if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = rep = 0
for info in src.infolist():
    if info.filename in CHANGED:
        out.write(os.path.join(SITE, *info.filename.split('/')), info.filename); rep += 1
    else:
        out.writestr(info, src.read(info)); kept += 1
out.close()
# reopen both fresh: writing entries with the source's ZipInfo objects changes their offsets
src = zipfile.ZipFile(BASE)
chk = zipfile.ZipFile(OUT)
assert chk.testzip() is None
diff = [n for n in src.namelist() if not n.endswith('/') and h(src.read(n)) != h(chk.read(n))]
assert sorted(diff) == sorted(CHANGED), diff
assert set(chk.namelist()) == names
print('carried from v77:', kept, '; replaced:', rep, '; entries differing from v77:', diff)
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
