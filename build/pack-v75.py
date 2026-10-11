# DRAFT (debug pass, 2026-10-11). Copy to C:\Work\domin8te-build\pack-v75.py only after Karan says "deploy" and after
# re-reading the top of RESUME.md and deploy.js (v75 must still be free; another session shipped v74 today).
# Build domin8te-v75.zip = the live v74 archive + the debug-pass fixes (dashboard, demo, console, contact form, onboarding).
# REPLACED only (each must already be in v74 and must differ from it):
#   send.php, assets/site.js            contact form: no silent loss, per-person throttle, page line, timeout
#   index.html, marketing/index.html    site.js cache token + honeypot renamed d8x (marketing page is another session's
#                                       v74 page: only those two lines change)
#   dashboard/index.html, dashboard/demo/index.html, console/index.html   rebuilt from source (make-dashboard --site, build-console --site)
#   onboarding/index.html, onboarding.css, onboarding.js, steps.js, submit.php   via build/onboarding/ship.js
# Everything else carried byte for byte. Roll back = redeploy v74.
import zipfile, os, hashlib

BASE = r'C:\Work\domin8te-v74.zip'
OUT = r'C:\Work\domin8te-v75.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = [
    'send.php', 'assets/site.js', 'index.html', 'marketing/index.html',
    'dashboard/index.html', 'dashboard/demo/index.html', 'console/index.html',
    'onboarding/index.html', 'onboarding/onboarding.css', 'onboarding/onboarding.js', 'onboarding/steps.js', 'onboarding/submit.php',
]
h = lambda b: hashlib.sha256(b).hexdigest()

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v74 (expected a replacement): ' + c)
    local = open(os.path.join(SITE, c.replace('/', os.sep)), 'rb').read()
    if h(local) == h(src.read(c)): raise SystemExit('unchanged vs v74 (did the build/stamp step run?): ' + c)

# the pages must load the site.js that ships (a stale ?v= token would keep visitors on the old form code for a year)
tok = h(open(os.path.join(SITE, 'assets', 'site.js'), 'rb').read())[:10]
for p in ('index.html', 'marketing/index.html'):
    page = open(os.path.join(SITE, p.replace('/', os.sep)), encoding='utf-8').read()
    if ('assets/site.js?v=' + tok) not in page: raise SystemExit(p + ' does not load site.js?v=' + tok)
# private and portal rules: no Meta Pixel on the portal or onboarding pages, the demo and live dashboard both built
for p in ('dashboard/index.html', 'dashboard/demo/index.html', 'console/index.html', 'onboarding/index.html'):
    page = open(os.path.join(SITE, p.replace('/', os.sep)), encoding='utf-8').read()
    if 'fbq(' in page or 'connect.facebook.net' in page: raise SystemExit('Meta Pixel found on a private page: ' + p)
live = open(os.path.join(SITE, 'dashboard', 'index.html'), encoding='utf-8').read()
demo = open(os.path.join(SITE, 'dashboard', 'demo', 'index.html'), encoding='utf-8').read()
if 'window.D8CONFIG = {"mode":"live"' not in live: raise SystemExit('dashboard/index.html is not the live build')
if 'window.D8CONFIG = {"mode":"live"' in demo: raise SystemExit('dashboard/demo/index.html carries live settings: it must be the demo build')
if '"demoUrl":"/dashboard/demo/"' not in live: raise SystemExit('live dashboard has a wrong demo link (Git Bash path rewrite?)')
if 'READ_ONLY' not in demo: raise SystemExit('the demo build has no view-only guard: built from old source?')

if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = rep = 0
for info in src.infolist():
    if info.filename in CHANGED:
        out.write(os.path.join(SITE, info.filename.replace('/', os.sep)), info.filename); rep += 1
    else:
        out.writestr(info, src.read(info)); kept += 1
out.close()
print('carried from v74:', kept, '; replaced:', rep)
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
for c in CHANGED:
    print(f"  {c:32s} sha256 {h(open(os.path.join(SITE, c.replace('/', os.sep)), 'rb').read())[:16]}")
