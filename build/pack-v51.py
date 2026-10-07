# Build domin8te-v51.zip = the live v50 archive + THE WORK (2026-10-07, Karan: "Everything"):
#   /work/ (every client), /work/freddys/ and /work/lecookie/ (a story page each), and
#   /work/lecookie/live/ (the Lecookie build itself, shown in the live window; noindex, and
#   Disallowed in robots.txt), the homepage (its client cards now open /work/), robots.txt and
#   sitemap.xml (the three work pages). Assets are scanned from the homepage and the work pages,
#   their sheets and scripts, plus the fonts. Everything else in v50 (console/, dashboard/,
#   onboarding/, send.php, .htaccess) is carried over byte for byte.
import zipfile, os, re, sys

BASE = r'C:\Work\domin8te-v50.zip'
OUT = r'C:\Work\domin8te-v51.zip'
SITE = r'C:\Work\domin8te-media'
A = os.path.join(SITE, 'assets')

want = set()
def add(rel):
    rel = rel.split('?')[0].split('#')[0].lstrip('./')
    if rel.startswith('assets/') and not rel.endswith(('-', '/')) and '%' not in rel: want.add(rel)   # not a name built in code
PAGES = ['index.html', 'work/index.html', 'work/freddys/index.html', 'work/lecookie/index.html']
for pg in PAGES:
    html = re.sub(r'<!--.*?-->', '', open(os.path.join(SITE, pg), encoding='utf-8').read(), flags=re.S)   # not what comments mention
    for m in re.finditer(r'(?<![A-Za-z0-9_.-])assets/[A-Za-z0-9_./-]+', html): add(m.group(0))
for f in os.listdir(A):
    p = os.path.join(A, f)
    if f.endswith(('.css', '.js')) and ('assets/' + f) in want:
        t = open(p, encoding='utf-8').read()
        for m in re.finditer(r'(?<![A-Za-z0-9_.-])assets/[A-Za-z0-9_./-]+', t): add(m.group(0))
        if f.endswith('.css'):
            for m in re.finditer(r'url\(\s*["\']?([^"\')]+)', t):
                u = m.group(1)
                if not u.startswith(('data:', 'http', '/', '#')): add('assets/' + u)
for root, _, files in os.walk(os.path.join(A, 'fonts')):
    for f in files: want.add('assets/fonts/' + f)
missing = sorted(w for w in want if not os.path.isfile(os.path.join(SITE, w)))
if missing: sys.exit('MISSING: ' + ', '.join(missing))

# the Lecookie build, whole
LIVE = 'work/lecookie/live'
live = []
for root, _, files in os.walk(os.path.join(SITE, LIVE)):
    for f in files:
        live.append(os.path.relpath(os.path.join(root, f), SITE).replace('\\', '/'))

FILES = ['robots.txt', 'sitemap.xml']
src = zipfile.ZipFile(BASE)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = []
for info in src.infolist():
    n = info.filename
    if n in PAGES or n in FILES or n.startswith('assets/') or n.startswith('work/'): continue
    out.writestr(info, src.read(info)); kept.append(n)
for pg in PAGES + FILES: out.write(os.path.join(SITE, pg), pg)
for w in sorted(want): out.write(os.path.join(SITE, w), w)
for l in sorted(live): out.write(os.path.join(SITE, l), l)
out.close()
print('carried from v50:', len(kept), sorted(set(k.split('/')[0] for k in kept)))
print('pages:', PAGES, '+', FILES)
print('assets:', len(want), '; lecookie live files:', len(live))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
