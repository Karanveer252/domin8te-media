// Step 1: every style rule's selectors in the bundle, with an id (the order postcss walks them).
const fs = require('fs'), postcss = require('postcss');
const css = fs.readFileSync(process.argv[2], 'utf8');
const root = postcss.parse(css);
const rules = [];
root.walkRules(r => {
  if (r.parent && r.parent.type === 'atrule' && /keyframes$/i.test(r.parent.name)) return; // keyframe steps
  rules.push({ id: rules.length, sel: r.selectors });
});
fs.writeFileSync(process.argv[3], JSON.stringify(rules));
console.log('rules', rules.length);
