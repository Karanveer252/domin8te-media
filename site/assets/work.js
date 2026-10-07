/* ============================================================
   The work pages (/work/ and each client's story under it). They
   carry the homepage's header and type but none of its film, so
   this is all they need from site.js: the entrances, the header's
   white bar once the page moves, its thin progress line, and the
   year in the footer.
   ============================================================ */
(function () {
'use strict';

var root = document.documentElement;
var hdr = document.getElementById('hdr');
var fill = document.querySelector('.hdr__fill');
var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
root.classList.add('ready');

/* entrances: the homepage's .rv, the same timing */
var els = document.querySelectorAll('.rv');
if (!('IntersectionObserver' in window) || reduced) {
  els.forEach(function (el) { el.classList.add('in', 'done') });
} else {
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      setTimeout(function () { e.target.classList.add('done') }, 1200);
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
  els.forEach(function (el) { io.observe(el) });
}

/* the header's bar and the reading line */
var ticking = false;
function onScroll() {
  ticking = false;
  var y = window.scrollY || 0;
  if (hdr) hdr.classList.toggle('is-scrolled', y > 8);
  if (fill) {
    var max = document.documentElement.scrollHeight - innerHeight;
    fill.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
  }
}
window.addEventListener('scroll', function () {
  if (!ticking) { ticking = true; requestAnimationFrame(onScroll) }
}, { passive: true });
onScroll();

/* the chapter rail on a client's story: the chapter in view is marked */
var links = document.querySelectorAll('.cs-rail a[href^="#"]');
if (links.length && 'IntersectionObserver' in window) {
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a });
  var seen = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      links.forEach(function (a) { a.removeAttribute('aria-current') });
      var a = byId[e.target.id];
      if (a) a.setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  Object.keys(byId).forEach(function (id) {
    var s = document.getElementById(id);
    if (s) seen.observe(s);
  });
}

/* the live window: the client's real site in place of the picture. Nothing loads until someone presses
   the button (a whole site is heavy, and an iframe would catch the page's scroll). The site is drawn at
   a laptop's width (or a phone's) and scaled to fit the window, so it shows its real layout */
var SIZES = { desktop: [1440, 810], phone: [390, 844] };
document.querySelectorAll('.live[data-src]').forEach(function (live) {
  var src = live.getAttribute('data-src');
  if (!src) return;
  var screen = live.querySelector('.live__screen');
  var view = live.querySelector('.live__view');
  var go = live.querySelector('.live__go');
  var close = live.querySelector('.live__close');
  var modes = live.querySelectorAll('.live__mode');
  var frame = null;
  var openLink = live.querySelector('.live__open');
  if (openLink) openLink.href = src;

  function fit() {
    if (!frame) return;
    var s = SIZES[live.getAttribute('data-mode')] || SIZES.desktop;
    var W = screen.clientWidth, H = screen.clientHeight;
    /* a window caught mid-resize (or hidden) can measure next to nothing, which would scale the site to
       nothing or below it (drawn flipped); wait for a real size, the observer calls again */
    if (W < 80 || H < 80) return;
    var pad = live.getAttribute('data-mode') === 'phone' ? 28 : 0;
    var k = Math.min((W - pad * 2) / s[0], (H - pad * 2) / s[1]);
    if (live.getAttribute('data-mode') !== 'phone') k = W / s[0];
    var h = live.getAttribute('data-mode') === 'phone' ? s[1] : H / k;   /* desktop fills the window's height */
    frame.style.width = s[0] + 'px';
    frame.style.height = h + 'px';
    frame.style.left = ((W - s[0] * k) / 2) + 'px';
    frame.style.top = ((H - h * k) / 2) + 'px';
    frame.style.transform = 'scale(' + k + ')';
  }
  function setMode(m) {
    live.setAttribute('data-mode', m);
    modes.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)) });
    fit();
  }
  function open() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.title = live.getAttribute('data-title') || 'The live website';
    frame.setAttribute('loading', 'eager');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    /* shown once the site's page is readable, not when its last picture lands: a site full of renders
       can take a while to finish, and it draws itself in as they arrive (a site on another domain cannot
       be read, so there it is shown on load, or after a few seconds whatever happens) */
    var mine = frame;
    var ready = function () { if (frame === mine) live.classList.add('is-ready') };
    frame.addEventListener('load', ready);
    setTimeout(ready, 4000);
    var poll = setInterval(function () {
      if (!frame) { clearInterval(poll); return }
      try {
        var d = frame.contentDocument;
        if (d && d.URL !== 'about:blank' && d.readyState !== 'loading') { ready(); clearInterval(poll) }
      } catch (e) { clearInterval(poll) }
    }, 150);
    frame.src = src;
    view.appendChild(frame);
    live.classList.add('is-on');
    fit();
    /* and again once the window has laid itself out, and when the site has loaded */
    requestAnimationFrame(fit);
    frame.addEventListener('load', fit);
    /* a phone gets the phone layout straight away */
    if (matchMedia('(max-width: 760px)').matches) setMode('phone');
    if (close) close.focus();
  }
  function shut() {
    if (!frame) return;
    frame.remove(); frame = null;
    live.classList.remove('is-on', 'is-ready');
    if (go) go.focus();
  }
  if (go) go.addEventListener('click', open);
  if (close) close.addEventListener('click', shut);
  modes.forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')) }) });
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(screen);
  else window.addEventListener('resize', fit);
});

var yr = document.getElementById('yr');
if (yr) yr.textContent = new Date().getFullYear();
})();
