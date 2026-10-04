// visible-copy gate: dashes anywhere, banned words in text + alt/aria/title/content attributes + JS strings
const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const h = fs.readFileSync(f, 'utf8');
  const dashes = [...h.matchAll(/[–—]/g)].length;
  const body = h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const attrs = [...body.matchAll(/(?:alt|aria-label|title|content|placeholder|data-msg-[a-z-]+)="([^"]*)"/g)].map(m => m[1]).join(' ');
  const text = body.replace(/<[^>]+>/g, ' ') + ' ' + attrs;
  const js = [...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const jsStrings = [...js.matchAll(/'([^'\n]{6,})'|"([^"\n]{6,})"|`([^`]{6,})`/g)].map(m => m[1] || m[2] || m[3]).filter(s => / /.test(s)).join(' ');
  const bad = /\b(leverage\w*|seamless\w*|empower\w*|unlock\w*|robust\w*|actionable|data-driven|solutions?|elevat\w*|transform\w*)\b/gi;
  const hits = [...(text + ' ' + jsStrings).matchAll(bad)].map(m => m[0]);
  const place = /\b(London|Manchester|Birmingham|Leeds|Glasgow|Edinburgh|Bristol|Toronto|Vancouver|New York|Sydney|Melbourne|Dublin|Brampton|Mississauga|Ontario|Canada|UK|USA)\b/g;
  const places = [...text.matchAll(place)].map(m => m[0]);
  const risky = [...text.matchAll(/\b(FAQ|pricing|per month|testimonial|account manager)\b/gi)].map(m => m[0]);
  console.log('dashes:', dashes, '| banned:', hits.join(',') || 'none', '| places:', places.join(',') || 'none', '| risky:', risky.join(',') || 'none');
}
