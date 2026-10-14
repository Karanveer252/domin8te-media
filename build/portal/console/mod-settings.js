// @ts-check
/*
 * The Settings page's own parts (2026-10-13): Plans and limits, Picks and lock, Change history, Reminder emails, the Hermes row,
 * and the raw data editor with its checks. console.js calls into window.D8C_EXT.settings from settingsPage and record;
 * everything else it needs comes from window.D8C (read when used, because console.js builds it after this file loads).
 *
 * Reads:  plans, plan_caps, service_catalog, tenant_plan_cycles, billing_reminders (all through D8C.plans), audit_log
 *         (plan_cap_version, plan_updated), staff (names), dashboard_exceptions (through D8C.all.reviews).
 * Writes: plan_caps (insert: a limit change is a NEW version), plans (update: name and price), billing_reminders (update: put
 *         a failed one back in the queue), tenants (the raw data editor, through D8C.save), the rpcs resolve_dashboard_exception
 *         and record_raw_edit (the raw edit's audit row; see the report: it needs a migration).
 */
(function () {
  'use strict';
  /** @type {any} */ const W = window;
  const D = () => W.D8C;
  const esc = (/** @type {any} */ s) => D().esc(s);
  const $ = (/** @type {string} */ s, /** @type {any} */ el) => D().$(s, el);
  const $$ = (/** @type {string} */ s, /** @type {any} */ el) => D().$$(s, el);
  const plural = (/** @type {number} */ n, /** @type {string} */ one, /** @type {string} [many] */ many) => D().plural(n, one, many);
  const DAY = 86400000;

  /** What the page remembers between redraws. hist is the plan changes from the audit log (null until loaded). */
  const ST = { editing: false, hist: /** @type {any[]|null} */ (null), histFailed: false, staff: /** @type {Record<string, string>} */ ({}) };
  W.addEventListener('hashchange', () => { if (!/^#\/settings/.test(location.hash)) ST.editing = false; });

  /* ---- small helpers -------------------------------------------------------------------------------- */

  const isOwner = () => !!(D().me && D().me.role === 'super_admin');
  const cap1 = (/** @type {string} */ s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  /** The 1st of next month on this computer's calendar, as YYYY-MM-DD. */
  function nextFirst() { const t = D().today().split('-').map(Number); return `${t[0] + (t[1] === 12 ? 1 : 0)}-${pad(t[1] === 12 ? 1 : t[1] + 1)}-01`; }
  /** "1 Nov", or "1 Nov 2027" when it is not this year. @param {string} iso */
  function shortDate(iso) { return String(iso).slice(0, 4) === String(new Date().getFullYear()) ? D().when(iso) : D().longDate(iso); }
  /** The email as the database masks it in messages: the first letter, then ***. @param {string} e */
  function mask(e) { const s = String(e || ''); const i = s.indexOf('@'); return i < 1 ? 'no address' : `${s.slice(0, 1)}***${s.slice(i)}`; }
  /** The order the limits are shown in; one the list does not know goes last. */
  const ORDER = ['social_posts', 'social_reels', 'social_stories', 'ads_live_campaigns', 'ads_new_creatives', 'ads_platforms', 'web_pages', 'web_edits',
    'seo_google_posts', 'seo_photos', 'seo_review_replies', 'seo_jobs', 'email_campaigns', 'email_automations'];
  const rank = (/** @type {string} */ m) => { const i = ORDER.indexOf(m); return i < 0 ? 999 : i; };
  const planName = (/** @type {string} */ id) => { const p = D().plans.plans.find((/** @type {any} */ x) => x.id === id); return p ? p.name : id; };
  // The demo console that goes live carries no price at all, whatever the rows say (D8DEMO_SITE is set by build-console.js --demo-site).
  const hasPrice = (/** @type {any} */ p) => !W.D8DEMO_SITE && p && p.price_minor !== null && p.price_minor !== undefined && Number.isFinite(Number(p.price_minor));
  const nameOf = (/** @type {string} */ id) => ST.staff[id] || (id ? 'a team member' : 'the system');
  const STAR = '<span class="pl-star" aria-hidden="true">*</span><span class="sr-only"> (proposed)</span>';

  /* ---- the plans, limits and what is in force ------------------------------------------------------- */

  /**
   * What the limits table shows. For each plan, service and metric: the number in force today (the newest version that has
   * started, as the database's cap_for picks it) and the next one that is scheduled. A cap edit never rewrites a row.
   */
  function model() {
    const p = D().plans;
    const today = D().today();
    const plans = p.plans.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => (a.sort || 0) - (b.sort || 0));
    /** @type {Map<string, any[]>} */ const byKey = new Map();
    for (const c of p.caps) { const k = `${c.plan_id}|${c.service}|${c.metric}`; if (!byKey.has(k)) byKey.set(k, []); /** @type {any[]} */ (byKey.get(k)).push(c); }
    const cell = (/** @type {string} */ plan, /** @type {string} */ service, /** @type {string} */ metric) => {
      const list = byKey.get(`${plan}|${service}|${metric}`) || [];
      const now = list.filter((c) => String(c.effective_from) <= today).sort((a, b) => b.version - a.version)[0] || null;
      const later = list.filter((c) => String(c.effective_from) > today).sort((a, b) => String(a.effective_from).localeCompare(String(b.effective_from)) || a.version - b.version)[0] || null;
      return { now, later, top: list.reduce((m, c) => Math.max(m, c.version), 0) };
    };
    const services = (p.services || []).slice().sort((/** @type {any} */ a, /** @type {any} */ b) => (a.sort || 0) - (b.sort || 0)).map((/** @type {any} */ s) => {
      /** @type {Map<string, string>} */ const seen = new Map();
      for (const c of p.caps) if (c.service === s.id && !seen.has(c.metric)) seen.set(c.metric, c.label);
      const metrics = Array.from(seen.keys()).sort((a, b) => rank(a) - rank(b) || String(seen.get(a)).localeCompare(String(seen.get(b)))).map((k) => ({ metric: k, label: seen.get(k) || k }));
      return { id: s.id, label: s.label, metrics };
    }).filter((/** @type {any} */ s) => s.metrics.length);
    let version = 1;
    let since = '';
    /** @type {any[]} */ const scheduled = [];
    for (const pl of plans) for (const s of services) for (const x of s.metrics) {
      const c = cell(pl.id, s.id, x.metric);
      if (c.now && c.now.version > version) { version = c.now.version; since = String(c.now.effective_from); }
      if (c.later) scheduled.push(c.later);
    }
    // The newest change anyone made: a limit version above the launch numbers, or a plan someone updated.
    const stamps = p.caps.filter((/** @type {any} */ c) => c.version > 1).map((/** @type {any} */ c) => ({ at: c.created_at, by: c.created_by }))
      .concat(p.plans.filter((/** @type {any} */ x) => x.updated_by).map((/** @type {any} */ x) => ({ at: x.updated_at, by: x.updated_by })));
    stamps.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { plans, services, cell, version, since, scheduled, last: stamps[0] || null };
  }

  /** The words for what a plan includes: "Ads + 1 pick", "2 picks", "All services". @param {any} pl */
  function ruleOf(pl) {
    if (pl.picks_allowed === null || pl.picks_allowed === undefined) return 'All services';
    const req = (pl.required_services || []).map((/** @type {string} */ id) => { const s = D().plans.services.find((/** @type {any} */ x) => x.id === id); return s ? s.label : id; });
    const picks = plural(Number(pl.picks_allowed), 'pick');
    return req.length ? `${req.join(' + ')} + ${picks}` : picks;
  }
  /**
   * Who holds a plan that has a limit on clients, as the database counts it: clients that are not archived and have a month on
   * the plan that has not ended. now are the ones in a running month; next only have a month still to come.
   * @param {any} pl
   */
  function holders(pl) {
    const today = D().today();
    const mine = D().plans.cycles.filter((/** @type {any} */ c) => c.plan_id === pl.id && c.state !== 'ended' && String(c.period_end) > today);
    const live = (/** @type {any[]} */ list) => Array.from(new Set(list.map((c) => c.tenant_id))).map((id) => D().tenant(id)).filter((t) => t && t.status !== 'archived');
    const now = live(mine.filter((/** @type {any} */ c) => c.state === 'active'));
    const next = live(mine.filter((/** @type {any} */ c) => c.state !== 'active')).filter((t) => !now.includes(t));
    return { now, next };
  }

  /* ---- Plans and limits ----------------------------------------------------------------------------- */

  /** The one line above the table: the version in force, the last change, and what is coming. @param {any} m */
  function stripHtml(m) {
    const last = m.last
      ? `<span><strong>Last changed</strong> ${esc(D().clockTime(m.last.at))} by ${esc(nameOf(m.last.by))}</span>`
      : '<span><strong>Last changed</strong> set at launch</span>';
    const dates = Array.from(new Set(m.scheduled.map((/** @type {any} */ c) => String(c.effective_from)))).sort();
    const soon = m.scheduled.length
      ? `<span class="chip info" title="The table shows what is in force today. These start later.">${esc(plural(m.scheduled.length, 'limit'))} change${m.scheduled.length === 1 ? 's' : ''} on ${esc(dates.map(shortDate).join(' and '))}</span>` : '';
    return `<span><strong>In force today</strong> version ${m.version}${m.version > 1 && m.since ? `, since ${esc(shortDate(m.since))}` : ''}</span>${last}${soon}`;
  }

  /** One plan's card: its name, price and what it includes; name and price are fields while editing. @param {any} pl @param {boolean} ed */
  function cardHtml(pl, ed) {
    const priced = hasPrice(pl);
    const cur = String(pl.currency || 'USD');
    const symbol = D().money(100, cur).replace(/[\d.,\s]/g, '');
    const limit = pl.max_clients === null || pl.max_clients === undefined ? null : Number(pl.max_clients);
    let tags = '';
    if (limit === null) tags = '<span class="chip plain">No client limit</span>';
    else {
      const who = holders(pl);
      const names = (/** @type {any[]} */ list) => list.map((t) => t.name).join(', ');
      tags = `<span class="chip plain">${limit === 1 ? '1 client' : `${limit} clients`} at a time</span>`
        + (who.now.length ? `<span class="chip info" title="A paused client keeps the place. Only archiving frees it.">Taken by ${esc(names(who.now))}${who.now.some((/** @type {any} */ t) => t.status === 'paused') ? ' (paused)' : ''}</span>` : '')
        + (who.next.length ? `<span class="chip info" title="Their next month is on this plan, so the place is theirs from then.">Next month: ${esc(names(who.next))}</span>` : '')
        + (!who.now.length && !who.next.length ? '<span class="chip good">Place free</span>' : '');
    }
    if (ed) {
      return `<article class="pl-card is-edit"><div class="field"><label for="pn-${esc(pl.id)}">Plan name</label><input id="pn-${esc(pl.id)}" name="plan-name" data-plan="${esc(pl.id)}" type="text" maxlength="40" value="${esc(pl.name)}" autocomplete="off"></div>
        ${priced ? `<div class="field"><label for="pp-${esc(pl.id)}">Price a month</label><span class="pl-money"><span aria-hidden="true">${esc(symbol)}</span><input id="pp-${esc(pl.id)}" name="plan-price" data-plan="${esc(pl.id)}" type="text" inputmode="decimal" value="${esc(String(Number(pl.price_minor) / 100))}" autocomplete="off"></span></div>` : ''}
        <p class="pl-rule">${esc(ruleOf(pl))}</p><div class="pl-tags">${tags}</div></article>`;
    }
    return `<article class="pl-card"><h3 class="pl-name">${esc(pl.name)}</h3>
      ${priced ? `<p class="pl-price"><span class="pl-amt">${esc(D().money(pl.price_minor, cur))}</span> a month</p>` : ''}
      <p class="pl-rule">${esc(ruleOf(pl))}</p><div class="pl-tags">${tags}</div></article>`;
  }

  /** The limits, a row for each limit and a column for each plan. @param {any} m @param {boolean} ed */
  function tableHtml(m, ed) {
    const cols = m.plans.length + 1;
    const starter = m.plans.find((/** @type {any} */ x) => x.id === 'starter');
    const cellHtml = (/** @type {any} */ pl, /** @type {any} */ s, /** @type {any} */ x) => {
      const c = m.cell(pl.id, s.id, x.metric);
      const n = c.now;
      const later = c.later ? `<span class="pl-later">${c.later.monthly_cap} from ${esc(shortDate(c.later.effective_from))}${c.later.proposed ? STAR : ''}</span>` : '';
      if (!n) return `<td data-plan="${esc(pl.id)}"><span class="pl-none">None</span>${later}</td>`;
      if (ed) {
        const who = `${pl.name}, ${s.label}, ${cap1(n.label)}`;
        const id = `pc-${pl.id}-${x.metric}`;
        return `<td data-plan="${esc(pl.id)}"><span class="pl-edit-line"><label class="sr-only" for="${esc(id)}">${esc(who)}</label><input id="${esc(id)}" class="pl-in" name="cap" data-plan="${esc(pl.id)}" data-service="${esc(s.id)}" data-metric="${esc(x.metric)}" type="number" inputmode="numeric" min="0" max="9999" step="1" value="${n.monthly_cap}">${n.proposed ? STAR : ''}</span>
          ${n.weekly_hint ? `<label class="sr-only" for="${esc(id)}-h">${esc(who)}: weekly note</label><input id="${esc(id)}-h" class="pl-hint-in" name="hint" data-plan="${esc(pl.id)}" data-metric="${esc(x.metric)}" type="text" maxlength="40" value="${esc(n.weekly_hint)}" autocomplete="off">` : ''}${later}</td>`;
      }
      return `<td data-plan="${esc(pl.id)}"><span class="pl-n${n.monthly_cap === 0 ? ' is-zero' : ''}">${n.monthly_cap}</span>${n.proposed ? STAR : ''}${n.weekly_hint ? `<span class="pl-hint">${esc(n.weekly_hint)}</span>` : ''}${later}</td>`;
    };
    return `<div class="pl-wrap"><table class="pl-grid"><caption class="sr-only">Monthly limits for each plan</caption>
      <thead><tr><th scope="col" class="pl-corner"><span class="sr-only">Limit</span></th>${m.plans.map((/** @type {any} */ pl) => `<th scope="col">${esc(pl.name)}</th>`).join('')}</tr></thead>
      ${m.services.map((/** @type {any} */ s) => `<tbody><tr class="pl-svc"><th scope="colgroup" colspan="${cols}">${esc(s.label)}${s.id === 'website' && starter ? `<span class="pl-svc-note">${esc(starter.name)} gets one of these each month, chosen with its pick.</span>` : ''}</th></tr>
        ${s.metrics.map((/** @type {any} */ x) => `<tr><th scope="row">${esc(cap1(x.label))}</th>${m.plans.map((/** @type {any} */ pl) => cellHtml(pl, s, x)).join('')}</tr>`).join('')}</tbody>`).join('')}
    </table></div>`;
  }

  function plansHtml() {
    const p = D().plans;
    const owner = isOwner();
    const head = (/** @type {string} */ btn) => `<div class="panel-head pl-head"><div class="pl-head-txt"><h2 id="s-plans">Plans and limits</h2><p>The one list every page reads: plan names, prices, picks and monthly limits. Clients see their own plan only.</p></div>${btn}</div>`;
    if (!p.ok || !p.plans.length) return `${head('')}<div class="empty"><p><strong>The plan tables are not on this database yet.</strong></p><p>Plans and limits show here as soon as they are.</p></div>`;
    const m = model();
    const ed = ST.editing && owner;
    const anyStar = p.caps.some((/** @type {any} */ c) => c.proposed);
    const body = `<p class="pl-strip" id="pl-strip">${stripHtml(m)}</p>
      <div class="pl-cards">${m.plans.map((/** @type {any} */ pl) => cardHtml(pl, ed)).join('')}</div>
      ${tableHtml(m, ed)}
      <p class="pl-foot-note">${anyStar ? '<span class="pl-star" aria-hidden="true">*</span> A proposed number: not confirmed yet. ' : ''}Urgent info fixes (hours, closures, phone, sold-out items) are never counted on any plan.</p>`;
    if (!ed) {
      return head(owner ? '<div class="btns"><button class="btn btn-quiet" type="button" data-pl-edit>Edit limits</button></div>' : '')
        + (owner ? '' : '<p class="meta pl-lock">Only an owner can change plans and limits. Ask an owner on the team.</p>') + body;
    }
    return `${head('')}<form id="pl-form" class="pl-form" novalidate>${body}
      <div class="pl-foot">
        <div class="pl-foot-row">
          <div class="field pl-date"><label for="pl-from">New limits start on</label><input id="pl-from" name="from" type="date" value="${nextFirst()}" min="${esc(D().today())}" required aria-describedby="pl-from-h"><p class="hint" id="pl-from-h">Months that start on or after this day use the new limits. Months that already started keep theirs. Plan names and prices change at once.</p></div>
          <label class="pl-check"><input type="checkbox" name="confirm"><span><span class="pl-check-t">Also confirm every starred number</span><span class="pl-check-d">They stop being starred. Their numbers stay as they are.</span></span></label>
        </div>
        <p class="field-error" id="pl-err" role="alert" hidden></p>
        <div class="actions pl-acts"><span class="pl-count" id="pl-count" aria-live="polite">No changes yet</span><button class="btn btn-quiet" type="button" data-pl-cancel>Cancel</button><button class="btn" type="submit" disabled>Save changes</button></div>
      </div></form>`;
  }

  /**
   * What the open form would save. rows go to plan_caps as new versions; plans are the name and price updates. A weekly note
   * ("2 a week") that was left alone beside a number that moved is dropped, because it would no longer be true.
   * @param {HTMLFormElement} form
   */
  function collect(form) {
    const m = model();
    /** @type {{rows: any[], notes: string[], plans: any[], errors: {el: any, msg: string}[], from: string, unstar: number}} */
    const out = { rows: [], notes: [], plans: [], errors: [], from: '', unstar: 0 };
    const fromEl = /** @type {any} */ (form.elements.namedItem('from'));
    const confirmEl = /** @type {any} */ (form.elements.namedItem('confirm'));
    out.from = fromEl ? String(fromEl.value || '') : '';
    const stars = !!(confirmEl && confirmEl.checked);
    const bad = (/** @type {any} */ el, /** @type {string} */ msg) => out.errors.push({ el, msg });
    for (const input of $$('input[name="cap"]', form)) {
      const plan = input.getAttribute('data-plan'), service = input.getAttribute('data-service'), metric = input.getAttribute('data-metric');
      const c = m.cell(plan, service, metric);
      if (!c.now) continue;
      const label = `${planName(plan)} ${c.now.label}`;
      const raw = String(input.value).trim();
      if (!/^\d{1,4}$/.test(raw)) { bad(input, `${label}: use a whole number, 0 or more.`); continue; }
      const n = Number(raw);
      const hintEl = $(`input[name="hint"][data-plan="${plan}"][data-metric="${metric}"]`, form);
      const was = c.now.weekly_hint || '';
      const hint = hintEl ? String(hintEl.value).trim() : was;
      const moved = n !== Number(c.now.monthly_cap);
      const noted = hint !== was;
      if (!moved && !noted && !(stars && c.now.proposed)) continue;
      out.rows.push({ plan_id: plan, service, metric, label: c.now.label, monthly_cap: n, weekly_hint: moved && !noted ? null : hint || null, proposed: false, version: c.top + 1, effective_from: out.from });
      out.notes.push(moved ? `${label} ${c.now.monthly_cap} to ${n}` : noted ? `${label} note` : `${label} confirmed`);
      if (c.now.proposed) out.unstar++;
      // A newer version that starts earlier than a scheduled one would hide it, so the new day cannot come before it.
      if (c.later && out.from && out.from < String(c.later.effective_from)) bad(fromEl, `${label} already has a change that starts ${shortDate(c.later.effective_from)}. Pick that day or a later one.`);
    }
    for (const pl of m.plans) {
      const nameEl = $(`input[name="plan-name"][data-plan="${pl.id}"]`, form);
      const priceEl = $(`input[name="plan-price"][data-plan="${pl.id}"]`, form);
      /** @type {any} */ const patch = {};
      if (nameEl) {
        const nm = String(nameEl.value).trim();
        if (!nm || nm.length > 40) bad(nameEl, 'A plan name needs 1 to 40 characters.');
        else if (nm !== pl.name) patch.name = nm;
      }
      if (priceEl) {
        const raw = String(priceEl.value).trim().replace(/[$,\s]/g, '');
        if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) bad(priceEl, `${pl.name}: enter the price as a number above zero.`);
        else { const minor = Math.round(Number(raw) * 100); if (minor !== Number(pl.price_minor)) patch.price_minor = minor; }
      }
      if (Object.keys(patch).length) out.plans.push({ id: pl.id, patch, was: pl });
    }
    if (out.rows.length) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(out.from) || isNaN(new Date(out.from + 'T00:00').getTime())) bad(fromEl, 'Pick the day the new limits start.');
      else if (out.from < D().today()) bad(fromEl, 'That day has passed. Pick today or a later day.');
    }
    return out;
  }

  /** The database's refusals in the words of this page. Nothing was saved when one of these comes back. @param {any} e */
  function words(e) {
    const said = String((e && e.message) || '');
    const code = e && e.code;
    if (/past/.test(said)) return 'That start day has already passed on the server\'s clock. Pick a later day.';
    if (/new version/.test(said) || code === '23505') return 'Someone saved a newer version of one of these limits first. The table now shows theirs. Check it and save again.';
    if (code === '42501' || code === 'PGRST301') return 'Only an owner can change plans and limits.';
    if (code === '23514' || code === '22P02') return 'One of the numbers is not allowed. Use whole numbers, 0 or more, and a price above zero.';
    return said || 'The server did not answer.';
  }

  /** Reads plans and limits again and puts them where every other page reads them (D8C.all.plans). */
  async function reloadPlans() {
    const c = await D().db();
    /** @param {any} q */
    const rd = async (q) => { try { const r = await q; return r && !r.error ? r.data || [] : null; } catch (e) { return null; } };
    const [plans, caps] = await Promise.all([rd(c.from('plans').select('*').order('sort')), rd(c.from('plan_caps').select('*'))]);
    const all = D().all;
    if (all && all.plans) {
      if (plans) all.plans.plans = plans;
      if (caps) all.plans.caps = caps;
      all.plans.ok = all.plans.plans.length > 0;
      all.plans.at = Date.now();
    }
    // The line under the title says when this was read.
    const line = location.hash.startsWith('#/settings') ? $('.page-fresh', D().main) : null;
    if (line) line.outerHTML = freshHtml();
  }

  /** @param {HTMLElement} box */
  function wirePlans(box) {
    const edit = $('[data-pl-edit]', box);
    if (edit) edit.addEventListener('click', () => { ST.editing = true; drawPlans(); const first = $('#pl-form input', document); if (first) first.focus(); });
    const form = /** @type {HTMLFormElement|null} */ ($('#pl-form', box));
    if (!form) return;
    D().track(form, 'Plans and limits');
    const save = /** @type {HTMLButtonElement} */ ($('button[type=submit]', form));
    const count = $('#pl-count', form);
    const err = $('#pl-err', form);
    const refresh = () => {
      const c = collect(form);
      const n = c.rows.length + c.plans.length;
      count.textContent = n ? `${plural(n, 'change')}` : 'No changes yet';
      save.disabled = n === 0;
      if (!err.hidden) { err.hidden = true; for (const el of $$('[aria-invalid]', form)) el.removeAttribute('aria-invalid'); }
    };
    form.addEventListener('input', refresh);
    form.addEventListener('change', refresh);
    $('[data-pl-cancel]', form).addEventListener('click', () => { D().clean(form); ST.editing = false; drawPlans(); const b = $('[data-pl-edit]'); if (b) b.focus(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const c = collect(form);
      if (c.errors.length) {
        err.textContent = c.errors[0].msg + (c.errors.length > 1 ? ` (${c.errors.length - 1} more to fix)` : '');
        err.hidden = false;
        for (const x of c.errors) x.el.setAttribute('aria-invalid', 'true');
        c.errors[0].el.focus();
        return;
      }
      if (!c.rows.length && !c.plans.length) { D().toast('Nothing has changed.'); return; }
      const bits = [];
      if (c.rows.length) bits.push(`${c.notes.slice(0, 3).join(', ')}${c.notes.length > 3 ? ` and ${c.notes.length - 3} more` : ''} start${c.rows.length === 1 && c.notes.length === 1 ? 's' : ''} on ${D().longDate(c.from)}. Months that start before then keep their limits.${c.unstar ? ` ${plural(c.unstar, 'starred number')} stop${c.unstar === 1 ? 's' : ''} being proposed.` : ''}`);
      if (c.plans.length) {
        const priced = c.plans.some((/** @type {any} */ x) => x.patch.price_minor !== undefined);
        const said = c.plans.map((/** @type {any} */ x) => [x.patch.name !== undefined ? `${x.was.name} is renamed ${x.patch.name}` : '', x.patch.price_minor !== undefined ? `${x.patch.name || x.was.name} costs ${D().money(x.patch.price_minor, x.was.currency)} a month, not ${D().money(x.was.price_minor, x.was.currency)}` : ''].filter(Boolean).join(', '));
        bits.push(`At once: ${said.join('; ')}.${priced ? ' A price here changes what the console and the portal show. It does not change what Stripe charges.' : ''}`);
      }
      const n = c.rows.length + c.plans.length;
      if (!await D().ask(`Save ${plural(n, 'change')} to plans and limits?`, bits.join(' '), 'Save changes')) return;
      const done = D().busy(save, 'Saving');
      const db = await D().db();
      let saved = 0;
      try {
        if (c.rows.length) {
          // One statement for every row: all of them are saved, or none.
          const res = await db.from('plan_caps').insert(c.rows);
          if (res.error) throw Object.assign(new Error(`Nothing was saved. ${words(res.error)}`), { conflict: /new version/.test(String(res.error.message || '')) || res.error.code === '23505' });
          saved += c.rows.length;
        }
        for (const x of c.plans) {
          const res = await db.from('plans').update(x.patch).eq('id', x.id).select('id');
          if (res.error) throw new Error(`${saved ? `The limits were saved. ` : ''}${x.was.name} was not changed. ${words(res.error)}`);
          if (!(res.data || []).length) throw new Error(`${saved ? 'The limits were saved. ' : ''}${x.was.name} was not changed. Only an owner can change plans.`);
          saved++;
        }
      } catch (x) {
        done();
        D().toast(/** @type {any} */ (x).message, true);
        // Someone else's newer version: show their numbers, still in the edit form, so the next save builds on them.
        if (/** @type {any} */ (x).conflict) { await reloadPlans(); loadHistory(); D().clean(form); drawPlans(); }
        else if (saved) { await reloadPlans(); loadHistory(); ST.editing = false; D().clean(form); drawPlans(); }
        return;
      }
      await reloadPlans();
      D().clean(form);
      ST.editing = false;
      drawPlans();
      loadHistory();
      const again = $('[data-pl-edit]'); if (again) again.focus();
      D().toast(c.rows.length ? `Saved. The new limits start on ${D().longDate(c.from)}.` : 'Saved.');
    });
  }

  function drawPlans() {
    const box = document.getElementById('sec-plans');
    if (!box) return;
    box.innerHTML = plansHtml();
    wirePlans(box);
  }

  /* ---- Picks and lock, and Change history ----------------------------------------------------------- */

  function picksHtml() {
    return `<div class="panel-head"><h2 id="s-picks">Picks and lock</h2></div>
      <p class="pk-lead"><strong>Picks lock each billing month.</strong></p>
      <p class="pk-body">A change starts on the next bill date. Clients can change their picks until the day before the bill, and picks they leave alone carry over.</p>
      <dl class="facts pk-facts"><dt>Last day to change</dt><dd>The day before the next bill, until the end of the day on the restaurant's clock</dd>
        <dt>Not confirmed</dt><dd>3 days before the bill, a carry-over nobody confirmed opens an item in <a href="#/queue">Needs you</a></dd>
        <dt>Over a limit</dt><dd>The work is held until someone approves a one-off. Nothing is charged automatically.</dd></dl>`;
  }
  function drawPicks() { const b = document.getElementById('sec-picks'); if (b) b.innerHTML = picksHtml(); }

  /** The plan changes in the audit log, grouped by day and person, newest first. */
  function histItems() {
    const caps = D().plans.caps;
    const rows = (ST.hist || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    /** @type {any[]} */ const groups = [];
    // One save is one statement, so its rows share a moment: that is what makes a version.
    for (const r of rows) {
      let g = groups.find((x) => x.action === r.action && x.at === r.at && x.actor === r.actor);
      if (!g) { g = { action: r.action, actor: r.actor, at: r.at, rows: [] }; groups.push(g); }
      g.rows.push(r.detail || {});
    }
    const today = D().today();
    return groups.map((g) => {
      const who = nameOf(g.actor);
      const dayText = new Date(g.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      if (g.action === 'plan_cap_version') {
        const v = Math.max(...g.rows.map((/** @type {any} */ d) => Number(d.version) || 1));
        const bits = g.rows.map((/** @type {any} */ d) => {
          const row = caps.find((/** @type {any} */ c) => c.plan_id === d.plan && c.service === d.service && c.metric === d.metric && c.version === d.version);
          const old = caps.find((/** @type {any} */ c) => c.plan_id === d.plan && c.service === d.service && c.metric === d.metric && c.version === d.version - 1);
          const label = row ? row.label : String(d.metric || '').replace(/_/g, ' ');
          return `${planName(d.plan)} ${label} ${old ? `${old.monthly_cap} to ${d.cap}` : `set to ${d.cap}`}`;
        });
        const dates = Array.from(new Set(g.rows.map((/** @type {any} */ d) => String(d.effective_from)))).sort();
        const when = dates.length === 1 ? (dates[0] <= today ? `In force since ${shortDate(dates[0])}` : `Starts ${shortDate(dates[0])}`) : 'Start days differ';
        return { tag: `v${v}`, day: dayText, text: `${bits.slice(0, 3).join(', ')}${bits.length > 3 ? ` and ${bits.length - 3} more` : ''}. ${when}. ${cap1(who)}.` };
      }
      const bits = g.rows.map((/** @type {any} */ d) => {
        const o = d.old || {}, n = d.new || {};
        const said = [];
        if (o.name !== n.name && n.name) said.push(`Renamed ${o.name || planName(d.plan)} to ${n.name}`);
        if (o.price_minor !== n.price_minor && n.price_minor !== null && n.price_minor !== undefined) said.push(`${n.name || planName(d.plan)} price set to ${D().money(n.price_minor, n.currency)}`);
        return said.length ? said.join('. ') : `${n.name || planName(d.plan)} details changed`;
      });
      return { tag: 'Plans', day: dayText, text: `${bits.join('. ')}. ${cap1(who)}.` };
    });
  }
  function historyHtml() {
    const head = '<div class="panel-head"><h2 id="s-hist">Change history</h2></div>';
    if (ST.histFailed && !ST.hist) return `${head}<p class="notice bad">The history could not be read. Reload the page to try again.</p>`;
    if (!ST.hist) return head + D().skeleton(1);
    const items = histItems();
    if (!items.length) return `${head}<p class="meta">No changes yet. The launch numbers are version 1.</p>`;
    const li = (/** @type {any} */ x) => `<li class="hx-item"><span class="hx-when"><strong>${esc(x.tag)}</strong> ${esc(x.day)}</span><span class="hx-what">${esc(x.text)}</span></li>`;
    return `${head}<ol class="hx-list">${items.slice(0, 4).map(li).join('')}</ol>${items.length > 4 ? `<details class="reveal q-more"><summary>Show older (${items.length - 4})</summary><ol class="hx-list">${items.slice(4).map(li).join('')}</ol></details>` : ''}`;
  }
  function drawHistory() { const b = document.getElementById('sec-hist'); if (b) b.innerHTML = historyHtml(); }

  /** Reads the plan changes and the team's names, then draws the history and the line above the table again. */
  async function loadHistory() {
    try {
      const c = await D().db();
      const [a, s] = await Promise.all([
        c.from('audit_log').select('actor, action, detail, at').in('action', ['plan_cap_version', 'plan_updated']).order('at', { ascending: false }).limit(120),
        c.from('staff').select('clerk_user_id, name')
      ]);
      if (a.error) { ST.histFailed = true; } else { ST.hist = a.data || []; ST.histFailed = false; }
      if (s && !s.error) ST.staff = Object.fromEntries((s.data || []).map((/** @type {any} */ x) => [x.clerk_user_id, x.name]));
    } catch (e) { ST.histFailed = true; }
    drawHistory();
    const strip = document.getElementById('pl-strip');
    if (strip && D().plans.ok) strip.innerHTML = stripHtml(model());
  }

  /* ---- Reminder emails ------------------------------------------------------------------------------ */

  const KIND = { d7: '7 day reminder', d3: '3 day reminder', picks_confirmed: 'picks confirmed email' };
  const KIND_WHEN = { d7: '7 days before the bill', d3: '3 days before the bill', picks_confirmed: 'copy of their picks' };
  const kindOf = (/** @type {string} */ k) => /** @type {any} */ (KIND)[k] || k;
  const clientOf = (/** @type {string} */ id) => { const t = D().tenant(id); return t ? t.name : 'a client'; };

  /** What the reminder rows say about the job: its newest activity, what failed, what is due, and whether sending works. */
  function remStats() {
    const rows = D().plans.reminders || [];
    const now = Date.now();
    const t = (/** @type {any} */ x) => new Date(x).getTime();
    const sent = rows.filter((/** @type {any} */ r) => r.status === 'sent' && r.provider_id);
    const tried = rows.filter((/** @type {any} */ r) => r.status === 'sent' || r.status === 'failed' || r.status === 'sending' || Number(r.attempts) > 0)
      .map((/** @type {any} */ r) => ({ r, at: r.status === 'sent' && r.sent_at ? r.sent_at : r.updated_at })).sort((/** @type {any} */ a, /** @type {any} */ b) => t(b.at) - t(a.at));
    const fails = rows.filter((/** @type {any} */ r) => r.status === 'failed' && now - t(r.updated_at) <= 30 * DAY).sort((/** @type {any} */ a, /** @type {any} */ b) => t(b.updated_at) - t(a.updated_at));
    const upcoming = rows.filter((/** @type {any} */ r) => r.status === 'scheduled').sort((/** @type {any} */ a, /** @type {any} */ b) => t(a.send_at) - t(b.send_at));
    // Due for more than 3 hours, never tried: the job planned it and sent nothing, which is what it does with no key or sender.
    const overdue = upcoming.filter((/** @type {any} */ r) => t(r.send_at) < now - 3 * 3600000 && !Number(r.attempts));
    const key = sent.length ? 'set' : overdue.length ? 'not set' : 'unknown';
    const newestSent = sent.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => t(b.sent_at) - t(a.sent_at))[0] || null;
    return { rows, sent, tried, fails, upcoming, overdue, key, newestSent };
  }

  function remindersHtml() {
    const p = D().plans;
    const head = '<div class="panel-head"><div class="pl-head-txt"><h2 id="s-reminders">Reminder emails</h2><p>Sent with Resend. A reminder that cannot be sent opens an item in Needs you.</p></div></div>';
    if (!p.ok) return `${head}<p class="meta">The reminder table is not on this database yet.</p>`;
    const R = remStats();
    const last = R.tried[0];
    const lastText = last
      ? `${esc(D().clockTime(last.at))}. ${last.r.status === 'sent' ? 'Sent' : last.r.status === 'failed' ? 'Could not send' : 'Tried'} the ${esc(kindOf(last.r.kind))} to ${esc(clientOf(last.r.tenant_id))}.`
      : 'Nothing has been sent or tried yet.';
    const next = R.upcoming[0];
    const nextText = next ? `${esc(D().clockTime(next.send_at))}: the ${esc(kindOf(next.kind))} to ${esc(clientOf(next.tenant_id))}. ${R.upcoming.length > 1 ? `${R.upcoming.length} are waiting in all.` : ''}` : 'Nothing is waiting right now.';
    const key = R.key === 'set'
      ? `<p class="rm-key is-set"><strong>Resend key: set.</strong> A reminder went out through Resend on ${esc(D().clockTime(R.newestSent.sent_at))}, so sending works. The console never sees the key itself.</p>`
      : R.key === 'not set'
        ? `<p class="rm-key is-off"><strong>Resend key: not set.</strong> ${esc(plural(R.overdue.length, 'reminder'))} ${R.overdue.length === 1 ? 'is' : 'are'} past ${R.overdue.length === 1 ? 'its' : 'their'} time and nothing has ever gone out, which is what the job does with no key or no sender. Add them to the server's secrets.</p>`
        : '<p class="rm-key"><strong>Resend key: not confirmed yet.</strong> No reminder has been due, so nothing shows whether it is set. The console never sees the key itself.</p>';
    const fail = (/** @type {any} */ r) => `<li class="rm-fail" data-rem="${esc(r.id)}">
        <div class="rm-who"><strong>${esc(clientOf(r.tenant_id))}</strong><span class="meta">${esc(/** @type {any} */ (KIND_WHEN)[r.kind] || r.kind)} · to ${esc(mask(r.to_email))}</span></div>
        <p class="rm-err">Failed ${esc(D().clockTime(r.updated_at))} after ${esc(plural(Number(r.attempts) || 0, 'try', 'tries'))}${r.error ? `: ${esc(r.error)}` : ''}</p>
        <div class="rm-acts"><button class="btn btn-quiet btn-sm" type="button" data-rm-again="${esc(r.id)}">Send again</button><button class="linkish" type="button" data-rm-addr="${esc(r.id)}" aria-expanded="false">Use another address</button></div>
        <form class="rm-addr" data-rm-form="${esc(r.id)}" novalidate hidden><div class="field"><label for="ra-${esc(r.id)}">Send it to this address instead</label><input id="ra-${esc(r.id)}" name="email" type="email" maxlength="200" autocomplete="off" placeholder="name@restaurant.com"></div><button class="btn btn-sm" type="submit">Send to this address</button></form>
      </li>`;
    return `${head}<div class="rm-grid"><div class="rm-info">
        <dl class="facts rm-facts"><dt>Schedule</dt><dd>7 days and 3 days before each bill, at 10:00 AM on the restaurant's clock. The job runs every hour and sends what is due.</dd>
          <dt>Last run</dt><dd>${lastText}<span class="meta rm-sub">The job keeps no log of its own, so this is its newest reminder.</span></dd>
          <dt>Next up</dt><dd>${nextText}</dd>
          <dt>Sender</dt><dd>The address in REMINDERS_FROM on the server. The console cannot read it.</dd></dl>
        ${key}</div>
      <div class="rm-fails"><h3 class="rm-h">Failed in the last 30 days <span class="chip ${R.fails.length ? 'warn' : 'good'}">${R.fails.length ? R.fails.length : 'None'}</span></h3>
        ${R.fails.length ? `<ul class="rm-list">${R.fails.map(fail).join('')}</ul>` : '<p class="meta">No reminder has failed in the last 30 days.</p>'}</div></div>`;
  }

  /** Puts a failed reminder back in the queue (the database allows only that), then settles the Needs you item about it. @param {HTMLElement} btn @param {string} id @param {string} email */
  async function sendAgain(btn, id, email) {
    const r = (D().plans.reminders || []).find((/** @type {any} */ x) => x.id === id);
    if (!r) return;
    if (!await D().ask(`Send the ${kindOf(r.kind)} to ${clientOf(r.tenant_id)} again?`, `It goes to ${email ? email : mask(r.to_email)} in the next hourly check.${email ? ' The new address is kept with the reminder.' : ''}`, 'Send again')) return;
    const done = D().busy(btn, 'Queuing');
    try {
      const db = await D().db();
      /** @type {any} */ const patch = { status: 'scheduled' };
      if (email && email.toLowerCase() !== String(r.to_email).toLowerCase()) patch.to_email = email;
      const res = await db.from('billing_reminders').update(patch).eq('id', id).select('id, status');
      if (res.error) {
        const said = String(res.error.message || '');
        throw new Error(/bad-email/.test(said) ? 'That does not look like an email address. Nothing was changed.' : /only-requeue/.test(said) || res.error.code === '42501' ? 'Only a failed or skipped reminder can be sent again. Nothing was changed.' : `${said || 'The server did not answer.'} Nothing was changed.`);
      }
      if (!(res.data || []).length) throw new Error('Nothing was changed: the reminder is not there any more.');
      // The Needs you item about this reminder is settled by the same click. If that fails, the reminder is still queued.
      let tail = '';
      try {
        const open = ((D().all && D().all.reviews && D().all.reviews.exceptions) || []).filter((/** @type {any} */ x) => x.entity_type === 'reminder' && String(x.entity_id) === String(id) && x.status === 'open');
        for (const x of open) { const q = await db.rpc('resolve_dashboard_exception', { p_id: x.id, p_status: 'resolved', p_note: 'sent again from Settings' }); if (q.error) throw new Error(q.error.message); }
      } catch (x) { tail = ' The item in Needs you is still open: close it there.'; }
      await D().loadAll().catch(() => { /* the toast still says it is queued */ });
      drawReminders();
      D().toast(`Queued. It goes out in the next hourly check.${tail}`, !!tail);
    } catch (x) {
      done();
      D().toast(/** @type {any} */ (x).message, true);
    }
  }

  /** @param {HTMLElement} box */
  function wireReminders(box) {
    box.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const again = /** @type {HTMLElement|null} */ (t.closest('[data-rm-again]'));
      if (again) { sendAgain(again, again.getAttribute('data-rm-again') || '', ''); return; }
      const open = /** @type {HTMLElement|null} */ (t.closest('[data-rm-addr]'));
      if (open) {
        const f = /** @type {HTMLElement|null} */ ($(`[data-rm-form="${open.getAttribute('data-rm-addr')}"]`, box));
        if (!f) return;
        f.hidden = !f.hidden;
        open.setAttribute('aria-expanded', String(!f.hidden));
        if (!f.hidden) { const i = $('input', f); if (i) i.focus(); }
      }
    });
    box.addEventListener('submit', (e) => {
      const f = /** @type {HTMLFormElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-rm-form]'));
      if (!f) return;
      e.preventDefault();
      const email = String((/** @type {any} */ (f.elements.namedItem('email'))).value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { D().toast('Enter the address to send it to.', true); /** @type {any} */ (f.elements.namedItem('email')).focus(); return; }
      sendAgain(/** @type {HTMLElement} */ ($('button[type=submit]', f)), f.getAttribute('data-rm-form') || '', email);
    });
  }
  function drawReminders() {
    const box = document.getElementById('sec-reminders');
    if (!box) return;
    box.innerHTML = remindersHtml();
  }

  /* ---- the Hermes row, and the top of the page ------------------------------------------------------ */

  /** The read-only Hermes row. Off, it says so and names the switch; it shows set or not set, never a value. @param {{hint: string}} o */
  function hermesHtml(o) {
    const on = !!D().FLAGS.hermes;
    return `<section class="panel set-ai" id="sec-ai" aria-labelledby="s-ai"><div class="panel-head"><h2 id="s-ai">Hermes (AI assistant)</h2><span class="chip ${on ? 'good' : 'off'}">${on ? 'On' : 'Off'}</span></div>
      <p>${on ? `On. ${esc(o.hint)}` : 'Off. Turn on with HERMES_ENABLED.'}</p>
      <p class="meta">HERMES_ENABLED: ${on ? 'set' : 'not set'}. The console shows only whether it is set, never a value.</p></section>`;
  }

  /** The line under the title: when the plan tables were read, from where, and whether that worked. */
  function freshHtml() {
    const p = D().plans;
    return D().pageFresh({ updatedAt: p.at, source: 'Console and the database', status: p.ok ? 'ok' : 'delayed', label: p.ok ? undefined : 'Plans did not load' });
  }
  /** The freshness line and a row of links to the parts of this long page. */
  function top() {
    const links = [['sec-plans', 'Plans and limits'], ['sec-reminders', 'Reminder emails'], ['team-box', 'Team'], ['sec-access', 'Access details'], ['sec-stripe', 'Stripe'], ['sec-multica', 'Multica'], ['sec-look', 'Preferences']];
    return `${freshHtml()}
      <nav class="set-index" aria-label="On this page">${links.map(([id, t]) => `<button type="button" data-action="jump" data-to="${id}">${esc(t)}</button>`).join('')}</nav>`;
  }
  /** The empty parts that mount() fills: Plans and limits, Picks and lock, Change history, Reminder emails. */
  function sections() {
    return `<section class="panel pl-panel" id="sec-plans" aria-labelledby="s-plans"></section>
      <div class="set-duo"><section class="panel" id="sec-picks" aria-labelledby="s-picks"></section><section class="panel" id="sec-hist" aria-labelledby="s-hist"></section></div>
      <section class="panel rm-panel" id="sec-reminders" aria-labelledby="s-reminders"></section>`;
  }
  /** Called once the page is drawn. */
  function mount() {
    ST.editing = false;
    drawPlans();
    drawPicks();
    drawHistory();
    drawReminders();
    const rem = document.getElementById('sec-reminders');
    if (rem) wireReminders(rem);
    loadHistory();
  }

  /* ---- the raw data editor (Advanced tab) ------------------------------------------------------------ */

  /** Parts of the record that live somewhere else now. */
  const BLOCKED = ['package', 'billing.plan', 'metrics', 'updates'];
  /** @param {any} o @param {string} path */
  const getPath = (o, path) => path.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);
  /** Sets (or removes, for undefined) one value inside a copy of the record. @param {any} o @param {string} path @param {any} val */
  function setPath(o, path, val) {
    const keys = path.split('.');
    let at = o;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!at[keys[i]] || typeof at[keys[i]] !== 'object') { if (val === undefined) return; at[keys[i]] = {}; }
      at = at[keys[i]];
    }
    if (val === undefined) delete at[keys[keys.length - 1]]; else at[keys[keys.length - 1]] = val;
  }
  /** Deep equality, ignoring the order of an object's keys. @param {any} a @param {any} b @returns {boolean} */
  function same(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && same(a[k], b[k]));
  }
  /** Every changed value, by its path (an array or a value is one change; an object is compared key by key). @param {any} a @param {any} b @param {string} base @returns {{path: string, before: any, after: any}[]} */
  function diff(a, b, base) {
    const isObj = (/** @type {any} */ v) => v && typeof v === 'object' && !Array.isArray(v);
    if (!isObj(a) || !isObj(b)) return same(a, b) ? [] : [{ path: base, before: a, after: b }];
    /** @type {{path: string, before: any, after: any}[]} */ const out = [];
    for (const k of Array.from(new Set([...Object.keys(a), ...Object.keys(b)]))) {
      const path = base ? `${base}.${k}` : k;
      if (!(k in a)) out.push({ path, before: undefined, after: b[k] });
      else if (!(k in b)) out.push({ path, before: a[k], after: undefined });
      else out.push(...diff(a[k], b[k], path));
    }
    return out;
  }
  /** A value short enough for the history. @param {any} v */
  function shorten(v) { const s = v === undefined ? '(not there)' : typeof v === 'string' ? v : JSON.stringify(v); return s.length > 120 ? `${s.slice(0, 117)}...` : s; }

  /** The raw data editor: the record as JSON, with the parts that moved blocked, a confirm before saving and a diff in the history. @param {HTMLElement} box @param {boolean} open */
  function raw(box, open) {
    const cur = D().current;
    box.innerHTML = `<details class="panel fold-panel" id="sec-raw"${open ? ' open' : ''}><summary class="fold-sum"><h2>Raw data</h2><span class="meta">Everything their portal reads, in code form. Only change it if an owner asks you to.</span></summary>
      <form id="rec-form" novalidate>
      <textarea class="code" name="doc" spellcheck="false" aria-label="Client record as JSON" aria-describedby="rec-block rec-err">${esc(JSON.stringify(cur.doc, null, 2))}</textarea>
      <p class="field-error" id="rec-err" hidden></p>
      <div class="raw-block" id="rec-block" role="status" hidden></div>
      <div class="actions"><button class="btn" type="submit">Save raw data</button><button class="btn btn-quiet" type="button" data-action="copy-record">Copy</button><span class="meta">Numbers must be real. Never type a number that did not come from a source. The package, the plan, metrics and updates are read-only here.</span></div>
      </form></details>`;
    const f = /** @type {HTMLFormElement} */ ($('#rec-form', box));
    const ta = /** @type {HTMLTextAreaElement} */ (f.elements.namedItem('doc'));
    const save = /** @type {HTMLButtonElement} */ ($('button[type=submit]', f));
    const err = $('#rec-err', box);
    const block = $('#rec-block', box);
    D().track(f, 'Raw data');
    $('[data-action="copy-record"]', box).addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(ta.value); D().toast('Copied.'); } catch (x) { D().toast('Could not copy. Select the text and copy it instead.', true); }
    });
    /** The record in the box, or null when it is not a JSON object yet. */
    const parsed = () => { try { const v = JSON.parse(ta.value); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch (x) { return null; } };
    /** Shows which moved parts were touched and holds the Save button back for them; the rest of the record stays editable. */
    const gate = () => {
      const next = parsed();
      const hit = next ? BLOCKED.filter((k) => !same(getPath(cur.doc, k), getPath(next, k))) : [];
      if (!hit.length) { block.hidden = true; block.innerHTML = ''; save.disabled = false; return hit; }
      block.hidden = false;
      const plan = hit.some((k) => k === 'package' || k === 'billing.plan');
      const results = hit.some((k) => k === 'metrics' || k === 'updates');
      block.innerHTML = `<strong>This now lives in Billing / Results.</strong> <span>You changed ${hit.map((k) => `<code>${esc(k)}</code>`).join(', ')}. ${plan ? `Change the plan in <a href="#/billing/${esc(cur.id)}">Billing</a>. ` : ''}${results ? 'Results and updates are added from the client\'s other pages. ' : ''}The rest of this record can still be saved.</span> <button class="btn btn-quiet btn-sm" type="button" data-raw-undo>Put ${hit.length === 1 ? 'it' : 'them'} back</button>`;
      save.disabled = true;
      return hit;
    };
    let timer = 0;
    f.addEventListener('input', () => { window.clearTimeout(timer); timer = window.setTimeout(gate, 200); });
    block.addEventListener('click', (e) => {
      if (!(/** @type {HTMLElement} */ (e.target)).closest('[data-raw-undo]')) return;
      const next = parsed();
      if (!next) return;
      for (const k of BLOCKED) {
        const was = getPath(cur.doc, k);
        if (!same(was, getPath(next, k))) setPath(next, k, was === undefined ? undefined : JSON.parse(JSON.stringify(was)));
      }
      ta.value = JSON.stringify(next, null, 2);
      gate();
      ta.focus();
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      /** @type {any} */ let doc;
      try {
        doc = JSON.parse(ta.value);
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('The record must be one JSON object.');
      } catch (x) {
        err.textContent = `That isn't valid: ${D().message(x)}`;
        err.hidden = false;
        return;
      }
      // The Save in the unsaved-changes bar skips the disabled button, so the check is made here too.
      if (gate().length) { block.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
      const changes = diff(cur.doc, doc, '');
      if (!changes.length) { D().toast('Nothing has changed.'); D().clean(f); return; }
      const names = changes.map((c) => c.path);
      if (!await D().ask('Save these changes to the raw data?', `${plural(changes.length, 'value')} ${changes.length === 1 ? 'changes' : 'change'}: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}. ${cur.name}'s portal reads this record, so what you save is what they see. The change is written to their history.`, 'Save raw data')) return;
      const done = D().busy(save, 'Saving');
      try {
        await D().save({ doc });
        D().clean(f);
      } catch (x) {
        done();
        D().toast(D().message(x), true);
        return;
      }
      // The save went through. The history line is a second write: if it fails, say so, because the edit is not in the history.
      let note = '';
      try {
        const db = await D().db();
        const res = await db.rpc('record_raw_edit', { p_tenant: cur.id, p_detail: { keys: names.slice(0, 60), count: changes.length, changes: changes.slice(0, 20).map((c) => ({ path: c.path, before: shorten(c.before), after: shorten(c.after) })) } });
        if (res.error) note = /PGRST202|42883|could not find/i.test(`${res.error.code} ${res.error.message}`) ? 'The history line could not be written: the history function is not on this database yet.' : `The history line could not be written (${res.error.message}).`;
      } catch (x) { note = 'The history line could not be written.'; }
      D().toast(note ? `Raw data saved. ${note}` : 'Raw data saved.', !!note);
      D().afterSave(done);
    });
    gate();
  }

  /* ---- what console.js calls ------------------------------------------------------------------------ */

  W.D8C_EXT = W.D8C_EXT || {};
  W.D8C_EXT.settings = { top, sections, mount, hermes: hermesHtml, raw, redrawPlans: drawPlans };
})();
