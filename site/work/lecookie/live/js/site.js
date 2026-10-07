/* Lecookie · V6 The Little Oven — page behaviour: the header's menu, the nav's place-marker, and the
   inquiry form (validation, the conditional delivery address, and an honest status). */

/* Where a finished inquiry is POSTed as JSON. Empty in the preview, so the
   form validates fully and then says plainly that nothing was sent. */
const INQUIRY_ENDPOINT = '';

(function () {
  'use strict';

  var doc = document.documentElement;
  doc.classList.add('js');

  var IG_URL = 'https://instagram.com/lecookiebyj';

  /* ------------------------------------------------ header: the menu -- */
  var toggle = document.querySelector('.menu-toggle');
  var panel = document.getElementById('nav-panel');
  var toggleLabel = toggle ? toggle.querySelector('.menu-toggle__label') : null;
  var wide = window.matchMedia('(min-width: 1100px)');

  function isOpen() { return !!toggle && toggle.getAttribute('aria-expanded') === 'true'; }
  function setMenu(open) {
    if (!toggle || !panel) { return; }
    toggle.setAttribute('aria-expanded', String(open));
    panel.setAttribute('data-open', String(open));
    if (toggleLabel) { toggleLabel.textContent = open ? 'Close' : 'Menu'; }
  }

  if (toggle && panel) {
    toggle.addEventListener('click', function () { setMenu(!isOpen()); });
    panel.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) { setMenu(false); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { setMenu(false); toggle.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (isOpen() && !(e.target.closest && e.target.closest('.site-nav'))) { setMenu(false); }
    });
    var onWide = function () { setMenu(false); };
    if (wide.addEventListener) { wide.addEventListener('change', onWide); } else if (wide.addListener) { wide.addListener(onWide); }
  }

  /* ---------------------------------- nav: mark the section in view -- */
  var navLinks = [].slice.call(document.querySelectorAll('.site-nav__link'));
  if ('IntersectionObserver' in window && navLinks.length) {
    var byId = {};
    navLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) { return; }
        var link = byId[en.target.id];
        navLinks.forEach(function (l) { l.removeAttribute('aria-current'); });
        if (link) { link.setAttribute('aria-current', 'true'); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['hero', 'story', 'signature', 'boxed', 'gallery', 'collections', 'cart', 'testimonials', 'faq', 'order'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { spy.observe(el); }
    });
  }

  /* ------------------------------------------------ the order ticket -- */
  var form = document.getElementById('inquiry-form');
  var statusBox = document.getElementById('order-status');
  if (!form || !statusBox) { return; }
  form.setAttribute('novalidate', '');

  // A small round warning mark, drawn in the page's own soft line.
  var alertMark = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 7v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.8" r="1.4" fill="currentColor"/></svg>';

  var els = form.elements;
  var dateInput = els.namedItem('date');
  var addressWrap = form.querySelector('[data-field="address"]');
  var submitBtn = form.querySelector('button[type="submit"]');
  var attempted = false;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoLocal(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  var todayIso = isoLocal(new Date());
  if (dateInput) { dateInput.min = todayIso; }

  function radioValue(name) {
    var checked = form.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : '';
  }
  function isLocal() { return radioValue('fulfilment') === 'Local delivery'; }

  function syncAddress() {
    var local = isLocal();
    addressWrap.hidden = !local;
    els.namedItem('address').required = local;
    if (!local) { setError('address', ''); }
  }
  form.addEventListener('change', function (e) {
    if (e.target.name === 'fulfilment') {
      syncAddress();
      if (attempted) { validate('fulfilment'); }
    }
  });
  syncAddress();

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var RULES = {
    firstName: function (v) { return v.trim() ? '' : 'Add your first name, so Jaelyn knows who she is writing to.'; },
    lastName: function (v) { return v.trim() ? '' : 'Add your last name.'; },
    email: function (v) {
      if (!v.trim()) { return 'Add your email address. It is where Jaelyn will reply.'; }
      return EMAIL.test(v.trim()) ? '' : 'That email address looks incomplete. Check that it reads like name@example.com.';
    },
    fulfilment: function () { return radioValue('fulfilment') ? '' : 'Choose pickup or local delivery.'; },
    date: function (v) {
      if (!v) { return 'Choose the date you need the cookies. Two weeks from today or later is best.'; }
      if (v < todayIso) { return 'That date has already passed. Choose today or a later date; two weeks out is best.'; }
      return '';
    },
    address: function (v) { return isLocal() && !v.trim() ? 'Add the delivery address, or choose pickup instead.' : ''; },
    quantity: function (v, input) {
      if (input && input.validity && input.validity.badInput) { return 'Enter the number of cookies in figures, like 24.'; }
      if (!v.trim()) { return ''; }
      var n = Number(v);
      if (!isFinite(n) || Math.floor(n) !== n) { return 'Enter a whole number of cookies, like 24.'; }
      return n < 12 ? 'The minimum order is twelve cookies. Enter 12 or more, or leave this blank.' : '';
    }
  };
  var ORDER = ['firstName', 'lastName', 'email', 'fulfilment', 'date', 'address', 'quantity'];

  function controlsOf(name) {
    return [].slice.call(form.querySelectorAll('[name="' + name + '"]'));
  }
  function describe(el, id, on) {
    var ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    var i = ids.indexOf(id);
    if (on && i < 0) { ids.push(id); }
    if (!on && i >= 0) { ids.splice(i, 1); }
    if (ids.length) { el.setAttribute('aria-describedby', ids.join(' ')); } else { el.removeAttribute('aria-describedby'); }
  }
  function setError(name, message) {
    var wrap = form.querySelector('[data-field="' + name + '"]');
    if (!wrap) { return; }
    var id = 'f-' + name + '-error';
    var box = document.getElementById(id);
    var controls = controlsOf(name);
    if (message) {
      if (!box) {
        box = document.createElement('span');
        box.className = 'field__error';
        box.id = id;
        wrap.appendChild(box);
      }
      box.innerHTML = alertMark + '<span></span>';
      box.lastChild.textContent = message;
      wrap.classList.add('field--invalid');
      controls.forEach(function (c) { c.setAttribute('aria-invalid', 'true'); describe(c, id, true); });
    } else {
      if (box) { box.parentNode.removeChild(box); }
      wrap.classList.remove('field--invalid');
      controls.forEach(function (c) { c.removeAttribute('aria-invalid'); describe(c, id, false); });
    }
  }
  function validate(name) {
    var input = els.namedItem(name);
    var value = input && typeof input.value === 'string' ? input.value : '';
    var message = RULES[name](value, input && input.validity ? input : null);
    setError(name, message);
    return message;
  }

  // After the first attempt, each required field re-checks as it is left.
  // When it is left by pressing a pointer on anything (a radio, a checkbox,
  // the submit, a link), the check waits until that click has landed: adding
  // or removing an error line on pointerdown would shift whatever is below it
  // before pointerup, and the click would be lost. Leaving by keyboard checks
  // at once.
  var pressing = false, pending = [], releaseTimer = 0;
  function flushPending() {
    pressing = false;
    window.clearTimeout(releaseTimer);
    var names = pending;
    pending = [];
    names.forEach(function (n) { validate(n); });
  }
  document.addEventListener('pointerdown', function () {
    pressing = true;
    window.clearTimeout(releaseTimer);
  }, true);
  // The click fires after pointerup; validate just after it. If no click follows
  // (a drag, a cancelled touch), a short timer releases the hold instead.
  document.addEventListener('click', function () {
    if (pressing) { window.setTimeout(flushPending, 0); }
  });
  ['pointerup', 'pointercancel'].forEach(function (type) {
    document.addEventListener(type, function () {
      if (!pressing) { return; }
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(flushPending, 400);
    }, true);
  });
  form.addEventListener('focusout', function (e) {
    var name = e.target && e.target.name;
    if (!attempted || !name || !RULES[name] || name === 'fulfilment') { return; }
    if (pressing) {
      if (pending.indexOf(name) < 0) { pending.push(name); }
      return;
    }
    validate(name);
  });

  /* The status line. Honest in every state: it never says an inquiry went
     anywhere it did not go. */
  function igLink(text) {
    return '<a href="' + IG_URL + '" target="_blank" rel="noopener">' + text +
      '<span class="visually-hidden"> (opens in a new tab)</span></a>';
  }
  function setStatus(state) {
    statusBox.setAttribute('data-state', state || '');
    if (!state) { statusBox.innerHTML = ''; return; }
    var mark = alertMark;
    var html = '';
    if (state === 'offline') {
      html = '<div><p><strong>Your inquiry has not been sent.</strong> This preview of the site is not connected to Jaelyn\'s inbox yet, so nothing left this page.</p>' +
        '<p>To reach her today, send your date and your idea to ' + igLink('@lecookiebyj on Instagram') + '.</p></div>';
    } else if (state === 'sending') {
      mark = '';
      html = '<p>Sending your inquiry to Jaelyn…</p>';
    } else if (state === 'sent') {
      mark = '';
      html = '<p><strong>Your inquiry is with Jaelyn.</strong> She replies within one to two business days.</p>';
    } else if (state === 'failed') {
      html = '<div><p><strong>Your inquiry did not go through.</strong> Nothing was sent. Please try again in a moment.</p>' +
        '<p>Or message ' + igLink('@lecookiebyj on Instagram') + ' with your date and idea.</p></div>';
    }
    statusBox.innerHTML = mark + html;
  }

  function collect() {
    var data = {};
    ['firstName', 'lastName', 'email', 'fulfilment', 'date', 'address', 'quantity', 'vision', 'notes'].forEach(function (name) {
      data[name] = name === 'fulfilment' ? radioValue(name) : (els.namedItem(name).value || '').trim();
    });
    if (!isLocal()) { delete data.address; }
    data.collection = controlsOf('collection').filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
    data.newsletter = !!(els.namedItem('newsletter') && els.namedItem('newsletter').checked);
    return data;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    attempted = true;
    var firstBad = null;
    ORDER.forEach(function (name) {
      if (validate(name) && !firstBad) { firstBad = name; }
    });
    if (firstBad) {
      setStatus('');
      var target = controlsOf(firstBad)[0];
      if (target) { target.focus(); }
      return;
    }

    if (!INQUIRY_ENDPOINT) {
      setStatus('offline');
      return;
    }

    setStatus('sending');
    if (submitBtn) { submitBtn.disabled = true; }
    fetch(INQUIRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(collect())
    }).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      setStatus('sent');
      form.reset();
      attempted = false;
      syncAddress();
    }).catch(function () {
      setStatus('failed');
    }).then(function () {
      if (submitBtn) { submitBtn.disabled = false; }
    });
  });
})();
