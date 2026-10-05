/* ============================================================
   THE DASHBOARD, IN THE PAGE (2026-10-04)

   Two jobs, for the two sections in assets/dash.css.

   The clips ("Everything in one place."): no clip has a src in the
   markup, so nothing of them is fetched with the page. A clip is
   given its file the first time it is about to play, the small one
   unless its box is large enough to show the difference. On a
   desktop a clip plays while a good third of it is on screen and
   stops when it leaves. On a phone, on a slow or data-saving
   connection and under reduced motion nothing plays unasked: the
   still stands with a play mark, and a tap plays it. The first
   play starts from the middle of the clip, which is the frame the
   still shows, so the picture carries on instead of jumping.

   The film ("The whole dashboard."): it never starts unasked. Its
   file is named once the section is near; the button plays it with
   its music; the chapters seek, and fill as their parts play.

   No URL lives here: each clip names its files in its own
   data-src / data-src-sm, and the words of the play mark are on
   the grid (data-msg-*). No scroll listener: the observers and the
   film's own events do the work.
   ============================================================ */
(function () {
'use strict';

var d = document;
if (!d.querySelector || !window.matchMedia) return;

var rmq = matchMedia('(prefers-reduced-motion: reduce)');
var phoneMq = matchMedia('(max-width: 760px)');
var hasIO = 'IntersectionObserver' in window;
var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;

function saver() { return !!(conn && conn.saveData) }
function slow() { return saver() || !!(conn && /^(slow-2g|2g|3g)$/.test(conn.effectiveType || '')) }
function onChange(mq, fn) {
  if (mq.addEventListener) mq.addEventListener('change', fn);
  else if (mq.addListener) mq.addListener(fn);
}
/* the nearest ancestor with a class, looking no higher than the body: the
   root carries mode classes of its own (html.film is the desktop mode, not
   the film section) */
function up(el, cls) {
  while (el && el !== d.body && el.nodeType === 1) { if (el.classList.contains(cls)) return el; el = el.parentNode }
  return null;
}
/* play() answers with a promise where it can be refused; an old engine answers with nothing */
function play(v, refused) {
  var p;
  try { p = v.play() } catch (e) { return }
  if (p && p.catch) p.catch(function (err) { if (refused && err && err.name === 'NotAllowedError') refused() });
}

/* ============================================================
   THE CLIPS
   ============================================================ */

/* the scroll film drives its own clip, so anything inside it is left alone */
var clips = [].slice.call(d.querySelectorAll('video.dx-loop')).filter(function (v) {
  return !up(v, 'film');
}).map(function (v) {
  var cell = up(v, 'dx-cell'), grid = up(v, 'dx-bento'), ttl = cell && cell.querySelector('.dx-cell__ttl');
  return {
    v: v, box: v.parentNode, btn: null,
    name: ttl ? ttl.textContent.replace(/\s+/g, ' ').trim() : '',
    sayPlay: (grid && grid.getAttribute('data-msg-play')) || 'Play',
    sayPause: (grid && grid.getAttribute('data-msg-pause')) || 'Pause',
    ratio: 0,        /* how much of it is on screen, from the observer */
    held: false,     /* the reader paused it: it stays paused */
    live: false,     /* it holds its still's frame and may show */
    at: 0            /* when it last started, for the phone's limit */
  };
});

var tapMode = true;   /* stills with a play mark; false: play in view */
var started = 0;

/* the large file only where the box can show it: wider than about 1100
   device pixels (counting no more than two to a CSS pixel), not on a phone,
   not when the reader has asked to save data */
function pick(v) {
  var big = v.clientWidth * Math.min(window.devicePixelRatio || 1, 2) > 1100 &&
            window.innerWidth >= 761 && !saver();
  return (big && v.getAttribute('data-src')) || v.getAttribute('data-src-sm') || v.getAttribute('data-src');
}

function say(c) {
  if (c.btn) c.btn.setAttribute('aria-label', (c.v.paused ? c.sayPlay : c.sayPause) + (c.name ? ': ' + c.name : ''));
}

/* a phone decodes two at a time at most; the earliest started gives way */
function limit() {
  var max = phoneMq.matches ? 2 : clips.length;
  var on = clips.filter(function (c) { return !c.v.paused }).sort(function (a, b) { return a.at - b.at });
  while (on.length > max) on.shift().v.pause();
}

function begin(c) {
  var v = c.v;
  if (!v.getAttribute('src')) {
    var url = pick(v);
    if (!url) return;
    v.src = url;
  }
  c.at = ++started;
  /* refused (a phone saving its battery will not play unasked): the still
     stays, and the play mark shows so a tap can start it */
  play(v, function () { if (v.paused) c.box.classList.add('is-tap') });
  limit();
}

function wire(c) {
  var v = c.v, sought = false;
  function show() {
    if (c.live) return;
    c.live = true;
    c.box.classList.add('is-live');
  }
  /* the still is the clip's middle frame: start there, and keep the video
     clear until it has that frame */
  v.addEventListener('loadedmetadata', function () {
    var t = v.duration;
    if (c.live || sought || !isFinite(t) || !(t > 1)) return;
    sought = true;
    try { v.currentTime = t / 2 } catch (e) { sought = false }
  });
  v.addEventListener('seeked', function () { if (sought) show() });
  v.addEventListener('playing', function () {
    if (!sought) show();
    c.box.classList.add('is-playing');
    say(c);
  });
  v.addEventListener('pause', function () {
    c.box.classList.remove('is-playing');
    say(c);
  });

  /* the whole clip is the control */
  var b = d.createElement('button');
  b.type = 'button';
  b.className = 'dx-play';
  b.innerHTML = '<span class="dx-play__ico" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false">' +
    '<path class="dx-play__go" d="M4.5 2.5v11l9-5.5z"/>' +
    '<path class="dx-play__stop" d="M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z"/></svg></span>';
  b.addEventListener('click', function () {
    if (v.paused) { c.held = false; c.box.classList.remove('is-held'); begin(c) }
    else { c.held = true; c.box.classList.add('is-held'); v.pause() }
  });
  c.box.appendChild(b);
  c.btn = b;
  say(c);
}

/* what should be playing, from what is on screen. A clip starts at a good
   third in view and stops below a fifth, so an edge never makes it stutter */
function sync() {
  clips.forEach(function (c) {
    var v = c.v;
    if (!v.paused && (c.ratio < .2 || d.hidden)) { v.pause(); return }
    if (!tapMode && !d.hidden && !c.held && v.paused && c.ratio >= .35) begin(c);
  });
}

function setMode() {
  var was = tapMode;
  tapMode = rmq.matches || phoneMq.matches || slow() || !hasIO;
  clips.forEach(function (c) {
    if (tapMode) c.box.classList.add('is-tap'); else c.box.classList.remove('is-tap');
    /* turning motion off, or going to a phone's width, stops what was playing unasked */
    if (tapMode && !was && !c.v.paused) c.v.pause();
  });
  sync();
}

if (clips.length) {
  clips.forEach(wire);
  if (hasIO) {
    var seen = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        for (var i = 0; i < clips.length; i++) {
          if (clips[i].v === e.target) { clips[i].ratio = e.isIntersecting ? e.intersectionRatio : 0; break }
        }
      });
      sync();
    }, { threshold: [0, .2, .35, .6, 1] });
    clips.forEach(function (c) { seen.observe(c.v) });
  }
  setMode();
  onChange(rmq, setMode);
  onChange(phoneMq, setMode);
  if (conn && conn.addEventListener) conn.addEventListener('change', setMode);
  d.addEventListener('visibilitychange', sync);
}

/* ============================================================
   THE FILM
   ============================================================ */

var film = d.getElementById('dxMaster');
var frame = d.getElementById('dxFrame');
if (film && frame) (function () {
  var stage = up(frame, 'dx-stage') || frame;
  var still = frame.querySelector('.dx-frame__still');
  var playBtn = d.getElementById('dxPlay');
  var row = d.getElementById('dxChapters');
  var chaps = row ? [].slice.call(row.querySelectorAll('.dx-ch')) : [];
  var times = chaps.map(function (b) { return parseFloat(b.getAttribute('data-t')) || 0 });
  var fills = chaps.map(function () { return -1 });
  var cur = 0, raf = null, wanted = null, follow = false;

  /* on a phone the player's own bar would cover the title card, which is
     most of what there is to see before play: it waits until the film runs */
  var bare = phoneMq.matches && film.controls;
  if (bare) film.controls = false;

  /* the title card is the still under the video. Once the film has a file
     the player would show the film's first frame instead, so the same picture
     the browser already chose for the still is named as the poster */
  function poster() {
    if (still && still.currentSrc && !film.getAttribute('poster')) film.setAttribute('poster', still.currentSrc);
  }
  /* name the file: the small one on a phone or to save data. A desktop
     reads the film's header ahead (its length, for the player's bar); a
     phone or a slow line fetches nothing until play is pressed */
  function source() {
    if (film.getAttribute('src')) return;
    var small = phoneMq.matches || saver();
    var url = (small && film.getAttribute('data-src-sm')) || film.getAttribute('data-src') || film.getAttribute('data-src-sm');
    if (!url) return;
    film.preload = (phoneMq.matches || slow()) ? 'none' : 'metadata';
    film.src = url;
    poster();
  }

  function seek(t) {
    if (film.readyState >= 1) { try { film.currentTime = t } catch (e) {} }
    else wanted = t;   /* before the header is in: go there as soon as it is */
  }
  function start(t) {
    source();
    if (typeof t === 'number') seek(t);
    film.muted = false;
    follow = true;
    play(film);
  }

  /* each chapter's rule: empty before its part, full after, filling through it */
  function paint() {
    var t = film.currentTime || 0;
    if (wanted !== null) t = wanted;
    var end = isFinite(film.duration) && film.duration > 0 ? film.duration : times[times.length - 1] + 4;
    var idx = 0, i, a, b, f;
    for (i = 0; i < times.length; i++) {
      a = times[i];
      b = i + 1 < times.length ? times[i + 1] : end;
      if (t + .05 >= a) idx = i;
      f = t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a);
      f = Math.round(f * 500) / 500;
      if (fills[i] !== f) { fills[i] = f; chaps[i].style.setProperty('--fill', String(f)) }
    }
    mark(idx);
  }
  function mark(idx) {
    if (idx === cur) return;
    cur = idx;
    chaps.forEach(function (b, i) {
      if (i === idx) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    /* where the chapters are a row to swipe, the row follows the film (the
       row itself is moved, never the page) */
    if (follow && row && row.scrollWidth > row.clientWidth + 2) {
      var x = Math.max(0, chaps[idx].parentNode.offsetLeft);
      if (row.scrollTo) row.scrollTo({ left: x, behavior: rmq.matches ? 'auto' : 'smooth' });
      else row.scrollLeft = x;
    }
  }
  function tick() {
    raf = null;
    paint();
    if (!film.paused && !film.ended && !rmq.matches) raf = requestAnimationFrame(tick);
  }

  film.addEventListener('loadedmetadata', function () {
    if (wanted !== null) { var t = wanted; wanted = null; try { film.currentTime = t } catch (e) {} }
    paint();
  });
  film.addEventListener('play', function () {
    frame.classList.add('is-playing');
    follow = true;
    if (bare) { bare = false; film.controls = true }
    if (raf === null) tick();
  });
  film.addEventListener('ended', function () { frame.classList.remove('is-playing'); paint() });
  film.addEventListener('timeupdate', paint);
  film.addEventListener('seeked', paint);

  if (playBtn) playBtn.addEventListener('click', function () {
    start();
    /* the keyboard goes to the player, whose own keys now run the film */
    try { film.focus({ preventScroll: true }) } catch (e) { film.focus() }
  });
  chaps.forEach(function (b, i) {
    b.addEventListener('click', function () { start(times[i]); paint() });
  });
  if (still) still.addEventListener('load', function () { if (film.getAttribute('src')) poster() });

  if (hasIO) {
    var near = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      near.disconnect();
      source();
    }, { rootMargin: '600px 0px' });
    near.observe(stage);
  } else source();

  /* the tilt, where the browser cannot tie it to the scroll: lay the window
     flat once, when a third of it is in view (dash.css has both paths) */
  var scrollTied = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: view()'));
  if (!scrollTied) {
    if (hasIO && !rmq.matches) {
      var flat = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        flat.disconnect();
        frame.classList.add('is-flat');
      }, { threshold: .35 });
      flat.observe(stage);
    } else frame.classList.add('is-flat');
  }
})();

})();

/* ============================================================
   THE DASHBOARD BEAT: when its clip loads and plays.

   The clip has no src in the page. It is given one the first time it is
   wanted, and it is wanted only while the beat is being looked at:

     in the desktop film a band is fixed to the stage, so to an observer it
     is on screen for the whole pin. What says the beat is showing is the
     `on` class site.js puts on the band, so that is what is watched;

     in the story (phones, portrait tablets, reduced motion) it is the usual
     test, at least a third of the window on screen.

   Nothing plays unasked for a visitor who prefers reduced motion, who is
   saving data or on a slow connection, or who is on a phone whose
   connection is not known to be fast (the phone must stay quick on one bar
   of signal, and an iPhone does not say what it is on). They get the still
   and a play button, and the file is fetched when they press it.

   The still is the clip's middle frame, so the first play starts from the
   middle and the picture carries straight on from it.
   ============================================================ */
(function () {
  'use strict';

  var R = document.documentElement;
  var band = document.querySelector('.film .band--dash');
  var fig = band && band.querySelector('.dx-beat');
  var screen = fig && fig.querySelector('.dx-beat__screen');
  var v = fig && fig.querySelector('.dx-beat__v');
  var still = fig && fig.querySelector('.dx-beat__still');
  if (!screen || !v || typeof v.play !== 'function') return;

  var mm = window.matchMedia ? function (q) { return window.matchMedia(q) } : function () { return { matches: false } };
  var rmq = mm('(prefers-reduced-motion: reduce)');
  var phq = mm('(max-width: 760px)');

  function film() { return R.classList.contains('film') }
  function conn() { return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null }
  function saving() { var c = conn(); return !!(c && c.saveData) }
  function slow() { var c = conn(); return !!(c && /^(slow-2g|2g|3g)$/.test(c.effectiveType || '')) }
  /* true when the clip has to be asked for */
  function manual() {
    if (rmq.matches || saving() || slow()) return true;
    if (phq.matches) { var c = conn(); return !(c && c.effectiveType === '4g') }
    return false;
  }

  /* the visitor's own word on it: null until they press the control, then
     true (play) or false (pause). inView is the story's third-on-screen
     test, onScreen any part of it; without an observer both are simply true */
  var asked = null, blocked = false, failed = false, sought = false;
  var hasIO = 'IntersectionObserver' in window;
  var inView = !hasIO, onScreen = !hasIO;

  /* under 560px of height the film hides the window and keeps the words */
  function shown() { return fig.offsetWidth > 0 }
  function showing(loose) {
    if (!shown()) return false;
    return film() ? band.classList.contains('on') : (loose ? onScreen : inView);
  }

  /* the 960 file unless the window is a thousand pixels wide. In the desktop
     film that is counted in the screen's own pixels, so a high-density
     laptop does not go soft the moment the still gives way to the clip */
  function pick() {
    var w = screen.clientWidth;
    if (film()) w *= Math.min(window.devicePixelRatio || 1, 2);
    var big = w >= 1000 && !saving() && !slow();
    return (big ? v.getAttribute('data-src') : v.getAttribute('data-src-sm')) || v.getAttribute('data-src') || '';
  }

  /* in the film the band sits off stage until its beat, so a lazy picture
     would only start loading as the window appears: ask for it up front */
  function wake() {
    if (still && film() && still.getAttribute('loading') === 'lazy') still.setAttribute('loading', 'eager');
  }

  function play() {
    if (failed) return;
    if (!v.getAttribute('src')) {
      var url = pick();
      if (!url) return;
      v.src = url;
    }
    if (!v.paused) return;
    var p = v.play();
    if (p && p.catch) {
      p.catch(function (e) {
        /* a pause that lands before the play has started is not a refusal */
        if (e && e.name === 'AbortError') return;
        blocked = true; paint();
      });
    }
  }

  function sync() {
    wake();
    var want;
    if (asked === true) want = showing(true);
    else want = asked === null && !blocked && !manual() && showing(false);
    if (want) play();
    else if (!v.paused) v.pause();
    /* someone who had to ask is asked again next time: nothing restarts by itself */
    if (asked === true && !showing(true) && manual()) asked = null;
    paint();
  }

  /* ---- the control ---- */
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dx-beat__play';
  btn.appendChild(document.createElement('i'));
  screen.appendChild(btn);
  btn.addEventListener('click', function () {
    asked = v.paused;
    blocked = false;
    sync();
  });

  function paint() {
    var playing = !v.paused && !v.ended;
    fig.classList.toggle('is-playing', playing);
    fig.classList.toggle('is-idle', !playing && !failed && (asked === false || blocked || manual()));
    fig.classList.toggle('is-failed', failed);
    btn.setAttribute('aria-label', playing ? 'Pause the dashboard clip' : 'Play the dashboard clip');
  }

  /* ---- the clip over its still ---- */
  var isLive = false;
  function live() {
    if (isLive || !sought || v.seeking || v.paused || v.readyState < 2) return;
    isLive = true;
    fig.classList.add('is-live');
  }
  v.addEventListener('loadedmetadata', function () {
    if (sought) return;
    var d = v.duration;
    if (d && isFinite(d)) { try { v.currentTime = d * .5 } catch (e) {} }
    sought = true;
  });
  ['playing', 'seeked', 'timeupdate'].forEach(function (n) { v.addEventListener(n, live) });

  /* a decoder starved by a busy machine can come to rest on one frame with
     the whole file in hand and never start again. If the clip has waited a
     second and a half on data it already holds, a hair's seek sets it going */
  var nudge = 0;
  function held(t) {
    var b = v.buffered;
    for (var i = 0; i < b.length; i++) if (t >= b.start(i) - .05 && t + .25 <= b.end(i)) return true;
    return false;
  }
  v.addEventListener('waiting', function () {
    var t0 = v.currentTime;
    clearTimeout(nudge);
    nudge = setTimeout(function () {
      if (v.paused || v.seeking || v.readyState > 2 || v.currentTime !== t0 || !held(t0)) return;
      try { v.currentTime = t0 + .01 } catch (e) {}
    }, 1500);
  });
  ['playing', 'pause', 'emptied'].forEach(function (n) { v.addEventListener(n, function () { clearTimeout(nudge) }) });
  ['play', 'playing', 'pause'].forEach(function (n) { v.addEventListener(n, paint) });
  v.addEventListener('error', function () {
    /* the still stays; a control that cannot work goes */
    failed = true; isLive = false;
    fig.classList.remove('is-live');
    paint();
  });

  /* ---- what is watched ---- */
  if (window.MutationObserver) {
    var mo = new MutationObserver(sync);
    mo.observe(band, { attributes: true, attributeFilter: ['class'] });
    mo.observe(R, { attributes: true, attributeFilter: ['class'] });
  }
  if (hasIO) {
    new IntersectionObserver(function (es) {
      var e = es[es.length - 1];
      onScreen = e.isIntersecting;
      inView = e.isIntersecting && e.intersectionRatio >= .35;
      sync();
    }, { threshold: [0, .2, .35, .5, .8] }).observe(screen);
  }
  if (rmq.addEventListener) rmq.addEventListener('change', sync);
  else if (rmq.addListener) rmq.addListener(sync);

  /* vw units count the scrollbar and the header's margin does not: tell the
     film layout how wide it is, so the window's right edge meets the margin */
  function gutter() {
    var w = Math.max(0, (window.innerWidth || 0) - R.clientWidth);
    band.style.setProperty('--dx-sbw', w + 'px');
  }
  gutter();
  window.addEventListener('resize', function () { gutter(); sync() });

  sync();
})();

/* ============================================================
   Domin8te Media, the background switch.

   The page has two grounds: the dark one it has always had, and
   the dashboard's light cream (assets/light.css). Dark is the
   default and needs no attribute; light is html[data-theme="light"].
   The head script applies the stored choice before the first
   paint. This file is the switch: the round button in the header,
   its text copy in the footer on phones, and the three things
   that have to follow a change (the stored choice, the browser's
   own bar colour, and the dot field, which hears `themechange`).

   The whole page changes ground, the scroll film included. Its
   footage was rendered on black: on the light ground the cloche
   film keeps its own colours, feathered into the cream, and the
   cloud films lose their black over a day sky (all of that is
   light.css). Nothing here needs to know where the film is; it
   only marks the moment of the change (html.dx-flip), so that the
   fade the cloche film eases through at its end cuts with the
   ground instead of being seen half way.
   ============================================================ */
(function () {
'use strict';

var root = document.documentElement;
var KEY = 'd8site.theme';
var DARK_BAR = '#000000', LIGHT_BAR = '#F4F1EC';   /* meta theme-color: the page's own value, and the cream ground */

var meta = document.querySelector('meta[name="theme-color"]');
var btns = Array.prototype.slice.call(document.querySelectorAll('.dx-toggle'));
var rmq = matchMedia('(prefers-reduced-motion: reduce)');

function isLight() { return root.getAttribute('data-theme') === 'light' }

/* ---------- what follows the theme ---------- */

/* the browser's bar takes the page's ground */
function paintBar() {
  if (!meta) return;
  var c = isLight() ? LIGHT_BAR : DARK_BAR;
  if (meta.getAttribute('content') !== c) meta.setAttribute('content', c);
}

/* both buttons say where they lead, and whether the light ground is on */
function paintButtons() {
  var light = isLight();
  btns.forEach(function (b) {
    b.setAttribute('aria-label', light ? 'Switch to dark background' : 'Switch to light background');
    b.setAttribute('aria-pressed', light ? 'true' : 'false');
    var t = b.querySelector('.dx-toggle__txt');
    if (t) t.textContent = light ? 'Dark background' : 'Light background';
  });
}

var flipT = null;
function apply(light, keep) {
  root.classList.add('dx-flip');
  if (flipT !== null) clearTimeout(flipT);
  flipT = setTimeout(function () { flipT = null; root.classList.remove('dx-flip') }, 450);
  if (light) root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  if (keep) { try { localStorage.setItem(KEY, light ? 'light' : 'dark') } catch (e) {} }
  paintButtons();
  paintBar();
  /* site.js redraws the dot field in the new ground's ink, and the phone's
     line (phone.js) takes the new ground's colours */
  var ev;
  try { ev = new Event('themechange') }
  catch (e) { ev = document.createEvent('Event'); ev.initEvent('themechange', false, false) }
  window.dispatchEvent(ev);
}

/* the two grounds dissolve into each other where the browser can do it (a
   view transition: nothing moves, only colour changes); anywhere else, and
   under reduced motion, the change is simply made */
function flip() {
  var to = !isLight();
  if (document.startViewTransition && !rmq.matches) {
    try { document.startViewTransition(function () { apply(to, true) }); return } catch (e) {}
  }
  apply(to, true);
}

btns.forEach(function (b) { b.addEventListener('click', flip) });

/* another tab of the site changed its mind: follow it */
window.addEventListener('storage', function (e) {
  if (e.key !== KEY || !e.newValue) return;
  var light = e.newValue === 'light';
  if (light !== isLight()) apply(light, false);
});

/* ---------- go ---------- */

paintButtons();
paintBar();

})();

/* ============================================================
   Domin8te Media, the light ground's sky around the beats.

   On the light ground the film's two cloud beats are a day sky,
   and this is that sky reaching out past them (light.css,
   .dx-sky): as the line begins to climb toward a beat a pale sky
   comes up behind it with three depths of the sky film's own
   clouds, the beat's blue comes in with the beat's film, and the
   whole of it goes when the beat does.

   The clouds move with the film's camera. site.js hands over the
   world's offset on every frame it draws (window.__dxSky), and
   each depth takes a share of it, a near cloud more than a far
   one, so they slide down and away as the line rises and pass
   behind it as it travels; they also drift a little with the
   scroll itself, so they keep moving while a beat holds its words.
   Each depth is one repeating picture moved within one repeat by
   transform, so a frame costs three transforms and an opacity.
   Nothing here runs on the dark ground.
   ============================================================ */
(function () {
'use strict';

var root = document.documentElement;
var box = document.querySelector('.dx-sky');
var sky = document.getElementById('sky');
if (!box || !sky) return;
var deep = box.querySelector('.dx-sky__deep');

/* f: the share of the camera's travel. w, h: one repeat of the picture, in vh
   (the pictures are drawn at these proportions). o: opacity while the line
   climbs, and under the beat's film, where the near clouds would sit behind
   the film's own and go. d: the drift with the scroll */
var DEPTHS = [
  { name: 'far',  f: .12, w: 150,    h: 100, o: [.8, .6],  d: .05 },
  { name: 'mid',  f: .24, w: 175,    h: 125, o: [.92, .4], d: .09 },
  { name: 'near', f: .42, w: 213.33, h: 160, o: [.95, 0],  d: .12 }
];
DEPTHS.forEach(function (L) { L.el = box.querySelector('.dx-sky__l--' + L.name); L.tx = null; L.op = -1 });

function smooth(p, a, b) { var t = (p - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t) }
function mod(v, m) { return ((v % m) + m) % m }
function isLight() { return root.getAttribute('data-theme') === 'light' }

var vh = 0, rangeVh = 0, shownO = -1, shownDeep = -1, last = null;

/* each depth is a repeat larger than the stage each way, so moving it by
   less than one repeat never shows an edge */
function size() {
  vh = innerHeight / 100;
  DEPTHS.forEach(function (L) {
    var w = L.w * vh, h = L.h * vh;
    L.el.style.width = 'calc(100% + ' + w.toFixed(1) + 'px)';
    L.el.style.height = 'calc(100% + ' + h.toFixed(1) + 'px)';
    L.el.style.backgroundSize = w.toFixed(1) + 'px ' + h.toFixed(1) + 'px';
    L.tx = null;
  });
}

function paint(p, P, wx, wy) {
  last = [p, P, wx, wy];
  if (!isLight()) {
    if (shownO !== 0) { shownO = 0; box.style.opacity = '0'; box.classList.remove('on') }
    return;
  }
  if (!vh) size();
  /* sky.js has just set the beat's opacity for this frame */
  var so = parseFloat(sky.style.opacity) || 0;
  /* before each beat the sky comes up as the line climbs to it (q .185 to .27,
     and .825 to .87 once the pair's plates have gone), and the beat's own
     opacity takes over from there */
  var o = Math.max(so,
    smooth(p, .185, .27) * (1 - smooth(p, .31, .33)) +
    smooth(p, .825, .87) * (1 - smooth(p, .89, .91)));
  var oq = Math.round(o * 200) / 200;
  if (oq !== shownO) { shownO = oq; box.style.opacity = oq.toFixed(3); box.classList.toggle('on', oq > 0) }
  if (oq <= 0) return;

  var dq = Math.round(so * 100) / 100;
  if (dq !== shownDeep) { shownDeep = dq; deep.style.opacity = dq.toFixed(2) }

  if (!rangeVh) rangeVh = (window.__feel && window.__feel.range()) || 1964;
  var drift = P * rangeVh * vh;
  for (var i = 0; i < DEPTHS.length; i++) {
    var L = DEPTHS[i], w = L.w * vh, h = L.h * vh;
    var tx = mod(wx * L.f - drift * L.d * .5, w) - w;
    var ty = mod(wy * L.f + drift * L.d, h) - h;
    if (L.tx === null || Math.abs(tx - L.tx) > .3 || Math.abs(ty - L.ty) > .3) {
      L.tx = tx; L.ty = ty;
      L.el.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0)';
    }
    var op = L.o[0] + (L.o[1] - L.o[0]) * so;
    if (Math.abs(op - L.op) > .01) { L.op = op; L.el.style.opacity = op.toFixed(3) }
  }
}

window.__dxSky = paint;
window.addEventListener('resize', function () { vh = 0; if (last) paint.apply(null, last) });
/* the switch can be thrown mid-film, between two of its frames */
window.addEventListener('themechange', function () { if (last) paint.apply(null, last) });

})();
