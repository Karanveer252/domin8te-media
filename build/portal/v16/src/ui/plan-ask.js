// @ts-check
/*
 * The limit check inside "Ask for a change" (2026-10-13): the note under the form that says how the request fits this
 * month's limit, or that an urgent fix never counts. The numbers come from D8.planModel.askPreview(). Shared helpers: plan.js.
 */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});
  const F = D8.fmt;
  const UI = D8.ui;
  const esc = F.esc;
  const icon = UI.icon;

  /**
   * The line under the form that says how the request fits this month's limit. @param {any} a an askPreview() result
   * @param {{urgent?: boolean}} [o]
   */
  function askNote(a, o = {}) {
    if (o.urgent) return `<div class="ask-note is-urgent">${icon('check')}<p>Changing hours, a closure, your phone number or a sold-out item? Those are urgent info fixes and <strong>never count toward your plan</strong>.</p></div>`;
    if (!a) return '';
    if (!a.known) return a.over ? `<div class="ask-note is-over">${icon('alert')}<p><strong>This is not part of your plan this month.</strong> Karan will reply with options before anything happens. Nothing is charged without your OK.</p></div>` : '';
    const unit = a.line.unit;
    const have = a.line.atOnce ? `You have ${a.used} of ${a.cap} ${esc(unit)}` : `You have used ${a.used} of ${a.cap} ${esc(unit)}${a.line.atOnce ? '' : ' this month'}`;
    if (a.over) {
      return `<div class="ask-note is-over">${icon('alert')}<div><p><strong>This is over your plan for this month.</strong> ${have}, so this would make ${a.would}. Karan will reply with options before anything happens. Nothing is charged without your OK.</p>
        <div class="bar is-full" role="img" aria-label="${a.would} of ${a.cap}"><span style="width:100%"></span></div><p class="ask-sum">${a.used} used + ${a.qty} asked = ${a.would} of ${a.cap} ${esc(unit)}</p></div></div>`;
    }
    return `<div class="ask-note is-ok">${icon('info')}<div><p>${have}. This would make ${a.would}.</p>
      <div class="bar" role="img" aria-label="${a.would} of ${a.cap}"><span style="width:${a.pct}%"></span></div></div></div>`;
  }

  Object.assign(D8.plan, { askNote });
})(typeof window !== 'undefined' ? window : globalThis);
