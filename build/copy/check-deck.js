// Copy gate for the domin8temedia.com deck.
// Usage: node check-deck.js [deck.json] [--table]
// Exit code 1 if any hard failure.
const fs = require('fs');
const path = require('path');

const file = process.argv.find(a => a.endsWith('.json')) || path.join(__dirname, 'deck-v2.json');
const showTable = process.argv.includes('--table');
const deck = JSON.parse(fs.readFileSync(file, 'utf8'));

const len = s => [...s].length;
const fails = [];
const reviews = [];
const fail = (p, m) => fails.push(`${p}: ${m}`);
const review = (p, m) => reviews.push(`${p}: ${m}`);

// ---------- walk every string ----------
const strings = [];
(function walk(v, p) {
  if (typeof v === 'string') return strings.push([p, v]);
  if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${p}[${i}]`));
  if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], p ? `${p}.${k}` : k);
})(deck, '');

// strings that are explanation, not page copy
const isMeta = p => /^deck$|^notes\.|\.why$/.test(p);
const live = strings.filter(([p]) => !isMeta(p));

// ---------- character limits ----------
const O = '(?:\\.options\\[\\d+\\])';
const rules = [
  [/^meta\.title$/, 60], [/^meta\.description$/, 155],
  [/^og\.title$/, 60], [/^og\.description$/, 155],
  [/^header\.navHow$/, 14], [/^header\.navWork$/, 10], [/^header\.navContact$/, 20],
  [/^hero\.badge$/, 38], [/^hero\.badgeTag$/, 8], [/^hero\.badgeText$/, 38],
  [new RegExp(`^hero\\.(h1|alts\\.h1${O})\\.line1$`), 24],
  [new RegExp(`^hero\\.(h1|alts\\.h1${O})\\.line2$`), 30],
  [new RegExp(`^hero\\.(sub|alts\\.sub${O})$`), 125],
  [/^hero\.primaryCta$/, 22], [/^hero\.secondaryCta$/, 20],
  [new RegExp(`^film\\.f[1345](${O.replace('options', 'alts\\.options')})?\\.line1$`), 26],
  [new RegExp(`^film\\.f[1345](${O.replace('options', 'alts\\.options')})?\\.line2$`), 30],
  [new RegExp(`^film\\.f[1345](${O.replace('options', 'alts\\.options')})?\\.sub$`), 95],
  [/^film\.f2\.line1$/, 34],
  [/^film\.f4\.panels\.\w+\.title$/, 14], [/^film\.f4\.panels\.\w+\.line$/, 38],
  [/^film\.f6\.line$/, 40],
  [new RegExp(`^work\\.(heading|alts\\.heading${O})\\.line1$`), 28],
  // line2 raised from 34 to 38 on 2026-09-18 for Karan's "Multiple projects all under one roof." (37);
  // checked at 1280, 1440, 1920 and 2560 wide, two lines inside the column.
  [new RegExp(`^work\\.(heading|alts\\.heading${O})\\.line2$`), 38],
  [/^work\.intro$/, 170],
  [/^work\.items\.\w+\.title$/, 16], [/^work\.items\.\w+\.claim$/, 60], [/^work\.items\.\w+\.detail$/, 150],
  [/^work\.demo\.website\.heroLine$/, 28], [/^work\.demo\.website\.button$/, 16],
  [/^work\.demo\.ad\.headline$/, 26], [/^work\.demo\.ad\.smallLine$/, 20],
  [/^work\.demo\.social\.captions\[\d+\]$/, 60],
  [/^work\.demo\.search\.query$/, 22], [/^work\.demo\.search\.hoursLine$/, 28],
  [/^work\.demo\.search\.reviewSnippet$/, 70],
  [/^picker\.heading$/, 34], [/^picker\.heading\.line1$/, 26], [/^picker\.heading\.line2$/, 30],
  [/^picker\.intro$/, 100], [/^picker\.empty$/, 70],
  [/^picker\.stepLabels\.(first|then|everyWeek)$/, 12],
  // 28 since 2026-09-18 for Karan's sixth option, "Have something else on mind?"
  [/^picker\.options\[\d+\]\.label$/, 28],
  [/^picker\.options\[\d+\]\.steps\.(first|then|everyWeek)$/, 105],
  [/^picker\.options\[\d+\]\.cta$/, 28],
  [new RegExp(`^contact\\.(heading|alts\\.heading${O})\\.line1$`), 26],
  [new RegExp(`^contact\\.(heading|alts\\.heading${O})\\.line2$`), 30],
  [/^contact\.lede$/, 150],
  [/^contact\.fields\.contact\.hint$/, 50],
  [/^contact\.fields\.detailsToggle$/, 28],
  [/^contact\.fields\.challenge\.placeholder$/, 60],
  [/^contact\.submit$/, 22], [/^contact\.sending$/, 14], [/^contact\.success$/, 90],
  [/^contact\.errors\.(nameMissing|restaurantMissing|contactMissing|contactInvalid)$/, 60],
  [/^contact\.errors\.sendFailed$/, 120],
  [/^contact\.reassurance$/, 70], [/^contact\.emailAlt$/, 60],
  [/^sticky\.label$/, 22],
  [/^footer\.line$/, 90], [/^footer\.honestyNote$/, 80],
];
const table = [];
let limited = 0;
for (const [p, s] of live) {
  const r = rules.find(([re]) => re.test(p));
  if (!r) continue;
  limited++;
  const n = len(s);
  table.push([p, n, r[1]]);
  if (n > r[1]) fail(p, `${n} chars, limit ${r[1]}: "${s}"`);
}
const unlimited = live.filter(([p]) => !rules.some(([re]) => re.test(p))).map(([p]) => p);

// ---------- copy gate: dashes ----------
for (const [p, s] of strings) {
  if (/[‒–—―−]/.test(s)) fail(p, `dash character in "${s}"`);
  if (/\s-\s|--/.test(s)) fail(p, `hyphen used as a dash in "${s}"`);
}

// ---------- copy gate: banned words, any form ----------
const banned = [
  ['leverage', /leverag/i], ['seamless', /seamless/i], ['empower', /empower/i], ['unlock', /unlock/i],
  ['robust', /robust/i], ['actionable', /actionable/i], ['data-driven', /data[\s-]?driven/i],
  ['solutions', /solution/i], ['elevate', /elevat/i], ['transform', /transform/i],
  ['supercharge', /supercharg/i], ['game-changer', /game[\s-]?chang/i], ['cutting-edge', /cutting[\s-]?edge/i],
  ['next-level', /next[\s-]?level/i], ['revolutionize', /revolution/i], ['synergy', /synerg/i],
  ['holistic', /holistic/i], ['tailored', /tailor/i], ['journey', /journey/i], ['boost', /boost/i],
  ['ROI', /\bROI\b/i], ['harness', /harness/i], ['streamline', /streamlin/i], ['effortless', /effortless/i],
  ['delve', /\bdelv/i], ['landscape', /landscape/i], ["in today's", /in today['’]s/i],
];
const vocab = [
  ['chip', /\bchips?\b/i], ['core', /\bcores?\b/i], ['engine', /\bengines?\b/i],
  ['current', /\bcurrent/i], ['power / power-up', /\bpower/i], ['AI-engine', /AI[\s-]?engine/i],
];
for (const [p, s] of strings) {
  for (const [w, re] of banned) if (re.test(s)) fail(p, `banned word "${w}" in "${s}"`);
  for (const [w, re] of vocab) if (re.test(s)) fail(p, `banned vocabulary "${w}" in "${s}"`);
}

// ---------- AI mentions: at most once on the page ----------
const aiHits = live.filter(([, s]) => /\bAI\b/.test(s));
if (aiHits.length > 1) fail('page', `AI mentioned ${aiHits.length} times`);

// ---------- rhetorical questions in headlines ----------
const headline = /^(hero\.h1|film\.f\d\.line\d|film\.f6\.line|work\.heading|contact\.heading)|\.alts\.(h1|heading)|film\.f[15]\.alts\.options\[\d+\]\.line/;
for (const [p, s] of live) if (headline.test(p) && s.includes('?')) fail(p, `question in a headline: "${s}"`);

// ---------- sentence case ----------
const proper = new Set(['Google', 'Domin8te', 'Media', 'SEO', 'PDF', 'Friday', 'Saturday', 'Tuesday', 'Tuesdays', 'Monday', 'Mondays', 'Bistro', 'Fennel', 'Facebook', 'Instagram', 'Meta']);
for (const [p, s] of live) {
  const words = s.split(/\s+/);
  words.forEach((w, i) => {
    const bare = w.replace(/^[“"(]+|[.,:;!?”")]+$/g, '').replace(/[’']s$/, '');
    if (!/^[A-Z]/.test(bare)) return;
    if (proper.has(bare)) return;
    const prev = i === 0 ? null : words[i - 1];
    const sentenceStart = i === 0 || /[.!?]["”]?$/.test(prev) || prev === '|' || prev === '·';
    if (!sentenceStart) fail(p, `capital mid-sentence "${bare}" in "${s}"`);
  });
}
// two-line headlines: line2 case must follow line1's punctuation
const pairs = [];
(function findPairs(v, p) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (typeof v.line1 === 'string' && typeof v.line2 === 'string') pairs.push([p, v.line1, v.line2]);
    for (const k of Object.keys(v)) findPairs(v[k], p ? `${p}.${k}` : k);
  } else if (Array.isArray(v)) v.forEach((x, i) => findPairs(x, `${p}[${i}]`));
})(deck, '');
for (const [p, a, b] of pairs) {
  const ends = /[.!?]$/.test(a);
  const upper = /^[A-Z]/.test(b) && !proper.has(b.split(' ')[0]);
  if (ends && !upper) fail(p, `line2 should start a new sentence: "${a}" / "${b}"`);
  if (!ends && upper) fail(p, `line2 continues line1 and should start lower case: "${a}" / "${b}"`);
}

// ---------- triads-for-rhythm: three short fragments in a row ----------
let triads = 0;
for (const [p, s] of live) {
  const sentences = s.split(/(?<=[.!?])\s+/);
  let run = 0;
  for (const sen of sentences) {
    run = sen.split(/\s+/).length <= 4 ? run + 1 : 0;
    if (run === 3) { triads++; review(p, `A. B. C. fragment triad in "${s}"`); }
  }
  for (const sen of sentences) {
    const chunks = sen.replace(/[.!?]$/, '').split(/,\s*|\s+and\s+/);
    if (chunks.length === 3 && chunks.every(c => c.split(/\s+/).length <= 2) && sen.split(/\s+/).length <= 7) {
      triads++; review(p, `comma fragment triad in "${s}"`);
    }
  }
}
const liveTriads = reviews.filter(r => !/\.alts\./.test(r)).length;
if (liveTriads > 1) fail('page', `${liveTriads} fragment triads in live copy (max 1)`);

// ---------- numbers, promises, fabrication, team, location ----------
const numbersAllowed = /^work\.demo\.|^contact\.fields\.challenge\.placeholder$/;
for (const [p, s] of live) {
  const stripped = s.replace(/domin8te(media)?/gi, '');
  if (/\d/.test(stripped) && !numbersAllowed.test(p)) fail(p, `number outside demo content: "${s}"`);
  if (/%|\$|£|€/.test(s)) fail(p, `money or percentage: "${s}"`);
  if (/guarantee|\bresults?\b|testimonial|\b(our|happy) clients\b|\bclients love\b|\b(5|five)[\s-]star/i.test(s)) fail(p, `claim language: "${s}"`);
  if (/\bteam\b|account manager|department|\bexperts?\b|\bour people\b|\bstaff of\b/i.test(s) && !/staff day/.test(s)) fail(p, `big-team language: "${s}"`);
  if (/\bKaran\b/.test(s)) fail(p, `names a person: "${s}"`);
  if (/based in|located in|serving the|\bcity\b/i.test(s)) fail(p, `location language: "${s}"`);
  if (/\b(pricing|price|packages?|contract|per month|\/mo)\b/i.test(s)) fail(p, `commercial terms: "${s}"`);
  if (/\b(\d+|one|two|three|a few)\s+(days?|weeks?|months?)\b/i.test(s.replace(/one business day/gi, ''))) fail(p, `timeline: "${s}"`);
  if (/\bmedia buy|ad spend|budget\b/i.test(s)) fail(p, `ad spend claim: "${s}"`);
}

// ---------- structure ----------
const need = deck.contact.fields.need.options;
if (need.length !== 6) fail('contact.fields.need.options', `expected 6, got ${need.length}`);
const opts = deck.picker.options;
if (opts.length !== 6) fail('picker.options', `expected 6, got ${opts.length}`);
opts.forEach((o, i) => {
  if (!need.includes(o.prefill)) fail(`picker.options[${i}].prefill`, `"${o.prefill}" is not a select option`);
  for (const k of ['first', 'then', 'everyWeek']) if (!o.steps || !o.steps[k]) fail(`picker.options[${i}].steps`, `missing ${k}`);
});
if (opts[4] && opts[4].prefill !== need[4]) fail('picker.options[4]', 'the fifth option should pre-fill the fifth select option ("all of it")');


const four = ['website', 'adCreatives', 'socialMedia', 'seo'];
for (const where of ['film.f4.panels', 'work.items']) {
  const obj = where.split('.').reduce((o, k) => o[k], deck);
  const keys = Object.keys(obj);
  if (keys.join() !== four.join()) fail(where, `expected ${four.join(', ')}, got ${keys.join(', ')}`);
}
if (deck.work.demo.social.captions.length !== 3) fail('work.demo.social.captions', 'expected 3');
// work.intro was removed on 2026-09-18 at Karan's request. The section's own
// "these are in-house examples" line went with it, so the page's only disclosure
// that the Bistro Fennel work is invented is footer.honestyNote, checked below.
if (deck.work.intro !== undefined && !/in-house examples/i.test(deck.work.intro)) fail('work.intro', 'must say plainly that these are in-house examples');
const inHouseMentions = live.filter(([p, s]) => /in-house example/i.test(s) && !/\.alts\./.test(p)).length;
if (inHouseMentions > 1) review('page', `"in-house example" stated ${inHouseMentions} times (brief asks for once, plainly)`);
if (inHouseMentions === 0 && !/in-house/.test(deck.footer.honestyNote || '')) fail('page', 'nothing on the page says the example work is made in-house');
if (!/in-house/.test(deck.footer.honestyNote) || !/illustrative/.test(deck.footer.honestyNote)) fail('footer.honestyNote', 'must say illustrative and made in-house');
for (const p of ['contact.errors.sendFailed', 'contact.emailAlt']) {
  const s = p.split('.').reduce((o, k) => o[k], deck);
  if (!s.includes('karanhelps@domin8temedia.com')) fail(p, 'must include karanhelps@domin8temedia.com');
}
const f2 = deck.film.f2;
// raised from 34 to 40 on 2026-09-18 for Karan's "The first step / toward something bigger."
// (38). Checked at 1280, 1440, 1920 and 2560 wide: two lines, inside the column, clear of the line.
if (len([f2.line1, f2.line2].filter(Boolean).join(' ')) > 40) fail('film.f2', 'over 40 chars total');

// alternatives: four each, pick matches live copy
const altSets = [
  ['hero.alts.h1', deck.hero.alts.h1, deck.hero.h1],
  ['hero.alts.sub', deck.hero.alts.sub, deck.hero.sub],
  ['film.f1.alts', deck.film.f1.alts, deck.film.f1],
  ['film.f5.alts', deck.film.f5.alts, deck.film.f5],
  ['work.alts.heading', deck.work.alts.heading, deck.work.heading],
  ['contact.alts.heading', deck.contact.alts.heading, deck.contact.heading],
];
for (const [p, set, liveCopy] of altSets) {
  if (!set || set.options.length !== 4) { fail(p, 'needs exactly 4 options'); continue; }
  if (!set.why) fail(p, 'missing why');
  const picked = set.options[set.pick];
  const same = typeof picked === 'string'
    ? picked === liveCopy
    : Object.keys(picked).every(k => picked[k] === liveCopy[k]);
  if (!same) fail(p, 'picked option does not match the live copy');
}

// ---------- v2 slots and structure (decks that declare v2 or later) ----------
const get = p => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), deck);
const version = +((/\bv(\d+)\b/.exec(deck.deck || '') || [])[1] || 1);
const isV2 = version >= 2;
if (isV2) {
  // hero badge is a link to the picker: tag + label, no plain badge
  if (deck.hero.badge !== undefined) fail('hero.badge', 'replaced by hero.badgeTag + hero.badgeText in v2');
  for (const p of ['hero.badgeTag', 'hero.badgeText']) if (typeof get(p) !== 'string' || !get(p)) fail(p, 'missing');
  // the sky's words are set in the Blender film: short, one line each
  for (const [p, max] of [['film.f3.big', 20], ['film.f7.big1', 22], ['film.f7.big2', 34]]) {
    const v = get(p);
    if (typeof v !== 'string' || !v) fail(p, 'missing');
    else if (len(v) > max) fail(p, `too long (${len(v)} > ${max})`);
  }
  if (/^new$/i.test(deck.hero.badgeTag || '')) fail('hero.badgeTag', '"New" says nothing about where the link goes');
  // The audience left the hero on 2026-09-18 when Karan rewrote hero.sub. It must
  // still be somewhere a visitor can read it, so the check widened from the hero to
  // the visible page; footer.line ("For restaurants, cafes, coffee shops and bakeries")
  // is what carries it now, alongside the meta description.
  const heroText = [deck.hero.h1.line1, deck.hero.h1.line2, deck.hero.sub].join(' ');
  const audienceOnPage = [heroText, deck.footer.line, deck.work.heading.line1, deck.work.heading.line2].join(' ');
  if (!/restaurants?,? (and |cafes)/i.test(audienceOnPage)) fail('page', 'nothing visible says who the site is for (restaurants and cafes)');
  if (!/independent restaurants and cafes/i.test(heroText)) review('hero', 'the hero no longer names the audience; it rests on the footer and the meta description');
  // one label for one destination
  const ctaLabels = [deck.hero.primaryCta, deck.header.navContact, deck.sticky.label];
  if (new Set(ctaLabels).size !== 1) fail('cta', `primaryCta, navContact and sticky.label differ: ${ctaLabels.join(' / ')}`);
  if (/\btalk\b|\bcontact\b/i.test(deck.hero.primaryCta)) fail('hero.primaryCta', `names a medium, not what they get: "${deck.hero.primaryCta}"`);
  if (!deck.hero.secondaryCta.toLowerCase().includes(deck.header.navHow.toLowerCase())) fail('header.navHow', `film gets two names: "${deck.header.navHow}" vs "${deck.hero.secondaryCta}"`);
  // picker heading has two lines
  const ph = deck.picker.heading;
  if (!ph || typeof ph.line1 !== 'string' || typeof ph.line2 !== 'string' || !ph.line1 || !ph.line2) fail('picker.heading', 'needs line1 and line2');
  if (ph && /right now/i.test(`${ph.line1} ${ph.line2}`)) fail('picker.heading', '"right now" is padding');
  // f4 sub: written, or empty with a stated reason
  if (typeof deck.film.f4.sub !== 'string') fail('film.f4.sub', 'missing (write it or set it to "" with notes.f4Sub)');
  else if (deck.film.f4.sub === '' && !(deck.notes && deck.notes.f4Sub)) fail('film.f4.sub', 'empty without a reason in notes.f4Sub');
  // empty plan panel: must work when the panel sits below the options on a phone
  if (typeof deck.picker.empty !== 'string' || !deck.picker.empty) fail('picker.empty', 'missing');
  else if (/\b(left|right|beside|opposite|next to|to the side)\b/i.test(deck.picker.empty)) fail('picker.empty', `position word breaks on phones: "${deck.picker.empty}"`);
  // step labels, and the weekly rule
  const sl = deck.picker.stepLabels || {};
  for (const k of ['first', 'then', 'everyWeek']) if (typeof sl[k] !== 'string' || !sl[k]) fail('picker.stepLabels', `missing ${k}`);
  if (/every week|weekly/i.test(sl.everyWeek || '')) {
    opts.forEach((o, i) => {
      if (!/every week|weekly|each week/i.test(o.steps.everyWeek)) fail(`picker.options[${i}].steps.everyWeek`, `sits under "${sl.everyWeek}" but is not weekly: "${o.steps.everyWeek}"`);
    });
  }
  // "then" step must not say "first"
  opts.forEach((o, i) => { if (/\bfirst\b/i.test(o.steps.then)) fail(`picker.options[${i}].steps.then`, `says "first" under the "${sl.then}" label`); });
  // jargon in the owner's own form and titles
  for (const [p, s] of live) if (/ad creatives?/i.test(s) && !/\.alts\./.test(p)) fail(p, `agency jargon "ad creatives": "${s}"`);
  // contact heading must not echo the "Start with" buttons that land on it
  if (/start with/i.test(`${deck.contact.heading.line1} ${deck.contact.heading.line2}`)) fail('contact.heading', 'collides with the "Start with" picker buttons');
  // the honesty note must not call the whole page fake
  if (/\bevery screen\b/i.test(deck.footer.honestyNote)) fail('footer.honestyNote', '"every screen" reads as the whole page being fake');
  // owner facts
  for (const [p, s] of live) {
    if (/never (have to )?(log in|check|approve)|(don[’']t|do not|won[’']t) (have to |need to )?(log in|check anything|approve)/i.test(s)) fail(p, `promises the owner never logs in or approves: "${s}"`);
    if (/photo ?shoots?|photographer|we (shoot|photograph)/i.test(s)) fail(p, `promises photography: "${s}"`);
    if (/new ads? every week|weekly ads?|ads? each week/i.test(s)) fail(p, `weekly ad cadence is not confirmed: "${s}"`);
  }
}

// ---------- repetition report (page copy only: no meta/og, no alternates, no demo content) ----------
// film.charge.label is left out too. It is the word "Scroll" beside the charge icon, which Karan asked for by
// name (2026-09-19: "an icon ... that will have scroll text right next to it"). It is an instruction for the
// wheel, aria-hidden and film-only, not a line of copy, so it cannot wear out the ad panel's scroll-speed idea,
// which is what the cap below protects.
const pageCopy = live.filter(([p, s]) => s && !/^(meta|og)\./.test(p) && !/\.alts\./.test(p) && !/^work\.demo\./.test(p) && p !== 'film.charge.label');
const section = p => (/^film\.f\d/.exec(p) || [p.split('.')[0]])[0];
const reps = [
  // [label, regex, hard cap or null, note]
  ['hours', /\bhours?\b/gi, null, 'literal word'],
  ['wrong-hours example', /hours wrong|wrong hours|right hours|holiday hours|close at \d|open till/gi, null, 'lines carrying the example, stated or answered', true],
  ['right (adjective)', /\bright\b(?!\s+now)/gi, 1, 'cap 1'],
  ['right now', /\bright now\b/gi, 1, 'cap 1'],
  ['every week (literal)', /\bevery week\b|\bweekly\b|\beach week\b/gi, null, ''],
  ['all four', /\ball four\b/gi, 2, 'cap 2'],
  ['nearby', /\bnearby\b/gi, 2, 'cap 2'],
  ['start with', /\bstart with\b/gi, null, 'picker buttons show one at a time'],
  ['in your voice', /\bin your voice\b/gi, 1, 'cap 1'],
  ['what we’d do', /what we[’']?d (actually )?do\b|what we would (actually )?do\b/gi, 1, 'cap 1'],
  ['look at', /\blook(s|ed|ing)? at\b/gi, 2, 'cap 2'],
  ['scroll-speed idea', /\bscroll|\bthumb\b|quick yes/gi, 1, 'cap 1'],
];
const repRows = [];
for (const [label, re, cap, note, perLine] of reps) {
  const where = [];
  for (const [p, s] of pageCopy) { const m = s.match(re); if (m) for (let i = 0; i < (perLine ? 1 : m.length); i++) where.push(p); }
  repRows.push([label, where.length, cap, note, where]);
  if (isV2 && cap != null && where.length > cap) fail('repetition', `"${label}" used ${where.length} times (cap ${cap}): ${where.join(', ')}`);
}
// the ongoing promise: where does the page say "and we keep doing it"?
const ongoingRe = /\bevery week\b|\bweekly\b|\beach week\b|\bkeep(s|ing)? (the|it|them|your|all|going|running|up)\b|\bkept\b|\bstays? (off|on|with|right)\b|\bfrom then on\b|\bongoing\b|\bafter that\b|\beven when\b|\bup to date\b|\blooked after\b|\bwe run\b/i;
const ongoingHits = pageCopy.filter(([, s]) => ongoingRe.test(s));
const ongoingPlacements = [...new Set(ongoingHits.map(([p]) => section(p)))];
const allowedOngoing = new Set(['hero', 'film.f5', 'picker']);
if (isV2) for (const pl of ongoingPlacements) if (!allowedOngoing.has(pl)) fail('repetition', `ongoing promise outside hero, f5 and picker: ${ongoingHits.filter(([p]) => section(p) === pl).map(([p, s]) => `${p} "${s}"`).join('; ')}`);

// ---------- report ----------
console.log(`deck: ${path.basename(file)}`);
console.log(`strings: ${strings.length} total, ${live.length} page copy, ${limited} with a hard limit`);
console.log(`limits: ${table.filter(([, n, m]) => n > m).length} over`);
const tight = table.filter(([, n, m]) => m - n <= 2 && n <= m);
console.log(`at or within 2 of the limit: ${tight.length ? tight.map(([p, n, m]) => `${p} ${n}/${m}`).join('; ') : 'none'}`);
console.log(`dashes: ${fails.filter(f => /dash/.test(f)).length}`);
console.log(`banned words: ${fails.filter(f => /banned word/.test(f)).length}`);
console.log(`banned product vocabulary: ${fails.filter(f => /banned vocabulary/.test(f)).length}`);
console.log(`AI mentions in page copy: ${aiHits.length} (max 1)`);
console.log(`fragment triads in live copy: ${liveTriads} (max 1)`);
console.log(`picker prefills valid: ${opts.every(o => need.includes(o.prefill))}`);
console.log(`slots with no stated limit (labels, demo names): ${unlimited.length}`);
if (isV2) {
  console.log(`v2 slots: badge "${deck.hero.badgeTag} › ${deck.hero.badgeText}"; picker heading "${deck.picker.heading.line1} / ${deck.picker.heading.line2}"; step labels ${['first', 'then', 'everyWeek'].map(k => `"${deck.picker.stepLabels[k]}"`).join(', ')}; f4.sub ${deck.film.f4.sub ? `"${deck.film.f4.sub}"` : 'empty (reason in notes.f4Sub)'}`);
  console.log(`one CTA label: "${deck.hero.primaryCta}" (hero, nav, sticky)`);
}
console.log('\nrepetition (page copy, excluding meta, alternates and demo content):');
for (const [label, n, cap, note, where] of repRows) {
  console.log(`  ${label}: ${n}${cap != null ? ` (cap ${cap})` : ''}${where.length ? `  [${where.join(', ')}]` : ''}${note && cap == null ? `  (${note})` : ''}`);
}
console.log(`  ongoing promise: ${ongoingHits.length} lines in ${ongoingPlacements.length} placements (${ongoingPlacements.join(', ') || 'none'}); allowed: hero, film.f5, picker`);
for (const [p, s] of ongoingHits) console.log(`    ${p}: "${s}"`);
if (showTable) {
  console.log('\nslot | chars | limit');
  for (const [p, n, m] of table) console.log(`${p} | ${n} | ${m}`);
}
if (reviews.length) { console.log('\nreview:'); reviews.forEach(r => console.log('  ' + r)); }
if (fails.length) { console.log('\nFAIL:'); fails.forEach(f => console.log('  ' + f)); process.exitCode = 1; }
else console.log('\nPASS: no hard failures');
