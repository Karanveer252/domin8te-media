/*
 * All work and each client's cards (C3, 2026-10-13): the usage strip, where a card lands against its limit, "Count this as" when a
 * card moves to Done, cards over a limit (flagged, blocked until Needs you decides), who sees a card, and removing a card with a reason.
 *
 * console.js calls this from the board functions it owns (moveTask, card, boardColumns, board, editCard, allBoardPage, deleteCard,
 * wireBoard). Everything here reads the console through window.D8C, which exists only after console.js has run, so each helper asks
 * for it when it is called, never when this file loads. Database: usage_events, set_task_visibility, soft_delete_task, report_exception
 * (migrations 20261013010200, 20261013010400, 20261013010500), set_live_count (20261014140000). Nothing is ever deleted: a count that was a mistake is voided with a reason.
 */
(function () {
  'use strict';
  /** @type {any} */
  const EXT = ((/** @type {any} */ (window)).D8C_EXT = (/** @type {any} */ (window)).D8C_EXT || {});
  /** @returns {any} */
  const C = () => /** @type {any} */ (window).D8C;
  /** @param {any} s */
  const E = (s) => C().esc(s);

  /* ---- words ------------------------------------------------------------------------------------------------------------ */

  const OPEN = ['todo', 'in_progress', 'in_review', 'blocked'];
  /** Where an open card stands in the queue for the month's count: work already started comes before work not started. */
  const RANK = /** @type {Record<string, number>} */ ({ in_progress: 0, in_review: 1, blocked: 2, todo: 3 });
  /** The limit each service's work counts against when the card does not say. */
  const DEFAULT_METRIC = /** @type {Record<string, string>} */ ({ social: 'social_posts', advertising: 'ads_new_creatives', website: 'web_edits', local: 'seo_jobs', email: 'email_campaigns' });
  /** "Live at a time" limits (app.is_snapshot_metric, 20261014110100): a row says how many are live now; it is not added to the others and carries into the next month. */
  const LIVE = new Set(['ads_live_campaigns', 'ads_platforms']);
  /** The usage columns staff read (the notes and who-did-it columns are not readable through the API: 20261014110000). */
  const USAGE_COLS = 'id, tenant_id, cycle_id, service, metric, qty, counted, task_id, request_id, over_cap_approved_at, created_at, voided_at';
  /** A limit's name on a usage bar. */
  const NAME = /** @type {Record<string, string>} */ ({
    social_posts: 'Social posts', social_reels: 'Reels', social_stories: 'Stories', ads_live_campaigns: 'Live campaigns', ads_new_creatives: 'New ad designs', ads_platforms: 'Ad platforms',
    web_pages: 'New pages', web_edits: 'Web edits', seo_google_posts: 'Google posts', seo_photos: 'Photos', seo_review_replies: 'Review replies', seo_jobs: 'SEO jobs',
    email_campaigns: 'Email campaigns', email_automations: 'Automations'
  });
  /** Words in a card's title that say which limit it uses (the first match wins; otherwise the service's usual one). */
  const GUESS = /** @type {Record<string, [RegExp, string][]>} */ ({
    social: [[/\breels?\b/i, 'social_reels'], [/\bstor(y|ies)\b/i, 'social_stories']],
    advertising: [[/\bcampaigns?\b/i, 'ads_live_campaigns'], [/\bplatforms?\b/i, 'ads_platforms']],
    website: [[/\b(new|build|create|draft|design)\b.*\bpages?\b/i, 'web_pages']],
    local: [[/\bphotos?\b/i, 'seo_photos'], [/\breviews?\b/i, 'seo_review_replies'], [/\bposts?\b/i, 'seo_google_posts']],
    email: [[/\b(automations?|flows?)\b/i, 'email_automations']]
  });
  const EYE = '<svg class="ic" viewBox="0 0 24 24" role="img" aria-label="Client sees this card"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
  const EYE_OFF = '<svg class="ic" viewBox="0 0 24 24" role="img" aria-label="Hidden from the client"><path d="M3.5 3.5l17 17"/><path d="M9.9 5.8A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.2 3.9M6.3 7.7A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 4-.9"/><path d="M9.9 9.9a2.8 2.8 0 0 0 4.2 3.7"/></svg>';
  /** @param {string} s */
  const cap1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  /** "posts" to "post", "Stories" to "Story". @param {string} s */
  const singular = (s) => String(s || '').replace(/ies$/i, 'y').replace(/s$/i, '');
  /** Lower case at the start, except names that keep their capitals. @param {string} s */
  const lower = (s) => (/^(Google|SEO)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  /** A service in the words of a pick list ("Social + Ads"). @param {string} id */
  const shortService = (id) => (id === 'advertising' ? 'Ads' : id === 'social' ? 'Social' : ((C().plans.services || []).find((/** @type {any} */ s) => s.id === id) || {}).label || C().svcLabel(id));
  /** One limit's name for a bar. @param {any} l */
  const barName = (l) => NAME[l.metric] || cap1(l.label);
  /** Where a card lands: "Post 10 of 12", or "Would be posts 9 to 11 of 8" for several. @param {any} line @param {number} from @param {number} to */
  const landWords = (line, from, to) => (from === to ? `${cap1(singular(line.label))} ${to} of ${line.cap}` : `Would be ${lower(line.label)} ${from} to ${to} of ${line.cap}`);
  /** A live limit after a count: "Live campaigns 2 of 3 now". @param {any} line @param {number} n */
  const liveWords = (line, n) => `${barName(line)} ${n} of ${line.cap} now`;

  /* ---- reading what is used --------------------------------------------------------------------------------------------- */

  const store = { /** @type {any[]} */ usage: [], loadedAt: 0, /** @type {Promise<void>|null} */ loading: null, failed: '' };
  /** The cards' landing, worked out once for each client and kept for a moment so a board of cards does not repeat the sums. @type {Map<string, {at: number, map: Map<string, any>}>} */
  const memo = new Map();
  const forget = () => memo.clear();

  /**
   * Loads the month's usage rows (the cycles running now, nothing voided). Quiet on failure: cards then show without positions. Rows read in the last
   * few seconds are reused, except with `fresh`: counting a card always reads them again first, because Needs you may have counted it a moment ago.
   * @param {boolean} [fresh]
   */
  function ready(fresh) {
    if (store.loading) return fresh ? store.loading.then(() => ready(true)) : store.loading;
    if (!fresh && store.loadedAt && Date.now() - store.loadedAt < 3000) return Promise.resolve();
    store.loading = (async () => {
      const c = C();
      const ids = ((c.plans && c.plans.cycles) || []).filter((/** @type {any} */ x) => x.state === 'active').map((/** @type {any} */ x) => x.id);
      store.failed = '';
      if (!ids.length) { store.usage = []; store.loadedAt = Date.now(); return; }
      try {
        const db = await c.db();
        const res = await db.from('usage_events').select(USAGE_COLS).in('cycle_id', ids).is('voided_at', null);
        if (res.error) throw res.error;
        store.usage = res.data || [];
      } catch (e) { store.failed = String((e && /** @type {any} */ (e).message) || e); }
      store.loadedAt = Date.now();
      forget();
    })().finally(() => { store.loading = null; });
    return store.loading;
  }

  /** The open Needs you item that holds this card: over its limit, or for a service not in the plan. @param {any} t */
  function openException(t) {
    const list = (C().all.reviews && C().all.reviews.exceptions) || [];
    return list.find((/** @type {any} */ x) => x.status === 'open' && x.tenant_id === t.tenant_id && (
      (['over_cap', 'service_not_picked'].includes(x.reason_code) && x.entity_id === t.id) ||
      (['over_cap_request', 'service_not_picked'].includes(x.reason_code) && t.request_id && x.entity_id === t.request_id))) || null;
  }
  /** Usage rows that belong to a card (by the card, or by the request it came from). @param {any} t */
  const rowsOf = (t) => store.usage.filter((/** @type {any} */ u) => !u.voided_at && ((u.task_id && u.task_id === t.id) || (t.request_id && u.request_id === t.request_id)));

  /** How many a card counts for: a number at the start of its title ("3 extra Halloween posts"), else one. @param {any} t @param {any} ex */
  function qtyOf(t, ex) {
    const n = ex && ex.last_verified_value && Number(ex.last_verified_value.asked || ex.last_verified_value.qty);
    if (n > 0) return Math.min(100, n);
    const m = /^\s*(\d{1,3})\b/.exec(String(t.title || ''));
    return m ? Math.max(1, Math.min(100, Number(m[1]))) : 1;
  }
  /** The limit a card counts against, from its service and the words in its title. @param {any} t @param {any[]} lines this service's limits @param {any} [ex] */
  function lineOf(t, lines, ex) {
    const hint = ex && ex.last_verified_value && ex.last_verified_value.metric;
    const byHint = hint && lines.find((/** @type {any} */ l) => l.metric === hint);
    if (byHint) return byHint;
    for (const [re, metric] of GUESS[t.service] || []) {
      const l = lines.find((/** @type {any} */ x) => x.metric === metric);
      if (l && re.test(String(t.title || ''))) return l;
    }
    return lines.find((/** @type {any} */ l) => l.metric === DEFAULT_METRIC[t.service]) || lines[0];
  }
  /** Where a card sits in a client's queue: started work first, then by due date and the order on the board. @param {any} a @param {any} b */
  const queueOrder = (a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || String(a.due || '9999').localeCompare(String(b.due || '9999')) || (a.position - b.position) || String(a.created_at).localeCompare(String(b.created_at));

  /**
   * What each of one client's cards counts for. kind: counted (usage rows exist: where it landed), urgent (counted = false), uncounted (done, nothing recorded),
   * next (open: where it would land), notplan (a service this month's plan does not include). over: past the limit, or held in Needs you.
   * @param {string} tenantId @returns {Map<string, any>}
   */
  function compute(tenantId) {
    const c = C();
    const out = new Map();
    const p = c.planOf(tenantId);
    const live = !!(c.plans && c.plans.ok && p.now);
    const cards = (c.all.tasks || []).filter((/** @type {any} */ t) => t.tenant_id === tenantId && !t.deleted_at && t.status !== 'cancelled');
    const events = store.usage.filter((/** @type {any} */ u) => u.tenant_id === tenantId && !u.voided_at);
    /** @type {Record<string, number>} */ const running = {};
    /** @type {any[]} */ const open = [];
    for (const t of cards) {
      const mine = rowsOf(t);
      if (mine.length) {
        const first = mine.find((/** @type {any} */ u) => u.counted);
        if (!first) { out.set(t.id, { kind: 'urgent', over: false, rows: mine, text: 'Urgent fix, not counted' }); continue; }
        const line = p.lines.find((/** @type {any} */ l) => l.service === first.service && l.metric === first.metric);
        // the running total up to and including this row, in the order the rows were written
        const sameLimit = events.filter((/** @type {any} */ u) => u.counted && u.cycle_id === first.cycle_id && u.service === first.service && u.metric === first.metric).sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.created_at).localeCompare(String(b.created_at)));
        let to = 0;
        for (const u of sameLimit) { to += Number(u.qty); if (u.id === first.id) break; }
        const qty = Number(first.qty);
        out.set(t.id, { kind: 'counted', over: false, line, from: to - qty + 1, to, qty, rows: mine, oneOff: !!first.over_cap_approved_at,
          text: line ? `${LIVE.has(line.metric) ? liveWords(line, qty) : landWords(line, to - qty + 1, to)}${first.over_cap_approved_at ? ', one-off approved' : ''}` : 'Counted this month' });
        continue;
      }
      if (!live || !t.service) continue;
      if (t.status === 'done') { out.set(t.id, { kind: 'uncounted', over: false, text: 'Not counted yet' }); continue; }
      open.push(t);
    }
    for (const t of open.sort(queueOrder)) {
      const ex = openException(t);
      const lines = p.lines.filter((/** @type {any} */ l) => l.service === t.service);
      if (!lines.length) { out.set(t.id, { kind: 'notplan', over: true, ex, text: 'Not in this month’s plan' }); continue; }
      const line = lineOf(t, lines, ex);
      const qty = qtyOf(t, ex);
      const base = running[line.metric] !== undefined ? running[line.metric] : line.used;
      const from = base + 1;
      const to = base + qty;
      running[line.metric] = to;
      out.set(t.id, { kind: 'next', over: to > line.cap || !!ex, ex, line, qty, from, to, text: landWords(line, from, to) });
    }
    return out;
  }
  /** @param {string} tenantId */
  function infoMap(tenantId) {
    const hit = memo.get(tenantId);
    if (hit && Date.now() - hit.at < 80) return hit.map;
    const map = compute(tenantId);
    memo.set(tenantId, { at: Date.now(), map });
    return map;
  }
  /** What a card counts for, or null (a card with no service, a client with no plan running). @param {any} t */
  const infoFor = (t) => (t ? infoMap(t.tenant_id).get(t.id) || null : null);
  /** An open card that is over its limit (or held in Needs you): flagged, and kept from starting. @param {any} t */
  const flagged = (t) => { const i = infoFor(t); return !!(i && i.over && OPEN.includes(t.status)); };
  /** Whether a done card was finished in this plan month. @param {any} t */
  function thisMonth(t) {
    const p = C().planOf(t.tenant_id);
    const d = new Date();
    const start = p.now ? String(p.now.period_start) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    return String(t.updated_at || t.created_at || '').slice(0, 10) >= start;
  }

  /* ---- who sees a card ---------------------------------------------------------------------------------------------------- */

  /** Shown, hidden (decided) or undecided: a new card is hidden and undecided until staff say. @param {any} t */
  const visState = (t) => (t && t.visibility_decided_at ? (t.client_visible ? 'shown' : 'hidden') : 'undecided');
  /** Whether the client sees a card on their Work page: shown, with a service, not removed or cancelled. Other parts of the console use this too. @param {any} t */
  const clientSees = (t) => !!(t && t.client_visible && t.visibility_decided_at && !t.deleted_at && t.service && t.status !== 'cancelled');

  /* ---- a card on the board -------------------------------------------------------------------------------------------------- */

  /**
   * The new parts of a board card: its class, who and what service, where it lands, the over-limit flag and who sees it.
   * @param {any} t @param {string} [client] shown on the all-clients board
   */
  function cardView(t, client) {
    const i = infoFor(t);
    // the client's colour (mod-color.js): a left edge on the card, and the name as a tinted pill with a dot
    const K = EXT.color;
    const tint = K ? K.cls(t.tenant_id) : '';
    const over = !!(i && i.over && OPEN.includes(t.status));
    const svc = t.service ? C().svcLabel(t.service) : '';
    const tag = svc ? `<span class="wk-tag" title="${E(svc)}">${E(svc)}</span>` : '<span class="wk-tag is-plain">General</span>';
    // All work: the client's tag badge (neutral without a colour) and name; the badge spotlights the client. On the client's own Work tab the board
    // shows one client only, so the badge and name are not repeated on every card (2026-10-14).
    const who = client ? (K ? K.who(t.tenant_id, client, true) : `<span class="wk-client">${E(client)}</span>`) : '';
    const head = `<p class="card-client wk-who">${who}${tag}</p>`;
    let land = '';
    if (i && i.kind === 'counted') land = `<p class="wk-land is-done" title="Counted against ${E(i.line ? lower(i.line.label) : 'a limit')} this month">${E(i.text)}</p>`;
    else if (i && i.kind === 'urgent') land = `<p class="wk-land is-urgent">${E(i.text)}</p>`;
    else if (i && i.kind === 'uncounted' && thisMonth(t)) land = `<p class="wk-land is-none">${E(i.text)} <button class="linkish" type="button" data-wk-count="${E(t.id)}">Count it</button></p>`;
    else if (i && i.kind === 'next') land = `<p class="wk-land${over ? ' is-over' : ''}" title="Worked out from the card's service and title. You confirm what it counts as when you move it to Done.">${E(i.text)}</p>`;
    let flag = '';
    if (over && i) {
      const plan = i.kind === 'notplan';
      flag = `<p class="wk-flag" role="note"><span><strong>${plan ? 'Not in this month’s plan.' : 'Over limit.'}</strong> ${i.ex ? 'Waiting for a decision in Needs you.' : plan ? 'Needs your OK or a plan change before work starts.' : 'Needs your OK or an upgrade before work starts.'}</span>
        ${i.ex ? '<a class="wk-flag-a" href="#/queue">Open in Needs you</a>' : `<button class="wk-flag-a linkish" type="button" data-wk-ask="${E(t.id)}">Ask for an OK</button>`}</p>`;
    }
    const v = visState(t);
    const vis = t.service && t.status !== 'cancelled'
      ? v === 'undecided' ? '<span class="chip warn" title="Hidden from the client until you decide">Needs a decision</span>'
        : v === 'shown' ? `<span class="wk-vis is-on" title="Client sees this card: its title, stage and due date on their Work page">${EYE}</span>`
          : v === 'hidden' ? `<span class="wk-vis" title="Hidden from the client">${EYE_OFF}</span>` : ''
      : '';
    return { cls: (over ? ' is-over' : '') + tint, head, land, flag, vis };
  }
  /** The tooltip line about who sees a card. @param {any} t */
  function seeText(t) {
    const v = visState(t);
    if (!t.service) return 'Never shown to the client (no service)';
    return v === 'shown' ? 'Client can see' : v === 'hidden' ? 'Team only' : 'Hidden, not decided yet';
  }

  /** Whether a move is refused: an over-limit card may go back to To do or Blocked, never forward. Returns the words, or ''. @param {any} t @param {string} status */
  function moveBlock(t, status) {
    if (!t || ['todo', 'blocked', 'cancelled'].includes(status) || !OPEN.includes(t.status)) return '';
    const i = infoFor(t);
    if (!(i && i.over)) return '';
    return i.ex ? `“${t.title}” is waiting in Needs you. It can start once that is decided.` : `“${t.title}” is over its limit. Press Ask for an OK on the card, and it can start once that is decided.`;
  }

  /* ---- errors in plain words --------------------------------------------------------------------------------------------- */

  /** @param {any} err the database's error (code, message) @returns {Error} */
  function explain(err) {
    const said = String((err && err.message) || '');
    const code = String((err && err.code) || '');
    /** @param {string} text @param {string} [kind] */
    const make = (text, kind) => Object.assign(new Error(text), { code: kind || code });
    if (/reason-required/.test(said)) return make('Say why first.');
    if (/not-found/.test(said) || code === 'P0002') return make('That card was already changed or removed. Reload the page to see it.');
    if (/card-removed/.test(said)) return make('That card was removed, and its history is kept. It cannot be changed.');
    if (/use-set-task-visibility|use-soft-delete-task/.test(said)) return make('That change has to go through the card’s own buttons. Nothing was saved.');
    if (/not-staff/.test(said) || code === '42501' || code === 'PGRST301') return make('Your sign-in is not on the Domin8te team. Sign out and in again, then try once more.');
    if (/usage-is-append-only/.test(said)) return make('A count can only be voided, with a reason. Nothing was changed.');
    return make(said || 'That did not work. Nothing was saved.');
  }
  /** @param {any} res a database answer @returns {any} */
  function ok(res) { if (res && res.error) throw explain(res.error); return res ? res.data : null; }

  /* ---- dialogs ------------------------------------------------------------------------------------------------------------- */

  /**
   * One dialog at a time, in the console's own look. `setup(dialog, close)` wires it; the promise resolves with what close() was given
   * (null when it was dismissed).
   * @param {string} html @param {(dlg: HTMLDialogElement, close: (v: any) => void) => void} setup @param {string} [label]
   */
  function modal(html, setup, label) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'wk-dlg';
      if (label) dlg.setAttribute('aria-label', label);
      dlg.innerHTML = html;
      document.body.appendChild(dlg);
      let settled = false;
      // Answered at once when the dialog's own button asks (not when the browser gets round to the close event); Esc closes it from outside: null.
      /** @param {any} v */
      const finish = (v) => { if (settled) return; settled = true; if (dlg.open) dlg.close(); dlg.remove(); resolve(v === undefined ? null : v); };
      dlg.addEventListener('close', () => finish(null));
      setup(dlg, finish);
      dlg.showModal();
    });
  }

  /**
   * "Count this as": a counted job (a limit and how many) or an urgent fix that never counts. Resolves with the choice, or null.
   * @param {any} t @param {any} plan planOf() @param {any[]} lines this service's limits
   */
  function countDialog(t, plan, lines) {
    const c = C();
    const i = infoFor(t);
    const guess = lines.length ? lineOf(t, lines, i && i.ex) : null;
    const qty = qtyOf(t, i && i.ex);
    const who = c.tenant(t.tenant_id);
    const svc = t.service ? c.svcLabel(t.service) : 'General';
    const noPlan = !lines.length;
    const html = `<form class="wk-form" novalidate>
      <p class="wk-kicker">Move to Done</p>
      <h2>Count this as</h2>
      <p class="wk-sub"><strong>${E(t.title)}</strong><span>${E(who ? who.name : '')} · ${E(svc)}</span></p>
      <fieldset class="wk-how">
        <legend class="sr-only">What it counts as</legend>
        <div class="wk-box">
          <label class="wk-opt"><input type="radio" name="how" value="count" checked><span><span class="pick-t">${noPlan ? 'A counted job' : 'Count it against a limit'}</span><span class="pick-d">${noPlan ? `${E(svc)} is not in this month’s plan, so counting it needs your OK first.` : 'It uses some of this month’s allowance.'}</span></span></label>
          ${noPlan ? '' : `<div class="wk-fields">
            <div class="field"><label for="wk-metric">What it counts as</label><select id="wk-metric" name="metric">${lines.map((/** @type {any} */ l) => `<option value="${E(l.metric)}"${guess && l.metric === guess.metric ? ' selected' : ''}>${E(barName(l))} (${l.used} of ${l.cap} ${LIVE.has(l.metric) ? 'live now' : 'used'})</option>`).join('')}</select></div>
            <div class="field wk-qty"><label for="wk-qty">${guess && LIVE.has(guess.metric) ? 'Live now, after this' : 'How many'}</label><input id="wk-qty" type="number" name="qty" min="${guess && LIVE.has(guess.metric) ? 0 : 1}" max="100" value="${guess && LIVE.has(guess.metric) ? Math.min(100, guess.used + qty) : qty}" inputmode="numeric"></div>
            <p class="wk-lands" data-lands aria-live="polite"></p>
          </div>`}
        </div>
        <div class="wk-box"><label class="wk-opt"><input type="radio" name="how" value="urgent"><span><span class="pick-t">Urgent fix (not counted)</span><span class="pick-d">Opening hours, a closure, a phone number or a sold-out item. These never use a limit.</span></span></label></div>
      </fieldset>
      <div class="field"><label for="wk-note">Note (optional)</label><input id="wk-note" type="text" name="note" maxlength="200" placeholder="${E(noPlan ? 'What was done' : 'Kept with the count')}" autocomplete="off"></div>
      <div class="actions"><button class="btn btn-quiet" type="button" data-wk-cancel>Not yet</button><button class="btn" type="submit" data-wk-go>Move to Done</button></div>
    </form>`;
    return modal(html, (dlg, close) => {
      const f = /** @type {HTMLFormElement} */ (dlg.querySelector('form'));
      const go = /** @type {HTMLButtonElement} */ (f.querySelector('[data-wk-go]'));
      const how = () => /** @type {HTMLInputElement} */ (f.querySelector('input[name="how"]:checked')).value;
      const sync = () => {
        const counted = how() === 'count';
        const fields = f.querySelector('.wk-fields');
        if (fields) { fields.classList.toggle('is-off', !counted); for (const el of fields.querySelectorAll('select, input')) /** @type {any} */ (el).disabled = !counted; }
        const land = f.querySelector('[data-lands]');
        let over = noPlan && counted;
        if (land && counted) {
          const line = lines.find((/** @type {any} */ l) => l.metric === /** @type {any} */ (f.elements.namedItem('metric')).value);
          const live = !!(line && LIVE.has(line.metric));
          const box = /** @type {any} */ (f.elements.namedItem('qty'));
          // a live limit asks how many are live once this is done (0 to 100, it replaces the count), any other how many this adds
          if (live !== (box.dataset.live === '1')) {
            box.dataset.live = live ? '1' : '';
            box.min = live ? '0' : '1';
            box.value = String(live && line ? Math.min(100, line.used + qty) : qty);
            const lab = f.querySelector('label[for="wk-qty"]');
            if (lab) lab.textContent = live ? 'Live now, after this' : 'How many';
          }
          const n = Math.max(live ? 0 : 1, Math.min(100, Math.floor(Number(box.value)) || 0));
          if (line && live) {
            over = n > line.cap;
            land.className = `wk-lands${over ? ' is-over' : ''}`;
            land.textContent = over ? `${liveWords(line, n)}. That is ${n - line.cap} over, so it goes to Needs you first and the card stays where it is.` : `Sets ${lower(barName(line))} to ${n} of ${line.cap} now.`;
          } else if (line) {
            const to = line.used + n;
            over = to > line.cap;
            land.className = `wk-lands${over ? ' is-over' : ''}`;
            land.textContent = over ? `${landWords(line, line.used + 1, to)}. That is ${to - line.cap} over, so it goes to Needs you first and the card stays where it is.` : `Lands as ${lower(landWords(line, line.used + 1, to))}.`;
          }
        } else if (land) { land.textContent = ''; }
        go.textContent = !counted ? 'Move to Done' : over ? 'Send to Needs you' : 'Move to Done';
      };
      f.addEventListener('input', sync);
      f.addEventListener('change', sync);
      sync();
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const note = String(/** @type {any} */ (f.elements.namedItem('note')).value || '').trim();
        if (how() === 'urgent') { close({ how: 'urgent', note }); return; }
        if (noPlan) { close({ how: 'ask', note }); return; }
        const n = Math.floor(Number(/** @type {any} */ (f.elements.namedItem('qty')).value));
        const least = /** @type {any} */ (f.elements.namedItem('qty')).dataset.live === '1' ? 0 : 1;
        if (!(n >= least && n <= 100)) { /** @type {any} */ (f.elements.namedItem('qty')).focus(); C().toast(`How many: a whole number from ${least} to 100.`, true); return; }
        close({ how: 'count', metric: /** @type {any} */ (f.elements.namedItem('metric')).value, qty: n, note });
      });
      /** @type {HTMLElement} */ (f.querySelector('[data-wk-cancel]')).addEventListener('click', () => close(null));
      const first = /** @type {HTMLElement|null} */ (f.querySelector('select, input[name="how"]'));
      if (first) first.focus();
    }, 'Count this as');
  }

  /**
   * Why a card is being removed: a reason is required, and the history is kept. Resolves with the reason, or null.
   * @param {any} t
   */
  function askRemove(t) {
    const html = `<form class="wk-form" novalidate>
      <p class="wk-kicker">Remove a card</p>
      <h2>Remove “${E(t.title)}”?</h2>
      <p class="wk-lead">${t.kind === 'request' ? 'Only the card goes. The request stays on the Talk tab, and the client keeps seeing its last status.' : 'It leaves the board and what the client sees. We keep its history, and the reason.'}${t.multica_issue_id ? ' Its Multica issue stays as it is.' : ''}</p>
      <div class="field"><label for="wk-why">Why are you removing it?</label><textarea id="wk-why" name="why" maxlength="500" required placeholder="For example: the client cancelled it"></textarea><p class="hint">Kept in History, with your name.</p></div>
      <div class="actions"><button class="btn btn-quiet" type="button" data-wk-cancel>Keep the card</button><button class="btn btn-danger" type="submit" disabled>Remove card</button></div>
    </form>`;
    return modal(html, (dlg, close) => {
      const f = /** @type {HTMLFormElement} */ (dlg.querySelector('form'));
      const why = /** @type {HTMLTextAreaElement} */ (f.elements.namedItem('why'));
      const go = /** @type {HTMLButtonElement} */ (f.querySelector('button[type=submit]'));
      why.addEventListener('input', () => { go.disabled = !why.value.trim(); });
      f.addEventListener('submit', (e) => { e.preventDefault(); const r = why.value.trim(); if (r) close(r); });
      /** @type {HTMLElement} */ (f.querySelector('[data-wk-cancel]')).addEventListener('click', () => close(null));
      why.focus();
    }, 'Remove a card');
  }

  /** Why a count is being voided. Resolves with the reason, or null. @param {string} what */
  function askVoid(what) {
    const html = `<form class="wk-form" novalidate>
      <p class="wk-kicker">Void a count</p>
      <h2>Void this count?</h2>
      <p class="wk-lead">${E(what)} stops counting against this month’s limit. The row stays in History, marked as void.</p>
      <div class="field"><label for="wk-why">Why was it a mistake?</label><textarea id="wk-why" name="why" maxlength="500" required placeholder="For example: counted twice"></textarea></div>
      <div class="actions"><button class="btn btn-quiet" type="button" data-wk-cancel>Keep it</button><button class="btn btn-danger" type="submit" disabled>Void the count</button></div>
    </form>`;
    return modal(html, (dlg, close) => {
      const f = /** @type {HTMLFormElement} */ (dlg.querySelector('form'));
      const why = /** @type {HTMLTextAreaElement} */ (f.elements.namedItem('why'));
      const go = /** @type {HTMLButtonElement} */ (f.querySelector('button[type=submit]'));
      why.addEventListener('input', () => { go.disabled = !why.value.trim(); });
      f.addEventListener('submit', (e) => { e.preventDefault(); const r = why.value.trim(); if (r) close(r); });
      /** @type {HTMLElement} */ (f.querySelector('[data-wk-cancel]')).addEventListener('click', () => close(null));
      why.focus();
    }, 'Void a count');
  }

  /* ---- counting a card ---------------------------------------------------------------------------------------------------------- */

  /**
   * Sets what is used of one limit from the rows (so counting it twice cannot happen), for the strips and the cards. When the rows did not
   * load, the change itself is added or taken off instead. @param {any} row a usage_events row @param {number} sign 1 for a new row, -1 for a voided one
   */
  function recount(row, sign) {
    const c = C();
    const u = (c.plans.usage || []).find((/** @type {any} */ x) => x.cycle_id === row.cycle_id && x.service === row.service && x.metric === row.metric);
    if (!u || !row.counted) return;
    // a live limit is its newest count (voiding one is read back from the database by liveAgain: the one before may be from last month)
    if (LIVE.has(row.metric)) { if (sign > 0) u.used = Number(row.qty); return; }
    if (store.failed) { u.used = Math.max(0, Number(u.used) + sign * Number(row.qty)); return; }
    u.used = store.usage.filter((/** @type {any} */ x) => x.counted && !x.voided_at && x.cycle_id === row.cycle_id && x.service === row.service && x.metric === row.metric).reduce((/** @type {number} */ n, /** @type {any} */ x) => n + Number(x.qty), 0);
  }
  /** After a live count is voided: what is live now, as the database works it out (the newest count left, from any month). @param {any} db @param {any} row */
  async function liveAgain(db, row) {
    const u = (C().plans.usage || []).find((/** @type {any} */ x) => x.cycle_id === row.cycle_id && x.service === row.service && x.metric === row.metric);
    if (!u) return;
    try {
      const res = await db.from('tenant_usage_current').select('used').eq('cycle_id', row.cycle_id).eq('service', row.service).eq('metric', row.metric).maybeSingle();
      if (!res.error && res.data) u.used = Number(res.data.used) || 0;
    } catch (e) { /* the next reload shows it */ }
    forget();
  }
  /**
   * Asks Needs you to decide (report_exception). True when it was opened now, false when one was already open.
   * @param {any} t @param {string} reason @param {string} message @param {any} last @param {string} [kind] what the item is about (a card unless said)
   */
  async function reportException(t, reason, message, last, kind) {
    const c = C();
    const db = await c.db();
    const opened = ok(await db.rpc('report_exception', { p_tenant: t.tenant_id, p_entity_type: kind || 'task', p_entity_id: t.id, p_reason: reason, p_message: message, p_last: last }));
    try {
      const res = await db.from('dashboard_exceptions').select('*').eq('tenant_id', t.tenant_id).eq('status', 'open');
      if (!res.error) {
        const r = c.all.reviews = c.all.reviews || { items: [], invoices: [], exceptions: [], sync: {}, auto: [] };
        r.exceptions = (r.exceptions || []).filter((/** @type {any} */ x) => x.tenant_id !== t.tenant_id).concat(res.data || []);
      }
    } catch (e) { /* the next reload shows it */ }
    forget();
    return opened !== false;
  }
  /**
   * What the Needs you item says and carries when a card is over its limit (the same words as the database's own for a client's request).
   * `to` is where the card lands: used plus its own count when the database refused it, or its place in the queue when the board asks for the OK ahead of time.
   * @param {any} t @param {any} plan @param {any} line @param {number} qty @param {number} [at]
   */
  function overWords(t, plan, line, qty, at) {
    const c = C();
    const to = at || line.used + qty;
    return {
      message: `Over cap: ${c.svcLabel(t.service)} ${line.label} ${to} of ${line.cap} (${plan.nowPlan ? plan.nowPlan.name : 'plan'}).`,
      last: { task: t.id, title: t.title, service: t.service, metric: line.metric, qty, used: to - qty, cap: line.cap, plan: plan.now.plan_id, cycle: plan.now.id, request: t.request_id || null }
    };
  }

  /**
   * The usage row for a card: written before the card moves, so a row past the limit (refused, 23514) leaves the card where it is.
   * Resolves { ok: row } when written, { refused: true } when the card was sent to Needs you instead, { failed: Error } otherwise.
   * @param {any} t @param {any} plan @param {{metric: string, qty: number, counted: boolean, note?: string}} what
   */
  async function writeUsage(t, plan, what) {
    const c = C();
    const db = await c.db();
    const res = await db.from('usage_events').insert({
      tenant_id: t.tenant_id, cycle_id: plan.now.id, service: t.service, metric: what.metric, qty: what.qty, counted: what.counted, task_id: t.id, request_id: t.request_id || null, note: what.note || null
    }).select(USAGE_COLS).single();
    if (!res.error) {
      const row = res.data;
      store.usage.push(row);
      recount(row, 1);
      forget();
      return { ok: row };
    }
    const said = String(res.error.message || '');
    if (res.error.code === '23514' && /^over_cap/.test(said)) {
      const line = plan.lines.find((/** @type {any} */ l) => l.service === t.service && l.metric === what.metric);
      if (line) {
        const live = LIVE.has(line.metric);   // a live count is the new total, not an addition
        const w = live ? overWords(t, plan, line, Math.max(1, what.qty - line.used), what.qty) : overWords(t, plan, line, what.qty);
        await reportException(t, 'over_cap', w.message, w.last);
        c.toast(`Over the limit: ${lower(live ? liveWords(line, what.qty) : landWords(line, line.used + 1, line.used + what.qty))}. It is in Needs you now, and the card stays where it is.`, true);
        return { refused: true };
      }
    }
    if (res.error.code === '23514' && /^service_not_picked/.test(said)) {
      await reportException(t, 'service_not_picked', `A card for ${c.svcLabel(t.service)}, which is not in this month’s plan.`, { task: t.id, title: t.title, service: t.service, cycle: plan.now.id });
      c.toast(`${c.svcLabel(t.service)} is not in this month’s plan. It is in Needs you now, and the card stays where it is.`, true);
      return { refused: true };
    }
    if (res.error.code === '23514' && /cycle-not-running/.test(said)) return { failed: new Error('This client has no plan month running, so nothing can be counted yet. Set their plan in Billing first.') };
    if (res.error.code === '23514' && /not-this-months-website-option/.test(said)) return { failed: new Error('Their plan this month covers the other kind of website work. Choose that one, or send it to Needs you.') };
    return { failed: explain(res.error) };
  }

  /**
   * Before a card moves to Done: asks what it counts as and writes the usage row. Nothing to count (no service, no plan month running,
   * already counted) lets the move go ahead as it always did.
   * Resolves { stop: true } when the card should stay where it is (cancelled, refused, failed), { usage, wrote } when it may move.
   * @param {any} t
   */
  async function beforeDone(t) {
    const c = C();
    const plan = c.planOf(t.tenant_id);
    if (!t.service || !c.plans.ok || !plan.now) return {};
    await ready(true);
    // Already counted (a one-off approved in Needs you, "Count as N of M", or an earlier count of this card or its request): nothing is counted twice.
    if (rowsOf(t).length) return {};
    const lines = plan.lines.filter((/** @type {any} */ l) => l.service === t.service);
    const pick = await countDialog(t, plan, lines);
    if (!pick) return { stop: true };
    try {
      if (pick.how === 'ask') {
        await reportException(t, 'service_not_picked', `A card for ${c.svcLabel(t.service)}, which is not in this month’s plan.`, { task: t.id, title: t.title, service: t.service, cycle: plan.now.id });
        c.toast(`${c.svcLabel(t.service)} is not in this month’s plan. It is in Needs you now, and the card stays where it is.`, true);
        return { stop: true, wrote: true };
      }
      const line = lines.find((/** @type {any} */ l) => l.metric === pick.metric) || lineOf(t, lines, null);
      const metric = pick.how === 'urgent' ? (line ? line.metric : DEFAULT_METRIC[t.service] || 'social_posts') : pick.metric;
      const r = await writeUsage(t, plan, { metric, qty: pick.how === 'urgent' ? 1 : pick.qty, counted: pick.how !== 'urgent', note: pick.note });
      if (r.refused) return { stop: true, wrote: true };
      if (r.failed) { c.toast(r.failed.message, true); return { stop: true }; }
      return { usage: r.ok, wrote: true };
    } catch (e) { c.toast(C().message(e), true); return { stop: true }; }
  }

  /** Counts a card that is already Done (finished by Multica, or before this release) without moving it. Resolves true when something was written. @param {any} t */
  async function countNow(t) {
    const c = C();
    const plan = c.planOf(t.tenant_id);
    if (!t.service || !plan.now) return false;
    await ready(true);
    if (rowsOf(t).length) { c.toast('That card was already counted. Reloaded.'); return true; }
    const lines = plan.lines.filter((/** @type {any} */ l) => l.service === t.service);
    const pick = await countDialog(t, plan, lines);
    if (!pick) return false;
    try {
      if (pick.how === 'ask') { await reportException(t, 'service_not_picked', `A card for ${c.svcLabel(t.service)}, which is not in this month’s plan.`, { task: t.id, title: t.title, service: t.service, cycle: plan.now.id }); return true; }
      const line = lines.find((/** @type {any} */ l) => l.metric === pick.metric) || lineOf(t, lines, null);
      const r = await writeUsage(t, plan, { metric: pick.how === 'urgent' ? (line ? line.metric : DEFAULT_METRIC[t.service]) : pick.metric, qty: pick.how === 'urgent' ? 1 : pick.qty, counted: pick.how !== 'urgent', note: pick.note });
      if (r.failed) { c.toast(r.failed.message, true); return false; }
      if (r.ok) c.toast(pick.how === 'urgent' ? 'Saved as an urgent fix. It does not count.' : 'Counted.');
      return true;
    } catch (e) { c.toast(C().message(e), true); return false; }
  }

  /** Voids a count with a reason (usage rows are never deleted). Resolves true when it was voided. @param {any} row a usage_events row @param {string} reason */
  async function voidUsage(row, reason) {
    const c = C();
    const db = await c.db();
    const res = await db.from('usage_events').update({ voided_at: new Date().toISOString(), voided_reason: reason }).eq('id', row.id).select(USAGE_COLS).single();
    ok(res);
    store.usage = store.usage.filter((/** @type {any} */ u) => u.id !== row.id);
    recount(row, -1);
    if (LIVE.has(row.metric)) await liveAgain(db, row);
    forget();
    return true;
  }

  /** A card the move to Done did not happen for: its count is voided again (the card was moved elsewhere meanwhile). @param {any} row */
  async function undoCount(row) {
    try { await voidUsage(row, 'The card did not move to Done'); } catch (e) { C().toast(`The count for that card was kept, because it could not be voided: ${C().message(e)}`, true); }
  }

  /* ---- removing a card and who sees it ------------------------------------------------------------------------------------------- */

  /** Removes a card with a reason (soft_delete_task keeps the row and writes History). Resolves the removed row. @param {string} id @param {string} reason */
  async function removeCard(id, reason) {
    const db = await C().db();
    forget();
    return ok(await db.rpc('soft_delete_task', { p_task: id, p_reason: reason }));
  }
  /** Shows or hides a card (set_task_visibility). Hiding needs a reason. Resolves the card's row. @param {string} id @param {boolean} visible @param {string} [reason] */
  async function setVisibility(id, visible, reason) {
    const db = await C().db();
    forget();
    return ok(await db.rpc('set_task_visibility', { p_task: id, p_visible: visible, p_reason: reason || null }));
  }

  /**
   * The "Client sees this card" switch, for the add form (t = null) and the card editor. A card with no service is never shown to the client,
   * so the switch waits for a service. Hiding a card the client sees (or deciding "hidden") asks why.
   * @param {any} t
   */
  function visibilityField(t) {
    const v = t ? visState(t) : 'new';
    const on = v === 'shown';
    const hint = v === 'new' ? 'Off until you decide. They see its title, stage and due date on their Work page once it is on.'
      : v === 'shown' ? 'They see its title, stage and due date on their Work page. Details, priority and who is on it stay with the team.'
        : v === 'hidden' ? 'Hidden from the client. Turn it on to show its title, stage and due date on their Work page.'
          : 'Not decided yet, so it is hidden. Turn it on to show it, or choose Keep hidden.';
    const id = `wk-vis-${t ? t.id : 'new'}`;
    return `<div class="field span-all wk-vis-field" data-wk-vis="${v}">
      <label class="switch-row" for="${E(id)}"><input id="${E(id)}" type="checkbox" role="switch" name="visible"${on ? ' checked' : ''}><span><span class="pick-t">Client sees this card</span><span class="pick-d" data-wk-vis-hint>${E(hint)}</span></span></label>
      ${t ? `<div class="wk-why" hidden><label for="${E(id)}-why">Why hide it from the client?</label><input id="${E(id)}-why" type="text" name="why" maxlength="500" value="Team only" autocomplete="off"></div>
      ${v === 'undecided' ? `<button class="btn btn-quiet btn-sm wk-keep" type="button" data-wk-keep>Keep hidden</button>` : ''}` : ''}
    </div>`;
  }
  /** Wires the switch: it waits for a service, and asks why when a card the client sees is turned off. @param {HTMLFormElement} f @param {any} t */
  function wireVisibility(f, t) {
    const sw = /** @type {HTMLInputElement|null} */ (f.elements.namedItem('visible'));
    if (!sw) return;
    const service = /** @type {HTMLSelectElement|null} */ (f.elements.namedItem('service'));
    const field = /** @type {HTMLElement} */ (sw.closest('.wk-vis-field'));
    const why = /** @type {HTMLElement|null} */ (field.querySelector('.wk-why'));
    const hint = /** @type {HTMLElement} */ (field.querySelector('[data-wk-vis-hint]'));
    const was = t ? visState(t) : 'new';
    const keepHint = hint.textContent;
    const sync = () => {
      const hasService = !service || !!service.value;
      sw.disabled = !hasService;
      if (!hasService) { sw.checked = false; hint.textContent = 'A card needs a service before the client can see it. Pick one first.'; }
      else hint.textContent = keepHint;
      // turning a card the client sees (or a decided hidden one) off asks why; the old reason text is "Team only"
      if (why) why.hidden = !(was === 'shown' && !sw.checked);
    };
    sw.addEventListener('change', sync);
    if (service) service.addEventListener('change', sync);
    sync();
  }
  /**
   * What the switch asks for compared with the card now: { changed, visible, reason } or { error }. A decided card turned off needs a reason; an undecided one left off is
   * not a decision (Keep hidden is).
   * @param {HTMLFormElement} f @param {any} t
   */
  function visibilityChange(f, t) {
    const sw = /** @type {HTMLInputElement|null} */ (f.elements.namedItem('visible'));
    if (!sw || sw.disabled) return { changed: false };
    const was = visState(t);
    if (sw.checked && was !== 'shown') return { changed: true, visible: true };
    if (!sw.checked && was === 'shown') {
      const reason = String(/** @type {any} */ (f.elements.namedItem('why')).value || '').trim();
      return reason ? { changed: true, visible: false, reason } : { error: 'Say why you are hiding it from the client.' };
    }
    return { changed: false };
  }

  /** The line in a card's editor about what it counted for, with a way to void it. @param {any} t */
  function editUsage(t) {
    const i = infoFor(t);
    if (!i || !(i.kind === 'counted' || i.kind === 'urgent') || !i.rows) return '';
    return `<p class="wk-usage meta">${i.kind === 'urgent' ? 'Saved as an urgent fix: it does not count.' : `Counted: ${E(lower(i.text))}.`} ${i.rows.map((/** @type {any} */ r) => `<button class="linkish" type="button" data-wk-void="${E(r.id)}">Void ${i.rows.length > 1 ? `the ${r.counted ? 'count of ' + r.qty : 'urgent fix'}` : 'this count'}</button>`).join(' ')}</p>`;
  }
  /**
   * Wires the editor's two decisions: Void this count (a reason is asked) and Keep hidden (a card nobody decided on is decided: hidden).
   * `done` runs after either was written, so the console can note its write and draw the board again.
   * @param {HTMLFormElement} f @param {any} t @param {() => void} done
   */
  function wireEdit(f, t, done) {
    f.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const b = /** @type {HTMLElement|null} */ (target.closest('[data-wk-void]'));
      if (b) {
        const row = store.usage.find((/** @type {any} */ u) => u.id === b.getAttribute('data-wk-void'));
        if (!row) return;
        const reason = await askVoid(row.counted ? `The count of ${row.qty}` : 'This urgent fix');
        if (!reason) return;
        try { await voidUsage(row, reason); C().toast('The count is voided. It stays in History.'); done(); } catch (x) { C().toast(C().message(x), true); }
        return;
      }
      if (target.closest('[data-wk-keep]')) {
        const why = /** @type {HTMLInputElement|null} */ (f.elements.namedItem('why'));
        try { Object.assign(t, await setVisibility(t.id, false, (why && why.value.trim()) || 'Team only')); C().toast('Kept hidden. It will not ask again.'); done(); } catch (x) { C().toast(C().message(x), true); }
      }
    });
  }

  /* ---- Set live count (20261014140000) ---------------------------------------------------------------------------------------- */

  /** The live count dialog's words for each live-at-once limit. */
  const LIVE_ASK = /** @type {Record<string, {q: string, field: string, noun: string}>} */ ({
    ads_live_campaigns: { q: 'How many campaigns are live right now?', field: 'Live campaigns now', noun: 'Live campaigns' },
    ads_platforms: { q: 'How many ad platforms are in use right now?', field: 'Ad platforms in use now', noun: 'Ad platforms' }
  });
  /** @param {string} s */
  const cssq = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
  /** Every bar of one client's live limit on the page (a strip can show it twice: at the top and under All limits). @param {string} tid @param {string} metric */
  const liveBoxes = (tid, metric) => Array.from(document.querySelectorAll(`.wk-livebar[data-wk-live-box="${cssq(metric)}"][data-wk-tenant="${cssq(tid)}"]`));
  /**
   * A usage bar, and for a live-at-once limit a quiet "Set live count" button with it. The demo console shows the button switched off.
   * Billing's drawer uses this too. @param {string} tenantId @param {any} l a planOf() line @param {string} label the bar's name
   */
  function liveBar(tenantId, l, label) {
    const bar = C().usageBar({ ...l, label });
    if (!LIVE_ASK[l.metric]) return bar;
    const who = (C().tenant(tenantId) || {}).name || '';
    const demo = !!(/** @type {any} */ (window).D8DEMO_SITE);
    return `<div class="wk-livebar" data-wk-live-box="${E(l.metric)}" data-wk-tenant="${E(tenantId)}" data-wk-label="${E(label)}">${bar}<button class="linkish wk-live" type="button" data-wk-live="${E(l.metric)}" data-wk-tenant="${E(tenantId)}" aria-label="Set live count: ${E(label)}${who ? `, ${E(who)}` : ''}"${demo ? ' disabled title="This is a demo. Nothing is saved or sent."' : ''}>Set live count</button></div>`;
  }
  /**
   * How many are live right now: a number from 0 to 100, prefilled with the count now. Resolves the number, or null (Cancel or Esc).
   * @param {string} tenantId @param {any} line
   */
  function liveDialog(tenantId, line) {
    const w = LIVE_ASK[line.metric];
    const who = C().tenant(tenantId);
    const html = `<form class="wk-form" novalidate>
      <p class="wk-kicker">Set live count</p>
      <h2 id="wk-live-h">${E(w.q)}</h2>
      <p class="wk-sub"><strong>${E(who ? who.name : '')}</strong><span>Limit ${E(line.cap)} at once</span></p>
      <div class="field wk-qty"><label for="wk-live-n">${E(w.field)}</label><input id="wk-live-n" type="number" name="qty" min="0" max="100" step="1" value="${E(line.used)}" inputmode="numeric" aria-describedby="wk-live-says"></div>
      <p class="wk-lands" id="wk-live-says" aria-live="polite"></p>
      <div class="actions"><button class="btn btn-quiet" type="button" data-wk-cancel>Cancel</button><button class="btn" type="submit">Save</button></div>
    </form>`;
    return modal(html, (dlg, close) => {
      dlg.setAttribute('aria-labelledby', 'wk-live-h');
      const f = /** @type {HTMLFormElement} */ (dlg.querySelector('form'));
      const box = /** @type {HTMLInputElement} */ (f.elements.namedItem('qty'));
      const says = /** @type {HTMLElement} */ (f.querySelector('#wk-live-says'));
      const read = () => { const n = Number(box.value); return box.value.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 100 ? n : null; };
      const sync = () => {
        const n = read();
        const over = n !== null && n > line.cap;
        const kept = over && n !== null && n < line.used;   // lower, still past the cap: the one-off approved before covers it
        says.className = `wk-lands${over && !kept ? ' is-over' : ''}`;
        says.textContent = n === null ? 'A whole number from 0 to 100.'
          : n === line.used ? `That is the count now: ${n} of ${line.cap}.`
            : kept ? `${n} of ${line.cap}: still over the limit, under the one-off approved before.`
              : over ? `That is ${n - line.cap} over the limit of ${line.cap}, so it goes to Needs you first, where a one-off can be approved. Nothing changes until then.`
                : `${w.noun} go from ${line.used} to ${n} of ${line.cap}.`;
      };
      box.addEventListener('input', sync);
      sync();
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const n = read();
        if (n === null) { box.focus(); C().toast('How many: a whole number from 0 to 100.', true); return; }
        close(n);
      });
      /** @type {HTMLElement} */ (f.querySelector('[data-wk-cancel]')).addEventListener('click', () => close(null));
      box.focus();
      box.select();
    });
  }
  /** After a live count is written: the strips, the cards and every bar of it on the page show the new number. @param {string} tid @param {string} metric @param {number} n */
  function applyLive(tid, metric, n) {
    const c = C();
    for (const u of c.plans.usage || []) if (u.tenant_id === tid && u.metric === metric) u.used = n;
    store.loadedAt = 0;
    forget();
    const line = c.planOf(tid).lines.find((/** @type {any} */ l) => l.metric === metric);
    if (!line) return;
    for (const box of liveBoxes(tid, metric)) box.outerHTML = liveBar(tid, line, box.getAttribute('data-wk-label') || barName(line));
  }
  /**
   * "Set live count": asks how many are live now and writes one snapshot (set_live_count, 20261014140000). The bar updates in place
   * and focus goes back to the button. Over the cap the database refuses it: the limit is then put in Needs you, where a one-off can be
   * approved. The same number writes nothing. Resolves true when something was written. @param {HTMLElement} btn @param {() => void} [wrote]
   */
  async function setLive(btn, wrote) {
    const c = C();
    const tid = btn.getAttribute('data-wk-tenant') || '';
    const metric = btn.getAttribute('data-wk-live') || '';
    const w = LIVE_ASK[metric];
    const plan = c.planOf(tid);
    const line = plan.lines.find((/** @type {any} */ l) => l.metric === metric);
    if (!w || !line) return false;
    // which of the bars it was, so focus comes back to the same one after the bars are drawn again
    const at = Math.max(0, liveBoxes(tid, metric).indexOf(/** @type {Element} */ (btn.closest('.wk-livebar'))));
    const back = () => {
      const el = btn.isConnected ? btn : /** @type {HTMLElement|null} */ ((liveBoxes(tid, metric)[at] || document.createElement('i')).querySelector('[data-wk-live]'));
      if (el) el.focus();
    };
    const n = await liveDialog(tid, line);
    if (n === null) { back(); return false; }
    if (n === line.used) { c.toast(`${w.noun} stay at ${n}. Nothing changed.`); back(); return false; }
    let wroteIt = false;
    try {
      const db = await c.db();
      const res = await db.rpc('set_live_count', { p_tenant: tid, p_metric: metric, p_qty: n });
      const err = res.error;
      const said = String((err && err.message) || '');
      if (err && err.code === 'demo-readonly') { /* the demo console: its note was said, and nothing changed */ }
      else if (err && err.code === '23514' && /^over_cap/.test(said)) {
        const opened = await reportException({ tenant_id: tid, id: metric }, 'over_cap',
          `Over cap: ${c.svcLabel(line.service)} ${line.label} ${n} of ${line.cap} (${plan.nowPlan ? plan.nowPlan.name : 'plan'}).`,
          { metric, service: line.service, qty: Math.max(1, n - line.used), used: line.used, cap: line.cap, plan: plan.now ? plan.now.plan_id : null, cycle: plan.now ? plan.now.id : null, live: true }, 'live_count');
        wroteIt = true;
        c.toast(`${n} is over the limit of ${line.cap}, so nothing changed. ${opened ? 'It is in Needs you now' : 'It is already in Needs you'}, where a one-off can be approved.`, true);
      } else if (err) {
        if (/PGRST202|42883|could not find the function/i.test(`${err.code || ''} ${said}`)) throw new Error('Set live count needs the database update from 14 October first. Nothing was saved.');
        if (/cycle-not-running/.test(said)) throw new Error('This client has no plan month running, so there is nothing to set yet. Set their plan in Billing first.');
        if (/service_not_picked/.test(said)) throw new Error(`${c.svcLabel(line.service)} is not in this month’s plan, so nothing was saved.`);
        if (/qty-out-of-range/.test(said)) throw new Error('How many: a whole number from 0 to 100. Nothing was saved.');
        throw explain(err);
      } else {
        const out = res.data || {};
        if (out.done === false) c.toast(`${w.noun} stay at ${out.now}. Nothing changed.`);
        else { applyLive(tid, metric, Number(out.now)); wroteIt = true; c.toast(`${w.noun} set to ${out.now} (was ${out.was}).`); }
      }
    } catch (e) { c.toast(c.message(e), true); }
    if (wroteIt && wrote) wrote();
    back();
    return wroteIt;
  }

  /* ---- the usage strip ----------------------------------------------------------------------------------------------------------- */

  /** @param {any} l a usage line @returns {number} */
  const ratio = (l) => (l.cap > 0 ? l.used / l.cap : 0);
  /**
   * One client's limits, as a card: the plan, what is picked, the two limits closest to their end as bars, and the rest folded below.
   * @param {string} tenantId @param {{pressed?: boolean, filter?: boolean}} [o] filter: the name is a button that shows only this client's cards
   */
  function strip(tenantId, o = {}) {
    const c = C();
    const t = c.tenant(tenantId);
    if (!t) return '';
    const p = c.planOf(tenantId);
    const plan = p.nowPlan;
    const lines = p.lines.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => ratio(b) - ratio(a));
    const top = lines.slice(0, 2);
    let slot = '';
    if (plan && plan.max_clients) {
      const taken = (c.all.tenants || []).filter((/** @type {any} */ x) => x.status !== 'archived' && (c.planOf(x.id).nowPlan || {}).id === plan.id).length;
      slot = ` · ${taken} of ${plan.max_clients}`;
    }
    const picks = p.now ? (p.now.picks || []).map(shortService).join(' + ') : '';
    const name = o.filter
      ? `<button class="wk-strip-name" type="button" data-wk-client="${E(t.id)}" aria-pressed="${o.pressed ? 'true' : 'false'}" title="Show only ${E(t.name)}">${E(t.name)}</button>`
      : '<span class="wk-strip-name">Limits this month</span>';
    const chips = `${plan ? `<a class="chip wk-plan" href="#/billing/${E(t.id)}" title="See or change the plan in Billing">${E(plan.name)}${E(slot)}</a>` : ''}${t.status === 'paused' ? '<span class="chip plain">Paused</span>' : ''}`;
    const byService = Array.from(new Set(lines.map((/** @type {any} */ l) => l.service)));
    const groups = c.SERVICE_ORDER.filter((/** @type {string} */ s) => byService.includes(s)).concat(byService.filter((/** @type {string} */ s) => !c.SERVICE_ORDER.includes(s)));
    const body = !p.now || !lines.length
      ? `<p class="wk-none">${p.now ? 'No limits for this plan.' : 'No plan month is running yet.'} <a href="#/billing/${E(t.id)}">${p.now ? 'See the plan' : 'Set the plan'}</a></p>`
      : `<div class="wk-bars">${top.map((/** @type {any} */ l) => liveBar(t.id, l, barName(l))).join('')}</div>
        ${lines.length > 2 ? `<details class="wk-more"><summary>All limits <span class="wk-n">${lines.length}</span></summary>
          <div class="wk-all">${groups.map((/** @type {string} */ s) => `<div class="wk-group"><h3>${E(c.svcLabel(s))}</h3><div class="wk-bars">${lines.filter((/** @type {any} */ l) => l.service === s).map((/** @type {any} */ l) => liveBar(t.id, l, barName(l))).join('')}</div></div>`).join('')}</div></details>` : ''}`;
    return `<section class="wk-strip${o.pressed ? ' is-on' : ''}${lines.some((/** @type {any} */ l) => l.used > l.cap) ? ' has-over' : ''}" aria-label="${E(t.name)}: plan limits">
      <header class="wk-strip-h">${name}${chips}${picks ? `<span class="wk-picks">${E(picks)}</span>` : ''}</header>${body}</section>`;
  }

  /* ---- All work ------------------------------------------------------------------------------------------------------------------ */

  /**
   * The All work page: every client's limits, filter chips (service, Over limit) and the board. console.js passes its own board pieces.
   * @param {{main: HTMLElement, state: any, columns: (cards: any[], draw: (t: any) => string, opts?: any) => string, card: (t: any, client?: string) => string, wire: (box: HTMLElement, find: (id: string) => any, after: () => void) => AbortSignal, redraw: () => void}} o
   */
  async function allWork(o) {
    const c = C();
    const main = o.main;
    const st = o.state;
    if (Date.now() - store.loadedAt > 60000) main.innerHTML = c.skeleton(3);
    await ready();
    if (c.main !== main || document.documentElement.dataset.page !== 'board') return;
    const tenants = (c.all.tenants || []).filter((/** @type {any} */ t) => t.status !== 'archived');
    /** @type {Record<string, string>} */ const names = Object.fromEntries(tenants.map((/** @type {any} */ t) => [t.id, t.name]));
    const everyCard = (c.all.tasks || []).filter((/** @type {any} */ k) => names[k.tenant_id] && !k.deleted_at);
    if (st.client && !names[st.client]) st.client = '';
    const base = st.client ? everyCard.filter((/** @type {any} */ k) => k.tenant_id === st.client) : everyCard;
    const overN = base.filter(flagged).length;
    const services = c.SERVICE_ORDER.filter((/** @type {string} */ s) => everyCard.some((/** @type {any} */ k) => k.service === s));
    if (st.service && !services.includes(st.service)) st.service = '';
    let shown = base;
    if (st.service) shown = shown.filter((/** @type {any} */ k) => k.service === st.service);
    if (st.over) shown = shown.filter(flagged);
    // Done this month: older finished cards stay on each client's own board.
    const olderDone = shown.filter((/** @type {any} */ k) => (k.status === 'done' || k.status === 'cancelled') && !thisMonth(k)).length;
    shown = shown.filter((/** @type {any} */ k) => !(k.status === 'done' || k.status === 'cancelled') || thisMonth(k))
      .sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || String(a.created_at).localeCompare(String(b.created_at)));
    const failed = !!(c.all.reviews && c.all.reviews.error) || !!store.failed || !c.plans.ok;
    const fresh = c.pageFresh({ updatedAt: c.all.at, source: 'Console work cards and usage', status: failed ? 'delayed' : 'ok', label: failed ? 'Some data did not load' : undefined,
      note: !c.plans.ok ? 'Plans have not loaded, so cards show without their limits.' : store.failed ? `Usage did not load (${store.failed}). Cards show without their positions.` : '' });
    const chip = (/** @type {string} */ key, /** @type {string} */ label, /** @type {boolean} */ on, /** @type {string} [extra] */ extra) => `<button class="wk-chip" type="button" data-wk-filter="${E(key)}" aria-pressed="${on ? 'true' : 'false'}">${E(label)}${extra || ''}</button>`;
    const strips = tenants.filter((/** @type {any} */ t) => c.planOf(t.id).now || everyCard.some((/** @type {any} */ k) => k.tenant_id === t.id));
    // "By client": one pill for each client that has cards, with its colour dot. Only worth a row when there is more than one.
    const K = EXT.color;
    const withCards = tenants.filter((/** @type {any} */ t) => everyCard.some((/** @type {any} */ k) => k.tenant_id === t.id));
    if (st.spot && !withCards.some((/** @type {any} */ t) => t.id === st.spot)) st.spot = '';
    const byClient = withCards.length > 1
      ? `<div class="wk-by" role="group" aria-label="By client: spotlight one client"><span class="wk-by-l" aria-hidden="true">By client</span><div class="wk-by-pills">${withCards.map((/** @type {any} */ t) => `<button class="wk-chip wk-pill" type="button" data-wk-spot="${E(t.id)}" data-wk-pill aria-pressed="${st.spot === t.id ? 'true' : 'false'}">${K ? K.badge(t.id) : ''}${E(t.name)}</button>`).join('')}</div></div>`
      : '';
    const spotChip = st.spot ? `<p class="wk-spotchip" role="status"><span>Showing <strong>${E(names[st.spot] || '')}</strong></span><span aria-hidden="true">·</span><button class="linkish" type="button" data-wk-spot-clear>Clear</button></p>` : '';
    // "Group by client" (remembered in this browser): one lane for each client with cards, the usual columns inside each
    if (st.group === undefined) { try { st.group = localStorage.getItem('d8c.wk.group') === '1'; } catch (e) { st.group = false; } }
    const grouped = !!st.group;
    const cardHtml = (/** @type {any} */ t) => o.card(t, names[t.tenant_id]);
    const anyBlocked = shown.some((/** @type {any} */ k) => k.status === 'blocked');
    const lane = (/** @type {any} */ t) => {
      const mine = shown.filter((/** @type {any} */ k) => k.tenant_id === t.id);
      if (!mine.length) return '';
      const folded = !!(st.fold && st.fold[t.id]);
      const plan = c.planOf(t.id).nowPlan;
      return `<section class="wk-lane${folded ? ' is-folded' : ''}" aria-label="${E(t.name)}">
        <h2 class="wk-lane-h"><button class="wk-lane-t" type="button" data-wk-fold="${E(t.id)}" aria-expanded="${folded ? 'false' : 'true'}" aria-controls="lane-${E(t.id)}"><span class="wk-lane-chev" aria-hidden="true"></span>${K ? K.badge(t.id) : ''}<span class="wk-lane-n">${E(t.name)}</span></button>${plan ? `<span class="chip wk-plan-s">${E(plan.name)}</span>` : ''}<span class="wk-lane-c">${c.plural(mine.length, 'card')}</span></h2>
        <div class="wk-lane-board" id="lane-${E(t.id)}" style="--n:${anyBlocked ? 5 : 4}"${folded ? ' hidden' : ''}>${o.columns(mine, cardHtml, { doneLabel: 'Done this month', blocked: anyBlocked, noDelete: true })}</div></section>`;
    };
    const boardHtml = grouped
      ? `<div class="wk-lanes" id="board">${withCards.map(lane).join('')}</div><div class="board wk-bin">${o.columns([], cardHtml, { binOnly: true })}</div>`
      : `<div class="board" id="board">${o.columns(shown, cardHtml, { doneLabel: 'Done this month' })}</div>`;
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">All work</h1><p>Every client’s team cards on one board. Each card shows where it lands against that client’s plan limit, so nothing over the limit gets started without a decision.</p></div></div>
      ${fresh}
      ${strips.length ? `<div class="wk-strips" role="group" aria-label="Plan limits by client">${strips.slice(0, 6).map((/** @type {any} */ t) => strip(t.id, { filter: true, pressed: st.client === t.id })).join('')}</div>` : ''}
      ${strips.length > 6 ? `<details class="wk-rest"${strips.slice(6).some((/** @type {any} */ t) => st.client === t.id) ? ' open' : ''}><summary>${c.plural(strips.length - 6, 'more client')}</summary><div class="wk-strips">${strips.slice(6).map((/** @type {any} */ t) => strip(t.id, { filter: true, pressed: st.client === t.id })).join('')}</div></details>` : ''}
      <div class="wk-bar"><div class="wk-chips" role="group" aria-label="Filter the board">
        ${chip('all', 'All clients', !st.client && !st.service && !st.over)}
        ${chip('over', 'Over limit', !!st.over, `<span class="wk-n${overN ? ' is-bad' : ''}">${overN}</span>`)}
        ${services.map((/** @type {string} */ s) => chip('service:' + s, c.svcLabel(s), st.service === s)).join('')}
      </div><div class="wk-bar-r"><button class="wk-switch" type="button" role="switch" aria-checked="${grouped ? 'true' : 'false'}" data-wk-group><span class="wk-switch-t" aria-hidden="true"></span>Group by client</button>${st.client ? `<a class="btn btn-quiet btn-sm" href="#/client/${E(st.client)}/work/new">${c.icon('plus')}Add a card for ${E(names[st.client])}</a>` : ''}</div></div>
      ${byClient}${spotChip}
      ${shown.length || !everyCard.length ? '' : `<p class="meta wk-empty">No cards match. <button class="linkish" type="button" data-wk-filter="all">Show everything</button></p>`}
      ${boardHtml}
      ${olderDone ? `<p class="meta wk-older">${c.plural(olderDone, 'earlier finished card is', 'earlier finished cards are')} on each client’s own Work tab.</p>` : ''}`;
    const find = (/** @type {string} */ id) => (c.all.tasks || []).find((/** @type {any} */ x) => x.id === id);
    const signal = o.wire(main, find, o.redraw);
    // Spotlight: the clicked client's cards stay full and the rest fade (their words still read on hover and focus)
    main.classList.toggle('has-spot', !!st.spot);
    for (const li of main.querySelectorAll('.card[data-task]')) {
      const t = find(li.getAttribute('data-task') || '');
      li.classList.toggle('is-dim', !!(st.spot && t && t.tenant_id !== st.spot));
    }
    for (const b of main.querySelectorAll('.cc-badge[data-wk-spot]')) b.setAttribute('aria-pressed', st.spot && b.getAttribute('data-wk-spot') === st.spot ? 'true' : 'false');
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !st.spot || document.documentElement.dataset.page !== 'board' || document.querySelector('dialog[open]')) return;
      st.spot = '';
      st.focus = '[data-wk-filter="all"]';
      o.redraw();
    }, { signal });
    main.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const sp = /** @type {HTMLElement|null} */ (target.closest('[data-wk-spot]'));
      if (sp) {
        const id = sp.getAttribute('data-wk-spot') || '';
        const card = sp.closest('[data-task]');
        st.spot = st.spot === id ? '' : id;
        st.focus = card ? `[data-task="${card.getAttribute('data-task')}"] [data-wk-spot]` : `[data-wk-pill][data-wk-spot="${id}"]`;
        o.redraw();
        return;
      }
      if (target.closest('[data-wk-spot-clear]')) { st.spot = ''; st.focus = '[data-wk-filter="all"]'; o.redraw(); return; }
      if (target.closest('[data-wk-group]')) {
        st.group = !st.group;
        try { localStorage.setItem('d8c.wk.group', st.group ? '1' : '0'); } catch (x) { /* a nicety */ }
        st.focus = '[data-wk-group]';
        o.redraw();
        return;
      }
      const fold = /** @type {HTMLElement|null} */ (target.closest('[data-wk-fold]'));
      if (fold) {
        const id = fold.getAttribute('data-wk-fold') || '';
        st.fold = st.fold || {};
        st.fold[id] = !st.fold[id];
        const lane = fold.closest('.wk-lane');
        const body = lane && lane.querySelector('.wk-lane-board');
        fold.setAttribute('aria-expanded', st.fold[id] ? 'false' : 'true');
        if (lane) lane.classList.toggle('is-folded', !!st.fold[id]);
        if (body) /** @type {HTMLElement} */ (body).hidden = !!st.fold[id];
        return;
      }
      const f = /** @type {HTMLElement|null} */ (target.closest('[data-wk-filter]'));
      const k = /** @type {HTMLElement|null} */ (target.closest('[data-wk-client]'));
      if (!f && !k) return;
      if (f) {
        const key = f.getAttribute('data-wk-filter') || '';
        if (key === 'all') { st.client = ''; st.service = ''; st.over = false; }
        else if (key === 'over') st.over = !st.over;
        else if (key.startsWith('service:')) st.service = st.service === key.slice(8) ? '' : key.slice(8);
        st.focus = key === 'all' && !st.client ? '[data-wk-filter="all"]' : `[data-wk-filter="${key}"]`;
      } else if (k) {
        const id = k.getAttribute('data-wk-client') || '';
        st.client = st.client === id ? '' : id;
        st.focus = `[data-wk-client="${id}"]`;
      }
      o.redraw();
    }, { signal });
    if (st.focus) { const el = /** @type {HTMLElement|null} */ (main.querySelector(st.focus)); if (el) el.focus({ preventScroll: true }); st.focus = ''; }
  }

  /**
   * The delegated clicks a board needs besides dragging and editing: Ask for an OK (an over-limit card goes to Needs you) and Count it
   * (a finished card nobody counted). `wrote` lets the console note its own write.
   * @param {HTMLElement} box @param {(id: string) => any} find @param {() => void} after @param {AbortSignal} signal @param {() => void} wrote
   */
  function wire(box, find, after, signal, wrote) {
    box.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const askBtn = /** @type {HTMLButtonElement|null} */ (target.closest('[data-wk-ask]'));
      const countBtn = /** @type {HTMLButtonElement|null} */ (target.closest('[data-wk-count]'));
      const liveBtn = /** @type {HTMLButtonElement|null} */ (target.closest('[data-wk-live]'));
      if (liveBtn) { e.stopPropagation(); await setLive(liveBtn, wrote); return; }
      if (!askBtn && !countBtn) return;
      e.stopPropagation();
      const c = C();
      if (askBtn) {
        const t = find(askBtn.getAttribute('data-wk-ask') || '');
        const i = infoFor(t);
        if (!t || !i || !i.over) return;
        const plan = c.planOf(t.tenant_id);
        const done = c.busy(askBtn, 'Sending');
        try {
          const notPlan = i.kind === 'notplan';
          const w = notPlan ? { message: `A card for ${c.svcLabel(t.service)}, which is not in this month’s plan.`, last: { task: t.id, title: t.title, service: t.service, cycle: plan.now && plan.now.id } } : overWords(t, plan, i.line, i.qty, i.to);
          const opened = await reportException(t, notPlan ? 'service_not_picked' : 'over_cap', w.message, w.last);
          wrote();
          c.toast(opened ? 'Sent to Needs you. The card waits there for a decision.' : 'It is already in Needs you.');
        } catch (x) { c.toast(c.message(x), true); }
        done();
        after();
        return;
      }
      if (countBtn) {
        const t = find(countBtn.getAttribute('data-wk-count') || '');
        if (!t) return;
        if (await countNow(t)) { wrote(); after(); }
      }
    }, { signal });
  }

  EXT.work = { ready, strip, cardView, seeText, moveBlock, beforeDone, undoCount, askRemove, removeCard, setVisibility, visibilityField, wireVisibility, visibilityChange, editUsage, wireEdit, allWork, wire, clientSees, visState, flagged, infoFor, liveBar, setLive };
})();
