/* The marketing page's script (/marketing/). The cookie picker. The visitor picks a shape, an icing and a topping here; "Bake it"
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

/* the booking calendar: Calendly's inline page in an iframe, loaded only when the section is close.
   Calendly posts its own height to this page (calendly.page_height), so the box fits it exactly and
   never scrolls inside itself. Colours match the page: white ground, the site's orange, navy ink. */
(function () {
'use strict';
var cal = document.getElementById('bookCal');
var src = cal && cal.getAttribute('data-src');
if (!src) return;
var frame = null;
function load() {
  var q = 'embed_type=Inline&embed_domain=' + encodeURIComponent(location.host || 'domin8temedia.com') +
          '&hide_gdpr_banner=1&background_color=ffffff&text_color=0e1420&primary_color=ca4a14';
  frame = document.createElement('iframe');
  frame.src = src + (src.indexOf('?') < 0 ? '?' : '&') + q;
  frame.title = 'Book a free 30-minute call';
  cal.innerHTML = '';
  cal.appendChild(frame);
  cal.classList.add('is-on');
}
window.addEventListener('message', function (e) {
  if (!frame || e.source !== frame.contentWindow || !/^https:\/\/([a-z0-9-]+\.)?calendly\.com$/.test(e.origin)) return;
  var d = e.data;
  if (d && d.event === 'calendly.page_height' && d.payload && d.payload.height) {
    var h = parseInt(d.payload.height, 10);
    if (h > 200) frame.style.height = h + 'px';
  }
  /* a booking made in the calendar: the Pixel's Schedule event */
  if (d && d.event === 'calendly.event_scheduled' && typeof window.fbq === 'function') {
    fbq('track', 'Schedule', { content_name: 'discovery_call' });
  }
});
if (!('IntersectionObserver' in window)) { load(); return }
var io = new IntersectionObserver(function (es) {
  if (es.some(function (e) { return e.isIntersecting })) { io.disconnect(); load() }
}, { rootMargin: '600px 0px' });
io.observe(cal);
})();

/* the phone's sticky bar (the homepage's .ctabar look): on once the hero is behind the reader,
   off while the checkup form or the booking calendar is on screen, since the button would only cover them */
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

/* Domin8te word rotator: vanilla, no deps. <em class="rot" data-rotate="reimagined.|done for you.|..." data-fx="slide"><span class="rot__txt dec">reimagined.</span></em>
   Loops gently forever (2.5s per word); pauses on hover/focus, hidden tab, or when off screen; reduced motion = static. */
(function(){
var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
function init(root){
  if (RM && RM.matches) return;
  var words = root.getAttribute('data-rotate').split('|'), fx = root.getAttribute('data-fx') || 'slide';
  var hold = +(root.getAttribute('data-hold') || 2500), pad = parseFloat(root.getAttribute('data-pad') || 0);
  var real = root.querySelector('.rot__txt'), deco = real.className.replace('rot__txt','').trim();
  var mk = function(){ var l = document.createElement('span'); l.className = 'rot__l ' + deco; l.setAttribute('aria-hidden','true'); root.appendChild(l); return l; };
  var A = mk(), B = mk(), cur = A, nxt = B, i = 0, t = null, why = {}, fit = [], busy = false;
  function measure(){ // scale a word down only if it would not fit the headline width (no overflow on small phones)
    var h = root.closest('h1') || root.parentNode, avail = h.clientWidth;
    fit = words.map(function(w){ B.style.fontSize = ''; B.setAttribute('data-w', w); var wd = B.getBoundingClientRect().width + pad * parseFloat(getComputedStyle(B).fontSize); return Math.min(1, (avail - 2) / wd); });
    B.setAttribute('data-w', words[(i + 1) % words.length]);
  }
  function set(l, k){ l.setAttribute('data-w', words[k]); l.style.fontSize = fit[k] < 1 ? (fit[k].toFixed(3) + 'em') : ''; }
  function paused(){ for (var k in why) if (why[k]) return true; return false; }
  function sched(){ clearTimeout(t); if (!paused()) t = setTimeout(step, hold); }
  function step(){
    var j = (i + 1) % words.length;
    if (!root.classList.contains('on')){ set(cur, i); cur.className = 'rot__l ' + deco + ' show'; root.classList.add('on'); }
    if (fx === 'type'){ busy = true; return typeTo(j); }
    set(nxt, j);
    cur.className = 'rot__l ' + deco + ' out';
    nxt.className = 'rot__l ' + deco + ' in' + (root.hasAttribute('data-redraw') ? ' redraw' : '');
    var x = cur; cur = nxt; nxt = x; i = j; sched();
  }
  function typeTo(j){
    var s = words[i], n = s.length; cur.className = 'rot__l ' + deco + ' typing';
    (function erase(){ if (n > 0){ n--; cur.setAttribute('data-w', s.slice(0, n) || '​'); setTimeout(erase, 32); } else { var w = words[j], k = 0; cur.style.fontSize = fit[j] < 1 ? fit[j] + 'em' : '';
      (function type(){ if (k < w.length){ k++; cur.setAttribute('data-w', w.slice(0, k)); setTimeout(type, 58); } else { cur.className = 'rot__l ' + deco + ' show'; i = j; busy = false; sched(); } })(); } })();
  }
  function pause(r, on){ why[r] = !!on; if (paused()) clearTimeout(t); else if (!busy) sched(); }
  var h1 = root.closest('h1') || root;
  h1.addEventListener('mouseenter', function(){ pause('hover', 1); }); h1.addEventListener('mouseleave', function(){ pause('hover', 0); });
  document.addEventListener('focusin', function(e){ if (h1.parentNode.contains(e.target)) pause('focus', 1); });
  document.addEventListener('focusout', function(e){ if (h1.parentNode.contains(e.target)) pause('focus', 0); });
  document.addEventListener('visibilitychange', function(){ pause('tab', document.hidden); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function(es){ pause('view', !es[0].isIntersecting); }).observe(h1);
  if (RM && RM.addEventListener) RM.addEventListener('change', function(){ if (RM.matches){ clearTimeout(t); root.classList.remove('on'); } });
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(function(){ measure(); sched(); }); addEventListener('resize', measure);
}
document.querySelectorAll('.rot[data-rotate]').forEach(init);
})();

/* VSL: coming-soon state until data-vsl-src is set; then a click-to-load facade (nothing heavy loads before the tap). */
(function () {
'use strict';
var slot = document.getElementById('vsl'); if (!slot) return;
var provider = slot.getAttribute('data-vsl-provider'), src = slot.getAttribute('data-vsl-src');
var soon = slot.querySelector('[data-vsl-soon]'), play = slot.querySelector('[data-vsl-play]');
if (!provider || !src) return;                 // stay in the coming-soon state
soon.hidden = true; play.hidden = false;
var capLine = slot.closest('figure') && slot.closest('figure').querySelector('.vsl-cap'); if (capLine) capLine.hidden = false;
function track(name, extra) {                   // Pixel custom events + optional dataLayer
  if (typeof window.fbq === 'function') fbq('trackCustom', name, Object.assign({ video: 'vsl' }, extra || {}));
  (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name, video: 'vsl' }, extra || {}));
}
play.addEventListener('click', function () {
  var el, title = slot.getAttribute('data-vsl-title') || 'Video';
  if (provider === 'native') {
    el = document.createElement('video');
    el.src = src; el.controls = true; el.playsInline = true; el.autoplay = true; el.preload = 'none';
    var cap = slot.getAttribute('data-vsl-captions');
    if (cap) { var t = document.createElement('track'); t.kind = 'captions'; t.srclang = 'en'; t.label = 'English'; t.src = cap; t.default = true; el.appendChild(t); }
    var marks = { 25: false, 50: false, 75: false };
    el.addEventListener('timeupdate', function () {
      if (!el.duration) return; var pct = el.currentTime / el.duration * 100;
      [25, 50, 75].forEach(function (m) { if (!marks[m] && pct >= m) { marks[m] = true; track('VSLProgress', { percent: m }) } });
    });
    el.addEventListener('ended', function () { track('VSLComplete') });
  } else {
    var url = provider === 'youtube' ? 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(src) + '?autoplay=1&rel=0&cc_load_policy=1&playsinline=1'
            : provider === 'vimeo'   ? 'https://player.vimeo.com/video/' + encodeURIComponent(src) + '?autoplay=1&texttrack=en&dnt=1'
            : provider === 'wistia'  ? 'https://fast.wistia.net/embed/iframe/' + encodeURIComponent(src) + '?autoPlay=true&playbar=true'
            : null;
    if (!url) return;
    el = document.createElement('iframe');
    el.src = url; el.title = title; el.allow = 'autoplay; fullscreen; picture-in-picture'; el.allowFullscreen = true;
  }
  slot.innerHTML = ''; slot.appendChild(el);
  track('VSLPlay', { provider: provider });
  if (el.focus) el.focus();
}, { once: true });
})();

/* The checkup form's Pixel "Lead" and thank-you panel. The form itself is assets/site.js (shared with the
   homepage); this page adds, without touching it: an event_id on every send (set in the capture phase, so it
   is in the form before site.js reads it), and "Lead" fired ONLY when site.js shows the button as "Sent",
   which it does only after send.php answered ok:true (never on click, a failed send or the "rate" resend). */
(function () {
'use strict';
var form = document.getElementById('leadform'), btn = document.getElementById('submitbtn'), status = document.getElementById('formstatus');
if (!form || !btn) return;
var eventId = '', first = '', fired = '';
var idInput = document.createElement('input'); idInput.type = 'hidden'; idInput.name = 'event_id'; form.appendChild(idInput);
document.addEventListener('submit', function (e) {
  if (e.target !== form) return;
  eventId = 'lead-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  idInput.value = eventId;
  first = ((form.elements.name && form.elements.name.value) || '').trim().split(/\s+/)[0].slice(0, 40);
}, true);
new MutationObserver(function () {
  if (btn.textContent.trim() !== 'Sent' || !eventId || fired === eventId) return;
  fired = eventId;
  if (status) status.textContent = (first ? 'Thanks, ' + first + '. ' : 'Thanks. ') + 'Karan will send your checkup within one business day.';
  if (typeof window.fbq === 'function') {
    fbq('track', 'Lead', {
      content_name: (form.elements.source && form.elements.source.value) || 'site',
      content_category: 'free_online_checkup'
    }, { eventID: eventId });
  }
}).observe(btn, { childList: true, characterData: true, subtree: true });
})();
