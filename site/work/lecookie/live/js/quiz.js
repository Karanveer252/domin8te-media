/* The opening: three small questions, and the cookie is made in front of the visitor as they answer:
   first its shape (the plain cookie, fresh from the oven), then its icing, then what goes on top. The page
   then bakes, ices, signs and boxes exactly that cookie (story.js, LECookieStory.setDesign). Asked once a
   visit; the line under the oven starts it again. Without this script the page bakes the default cookie. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement, api = window.LECookieStory;
  if (!api || !api.setDesign) return;
  var CFG = api.config;
  var SHAPES = [{ id: 'circle', name: 'Classic round', say: 'round' }, { id: 'heart', name: 'Heart', say: 'heart' },
                { id: 'square', name: 'Square', say: 'square' }, { id: 'star', name: 'Star', say: 'star' }];
  var ICINGS = [{ id: 'ivory', name: 'Ivory', say: 'ivory' }, { id: 'mauve', name: 'Mauve', say: 'mauve' },
                { id: 'grey', name: 'Dove grey', say: 'dove grey' }, { id: 'peach', name: 'Peach', say: 'peach' }];
  var TOPS = [{ id: 'garland', name: 'Flower garland', say: 'a flower garland' }, { id: 'bow', name: 'Piped bow', say: 'a piped bow' },
              { id: 'pearls', name: 'Pearls and gold', say: 'pearls and gold' }];
  var KEY = 'lecookie.v6.quiz';
  var ans = { shape: null, icing: null, top: null }, step = 0, dialog = null, lastFocus = null, chosen = false, busy = false;
  try { chosen = sessionStorage.getItem(KEY) === 'chosen'; } catch (e) {}

  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function describe(d) {
    return find(ICINGS, d.icing).say + ' ' + find(SHAPES, d.shape).say + ' with ' + find(TOPS, d.top).say;
  }
  var IMGV = '?v=54';     // as story.js
  function thumb(kind, d) { return thumbPath(kind, d) + IMGV; }
  function thumbPath(kind, d) {
    if (kind === 'base') return 'img/cookie/thumb/base_' + d.shape + '.webp';
    if (kind === 'iced') return 'img/cookie/thumb/iced_' + d.shape + '_' + d.icing + '.webp';
    if (kind === 'decor') return 'img/cookie/thumb/decor_' + d.shape + '_' + d.icing + '_' + d.top + '.webp';
    return 'img/cookie/thumb/signed_' + d.shape + '_' + d.icing + '_' + d.top + '.webp';
  }

  /* ---- the line under the oven, and the line by the box ---- */
  var stage = doc.querySelector('.oven-stage');
  var note = doc.createElement('p');
  note.className = 'pick-note';
  note.innerHTML = '<span class="pick-note__text"></span> <button type="button" class="pick-note__btn"></button>';
  if (stage) stage.appendChild(note);
  var mine = doc.querySelector('[data-your-cookie]');
  function setNotes() {
    var d = api.design();
    note.querySelector('.pick-note__text').textContent = chosen ? 'In the oven: your ' + describe(d) + '.' : 'In the oven: one of ours.';
    note.querySelector('.pick-note__btn').textContent = chosen ? 'Change it' : 'Design your own';
    if (mine) {
      mine.hidden = !chosen;
      mine.textContent = chosen ? 'In this box: your ' + describe(d) + ', piped JW.' : '';
    }
  }
  note.querySelector('.pick-note__btn').addEventListener('click', function () { open(); });
  setNotes();

  /* ---- the dialog ---- */
  function cookieSrc() {
    if (ans.top) return thumb('signed', ans);
    if (ans.icing) return thumb('iced', ans);
    if (ans.shape) return thumb('base', ans);
    return 'img/cookie/thumb/dough.webp' + IMGV;
  }
  function cookieAlt() {
    if (ans.top) return 'Your cookie: ' + describe(ans) + ', piped JW.';
    if (ans.icing) return 'Your cookie so far: a ' + find(SHAPES, ans.shape).say + ' iced in ' + find(ICINGS, ans.icing).say + '.';
    if (ans.shape) return 'Your cookie so far: a plain ' + find(SHAPES, ans.shape).say + ', fresh from the oven.';
    return 'A ball of cookie dough, waiting.';
  }
  function setName() {
    var el = dialog.querySelector('.quiz__name'), sh = ans.shape && find(SHAPES, ans.shape), ic = ans.icing && find(ICINGS, ans.icing);
    var name = !sh ? 'Your cookie' : ic ? ic.name + ' ' + sh.say : sh.name;
    el.textContent = name;
    if (ans.top) { var sm = doc.createElement('small'); sm.textContent = 'with ' + find(TOPS, ans.top).say; el.appendChild(sm); }
  }
  function showCookie() {
    setName();
    var wrap = dialog.querySelector('.quiz__cookie'), old = wrap.querySelector('img:not(.is-old)'), s = cookieSrc();
    if (old && old.getAttribute('src') === s) return;
    var im = doc.createElement('img');
    im.width = 300; im.height = 300; im.alt = cookieAlt(); im.src = s;
    wrap.appendChild(im);
    requestAnimationFrame(function () { requestAnimationFrame(function () { im.classList.add('is-in'); }); });
    if (old) { old.classList.add('is-old'); setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 450); }
  }
  var TICK = '<span class="quiz__tick" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><path d="M3.2 8.6l3 3 6.6-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  function opt(q, id, label, img) {
    var on = ans[q] === id;
    return '<li><button type="button" class="quiz__opt' + (on ? ' is-picked' : '') + '" aria-pressed="' + on + '" data-q="' + q + '" data-a="' + id + '">' +
      TICK + '<img src="' + img + '" width="300" height="300" alt="">' + '<span>' + label + '</span></button></li>';
  }
  // a step can be visited once everything before it is answered
  function canVisit(i) { return i === 0 || (i === 1 && !!ans.shape) || (i === 2 && !!ans.shape && !!ans.icing); }
  function renderTabs() {
    var tabs = dialog.querySelectorAll('.quiz__tab');
    for (var i = 0; i < tabs.length; i++) {
      var on = i === step, ok = canVisit(i);
      tabs[i].className = 'quiz__tab' + (on ? ' is-on' : ok ? ' is-done' : '');
      tabs[i].disabled = !ok;
      if (on) tabs[i].setAttribute('aria-current', 'step'); else tabs[i].removeAttribute('aria-current');
    }
  }
  function render() {
    var head = dialog.querySelector('.quiz__head'), body = dialog.querySelector('.quiz__step'), t = '', h = '';
    if (step === 0) {
      t = '<p class="quiz__count">Question 1 of 3</p><h2 class="quiz__title" id="quiz-title" tabindex="-1">Pick a favourite</h2><p class="quiz__sub">Or skip and explore the menu.</p>';
      h = '<ul class="quiz__opts quiz__opts--4">' + SHAPES.map(function (s) { return opt('shape', s.id, s.name, thumb('base', { shape: s.id })); }).join('') + '</ul>';
    } else if (step === 1) {
      t = '<p class="quiz__count">Question 2 of 3</p><h2 class="quiz__title" id="quiz-title" tabindex="-1">Now choose your icing.</h2>';
      h = '<ul class="quiz__opts quiz__opts--4">' + ICINGS.map(function (c) { return opt('icing', c.id, c.name, thumb('iced', { shape: ans.shape, icing: c.id })); }).join('') + '</ul>';
    } else if (step === 2) {
      t = '<p class="quiz__count">Question 3 of 3</p><h2 class="quiz__title" id="quiz-title" tabindex="-1">And what goes on top?</h2>';
      h = '<ul class="quiz__opts quiz__opts--3">' + TOPS.map(function (p) { return opt('top', p.id, p.name, thumb('decor', { shape: ans.shape, icing: ans.icing, top: p.id })); }).join('') + '</ul>';
    } else {
      t = '<p class="quiz__count">Your order</p><h2 class="quiz__title" id="quiz-title" tabindex="-1">One ' + describe(ans) + '.</h2>';
      h = '<p class="quiz__because">That’s the one we’ll bake for you. Scroll to watch it come together.</p>' +
        '<div class="quiz__actions"><button type="button" class="btn btn--primary btn--big quiz__go">Watch it bake</button>' +
        '<button type="button" class="btn btn--clay quiz__again">Start again</button></div>';
    }
    head.innerHTML = t;
    body.innerHTML = h;
    renderTabs();
    dialog.querySelector('.quiz__back').hidden = step === 0 || step === 3;
    dialog.querySelector('.quiz__skip').hidden = step === 3;
    showCookie();
    var t = dialog.querySelector('.quiz__title');
    if (t) t.focus({ preventScroll: true });
  }
  function build() {
    var d = doc.createElement('div');
    d.className = 'quiz';
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'quiz-title');
    d.innerHTML = '<div class="quiz__sheet">' +
      '<ol class="quiz__tabs" aria-label="Your cookie, step by step">' +
        ['Shape', 'Icing', 'Topping'].map(function (n, i) { return '<li><button type="button" class="quiz__tab" data-step="' + i + '">' + n + '</button></li>'; }).join('') +
      '</ol>' +
      '<div class="quiz__intro"><p class="quiz__eyebrow"><svg class="emblem" viewBox="0 0 24 22" aria-hidden="true" focusable="false"><use href="#i-heart"/></svg>Before we bake anything</p>' +
        '<div class="quiz__head" aria-live="polite"></div></div>' +
      '<div class="quiz__box"><div class="quiz__lid" aria-hidden="true">Le Cookie · by J</div>' +
        '<div class="quiz__tray"><span class="quiz__tissue" aria-hidden="true"></span><div class="quiz__cookie"></div>' +
        '<p class="quiz__name"></p></div></div>' +
      '<div class="quiz__step"></div>' +
      '<div class="quiz__foot"><button type="button" class="quiz__back" hidden>Back</button>' +
      '<button type="button" class="btn btn--clay quiz__skip">' + (chosen ? 'Keep my cookie' : 'Skip to homepage') + '</button></div>' +
    '</div>';
    d.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target : null; if (!t) return;
      var o = t.closest('.quiz__opt'), tab = t.closest('.quiz__tab');
      if (o) {
        if (busy) return;
        ans[o.getAttribute('data-q')] = o.getAttribute('data-a');
        // tick the card and change the cookie in the box, then move on once the tick has been seen
        Array.prototype.forEach.call(d.querySelectorAll('.quiz__opt'), function (b) {
          var on = b === o; b.classList.toggle('is-picked', on); b.setAttribute('aria-pressed', String(on));
        });
        showCookie();
        if (ans.shape && ans.icing && ans.top) { chosen = true; try { sessionStorage.setItem(KEY, 'chosen'); } catch (err) {} api.setDesign(ans); setNotes(); }
        busy = true;
        setTimeout(function () { busy = false; if (dialog !== d) return; step += 1; render(); }, 520);
      } else if (tab) {
        if (busy || tab.disabled) return;
        step = +tab.getAttribute('data-step'); render();
      } else if (t.closest('.quiz__back')) {
        step -= 1;
        render();
      } else if (t.closest('.quiz__again')) {
        ans = { shape: null, icing: null, top: null }; step = 0; render();
      } else if (t.closest('.quiz__go') || t.closest('.quiz__skip')) close();
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      // keep the focus inside the dialog
      var fs = Array.prototype.filter.call(d.querySelectorAll('button'), function (b) { return !b.hidden && b.offsetParent !== null; });
      if (!fs.length) return;
      var on = fs.indexOf(doc.activeElement);
      if (e.shiftKey && on <= 0) { e.preventDefault(); fs[fs.length - 1].focus(); }
      else if (!e.shiftKey && on === fs.length - 1) { e.preventDefault(); fs[0].focus(); }
    });
    return d;
  }
  function open() {
    if (dialog) return;
    lastFocus = doc.activeElement;
    ans = { shape: null, icing: null, top: null }; step = 0;
    dialog = build();
    doc.body.appendChild(dialog);
    root.classList.add('pick-open');
    render();
    requestAnimationFrame(function () { if (dialog) dialog.classList.add('is-in'); });
  }
  function close() {
    if (!dialog) return;
    var d = dialog; dialog = null;
    try { localStorage.setItem(KEY + '.seen', '1'); } catch (e) {}
    root.classList.remove('pick-open');
    d.classList.remove('is-in'); d.classList.add('is-out');
    var done = function () { if (d.parentNode) d.parentNode.removeChild(d); };
    d.addEventListener('transitionend', function (e) { if (e.target === d) done(); });
    setTimeout(done, 700);
    if (lastFocus && lastFocus.focus && lastFocus !== doc.body) lastFocus.focus({ preventScroll: true });
    else { var h = doc.getElementById('hero-title'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
  }

  // Ask on the first visit only, and only at the top of the page: a visitor who arrives by a link to a section is left alone.
  var seen = false;
  try { seen = localStorage.getItem(KEY + '.seen') === '1'; } catch (e) {}
  if (!chosen && !seen && !location.hash && window.scrollY < 40) open();
})();
