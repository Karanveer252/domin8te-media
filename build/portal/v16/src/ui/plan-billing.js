// @ts-check
/*
 * The plan on Billing (2026-10-13): the plan card with what each service allows, "You're all set" once next month is
 * chosen, the card and the Stripe line, and the bills table. Shared helpers come from plan.js. No price is written here.
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
  const { price, perMonth, sample, ico, ABOUT, INCLUDED, AD_SPEND, blurb, chips, stamp, timeline } = D8.plan;

  /* ---- Billing ---------------------------------------------------------------------------------------------------- */

  /** The services of one month with what each allows. @param {any} c a month of the plan */
  function serviceList(c) {
    return `<ul class="svc-list">${c.services.map((/** @type {any} */ s) => `<li>${ico(s.id)}<div><p class="sl-name">${esc(s.label)}</p><p class="sl-about">${esc(/** @type {any} */ (ABOUT)[s.id] || '')}</p>${s.lines.length ? `<details class="chart-table sl-fold"><summary>What's included</summary><ul class="sl-lines">${s.lines.map((/** @type {any} */ l) => `<li>${esc(l.capText)}${l.weeklyHint ? ` <span class="sl-hint">(${esc(l.weeklyHint)})</span>` : ''} ${sample()}</li>`).join('')}</ul></details>` : ''}${s.id === 'advertising' ? `<p class="sl-fine">${esc(AD_SPEND)}</p>` : ''}</div></li>`).join('')}</ul>`;
  }
  /** What comes with the plan besides the services: a summary, a call. @param {any} c a month of the plan */
  function included(c) {
    const ls = /** @type {any} */ (INCLUDED)[c.planId] || [];
    return ls.length ? `<h3 class="po-h po-h-more">Also included</h3><ul class="po-included">${ls.map((/** @type {string} */ x) => `<li>${icon('check')}<span>${esc(x)}</span></li>`).join('')}</ul>` : '';
  }
  /** This month, next bill, last day to change. @param {any} m */
  function facts(m) {
    const c = m.now;
    const p = price(m.next || c);
    return `<dl class="facts-lite">
      <div><dt>Next bill</dt><dd>${p ? `${esc(p)} on ` : ''}${esc(day(m.bill))}</dd></div>
      ${m.open ? `<div><dt>Change services by</dt><dd>end of ${esc(day(m.lastDay))}</dd></div>` : ''}
      <div><dt>This month</dt><dd>${esc(day(c.start))} to ${esc(day(m.lastDay))}</dd></div>
    </dl>`;
  }
  /** The days left to change, as a small figure. @param {any} m */
  function daysLeft(m) {
    if (!m.open) return '';
    const n = m.daysLeft;
    return `<p class="days-left"><strong>${n === 0 ? 'Today' : n}</strong><span>${n === 0 ? 'is the last day to change next month' : `${F.plural(n, 'day left', 'days left')} to change next month`}</span></p>`;
  }

  /**
   * The plan card on Billing. With nothing chosen for next month it shows the services and the way to change them;
   * with a change confirmed it shrinks to this month and the confirmation takes over (confirmed()). Given the billing
   * record, a payment that did not go through turns the badge into "Active until" the paid-through day, never a green one.
   * @param {any} m the plan model @param {{compact?: boolean, billing?: any}} [o]
   */
  function overview(m, o = {}) {
    const c = m.now;
    const changing = m.confirmed && m.changes.differs;
    const eyebrow = changing || o.compact ? 'Your plan this month' : 'Your plan';
    const sub = o.billing && o.billing.subscription;
    const pastDue = !!sub && sub.status === 'past_due';
    const status = changing ? ''
      : pastDue ? (sub.graceUntil ? `<span class="badge tone-warning">${icon('clock')}Running normally. Card needs updating by ${esc(day(sub.graceUntil))}</span>` : '')
        : `<span class="badge tone-success">${icon('check')}No plan changes coming</span>`;
    const head = `<header class="po-head"><div><p class="eyebrow">${eyebrow}</p><h2 class="po-name" id="h-plan">${esc(c.name)}${perMonth(c) ? `<span class="po-price"> · ${esc(perMonth(c))}</span>` : ''}</h2>${chips(c.picks)}</div>${o.compact ? '' : status}</header>`;
    if (o.compact || changing) {
      return `<section class="card plan-overview is-compact" aria-labelledby="h-plan">${head}<div class="po-facts">${facts(m)}</div></section>`;
    }
    const note = m.open
      ? `<p class="po-note">${icon('info')}<span>Change your services by the end of ${esc(day(m.lastDay))}. Do nothing and your plan stays the same next month.</span></p>`
      : `<p class="po-note">${icon('info')}<span>Next month is set: the last day to change it has passed. Message us if something is wrong.</span></p>`;
    return `<section class="card plan-overview" aria-labelledby="h-plan">${head}
      <div class="rule-rainbow" aria-hidden="true"></div>
      <div class="po-grid">
        <div><h3 class="po-h">Your services each month</h3>${serviceList(c)}${included(c)}</div>
        <div class="po-side"><h3 class="po-h">Billing</h3>${facts(m)}<div class="po-when">${note}${daysLeft(m)}</div>
          <div class="po-actions">${m.open ? `<a class="btn ${pastDue ? 'btn-glass' : 'btn-solid'} btn-block" href="#/billing/change">Change my services${icon('arrow-right')}</a>` : ''}<a class="link" href="#bills">Past bills ↓</a></div>
        </div>
      </div>
    </section>`;
  }

  /**
   * "You're all set": what the client chose for next month, what changes and when, and how to fix a wrong pick.
   * @param {any} m the plan model @param {string} email where the copy goes
   */
  function confirmed(m, email) {
    const c = m.now;
    const n = m.next;
    const was = price(c);
    const will = price(n);
    const items = [
      { state: 'done', title: `${esc(F.date(n.confirmedAt || m.today))}: confirmed`, text: 'Your choice is saved. You can see it here any time.' },
      { state: 'todo', title: `Until ${esc(day(m.lastDay))}`, text: `${esc(F.list(c.services.map((/** @type {any} */ s) => s.label)))} keep running as normal.` },
      { state: 'todo', title: `${esc(day(m.bill))}: ${m.changes.planChanged ? 'new plan starts' : 'new services start'}`, text: `${will ? `Your bill is ${esc(will)}. ` : ''}Locked until ${esc(day(m.lock.to))}.` }
    ];
    const stops = m.changes.stops.map((/** @type {string} */ id) => svc(id).label);
    return `<section class="card plan-confirmed" aria-labelledby="h-set">
      <header class="pcf-head">
        <span class="pcf-ok" aria-hidden="true">${icon('check')}</span>
        <div><p class="eyebrow is-green">You're all set</p><h2 id="h-set">${esc(n.name)} ${m.changes.planChanged ? 'starts' : 'services start'} ${esc(day(m.bill))}</h2></div>
        ${n.confirmedAt ? `<p class="lock-chip">${icon('lock')}Confirmed ${esc(F.dateTime12(n.confirmedAt))}</p>` : ''}
      </header>
      <p class="pcf-lede">Your choice is saved. Nothing is charged today.</p>
      <div class="rule-rainbow" aria-hidden="true"></div>
      <div class="pcf-versus">
        <div class="pcf-box"><p class="eyebrow">Now</p><p class="pcf-plan">${esc(c.name)}</p>${was ? `<p class="pcf-price"><strong>${esc(was)}</strong>/month</p>` : ''}<p class="pcf-svcs">${esc(F.list(c.services.map((/** @type {any} */ s) => s.label)))}</p></div>
        <span class="pcf-arrow" aria-hidden="true">${icon('arrow-right')}</span>
        <div class="pcf-box is-next"><p class="eyebrow">From ${esc(day(m.bill))}</p><p class="pcf-plan">${esc(n.name)}</p>${will ? `<p class="pcf-price"><strong>${esc(will)}</strong>/month</p>` : ''}<p class="pcf-svcs">${esc(F.list(n.services.map((/** @type {any} */ s) => s.label)))}</p></div>
      </div>
      <div class="pcf-grid">
        <div><h3 class="po-h">Your services from ${esc(day(m.bill))}</h3>${serviceList(n)}
          ${stops.length ? `<p class="po-note">${icon('info')}<span><strong>${esc(F.list(stops))} ${stops.length === 1 ? 'stops' : 'stop'} after ${esc(day(m.lastDay))}.</strong> Your work is saved. You can add ${stops.length === 1 ? 'it' : 'them'} back next month.</span></p>` : ''}
        </div>
        <div><h3 class="po-h">What happens next</h3>${timeline(items)}</div>
      </div>
      ${m.open ? `<p class="pcf-warn">${icon('info')}<span><strong>Picked the wrong thing?</strong> Change it any time until ${esc(day(m.lastDay))}, or <a class="link" href="#/messages">message Karan</a>. No charge for changing your mind.</span></p>` : ''}
      <div class="pcf-actions">${m.open ? `<a class="btn btn-solid" href="#/billing/change">Change my services</a>` : ''}<a class="btn btn-glass" href="#/messages">${icon('message')}Message Karan</a><a class="link" href="#bills">Past bills ↓</a></div>
    </section>`;
  }

  /**
   * The card and the Stripe line: how they pay, and a way to change it. Secured by Stripe, as before.
   * @param {any} b the billing record
   */
  function payment(b) {
    const pm = b.paymentMethod || {};
    const problem = b.subscription && b.subscription.status === 'past_due';
    return `<section class="card pay-card" aria-labelledby="h-pay">
      <div class="sec-head"><h2 id="h-pay">Payment</h2></div>
      ${pm.last4 ? `<p class="pay-line">${icon('card')}<span>${esc(pm.brand || 'Card')} ending ${esc(pm.last4)}</span></p>` : '<p class="meta">No card is on file yet.</p>'}
      ${!problem && pm.problem ? `<p class="due tone-overdue">${icon('alert')}${esc(pm.problem.text)}</p>` : ''}
      <p class="secure-line">${icon('lock')}<span><strong>Secured by Stripe</strong>, trusted by millions of businesses. Your card details stay with Stripe; we never see your full card number.</span></p>
      ${problem ? '' : `<button class="btn btn-glass btn-sm" type="button" data-action="external" data-kind="billing-portal">Change card${icon('external')}</button>`}
    </section>`;
  }

  /**
   * Your bills: each with its number, amount, status, due date and the Stripe link staff approved. A bill whose link is not
   * approved shows no button. In the demo the buttons explain what they would do.
   * @param {any[]} list @param {any} m the plan model (for today)
   */
  function bills(list, m) {
    const demo = D8.data.MODE === 'demo';
    const hasAmount = list.some((i) => i.amountMinor !== undefined && i.amountMinor !== null && i.currency);
    const SHOWN = 6;
    const status = {
      paid: ['Paid', 'success', 'check'], failed: ['Payment failed', 'error', 'alert'], overdue: ['Overdue', 'error', 'alert'], due: ['Due', 'info', 'clock']
    };
    const row = (/** @type {any} */ i) => {
      const st = /** @type {any} */ (status)[i.state] || ['Unknown', 'neutral', 'info'];
      const month = i.issued ? F.monthYear(i.issued) : '';
      let amount = '';
      if (hasAmount && i.amountMinor !== undefined && i.amountMinor !== null && i.currency) {
        try { amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: String(i.currency).toUpperCase(), currencyDisplay: 'narrowSymbol' }).format(Number(i.amountMinor) / 100) + ' ' + String(i.currency).toUpperCase(); } catch (e) { amount = ''; }
      }
      const link = i.url && /^https:\/\//.test(String(i.url));
      const canOpen = link || demo;
      const pay = (i.state === 'due' || i.state === 'overdue') && canOpen;
      const btn = canOpen
        ? `<button class="btn ${pay ? 'btn-primary' : 'btn-glass'} btn-sm" type="button" data-action="external" data-kind="invoice" data-id="${esc(i.id)}" data-number="${esc(i.number)}"${link ? ` data-url="${esc(i.url)}"` : ''}>${pay ? 'Pay on Stripe' : 'See bill'}<span class="sr-only"> ${esc(i.number)} on Stripe</span>${icon('external')}</button>`
        : '<span class="meta">Being checked</span>';
      return `<tr>
        <th scope="row"><span class="bill-num">${esc(i.number)}</span><span class="bill-month">${esc(month)}</span></th>
        ${hasAmount ? `<td class="bill-amt">${esc(amount)}</td>` : ''}
        <td class="bill-st"><span class="badge tone-${st[1]}">${icon(st[2])}${st[0]}</span></td>
        <td class="bill-due">${i.due ? esc(day(i.due)) : ''}${i.paid ? `<span class="bill-paid">Paid ${esc(day(i.paid))}</span>` : ''}</td>
        <td class="bill-act">${btn}</td>
      </tr>`;
    };
    const head = `<tr><th scope="col">Bill</th>${hasAmount ? '<th scope="col">Amount</th>' : ''}<th scope="col">Status</th><th scope="col">Due date</th><th scope="col"><span class="sr-only">Pay or see the bill</span></th></tr>`;
    const table = (/** @type {any[]} */ rows) => `<div class="table-wrap bills-wrap" tabindex="0" role="region" aria-label="Your bills"><table class="bills"><thead>${head}</thead><tbody>${rows.map(row).join('')}</tbody></table></div>`;
    if (!list.length) return `<section class="card bills-card" id="bills" tabindex="-1" aria-labelledby="h-bills"><div class="sec-head"><h2 id="h-bills">Your bills</h2></div>${UI.EmptyState({ icon: 'file', title: 'No bills yet.', text: 'Your first one shows here when Stripe sends it.' })}</section>`;
    return `<section class="card bills-card" id="bills" tabindex="-1" aria-labelledby="h-bills">
      <div class="sec-head"><h2 id="h-bills">Your bills</h2><p class="sec-meta">Newest first</p></div>
      ${table(list.slice(0, SHOWN))}
      ${list.length > SHOWN ? `<details class="fold fold-invoices"><summary>See older bills${icon('chevron-down')}</summary>${table(list.slice(SHOWN))}</details>` : ''}
      <p class="meta bills-foot">Links open Stripe, our payment service. A bill that is still being checked does not show here yet.</p>
    </section>`;
  }


  Object.assign(D8.plan, { overview, confirmed, payment, bills, daysLeft });
})(typeof window !== 'undefined' ? window : globalThis);
