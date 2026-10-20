/*
 * Billing (#/billing, #/billing/<client id>), 2026-10-13: every client's plan, what they have this cycle (with its limits and
 * what is used), what changes next cycle, whether the picks are locked, whether the 7 and 3 day reminders went out, the latest
 * invoice and the Stripe link. Staff change a plan or its picks in the plan drawer; the drawer saves through the database
 * function override_plan_cycle, which always asks for a reason. An invoice and its payment link are approved here through
 * review_billing_invoice_v2.
 *
 * console.js calls window.D8C_EXT.billing.page(clientId) from billingPage(). The plan rule is the shared widget in mod-planpick.js.
 * Reads: tenants (D8C.all), plans, plan_caps, service_catalog, tenant_plan_cycles, tenant_usage_current, billing_reminders (D8C.plans),
 * client_billing_invoices, client_visibility_history, staff. Writes: override_plan_cycle, email_cycle_copy, review_billing_invoice_v2.
 */
(function () {
  'use strict';
  const W = /** @type {any} */ (window);
  const EXT = (W.D8C_EXT = W.D8C_EXT || {});
  const ORDER = ['advertising', 'social', 'website', 'local', 'email'];
  const C = () => W.D8C;
  const PP = () => EXT.planpick;
  const PM = () => W.D8.planModel;
  const T = () => W.D8.time;
  const esc = (/** @type {any} */ s) => C().esc(s);

  /** What this page remembers between draws: the filter, the invoices read last, and where the page was scrolled. */
  const state = { filter: 'all', /** @type {any[]|null} */ invoices: null, invoicesAt: 0, invoicesError: '', seq: 0, /** @type {number|null} */ keepScroll: null,
    /** @type {string|null} */ returnTo: null, /** @type {HTMLElement|null} */ returnEl: null,
    /** @type {string|null} */ openLimits: null, /** @type {'limits'|'plan'} */ returnKind: 'plan' };

  /* ---- days and words ------------------------------------------------------------------------------------ */

  const addDays = (/** @type {string} */ iso, /** @type {number} */ n) => T().isoDay(T().dayNum(iso) + n);
  const daysBetween = (/** @type {string} */ a, /** @type {string} */ b) => T().dayNum(b) - T().dayNum(a);
  /** "Mon 19 Oct". @param {string} iso */
  function dayLong(iso) {
    if (!iso) return '';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00');
    return isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
  }
  /** "19 Oct". @param {string} iso */
  const dayShort = (iso) => (iso ? C().when(String(iso).slice(0, 10)) : '');
  /** The calendar day of a stored time. @param {string} iso */
  const dayOfStamp = (iso) => C().dayOf(iso);
  /** "12 Oct, 10:41 PM". @param {string} iso */
  function stamp(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  const cap1 = (/** @type {string} */ s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const stripeIdOf = (/** @type {any} */ t) => (t && t.doc && t.doc.billing && t.doc.billing.stripeCustomerId) || '';

  /* ---- invoices ------------------------------------------------------------------------------------------ */

  /** Reads every client's invoices once a minute at most (the latest per client is all this page needs). @param {boolean} [force] */
  async function loadInvoices(force) {
    if (!force && state.invoices && Date.now() - state.invoicesAt < 60000) return state.invoices;
    try {
      // A changed link waits in pending_row, which only staff read (list_billing_invoices, 20261014130000); newest first.
      const res = await C().staffRows('list_billing_invoices', {}, (/** @type {any} */ k) => k.from('client_billing_invoices')
        .select('id, tenant_id, invoice_number, amount_minor, currency, status, issued_at, due_at, paid_at, hosted_payment_url, pending_row, pending_at, verification_status, client_visible, payment_link_approved_at, payment_link_approved_url, updated_at')
        .order('issued_at', { ascending: false }).limit(1000));
      if (res.error) throw res.error;
      state.invoices = (res.data || []).slice().sort((/** @type {any} */ a, /** @type {any} */ b) => String(b.issued_at || '').localeCompare(String(a.issued_at || '')));
      state.invoicesError = '';
    } catch (e) {
      state.invoices = state.invoices || [];
      state.invoicesError = 'The invoices could not be read just now.';
    }
    state.invoicesAt = Date.now();
    return state.invoices;
  }
  /** @param {string} tenantId */
  function latestInvoice(tenantId) {
    const list = (state.invoices || []).filter((i) => i.tenant_id === tenantId);
    list.sort((a, b) => String(b.issued_at).localeCompare(String(a.issued_at)) || String(b.invoice_number).localeCompare(String(a.invoice_number)));
    return list[0] || null;
  }
  /** @type {Record<string, [string, string]>} */
  const INV_STATUS = { paid: ['Paid', 'good'], open: ['Open', 'info'], overdue: ['Overdue', 'bad'], failed: ['Failed', 'bad'], void: ['Void', 'plain'] };
  /** The payment link a review would approve (a changed link waits in pending_row). @param {any} i */
  const linkOf = (i) => (i.pending_row && i.pending_row.hosted_payment_url) || i.hosted_payment_url || '';
  /** @param {any} i */
  const linkApproved = (i) => !!(i.payment_link_approved_at && i.hosted_payment_url && i.payment_link_approved_url === i.hosted_payment_url && !(i.pending_row && i.pending_row.hosted_payment_url && i.pending_row.hosted_payment_url !== i.hosted_payment_url));
  /** @param {any} i */
  const reviewable = (i) => i.verification_status === 'pending' || !!i.pending_at;

  /* ---- one client's row ---------------------------------------------------------------------------------- */

  /** @param {any} t */
  function rowOf(t) {
    const c = C();
    const P = c.planOf(t.id);
    const today = c.today();
    const now = P.now, next = P.next;
    const notStarted = !!now && String(now.period_start) > today;
    const bill = now ? (notStarted ? now.period_start : now.period_end) : next ? next.period_start : '';
    const valueOf = (/** @type {any} */ x) => (x ? { planId: x.plan_id, picks: x.picks || [], websiteOption: x.website_option || null } : null);
    const vNow = valueOf(now), vNext = valueOf(next);
    return {
      t, P, now, next, bill, today, notStarted, billIn: bill ? daysBetween(today, bill) : null, lastDay: bill ? addDays(bill, -1) : '',
      rem: (P.reminders || []).filter((/** @type {any} */ r) => r.kind === 'd7' || r.kind === 'd3'),
      b: c.billingOf(t), inv: latestInvoice(t.id), vNow, vNext,
      change: vNow && vNext ? PP().diffWords(vNow, vNext) : null
    };
  }
  /** @param {any} r @param {string} f */
  function matches(r, f) {
    if (f === 'soon') return r.billIn !== null && r.billIn >= 0 && r.billIn <= 7;
    if (f === 'unconfirmed') return !!r.next && r.next.source === 'auto_carry';
    if (f === 'failed') return r.rem.some((/** @type {any} */ x) => x.status === 'failed');
    if (f === 'late') return r.b.status === 'past_due';
    return true;
  }
  /** Rows in the order the team works them: the nearest bill first, clients with no plan last. */
  function allRows() {
    const c = C();
    return c.all.tenants.filter((/** @type {any} */ t) => t.status !== 'archived').map(rowOf)
      .sort((/** @type {any} */ x, /** @type {any} */ y) => String(x.bill || '9999').localeCompare(String(y.bill || '9999')) || String(x.t.name).localeCompare(String(y.t.name)));
  }

  /* ---- the cells ----------------------------------------------------------------------------------------- */

  /** @param {any} r */
  function clientCell(r) {
    const t = r.t;
    const late = r.b.status === 'past_due';
    return `<a class="row-link" href="#/client/${esc(t.id)}/overview">${esc(t.name)}</a>
      ${r.bill ? `<span class="sub">${r.notStarted ? 'First bill' : 'Next bill'}: ${esc(dayLong(r.bill))}</span>` : '<span class="sub">No bill date yet</span>'}
      ${t.status === 'paused' ? '<span class="chip warn bl-mini" title="Paused: work and billing are on hold.">Paused</span>' : ''}
      ${late ? `<span class="chip bad bl-mini">Past due</span>${r.b.grace ? `<span class="sub">Services pause after ${esc(dayShort(r.b.grace))}</span>` : ''}` : ''}`;
  }
  /** @param {any} r */
  function planCell(r) {
    if (!r.now && !r.next) return '<span class="none">No plan yet</span><span class="sub">Set one so limits and reminders work.</span>';
    const pl = r.now ? r.P.nowPlan : r.P.nextPlan;
    const c = r.now || r.next;
    const price = pl && pl.price_minor != null ? C().money(pl.price_minor, pl.currency) : '';
    return `<strong class="bl-plan">${esc(pl ? pl.name : cap1(c.plan_id))}</strong>${price ? `<span class="sub">${esc(price)} / mo</span>` : ''}${!r.now || r.notStarted ? `<span class="sub">Starts ${esc(dayShort(c.period_start))}</span>` : ''}`;
  }
  /** @param {any} cycle @param {any} plan */
  function chipsOf(cycle, plan) {
    const caps = PP().capsNow();
    return PM().ordered(cycle.picks || []).map((/** @type {string} */ s) => `<span class="bchip">${esc(PP().chipText(cycle.plan_id, s, cycle.website_option, caps))}</span>`).join('');
  }
  /** What each limit is called on a usage bar: short, and clear on its own. */
  const BAR = /** @type {Record<string, string>} */ (PM().LABEL); // the one shared map (plan-model.js)
  /** One usage line as the console's bar. @param {any} l */
  const barOf = (l) => C().usageBar({ ...l, label: BAR[l.metric] || cap1(PP().unitOf(l.metric, l.label, 2)) });
  /** A bar in one client's drawer: a live-at-once limit gets "Set live count" with it (mod-work.js). @param {string} id @param {any} l */
  const drawerBar = (id, l) => (EXT.work && EXT.work.liveBar ? EXT.work.liveBar(id, l, BAR[l.metric] || cap1(PP().unitOf(l.metric, l.label, 2))) : barOf(l));
  /** @param {any} r */
  function nowCell(r) {
    if (!r.now) return '<span class="none">Nothing running</span>';
    return `<div class="bl-chips">${chipsOf(r.now, r.P.nowPlan)}</div>
      ${(r.P.lines || []).length ? `<a class="bl-more" href="#/billing/${esc(r.t.id)}" aria-label="See limits for ${esc(r.t.name)}">See limits</a>` : '<span class="sub">No usage yet</span>'}`;
  }
  /** @param {any} r */
  function nextCell(r) {
    if (!r.next) return `<span class="sub">Not set up yet.</span>${r.bill ? `<span class="sub">Carries over on ${esc(dayShort(addDays(r.bill, -7)))} if nothing changes.</span>` : ''}`;
    const n = r.next, d = r.change;
    /** @type {string[]} */ const chips = [];
    if (d && d.planChanged) chips.push(`<span class="bchip is-plan">${esc(r.P.nowPlan ? r.P.nowPlan.name : '')} to ${esc(r.P.nextPlan ? r.P.nextPlan.name : '')}</span>`);
    {
      const caps = PP().capsNow();
      const before = r.now ? r.now.picks || [] : [];
      for (const s of PM().ordered(Array.from(new Set([...(n.picks || []), ...before])))) {
        const inNext = (n.picks || []).includes(s), inNow = before.includes(s);
        if (inNext) chips.push(`<span class="bchip${r.now && !inNow ? ' is-add' : ''}">${esc(PP().chipText(n.plan_id, s, n.website_option, caps))}</span>`);
        else chips.push(`<span class="bchip is-stop" title="Stops at the next bill">${esc(PP().shortLabel(s))}</span>`);
      }
    }
    const by = n.source === 'client_picker' ? `Confirmed by the client ${esc(dayShort(dayOfStamp(n.confirmed_at)))}`
      : n.source === 'console' ? `Set by the team ${esc(dayShort(dayOfStamp(n.confirmed_at)))}`
      : n.source === 'auto_carry' ? 'No reply yet, current picks carry over'
      : all ? `${esc(r.P.nextPlan.name)} includes everything` : '';
    return `<div class="bl-chips">${chips.join('')}</div>${by ? `<span class="sub">${by}</span>` : ''}`;
  }
  /** @param {any} r */
  function lockCell(r) {
    if (!r.now && !r.next) return '<span class="none">Not set</span>';
    if (!r.now) return `<span class="chip them">Starts ${esc(dayShort(r.next.period_start))}</span><span class="sub">Picks can change until it starts</span>`;
    if (r.notStarted) return `<span class="chip them">Starts ${esc(dayShort(r.now.period_start))}</span><span class="sub">Picks can change until it starts</span>`;
    if (!r.next) return `<span class="chip them">Locked (can't change)</span><span class="sub">Next cycle's picks can change until ${esc(dayLong(r.lastDay))}</span>`;
    if (r.next.source === 'auto_carry') {
      const left = daysBetween(r.today, r.lastDay);
      const text = left > 1 ? `${left} days left, until ${dayLong(r.lastDay)}` : left === 1 ? `1 day left, until ${dayLong(r.lastDay)}` : left === 0 ? `Last day is today, ${dayLong(r.lastDay)}` : `Closed on ${dayLong(r.lastDay)}`;
      return `<span class="chip warn">Not confirmed yet</span><span class="sub">${esc(text)}</span>`;
    }
    return `<span class="chip good">Confirmed</span><span class="sub">Can change until ${esc(dayLong(r.lastDay))}</span>`;
  }
  /** @param {any} r @param {string} kind */
  function remChip(r, kind) {
    const n = kind === 'd7' ? 7 : 3;
    const row = r.rem.find((/** @type {any} */ x) => x.kind === kind);
    if (!row && r.t.status !== 'active') return `<span class="chip plain" title="Bill reminders are skipped while a client is ${esc(r.t.status)}">${n}d skipped</span>`;
    if (!row) return r.bill ? `<span class="chip plain" title="Planned once next cycle's picks exist">${n}d due ${esc(dayShort(addDays(r.bill, -n)))}</span>` : '<span class="none">None</span>';
    if (row.status === 'sent') return `<span class="chip good" title="${esc(`Sent to ${row.to_email}`)}">${n}-day sent ${esc(dayShort(dayOfStamp(row.sent_at || row.send_at)))}</span>`;
    if (row.status === 'failed') return `<span class="chip bad" title="${esc(row.error || 'It did not go out.')}">${n}-day failed ${esc(dayShort(dayOfStamp(row.updated_at || row.send_at)))}</span>`;
    if (row.status === 'skipped') return `<span class="chip plain" title="${esc(row.error || 'Skipped')}">${n}d skipped</span>`;
    return `<span class="chip plain">${n}d due ${esc(dayShort(dayOfStamp(row.send_at)))}</span>`;
  }
  /** The open Needs you item for one of this row's failed reminders, or null; the fix link shows only when it exists (critic R11-3). @param {any} r */
  function needOf(r) {
    if (!r.now && !r.next) return null;
    const failedIds = new Set(r.rem.filter((/** @type {any} */ x) => x.status === 'failed').map((/** @type {any} */ x) => String(x.id)));
    const all = C().all;
    return failedIds.size ? ((all && all.reviews && all.reviews.exceptions) || []).find((/** @type {any} */ x) => x.reason_code === 'reminder_failed' && x.tenant_id === r.t.id && failedIds.has(String(x.entity_id))) || null : null;
  }
  /** @param {any} r */
  function remCell(r) {
    if (!r.now && !r.next) return '<span class="none">None</span>';
    return `<div class="bl-rems">${remChip(r, 'd7')}${remChip(r, 'd3')}</div>`;
  }
  /** @param {any} r */
  function invoiceCell(r) {
    const i = r.inv;
    if (!i) return state.invoices === null ? '<span class="sub">Loading</span>' : '<span class="none">No invoice yet</span>';
    const amount = i.amount_minor != null ? C().money(i.amount_minor, i.currency) : '';
    const st = INV_STATUS[i.status] || [cap1(String(i.status)), 'plain'];
    const url = linkOf(i);
    const ok = linkApproved(i);
    const head = `<span class="bl-inv-n">${esc(i.invoice_number)}</span>`;
    const link = ok ? '<span class="bl-link is-ok">Payment link approved</span>' : url ? '<span class="bl-link is-wait">Payment link waiting for your approval</span>' : '';
    return `${head}<span class="bl-inv-s">${amount ? `<span class="bl-inv-amt">${esc(amount)}</span>` : ''}<span class="chip ${st[1]}">${esc(st[0])}</span></span>${i.due_at ? `<span class="sub">due ${esc(dayShort(i.due_at))}</span>` : ''}${link}${reviewable(i) ? '<span class="sub">Waiting for your approval</span>' : ''}`;
  }
  /** @param {any} r */
  function stripeCell(r) {
    const id = stripeIdOf(r.t);
    return id ? `<span class="chip good" title="${esc(id)}">Linked</span>` : '<span class="chip off">Not linked</span>';
  }
  /* At most one primary (orange) action per row; the first match wins:
   *   1 "Approve invoice"  when r.inv && reviewable(r.inv)
   *   2 "Fix reminder"     when needOf(r), an open Needs you item for a failed reminder
   *   3 "Set plan"         when !r.now && !r.next
   *   otherwise none.
   * Quiet (no primary): Stripe not linked, past due, picks not confirmed, a failed reminder with no open Needs you item,
   * invoices still loading. Paused clients can still get 1-3. */
  /** @param {any} r */
  function actsCell(r) {
    const i = r.inv;
    const need = needOf(r);
    const canApprove = !!i && reviewable(i);
    const noPlan = !r.now && !r.next;
    const primary = canApprove ? 'approve' : need ? 'fix' : noPlan ? 'plan' : '';
    const name = esc(r.t.name);
    const word = noPlan ? 'Set plan' : 'Change plan';
    const plan = `<a class="btn${primary === 'plan' ? '' : ' btn-quiet'} btn-sm bl-open bl-open-m" href="#/billing/${esc(r.t.id)}" data-bl-open="${esc(r.t.id)}" aria-label="${word} for ${name}">${word}</a>`;
    const url = i ? linkOf(i) : '';
    const approve = canApprove
      ? `<button class="btn${primary === 'approve' ? '' : ' btn-quiet'} btn-sm bl-approve" type="button" data-bl-approve="${esc(i.id)}" title="${url ? 'Approve the invoice and its Stripe link' : 'Approve the invoice'}" aria-label="Approve invoice ${esc(i.invoice_number)}${url ? ' and its Stripe link' : ''} for ${name}">${url ? 'Approve and send link' : 'Approve invoice'}</button>` : '';
    const fix = !need ? '' : primary === 'fix'
      ? `<a class="btn btn-sm" href="#/queue/${esc(need.id)}" aria-label="Fix reminder in Needs you: ${name}'s failed reminder">Fix reminder</a>`
      : `<a class="bl-more" href="#/queue/${esc(need.id)}" aria-label="Fix it in Needs you: ${name}'s failed reminder">Fix it in Needs you</a>`;
    const sid = stripeIdOf(r.t);
    const stripe = `<a class="bl-more" href="#/client/${esc(r.t.id)}/setup/billing" aria-label="${sid ? 'Stripe settings' : 'Connect Stripe'}: ${name}">${sid ? 'Stripe settings' : 'Connect Stripe…'}</a>`;
    // the primary first, then the quiet rest: plan link, Approve invoice, Fix it in Needs you, Manage / Link in Setup
    const first = primary === 'approve' ? approve : primary === 'fix' ? fix : primary === 'plan' ? plan : '';
    return `<div class="bl-acts">${first}${[plan, approve, fix, stripe].filter((x) => x && x !== first).join('')}</div>`;
  }

  /* ---- the page ------------------------------------------------------------------------------------------ */

  /**
   * The premium tier's card (Domin8te): open to new clients or locked (an owner switches it in Settings), and how many clients are on
   * it. Only when a plan has a number of client places (plans.max_clients) do the older words about places stay: how many are used, who
   * has it next, when it frees.
   * @param {any[]} plans
   */
  function tierCard(plans) {
    const c = C();
    const feat = plans.find((/** @type {any} */ p) => p.max_clients != null) || plans.find((/** @type {any} */ p) => p.locked) || plans.find((/** @type {any} */ p) => p.id === 'domin8te') || plans[plans.length - 1];
    if (!feat) return '';
    const today = c.today();
    const slot = PP().slotOf(feat.id, null, today, addDays(today, 1));
    const n = slot.used;
    const names = slot.holders.slice(0, 3).join(', ') + (n > 3 ? ` and ${n - 3} more` : '');
    const count = `${n} ${n === 1 ? 'client' : 'clients'} on it${names ? `: ${names}` : ''}.`;
    let placeNote = '';
    if (slot.limited) {
      const name = (/** @type {string} */ id) => ((c.tenant(id) || {}).name) || 'A client';
      const live = (/** @type {any} */ x) => x.plan_id === feat.id && x.state !== 'ended' && ((c.tenant(x.tenant_id) || {}).status) !== 'archived';
      const cycles = c.plans.cycles || [];
      if (!slot.taken) {
        const later = cycles.filter((/** @type {any} */ x) => live(x) && x.period_start > today).sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.period_start).localeCompare(String(b.period_start)))[0];
        if (later) placeNote = `Reserved from ${dayShort(later.period_start)} for ${name(later.tenant_id)}. New ${feat.name} sign-ups are blocked from then.`;
      } else {
        const holder = slot.holderIds[0];
        const run = cycles.find((/** @type {any} */ x) => x.tenant_id === holder && live(x) && x.period_start <= today && x.period_end > today);
        const after = run ? cycles.find((/** @type {any} */ x) => x.tenant_id === holder && x.period_start === run.period_end) : null;
        if (run && after && after.plan_id !== feat.id) placeNote = `It frees on ${dayShort(run.period_end)}, when ${name(holder)} changes plan.`;
      }
    }
    const locked = !!feat.locked;
    const full = slot.limited && slot.taken;
    const dot = locked ? 'is-lock' : full ? 'is-used' : 'is-free';
    const title = locked ? `${feat.name} is locked` : slot.limited ? `${feat.name} ${slot.max === 1 ? 'spot' : 'spots'}: ${full ? `${slot.used} of ${slot.max} taken` : 'free'}` : `${feat.name}: open to new clients`;
    const sub = locked ? `${esc(count)} New clients and plan changes to ${esc(feat.name)} are refused until an owner unlocks it. <a href="#/settings">Open Settings</a>`
      : slot.limited ? (full ? `${esc(count)} ${placeNote ? esc(placeNote) : `New ${esc(feat.name)} sign-ups are blocked until this spot frees up.`}` : `${esc(count)} ${placeNote ? esc(placeNote) : `A client can take it now. Only ${slot.max} ${slot.max === 1 ? 'client' : 'clients'} at a time.`}`)
      : esc(count);
    return `<div class="bl-card"><strong><span class="bl-dot ${dot}" aria-hidden="true"></span>${esc(title)}</strong><span>${sub}</span></div>`;
  }

  /** @param {any[]} rows */
  function summary(rows) {
    const c = C();
    const plans = (c.plans.plans || []).slice().sort((/** @type {any} */ a, /** @type {any} */ b) => Number(a.sort) - Number(b.sort));
    const live = rows.filter((r) => r.t.status === 'active' && r.now);
    const priced = live.length > 0 && live.every((r) => r.P.nowPlan && r.P.nowPlan.price_minor != null);
    const total = priced ? live.reduce((n, r) => n + Number(r.P.nowPlan.price_minor), 0) : null;
    const currency = (live[0] && live[0].P.nowPlan && live[0].P.nowPlan.currency) || 'USD';
    const mix = plans.map((/** @type {any} */ p) => ({ p, n: live.filter((r) => r.now && r.now.plan_id === p.id).length })).filter((x) => x.n).map((x) => `${x.p.name} ${x.n}`).join(', ');
    const plansText = `${live.length} ${live.length === 1 ? 'client' : 'clients'} on a plan`;
    const changes = rows.filter((r) => r.change && r.change.differs);
    const first = changes.slice(0, 2).map((r) => `${r.t.name}: ${r.change.text}${r.next ? ` from ${dayShort(r.next.period_start)}` : ''}`);
    return `<div class="bl-summary">
      <div class="bl-card"><strong>${total !== null ? `${esc(c.money(total, currency))} / mo` : esc(plansText)}</strong><span>${total !== null ? `${esc(plansText)}${mix ? ` · ${esc(mix)}` : ''}` : esc(mix || 'No plans running yet')}</span></div>
      ${tierCard(plans)}
      <div class="bl-card"><strong>${changes.length ? `${changes.length} ${changes.length === 1 ? 'change' : 'changes'} next cycle` : 'No changes next cycle'}</strong><span>${changes.length ? `${esc(first.join('. '))}${changes.length > 2 ? ` and ${changes.length - 2} more` : ''}` : 'Every client keeps what they have.'}</span></div>
    </div>`;
  }

  function paintTop() {
    const c = C();
    const box = c.$('#bl-top');
    if (!box) return;
    const rows = allRows();
    const filters = [['all', 'All', rows.length], ['soon', 'Bills in 7 days', rows.filter((r) => matches(r, 'soon')).length], ['unconfirmed', 'Picks not confirmed', rows.filter((r) => matches(r, 'unconfirmed')).length], ['failed', 'Reminder failed', rows.filter((r) => matches(r, 'failed')).length], ['late', 'Past due', rows.filter((r) => matches(r, 'late')).length]];
    box.innerHTML = `<div class="toolbar"><div class="seg" role="group" aria-label="Show">${filters.map(([k, l, n]) => `<button type="button" data-bl-filter="${k}" aria-pressed="${state.filter === k}">${l}<span class="count${n && k !== 'all' ? '' : ' quiet'}">${n}</span></button>`).join('')}</div></div>${summary(rows)}`;
  }
  function paintList() {
    const c = C();
    const box = c.$('#bl-list');
    if (!box) return;
    const rows = allRows();
    const shown = rows.filter((r) => matches(r, state.filter));
    if (!c.plans.ok) {
      box.innerHTML = '<div class="empty"><p><strong>Plans have not loaded.</strong></p><p>Reload the page. If this stays empty, the plan tables are missing from this database.</p></div>';
      return;
    }
    if (!shown.length) {
      box.innerHTML = `<div class="empty"><p><strong>${state.filter === 'all' ? 'No clients yet.' : 'Nothing here.'}</strong></p><p>${state.filter === 'all' ? 'Add a client and choose their plan.' : 'No client matches this filter right now.'}</p>${state.filter === 'all' && c.me && c.me.role === 'super_admin' ? '<a class="btn" href="#/new">Add a client</a>' : ''}</div>`;
      return;
    }
    box.innerHTML = `<div class="table-wrap bl-wrap"><table class="grid bl-grid"><caption class="sr-only">Every client's plan, picks, reminders and latest invoice</caption><thead><tr>
      <th scope="col">Client</th><th scope="col">Plan</th><th scope="col">This cycle</th><th scope="col">Next cycle</th><th scope="col">Next month's services</th><th scope="col">Bill reminders (7 and 3 days before)</th><th scope="col">Latest invoice</th><th scope="col">Stripe</th><th scope="col" class="bl-c-act">Actions</th></tr></thead><tbody>
      ${shown.map((r) => `<tr data-id="${esc(r.t.id)}"${r.t.status !== 'active' ? ' class="paused"' : ''}>
        <th scope="row" class="bl-c-client" data-label="Client">${clientCell(r)}</th>
        <td class="bl-c-plan" data-label="Plan">${planCell(r)}</td>
        <td class="bl-c-now" data-label="This cycle">${nowCell(r)}</td>
        <td class="bl-c-next" data-label="Next cycle">${nextCell(r)}</td>
        <td class="bl-c-lock" data-label="Next month's services">${lockCell(r)}</td>
        <td class="bl-c-rem" data-label="Bill reminders (7 and 3 days before)">${remCell(r)}</td>
        <td class="bl-c-inv" data-label="Latest invoice">${invoiceCell(r)}</td>
        <td class="bl-c-stripe" data-label="Stripe">${stripeCell(r)}</td>
        <td class="bl-c-act">${actsCell(r)}</td></tr>`).join('')}
      </tbody></table></div>${state.invoicesError ? `<p class="meta bl-foot">${esc(state.invoicesError)} The rest of the page is up to date.</p>` : ''}`;
    returnFocus();
  }
  /** After the plan drawer closes, put focus back on the visible row control that opened it (See limits or the plan link), once. */
  function returnFocus() {
    const box = C().$('#bl-list');
    const active = document.activeElement;
    let id = state.returnTo;
    if (!id && state.returnEl) {
      // a later repaint replaced the row we focused: follow it only if focus fell to the body with it
      if (!state.returnEl.isConnected && (!active || active === document.body)) {
        const tr = state.returnEl.closest('tr[data-id]');
        id = state.returnEl.getAttribute('data-bl-open') || (tr && tr.getAttribute('data-id'));
      } else if (active !== state.returnEl) state.returnEl = null;
    }
    if (!id || !box) return;
    const visible = (/** @type {string} */ sel) => {
      const all = /** @type {HTMLElement[]} */ (Array.from(box.querySelectorAll(sel)));
      return all.find((b) => b.offsetParent !== null || b.getClientRects().length > 0) || all[0] || null;
    };
    // See limits if that opened the drawer and the row still has it, else the plan link
    const el = (state.returnKind === 'limits' ? visible(`tr[data-id="${CSS.escape(id)}"] .bl-c-now a.bl-more`) : null) || visible(`[data-bl-open="${CSS.escape(id)}"]`);
    state.returnTo = null;
    state.returnEl = el;
    if (el) el.focus();
  }
  function paintFresh() {
    const c = C();
    const box = c.$('#bl-fresh');
    if (!box) return;
    const ready = typeof c.stripeReady === 'function' && c.stripeReady();
    const mode = typeof c.stripeModeText === 'function' ? c.stripeModeText() : '';
    box.innerHTML = c.pageFresh({
      updatedAt: c.plans.at, source: ready ? `Stripe${mode === 'test mode' ? ' (test mode)' : ''} and console` : 'Console and the database',
      status: c.plans.ok ? 'ok' : 'delayed', label: c.plans.ok ? undefined : 'Plans did not load'
    });
  }

  /** @param {string} clientId a client to open the plan drawer for, or '' */
  function page(clientId) {
    if (!state.returnTo) state.returnEl = null;
    const c = C();
    const main = c.main;
    document.title = 'Billing · Domin8te console';
    const seq = ++state.seq;
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Billing</h1><p>Each client's plan, what they have now, what changes next cycle and whether the 7 and 3 day reminders went out. Picks lock for the billing month; changes apply from the next bill.</p></div></div>
      <div id="bl-fresh"></div><div id="bl-top"></div><div id="bl-list"></div>`;
    paintFresh();
    paintTop();
    paintList();
    const alive = () => seq === state.seq && /^#\/billing/.test(location.hash || '');
    loadInvoices().then(() => { if (alive()) { paintList(); paintTop(); } state.returnEl = null; });
    if (typeof c.stripeStatus === 'function') c.stripeStatus().then(() => { if (alive()) paintFresh(); });
    main.onclick = (e) => {
      state.returnEl = null;
      const target = /** @type {HTMLElement} */ (e.target);
      const f = target.closest('[data-bl-filter]');
      if (f) { state.filter = f.getAttribute('data-bl-filter') || 'all'; paintTop(); paintList(); return; }
      const open = target.closest('[data-bl-open]');
      if (open) { state.keepScroll = window.scrollY; state.openLimits = null; state.returnKind = 'plan'; return; }
      const lim = target.closest('.bl-c-now a.bl-more');
      if (lim) { const tr = lim.closest('tr[data-id]'); state.keepScroll = window.scrollY; state.openLimits = tr && tr.getAttribute('data-id'); state.returnKind = 'limits'; return; }
      const ap = target.closest('[data-bl-approve]');
      if (ap) approve(/** @type {HTMLButtonElement} */ (ap));
    };
    if (state.keepScroll !== null) {
      const y = state.keepScroll;
      if (!clientId) state.keepScroll = null;
      setTimeout(() => window.scrollTo(0, y), 0);
    }
    if (clientId) openDrawer(clientId, seq);
  }

  /* ---- approving an invoice and its link ----------------------------------------------------------------- */

  /** @param {HTMLButtonElement} btn */
  async function approve(btn) {
    const c = C();
    const id = btn.getAttribute('data-bl-approve') || '';
    const inv = (state.invoices || []).find((i) => i.id === id);
    if (!inv) return;
    const t = c.tenant(inv.tenant_id);
    const url = linkOf(inv);
    const yes = await c.ask(url ? 'Approve this invoice and its link?' : 'Approve this invoice?',
      `${t ? t.name : 'The client'} will see invoice ${inv.invoice_number}${url ? ' and its Stripe link' : ''} on their Billing page. Check the amount and the link first. You can hide it again later.`, 'Approve');
    if (!yes) return;
    const done = c.busy(btn, 'Approving');
    try {
      const client = await c.db();
      const res = await client.rpc('review_billing_invoice_v2', { p_invoice_id: id, p_decision: 'approve', p_note: null, p_approve_link: !!url, p_expected: inv.updated_at });
      if (res.error) throw res.error;
      await loadInvoices(true);
      try { await c.loadAll(); } catch (x) { /* the invoice list below is already fresh */ }
      if (/^#\/billing/.test(location.hash || '')) { paintTop(); paintList(); }
      c.toast(`Invoice ${inv.invoice_number} approved${url ? ' with its Stripe link' : ''}. ${t ? t.name : 'The client'} can see it now.`);
    } catch (x) {
      if (btn.isConnected) done();
      const m = PP().say(x, 'Invoice not approved');
      c.toast(/^Invoice not approved/.test(m) ? m : `The invoice was not approved. ${m}`, true);
    }
  }

  /* ---- the plan drawer --------------------------------------------------------------------------------- */

  /** Words for a line of the history. @param {any} r @param {Record<string, string>} staff */
  function historyLine(r, staff) {
    const d = r.detail || {};
    const plan = (/** @type {string} */ id) => ((C().plans.plans || []).find((/** @type {any} */ p) => p.id === id) || {}).name || cap1(String(id || ''));
    const picks = (/** @type {string[]} */ list, /** @type {string} */ planId) => (PP().andList(PM().ordered(list || []).map((/** @type {string} */ s) => PP().label(s))) || 'no services');
    const sys = !r.actor || !/^user_/.test(String(r.actor));
    const bySource = /^plan_cycle_/.test(String(r.action)) ? (d.source === 'client_picker' ? 'The client' : d.source === 'auto_carry' ? 'System' : '') : '';
    const who = bySource || staff[r.actor] || (sys ? 'System' : 'A team member');
    const reason = d.reason ? ` Reason: ${d.reason}` : '';
    let what = String(r.action || '').replace(/[._]/g, ' ');
    if (r.action === 'plan_cycle_insert') {
      what = d.source === 'auto_carry' ? `carried ${plan(d.plan)} with ${picks(d.picks, d.plan)} into the cycle starting ${dayShort(d.period_start)}.`
        : d.source === 'client_picker' ? `picked ${plan(d.plan)} with ${picks(d.picks, d.plan)} for the cycle starting ${dayShort(d.period_start)}.`
        : `set ${plan(d.plan)} with ${picks(d.picks, d.plan)} for the cycle starting ${dayShort(d.period_start)}.${reason}`;
    } else if (r.action === 'plan_cycle_update') {
      const bits = [];
      if (d.old_plan && d.old_plan !== d.plan) bits.push(`plan from ${plan(d.old_plan)} to ${plan(d.plan)}`);
      if (d.old_picks && JSON.stringify(d.old_picks) !== JSON.stringify(d.picks)) bits.push(`picks from ${picks(d.old_picks, d.old_plan)} to ${picks(d.picks, d.plan)}`);
      what = `${bits.length ? `changed ${bits.join(' and ')}` : 'updated'} for the cycle starting ${dayShort(d.period_start)}.${reason}`;
    } else if (r.action === 'invoice_link_approved') what = `approved the Stripe link for invoice ${d.number || ''}.`.replace('  ', ' ');
    else if (r.action === 'dashboard.invoice.approved') what = `approved invoice ${d.number || ''} for their Billing page.`.replace('  ', ' ');
    else if (r.action === 'dashboard.invoice.rejected' || r.action === 'dashboard.invoice.rejectd') what = `turned down invoice ${d.number || ''}.`.replace('  ', ' ');
    else if (r.action === 'dashboard.invoice.hidden') what = `hid invoice ${d.number || ''} from their Billing page.`.replace('  ', ' ');
    else if (r.action === 'home_section_insert' || r.action === 'home_section_update') {
      const title = (d.new && d.new.content && d.new.content.title) || String(d.section || 'a section').replace(/_/g, ' ');
      const shown = d.new && d.new.visible;
      what = r.action === 'home_section_insert' ? `added the Home section "${title}" (${shown ? 'shown to the client' : 'hidden'}).` : `changed the Home section "${title}"${d.old && d.old.visible !== shown ? ` and ${shown ? 'showed' : 'hid'} it` : ''}.${reason}`;
    }
    else what = `${what}.`;
    return `<li><span class="bd-h-time">${esc(stamp(r.at))}</span><span class="bd-h-what"><strong>${esc(who)}</strong> ${esc(what)}</span></li>`;
  }
  /** @param {any} t @param {HTMLElement} el */
  async function loadHistory(t, el) {
    try {
      const client = await C().db();
      const [a, s] = await Promise.all([
        client.from('client_visibility_history').select('actor, action, detail, at').eq('tenant_id', t.id).order('at', { ascending: false }).limit(40),
        client.from('staff').select('clerk_user_id, name')
      ]);
      if (a.error) throw a.error;
      const staff = Object.fromEntries(((s && s.data) || []).map((/** @type {any} */ x) => [x.clerk_user_id, x.name]));
      const rows = (a.data || []).slice().sort((/** @type {any} */ x, /** @type {any} */ y) => String(y.at).localeCompare(String(x.at)));
      if (!el.isConnected) return;
      el.innerHTML = !rows.length ? '<p class="meta">Nothing recorded yet.</p>'
        : `<ol class="bd-hist-list">${rows.slice(0, 6).map((r) => historyLine(r, staff)).join('')}</ol>${rows.length > 6 ? `<details class="reveal q-more"><summary>Show older (${rows.length - 6})</summary><ol class="bd-hist-list">${rows.slice(6).map((r) => historyLine(r, staff)).join('')}</ol></details>` : ''}`;
    } catch (e) {
      if (el.isConnected) el.innerHTML = '<p class="meta">The history could not be read just now. Nothing was changed.</p>';
    } finally {
      if (el.isConnected) el.removeAttribute('aria-busy');
    }
  }

  /** @param {string} id @param {number} seq */
  function openDrawer(id, seq) {
    const c = C();
    const t = c.tenant(id);
    // opened from the row's See limits: the limits start open and take the first focus; any other way in opens them collapsed
    const fromLimits = state.openLimits === id;
    state.openLimits = null;
    const kind = fromLimits ? 'limits' : 'plan';
    if (!t) { c.toast('That client was not found.', true); location.hash = '#/billing'; return; }
    const r = rowOf(t);
    const mode = r.now ? 'running' : r.next ? 'future' : 'none';
    const today = c.today();
    const addMonth = (/** @type {string} */ s) => T().addMonths(s, 1);
    /** The two cycles a change can target, with what each holds today. */
    const targets = {
      next: r.now ? { start: r.next ? r.next.period_start : r.now.period_end, end: r.next ? r.next.period_end : addMonth(r.now.period_end), base: r.vNext || r.vNow }
        : r.next ? { start: r.next.period_start, end: r.next.period_end, base: r.vNext }
        : { start: today, end: addMonth(today), base: null },
      now: r.now ? { start: r.now.period_start, end: r.now.period_end, base: r.vNow } : null
    };
    /** @type {{start: string, end: string, base: any}} */ let target = targets.next;
    const plan = r.now ? r.P.nowPlan : r.P.nextPlan;

    const dlg = document.createElement('dialog');
    dlg.className = 'bill-drawer';
    dlg.id = 'bl-drawer';
    dlg.setAttribute('aria-labelledby', 'bd-h');
    const nowBits = r.now && plan ? `${esc(plan.name)}${plan.price_minor != null ? ` · ${esc(c.money(plan.price_minor, plan.currency))} / mo` : ''} · ${esc(PP().andList(PM().ordered(r.now.picks || []).map((/** @type {string} */ s) => PP().label(s))))}` : '';
    const usage = r.P.lines || [];
    const confirmedNote = r.next && r.next.source === 'client_picker' ? `The client already confirmed these picks on ${esc(dayShort(dayOfStamp(r.next.confirmed_at)))}. Saving replaces them.` : '';
    dlg.innerHTML = `<form class="bd-form" id="bd-form" novalidate>
      <header class="bd-head"><div><p class="bd-eyebrow">${esc(t.name)}</p><h2 id="bd-h">${mode === 'none' ? 'Set the plan' : 'Change plan or picks'}</h2></div><button class="icon-btn" type="button" data-bd="close" aria-label="Close">${c.icon('x')}</button></header>
      <div class="bd-body">
        <p class="bd-lede">The console is the source of truth. The client's dashboard updates after you save, and the client is emailed only if you tick it.</p>
        ${r.now ? `<section class="bd-now" aria-label="Right now"><p class="bd-now-h"><strong>Right now</strong> <span>${nowBits}</span></p><p class="meta">${r.notStarted ? 'The first bill' : 'The next bill'} is ${esc(dayLong(r.bill))}${r.billIn !== null ? `, in ${r.billIn} ${r.billIn === 1 ? 'day' : 'days'}` : ''}.</p>
          ${usage.length ? `<details class="reveal bd-limits"${fromLimits ? ' open' : ''}><summary>This month's limits and use (${usage.length})</summary><div class="bd-usage">${usage.map((/** @type {any} */ l) => drawerBar(t.id, l)).join('')}</div></details>` : ''}</section>` : ''}
        <fieldset class="bd-sec"><legend>Plan</legend><div id="bd-plans"></div></fieldset>
        <fieldset class="bd-sec"><legend>Picks for the cycle starting <span id="bd-start">${esc(dayLong(target.start))}</span></legend><div id="bd-picks"></div><p class="bd-change" id="bd-change" aria-live="polite"></p></fieldset>
        ${mode === 'running' ? `<fieldset class="bd-sec bd-applies"><legend>Applies</legend>
          <label class="bd-opt"><input type="radio" name="applies" value="next" checked><span class="bd-opt-t">Next cycle</span><span class="bd-opt-d">From ${esc(dayLong(targets.next.start))}. This is the usual way.</span></label>
          <label class="bd-opt"><input type="radio" name="applies" value="now"><span class="bd-opt-t">This cycle</span><span class="bd-opt-d">${r.notStarted ? `Changes the first month, which starts ${esc(dayShort(r.now.period_start))}.` : `Changes the month that is running now, since ${esc(dayShort(r.now.period_start))}.`} You will be asked to confirm.</span></label>
          ${confirmedNote ? `<p class="bd-info" id="bd-confirmed">${confirmedNote}</p>` : ''}</fieldset>`
          : mode === 'future' ? `<p class="bd-info">This client's first cycle starts ${esc(dayLong(r.next.period_start))}. The change applies from then.</p>`
          : `<div class="field bd-sec"><label for="bd-first">First cycle starts</label><input id="bd-first" name="first" type="date" value="${esc(today)}"><p class="hint">The plan and picks count from this day. The next bill is a month later.</p></div>`}
        <div class="field bd-reason"><label for="bd-reason">Reason (required, kept in the history)</label><textarea id="bd-reason" name="reason" rows="3" maxlength="500" placeholder="For example: Owner asked by phone to swap Social for Email from next month."></textarea><p class="hint"><span id="bd-count">0</span> of 500 characters</p></div>
        <label class="bd-switch"><input type="checkbox" name="email" role="switch"><span class="bd-sw" aria-hidden="true"></span><span class="bd-sw-t">Email the client a copy of their picks</span></label>
        <p class="field-error" id="bd-err" role="alert" hidden></p>
        <section class="bd-sec bd-hist" aria-labelledby="bd-hist-h"><h3 id="bd-hist-h">History</h3><div id="bd-hist" aria-busy="true"><p class="meta">Reading the history.</p></div></section>
      </div>
      <footer class="bd-foot"><button class="btn" type="submit" id="bd-save" disabled>Save plan change</button><button class="btn btn-quiet" type="button" data-bd="close">Cancel</button><span class="bd-foot-note" id="bd-note" aria-live="polite"></span></footer>
    </form>`;
    c.main.appendChild(dlg);

    const form = /** @type {HTMLFormElement} */ (dlg.querySelector('#bd-form'));
    const $ = (/** @type {string} */ sel) => /** @type {any} */ (dlg.querySelector(sel));
    const base0 = targets.next.base;
    const pp = PP().create({
      tenantId: t.id, start: target.start, end: target.end,
      value: base0 ? { planId: base0.planId, picks: base0.picks, websiteOption: base0.websiteOption } : { planId: '', picks: [], websiteOption: null },
      currentPlanId: r.now ? r.now.plan_id : r.next ? r.next.plan_id : '',
      onChange: () => refresh()
    });
    pp.mountPlans($('#bd-plans'), { compact: true });
    pp.mountPicks($('#bd-picks'));

    function refresh() {
      const chk = pp.check();
      const v = pp.value();
      const save = $('#bd-save');
      const change = $('#bd-change');
      const note = $('#bd-note');
      let changed = true;
      if (target.base) {
        const d = PP().diffWords(target.base, v);
        changed = d.differs;
        change.textContent = chk.ok ? (d.differs ? `Changes from ${dayShort(target.start)}: ${d.text}.` : 'No change from what this cycle holds now.') : '';
        change.className = `bd-change${chk.ok && d.differs ? ' is-on' : ''}`;
      } else { change.textContent = ''; }
      save.disabled = !(chk.ok && changed);
      note.textContent = !chk.ok ? '' : !changed ? 'Nothing is different yet.' : '';
      $('#bd-start').textContent = dayLong(target.start);
    }
    refresh();

    // The first cycle of a client with no plan: the start day is theirs to choose.
    const first = $('#bd-first');
    if (first) first.addEventListener('input', () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(first.value)) return;
      target = { start: first.value, end: addMonth(first.value), base: null };
      pp.setRange(target.start, target.end);
    });
    // Next cycle or this cycle: the same edits, a different month to land in.
    for (const radio of /** @type {HTMLInputElement[]} */ (Array.from(form.querySelectorAll('input[name="applies"]')))) {
      radio.addEventListener('change', () => {
        const which = /** @type {'next'|'now'} */ (radio.value);
        target = /** @type {any} */ (targets[which] || targets.next);
        pp.setRange(target.start, target.end);
        const conf = $('#bd-confirmed');
        if (conf) conf.hidden = which !== 'next';
      });
    }
    const reason = /** @type {HTMLTextAreaElement} */ ($('#bd-reason'));
    reason.addEventListener('input', () => { $('#bd-count').textContent = String(reason.value.length); });

    c.track(form, `Plan change for ${t.name}`);
    const close = async (/** @type {boolean} */ force) => {
      if (!force && c.dirty.has(form) && !(await c.ask('Close without saving?', 'The changes you made to this plan are not saved yet.', 'Close'))) return;
      c.clean(form);
      if (dlg.open) dlg.close();
      dlg.remove();
      state.returnTo = t.id;
      state.returnKind = kind;
      state.returnEl = null;
      if (/^#\/billing\/./.test(location.hash || '')) location.hash = '#/billing'; else returnFocus();
    };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
    dlg.addEventListener('click', (e) => { const x = /** @type {HTMLElement} */ (e.target); if (x === dlg || x.closest('[data-bd="close"]')) close(false); });
    // "Set live count" on a live-at-once limit: its own small dialog on top; the bar updates in place (mod-work.js)
    dlg.addEventListener('click', (e) => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-wk-live]'); if (b && EXT.work && EXT.work.setLive) EXT.work.setLive(/** @type {HTMLElement} */ (b)); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#bd-err');
      err.hidden = true;
      const fail = (/** @type {string} */ text, /** @type {HTMLElement|null} */ focus) => { err.textContent = text; err.hidden = false; if (focus) focus.focus(); };
      const chk = pp.check();
      if (!chk.ok) { fail(chk.error, null); return; }
      const why = reason.value.trim();
      if (!why) { fail('Add a reason. It is kept in the history.', reason); return; }
      const v = pp.value();
      const appliesNow = mode === 'running' && /** @type {any} */ (form.elements.namedItem('applies')).value === 'now';
      if (appliesNow) {
        const d = target.base ? PP().diffWords(target.base, v) : { text: '' };
        if (!(await c.ask(r.notStarted ? 'Change the first month?' : 'Change this month now?', `${r.notStarted ? `${t.name}'s first month starts ${dayShort(r.now.period_start)}.` : `${t.name}'s month is already running.`} This changes what they have${r.notStarted ? '' : ' right now'}${d.text ? ` (${d.text})` : ''} and the client sees it straight away. The reason you wrote is kept in the history.`, 'Change now'))) return;
      }
      const btn = /** @type {HTMLButtonElement} */ ($('#bd-save'));
      const done = c.busy(btn, 'Saving');
      try {
        const client = await c.db();
        const res = await client.rpc('override_plan_cycle', { p_tenant: t.id, p_period_start: target.start, p_plan: v.planId, p_picks: v.picks, p_website_option: v.websiteOption, p_reason: why });
        if (res.error) throw res.error;
        const saved = res.data;
        let mailNote = '';
        if (/** @type {HTMLInputElement} */ (form.elements.namedItem('email')).checked && saved && saved.id) {
          const m = await client.rpc('email_cycle_copy', { p_cycle: saved.id });
          mailNote = m.error ? ` The email copy was not queued: ${PP().say(m.error)}` : ' An email copy is on its way to the client.';
        }
        c.clean(form);
        try { await c.loadAll(); } catch (x) { c.toast(`Saved, but the page could not reload: ${c.message(x)}`, true); }
        if (dlg.open) dlg.close();
        dlg.remove();
        state.returnTo = t.id;
        state.returnKind = kind;
        state.returnEl = null;
        c.toast(`Saved for ${t.name}. ${appliesNow ? 'It changed this cycle.' : `It applies from ${dayShort(target.start)}.`}${mailNote}`, !!mailNote && /not queued/.test(mailNote));
        if (/^#\/billing\/./.test(location.hash || '')) location.hash = '#/billing'; else c.route();
      } catch (x) {
        if (btn.isConnected) done();
        const m = PP().say(x, 'Not saved').replace(/\b(public\.)?override_plan_cycle\b/g, 'the plan save');
        fail(/nothing was changed/i.test(m) ? m : `${m} Nothing was changed.`, null);
      }
    });

    if (seq === state.seq) {
      dlg.showModal();
      const firstFocus = (fromLimits && dlg.querySelector('.bd-limits > summary')) || dlg.querySelector('.pp-plan input:checked') || dlg.querySelector('.pp-plan input:not(:disabled)') || reason;
      if (firstFocus) /** @type {HTMLElement} */ (firstFocus).focus();
    }
    loadHistory(t, $('#bd-hist'));
  }

  EXT.billing = { page, openDrawer, say: (/** @type {any} */ e) => PP().say(e) };
})();
