// @ts-check
/*
 * App shell: starts the session, draws the sidebar, the mobile bars and the account menu,
 * routes between pages, and handles every control through one set of listeners.
 * Routes live in the hash (#/home, #/work/social, #/results?days=90) so the portal runs as
 * static files on any host, Hostinger included.
 */
(function (root) {
  'use strict';
  const D8 = root.D8;
  const F = D8.fmt;
  const UI = D8.ui;
  const icon = UI.icon;
  /** @param {string} sel @returns {any} */
  const $ = (sel) => document.querySelector(sel);
  // Design variants (16A to 16E) set D8VARIANT before this runs: their own storage names, so a
  // choice in one never leaks into another, and optionally a fixed sidebar state.
  /** @type {any} */
  const V = root.D8VARIANT || {};
  const NS = V.storage || 'd8.v16';
  const PREF = { theme: NS + '.theme', side: NS + '.side' };
  const query = new URLSearchParams(root.location.search);

  /** Browser preferences (not client data): theme and sidebar state. */
  function pref(key, value) {
    try {
      if (value === undefined) return root.localStorage.getItem(key);
      root.localStorage.setItem(key, value);
    } catch (e) { /* storage blocked: the defaults still work */ }
    return null;
  }

  const app = {
    /** @type {any} */ session: null,
    /** @type {any} */ client: null,
    /** @type {any} */ account: null,
    /** @type {any} */ page: {},
    lastRoute: '#/home',
    // False while start() is fetching the session or the account: nothing is drawn until both are
    // known, and a page chosen meanwhile is kept in `wanted` and opened when they arrive.
    ready: false,
    /** @type {string|null} */ wanted: null
  };

  /* ---- theme and sidebar ------------------------------------------------------------ */

  /**
   * The client's look is kept with their account (so it follows them to any device) and on this
   * device (so it is there before the first paint). A design with more than one ground (18H: Scenes
   * or Static) listens for "d8:look" and saves its part through D8.look.save.
   */
  function saveLook(part) {
    if (!app.client || !app.client.saveAppearance) return;
    app.client.saveAppearance(part).catch(() => { /* kept on this device; the account catches up next time */ });
  }
  function syncLook(look) {
    const l = look || {};
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    if (l.theme && !query.get('theme')) {
      if (l.theme !== current) applyTheme(l.theme);
      pref(PREF.theme, l.theme);
    } else if (!l.theme && pref(PREF.theme)) {
      // Chosen on this device before it was kept with the account: carry it over.
      saveLook({ theme: pref(PREF.theme) });
    }
    document.dispatchEvent(new CustomEvent('d8:look', { detail: l }));
  }
  D8.look = { save: saveLook };

  /** Light is the default. Dark only when the client chooses it; the OS setting is not used. */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  }
  // Between 761 and 1099px the sidebar is always the rail; the client's own choice (kept in
  // chosenSide) applies again on wider screens.
  const tablet = root.matchMedia ? root.matchMedia('(min-width: 761px) and (max-width: 1099px)') : null;
  const canHover = root.matchMedia ? root.matchMedia('(hover: hover)') : null;
  let chosenSide = 'full';
  function syncSide() {
    const forced = !!(tablet && tablet.matches);
    $('#app').toggleAttribute('data-forced', forced);
    applySide(forced ? 'rail' : chosenSide);
  }
  function applySide(s) {
    const rail = s === 'rail';
    $('#app').setAttribute('data-side', rail ? 'rail' : 'full');
    const b = $('.side-toggle');
    if (b) {
      b.setAttribute('aria-expanded', rail ? 'false' : 'true');
      b.setAttribute('aria-label', rail ? 'Expand sidebar' : 'Collapse sidebar');
      b.setAttribute('title', rail ? 'Make menu bigger' : 'Make menu smaller');
      b.querySelector('.side-toggle-label').textContent = rail ? 'Expand sidebar' : 'Collapse sidebar';
      b.querySelector('.i use').setAttribute('href', rail ? '#i-chevron-right' : '#i-chevron-left');
    }
    hideTip();
    placeIndicator();
    // The rail's item heights settle once the width has finished moving.
    setTimeout(placeIndicator, 240);
  }

  /* ---- the sliding marker behind the current page, and rail labels ------------------------ */

  /** Moves each list's glass capsule to its current item; lists without one hide theirs. */
  function placeIndicator() {
    document.querySelectorAll('.side .nav-list').forEach((el) => {
      const list = /** @type {HTMLElement} */ (el);
      const cur = /** @type {HTMLElement|null} */ (list.querySelector('[aria-current="page"]'));
      if (!cur) { list.style.setProperty('--ind-o', '0'); return; }
      const item = /** @type {HTMLElement} */ (cur.closest('li') || cur);
      list.style.setProperty('--ind-y', item.offsetTop + 'px');
      list.style.setProperty('--ind-h', item.offsetHeight + 'px');
      list.style.setProperty('--ind-o', '1');
    });
    // The tab bar gets the same values across, for designs that slide a capsule along it.
    const bar = /** @type {HTMLElement|null} */ (document.querySelector('.tabbar'));
    if (bar) {
      const tab = /** @type {HTMLElement|null} */ (bar.querySelector('[aria-current="page"]'));
      bar.style.setProperty('--tab-o', tab ? '1' : '0');
      if (tab) { bar.style.setProperty('--tab-x', tab.offsetLeft + 'px'); bar.style.setProperty('--tab-w', tab.offsetWidth + 'px'); }
    }
    // Only animate after the first placement, so the page never opens with a slide.
    if (!$('#app').hasAttribute('data-ind')) setTimeout(() => $('#app').setAttribute('data-ind', ''), 50);
  }

  /** In the rail, a label appears beside an icon on hover or keyboard focus. */
  function showTip(link) {
    const tip = $('#rail-tip');
    if (!tip || $('#app').getAttribute('data-side') !== 'rail') return;
    const label = link.querySelector('.nav-label');
    if (!label) return;
    const r = link.getBoundingClientRect();
    tip.textContent = label.textContent;
    tip.style.top = Math.round(r.top + r.height / 2) + 'px';
    tip.style.left = Math.round(r.right + 14) + 'px';
    tip.hidden = false;
  }
  function hideTip() { const tip = $('#rail-tip'); if (tip) tip.hidden = true; }
  function wireRail() {
    const side = $('.side');
    if (!side) return;
    side.addEventListener('pointerover', (e) => {
      if (canHover && !canHover.matches) return;
      const l = /** @type {HTMLElement} */ (e.target).closest('.nav-link');
      if (l) showTip(l); else hideTip();
    });
    side.addEventListener('pointerleave', hideTip);
    side.addEventListener('focusin', (e) => {
      const l = /** @type {HTMLElement} */ (e.target).closest('.nav-link');
      if (l && l.matches(':focus-visible')) showTip(l);
    });
    side.addEventListener('focusout', hideTip);
    root.addEventListener('scroll', hideTip, { passive: true });
    root.addEventListener('resize', () => { hideTip(); placeIndicator(); });
    // Whenever the sidebar changes size (collapse, expand, a font loading late), re-measure.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => placeIndicator()).observe(side);
  }

  /* ---- shell --------------------------------------------------------------------------- */

  /** Whether Billing shows its own badge for a payment problem. */
  const billingProblem = () => !!(app.account && app.account.subscription && app.account.subscription.status === 'past_due');
  /**
   * One badge language: a small pill with a count. Home's is quiet; Billing's marks a problem.
   * Given the list of what is waiting, Home's count leaves out the payment problem while Billing
   * shows it, so the one item is never counted twice (2026-10-09).
   * @param {number|any[]} items
   */
  function setBadges(items) {
    const n = Array.isArray(items) ? items.filter((x) => !(x && x.kind === 'billing' && billingProblem())).length : Number(items) || 0;
    document.querySelectorAll('[data-badge="home"]').forEach((el) => {
      const b = /** @type {HTMLElement} */ (el);
      b.hidden = !n;
      b.innerHTML = n ? `${n}<span class="sr-only"> ${F.plural(n, 'thing', 'things')} waiting for you</span>` : '';
      if (n) b.setAttribute('title', `${n} ${F.plural(n, 'thing', 'things')} waiting for you`); else b.removeAttribute('title');
    });
  }

  function drawShell() {
    const a = app.account;
    $('#identity').innerHTML = `<span class="identity-avatar" aria-hidden="true">${F.esc(a.business.name.charAt(0))}</span><span class="identity-text"><span class="identity-name">${F.esc(a.business.name)}</span><span class="identity-role">${F.esc(a.user.firstName)}, ${F.esc(a.user.role.toLowerCase())}</span></span>`;
    $('#topbar-name').textContent = a.business.name;
    $('#avatar').textContent = a.user.firstName.charAt(0);
    $('#account-who').innerHTML = `<strong>${F.esc(a.user.firstName)}</strong><span>${F.esc(a.business.name)}</span>`;
    document.querySelectorAll('[data-preview]').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = D8.data.MODE !== 'demo'; });
    // The Preview mode pill is docked at the top of the page in the demo: the page gets room above it.
    $('#app').toggleAttribute('data-demo', D8.data.MODE === 'demo');
    const problem = billingProblem();
    // The count first, then the same count without the payment problem once the list is known.
    setBadges(Math.max(0, a.openActions - (problem ? 1 : 0)));
    if (app.client && app.client.getAttention) app.client.getAttention().then(setBadges).catch(() => { /* the first count stays */ });
    document.querySelectorAll('[data-badge="billing"]').forEach((el) => {
      const b = /** @type {HTMLElement} */ (el);
      b.hidden = !problem;
      b.innerHTML = problem ? '1<span class="sr-only"> payment problem</span>' : '';
      if (problem) b.setAttribute('title', '1 payment problem'); else b.removeAttribute('title');
    });
  }

  function refreshAccount() {
    return app.client.getAccount().then((a) => { app.account = a; drawShell(); return a; });
  }

  function markCurrent(name) {
    // The page's name on the root, so a design can give each page its own world.
    document.documentElement.setAttribute('data-page', name);
    // Updates is the Done tab of Work (2026-10-09), so Work stays marked there.
    const nav = name === 'updates' ? 'work' : name;
    document.querySelectorAll('[data-nav]').forEach((el) => {
      if (el.getAttribute('data-nav') === nav) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    placeIndicator();
  }

  /* ---- account menu (phone) ------------------------------------------------------------- */

  function toggleMenu(force) {
    const btn = $('#account-btn');
    const menu = $('#account-menu');
    if (!btn || !menu) return;
    const open = force !== undefined ? force : btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    if (open) {
      const first = menu.querySelector('a, button:not([hidden])');
      if (first) first.focus();
    }
  }
  const menuOpen = () => { const b = $('#account-btn'); return !!b && b.getAttribute('aria-expanded') === 'true'; };

  /* ---- routing --------------------------------------------------------------------------- */

  /** The current hash, decoded: some mail clients and tools encode the slash as %2F. */
  const currentHash = () => { try { return decodeURIComponent(root.location.hash || ''); } catch (e) { return root.location.hash || ''; } };

  function parse() {
    const raw = currentHash();
    const h = raw.startsWith('#/') ? raw : '#/home';
    const [path, qs] = h.slice(2).split('?');
    const parts = (path || '').split('/').filter(Boolean);
    return { name: parts[0] || 'home', sub: parts[1] || null, params: Object.fromEntries(new URLSearchParams(qs || '')) };
  }

  function context() {
    return {
      get session() { return app.session; },
      get client() { return app.client; },
      get account() { return app.account; },
      setBadges,
      switchScenario,
      /** Live sign-in finished: open the portal. */
      signedIn: () => start('#/home'),
      /** After an approval, message or reset: reload the page's data in place and move focus sensibly. */
      afterChange() {
        if (!app.client) return;
        refreshAccount().then(() => {
          if (app.page && app.page.refresh) app.page.refresh();
          else render(false);
        }).catch(() => { if (app.page && app.page.refresh) app.page.refresh(); });
        const target = document.querySelector('#h-attention') || document.querySelector('#page-title');
        if (target) { target.setAttribute('tabindex', '-1'); /** @type {HTMLElement} */ (target).focus({ preventScroll: true }); }
      }
    };
  }

  function countError() {
    const n = Number(document.documentElement.getAttribute('data-errors') || '0') + 1;
    document.documentElement.setAttribute('data-errors', String(n));
  }

  /**
   * The safety net for a page that fails to draw: never a blank screen. The client gets a
   * plain explanation, a way back to Home and a Try again, and the rest of the portal works.
   */
  function crash(main, r, e) {
    if (root.console) console.error('[portal] page failed', r.name, e);
    countError();
    app.page = {};
    main.innerHTML = `<div class="page page-crash">${UI.PageHeader({ title: 'This page did not open', intro: 'Something went wrong on our side. Nothing is lost, and the rest of your portal works.' })}
      <div class="crash-actions"><a class="btn btn-solid" href="#/home">Go to your Home page</a><button class="btn btn-glass" type="button" data-action="rerender">${icon('refresh')}Try again</button></div></div>`;
  }

  /** @param {boolean} first */
  function render(first) {
    if (!app.ready) return;
    const r = parse();
    if (menuOpen()) toggleMenu(false);
    hideTip();
    if (!app.session && r.name !== 'sign-in') {
      D8.ui.replaceHash('#/sign-in');
      r.name = 'sign-in';
    } else if (app.session && r.name === 'sign-in') {
      D8.ui.replaceHash('#/home');
      r.name = 'home';
      r.sub = null;
    }
    const page = D8.pages[r.name] || D8.pages.notFound;
    $('#app').classList.toggle('is-auth', !!page.standalone);
    const main = $('#main');
    const ctx = context();
    try {
      main.innerHTML = page.render(ctx, r);
      document.title = page.title(ctx, r) + ' · Domin8te portal';
      // An address with no page of its own shows Page not found and is marked as that page, so a
      // design styles it the way it styles not found (18H gives it Home's sky and its light words).
      markCurrent(D8.pages[r.name] ? r.name : 'notFound');
      app.page = (page.mount && page.mount(ctx, r, main)) || {};
    } catch (e) {
      document.title = 'Something went wrong · Domin8te portal';
      crash(main, r, e);
    }
    if (!first) {
      root.scrollTo(0, 0);
      const t = $('#page-title');
      if (t && !r.sub) t.focus({ preventScroll: true });
    }
  }

  function onHash() {
    const h = currentHash();
    if (h && !h.startsWith('#/')) {
      // An in-page anchor such as the skip link: focus it and keep the current route.
      const t = document.getElementById(decodeURIComponent(h.slice(1)));
      D8.ui.replaceHash(app.lastRoute);
      if (t) { if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1'); t.focus(); }
      return;
    }
    app.lastRoute = h || '#/home';
    if (!app.ready) { app.wanted = app.lastRoute; return; }
    render(false);
  }

  /* ---- actions ----------------------------------------------------------------------------- */

  function doRefresh(btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Checking';
    app.client.refresh()
      .then(() => refreshAccount())
      .then((a) => {
        if (app.page && app.page.refresh) app.page.refresh();
        D8.dialogs.toast(`All up to date. Checked for new numbers ${a.updatedAt ? F.when(a.updatedAt, app.client.now()) : 'just now'}.`);
      })
      .catch(() => D8.dialogs.toast("We couldn't check for new numbers. What you see was right at the time shown.", { tone: 'error' }))
      .then(() => {
        if (!document.contains(btn)) return;
        btn.disabled = false;
        btn.innerHTML = `${icon('refresh')}Check for new numbers`;
      });
  }

  /**
   * Preview mode: switch the demo situation in place and stay on the same page. The address
   * is updated when the browser allows it; the switch works either way.
   */
  function switchScenario(id) {
    let s;
    try { s = D8.data.switchScenario(id); } catch (e) { D8.dialogs.toast("That demo situation isn't available.", { tone: 'error' }); return; }
    const route = currentHash().startsWith('#/') && !currentHash().startsWith('#/sign-in') ? currentHash() : '#/home';
    const q = new URLSearchParams(root.location.search);
    q.set('demo', s.id);
    D8.ui.replaceHash('?' + q.toString() + route);
    start(route).then(() => D8.dialogs.toast(`Preview: ${s.label}.`));
  }

  function signOut(trigger) {
    if (menuOpen()) toggleMenu(false);
    D8.dialogs.confirm({ title: 'Sign out?', text: `You can sign back in any time with ${D8.auth && D8.auth.live ? 'a code' : 'a link'} we email you.`, yes: 'Sign out', no: 'Stay signed in' }, trigger)
      .then((yes) => {
        if (!yes) return;
        D8.auth.signOut().then(() => {
          app.session = null;
          app.client = null;
          app.account = null;
          // Signed out is a known state, even from the screen shown when the account failed to load.
          app.wanted = null;
          app.ready = true;
          root.location.hash = '#/sign-in';
        });
      });
  }

  /** Opens or closes the extra detail on an attention card. */
  function toggleMore(card, force) {
    const btn = card.querySelector('.act-toggle');
    const more = btn && document.getElementById(btn.getAttribute('aria-controls') || '');
    if (!btn || !more) return;
    const open = force !== undefined ? force : btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    more.hidden = !open;
    card.classList.toggle('is-open', open);
    const label = btn.firstChild;
    if (label && label.nodeType === 3) label.textContent = open ? 'Hide details' : 'See details';
  }

  function onClick(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    if (menuOpen() && !target.closest('.account')) toggleMenu(false);
    const t = /** @type {HTMLElement|null} */ (target.closest('[data-action]'));
    if (!t) {
      // The whole attention card opens its details, except its buttons, links and text selection.
      const card = target.closest('.act-card');
      const selecting = root.getSelection && String(root.getSelection()).length > 0;
      if (card && !target.closest('a, button, input, textarea, select, .act-more') && !selecting) toggleMore(card);
      return;
    }
    const act = t.getAttribute('data-action');
    const ctx = context();
    if (act === 'approve') D8.dialogs.approval(t.dataset.id, t, ctx);
    else if (act === 'external') D8.dialogs.external(t.dataset.kind, t.dataset.id, t, ctx);
    else if (act === 'account') D8.dialogs.account(t.dataset.source || '', t.dataset.mode || 'connect', t, ctx);
    else if (act === 'compose') D8.dialogs.compose({ mode: t.dataset.mode, service: t.dataset.service }, t, ctx);
    else if (act === 'refresh') doRefresh(t);
    else if (act === 'retry') { if (app.page && app.page.retry) app.page.retry(t.dataset.section); }
    else if (act === 'toggle-more') { const card = t.closest('.act-card'); if (card) toggleMore(card); }
    else if (act === 'toggle-side') {
      if (V.lockSide) return;
      chosenSide = chosenSide === 'rail' ? 'full' : 'rail';
      pref(PREF.side, chosenSide);
      syncSide();
    } else if (act === 'account-menu') toggleMenu();
    else if (act === 'demo') { if (menuOpen()) toggleMenu(false); if (app.account) D8.dialogs.demo(t, ctx); }
    else if (act === 'sign-out') signOut(t);
    else if (act === 'demo-sign-in') D8.auth.demoSignIn().then(() => start('#/home'));
    else if (act === 'rerender') render(false);
  }

  function onChange(e) {
    const t = /** @type {HTMLInputElement} */ (e.target);
    const name = t.getAttribute && t.getAttribute('data-change');
    if (!name) return;
    if (name === 'theme') {
      applyTheme(t.value);
      pref(PREF.theme, t.value);
      saveLook({ theme: t.value });
      D8.dialogs.toast(t.value === 'dark' ? 'Dark theme on.' : 'Light theme on.');
      return;
    }
    if (app.page && app.page.change) app.page.change(name, t.value);
  }

  function onKey(e) {
    if (e.key === 'Escape' && menuOpen()) {
      toggleMenu(false);
      $('#account-btn').focus();
      return;
    }
    // Alt + Shift + P opens Preview mode (demo data only), from any page.
    if (e.altKey && e.shiftKey && (e.code === 'KeyP' || String(e.key).toLowerCase() === 'p') && D8.data.MODE === 'demo' && app.account) {
      e.preventDefault();
      const dlg = /** @type {HTMLDialogElement} */ ($('#dlg'));
      if (!dlg.open) D8.dialogs.demo(/** @type {HTMLElement} */ (document.activeElement), context());
    }
  }

  /* ---- start -------------------------------------------------------------------------------- */

  function fatal(e) {
    $('#app').classList.add('is-auth');
    const notFound = e && e.code === 'tenant-not-found';
    $('#main').innerHTML = `<div class="signin"><div class="signin-card"><h1 id="page-title" tabindex="-1">We couldn't open your portal</h1>${UI.ErrorState({
      title: notFound ? "We don't have a portal for this email yet." : 'Something went wrong while loading your account.',
      text: notFound ? 'Only people we have added can open a portal. If you think you should have one, email us.' : 'Try again soon. Nothing is lost.'
    })}<button class="btn btn-glass" type="button" data-action="sign-out">Sign out</button></div></div>`;
  }

  /** @param {string} [target] a route to open once signed in */
  function start(target) {
    app.ready = false;
    return D8.auth.getSession().then((s) => {
      app.session = s;
      if (!s) {
        app.client = null;
        app.account = null;
        if (!(root.location.hash || '').startsWith('#/sign-in')) D8.ui.replaceHash('#/sign-in');
        app.wanted = null;
        app.ready = true;
        render(true);
        return;
      }
      app.client = D8.data.connect(s);
      // The final direction (D8VARIANT.home) shows the page's shape while the account loads,
      // instead of an empty column.
      if (V.home && !$('#main').children.length) $('#main').innerHTML = `<div class="page page-booting">${UI.Skeleton('strip', 4)}${UI.Skeleton('row', 3)}</div>`;
      return app.client.getAccount().then((a) => {
        app.account = a;
        syncLook(a.appearance);
        drawShell();
        // A page chosen while the account loaded wins over the one start() was asked to open.
        const next = app.wanted || target;
        app.wanted = null;
        if (next) D8.ui.replaceHash(next);
        app.lastRoute = root.location.hash || '#/home';
        app.ready = true;
        render(!next);
      }).catch(fatal);
    }).catch(fatal);
  }

  function boot() {
    applyTheme(query.get('theme') || pref(PREF.theme) || 'light');
    chosenSide = V.lockSide && V.side ? V.side : (query.get('side') || pref(PREF.side) || V.side) === 'rail' ? 'rail' : 'full';
    syncSide();
    if (tablet) tablet.addEventListener('change', syncSide);
    D8.dialogs.wire();
    wireRail();
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    root.addEventListener('hashchange', onHash);
    // A sidebar page opens as the mouse button goes down rather than when it comes back up, and it
    // is drawn right there instead of after the browser's hashchange event (which arrives a frame
    // or more later): together about a tenth of a second sooner. The address and the Back button
    // behave as before (pushState, then the click lands on the same address and does nothing).
    // Keyboard, touch and modified clicks keep the browser's own behaviour.
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.pointerType !== 'mouse' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !app.ready) return;
      const a = e.target instanceof Element ? e.target.closest('.side a.nav-link[href^="#/"]') : null;
      const h = a && a.getAttribute('href');
      if (!h || h === root.location.hash) return;
      root.history.pushState(null, '', h);
      onHash();
    });
    // Development check used by the smoke test: count uncaught errors on the root element.
    root.addEventListener('error', countError);
    root.addEventListener('unhandledrejection', countError);
    start().then(() => setTimeout(() => document.documentElement.removeAttribute('data-booting'), 50));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
