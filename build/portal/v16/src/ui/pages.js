// @ts-check
/*
 * The portal's pages. Each page renders its frame at once (with loading placeholders), then
 * fills each section from the data layer on its own, so one failing source never blanks
 * the page. A page is { title, render(ctx, route), mount(ctx, route, el) }; mount returns
 * { retry(section), change(name, value) } for the app's event handlers.
 */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});
  const F = D8.fmt;
  const UI = D8.ui;
  const esc = F.esc;
  const icon = UI.icon;
  const SVC = () => D8.data.SERVICES;
  // Design variants can ask for a Home order, a Coming up section and a Basic / Advanced switch
  // on Results (D8VARIANT.home, .reportModes). Without them, every page renders as in 16.
  /** @type {any} */
  const V = root.D8VARIANT || {};
  const HOME = V.home || {};
  /** A display preference kept in this browser, under the design's own name. */
  function pref(key, value) {
    const k = (V.storage || 'd8.v16') + '.' + key;
    try {
      if (value === undefined) return root.localStorage.getItem(k);
      root.localStorage.setItem(k, value);
    } catch (e) { /* storage blocked: the default applies */ }
    return null;
  }

  /** How long a section may take before the client is told, instead of watching a placeholder. */
  const SLOW_MS = 10000;
  let loadSeq = 0;

  /**
   * Fills one section from the data layer, and never leaves it loading for ever.
   * - First load: a shimmering placeholder, then the content, or a specific error with Try again.
   * - Later loads (Refresh, Try again, after an approval): what is on screen stays, dimmed, until
   *   the new answer arrives. If that fails, the old content stays with a note saying so.
   * - After SLOW_MS the client is told it is taking too long, with Try again. If the answer
   *   still arrives, it replaces the message.
   * - Only the newest load for a section may draw, so a slow old answer never overwrites a new one.
   * @param {ParentNode} scope @param {string} sel @param {() => Promise<any>} fetch
   * @param {(d: any) => string} draw @param {(e: any) => any} onError
   */
  function section(scope, sel, fetch, draw, onError) {
    const box = /** @type {HTMLElement|null} */ (scope.querySelector(sel));
    if (!box) return Promise.resolve(null);
    const token = String(++loadSeq);
    const had = box.hasAttribute('data-loaded');
    box.setAttribute('data-load', token);
    box.setAttribute('aria-busy', 'true');
    box.classList.toggle('is-refreshing', had);
    const current = () => box.getAttribute('data-load') === token && document.contains(box);
    const settle = () => { box.removeAttribute('aria-busy'); box.classList.remove('is-refreshing'); };
    const info = (e) => { try { return onError(e) || {}; } catch (x) { return {}; } };
    const timer = setTimeout(() => {
      if (!current() || !box.hasAttribute('aria-busy')) return;
      settle();
      const i = info({ code: 'timeout' });
      if (had) staleNote(box, 'This is slow right now. You are seeing the last numbers we had.', i.retry);
      else box.innerHTML = UI.ErrorState({ icon: 'clock', title: 'This is taking a while.', text: 'Your internet may be slow, or one of your accounts is not answering. The rest of the page works. Try again in a minute.', retry: i.retry });
    }, SLOW_MS);
    let result;
    try {
      result = Promise.resolve(fetch());
    } catch (e) {
      result = Promise.reject(e);
    }
    return result
      .then((d) => {
        clearTimeout(timer);
        if (!current()) return null;
        box.innerHTML = draw(d);
        box.setAttribute('data-loaded', '');
        settle();
        return d;
      })
      .catch((e) => {
        clearTimeout(timer);
        if (!current()) return null;
        if (root.console) console.warn('[portal] section failed', sel, e);
        settle();
        const i = info(e);
        if (had) staleNote(box, "We couldn't update this. You are seeing the last numbers we had.", i.retry);
        else box.innerHTML = UI.ErrorState(i);
        return null;
      });
  }
  /** A small note above content that could not be refreshed: the old figures stay readable. */
  function staleNote(box, text, retry) {
    const old = box.querySelector(':scope > .stale-note');
    if (old) old.remove();
    box.insertAdjacentHTML('afterbegin', `<p class="stale-note" role="status">${icon('clock')}<span>${esc(text)}</span>${retry ? `<button class="btn-text" type="button" data-action="retry" data-section="${esc(retry)}">${icon('refresh')}Try again</button>` : ''}</p>`);
  }
  const markSrc = () => { const m = document.getElementById('brand-mark'); return m ? m.getAttribute('src') || '' : ''; };
  const refreshButton = () => `<button class="btn btn-glass btn-sm" type="button" data-action="refresh" title="Usually updates on its own every few hours.">${icon('refresh')}Refresh numbers</button>`;
  const day = UI.day;
  const span = UI.span;
  const label = UI.metricLabel;
  const replyLine = UI.replyLine;
  const setText = (scope, sel, text) => { const el = scope.querySelector(sel); if (el) el.textContent = text; };

  /**
   * A link that lands on one thing (a service on Work, the connected accounts in Settings) rings it for a moment, so the
   * eye finds it (2026-10-16, the same as the console). @param {HTMLElement} t
   */
  /**
   * Glides the page so `el` sits in view: eased in and out, about half a second to a second by distance (2026-10-16, Karan: "scroll
   * smooth rather than snapping"). Short targets end up in the middle, tall ones near the top. Scrolling by hand stops it.
   * A page that gets no animation frames (a tab in the background) still lands, a moment later. Calls done() on arrival.
   * @param {HTMLElement} el @param {() => void} done
   */
  function glideTo(el, done) {
    const se = document.scrollingElement || document.documentElement;
    const r = el.getBoundingClientRect();
    const gap = r.height < innerHeight * 0.7 ? (innerHeight - r.height) / 2 : 140;
    const max = Math.max(0, se.scrollHeight - innerHeight);
    const to = Math.round(Math.min(max, Math.max(0, window.scrollY + r.top - gap)));
    const from = window.scrollY;
    const dist = to - from;
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || Math.abs(dist) < 4) { window.scrollTo(0, to); done(); return; }
    const dur = Math.min(1100, Math.max(520, Math.abs(dist) * 0.5));
    // ease in and out: a soft start and a soft stop, so the eye can follow where it is going
    const ease = (/** @type {number} */ t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const t0 = performance.now();
    let over = false;
    const stop = () => { over = true; off(); };
    const finish = (/** @type {boolean} */ land) => { if (over) return; over = true; off(); if (land) window.scrollTo(0, to); done(); };
    const byHand = () => { if (!over) { stop(); done(); } };
    const off = () => { window.removeEventListener('wheel', byHand); window.removeEventListener('touchstart', byHand); window.removeEventListener('keydown', byHand); };
    window.addEventListener('wheel', byHand, { passive: true });
    window.addEventListener('touchstart', byHand, { passive: true });
    window.addEventListener('keydown', byHand);
    // ~60 steps a second on a timer, not animation frames: a frame-starved page (a background pane) still glides
    const step = () => {
      if (over) return;
      const t = Math.min(1, (performance.now() - t0) / dur);
      window.scrollTo(0, from + dist * ease(t));
      if (t < 1) setTimeout(step, 16); else finish(true);
    };
    step();
    setTimeout(() => finish(true), dur + 600);
  }
  const ringTimers = new WeakMap();
  /** Glides to the thing a link landed on, focuses it and marks it once it is in view. @param {HTMLElement} t */
  function ring(t) {
    glideTo(t, () => {
      t.focus({ preventScroll: true });
      clearTimeout(ringTimers.get(t));
      t.classList.remove('jump-hit');
      void t.offsetWidth;
      t.classList.add('jump-hit');
      ringTimers.set(t, setTimeout(() => t.classList.remove('jump-hit'), 3600));
    });
  }

  /* ================================================================ HOME */

  /* Home, as simple as it can be (2026-10-09 complexity review): the greeting and one sentence, what is
     waiting for the client, three numbers from the last 30 days, one row per service, and how to reach us.
     The biggest change moved into the Results summary, the latest update lives under Work > Done, the plan
     on Billing and the connected accounts in Settings. */

  /**
   * The line under the greeting (2026-10-21, items 23 and 30): when the page was last updated, that Karan checked it (a person,
   * not a bot: the thing that sets Domin8te apart, so it is seen without scrolling) and the next check-in with him.
   * @param {any} a the account @param {number} now
   */
  function trustLine(a, now) {
    const upd = a.updatedAt ? `Last updated ${F.when(a.updatedAt, now)}.` : '';
    const chk = a.checkedBy && a.checkedBy.at ? `<span class="checked-by">${icon('check')}Checked by ${esc(a.checkedBy.name || 'Karan')}, ${esc(day(a.checkedBy.at))}</span>` : '';
    const meet = a.checkin ? `<span class="home-checkin">${icon('calendar')}Next check-in with Karan: ${esc(day(a.checkin))}</span>` : '';
    return `<p class="home-trust" id="home-trust">${upd ? `<span>${esc(upd)}</span>` : ''}${chk}${meet}</p>`;
  }

  /** The words for a number in Today's panel, by what it counts: customers or dollars, never a percentage. */
  const TODAY_WORDS = {
    customers: ['new customer', 'new customers'],
    bookings: ['new customer booked from your website', 'new customers booked from your website'], orders: ['order from your website', 'orders from your website'],
    sales: ['in sales', 'in sales'], leads: ['new lead', 'new leads'], calls: ['call from Google', 'calls from Google'], adSpend: ['ad spend', 'ad spend']
  };
  /** @param {any} t a tile */
  const todayFig = (t) => (t.unit === 'dollars' ? '$' + F.num(t.value) : F.num(t.value));
  /** @param {any} t @param {number} v */
  const todayWord = (t, v) => { const w = t.words || /** @type {any} */ (TODAY_WORDS)[t.id]; return w ? F.plural(v, w[0], w[1]) : String(t.label || '').toLowerCase(); };
  /** "7 yesterday" (or "$21 yesterday"): small grey text, never counted as one of Home's numbers. @param {any} t */
  const todayWas = (t) => (t.yesterday === null || t.yesterday === undefined ? '' : `${t.unit === 'dollars' ? '$' + F.num(t.yesterday) : F.num(t.yesterday)} yesterday`);
  /** Where a number comes from, and its day. @param {any} t */
  const todaySrc = (t) => `From ${t.source}${t.sourceDay ? `, ${day(t.sourceDay)}` : ''}`;

  /**
   * "Today at <restaurant>" (items 24 and 26), pinned under the greeting: the money number big, then new leads and ad spend, each
   * against yesterday in small grey words, and one line on what changed. Only numbers whose source is connected; never an estimate,
   * never a zero for missing data. Until today's numbers are built it says "Updating today's numbers" with today's date.
   * @param {any} p from getToday() @param {string} name the restaurant
   */
  function todayPanel(p, name) {
    const head = `<div class="tp-head"><h2 id="h-today">Today at ${esc(name)}</h2><p class="tp-date">${esc(F.date(p.day))}</p>${UI.SampleChip()}</div>`;
    if (p.state === 'updating') return `${head}<p class="tp-updating">${icon('refresh')}<span>Updating today's numbers. They show here once they are checked.</span></p>`;
    const [big, ...rest] = p.tiles || [];
    const bigHtml = big ? `<div class="tp-big"><p class="tp-big-fig"><span class="fig">${esc(todayFig(big))}</span> <span class="tp-big-words">${esc(todayWord(big, big.value))}</span></p>
      <p class="tp-meta">${todayWas(big) ? `<span class="tp-was">${esc(todayWas(big))}</span>` : ''}<span class="tp-src">${esc(todaySrc(big))}</span></p></div>` : '';
    const tiles = rest.length ? `<ul class="tp-tiles">${rest.map((t) => `<li class="tp-tile">
        <p class="tp-fig"><span class="fig">${esc(todayFig(t))}</span> <span class="tp-word">${esc(todayWord(t, t.value))}</span></p>
        ${t.about ? `<p class="tp-about">${esc(t.about)}</p>` : ''}
        <p class="tp-meta">${todayWas(t) ? `<span class="tp-was">${esc(todayWas(t))}</span>` : ''}<span class="tp-src">${esc(todaySrc(t))}</span></p>
      </li>`).join('')}</ul>` : '';
    const changed = p.changed ? `<p class="tp-changed"><strong>What changed:</strong> ${esc(p.changed)}</p>` : '';
    return `${head}${bigHtml}${tiles}${changed}`;
  }

  /**
   * The prospect's way in (items 1 and 29), at the bottom of the demo's Home only: what most agencies send against this, then
   * one button to Karan. No price, ever. Never in a client's portal.
   */
  function prospectBlock() {
    if (D8.data.MODE !== 'demo' || D8.data.viewAs) return '';
    const page = '<span class="pdf-page"><span class="pdf-tag">PDF</span><span class="pdf-line"></span><span class="pdf-line is-short"></span><span class="pdf-line"></span><span class="pdf-line is-short"></span></span>';
    return `<section class="card prospect" aria-labelledby="h-prospect">
      <div class="pros-compare" aria-hidden="true">
        <figure class="pros-side is-pdf"><div class="pdf-stack">${page}${page}${page}</div><figcaption>What most agencies send</figcaption></figure>
        <figure class="pros-side is-dash"><div class="mini-dash"><span class="md-row"><svg class="md-spark" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M2,28 L18,24 L34,26 L50,17 L66,19 L82,11 L98,13 L118,5"/></svg><span class="md-src">From your booking system, today</span></span><span class="md-approve">${icon('check')}Approve</span></div><figcaption>What you get: approve in one tap, every number with its source.</figcaption></figure>
      </div>
      <p class="sr-only">Most agencies send a pile of PDF reports. Here you approve in one tap, and every number shows its source.</p>
      ${ctaBlock('h-prospect')}
    </section>`;
  }
  /** The one call to action for a prospect (demo only). Links to Karan's contact form on the website. @param {string} id heading id */
  const CTA_HREF = '/#contact';
  function ctaBlock(id) {
    return `<div class="pros-cta"><div><h2 id="${esc(id)}" class="pros-h">Want this for your restaurant?</h2><p class="pros-why">I only take 3 restaurants at a time.</p></div>
      <a class="btn btn-primary" href="${CTA_HREF}" target="_top">${icon('message')}Message Karan</a></div>`;
  }
  D8.prospect = { ctaBlock, CTA_HREF };

  /**
   * The one-time welcome on a client's first sign-in (item 32): their first finished piece of work and one button to see it.
   * Shown once, then Home as usual. @param {any} w @param {any} a the account
   */
  function welcomeScreen(w, a) {
    return `<div class="page page-welcome">
      <section class="card welcome-card" aria-labelledby="page-title">
        <p class="eyebrow">Welcome to your dashboard, ${esc(a.user.firstName)}</p>
        <h1 id="page-title" tabindex="-1">${esc(w.title)}</h1>
        <p class="lede">${esc(w.text)}</p>
        <a class="btn btn-primary" href="${esc(w.href || '#/home')}" data-welcome-go>${esc(w.button || 'See it')}${icon('arrow-right')}</a>
        ${D8.data.MODE === 'demo' ? `<p class="meta">${UI.SampleChip()}</p>` : ''}
      </section>
    </div>`;
  }
  let welcomeShown = false;

  /** "Next planned" and "Latest win", as a quiet line under the calm banner. @param {any} h */
  function calmFacts(h) {
    if (!h || (!h.next && !h.win)) return '';
    const svcName = (/** @type {string} */ id) => (SVC()[id] ? SVC()[id].label : '');
    const bits = [];
    if (h.next) bits.push(`<span><strong>Next planned:</strong> ${esc(h.next.title)}, ${esc(F.date(h.next.date))}${svcName(h.next.service) ? ` (${esc(svcName(h.next.service))})` : ''}</span>`);
    if (h.win) bits.push(`<span><strong>Latest win:</strong> ${esc(h.win.text)}, ${esc(day(h.win.date))}${svcName(h.win.service) ? ` (${esc(svcName(h.win.service))})` : ''}</span>`);
    return `<p class="pb-facts">${bits.join('')}</p>`;
  }

  /* Home, narrowed (2026-10-16, Karan: "the first screen must feel light, not like work"). By default it shows three
     things only: what is waiting for the client (approve on the card, or ask for changes), this week against last week
     in plain words with up to three numbers, and one next step. The plan, the 30-day numbers and the meeting strip fold
     under "More about your plan" and load only when it is opened. */

  /** The short word for a number on Home's "This week" ([one, many]); anything else uses its own unit. */
  const WEEK_WORD = {
    calls: ['call', 'calls'], directions: ['direction request', 'directions'], bookings: ['booking', 'bookings'], orders: ['order', 'orders'],
    visits: ['website visit', 'website visits'], facebookViews: ['Facebook view', 'Facebook views'], instagramViews: ['Instagram view', 'Instagram views'],
    adClicks: ['ad click', 'ad clicks'], profileViews: ['Google profile view', 'Google profile views'], leads: ['lead from ads', 'leads from ads']
  };
  /** @param {any} n one weekly number @param {number} v */
  const weekWord = (n, v) => { const w = /** @type {any} */ (WEEK_WORD)[n.id]; return w ? F.plural(v, w[0], w[1]) : String(n.unit || ''); };
  const hasNum = (/** @type {any} */ v) => v !== null && v !== undefined;

  /**
   * "Last week" (item 8, 2026-10-21): what we did, then the single biggest result, in customers or dollars, never a percentage.
   * What we did comes from the updates of the last 7 days; the result is what staff recorded, else the number that grew the most.
   * @param {any} wk the weekly numbers (or null) @param {any[]} ups the updates @param {any} win staff's biggest result (or null) @param {number} now
   */
  function weekBlock(wk, ups, win, now) {
    const today = D8.time.dayNum(now);
    const did = (ups || []).filter((/** @type {any} */ u) => u.author !== 'automatic' && today - D8.time.dayNum(u.date) <= 7 && today >= D8.time.dayNum(u.date)).slice(0, 3);
    /** @type {string} */ let result = '';
    if (win && win.text) result = win.text;
    else if (wk && wk.numbers && wk.numbers.length) {
      const grown = wk.numbers.filter((/** @type {any} */ n) => hasNum(n.before) && n.now > n.before).sort((/** @type {any} */ a, /** @type {any} */ b) => (b.now - b.before) - (a.now - a.before))[0];
      const top = grown || wk.numbers[0];
      result = grown ? `${F.num(top.now - top.before)} more ${weekWord(top, top.now - top.before)} than the week before.` : `${F.num(top.now)} ${weekWord(top, top.now)} last week.`;
    }
    if (!did.length && !result) {
      return UI.EmptyState({ icon: 'results', title: 'Nothing to report from last week yet.', text: 'What we did and the biggest result show here every week.' });
    }
    return `<div class="card week-card"${wk && wk.id ? ` data-week="${esc(wk.id)}"` : ''}>
      ${did.length ? `<p class="week-did-h">What we did</p><ul class="week-did">${did.map((/** @type {any} */ u) => `<li>${icon('check')}<span>${esc(u.title)}</span></li>`).join('')}</ul>` : ''}
      ${result ? `<p class="week-win"><strong>Biggest result:</strong> ${esc(result)}</p>` : ''}
      <p class="meta week-meta">${UI.SampleChip()}<a class="link" href="#/results">See all results</a></p>
    </div>`;
  }

  /** "Approved lately": what they approved and where it stands, for a week. @param {any[]} list @param {Date} now */
  function doneBlock(list, now) {
    if (!list || !list.length) return '';
    return `<ul class="done-list">${list.map((/** @type {any} */ x) => `<li class="done-item is-${x.stage === 'done' ? 'done' : 'doing'}">
      <span class="done-icon">${icon(x.stage === 'done' ? 'check' : 'progress')}</span>
      <div class="done-main"><p class="done-title">${esc(x.title.replace(/^(approve|confirm|review)\s*:?\s+/i, ''))}</p><p class="done-text">${esc(x.text)}</p></div>
      <span class="meta done-when">${esc(F.when(x.at, now))}</span></li>`).join('')}</ul>`;
  }

  /** The Undo window after Approve on a card, before the answer is saved. */
  const HOLD_MS = 8000;

  const home = {
    title: () => 'Home',
    /* Home, shrunk (2026-10-21, Karan: "a client feels the value in under 10 seconds"): the greeting and one line that says it was
       checked by Karan, Today's numbers pinned at the top, what is waiting (Approve first, solid orange), last week, and in the
       demo only the way to get one. No more than five numbers on the page. #/home?approval=<id> opens that approval (email links). */
    render(ctx, r) {
      const now = ctx.client.now();
      const a = ctx.account;
      if (a.welcome && !welcomeShown && !D8.data.viewAs) return welcomeScreen(a.welcome, a);
      return `<div class="page page-home is-narrow">
        <header class="page-head is-home"><div class="page-head-text"><h1 id="page-title" tabindex="-1">${esc(F.greeting(now))}, ${esc(a.user.firstName)}.</h1>${trustLine(a, now)}</div></header>
        <p class="sr-only" id="home-summary" role="status">Checking your account.</p>
        <section class="card today-panel" id="home-today" aria-labelledby="h-today">${UI.Skeleton('card', 1)}</section>
        <p class="sr-only" id="home-live" role="status" aria-live="polite"></p>
        <section class="sec sec-attention" aria-labelledby="h-attention">
          ${UI.SectionHead('h-attention', 'Waiting for you', '<p class="sec-meta wed-line">If something waits past Wednesday, Karan will check in.</p>')}
          <div id="home-attention">${UI.Skeleton('row', 2)}</div>
        </section>
        <section class="sec sec-done" aria-labelledby="h-done" hidden>
          ${UI.SectionHead('h-done', 'Approved lately')}
          <div id="home-done"></div>
        </section>
        <section class="sec sec-week" aria-labelledby="h-week">
          ${UI.SectionHead('h-week', 'Last week')}
          <div id="home-week">${UI.Skeleton('card', 1)}</div>
        </section>
        ${prospectBlock()}
      </div>`;
    },
    mount(ctx, r, el) {
      const now = () => ctx.client.now();
      // The welcome (item 32): shown once, then never again. Its button leads to the work itself.
      if (el.querySelector('.page-welcome')) {
        welcomeShown = true;
        ctx.client.markWelcomeSeen();
        return {};
      }
      /** @type {number|null} */ let count = null;
      /** What staff wrote for one part of Home, when they made it visible. @param {string} k */
      const staffSection = (k) => (ctx.account.homeSections || []).find((/** @type {any} */ s) => s.section === k) || null;
      /** What still waits: an answer in its Undo window no longer counts. */
      const waitingNow = () => Math.max((count || 0) - held.size, 0);
      // Said to screen readers only: the cards themselves show what waits, and Home keeps to five numbers.
      const summary = () => {
        if (count === null) return;
        const n = waitingNow();
        setText(el, '#home-summary', count < 0 ? 'We could not check what is waiting for you just now.' : n ? `${n} ${F.plural(n, 'thing needs', 'things need')} you.` : 'Nothing needs you right now.');
      };
      const live = (/** @type {string} */ t) => setText(el, '#home-live', t);
      /** An email's link to one approval (#/home?approval=<id>) opens it once the cards are there. */
      let wantApproval = r && r.params && r.params.approval ? String(r.params.approval) : '';
      /** @type {Record<string, () => any>} */
      const loaders = {
        today: () => section(el, '#home-today', () => ctx.client.getToday(), (p) => {
          const box = /** @type {HTMLElement|null} */ (el.querySelector('#home-today'));
          if (box) box.hidden = !p || p.state === 'none';
          return p && p.state !== 'none' ? todayPanel(p, ctx.account.business.name) : '';
        }, () => ({ title: "We couldn't load today's numbers.", text: 'The rest of this page works.', retry: 'today' })),
        attention: () => section(el, '#home-attention', () => Promise.all([ctx.client.getAttention(), ctx.client.getPlan().catch(() => null)])
          .then(([items, plan]) => (items.length ? { items, plan, highlights: null } : ctx.client.getHighlights().catch(() => null).then((h) => ({ items, plan, highlights: h })))), (d) => {
          count = d.items.length;
          summary();
          ctx.setBadges(d.items);
          const ok = d.plan && d.plan.state === 'ok';
          const sec = el.querySelector('.sec-attention');
          if (sec) sec.classList.toggle('is-calm', !count && !!ok);
          if (wantApproval && d.items.some((/** @type {any} */ x) => x.approvalId === wantApproval)) {
            const id = wantApproval;
            wantApproval = '';
            setTimeout(() => { if (el.isConnected) D8.dialogs.approval(id, null, ctx, {}); }, 0);
          }
          if (count) return UI.ActionNeededList(d.items, now());
          return ok ? D8.plan.banner(d.plan, { staff: staffSection('nothing_to_do'), facts: calmFacts(d.highlights) }) : UI.CaughtUp(d.highlights);
        }, () => { count = -1; summary(); return { title: "We couldn't load what is waiting for you.", text: 'Nothing is lost. The rest of this page works.', retry: 'attention' }; }),
        // Shown only when something was approved or finished this week; otherwise the section stays hidden.
        done: () => section(el, '#home-done', () => ctx.client.getRecentDone(), (list) => {
          const sec = /** @type {HTMLElement|null} */ (el.querySelector('.sec-done'));
          if (sec) sec.hidden = !list || !list.length;
          return doneBlock(list, now());
        }, () => { const sec = /** @type {HTMLElement|null} */ (el.querySelector('.sec-done')); if (sec) sec.hidden = true; return { title: '', text: '' }; }),
        // Shown is seen: the first time a summary is drawn, the server learns the client opened it (live only).
        week: () => section(el, '#home-week', () => Promise.all([ctx.client.getWeekly(), ctx.client.getUpdates().catch(() => []), ctx.client.getWeekWin().catch(() => null)]), ([wk, ups, win]) => {
          if (wk && wk.id) setTimeout(() => watchSeen(wk.id), 0);
          return weekBlock(wk, ups, win, now());
        },
          () => ({ title: "We couldn't load last week.", text: 'The rest of this page works.', retry: 'week' }))
      };
      /**
       * Opened means read: the summary counts as opened once at least half of it has been on screen for a second
       * (live only; the data layer never writes in the demo or view-as, and tells the server once).
       * @param {string} id
       */
      let seenWatch = /** @type {IntersectionObserver|null} */ (null);
      const watchSeen = (id) => {
        const card = el.querySelector('#home-week .week-card');
        if (!card || !ctx.client.markWeeklySeen) return;
        if (seenWatch) seenWatch.disconnect();
        if (typeof IntersectionObserver !== 'function') return;
        /** @type {any} */ let t = null;
        seenWatch = new IntersectionObserver((list) => {
          const on = list.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5);
          clearTimeout(t);
          if (on) t = setTimeout(() => { if (seenWatch) seenWatch.disconnect(); ctx.client.markWeeklySeen(id).catch(() => {}); }, 1000);
        }, { threshold: [0, 0.5, 1] });
        seenWatch.observe(card);
      };
      loaders.today();
      loaders.attention();
      loaders.done();
      loaders.week();

      /* ---- approve on the card: Approve, a short Undo window, then saved ---------------------------------------- */
      /** @type {Map<string, {timer: any, li: HTMLElement, html: string, title: string, at: number}>} */
      const held = new Map();
      const cardFor = (/** @type {string} */ id) => /** @type {HTMLElement|null} */ ([...el.querySelectorAll('.act-card[data-approval]')].find((c) => c.getAttribute('data-approval') === id) || null);
      /** @param {HTMLElement} li @param {string} title @param {string} text @param {string} btn */
      const cardState = (li, title, text, btn) => {
        li.innerHTML = `<span class="act-icon">${icon('check')}</span><div class="act-main"><h3 class="act-title">${esc(title)}</h3><p class="act-detail">${esc(text)}</p></div>${btn ? `<div class="act-do">${btn}</div>` : ''}`;
      };
      /** @param {string} id */
      const restore = (id) => {
        const h = held.get(id);
        if (!h) return null;
        clearTimeout(h.timer);
        held.delete(id);
        h.li.classList.remove('is-held');
        h.li.innerHTML = h.html;
        return h;
      };
      /** The card's heading takes focus after each change, so focus never falls back to the top of the page. @param {HTMLElement} li */
      const focusCard = (li) => { const t = /** @type {HTMLElement|null} */ (li.querySelector('.act-title')); if (t && li.isConnected) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } };
      /** Saves one held answer. Resolves when it is saved or put back. @param {string} id @returns {Promise<void>} */
      const commit = (id) => {
        const h = held.get(id);
        if (!h) return Promise.resolve();
        clearTimeout(h.timer);
        held.delete(id);
        cardState(h.li, `${h.title}: approved.`, 'Saving your answer.', '');
        const done = () => {
          h.li.classList.remove('is-held');
          h.li.classList.add('is-done');
          cardState(h.li, `${h.title}: approved.`, "Thanks. We'll take it from here.", '');
          focusCard(h.li);
          live(`${h.title}: approved and saved.`);
          if (count !== null && count > 0) { count -= 1; summary(); }
          ctx.client.getAttention().then((/** @type {any[]} */ items) => ctx.setBadges(items)).catch(() => {});
          // a moment later the card leaves Waiting for you and shows under Approved lately, with what happens next
          setTimeout(() => { if (el.isConnected && !held.size) { loaders.attention(); loaders.done(); } }, 2500);
        };
        return D8.dialogs.slow(ctx.client.decide(id, 'approved', ''), 'Home').then(done).catch((/** @type {any} */ err) => {
          if (err && err.code === 'already-decided') { done(); return; }
          h.li.classList.remove('is-held');
          h.li.innerHTML = h.html;
          focusCard(h.li);
          const msg = err && err.code === 'slow' ? err.message : `We couldn't save your answer, so nothing changed. ${(err && err.message) || ''} Try again.`;
          live(msg);
          D8.dialogs.toast(msg, { tone: 'error' });
        });
      };
      /** Saves every held answer now. @returns {Promise<any>} */
      const flush = () => Promise.all([...held.keys()].map(commit));
      // Leaving the tab or the app saves at once, while the page can still send (pagehide is often too late on phones).
      const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
      document.addEventListener('visibilitychange', onHidden);
      root.addEventListener('pagehide', flush);

      return {
        refresh() {
          const c = el.querySelector('#home-trust');
          if (c) c.outerHTML = trustLine(ctx.account, now());
          // an answer still in its Undo window is saved first, and the page reads again only after it is saved
          flush().then(() => {
            if (!el.isConnected) return;
            loaders.today();
            loaders.attention();
            loaders.done();
            loaders.week();
          });
        },
        /** @param {string} which */
        retry(which) {
          const f = loaders[which];
          if (!f) return;
          const box = /** @type {HTMLElement|null} */ (el.querySelector(/** @type {any} */ ({ today: '#home-today', attention: '#home-attention', week: '#home-week' })[which] || ''));
          // A section that never loaded goes back to its placeholder; one with content keeps it, dimmed.
          if (box && !box.hasAttribute('data-loaded')) box.innerHTML = UI.Skeleton(/** @type {any} */ ({ today: 'card', attention: 'row', week: 'card' })[which] || 'block', 1);
          f();
        },
        /** @param {string} act @param {HTMLElement} t */
        action(act, t) {
          const id = t.dataset.id || '';
          if (act === 'undo-approve') {
            const h0 = held.get(id);
            // a quick second tap on the same spot is not an Undo
            if (!h0 || Date.now() - h0.at < 600) return;
            const h = restore(id);
            if (!h) return;
            summary();
            focusCard(h.li);
            live(`${h.title}: not approved yet.`);
            return;
          }
          if (act !== 'quick-approve' || held.has(id)) return;
          if (D8.data.READ_ONLY || D8.data.viewAs) { D8.dialogs.toast(D8.data.DEMO_NOTE, { tone: 'error' }); return; }
          const li = cardFor(id);
          if (!li) return;
          // "Approve next week's posts" reads as "Next week's posts: approved."
          const raw = String((li.querySelector('.act-title') || {}).textContent || '').replace(/^(approve|confirm|review)\s+/i, '').trim();
          const title = raw ? raw[0].toUpperCase() + raw.slice(1) : 'This';
          held.set(id, { timer: setTimeout(() => commit(id), HOLD_MS), li, html: li.innerHTML, title, at: Date.now() });
          li.classList.add('is-held');
          cardState(li, `${title}: approved.`, `Saving in ${HOLD_MS / 1000} seconds. Changed your mind? Press Undo.`, `<button class="btn btn-glass" type="button" data-action="undo-approve" data-id="${esc(id)}">Undo<span class="sr-only">: ${esc(title)}</span></button>`);
          focusCard(li);
          live(`${title}: approved. Saving in ${HOLD_MS / 1000} seconds. The Undo button is on the card.`);
          summary();
        },
        /** Leaving Home saves any answer still in its Undo window. */
        leave() { flush(); root.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHidden); if (seenWatch) seenWatch.disconnect(); }
      };
    }
  };

  /* ================================================================ WORK */

  /* The Work page, made simple (2026-10-08, Karan: "make it as simple as possible so that even a five year old can
     read and interpret it"; 2026-10-09 complexity review). Two tabs: Now (each service, what we are doing right now
     and its steps) and Done (the updates, at #/updates). Each service shows one "Right now" sentence and one list
     of steps: the team's board cards for that service when it has any, otherwise the steps typed on the console's
     Work tab (and older finished lines). What is left first; the done steps fold away. What the client has to do
     lives once, under Waiting for you on Home; a service only points there. */
  const STEP = {
    you: ['Waiting for you', 'alert'],
    now: ['Doing now', 'progress'],
    later: ['Coming up', 'clock'],
    hold: ['On hold', 'pause'],
    done: ['Done', 'check']
  };
  const STEP_ORDER = { you: 0, now: 1, later: 2, hold: 3 };
  /** Every step for one service, from its cards, milestones and finished work, without repeats. @param {any} s */
  function steps(s) {
    /** @type {{title: string, kind: string, date?: string}[]} */
    const out = [];
    const seen = new Set();
    const add = (/** @type {string} */ title, /** @type {string} */ kind, /** @type {string|undefined} */ date) => {
      const key = String(title || '').trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ title, kind, date });
    };
    const CARD = { in_review: 'you', in_progress: 'now', todo: 'later', blocked: 'hold', done: 'done' };
    if (s.cards && s.cards.length) {
      for (const c of s.cards) add(c.title, /** @type {any} */ (CARD)[c.status] || 'later', c.status === 'done' ? String(c.updatedAt || '').slice(0, 10) : c.due);
    } else {
      for (const m of s.milestones || []) add(m.title, m.needs ? 'you' : m.state === 'done' ? 'done' : m.state === 'current' ? 'now' : 'later', m.date);
      for (const c of s.completed || []) add(c.text, 'done', c.date);
    }
    const open = out.filter((x) => x.kind !== 'done')
      .sort((a, b) => /** @type {any} */ (STEP_ORDER)[a.kind] - /** @type {any} */ (STEP_ORDER)[b.kind] || String(a.date || '9999').localeCompare(String(b.date || '9999')));
    const done = out.filter((x) => x.kind === 'done').sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return { open, done };
  }
  /** The steps: "N of M done", what is left, the last 3 done ones, and older ones behind "Show N more". One colour per row: the icon's. @param {any} s */
  function stepList(s) {
    const { open, done } = steps(s);
    const all = open.length + done.length;
    if (!all) return '';
    const row = (/** @type {any} */ x) => {
      const st = /** @type {any} */ (STEP)[x.kind];
      // The stage and its date on one line, as plain words: "Done, Fri 18 Sep", "Coming up, by Thu 1 Oct".
      const when = x.date ? (x.kind === 'done' ? day(x.date) : `by ${day(x.date)}`) : '';
      return `<li class="step is-${x.kind}"><span class="step-dot">${icon(st[1])}</span><p class="step-title">${esc(x.title)}</p><p class="step-tag">${st[0]}${when ? `, ${esc(when)}` : ''}</p></li>`;
    };
    return `<div class="steps-head"><h3>Steps</h3><p class="meta">${done.length} of ${all} done</p></div>
      ${open.length ? `<ol class="steps">${open.map(row).join('')}</ol>` : ''}
      ${done.length ? `<ol class="steps is-done">${done.slice(0, 3).map(row).join('')}</ol>` : ''}
      ${done.length > 3 ? `<details class="steps-earlier"><summary class="btn-text">Show ${done.length - 3} more done ${F.plural(done.length - 3, 'step', 'steps')}${icon('chevron-down')}</summary><ol class="steps">${done.slice(3).map(row).join('')}</ol></details>` : ''}`;
  }

  /**
   * "Right now" says what the status beside it is about (2026-10-21): a service waiting for the client names the thing that waits,
   * not the team's other work. @param {any} s @param {any[]} needs what waits for the client on this service
   */
  function nowLine(s, needs) {
    if (s.status === 'waiting') {
      const mine = s.next && s.next.who === 'client' && s.next.text ? s.next.text : '';
      const what = needs[0] ? needs[0].title : mine || ((s.cards || []).find((/** @type {any} */ c) => c.status === 'in_review') || {}).title;
      if (what) return `Waiting for you: ${F.lcFirst(String(what))}`;
    }
    return s.now || 'Getting started';
  }

  /** @param {any} s @param {any[]} actions @param {any} [m] the plan model */
  function serviceSection(s, actions, m) {
    const svc = SVC()[s.id];
    const needs = actions.filter((a) => a.service === s.id || (s.next && a.id === s.next.actionId));
    // One line that points to Home, where the button is; a service's own note (Social's "posts are paused")
    // and that line read as one, so the fix shows once.
    const wait = needs.length ? `<a class="link" href="#/home">${needs.length} ${F.plural(needs.length, 'thing', 'things')} waiting for you</a>` : '';
    const note = s.note
      ? `<p class="notice">${icon('info')}<span>${esc(s.note)}${wait ? ` ${wait}` : ''}</span></p>`
      : wait ? `<p class="svc-wait">${icon('alert')}<span>${wait}</span></p>` : '';
    return `<section class="card svc-section svc-simple" id="svc-${esc(s.id)}" tabindex="-1" aria-labelledby="h-svc-${esc(s.id)}">
      <header class="svc-head">
        <h2 id="h-svc-${esc(s.id)}">${icon(svc.icon)}${esc(svc.label)}</h2>${UI.StatusBadge(s.status)}
      </header>
      <p class="svc-now"><span class="svc-now-label">Right now:</span> ${esc(nowLine(s, needs))}</p>
      ${m && m.state === 'ok' ? D8.plan.workUsage(s, m) : ''}
      ${note}
      ${stepList(s)}
    </section>`;
  }

  /** The top of Work, on both tabs: the title, one Ask for a change (it asks which service), and Now / Done. @param {'now'|'done'} cur */
  function workHead(cur) {
    const ask = `<button class="btn btn-glass btn-sm" type="button" data-action="compose" data-mode="request" title="Opens a message to us. Tell us anything you want different. We usually reply within one working day.">${icon('edit')}Ask for a change</button>`;
    const tab = (/** @type {string} */ id, /** @type {string} */ href, /** @type {string} */ text) => `<a class="work-tab" href="${href}"${cur === id ? ' aria-current="page"' : ''}>${text}</a>`;
    return `${UI.PageHeader({ title: cur === 'done' ? 'Done' : 'Work', intro: cur === 'done' ? 'Everything we finished for you, newest first.' : "What we are doing for you now, and how much of this month's plan is used.", aside: ask })}
      <nav class="work-tabs" aria-label="Work">${tab('now', '#/work', 'Now')}${tab('done', '#/updates', 'Done')}</nav>`;
  }

  const work = {
    title: () => 'Work',
    render() {
      return `<div class="page page-work">
        ${workHead('now')}
        <div id="work-body">${UI.Skeleton('block', 2)}</div>
      </div>`;
    },
    mount(ctx, r, el) {
      let jumped = false; // only the first draw jumps to the service named in the address, not every refresh
      const load = () => section(el, '#work-body', () => ctx.client.getWork(), (w) => {
        const m = w.plan;
        const fresh = UI.PageFresh({
          updatedAt: w.updatedAt || D8.time.isoTime(ctx.client.now()), source: 'Domin8te team', zone: ctx.account.zoneAbbr,
          status: m.mismatch ? 'kept' : 'ok', extra: m.state === 'ok' ? `${m.now.name} plan · Your services for this month are set. You can change next month's until ${F.date(m.lastDay)}.` : m.state === 'upcoming' ? `Plan: ${m.upcoming.name} · starts ${F.date(m.starts)}` : '',
          note: m.mismatch ? 'Showing the last checked update. We could not confirm a newer change from our task tool. Karan has been told and nothing is lost.' : ''
        });
        const body = w.services.length
          ? w.services.map((s) => serviceSection(s, w.actions, m)).join('')
          : UI.EmptyState({ icon: 'work', title: 'No work started yet.', text: 'Your services show here once we start.' });
        return fresh + UI.SampleChip() + body + D8.plan.offCards(w.off, m);
      },
      () => ({ title: "We couldn't load your work.", text: 'Your other pages still work. Try again soon.', retry: 'work' }))
        .then(() => {
          if (!r.sub || jumped) return;
          jumped = true;
          const t = /** @type {HTMLElement|null} */ (document.getElementById('svc-' + r.sub));
          if (t && el.contains(t)) ring(t);
        });
      load();
      return { retry: load, refresh: load };
    }
  };

  /* ================================================================ RESULTS */

  const pickDays = (v) => ([7, 30, 90].includes(Number(v)) ? Number(v) : 30);

  /**
   * One figure as a card: its number, the period it covers, where it comes from and whether it was checked (2026-10-13).
   * @param {any} m a metric @param {any} w the window @param {Map<string, any>} tiles the data layer's cards, by id @param {number} now
   */
  function resultTile(m, w, tiles, now) {
    const t = tiles.get(m.id);
    return t ? UI.ResultTile(t, now, { delta: true, days: w.days }) : '';
  }

  /** A daily chart. The first one on the page shows; the others fold behind "Show daily ...". @param {boolean} [folded] */
  function chartBlock(c, w, folded) {
    const name = label(c.label);
    const cur = `These ${w.days} days`;
    const before = `The ${w.days} days before`;
    const aria = `${name} per day, ${span(w.from, w.to)}. ${F.num(c.value)} in total${c.previous !== null ? `, compared with ${F.num(c.previous)} in the ${w.days} days before` : ''}. The same numbers are in the table below.`;
    const rows = c.points.map((p) => `<tr><th scope="row">${esc(day(p.d))}</th><td>${p.v === null ? 'No numbers' : F.num(p.v)}</td><td>${p.p === null ? 'No numbers' : F.num(p.p)}</td></tr>`).join('');
    const fig = `<figure class="card chart-fig">
      <figcaption class="chart-cap"><span class="chart-title">${esc(name)} per day</span><span class="legend"><span class="lg lg-cur" title="${esc(span(w.from, w.to))}">${esc(cur)}</span><span class="lg lg-prev" title="${esc(span(w.pFrom, w.pTo))}">${esc(before)}</span></span></figcaption>
      <div class="chart" role="img" aria-label="${esc(aria)}" data-points="${esc(JSON.stringify(c.points))}" data-days="${w.days}" data-unit="${esc(c.unit)}"></div>
      <details class="chart-table"><summary title="Every day's number, written out">Show these numbers as a table</summary><div class="table-wrap" tabindex="0" role="region" aria-label="${esc(name)} per day, as a table"><table><caption class="sr-only">${esc(name)} per day</caption><thead><tr><th scope="col">Day</th><th scope="col">${esc(cur)}</th><th scope="col">Same day, ${w.days} days earlier</th></tr></thead><tbody>${rows}</tbody></table></div></details>
    </figure>`;
    return folded ? `<details class="fold fold-chart"><summary>Show daily ${esc(F.lcFirst(name))}${icon('chevron-down')}</summary>${fig}</details>` : fig;
  }

  /** A channel name with what it means the first time it shows: "Meta" is "Meta (Facebook and Instagram ads)". */
  function glossOnce() {
    const done = new Set();
    return (/** @type {string} */ text) => String(text || '').replace(/\bMeta\b/, (m) => {
      if (done.has('meta')) return m;
      done.add('meta');
      return 'Meta (Facebook and Instagram ads)';
    });
  }

  /** The ads, folded under the Advertising group: "See your 3 ads". */
  function campaigns(list) {
    const gloss = glossOnce();
    return `<details class="fold fold-ads"><summary>See your ${list.length} ${F.plural(list.length, 'ad', 'ads')}${icon('chevron-down')}</summary><div class="card campaigns"><h3 class="sr-only">Your ads</h3><ul>${list.map((c) => `<li><div><p class="camp-name">${esc(c.name)}</p><p class="meta">${c.to ? esc(span(c.from, c.to)) : 'From ' + esc(day(c.from))} on ${esc(gloss(c.channel))}</p></div>${UI.StatusBadge(c.status === 'complete' ? 'complete' : c.status === 'planned' ? 'planned' : 'in_progress')}</li>`).join('')}</ul></div></details>`;
  }

  /** The group's one-line description, from what is in it: "People who booked online or called you from Google." */
  function groupIntro(g) {
    if (g.id !== 'leads') return g.intro;
    const ms = g.metrics || [];
    const booked = ms.some((/** @type {any} */ m) => (m.sources || []).some((/** @type {any} */ s) => s.id === 'booking'));
    const called = ms.some((/** @type {any} */ m) => m.id === 'calls' && (m.sources || []).some((/** @type {any} */ s) => s.id === 'gbp'));
    if (booked && called) return 'People who booked online or called you from Google.';
    return g.intro;
  }

  /** Where a group's numbers come from and how fresh they are, once, under its heading. A disconnected account is told in its notice instead. */
  function groupSources(g, now) {
    /** @type {any[]} */ const list = [];
    const seen = new Set();
    for (const m of g.metrics || []) for (const s of m.sources || []) {
      if (s.state === 'disconnected' || seen.has(s.id)) continue;
      seen.add(s.id);
      list.push(s);
    }
    const line = UI.sourceLine(list, now);
    return line ? `<p class="meta group-src">${line}</p>` : '';
  }

  /** @param {any} g @param {any} w @param {number} now @param {{chartShown: boolean, tiles: Map<string, any>}} seen whether a chart is already open on the page, and the cards by id */
  function group(g, w, now, seen) {
    // The heading, what the group is, and (beside the heading on a wide page) where its numbers come from (60-results.css).
    const head = (/** @type {string} */ src) => `<div class="sec-head group-head"><h2 id="h-g-${esc(g.id)}">${esc(g.title)}</h2><p class="sec-meta">${esc(groupIntro(g))}</p>${src}</div>`;
    if (g.state === 'error') {
      const who = F.list(g.sources.filter((s) => s.state === 'error').map((s) => s.name)) || 'The source';
      return `<section class="group" aria-labelledby="h-g-${esc(g.id)}">${head('')}${UI.ErrorState({ title: `We couldn't load your ${F.lcFirst(g.title)} numbers.`, text: `${who} is not answering. The rest of this page works.`, retry: 'results' })}</section>`;
    }
    const tiles = g.metrics.map((m) => resultTile(m, w, seen.tiles, now)).join('') + g.pending.map((p) => UI.ResultTile({ state: 'pending', label: p.label, text: p.text }, now)).join('');
    // The note stays; reconnecting is done from Waiting for you on Home and from Settings.
    const notes = g.notes.map((n) => `<div class="notice is-off">${icon('linkoff')}<p>${esc(n.name)} has been disconnected since ${esc(day(n.since))}${n.lastDay ? `, so its numbers stop on ${esc(day(n.lastDay))}` : ''}. The gap means missing numbers, not a drop.</p></div>`).join('');
    let chart = '';
    if (g.chart) { chart = chartBlock(g.chart, w, true); seen.chartShown = true; }
    return `<section class="group" aria-labelledby="h-g-${esc(g.id)}">${head(groupSources(g, now))}<div class="rtiles">${tiles}</div>${notes}${chart}${g.campaigns.length ? campaigns(g.campaigns) : ''}</section>`;
  }

  /** The one attribution line, the same everywhere (item 16). */
  const WRITTEN_BY = 'Written by our assistant, checked by Karan.';
  /** The summary at the top: the assistant's few lines, only once a person has checked them, and who. */
  function summaryCard(res, ins) {
    const big = ins && ins.state !== 'error' && ins.state !== 'none' && ins.headline ? ins : null;
    const s = res.summary;
    if (!s && !big) return '';
    return `<section class="card ai-summary" aria-labelledby="h-summary">
        <div class="sec-head"><h2 id="h-summary">Summary</h2>${s ? `<span class="checked-chip">${icon('check')}Checked by ${esc(s.reviewedBy)}, ${esc(day(s.reviewedAt))}</span>` : ''}</div>
        ${s ? `<p class="ai-text">${esc(s.text)}</p><p class="ai-label">${icon('spark')}${esc(WRITTEN_BY)}</p>` : ''}
        ${big ? `<p class="ai-big"><strong>Biggest change this month:</strong> ${esc(big.headline)}</p>` : ''}
      </section>`;
  }

  /** The order Results' three headline numbers are picked in: customers first, then the ways people found you (item 14). */
  const HEADLINE = ['bookings', 'orders', 'calls', 'leads', 'adClicks', 'directions', 'visits', 'profileViews', 'facebookViews', 'instagramViews'];
  /** @param {any[]} items */
  function headlineTiles(items) {
    const ok = items.filter((/** @type {any} */ t) => t.state === 'ok' && !(t.metric && t.metric.state === 'partial'));
    const rank = (/** @type {any} */ t) => { const i = HEADLINE.indexOf(t.id); return i < 0 ? 99 : i; };
    return ok.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 3);
  }
  /**
   * What was being lost, said first, then what came back (item 27): only when it is on record, never estimated.
   * @param {any} m from getMissed()
   */
  function missedLine(m) {
    if (!m) return '';
    return `<section class="card missed-card" aria-label="Missed customers">
      <p class="missed-lost"><strong>Missed calls and unanswered messages ${esc(/^\d{4}-\d{2}$/.test(String(m.period)) ? 'in ' + F.monthYear(m.period + '-01') : m.period || 'last month')}:</strong> about ${esc(F.num(m.lost))} ${esc(F.plural(m.lost, 'customer', 'customers'))}.</p>
      ${m.back !== null && m.back !== undefined ? `<p class="missed-back">Since we started answering them, ${esc(F.num(m.back))} came back.</p>` : ''}
      ${m.source ? `<p class="meta">From ${esc(m.source)}.</p>` : ''}
    </section>`;
  }

  /** The freshness line for Results: the newest read, every source named, and whether anything is still being checked. @param {any} res @param {any} ctx */
  function resultsFresh(res, ctx) {
    const ok = res.items.filter((/** @type {any} */ x) => x.state === 'ok');
    const times = ok.map((/** @type {any} */ x) => x.readAt || x.verifiedAt || '').filter(Boolean).sort();
    const sources = [...new Set(ok.map((/** @type {any} */ x) => x.source).filter(Boolean))];
    const checking = ok.filter((/** @type {any} */ x) => x.badge === 'checking').length;
    const delayed = ok.filter((/** @type {any} */ x) => x.badge === 'delayed').length;
    return {
      updatedAt: times.length ? times[times.length - 1] : null, zone: ctx.account.zoneAbbr, source: sources.length ? F.list(sources.slice(0, 4)) : 'your connected accounts',
      status: checking ? 'checking' : delayed ? 'delayed' : 'ok', label: checking ? `${checking} ${F.plural(checking, 'number', 'numbers')} being checked` : delayed ? `${delayed} ${F.plural(delayed, 'source is', 'sources are')} delayed` : '', okLabel: 'All checked'
    };
  }

  /**
   * Results, about one screen (item 14): the summary, three headline numbers and the missed customers above the fold; the groups,
   * charts, daily tables and where the numbers come from behind one "See the detail".
   * @param {any} res @param {any} ins @param {number} now @param {any} ctx @param {any} [missed]
   */
  function resultsBody(res, ins, now, ctx, missed) {
    const top = [UI.PageFresh(resultsFresh(res, ctx))];
    top.push(summaryCard(res, res.mode === 'series' && res.window && res.window.days === 30 ? ins : null));
    const heads = headlineTiles(res.items || []);
    if (heads.length) top.push(`<section class="sec results-head" aria-label="Headline numbers"><div class="rtiles is-3">${heads.map((t) => UI.ResultTile(t, now, { delta: res.mode === 'series', days: t.days || (res.window && res.window.days) || 30 })).join('')}</div>${UI.SampleChip()}</section>`);
    top.push(missedLine(missed));
    const out = [];
    if (res.mode === 'verified') {
      if (!res.groups.length) out.push(UI.EmptyState({ icon: 'results', title: 'No checked results yet.', text: 'Numbers show here once we have checked them against your accounts. Nothing unchecked is ever shown.' }));
      for (const g of res.groups) {
        out.push(`<section class="group" aria-labelledby="h-g-${esc(g.id)}"><div class="sec-head group-head"><h2 id="h-g-${esc(g.id)}">${esc(g.title)}</h2></div><div class="rtiles">${g.items.map((/** @type {any} */ t) => UI.ResultTile(t, now)).join('')}</div></section>`);
      }
    } else {
      if (!res.groups.length) out.push(UI.EmptyState({ icon: 'results', title: 'No results yet.', text: 'Numbers show here once your accounts are connected.' }));
      const seen = { chartShown: false, tiles: new Map(res.items.map((/** @type {any} */ t) => [t.id, t])) };
      for (const g of res.groups) out.push(group(g, res.window, now, seen));
    }
    const where = UI.SourcesTable(res.items);
    if (where) out.push(where);
    const detail = out.join('');
    return top.join('') + (detail ? `<details class="fold fold-detail" id="results-detail"><summary>See the detail${icon('chevron-down')}</summary><div class="detail-body">${detail}</div></details>` : '');
  }

  const results = {
    title: () => 'Results',
    render(ctx, r) {
      const days = pickDays(r.params.days);
      // Basic shows the figures and the summary; Advanced adds the daily charts, their tables and campaigns.
      const detail = V.reportModes ? (pref('detail') === 'advanced' ? 'advanced' : 'basic') : '';
      const modes = detail ? UI.FilterChips([['basic', 'Basic'], ['advanced', 'Advanced']], detail, 'detail', 'How much detail to show') : '';
      return `<div class="page page-results"${detail ? ` data-detail="${detail}"` : ''}>
        ${UI.PageHeader({ title: 'Results', intro: 'How your marketing is doing. Every number shows its period, where it came from and whether we checked it.', after: `<div class="range-bar">${UI.DateRangeSelector(days)}${modes}${refreshButton()}<p class="range-text" id="range-text" aria-live="polite"></p></div>` })}
        <div id="results-body">${UI.Skeleton('block', 3)}</div>
      </div>`;
    },
    mount(ctx, r, el) {
      let days = pickDays(r.params.days);
      const load = () => {
        const body = /** @type {HTMLElement} */ (el.querySelector('#results-body'));
        // Changing the range keeps the current figures on screen, dimmed, until the new ones arrive.
        if (!body.hasAttribute('data-loaded')) body.innerHTML = UI.Skeleton('block', 3);
        // The biggest change is extra: if it fails, the results still show.
        const wasOpen = !!el.querySelector('#results-detail[open]');
        return section(el, '#results-body', () => Promise.all([ctx.client.getResults(days), ctx.client.getInsight().catch(() => null), ctx.client.getMissed().catch(() => null)]), ([res, ins, missed]) => {
          const bar = el.querySelector('.range-bar');
          if (bar) bar.classList.toggle('is-verified', res.mode === 'verified');
          if (res.mode === 'series') { const w = res.window; setText(el, '#range-text', `${F.range(w.from, w.to)} vs the ${w.days} days before`); } else setText(el, '#range-text', '');
          return resultsBody(res, ins, ctx.client.now(), ctx, missed);
        }, () => ({ title: "We couldn't load your results.", text: 'Your other pages still work. Try again soon.', retry: 'results' }))
          .then(() => {
            const d = /** @type {HTMLDetailsElement|null} */ (el.querySelector('#results-detail'));
            if (d && wasOpen) d.open = true;
            D8.charts.mountAll(el);
          });
      };
      // A folded chart is drawn when it opens, at its real width. (The page element, not main, which outlives it.)
      const page = el.querySelector('.page-results');
      if (page) page.addEventListener('toggle', (e) => {
        const d = /** @type {HTMLElement} */ (e.target);
        if (d && d.classList && (d.classList.contains('fold-chart') || d.classList.contains('fold-detail')) && /** @type {HTMLDetailsElement} */ (d).open) D8.charts.mountAll(d);
      }, true);
      load();
      return {
        retry: load,
        refresh: load,
        change(name, value) {
          if (name === 'detail') {
            const page = el.querySelector('.page-results');
            if (page) page.setAttribute('data-detail', value === 'advanced' ? 'advanced' : 'basic');
            pref('detail', value === 'advanced' ? 'advanced' : 'basic');
            return;
          }
          if (name !== 'range') return;
          days = pickDays(value);
          D8.ui.replaceHash('#/results?days=' + days);
          load();
        }
      };
    }
  };

  /* ================================================================ UPDATES (Work > Done) */

  function feed(list) {
    /** @type {Array<{k: string, items: any[]}>} */
    const months = [];
    for (const u of list) {
      const k = u.date.slice(0, 7);
      let m = months.find((x) => x.k === k);
      if (!m) { m = { k, items: [] }; months.push(m); }
      m.items.push(u);
    }
    return months.map((m) => `<section class="feed-month" aria-labelledby="m-${esc(m.k)}"><h2 id="m-${esc(m.k)}">${esc(F.monthYear(m.k + '-01'))}</h2><div class="feed">${m.items.map((u) => UI.UpdateCard(u, { id: 'u-' + u.id, resultTitle: true })).join('')}</div></section>`).join('');
  }

  /* The updates are the Done tab of Work (2026-10-09). #/updates still opens them, with ?service= kept. */
  const updates = {
    title: () => 'Work',
    render(ctx, r) {
      const pkg = ctx.account.package.services.filter((/** @type {string} */ x) => SVC()[x]);
      const v = pkg.includes(r.params.service) ? r.params.service : 'all';
      const opts = [['all', 'All services'], ...pkg.map((s) => [s, SVC()[s].label])];
      return `<div class="page page-updates">
        ${workHead('done')}
        <div class="filter-bar"><label class="sr-only" for="upd-service">Show updates for</label><select class="filter-select" id="upd-service" name="service" data-change="service">${opts.map(([k, l]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <p class="sr-only" id="updates-status" aria-live="polite"></p>
        <div id="updates-body">${UI.Skeleton('card', 3)}</div>
      </div>`;
    },
    mount(ctx, r, el) {
      const pkg = ctx.account.package.services.filter((/** @type {string} */ x) => SVC()[x]);
      let filter = pkg.includes(r.params.service) ? r.params.service : 'all';
      /** @type {any[]|null} */ let all = null;
      const draw = () => {
        const list = (all || []).filter((u) => filter === 'all' || u.service === filter);
        const label = filter === 'all' ? '' : F.lcFirst(SVC()[filter].label) + ' ';
        setText(el, '#updates-status', `${list.length} ${label}${F.plural(list.length, 'update', 'updates')}`);
        const fresh = UI.PageFresh({ updatedAt: all && all[0] ? all[0].date : null, source: 'Domin8te team', status: 'ok' });
        return fresh + UI.SampleChip() + (list.length ? feed(list) : UI.EmptyState({ icon: 'updates', title: `No ${label}updates yet.`, text: 'They show here when we finish something.' }));
      };
      let landed = false;
      const load = () => section(el, '#updates-body', () => ctx.client.getUpdates(), (list) => { all = list; return draw(); },
        () => ({ title: "We couldn't load your updates.", text: 'Your other pages still work. Try again soon.', retry: 'updates' }))
        .then(() => {
          // #/updates?u=<id> (an email's link): glide to that update once
          if (landed || !r.params.u) return;
          landed = true;
          const t = /** @type {HTMLElement|null} */ (document.getElementById('u-' + r.params.u));
          if (t && el.contains(t)) { t.setAttribute('tabindex', '-1'); ring(t); }
        });
      load();
      return {
        retry: load,
        refresh: load,
        change(name, value) {
          if (name !== 'service') return;
          filter = pkg.includes(value) ? value : 'all';
          D8.ui.replaceHash(filter === 'all' ? '#/updates' : '#/updates?service=' + filter);
          const body = /** @type {HTMLElement|null} */ (el.querySelector('#updates-body'));
          if (all && body) body.innerHTML = draw();
        }
      };
    }
  };

  /* ================================================================ BILLING */

  /* Billing (2026-10-13): the plan with what each service allows, the confirmation once next month is chosen, the card,
     and the bills in one table with the Stripe link staff approved. Choosing next month's services is its own view,
     #/billing/change, so this page stays calm for someone who only came to look at a bill. */

  /** The bar across the top when a payment did not go through: one button to Stripe. @param {any} b */
  function payBanner(b) {
    const s = b.subscription;
    const pm = b.paymentMethod || {};
    const payProblem = pm.problem;
    return `<section class="banner tone-error" aria-labelledby="h-bill-problem">
        ${icon('alert', 'banner-icon')}
        <div><h2 id="h-bill-problem">Your payment did not go through</h2><p>${pm.last4 ? `Your card ending ${esc(pm.last4)} was` : 'Your last payment was'} declined${payProblem && payProblem.date ? ` on ${esc(day(payProblem.date))}` : ''}.${s.graceUntil ? ` Everything keeps running until ${esc(day(s.graceUntil))}. If the payment still fails, services pause after that.` : ''}</p>${s.retryOn ? `<details class="fold fold-quiet"><summary>See details${icon('chevron-down')}</summary><p class="meta">Stripe, our payment service, will try your card again on ${esc(day(s.retryOn))}.</p></details>` : ''}</div>
        <button class="btn btn-primary" type="button" data-action="external" data-kind="billing-portal">Update payment method</button>
      </section>`;
  }

  /** The freshness line for Billing: when a person last checked a bill, and a note while a payment needs a look. @param {any} b @param {any} ctx */
  function billFresh(b, ctx) {
    // the payment itself is said once, in the banner and on the plan card; this line is only about how fresh the page is
    return UI.PageFresh({ updatedAt: b.checkedAt || null, zone: ctx.account.zoneAbbr, source: 'Stripe, our payment service', status: 'ok' });
  }

  /** @param {any} b the billing record, with the plan model as b.plan @param {any} ctx */
  function billingBody(b, ctx) {
    const m = b.plan;
    const fresh = billFresh(b, ctx);
    const help = '<p class="bill-help">Question about a charge? <a class="link" href="#/messages">Message us</a></p>';
    // A new client has no month of a plan yet: say so, never a "could not load". Any bills they do have still show.
    if (m.state !== 'ok') return `${fresh}${D8.plan.notSetUp(m)}${b.invoices.length ? D8.plan.bills(b.invoices, m) : ''}${help}`;
    const changing = m.confirmed && m.changes.differs;
    return `${fresh}${UI.SampleChip()}
      ${b.subscription && b.subscription.status === 'past_due' ? payBanner(b) : ''}
      ${changing ? D8.plan.confirmed(m, ctx.account.user.email) : ''}
      ${D8.plan.overview(m, { billing: b })}
      <div class="bill-cols">${D8.plan.payment(b)}${D8.plan.bills(b.invoices, m)}</div>
      ${help}`;
  }

  /** Choosing next month: the page the client lands on from "Change my services". @param {any} ctx */
  function changeFrame(ctx) {
    return `<div class="page page-billing page-change">
      <p class="crumb"><a class="link" href="#/billing">${icon('chevron-left')}Back to billing</a></p>
      ${UI.PageHeader({ title: 'Change your plan or services', intro: 'Choose what you want from your next bill. Nothing changes until you confirm.' })}
      <div id="change-body">${UI.Skeleton('block', 2)}</div>
    </div>`;
  }

  /** @param {any} m the plan model @param {any} ctx */
  function changeBody(m, ctx) {
    const fresh = UI.PageFresh({ updatedAt: D8.time.isoTime(ctx.client.now()), zone: ctx.account.zoneAbbr, source: 'Domin8te team', status: 'ok' });
    if (m.state !== 'ok') return fresh + D8.plan.notSetUp(m);
    if (!m.open) {
      return `${fresh}${UI.SampleChip()}<section class="card plan-locked" aria-labelledby="h-locked">
        <div class="empty">${icon('lock', 'empty-icon')}<div><h2 id="h-locked" class="empty-title">Next month is set.</h2><p class="empty-text">The last day to change it, ${esc(day(m.lastDay))}, has passed. Message us if something is wrong.</p><a class="btn btn-glass btn-sm" href="#/messages">${icon('message')}Message us</a></div></div>
      </section>`;
    }
    return fresh + UI.SampleChip() + D8.plan.deadline(m) + D8.plan.overview(m, { compact: true }) + D8.plan.picker(m);
  }

  const billing = {
    title: (ctx, r) => (r && r.sub === 'change' ? 'Change your plan' : 'Billing'),
    render(ctx, r) {
      if (r && r.sub === 'change') return changeFrame(ctx);
      return `<div class="page page-billing">${UI.PageHeader({ title: 'Billing', intro: 'Your plan, payments and bills.' })}<div id="billing-body">${UI.Skeleton('block', 2)}</div></div>`;
    },
    mount(ctx, r, el) {
      if (r && r.sub === 'change') {
        const loadChange = () => section(el, '#change-body', () => ctx.client.getPlan(), (m) => changeBody(m, ctx),
          () => ({ title: "We couldn't load your plan.", text: 'Nothing has changed. Try again soon.', retry: 'billing' }))
          .then((m) => {
            if (!m || m.state !== 'ok' || !m.open) return;
            D8.plan.mountPicker(el, ctx, m, () => {
              D8.dialogs.toast('Confirmed. Your choice is saved.');
              root.location.hash = '#/billing';
            });
          });
        loadChange();
        // A half-made choice is never thrown away by a refresh from somewhere else.
        return { retry: loadChange, refresh() { /* nothing */ } };
      }
      const load = () => section(el, '#billing-body', () => ctx.client.getBilling(), (b) => billingBody(b, ctx),
        () => ({ title: "We couldn't load your billing.", text: 'Your services are not affected. Try again soon.', retry: 'billing' }));
      load();
      return { retry: load, refresh: load };
    }
  };

  /* ================================================================ SETTINGS */

  /* Settings, simplified (2026-10-09): Connected accounts (a count, only the ones with a problem, the rest folded),
     Who can sign in (sign-in and asking for a login, merged) and Emails (the optional ones folded). How it looks was taken
     out on 2026-10-21 (not needed): the portal is light. */
  function sourceRow(src, now) {
    const when = src.pending ? `You told us you ${src.pending.kind === 'disconnect' ? 'removed our access' : 'connected it'}${src.pending.at ? ` on ${day(src.pending.at)}` : ''}. We confirm it, usually within one working day.`
      : src.state === 'missing' ? 'Not connected yet. Press Connect to let us in.'
      : src.state === 'disconnected' ? `Disconnected since ${day(src.since)}. Numbers after that are missing, not zero.`
      : src.state === 'error' ? 'Not answering right now. We keep trying on our own.'
        : src.state === 'stale' ? `Last updated ${F.ago(src.updatedAt, now)}. It usually updates several times a day.`
          : `Updated ${F.ago(src.updatedAt, now)}`;
    // One button per account (2026-10-09): Connect when it is missing, Reconnect when it broke, Disconnect when it works.
    // While the team is checking a change the client told us about, the row says so instead.
    const mode = src.state === 'missing' ? 'connect' : src.state === 'disconnected' || src.state === 'error' ? 'reconnect' : 'disconnect';
    const text = { connect: 'Connect', reconnect: 'Reconnect', disconnect: 'How to disconnect' }[mode];
    const tip = mode === 'disconnect' ? `Shows how to remove our access to ${src.name}` : `Shows how to let us into ${src.name}. We never see your password.`;
    // "Not answering right now" is on our side: no button sends the client through the steps for nothing.
    const act = src.pending || src.state === 'error' ? '' : `<button class="btn ${mode === 'disconnect' ? 'btn-text src-off' : 'btn-glass'} btn-sm" type="button" data-action="account" data-source="${esc(src.id)}" data-mode="${mode}" title="${esc(tip)}">${text}<span class="sr-only"> ${esc(src.name)}</span></button>`;
    const about = UI.sourceAbout(src);
    return `<li class="src-row"><div><p class="src-name">${esc(src.name)}</p>${about ? `<p class="src-about">${esc(about)}</p>` : ''}<p class="meta">${esc(when)}</p></div>${src.pending ? `<span class="badge tone-info">${icon('clock')}Waiting for us to confirm</span>` : UI.HealthBadge(src)}${act}</li>`;
  }

  function settingsBody(s, ctx) {
    const now = ctx.client.now();
    const optional = s.categories.filter((c) => !c.required);
    const rows = optional.map((c) => `<div class="toggle-row">
        <input class="switch" type="checkbox" id="n-${esc(c.id)}" name="${esc(c.id)}"${s.prefs[c.id] ? ' checked' : ''} aria-describedby="n-${esc(c.id)}-text">
        <label for="n-${esc(c.id)}"><span class="toggle-label">${esc(c.label)}</span><span class="toggle-text" id="n-${esc(c.id)}-text">${esc(c.text)}</span></label>
      </div>`).join('');
    const working = s.sources.filter((src) => src.state === 'fresh' || src.state === 'stale').length;
    const problems = s.sources.filter((src) => src.pending || src.state !== 'fresh');
    const fine = s.sources.filter((src) => !(src.pending || src.state !== 'fresh'));
    const count = working === s.sources.length ? `All ${s.sources.length} working` : `${working} of ${s.sources.length} working`;
    // The emails that cannot be switched off (the bill reminders, the confirmation of a change of picks, payment problems) show as rows, always on.
    const always = [...(s.always || []), ...s.categories.filter((c) => c.required)].map((c) => `<li>${icon('check')}<span><strong>${esc(c.label)}</strong>. ${esc(c.text)}</span></li>`).join('');
    const fresh = UI.PageFresh({ updatedAt: s.savedAt || null, source: 'Your account', zone: ctx.account.zoneAbbr, status: 'ok' });
    return `${fresh}${UI.SampleChip()}<section class="card set-card" id="sources" tabindex="-1" aria-labelledby="h-sources">
        <div class="sec-head"><h2 id="h-sources">Connected accounts</h2><p class="sec-meta set-count">${esc(count)}</p></div>
        ${problems.length ? `<ul class="sources">${problems.map((src) => sourceRow(src, now)).join('')}</ul>` : ''}
        ${fine.length ? `<details class="fold fold-sources"${problems.length ? '' : ' open'}><summary>See all connections${icon('chevron-down')}</summary><p class="meta">You connect and disconnect on the app's own page. We never see your password.</p><ul class="sources">${fine.map((src) => sourceRow(src, now)).join('')}</ul></details>` : ''}
      </section>
      <section class="card set-card" aria-labelledby="h-people">
        <h2 id="h-people">Who can sign in</h2>
        <p>You sign in as ${esc(s.email)} with a 6-digit code we email you. No password to remember.</p>
        <div class="set-actions">
          <button class="btn btn-glass btn-sm" type="button" data-action="external" data-kind="clerk-account">Manage your sign-in${icon('external')}</button>
          <button class="btn btn-glass btn-sm" type="button" data-action="add-login" aria-expanded="false" aria-controls="login-ask">${icon('message')}Ask us to add someone</button>
        </div>
        <form id="login-ask" class="ask-form" novalidate hidden>
          <p>Ask for a login for your manager or someone else at the restaurant. They sign in with their own email. Nobody shares a password.</p>
          <p class="meta">Everyone you add can see and do what you can. The role is just a label for us.</p>
          <div class="ask-grid">
            <div class="field"><label for="la-first">Their first name</label><input id="la-first" name="first" type="text" maxlength="100" autocomplete="off" aria-describedby="la-err-first"><p class="field-error" id="la-err-first" hidden></p></div>
            <div class="field"><label for="la-email">Their email address</label><input id="la-email" name="email" type="email" maxlength="200" autocomplete="off" inputmode="email" spellcheck="false" aria-describedby="la-err-email"><p class="field-error" id="la-err-email" hidden></p></div>
            <div class="field"><label for="la-role">Their role <span class="optional">(optional)</span></label><input id="la-role" name="role" type="text" maxlength="60" placeholder="Manager"></div>
          </div>
          <p class="form-error" role="alert" hidden></p>
          <div class="form-foot"><button class="btn btn-solid" type="submit">${icon('message')}Ask for a login</button><p class="meta" id="la-status" aria-live="polite">${D8.live ? 'We usually set it up within one working day.' : 'This is a demo, so nothing is sent.'}</p></div>
        </form>
        <div id="la-list"></div>
      </section>
      <section class="card set-card" aria-labelledby="h-email">
        <h2 id="h-email">Emails</h2>
        <p class="meta">We send these to ${esc(s.email)}.</p>
        <h3 class="po-h po-h-more" id="h-always">Emails we always send</h3><ul class="po-included" aria-labelledby="h-always">${always}</ul>
        <details class="fold fold-emails">
          <summary>Choose which other emails you get${icon('chevron-down')}</summary>
          <form id="notify-form" novalidate>
            <fieldset class="toggles"><legend class="sr-only">Emails you get</legend>${rows}</fieldset>
            <p class="form-error" role="alert" hidden></p>
            <div class="form-foot"><button class="btn btn-solid" type="submit" disabled>Save changes</button><p class="meta" id="notify-status" aria-live="polite">${s.savedAt ? `Saved ${esc(F.when(s.savedAt, now))}.` : 'No changes yet.'}</p></div>
          </form>
        </details>
      </section>`;
  }

  /* Asking for a login for someone else. Only a request: the account team creates logins in the
     agency console. Live portal only; the demo shows the form but sends nothing. */
  const ASK_STATUS = { pending: ['Asked', 'We will set it up'], granted: ['Login ready', 'They can sign in now'], declined: ['Not set up', 'We will be in touch'] };
  /** @param {HTMLElement} el */
  async function loadAsks(el) {
    const box = /** @type {HTMLElement|null} */ (el.querySelector('#la-list'));
    if (!box || !D8.live || D8.data.viewAs) return; // viewing as a client: the staff reader would see every client's asks
    try {
      const sb = await D8.live.db();
      const r = await sb.from('login_requests').select('first_name, email, role, status, at').order('at', { ascending: false }).limit(20);
      if (r.error) throw r.error;
      const rows = r.data || [];
      box.innerHTML = rows.length ? `<h3 class="sub-h">Logins you've asked for</h3><ul class="ask-list">${rows.map((/** @type {any} */ x) => {
        const st = /** @type {any} */ (ASK_STATUS)[x.status] || ASK_STATUS.pending;
        return `<li><div><p class="ask-name">${esc(x.first_name)}${x.role ? `, ${esc(x.role)}` : ''}</p><p class="meta">${esc(x.email)} · ${esc(st[1])}</p></div><span class="badge ${x.status === 'granted' ? 'tone-success' : x.status === 'declined' ? 'tone-neutral' : 'tone-info'}">${esc(st[0])}</span></li>`;
      }).join('')}</ul>` : '';
    } catch (e) { box.innerHTML = ''; }
  }
  /** @param {HTMLElement} el @param {any} ctx */
  function wireLoginAsk(el, ctx) {
    const form = /** @type {HTMLFormElement|null} */ (el.querySelector('#login-ask'));
    if (!form) return;
    loadAsks(el);
    // The form shows once the client presses Add someone.
    const add = /** @type {HTMLButtonElement|null} */ (el.querySelector('[data-action="add-login"]'));
    if (add) add.addEventListener('click', () => {
      if (D8.data.READ_ONLY) D8.dialogs.toast(D8.data.viewAs ? D8.data.DEMO_NOTE : 'This is a demo, so nothing is saved.');
      const open = form.hidden;
      form.hidden = !open;
      add.setAttribute('aria-expanded', String(open));
      if (open) /** @type {HTMLInputElement} */ (form.elements.namedItem('first')).focus();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const field = (/** @type {string} */ n) => /** @type {HTMLInputElement} */ (form.elements.namedItem(n));
      const first = field('first').value.trim();
      const email = field('email').value.trim().toLowerCase();
      const role = field('role').value.trim();
      const status = /** @type {HTMLElement} */ (form.querySelector('#la-status'));
      const err = /** @type {HTMLElement} */ (form.querySelector('.form-error'));
      /** @param {string} id @param {string} text */
      const bad = (id, text) => { const p = /** @type {HTMLElement} */ (form.querySelector('#la-err-' + id)); p.innerHTML = icon('alert') + esc(text); p.hidden = false; field(id).setAttribute('aria-invalid', 'true'); field(id).focus(); };
      for (const id of ['first', 'email']) { /** @type {HTMLElement} */ (form.querySelector('#la-err-' + id)).hidden = true; field(id).removeAttribute('aria-invalid'); }
      err.hidden = true;
      if (!first) return bad('first', 'Add their first name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('email', 'Enter their email address, like name@restaurant.com.');
      if (D8.data.viewAs) { status.textContent = D8.data.DEMO_NOTE; D8.dialogs.toast(D8.data.DEMO_NOTE); return; }
      if (!D8.live) { status.textContent = 'This is a demo, so nothing was sent. In your own portal, we would get this request.'; D8.dialogs.toast('This is a demo, so nothing is saved.'); return; }
      const btn = /** @type {HTMLButtonElement} */ (form.querySelector('[type=submit]'));
      btn.disabled = true;
      try {
        const sb = await D8.live.db();
        const who = (ctx.account && ctx.account.user && ctx.account.user.firstName) || '';
        const r = await sb.from('login_requests').insert({ first_name: first, email, role: role || null, by_name: who }).select('id').single();
        if (r.error) throw r.error;
        form.reset();
        status.textContent = `Sent. We will set up a login for ${first}. It shows below when it is ready.`;
        loadAsks(el);
      } catch (x) {
        if (x && /** @type {any} */ (x).code === '23505') { status.textContent = 'You already asked for that email. We are on it.'; form.reset(); loadAsks(el); }
        else if (x && /** @type {any} */ (x).code === '54000') { status.textContent = 'You already have 10 logins waiting. We will set those up first.'; }
        else {
          err.innerHTML = icon('alert') + esc("We couldn't send that. Try again soon, or message us.");
          err.hidden = false;
        }
      } finally { btn.disabled = false; }
    });
  }

  function wireSettings(el, s, ctx) {
    const form = /** @type {HTMLFormElement|null} */ (el.querySelector('#notify-form'));
    if (!form) return;
    const btn = /** @type {HTMLButtonElement} */ (form.querySelector('[type=submit]'));
    const status = /** @type {HTMLElement} */ (form.querySelector('#notify-status'));
    const err = /** @type {HTMLElement} */ (form.querySelector('.form-error'));
    let saved = { ...s.prefs };
    if (D8.data.READ_ONLY) btn.disabled = false; // pressing it says why nothing is saved
    const current = () => {
      /** @type {Record<string, boolean>} */ const p = {};
      // The always-on emails have no switch: they keep their saved value.
      for (const c of s.categories) {
        const box = /** @type {HTMLInputElement|null} */ (form.elements.namedItem(c.id));
        p[c.id] = box ? box.checked : saved[c.id];
      }
      return p;
    };
    const dirty = () => s.categories.some((c) => current()[c.id] !== saved[c.id]);
    const demoToast = () => D8.dialogs.toast(D8.data.viewAs ? D8.data.DEMO_NOTE : 'This is a demo, so nothing is saved.');
    form.addEventListener('change', () => {
      if (D8.data.READ_ONLY) {
        // A blocked switch says so and stays as it was (2026-10-14, R2-26).
        for (const c of s.categories) { const box = /** @type {HTMLInputElement|null} */ (form.elements.namedItem(c.id)); if (box) box.checked = !!saved[c.id]; }
        demoToast();
        return;
      }
      btn.disabled = !dirty(); status.textContent = dirty() ? 'You have unsaved changes. Press Save changes to keep them.' : 'No unsaved changes.'; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!dirty() && !D8.data.READ_ONLY) return;
      if (D8.data.READ_ONLY) {
        // Nothing was saved, so the switches go back to what is saved (2026-10-14): the page never shows a choice it did not keep.
        for (const c of s.categories) { const box = /** @type {HTMLInputElement|null} */ (form.elements.namedItem(c.id)); if (box) box.checked = !!saved[c.id]; }
        status.textContent = D8.data.DEMO_NOTE;
        demoToast();
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Saving';
      err.hidden = true;
      ctx.client.saveNotifications(current()).then((res) => {
        saved = { ...res.prefs };
        btn.innerHTML = 'Save changes';
        status.textContent = `Saved ${F.when(res.at, ctx.client.now())}.`;
        D8.dialogs.toast('Email choices saved.');
      }).catch((e2) => {
        btn.innerHTML = 'Save changes';
        btn.disabled = false;
        err.innerHTML = `${icon('alert')}<span>We couldn't save, so nothing changed. ${esc(e2.message || '')} Try again.</span>`;
        err.hidden = false;
      });
    });
  }

  const settings = {
    title: () => 'Settings',
    render(ctx) {
      return `<div class="page page-settings">${UI.PageHeader({ title: 'Settings', intro: 'Your connected accounts, who can sign in and your emails.' })}<div id="settings-body" class="settings-stack">${UI.Skeleton('block', 2)}</div></div>`;
    },
    mount(ctx, r, el) {
      const load = () => section(el, '#settings-body', () => ctx.client.getSettings(), (s) => settingsBody(s, ctx),
        () => ({ title: "We couldn't load your settings.", text: 'Nothing has changed. Try again soon.', retry: 'settings' }))
        .then((s) => {
          if (s) { wireSettings(el, s, ctx); wireLoginAsk(el, ctx); }
          if (r.sub === 'sources') {
            const t = /** @type {HTMLElement|null} */ (el.querySelector('#sources'));
            if (t) ring(t);
          }
        });
      load();
      return { retry: load, refresh: load };
    }
  };

  /* ================================================================ HELP */

  /* Help (2026-10-09): the common questions, and a card that leads to Messages, where the conversation lives.
     2026-10-21: what we promise first (the closest thing to a guarantee), five questions, the rest behind "More questions", and one
     way to message us. */
  const PROMISES = [
    'We only publish posts, pages and ads you have approved.',
    'We never change your ad budget without asking you first.',
    'Every number shows its period, where it came from and whether we checked it.',
    'Every summary says who wrote it: Written by our assistant, checked by Karan.',
    'Only people you invite can see your account.'
  ];
  const promiseList = () => `<ul class="promise-list">${PROMISES.map((p) => `<li>${icon('check')}<span>${esc(p)}</span></li>`).join('')}</ul>`;
  const FAQ = [
    ['What does my plan include?', 'Every plan includes Ads. Starter adds one service you choose, Growth adds two, and Domin8te adds three. You choose from Social media, Website, SEO and Google Maps, and Email.'],
    ['How do approvals work?', 'When we need your OK, it shows under Waiting for you on your Home page, with a date. Approve it, or ask for changes with a short note. Nothing goes out until you approve it.'],
    ['How fast do you make changes?', 'Small changes, like new opening hours or a menu price, usually go live within one working day. Bigger jobs, like a new page or an ad campaign, follow the dates on your Work page.'],
    ['Where do the numbers come from?', 'Each number on Results names its source, its dates, and whether we checked it. If an account disconnects, we tell you instead of guessing.'],
    ['Who can see my account?', 'You, the people at your restaurant we have given a login (ask for one in Settings), and the Domin8te team working for you. Other clients never see your numbers.']
  ];
  const MORE_FAQ = [
    ['How do I change my plan or my services?', 'Go to Billing and choose your services for next month. Your choice starts on your next bill date. This month stays as it is.'],
    ['When can I change my services?', 'Any time up to the last day shown in Billing, which is the day before your next bill. We email you 7 days and 3 days before, so you never miss it. Change them as often as you like until then.'],
    ['What happens to a service I stop?', 'We keep your work saved. You can add the service back for a later month.'],
    ['Is ad spend part of my plan?', `${D8.plan.AD_SPEND} We never change your ad budget without asking you first.`],
    ['What if I need more posts or changes this month?', 'Ask from Work. If it goes over your plan, Karan replies with options first. Nothing extra is charged without your OK.'],
    ['Do urgent fixes count?', 'No. Hours, closures, phone numbers and sold-out items are always fixed and never counted.'],
    ['How do I change my card?', 'Change your payment details on Stripe (our payment service), from your Billing page.']
  ];
  const faqRows = (/** @type {string[][]} */ list) => list.map(([q, a]) => `<details><summary>${esc(q)}${icon('chevron-down')}</summary><p>${esc(a)}</p></details>`).join('');

  const help = {
    title: () => 'Help',
    render(ctx) {
      return `<div class="page page-help">
        ${UI.PageHeader({ title: 'Help', intro: 'What we promise, answers to common questions, and how to reach us.' })}
        <section class="card promise-card" aria-labelledby="h-promise"><h2 id="h-promise" class="sec-title">What we promise</h2>${promiseList()}</section>
        <section class="sec" aria-labelledby="h-faq"><h2 id="h-faq" class="sec-title">Common questions</h2>
          <div class="card faq">${faqRows(FAQ)}</div>
          <details class="fold fold-faq"><summary>More questions${icon('chevron-down')}</summary><div class="card faq">${faqRows(MORE_FAQ)}</div></details>
        </section>
        <section class="card help-contact" aria-labelledby="h-contact">
          <div class="help-contact-row">
            <div><h2 id="h-contact">Still stuck?</h2><p>${ctx.account.team.reply ? esc(replyLine(ctx.account.team.reply)) + ' ' : ''}Messages go straight to the people who work on your account.</p></div>
            <a class="btn btn-solid" href="#/messages">${icon('message')}Message us</a>
          </div>
        </section>
      </div>`;
    },
    mount() { return {}; }
  };
  D8.promises = { list: PROMISES, html: promiseList };

  /* ================================================================ MESSAGES */

  /* Messages (2026-10-09): one conversation with the team, oldest at the top and newest at the bottom,
     with the client's change requests in it as small cards, and a box to write in at the bottom.
     It checks for a reply every minute while it is open and in view. */
  const REQ_WORDS = { review: 'We have it and will look soon', open: 'We have it and will look soon', in_progress: 'We are working on it', done: 'Done', complete: 'Done', declined: 'Not going ahead' };
  /** @type {any} */
  let msgTimer = null;

  /** "Today", "Yesterday" or "Tue 22 Sep". @param {string} at @param {number} now */
  function msgDay(at, now) {
    const d = F.daysBetween(at, now);
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    return F.date(at);
  }
  /** The topic's name, or nothing for general. @param {string} about */
  const aboutName = (about) => (about === 'billing' ? 'Billing' : about && SVC()[about] ? SVC()[about].label : '');
  const firstName = (/** @type {string} */ n) => String(n || '').trim().split(/\s+/)[0] || '';
  const sep = '<span aria-hidden="true">·</span><span class="sr-only">, </span>';

  /** One item of the thread. @param {any} x */
  function msgItem(x) {
    const t = F.time(x.at);
    if (x.kind === 'request') {
      const svc = SVC()[x.service];
      return `<li class="msg is-mine is-request"><div class="msg-req"><p class="msg-req-h">${icon('edit')}<span>You asked for a change${svc ? `<span aria-hidden="true"> · </span><span class="sr-only">, </span>${esc(svc.label)}` : ''}</span></p><p class="msg-text">${esc(x.text)}</p><p class="msg-req-status">${esc(/** @type {any} */ (REQ_WORDS)[x.status] || REQ_WORDS.review)}</p></div><p class="msg-meta"><span>${esc(t)}</span></p></li>`;
    }
    const topic = aboutName(x.about);
    const who = x.fromTeam ? (firstName(x.by) || 'Domin8te') : 'You';
    return `<li class="msg ${x.fromTeam ? 'is-team' : 'is-mine'}${x.sending ? ' is-sending' : ''}"><div class="msg-bubble"><p class="msg-text">${esc(x.text)}</p></div><p class="msg-meta">${x.fromTeam ? '<span class="team-mark msg-mark" aria-hidden="true"></span>' : ''}<span>${esc(who)}</span>${sep}<span>${x.sending ? 'Sending' : esc(t)}</span>${topic && !x.fromTeam ? `${sep}<span>About ${esc(topic === 'Billing' ? 'billing' : F.lcFirst(topic))}</span>` : ''}</p></li>`;
  }

  /**
   * The whole thread, with day lines and a "New" line before the first reply the client had not seen.
   * @param {any} th @param {number} now @param {string|null} seen
   */
  function msgThread(th, now, seen) {
    if (!th.items.length) return `<p class="msg-empty">${icon('message')}<span>No messages yet. Write to us below.</span></p>`;
    let lastDay = '';
    let newShown = false;
    const since = seen ? D8.time.parse(seen) : now - 14 * D8.time.DAY;
    const out = [];
    for (const x of th.items) {
      const d = msgDay(x.at, now);
      if (d !== lastDay) { out.push(`<li class="msg-day"><span>${esc(d)}</span></li>`); lastDay = d; }
      if (!newShown && x.kind === 'message' && x.fromTeam && D8.time.parse(x.at) > since) { out.push('<li class="msg-new"><span>New</span></li>'); newShown = true; }
      out.push(msgItem(x));
    }
    return `<ol class="msg-list">${out.join('')}</ol>`;
  }

  const messages = {
    title: () => 'Messages',
    render(ctx) {
      const reply = ctx.account.team && ctx.account.team.reply ? replyLine(ctx.account.team.reply) : 'We usually reply within one working day.';
      const pkg = (ctx.account.package.services || []).filter((/** @type {string} */ x) => SVC()[x]);
      // The demo is view-only (2026-10-13): the conversation can be read, nothing can be sent.
      const ro = D8.data.READ_ONLY;
      return `<div class="page page-messages">
        ${UI.PageHeader({ title: 'Messages', intro: `Talk to your Domin8te team. ${reply}${ctx.account.checkin ? ` Next check-in with Karan: ${day(ctx.account.checkin)}.` : ''}`, aside: `<button class="btn btn-glass btn-sm" type="button" data-msg-reload title="Checks for new messages now. The page also checks by itself every 10 seconds.">${icon('refresh')}Reload conversation</button>` })}
        <div id="msg-fresh">${UI.PageFresh({ source: 'Domin8te team', zone: ctx.account.zoneAbbr, status: 'ok' })}</div>
        <section class="card msg-card${ro ? ' is-view-only' : ''}" aria-labelledby="h-thread">
          <h2 id="h-thread" class="sr-only">Your conversation with Domin8te</h2>
          <div class="msg-scroll" id="msg-thread" role="log" aria-label="Messages with Domin8te" tabindex="0">${UI.Skeleton('text', 1)}</div>
          <form class="msg-compose" id="msg-form" novalidate>
            <div class="field msg-about" id="msg-about-box" hidden><label for="msg-about-pick">What is it about?</label><select id="msg-about-pick" name="about"><option value="general">General</option>${pkg.map((/** @type {string} */ x) => `<option value="${esc(x)}">${esc(SVC()[x].label)}</option>`).join('')}<option value="billing">Billing</option></select></div>
            <label class="sr-only" for="msg-new">Write a message</label>
            <textarea id="msg-new" name="text" rows="2" maxlength="2000" placeholder="${ro ? (D8.data.viewAs ? 'Read only' : 'Sample conversation') : 'Start a conversation, or reply to us'}"${ro ? ' disabled' : ''} aria-describedby="msg-new-err msg-keys"></textarea>
            <p class="field-error" id="msg-new-err" hidden></p>
            <p class="form-error" id="msg-form-err" role="alert" hidden></p>
            <div class="msg-compose-foot">
              <button class="link-btn msg-about-toggle" type="button" aria-expanded="false" aria-controls="msg-about-box"${ro ? ' disabled' : ''}>Add a topic</button>
              <span class="hint msg-keys" id="msg-keys">${ro ? (D8.data.viewAs ? 'Read only. Nothing here changes their account.' : 'Sample conversation. Sign in to message us.') : 'Ctrl and Enter sends'}</span>
              <button class="btn btn-solid msg-send" type="submit"${ro ? ' disabled' : ''}>Send${icon('arrow-right')}</button>
            </div>
          </form>
        </section>
      </div>`;
    },
    mount(ctx, r, el) {
      const box = /** @type {HTMLElement} */ (el.querySelector('#msg-thread'));
      const form = /** @type {HTMLFormElement} */ (el.querySelector('#msg-form'));
      const text = /** @type {HTMLTextAreaElement} */ (el.querySelector('#msg-new'));
      const err = /** @type {HTMLElement} */ (el.querySelector('#msg-new-err'));
      const formErr = /** @type {HTMLElement} */ (el.querySelector('#msg-form-err'));
      const send = /** @type {HTMLButtonElement} */ (form.querySelector('[type=submit]'));
      const toggle = /** @type {HTMLButtonElement} */ (el.querySelector('.msg-about-toggle'));
      const aboutBox = /** @type {HTMLElement} */ (el.querySelector('#msg-about-box'));
      const about = /** @type {HTMLSelectElement} */ (el.querySelector('#msg-about-pick'));
      /** When the client last opened Messages before this visit: replies after it get the "New" line. @type {string|null|undefined} */
      let seenBefore;
      let lastKey = '';
      /** @type {any} */ let last = null;
      const sendLabel = `Send${icon('arrow-right')}`;

      const nearBottom = () => box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      const toBottom = () => { box.scrollTop = box.scrollHeight; };
      const html = (/** @type {any} */ th) => msgThread(th, ctx.client.now(), seenBefore === undefined ? th.seenAt : seenBefore);
      /** Draws the thread and keeps the reader's place, unless they were at the newest message. @param {any} th @param {boolean} [force] */
      function draw(th, force) {
        const stay = !force && !nearBottom();
        const top = box.scrollTop;
        box.innerHTML = html(th);
        box.setAttribute('data-loaded', '');
        if (stay) box.scrollTop = top; else toBottom();
      }
      /** The client has seen everything shown: remember when, and clear the badge. */
      function seen() {
        ctx.setMessagesBadge(0);
        ctx.client.markMessagesSeen().catch(() => { /* remembered next time they open Messages */ });
      }
      /** The freshness line says when the newest message was written. @param {any} th */
      function setFresh(th) {
        const box_ = el.querySelector('#msg-fresh');
        const newest = th.items.length ? th.items[th.items.length - 1].at : null;
        if (box_) box_.innerHTML = UI.PageFresh({ updatedAt: newest, source: 'Domin8te team', zone: ctx.account.zoneAbbr, status: 'ok' });
      }
      /** @param {any} th */
      function keep(th) {
        if (seenBefore === undefined) seenBefore = th.seenAt;
        last = th;
        setFresh(th);
        lastKey = th.items.map((/** @type {any} */ x) => x.id + ':' + (x.status || '')).join('|');
        return th;
      }
      const load = () => section(el, '#msg-thread', () => ctx.client.getThread().then(keep), html,
        () => ({ title: "We couldn't load your messages.", text: 'You can still write to us below. Try again soon.', retry: 'messages' }))
        .then((th) => { if (th) { toBottom(); seen(); } });
      /** Quietly: no placeholder and no dimming; draws only when something changed. @param {boolean} [force] */
      const quiet = (force) => ctx.client.getThread().then((th) => {
        if (!document.contains(box)) return;
        const before = lastKey;
        keep(th);
        if (force || before !== lastKey || !box.hasAttribute('data-loaded')) draw(th, force);
        if (th.unread) seen();
      }).catch(() => { /* the next check tries again */ });

      load();
      // A reply shows up without a reload: every 10 seconds while Messages is open and in view (2026-10-09, Karan: "get the
      // messages right away"), and at once with Reload conversation.
      if (msgTimer) clearInterval(msgTimer);
      msgTimer = setInterval(() => {
        if (!document.contains(box)) { clearInterval(msgTimer); msgTimer = null; return; }
        if (document.hidden) return;
        ctx.client.refresh().then(() => quiet()).catch(() => { /* offline for a moment: the next check tries again */ });
      }, 10000);
      const reloadBtn = /** @type {HTMLButtonElement|null} */ (el.querySelector('[data-msg-reload]'));
      if (reloadBtn) reloadBtn.addEventListener('click', () => {
        reloadBtn.disabled = true;
        ctx.client.refresh().then(() => quiet(true)).then(() => D8.dialogs.toast('Conversation up to date.')).catch(() => D8.dialogs.toast("We couldn't check just now. Try again in a minute.", { tone: 'error' })).finally(() => { reloadBtn.disabled = false; });
      });

      toggle.addEventListener('click', () => {
        const open = aboutBox.hidden;
        aboutBox.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'No topic' : 'Add a topic';
        if (open) about.focus(); else about.value = 'general';
      });
      text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
      });
      text.addEventListener('input', () => { if (!err.hidden) { err.hidden = true; text.removeAttribute('aria-invalid'); } });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (send.disabled) return;
        err.hidden = true;
        formErr.hidden = true;
        text.removeAttribute('aria-invalid');
        const body = text.value;
        if (!body.trim()) {
          err.innerHTML = `${icon('alert')}Write your message first.`;
          err.hidden = false;
          text.setAttribute('aria-invalid', 'true');
          text.focus();
          return;
        }
        if (D8.data.READ_ONLY) { formErr.innerHTML = `${icon('alert')}<span>${esc(D8.data.DEMO_NOTE)} Your words are still here.</span>`; formErr.hidden = false; return; }
        const topic = aboutBox.hidden ? 'general' : about.value;
        // It shows in the thread at once, marked Sending, and is swapped for the saved one.
        const pending = { kind: 'message', id: 'sending', about: topic, text: body.trim(), at: D8.time.isoTime(ctx.client.now()), fromTeam: false, sending: true };
        if (last) draw({ ...last, items: [...last.items, pending] }, true);
        send.disabled = true;
        send.innerHTML = '<span class="spinner" aria-hidden="true"></span>Sending';
        D8.dialogs.slow(ctx.client.sendMessage(topic, body), 'the conversation').then(() => {
          if (text.value === body) text.value = ''; // anything typed while it sent stays
          if (!aboutBox.hidden) toggle.click();
          return quiet(true);
        }).catch((/** @type {any} */ e2) => {
          if (last) draw(last, true);
          if (e2 && e2.field === 'text') {
            err.innerHTML = `${icon('alert')}${esc(e2.message)}`;
            err.hidden = false;
            text.setAttribute('aria-invalid', 'true');
          } else if (e2 && e2.code === 'slow') {
            formErr.innerHTML = `${icon('alert')}<span>${esc(e2.message)} Your words are still here.</span>`;
            formErr.hidden = false;
          } else {
            formErr.innerHTML = `${icon('alert')}<span>That did not send. ${esc((e2 && e2.message) || '')} Your words are still here. Try again.</span>`;
            formErr.hidden = false;
          }
        }).then(() => {
          send.disabled = false;
          send.innerHTML = sendLabel;
          text.focus();
        });
      });
      return { retry: load, refresh: () => quiet() };
    }
  };

  /* ================================================================ SIGN IN */

  // Live, Clerk emails a 6-digit code (no return page to handle, and it works when the email is
  // opened on another device). The demo keeps its sign-in link wording and demo account.
  const isLive = () => !!(D8.auth && D8.auth.live);
  const sendLabel = () => 'Email me a code';
  /** Where the demo lives, when the live portal has one to point prospects to. */
  const demoUrl = () => String((/** @type {any} */ (window).D8CONFIG || {}).demoUrl || '');
  const signIn = {
    title: () => 'Sign in',
    standalone: true,
    render() {
      return `<div class="signin"><div class="signin-card">
        <p class="signin-brand"><img src="${esc(markSrc())}" alt="" width="44" height="25"><span>Domin8te</span></p>
        <h1 id="page-title" tabindex="-1">Sign in to your portal</h1>
        <p class="lede">We'll email you a 6-digit code. No password needed.</p>
        <form id="signin-form" novalidate>
          <div class="field"><label for="signin-email">Email address</label><input id="signin-email" name="email" type="email" autocomplete="email" inputmode="email" spellcheck="false" aria-describedby="err-email" value="${esc(/** @type {any} */ (window).__d8LastEmail || '')}"><p class="field-error" id="err-email" hidden></p></div>
          <button class="btn btn-solid btn-block" type="submit">${sendLabel()}</button>
        </form>
        <div id="signin-sent" hidden></div>
        <p class="meta signin-foot">${icon('lock')}<span>Only invited people can sign in. Our sign-in service handles this, and we never email passwords.</span></p>
        ${isLive() && demoUrl() ? `<p class="signin-demo">Not a client yet? <a href="${esc(demoUrl())}">See what owners see every Monday.</a></p>` : ''}
      </div></div>`;
    },
    mount(ctx, r, el) {
      const form = /** @type {HTMLFormElement} */ (el.querySelector('#signin-form'));
      const input = /** @type {HTMLInputElement} */ (form.elements.namedItem('email'));
      const err = /** @type {HTMLElement} */ (el.querySelector('#err-email'));
      const sent = /** @type {HTMLElement} */ (el.querySelector('#signin-sent'));
      const btn = /** @type {HTMLButtonElement} */ (form.querySelector('[type=submit]'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        err.hidden = true;
        input.removeAttribute('aria-invalid');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Sending';
        D8.auth.requestSignInLink(input.value).then((res) => {
          form.hidden = true;
          sent.hidden = false;
          if (res.code) {
            sent.innerHTML = `<div class="notice">${icon('mail')}<p><strong>Check your email.</strong> We sent a 6-digit code to ${esc(res.to)}.</p></div>
              <form id="code-form" novalidate>
                <div class="field"><label for="signin-code">Sign-in code</label><input id="signin-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" spellcheck="false" aria-describedby="err-code"><p class="field-error" id="err-code" hidden></p></div>
                <button class="btn btn-solid btn-block" type="submit">Sign in</button>
              </form>
              <button class="btn btn-glass btn-block" type="button" data-action="signin-again">Use a different email</button>`;
            mountCode(/** @type {HTMLFormElement} */ (sent.querySelector('#code-form')));
            return;
          }
          sent.innerHTML = `<div class="notice">${icon('mail')}<p><strong>This is a demo.</strong> In your real portal, the 6-digit code goes to ${esc(res.to)}. Here, no email is sent.</p></div>
            <button class="btn btn-solid btn-block" type="button" data-action="demo-sign-in">Open the demo account</button>
            <button class="btn btn-glass btn-block" type="button" data-action="signin-again">Use a different email</button>`;
          const next = /** @type {HTMLElement} */ (sent.querySelector('button'));
          next.focus();
        }).catch((e2) => {
          btn.disabled = false;
          btn.innerHTML = sendLabel();
          err.innerHTML = `${icon('alert')}${esc(e2.message)}`;
          err.hidden = false;
          input.setAttribute('aria-invalid', 'true');
          input.focus();
        });
      });
      el.addEventListener('click', (e) => {
        const t = /** @type {HTMLElement} */ (e.target);
        if (t.closest('[data-action="signin-again"]')) {
          sent.hidden = true;
          form.hidden = false;
          btn.disabled = false;
          btn.innerHTML = sendLabel();
          input.focus();
        }
      });
      /** The code step (live only): check the code, then open the portal. @param {HTMLFormElement} f */
      function mountCode(f) {
        const code = /** @type {HTMLInputElement} */ (f.elements.namedItem('code'));
        const cerr = /** @type {HTMLElement} */ (f.querySelector('#err-code'));
        const go = /** @type {HTMLButtonElement} */ (f.querySelector('[type=submit]'));
        code.focus();
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          cerr.hidden = true;
          code.removeAttribute('aria-invalid');
          go.disabled = true;
          go.innerHTML = '<span class="spinner" aria-hidden="true"></span>Signing in';
          D8.auth.verifyCode(code.value).then(() => ctx.signedIn()).catch((e3) => {
            go.disabled = false;
            go.innerHTML = 'Sign in';
            cerr.innerHTML = `${icon('alert')}${esc(e3.message)}`;
            cerr.hidden = false;
            code.setAttribute('aria-invalid', 'true');
            code.focus();
          });
        });
      }
      return {};
    }
  };

  const notFound = {
    title: () => 'Page not found',
    render() {
      return `<div class="page">${UI.PageHeader({ title: 'Page not found', intro: 'There is nothing here.' })}<p><a class="btn btn-solid" href="#/home">Go to your Home page</a></p></div>`;
    },
    mount() { return {}; }
  };

  D8.pages = { home, work, results, updates, billing, settings, messages, help, 'sign-in': signIn, notFound };
})(typeof window !== 'undefined' ? window : globalThis);
