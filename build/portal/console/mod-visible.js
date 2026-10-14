/*
 * The Visible tab (#/client/<id>/visible), 2026-10-13: everything this client can see, or could see once someone decides, in one
 * list. Results and updates (client_dashboard_items), invoices (client_billing_invoices), work cards that have a service
 * (tasks) and the Home sections (client_home_sections). Each row has a "Client sees" switch; nothing client-facing starts
 * visible, so a new card or an import shows a "Needs a decision" chip until someone decides. Hiding always asks why, and every
 * change is written to audit_log by the database; the history column reads it back through client_visibility_history.
 * Nothing is deleted: a hidden row stays in its table and in the history.
 *
 * It writes only through the database's own functions:
 *   results, updates, work status   review_dashboard_item (show, or turn down) and, to hide, the dashboard-recovery function
 *                                   (hide_client_dashboard_item is service-role only, so the browser reaches it that way)
 *   invoices                        review_billing_invoice_v2 (show; p_approve_link approves the Stripe link in the same step)
 *                                   and dashboard-recovery (hide_client_billing_invoice)
 *   work cards                      set_task_visibility
 *   Home sections                   an update of client_home_sections (the database's triggers do the rest)
 * The Home tab (mod-home.js) shares the helpers exported at the bottom (window.D8C_EXT.visible).
 */
(function () {
  'use strict';
  const W = /** @type {any} */ (window);
  W.D8C_EXT = W.D8C_EXT || {};
  const EXT = W.D8C_EXT;
  EXT.tabs = EXT.tabs || {};

  /** @param {any} s */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

  /* ---- words ----------------------------------------------------------------------------------------------- */

  const TYPES = { result: 'Result', update: 'Update', work: 'Work status', card: 'Work card', invoice: 'Invoice', home: 'Home section' };
  const TYPE_ORDER = ['result', 'update', 'work', 'card', 'invoice', 'home'];
  /** Where the client finds each kind of thing. */
  const WHERE = { result: 'their Results page', update: 'their Updates', work: 'their Work page', card: 'their Work page', invoice: 'their Billing page', home: 'their Home page' };
  const SECTIONS = { running_now: 'Running now', next_month: 'What changes next month', nothing_to_do: 'Nothing-to-do message', note: 'Note from Domin8te' };
  const STAGE = { todo: 'To do', in_progress: 'In progress', in_review: 'Waiting on client', blocked: 'Blocked', done: 'Done', cancelled: 'Cancelled' };
  const STAGE_TONE = { todo: '', in_progress: 'info', in_review: 'them', blocked: 'bad', done: 'good', cancelled: '' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /** "Thu 1 Oct". @param {any} iso */
  const dayText = (iso) => { const d = new Date(String(iso).length === 10 ? iso + 'T00:00' : iso); return isNaN(d.getTime()) ? '' : `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
  /** "3:40 PM". @param {any} iso */
  const timeText = (iso) => { const d = new Date(iso); if (isNaN(d.getTime())) return ''; const h = d.getHours() % 12 || 12; return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'PM' : 'AM'}`; };
  /** "Mon 12 Oct, 3:40 PM". @param {any} iso */
  const stamp = (iso) => (iso ? `${dayText(iso)}, ${timeText(iso)}` : '');
  /** "Sep 2026" for a whole month, else "1 Sep to 30 Sep". @param {any} a @param {any} b */
  function periodText(a, b) {
    if (!a || !b) return '';
    const s = new Date(String(a).slice(0, 10) + 'T00:00');
    const e = new Date(String(b).slice(0, 10) + 'T00:00');
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
    const last = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
    if (s.getDate() === 1 && e.getDate() === last && s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) return `${MON[s.getMonth()]} ${s.getFullYear()}`;
    return `${s.getDate()} ${MON[s.getMonth()]} to ${e.getDate()} ${MON[e.getMonth()]}`;
  }
  /** @param {any} s @param {number} n */
  const clip = (s, n) => { const t = String(s == null ? '' : s).trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '...' : t; };

  /* ---- what the database says, in words ------------------------------------------------------------------------ */

  /**
   * A database refusal as a sentence for the team (the portal's own wording is for customers). What is still fine is said last.
   * @param {any} err an error from supabase-js or from a thrown Error
   */
  function explain(err) {
    const raw = String((err && err.message) || err || '');
    const code = err && err.code;
    if (/reason-required/.test(raw)) return 'Say why. A reason is needed to hide it. Nothing changed.';
    if (/not-staff/.test(raw)) return 'Your sign-in is not on the Domin8te team. Sign out and in again. Nothing changed.';
    if (/^stale/.test(raw)) return 'It changed since you opened it. The list is reloaded, so look again. Nothing changed.';
    if (/nothing-to-approve/.test(raw)) return 'There is nothing new to approve on this one. The list is reloaded.';
    if (/^hidden/.test(raw)) return 'It was hidden, and the database does not show hidden items again. Nothing changed.';
    if (/not-found/.test(raw) || code === 'P0002') return 'Someone already dealt with this. The list is reloaded.';
    if (/not-a-stripe-link/.test(raw)) return 'That link is not a Stripe link, so it cannot be approved. Nothing changed.';
    if (/invoice_link_approved/.test(raw)) return 'Approve the Stripe link to show this invoice. Nothing changed.';
    if (/card-removed/.test(raw)) return 'That card was removed. Its history is kept.';
    if (/home_section_content/.test(raw)) return 'The text does not fit: a title up to 120 characters, a note up to 2,000, and up to 12 short lines of 200. Nothing was saved.';
    if (/home_section_publish/.test(raw)) return 'It could not be published. Reload and try again. Nothing changed.';
    if (code === '23505') return 'That already exists. The page is reloaded.';
    if (code === '42501' || /permission denied|row-level security/i.test(raw)) return 'The database did not allow that for your sign-in. Sign out and in again. Nothing changed.';
    if (code === '22023') return 'That was not accepted: check what you typed. Nothing changed.';
    return raw || 'It did not work. Nothing changed. Try again.';
  }
  /** Checks a supabase-js answer; a refusal becomes an Error whose message is the sentence above. @param {any} res */
  function ok(res) {
    if (res && res.error) {
      const e = /** @type {any} */ (new Error(explain(res.error)));
      e.code = res.error.code;
      e.raw = String(res.error.message || '');
      throw e;
    }
    return res ? res.data : null;
  }
  /** Whether a failure means the page shows old rows (someone else got there first). @param {any} e */
  const wasStale = (e) => /^stale|not-found|nothing-to-approve|Someone already|Already hidden|Not found|already exists/i.test(String((e && (e.raw || e.message)) || '')) || (e && e.code === '23505');
  /** A failure as one sentence: what failed, and that nothing changed (unless the sentence already says what is still fine). @param {any} C @param {any} x */
  const failText = (C, x) => { const m = C.message(x); return /nothing (was )?(changed|saved)|reloaded|still open|still fine/i.test(m) ? m : `${m} Nothing was changed.`; };

  /* ---- loading --------------------------------------------------------------------------------------------- */

  /**
   * Everything the tab shows, read fresh. A list that fails to load is named, and the rest still draws (a missing list is
   * never shown as an empty one). @param {any} C @param {string} id
   */
  async function load(C, id) {
    const client = await C.db();
    /** @type {string[]} */ const errors = [];
    /** @param {string} label @param {any} q @returns {Promise<any[]>} */
    const rd = async (label, q) => {
      try { const r = await q; if (r && r.error) { errors.push(label); return []; } return (r && r.data) || []; } catch (e) { errors.push(label); return []; }
    };
    const [items, invoices, tasks, sections, history, staff, exceptions] = await Promise.all([
      rd('results and updates', client.from('client_dashboard_items').select('*').eq('tenant_id', id)),
      rd('invoices', client.from('client_billing_invoices').select('*').eq('tenant_id', id)),
      rd('work cards', client.from('tasks').select('*').eq('tenant_id', id)),
      rd('Home sections', client.from('client_home_sections').select('*').eq('tenant_id', id)),
      rd('history', client.from('client_visibility_history').select('*').eq('tenant_id', id).order('at', { ascending: false }).limit(150)),
      rd('team names', client.from('staff').select('clerk_user_id, name')),
      rd('open problems', client.from('dashboard_exceptions').select('*').eq('tenant_id', id).eq('status', 'open'))
    ]);
    return {
      items, invoices, sections, exceptions, errors, at: Date.now(),
      tasks: tasks.filter((/** @type {any} */ t) => !t.deleted_at),
      history: history.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => String(b.at).localeCompare(String(a.at))),
      names: Object.fromEntries(staff.map((/** @type {any} */ x) => [x.clerk_user_id, x.name]))
    };
  }

  /** A person's name from their sign-in id. @param {any} D @param {any} C @param {any} id */
  function whoIs(D, C, id) {
    if (!id) return 'The system';
    if (D.names[id]) return D.names[id];
    return /^user_/.test(String(id)) ? 'A team member' : 'The system';
  }

  /* ---- the rows ---------------------------------------------------------------------------------------------- */

  /**
   * @typedef {{key: string, type: string, id: string, title: string, sub: string, group: 'decide'|'live'|'off', chip: [string, string],
   *   ctl: {kind: 'switch'|'decide'|'again'|'off', on?: boolean, off?: string}, src: any, when: string}} Row
   */

  /** One row for each thing the client sees, or could see. @param {any} C @param {any} D @returns {Row[]} */
  function buildRows(C, D) {
    /** @type {Row[]} */ const rows = [];
    const owner = !!(C.me && C.me.role === 'super_admin');
    const who = (/** @type {any} */ id) => whoIs(D, C, id);
    const dot = (/** @type {any[]} */ parts) => parts.filter(Boolean).map((p) => esc(p)).join(' <span class="vz-dot" aria-hidden="true">·</span> ');
    const needsYou = '<a href="#/queue">Open it in Needs you</a>';

    for (const it of D.items) {
      const c = it.content || {};
      const kind = it.item_kind === 'result' ? 'result' : it.item_kind === 'update' ? 'update' : 'work';
      const hidden = !!it.hidden_at;
      const live = !!it.client_visible && !hidden;
      const rejected = !live && !hidden && it.verification_status === 'rejected';
      const period = periodText(it.reporting_period_start, it.reporting_period_end);
      const title = kind === 'result' ? `${c.label || c.metric || it.external_id}${period ? ', ' + period : ''}` : String(c.title || c.label || it.external_id);
      const held = !live && !hidden && !rejected && D.exceptions.find((/** @type {any} */ x) => x.entity_id === it.id && x.reason_code === 'result_outlier');
      /** @type {Row['chip']} */ let chip;
      /** @type {Row['ctl']} */ let ctl;
      let sub = '';
      if (hidden) {
        chip = ['bad', 'Hidden'];
        ctl = { kind: 'again' };
        sub = esc(`Hidden ${dayText(it.hidden_at)} by ${who(it.hidden_by)}: “${clip(it.hidden_reason, 140)}”`);
      } else if (rejected) {
        chip = ['', 'Turned down'];
        ctl = { kind: 'off', off: 'Turned down' };
        sub = 'Turned down. It needs a new version before it can be shown.';
      } else if (live) {
        chip = it.pending_at ? ['info', 'Change waiting'] : it.verification_status === 'stale' ? ['warn', 'Delayed'] : ['good', 'Verified'];
        ctl = { kind: 'switch', on: true };
        const bits = kind === 'result'
          ? [`${c.value != null ? c.value + (c.unit ? ' ' + c.unit : '') : ''}`, c.source || it.source_ref, it.source_observed_at ? `read ${dayText(it.source_observed_at)}` : '']
          : [it.published_at ? `Published ${dayText(it.published_at)} by ${who(it.published_by)}` : '', kind === 'work' && c.service ? C.svcLabel(c.service) : ''];
        sub = dot(bits);
        if (it.pending_at) sub += `${sub ? '<br>' : ''}A new version is waiting for your check. <a href="#/client/${esc(it.tenant_id)}/overview">Open it</a>`;
        if (it.verification_status === 'stale') sub += `${sub ? '<br>' : ''}The source has not updated for a while. They see it marked Delayed.`;
      } else {
        chip = ['you', 'Needs a decision'];
        ctl = { kind: 'decide' };
        const bits = [it.source_kind === 'manager' ? 'Sent by the Dashboard Manager' : it.source_kind === 'integration' ? 'From an integration' : 'Added in the console', it.updated_at ? dayText(it.updated_at) : '', it.publish_requested ? 'The team asked to publish this' : 'Not verified yet'];
        sub = dot(bits);
        if (held) sub += `<br>The new value is far from the last verified one, so it is held. ${needsYou}`;
      }
      rows.push({ key: 'item:' + it.id, type: kind, id: it.id, title, sub, group: hidden || rejected ? 'off' : live ? 'live' : 'decide', chip, ctl, src: it, when: it.updated_at || it.created_at || '' });
    }

    for (const v of D.invoices) {
      const hidden = !!v.hidden_at;
      const live = !!v.client_visible && !hidden;
      const rejected = !live && !hidden && v.verification_status === 'rejected';
      const money = C.money(v.amount_minor, v.currency);
      const title = `${v.invoice_number}${money ? ' · ' + money : ''}${v.due_at ? ' · due ' + dayText(v.due_at) : ''}`;
      const linkOk = !!(v.hosted_payment_url && v.payment_link_approved_at && v.payment_link_approved_url === v.hosted_payment_url);
      const link = !v.hosted_payment_url ? 'No payment link' : linkOk ? `Stripe link approved by ${who(v.payment_link_approved_by)}` : 'Stripe link not approved yet';
      /** @type {Row['chip']} */ let chip;
      /** @type {Row['ctl']} */ let ctl;
      let sub;
      if (hidden) {
        chip = ['bad', 'Hidden'];
        ctl = { kind: 'again' };
        sub = esc(`Hidden ${dayText(v.hidden_at)} by ${who(v.hidden_by)}: “${clip(v.hidden_reason, 140)}”`);
      } else if (rejected) {
        chip = ['', 'Turned down'];
        ctl = { kind: 'off', off: 'Turned down' };
        sub = 'Turned down. It needs a new version before it can be shown.';
      } else if (live) {
        chip = v.pending_at ? ['info', 'Change waiting'] : ['good', 'Approved'];
        ctl = { kind: 'switch', on: true };
        sub = dot([v.status ? v.status.charAt(0).toUpperCase() + v.status.slice(1) : '', link]);
        if (v.pending_at) sub += `<br>A new version is waiting for your check. <a href="#/client/${esc(v.tenant_id)}/overview">Open it</a>`;
      } else {
        chip = ['you', 'Needs a decision'];
        ctl = { kind: 'decide' };
        sub = dot([v.status ? v.status.charAt(0).toUpperCase() + v.status.slice(1) : '', link]);
      }
      rows.push({ key: 'invoice:' + v.id, type: 'invoice', id: v.id, title, sub, group: hidden || rejected ? 'off' : live ? 'live' : 'decide', chip, ctl, src: v, when: v.updated_at || v.issued_at || '' });
    }

    for (const t of D.tasks) {
      if (!t.service || t.status === 'cancelled') continue; // only a card with a service can reach the client's Work page
      const decided = !!t.visibility_decided_at;
      const shown = !!t.client_visible;
      const hideNote = [...D.history].find((/** @type {any} */ h) => h.action === 'task_hidden' && h.detail && h.detail.task === t.id);
      const stage = STAGE[t.status] || t.status;
      const origin = t.multica_identifier ? `From Multica ${t.multica_identifier}` : t.kind === 'request' ? 'From a client request' : 'Added in the console';
      /** @type {Row['chip']} */ let chip;
      /** @type {Row['ctl']} */ let ctl;
      let sub;
      if (!decided) {
        chip = ['you', 'Needs a decision'];
        ctl = { kind: 'decide' };
        sub = dot([C.svcLabel(t.service), stage, origin, 'no decision yet']);
      } else if (shown) {
        chip = [STAGE_TONE[t.status] || '', stage];
        ctl = { kind: 'switch', on: true };
        sub = dot([C.svcLabel(t.service), origin, `Shown ${dayText(t.visibility_decided_at)} by ${who(t.visibility_decided_by)}`]);
      } else {
        chip = ['bad', 'Hidden'];
        ctl = { kind: 'switch', on: false };
        sub = dot([C.svcLabel(t.service), stage, `Hidden ${dayText(t.visibility_decided_at)} by ${who(t.visibility_decided_by)}${hideNote && hideNote.detail.reason ? ': “' + clip(hideNote.detail.reason, 120) + '”' : ''}`]);
      }
      rows.push({ key: 'card:' + t.id, type: 'card', id: t.id, title: t.title, sub, group: !decided ? 'decide' : shown ? 'live' : 'off', chip, ctl, src: t, when: t.updated_at || t.created_at || '' });
    }

    for (const s of D.sections) {
      const hidden = !!s.hidden_at;
      const live = !!s.client_visible && !hidden;
      const draft = !live && !hidden;
      const c = s.content || {};
      /** @type {Row['chip']} */ const chip = live ? ['good', 'Live'] : hidden ? ['bad', 'Hidden'] : ['warn', 'Draft'];
      const bits = live ? [`Published ${dayText(s.published_at)} by ${who(s.published_by)}`, c.title ? clip(c.title, 60) : '']
        : hidden ? [`Hidden ${dayText(s.hidden_at)} by ${who(s.hidden_by)}: “${clip(s.hidden_reason, 120)}”`]
          : [`Saved ${dayText(s.updated_at)} by ${who(s.updated_by)}`, 'Not shown to the client yet'];
      const sub = `${dot(bits)} <span class="vz-dot" aria-hidden="true">·</span> <a href="#/client/${esc(s.tenant_id)}/home">Edit in Home tab</a>`;
      rows.push({ key: 'home:' + s.id, type: 'home', id: s.id, title: SECTIONS[s.section] || s.section, sub, group: live ? 'live' : 'off', chip, ctl: { kind: 'switch', on: live }, src: s, when: s.updated_at || '' });
      void draft;
    }

    const rank = { decide: 0, live: 1, off: 2 };
    rows.sort((a, b) => rank[a.group] - rank[b.group] || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || String(b.when).localeCompare(String(a.when)));
    return rows;
  }

  /* ---- the history, in words --------------------------------------------------------------------------------- */

  /** @param {any} reason */
  const because = (reason) => (reason ? ` Reason: ${esc(clip(reason, 200).replace(/[.\s]+$/, ''))}.` : '');
  /** One history row as a sentence (HTML, with the person in bold). @param {any} C @param {any} D @param {any} r */
  function sentence(C, D, r) {
    const d = r.detail || {};
    const b = (/** @type {string} */ t) => `<strong>${esc(t)}</strong>`;
    const first = (C.current && C.current.doc && C.current.doc.user && C.current.doc.user.firstName) || 'The client';
    const raw = String(r.actor || '');
    const who = b(D.names[raw] || (/^plan_cycle/.test(r.action) && /^user_/.test(raw) ? first : /^user_/.test(raw) ? 'A team member' : 'The system'));
    const q = (/** @type {any} */ t) => `“${esc(clip(t, 90))}”`;
    const item = (/** @type {any} */ id) => D.items.find((/** @type {any} */ x) => x.id === id);
    const itemName = (/** @type {any} */ id, /** @type {any} */ kind) => { const x = item(id); const c = (x && x.content) || {}; return x ? q(c.label || c.title || x.external_id) : kind === 'update' ? 'an update' : kind === 'result' ? 'a result' : 'a work status'; };
    const invoiceName = (/** @type {any} */ n) => (n ? `invoice ${esc(n)}` : 'an invoice');
    const section = (/** @type {any} */ k) => SECTIONS[k] || 'Home';
    switch (r.action) {
      case 'task.created': return `${who} added the card ${q(d.title)}. It stays hidden from the client until someone decides.`;
      case 'task.moved': { const k = D.tasks.find((/** @type {any} */ x) => x.id === d.id); return `${who} moved the card ${k ? q(k.title) : 'a card'} from ${esc(STAGE[d.from] || d.from)} to ${esc(STAGE[d.to] || d.to)}.`; }
      case 'task_shown': return `${who} showed the card ${q(d.title)} on their Work page.`;
      case 'task_hidden': return `${who} hid the card ${q(d.title)}.${because(d.reason)}`;
      case 'task_deleted': return `${who} removed the card ${q(d.title)}. The history keeps it.${because(d.reason)}`;
      case 'dashboard.item.approved': return `${who} ${d.edited ? 'edited and ' : ''}approved ${itemName(d.item, d.kind)} for their dashboard.`;
      case 'dashboard.item.rejectd': case 'dashboard.item.rejected': return `${who} turned down ${itemName(d.item, d.kind)}. Nothing changed on their dashboard.`;
      case 'dashboard.item.hidden': return `${who} hid ${itemName(d.item, d.kind)} from their dashboard.${because(d.reason)}`;
      case 'dashboard.item.auto_published': return `${who} published ${itemName(d.item, d.kind)} to their dashboard automatically.`;
      case 'dashboard.invoice.approved': return `${who} approved ${invoiceName(d.number)} for their billing page.`;
      case 'dashboard.invoice.rejectd': case 'dashboard.invoice.rejected': return `${who} turned down ${invoiceName(d.number)}.`;
      case 'dashboard.invoice.hidden': return `${who} hid ${invoiceName(d.number)} from their billing page.${because(d.reason)}`;
      case 'invoice_link_approved': return `${who} approved the Stripe link for ${invoiceName(d.number)}.`;
      case 'result_entered': return `${who} entered a result: ${esc(String(d.metric || '').replace(/_/g, ' '))} ${esc(d.value)}${d.source ? ', source ' + esc(d.source) : ''}. It waits for a check.`;
      case 'home_section_insert': return d.new && d.new.visible ? `${who} wrote and published the ${section(d.section)} section.` : `${who} saved a draft of the ${section(d.section)} section.`;
      case 'home_section_update': {
        const was = !!(d.old && d.old.visible);
        const now = !!(d.new && d.new.visible);
        if (!was && now) return `${who} published the ${section(d.section)} section.`;
        if (was && !now) return `${who} hid the ${section(d.section)} section.${because(d.reason)}`;
        const same = JSON.stringify((d.old || {}).content) === JSON.stringify((d.new || {}).content);
        return same ? `${who} saved the ${section(d.section)} section again.` : `${who} edited the ${now ? 'live' : 'draft'} ${section(d.section)} section.`;
      }
      case 'usage_added': return `${who} counted ${esc(d.qty)} for ${esc(String(d.metric || '').replace(/_/g, ' '))}${d.counted === false ? ' (not counted against the limit)' : ''}.`;
      case 'usage_voided': return `${who} took back ${esc(d.qty)} counted for ${esc(String(d.metric || '').replace(/_/g, ' '))}.${because(d.reason)}`;
      case 'plan_cycle_insert': case 'plan_cycle_update': return `${who} ${r.action === 'plan_cycle_insert' ? 'set up' : 'changed'} the plan month that starts ${esc(dayText(d.period_start))}.${because(d.reason)}`;
      default: return `${who} ${esc(String(r.action).replace(/[._]/g, ' '))}.`;
    }
  }

  /** The history column. @param {any} C @param {any} D @param {boolean} all */
  function historyHtml(C, D, all) {
    const rows = D.history;
    if (!rows.length) return '<p class="meta">Nothing recorded yet. Every show, hide and edit lands here.</p>';
    const draw = (/** @type {any[]} */ list) => `<ol class="vz-hist">${list.map((/** @type {any} */ r, /** @type {number} */ i) => `<li${all && i === 10 ? ' id="vz-h11" tabindex="-1"' : ''}><time datetime="${esc(r.at)}">${esc(stamp(r.at))}</time><p>${sentence(C, D, r)}</p></li>`).join('')}</ol>`;
    const cut = all ? rows.length : 10;
    const more = rows.length - cut;
    return `${draw(rows.slice(0, cut))}${more > 0 ? `<button class="linkish vz-more" type="button" data-vz="older">Show ${more} older</button>` : ''}`;
  }

  /* ---- the inline prompts ---------------------------------------------------------------------------------------- */

  /**
   * A short form that asks why, under a row or inside a card: not a browser dialog. The button says what will happen.
   * @param {{id: string, mode: string, lead: string, text: string, label: string, hint?: string, placeholder?: string, ok: string, max?: number, back?: string}} o
   */
  function reasonForm(o) {
    return `<form class="vz-pform" data-mode="${esc(o.mode)}" novalidate>
      <div class="vz-pf-copy"><strong>${esc(o.lead)}</strong><p>${esc(o.text)}</p></div>
      <div class="field"><label for="${esc(o.id)}">${esc(o.label)}</label><input id="${esc(o.id)}" name="reason" type="text" maxlength="${o.max || 500}" autocomplete="off" placeholder="${esc(o.placeholder || '')}" required aria-describedby="${esc(o.id)}-h"><p class="hint" id="${esc(o.id)}-h">${esc(o.hint || 'It is saved in the history, with your name and the time.')}</p></div>
      <div class="vz-pf-actions"><button class="btn btn-danger btn-sm" type="submit">${esc(o.ok)}</button><button class="btn btn-quiet btn-sm" type="button" data-vz="${esc(o.back || 'cancel')}">${o.back ? 'Back' : 'Cancel'}</button></div>
    </form>`;
  }

  /** A short place to read a Stripe link from: its host and the end of its path. @param {string} url */
  function linkText(url) {
    try { const u = new URL(url); const p = u.pathname.length > 38 ? u.pathname.slice(0, 20) + '...' + u.pathname.slice(-14) : u.pathname; return u.host + p; } catch (e) { return clip(url, 60); }
  }

  /** The panel under a row, for the open mode. @param {any} C @param {Row} row @param {string} mode @param {string} client */
  function panelHtml(C, row, mode, client) {
    const t = `“${clip(row.title, 80)}”`;
    const where = WHERE[/** @type {'result'} */ (row.type)];
    const forever = row.type === 'result' || row.type === 'update' || row.type === 'work' || row.type === 'invoice';
    const uid = 'vz-r-' + row.key.replace(/[^a-z0-9]/gi, '');
    if (mode === 'hide') {
      return reasonForm({ id: uid, mode, lead: `Hide ${t} from ${client}?`, text: `It leaves ${where} the next time they open it. The history keeps it.${forever ? ' It cannot be shown again from here yet.' : ' You can show it again later.'}`, label: 'Why are you hiding it?', placeholder: row.type === 'card' ? 'For example: internal, not for the client' : 'For example: the photo was wrong', ok: 'Hide it' });
    }
    if (mode === 'keep') {
      return reasonForm({ id: uid, mode, lead: `Keep ${t} hidden from ${client}?`, text: 'Nothing changes on their side. It stays in this list, and the history keeps your decision.', label: 'Why keep it hidden?', placeholder: row.type === 'card' ? 'For example: internal work' : 'For example: the number needs another check', ok: 'Keep it hidden', back: 'decide-back' });
    }
    if (mode === 'again') {
      return `<div class="vz-pform vz-info"><div class="vz-pf-copy"><strong>This cannot be shown again from here yet</strong><p>Hidden results, updates and invoices stay hidden: the database has no step that brings one back. If it was hidden by mistake, add a corrected one instead. The history keeps what happened.</p></div><div class="vz-pf-actions"><button class="btn btn-quiet btn-sm" type="button" data-vz="cancel">Close</button></div></div>`;
    }
    // show, or decide
    const inv = row.type === 'invoice' ? row.src : null;
    const url = inv ? (inv.pending_row && inv.pending_row.hosted_payment_url) || inv.hosted_payment_url : '';
    const linkNeeds = !!(inv && url && !(inv.payment_link_approved_at && inv.payment_link_approved_url === url));
    const first = mode === 'decide' ? `Show ${t} to ${client}?` : `Show ${t} to ${client} again?`;
    const body = row.type === 'card' ? 'They see its title, stage and due date on their Work page.'
      : row.type === 'invoice' ? 'It goes on their Billing page with its amount and due date.'
        : row.type === 'home' ? 'The section goes live on their Home page now.'
          : `It goes live on ${where} the next time they open it.`;
    const linkBlock = linkNeeds
      ? `<div class="vz-link"><p>Their Pay button opens this Stripe link. Open it and check it is the right invoice first.</p><p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(linkText(url))}</a></p><label class="vz-check"><input type="checkbox" name="link" data-vz="link"> I checked the link. It opens the right invoice.</label></div>`
      : inv && url ? '<p class="meta">The Stripe link was approved already.</p>' : '';
    return `<form class="vz-pform" data-mode="show" novalidate>
      <div class="vz-pf-copy"><strong>${esc(first)}</strong><p>${esc(body)}${mode === 'decide' ? ' Until you decide, they see nothing.' : ''}</p></div>
      ${linkBlock}
      <div class="vz-pf-actions"><button class="btn btn-sm" type="submit"${linkNeeds ? ' disabled data-needs-link' : ''}>${linkNeeds ? 'Show it and approve the link' : 'Show to client'}</button>${mode === 'decide' ? '<button class="btn btn-quiet btn-sm" type="button" data-vz="keep">Keep it hidden</button>' : ''}<button class="btn btn-quiet btn-sm" type="button" data-vz="cancel">Cancel</button></div>
    </form>`;
  }

  /* ---- the tab ----------------------------------------------------------------------------------------------- */

  /**
   * @param {any} C window.D8C @param {HTMLElement} box @param {string} part @param {any} got
   */
  function render(C, box, part, got) {
    void part; void got;
    const target = C.current;
    if (!target) return;
    const id = target.id;
    const client = target.name;
    /** @type {{D: any, rows: Row[], filter: string, open: {key: string, mode: string}|null, all: boolean}} */
    const st = { D: null, rows: [], filter: 'all', open: null, all: false };
    /** Is this tab still the one on screen? */
    const here = () => box.isConnected && C.current && C.current.id === id;

    const cleanForms = () => { for (const f of Array.from(C.dirty.keys())) if (box.contains(/** @type {any} */ (f))) C.clean(f); };

    box.innerHTML = `<section class="vz" aria-labelledby="vz-h">
      <header class="vz-head"><h2 id="vz-h">What they see</h2><p>Every item on ${esc(client)}'s dashboard, who decided it, and the history of every change. New items start hidden until you decide.</p></header>
      ${C.skeleton(3)}</section>`;

    function counts() {
      const n = { live: 0, off: 0, decide: 0 };
      for (const r of st.rows) n[r.group]++;
      return n;
    }

    function tableRows() {
      const list = st.rows.filter((r) => st.filter === 'all' || r.group === st.filter);
      if (!list.length) return `<tr class="vz-none"><td colspan="4">${st.rows.length ? 'Nothing here with that filter.' : `Nothing client-facing for ${esc(client)} yet. Results, updates, cards, invoices and Home sections show here the moment they exist. They start hidden.`}</td></tr>`;
      const owner = !!(C.me && C.me.role === 'super_admin');
      return list.map((r) => {
        const open = st.open && st.open.key === r.key ? st.open.mode : '';
        const locked = r.ctl.kind === 'switch' && r.ctl.on && (r.type !== 'card' && r.type !== 'home') && !owner;
        let ctl;
        if (r.ctl.kind === 'switch') {
          const on = !!r.ctl.on;
          ctl = `<button class="vz-sw" type="button" role="switch" aria-checked="${on}" data-vz="toggle" data-key="${esc(r.key)}"${locked ? ' disabled aria-describedby="vz-owner" title="Only an owner can hide this"' : ''} aria-label="Client sees: ${esc(clip(r.title, 70))}"><span class="vz-knob" aria-hidden="true"></span></button><span class="vz-sw-word" aria-hidden="true">${on ? 'Shown' : 'Hidden'}</span>`;
        } else if (r.ctl.kind === 'decide') ctl = `<button class="btn btn-quiet btn-sm" type="button" data-vz="decide" data-key="${esc(r.key)}" aria-expanded="${open === 'decide' || open === 'keep'}" aria-label="Decide: ${esc(clip(r.title, 70))}">Decide</button>`;
        else if (r.ctl.kind === 'again') ctl = `<button class="btn btn-quiet btn-sm" type="button" data-vz="again" data-key="${esc(r.key)}" aria-expanded="${open === 'again'}" aria-label="Show again: ${esc(clip(r.title, 70))}">Show again</button>`;
        else ctl = `<span class="vz-sw-word">${esc(r.ctl.off || 'Not shown')}</span>`;
        const row = `<tr class="vz-row is-${r.group}${open ? ' is-open' : ''}" data-key="${esc(r.key)}">
          <td class="vz-c-type"><span class="vz-type">${esc(TYPES[/** @type {'result'} */ (r.type)])}</span></td>
          <td class="vz-c-item"><span class="vz-title">${esc(r.title)}</span><span class="vz-sub">${r.sub}</span></td>
          <td class="vz-c-status"><span class="chip${r.chip[0] ? ' ' + r.chip[0] : ''}">${esc(r.chip[1])}</span></td>
          <td class="vz-c-ctl"><div class="vz-ctl">${ctl}</div></td></tr>`;
        return open ? `${row}<tr class="vz-panel"><td colspan="4">${panelHtml(C, r, open, client)}</td></tr>` : row;
      }).join('');
    }

    function draw(focus) {
      cleanForms();
      const D = st.D;
      const n = counts();
      const fresh = C.pageFresh({ updatedAt: D.at, source: 'Console and the database', status: D.errors.length ? 'delayed' : 'ok', label: D.errors.length ? 'Some lists did not load' : undefined });
      const filters = [['all', 'All', st.rows.length], ['decide', 'Needs a decision', n.decide], ['live', 'Shown', n.live], ['off', 'Hidden', n.off]];
      const summary = [`${n.live} shown`, `${n.off} hidden`, n.decide ? `${n.decide} waiting for a decision` : 'nothing waiting for a decision'].join(' · ');
      const lockedNote = st.rows.some((r) => r.ctl.kind === 'again') ? '<p class="meta vz-foot">Hidden results, updates and invoices stay hidden: the database has no step that brings one back. Cards and Home sections can be shown again.</p>' : '';
      box.innerHTML = `<section class="vz" aria-labelledby="vz-h">
        <header class="vz-head"><h2 id="vz-h">What they see</h2><p>Every item on ${esc(client)}'s dashboard, who decided it, and the history of every change. New items start hidden until you decide.</p></header>
        ${fresh}
        ${D.errors.length ? `<p class="notice bad" role="alert">These did not load: ${esc(D.errors.join(', '))}. What you see below is correct but not complete. <button class="linkish" type="button" data-vz="reload">Try again</button></p>` : ''}
        <div class="vz-cols">
          <section class="panel vz-main" aria-labelledby="vz-list-h">
            <div class="panel-head"><h3 id="vz-list-h">Client-facing items</h3><p class="vz-count" aria-live="polite">${esc(summary)}</p></div>
            <div class="seg vz-filter" role="group" aria-label="Show">${filters.map(([k, label, c]) => `<button type="button" data-vz="filter" data-filter="${k}" aria-pressed="${st.filter === k}">${label}<span class="count${k === 'decide' && c ? '' : ' quiet'}">${c}</span></button>`).join('')}</div>
            <div class="vz-tablewrap"><table class="vz-table"><caption class="sr-only">Everything ${esc(client)} can see, or could see once someone decides</caption>
              <thead><tr><th scope="col">Type</th><th scope="col">Item</th><th scope="col">Status</th><th scope="col">Client sees</th></tr></thead>
              <tbody>${tableRows()}</tbody></table></div>
            <p id="vz-owner" class="sr-only">Only an owner can hide results, updates and invoices.</p>
            ${lockedNote}
          </section>
          <aside class="panel vz-side" aria-labelledby="vz-hist-h">
            <h3 id="vz-hist-h">History</h3>
            <p class="meta">Kept forever. Clients never see this.</p>
            ${historyHtml(C, D, st.all)}
          </aside>
        </div></section>`;
      const form = box.querySelector('.vz-pform');
      // A typed reason counts as unsaved, so a quiet refresh keeps it and leaving the page asks first.
      if (form && form.querySelector('input[name="reason"]')) C.track(/** @type {HTMLFormElement} */ (form), form.getAttribute('data-mode') === 'keep' ? 'Reason to keep it hidden' : 'Reason to hide');
      if (focus) {
        const el = /** @type {HTMLElement|null} */ (box.querySelector(focus));
        if (el) el.focus({ preventScroll: false });
      } else if (st.open) {
        const el = /** @type {HTMLElement|null} */ (box.querySelector('.vz-panel input[name="reason"], .vz-panel input[name="link"], .vz-panel .btn'));
        if (el) el.focus({ preventScroll: true });
      }
    }

    async function reload(focus) {
      try {
        st.D = await load(C, id);
        if (!here()) return;
        st.rows = buildRows(C, st.D);
        if (st.open && !st.rows.some((r) => r.key === st.open.key)) st.open = null;
        draw(focus);
      } catch (e) {
        if (here()) box.innerHTML = `<section class="vz"><p class="notice bad" role="alert">This tab could not load: ${esc(C.message(e))}. Nothing was changed. <button class="linkish" type="button" data-vz="reload">Try again</button></p></section>`;
      }
    }

    /** Runs one decision, then reloads. @param {Row} row @param {string} mode @param {string} reason @param {boolean} approveLink */
    async function perform(row, mode, reason, approveLink) {
      const client2 = await C.db();
      const src = row.src;
      let said;
      if (row.type === 'card') {
        const visible = mode === 'show';
        ok(await client2.rpc('set_task_visibility', visible ? { p_task: src.id, p_visible: true } : { p_task: src.id, p_visible: false, p_reason: reason }));
        said = visible ? 'Shown. It is on their Work page the next time they open it.' : 'Hidden. It leaves their Work page on their next load. The history keeps it.';
        // Other tabs read the card from the cache: keep it in step.
        const mine = (/** @type {any} */ x) => x && x.id === src.id;
        for (const list of [C.current && C.current.tasks, C.all && C.all.tasks]) { const k = (list || []).find(mine); if (k) { k.client_visible = visible; k.visibility_decided_at = new Date().toISOString(); k.visibility_decided_by = C.me && C.me.userId; } }
      } else if (row.type === 'home') {
        const visible = mode === 'show';
        ok(await client2.from('client_home_sections').update(visible ? { client_visible: true } : { client_visible: false, hidden_reason: reason }).eq('id', src.id).select('*').single());
        said = visible ? 'Shown. It is on their Home page now.' : 'Hidden. It leaves their Home page on their next load. The history keeps it.';
      } else if (row.type === 'invoice') {
        if (mode === 'show') {
          ok(await client2.rpc('review_billing_invoice_v2', { p_invoice_id: src.id, p_decision: 'approve', p_note: null, p_approve_link: !!approveLink, p_expected: src.updated_at || null }));
          said = 'Shown. The invoice is on their Billing page now.';
        } else if (mode === 'keep') {
          ok(await client2.rpc('review_billing_invoice_v2', { p_invoice_id: src.id, p_decision: 'reject', p_note: reason, p_approve_link: false, p_expected: src.updated_at || null }));
          said = 'Kept hidden. Nothing changed on their Billing page.';
        } else {
          await C.callFn('dashboard-recovery', { action: 'hide', targetType: 'billing-invoice', itemId: src.id, reason });
          said = 'Hidden. The invoice leaves their Billing page on their next load. The history keeps it.';
        }
      } else {
        // A result that was held for a check (its number fell a long way) has a Needs you item: deciding it here closes that item too.
        const closeHeld = async (/** @type {string} */ note) => {
          let failed = false;
          for (const x of st.D.exceptions.filter((/** @type {any} */ e) => e.entity_id === src.id && e.reason_code === 'result_outlier')) {
            try { ok(await client2.rpc('resolve_dashboard_exception', { p_id: x.id, p_status: 'resolved', p_note: note })); } catch (e) { failed = true; }
          }
          return failed ? ' The matching Needs you item is still open: close it there.' : '';
        };
        if (mode === 'show') {
          ok(await client2.rpc('review_dashboard_item', { p_item_id: src.id, p_decision: 'approve', p_note: null, p_expected: src.updated_at || null }));
          said = `Shown. It is on ${WHERE[/** @type {'result'} */ (row.type)]} now.${await closeHeld('Checked and published from the Visible tab.')}`;
        } else if (mode === 'keep') {
          ok(await client2.rpc('review_dashboard_item', { p_item_id: src.id, p_decision: 'reject', p_note: reason, p_expected: src.updated_at || null }));
          said = `Kept hidden. Nothing changed on their dashboard.${await closeHeld(`Kept hidden from the Visible tab: ${clip(reason, 200)}`)}`;
        } else {
          await C.callFn('dashboard-recovery', { action: 'hide', targetType: 'dashboard-item', itemId: src.id, reason });
          said = `Hidden. It leaves ${WHERE[/** @type {'result'} */ (row.type)]} on their next load. The history keeps it.`;
        }
      }
      return said;
    }

    box.addEventListener('click', async (e) => {
      const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-vz]'));
      if (!b || !box.contains(b)) return;
      const act = b.getAttribute('data-vz');
      const key = b.getAttribute('data-key') || (st.open && st.open.key) || '';
      const row = st.rows.find((r) => r.key === key);
      const focusRow = (/** @type {string} */ k, /** @type {string} */ what) => `tr[data-key="${k}"] ${what}`;
      if (act === 'filter') { st.filter = b.getAttribute('data-filter') || 'all'; st.open = null; draw(`[data-filter="${st.filter}"]`); return; }
      if (act === 'older') { st.all = true; draw('#vz-h11'); return; }
      if (act === 'reload') { await reload(); return; }
      if (act === 'cancel') { const k = st.open && st.open.key; st.open = null; draw(k ? focusRow(k, '[data-vz]') : ''); return; }
      if (!row) return;
      if (act === 'toggle') {
        // An open prompt for this row closes; a switch that is on opens "hide", one that is off opens "show".
        if (st.open && st.open.key === key) { st.open = null; draw(focusRow(key, '[data-vz="toggle"]')); return; }
        st.open = { key, mode: row.ctl.on ? 'hide' : 'show' };
        draw();
        return;
      }
      if (act === 'decide') { st.open = st.open && st.open.key === key ? null : { key, mode: 'decide' }; draw(st.open ? '' : focusRow(key, '[data-vz="decide"]')); return; }
      if (act === 'again') { st.open = st.open && st.open.key === key ? null : { key, mode: 'again' }; draw(st.open ? '' : focusRow(key, '[data-vz="again"]')); return; }
      if (act === 'keep') { st.open = { key, mode: 'keep' }; draw(); return; }
      if (act === 'decide-back') { st.open = { key, mode: 'decide' }; draw(); return; }
    });
    box.addEventListener('change', (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      if (t && t.getAttribute && t.getAttribute('data-vz') === 'link') {
        const go = /** @type {HTMLButtonElement|null} */ (box.querySelector('.vz-pform button[data-needs-link]'));
        if (go) go.disabled = !t.checked;
      }
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && st.open) { const k = st.open.key; st.open = null; draw(`tr[data-key="${k}"] [data-vz]`); }
    });
    box.addEventListener('submit', async (e) => {
      const f = /** @type {HTMLFormElement} */ (e.target);
      if (!f.classList || !f.classList.contains('vz-pform') || !st.open) return;
      e.preventDefault();
      const row = st.rows.find((r) => r.key === (st.open && st.open.key));
      if (!row) return;
      const mode = f.getAttribute('data-mode') || 'show';
      const reason = C.val(f, 'reason');
      if ((mode === 'hide' || mode === 'keep') && !reason) {
        const inp = /** @type {HTMLInputElement|null} */ (f.querySelector('input[name="reason"]'));
        if (inp) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); }
        C.toast('Say why first. A reason is needed, and it goes in the history.', true);
        return;
      }
      const link = /** @type {HTMLInputElement|null} */ (f.querySelector('input[name="link"]'));
      if (link && !link.checked) { C.toast('Tick the box to confirm you checked the Stripe link.', true); link.focus(); return; }
      const btn = /** @type {HTMLButtonElement} */ (f.querySelector('button[type="submit"]'));
      const done = C.busy(btn, 'Saving');
      try {
        const said = await perform(row, mode, reason, !!link);
        C.clean(f);
        st.open = null;
        C.toast(said);
        await reload(`tr[data-key="${row.key}"] [data-vz]`);
        // The queue, the badges and the other tabs read the whole record: bring them up to date without redrawing this page.
        C.loadAll().catch(() => { /* the message above is already true */ });
      } catch (x) {
        done();
        C.toast(failText(C, x), true);
        if (wasStale(x)) { st.open = null; await reload(); }
      }
    });

    reload();
  }

  EXT.tabs.visible = { label: 'Visible', after: 'talk', render };

  /** What the Home tab shares: the words, the refusals as sentences, the history as sentences and the prompt. */
  EXT.visible = { explain, ok, wasStale, failText, load, sentence, historyHtml, reasonForm, stamp, dayText, timeText, periodText, clip, whoIs, SECTIONS };
})();
