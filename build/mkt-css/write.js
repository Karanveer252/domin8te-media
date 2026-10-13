// Step 3: write the purged sheet: keep every used rule as written, every @font-face and @keyframes, drop the rest
// and any at-rule left empty.
const fs = require('fs'), postcss = require('postcss');
const [src, usedFile, out] = process.argv.slice(2);
const used = new Set(JSON.parse(fs.readFileSync(usedFile, 'utf8')));
const root = postcss.parse(fs.readFileSync(src, 'utf8'));
let id = 0, dropped = 0;
root.walkRules(r => {
  if (r.parent && r.parent.type === 'atrule' && /keyframes$/i.test(r.parent.name)) return;
  if (!used.has(id++)) { r.remove(); dropped++; }
});
let pruned = true;
while (pruned) { pruned = false; root.walkAtRules(a => { if (/^(media|supports|container|layer)$/i.test(a.name) && a.nodes && !a.nodes.some(n => n.type !== 'comment')) { a.remove(); pruned = true; } }); }
root.walkComments(c => c.remove());
fs.writeFileSync(out, root.toString().replace(/\n{3,}/g, '\n\n'));
console.log('dropped', dropped, 'rules; wrote', fs.statSync(out).size, 'bytes');
