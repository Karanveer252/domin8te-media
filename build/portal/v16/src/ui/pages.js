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
  /** The services a client does not have, quietly, under their plan (2026-10-08: plans can now shrink or grow).
   * @param {string[]} has */
  const planOff = (has) => {
    const off = (D8.data.SERVICE_ORDER || Object.keys(SVC())).filter((/** @type {string} */ s) => !has.includes(s) && SVC()[s]);
    return off.length ? `<div class="plan-off"><p class="plan-off-h">Not in your plan</p>
      <ul class="plan-list is-off">${off.map((/** @type {string} */ x) => `<li>${icon(SVC()[x].icon)}${esc(SVC()[x].label)}</li>`).join('')}</ul>
      <p class="plan-off-ask">Want one of these added? <a href="#/help">Send us a note</a>.</p></div>` : '';
  };
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
  const refreshButton = () => `<button class="btn btn-glass btn-sm" type="button" data-action="refresh">${icon('refresh')}Refresh</button>`;
  const setText = (scope, sel, text) => { const el = scope.querySelector(sel); if (el) el.textContent = text; };

  /* ================================================================ HOME */

  /**
   * The line under the greeting: when the figures were last verified against their sources,
   * then one clickable chip per source problem.
   */
  function freshLine(a, now) {
    const bits = [`<span class="verified">${icon('shield')}${a.updatedAt ? `Numbers checked ${esc(F.when(a.updatedAt, now))}` : 'Not checked yet'}</span>`];
    for (const s of a.problems) bits.push(UI.StatusChip(s, now));
    return `<div class="fresh-line" id="fresh-line">${bits.join('')}</div>`;
  }

  function accountBand(a, now) {
    const sub = a.subscription;
    const bill = sub.status === 'past_due'
      ? `<span class="badge tone-error">${icon('alert')}Payment problem</span><span class="acct-meta">Everything keeps running until ${esc(F.date(sub.graceUntil))}</span>`
      : `<span class="badge tone-success">${icon('check')}Paid up</span><span class="acct-meta">Next payment ${esc(F.date(sub.nextBilling))}</span>`;
    const meet = a.meeting
      ? `<span class="acct-value">${esc(F.date(a.meeting.at))} at ${esc(F.time(a.meeting.at))}</span><span class="acct-meta">${esc(a.meeting.title)}, ${esc(a.meeting.length)}</span>`
      : '<span class="acct-value">None booked</span>';
    const off = a.problems.filter((s) => s.state === 'disconnected' || s.state === 'error');
    const services = F.list(a.package.services.map((s, i) => { const l = SVC()[s].label; return i ? l.toLowerCase() : l; }));
    return `<dl class="acct-grid">
      <div class="acct-item"><dt>Your plan</dt><dd><span class="acct-value">${esc(a.package.name)}</span>${services.toLowerCase() === a.package.name.toLowerCase() ? '' : `<span class="acct-meta">${esc(services)}</span>`}</dd></div>
      <div class="acct-item"><dt>Next meeting</dt><dd>${meet}</dd></div>
      <div class="acct-item"><dt>Billing</dt><dd>${bill}<a class="link" href="#/billing">See billing</a></dd></div>
      <div class="acct-item"><dt>Talk to us</dt><dd>${a.team.reply ? `<span class="acct-meta">${esc(a.team.reply)}</span>` : ''}<button class="link-btn" type="button" data-action="compose" data-mode="message">Message us</button></dd></div>
      <div class="acct-item"><dt>Connected accounts</dt><dd><span class="acct-value">${a.connected} of ${a.sources.length} working</span><span class="acct-meta">${off.length ? `${esc(F.list(off.map((s) => s.name)))} ${off.length === 1 ? 'has a problem' : 'have a problem'}` : 'All working'}</span><a class="link" href="#/settings/sources">See connections</a></dd></div>
    </dl>`;
  }

  const home = {
    title: () => 'Home',
    render(ctx) {
      const now = ctx.client.now();
      const a = ctx.account;
      const parts = {
        strip: `<section class="sec sec-strip" aria-labelledby="h-strip">
          ${UI.SectionHead('h-strip', 'Last 30 days', '<p class="sec-meta"><span id="strip-range"></span> <a class="link" href="#/results">See all results</a></p>')}
          <div id="home-strip">${UI.Skeleton('strip', 4)}</div>
        </section>`,
        attention: `<section class="sec sec-attention" aria-labelledby="h-attention">
          ${UI.SectionHead('h-attention', 'Waiting for you <span class="count" id="attention-count" hidden></span>')}
          <div id="home-attention">${UI.Skeleton('row', 2)}</div>
        </section>`,
        work: `<section class="sec sec-work" aria-labelledby="h-work">
          ${UI.SectionHead('h-work', 'What we are working on', '<p class="sec-meta"><a class="link" href="#/work">See all work</a></p>')}
          <div id="home-work" class="work-grid">${UI.Skeleton('card', 4)}</div>
        </section>`,
        upcoming: HOME.upcoming ? `<section class="sec sec-upcoming" aria-labelledby="h-upcoming">
          ${UI.SectionHead('h-upcoming', 'Coming up', '<p class="sec-meta">The next few weeks</p>')}
          <div id="home-upcoming" class="upcoming-box">${UI.Skeleton('text', 3)}</div>
        </section>` : '',
        duo: `<div class="duo">
          <section class="sec" id="home-insight" aria-labelledby="h-insight">${UI.Skeleton('block', 1)}</section>
          <section class="sec" id="home-update" aria-labelledby="h-latest">${UI.Skeleton('block', 1)}</section>
        </div>`,
        account: `<section class="sec account-band" aria-labelledby="h-account">
          <h2 id="h-account" class="band-title">Your account</h2>
          <div id="home-account">${UI.Skeleton('text', 2)}</div>
        </section>`
      };
      const order = HOME.order || ['strip', 'attention', 'work', 'upcoming', 'duo', 'account'];
      return `<div class="page page-home">
        ${UI.PageHeader({ cls: 'is-home', title: `${F.greeting(now)}, ${a.user.firstName}.`, intro: '<span id="home-summary">Checking your account.</span>', introHtml: true, after: freshLine(a, now), aside: refreshButton() })}
        ${order.map((k) => parts[k] || '').join('\n        ')}
      </div>`;
    },
    mount(ctx, r, el) {
      const now = () => ctx.client.now();
      /** @type {number|null} */ let count = null;
      /** @type {any} */ let strip = null;
      const summary = () => {
        if (count === null || strip === null) return;
        const lead = count ? `${count} ${F.plural(count, 'thing is', 'things are')} waiting for you` : 'Nothing is waiting for you right now';
        const m = strip && strip.metrics.find((x) => x.state === 'ok' && x.change);
        const perf = !m ? '' : m.change.dir === 'flat'
          ? `${F.lcFirst(m.label)} are about the same as the 30 days before`
          : `${F.lcFirst(m.label)} are ${m.change.dir} ${Math.round(Math.abs(m.change.pct))}% on the 30 days before`;
        setText(el, '#home-summary', lead + (perf ? ', and ' + perf : '') + '.');
      };
      const loaders = {
        strip: () => section(el, '#home-strip', () => ctx.client.getStrip(30), (d) => {
          strip = d;
          setText(el, '#strip-range', `${F.range(d.window.from, d.window.to)}, compared with the 30 days before.`);
          summary();
          return UI.MetricStrip(d, now());
        }, () => { strip = false; summary(); return { title: "We couldn't load your numbers.", text: 'The rest of this page works.', retry: 'strip' }; }),
        // When nothing needs the client, the section turns into the all-caught-up state, which
        // also needs the next planned milestone and the latest win.
        attention: () => section(el, '#home-attention', () => ctx.client.getAttention()
          .then((items) => (items.length ? { items, highlights: null } : ctx.client.getHighlights().then((h) => ({ items, highlights: h })))), (d) => {
          count = d.items.length;
          const badge = /** @type {HTMLElement|null} */ (el.querySelector('#attention-count'));
          if (badge) { badge.innerHTML = `<span class="sr-only">: </span>${count}<span class="sr-only"> ${F.plural(count, 'item', 'items')}</span>`; badge.hidden = count === 0; }
          summary();
          ctx.setBadges(count);
          return count ? UI.ActionNeededList(d.items, now()) : UI.CaughtUp(d.highlights);
        }, () => ({ title: "We couldn't load what is waiting for you.", text: 'Nothing is lost. The rest of this page works.', retry: 'attention' })),
        work: () => section(el, '#home-work', () => ctx.client.getWorkSummary(), (list) => list.length
          ? list.map((s) => UI.ServiceWorkCard(s)).join('')
          : UI.EmptyState({ icon: 'work', title: 'No work started yet.', text: 'Your services show here once we start.' }),
          () => ({ title: "We couldn't load our work for you.", text: 'The rest of this page works.', retry: 'work' })),
        insight: () => section(el, '#home-insight', () => ctx.client.getInsight(), (ins) => UI.InsightCard(ins, now()),
          () => ({ title: "We couldn't work out what changed.", retry: 'insight' })),
        update: () => section(el, '#home-update', () => ctx.client.getUpdates(), (list) => list.length
          ? UI.UpdateCard(list[0], { compact: true, lead: UI.SectionHead('h-latest', 'Latest update') })
          // the same padding as the filled card (UpdateCard's .update): the empty one sat flush with its edge (2026-10-08)
          : `<div class="card update">${UI.SectionHead('h-latest', 'Latest update')}${UI.EmptyState({ icon: 'updates', title: 'No updates yet.', text: 'You get your first one when we finish something.' })}</div>`,
          () => ({ title: "We couldn't load the latest update.", retry: 'update' })),
        account: () => section(el, '#home-account', () => ctx.client.getAccount(), (a) => accountBand(a, now()),
          () => ({ title: "We couldn't load your account details.", retry: 'account' }))
      };
      if (HOME.upcoming) {
        loaders.upcoming = () => section(el, '#home-upcoming', () => ctx.client.getUpcoming(), (list) => UI.UpcomingList(list, now()),
          () => ({ title: "We couldn't load what is coming up.", text: 'The rest of this page works.', retry: 'upcoming' }));
      }
      Object.values(loaders).forEach((load) => load());
      return {
        refresh() {
          const fl = el.querySelector('#fresh-line');
          if (fl) fl.outerHTML = freshLine(ctx.account, now());
          Object.values(loaders).forEach((load) => load());
        },
        retry(which) {
          const f = loaders[which];
          if (!f) return;
          const box = /** @type {HTMLElement|null} */ (el.querySelector({ strip: '#home-strip', attention: '#home-attention', work: '#home-work', upcoming: '#home-upcoming', insight: '#home-insight', update: '#home-update', account: '#home-account' }[which] || ''));
          // A section that never loaded goes back to its placeholder; one with content keeps it, dimmed.
          if (box && !box.hasAttribute('data-loaded')) box.innerHTML = UI.Skeleton({ strip: 'strip', attention: 'row', work: 'card' }[which] || 'block', which === 'strip' ? 4 : which === 'work' ? 4 : 1);
          f();
        }
      };
    }
  };

  /* ================================================================ WORK */

  function actionButton(a, cls) {
    return a.primary.does === 'approval'
      ? `<button class="${cls}" type="button" data-action="approve" data-id="${esc(a.approvalId)}">${esc(a.primary.label)}</button>`
      : `<button class="${cls}" type="button" data-action="external" data-kind="${esc(a.primary.does)}">${esc(a.primary.label)}</button>`;
  }

  function blocker(a, now) {
    const d = a.deadline && a.deadline.kind === 'due' ? F.due(a.deadline.date, now) : null;
    const when = d ? `<p class="due tone-${d.tone}">${icon('calendar')}${esc(d.text)}</p>` : a.since ? `<p class="due tone-later">${icon('pause')}Paused since ${esc(F.date(a.since))}</p>` : '';
    const style = { critical: 'btn btn-primary', approval: 'btn btn-tint' }[a.severity] || 'btn btn-glass';
    return `<li><div><p class="blocker-title">${esc(a.title)}</p>${when}</div>${actionButton(a, style + ' btn-sm')}</li>`;
  }

  /* The Work page, made simple (2026-10-08, Karan: "make it as simple as possible so that even a five year old can
     read and interpret it"). Each service says three things in plain words (how it is going, what we are doing now,
     what happens next) and shows one list of steps: the team's board cards for that service when it has any,
     otherwise the steps typed on the console's Work tab (and older finished lines). What is left first, then the
     last few done. */
  const STEP = {
    you: ['Waiting for you', 'alert', 'attention'],
    now: ['Doing now', 'progress', 'info'],
    later: ['Later', 'clock', 'neutral'],
    hold: ['On hold', 'pause', 'neutral'],
    done: ['Done', 'check', 'success']
  };
  const STEP_ORDER = { you: 0, now: 1, later: 2, hold: 3 };
  const DONE_SHOWN = 3;
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
  /** @param {any} s */
  function stepList(s) {
    const { open, done } = steps(s);
    const all = open.length + done.length;
    if (!all) return '';
    const row = (/** @type {any} */ x) => {
      const st = /** @type {any} */ (STEP)[x.kind];
      const when = x.date ? (x.kind === 'done' ? F.date(x.date, { weekday: false }) : `by ${F.date(x.date, { weekday: false })}`) : '';
      return `<li class="step is-${x.kind}"><span class="step-dot">${icon(st[1])}</span><p class="step-title">${esc(x.title)}</p><p class="step-tag"><span data-tone="${st[2]}">${st[0]}</span>${when ? `<span class="meta">${esc(when)}</span>` : ''}</p></li>`;
    };
    return `<div class="steps-head"><h3>Steps</h3><p class="meta">${done.length} of ${all} done</p></div>
      <div class="ms-progress" aria-hidden="true">${[...done.map(() => 'is-on'), ...open.map((x) => x.kind === 'now' ? 'is-now' : '')].map((c) => `<span class="${c}"></span>`).join('')}</div>
      <ol class="steps">${open.map(row).join('')}${done.slice(0, DONE_SHOWN).map(row).join('')}</ol>
      ${done.length > DONE_SHOWN ? `<p class="meta steps-more">And ${done.length - DONE_SHOWN} more done before that</p>` : ''}`;
  }

  function serviceSection(s, actions, now) {
    const svc = SVC()[s.id];
    const needs = actions.filter((a) => a.service === s.id || (s.next && a.id === s.next.actionId));
    const by = s.expected && s.expected.date ? ` <span class="say-when">by ${esc(F.date(s.expected.date, { weekday: false }))}</span>` : '';
    return `<section class="card svc-section svc-simple" id="svc-${esc(s.id)}" tabindex="-1" aria-labelledby="h-svc-${esc(s.id)}">
      <header class="svc-head">
        <h2 id="h-svc-${esc(s.id)}">${icon(svc.icon)}${esc(svc.label)}</h2>${UI.StatusBadge(s.status)}
        <button class="btn btn-glass btn-sm" type="button" data-action="compose" data-mode="request" data-service="${esc(s.id)}">${icon('edit')}Ask for a change</button>
      </header>
      ${s.now || (s.next && s.next.text) ? `<dl class="say">
        ${s.now ? `<div><dt>Right now</dt><dd>${esc(s.now)}</dd></div>` : ''}
        ${s.next && s.next.text ? `<div><dt>Next</dt><dd>${UI.nextStep(s.next)}${by}</dd></div>` : ''}
      </dl>` : ''}
      ${needs.length ? `<div class="blocker"><h3>Waiting for you</h3><ul>${needs.map((a) => blocker(a, now)).join('')}</ul></div>` : ''}
      ${s.note ? `<p class="notice">${icon('info')}<span>${esc(s.note)}</span></p>` : ''}
      ${stepList(s)}
    </section>`;
  }

  const work = {
    title: () => 'Work',
    render(ctx) {
      const pkg = ctx.account.package.services;
      return `<div class="page page-work">
        ${UI.PageHeader({ title: 'Work', intro: 'What we are doing, what comes next, and what we need from you.' })}
        <nav class="jump" aria-label="Services on this page">${pkg.map((s) => `<a class="jump-link" href="#/work/${esc(s)}">${icon(SVC()[s].icon)}${esc(SVC()[s].label)}</a>`).join('')}</nav>
        <div id="work-body">${UI.Skeleton('block', 2)}</div>
      </div>`;
    },
    mount(ctx, r, el) {
      const load = () => section(el, '#work-body', () => ctx.client.getWork(), (w) => w.services.length
        ? w.services.map((s) => serviceSection(s, w.actions, ctx.client.now())).join('')
        : UI.EmptyState({ icon: 'work', title: 'No work started yet.', text: 'Your services show here once we start.' }),
      () => ({ title: "We couldn't load your work.", text: 'Your other pages still work. Try again soon.', retry: 'work' }))
        .then(() => {
          if (!r.sub) return;
          const t = /** @type {HTMLElement|null} */ (el.querySelector('#svc-' + r.sub));
          if (t) { t.scrollIntoView({ block: 'start' }); t.focus({ preventScroll: true }); }
        });
      load();
      return { retry: load, refresh: load };
    }
  };

  /* ================================================================ RESULTS */

  const pickDays = (v) => ([7, 30, 90].includes(Number(v)) ? Number(v) : 30);

  function resultTile(m, w, now) {
    if (m.state === 'error') {
      return `<div class="card mtile is-error"><p class="metric-label">${esc(m.label)}</p><p class="metric-empty">${icon('alert')}Couldn't load just now</p><p class="metric-meta">${esc(m.text)}</p><button class="link-btn" type="button" data-action="retry" data-section="results">Try again</button></div>`;
    }
    const note = UI.ComparisonNote(m, w.days);
    const prev = m.change && m.previous !== null ? `<p class="metric-prev">${F.num(m.previous)} in the ${w.days} days before</p>` : '';
    return `<div class="card mtile"><p class="metric-label">${esc(m.label)}</p><p class="metric-value"><span class="fig">${m.value === null ? 'None' : F.num(m.value)}</span>${UI.Delta(m)}</p>${prev}${note ? `<p class="metric-note">${note}</p>` : ''}<p class="metric-meta">${UI.sourceLine(m.sources, now)}</p></div>`;
  }

  function chartBlock(c, w) {
    const aria = `${c.label} per day, ${F.range(w.from, w.to)}. ${F.num(c.value)} in total${c.previous !== null ? `, compared with ${F.num(c.previous)} in the ${w.days} days before` : ''}. The same numbers are in the table below.`;
    const rows = c.points.map((p) => `<tr><th scope="row">${esc(F.date(p.d))}</th><td>${p.v === null ? 'No numbers' : F.num(p.v)}</td><td>${p.p === null ? 'No numbers' : F.num(p.p)}</td></tr>`).join('');
    return `<figure class="card chart-fig">
      <figcaption class="chart-cap"><span class="chart-title">${esc(c.label)} per day</span><span class="legend"><span class="lg lg-cur">${esc(F.range(w.from, w.to))}</span><span class="lg lg-prev">${esc(F.range(w.pFrom, w.pTo))}</span></span></figcaption>
      <div class="chart" role="img" aria-label="${esc(aria)}" data-points="${esc(JSON.stringify(c.points))}" data-days="${w.days}" data-unit="${esc(c.unit)}"></div>
      <details class="chart-table"><summary>Show these numbers as a table</summary><div class="table-wrap" tabindex="0" role="region" aria-label="${esc(c.label)} per day, as a table"><table><caption class="sr-only">${esc(c.label)} per day</caption><thead><tr><th scope="col">Day</th><th scope="col">${esc(F.range(w.from, w.to))}</th><th scope="col">Same day, ${w.days} days earlier</th></tr></thead><tbody>${rows}</tbody></table></div></details>
    </figure>`;
  }

  function campaigns(list) {
    return `<div class="card campaigns"><h3>Campaigns</h3><ul>${list.map((c) => `<li><div><p class="camp-name">${esc(c.name)}</p><p class="meta">${c.to ? esc(F.range(c.from, c.to)) : 'From ' + esc(F.date(c.from))} on ${esc(c.channel)}</p></div>${UI.StatusBadge(c.status === 'complete' ? 'complete' : c.status === 'planned' ? 'planned' : 'in_progress')}</li>`).join('')}</ul></div>`;
  }

  function group(g, w, now) {
    const head = UI.SectionHead('h-g-' + g.id, esc(g.title), `<p class="sec-meta">${esc(g.intro)}</p>`);
    if (g.state === 'error') {
      const who = F.list(g.sources.filter((s) => s.state === 'error').map((s) => s.name)) || 'The source';
      return `<section class="group" aria-labelledby="h-g-${esc(g.id)}">${head}${UI.ErrorState({ title: `We couldn't load your ${g.title.toLowerCase()} numbers.`, text: `${who} is not answering. The rest of this page works.`, retry: 'results' })}</section>`;
    }
    const tiles = g.metrics.map((m) => resultTile(m, w, now)).join('') + g.pending.map((p) =>
      `<div class="card mtile is-pending"><p class="metric-label">${esc(p.label)}</p><p class="metric-empty">${icon('linkoff')}Not connected yet</p><p class="metric-meta">${esc(p.text)}</p></div>`).join('');
    const notes = g.notes.map((n) => `<div class="notice is-off">${icon('linkoff')}<p>${esc(n.name)} has been disconnected since ${esc(F.date(n.since))}${n.lastDay ? `, so its numbers stop on ${esc(F.date(n.lastDay, { weekday: false }))}` : ''}. The gap means missing numbers, not a drop.</p><button class="btn btn-glass btn-sm" type="button" data-action="external" data-kind="connect-${esc(n.source)}">Reconnect ${esc(n.name)}</button></div>`).join('');
    return `<section class="group" aria-labelledby="h-g-${esc(g.id)}">${head}<div class="mtiles">${tiles}</div>${notes}${g.chart ? chartBlock(g.chart, w) : ''}${g.campaigns.length ? campaigns(g.campaigns) : ''}</section>`;
  }

  function resultsBody(res, now) {
    const out = [];
    if (res.summary) {
      out.push(`<section class="ai-summary" aria-labelledby="h-summary">
        <div class="sec-head"><h2 id="h-summary">Summary</h2><span class="ai-label">${icon('spark')}Written by the Domin8te assistant</span></div>
        <p class="ai-text">${esc(res.summary.text)}</p>
        <p class="meta">Written ${esc(F.when(res.summary.writtenAt, now))} from the numbers on this page. Every number below comes straight from your connected accounts.</p>
      </section>`);
    }
    if (!res.groups.length) out.push(UI.EmptyState({ icon: 'results', title: 'No results yet.', text: 'Numbers show here once your accounts are connected.' }));
    for (const g of res.groups) out.push(group(g, res.window, now));
    return out.join('');
  }

  const results = {
    title: () => 'Results',
    render(ctx, r) {
      const days = pickDays(r.params.days);
      // Basic shows the figures and the summary; Advanced adds the daily charts, their tables and campaigns.
      const detail = V.reportModes ? (pref('detail') === 'advanced' ? 'advanced' : 'basic') : '';
      const modes = detail ? UI.FilterChips([['basic', 'Basic'], ['advanced', 'Advanced']], detail, 'detail', 'How much detail to show') : '';
      return `<div class="page page-results"${detail ? ` data-detail="${detail}"` : ''}>
        ${UI.PageHeader({ title: 'Results', intro: 'How your marketing is doing. Each number says where it came from and when.', after: `<div class="range-bar">${UI.DateRangeSelector(days)}${modes}<p class="range-text" id="range-text" aria-live="polite"></p></div>` })}
        <div id="results-body">${UI.Skeleton('block', 3)}</div>
      </div>`;
    },
    mount(ctx, r, el) {
      let days = pickDays(r.params.days);
      const load = () => {
        const body = /** @type {HTMLElement} */ (el.querySelector('#results-body'));
        // Changing the range keeps the current figures on screen, dimmed, until the new ones arrive.
        if (!body.hasAttribute('data-loaded')) body.innerHTML = UI.Skeleton('block', 3);
        return section(el, '#results-body', () => ctx.client.getResults(days), (res) => {
          const w = res.window;
          setText(el, '#range-text', `Showing ${F.range(w.from, w.to)}, compared with ${F.range(w.pFrom, w.pTo)}.`);
          return resultsBody(res, ctx.client.now());
        }, () => ({ title: "We couldn't load your results.", text: 'Your other pages still work. Try again soon.', retry: 'results' }))
          .then(() => D8.charts.mountAll(el));
      };
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

  /* ================================================================ UPDATES */

  function feed(list) {
    /** @type {Array<{k: string, items: any[]}>} */
    const months = [];
    for (const u of list) {
      const k = u.date.slice(0, 7);
      let m = months.find((x) => x.k === k);
      if (!m) { m = { k, items: [] }; months.push(m); }
      m.items.push(u);
    }
    return months.map((m) => `<section class="feed-month" aria-labelledby="m-${m.k}"><h2 id="m-${m.k}">${esc(F.monthYear(m.k + '-01'))}</h2><div class="feed">${m.items.map((u) => UI.UpdateCard(u, { id: 'u-' + u.id })).join('')}</div></section>`).join('');
  }

  const updates = {
    title: () => 'Updates',
    render(ctx, r) {
      const pkg = ctx.account.package.services;
      const v = pkg.includes(r.params.service) ? r.params.service : 'all';
      const opts = [['all', 'All updates'], ...pkg.map((s) => [s, SVC()[s].label])];
      return `<div class="page page-updates">
        ${UI.PageHeader({ title: 'Updates', intro: 'What we did and what comes next. Newest first.', after: `<div class="filter-bar">${UI.FilterChips(opts, v, 'service', 'Show updates for')}</div>` })}
        <p class="sr-only" id="updates-status" aria-live="polite"></p>
        <div id="updates-body">${UI.Skeleton('card', 3)}</div>
      </div>`;
    },
    mount(ctx, r, el) {
      const pkg = ctx.account.package.services;
      let filter = pkg.includes(r.params.service) ? r.params.service : 'all';
      /** @type {any[]|null} */ let all = null;
      const draw = () => {
        const list = (all || []).filter((u) => filter === 'all' || u.service === filter);
        const label = filter === 'all' ? '' : SVC()[filter].label.toLowerCase() + ' ';
        setText(el, '#updates-status', `${list.length} ${label}${F.plural(list.length, 'update', 'updates')}`);
        return list.length ? feed(list) : UI.EmptyState({ icon: 'updates', title: `No ${label}updates yet.`, text: 'They show here when we finish something.' });
      };
      const load = () => section(el, '#updates-body', () => ctx.client.getUpdates(), (list) => { all = list; return draw(); },
        () => ({ title: "We couldn't load your updates.", text: 'Your other pages still work. Try again soon.', retry: 'updates' }));
      load();
      return {
        retry: load,
        refresh: load,
        change(name, value) {
          if (name !== 'service') return;
          filter = value;
          D8.ui.replaceHash(value === 'all' ? '#/updates' : '#/updates?service=' + value);
          const body = /** @type {HTMLElement|null} */ (el.querySelector('#updates-body'));
          if (all && body) body.innerHTML = draw();
        }
      };
    }
  };

  /* ================================================================ BILLING */

  function billingBody(b) {
    const s = b.subscription;
    const problem = s.status === 'past_due';
    const banner = problem ? `<section class="banner tone-error" aria-labelledby="h-bill-problem">
        ${icon('alert', 'banner-icon')}
        <div><h2 id="h-bill-problem">Your payment did not go through</h2><p>Your card ending ${esc(b.paymentMethod.last4)} was declined on ${esc(F.date(b.paymentMethod.problem.date))}. Everything keeps running until ${esc(F.longDate(s.graceUntil))}. Update your payment method so nothing stops.</p>${s.retryOn ? `<p class="meta">Stripe will try the card again on ${esc(F.date(s.retryOn))}.</p>` : ''}</div>
        <button class="btn btn-primary" type="button" data-action="external" data-kind="billing-portal">Update payment method</button>
      </section>` : '';
    const status = problem ? `<span class="badge tone-error">${icon('alert')}Payment problem</span>` : `<span class="badge tone-success">${icon('check')}Active</span>`;
    return `${banner}
      <div class="bill-grid">
        <section class="card bill-card" aria-labelledby="h-plan">
          <div class="sec-head"><h2 id="h-plan">Your plan</h2>${status}</div>
          <p class="plan-name">${esc(b.plan.name)}</p>
          <ul class="plan-list">${b.plan.services.map((x) => `<li>${icon(SVC()[x].icon)}${esc(SVC()[x].label)}</li>`).join('')}</ul>
          ${planOff(b.plan.services)}
          <dl class="facts"><div><dt>How you pay</dt><dd>${esc(b.plan.interval)}</dd></div><div><dt>Next payment</dt><dd>${esc(F.date(s.nextBilling, { year: true }))}</dd></div></dl>
        </section>
        <section class="card bill-card" aria-labelledby="h-pay">
          <div class="sec-head"><h2 id="h-pay">Payment method</h2></div>
          <p class="card-line">${icon('card')}${esc(b.paymentMethod.brand)} ending ${esc(b.paymentMethod.last4)}</p>
          ${b.paymentMethod.problem ? `<p class="due tone-overdue">${icon('alert')}${esc(b.paymentMethod.problem.text)}</p>` : ''}
          <p class="meta">Stripe keeps your card safe. We never see the full number.</p>
          <button class="btn btn-glass" type="button" data-action="external" data-kind="billing-portal">Change payment method${icon('external')}</button>
        </section>
      </div>
      <section class="sec" aria-labelledby="h-invoices">
        <div class="sec-head"><h2 id="h-invoices">Invoices</h2><p class="sec-meta">Each one opens on Stripe, with the amount and a PDF.</p></div>
        ${b.invoices.length ? `<div class="card"><ul class="invoices">${b.invoices.map((i) => UI.InvoiceRow(i)).join('')}</ul></div>` : UI.EmptyState({ icon: 'file', title: 'No invoices yet.', text: 'Your first one shows here when Stripe sends it.' })}
      </section>
      <p class="bill-help">Question about a charge? <button class="link-btn" type="button" data-action="compose" data-mode="message">Message us</button></p>`;
  }

  const billing = {
    title: () => 'Billing',
    render() {
      return `<div class="page page-billing">${UI.PageHeader({ title: 'Billing', intro: 'Your plan, payments and invoices.' })}<div id="billing-body">${UI.Skeleton('block', 2)}</div></div>`;
    },
    mount(ctx, r, el) {
      const load = () => section(el, '#billing-body', () => ctx.client.getBilling(), billingBody,
        () => ({ title: "We couldn't load your billing.", text: 'Your services are not affected. Try again soon.', retry: 'billing' }));
      load();
      return { retry: load, refresh: load };
    }
  };

  /* ================================================================ SETTINGS */

  function settingsBody(s, ctx) {
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const now = ctx.client.now();
    const rows = s.categories.map((c) => `<div class="toggle-row">
        <input class="switch" type="checkbox" id="n-${esc(c.id)}" name="${esc(c.id)}"${s.prefs[c.id] ? ' checked' : ''}${c.required ? ' disabled' : ''} aria-describedby="n-${esc(c.id)}-text">
        <label for="n-${esc(c.id)}"><span class="toggle-label">${esc(c.label)}</span><span class="toggle-text" id="n-${esc(c.id)}-text">${esc(c.text)}</span></label>
        ${c.required ? `<span class="badge tone-neutral">${icon('lock')}Always on</span>` : ''}
      </div>`).join('');
    const sources = s.sources.map((src) => {
      const when = src.state === 'disconnected' ? `Disconnected since ${F.date(src.since)}. Numbers after that are missing, not zero.`
        : src.state === 'error' ? 'Not answering right now. We keep trying on our own.'
          : src.state === 'stale' ? `Last updated ${F.ago(src.updatedAt, now)}. It usually updates several times a day.`
            : `Updated ${F.ago(src.updatedAt, now)}`;
      const act = src.state === 'disconnected' ? `<button class="btn btn-glass btn-sm" type="button" data-action="external" data-kind="connect-${esc(src.id)}">Reconnect<span class="sr-only"> ${esc(src.name)}</span></button>` : '';
      return `<li class="src-row"><div><p class="src-name">${esc(src.name)}</p><p class="meta">${esc(when)}</p></div>${UI.HealthBadge(src)}${act}</li>`;
    }).join('');
    return `<section class="card set-card" aria-labelledby="h-email">
        <h2 id="h-email">Email notifications</h2>
        <p class="meta">We send these to ${esc(s.email)}. Sign-in emails come from Clerk, our sign-in service, and always arrive.</p>
        <form id="notify-form" novalidate>
          <fieldset class="toggles"><legend class="sr-only">Emails you get</legend>${rows}</fieldset>
          <p class="form-error" role="alert" hidden></p>
          <div class="form-foot"><button class="btn btn-solid" type="submit" disabled>Save email choices</button><p class="meta" id="notify-status" aria-live="polite">${s.savedAt ? `Saved ${esc(F.when(s.savedAt, now))}.` : 'No changes yet.'}</p></div>
        </form>
      </section>
      <section class="card set-card" aria-labelledby="h-look">
        <h2 id="h-look">How it looks</h2>
        <fieldset class="theme-pick"><legend class="sr-only">Theme</legend>
          <label class="theme-opt"><input type="radio" name="theme" value="light" data-change="theme"${theme === 'light' ? ' checked' : ''}><span class="theme-swatch is-light" aria-hidden="true"></span><span><strong>Light</strong><span class="meta">The usual look</span></span></label>
          <label class="theme-opt"><input type="radio" name="theme" value="dark" data-change="theme"${theme === 'dark' ? ' checked' : ''}><span class="theme-swatch is-dark" aria-hidden="true"></span><span><strong>Dark</strong><span class="meta">Easier on the eyes at night</span></span></label>
        </fieldset>
      </section>
      <section class="card set-card" id="sources" tabindex="-1" aria-labelledby="h-sources">
        <h2 id="h-sources">Connected accounts</h2>
        <p class="meta">Where your numbers come from. We check each one several times a day.</p>
        <ul class="sources">${sources}</ul>
      </section>
      <section class="card set-card" aria-labelledby="h-security">
        <h2 id="h-security">Sign-in and security</h2>
        <p>You sign in with ${isLive() ? 'a 6-digit code' : 'a sign-in link'} we email to ${esc(s.email)}. No password to remember.</p>
        <p class="meta">Clerk, our sign-in service, looks after this.</p>
        <button class="btn btn-glass" type="button" data-action="external" data-kind="clerk-account">Manage sign-in and security${icon('external')}</button>
      </section>
      <section class="card set-card" aria-labelledby="h-people">
        <h2 id="h-people">People who can sign in</h2>
        <p>Want a login for your manager or someone else at the restaurant? Ask here and we set it up. They sign in with their own email. Nobody shares a password.</p>
        <form id="login-ask" class="ask-form" novalidate>
          <div class="ask-grid">
            <div class="field"><label for="la-first">Their first name</label><input id="la-first" name="first" type="text" maxlength="100" autocomplete="off" aria-describedby="la-err-first"><p class="field-error" id="la-err-first" hidden></p></div>
            <div class="field"><label for="la-email">Their email address</label><input id="la-email" name="email" type="email" maxlength="200" autocomplete="off" inputmode="email" spellcheck="false" aria-describedby="la-err-email"><p class="field-error" id="la-err-email" hidden></p></div>
            <div class="field"><label for="la-role">Their role <span class="optional">(optional)</span></label><input id="la-role" name="role" type="text" maxlength="60" placeholder="Manager"></div>
          </div>
          <p class="form-error" role="alert" hidden></p>
          <div class="form-foot"><button class="btn btn-solid" type="submit">${icon('message')}Ask for a login</button><p class="meta" id="la-status" aria-live="polite">${D8.live ? 'We usually set it up within one working day.' : 'This is a demo, so nothing is sent.'}</p></div>
        </form>
        <div id="la-list"></div>
      </section>`;
  }

  /* Asking for a login for someone else. Only a request: the account team creates logins in the
     agency console. Live portal only; the demo shows the form but sends nothing. */
  const ASK_STATUS = { pending: ['Asked', 'We will set it up'], granted: ['Login ready', 'They can sign in now'], declined: ['Not set up', 'We will be in touch'] };
  /** @param {HTMLElement} el */
  async function loadAsks(el) {
    const box = /** @type {HTMLElement|null} */ (el.querySelector('#la-list'));
    if (!box || !D8.live) return;
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
      if (!D8.live) { status.textContent = 'This is a demo, so nothing was sent. In your own portal, we would get this request.'; return; }
      const btn = /** @type {HTMLButtonElement} */ (form.querySelector('[type=submit]'));
      btn.disabled = true;
      try {
        const sb = await D8.live.db();
        const who = (ctx.account && ctx.account.user && ctx.account.user.firstName) || '';
        const r = await sb.from('login_requests').insert({ first_name: first, email, role: role || null, by_name: who }).select('id').single();
        if (r.error) throw r.error;
        form.reset();
        status.textContent = `Sent. We will set up a login for ${first} and let you know.`;
        loadAsks(el);
      } catch (x) {
        err.innerHTML = icon('alert') + esc("We couldn't send that. Try again soon, or message us.");
        err.hidden = false;
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
    const current = () => {
      /** @type {Record<string, boolean>} */ const p = {};
      for (const c of s.categories) p[c.id] = /** @type {HTMLInputElement} */ (form.elements.namedItem(c.id)).checked;
      return p;
    };
    const dirty = () => s.categories.some((c) => current()[c.id] !== saved[c.id]);
    form.addEventListener('change', () => { btn.disabled = !dirty(); if (dirty()) status.textContent = 'You have changes to save.'; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!dirty()) return;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Saving';
      err.hidden = true;
      ctx.client.saveNotifications(current()).then((res) => {
        saved = { ...res.prefs };
        btn.innerHTML = 'Save email choices';
        status.textContent = `Saved ${F.when(res.at, ctx.client.now())}.`;
        D8.dialogs.toast('Email choices saved.');
      }).catch((e2) => {
        btn.innerHTML = 'Save email choices';
        btn.disabled = false;
        err.innerHTML = `${icon('alert')}<span>We couldn't save, so nothing changed. ${esc(e2.message || '')} Try again.</span>`;
        err.hidden = false;
      });
    });
  }

  const settings = {
    title: () => 'Settings',
    render() {
      return `<div class="page page-settings">${UI.PageHeader({ title: 'Settings', intro: 'Your emails, how the portal looks, and where your numbers come from.' })}<div id="settings-body" class="settings-stack">${UI.Skeleton('block', 2)}</div></div>`;
    },
    mount(ctx, r, el) {
      const load = () => section(el, '#settings-body', () => ctx.client.getSettings(), (s) => settingsBody(s, ctx),
        () => ({ title: "We couldn't load your settings.", text: 'Nothing has changed. Try again soon.', retry: 'settings' }))
        .then((s) => {
          if (s) { wireSettings(el, s, ctx); wireLoginAsk(el, ctx); }
          if (r.sub === 'sources') {
            const t = /** @type {HTMLElement|null} */ (el.querySelector('#sources'));
            if (t) { t.scrollIntoView({ block: 'start' }); t.focus({ preventScroll: true }); }
          }
        });
      load();
      return { retry: load, refresh: load };
    }
  };

  /* ================================================================ HELP */

  const FAQ = [
    ['How fast do you make changes?', 'Small changes, like new opening hours or a menu price, usually go live within one working day. Bigger jobs, like a new page or an ad campaign, follow the dates on your Work page.'],
    ['How do approvals work?', 'When we need your OK, it shows under Waiting for you on your Home page, with a date. Approve it, or ask for changes with a short note. Nothing goes out until you approve it.'],
    ['Where do the numbers come from?', 'Straight from your connected accounts, like Google Business Profile and your booking system. Each number shows where it came from and when it was last updated. If an account disconnects, we tell you instead of guessing.'],
    ['What does "Waiting for you" mean?', 'We can\'t move that job forward until you answer something. The button next to it tells you what we need.'],
    ['How do I change my card or my plan?', 'Change your payment details on Stripe, from your Billing page. To change your plan, message us.'],
    ['Who can see my account?', 'You, the people at your restaurant we have given a login (ask for one in Settings), and the Domin8te team working for you. Other clients never see your numbers.']
  ];

  const help = {
    title: () => 'Help',
    render(ctx) {
      return `<div class="page page-help">
        ${UI.PageHeader({ title: 'Help', intro: 'How to reach us, and answers to common questions.' })}
        <div class="help-grid">
          <section class="card" aria-labelledby="h-contact">
            <h2 id="h-contact">Talk to us</h2>
            <p>${ctx.account.team.reply ? esc(ctx.account.team.reply) + '. ' : ''}Messages go straight to the people who work on your account.</p>
            <button class="btn btn-solid" type="button" data-action="compose" data-mode="message">${icon('message')}Message us</button>
            <h3 class="sub-h">Your messages</h3>
            <div id="help-messages">${UI.Skeleton('text', 2)}</div>
          </section>
          <section class="card" aria-labelledby="h-promises">
            <h2 id="h-promises">Our promises to you</h2>
            <ul class="promise-list">
              <li>${icon('check')}<span>We only publish posts, pages and ads you have approved.</span></li>
              <li>${icon('check')}<span>We never change your ad budget without asking you first.</span></li>
              <li>${icon('check')}<span>Every number comes straight from your connected accounts and shows when it was last updated.</span></li>
              <li>${icon('check')}<span>Summaries written by our assistant are labelled and checked against the numbers.</span></li>
              <li>${icon('check')}<span>Only people you invite can see your account.</span></li>
            </ul>
          </section>
        </div>
        <section class="sec" aria-labelledby="h-faq"><h2 id="h-faq" class="sec-title">Common questions</h2>
          <div class="card faq">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}${icon('chevron-down')}</summary><p>${esc(a)}</p></details>`).join('')}</div>
        </section>
      </div>`;
    },
    mount(ctx, r, el) {
      const load = () => section(el, '#help-messages', () => ctx.client.getMessages(), (list) => list.length
        // Live, the account team's replies sit in the same list, marked as theirs.
        ? `<ul class="sent-list">${list.map((m) => `<li${m.fromTeam ? ' class="is-team"' : ''}><p>${esc(m.text)}</p><p class="meta">${m.fromTeam ? `From ${esc(m.by || 'Domin8te')}, ` : 'Sent '}${esc(F.when(m.at, ctx.client.now()))}</p></li>`).join('')}</ul>`
        : '<p class="meta">You have not sent us a message yet.</p>',
      () => ({ title: "We couldn't load your messages.", retry: 'messages' }));
      load();
      return { retry: load, refresh: load };
    }
  };

  /* ================================================================ SIGN IN */

  // Live, Clerk emails a 6-digit code (no return page to handle, and it works when the email is
  // opened on another device). The demo keeps its sign-in link wording and demo account.
  const isLive = () => !!(D8.auth && D8.auth.live);
  const sendLabel = () => (isLive() ? 'Email me a code' : 'Email me a sign-in link');
  /** Where the demo lives, when the live portal has one to point prospects to. */
  const demoUrl = () => String((/** @type {any} */ (window).D8CONFIG || {}).demoUrl || '');
  const signIn = {
    title: () => 'Sign in',
    standalone: true,
    render() {
      return `<div class="signin"><div class="signin-card">
        <p class="signin-brand"><img src="${esc(markSrc())}" alt="" width="44" height="25"><span>Domin8te</span></p>
        <h1 id="page-title" tabindex="-1">Sign in to your portal</h1>
        <p class="lede">${isLive() ? "We'll email you a 6-digit code." : "We'll email you a sign-in link."} No password needed.</p>
        <form id="signin-form" novalidate>
          <div class="field"><label for="signin-email">Email address</label><input id="signin-email" name="email" type="email" autocomplete="email" inputmode="email" spellcheck="false" aria-describedby="err-email" value="${esc(/** @type {any} */ (window).__d8LastEmail || '')}"><p class="field-error" id="err-email" hidden></p></div>
          <button class="btn btn-solid btn-block" type="submit">${sendLabel()}</button>
        </form>
        <div id="signin-sent" hidden></div>
        <p class="meta signin-foot">${icon('lock')}<span>Only invited people can sign in. Clerk handles sign-in, and we never email passwords.</span></p>
        ${isLive() && demoUrl() ? `<p class="signin-demo">Not a client yet? <a href="${esc(demoUrl())}">See a demo of the portal</a></p>` : ''}
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
          sent.innerHTML = `<div class="notice">${icon('mail')}<p><strong>This is a demo.</strong> In your real portal, the sign-in link goes to ${esc(res.to)}. Here, no email is sent.</p></div>
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

  D8.pages = { home, work, results, updates, billing, settings, help, 'sign-in': signIn, notFound };
})(typeof window !== 'undefined' ? window : globalThis);
