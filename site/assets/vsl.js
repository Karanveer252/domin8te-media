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
  if (frame && frame.contentWindow && frame.contentWindow.LECookieStory) {
    frame.contentWindow.LECookieStory.setDesign(d);      /* already open: bake the new one in place */
    try { frame.contentWindow.scrollTo(0, 0) } catch (e) {}
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
