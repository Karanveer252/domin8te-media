// @ts-check
/*
 * Clients, the plan release's part (2026-10-13): the list with each client's plan, picks, this month's usage bars, what needs
 * the team, status and freshness; the Domin8te place and capacity cards; the plan and over-limit filters; and the plan and
 * sign-off panel on a client's Setup tab. console.js (clientsPage, renderClients, setupTab, the About line) calls into
 * window.D8C_EXT.clients; this file reads helpers from window.D8C.
 *
 * Reads: tenants, plans, tenant_plan_cycles, tenant_usage_current, billing_reminders, dashboard_exceptions (through D8C).
 * Writes nothing: the plan is changed in Billing (#/billing/<client id>), never here.
 */
(function () {
  'use strict';
  /** @type {any} */ const W = window;
  const EXT = (W.D8C_EXT = W.D8C_EXT || {});
  /** @returns {any} */
  const C = () => W.D8C;
  /** @param {any} s */
  const esc = (s) => C().esc(s);

  /** "About 3 restaurants at a time": a planning hint shown on the page. Nothing in the console or the database enforces it. */
  const CAPACITY_HINT = 3;
  const SERVICE_ORDER = ['advertising', 'social', 'website', 'local', 'email'];
  /** How each limit is named in a usage bar. A presentation map only: the numbers always come from the database. @type {Record<string, string>} */
  const BAR_NAME = {
    social_posts: 'Social posts', social_reels: 'Reels', social_stories: 'Stories', ads_live_campaigns: 'Ads live', ads_new_creatives: 'New ad designs', ads_platforms: 'Ad platforms',
    web_pages: 'Web pages', web_edits: 'Web edits', seo_google_posts: 'Google posts', seo_photos: 'Local photos', seo_review_replies: 'Review replies', seo_jobs: 'SEO jobs',
    email_campaigns: 'Email campaigns', email_automations: 'Automations'
  };
  /** @type {Record<string, string>} */
  const SENTENCE_NAME = { social_posts: 'posts', social_reels: 'Reels', social_stories: 'Stories', ads_live_campaigns: 'live campaigns', web_pages: 'new pages', web_edits: 'website edits', seo_jobs: 'SEO jobs' };
  /** The most bars one client shows; the rest are one line away on its page. */
  const MAX_BARS = 6;

  /** @param {string} id */
  function svcName(id) { const s = (C().plans.services || []).find((/** @type {any} */ x) => x.id === id); return s ? s.label : C().svcLabel(id); }
  /** The short names in "Social + Ads". @type {Record<string, string>} */
  const SHORT = { advertising: 'Ads', social: 'Social', website: 'Website', local: 'SEO and Google Maps', email: 'Email' };
  /** @param {string} iso */
  const dayText = (iso) => (iso ? C().longDate(iso) : '');
  /** @param {string} iso @param {number} n */
  function addDays(iso, n) { const d = new Date(`${String(iso).slice(0, 10)}T00:00`); d.setDate(d.getDate() + n); return C().localDay(d); }
  /** @param {string} iso */
  function daysTo(iso) { return Math.round((new Date(`${String(iso).slice(0, 10)}T00:00`).getTime() - new Date(`${C().today()}T00:00`).getTime()) / 86400000); }

  /** The services of one plan month, in catalog order: "Social + Ads", "All services", "Ads + Website (2 edits)". @param {any} cycle */
  function picksLine(cycle) {
    if (!cycle) return '';
    if (cycle.plan_id === 'domin8te') return 'All services';
    const list = SERVICE_ORDER.filter((s) => (cycle.picks || []).includes(s)).map((s) => SHORT[s] || svcName(s));
    const opt = cycle.plan_id === 'starter' && (cycle.picks || []).includes('website') ? cycle.website_option : '';
    const text = list.join(' + ');
    return opt ? text.replace('Website', `Website (${opt === 'page' ? '1 page' : '2 edits'})`) : text;
  }

  /** "13 Oct, 8:54 PM": a moment on this computer's clock, without the zone (the page's own line gives it). @param {string|number} t */
  function shortStamp(t) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }

  /** The tenants that hold the one place of a capped plan (a paused client keeps it; only archiving frees it). @param {any} plan */
  function holdersOf(plan) {
    const c = C();
    const ids = new Set(c.plans.cycles.filter((/** @type {any} */ k) => k.plan_id === plan.id && k.state !== 'ended').map((/** @type {any} */ k) => k.tenant_id));
    return c.all.tenants.filter((/** @type {any} */ t) => ids.has(t.id) && t.status !== 'archived');
  }

  /** Everything the list shows about one client, worked out once. @param {any} t */
  function rowOf(t) {
    const c = C();
    const pl = c.planOf(t.id);
    const d = c.derive(t);
    const list = ((c.all.reviews && c.all.reviews.exceptions) || []).filter((/** @type {any} */ x) => x.tenant_id === t.id);
    const lines = pl.lines;
    const ratio = (/** @type {any} */ l) => l.used / l.cap;
    // The bars: the tightest limit of each service, then any other limit that is at 85 percent or more.
    /** @type {any[]} */ const bars = [];
    for (const s of SERVICE_ORDER) {
      const mine = lines.filter((/** @type {any} */ l) => l.service === s);
      if (mine.length) bars.push(mine.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => ratio(b) - ratio(a))[0]);
    }
    for (const l of lines.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => ratio(b) - ratio(a))) if (ratio(l) >= 0.85 && !bars.includes(l)) bars.push(l);
    bars.sort((/** @type {any} */ a, /** @type {any} */ b) => SERVICE_ORDER.indexOf(a.service) - SERVICE_ORDER.indexOf(b.service) || ratio(b) - ratio(a));
    const over = lines.filter((/** @type {any} */ l) => l.used > l.cap);
    const asks = list.filter((/** @type {any} */ x) => x.reason_code === 'over_cap' || x.reason_code === 'over_cap_request');
    const near = lines.some((/** @type {any} */ l) => l.pct >= 85);
    const unverified = list.some((/** @type {any} */ x) => x.reason_code === 'plan_mismatch' || x.reason_code === 'result_outlier');
    return { t, d, pl, lines, bars, over, asks, near, unverified, top: lines.reduce((/** @type {number} */ m, /** @type {any} */ l) => Math.max(m, ratio(l)), 0) };
  }

  /** @param {any} r a row of rowOf */
  function matches(r, st) {
    const q = String(st.q || '').trim().toLowerCase();
    if (q) {
      const hay = `${r.t.name} ${r.t.doc.business.kind || ''} ${r.pl.nowPlan ? r.pl.nowPlan.name : ''} ${picksLine(r.pl.now)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    switch (st.filter) {
      case 'needs': return r.t.status !== 'archived' && r.d.needs.length > 0;
      case 'inactive': return r.t.status !== 'active';
      case 'over': return r.t.status !== 'archived' && (r.over.length > 0 || r.asks.length > 0);
      case 'near': return r.t.status !== 'archived' && r.near;
      case 'all': return true;
      default: return !!(r.pl.nowPlan && r.pl.nowPlan.id === st.filter);
    }
  }

  /** The headline of a client's status, in words, with a line under it when there is one to say. @param {any} r */
  function statusOf(r) {
    const t = r.t;
    /** @type {{tone: string, text: string, sub?: string}[]} */ const out = [];
    if (t.status === 'archived') return [{ tone: '', text: 'Archived' }];
    if (t.status === 'paused') out.push({ tone: 'warn', text: 'Paused', sub: r.pl.nowPlan && r.pl.nowPlan.max_clients ? 'Keeps its Domin8te place' : 'Work and billing are on hold' });
    if (r.over.length) {
      const l = r.over[0];
      out.push({ tone: 'bad', text: `${BAR_NAME[l.metric] || l.label} over by ${l.used - l.cap}` });
    } else if (r.asks.length) {
      const x = r.asks[0];
      const v = x.last_verified_value || {};
      const what = v.asked && v.metric ? `Asked for ${v.asked} extra ${SENTENCE_NAME[v.metric] || String(v.metric).replace(/_/g, ' ')}` : '';
      out.push({ tone: 'bad', text: 'Over-limit request', sub: what });
    } else if (r.lines.some((/** @type {any} */ l) => l.used >= l.cap)) {
      const l = r.lines.find((/** @type {any} */ x) => x.used >= x.cap);
      out.push({ tone: 'warn', text: 'At the limit', sub: `${BAR_NAME[l.metric] || l.label} ${l.used}/${l.cap}` });
    } else if (r.near) {
      const l = r.lines.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => b.used / b.cap - a.used / a.cap)[0];
      out.push({ tone: 'warn', text: 'Near limit', sub: `${BAR_NAME[l.metric] || l.label} ${l.used}/${l.cap}` });
    } else if (!r.pl.now) {
      out.push({ tone: 'warn', text: 'No plan set' });
    } else if (t.status === 'active') {
      out.push({ tone: 'good', text: 'Within limits' });
    }
    return out;
  }

  /** The line under the client's name: what is next for its plan, else what it is. @param {any} r */
  function noteOf(r) {
    const c = C();
    const { t, pl } = r;
    const lines = [];
    if (pl.now && pl.next && pl.next.source === 'auto_carry' && pl.next.state !== 'ended') {
      const left = daysTo(addDays(pl.next.period_start, -1)) + 1;
      lines.push(left > 0 ? `Picks not confirmed, ${c.plural(left, 'day')} left` : 'Picks not confirmed, the deadline has passed');
    } else if (pl.now && pl.next && (pl.next.plan_id !== pl.now.plan_id || picksLine(pl.next) !== picksLine(pl.now))) {
      lines.push(`Next: ${picksLine(pl.next)} from ${c.when(pl.next.period_start)}`);
    }
    if (pl.nowPlan && pl.nowPlan.max_clients && t.status !== 'archived') lines.push(t.status === 'paused' ? 'Holds the Domin8te place while paused' : 'Holds the Domin8te place');
    if (!lines.length && t.doc.business.kind) lines.push(String(t.doc.business.kind));
    return lines.slice(0, 2);
  }

  /** @param {any} r @param {{sort: string, dir: string}} st */
  function sortKey(r, st) {
    switch (st.sort) {
      case 'plan': return r.pl.nowPlan ? r.pl.nowPlan.sort : 99;
      case 'usage': return r.top;
      case 'needs': return r.d.needs.length;
      default: return 0;
    }
  }

  /** @param {any} st the list's state (q, filter, sort, dir) */
  function counts(st) {
    void st;
    const rows = C().all.tenants.map(rowOf);
    /** @type {Record<string, number>} */ const n = { all: rows.length, over: 0, near: 0, needs: 0, inactive: 0 };
    for (const p of C().plans.plans) n[p.id] = 0;
    for (const r of rows) {
      if (r.pl.nowPlan && n[r.pl.nowPlan.id] !== undefined) n[r.pl.nowPlan.id]++;
      if (matches(r, { filter: 'over' })) n.over++;
      if (matches(r, { filter: 'near' })) n.near++;
      if (matches(r, { filter: 'needs' })) n.needs++;
      if (matches(r, { filter: 'inactive' })) n.inactive++;
    }
    return { n, rows };
  }

  /** The three cards above the list. @param {any[]} rows */
  function cardsHtml(rows) {
    const c = C();
    const plans = c.plans.plans;
    const capped = plans.find((/** @type {any} */ p) => p.max_clients) || null;
    const holders = capped ? holdersOf(capped) : [];
    const max = capped ? Number(capped.max_clients) : 0;
    const placeCard = capped
      ? `<div class="cl-card"><span class="cl-dot ${holders.length >= max ? 'is-taken' : 'is-free'}" aria-hidden="true"></span><div><p class="cl-card-t">${esc(capped.name)} place: ${holders.length} of ${max} taken</p>
        <p class="cl-card-s">${holders.length ? `${esc(holders.map((/** @type {any} */ t) => t.name).join(', '))} holds it. Paused clients keep their place; only archiving frees it.` : `Free. A ${esc(capped.name)} sign-up can go ahead.`}</p></div></div>`
      : '';
    const active = rows.filter((r) => r.t.status === 'active').length;
    const capCard = `<div class="cl-card"><span class="cl-dot is-hint" aria-hidden="true"></span><div><p class="cl-card-t">Room for about ${CAPACITY_HINT} restaurants at a time</p>
      <p class="cl-card-s">${active} active now${active > CAPACITY_HINT ? ', over the hint' : ''}. A planning hint only: nothing is blocked.</p></div></div>`;
    const warn = rows.filter((r) => r.t.status !== 'archived' && (r.over.length || r.asks.length));
    const names = warn.map((r) => `${r.t.name} ${r.over.length ? (BAR_NAME[r.over[0].metric] || r.over[0].label).toLowerCase() : 'request'}`);
    const warnCard = `<button class="cl-card cl-card-go" type="button" data-cl-go="${warn.length ? 'over' : 'all'}"><span class="cl-dot ${warn.length ? 'is-over' : 'is-free'}" aria-hidden="true"></span><div><p class="cl-card-t">${warn.length ? `${c.plural(warn.length, 'over-limit warning')}` : 'No over-limit warnings'}</p>
      <p class="cl-card-s">${warn.length ? esc(names.slice(0, 3).join(' · ')) : 'Every client is within this month\'s limits.'}</p></div></button>`;
    return `<div class="cl-cards">${placeCard}${capCard}${warnCard}</div>`;
  }

  /** The page's top: title, freshness line, the three cards, the search and the filter chips. @param {any} st @param {boolean} canAdd */
  function head(st, canAdd) {
    const c = C();
    const { n, rows } = counts(st);
    const loaded = c.plans.ok;
    const unverified = rows.filter((r) => r.unverified).length;
    const fresh = c.pageFresh({
      updatedAt: c.plans.at || c.all.at,
      source: 'plan rows and this month\'s usage counts in the console',
      status: !loaded ? 'delayed' : unverified ? 'kept' : 'ok',
      label: !loaded ? 'Plan data did not load' : unverified ? `${unverified} unverified` : 'Up to date',
      note: !loaded ? 'The plan tables could not be read, so plans and usage are blank here. Reload to try again.' : unverified ? 'A restaurant with an open plan or result check keeps seeing its last verified values until you resolve it in Needs you.' : ''
    });
    const planChips = c.plans.plans.map((/** @type {any} */ p) => [p.id, p.name]);
    const main6 = [['all', 'All'], ...planChips, ['over', 'Over limit'], ['near', 'Near limit (85%+)']];
    const more2 = [['needs', 'Needs you'], ['inactive', 'Paused or archived']];
    const chip = (/** @type {string[]} */ [k, l]) => `<button type="button" data-filter="${esc(k)}" aria-pressed="${st.filter === k}">${esc(l)}<span class="count quiet">${n[k] === undefined ? 0 : n[k]}</span></button>`;
    return `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Clients</h1><p>Every restaurant's plan, picks and how much of this month's limits they have used. The limits come from the plan.</p></div>
      <div class="btns">${canAdd ? `<a class="btn" href="#/new">${c.icon('plus')}Add a client</a>` : ''}</div></div>
      ${fresh}
      ${cardsHtml(rows)}
      <div class="cl-chips"><div class="seg" id="list-filter" role="group" aria-label="Show">${main6.map(chip).join('')}</div></div>
      <div class="toolbar cl-toolbar"><input id="list-q" type="search" placeholder="Search by name, kind, plan or picks" aria-label="Search clients" value="${esc(st.q)}" autocomplete="off">
        <div class="seg cl-more" role="group" aria-label="Also show">${more2.map(chip).join('')}</div></div>`;
  }

  /** The list itself, or what to say when it is empty. @param {any} st */
  function table(st) {
    const c = C();
    const all = c.all.tenants;
    let rows = all.map(rowOf).filter((/** @type {any} */ r) => matches(r, st));
    const dir = st.dir === 'asc' ? 1 : -1;
    rows.sort((/** @type {any} */ a, /** @type {any} */ b) => {
      if (st.sort === 'name') return dir * a.t.name.localeCompare(b.t.name);
      return dir * (sortKey(a, st) - sortKey(b, st)) || a.t.name.localeCompare(b.t.name);
    });
    const th = (/** @type {string} */ k, /** @type {string} */ label) => `<th scope="col"${st.sort === k ? ` aria-sort="${st.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${k}">${label}${st.sort === k ? c.icon('sort') : ''}</button></th>`;
    if (!rows.length) {
      return all.length
        ? '<div class="empty"><p><strong>No client matches.</strong></p><p>Try another name or a different filter.</p></div>'
        : `<div class="empty"><p><strong>No clients yet.</strong></p><p>Add your first restaurant, then give them a login.</p>${c.me && c.me.role === 'super_admin' ? '<a class="btn" href="#/new">Add a client</a>' : ''}</div>`;
    }
    const fmt = (/** @type {any} */ r) => {
      const t = r.t;
      const pl = r.pl;
      const status = statusOf(r);
      const notes = noteOf(r);
      const period = pl.now ? `${c.when(pl.now.period_start)} to ${c.when(addDays(pl.now.period_end, -1))}` : '';
      const needsCell = r.d.needs.length
        ? `<div class="cl-needs"><span class="chip you">${r.d.needs.length}</span><span class="cl-sub">${esc(r.d.needs[0].label)}${r.d.needs.length > 1 ? ` + ${r.d.needs.length - 1} more` : ''}</span></div>`
        : '<span class="none">Nothing</span>';
      const waiting = r.d.waiting.length ? `<div class="cl-needs cl-wait"><span class="chip them">${r.d.waiting.length}</span><span class="cl-sub">Waiting on client</span></div>` : '';
      const bars = r.bars.slice(0, MAX_BARS).map((/** @type {any} */ l) => c.usageBar({ label: BAR_NAME[l.metric] || l.label, used: l.used, cap: l.cap, pct: l.pct, tone: l.tone })).join('');
      const more = r.lines.length - Math.min(r.bars.length, MAX_BARS);
      const stamp = c.plans.at || c.all.at;
      const check = !pl.now ? '<span class="chip plain">No plan</span>' : r.unverified ? '<span class="chip warn">Unverified</span>' : '<span class="chip good">Verified</span>';
      return `<tr data-href="#/client/${esc(t.id)}/overview"${t.status !== 'active' ? ' class="paused"' : ''}>
        <td data-label="Client"><a class="row-link" href="#/client/${esc(t.id)}/overview">${esc(t.name)}</a>${notes.map((x) => `<span class="sub">${esc(x)}</span>`).join('')}${t.clerk_org_id ? '' : '<span class="row-chips"><span class="chip warn">No login yet</span></span>'}</td>
        <td data-label="Plan"><div class="cl-v">${pl.nowPlan ? `<strong class="cl-plan-name">${esc(pl.nowPlan.name)}</strong>` : `<a class="chip warn chip-link" href="#/billing/${esc(t.id)}" title="Set their plan and picks in Billing">No plan set</a>`}</div></td>
        <td data-label="Picks this cycle"><div class="cl-v">${pl.now ? esc(picksLine(pl.now)) : '<span class="none">Not set</span>'}</div></td>
        <td data-label="Usage this month" class="cl-usage-cell"><div class="cl-v">${bars ? `<div class="cl-usage">${bars}</div>${more > 0 ? `<span class="cl-sub">and ${c.plural(more, 'more limit')} on their page</span>` : ''}` : '<span class="none">No limits yet</span>'}${period ? `<span class="cl-month">${esc(period)}</span>` : ''}</div></td>
        <td data-label="Needs you"><div class="cl-v">${needsCell}${waiting}</div></td>
        <td data-label="Status"><div class="cl-v"><div class="cl-status">${status.map((s) => `<div><span class="chip ${s.tone}">${esc(s.text)}</span>${s.sub ? `<span class="cl-sub">${esc(s.sub)}</span>` : ''}</div>`).join('')}</div></div></td>
        <td data-label="Freshness" class="cl-fresh"><div class="cl-v"><span class="cl-sub">Updated ${esc(shortStamp(stamp))}</span><span class="cl-sub">Source: console</span>${check}</div></td></tr>`;
    };
    return `<div class="table-wrap cl-table"><table class="grid"><thead><tr>
        ${th('name', 'Client')}${th('plan', 'Plan')}<th scope="col">Picks this cycle</th>${th('usage', 'Usage this month')}${th('needs', 'Needs you')}<th scope="col">Status</th><th scope="col">Freshness</th>
      </tr></thead><tbody>${rows.map(fmt).join('')}</tbody></table></div>
      <p class="meta cl-foot">${c.plural(rows.length, 'client')}${rows.length !== all.length ? ` of ${all.length}` : ''}. Click a column name to sort. A bar turns amber from 85 percent of a limit and red at the limit.</p>`;
  }

  /** The plan a client has this month, for the About line and the Setup tab; empty when none is set. @param {string} id */
  function planNameOf(id) { const p = C().planOf(id); return p.nowPlan ? p.nowPlan.name : ''; }

  /** The plan and the picks of this month and next, read from the plan months (never typed here), and the way to change them. @param {string} id */
  function planPanel(id) {
    const c = C();
    const pl = c.planOf(id);
    const t = c.tenant(id);
    const sourceText = (/** @type {any} */ k) => ({ auto_carry: 'Carried over, not confirmed', client_picker: 'Chosen by the client', console: 'Set by us', migration: 'Set when plans began' })[/** @type {'console'} */ (k.source)] || '';
    /** @param {string} title @param {any} cycle @param {any} plan */
    const block = (title, cycle, plan) => cycle && plan
      ? `<div class="cl-plan-card"><p class="cl-plan-k">${esc(title)}</p><p class="cl-plan-v">${esc(plan.name)}</p><p class="cl-plan-s">${esc(picksLine(cycle) || 'No services')}</p>
          <p class="cl-plan-d">${esc(c.when(cycle.period_start))} to ${esc(c.when(addDays(cycle.period_end, -1)))}${cycle.state === 'active' ? '' : ', not started yet'}</p>
          ${sourceText(cycle) ? `<p class="cl-plan-src"><span class="chip ${cycle.source === 'auto_carry' ? 'warn' : 'plain'}">${esc(sourceText(cycle))}</span></p>` : ''}</div>`
      : `<div class="cl-plan-card is-empty"><p class="cl-plan-k">${esc(title)}</p><p class="cl-plan-v">Not set</p><p class="cl-plan-s">${title === 'Next month' ? 'No plan month is planned yet.' : 'This client has no plan yet.'}</p></div>`;
    return `<div class="cl-plan">
      ${block('This month', pl.now, pl.nowPlan)}
      ${block('Next month', pl.next, pl.nextPlan)}
    </div>
    <p class="cl-plan-link"><a class="btn btn-quiet btn-sm" href="#/billing/${esc(id)}">Change plan and picks in Billing</a><span class="meta">${t && t.status === 'paused' ? 'Paused: a Domin8te place stays held until the client is archived. ' : ''}Picks lock when the billing month starts; changes apply from next month.</span></p>`;
  }

  EXT.clients = { head, table, planPanel, planNameOf, picksLine, holdersOf, CAPACITY_HINT };
})();
