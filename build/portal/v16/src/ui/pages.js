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
      <p class="plan-off-ask">Want one of these added? <a href="#/messages">Send us a note</a>.</p></div>` : '';
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
  const refreshButton = () => `<button class="btn btn-glass btn-sm" type="button" data-action="refresh" title="Asks your connected apps for their newest numbers.">${icon('refresh')}Check for new numbers</button>`;
  const day = UI.day;
  const span = UI.span;
  const label = UI.metricLabel;
  const replyLine = UI.replyLine;
  const setText = (scope, sel, text) => { const el = scope.querySelector(sel); if (el) el.textContent = text; };

  /* ================================================================ HOME */

  /* Home, as simple as it can be (2026-10-09 complexity review): the greeting and one sentence, what is
     waiting for the client, three numbers from the last 30 days, one row per service, and how to reach us.
     The biggest change moved into the Results summary, the latest update lives under Work > Done, the plan
     on Billing and the connected accounts in Settings. */

  /** The grey line under the numbers: when they were last checked against their sources. */
  function checkedText(a, now) {
    return a.updatedAt ? `Checked ${esc(F.when(a.updatedAt, now))}.` : 'Not checked yet.';
  }
  function checkedLine(a, now) {
    return `<p class="meta home-checked"><span id="home-checked">${checkedText(a, now)}</span> <a class="link" href="#/results">See all results</a></p>`;
  }

  /** Next meeting and Message us, in one quiet strip at the bottom of Home. */
  function contactStrip(a) {
    const m = a.meeting;
    const when = m && m.at ? `${day(m.at)} at ${F.time(m.at)}` : 'none booked';
    return `<section class="card contact-strip" aria-label="Talk to us">
      <p class="contact-meet">${icon('calendar')}<span>Next meeting: ${esc(when)}</span></p>
      <a class="btn btn-glass btn-sm" href="#/messages">${icon('message')}Message us</a>
    </section>`;
  }

  const home = {
    title: () => 'Home',
    render(ctx) {
      const now = ctx.client.now();
      const a = ctx.account;
      const parts = {
        attention: `<section class="sec sec-attention" aria-labelledby="h-attention">
          ${UI.SectionHead('h-attention', 'Waiting for you')}
          <div id="home-attention">${UI.Skeleton('row', 2)}</div>
        </section>`,
        strip: `<section class="sec sec-strip" aria-labelledby="h-strip">
          ${UI.SectionHead('h-strip', 'Last 30 days')}
          <div id="home-strip">${UI.Skeleton('strip', 3)}</div>
          ${checkedLine(a, now)}
        </section>`,
        work: `<section class="sec sec-work" aria-labelledby="h-work">
          ${UI.SectionHead('h-work', 'Your services', '<p class="sec-meta"><a class="link" href="#/work">See all work</a></p>')}
          <div id="home-work">${UI.Skeleton('card', 1)}</div>
        </section>`,
        upcoming: HOME.upcoming ? `<section class="sec sec-upcoming" aria-labelledby="h-upcoming">
          ${UI.SectionHead('h-upcoming', 'Coming up', '<p class="sec-meta">The next few weeks</p>')}
          <div id="home-upcoming" class="upcoming-box">${UI.Skeleton('text', 3)}</div>
        </section>` : ''
      };
      const order = HOME.order || ['attention', 'strip', 'work', 'upcoming'];
      return `<div class="page page-home">
        ${UI.PageHeader({ cls: 'is-home', title: `${F.greeting(now)}, ${a.user.firstName}.`, intro: '<span id="home-summary">Checking your account.</span>', introHtml: true })}
        ${order.map((k) => parts[k] || '').join('\n        ')}
        ${contactStrip(a)}
      </div>`;
    },
    mount(ctx, r, el) {
      const now = () => ctx.client.now();
      /** @type {number|null} */ let count = null;
      /** @type {any} */ let strip = null;
      const summary = () => {
        if (count === null || strip === null) return;
        const lead = count ? `${count} ${F.plural(count, 'thing needs', 'things need')} you.` : 'Nothing needs you right now.';
        const m = strip && strip.metrics.find((x) => x.state === 'ok' && x.change);
        const what = m ? F.lcFirst(label(m.label)) : '';
        const perf = !m ? '' : m.change.dir === 'flat'
          ? ` Your ${what} were about the same as the month before.`
          : ` You got ${Math.round(Math.abs(m.change.pct))}% ${m.change.dir === 'up' ? 'more' : 'fewer'} ${what} than the month before.`;
        setText(el, '#home-summary', lead + perf);
      };
      const loaders = {
        strip: () => section(el, '#home-strip', () => ctx.client.getStrip(30), (d) => {
          strip = d;
          summary();
          // Three numbers on Home; directions and where each number comes from are on Results.
          return UI.MetricStrip(d, now(), { max: 3, skip: ['directions'], sources: false });
        }, () => { strip = false; summary(); return { title: "We couldn't load your numbers.", text: 'The rest of this page works.', retry: 'strip' }; }),
        // When nothing needs the client, the section turns into the all-caught-up state, which
        // also needs the next planned milestone and the latest win.
        attention: () => section(el, '#home-attention', () => ctx.client.getAttention()
          .then((items) => (items.length ? { items, highlights: null } : ctx.client.getHighlights().then((h) => ({ items, highlights: h })))), (d) => {
          count = d.items.length;
          summary();
          ctx.setBadges(d.items);
          return count ? UI.ActionNeededList(d.items, now()) : UI.CaughtUp(d.highlights);
        }, () => ({ title: "We couldn't load what is waiting for you.", text: 'Nothing is lost. The rest of this page works.', retry: 'attention' })),
        // The rows need what is waiting for the client too, to say when a service's next step is theirs.
        work: () => section(el, '#home-work', () => Promise.all([ctx.client.getWorkSummary(), ctx.client.getAttention().catch(() => [])]), ([list, acts]) => list.length
          ? UI.ServiceRows(list, acts)
          : UI.EmptyState({ icon: 'work', title: 'No work started yet.', text: 'Your services show here once we start.' }),
          () => ({ title: "We couldn't load our work for you.", text: 'The rest of this page works.', retry: 'work' }))
      };
      if (HOME.upcoming) {
        loaders.upcoming = () => section(el, '#home-upcoming', () => ctx.client.getUpcoming(), (list) => UI.UpcomingList(list, now()),
          () => ({ title: "We couldn't load what is coming up.", text: 'The rest of this page works.', retry: 'upcoming' }));
      }
      Object.values(loaders).forEach((load) => load());
      return {
        refresh() {
          const c = el.querySelector('#home-checked');
          if (c) c.innerHTML = checkedText(ctx.account, now());
          Object.values(loaders).forEach((load) => load());
        },
        retry(which) {
          const f = loaders[which];
          if (!f) return;
          const box = /** @type {HTMLElement|null} */ (el.querySelector({ strip: '#home-strip', attention: '#home-attention', work: '#home-work', upcoming: '#home-upcoming' }[which] || ''));
          // A section that never loaded goes back to its placeholder; one with content keeps it, dimmed.
          if (box && !box.hasAttribute('data-loaded')) box.innerHTML = UI.Skeleton({ strip: 'strip', attention: 'row', work: 'card' }[which] || 'block', which === 'strip' ? 3 : 1);
          f();
        }
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
  /** The steps: "N of M done", what is left, and the done ones behind "Show N done steps". One colour per row: the icon's. @param {any} s */
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
      ${done.length ? `<details class="steps-earlier"><summary class="btn-text">Show ${done.length} done ${F.plural(done.length, 'step', 'steps')}${icon('chevron-down')}</summary><ol class="steps">${done.map(row).join('')}</ol></details>` : ''}`;
  }

  /** @param {any} s @param {any[]} actions */
  function serviceSection(s, actions) {
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
      <p class="svc-now"><span class="svc-now-label">Right now:</span> ${esc(s.now || 'Getting started')}</p>
      ${note}
      ${stepList(s)}
    </section>`;
  }

  /** The top of Work, on both tabs: the title, one Ask for a change (it asks which service), and Now / Done. @param {'now'|'done'} cur */
  function workHead(cur) {
    const ask = `<button class="btn btn-glass btn-sm" type="button" data-action="compose" data-mode="request" title="Tell us anything you want different. We usually reply within one working day.">${icon('edit')}Ask for a change</button>`;
    const tab = (/** @type {string} */ id, /** @type {string} */ href, /** @type {string} */ text) => `<a class="work-tab" href="${href}"${cur === id ? ' aria-current="page"' : ''}>${text}</a>`;
    return `${UI.PageHeader({ title: 'Work', intro: cur === 'done' ? 'Everything we finished for you, newest first.' : 'What we are doing for you now, step by step.', aside: ask })}
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
      const load = () => section(el, '#work-body', () => ctx.client.getWork(), (w) => w.services.length
        ? w.services.map((s) => serviceSection(s, w.actions)).join('')
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

  /** One figure: its name, the number and its change, and the number before. Where it comes from is said once, under the group's heading. */
  function resultTile(m, w) {
    const name = label(m.label);
    if (m.state === 'error') {
      return `<div class="card mtile is-error"><p class="metric-label">${esc(name)}</p><p class="metric-empty">${icon('alert')}Couldn't load just now</p><p class="metric-meta">${esc(m.text)}</p><button class="link-btn" type="button" data-action="retry" data-section="results">Try again</button></div>`;
    }
    const note = UI.ComparisonNote(m, w.days);
    const prev = m.change && m.previous !== null ? `<p class="metric-prev">${F.num(m.previous)} in the ${w.days} days before</p>` : '';
    return `<div class="card mtile"><p class="metric-label">${esc(name)}</p><p class="metric-value"><span class="fig">${m.value === null ? 'None' : F.num(m.value)}</span>${UI.Delta(m, w.days)}${UI.NewBadge(m, w.days)}</p>${prev}${note ? `<p class="metric-note">${note}</p>` : ''}</div>`;
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

  /** @param {any} g @param {any} w @param {number} now @param {{chartShown: boolean}} seen whether a chart is already open on the page */
  function group(g, w, now, seen) {
    const head = UI.SectionHead('h-g-' + g.id, esc(g.title), `<p class="sec-meta">${esc(groupIntro(g))}</p>`);
    if (g.state === 'error') {
      const who = F.list(g.sources.filter((s) => s.state === 'error').map((s) => s.name)) || 'The source';
      return `<section class="group" aria-labelledby="h-g-${esc(g.id)}">${head}${UI.ErrorState({ title: `We couldn't load your ${g.title.toLowerCase()} numbers.`, text: `${who} is not answering. The rest of this page works.`, retry: 'results' })}</section>`;
    }
    const tiles = g.metrics.map((m) => resultTile(m, w)).join('') + g.pending.map((p) =>
      `<div class="card mtile is-pending"><p class="metric-label">${esc(label(p.label))}</p><p class="metric-empty">${icon('linkoff')}Not connected yet</p><p class="metric-meta">${esc(p.text)}</p></div>`).join('');
    // The note stays; reconnecting is done from Waiting for you on Home and from Settings.
    const notes = g.notes.map((n) => `<div class="notice is-off">${icon('linkoff')}<p>${esc(n.name)} has been disconnected since ${esc(day(n.since))}${n.lastDay ? `, so its numbers stop on ${esc(day(n.lastDay))}` : ''}. The gap means missing numbers, not a drop.</p></div>`).join('');
    let chart = '';
    if (g.chart) { chart = chartBlock(g.chart, w, seen.chartShown); seen.chartShown = true; }
    return `<section class="group" aria-labelledby="h-g-${esc(g.id)}">${head}${groupSources(g, now)}<div class="mtiles">${tiles}</div>${notes}${chart}${g.campaigns.length ? campaigns(g.campaigns) : ''}</section>`;
  }

  /** The summary at the top: the assistant's few lines (labelled) and the biggest change this month, in one card. */
  function summaryCard(res, ins) {
    const big = ins && ins.state !== 'error' && ins.state !== 'none' && ins.headline ? ins : null;
    if (!res.summary && !big) return '';
    return `<section class="ai-summary" aria-labelledby="h-summary">
        <div class="sec-head"><h2 id="h-summary">Summary</h2>${res.summary ? `<span class="ai-label">${icon('spark')}Written by our AI assistant, checked against the numbers below.</span>` : ''}</div>
        ${res.summary ? `<p class="ai-text">${esc(res.summary.text)}</p>` : ''}
        ${big ? `<p class="ai-big"><strong>Biggest change this month:</strong> ${esc(big.headline)} ${esc(big.detail || '')}</p>` : ''}
      </section>`;
  }

  function resultsBody(res, ins, now) {
    const out = [];
    // The biggest change is a 30-day comparison, so it joins the summary on the 30-day view.
    out.push(summaryCard(res, res.window.days === 30 ? ins : null));
    if (!res.groups.length) out.push(UI.EmptyState({ icon: 'results', title: 'No results yet.', text: 'Numbers show here once your accounts are connected.' }));
    const seen = { chartShown: false };
    for (const g of res.groups) out.push(group(g, res.window, now, seen));
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
        ${UI.PageHeader({ title: 'Results', intro: 'How your marketing is doing, and where each number comes from.', after: `<div class="range-bar">${UI.DateRangeSelector(days)}${modes}${refreshButton()}<p class="range-text" id="range-text" aria-live="polite"></p></div>` })}
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
        return section(el, '#results-body', () => Promise.all([ctx.client.getResults(days), ctx.client.getInsight().catch(() => null)]), ([res, ins]) => {
          const w = res.window;
          setText(el, '#range-text', `${F.range(w.from, w.to)} vs the ${w.days} days before`);
          return resultsBody(res, ins, ctx.client.now());
        }, () => ({ title: "We couldn't load your results.", text: 'Your other pages still work. Try again soon.', retry: 'results' }))
          .then(() => D8.charts.mountAll(el));
      };
      // A folded chart is drawn when it opens, at its real width. (The page element, not main, which outlives it.)
      const page = el.querySelector('.page-results');
      if (page) page.addEventListener('toggle', (e) => {
        const d = /** @type {HTMLElement} */ (e.target);
        if (d && d.classList && d.classList.contains('fold-chart') && /** @type {HTMLDetailsElement} */ (d).open) D8.charts.mountAll(d);
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
    return months.map((m) => `<section class="feed-month" aria-labelledby="m-${m.k}"><h2 id="m-${m.k}">${esc(F.monthYear(m.k + '-01'))}</h2><div class="feed">${m.items.map((u) => UI.UpdateCard(u, { id: 'u-' + u.id })).join('')}</div></section>`).join('');
  }

  /* The updates are the Done tab of Work (2026-10-09). #/updates still opens them, with ?service= kept. */
  const updates = {
    title: () => 'Work',
    render(ctx, r) {
      const pkg = ctx.account.package.services;
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
          filter = pkg.includes(value) ? value : 'all';
          D8.ui.replaceHash(filter === 'all' ? '#/updates' : '#/updates?service=' + filter);
          const body = /** @type {HTMLElement|null} */ (el.querySelector('#updates-body'));
          if (all && body) body.innerHTML = draw();
        }
      };
    }
  };

  /* ================================================================ BILLING */

  /* Billing, simplified (2026-10-09): one banner while a payment failed (with the one Update payment method
     button), one card for the plan and the card, and the last three invoices with the older ones folded. */
  const INVOICES_SHOWN = 3;
  function billingBody(b) {
    const s = b.subscription;
    const problem = s.status === 'past_due';
    const banner = problem ? `<section class="banner tone-error" aria-labelledby="h-bill-problem">
        ${icon('alert', 'banner-icon')}
        <div><h2 id="h-bill-problem">Your payment did not go through</h2><p>Your card ending ${esc(b.paymentMethod.last4)} was declined on ${esc(day(b.paymentMethod.problem.date))}. Everything keeps running until ${esc(day(s.graceUntil))}. If the payment still fails, services pause after that.</p>${s.retryOn ? `<details class="fold fold-quiet"><summary>See details${icon('chevron-down')}</summary><p class="meta">Stripe, our payment service, will try your card again on ${esc(day(s.retryOn))}.</p></details>` : ''}</div>
        <button class="btn btn-primary" type="button" data-action="external" data-kind="billing-portal">Update payment method</button>
      </section>` : '';
    const rows = (/** @type {any[]} */ list) => list.map((i) => UI.InvoiceRow(i, { problemShown: problem })).join('');
    const recent = b.invoices.slice(0, INVOICES_SHOWN);
    const older = b.invoices.slice(INVOICES_SHOWN);
    return `${banner}
      <section class="card bill-card bill-one" aria-labelledby="h-plan">
        <div class="sec-head"><h2 id="h-plan">Your plan</h2>${problem ? '' : `<span class="badge tone-success">${icon('check')}Active</span>`}</div>
        <p class="plan-name">${esc(b.plan.name)}</p>
        <ul class="plan-list">${b.plan.services.map((x) => `<li>${icon(SVC()[x].icon)}${esc(SVC()[x].label)}</li>`).join('')}</ul>
        ${planOff(b.plan.services)}
        <dl class="facts"><div><dt>How you pay</dt><dd>${esc(b.plan.interval)}</dd></div><div><dt>Next payment</dt><dd>${esc(day(s.nextBilling))}</dd></div><div><dt>Card</dt><dd class="card-line">${icon('card')}${esc(b.paymentMethod.brand)} ending ${esc(b.paymentMethod.last4)}</dd></div></dl>
        ${!problem && b.paymentMethod.problem ? `<p class="due tone-overdue">${icon('alert')}${esc(b.paymentMethod.problem.text)}</p>` : ''}
        <p class="meta">Stripe (our payment service) keeps your card safe. We never see the full number.</p>
        ${problem ? '' : `<button class="btn btn-glass btn-sm" type="button" data-action="external" data-kind="billing-portal">Change card${icon('external')}</button>`}
      </section>
      <section class="sec" aria-labelledby="h-invoices">
        <div class="sec-head"><h2 id="h-invoices">Invoices</h2></div>
        ${b.invoices.length ? `<div class="card"><ul class="invoices">${rows(recent)}</ul>${older.length ? `<details class="fold fold-invoices"><summary>See older invoices${icon('chevron-down')}</summary><ul class="invoices">${rows(older)}</ul></details>` : ''}</div>` : UI.EmptyState({ icon: 'file', title: 'No invoices yet.', text: 'Your first one shows here when Stripe sends it.' })}
      </section>
      <p class="bill-help">Question about a charge? <a class="link" href="#/messages">Message us</a></p>`;
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

  /* Settings, simplified (2026-10-09): Connected accounts (a count, only the ones with a problem, the rest folded),
     Who can sign in (sign-in and asking for a login, merged), Emails (the optional ones folded) and How it looks
     (folded). */
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
    const text = { connect: 'Connect', reconnect: 'Reconnect', disconnect: 'Disconnect' }[mode];
    const tip = mode === 'disconnect' ? `Shows how to remove our access to ${src.name}` : `Shows how to let us into ${src.name}. We never see your password.`;
    const act = src.pending ? '' : `<button class="btn ${mode === 'disconnect' ? 'btn-text src-off' : 'btn-glass'} btn-sm" type="button" data-action="account" data-source="${esc(src.id)}" data-mode="${mode}" title="${esc(tip)}">${text}<span class="sr-only"> ${esc(src.name)}</span></button>`;
    const about = UI.sourceAbout(src);
    return `<li class="src-row"><div><p class="src-name">${esc(src.name)}</p>${about ? `<p class="src-about">${esc(about)}</p>` : ''}<p class="meta">${esc(when)}</p></div>${src.pending ? `<span class="badge tone-info">${icon('clock')}Waiting for us to confirm</span>` : UI.HealthBadge(src)}${act}</li>`;
  }

  function settingsBody(s, ctx) {
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
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
    return `<section class="card set-card" id="sources" tabindex="-1" aria-labelledby="h-sources">
        <div class="sec-head"><h2 id="h-sources">Connected accounts</h2><p class="sec-meta set-count">${esc(count)}</p></div>
        ${problems.length ? `<ul class="sources">${problems.map((src) => sourceRow(src, now)).join('')}</ul>` : ''}
        ${fine.length ? `<details class="fold fold-sources"${problems.length ? '' : ' open'}><summary>See all connections${icon('chevron-down')}</summary><p class="meta">You connect and disconnect on the app's own page. We never see your password.</p><ul class="sources">${fine.map((src) => sourceRow(src, now)).join('')}</ul></details>` : ''}
      </section>
      <section class="card set-card" aria-labelledby="h-people">
        <h2 id="h-people">Who can sign in</h2>
        <p>You sign in as ${esc(s.email)} with ${isLive() ? 'a 6-digit code' : 'a sign-in link'} we email you. No password to remember.</p>
        <div class="set-actions">
          <button class="btn btn-glass btn-sm" type="button" data-action="external" data-kind="clerk-account">Manage your sign-in${icon('external')}</button>
          <button class="btn btn-glass btn-sm" type="button" data-action="add-login" aria-expanded="false" aria-controls="login-ask">${icon('message')}Add someone</button>
        </div>
        <form id="login-ask" class="ask-form" novalidate hidden>
          <p>Ask for a login for your manager or someone else at the restaurant. They sign in with their own email. Nobody shares a password.</p>
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
        <p class="meta">We send these to ${esc(s.email)}. Payment problems and sign-in emails are always sent.</p>
        <details class="fold fold-emails">
          <summary>Choose which emails you get${icon('chevron-down')}</summary>
          <form id="notify-form" novalidate>
            <fieldset class="toggles"><legend class="sr-only">Emails you get</legend>${rows}</fieldset>
            <p class="form-error" role="alert" hidden></p>
            <div class="form-foot"><button class="btn btn-solid" type="submit" disabled>Save changes</button><p class="meta" id="notify-status" aria-live="polite">${s.savedAt ? `Saved ${esc(F.when(s.savedAt, now))}.` : 'No changes yet.'}</p></div>
          </form>
        </details>
      </section>
      <section class="card set-card" aria-labelledby="h-look">
        <details class="fold fold-look">
          <summary><h2 id="h-look">How it looks</h2>${icon('chevron-down')}</summary>
          <fieldset class="theme-pick"><legend class="pick-legend">Colours</legend>
            <label class="theme-opt"><input type="radio" name="theme" value="light" data-change="theme"${theme === 'light' ? ' checked' : ''}><span class="theme-swatch is-light" aria-hidden="true"></span><span><strong>Light</strong><span class="meta">The usual look</span></span></label>
            <label class="theme-opt"><input type="radio" name="theme" value="dark" data-change="theme"${theme === 'dark' ? ' checked' : ''}><span class="theme-swatch is-dark" aria-hidden="true"></span><span><strong>Dark</strong><span class="meta">Easier on the eyes at night</span></span></label>
          </fieldset>
        </details>
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
    // The form shows once the client presses Add someone.
    const add = /** @type {HTMLButtonElement|null} */ (el.querySelector('[data-action="add-login"]'));
    if (add) add.addEventListener('click', () => {
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
      // The always-on emails have no switch: they keep their saved value.
      for (const c of s.categories) {
        const box = /** @type {HTMLInputElement|null} */ (form.elements.namedItem(c.id));
        p[c.id] = box ? box.checked : saved[c.id];
      }
      return p;
    };
    const dirty = () => s.categories.some((c) => current()[c.id] !== saved[c.id]);
    form.addEventListener('change', () => { btn.disabled = !dirty(); status.textContent = dirty() ? 'You have unsaved changes. Press Save changes to keep them.' : 'No unsaved changes.'; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!dirty()) return;
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
    render() {
      return `<div class="page page-settings">${UI.PageHeader({ title: 'Settings', intro: 'Your connected accounts, who can sign in, your emails and how the portal looks.' })}<div id="settings-body" class="settings-stack">${UI.Skeleton('block', 2)}</div></div>`;
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

  /* Help (2026-10-09): one card that leads to Messages, where the conversation lives now, then the
     common questions, with our promises as one of them. */
  const PROMISES = [
    'We only publish posts, pages and ads you have approved.',
    'We never change your ad budget without asking you first.',
    'Every number comes straight from your connected accounts and shows when it was last updated.',
    'Summaries written by our assistant are labelled and checked against the numbers.',
    'Only people you invite can see your account.'
  ];
  const FAQ = [
    ['What we promise', `<ul class="promise-list">${PROMISES.map((p) => `<li>${icon('check')}<span>${esc(p)}</span></li>`).join('')}</ul>`],
    ['How fast do you make changes?', 'Small changes, like new opening hours or a menu price, usually go live within one working day. Bigger jobs, like a new page or an ad campaign, follow the dates on your Work page.'],
    ['How do approvals work?', 'When we need your OK, it shows under Waiting for you on your Home page, with a date. Approve it, or ask for changes with a short note. Nothing goes out until you approve it.'],
    ['Where do the numbers come from?', 'Straight from your connected accounts, like Google Business Profile (your listing on Google and Maps) and your booking system. Each number shows where it came from and when it was last updated. If an account disconnects, we tell you instead of guessing.'],
    ['How do I change my card or my plan?', 'Change your payment details on Stripe (our payment service), from your Billing page. To change your plan, message us.'],
    ['Who can see my account?', 'You, the people at your restaurant we have given a login (ask for one in Settings), and the Domin8te team working for you. Other clients never see your numbers.']
  ];

  const help = {
    title: () => 'Help',
    render(ctx) {
      return `<div class="page page-help">
        ${UI.PageHeader({ title: 'Help', intro: 'How to reach us, and answers to common questions.' })}
        <section class="card help-contact" aria-labelledby="h-contact">
          <div class="help-contact-row">
            <div><h2 id="h-contact">Have a question? Message us</h2><p>${ctx.account.team.reply ? esc(replyLine(ctx.account.team.reply)) + ' ' : ''}Messages go straight to the people who work on your account.</p></div>
            <a class="btn btn-solid" href="#/messages">${icon('message')}Go to Messages</a>
          </div>
        </section>
        <section class="sec" aria-labelledby="h-faq"><h2 id="h-faq" class="sec-title">Common questions</h2>
          <div class="card faq">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}${icon('chevron-down')}</summary>${a.startsWith('<') ? a : `<p>${esc(a)}</p>`}</details>`).join('')}</div>
        </section>
      </div>`;
    },
    mount() { return {}; }
  };

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
      return `<div class="page page-messages">
        ${UI.PageHeader({ title: 'Messages', intro: `Talk to your Domin8te team. ${reply}` })}
        <section class="card msg-card" aria-labelledby="h-thread">
          <h2 id="h-thread" class="sr-only">Your conversation with Domin8te</h2>
          <div class="msg-scroll" id="msg-thread" role="log" aria-label="Messages with Domin8te" tabindex="0">${UI.Skeleton('text', 1)}</div>
          <form class="msg-compose" id="msg-form" novalidate>
            <div class="field msg-about" id="msg-about-box" hidden><label for="msg-about-pick">What is it about?</label><select id="msg-about-pick" name="about"><option value="general">General</option>${pkg.map((/** @type {string} */ x) => `<option value="${esc(x)}">${esc(SVC()[x].label)}</option>`).join('')}<option value="billing">Billing</option></select></div>
            <label class="sr-only" for="msg-new">Write a message</label>
            <textarea id="msg-new" name="text" rows="2" maxlength="2000" placeholder="Write a message" aria-describedby="msg-new-err msg-keys"></textarea>
            <p class="field-error" id="msg-new-err" hidden></p>
            <p class="form-error" id="msg-form-err" role="alert" hidden></p>
            <div class="msg-compose-foot">
              <button class="link-btn msg-about-toggle" type="button" aria-expanded="false" aria-controls="msg-about-box">Add a topic</button>
              <span class="hint msg-keys" id="msg-keys">Ctrl and Enter sends</span>
              <button class="btn btn-solid msg-send" type="submit">Send${icon('arrow-right')}</button>
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
      /** @param {any} th */
      function keep(th) {
        if (seenBefore === undefined) seenBefore = th.seenAt;
        last = th;
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
      // A reply shows up without a reload: every minute while Messages is open and in view.
      if (msgTimer) clearInterval(msgTimer);
      msgTimer = setInterval(() => {
        if (!document.contains(box)) { clearInterval(msgTimer); msgTimer = null; return; }
        if (document.hidden) return;
        ctx.client.refresh().then(() => quiet()).catch(() => { /* offline for a moment: the next minute tries again */ });
      }, 60000);

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
        const topic = aboutBox.hidden ? 'general' : about.value;
        // It shows in the thread at once, marked Sending, and is swapped for the saved one.
        const pending = { kind: 'message', id: 'sending', about: topic, text: body.trim(), at: D8.time.isoTime(ctx.client.now()), fromTeam: false, sending: true };
        if (last) draw({ ...last, items: [...last.items, pending] }, true);
        send.disabled = true;
        send.innerHTML = '<span class="spinner" aria-hidden="true"></span>Sending';
        ctx.client.sendMessage(topic, body).then(() => {
          text.value = '';
          if (!aboutBox.hidden) toggle.click();
          return quiet(true);
        }).catch((/** @type {any} */ e2) => {
          if (last) draw(last, true);
          if (e2 && e2.field === 'text') {
            err.innerHTML = `${icon('alert')}${esc(e2.message)}`;
            err.hidden = false;
            text.setAttribute('aria-invalid', 'true');
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
        <p class="meta signin-foot">${icon('lock')}<span>Only invited people can sign in. Our sign-in service handles this, and we never email passwords.</span></p>
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

  D8.pages = { home, work, results, updates, billing, settings, messages, help, 'sign-in': signIn, notFound };
})(typeof window !== 'undefined' ? window : globalThis);
