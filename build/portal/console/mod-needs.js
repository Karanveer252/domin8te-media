// @ts-check
/*
 * Needs you, the plan release's part (2026-10-13).
 *
 * The database raises items for plans, limits, picks, bill emails and results (dashboard_exceptions with a reason_code). Each one
 * is drawn here as a card that says what is wrong, what the client sees right now and the fastest way to fix it, with the actions
 * of the spec's table. console.js (queuePage, derive, reviewsFor) calls into window.D8C_EXT.needs; this file reads helpers from
 * window.D8C and registers nothing global besides that.
 *
 * Every action does its own write first, then closes the item with resolve_dashboard_exception and a note (the database writes
 * the audit line for both). "Suggest ..." only opens a draft in Messages: nothing is ever sent from here.
 *
 * Reads: dashboard_exceptions, requests, tasks, client_dashboard_items (through D8C.all), tenant_plan_cycles, plan_caps, plans,
 * tenant_usage_current, billing_reminders (through D8C.plans), message_notifications (the one row an action works on).
 * Writes: usage_events (insert), requests (status), tasks (due), billing_reminders and message_notifications (to_email, status), tenants (doc.user.email only),
 * and the functions override_plan_cycle, review_dashboard_item, resolve_dashboard_exception.
 */
(function () {
  'use strict';
  /** @type {any} */ const W = window;
  const EXT = (W.D8C_EXT = W.D8C_EXT || {});
  /** The console's helpers, read when needed (the console builds them after this file loads). @returns {any} */
  const C = () => W.D8C;
  /** @param {any} s */
  const esc = (s) => C().esc(s);

  /* ---- what each kind of item is ----------------------------------------------------------------------- */

  const CODES = ['plan_mismatch', 'over_cap', 'over_cap_request', 'service_not_picked', 'picks_unconfirmed', 'reminder_failed', 'notification_failed', 'result_outlier', 'plan_backfill_needed'];
  /** f is the filter chip the item belongs to; rank orders the list (0 first). @type {Record<string, {f: string, label: string, tone: string, icon: string, rank: number}>} */
  const KINDS = {
    plan_mismatch: { f: 'mismatch', label: 'Plan mismatch', tone: 'bad', icon: 'alert', rank: 0 },
    result_outlier: { f: 'mismatch', label: 'Result check', tone: 'warn', icon: 'chart', rank: 0 },
    plan_backfill_needed: { f: 'mismatch', label: 'Plan not set', tone: 'warn', icon: 'card', rank: 1 },
    over_cap: { f: 'limit', label: 'Over cap', tone: 'you', icon: 'plus', rank: 0 },
    over_cap_request: { f: 'limit', label: 'Over limit', tone: 'you', icon: 'plus', rank: 0 },
    service_not_picked: { f: 'limit', label: 'Not in plan', tone: 'you', icon: 'slash', rank: 1 },
    picks_unconfirmed: { f: 'deadline', label: 'Picks not confirmed', tone: 'warn', icon: 'clock', rank: 1 },
    reminder_failed: { f: 'email', label: 'Reminder failed', tone: 'bad', icon: 'mail', rank: 1 },
    notification_failed: { f: 'email', label: 'Message email failed', tone: 'bad', icon: 'mail', rank: 1 }
  };
  const FILTERS = [['all', 'All'], ['mismatch', 'Mismatches'], ['limit', 'Over limit'], ['deadline', 'Pick deadlines'], ['email', 'Failed emails'], ['approval', 'Client approvals']];
  /** The chip in use stays when the page is drawn again after an action. */
  const state = { filter: 'all' };

  const ICONS = {
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.6v5.2M12 16.3h.01"/>',
    plus: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4.5 8l7.5 5.5L19.5 8"/>',
    chart: '<path d="M4 5v14h16"/><path d="M8 15l3-4 3 2 4-6"/>',
    slash: '<circle cx="12" cy="12" r="8.5"/><path d="M6.2 17.8L17.8 6.2"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
  };
  /** @param {string} name */
  const ico = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${/** @type {any} */ (ICONS)[name] || ''}</svg>`;

  /** A limit's name in a sentence: the one shared name (plan-model.js) in lower case, minus "in use", which the "per period" words add. @param {string} metric @param {string} [fallback] */
  const metricName = (metric, fallback) => {
    const n = (W.D8 && W.D8.planModel && W.D8.planModel.LABEL[metric]) || '';
    if (!n) return fallback || String(metric || 'work').replace(/_/g, ' ');
    const t = n.replace(/ in use$/, '');
    return /^(Reels|Stories|Google|SEO|Email)/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1);
  };
  /** The two limits that count what is running now, not a month's work: they read "at once" and "in use", never "a month". @type {Record<string, string>} */
  const NOW_UNIT = { ads_live_campaigns: 'at once', ads_platforms: 'in use' };
  /** "8 page edits a month", "3 live campaigns at once". @param {string} metric @param {string} name */
  const perPeriod = (metric, name) => `${name} ${NOW_UNIT[metric] || 'a month'}`;
  /** Whether a limit counts what is live now (a snapshot that carries into the next month, 20261014110100), not a month's work. @param {string} metric */
  const isLive = (metric) => Object.prototype.hasOwnProperty.call(NOW_UNIT, metric);
  /** "used", or for a live limit "live now" / "in use". @param {string} metric */
  const usedWord = (metric) => (metric === 'ads_platforms' ? 'in use' : isLive(metric) ? 'live now' : 'used');
  /** A client's own words in quotes, ending in one full stop (a stop already at the end of their text is not doubled). @param {any} text @param {number} max */
  const quoted = (text, max) => {
    const t = String(text == null ? '' : text).trim().slice(0, max).replace(/[\s.,;:]+$/, '');
    return `“${t}”${/[!?]$/.test(t) ? '' : '.'}`;
  };

  /** True for the items this part draws; console.js leaves them out of the older "Check before it goes live" list. @param {any} x */
  const handles = (x) => !!x && CODES.includes(x.reason_code);

  /** The line console.js's derive() adds for one item, so the sidebar badge, the client list and the client's Overview count it. @param {any} x */
  function toNeed(x) {
    const k = KINDS[x.reason_code];
    return { kind: 'exception', label: k.label, text: String(x.message || ''), at: x.detected_at, href: `#/queue/${x.id}`, rank: k.rank, ex: x, hint: 'Plans, limits and bill emails: open Needs you to act on it' };
  }

  /** Pending results that already have their own outlier card, so the older approvals list does not show them twice. @param {any[]} exceptions */
  function claimedItems(exceptions) {
    const out = new Set();
    for (const x of exceptions || []) if (x.reason_code === 'result_outlier' && x.entity_id) out.add(String(x.entity_id));
    return out;
  }

  /* ---- reading the plan data --------------------------------------------------------------------------- */

  /** @param {string} id */
  function planRow(id) { return C().plans.plans.find((/** @type {any} */ p) => p.id === id) || null; }
  /** @param {string} id */
  function planName(id) { const p = planRow(id); return p ? p.name : id ? id.charAt(0).toUpperCase() + id.slice(1) : 'No plan'; }
  /** The plan's name and, where the database gives one, its price. @param {string} id */
  function planWithPrice(id) { const p = planRow(id); const m = p ? C().money(p.price_minor, p.currency) : ''; return `${planName(id)}${m ? `, ${m}` : ''}`; }
  /** @param {string} id */
  function svcName(id) { const s = (C().plans.services || []).find((/** @type {any} */ x) => x.id === id); return s ? s.label : C().svcLabel(id); }
  const SERVICE_ORDER = ['advertising', 'social', 'website', 'local', 'email'];
  /** A client's services in catalog order, "Ads, Social media and Website". @param {string[]} picks */
  function picksText(picks) {
    const list = SERVICE_ORDER.filter((s) => (picks || []).includes(s)).map(svcName);
    // A name that holds "and" itself (SEO and Google Maps) joins with commas only, so it never reads "Website and SEO and Google Maps".
    if (list.length < 2) return list.join('') || 'No services';
    return list.some((x) => / and /.test(x)) ? list.join(', ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  }
  /** The services a month holds: its picks, which include Ads on every plan. @param {any} cycle */
  const picksOfCycle = (cycle) => (cycle ? cycle.picks || [] : []);
  /** The monthly limit of one metric on one plan, as of today. @param {string} planId @param {string} metric */
  function capOf(planId, metric) {
    const day = C().today();
    const rows = C().plans.caps.filter((/** @type {any} */ k) => k.plan_id === planId && k.metric === metric && String(k.effective_from) <= day).sort((/** @type {any} */ a, /** @type {any} */ b) => b.version - a.version);
    return rows[0] ? Number(rows[0].monthly_cap) : null;
  }
  /** @param {string} email */
  function mask(email) { const e = String(email || ''); const at = e.indexOf('@'); return at < 2 ? 'no address' : `${e.slice(0, 1)}***${e.slice(at)}`; }
  /** @param {string} iso a date, 'YYYY-MM-DD' @param {number} n days to add */
  function addDays(iso, n) { const d = new Date(`${String(iso).slice(0, 10)}T00:00`); d.setDate(d.getDate() + n); return C().localDay(d); }
  /** Whole days from today to a date (negative when it has passed). @param {string} iso */
  function daysTo(iso) { return Math.round((new Date(`${String(iso).slice(0, 10)}T00:00`).getTime() - new Date(`${C().today()}T00:00`).getTime()) / 86400000); }
  /** @param {string} iso */
  const dayText = (iso) => (iso ? C().longDate(iso) : '');
  /** @param {number} n @param {string} one @param {string} [many] */
  const plural = (n, one, many) => C().plural(n, one, many);

  /** What this item is about, gathered once: the client, its plan, the payload the database stored with the item. @param {any} ex */
  function ctxOf(ex) {
    const c = C();
    const t = c.tenant(ex.tenant_id);
    const v = ex.last_verified_value && typeof ex.last_verified_value === 'object' && !Array.isArray(ex.last_verified_value) ? ex.last_verified_value : {};
    const doc = (t && t.doc) || {};
    const user = doc.user || {};
    return { c, ex, v, t, tid: ex.tenant_id, pl: c.planOf(ex.tenant_id), name: t ? t.name : 'A client', first: String(user.firstName || '').trim(), contact: String(user.email || '').trim().toLowerCase() };
  }

  /** The limit an over cap item is about: the metric, the request or card behind it, and what is used. @param {any} cx */
  function limitOf(cx) {
    const { c, ex, v, pl } = cx;
    const reqId = ex.entity_type === 'request' ? ex.entity_id : v.request || v.request_id || '';
    const req = (c.all.requests || []).find((/** @type {any} */ r) => r.id === reqId) || null;
    const taskId = v.task || v.task_id || (ex.entity_type === 'task' ? ex.entity_id : '');
    const tasks = c.all.tasks || [];
    const task = tasks.find((/** @type {any} */ k) => k.id === taskId) || (req ? tasks.find((/** @type {any} */ k) => k.request_id === req.id) : null) || null;
    let metric = String(v.metric || (/^([a-z][a-z0-9_]*):\d+$/.exec(String(ex.entity_id || '')) || [])[1] || (req && req.metric) || '');
    let service = String(v.service || (req && req.service) || (task && task.service) || '');
    let line = metric ? pl.lines.find((/** @type {any} */ l) => l.metric === metric) || null : null;
    if (!line) {
      // The one limit that is full, when there is only one: the item did not say which it was.
      const full = pl.lines.filter((/** @type {any} */ l) => l.used >= l.cap && (!service || l.service === service));
      if (full.length === 1) line = full[0];
    }
    if (line) { metric = line.metric; service = service || line.service; }
    const qty = Math.min(100, Math.max(1, Math.round(Number(v.qty || v.asked || (req && req.est_qty) || 1)) || 1));
    const used = line ? line.used : Number(v.used) || 0;
    const cap = line ? line.cap : Number(v.cap) || 0;
    const label = line ? line.label : metricName(metric);
    return { req, task, metric, service, line, qty, used, cap, would: used + qty, over: Math.max(0, used + qty - cap), label };
  }

  /** The next plan up, when the client could take it: a locked plan takes nobody new, and a plan with a client limit needs a free place. @param {any} cx */
  function upgradeOf(cx) {
    const plans = cx.c.plans.plans.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => a.sort - b.sort);
    const cur = cx.pl.nowPlan;
    const i = cur ? plans.findIndex((/** @type {any} */ p) => p.id === cur.id) : -1;
    const up = i >= 0 ? plans[i + 1] : null;
    if (!up) return null;
    if (up.locked) return null;
    if (up.max_clients) {
      const held = new Set(cx.c.plans.cycles.filter((/** @type {any} */ k) => k.plan_id === up.id && k.state !== 'ended').map((/** @type {any} */ k) => k.tenant_id));
      const taken = Array.from(held).filter((id) => id !== cx.tid && (cx.c.tenant(id) || {}).status !== 'archived').length;
      if (taken >= up.max_clients) return null;
    }
    return up;
  }

  /* ---- writing: errors in words, the close step, drafts --------------------------------------------------- */

  /** The database's refusals as sentences for the team. @param {any} err */
  function say(err) {
    const raw = String((err && err.message) || err || '');
    const code = String((err && err.code) || '');
    /** @type {[RegExp, (m: RegExpExecArray) => string][]} */
    const map = [
      [/^not-found/, () => 'Someone already dealt with this. Reloaded.'],
      [/^stale/, () => 'It changed since you opened it. Reloaded.'],
      [/nothing-to-approve/, () => 'There is nothing new to approve here. Reloaded.'],
      [/^hidden/, () => 'This was hidden from the client, so it cannot be published from here.'],
      [/over_cap: (\d+) of (\d+)/, (m) => `That would make ${m[1]} of ${m[2]}, over the monthly limit, and no one-off was approved.`],
      [/service_not_picked/, () => 'That service is not in this month\'s plan.'],
      [/not-this-months-website-option/, () => 'This month\'s Starter website allowance is a different kind of work. Count it as that, or approve a one-off.'],
      [/cycle-not-running/, () => 'There is no running month to count this in.'],
      [/cycle-not-this-client/, () => 'That month belongs to another client.'],
      [/unknown-metric/, () => 'This plan has no limit for that kind of work.'],
      [/picks-do-not-fit/, () => 'Those picks do not fit the plan.'],
      [/plan-full/, () => 'The Domin8te place is taken right now.'],
      [/plan-locked/, () => 'That plan is locked, so nobody new can be put on it. An owner can lift the lock in Settings.'],
      [/month-locked/, () => 'This month is locked. Changes apply from next month.'],
      [/month-ended/, () => 'That month has ended.'],
      [/overlaps-another-month/, () => 'That overlaps another month for this client.'],
      [/reason-required/, () => 'Add a reason first.'],
      [/bad-email/, () => 'That email address does not look right.'],
      [/only-requeue/, () => 'This email is no longer failed, so it cannot be sent again.'],
      [/owner-only/, () => 'Only an owner can send this email to a different address. Keep the same address, or ask an owner.'],
      [/not-staff/, () => 'Your sign-in is not on the Domin8te team. Sign out and in again.'],
      [/unknown-reason|bad-status|bad-decision/, () => 'The database did not accept that. Reload and try again.']
    ];
    for (const [re, to] of map) { const m = re.exec(raw); if (m) return to(m); }
    if (code === '42501') return 'You are not allowed to do that here.';
    return raw || 'Something went wrong.';
  }
  /** Like D8C.check, but with the team's words. @param {any} res */
  function got(res) { if (res && res.error) throw Object.assign(new Error(say(res.error)), { raw: res.error }); return res ? res.data : null; }

  /** Closes the item (the database writes the audit line with the note). @param {any} cx @param {'resolved'|'ignored'} status @param {string} note */
  async function closeItem(cx, status, note) {
    const client = await cx.c.db();
    got(await client.rpc('resolve_dashboard_exception', { p_id: cx.ex.id, p_status: status, p_note: String(note).slice(0, 2000) }));
  }

  /** The text of a draft message waits here until the Messages page has drawn the conversation, then fills the reply box (never sends). */
  /** @type {{tid: string, text: string, at: number}|null} */
  let pendingDraft = null;
  /** @type {MutationObserver|null} */
  let draftWatch = null;
  function fillDraft() {
    if (!pendingDraft) return;
    if (Date.now() - pendingDraft.at > 8000) { pendingDraft = null; return; }
    const box = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('convo-body'));
    const head = document.querySelector('#convo-h a');
    if (!box || !head || head.getAttribute('href') !== `#/client/${pendingDraft.tid}`) return;
    if (!box.value) box.value = pendingDraft.text;
    box.focus();
    box.setSelectionRange(0, 0);
    box.scrollTop = 0;
    pendingDraft = null;
  }
  /** Opens the client's conversation with a message written in the reply box. Nothing is sent: the person reads it and presses Send. @param {string} tid @param {string} text */
  function draftTo(tid, text) {
    pendingDraft = { tid, text, at: Date.now() };
    if (!draftWatch) { draftWatch = new MutationObserver(() => fillDraft()); draftWatch.observe(C().main, { childList: true, subtree: true }); }
    const to = `#/messages/${tid}`;
    if (location.hash === to) C().route(); else location.hash = to;
    setTimeout(fillDraft, 60);
  }

  /** @param {any} cx @param {string} body */
  function letter(cx, body) {
    const me = (C().me && C().me.name) || 'The Domin8te team';
    return `Hi${cx.first ? ` ${cx.first}` : ''},\n\n${body}\n\n${me}`;
  }

  /* ---- the cards: one model for each kind --------------------------------------------------------------- */

  /**
   * @typedef {{status: 'resolved'|'ignored', note: string, toast: string, draft?: {tid: string, text: string}, keepOpen?: boolean}} Outcome
   * @typedef {{id: string, label: string, tone?: string, href?: string, hint?: string, disabled?: boolean,
   *   sheet?: {lead: string, fields?: string, confirm: string, danger?: boolean, noNote?: boolean, run: (f: HTMLFormElement, note: string) => Promise<Outcome>}}} Action
   * @typedef {{title: string, wrong: string, sees: string, fix: string, detail?: string, actions: Action[], stale?: string}} Model
   */

  /** A note box every sheet ends with. @param {string} [text] */
  const noteField = (text) => `<div class="field nx-note"><label for="nx-note">Note for the history (optional)</label><textarea id="nx-note" name="note" rows="2" maxlength="500" placeholder="Why, in a few words">${esc(text || '')}</textarea></div>`;
  /** A short sentence after the person's own note. @param {string} base @param {string} note */
  const withNote = (base, note) => (note ? `${base} Note: ${note}` : base);

  /** Two columns, the console's value and the client dashboard's, side by side; a row that differs shows red on the client side. @param {string} left @param {string} right @param {string[][]} rows */
  function compare(left, right, rows) {
    return `<div class="nx-compare" role="table" aria-label="${esc(left)} compared with ${esc(right)}">
      <div class="nx-cmp-row nx-cmp-head" role="row"><span role="columnheader"></span><span role="columnheader">${esc(left)}</span><span role="columnheader">${esc(right)}</span></div>
      ${rows.map((r) => `<div class="nx-cmp-row" role="row"><span class="nx-cmp-k" role="rowheader">${esc(r[0])}</span><span role="cell">${esc(r[1])}</span><span role="cell"${r[1] && r[2] && r[1] !== r[2] && r[3] !== 'plain' ? ' class="is-diff"' : ''}>${esc(r[2])}</span></div>`).join('')}</div>`;
  }

  /** The reminder row behind a reminder_failed item. @param {any} cx */
  function reminderOf(cx) {
    const list = cx.c.plans.reminders || [];
    const id = String(cx.ex.entity_id || '');
    const direct = list.find((/** @type {any} */ r) => r.id === id);
    if (direct) return direct;
    const m = /^(d7|d3|picks_confirmed):(.+)$/.exec(id);
    return m ? list.find((/** @type {any} */ r) => r.kind === m[1] && r.cycle_id === m[2]) || null : null;
  }

  /** @param {any} cx @returns {Model} */
  function modelPlanMismatch(cx) {
    const { c, ex, v, pl, tid } = cx;
    const cyc = (/** @type {any} */ k) => (k ? { plan: k.plan_id, picks: picksOfCycle(k), since: String(k.confirmed_at || k.period_start || '').slice(0, 10) } : null);
    const own = ex.entity_type === 'plan_cycle' ? c.plans.cycles.find((/** @type {any} */ k) => k.id === ex.entity_id) || null : null;
    const con = v.console && typeof v.console === 'object' ? { plan: v.console.plan, picks: v.console.picks || null, since: String(v.console.since || '').slice(0, 10) } : cyc(own && own.id !== (pl.now && pl.now.id) ? own : pl.next);
    const dash = v.dashboard && typeof v.dashboard === 'object' ? { plan: v.dashboard.plan, picks: v.dashboard.picks || null, since: '' } : cyc(pl.now);
    const differ = !!(con && dash && con.plan !== dash.plan);
    const title = differ ? 'Plan mismatch: the dashboard shows the wrong plan' : 'Plan mismatch';
    const wrong = differ
      ? `The client dashboard still reads ${planName(dash.plan)}. The console says ${planName(con.plan)}${con.since ? ` since ${C().when(con.since)}` : ''}.`
      : String(ex.message || 'The console and the client dashboard disagree about the plan.');
    const sees = dash ? `They keep seeing ${planName(dash.plan)}, the last verified plan, until you resolve this.` : 'They keep seeing the last verified plan until you resolve this.';
    /** @type {string[][]} */ const rows = [['Plan', con ? planWithPrice(con.plan) : 'Not set yet', dash ? planWithPrice(dash.plan) : 'Not set']];
    const cp = (con && con.picks) || (dash && dash.picks) ? [con ? con.picks : null, dash ? dash.picks : null] : [null, null];
    if (cp[0] || cp[1]) rows.push(['Services', cp[0] ? picksText(cp[0]) : '', cp[1] ? picksText(cp[1]) : '']);
    if (con && dash) {
      const metrics = Array.from(new Set(c.plans.caps.filter((/** @type {any} */ k) => (k.plan_id === con.plan || k.plan_id === dash.plan) && (!(con.picks || dash.picks) || (con.picks || dash.picks || []).includes(k.service))).map((/** @type {any} */ k) => k.metric)));
      /** @type {string[][]} */ const diff = [];
      for (const m of metrics) {
        const a = capOf(con.plan, m);
        const b = capOf(dash.plan, m);
        if (a !== b) diff.push([perPeriod(m, metricName(m)), a === null ? 'None' : String(a), b === null ? 'None' : String(b)]);
      }
      for (const r of diff.slice(0, 3)) rows.push(r);
      if (diff.length > 3) rows.push([`${diff.length - 3} more limits differ`, '', '']);
    }
    const use = con && con.plan ? { plan: con.plan } : null;
    // The month to push: the one the item names, else next month when it exists, else this month.
    const target = own || pl.next || pl.now;
    const carry = !!(own && pl.now && own.id === pl.now.id && !pl.next);
    /** @type {Action[]} */ const actions = [
      {
        id: 'use', label: 'Use console value', tone: 'primary', disabled: !target,
        hint: target ? '' : 'There is no plan month to use. Set the plan in Billing first.',
        sheet: {
          lead: carry
            ? `<strong>Carry ${esc(planName(pl.now.plan_id))} into next month?</strong> The console makes next month the same as this one: ${esc(picksText(picksOfCycle(pl.now)))}. The client dashboard then shows it.`
            : `<strong>Use the console value?</strong> The client dashboard is brought in line with ${esc(use ? planName(use.plan) : 'the console')}. They stop seeing the old plan.`,
          confirm: carry ? 'Carry it over' : 'Use console value',
          run: async (f, note) => {
            const client = await c.db();
            const month = carry ? { start: pl.now.period_end, plan: pl.now.plan_id, picks: pl.now.picks, opt: pl.now.website_option } : { start: target.period_start, plan: target.plan_id, picks: target.picks, opt: target.website_option };
            got(await client.rpc('override_plan_cycle', { p_tenant: tid, p_period_start: month.start, p_plan: month.plan, p_picks: month.picks, p_website_option: month.opt || null, p_reason: withNote(carry ? 'Plan mismatch: this month\'s plan carried into next month.' : 'Plan mismatch: console value used.', note) }));
            return { status: 'resolved', note: withNote(`Used the console value (${planName(month.plan)}).`, note), toast: `${planName(month.plan)} is now what ${cx.name} sees.` };
          }
        }
      },
      {
        id: 'keep', label: 'Keep client value', tone: 'quiet',
        sheet: {
          lead: `<strong>Keep what the client sees?</strong> ${esc(dash ? planName(dash.plan) : 'The last verified plan')} stays on their dashboard and the console is not pushed. Fix the console in Billing if it is the one that is wrong.`,
          confirm: 'Keep client value',
          run: async (f, note) => ({ status: 'ignored', note: withNote(`Kept the client value${dash ? ` (${planName(dash.plan)})` : ''}.`, note), toast: 'Kept what the client sees.' })
        }
      },
      { id: 'billing', label: 'Open in Billing', tone: 'link', href: `#/billing/${tid}` }
    ];
    return { title, wrong, sees, fix: 'Use the console value: it is the source of truth and replaces what they see.', detail: compare('Console (source of truth)', 'Client dashboard', rows), actions };
  }

  /** @param {any} cx @returns {Model} */
  function modelOverCap(cx) {
    const { c, ex, pl, tid } = cx;
    const L = limitOf(cx);
    const isReq = ex.reason_code === 'over_cap_request';
    const planNm = pl.nowPlan ? pl.nowPlan.name : 'their plan';
    const known = !!(L.metric && L.cap);
    const title = known ? `Over cap: ${metricName(L.metric, L.label)} ${L.would} of ${L.cap} (${planNm})` : String(ex.message || 'Over cap').replace(/\.$/, '');
    const who = L.req && L.req.by_name ? L.req.by_name : cx.first || 'The client';
    const wrong = isReq
      ? `${who} asked${L.req ? ` ${c.ago(L.req.at)}` : ''}${L.req ? `: ${quoted(L.req.body, 140)}` : ' for more than the plan allows.'} ${known ? `${planNm} allows ${L.cap} ${perPeriod(L.metric, L.label)} and ${L.used} ${L.used === 1 ? 'is' : 'are'} ${usedWord(L.metric)}, so this would make ${L.would}.` : String(ex.message || '')}`
      : `${known ? `${planNm} allows ${L.cap} ${perPeriod(L.metric, L.label)} and ${L.used} ${L.used === 1 ? 'is' : 'are'} ${usedWord(L.metric)}. Counting this work would take it to ${L.would}.` : String(ex.message || '')}${L.task ? ` Card: ${quoted(L.task.title, 100)}` : ''}`;
    const sees = isReq
      ? 'Their request is waiting for you. Nothing is scheduled or counted until you decide.'
      : known ? `Their usage bar reads ${L.used} of ${L.cap} ${L.label}. This work is not counted yet.` : 'Their usage bar does not count this work yet.';
    // Only the website has two kinds of work that can stand in for each other (a page edit or a new page); the other limits are not interchangeable.
    const alt = L.service === 'website' ? pl.lines.filter((/** @type {any} */ l) => l.service === L.service && l.metric !== L.metric && l.used + L.qty <= l.cap).sort((/** @type {any} */ a, /** @type {any} */ b) => (b.cap - b.used) - (a.cap - a.used))[0] || null : null;
    const up = upgradeOf(cx);
    const cycle = pl.now;
    const noMonth = !cycle || !known || !L.service;
    const why = !cycle ? 'There is no running month for this client. Set the plan in Billing first.' : !known ? 'This item does not say which limit it is about.' : '';
    const usageLine = known ? { label: metricName(L.metric, L.label), used: L.used, cap: L.cap, pct: Math.min(100, Math.round((L.used / L.cap) * 100)), tone: C().usageTone(L.used, L.cap) } : null;
    const detail = usageLine ? `<div class="nx-usage">${C().usageBar(usageLine)}<p class="nx-usage-note">${L.over ? `Counting this would make ${L.would} of ${L.cap}, ${L.over} over.` : `Counting this would make ${L.would} of ${L.cap}.`}</p></div>` : '';
    /**
     * Adds the usage row, starts the request (when it is waiting) and resolves this item, all in one database call (count_needs_usage,
     * 20261014110100): a failure leaves nothing half done, and a retry after it went through counts nothing twice. Resolves false when the
     * item was already dealt with (nothing was counted now). A live limit is sent as the new total (what is live once this starts).
     * @param {string} metric @param {boolean} oneOff @param {number} qty @param {string} note @param {string} closeNote
     */
    const count = async (metric, oneOff, qty, note, closeNote) => {
      const client = await c.db();
      const out = got(await client.rpc('count_needs_usage', {
        p_exception: ex.id, p_tenant: tid, p_cycle: cycle.id, p_service: L.service, p_metric: metric, p_qty: isLive(metric) ? Math.min(100, L.used + qty) : qty,
        p_one_off: oneOff, p_note: String(note || (oneOff ? 'One-off approved over the limit' : 'Counted as a different kind of work')).slice(0, 500),
        p_task: L.task ? L.task.id : null, p_request: L.req ? L.req.id : null, p_close_note: String(closeNote || '').slice(0, 2000)
      }));
      return !!(out && out.done);
    };
    const already = 'This was already done, so nothing was counted again.';
    /** @type {Action[]} */ const actions = [];
    if (alt) {
      actions.push({
        id: 'countas', label: `Count as ${alt.used + L.qty} of ${alt.cap} ${alt.label}`, tone: 'primary', disabled: noMonth, hint: why,
        sheet: {
          lead: `<strong>Count it as ${esc(alt.label)} instead?</strong> It fits the plan (${alt.used + L.qty} of ${alt.cap} ${esc(alt.label)}), so no one-off is needed. ${L.req && L.req.status === 'review' ? 'The request moves to In progress.' : ''}`,
          confirm: 'Count it',
          run: async (f, note) => {
            const closing = withNote(`Counted as ${alt.used + L.qty} of ${alt.cap} ${alt.label} instead of ${L.label}.`, note);
            const done = await count(alt.metric, false, L.qty, withNote(`Counted as ${alt.label} instead of ${L.label}.`, note), closing);
            return { status: 'resolved', note: closing, toast: done ? `Counted as ${alt.label}.` : already, keepOpen: true };
          }
        }
      });
    }
    actions.push({
      id: 'oneoff', label: 'Approve one-off', tone: alt ? 'quiet' : 'primary', disabled: noMonth, hint: why,
      sheet: {
        lead: `<strong>Approve a one-off over the limit?</strong> This adds to ${esc(L.label)} for ${esc(cx.name)}: ${L.used} of ${L.cap} becomes ${L.would}, past the cap. It is recorded as approved by you. Nothing is charged automatically.${L.req && L.req.status === 'review' ? ' The request moves to In progress.' : ''}`,
        fields: `<div class="field nx-qty"><label for="nx-qty">${isLive(L.metric) ? 'How many more go live' : 'How many to count'}</label><input id="nx-qty" name="qty" type="number" min="1" max="100" step="1" value="${L.qty}" inputmode="numeric"></div>`,
        confirm: 'Approve one-off',
        run: async (f, note) => {
          const qty = Math.min(100, Math.max(1, Math.round(Number(C().val(f, 'qty')) || L.qty)));
          const closing = withNote(`Approved one-off on ${L.label}: ${qty} counted past the limit (${L.used} of ${L.cap} becomes ${L.used + qty}).`, note);
          const done = await count(L.metric, true, qty, withNote(isLive(L.metric) ? 'One-off approved over the limit.' : 'One-off approved over the monthly limit.', note), closing);
          return { status: 'resolved', note: closing, toast: done ? `Counted ${qty} on ${L.label} as a one-off.` : already, keepOpen: true };
        }
      }
    });
    const nextStart = cycle ? cycle.period_end : '';
    actions.push({
      id: 'next', label: 'Move to next month', tone: 'quiet',
      sheet: {
        lead: `<strong>Move this to next month?</strong> Nothing is counted now.${L.task ? ` The card “${esc(String(L.task.title).slice(0, 80))}” gets the due date ${esc(dayText(nextStart))}${L.task.status === 'done' ? ' and goes back to To do' : ''}.` : ''}`,
        confirm: 'Move to next month',
        run: async (f, note) => {
          if (L.task && nextStart) {
            const client = await c.db();
            /** @type {any} */ const patch = { due: nextStart };
            if (L.task.status === 'done') patch.status = 'todo';
            got(await client.from('tasks').update(patch).eq('id', L.task.id).select('id').single());
          }
          return { status: 'resolved', note: withNote(`Moved to next month${nextStart ? ` (from ${dayText(nextStart)})` : ''}. Nothing counted this month.`, note), toast: 'Moved to next month. Nothing is counted now.' };
        }
      }
    });
    if (up) {
      actions.push({
        id: 'upgrade', label: `Suggest ${up.name}`, tone: 'quiet',
        sheet: {
          lead: `<strong>Draft a message suggesting ${esc(up.name)}?</strong> It opens in Messages for you to read and edit. Nothing is sent. This item closes as "suggested".`,
          confirm: 'Open the draft',
          run: async (f, note) => {
            const upCap = L.metric ? capOf(up.id, L.metric) : null;
            const bill = cycle ? dayText(cycle.period_end) : '';
            const are = L.used === 1 ? 'is' : 'are';
            const live = isLive(L.metric);
            const text = letter(cx, `${isReq ? `Thanks for asking about more ${L.label}.` : live ? `Your ${L.label} are at the limit right now.` : `Your ${L.label} for this month are at the limit.`} ${planNm} includes up to ${L.cap || 'a set number of'} ${perPeriod(L.metric, L.label)} and ${L.used} ${are} ${usedWord(L.metric)}.

Two ways forward: ${live ? 'we can start the new one when one that is running now ends' : 'we can do the extra work next month'}, or you can move up to ${up.name}${upCap ? `, which includes up to ${upCap} ${perPeriod(L.metric, L.label)}` : ''}. A plan change starts from your next bill date${bill ? `, ${bill}` : ''}. Tell us which you would like and we will take it from there.`);
            return { status: 'resolved', note: withNote(`Suggested ${up.name} (a draft was opened in Messages, not sent).`, note), toast: 'Draft ready. Read it, edit it, then press Send. Nothing has been sent.', draft: { tid, text } };
          }
        }
      });
    }
    actions.push({
      id: 'decline', label: 'Decline', tone: 'danger',
      sheet: {
        lead: L.req ? `<strong>Decline this request?</strong> It is marked Declined and its card is cancelled. The client is not messaged: write to them in Messages if you want to explain.` : `<strong>Close this without counting it?</strong> The work stays uncounted this month. Nothing else changes.`,
        fields: '', confirm: L.req ? 'Decline request' : 'Close without counting', danger: true,
        run: async (f, note) => {
          if (L.req) { const client = await c.db(); got(await client.from('requests').update({ status: 'declined' }).eq('id', L.req.id).select('id').single()); }
          return { status: 'ignored', note: withNote(L.req ? 'Declined the request.' : 'Declined: not counted this month.', note), toast: L.req ? 'Request declined.' : 'Closed. Nothing was counted.' };
        }
      }
    });
    const fix = alt ? `Count it as ${alt.used + L.qty} of ${alt.cap} ${alt.label}: it fits the plan, so no one-off is needed.` : up ? `Approve it as a one-off, or suggest ${up.name} first. Nothing is charged without your OK.` : 'Approve it as a one-off or move it to next month. Nothing is charged without your OK.';
    return { title, wrong, sees, fix, detail, actions };
  }

  /** @param {any} cx @returns {Model} */
  function modelNotPicked(cx) {
    const { c, ex, pl, tid } = cx;
    const req = (c.all.requests || []).find((/** @type {any} */ r) => r.id === ex.entity_id) || null;
    const service = (req && req.service) || '';
    const svc = service ? svcName(service) : 'a service';
    const planNm = pl.nowPlan ? pl.nowPlan.name : 'their plan';
    const stale = service && pl.now && picksOfCycle(pl.now).includes(service) ? `${svc} is in this month's plan now.` : '';
    const nextStart = pl.now ? pl.now.period_end : '';
    const deadline = nextStart ? addDays(nextStart, -1) : '';
    // Every plan is Ads plus picks. When all the picks are in use, adding a service means swapping one out, or moving up.
    const rowNow = pl.nowPlan;
    const slots = rowNow && rowNow.picks_allowed != null ? Number(rowNow.picks_allowed) : null;
    const inUse = pl.now && rowNow ? (pl.now.picks || []).filter((/** @type {string} */ x) => !(rowNow.required_services || []).includes(x)).length : 0;
    const packed = slots !== null && inUse >= slots;
    const up = packed ? upgradeOf(cx) : null;
    /** @type {Action[]} */ const actions = [
      {
        id: 'suggest', label: 'Suggest for next month', tone: 'primary',
        sheet: {
          lead: `<strong>Draft a message about ${esc(svc)} for next month?</strong> It opens in Messages for you to read and edit. Nothing is sent. This item closes as "suggested".`,
          confirm: 'Open the draft',
          run: async (f, note) => {
            const text = packed ? letter(cx, `Thanks for your request about ${svc}. ${svc} is not one of your picks this month, so we have not started it.

Your ${planNm} plan is Ads plus ${slots} ${slots === 1 ? 'pick' : 'picks'}, and ${slots === 1 ? 'it is' : 'they are all'} in use. For next month you can swap ${svc} in for one of your current picks${up ? `, or move up to ${up.name}, which is Ads plus ${Number(up.picks_allowed)} picks` : ''}. Open Billing in your dashboard${deadline ? ` before the end of ${dayText(deadline)}` : ''} to choose. Plan changes start from your next bill date${nextStart ? `, ${dayText(nextStart)}` : ''}. Reply here if you would like help choosing.`)
            : letter(cx, `Thanks for your request about ${svc}. ${svc} is not part of your ${planNm} plan this month, so we have not started it.\n\nYou can add it for next month: open Billing in your dashboard and choose it${deadline ? ` before the end of ${dayText(deadline)}` : ''}. Plan changes start from your next bill date${nextStart ? `, ${dayText(nextStart)}` : ''}. Reply here if you would like help choosing.`);
            return { status: 'resolved', note: withNote(`Suggested ${svc} for next month (a draft was opened in Messages, not sent).`, note), toast: 'Draft ready. Read it, edit it, then press Send. Nothing has been sent.', draft: { tid, text } };
          }
        }
      },
      {
        id: 'decline', label: 'Decline', tone: 'danger',
        sheet: {
          lead: `<strong>Decline this request?</strong> It is marked Declined and its card is cancelled. The client is not messaged: write to them in Messages if you want to explain.`,
          confirm: 'Decline request', danger: true,
          run: async (f, note) => {
            if (req) { const client = await c.db(); got(await client.from('requests').update({ status: 'declined' }).eq('id', req.id).select('id').single()); }
            return { status: 'ignored', note: withNote(`Declined the request for ${svc}.`, note), toast: 'Request declined.' };
          }
        }
      }
    ];
    const who = (req && req.by_name) || cx.first || 'The client';
    return {
      title: `Request for ${svc}, which is not in this month's plan`,
      wrong: `${who} asked${req ? ` ${c.ago(req.at)}: ${quoted(req.body, 140)}` : '.'} ${svc} is not part of ${planNm} this month.`,
      sees: 'Their request is waiting for you. Nothing is scheduled and nothing is counted.',
      fix: 'Suggest it for next month: a draft opens in Messages. Nothing is sent.',
      stale, actions
    };
  }

  /** @param {any} cx @returns {Model} */
  function modelPicks(cx) {
    const { c, ex, pl, tid } = cx;
    const nx = c.plans.cycles.find((/** @type {any} */ k) => k.id === ex.entity_id) || pl.next;
    const bill = nx ? nx.period_start : pl.now ? pl.now.period_end : '';
    const deadline = bill ? addDays(bill, -1) : '';
    const left = deadline ? daysTo(deadline) : null;
    const picks = nx ? picksOfCycle(nx) : [];
    const what = nx ? `${planName(nx.plan_id)}: ${picksText(picks)}` : 'the same picks';
    const title = left === null ? 'Picks not confirmed' : left < 0 ? 'Picks not confirmed, the deadline has passed' : left === 0 ? 'Picks not confirmed, the last day to change them is today' : `Picks not confirmed, ${plural(left + 1, 'day')} left`;
    const stale = nx && nx.source !== 'auto_carry' ? 'The picks have been confirmed since.' : '';
    /** @type {Action[]} */ const actions = [
      {
        id: 'confirm', label: 'Confirm current picks', tone: 'primary', disabled: !nx, hint: nx ? '' : 'There is no next month to confirm.',
        sheet: {
          lead: `<strong>Confirm ${esc(what)}?</strong> They stay as they are for the month starting ${esc(dayText(bill))}, and this stops being a carry-over. The client can still change them until the day before the bill.`,
          confirm: 'Confirm picks',
          run: async (f, note) => {
            const client = await c.db();
            got(await client.rpc('override_plan_cycle', { p_tenant: tid, p_period_start: nx.period_start, p_plan: nx.plan_id, p_picks: nx.picks, p_website_option: nx.website_option || null, p_reason: withNote('Confirmed the picks that were carried over.', note) }));
            return { status: 'resolved', note: withNote(`Confirmed the current picks (${planName(nx.plan_id)}: ${picksText(picks)}).`, note), toast: 'Next month\'s picks are confirmed.' };
          }
        }
      },
      {
        id: 'message', label: 'Message client', tone: 'quiet',
        sheet: {
          lead: '<strong>Draft a message about the picks?</strong> It opens in Messages for you to read and edit. Nothing is sent. This item stays open until the picks are confirmed.',
          confirm: 'Open the draft', noNote: true,
          run: async (f, note) => {
            const text = letter(cx, `A quick check on next month. Your plan has been carried over from this month and not confirmed yet: ${what}. If that is right, you do not need to do anything. If you want to change it, you can do that in Billing in your dashboard until the end of ${dayText(deadline)}.\n\nYour next bill date is ${dayText(bill)}.`);
            return { status: 'resolved', note: '', toast: 'Draft ready. Read it, edit it, then press Send. Nothing has been sent.', draft: { tid, text }, keepOpen: true };
          }
        }
      }
    ];
    return {
      title,
      wrong: `Next month's picks were carried over from this month and nobody has confirmed them. The bill is on ${dayText(bill)}.${picks.length ? ` If nothing changes, ${picksText(picks)} carry over.` : ''}`,
      sees: `Their picks page shows ${what} for next month, marked as carried over. They can change it until the end of ${dayText(deadline)}.`,
      fix: 'Confirm the picks if they are right, or message the client first.',
      stale, actions
    };
  }

  /** @param {any} cx @returns {Model} */
  function modelReminder(cx) {
    const { c, ex, tid, pl } = cx;
    const rem = reminderOf(cx);
    const kind = rem ? rem.kind : /^(d7|d3)/.exec(String(ex.entity_id || ''))?.[1] || '';
    const n = kind === 'd7' ? '7 day' : kind === 'd3' ? '3 day' : 'bill';
    const nx = rem ? c.plans.cycles.find((/** @type {any} */ k) => k.id === rem.cycle_id) : pl.next;
    const bill = nx ? nx.period_start : '';
    const other = rem ? (c.plans.reminders || []).find((/** @type {any} */ r) => r.cycle_id === rem.cycle_id && r.id !== rem.id && (r.kind === 'd7' || r.kind === 'd3')) : null;
    const otherLine = other && other.status === 'sent' ? ` The ${other.kind === 'd7' ? '7 day' : '3 day'} reminder went out on ${C().when(String(other.sent_at || '').slice(0, 10))}.` : '';
    const reason = rem && rem.error ? rem.error : '';
    const wrong = rem
      ? (rem.status === 'skipped' || !rem.to_email
        ? `The ${n} email was not sent${reason ? `: ${reason}` : ''}.${otherLine}`
        : `The ${n} email to ${mask(rem.to_email)} failed${rem.attempts ? ` after ${plural(rem.attempts, 'try', 'tries')}` : ''}${reason ? `: ${reason}` : ''}.${otherLine}`)
      : String(ex.message || 'A bill reminder could not be sent.');
    const stale = rem && rem.status === 'sent' ? 'The email went out since.' : rem && rem.status === 'scheduled' ? 'It is queued to send again.' : '';
    const email = rem && rem.to_email ? String(rem.to_email) : cx.contact;
    const sameAsContact = !!(rem && cx.contact && String(rem.to_email).toLowerCase() === cx.contact);
    /** @type {Action[]} */ const actions = [
      {
        id: 'fix', label: 'Fix email and resend', tone: 'primary', disabled: !rem, hint: rem ? '' : 'The reminder record was not found. Reload the page.',
        sheet: {
          lead: `<strong>Send the ${esc(n)} email again?</strong> Correct the address below. The email goes back in the queue and is sent on the next run.`,
          fields: `<div class="field nx-email"><label for="nx-email">Email address</label><input id="nx-email" name="email" type="email" value="${esc(email)}" maxlength="200" autocomplete="off" inputmode="email"></div>
            <label class="nx-check"><input type="checkbox" name="contact"${sameAsContact || !cx.contact ? ' checked' : ''}><span>Also make it their main contact email, so the next reminders reach them</span></label>`,
          confirm: 'Resend email',
          run: async (f, note) => {
            const mail = C().val(f, 'email').toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Error('That email address does not look right.');
            const client = await c.db();
            const alsoContact = /** @type {HTMLInputElement|null} */ (f.elements.namedItem('contact'));
            const t = c.tenant(tid);
            let contactDone = false;
            if (alsoContact && alsoContact.checked && t && cx.contact !== mail) {
              const doc = c.clone(t.doc);
              doc.user = { ...(doc.user || {}), email: mail };
              const rows = got(await client.from('tenants').update({ doc }).eq('id', tid).eq('updated_at', t.updated_at).select('updated_at')) || [];
              if (!rows.length) throw new Error('Someone else changed this client a moment ago. Nothing was saved. Reload and try again.');
              contactDone = true;
            }
            got(await client.from('billing_reminders').update({ to_email: mail, status: 'scheduled' }).eq('id', rem.id).select('id'));
            return { status: 'resolved', note: withNote(`Fixed the email (${mask(mail)}) and put the ${n} reminder back in the queue${contactDone ? '; also made it the main contact email' : ''}.`, note), toast: `The ${n} email is queued to ${mask(mail)}.` };
          }
        }
      },
      {
        id: 'phone', label: 'Mark as told by phone', tone: 'quiet',
        sheet: {
          lead: `<strong>Mark as told by phone?</strong> You have told ${esc(cx.first || cx.name)} about the ${esc(n)} reminder yourself, so nothing is sent. This item closes.`,
          fields: '', confirm: 'Mark as told',
          run: async (f, note) => ({ status: 'resolved', note: withNote(`Told them by phone: the ${n} reminder did not need to be sent.`, note), toast: 'Marked as told by phone.' })
        }
      }
    ];
    return {
      title: `${n.charAt(0).toUpperCase()}${n.slice(1)} reminder failed${reason && /bounce/i.test(reason) ? ' (bounced)' : ''}`,
      wrong,
      sees: `They did not get this email. Their dashboard is unchanged${bill ? `: it still shows the bill date, ${dayText(bill)}, and when picks lock` : ''}.`,
      fix: 'Fix the address and send it again, or tell them by phone.',
      stale, actions
    };
  }

  /** @param {any} cx @returns {Model} */
  function modelNotification(cx) {
    const { ex } = cx;
    const toTeam = /to the team/.test(String(ex.message || ''));
    const who = toTeam ? 'the team' : cx.first || cx.name || 'the client';
    const where = toTeam ? 'The team did not get the email about a client message.' : `${cx.first || cx.name || 'The client'} did not get the email about your reply.`;
    /** The queue row behind this item, read when an action runs (the item names it). */
    const rowOf = async (/** @type {any} */ client) => { const rows = got(await client.from('message_notifications').select('id, to_email, status').eq('id', String(ex.entity_id || '')).limit(1)) || []; return rows[0] || null; };
    /** @type {Action[]} */ const actions = [
      {
        id: 'again', label: 'Send again', tone: 'primary',
        sheet: {
          lead: `<strong>Send the email again?</strong> It goes back in the queue and is sent within the minute. ${toTeam ? 'If the team address is wrong, fix it in Settings first.' : 'If their address is wrong, put the right one below.'}`,
          fields: `<div class="field nx-email"><label for="nx-email">Send it to a different address <span class="optional">(optional)</span></label><input id="nx-email" name="email" type="email" maxlength="200" autocomplete="off" inputmode="email" placeholder="name@restaurant.com"></div>`,
          confirm: 'Send again',
          run: async (f, note) => {
            const mail = C().val(f, 'email').toLowerCase();
            if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Error('That email address does not look right.');
            const client = await cx.c.db();
            const row = await rowOf(client);
            if (!row) throw new Error('The email record was not found. Reload the page.');
            /** @type {any} */ const patch = { status: 'scheduled' };
            if (mail && mail !== String(row.to_email).toLowerCase()) patch.to_email = mail;
            got(await client.from('message_notifications').update(patch).eq('id', row.id).select('id'));
            return { status: 'resolved', note: withNote(`Put the message email ${toTeam ? 'to the team' : 'to the client'} back in the queue${patch.to_email ? ` with a new address (${mask(mail)})` : ''}.`, note), toast: 'Queued. It goes out within the minute.' };
          }
        }
      },
      {
        id: 'handled', label: 'Mark as handled', tone: 'quiet',
        sheet: {
          lead: `<strong>Mark as handled?</strong> You have already answered ${esc(who)} another way, so nothing is sent. This item closes.`,
          fields: '', confirm: 'Mark as handled',
          run: async (f, note) => ({ status: 'resolved', note: withNote('Handled another way: the message email did not need to be sent.', note), toast: 'Marked as handled.' })
        }
      }
    ];
    return {
      title: toTeam ? 'Email about a client message failed' : 'Email about your reply failed',
      wrong: `${where} ${String(ex.message || '')}.`,
      sees: toTeam ? 'The message itself is saved and shows in Messages. Only the email did not go out.' : 'Your reply is saved and shows on their Messages page. Only the email telling them about it did not go out.',
      fix: toTeam ? 'Send it again, or open Messages and read it there.' : 'Send it again, or tell them by phone.',
      actions
    };
  }

  /** @param {any} cx @returns {Model} */
  function modelOutlier(cx) {
    const { c, ex, v, tid } = cx;
    const item = ((c.all.reviews && c.all.reviews.items) || []).find((/** @type {any} */ i) => i.id === ex.entity_id) || null;
    const content = item ? item.pending_content || item.content || {} : {};
    const label = String(content.label || content.metric || 'result');
    const unit = content.unit ? ` ${content.unit}` : '';
    const old = v.value;
    const next = content.value;
    const pct = Number(old) ? Math.round(((Number(next) - Number(old)) / Math.abs(Number(old))) * 100) : null;
    const period = item && item.reporting_period_start ? `${C().when(String(item.reporting_period_start).slice(0, 10))} to ${C().when(String(item.reporting_period_end).slice(0, 10))}` : '';
    /** @type {string[][]} */ const rows = [['Value', old === undefined ? 'None' : `${old}${unit}`, next === undefined ? 'Not found' : `${next}${unit}${pct === null ? '' : ` (${pct > 0 ? '+' : ''}${pct}%)`}`]];
    if (period || v.period_end) rows.push(['Period', v.period_end ? `to ${dayText(String(v.period_end).slice(0, 10))}` : '', period, 'plain']);
    if (content.source) rows.push(['Source', '', String(content.source), 'plain']);
    const missing = !item;
    /** @type {Action[]} */ const actions = [
      {
        id: 'publish', label: 'Verify and publish', tone: 'primary', disabled: missing, hint: missing ? 'This number is no longer waiting for a check.' : '',
        sheet: {
          lead: `<strong>Publish the new ${esc(label)}?</strong> ${esc(cx.name)} sees ${esc(String(next))}${esc(unit)} on their dashboard from now on, and the old number moves into the history. Check it against ${content.source ? esc(String(content.source)) : 'the source'} first.`,
          confirm: 'Verify and publish',
          run: async (f, note) => {
            const client = await c.db();
            got(await client.rpc('review_dashboard_item', { p_item_id: item.id, p_decision: 'approve', p_note: withNote('Checked against the source, published.', note), p_expected: item.updated_at }));
            return { status: 'resolved', note: withNote(`Verified and published ${label}: ${next}${unit}.`, note), toast: `${label} is published.` };
          }
        }
      },
      {
        id: 'hide', label: 'Keep hidden', tone: 'quiet', disabled: missing,
        sheet: {
          lead: `<strong>Keep the new number hidden?</strong> ${esc(cx.name)} keeps seeing ${esc(String(old === undefined ? 'the last verified number' : old))}${esc(unit)}. The new number is turned down and kept in the history. Enter it again if it turns out to be right.`,
          confirm: 'Keep hidden', danger: true,
          run: async (f, note) => {
            const client = await c.db();
            got(await client.rpc('review_dashboard_item', { p_item_id: item.id, p_decision: 'reject', p_note: withNote('Kept hidden: far from the last verified value.', note), p_expected: item.updated_at }));
            return { status: 'ignored', note: withNote(`Kept ${label} hidden (${next}${unit}); the last verified value stays.`, note), toast: 'Kept hidden. They still see the last verified number.' };
          }
        }
      }
    ];
    void tid;
    return {
      title: `${label}: the new number is far from the last verified`,
      wrong: String(ex.message || 'This number is more than 40% away from the last verified one.'),
      sees: `They keep seeing ${old === undefined ? 'the last verified number' : `${old}${unit}`}${v.period_end ? `, verified to ${dayText(String(v.period_end).slice(0, 10))}` : ''}. The new number is hidden.`,
      fix: 'Check it against the source: if it is right, verify and publish it; if not, keep it hidden.',
      detail: compare('Last verified', 'New number (hidden)', rows), actions
    };
  }

  /** @param {any} cx @returns {Model} */
  function modelBackfill(cx) {
    const { ex, v, pl, tid } = cx;
    const services = Array.isArray(v.services) ? v.services : [];
    const made = pl.all.some((/** @type {any} */ k) => new Date(k.created_at).getTime() > new Date(ex.detected_at).getTime());
    const stale = made ? 'A plan was set after this was raised.' : '';
    /** @type {Action[]} */ const actions = [
      { id: 'setplan', label: 'Set plan', tone: 'primary', href: `#/billing/${tid}` },
      { id: 'client', label: 'Open client', tone: 'link', href: `#/client/${tid}/overview` }
    ];
    return {
      title: 'Plan not set',
      wrong: String(ex.message || 'This client has no plan and picks on record.'),
      sees: 'No plan or monthly limits on their dashboard yet.',
      fix: 'Set their plan and picks in Billing. That puts the plan on their dashboard and starts counting usage.',
      detail: services.length ? `<p class="nx-services"><span class="nx-services-k">Services on record</span>${services.map((/** @type {string} */ s) => `<span class="chip plain">${esc(svcName(s))}</span>`).join('')}</p>` : '',
      stale, actions
    };
  }

  /** @type {Record<string, (cx: any) => Model>} */
  const MODEL = { plan_mismatch: modelPlanMismatch, over_cap: modelOverCap, over_cap_request: modelOverCap, service_not_picked: modelNotPicked, picks_unconfirmed: modelPicks, reminder_failed: modelReminder, notification_failed: modelNotification, result_outlier: modelOutlier, plan_backfill_needed: modelBackfill };

  /** The model of one item, with the single "Close" action when it has been dealt with elsewhere. @param {any} ex */
  function modelOf(ex) {
    const cx = ctxOf(ex);
    const m = MODEL[ex.reason_code](cx);
    if (m.stale) {
      const why = m.stale;
      const keep = m.actions.filter((a) => a.href);
      m.actions = [{
        id: 'close', label: 'Close this', tone: 'primary',
        sheet: { lead: `<strong>Close this item?</strong> ${esc(why)} Nothing else changes.`, confirm: 'Close', run: async (f, note) => ({ status: 'resolved', note: withNote(`Closed: ${why}`, note), toast: 'Closed.' }) }
      }, ...keep.filter((a) => a.id !== 'setplan')];
    }
    return { cx, m };
  }

  /* ---- drawing -------------------------------------------------------------------------------------------- */

  /** @param {any} ex */
  function card(ex) {
    const k = KINDS[ex.reason_code];
    const { cx, m } = modelOf(ex);
    const id = esc(ex.id);
    const btns = m.actions.map((a) => {
      const cls = a.tone === 'primary' ? 'btn btn-sm' : a.tone === 'danger' ? 'btn btn-danger btn-sm' : a.tone === 'link' ? 'btn btn-quiet btn-sm nx-link' : 'btn btn-quiet btn-sm';
      if (a.href) return `<a class="${cls}" href="${esc(a.href)}">${esc(a.label)}</a>`;
      return `<button class="${cls}" type="button" data-nx-act="${esc(a.id)}" data-nx-ex="${id}" aria-expanded="false"${a.disabled ? ' disabled' : ''}${a.hint ? ` title="${esc(a.hint)}"` : ''}>${esc(a.label)}</button>`;
    }).join('');
    const hints = m.actions.filter((a) => a.disabled && a.hint).map((a) => a.hint);
    return `<li class="nx-card${m.stale ? ' is-stale' : ''}" id="nx-${id}" data-qf="${k.f}" data-nx-card="${id}" aria-labelledby="nx-h-${id}">
      <div class="nx-main">
        <span class="nx-ico is-${m.stale ? 'good' : k.tone}">${ico(m.stale ? 'check' : k.icon)}</span>
        <div class="nx-body">
          <div class="nx-head"><h3 id="nx-h-${id}">${esc(m.title)}</h3><span class="nx-who"><a href="#/client/${esc(cx.tid)}/overview">${esc(cx.name)}</a><span class="nx-sep" aria-hidden="true"> · </span><span>${esc(C().ago(ex.detected_at))}</span>${ex.severity === 'critical' ? '<span class="chip bad plain">Urgent</span>' : ''}</span></div>
          ${m.stale ? `<p class="nx-stale">${esc(m.stale)} Close it to clear it from the queue.</p>` : ''}
          <dl class="nx-facts">
            <div><dt>What is wrong</dt><dd>${esc(m.wrong)}</dd></div>
            <div><dt>Client sees now</dt><dd>${esc(m.sees)}</dd></div>
            ${m.stale ? '' : `<div><dt>Fastest fix</dt><dd>${esc(m.fix)}</dd></div>`}
          </dl>
          ${m.detail ? `<div class="nx-detail">${m.detail}</div>` : ''}
          ${hints.length ? `<p class="nx-hint">${esc(hints[0])}</p>` : ''}
        </div>
      </div>
      <div class="nx-actions" role="group" aria-label="Actions: ${esc(m.title)}">${btns}</div>
      <div class="nx-slot" data-nx-slot></div>
    </li>`;
  }

  /** The typed cards, in one panel. @param {any[]} typed the needs derive() made from the items */
  function cards(typed) {
    if (!typed.length) return '';
    const list = typed.slice().sort((a, b) => a.rank - b.rank || String(a.ex.detected_at).localeCompare(String(b.ex.detected_at)));
    return `<section class="panel nx-panel" aria-label="Plans, limits and bill emails"><ul class="nx-list">${list.map((x) => card(x.ex)).join('')}</ul></section>`;
  }

  /** The line under the title and the filter chips. @param {{typed: any[], dmCount: number, otherCount: number}} view */
  function top(view) {
    const c = C();
    const typed = view.typed || [];
    /** @type {Record<string, number>} */ const n = { all: typed.length + view.dmCount + view.otherCount, approval: view.dmCount, mismatch: 0, limit: 0, deadline: 0, email: 0 };
    for (const x of typed) n[KINDS[x.ex.reason_code].f]++;
    const failed = !!(c.all.reviews && c.all.reviews.error);
    const held = typed.filter((x) => x.ex.reason_code === 'plan_mismatch' || x.ex.reason_code === 'result_outlier').length;
    const fresh = c.pageFresh({
      updatedAt: c.all.at,
      source: 'plan, usage and bill email records in the console, and the checks on what clients see',
      status: failed ? 'delayed' : held ? 'kept' : 'ok',
      label: failed ? 'Some data did not load' : held ? `${held} unverified` : 'Up to date',
      note: failed ? 'The queue could not be fully loaded, so do not assume nothing is waiting. Reload to try again.' : held ? 'For every unverified item the client keeps seeing the last verified value until you resolve it.' : ''
    });
    const chips = `<div class="nx-chips"><div class="seg" id="nx-filter" role="group" aria-label="Show">${FILTERS.map(([key, label]) => `<button type="button" data-nx-filter="${key}" aria-pressed="${state.filter === key}">${esc(label)}<span class="count quiet">${n[key]}</span></button>`).join('')}</div></div>`;
    return `${fresh}${chips}`;
  }

  /** Shows what the chip in use asks for and hides the rest. @param {HTMLElement} main */
  function applyFilter(main) {
    const f = state.filter;
    let shown = 0;
    for (const el of /** @type {HTMLElement[]} */ (Array.from(main.querySelectorAll('[data-qf]')))) {
      const on = f === 'all' || el.getAttribute('data-qf') === f;
      el.hidden = !on;
      if (on && el.classList.contains('nx-card')) shown++;
    }
    for (const b of Array.from(main.querySelectorAll('[data-nx-filter]'))) b.setAttribute('aria-pressed', String(b.getAttribute('data-nx-filter') === f));
    // Cards sit in one panel: when none of them shows, the panel goes too.
    const panel = /** @type {HTMLElement|null} */ (main.querySelector('.nx-panel'));
    if (panel) panel.hidden = f !== 'all' && !shown;
    const fold = main.querySelector('#q-needs');
    const anyShown = Array.from(main.querySelectorAll('[data-qf]')).some((el) => !(/** @type {HTMLElement} */ (el)).hidden);
    let empty = /** @type {HTMLElement|null} */ (main.querySelector('[data-nx-empty]'));
    if (!anyShown && f !== 'all' && fold) {
      if (!empty) { empty = document.createElement('div'); empty.className = 'empty'; empty.setAttribute('data-nx-empty', ''); fold.appendChild(empty); }
      const label = (FILTERS.find((x) => x[0] === f) || ['', ''])[1];
      empty.innerHTML = `<p><strong>Nothing under ${esc(label)}.</strong></p><p>Choose All to see everything that is waiting.</p>`;
      empty.hidden = false;
    } else if (empty) empty.hidden = true;
  }

  /** @param {HTMLElement} slot */
  function closeSheet(slot) {
    const card = slot.closest('.nx-card');
    slot.innerHTML = '';
    if (card) for (const b of Array.from(card.querySelectorAll('[aria-expanded="true"]'))) b.setAttribute('aria-expanded', 'false');
  }

  /** Opens the sheet of one action inside its card: what will happen, the fields it needs, a note, then confirm. @param {HTMLElement} btn */
  function openSheet(btn) {
    const c = C();
    const cardEl = /** @type {HTMLElement} */ (btn.closest('.nx-card'));
    const slot = /** @type {HTMLElement} */ (cardEl.querySelector('[data-nx-slot]'));
    const exId = btn.getAttribute('data-nx-ex') || '';
    const actId = btn.getAttribute('data-nx-act') || '';
    const same = slot.getAttribute('data-open') === actId && slot.firstElementChild;
    for (const el of Array.from(document.querySelectorAll('.nx-slot'))) { closeSheet(/** @type {HTMLElement} */ (el)); el.removeAttribute('data-open'); }
    if (same) return;
    const ex = ((c.all.reviews && c.all.reviews.exceptions) || []).find((/** @type {any} */ x) => x.id === exId);
    if (!ex) { c.toast('Someone already dealt with this. Reloaded.', true); c.refreshAll(); return; }
    const { cx, m } = modelOf(ex);
    const act = m.actions.find((a) => a.id === actId);
    if (!act || !act.sheet) return;
    const sh = act.sheet;
    slot.setAttribute('data-open', actId);
    btn.setAttribute('aria-expanded', 'true');
    slot.innerHTML = `<form class="nx-sheet" novalidate aria-label="${esc(act.label)}">
      <p class="nx-sheet-lead">${sh.lead}</p>
      ${sh.fields || ''}
      ${sh.noNote ? '' : noteField(actId === 'phone' ? `Told ${cx.first || 'them'} by phone on ${c.when(c.today())}.` : '')}
      <p class="field-error" role="alert" hidden></p>
      <div class="nx-sheet-btns"><button class="${sh.danger ? 'btn btn-danger btn-sm' : 'btn btn-sm'}" type="submit">${esc(sh.confirm)}</button><button class="btn btn-quiet btn-sm" type="button" data-nx-cancel>Cancel</button></div>
    </form>`;
    const f = /** @type {HTMLFormElement} */ (slot.querySelector('form'));
    const err = /** @type {HTMLElement} */ (f.querySelector('.field-error'));
    const first = /** @type {HTMLElement|null} */ (f.querySelector('input:not([type=checkbox]), select'));
    (first || /** @type {HTMLElement|null} */ (f.querySelector('textarea')) || /** @type {HTMLElement} */ (f.querySelector('button[type=submit]'))).focus({ preventScroll: false });
    f.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(slot); slot.removeAttribute('data-open'); btn.focus(); } });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const submit = /** @type {HTMLButtonElement} */ (f.querySelector('button[type=submit]'));
      const done = c.busy(submit, 'Saving');
      const note = c.val(f, 'note');
      /** @type {any} */ let out = null;
      try {
        out = await sh.run(f, note);
      } catch (x) {
        done();
        // One failure wording for every save (console.js failMessage, critic R2-27): browser text goes on a Details line.
        const said = (x && c.failMessage ? c.failMessage(x) : (x && /** @type {any} */ (x).message)) || 'That did not save.';
        err.textContent = said.replace(/\n/g, ' ');
        err.hidden = false;
        c.toast(/^Not saved\./.test(said) ? said : `Not saved. ${said}`, true);
        // A refusal can mean the page is out of date (somebody else acted first): load it again quietly.
        if (/Reloaded/.test(err.textContent || '')) { try { await c.loadAll(); c.redraw(); } catch (y) { /* the message above already said what happened */ } }
        return;
      }
      try {
        if (!out.keepOpen) await closeItem(cx, out.status, out.note);
      } catch (x) {
        c.toast(`${out.toast} But the item could not be closed: ${(x && /** @type {any} */ (x).message) || 'unknown error'}. Reloaded.`, true);
        try { await c.loadAll(); c.redraw(); } catch (y) { /* the message above already said what happened */ }
        return;
      }
      c.toast(out.toast);
      try { await c.loadAll(); } catch (x) { c.toast(`Saved, but the page could not reload: ${(x && /** @type {any} */ (x).message) || 'unknown error'}.`, true); }
      if (out.draft) { draftTo(out.draft.tid, out.draft.text); return; }
      // The list is drawn again without this item: stay where the person was reading, and give the heading the focus.
      const y = window.scrollY;
      c.redraw();
      window.scrollTo(0, y);
      const h = document.getElementById('page-title');
      if (h) h.focus({ preventScroll: true });
    });
    slot.querySelector('[data-nx-cancel]')?.addEventListener('click', () => { closeSheet(slot); slot.removeAttribute('data-open'); btn.focus(); });
  }

  /** The page's clicks: the chips and the action buttons. @param {HTMLElement} main @param {any} view */
  function wire(main, view) {
    void view;
    main.onclick = (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const chip = t.closest('[data-nx-filter]');
      if (chip) { state.filter = chip.getAttribute('data-nx-filter') || 'all'; applyFilter(main); return; }
      const b = /** @type {HTMLButtonElement|null} */ (t.closest('[data-nx-act]'));
      if (b && !b.disabled) openSheet(b);
    };
    applyFilter(main);
    // #/queue/<item id> (the link a client's Overview gives) scrolls to the card and marks it.
    const m = /^#\/queue\/(.+)$/.exec(location.hash || '');
    if (m) {
      const el = document.getElementById(`nx-${m[1]}`);
      if (el) {
        if (el.hidden) { state.filter = 'all'; applyFilter(main); }
        el.classList.add('is-focus');
        setTimeout(() => el.scrollIntoView({ block: 'center' }), 0);
      }
    }
  }

  EXT.needs = { CODES, KINDS, FILTERS, handles, toNeed, claimedItems, top, cards, wire, applyFilter, state, modelOf, metricName };
})();
