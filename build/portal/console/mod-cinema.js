// @ts-check
/*
 * Cinematic view (#/cinema), 2026-10-15: the agency console as a full-screen command centre, switched on from the sidebar,
 * the jump palette (Ctrl K, "Cinematic view") or the address. The normal console is untouched: this is an extra view on the
 * same data the console already loaded (clients, Needs you, cards, plans, bills, reminders, bot drafts and messages), drawn
 * on a dark stage with depth and motion. Nothing here writes; every panel is a link to the real page.
 *
 * The panels: a morning brief (three plain sentences), the client constellation (every client as an orb on a slowly turning
 * 3D ring, sized by plan, with a halo for what needs you and a ring for its health), the Needs you radar (items sweep in by
 * urgency), the work river (every open card by stage, over-limit cards glowing amber or red like the console's own meters),
 * the next 14 days (bill days, bill reminders, plan picks, promised dates, meetings, renewals and snoozed drafts waking), the
 * bot feed (drafts waiting, by bot), client health (a score and a plain "why" for each client) and, for the business owner only,
 * the money pulse (this month's income, costs and profit with the income goal ring; nobody else and never the demo sees money).
 * A Tour cycles the panels for a screen on the wall. Keys: arrows move between clients, Enter opens one, Space pauses, T tours,
 * Esc closes. With less motion asked for, the same data sits still.
 *
 * Money: only when mod-revenue.js says the signed-in person is the business owner (rpc am_business_owner through its visible()),
 * read with the read-only business_lines for this month. The demo console has no money at all.
 *
 * console.js calls window.D8C_EXT.cinema.page() from its router and lists the place in the jump palette.
 */
(function () {
  'use strict';
  const W = /** @type {any} */ (window);
  /** @type {any} */
  const EXT = (W.D8C_EXT = W.D8C_EXT || {});
  const C = () => W.D8C;
  const esc = (/** @type {any} */ s) => C().esc(s);
  const DAY = 86400000;
  const SPIN_PERIOD = 90000;   // one full turn of the ring, in ms
  const TOUR_MS = 7000;
  const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const demo = () => !!W.D8DEMO_SITE;
  const part = (/** @type {string} */ name) => (EXT[name] && typeof EXT[name] === 'object' ? EXT[name] : null);

  /** The address to go back to when the view closes: the last one that was not this view. */
  let backTo = '#/queue';
  window.addEventListener('hashchange', () => { if (!/^#\/cinema/.test(location.hash)) backTo = location.hash || '#/queue'; });

  /** The view on screen, or null. */
  /** @type {null | {root: HTMLElement, raf: number, spin: number, want: number|null, paused: boolean, sel: number, n: number, tour: {on: boolean, i: number, at: number}, timers: number[], at: number, model: any, counts: {el: HTMLElement, to: number, from: number, t0: number, text: (n: number) => string}[], off: (() => void)[], last: number}} */
  let live = null;

  /* ---- the data, from what the console already holds -------------------------------------------------------------- */

  /** A plan's rank 1 to 3 by its sort (Starter, Growth, Domin8te). @param {any} plan */
  function tierOf(plan) {
    if (!plan) return 1;
    const plans = (C().plans.plans || []).slice().sort((/** @type {any} */ a, /** @type {any} */ b) => Number(a.sort) - Number(b.sort));
    const i = plans.findIndex((/** @type {any} */ x) => x.id === plan.id);
    return i < 0 ? 1 : Math.max(1, Math.min(3, i + 1));
  }
  /** The worst of a client's limits: over, full, warn or ok. @param {any[]} lines */
  const worstTone = (lines) => (lines.some((l) => l.tone === 'over') ? 'over' : lines.some((l) => l.tone === 'full') ? 'full' : lines.some((l) => l.tone === 'warn') ? 'warn' : 'ok');
  /** Whole days since a stamp, or null. @param {string} iso */
  const daysSince = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)) : null);

  /**
   * A client's health: 100 minus what is wrong, with the reasons in plain words. Needs you items, limits past or at the cap,
   * a payment past due, a pause, silence on Messages and approvals they are late on all count.
   * @param {any} x the client's gathered facts
   */
  function healthOf(x) {
    let score = 100;
    /** @type {string[]} */ const why = [];
    const nn = x.nn;
    if (nn) { score -= Math.min(48, nn * 12); why.push(nn === 1 ? '1 thing needs you' : `${nn} things need you`); }
    const over = x.lines.filter((/** @type {any} */ l) => l.tone === 'over').length;
    const full = x.lines.filter((/** @type {any} */ l) => l.tone === 'full').length;
    if (over) { score -= 15; why.push(over === 1 ? '1 limit over' : `${over} limits over`); }
    else if (full) { score -= 6; why.push(full === 1 ? '1 limit at the cap' : `${full} limits at the cap`); }
    if (x.bill.status === 'past_due') { score -= 20; why.push('payment past due'); }
    if (x.t.status === 'paused') { score -= 10; why.push('paused'); }
    const lateTheirs = x.waiting.filter((/** @type {any} */ w) => w.late).length;
    if (lateTheirs) { score -= Math.min(12, lateTheirs * 6); why.push(lateTheirs === 1 ? 'an approval they are late on' : `${lateTheirs} approvals they are late on`); }
    if (x.lastDays !== null && x.lastDays >= 14) { score -= 15; why.push(`no word for ${x.lastDays} days`); }
    else if (x.lastDays !== null && x.lastDays >= 7) { score -= 8; why.push(`quiet for ${x.lastDays} days`); }
    else if (x.lastDays === null && x.t.status === 'active') { score -= 5; why.push('no messages yet'); }
    score = Math.max(0, Math.min(100, score));
    const grade = score >= 80 ? 'Good' : score >= 55 ? 'Watch' : 'At risk';
    return { score, grade, tone: score >= 80 ? 'good' : score >= 55 ? 'warn' : 'bad', why: why.length ? why.slice(0, 3).join(', ') : 'Nothing is wrong' };
  }

  /** Everything the panels draw, worked out from the console's loaded data. */
  function gather() {
    const K = C();
    const all = K.all;
    const Col = part('color');
    const B = part('bot');
    const Wk = part('work');
    const today = K.today();
    const end14 = K.localDay(new Date(Date.now() + 14 * DAY));
    const inWindow = (/** @type {string} */ d) => !!d && d >= today && d <= end14;
    const tenants = (all.tenants || []).filter((/** @type {any} */ t) => t.status !== 'archived');
    const nameOf = (/** @type {string} */ id) => { const t = K.tenant(id); return t ? t.name : 'A client'; };
    /** @type {any[]} */ const needsAll = [];
    /** @type {any[]} */ const days = [];
    const clients = tenants.map((/** @type {any} */ t) => {
      const d = K.derive(t);
      const reviews = K.reviewCount(t.id);
      const p = K.planOf(t.id);
      const bill = K.billingOf(t);
      const c = K.convo(t.id);
      const openCards = (all.tasks || []).filter((/** @type {any} */ k) => k.tenant_id === t.id && k.status !== 'done' && k.status !== 'cancelled').length;
      const x = { t, id: t.id, name: t.name, needs: d.needs, waiting: d.waiting, soon: d.soon, reviews, nn: d.needs.length + reviews, plan: p.nowPlan ? p.nowPlan.name : p.nextPlan ? p.nextPlan.name : '', tier: tierOf(p.nowPlan || p.nextPlan),
        lines: p.lines, tone: worstTone(p.lines), bill, convoWaiting: !!c.waiting, lastAt: c.lastAt || '', lastDays: daysSince(c.lastAt || ''), openCards, botN: B ? B.waitingFor(t.id) : 0, href: `#/client/${t.id}`, health: /** @type {any} */ (null),
        logo: Col ? Col.logoOf(t.id) : '', tag: Col ? Col.tagOf(t.id) : t.name.slice(0, 2).toUpperCase(), color: Col ? Col.of(t.id) : '' };
      x.health = healthOf(x);
      for (const n of d.needs) needsAll.push({ ...n, client: t.name, id: t.id, urgency: n.late || n.rank === 0 ? 0 : n.rank === 1 ? 1 : 2, when: n.dueDate ? K.due(n.dueDate).text : n.at ? K.ago(n.at) : '' });
      if (reviews) needsAll.push({ kind: 'review', label: reviews === 1 ? 'Check before it goes live' : `${reviews} to check before they go live`, text: 'Items and invoices waiting for your OK', client: t.name, id: t.id, href: '#/queue', urgency: 1, when: '' });
      // The next 14 days: what the console knows a date for.
      for (const s of d.soon) if (inWindow(s.dueDate)) days.push({ date: s.dueDate, kind: s.kind, label: s.kind === 'renewal' ? 'Renews' : s.kind === 'meeting' ? 'Meeting' : 'Promised', text: s.kind === 'expected' ? `${s.label}: ${s.text}` : s.text, client: t.name, href: s.href, tone: s.kind === 'meeting' ? 'them' : 'info' });
      for (const n of d.needs) if (inWindow(n.dueDate)) days.push({ date: n.dueDate, kind: n.kind, label: n.label, text: n.text, client: t.name, href: n.href, tone: 'you' });
      for (const w of d.waiting) if (inWindow(w.dueDate)) days.push({ date: w.dueDate, kind: 'approval', label: 'Their approval due', text: w.text, client: t.name, href: w.href, tone: 'them' });
      if (p.now && inWindow(p.now.period_end)) days.push({ date: p.now.period_end, kind: 'bill', label: 'Bill day', text: `${p.nowPlan ? p.nowPlan.name : 'Plan'} month ends; the next one starts`, client: t.name, href: `#/billing/${t.id}`, tone: 'info' });
      if (p.now && inWindow(p.now.period_end) && (!p.next || (p.next.state !== 'confirmed' && p.next.state !== 'active'))) days.push({ date: p.now.period_end, kind: 'pick', label: 'Plan pick due', text: 'Next month is not confirmed yet', client: t.name, href: `#/billing/${t.id}`, tone: 'you' });
      for (const r of (all.plans && all.plans.reminders) || []) if (r.tenant_id === t.id && r.status === 'scheduled' && inWindow(K.dayOf(r.send_at))) days.push({ date: K.dayOf(r.send_at), kind: 'reminder', label: 'Bill reminder', text: `${r.kind === 'd7' ? '7 days' : r.kind === 'd3' ? '3 days' : 'Shortly'} before the bill, by email`, client: t.name, href: `#/billing/${t.id}`, tone: 'info' });
      return x;
    });
    // Work: every open card by stage, with Done kept to the last 14 days so the river shows what just landed.
    const since = new Date(Date.now() - 14 * DAY).toISOString();
    const liveIds = new Set(tenants.map((/** @type {any} */ t) => t.id));
    /** @type {any[]} */ const cards = [];
    for (const k of all.tasks || []) {
      if (!liveIds.has(k.tenant_id) || k.status === 'cancelled') continue;
      if (k.status === 'done' && String(k.updated_at || '') < since) continue;
      let glow = '';
      if (Wk && k.status !== 'done') {
        try { if (Wk.flagged(k)) { const i = Wk.infoFor(k); glow = i && i.line && i.to > i.line.cap && !i.ex ? 'over' : 'warn'; } } catch (e) { glow = ''; }
      }
      cards.push({ id: k.id, tenant_id: k.tenant_id, client: nameOf(k.tenant_id), title: String(k.title || 'Card'), status: k.status, glow, due: k.due || '', late: !!(k.due && k.due < today && k.status !== 'done'), href: `#/client/${k.tenant_id}/work/cards` });
    }
    const STAGES = [['todo', 'To do'], ['in_progress', 'In progress'], ['in_review', 'In review'], ['blocked', 'Blocked'], ['done', 'Done']];
    const work = STAGES.map(([key, label]) => ({ key, label, cards: cards.filter((c) => c.status === key) }));
    needsAll.sort((a, b) => a.urgency - b.urgency || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
    days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const pastDue = clients.filter((x) => x.bill.status === 'past_due').length;
    const msgWaiting = clients.filter((x) => x.convoWaiting).length;
    const botWaiting = B ? B.pendingCount() : 0;
    const late = needsAll.filter((n) => n.late).length;
    return { clients, needsAll, days, work, cards, pastDue, msgWaiting, botWaiting, late, needsTotal: needsAll.filter((n) => n.kind !== 'review').length + clients.reduce((s, x) => s + x.reviews, 0), today, end14 };
  }

  /* ---- small drawing helpers ----------------------------------------------------------------------------------------- */

  /** The client's badge: its logo or its tag in its colour. @param {any} x @param {boolean} [big] */
  function badge(x, big) {
    const cls = `cn-badge${big ? ' is-big' : ''}${x.color ? ' cc-' + esc(x.color) : ' cc-none'}${x.logo ? ' has-logo' : ''}`;
    return `<span class="${cls}" aria-hidden="true">${x.logo ? `<img src="${esc(x.logo)}" alt="" width="48" height="48" decoding="async" draggable="false">` : esc(x.tag)}</span>`;
  }
  /** A health ring: an SVG circle filled to the score. @param {number} score @param {string} tone */
  function ring(score, tone) {
    const r = 15.5;
    const len = 2 * Math.PI * r;
    return `<svg class="cn-hring is-${esc(tone)}" viewBox="0 0 36 36" aria-hidden="true"><circle class="cn-hring-bg" cx="18" cy="18" r="${r}"/><circle class="cn-hring-fg" cx="18" cy="18" r="${r}" stroke-dasharray="${len.toFixed(2)}" stroke-dashoffset="${(len * (1 - score / 100)).toFixed(2)}" style="--len:${len.toFixed(2)};--off:${(len * (1 - score / 100)).toFixed(2)}"/></svg>`;
  }
  /** A panel's shell. @param {string} key @param {string} title @param {string} sub @param {string} body @param {string} [href] @param {string} [cta] @param {number} [i] */
  function panel(key, title, sub, body, href, cta, i) {
    return `<section class="cn-panel cn-p-${esc(key)}" data-cn-panel="${esc(key)}" style="--i:${i || 0}" aria-labelledby="cn-h-${esc(key)}">
      <div class="cn-ph"><div><h2 id="cn-h-${esc(key)}">${title}</h2>${sub ? `<p class="cn-sub">${sub}</p>` : ''}</div>${href ? `<a class="cn-go" href="${esc(href)}">${esc(cta || 'Open')}${C().icon('arrow')}</a>` : ''}</div>
      <div class="cn-pb">${body}</div></section>`;
  }
  /** A number that counts up when the view opens. @param {number} n @param {string} [after] */
  const countUp = (n, after) => `<span class="cn-num" data-cn-count="${n}"${after ? ` data-cn-after="${esc(after)}"` : ''}>${rmq.matches ? n : 0}${after ? esc(after) : ''}</span>`;
  /** "Tue 21 Oct" @param {string} d */
  const dayName = (d) => { const x = new Date(d + 'T00:00'); return isNaN(x.getTime()) ? d : x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };

  /* ---- the panels ---------------------------------------------------------------------------------------------------- */

  /** @param {any} m */
  function briefPanel(m) {
    const K = C();
    const n = m.needsTotal;
    const one = n ? `<a href="#/queue"><strong>${K.plural(n, 'thing needs', 'things need')} you</strong> today${m.late ? `, ${m.late} of them late` : ''}.</a>` : '<a href="#/queue"><strong>Nothing needs you</strong> right now.</a>';
    /** @type {string[]} */ const bits = [];
    if (m.msgWaiting) bits.push(`<a href="#/messages">${K.plural(m.msgWaiting, 'client')} waiting for a reply</a>`);
    if (m.botWaiting) bits.push(`<a href="#/bot">${K.plural(m.botWaiting, 'bot draft')} waiting</a>`);
    if (m.pastDue) bits.push(`<a href="#/billing">${K.plural(m.pastDue, 'payment')} past due</a>`);
    const two = bits.length ? bits.join(', ').replace(/, ([^,]*)$/, ' and $1') + '.' : '<a href="#/messages">Messages and bots are quiet.</a>';
    const next = m.days[0];
    const three = next ? `<a href="${esc(next.href)}">Next up: <strong>${esc(next.label)}</strong> for ${esc(next.client)}, ${esc(next.date === m.today ? 'today' : dayName(next.date))}.</a>` : '<a href="#/billing">Nothing is due in the next two weeks.</a>';
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const who = K.me && K.me.name ? String(K.me.name).split(' ')[0] : '';
    return panel('brief', `${esc(greet)}${who ? ', ' + esc(who) : ''}`, new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), `<ol class="cn-brief-l"><li><span>${one}</span></li><li><span>${two}</span></li><li><span>${three}</span></li></ol>`, '#/queue', 'Needs you', 0);
  }

  /** @param {any} m */
  function ringPanel(m) {
    const K = C();
    const n = m.clients.length;
    const orbs = m.clients.map((/** @type {any} */ x, /** @type {number} */ i) => {
      const a = (360 / Math.max(1, n)) * i;
      const halo = Math.min(1, x.nn / 4);
      const facts = [x.plan ? `${esc(x.plan)} plan` : 'No plan yet', x.nn ? K.plural(x.nn, 'thing needs', 'things need') + ' you' : 'Nothing needs you', x.waiting.length ? K.plural(x.waiting.length, 'thing') + ' waiting on them' : '', x.openCards ? K.plural(x.openCards, 'open card') : '', x.botN ? K.plural(x.botN, 'bot draft') + ' waiting' : '', x.lastDays === null ? 'No messages yet' : x.lastDays === 0 ? 'Spoke today' : `Last word ${x.lastDays} ${x.lastDays === 1 ? 'day' : 'days'} ago`].filter(Boolean);
      return `<a class="cn-orb tier-${x.tier} tone-${esc(x.tone)}${i === 0 ? ' is-sel' : ''}" href="${esc(x.href)}" data-cn-orb="${i}" style="--a:${a}deg;--halo:${halo.toFixed(2)};--i:${i}" aria-label="${esc(x.name)}: ${esc(x.health.grade)}, ${esc(x.health.why)}. Open the client" aria-describedby="cn-orb-f-${i}">
        <span class="cn-orb-core">${badge(x, true)}${ring(x.health.score, x.health.tone)}${x.nn ? `<span class="cn-orb-n">${x.nn}</span>` : ''}</span>
        <span class="cn-orb-name">${esc(x.name)}</span>
        <span class="cn-orb-facts" id="cn-orb-f-${i}" role="tooltip"><strong>${esc(x.name)}</strong><span class="cn-grade is-${esc(x.health.tone)}">${esc(x.health.grade)} ${x.health.score}</span><span class="cn-orb-why">${esc(x.health.why)}</span><span class="cn-orb-list">${facts.map((f) => `<span>${f}</span>`).join('')}</span></span></a>`;
    }).join('');
    const body = n ? `<div class="cn-stage3d"><div class="cn-orbit" id="cn-orbit" style="--n:${n}">${orbs}</div></div>
      <p class="cn-ring-help meta">Size is the plan, the glow is what needs you, the ring is health. Arrow keys move between clients, Enter opens one.</p>`
      : '<div class="empty"><p><strong>No clients yet.</strong></p><p>Add one and it appears here.</p></div>';
    return panel('ring', `${countUp(n)} ${n === 1 ? 'client' : 'clients'}`, `${m.clients.filter((/** @type {any} */ x) => x.nn).length} need you, ${m.clients.filter((/** @type {any} */ x) => x.health.tone === 'bad').length} at risk`, body, '#/clients', 'Clients', 1);
  }

  /** @param {any} m */
  function radarPanel(m) {
    const items = m.needsAll;
    const blips = items.slice(0, 24).map((/** @type {any} */ it, /** @type {number} */ i) => {
      const r = [0.3, 0.58, 0.84][it.urgency] || 0.84;
      const ang = ((i * 137.5) % 360);
      const x = 50 + Math.cos((ang * Math.PI) / 180) * r * 46;
      const y = 50 + Math.sin((ang * Math.PI) / 180) * r * 46;
      return `<a class="cn-blip u-${it.urgency}" href="${esc(it.href)}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--d:${(ang / 360).toFixed(3)}" aria-label="${esc(it.label)}, ${esc(it.client)}. Open it"><span></span></a>`;
    }).join('');
    const rows = items.slice(0, 6).map((/** @type {any} */ it) => `<li><a href="${esc(it.href)}"><span class="cn-dot u-${it.urgency}" aria-hidden="true"></span><span class="cn-row-main"><strong>${esc(it.label)}</strong> <span class="cn-row-client">${esc(it.client)}</span><span class="cn-row-text">${esc(it.text || '')}</span></span>${it.when ? `<span class="cn-row-when">${esc(it.when)}</span>` : ''}</a></li>`).join('');
    const body = items.length ? `<div class="cn-radar-wrap"><div class="cn-scope" aria-hidden="true"><div class="cn-radar-sweep"></div><div class="cn-radar-r r1"></div><div class="cn-radar-r r2"></div><div class="cn-radar-r r3"></div>${blips}</div>
      <ol class="cn-rows">${rows}</ol></div>${items.length > 6 ? `<p class="meta cn-more"><a href="#/queue">${items.length - 6} more in Needs you</a></p>` : ''}`
      : '<div class="empty"><p><strong>All clear.</strong></p><p>Nothing needs you right now.</p></div>';
    const urgent = items.filter((/** @type {any} */ x) => x.urgency === 0).length;
    return panel('radar', `${countUp(m.needsTotal)} ${m.needsTotal === 1 ? 'thing needs you' : 'things need you'}`, items.length ? `${urgent} urgent (${m.late} late), ${items.length - urgent} can wait a little` : 'The radar is clear', body, '#/queue', 'Needs you', 2);
  }

  /** @param {any} m */
  function riverPanel(m) {
    const Col = part('color');
    const lanes = m.work.map((/** @type {any} */ st, /** @type {number} */ li) => {
      const shown = st.cards.slice(0, 5);
      const chips = shown.map((/** @type {any} */ c, /** @type {number} */ i) => `<a class="cn-card${c.glow ? ' glow-' + c.glow : ''}${c.late ? ' is-late' : ''}" href="${esc(c.href)}" style="--i:${i}" title="${esc(c.title)}">${Col ? Col.badge(c.tenant_id) : ''}<span class="cn-card-t">${esc(c.title)}</span>${c.glow ? `<span class="cn-card-flag">${c.glow === 'over' ? 'Over limit' : 'Held in Needs you'}</span>` : c.late ? '<span class="cn-card-flag">Overdue</span>' : ''}</a>`).join('');
      return `<div class="cn-lane lane-${esc(st.key)}" style="--i:${li}"><div class="cn-lane-h"><span>${esc(st.label)}</span><strong>${countUp(st.cards.length)}</strong></div><div class="cn-lane-b">${chips || '<span class="cn-lane-none">None</span>'}${st.cards.length > 5 ? `<a class="cn-lane-more" href="#/board">+${st.cards.length - 5} more</a>` : ''}</div></div>`;
    }).join('');
    const over = m.cards.filter((/** @type {any} */ c) => c.glow === 'over').length;
    const held = m.cards.filter((/** @type {any} */ c) => c.glow === 'warn').length;
    const open = m.cards.filter((/** @type {any} */ c) => c.status !== 'done').length;
    return panel('river', `${countUp(open)} open ${open === 1 ? 'card' : 'cards'}`, `${over} over a limit, ${held} held in Needs you, ${m.work[4].cards.length} done in two weeks`, `<div class="cn-lanes"><div class="cn-flow" aria-hidden="true"></div>${lanes}</div>`, '#/board', 'All work', 3);
  }

  /** @param {any} m */
  function daysPanel(m) {
    const K = C();
    const cols = [];
    for (let i = 0; i < 14; i++) {
      const d = K.localDay(new Date(Date.now() + i * DAY));
      const mine = m.days.filter((/** @type {any} */ x) => x.date === d);
      const dt = new Date(d + 'T00:00');
      cols.push(`<div class="cn-day${i === 0 ? ' is-today' : ''}${dt.getDay() === 0 || dt.getDay() === 6 ? ' is-weekend' : ''}${mine.length ? ' has-items' : ''}" style="--i:${i}"><div class="cn-day-h"><span>${esc(dt.toLocaleDateString('en-GB', { weekday: 'short' }))}</span><strong>${dt.getDate()}</strong></div>
        ${mine.map((/** @type {any} */ x) => `<a class="cn-ev tone-${esc(x.tone)}" href="${esc(x.href)}" title="${esc(x.text)}"><strong>${esc(x.label)}</strong><span>${esc(x.client)}</span></a>`).join('')}</div>`);
    }
    const list = m.days.slice(0, 8).map((/** @type {any} */ x) => `<li><a href="${esc(x.href)}"><span class="cn-ev-date">${esc(x.date === m.today ? 'Today' : dayName(x.date))}</span><span class="cn-row-main"><strong>${esc(x.label)}</strong> <span class="cn-row-client">${esc(x.client)}</span><span class="cn-row-text">${esc(x.text)}</span></span></a></li>`).join('');
    const body = `<div class="cn-cal">${cols.join('')}</div>${m.days.length ? `<ol class="cn-rows cn-days-list">${list}</ol>` : '<p class="meta cn-days-none">Nothing is due in the next two weeks.</p>'}`;
    return panel('days', `Next 14 days: ${countUp(m.days.length)} ${m.days.length === 1 ? 'date' : 'dates'}`, 'Bill days, reminders, plan picks, promised dates, meetings and drafts that wake', body, '#/billing', 'Billing', 4);
  }

  /** The bot feed, from the drafts read when the view opened. @param {any[]} drafts */
  function botPanel(drafts) {
    const K = C();
    const waiting = drafts.filter((d) => d.state === 'waiting');
    const byBot = /** @type {Record<string, number>} */ ({});
    for (const d of waiting) byBot[d.bot] = (byBot[d.bot] || 0) + 1;
    const chips = Object.entries(byBot).map(([b, n]) => `<span class="cn-botchip"><strong>${n}</strong> ${esc(b)}</span>`).join('');
    const item = (/** @type {any} */ d) => `<a class="cn-tick" href="${esc(d.href)}"><span class="cn-tick-bot">${esc(d.bot)}</span><span class="cn-tick-client">${esc(d.client)}</span><span class="cn-tick-kind">${esc(d.kind)}</span><span class="cn-tick-when">${esc(K.ago(d.at))}</span><span class="cn-tick-go">Approve in Bot chat</span></a>`;
    const track = waiting.map(item).join('');
    const body = waiting.length ? `<div class="cn-botchips">${chips}</div><div class="cn-ticker" aria-label="Drafts waiting"><div class="cn-ticker-track">${track}${waiting.length > 2 && !rmq.matches ? `<span aria-hidden="true" class="cn-ticker-copy">${track}</span>` : ''}</div></div>`
      : '<div class="empty"><p><strong>Nothing is waiting.</strong></p><p>Bot drafts show up here as they drop in.</p></div>';
    const snoozed = drafts.filter((d) => d.state === 'snoozed').length;
    return panel('bot', `${countUp(waiting.length)} ${waiting.length === 1 ? 'draft' : 'drafts'} waiting`, snoozed ? `${snoozed} snoozed, they come back by themselves` : 'Approve, edit or reject each one in Bot chat', body, '#/bot', 'Bot chat', 5);
  }

  /** @param {any} m */
  function healthPanel(m) {
    const rows = m.clients.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => a.health.score - b.health.score).map((/** @type {any} */ x, /** @type {number} */ i) => `<li style="--i:${i}"><a href="${esc(x.href)}">${badge(x)}<span class="cn-row-main"><strong>${esc(x.name)}</strong><span class="cn-row-text">${esc(x.health.why)}</span></span><span class="cn-score"><span class="cn-grade is-${esc(x.health.tone)}">${esc(x.health.grade)}</span>${ring(x.health.score, x.health.tone)}<strong>${x.health.score}</strong></span></a></li>`).join('');
    const good = m.clients.filter((/** @type {any} */ x) => x.health.tone === 'good').length;
    return panel('health', 'Client health', `${good} good, ${m.clients.filter((/** @type {any} */ x) => x.health.tone === 'warn').length} to watch, ${m.clients.filter((/** @type {any} */ x) => x.health.tone === 'bad').length} at risk`, m.clients.length ? `<ol class="cn-rows cn-health-l">${rows}</ol><p class="meta cn-more">Needs you items, limits, payment, silence on Messages and late approvals all count.</p>` : '<div class="empty"><p><strong>No clients yet.</strong></p></div>', '#/clients', 'Clients', 6);
  }

  /** The owner's money pulse. @param {any} money */
  function moneyPanel(money) {
    const K = C();
    const $ = (/** @type {number} */ v) => K.money(v, 'USD');
    const goalPct = money.goal > 0 ? Math.min(100, Math.floor((money.inc / money.goal) * 100)) : 0;
    const r = 42;
    const len = 2 * Math.PI * r;
    const body = money.error ? `<p class="meta">${esc(money.error)}</p>` : `<div class="cn-money-in"><div class="cn-goal" role="img" aria-label="${money.goal > 0 ? `${goalPct} percent of the income goal` : 'No income goal set'}">
        <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="cn-goal-bg" cx="50" cy="50" r="${r}"/><circle class="cn-goal-fg" cx="50" cy="50" r="${r}" stroke-dasharray="${len.toFixed(1)}" stroke-dashoffset="${(len * (1 - goalPct / 100)).toFixed(1)}" style="--len:${len.toFixed(1)};--off:${(len * (1 - goalPct / 100)).toFixed(1)}"/></svg>
        <span class="cn-goal-n">${money.goal > 0 ? countUp(goalPct, '%') : '<span class="meta">No goal</span>'}</span></div>
      <dl class="cn-money-l"><div><dt>Income</dt><dd data-cn-money="${money.inc}">${rmq.matches ? esc($(money.inc)) : '$0'}</dd></div><div><dt>Costs</dt><dd data-cn-money="${money.cost}">${rmq.matches ? esc($(money.cost)) : '$0'}</dd></div><div class="${money.profit < 0 ? 'is-neg' : ''}"><dt>${money.profit < 0 ? 'Loss' : 'Profit'}</dt><dd data-cn-money="${Math.abs(money.profit)}">${rmq.matches ? esc($(Math.abs(money.profit))) : '$0'}</dd></div></dl></div>
      <p class="meta cn-more">${money.goal > 0 ? `Goal ${esc($(money.goal))} this month` : 'Set a goal on Revenue to see the ring fill'}${money.due > 0 ? `, ${esc($(money.due))} still to come` : ''}. Only you see this.</p>`;
    return panel('money', 'This month', 'Income, costs and profit from the Revenue ledger', body, '#/revenue', 'Revenue', 7);
  }

  /* ---- reads that happen when the view opens (drafts, money) -------------------------------------------------------- */

  /** The bot drafts, read here (Bot chat keeps its own list private): waiting and snoozed, with the bot's name. */
  async function readDrafts() {
    const K = C();
    const hermesOn = !!(K.FLAGS && K.FLAGS.hermes);
    const name = (/** @type {string} */ s) => { const k = String(s || 'console').toLowerCase(); return k === 'claude' ? 'Claude' : k === 'grok' ? 'Grok' : k === 'hermes' ? (hermesOn ? 'Hermes' : 'Another bot') : k === 'console' ? 'The console' : 'Another bot'; };
    try {
      const c = await K.db();
      const r = await c.from('bot_outputs').select('id, tenant_id, kind, source, status, created_at, expires_at, snoozed_until').eq('status', 'pending').order('created_at', { ascending: false }).limit(200);
      if (r.error) throw r.error;
      const now = Date.now();
      return (r.data || []).filter((/** @type {any} */ x) => { const t = K.tenant(x.tenant_id); return t && t.status !== 'archived' && !(x.expires_at && new Date(x.expires_at).getTime() < now); })
        .map((/** @type {any} */ x) => ({ id: x.id, bot: name(x.source), client: (K.tenant(x.tenant_id) || {}).name || 'A client', kind: String(x.kind || 'Draft'), at: x.created_at, href: `#/bot/${x.id}`,
          state: x.snoozed_until && new Date(x.snoozed_until).getTime() > now ? 'snoozed' : 'waiting', wake: x.snoozed_until || '' }));
    } catch (e) { return []; }
  }
  /** This month's money, read only, for the business owner. @returns {Promise<any>} */
  async function readMoney() {
    const K = C();
    const ym = (() => { try { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Winnipeg', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return `${(p.find((x) => x.type === 'year') || {}).value}-${(p.find((x) => x.type === 'month') || {}).value}`; } catch (e) { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; } })();
    try {
      const c = await K.db();
      const r = await c.rpc('business_lines', { p_from: `${ym}-01`, p_to: `${ym}-01` });
      if (r.error) throw r.error;
      const j = r.data || {};
      const num = (/** @type {any} */ v) => Number(v) || 0;
      const inc = (j.income || []).reduce((/** @type {number} */ s, /** @type {any} */ x) => s + num(x.amount_minor), 0);
      const due = (j.income || []).filter((/** @type {any} */ x) => x.received === false).reduce((/** @type {number} */ s, /** @type {any} */ x) => s + num(x.amount_minor), 0);
      const cost = (j.costs || []).reduce((/** @type {number} */ s, /** @type {any} */ x) => s + num(x.amount_minor), 0);
      const goal = j.settings && Number.isInteger(Number(j.settings.income_goal_minor)) && Number(j.settings.income_goal_minor) > 0 ? Number(j.settings.income_goal_minor) : 0;
      return { inc, cost, profit: inc - cost, due, goal, error: '' };
    } catch (e) { return { inc: 0, cost: 0, profit: 0, due: 0, goal: 0, error: 'The ledger did not answer. Open Revenue to try again.' }; }
  }

  /* ---- the page ------------------------------------------------------------------------------------------------------ */

  /** Draws the view into the console's main area and starts its motion. */
  function page() {
    stop();
    const K = C();
    const all = K.all;
    document.title = 'Cinematic view · Domin8te console';
    const m = gather();
    const R = part('revenue');
    const owner = !demo() && !!(R && R.visible());
    K.main.innerHTML = `<div class="cn-stage${rmq.matches ? ' is-still' : ''}" id="cn-stage" data-cn-stage>
      <div class="cn-bg" aria-hidden="true"><div class="cn-bg-glow a"></div><div class="cn-bg-glow b"></div><div class="cn-bg-dots"></div><div class="cn-bg-stars"></div></div>
      <header class="cn-head">
        <div class="cn-head-l"><p class="cn-kicker">Domin8te agency console</p><h1 id="page-title" tabindex="-1">Cinematic view</h1></div>
        <div class="cn-head-r">
          <button class="btn btn-quiet cn-btn" type="button" data-cn="tour" aria-pressed="false" title="Cycle through the panels, for a screen on the wall (T)">${K.icon('refresh')}Tour</button>
          <button class="btn btn-quiet cn-btn" type="button" data-cn="pause" aria-pressed="false" title="Pause the motion (Space)">${K.icon('clock')}<span data-cn-pause-label>Pause</span></button>
          <button class="btn cn-btn cn-close" type="button" data-cn="close" title="Back to the console (Esc)">${K.icon('x')}Close</button>
        </div>
      </header>
      ${K.pageFresh({ updatedAt: all.at, source: 'Console and the database', status: all.reviews && all.reviews.error ? 'delayed' : 'ok', label: all.reviews && all.reviews.error ? 'Some data did not load' : undefined })}
      <div class="cn-grid">
        ${briefPanel(m)}
        ${ringPanel(m)}
        ${owner ? panel('money', 'This month', 'Reading the ledger', `<div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-block"></div></div>`, '#/revenue', 'Revenue', 7) : healthPanel(m)}
        ${radarPanel(m)}
        ${panel('bot', 'Bot drafts', 'Reading the drafts', `<div class="sk" aria-busy="true" aria-label="Loading"><div class="sk-block"></div></div>`, '#/bot', 'Bot chat', 5)}
        ${daysPanel(m)}
        ${riverPanel(m)}
        ${owner ? healthPanel(m) : ''}
      </div>
      <p class="cn-foot meta"><kbd>←</kbd><kbd>→</kbd> clients <kbd>Enter</kbd> open <kbd>Space</kbd> pause <kbd>T</kbd> tour <kbd>Esc</kbd> close</p>
    </div>`;
    const root = /** @type {HTMLElement} */ (K.main.querySelector('#cn-stage'));
    live = { root, raf: 0, spin: 0, want: null, paused: false, sel: 0, n: m.clients.length, tour: { on: false, i: -1, at: 0 }, timers: [], at: all.at, model: m, counts: [], off: [], last: 0 };
    wire(root);
    collectCounts(root);
    const h1 = /** @type {HTMLElement} */ (root.querySelector('#page-title'));
    if (h1) h1.focus({ preventScroll: true });
    // The slow reads fill their panels when they land (and never if the view closed meanwhile).
    const mine = live;
    void readDrafts().then((drafts) => { if (live !== mine) return; swap(root, 'bot', botPanel(drafts)); });
    if (owner) void readMoney().then((money) => { if (live !== mine) return; swap(root, 'money', moneyPanel(money)); });
    const Wk = part('work');
    if (Wk && typeof Wk.ready === 'function') { try { const p = Wk.ready(); if (p && typeof p.then === 'function') void p.then(() => { if (live !== mine) return; live.model = gather(); swap(root, 'river', riverPanel(live.model)); }, () => null); } catch (e) { /* the river shows the cards without the limit glow */ } }
    if (!rmq.matches) live.raf = requestAnimationFrame(frame);
    // Data that the console reloads while the view is open (its quiet catch-up) redraws the panels, without the entrance.
    live.timers.push(window.setInterval(() => { if (live && live.root.isConnected && K.all && K.all.at !== live.at) refresh(); }, 5000));
  }
  /** Puts a panel's new drawing in place of the old one (the entrance is not replayed). @param {HTMLElement} root @param {string} key @param {string} html */
  function swap(root, key, html) {
    const old = root.querySelector(`[data-cn-panel="${key}"]`);
    if (!old) return;
    const box = document.createElement('div');
    box.innerHTML = html;
    const next = /** @type {HTMLElement} */ (box.firstElementChild);
    if (!next) return;
    next.classList.add('is-settled');
    if (live && live.tour.on && old.classList.contains('is-spot')) next.classList.add('is-spot');
    old.replaceWith(next);
    collectCounts(next);
  }
  /** Draws every panel again from fresh data, keeping the ring's turn and the choice. */
  function refresh() {
    if (!live) return;
    const K = C();
    const m = gather();
    live.model = m;
    live.at = K.all.at;
    live.n = m.clients.length;
    live.sel = Math.min(live.sel, Math.max(0, live.n - 1));
    const R = part('revenue');
    const owner = !demo() && !!(R && R.visible());
    const root = live.root;
    root.classList.add('is-settled');
    swap(root, 'brief', briefPanel(m));
    swap(root, 'ring', ringPanel(m));
    swap(root, 'radar', radarPanel(m));
    swap(root, 'days', daysPanel(m));
    swap(root, 'river', riverPanel(m));
    swap(root, 'health', healthPanel(m));
    const mine = live;
    void readDrafts().then((drafts) => { if (live !== mine) return; swap(root, 'bot', botPanel(drafts)); });
    if (owner) void readMoney().then((money) => { if (live !== mine) return; swap(root, 'money', moneyPanel(money)); });
    select(live.sel, false);
  }
  /** Stops the motion and forgets the view. */
  function stop() {
    if (!live) return;
    if (live.raf) cancelAnimationFrame(live.raf);
    for (const t of live.timers) clearInterval(t);
    for (const f of live.off) f();
    live = null;
  }
  /** Numbers that count up: found once per drawing. @param {HTMLElement} root */
  function collectCounts(root) {
    if (!live || rmq.matches) return;
    const K = C();
    const now = performance.now();
    for (const el of Array.from(root.querySelectorAll('[data-cn-count]'))) {
      const to = Number(el.getAttribute('data-cn-count')) || 0;
      const after = el.getAttribute('data-cn-after') || '';
      live.counts.push({ el: /** @type {HTMLElement} */ (el), to, from: 0, t0: now + 300, text: (n) => String(n) + after });
    }
    for (const el of Array.from(root.querySelectorAll('[data-cn-money]'))) {
      const to = Number(el.getAttribute('data-cn-money')) || 0;
      live.counts.push({ el: /** @type {HTMLElement} */ (el), to, from: 0, t0: now + 300, text: (n) => K.money(n, 'USD') });
    }
  }

  /* ---- motion: the ring's turn, depth, the count-ups and the tour --------------------------------------------------------- */

  /** @param {number} now */
  function frame(now) {
    if (!live) return;
    const L = live;
    L.raf = requestAnimationFrame(frame);
    const dt = L.last ? Math.min(100, now - L.last) : 16;
    L.last = now;
    // The turn: steady, or easing towards the chosen client's place at the front.
    if (!L.paused) {
      if (L.want !== null) {
        let diff = ((L.want - L.spin) % 360 + 540) % 360 - 180;
        if (Math.abs(diff) < 0.05) { L.spin = L.want; L.want = null; }
        else { L.spin += diff * Math.min(1, dt / 220); }
      } else L.spin = (L.spin + (360 * dt) / SPIN_PERIOD) % 360;
    }
    const ring = /** @type {HTMLElement|null} */ (L.root.querySelector('#cn-orbit'));
    if (ring) {
      ring.style.setProperty('--spin', L.spin.toFixed(2) + 'deg');
      const n = L.n || 1;
      const orbs = ring.children;
      for (let i = 0; i < orbs.length; i++) {
        const a = ((360 / n) * i + L.spin) * (Math.PI / 180);
        const depth = (Math.cos(a) + 1) / 2;   // 1 at the front, 0 at the back
        /** @type {HTMLElement} */ (orbs[i]).style.setProperty('--depth', depth.toFixed(3));
      }
    }
    // Counting numbers (about a second each).
    if (L.counts.length) {
      const keep = [];
      for (const c of L.counts) {
        const p = Math.min(1, Math.max(0, (now - c.t0) / 1100));
        const e = 1 - Math.pow(1 - p, 3);
        c.el.textContent = c.text(Math.round(c.from + (c.to - c.from) * e));
        if (p < 1) keep.push(c);
      }
      L.counts = keep;
    }
    // The tour: a spotlight that moves on every few seconds.
    if (L.tour.on && !L.paused && now - L.tour.at > TOUR_MS) tourStep();
  }
  /** Chooses a client on the ring: it comes to the front and, when asked, takes the focus. @param {number} i @param {boolean} focus */
  function select(i, focus) {
    if (!live || !live.n) return;
    const L = live;
    L.sel = ((i % L.n) + L.n) % L.n;
    const orbs = Array.from(L.root.querySelectorAll('[data-cn-orb]'));
    for (const o of orbs) o.classList.toggle('is-sel', Number(o.getAttribute('data-cn-orb')) === L.sel);
    L.want = (360 - (360 / L.n) * L.sel) % 360;
    if (rmq.matches) { L.spin = L.want; L.want = null; const ring = /** @type {HTMLElement|null} */ (L.root.querySelector('#cn-orbit')); if (ring) ring.style.setProperty('--spin', L.spin + 'deg'); }
    const el = /** @type {HTMLElement|undefined} */ (orbs[L.sel]);
    if (focus && el) el.focus({ preventScroll: true });
  }
  /** @param {boolean} on */
  function setPaused(on) {
    if (!live) return;
    live.paused = on;
    live.root.classList.toggle('is-paused', on);
    const b = live.root.querySelector('[data-cn="pause"]');
    if (b) { b.setAttribute('aria-pressed', String(on)); const l = b.querySelector('[data-cn-pause-label]'); if (l) l.textContent = on ? 'Play' : 'Pause'; }
  }
  /** @param {boolean} on */
  function setTour(on) {
    if (!live) return;
    live.tour.on = on;
    live.tour.at = 0;
    live.root.classList.toggle('is-tour', on);
    const b = live.root.querySelector('[data-cn="tour"]');
    if (b) b.setAttribute('aria-pressed', String(on));
    if (!on) { for (const p of Array.from(live.root.querySelectorAll('.cn-panel.is-spot'))) p.classList.remove('is-spot'); live.tour.i = -1; }
    else if (rmq.matches) tourStep();
    else { live.tour.at = performance.now() - TOUR_MS; }
  }
  /** The next panel in the tour takes the spotlight (and the ring moves to the next client). */
  function tourStep() {
    if (!live) return;
    const L = live;
    const panels = Array.from(L.root.querySelectorAll('.cn-panel'));
    if (!panels.length) return;
    L.tour.i = (L.tour.i + 1) % panels.length;
    L.tour.at = performance.now();
    panels.forEach((p, i) => p.classList.toggle('is-spot', i === L.tour.i));
    const p = /** @type {HTMLElement} */ (panels[L.tour.i]);
    if (p.getAttribute('data-cn-panel') !== 'ring' && window.innerWidth < 1100) p.scrollIntoView({ block: 'center', behavior: rmq.matches ? 'auto' : 'smooth' });
    if (L.n) select(L.sel + 1, false);
    if (rmq.matches) L.timers.push(window.setTimeout(() => { if (live && live.tour.on) tourStep(); }, TOUR_MS));
  }
  /** Leaves the view: back to the page it was opened from. */
  function close() {
    const to = /^#\/cinema/.test(backTo) ? '#/queue' : backTo;
    stop();
    location.hash = to;
  }

  /** @param {HTMLElement} root */
  function wire(root) {
    if (!live) return;
    const L = live;
    root.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-cn]');
      if (!b) return;
      const k = b.getAttribute('data-cn');
      if (k === 'close') close();
      else if (k === 'pause') setPaused(!L.paused);
      else if (k === 'tour') setTour(!L.tour.on);
    });
    root.addEventListener('focusin', (e) => {
      const o = /** @type {HTMLElement} */ (e.target).closest('[data-cn-orb]');
      if (o) select(Number(o.getAttribute('data-cn-orb')), false);
    });
    // Hover holds the ring still so the facts can be read.
    root.addEventListener('pointerenter', (e) => { if (/** @type {HTMLElement} */ (e.target).closest && /** @type {HTMLElement} */ (e.target).closest('.cn-orbit')) root.classList.add('is-held'); }, true);
    root.addEventListener('pointerleave', (e) => { if (/** @type {HTMLElement} */ (e.target).closest && /** @type {HTMLElement} */ (e.target).closest('.cn-orbit')) root.classList.remove('is-held'); }, true);
    // A light parallax with a mouse: the background layers lean towards the pointer.
    if (finePointer.matches && !rmq.matches) {
      let queued = false, px = 0, py = 0;
      const move = (/** @type {PointerEvent} */ e) => {
        px = (e.clientX / window.innerWidth - 0.5) * 2;
        py = (e.clientY / window.innerHeight - 0.5) * 2;
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; root.style.setProperty('--mx', px.toFixed(3)); root.style.setProperty('--my', py.toFixed(3)); });
      };
      root.addEventListener('pointermove', move, { passive: true });
    }
    const keys = (/** @type {KeyboardEvent} */ e) => {
      if (!live || !root.isConnected) return;
      if (document.querySelector('dialog[open]')) return;
      const at = /** @type {HTMLElement} */ (e.target);
      const typing = at && (/^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName) || at.isContentEditable);
      if (typing) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); select(L.sel + 1, true); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); select(L.sel - 1, true); }
      else if (e.key === ' ' && !(at && at.tagName === 'BUTTON')) { e.preventDefault(); setPaused(!L.paused); }
      else if (e.key === 't' || e.key === 'T') { e.preventDefault(); setTour(!L.tour.on); }
    };
    document.addEventListener('keydown', keys);
    L.off.push(() => document.removeEventListener('keydown', keys));
    // When the hash leaves this view (a panel link, Esc, the sidebar), the motion stops with it.
    const onHash = () => { if (!/^#\/cinema/.test(location.hash)) stop(); };
    window.addEventListener('hashchange', onHash);
    L.off.push(() => window.removeEventListener('hashchange', onHash));
    const vis = () => { if (!live) return; if (document.visibilityState !== 'visible') { if (live.raf) cancelAnimationFrame(live.raf); live.raf = 0; } else if (!live.raf && !rmq.matches) { live.last = 0; live.raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', vis);
    L.off.push(() => document.removeEventListener('visibilitychange', vis));
  }

  EXT.cinema = { page, stop, gather, healthOf, get live() { return live; } };
})();
