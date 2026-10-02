"""Fill index.tpl.html with a copy deck and write the deploy index.html.
usage: python build_index.py deck-v2.json [out]   (default out: C:/Work/domin8te-media/index.html)
Fails loudly on any missing slot, so no placeholder can ship."""
import html
import json
import re
import sys

deck_path = sys.argv[1]
out_path = sys.argv[2] if len(sys.argv) > 2 else 'C:/Work/domin8te-media/index.html'
deck = json.load(open(deck_path, encoding='utf-8'))
tpl = open('C:/Work/domin8te-build/copy/index.tpl.html', encoding='utf-8').read()

# demo content the deck may not carry; ordinary and clearly fictional
DEFAULTS = {
    'work.demo.ad.tag': 'Tuesdays',
    'work.demo.ad2.headline': 'Set lunch, two courses',
    'work.demo.ad2.smallLine': 'Weekdays, 12 to 3',
    'work.demo.social.handle': 'bistrofennel',
    'work.demo.search.openShort': 'Open now',
    'work.demo.menu': [['Mussels, cider and leeks', '18'], ['Squash, brown butter, sage', '14'], ['Burnt honey tart', '8']],
    'work.demo.social.tiles': ['Squash is on tonight', 'Mussel night, Tuesday', 'Closed Monday'],
    'film.f1.sub': '', 'film.f3.sub': '', 'film.f4.sub': '', 'film.f5.sub': '',
}
missing = []


def get(key, default=None):
    cur = deck
    for part in re.split(r'\.(?![^\[]*\])', key):
        m = re.match(r'^(\w+)\[(\d+)\]$', part)
        try:
            if m:
                cur = cur[m.group(1)][int(m.group(2))]
            else:
                cur = cur[part]
        except (KeyError, IndexError, TypeError):
            if key in DEFAULTS:
                return DEFAULTS[key]
            if default is not None:
                return default
            missing.append(key)
            return ''
    return cur


MARK = '<svg class="inmark" viewBox="0 0 200 120" aria-hidden="true" focusable="false"><use href="#mark"/></svg>'


def esc(s):
    out = html.escape(str(s), quote=True)
    # *word* marks the one accent word; {mark} sets the brand mark inside a headline
    out = re.sub(r'\*([^*]+)\*', lambda m: '<em class="acc">%s</em>' % m.group(1), out)
    return out.replace('{mark}', MARK)


def lines(prefix, cls='hl'):
    l1, l2 = get(prefix + '.line1'), get(prefix + '.line2', '')
    if l2:
        return '<h2 class="%s"><span class="ln">%s</span> <span class="ln ln--2">%s</span></h2>' % (cls, esc(l1), esc(l2))
    return '<h2 class="%s hl--solo"><span class="ln">%s</span></h2>' % (cls, esc(l1))


blocks = {}
blocks['f2'] = lines('film.f2')
blocks['menu'] = '<ul class="mk-site__list">\n' + '\n'.join(
    '                <li><span>%s</span><i>%s</i></li>' % (esc(a), esc(b)) for a, b in get('work.demo.menu')) + '\n              </ul>'
tiles = get('work.demo.social.tiles')
PICS = ['soc-squash', 'soc-bar', 'soc-mussels', 'soc-hands', 'soc-front', 'soc-tart']
def tile(n, txt):
    return '<i class="t%d has-photo"><img class="mk-photo" src="assets/mock-%s.webp" width="600" height="600" alt="" decoding="async">%s</i>' % (n, PICS[n - 1], txt)
blocks['socgrid'] = '<div class="mk-soc__grid">' + ''.join(
    tile(n, esc(tiles[(n - 1) // 2]) if n % 2 else '') for n in range(1, 7)) + '</div>'

opts = get('picker.options')
labels = get('picker.stepLabels', ['First', 'Then', 'Every week'])
if isinstance(labels, dict):
    labels = [labels['first'], labels['then'], labels['everyWeek']]
blocks['opts'] = '\n'.join(
    '        <label class="opt"><input type="radio" name="problem" value="%s"><span class="opt__txt">%s</span></label>' % (esc(o['id']), esc(o['label'])) for o in opts)
plans = []
for o in opts:
    st = o['steps']
    plans.append('\n'.join([
        '        <div class="plan" data-plan="%s" data-need="%s">' % (esc(o['id']), esc(o['prefill'])),
        '          <h3 class="visually-hidden">%s</h3>' % esc(o['label']),
        '          <ol class="plan__steps">',
        '            <li class="step"><span class="step__when">%s</span><p class="step__what">%s</p></li>' % (esc(labels[0]), esc(st['first'])),
        '            <li class="step"><span class="step__when">%s</span><p class="step__what">%s</p></li>' % (esc(labels[1]), esc(st['then'])),
        '            <li class="step"><span class="step__when">%s</span><p class="step__what">%s</p></li>' % (esc(labels[2]), esc(st['everyWeek'])),
        '          </ol>',
        '          <a class="btn btn--primary plan__cta" href="#contact" data-need="%s">%s</a>' % (esc(o['prefill']), esc(o['cta'])),
        '        </div>']))
blocks['plans'] = '\n\n'.join(plans)

toggle = get('contact.fields.detailsToggle')
m = re.match(r'^(.*?)\s*(\(optional\))\s*$', toggle)
blocks['toggle'] = ('%s <span class="more__opt">%s</span>' % (esc(m.group(1)), esc(m.group(2)))) if m else esc(toggle)

need = get('contact.fields.need')
blocks['select'] = '<select id="f-need" name="need">\n' + '              <option value="">%s</option>\n' % esc(need.get('placeholder', 'Choose one')) + '\n'.join(
    '              <option>%s</option>' % esc(x) for x in need['options']) + '\n            </select>'
prefills = {o['prefill'] for o in opts}
if not prefills <= set(need['options']):
    missing.append('picker prefill not in select: %s' % (prefills - set(need['options'])))

addr = 'karanhelps@domin8temedia.com'
alt = get('contact.emailAlt')
if addr not in alt:
    missing.append('contact.emailAlt must contain the address')
blocks['emailalt'] = esc(alt).replace(addr, '<a href="mailto:%s">%s</a>' % (addr, addr))

# the one accent word: the deck may mark it with *word*; otherwise the last word of hero line 1
if '*' not in str(get('hero.h1.line1')):
    deck['hero']['h1']['line1'] = re.sub(r'(\S+)$', lambda m: '*' + m.group(1) + '*', deck['hero']['h1']['line1'])
out = tpl
out = re.sub(r'\{\{@(\w+)\}\}', lambda m: blocks[m.group(1)], out)
out = re.sub(r'\{\{\?([\w.\[\]]+)\|(.*?)\}\}', lambda m: (m.group(2) % esc(get(m.group(1)))) if get(m.group(1)) else '', out)
out = re.sub(r'\{\{([\w.\[\]]+)\}\}', lambda m: esc(get(m.group(1))), out)
left = re.findall(r'\{\{.*?\}\}', out)
if left:
    missing.append('unfilled: %s' % left)
if missing:
    raise SystemExit('BUILD FAILED, missing: %s' % sorted(set(map(str, missing))))
# empty sub paragraphs leave a blank indented line; tidy it
out = re.sub(r'\n[ \t]+\n', '\n', out)
open(out_path, 'w', encoding='utf-8', newline='\n').write(out)
print('wrote', out_path, len(out), 'bytes')
