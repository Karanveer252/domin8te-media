/*
 * The plan rule widget (2026-10-13): the one place in the console that knows how a plan and its picks are chosen. The Billing
 * override drawer and Add client both mount it, so staff see the same rule the database enforces (app.picks_valid, a locked plan
 * and a plan's client limit) in the same words. The rule itself is D8.planModel.validate(), the one the client's picker uses; this
 * widget adds what only staff may do (set any plan that is not locked; a client already on a locked plan keeps it) and the staff voice.
 * Since 14 Oct 2026 every plan reads the same way: Ads is always in (plans.required_services) and the client adds picks
 * (plans.picks_allowed): Starter Ads + 1, Growth Ads + 2, Domin8te Ads + 3. No plan id is named here; the plan rows decide.
 *
 * It reads plan data from window.D8C.plans and writes nothing: the page that mounts it decides what to do with the value.
 *
 *   const pp = D8C_EXT.planpick.create({ tenantId, start, end, value: { planId, picks, websiteOption }, currentPlanId, onChange(ctl, check) {} });
 *   pp.mountPlans(el, { compact: false });   // the plan cards
 *   pp.mountPicks(el);                        // the services, the counter, Starter's website choice and the rule message
 *   pp.value()   -> { planId, picks[], websiteOption|null }      pp.check() -> { ok, code, error }
 *   pp.set(value) / pp.setRange(start, end)  change it from code
 */
(function () {
  'use strict';
  const W = /** @type {any} */ (window);
  const EXT = (W.D8C_EXT = W.D8C_EXT || {});
  const ORDER = ['advertising', 'social', 'website', 'local', 'email'];
  const C = () => W.D8C;
  const PM = () => W.D8.planModel;
  const esc = (/** @type {any} */ s) => C().esc(s);
  let uid = 0;

  /* ---- the plan data ------------------------------------------------------------------------------------ */

  const plansRows = () => (C().plans.plans || []).slice().sort((/** @type {any} */ a, /** @type {any} */ b) => Number(a.sort) - Number(b.sort));
  const servicesRows = () => (C().plans.services || []).slice().sort((/** @type {any} */ a, /** @type {any} */ b) => Number(a.sort) - Number(b.sort));
  /** A service's name as the console says it ("Ads", "SEO and Google Maps"). @param {string} id */
  function label(id) { const s = servicesRows().find((/** @type {any} */ x) => x.id === id); return s ? s.label : C().svcLabel(id); }
  /** The services a client can have, in the catalog's order. */
  function pickableIds() {
    const rows = servicesRows().filter((/** @type {any} */ s) => s.pickable !== false).map((/** @type {any} */ s) => s.id).filter((/** @type {string} */ id) => ORDER.includes(id));
    return rows.length ? PM().ordered(rows) : ORDER.slice();
  }
  /** The limit in force for each plan and metric on a day: the newest version that has started by then (the database's plan_cap_in_force). @param {string} [on] */
  function capsNow(on) {
    const day = on || C().today();
    /** @type {Map<string, any>} */ const best = new Map();
    for (const r of C().plans.caps || []) {
      if (String(r.effective_from || '0000-01-01') > day) continue;
      const k = `${r.plan_id}/${r.service}/${r.metric}`;
      const cur = best.get(k);
      if (!cur || Number(r.version) > Number(cur.version)) best.set(k, r);
    }
    return Array.from(best.values()).map((r) => ({ planId: r.plan_id, service: r.service, metric: r.metric, label: r.label, cap: Number(r.monthly_cap), weeklyHint: r.weekly_hint || null, proposed: !!r.proposed }));
  }
  /** The plans and limits in the shape D8.planModel reads. */
  function menuOf() {
    return {
      plans: plansRows().map((/** @type {any} */ p) => ({
        id: p.id, name: p.name, locked: !!p.locked, priceMinor: p.price_minor == null ? null : Number(p.price_minor), currency: p.currency || null,
        picksAllowed: p.picks_allowed == null ? null : Number(p.picks_allowed), required: p.required_services || [], maxClients: p.max_clients == null ? null : Number(p.max_clients)
      })),
      caps: capsNow()
    };
  }
  /** "12 posts", "3 live campaigns", "2 listing and search tasks": how a limit's unit reads for staff. */
  function unitOf(/** @type {string} */ metric, /** @type {string} */ lab, /** @type {number} */ n) {
    if (metric === 'seo_jobs') return n === 1 ? 'listing and search task' : 'listing and search tasks';
    if (metric === 'ads_live_campaigns') return n === 1 ? 'live campaign' : 'live campaigns';
    if (metric === 'ads_platforms') return n === 1 ? 'platform' : 'platforms';
    return PM().words(metric, lab, n).unit;
  }
  /** One service's limits on one plan: "12 posts (3 a week), 2 Reels, 8 Stories". A star marks a proposed number. */
  function capLine(/** @type {string} */ planId, /** @type {string} */ service, /** @type {string|null} */ option, /** @type {any[]} */ caps) {
    const ls = PM().lines(caps, planId, service, option);
    if (!ls.length) return '';
    const star = (/** @type {any} */ l) => (caps.some((c) => c.planId === planId && c.metric === l.metric && c.proposed) ? '*' : '');
    const one = (/** @type {any} */ l) => `${l.cap} ${unitOf(l.metric, l.label, l.cap)}${star(l)}${l.weeklyHint ? ` (${l.weeklyHint})` : ''}`;
    if (service === 'website' && ls.length === 2 && ls[0].metric === 'web_pages' && ls[1].metric === 'web_edits') return `${one(ls[0])} ${planId === 'starter' ? 'or' : 'and'} ${one(ls[1])}`;
    return ls.map(one).join(', ');
  }
  /** A service's short name for a chip ("Social", not "Social media"). @param {string} id */
  const shortLabel = (id) => (/** @type {any} */ ({ advertising: 'Ads', social: 'Social', website: 'Website', email: 'Email' }))[id] || label(id);
  const CHIP_UNIT = /** @type {Record<string, string[]>} */ ({ seo_jobs: ['job', 'jobs'], ads_live_campaigns: ['campaign', 'campaigns'], ads_platforms: ['platform', 'platforms'] });
  /** A pick as a chip: "Social · 12 posts". @param {string} planId @param {string} service @param {string|null} [option] @param {any[]} [caps] */
  function chipText(planId, service, option, caps) {
    const ls = PM().lines(caps || capsNow(), planId, service, option || null);
    const first = ls[0];
    const unit = first ? (CHIP_UNIT[first.metric] ? CHIP_UNIT[first.metric][first.cap === 1 ? 0 : 1] : unitOf(first.metric, first.label, first.cap)) : '';
    return first ? `${shortLabel(service)} · ${first.cap} ${unit}` : shortLabel(service);
  }
  /** "Ads and Email", "Ads, Social and Email". @param {string[]} list */
  const andList = (list) => (list.length < 2 ? list.join('') : list.some((/** @type {string} */ x) => / and /.test(x)) ? list.join(', ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

  /**
   * Who is on a plan over a stretch of days, and whether this client may be put on it. Two things can stop that, both the
   * database's (guard_plan_cycle): a LOCKED plan (plans.locked, switched by an owner in Settings) takes nobody new, so the client must
   * already be on it, which means the month being picked already has that plan or the month right before it does (a carry-over); and a
   * plan with a client limit (plans.max_clients, a number; none means no limit) is full once that many other clients have a month on it.
   * Clients who are archived, and months that have ended, do not count as holding a place. Days are 'YYYY-MM-DD', end excluded.
   * @param {string} planId @param {string|null} [tenantId] @param {string} [start] @param {string} [end]
   */
  function slotOf(planId, tenantId, start, end) {
    const p = plansRows().find((/** @type {any} */ x) => x.id === planId);
    const max = p && p.max_clients != null ? Number(p.max_clients) : null;
    const s = start || C().today();
    const e = end || W.D8.time.isoDay(W.D8.time.dayNum(s) + 1);
    const cycles = C().plans.cycles || [];
    const onIt = !!tenantId && cycles.some((/** @type {any} */ c) => c.tenant_id === tenantId && c.plan_id === planId && (String(c.period_start) === s || String(c.period_end) === s));
    const planLocked = !!(p && p.locked);
    const out = { limited: max !== null, max, used: 0, holders: /** @type {string[]} */ ([]), holderIds: /** @type {string[]} */ ([]), taken: false, mine: false, planLocked, onIt, locked: planLocked && !onIt };
    const tenants = (C().all && C().all.tenants) || [];
    /** @type {Set<string>} */ const ids = new Set();
    for (const c of cycles) {
      if (c.plan_id !== planId || c.state === 'ended') continue;
      if (tenantId && c.tenant_id === tenantId) { out.mine = true; continue; }
      const t = tenants.find((/** @type {any} */ x) => x.id === c.tenant_id);
      if (t && t.status === 'archived') continue;
      if (String(c.period_start) < e && s < String(c.period_end)) ids.add(c.tenant_id);
    }
    out.holderIds = Array.from(ids);
    out.holders = out.holderIds.map((id) => ((tenants.find((/** @type {any} */ x) => x.id === id) || {}).name) || 'A client');
    out.used = ids.size;
    out.taken = max !== null && out.used >= max;
    return out;
  }

  /** What changes from one choice to another, in words. @param {any} a @param {any} b each { planId, picks, websiteOption } */
  function diffWords(a, b) {
    const norm = (/** @type {any} */ v) => ({ planId: v.planId, picks: PM().ordered(v.picks || []), websiteOption: v.websiteOption || null });
    const A = norm(a), B = norm(b);
    const d = PM().diff(A, B);
    const name = (/** @type {string} */ id) => ((plansRows().find((/** @type {any} */ p) => p.id === id) || {}).name) || id;
    /** @type {string[]} */ const parts = [];
    if (d.planChanged) parts.push(`Plan ${name(A.planId)} to ${name(B.planId)}`);
    if (d.stops.length) parts.push(`${andList(d.stops.map(label))} off`);
    if (d.adds.length) parts.push(`${andList(d.adds.map(label))} on`);
    if (d.optionChanged) parts.push(`Website: ${B.websiteOption === 'edits' ? '2 website edits' : '1 new page'}`);
    return { differs: d.differs, planChanged: d.planChanged, adds: d.adds, stops: d.stops, optionChanged: d.optionChanged, text: parts.join(', ') };
  }

  /**
   * A database refusal in plain words (the portal's own mapping in D8.live.dbFail speaks to clients, so the console reads the
   * raw error). Names the cause and, where it helps, what to do.
   * @param {any} err
   * @param {string} [what] when given, an error that is not a written sentence becomes the one failure wording (console.js failMessage, critic R2-27) starting with these words
   */
  function say(err, what) {
    const code = String((err && err.code) || '');
    const text = String((err && (err.message || err.details)) || err || '');
    // a locked plan comes first: it is a 23P01 too
    const lockedAt = text.match(/plan-locked:\s*([^\s]+)/i);
    if (lockedAt) {
      const key = lockedAt[1].toLowerCase();
      const lp = plansRows().find((/** @type {any} */ x) => x.id === key || String(x.name).toLowerCase() === key);
      return `${lp ? lp.name : lockedAt[1].charAt(0).toUpperCase() + lockedAt[1].slice(1)} is locked right now. An owner can unlock it in Settings.`;
    }
    const full = text.match(/plan-full:\s*([a-z0-9_-]+)/i);
    if (full || (code === '23P01' && !/overlap/i.test(text))) {
      const id = full ? full[1] : 'domin8te';
      const p = plansRows().find((/** @type {any} */ x) => x.id === id);
      return `${p ? p.name : 'Domin8te'} is taken right now.`;
    }
    if (/overlaps-another-month/i.test(text) || code === '23P01') return 'That month overlaps another month this client already has.';
    if (/picks-do-not-fit/i.test(text) || code === '23514') return 'Those services do not fit that plan. Check the services and try again.';
    if (/reason-required/i.test(text)) return 'Add a reason. It is kept in the history.';
    if (/month-locked/i.test(text)) return 'This month is already running. Give a new reason, different from the last one, to change it.';
    if (/month-ended/i.test(text)) return 'That month has already ended, so it cannot be changed.';
    if (/not-staff/i.test(text)) return 'Only the Domin8te team can do that. Sign in again if you are on the team.';
    if (/stale/i.test(text)) return 'This changed since you opened it. Reload the page, check it again, then approve.';
    if (/nothing-to-approve/i.test(text)) return 'There is nothing to approve here. It may already be approved.';
    if (/not-a-stripe-link/i.test(text)) return 'That payment link is not a Stripe link, so it was not approved.';
    if (/hidden/i.test(text) && /unhide/i.test(text)) return 'That invoice is hidden. Unhide it first.';
    if (/not-found/i.test(text) || code === 'P0002') return 'That was not found. Reload the page and try again.';
    // C3.1b: Postgres wording never reaches the page (no function names or signatures)
    if (/function .* does not exist|could not find the function/i.test(text) || code === '42883' || code === 'PGRST202') return 'This save is not set up on the server yet, so nothing was changed. Tell Karan.';
    if (/permission denied for function/i.test(text) || code === '42501') return 'You are not allowed to make this change, so nothing was changed.';
    if (what && C() && C().failMessage) return C().failMessage(err, what);
    return text ? `That did not save: ${text.replace(/^[a-z-]+:\s*/i, '')}` : 'That did not save. Nothing was changed.';
  }

  /* ---- the widget --------------------------------------------------------------------------------------- */

  /** A small padlock, drawn here so it needs nothing from the page's icon sheet. */
  const LOCK_ICON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  /** @param {any} ctl @param {any} p a plan of the menu @param {any} slot @param {boolean} full the plan's client limit is used up */
  function planBody(ctl, p, slot, full) {
    const st = ctl.state;
    const caps = capsNow();
    const r = PM().rule(p);
    const chosen = (st.picks || []).filter((/** @type {string} */ x) => !r.fixed.includes(x));
    const noPicks = chosen.length === 0;
    let proposed = false;
    const rows = ORDER.map((id) => {
      const line = capLine(p.id, id, st.planId === p.id ? st.websiteOption : null, caps);
      if (!line) return '';
      if (line.includes('*')) proposed = true;
      const inPlan = r.fixed.includes(id) || (st.picks || []).includes(id);
      if (inPlan) return `<span class="pp-cap"><b>${esc(label(id))}:</b> ${esc(line)}</span>`;
      return `<span class="pp-cap is-off"><b>${esc(label(id))}:</b> ${noPicks ? esc(line) : 'not chosen'}</span>`;
    }).join('');
    const over = chosen.length > r.choose ? `<span class="pp-note is-warn">${esc(p.name)} takes ${r.choose} service${r.choose === 1 ? '' : 's'}${r.fixed.length ? ` besides ${esc(andList(r.fixed.map(label)))}` : ''}. You have ${chosen.length}.</span>` : '';
    const taken = full && !slot.locked ? `<span class="pp-note is-bad">${p.maxClients === 1 ? 'The one' : `All ${p.maxClients}`} ${esc(p.name)} ${p.maxClients === 1 ? 'spot is' : 'spots are'} taken. It opens when that client changes plan or leaves.</span>` : '';
    const lock = slot.locked ? `<span class="pp-note is-lock">${esc(p.name)} is locked. An owner can unlock it in <a class="pp-link" href="#/settings">Settings</a>.</span>` : '';
    return `<span class="pp-caps"><span class="pp-caps-h">Limits for your services, each month</span>${rows}</span>${proposed ? '<span class="pp-star">* proposed</span>' : ''}${over}${lock}${taken}`;
  }

  /** @param {any} ctl @param {boolean} compact */
  function plansShell(ctl, compact) {
    const m = menuOf();
    if (!m.plans.length) return '<p class="pp-msg is-bad">The plans have not loaded, so a plan cannot be chosen. Reload the page. If this stays, the plan tables are missing from this database.</p>';
    return `<div class="pp-plans${compact ? ' is-compact' : ''}" role="radiogroup" aria-label="Plan">${m.plans.map((/** @type {any} */ p) => {
      const r = PM().rule(p);
      const price = p.priceMinor != null ? C().money(p.priceMinor, p.currency) : '';
      const rule = r.fixed.length ? `${r.fixed.map(label).join(' + ')} + ${r.choose} service${r.choose === 1 ? '' : 's'}` : `${r.choose} service${r.choose === 1 ? '' : 's'}`;
      const nid = `pp-n-${ctl.id}-${p.id}`, rid = `pp-r-${ctl.id}-${p.id}`;
      return `<label class="pp-plan" data-plan="${esc(p.id)}"><input type="radio" name="pp-plan-${ctl.id}" value="${esc(p.id)}" aria-labelledby="${esc(nid)}" aria-describedby="${esc(rid)}">
        <span class="pp-plan-top"><span class="pp-plan-name" id="${esc(nid)}">${esc(p.name)}</span>${price ? `<span class="pp-plan-price">${esc(price)}<small>/mo</small></span>` : ''}</span>
        <span class="pp-plan-rule" id="${esc(rid)}">${esc(rule)}</span><span class="pp-plan-tag" data-pp="tag"></span>${compact ? '' : '<span class="pp-plan-body" data-pp="body"></span>'}</label>`;
    }).join('')}</div>${compact ? '<p class="pp-note is-lock pp-lock-note" data-pp="lock-note" hidden></p>' : ''}`;
  }

  /** @param {any} ctl */
  function picksShell(ctl) {
    const ids = pickableIds();
    return `<div class="pp-picks"><div class="pp-picks-head"><span class="pp-picks-rule" data-pp="rule"></span><span class="pp-count" data-pp="count"></span></div>
      <div class="pp-grid" role="group" aria-label="Services">${ids.map((id) => `<label class="pp-pick" data-svc="${esc(id)}"><input type="checkbox" value="${esc(id)}"><span class="pp-box" aria-hidden="true">${C().icon('check')}</span><span class="pp-pick-text"><span class="pp-pick-t">${esc(label(id))}</span><span class="pp-pick-d" data-pp="cap"></span></span><span class="pp-pick-tag" data-pp="tag"></span></label>`).join('')}</div>
      <fieldset class="pp-option" data-pp="option" hidden><legend>Website: choose one</legend><label><input type="radio" name="pp-opt-${ctl.id}" value="page"><span data-pp="opt-page"></span></label><label><input type="radio" name="pp-opt-${ctl.id}" value="edits"><span data-pp="opt-edits"></span></label></fieldset>
      <p class="pp-msg" data-pp="msg" role="status" aria-live="polite"></p></div>`;
  }

  /**
   * @param {{ tenantId?: string|null, start?: string, end?: string, value?: any, currentPlanId?: string, onChange?: (ctl: any, check: any) => void }} opts
   */
  function create(opts) {
    const id = ++uid;
    const o = opts || {};
    /** @type {any} */
    const ctl = {
      id, opts: o, tenantId: o.tenantId || null, start: o.start || '', end: o.end || '',
      state: { planId: (o.value && o.value.planId) || '', picks: PM().ordered((o.value && o.value.picks) || []), websiteOption: (o.value && o.value.websiteOption) || null },
      plansEl: null, picksEl: null
    };
    const planOf = (/** @type {string} */ pid) => menuOf().plans.find((/** @type {any} */ p) => p.id === pid) || null;

    ctl.slot = (/** @type {string} */ pid) => slotOf(pid, ctl.tenantId, ctl.start || undefined, ctl.end || undefined);

    ctl.check = function () {
      const st = ctl.state;
      const m = menuOf();
      const p = m.plans.find((/** @type {any} */ x) => x.id === st.planId);
      if (!p) return { ok: false, code: 'bad-plan', error: 'Choose a plan.' };
      const slot = ctl.slot(p.id);
      if (slot.locked) return { ok: false, code: 'plan-locked', error: `${p.name} is locked. An owner can unlock it in Settings.` };
      if (slot.limited && slot.taken) return { ok: false, code: 'plan-full', error: `${p.name} is taken right now.` };
      // the lock was settled above for this client (slot.locked), so the model is told this plan is theirs to take
      const v = PM().validate({ plans: m.plans.map((/** @type {any} */ x) => (x.id === p.id ? { ...x, current: true } : x)), caps: m.caps }, p.id, st.picks, st.websiteOption);
      if (!v.ok && v.code === 'website-option') {
        const ls = PM().lines(m.caps, p.id, 'website', null);
        const a = ls.find((/** @type {any} */ l) => l.metric === 'web_pages'), b = ls.find((/** @type {any} */ l) => l.metric === 'web_edits');
        return { ok: false, code: v.code, error: `Choose how the website service works: ${a ? `${a.cap} ${unitOf(a.metric, a.label, a.cap)}` : '1 new page'} or ${b ? `${b.cap} ${unitOf(b.metric, b.label, b.cap)}` : '2 website edits'} a month.` };
      }
      return v;
    };

    ctl.value = function () {
      const st = ctl.state;
      const p = planOf(st.planId);
      const picks = PM().ordered(st.picks);
      return { planId: st.planId, picks, websiteOption: st.planId === 'starter' && picks.includes('website') ? st.websiteOption || null : null };
    };

    ctl.paint = function () {
      const st = ctl.state;
      const m = menuOf();
      const check = ctl.check();
      if (ctl.plansEl) {
        for (const card of /** @type {HTMLElement[]} */ (Array.from(ctl.plansEl.querySelectorAll('.pp-plan')))) {
          const pid = card.getAttribute('data-plan') || '';
          const p = m.plans.find((/** @type {any} */ x) => x.id === pid);
          if (!p) continue;
          const slot = ctl.slot(pid);
          const full = slot.limited && slot.taken;
          const blocked = slot.locked || full;
          const input = /** @type {HTMLInputElement} */ (card.querySelector('input'));
          input.checked = st.planId === pid;
          input.disabled = blocked && st.planId !== pid;
          card.classList.toggle('is-on', st.planId === pid);
          card.classList.toggle('is-locked', slot.locked);
          card.classList.toggle('is-taken', full && !slot.locked);
          const tag = /** @type {HTMLElement} */ (card.querySelector('[data-pp="tag"]'));
          tag.innerHTML = slot.locked ? `<span class="pp-tag is-lock">${LOCK_ICON}Locked</span>` : full ? '<span class="pp-tag is-bad">Taken</span>' : o.currentPlanId === pid ? '<span class="pp-tag">Current</span>' : '';
          const body = card.querySelector('[data-pp="body"]');
          if (body) body.innerHTML = planBody(ctl, p, slot, full);
        }
        // the small cards have no room for the line: one line under them says which plans are locked
        const lockNote = /** @type {HTMLElement|null} */ (ctl.plansEl.querySelector('[data-pp="lock-note"]'));
        if (lockNote) {
          const names = m.plans.filter((/** @type {any} */ pl) => ctl.slot(pl.id).locked).map((/** @type {any} */ pl) => pl.name);
          lockNote.hidden = !names.length;
          lockNote.innerHTML = names.length ? `${LOCK_ICON}<span>${esc(andList(names))} ${names.length === 1 ? 'is' : 'are'} locked. An owner can unlock ${names.length === 1 ? 'it' : 'them'} in <a class="pp-link" href="#/settings">Settings</a>.</span>` : '';
        }
      }
      const el = /** @type {HTMLElement|null} */ (ctl.picksEl);
      if (el) {
        const caps = m.caps;
        const p = m.plans.find((/** @type {any} */ x) => x.id === st.planId) || null;
        const r = p ? PM().rule(p) : null;
        for (const row of /** @type {HTMLElement[]} */ (Array.from(el.querySelectorAll('.pp-pick')))) {
          const sid = row.getAttribute('data-svc') || '';
          const input = /** @type {HTMLInputElement} */ (row.querySelector('input'));
          const fixed = !!r && r.fixed.includes(sid);
          input.checked = !!r && st.picks.includes(sid);
          input.disabled = !p || fixed;
          row.classList.toggle('is-on', input.checked);
          row.classList.toggle('is-fixed', fixed);
          row.classList.toggle('is-idle', !p);
          /** @type {HTMLElement} */ (row.querySelector('[data-pp="tag"]')).textContent = fixed ? 'Included' : '';
          const line = p ? capLine(p.id, sid, input.checked ? st.websiteOption : null, caps) : '';
          /** @type {HTMLElement} */ (row.querySelector('[data-pp="cap"]')).textContent = p ? (line ? `${p.name}: ${line}` : `${p.name} has no limit set for this`) : 'Choose a plan first';
        }
        const chosen = r ? st.picks.filter((/** @type {string} */ x) => !r.fixed.includes(x)).length : 0;
        /** @type {HTMLElement} */ (el.querySelector('[data-pp="rule"]')).textContent = !p ? 'Choose a plan to pick services.'
          : r && r.fixed.length ? `${p.name}: ${andList(r.fixed.map(label))} ${r.fixed.length === 1 ? 'is' : 'are'} included. Choose ${r.choose} more.` : `${p.name}: choose ${r && r.choose}.`;
        /** @type {HTMLElement} */ (el.querySelector('[data-pp="count"]')).textContent = r ? `${chosen} of ${r.choose} chosen` : '';
        const showOpt = st.planId === 'starter' && st.picks.includes('website');
        const opt = /** @type {HTMLElement} */ (el.querySelector('[data-pp="option"]'));
        opt.hidden = !showOpt;
        if (showOpt) {
          const ls = PM().lines(caps, 'starter', 'website', null);
          const a = ls.find((/** @type {any} */ l) => l.metric === 'web_pages'), b = ls.find((/** @type {any} */ l) => l.metric === 'web_edits');
          /** @type {HTMLElement} */ (el.querySelector('[data-pp="opt-page"]')).textContent = a ? `${a.cap} ${unitOf(a.metric, a.label, a.cap)} a month` : '1 new page a month';
          /** @type {HTMLElement} */ (el.querySelector('[data-pp="opt-edits"]')).textContent = b ? `${b.cap} ${unitOf(b.metric, b.label, b.cap)} a month` : '2 website edits a month';
          for (const radio of /** @type {HTMLInputElement[]} */ (Array.from(opt.querySelectorAll('input')))) radio.checked = st.websiteOption === radio.value;
        }
        const msg = /** @type {HTMLElement} */ (el.querySelector('[data-pp="msg"]'));
        if (!p) { msg.className = 'pp-msg'; msg.innerHTML = ''; }
        else if (check.ok) {
          msg.className = 'pp-msg is-ok';
          msg.innerHTML = `${C().icon('check')}<span>${esc(`Fits ${p.name}: ${chosen} of ${r && r.choose} chosen.`)}</span>`;
        } else {
          const soft = check.code === 'count' && /^Pick /.test(check.error) || check.code === 'website-option';
          msg.className = `pp-msg ${soft ? 'is-warn' : 'is-bad'}`;
          msg.innerHTML = `${C().icon(soft ? 'clock' : 'x')}<span>${esc(check.error)}</span>`;
        }
      }
      return check;
    };
    ctl.changed = function () {
      const check = ctl.paint();
      if (o.onChange) o.onChange(ctl, check);
    };

    ctl.pickPlan = function (/** @type {string} */ pid) {
      const st = ctl.state;
      const p = planOf(pid);
      if (!p) return;
      const r = PM().rule(p);
      st.picks = PM().ordered([...r.fixed, ...st.picks]);
      if (pid !== 'starter') st.websiteOption = null;
      st.planId = pid;
      ctl.changed();
    };
    ctl.toggle = function (/** @type {string} */ sid, /** @type {boolean} */ on) {
      const st = ctl.state;
      const p = planOf(st.planId);
      const r = p ? PM().rule(p) : null;
      if (!p || !r || r.fixed.includes(sid)) { ctl.paint(); return; }
      const set = new Set(st.picks);
      if (on) set.add(sid); else set.delete(sid);
      st.picks = PM().ordered(Array.from(set));
      if (sid === 'website' && !on) st.websiteOption = null;
      ctl.changed();
    };
    ctl.set = function (/** @type {any} */ v) {
      const st = ctl.state;
      st.planId = (v && v.planId) || '';
      st.picks = PM().ordered((v && v.picks) || []);
      st.websiteOption = (v && v.websiteOption) || null;
      ctl.changed();
    };
    ctl.setRange = function (/** @type {string} */ start, /** @type {string} */ end) { ctl.start = start || ''; ctl.end = end || ''; ctl.changed(); };

    ctl.mountPlans = function (/** @type {HTMLElement} */ el, /** @type {{compact?: boolean}} */ mo) {
      el.innerHTML = plansShell(ctl, !!(mo && mo.compact));
      el.addEventListener('change', (e) => { const t = /** @type {HTMLInputElement} */ (e.target); if (t && t.matches && t.matches('input[type="radio"]') && !t.disabled) ctl.pickPlan(t.value); });
      ctl.plansEl = el;
      ctl.paint();
    };
    ctl.mountPicks = function (/** @type {HTMLElement} */ el) {
      el.innerHTML = picksShell(ctl);
      el.addEventListener('change', (e) => {
        const t = /** @type {HTMLInputElement} */ (e.target);
        if (!t || !t.matches) return;
        if (t.matches('input[type="checkbox"]')) ctl.toggle(t.value, t.checked);
        else if (t.matches('input[type="radio"]')) { ctl.state.websiteOption = t.value; ctl.changed(); }
      });
      ctl.picksEl = el;
      ctl.paint();
    };
    return ctl;
  }

  EXT.planpick = { create, label, shortLabel, pickableIds, capsNow, menuOf, unitOf, capLine, chipText, slotOf, diffWords, say, andList, plansRows };
})();
