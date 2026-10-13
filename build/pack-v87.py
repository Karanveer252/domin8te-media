# Build domin8te-v87.zip = the live v86 archive + the audit v4 fixes Karan approved ("the real issues only", 2026-10-13):
# links to /marketing/#contact or #bookCal finish the jump after Hostinger's browser check (instant, scroll-padding
# for the header); founder poster = the film's clean opening title card at 5.1s (no burned caption, no NEXT chip),
# play button bottom-right with no dark shade (label hidden on phones); Freddy's "Prototype" label visible on phones;
# "30 seconds" no longer said twice; founding-client line above the button (card kept); email link 44px tap target;
# "Get my free checkup" link under Freddy's live window. Rotator, labels and hero buttons unchanged (Karan's choices).
# CHANGED: marketing/index.html, marketing.css/.lean.css/.js, the 3 founder posters. Roll back = redeploy v86.
# + Meta Pixel: fbevents.js now fetched after the page has loaded (or on first tap/key/scroll); fbq queue unchanged, so PageView/Lead/Schedule still send. Karan: "delay the pixel", "do it".
import zipfile, os, re, hashlib
BASE = r'C:\Work\domin8te-v86.zip'; OUT = r'C:\Work\domin8te-v87.zip'; SITE = r'C:\Work\domin8te-media'
CHANGED = ['marketing/index.html', 'assets/marketing.css', 'assets/marketing.lean.css', 'assets/marketing.js',
           'assets/vsl/vsl-founder-16x9.webp', 'assets/vsl/vsl-founder-16x9-800.webp', 'assets/vsl/vsl-founder-16x9-480.webp']
ADDED = []
src = zipfile.ZipFile(BASE); names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v86: ' + c)
    if src.read(c) == open(os.path.join(SITE, c), 'rb').read(): raise SystemExit('unchanged vs v86: ' + c)
for a in ADDED:
    if a in names: raise SystemExit('already in v86: ' + a)
page = open(os.path.join(SITE, 'marketing', 'index.html'), encoding='utf-8').read()
for f in ['assets/marketing.lean.css', 'assets/marketing.js', 'assets/vsl/vsl-founder-16x9.webp', 'assets/vsl/vsl-founder-16x9-800.webp', 'assets/vsl/vsl-founder-16x9-480.webp']:
    t = hashlib.sha256(open(os.path.join(SITE, f), 'rb').read()).hexdigest()[:10]
    if '/%s?v=%s' % (f, t) not in page: raise SystemExit('stale token for ' + f)
livejs = hashlib.sha256(src.read('assets/site.js')).hexdigest()[:10]
if 'site.js?v=' + livejs not in page or 'name="d8x"' not in page: raise SystemExit('page not matched to the live site.js')
body = re.sub(r'<!--.*?-->', '', page, flags=re.S); refs = set()
for m in re.findall(r'(?:src|href|data-src|data-vid)="(/[^"#]*)"', body):
    p = m.split('?')[0].lstrip('/'); refs.add(p + 'index.html' if (p == '' or p.endswith('/')) else p)
for m in re.findall(r'(?:srcset|imagesrcset)="([^"]+)"', body):
    for part in m.split(','):
        u = part.strip().split(' ')[0]
        if u.startswith('/'): refs.add(u.split('?')[0].lstrip('/'))
missing = sorted(r for r in refs if r not in names | set(ADDED))
if missing: raise SystemExit('MISSING: ' + ', '.join(missing))
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9); kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED + ADDED: out.write(os.path.join(SITE, c.replace('/', os.sep)), c)
out.close()
print('carried from v86:', kept, '; replaced:', len(CHANGED), '; added:', len(ADDED), '; page refs checked:', len(refs)); print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
