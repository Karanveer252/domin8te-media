// The website's growth cursor for the client dashboard, its demo and the console (2026-10-06, Karan: "can you
// make the demo and console have the same cursor?"; 2026-10-08: "i want the same new cursor on dashboard and
// console"). One snippet, put before </body> by make-dashboard.js (the real portal and the demo) and
// build-console.js: the cursor picture on every element with a mouse, and the click
// (the growth pulse) from the site's own /assets/v3-cursor.js, with the styles it needs (the copy's box, picture and sparkles; the script hides the real cursor itself, with an inline style, and has no speed panel any more). The file
// versions (?v=) are read from the homepage, so the three pages always ask for the same files.
'use strict';
const fs = require('fs');
const SITE = 'C:/Work/domin8te-media';
module.exports = function growthCursor() {
  const page = fs.readFileSync(SITE + '/index.html', 'utf8');
  const css = fs.readFileSync(SITE + '/assets/v3.css', 'utf8');
  const v = (re, from, what) => { const m = from.match(re); if (!m) throw new Error('growth cursor: no version for ' + what); return m[1]; };
  const js = v(/assets\/v3-cursor\.js\?v=([0-9a-f]+)/, page, 'v3-cursor.js');
  const p32 = v(/v3-cursor-32\.png\?v=([0-9a-f]+)/, css, 'v3-cursor-32.png');
  const p64 = v(/v3-cursor-64\.png\?v=([0-9a-f]+)/, css, 'v3-cursor-64.png');
  const u32 = `/assets/v3-cursor-32.png?v=${p32}`, u64 = `/assets/v3-cursor-64.png?v=${p64}`;
  return `<style>/* the growth cursor, as on the homepage */
@media (hover:hover) and (pointer:fine){ html, html *{ cursor:url(${u32}) 2 1,auto!important; cursor:-webkit-image-set(url(${u32}) 1x,url(${u64}) 2x) 2 1,auto!important; } }
.v3cur{position:fixed;left:0;top:0;z-index:2147483647;width:96px;height:96px;pointer-events:none;visibility:hidden;will-change:transform}
.v3cur__mark{position:absolute;left:32px;top:32px;width:32px;height:32px}
.v3cur svg{display:block;position:absolute;left:0;top:0;overflow:visible}
.v3cur__spark{position:absolute;left:0;top:0;opacity:0}
.v3cur__spark svg{width:100%;height:100%}
.v3cur__spark--white{filter:drop-shadow(0 0 1px rgba(106,75,255,.6)) drop-shadow(0 0 3px rgba(47,140,255,.4))}
</style>
<script src="/assets/v3-cursor.js?v=${js}" defer></script>
`;
};
