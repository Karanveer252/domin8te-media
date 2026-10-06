/* ============================================================
   Version 3: the growth cursor's click (Karan, 2026-10-05: "make
   the cursor run an animation every time I click. like the arrow
   should go to the top and come from the bottom again").

   A cursor image cannot move, so for the half second of a click
   the real one is hidden and a copy of it (the same picture, read
   from the page's own cursor rule in v3.css) stands in exactly where
   it was. Inside its own 32px window the arrow shoots off along the
   way it points, up and to the left, and a new one rises back in
   from the lower right to rest where it began; then the real cursor
   is back. It follows the mouse while it plays. Only where the
   growth cursor is showing (links keep their hand and play nothing),
   only with a mouse, never with reduced motion.
   ============================================================ */
(function () {
'use strict';

var fine = matchMedia('(hover:hover) and (pointer:fine)');
var rmq = matchMedia('(prefers-reduced-motion: reduce)');
if (!document.body || !Element.prototype.animate) return;

var HOT_X = 2, HOT_Y = 4;   /* the cursor's click point in v3.css */
var root = document.documentElement;
var box = null, pic = null, run = null, src = '';

function urlOf(cur) {
  var m = /url\((["']?)(.*?)\1\)/.exec(cur || '');
  return m ? m[2] : '';
}
function build() {
  box = document.createElement('div');
  box.className = 'v3cur';
  box.setAttribute('aria-hidden', 'true');
  pic = document.createElement('i');
  box.appendChild(pic);
  document.body.appendChild(box);
}
function place(x, y) { box.style.transform = 'translate(' + (x - HOT_X) + 'px,' + (y - HOT_Y) + 'px)' }
function end() {
  run = null;
  root.classList.remove('v3cur-on');
  if (box) box.style.visibility = 'hidden';
}

document.addEventListener('pointerdown', function (e) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !fine.matches || rmq.matches) return;
  /* only where the growth arrow is the cursor: not over links, fields or the hand */
  var u = urlOf(getComputedStyle(e.target.nodeType === 1 ? e.target : document.body).cursor);
  if (!u) return;
  if (!box) build();
  if (u !== src) { src = u; pic.style.backgroundImage = 'url("' + u + '")' }
  if (run) run.cancel();
  place(e.clientX, e.clientY);
  box.style.visibility = 'visible';
  root.classList.add('v3cur-on');
  run = pic.animate([
    { transform: 'translate(0,0)', opacity: 1, offset: 0, easing: 'cubic-bezier(.5,0,.9,.4)' },
    { transform: 'translate(-26px,-34px)', opacity: .2, offset: .42 },
    { transform: 'translate(24px,32px)', opacity: 0, offset: .43, easing: 'cubic-bezier(.15,.75,.25,1)' },
    { transform: 'translate(0,0)', opacity: 1, offset: 1 }
  ], { duration: 560 });
  run.onfinish = end;
  run.oncancel = function () { };
}, true);

document.addEventListener('pointermove', function (e) {
  if (run && e.pointerType === 'mouse') place(e.clientX, e.clientY);
}, { passive: true });
window.addEventListener('blur', function () { if (run) { run.cancel(); end() } });
})();
