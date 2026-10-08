// The website's icons for the client portal and the console (2026-10-08, Karan: "use the same fav icon for dashboard and
// console as well"): the same three tags as the homepage (the /favicon.ico file, the iPhone home-screen icon and the
// rainbow infinity drawn inline for the tab), read from the homepage at build time so the pages never drift apart.
// Put right after <meta charset="utf-8"> by make-dashboard.js and build-console.js.
'use strict';
const fs = require('fs');
module.exports = function siteIcons() {
  const page = fs.readFileSync('C:/Work/domin8te-media/index.html', 'utf8');
  const tags = ['<link rel="icon" href="/favicon.ico" sizes="48x48">', '<link rel="apple-touch-icon" href="/apple-touch-icon.png">'];
  for (const t of tags) if (!page.includes(t)) throw new Error('site icons: the homepage no longer has ' + t);
  const svg = page.match(/<link rel="icon" href="data:image\/svg\+xml,[^"]+">/);
  if (!svg) throw new Error('site icons: the homepage has no inline SVG icon');
  return tags.concat(svg[0]).join('\n');
};
