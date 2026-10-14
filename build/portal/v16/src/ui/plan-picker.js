// @ts-check
/*
 * Choosing next month (2026-10-13): the deadline card, the plan and service cards, the "Check your changes" panel and the
 * wiring that redraws them from the plan model. Nothing is saved until Confirm, and the database checks the rule again.
 * Shared helpers come from plan.js and plan-billing.js. No price is written here.
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
  const { price, perMonth, sample, ico, ABOUT, blurb, chips, stamp, timeline } = D8.plan;
  const daysLeft = (/** @type {any} */ m) => D8.plan.daysLeft(m);

  /* ---- the picker for next month ------------------------------------------------------------------------------ */

  /** The radio cards for the plans. @param {any} m @param {{planId: string}} st */
  function planCards(m, st) {
    // The dearest plan first, as in the designs
    return m.menu.slice().reverse().map((/** @type {any} */ p) => {
      const pr = price(p);
      // A plan an owner locked, or one with a client limit that is full, takes nobody new: its card says so and cannot be chosen
      // (a client already on it sees the usual card and can pick it again)
      const shut = !p.current && (!!p.locked || !!p.full);
      const tag = p.current ? '<span class="chip-now">Your plan now</span>' : p.locked ? `<span class="chip-now">${icon('lock')}Locked right now</span>` : p.full ? '<span class="chip-now">Taken right now</span>' : '';
      return `<label class="plan-opt${shut ? ' is-shut' : ''}" data-plan="${esc(p.id)}"><input class="pk-input" type="radio" name="plan" value="${esc(p.id)}"${st.planId === p.id ? ' checked' : ''}${shut ? ' disabled' : ''}>
        <span class="po-card"><span class="po-mark" aria-hidden="true">${icon('check')}</span><span class="po-title">${esc(p.name)}</span>${pr ? `<span class="po-cost"><strong>${esc(pr)}</strong>/month</span>` : ''}<span class="po-blurb">${esc(blurb(p))}</span>${tag}</span></label>`;
    }).join('');
  }

  /** How many of the picks the client has made: Ads (and anything else the plan includes) is not a pick. @param {any} r a plan rule @param {string[]} picks */
  const pickedOf = (r, picks) => picks.filter((/** @type {string} */ x) => !r.fixed.includes(x)).length;
  /** The step's heading: only the picks are counted, Ads is shown as included. @param {any} r a plan rule */
  const stepTitle = (r) => `Step 2. Choose ${r.choose} ${r.choose === 1 ? 'service' : 'services'}`;

  /** The services to pick from, for the plan chosen. @param {any} m @param {{planId: string, picks: string[], option: string|null}} st */
  function serviceCards(m, st) {
    const plan = m.menu.find((/** @type {any} */ p) => p.id === st.planId);
    const r = plan.rule;
    const free = st.picks.filter((/** @type {string} */ x) => !r.fixed.includes(x)).length;
    const full = free >= r.choose;
    return D8.planModel.ORDER.map((/** @type {string} */ id) => {
      const s = plan.services.find((/** @type {any} */ x) => x.id === id);
      const fixed = r.fixed.includes(id);
      const on = fixed || st.picks.includes(id);
      const blocked = !on && full;
      const sum = s && s.summary;
      const now = m.now.picks.includes(id) ? '<span class="chip-now is-on">On now</span>' : '';
      // Starter's website time is one of two: a pair of pills, the radio over each so the whole pill is the control.
      const option = st.planId === 'starter' && id === 'website' && on
        ? `<fieldset class="web-opt"><legend>How do you want to use your website time?</legend><div class="web-choices">
            <label class="web-choice"><input class="pk-input" type="radio" name="web" value="page"${st.option === 'page' ? ' checked' : ''}><span class="web-pill">${icon('check')}1 new page a month</span></label>
            <label class="web-choice"><input class="pk-input" type="radio" name="web" value="edits"${st.option === 'edits' ? ' checked' : ''}><span class="web-pill">${icon('check')}2 page edits a month</span></label></div></fieldset>` : '';
      return `<div class="svc-opt${on ? ' is-on' : ''}${blocked ? ' is-blocked' : ''}${fixed ? ' is-fixed' : ''}" data-svc="${esc(id)}">
        <label class="so-main"><input class="pk-input" type="checkbox" name="svc" value="${esc(id)}"${on ? ' checked' : ''}${fixed || blocked ? ' disabled' : ''}>
          <span class="so-mark" aria-hidden="true">${icon('check')}</span>
          ${ico(id)}
          <span class="so-text"><span class="so-name">${esc(svc(id).label)}${now}${fixed ? '<span class="chip-now">Included</span>' : ''}</span><span class="so-about">${esc(/** @type {any} */ (ABOUT)[id] || '')}</span>
          ${sum ? `<span class="so-limit">${esc(sum)} ${sample()}</span>` : ''}
          ${blocked ? `<span class="so-block">You already picked ${r.choose}. Untick ${r.choose === 1 ? 'it' : 'one'} to choose this instead.</span>` : ''}</span>
        </label>${option}</div>`;
    }).join('');
  }

  /** "Check your changes": now, from, what stays, arrives and stops, today, what happens next, and the buttons. @param {any} m @param {any} pv a preview */
  function panel(m, pv, st) {
    const c = m.now;
    const d = pv && pv.draft;
    const was = price(c);
    if (!pv || !d) return '<p class="meta">Choose a plan to see what changes.</p>';
    const will = price(d);
    const rows = D8.planModel.ORDER.filter((/** @type {string} */ id) => pv.change.keeps.includes(id) || pv.change.adds.includes(id) || pv.change.stops.includes(id)).map((/** @type {string} */ id) => {
      const kind = pv.change.adds.includes(id) ? 'adds' : pv.change.stops.includes(id) ? 'stops' : 'keeps';
      const ds = d.services.find((/** @type {any} */ x) => x.id === id);
      const text = kind === 'keeps' ? 'No change. Same work, same team.' : kind === 'adds' ? (ds && ds.summary ? ds.summary : 'We start it next month.') : `Paused after ${day(m.lastDay)}. Your work is saved, not deleted.`;
      return `<li class="chg-row is-${kind}"><span class="chg-tag">${{ keeps: 'Keeps', adds: 'Adds', stops: 'Stops' }[kind]}</span><div><p class="chg-name">${esc(svc(id).label)}</p><p class="chg-text">${esc(text)}</p></div></li>`;
    }).join('');
    const more = pv.moreMinor !== null && pv.moreMinor !== undefined && pv.moreMinor !== 0 ? `<span class="pk-more${pv.moreMinor < 0 ? ' is-less' : ''}">${esc(F.money(Math.abs(pv.moreMinor), d.currency))} ${pv.moreMinor > 0 ? 'more' : 'less'}</span>` : '';
    const tl = timeline([
      { state: 'todo', title: 'Today: you confirm', text: `Your choice is saved. Nothing is charged today.` },
      { state: 'todo', title: `Until ${esc(day(m.lastDay))}`, text: `${esc(F.list(c.services.map((/** @type {any} */ s) => s.label)))} keep running as normal.` },
      { state: 'todo', title: esc(day(m.bill)), text: `${esc(d.name)} starts.${will ? ` Your bill is ${esc(will)}.` : ''}` }
    ]);
    const verb = pv.change.planChanged ? `Confirm: switch to ${d.name}` : `Confirm: keep ${d.name}`;
    const err = !pv.valid ? pv.error : '';
    return `<div class="pk-panel-in">
      <div class="pk-ph"><h2 id="h-check">Check your changes</h2><a class="link" href="#step1">Change</a></div>
      <div class="pk-now"><p class="eyebrow">Now</p><div class="pk-line"><div><p class="pk-name">${esc(c.name)}</p><p class="pk-svcs">${esc(F.list(c.services.map((/** @type {any} */ s) => s.label)))}</p></div>${was ? `<p class="pk-cost"><strong>${esc(was)}</strong>/month</p>` : ''}</div></div>
      <p class="pk-down" aria-hidden="true">${icon('arrow-right')}</p>
      <div class="pk-from"><p class="eyebrow">From ${esc(day(m.bill))}</p><div class="pk-line"><div><p class="pk-name">${esc(d.name)}</p><p class="pk-svcs">${esc(F.list(d.services.map((/** @type {any} */ s) => s.label)))}</p></div>${will ? `<p class="pk-cost"><strong>${esc(will)}</strong>/month</p>` : ''}</div></div>
      ${rows ? `<ul class="chg-list is-panel">${rows}</ul>` : '<p class="meta pk-same">This is the same as this month.</p>'}
      <div class="pk-today"><p class="pk-row"><span>Nothing today</span></p><p class="pk-row is-next"><span>${esc(day(m.bill))} and each month after</span>${will ? '' : `<strong>${esc(d.name)}</strong>`}</p>${will ? `<p class="pk-big"><strong>${esc(will)}</strong>${more}</p>` : ''}</div>
      <h3 class="po-h">What happens next</h3>${tl}
      <p class="form-error" id="pk-error" role="alert"${err ? '' : ' hidden'}>${err ? icon('alert') + '<span>' + esc(err) + '</span>' : ''}</p>
      <button class="btn btn-primary btn-block pk-confirm" type="button" data-pick="confirm"${pv.valid ? '' : ' disabled'}>${icon('lock')}${esc(verb)}</button>
      <p class="pk-lock">Locks your services for ${esc(day(m.lock.from))} to ${esc(day(m.lock.to))}.</p>
      ${pv.same ? '' : '<a class="btn btn-glass btn-block" href="#/billing">Keep my current plan</a>'}
    </div>`;
  }

  /**
   * Where the picker starts: what is already chosen for next month, or this month. A month from before the Ads-plus rules
   * (more services than the plan lets a client pick) is trimmed to Ads and the first services that fit. @param {any} m
   * @returns {{planId: string, picks: string[], option: string|null}}
   */
  function startState(m) {
    const start = m.next || m.now;
    const st = { planId: start.planId, picks: start.picks.slice(), option: start.websiteOption || null };
    fitState(m, st);
    return st;
  }
  /** Keeps the picks a plan allows when the plan or a pick changes: the fixed services first, no more than the plan lets them choose. @param {any} m @param {{planId: string, picks: string[], option: string|null}} st */
  function fitState(m, st) {
    const r = m.menu.find((/** @type {any} */ p) => p.id === st.planId).rule;
    st.picks = D8.planModel.ordered(st.picks);
    for (const f of r.fixed) if (!st.picks.includes(f)) st.picks.unshift(f);
    const free = st.picks.filter((/** @type {string} */ x) => !r.fixed.includes(x));
    st.picks = [...r.fixed, ...free.slice(0, r.choose)];
    if (!(st.planId === 'starter' && st.picks.includes('website'))) st.option = null;
    else if (!st.option) st.option = 'edits';
  }

  /** The banner above the picker: the last day to change, and what happens if they do nothing. @param {any} m */
  function deadline(m) {
    return `<section class="card pk-deadline" aria-labelledby="h-deadline">
      <span class="dl-ico" aria-hidden="true">${icon('calendar')}</span>
      <div class="dl-text"><h2 id="h-deadline">Make changes by ${esc(stamp(m.lastDay))} ${esc(m.zone)}</h2><p>Do nothing and your plan stays the same. Changes start on your next bill, ${esc(day(m.bill))}.</p></div>
      ${daysLeft(m)}
    </section>`;
  }

  /**
   * The whole picker: the two steps and the panel, from where the client starts. mountPicker keeps it up to date.
   * @param {any} m
   */
  function picker(m) {
    const st = startState(m);
    const pv = D8.planModel.preview(m, { planId: st.planId, picks: st.picks, websiteOption: st.option });
    const plan = m.menu.find((/** @type {any} */ p) => p.id === st.planId);
    const r = plan.rule;
    const total = r.choose;
    const have = pickedOf(r, st.picks);
    return `<div class="picker" id="picker">
      <div class="pk-main">
        <section class="pk-step" aria-labelledby="step1"><h2 class="step-h" id="step1" tabindex="-1">Step 1. Choose a plan</h2>
          <fieldset class="plan-choices"><legend class="sr-only">Your plan for next month</legend>${planCards(m, st)}</fieldset></section>
        <section class="pk-step" aria-labelledby="step2"><div class="step-head"><h2 class="step-h" id="step2">${stepTitle(r)}</h2><span class="pick-count${have === total ? ' is-done' : ''}" id="pick-count" aria-live="polite">${icon('check')}${have} of ${total} picked</span></div>
          <fieldset class="svc-choices" id="svc-choices"><legend class="sr-only">Services for next month</legend>${serviceCards(m, st)}</fieldset>
          <p class="pick-help">${icon('info')}<span>Not sure? <a class="link" href="#/messages">Message Karan</a> and we will help you choose. You can change your picks as many times as you like until ${esc(day(m.lastDay))}.</span></p></section>
      </div>
      <aside class="card pk-panel" id="pk-panel" aria-labelledby="h-check">${panel(m, pv, st)}</aside>
      <div class="pk-bar" id="pk-bar"><div><p class="pk-bar-name" id="pk-bar-name"></p><p class="pk-bar-sub" id="pk-bar-sub"></p></div><a class="btn btn-primary" href="#pk-panel">Review</a></div>
    </div>`;
  }

  /**
   * Wires the picker: choosing a plan or a service redraws the cards and the panel from the model, and Confirm saves.
   * Nothing changes until Confirm. @param {HTMLElement} el the page @param {any} ctx @param {any} m the plan model @param {(r: any) => void} done
   */
  function mountPicker(el, ctx, m, done) {
    const root_ = /** @type {HTMLElement|null} */ (el.querySelector('#picker'));
    if (!root_) return;
    const st = startState(m);
    const plan = () => m.menu.find((/** @type {any} */ p) => p.id === st.planId);
    const preview = () => D8.planModel.preview(m, { planId: st.planId, picks: st.picks, websiteOption: st.option });
    const html = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (root_.querySelector(sel));
    let busy = false;

    /**
     * Redraws from the state. `just` names the card the client just touched: it alone gets the "is-just" class, so only
     * its mark pops (the picker is "is-live" after the first change, so nothing pops on load).
     * @param {string} [focus] @param {{kind: string, id: string}} [just]
     */
    function sync(focus, just) {
      fitState(m, st);
      const pv = preview();
      html('#svc-choices').innerHTML = serviceCards(m, st);
      html('#pk-panel').innerHTML = panel(m, pv, st);
      const r = plan().rule;
      const have = pickedOf(r, st.picks);
      const count = html('#pick-count');
      count.className = 'pick-count' + (have === r.choose ? ' is-done' : '');
      count.innerHTML = `${icon('check')}${have} of ${r.choose} picked`;
      html('#step2').textContent = stepTitle(r);
      root_.querySelectorAll('.plan-opt[data-plan]').forEach((n) => {
        n.classList.toggle('is-on', n.getAttribute('data-plan') === st.planId);
        n.classList.toggle('is-just', !!just && just.kind === 'plan' && n.getAttribute('data-plan') === just.id);
      });
      if (just && just.kind === 'svc') { const c = root_.querySelector(`.svc-opt[data-svc="${just.id}"]`); if (c) c.classList.add('is-just'); }
      if (just && just.kind === 'web') { const w = root_.querySelector(`.web-choice .pk-input[value="${just.id}"]`); if (w && w.parentElement) w.parentElement.classList.add('is-just'); }
      const d = pv && pv.draft;
      html('#pk-bar-name').textContent = d ? `${d.name}${price(d) ? ` · ${price(d)}/month` : ''}` : '';
      html('#pk-bar-sub').textContent = d ? `From ${day(m.bill)} · Nothing today` : '';
      // Focus follows the card, without scrolling the page to it: the client is already there.
      if (focus) { const f = /** @type {HTMLElement|null} */ (root_.querySelector(focus)); if (f) f.focus({ preventScroll: true }); }
    }
    root_.addEventListener('change', (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      if (!t || !t.name) return;
      root_.classList.add('is-live');
      if (t.name === 'plan') { st.planId = t.value; sync(`input[name="plan"][value="${t.value}"]`, { kind: 'plan', id: t.value }); }
      else if (t.name === 'svc') {
        st.picks = t.checked ? [...st.picks, t.value] : st.picks.filter((/** @type {string} */ x) => x !== t.value);
        if (t.value === 'website' && !t.checked) st.option = null;
        sync(`input[name="svc"][value="${t.value}"]`, { kind: 'svc', id: t.value });
      } else if (t.name === 'web') { st.option = t.value; sync(`input[name="web"][value="${t.value}"]`, { kind: 'web', id: t.value }); }
    });
    // The panel keeps Confirm in reach: beside the steps it is sticky, and when it is taller than the window it sticks
    // by its foot instead (the stylesheet reads its height from --pk-h). On a phone the bottom bar steps aside while
    // the panel itself is on screen.
    const aside = html('#pk-panel');
    const bar = html('#pk-bar');
    if (typeof root.ResizeObserver === 'function') new root.ResizeObserver(() => { aside.style.setProperty('--pk-h', `${aside.offsetHeight}px`); }).observe(aside);
    if (bar && typeof root.IntersectionObserver === 'function') {
      new root.IntersectionObserver((entries) => { bar.classList.toggle('is-away', entries.some((x) => x.isIntersecting)); }, { rootMargin: '0px 0px -120px 0px' }).observe(aside);
    }
    root_.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest('[data-pick="confirm"]'));
      if (!b || busy) return;
      const btn = /** @type {HTMLButtonElement} */ (b);
      const err = html('#pk-error');
      err.hidden = true;
      if (D8.data.READ_ONLY) { err.innerHTML = `${icon('alert')}<span>${esc(D8.data.DEMO_NOTE)}</span>`; err.hidden = false; return; }
      busy = true;
      const label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Saving';
      D8.dialogs.slow(ctx.client.savePicks(st.planId, st.picks, st.option), 'Billing').then((r) => { busy = false; done(r); }).catch((/** @type {any} */ x) => {
        busy = false;
        btn.disabled = false;
        btn.innerHTML = label;
        err.innerHTML = `${icon('alert')}<span>${esc(x && x.code === 'slow' ? x.message : `We couldn't save that, so nothing changed. ${(x && x.message) || ''}`)}</span>`;
        err.hidden = false;
      });
    });
    sync();
  }

  Object.assign(D8.plan, { deadline, picker, mountPicker });
})(typeof window !== 'undefined' ? window : globalThis);
