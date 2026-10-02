#!/usr/bin/env node
/*
 * House rules for the portal source: copy rules from the brand book, markup rules that keep
 * every control real and accessible, and a syntax check of every script.
 * Usage: node tools/lint.js   (exits 1 on any finding)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const files = [];
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css)$/.test(f)) files.push(p);
  }
})(path.join(ROOT, 'src'));
// The Liquid Glass variants follow the same house rules.
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css)$/.test(f)) files.push(p);
  }
})(path.join(ROOT, 'variants'));
// The agency console (portal/console) follows the same house rules.
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (f.startsWith('.')) continue;
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css)$/.test(f)) files.push(p);
  }
})(path.join(ROOT, '..', 'console'));

const findings = [];
const add = (file, line, rule, text) => findings.push(`${path.relative(ROOT, file)}:${line}  ${rule}  ${text.trim().slice(0, 110)}`);

const BANNED = /\b(leverage|seamless|empower|unlock|robust|actionable|data-driven|solutions|elevate)\b/i;
const RULES = [
  { re: /—/, rule: 'no-em-dash', note: 'use a comma, a full stop or "to"' },
  { re: /href="#"/, rule: 'no-dead-link', note: 'every link goes somewhere real' },
  { re: />\s*(Submit|OK|Go)\s*</, rule: 'no-vague-label', note: 'a control names its action (brand book: never Submit, OK or Go)' },
  { re: /lorem ipsum/i, rule: 'no-placeholder-copy' },
  { re: /\bDominate\b|\bDomin[^8\s]te\b/i, rule: 'brand-spelling', note: 'Domin8te, with the 8' },
  { re: /['">]\s*SEO\b|\bSEO\s*['"<]/, rule: 'plain-words', note: 'say "Local search", not SEO' },
  { re: /console\.log\(/, rule: 'no-console-log' },
  { re: /text-transform:\s*uppercase/, rule: 'no-uppercase-labels' },
  { re: /prefers-color-scheme:\s*dark/, rule: 'light-by-default', note: 'dark only by the client choosing it' },
  { re: /<button(?![^>]*\btype=)[^>]*>/, rule: 'button-type', note: 'every button says what type it is' },
  { re: /<img(?![^>]*\balt=)[^>]*>/, rule: 'img-alt' },
  { re: /\bon(click|change|submit)=/i, rule: 'no-inline-handlers', note: 'use data-action' },
  { re: /password\s*[:=]\s*['"][^'"]+['"]/i, rule: 'no-passwords' },
  { re: /(sk|pk)_(live|test)_[0-9a-z]{8,}|re_[0-9a-z]{16,}/i, rule: 'no-secrets' }
];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const isCss = file.endsWith('.css');
  lines.forEach((line, i) => {
    for (const r of RULES) if (r.re.test(line)) add(file, i + 1, r.rule, (r.note ? r.note + ': ' : '') + line);
    if (!isCss && BANNED.test(line)) add(file, i + 1, 'banned-word', line);
    if (!isCss && /\btransform(s|ed|ing)?\b/i.test(line) && !/transform:|\.transform|style\.transform|'transform'/.test(line)) add(file, i + 1, 'banned-word', line);
  });
  if (file.endsWith('.js')) {
    try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); } catch (e) { add(file, 0, 'syntax', String(e.stderr || e.message)); }
  }
}

if (findings.length) {
  console.error(findings.join('\n'));
  console.error(`lint: ${findings.length} finding(s)`);
  process.exit(1);
}
console.log(`lint: ${files.length} files clean`);
