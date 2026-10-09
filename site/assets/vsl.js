/* The VSL page's cookie picker. The visitor picks a shape, an icing and a topping here; "Bake it"
   saves that design where the hosted Lecookie copy looks for it (sessionStorage, same origin, the
   keys story.js and quiz.js use), opens the Lecookie live window below and closes the site's own
   questions as soon as they appear, so the page bakes the visitor's cookie straight away. */
(function () {
'use strict';
var box = document.getElementById('bake');
var live = document.getElementById('lecookieLive');
if (!box || !live) return;

var THUMB = '/work/lecookie/live/img/cookie/thumb/', V = '?v=57';
var img = document.getElementById('bakeImg'), go = document.getElementById('bakeGo'), left = document.getElementById('bakeLeft');
var ans = { shape: null, icing: null, top: null };

function picture() {
  var s = ans.shape || 'circle';
  if (ans.icing && ans.top) return 'decor_' + s + '_' + ans.icing + '_' + ans.top;
  if (ans.icing) return 'iced_' + s + '_' + ans.icing;
  return 'base_' + s;
}
function update() {
  img.src = THUMB + picture() + '.webp' + V;
  var n = ['shape', 'icing', 'top'].filter(function (k) { return !ans[k] }).length;
  go.disabled = n > 0;
  left.textContent = n ? (n === 3 ? 'Pick all three to bake it.' : n + ' more to pick.') : 'Ready for the oven.';
}

box.addEventListener('click', function (e) {
  var o = e.target.closest('.vsl-bake__opt');
  if (!o) return;
  var q = o.getAttribute('data-q');
  ans[q] = o.getAttribute('data-a');
  box.querySelectorAll('.vsl-bake__opt[data-q="' + q + '"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === o)) });
  update();
});

/* close the site's question box once it shows (it opens on every visit) */
function skipQuestions(frame) {
  var tries = 0;
  (function look() {
    var doc = null;
    try { doc = frame.contentDocument } catch (e) { return }
    var skip = doc && doc.querySelector('.quiz__skip');
    if (skip) { skip.click(); return }
    if (++tries < 60) setTimeout(look, 100);
  })();
}

go.addEventListener('click', function () {
  var d = { shape: ans.shape, icing: ans.icing, top: ans.top };
  try {
    sessionStorage.setItem('lecookie.v6.design', JSON.stringify(d));
    sessionStorage.setItem('lecookie.v6.quiz', 'chosen');
  } catch (e) {}
  var frame = live.querySelector('iframe');
  if (frame) {
    /* already open: reload it so the oven and the line under it both show the new cookie */
    frame.addEventListener('load', function () { skipQuestions(frame) }, { once: true });
    try { frame.contentWindow.location.reload() } catch (e) { frame.src = frame.src }
  } else {
    var start = live.querySelector('.live__go');
    if (start) start.click();
    frame = live.querySelector('iframe');
    if (frame) frame.addEventListener('load', function () { skipQuestions(frame) }, { once: true });
  }
  live.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
});

update();
})();

/* the booking calendar: a Google appointment schedule, loaded only when the section is close */
(function () {
'use strict';
var cal = document.getElementById('bookCal');
var src = cal && cal.getAttribute('data-src');
if (!src) return;
function load() {
  var f = document.createElement('iframe');
  f.src = src + (src.indexOf('?') < 0 ? '?gv=true' : '&gv=true');
  f.title = 'Book a discovery call';
  f.loading = 'lazy';
  cal.innerHTML = '';
  cal.appendChild(f);
  cal.classList.add('is-on');
}
if (!('IntersectionObserver' in window)) { load(); return }
var io = new IntersectionObserver(function (es) {
  if (es.some(function (e) { return e.isIntersecting })) { io.disconnect(); load() }
}, { rootMargin: '600px 0px' });
io.observe(cal);
})();

/* the phone's sticky bar (the homepage's .ctabar look): on once the heading is behind the reader,
   off while the booking calendar or the form is on screen, since the button would only cover them */
(function () {
'use strict';
var bar = document.getElementById('vslBar');
var hero = document.querySelector('.vsl-hero');
if (!bar || !hero || !('IntersectionObserver' in window)) return;
var past = false, seen = new Set();
function paint() { bar.classList.toggle('is-on', past && seen.size === 0) }
new IntersectionObserver(function (es) { past = !es[0].isIntersecting && es[0].boundingClientRect.top < 0; paint() })
  .observe(hero);
var io = new IntersectionObserver(function (es) {
  es.forEach(function (e) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target) });
  paint();
}, { rootMargin: '0px 0px -20% 0px' });
['book', 'contact'].forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el) });
})();
