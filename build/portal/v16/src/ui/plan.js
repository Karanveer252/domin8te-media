// @ts-check
/*
 * The plan, as the client sees it (2026-10-13): the pieces Home and Work show (what runs this month and how much of it is
 * used, what is coming, what changes next month) and the helpers the other plan files share. Billing is in
 * plan-billing.js, the picker in plan-picker.js and the limit check inside "Ask for a change" in plan-ask.js. Every number comes from D8.planModel
 * (data/plan-model.js); these files only draw it. No price is written in them: prices come from the database and only show
 * in the signed-in portal.
 */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});
  const F = D8.fmt;
  const UI = D8.ui;
  const esc = F.esc;
  const icon = UI.icon;
  const day = (/** @type {string} */ x) => F.date(x);
  const svc = (/** @type {string} */ id) => D8.data.SERVICES[id] || { label: id, icon: 'layers' };

  /** A plan's price ("$12.50"), or nothing: only when the database gave one (never in the public demo). @param {any} c */
  const price = (c) => (c && c.priceMinor !== null && c.priceMinor !== undefined ? F.money(c.priceMinor, c.currency) : '');
  /** The same price with its rhythm: "$12.50 a month". @param {any} c */
  const perMonth = (c) => (price(c) ? `${price(c)} a month` : '');
  /** In the public demo the limits are samples, and say so. */
  const sample = () => (D8.data.MODE === 'demo' ? '<span class="chip-sample">sample limit</span>' : '');
  /** @param {string} id */
  const ico = (id) => `<span class="svc-ico is-${esc(id)}">${icon(svc(id).icon)}</span>`;

  /** What each service is, in a few plain words. */
  const ABOUT = {
    advertising: 'Facebook, Instagram and Google ads',
    social: 'Posts for Facebook and Instagram',
    website: 'Hosting, care and updates',
    local: 'Google and Apple Maps, reviews, search',
    email: 'Email campaigns and automatic emails, with a welcome email'
  };
  /** What comes with each plan besides its services. A summary and calls are facts, not limits (release default 20): change them here. */
  const INCLUDED = {
    starter: ['A monthly summary in your dashboard'],
    growth: ['A monthly summary in your dashboard', 'A 15 minute call each month'],
    domin8te: ['A monthly summary in your dashboard', 'A 30 minute call each month', 'A short video walkthrough']
  };
  /** Ad spend is separate from the plan fee (release default 18): change the sentence here. */
  const AD_SPEND = 'Ad spend is paid to Meta and Google directly and is not part of your plan.';
  /** What a plan is, in a line. @param {any} p a menu plan */
  function blurb(p) {
    if (p.id === 'domin8te') return p.locked && !p.current ? 'Every service, set up with Karan. Not open to new clients right now.' : p.full ? 'Every service, set up with Karan. Taken right now.' : 'Every service, set up with Karan.';
    if (p.rule.fixed.length) return `${F.list(p.rule.fixed.map((/** @type {string} */ x) => svc(x).label))}, plus ${p.rule.choose === 1 ? 'one service' : p.rule.choose + ' services'} you choose`;
    return `Any ${p.rule.choose === 2 ? 'two' : p.rule.choose} services you choose`;
  }
  /** @param {string[]} picks */
  const chips = (picks) => `<ul class="chips">${picks.map((/** @type {string} */ id) => `<li class="chip">${esc(svc(id).label)}</li>`).join('')}</ul>`;
  /** @param {string} iso a day */
  const stamp = (iso) => `${day(iso)}, 11:59 PM`;

  /* ---- a staff-written section, when staff made one visible ---------------------------------------------------- */

  /** What staff wrote for a part of Home: a title, a few lines, a short list. @param {any} sec */
  function staffNote(sec) {
    if (!sec || !sec.content) return '';
    const c = sec.content;
    if (!c.title && !c.body && !(c.items && c.items.length)) return '';
    return `<div class="staff-note">${c.title ? `<h3>${esc(c.title)}</h3>` : ''}${c.body ? `<p>${esc(c.body)}</p>` : ''}${c.items && c.items.length ? `<ul>${c.items.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<p class="pc-source">Source: ${esc(sec.source || 'Domin8te console')}</p></div>`;
  }

  /* ---- Home ------------------------------------------------------------------------------------------------------ */

  /**
   * Nothing is waiting for the client: one calm banner that says where the plan stands. A change they chose says so.
   * @param {any} m the plan model @param {{staff?: any, facts?: string}} [o]
   */
  function banner(m, o = {}) {
    const c = m.now;
    const n = m.next;
    const changing = m.confirmed && m.changes.differs;
    let title;
    let text;
    if (changing) {
      title = m.changes.planChanged ? `Your new plan starts ${day(m.bill)}` : `Your services change on ${day(m.bill)}`;
      text = `You chose ${m.changes.planChanged ? n.name : 'your new services'}${n.confirmedAt ? ` on ${day(n.confirmedAt)}` : ''}. Nothing to do. ${F.list(c.services.map((/** @type {any} */ s) => s.label))} keep running until then.`;
    } else {
      title = 'All running as normal';
      const p = price(n || c);
      text = `You're on ${c.name}. ${p ? `Next bill ${p} on ${day(m.bill)}.` : `Your next bill is on ${day(m.bill)}.`} Nothing to do.`;
    }
    const staff = o.staff && o.staff.content && (o.staff.content.title || o.staff.content.body) ? o.staff.content : null;
    return `<div class="card plan-banner${changing ? ' is-change' : ''}">
      <span class="pb-icon" aria-hidden="true">${icon('check')}</span>
      <div class="pb-body">
        <h3 class="pb-title">${esc(staff && staff.title ? staff.title : title)}</h3>
        <p class="pb-text">${esc(staff && staff.body ? staff.body : text)}</p>
        ${o.facts || ''}
      </div>
      <a class="btn btn-glass pb-go" href="#/billing">See billing${icon('arrow-right')}</a>
    </div>`;
  }

  /**
   * The plan's services with what is used of each this month: the left card on Home.
   * @param {any} m the plan model @param {{summary?: any[], actions?: any[], staff?: any}} [o]
   */
  function runningNow(m, o = {}) {
    const c = m.now;
    const sum = new Map((o.summary || []).map((/** @type {any} */ s) => [s.id, s]));
    const rows = c.services.map((/** @type {any} */ s) => {
      const w = sum.get(s.id);
      const act = w && w.next && w.next.actionId ? (o.actions || []).find((/** @type {any} */ a) => a.id === w.next.actionId) : null;
      const yours = w && ((act && w.next.who === 'client') || w.status === 'waiting');
      const status = !w ? '' : yours ? '<span class="svc-row-wait">Waiting for you</span>' : UI.StatusBadge(w.status);
      return `<li class="run-svc">
        ${ico(s.id)}
        <div class="run-main">
          <div class="run-top"><h3 class="run-name"><a href="#/work/${esc(s.id)}">${esc(s.label)}<span class="sr-only">: see the work</span></a></h3>${status}</div>
          ${w && w.now ? `<p class="run-now">${esc(w.now)}</p>` : ''}
          ${s.lines.length ? `<div class="run-usage">${s.lines.map((/** @type {any} */ l) => UI.UsageBar(l, { chip: sample() })).join('')}</div>` : ''}
        </div>
      </li>`;
    }).join('');
    return `<section class="card plan-card plan-running" aria-labelledby="h-running">
      <header class="pc-head">
        <div><h2 id="h-running">Running now</h2><p class="pc-sub">This month: ${esc(day(c.start))} to ${esc(day(m.lastDay))}${D8.data.MODE === 'demo' ? ' · sample usage' : ''}</p></div>
        <span class="plan-chip">${esc(c.name)}</span>
      </header>
      ${staffNote(o.staff)}
      <ul class="run-list">${rows}</ul>
      ${o.staff ? '' : '<p class="pc-source">Source: Domin8te console</p>'}
    </section>`;
  }

  /** @param {{state: string, title: string, text: string}[]} items */
  function timeline(items) {
    return `<ol class="tl">${items.map((x) => `<li class="tl-item is-${x.state}"><span class="tl-dot" aria-hidden="true">${x.state === 'done' ? icon('check') : ''}</span><div><p class="tl-title">${x.title}</p>${x.text ? `<p class="tl-text">${x.text}</p>` : ''}</div></li>`).join('')}</ol>`;
  }

  /** What is coming: the month that started, the last day to change, the reminders, the next bill. @param {any} m @param {any} [staff] */
  function comingUp(m, staff) {
    const c = m.now;
    const p = price(m.next || c);
    const [d7, d3] = m.reminders;
    const items = [
      { state: 'done', title: `${esc(day(c.start))}: month started`, text: `Your ${esc(c.name)} services are running.` },
      m.open
        ? { state: 'todo', title: `${esc(day(m.lastDay))}: last day to change next month`, text: `Do nothing and it stays the same. We email you on ${esc(day(d7.date))} and ${esc(day(d3.date))}.` }
        : { state: 'todo', title: 'Next month is set', text: 'The last day to change it has passed. Message us if something is wrong.' },
      { state: 'todo', title: `${esc(day(m.bill))}: next bill`, text: p ? `Next bill: ${esc(p)}.` : `${esc((m.next || c).name)} renews for another month.` }
    ];
    return `<section class="card plan-card plan-coming" aria-labelledby="h-coming">
      <header class="pc-head"><div><h2 id="h-coming">Coming up</h2></div></header>
      ${staffNote(staff)}
      ${timeline(items)}
    </section>`;
  }

  /** What changes next month: each service stays, arrives or stops. @param {any} m @param {any} [staff] */
  function whatChanges(m, staff) {
    const c = m.now;
    const n = m.next;
    const p = price(n);
    const was = price(c);
    const order = D8.planModel.ORDER;
    const ids = order.filter((/** @type {string} */ id) => m.changes.keeps.includes(id) || m.changes.adds.includes(id) || m.changes.stops.includes(id));
    const rows = ids.map((/** @type {string} */ id) => {
      const s = svc(id);
      const kind = m.changes.adds.includes(id) ? 'adds' : m.changes.stops.includes(id) ? 'stops' : 'keeps';
      const ns = n.services.find((/** @type {any} */ x) => x.id === id);
      const text = kind === 'keeps' ? 'No change' : kind === 'adds' ? `New: ${(ns && ns.summary ? F.lcFirst(ns.summary) : 'getting started')}` : `Paused after ${day(m.lastDay)}. Saved, not deleted.`;
      const word = { keeps: 'Keeps', adds: 'Adds', stops: 'Stops' }[kind];
      return `<li class="chg-row is-${kind}">${ico(id)}<div><p class="chg-name">${esc(s.label)}</p><p class="chg-text">${esc(text)}</p></div><span class="chg-tag">${word}</span></li>`;
    }).join('');
    return `<section class="card plan-card plan-changes" aria-labelledby="h-changes">
      <header class="pc-head"><div><h2 id="h-changes">What changes on ${esc(day(m.bill))}</h2><p class="pc-sub">${esc(n.name)}${p ? ` · ${esc(p)} a month${was && was !== p ? ` (now ${esc(was)})` : ''}` : ''}</p></div></header>
      ${staffNote(staff)}
      <ul class="chg-list">${rows}</ul>
      <p class="pc-foot">Picked the wrong thing? <a class="link" href="#/messages">Message Karan</a>${m.open ? ` before ${esc(day(m.lastDay))}` : ''}.</p>
    </section>`;
  }

  /** Home, when no month of a plan is set up yet. */
  function notSetUp() {
    return `<section class="card plan-card plan-none" aria-labelledby="h-none">
      <div class="empty">${icon('card', 'empty-icon')}<div><h2 id="h-none" class="empty-title">Your plan is not set up yet.</h2><p class="empty-text">Message us and we will sort it out. Nothing is lost.</p><a class="btn btn-glass btn-sm" href="#/messages">${icon('message')}Message us</a></div></div>
    </section>`;
  }

  /* ---- Work ------------------------------------------------------------------------------------------------------- */

  /** A service's usage on the Work page: a bar for each limit and when it resets. @param {any} s a service with usage @param {any} m */
  function workUsage(s, m) {
    if (!s.usage || !s.usage.length) return '';
    return `<div class="work-usage"><h3 class="sr-only">Used this month</h3>${s.usage.map((/** @type {any} */ l) => UI.UsageBar(l, { chip: sample(), plain: true })).join('')}<p class="usage-reset">Resets ${esc(day(m.bill))}</p></div>`;
  }
  /**
   * A service that is not in this month's plan: one quiet card (its icon tile, its name, the word that says so, and the
   * way to add it), the same row shape as Running now on Home so it reads as a service at rest, not a broken one.
   * @param {{id: string, label: string}[]} off @param {any} m
   */
  function offCards(off, m) {
    if (!off.length) return '';
    return off.map((s) => `<section class="card svc-off" aria-labelledby="off-${esc(s.id)}">
      ${ico(s.id)}
      <div class="off-body">
        <header class="svc-head"><h2 id="off-${esc(s.id)}">${esc(s.label)}</h2><span class="badge tone-neutral">Not in this month's plan</span></header>
        <p>Your work is saved. ${m && m.open ? `You can add ${esc(s.label)} for the month that starts ${esc(day(m.bill))} from <a class="link" href="#/billing/change">Billing</a>.` : `You can add ${esc(s.label)} from Billing for a later month.`}</p>
      </div>
    </section>`).join('');
  }


  D8.plan = { price, perMonth, sample, ico, ABOUT, INCLUDED, AD_SPEND, blurb, chips, stamp, timeline, staffNote, banner, runningNow, comingUp, whatChanges, notSetUp, workUsage, offCards };
})(typeof window !== 'undefined' ? window : globalThis);
