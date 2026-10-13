# Builds assets/marketing.bundle.css for /marketing/: the 8 stylesheets the page used to load one by one, joined in
# the SAME order, so the cascade is identical (one render-blocking request instead of eight; audit v3 #1).
# All sources live in assets/, so their relative url()s (fonts/, mark-8.webp, v3-cursor-32.png) still resolve.
# RE-RUN after any change to one of these files, then update the ?v= token on marketing/index.html (it prints it).
#   python C:\Work\domin8te-build\mkt-bundle.py
import os, hashlib
A = r'C:\Work\domin8te-media\assets'
ORDER = ['site.css', 'v-editorial.css', 'dash.css', 'light.css', 'v3.css', 'work.css', 'seo.css', 'marketing.css']
parts = []
for f in ORDER:
    css = open(os.path.join(A, f), encoding='utf-8').read()
    assert '@import' not in css, f
    if css.startswith('\ufeff'): css = css[1:]
    if f == 'v3.css':
        # v3.css has a stray "}" after the cursor block. Browsers read it as the start of the next rule's selector,
        # so that rule (headline second lines in --v3-dusk) is silently dropped on every page. Keep the page looking
        # exactly as it does today, but parseable: drop the brace together with the rule it cancels.
        stray = ('}\n}\nhtml[data-v="editorial"][data-theme="light"] .hl .ln--2,\n'
                 'html[data-v="editorial"][data-theme="light"] .band--studio .ln--2{color:var(--v3-dusk)}\n')
        assert css.count(stray) == 1, 'v3.css stray brace changed: re-check the bundle'
        css = css.replace(stray, '}\n')
    parts.append('/* ==== %s ==== */\n%s\n' % (f, css.rstrip()))
out = os.path.join(A, 'marketing.bundle.css')
open(out, 'w', encoding='utf-8', newline='\n').write('\n'.join(parts))
t = hashlib.sha256(open(out, 'rb').read()).hexdigest()[:10]
print('wrote marketing.bundle.css', os.path.getsize(out), 'bytes; token', t)
