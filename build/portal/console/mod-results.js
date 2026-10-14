/*
 * Result entry (C9, 2026-10-13): a client's Results tab. A number reaches the client only with a value, a period, a named source, a read
 * time and a person's check. Entering one writes a pending, hidden client_dashboard_items row through add_result_item (a value more than 40%
 * away from the last verified one is held and opens result_outlier in Needs you); publishing it is the usual staff review
 * (review_dashboard_item). "Client sees now" reads client_results_current.
 *
 * Registered as the Results tab: window.D8C_EXT.tabs.results. console.js builds the tab bar and calls render(C, box, part, got);
 * `part` can be the id of one waiting result (#/client/<id>/results/<item id>), which opens it for its check.
 * Reads window.D8C only when it runs, because console.js has not run yet when this file loads.
 */
(function () {
  'use strict';
  /** @type {any} */
  const EXT = ((/** @type {any} */ (window)).D8C_EXT = (/** @type {any} */ (window)).D8C_EXT || {});
  EXT.tabs = EXT.tabs || {};

  /** The numbers a restaurant is usually shown: key (what the database stores), the words the client reads, the unit and the service. "Another metric" adds to this list for one entry. */
  const CATALOG = [
    { key: 'website_visits', label: 'Website visits', unit: 'visits', service: 'website' },
    { key: 'website_bookings', label: 'Bookings from your website', unit: 'bookings', service: 'website' },
    { key: 'google_calls', label: 'Calls from Google', unit: 'calls', service: 'local' },
    { key: 'direction_requests', label: 'Direction requests on Google', unit: 'requests', service: 'local' },
    { key: 'profile_views', label: 'Views of your Google profile', unit: 'views', service: 'local' },
    { key: 'instagram_views', label: 'Post views on Instagram', unit: 'views', service: 'social' },
    { key: 'facebook_views', label: 'Post views on Facebook', unit: 'views', service: 'social' },
    { key: 'ad_clicks', label: 'Clicks from ads to your booking page', unit: 'clicks', service: 'advertising' },
    { key: 'ads_leads', label: 'Leads from ads', unit: 'leads', service: 'advertising' }
  ];
  const MAX_PROOF_BYTES = 10 * 1024 * 1024;
  const PROOF_TYPES = /^(image\/(png|jpe?g|webp)|application\/pdf|text\/csv)$/i;

  /** @returns {any} */
  const C = () => /** @type {any} */ (window).D8C;
  /** @param {any} s */
  const E = (s) => C().esc(s);
  /** 2,240. @param {any} n */
  const num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(n));
  /** "Aug 2026" for a whole calendar month, otherwise "1 Sep to 14 Sep 2026". @param {string} a @param {string} b */
  function periodText(a, b) {
    const s = new Date(String(a).slice(0, 10) + 'T00:00');
    const e = new Date(String(b).slice(0, 10) + 'T00:00');
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
    const whole = s.getDate() === 1 && e.getMonth() === s.getMonth() && e.getFullYear() === s.getFullYear() && new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate() === e.getDate();
    if (whole) return s.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    const f = (/** @type {Date} */ d, /** @type {boolean} */ y) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) });
    return `${f(s, s.getFullYear() !== e.getFullYear())} to ${f(e, true)}`;
  }
  /** "Wed 2 Sep". @param {string} iso */
  const dayText = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`; };
  /** The words for a failed call (the database's message, said plainly). @param {any} err */
  function explain(err) {
    const said = String((err && err.message) || '');
    const code = String((err && err.code) || '');
    /** @param {string} t */
    const make = (t) => Object.assign(new Error(t), { code });
    if (code === '23505') return make('A number for this metric and period end is already saved. Open it from Waiting for a check, or pick a different period end.');
    if (/bad-metric/.test(said)) return make('That metric name cannot be saved. Use letters and numbers, starting with a letter.');
    if (/value-and-period-required/.test(said)) return make('The value, and a period that starts on or before the day it ends, are needed.');
    if (/named-source-and-read-time-required/.test(said)) return make('Name the source, and give the time it was read (not in the future).');
    if (/bad-proof-path/.test(said)) return make('The proof file name cannot be used. Rename the file with letters and numbers and attach it again.');
    if (/^stale/.test(said)) return make('It changed since you opened it. Reload the page to see the newest.');
    if (/nothing-to-approve/.test(said)) return make('There is nothing new to publish here. Reload the page.');
    if (/^hidden/.test(said)) return make('This was hidden from the client, so it cannot be published from here.');
    if (/not-found/.test(said) || code === 'P0002') return make('Someone already dealt with this. Reload the page.');
    if (/not-staff/.test(said) || code === '42501') return make('Your sign-in is not on the Domin8te team. Sign out and in again.');
    return make(said || 'That did not work. Nothing was changed.');
  }
  /** @param {any} res @returns {any} */
  function ok(res) { if (res && res.error) throw explain(res.error); return res ? res.data : null; }

  /**
   * PROOF UPLOAD: isolated on purpose, and the only place this tab talks to Storage.
   * The real thing keeps the screenshot or export in the private, staff-only bucket "result-proof". That bucket and its two policies
   * (staff read, staff add) are made by migration 20261013010500_results_and_exceptions.sql on the TEST project; this code creates and
   * changes nothing there. add_result_item accepts only a path of the form "<tenant id>/<file name>" (letters, digits . _ - up to 120).
   * The preview has no Storage, so there only the file name is kept.
   * @param {string} tenantId @param {File} file @returns {Promise<string>} the path to give add_result_item
   */
  async function uploadProof(tenantId, file) {
    const clean = String(file.name || 'proof').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-100) || 'proof';
    const path = `${tenantId}/${Date.now().toString(36)}-${clean}`.slice(0, tenantId.length + 1 + 120);
    const client = await C().db();
    if (!client.storage) return path;   // the preview: nothing is uploaded
    const res = await client.storage.from('result-proof').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (res.error) throw new Error(`The proof file could not be uploaded (${res.error.message}). Nothing was saved.`);
    return path;
  }

  /* ---- the page -------------------------------------------------------------------------------------------------------------- */

  /** One tab's state, kept while it is on screen. @typedef {{tenantId: string, items: any[], now: any[], file: File|null, openId: string, savedHere: any}} Page */

  /** @param {any} C @param {HTMLElement} box @param {string} part @param {any} got */
  function render(C, box, part, got) {
    const prev = /** @type {any} */ (box).__rs;
    if (prev) prev.abort();
    const ac = new AbortController();
    /** @type {any} */ (box).__rs = ac;
    /** @type {Page} */
    const P = { tenantId: C.current.id, items: [], now: [], file: null, openId: /^[\w-]{6,}$/.test(part || '') ? part : '', savedHere: null };
    box.innerHTML = C.skeleton(2);
    load(C, P).then(() => { if (box.isConnected && !ac.signal.aborted) draw(C, box, P, ac.signal); }, (e) => {
      if (box.isConnected) box.innerHTML = `<p class="notice bad">${E(C.message(e))}</p>`;
    });
  }
  EXT.tabs.results = { label: 'Results', after: 'work', render };

  /** Reads this client's result rows and what the client sees now. @param {any} C @param {Page} P */
  async function load(C, P) {
    const db = await C.db();
    const [items, now] = await Promise.all([
      db.from('client_dashboard_items').select('*').eq('tenant_id', P.tenantId).eq('item_kind', 'result'),
      db.rpc('client_results_current')
    ]);
    P.items = (ok(items) || []).slice().sort((/** @type {any} */ a, /** @type {any} */ b) => String(b.reporting_period_end).localeCompare(String(a.reporting_period_end)));
    // client_results_current gives every client's rows to staff: this page keeps its own client's
    P.now = (ok(now) || []).filter((/** @type {any} */ r) => r.tenant_id === P.tenantId);
  }

  /** The open result_outlier item for a result row, or null. @param {any} C @param {any} item */
  const holdOf = (C, item) => ((C.all.reviews && C.all.reviews.exceptions) || []).find((/** @type {any} */ x) => x.status === 'open' && x.reason_code === 'result_outlier' && x.entity_id === item.id) || null;
  /** The metric as one entry of the list: from the catalog, or built from the saved row. @param {string} key @param {any} [row] */
  function metricInfo(key, row) {
    const known = CATALOG.find((m) => m.key === key);
    if (known) return known;
    const c = (row && row.content) || {};
    return { key, label: String(c.label || key), unit: String(c.unit || ''), service: c.service || '' };
  }

  /** The numbers behind the form: what is entered, and what is still missing. @param {HTMLFormElement|null} f @param {any} C @param {Page} P */
  function read(f, C, P) {
    const opened = P.openId ? P.items.find((/** @type {any} */ i) => i.id === P.openId) : null;
    if (opened) {
      const c = opened.content || {};
      return {
        opened, metric: String(c.metric || ''), label: String(c.label || c.metric || ''), unit: String(c.unit || ''), service: String(c.service || ''),
        value: Number(c.value), valueText: String(c.value), start: String(opened.reporting_period_start || '').slice(0, 10), end: String(opened.reporting_period_end || '').slice(0, 10),
        source: String(c.source || ''), readAt: opened.source_observed_at ? new Date(opened.source_observed_at) : null, proof: String(c.proof || ''), proofName: String(c.proof || '').split('/').pop() || ''
      };
    }
    const g = (/** @type {string} */ name) => (f && f.elements.namedItem(name) ? String(/** @type {any} */ (f.elements.namedItem(name)).value || '').trim() : '');
    const sel = g('metric');
    const other = sel === '__other';
    const info = other ? { key: slug(g('label')), label: g('label'), unit: g('unit'), service: g('service') } : metricInfo(sel);
    const valueText = g('value').replace(/,/g, '');
    const readRaw = g('readAt');
    return {
      opened: null, metric: info.key || '', label: info.label || '', unit: info.unit || '', service: info.service || '',
      value: valueText === '' ? NaN : Number(valueText), valueText, start: g('start'), end: g('end'), source: g('source'),
      readAt: readRaw ? new Date(readRaw) : null, proof: P.file ? P.file.name : '', proofName: P.file ? P.file.name : ''
    };
  }
  /** A label as the database's metric name: letters, digits and underscores, starting with a letter. @param {string} s */
  const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^([0-9])/, 'm_$1').slice(0, 40);

  /** What is present, in the order of the checklist. @param {any} r a read() result */
  function checks(r) {
    const nowMs = Date.now();
    return {
      value: Number.isFinite(r.value) && r.valueText !== '' && /^-?[0-9]*\.?[0-9]+$/.test(String(r.valueText)),
      period: !!(r.start && r.end && r.start <= r.end),
      source: !!(r.source && r.readAt && !isNaN(r.readAt.getTime()) && r.readAt.getTime() <= nowMs + 5 * 60000),
      proof: !!r.proof,
      metric: !!(r.metric && /^[a-z][a-z0-9_]{1,40}$/.test(r.metric))
    };
  }
  /** How far a new value is from the last verified one for the metric: { last, pct } when it would be held (more than 40 percent away), else null. @param {any} C @param {Page} P @param {any} r */
  function jump(C, P, r) {
    if (!r.metric || !Number.isFinite(r.value)) return null;
    const last = P.now.find((/** @type {any} */ x) => x.metric_key === r.metric && (!r.opened || x.id !== r.opened.id));
    const was = last && last.content ? Number(last.content.value) : NaN;
    if (!Number.isFinite(was) || was === 0) return null;
    const pct = Math.round(((r.value - was) / Math.abs(was)) * 100);
    return Math.abs(r.value - was) / Math.abs(was) > 0.4 ? { last, was, pct } : null;
  }

  /** The two columns. @param {any} C @param {HTMLElement} box @param {Page} P @param {AbortSignal} signal */
  function draw(C, box, P, signal) {
    const t = C.current;
    const opened = P.openId ? P.items.find((/** @type {any} */ i) => i.id === P.openId) : null;
    if (P.openId && !opened) P.openId = '';
    const waiting = P.items.filter((/** @type {any} */ i) => i.verification_status === 'pending' && !i.hidden_at);
    const failed = !!(C.all.reviews && C.all.reviews.error);
    const metrics = CATALOG.concat(P.items.map((/** @type {any} */ i) => metricInfo(String((i.content || {}).metric || ''), i)).filter((/** @type {any} */ m) => m.key && !CATALOG.some((c) => c.key === m.key)));
    const uniq = metrics.filter((m, i) => metrics.findIndex((x) => x.key === m.key) === i);
    const frozen = !!opened;
    const c0 = (opened && opened.content) || {};
    box.innerHTML = `${C.pageFresh({ updatedAt: C.all.at, source: 'Console results, as verified by the team', status: failed ? 'delayed' : 'ok', label: failed ? 'Some data did not load' : undefined })}
      <div class="rs-head"><div><h2>${frozen ? 'Check a result' : 'Add or check a result'}</h2><p class="meta">A number only reaches the client with a value, a period, a named source and a check.</p></div>
        ${frozen ? '<a class="btn btn-quiet btn-sm" href="#/client/' + E(t.id) + '/results" data-rs-new>Enter a new result</a>' : ''}</div>
      <div class="rs-grid">
        <form class="panel rs-form" id="rs-form" novalidate>
          <div class="grid-2">
            <div class="field"><label for="rs-metric">Metric</label>
              <select id="rs-metric" name="metric"${frozen ? ' disabled' : ''}>${uniq.map((m) => `<option value="${E(m.key)}"${(frozen ? m.key === c0.metric : m.key === 'website_visits') ? ' selected' : ''}>${E(m.label)}</option>`).join('')}${frozen ? '' : '<option value="__other">Another metric</option>'}</select></div>
            <div class="field"><label for="rs-value">Value</label><div class="rs-unit"><input id="rs-value" name="value" type="text" inputmode="decimal" autocomplete="off" placeholder="940" value="${E(opened ? c0.value : '')}"${frozen ? ' disabled' : ''}><span class="rs-suffix" data-rs-unit>${E(frozen ? c0.unit || '' : '')}</span></div></div>
            <div class="field" data-rs-other hidden><label for="rs-label">What it is called</label><input id="rs-label" name="label" type="text" maxlength="80" placeholder="Table bookings"><p class="hint">The client reads this name.</p></div>
            <div class="field" data-rs-other hidden><label for="rs-unit">Unit (optional)</label><input id="rs-unit" name="unit" type="text" maxlength="30" placeholder="bookings"></div>
            <div class="field" data-rs-other hidden><label for="rs-service">Service</label><select id="rs-service" name="service"><option value="">None</option>${C.SERVICE_ORDER.map((/** @type {string} */ s) => `<option value="${E(s)}">${E(C.svcLabel(s))}</option>`).join('')}</select></div>
            <div class="field"><label for="rs-start">Period start</label><input id="rs-start" name="start" type="date" value="${E(opened ? String(opened.reporting_period_start).slice(0, 10) : '')}"${frozen ? ' disabled' : ''}><p class="hint date-say" data-say="start" aria-hidden="true"></p></div>
            <div class="field"><label for="rs-end">Period end</label><input id="rs-end" name="end" type="date" value="${E(opened ? String(opened.reporting_period_end).slice(0, 10) : '')}"${frozen ? ' disabled' : ''}><p class="hint date-say" data-say="end" aria-hidden="true"></p></div>
            <div class="field"><label for="rs-source">Named source</label><input id="rs-source" name="source" type="text" maxlength="120" autocomplete="off" placeholder="Google Analytics 4, property ${E(t.name)}" value="${E(opened ? c0.source || '' : '')}"${frozen ? ' disabled' : ''}></div>
            <div class="field"><label for="rs-read">Read from source at</label><input id="rs-read" name="readAt" type="datetime-local" value="${E(opened && opened.source_observed_at ? localInput(new Date(opened.source_observed_at)) : '')}"${frozen ? ' disabled' : ''}>
              <p class="hint" data-rs-read>${frozen ? '' : '<button class="linkish" type="button" data-rs-now>Use the time now</button>'}</p></div>
            <div class="field span-all"><label for="rs-proof">Proof (screenshot or export)</label>
              ${frozen ? `<div class="rs-file is-set"><span class="rs-file-name">${E(String(c0.proof || '').split('/').pop() || 'No proof attached')}</span>${c0.proof ? '<span class="chip good">attached</span>' : '<span class="chip warn">missing</span>'}</div>`
                : `<div class="rs-file" data-rs-file><input id="rs-proof" name="proof" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.csv,image/png,image/jpeg,image/webp,application/pdf,text/csv"><span class="rs-pick" aria-hidden="true">Choose a file</span><span class="rs-file-name" data-rs-file-name>No file chosen</span><span class="chip good" data-rs-file-chip hidden>attached</span></div>
                <p class="hint">A PNG, JPG, WebP, PDF or CSV up to 10 MB. It is kept privately, for the team only.</p>`}</div>
          </div>
          <div class="rs-hold" data-rs-hold hidden role="status"></div>
          <div class="rs-vis"><label class="switch-row"><input type="checkbox" role="switch" name="visible" disabled${opened && opened.client_visible ? ' checked' : ''}><span><span class="pick-t">Client sees this <span class="meta">(client_visible)</span></span><span class="pick-d" data-rs-vis-hint>Off until verified</span></span></label></div>
          <p class="field-error" data-rs-error role="alert" hidden></p>
          <div class="actions rs-actions">
            <button class="btn" type="button" data-rs-publish disabled>Mark verified and publish</button>
            <button class="btn btn-quiet" type="button" data-rs-keep${frozen ? '' : ' hidden'}>Keep hidden</button>
            ${frozen ? '' : '<button class="btn btn-quiet" type="button" data-rs-draft disabled>Save draft</button>'}
          </div>
        </form>
        <aside class="rs-side" aria-label="Checklist and what the client sees">
          <section class="panel rs-check"><h2>Publish checklist</h2><ol class="rs-list" data-rs-list></ol></section>
          <section class="panel rs-now"><h2>Client sees now</h2>${nowHtml(C, P)}</section>
          ${waiting.length ? `<section class="panel rs-wait"><h2>Waiting for a check <span class="wk-n">${waiting.length}</span></h2><ul class="rs-wait-list">${waiting.map((/** @type {any} */ i) => waitRow(C, i, P)).join('')}</ul></section>` : ''}
        </aside>
      </div>`;
    const old = /** @type {any} */ (box).__rsw;
    if (old) old.abort();
    const again = new AbortController();
    /** @type {any} */ (box).__rsw = again;
    signal.addEventListener('abort', () => again.abort(), { once: true });
    wire(C, box, P, again.signal);
  }

  /** A local date and time for a datetime-local field. @param {Date} d */
  function localInput(d) {
    if (isNaN(d.getTime())) return '';
    const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  /** "Client sees now": what client_results_current gives for this client. @param {any} C @param {Page} P */
  function nowHtml(C, P) {
    if (!P.now.length) return '<p class="meta">Nothing yet. Their Results page shows no numbers until one is verified and published.</p>';
    return `<ul class="rs-now-list">${P.now.map((/** @type {any} */ r) => {
      const c = r.content || {};
      const when = r.verified_at || r.published_at;
      return `<li><strong>${E(c.label || r.metric_key)}</strong><span>${E(num(c.value))}${c.unit ? ' ' + E(c.unit) : ''} · ${E(periodText(r.reporting_period_start, r.reporting_period_end))} · Verified ${E(dayText(when))}</span>${r.has_newer_unverified ? '<span class="chip warn">A newer number is being checked</span>' : ''}</li>`;
    }).join('')}</ul>`;
  }
  /** One waiting result: its number, and whether it is held. @param {any} C @param {any} i @param {Page} P */
  function waitRow(C, i, P) {
    const c = i.content || {};
    const held = !!holdOf(C, i);
    return `<li><div><strong>${E(c.label || c.metric)}</strong><span>${E(num(c.value))}${c.unit ? ' ' + E(c.unit) : ''} · ${E(periodText(i.reporting_period_start, i.reporting_period_end))}</span></div>
      <span class="chip ${held ? 'warn' : 'plain'}">${held ? 'Held for a check' : 'Ready to check'}</span>
      <a class="btn btn-quiet btn-sm" href="#/client/${E(i.tenant_id)}/results/${E(i.id)}"${P.openId === i.id ? ' aria-current="true"' : ''}>${P.openId === i.id ? 'Open now' : 'Check it'}</a></li>`;
  }

  /** Events, the live checklist and the three buttons. @param {any} C @param {HTMLElement} box @param {Page} P @param {AbortSignal} signal */
  function wire(C, box, P, signal) {
    const f = /** @type {HTMLFormElement} */ (box.querySelector('#rs-form'));
    const $ = (/** @type {string} */ sel) => /** @type {HTMLElement|null} */ (box.querySelector(sel));
    const opened = P.openId ? P.items.find((/** @type {any} */ i) => i.id === P.openId) : null;
    const on = { signal };
    if (!opened) C.track(f, 'Result');
    const say = () => {
      for (const k of ['start', 'end']) { const el = $(`[data-say="${k}"]`); const inp = /** @type {HTMLInputElement} */ (f.elements.namedItem(k)); if (el) el.textContent = inp && inp.value ? C.longDate(inp.value) : ''; }
    };
    const refresh = () => {
      const r = read(f, C, P);
      const ck = checks(r);
      const hold = jump(C, P, r);
      const exc = opened ? holdOf(C, opened) : null;
      const unit = $('[data-rs-unit]'); if (unit && !opened) unit.textContent = r.unit || '';
      for (const el of box.querySelectorAll('[data-rs-other]')) /** @type {HTMLElement} */ (el).hidden = !(f.elements.namedItem('metric') && /** @type {any} */ (f.elements.namedItem('metric')).value === '__other');
      const readHint = $('[data-rs-read]');
      if (readHint && !opened) readHint.innerHTML = `${r.readAt && !isNaN(r.readAt.getTime()) ? `${E(C.clockTime(r.readAt))} · ` : ''}<button class="linkish" type="button" data-rs-now>Use the time now</button>`;
      const last = P.now.find((/** @type {any} */ x) => x.metric_key === r.metric && (!opened || x.id !== opened.id));
      // the checklist
      const done = !!(opened && opened.verification_status === 'verified');
      const item = (/** @type {boolean} */ yes, /** @type {string} */ text, /** @type {string} */ note) => `<li class="${yes ? 'is-done' : 'is-todo'}"><span class="rs-mark" aria-hidden="true">${yes ? C.icon('check') : ''}</span><span>${E(text)}${note ? `<span class="meta rs-note">${E(note)}</span>` : ''}${yes ? '<span class="sr-only"> (done)</span>' : '<span class="sr-only"> (not done)</span>'}</span></li>`;
      const list = $('[data-rs-list]');
      if (list) list.innerHTML = item(ck.value, 'Value entered', '') + item(ck.period, 'Reporting period', '') + item(ck.source, 'Named source and read time', '') + item(ck.proof, 'Proof attached', '')
        + item(done, 'Verified by a person', done ? '' : 'Done when you press Mark verified and publish')
        + item(done || (!!opened && opened.verification_status === 'rejected'), 'Client sees it: decided', done ? '' : 'Decided when you publish or keep it hidden');
      // held: more than 40 percent away from the last verified value
      const holdBox = $('[data-rs-hold]');
      if (holdBox) {
        const h = exc ? { last, was: last ? Number(last.content.value) : NaN, pct: last ? Math.round(((r.value - Number(last.content.value)) / Math.abs(Number(last.content.value))) * 100) : NaN } : hold;
        if (h && last && Number.isFinite(h.pct) && !done) {
          const lastPeriod = periodText(last.reporting_period_start, last.reporting_period_end);
          holdBox.hidden = false;
          holdBox.innerHTML = `<strong>Held for a check.</strong> ${E(num(r.value))} is ${Math.abs(h.pct)}% ${h.pct < 0 ? 'lower' : 'higher'} than the last verified value (${E(num(h.was))}, ${E(lastPeriod)}). The client keeps seeing ${E(lastPeriod)} until you confirm. ${exc ? 'A Needs you item was opened. <a href="#/queue">Open Needs you</a>' : 'A Needs you item opens when you save it.'}`;
        } else holdBox.hidden = true;
      }
      const visHint = $('[data-rs-vis-hint]'); if (visHint) visHint.textContent = done ? 'On. The client sees this now.' : opened && opened.verification_status === 'rejected' ? 'Turned down. The client does not see it.' : 'Off until verified';
      // the buttons: publish needs every piece of evidence; the draft needs what the database insists on
      const publish = /** @type {HTMLButtonElement} */ ($('[data-rs-publish]'));
      const all = ck.value && ck.period && ck.source && ck.proof && ck.metric;
      publish.disabled = !all || done;
      publish.title = done ? 'Already published' : all ? '' : 'Needs a value, a period, a named source with its read time, and proof.';
      const draft = /** @type {HTMLButtonElement|null} */ ($('[data-rs-draft]'));
      if (draft) draft.disabled = !(ck.value && ck.period && ck.source && ck.metric);
      const keep = /** @type {HTMLButtonElement|null} */ ($('[data-rs-keep]'));
      if (keep) { keep.hidden = !(opened ? opened.verification_status === 'pending' : !!hold); keep.disabled = !opened && !(ck.value && ck.period && ck.source && ck.metric); }
      if (opened && done) { publish.hidden = true; if (keep) keep.hidden = true; }
      say();
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); const d = /** @type {HTMLButtonElement|null} */ ($('[data-rs-draft]')); if (d && !d.disabled) d.click(); }, on);
    f.addEventListener('input', refresh, on);
    f.addEventListener('change', (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      if (t && t.name === 'proof') {
        const file = t.files && t.files[0] ? t.files[0] : null;
        const err = $('[data-rs-error]');
        if (file && (file.size > MAX_PROOF_BYTES || (file.type && !PROOF_TYPES.test(file.type)))) {
          t.value = ''; P.file = null;
          if (err) { err.hidden = false; err.textContent = file.size > MAX_PROOF_BYTES ? 'That file is over 10 MB. Attach a smaller screenshot or export.' : 'Attach a PNG, JPG, WebP, PDF or CSV file.'; }
        } else { P.file = file; if (err) err.hidden = true; }
        const nm = $('[data-rs-file-name]'); if (nm) nm.textContent = P.file ? P.file.name : 'No file chosen';
        const chip = $('[data-rs-file-chip]'); if (chip) chip.hidden = !P.file;
      }
      refresh();
    }, on);
    box.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('[data-rs-now]')) {
        const inp = /** @type {HTMLInputElement} */ (f.elements.namedItem('readAt'));
        inp.value = localInput(new Date());
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const publish = /** @type {HTMLButtonElement|null} */ (target.closest('[data-rs-publish]'));
      const keep = /** @type {HTMLButtonElement|null} */ (target.closest('[data-rs-keep]'));
      const draft = /** @type {HTMLButtonElement|null} */ (target.closest('[data-rs-draft]'));
      const btn = publish || keep || draft;
      if (!btn || btn.disabled) return;
      const err = $('[data-rs-error]');
      if (err) err.hidden = true;
      const r = read(f, C, P);
      const hold = jump(C, P, r);
      /** @param {string} t */
      const say = (t) => { if (err) { err.hidden = false; err.textContent = t; } else C.toast(t, true); };
      try {
        if (publish) {
          const last = hold ? hold.last : null;
          const ask = `Publish ${num(r.value)}${r.unit ? ' ' + r.unit : ''} for ${C.current.name}?`;
          const body = `${r.label || r.metric}, ${periodText(r.start, r.end)}. The client sees it on their Results page now.${hold && last ? ` It is ${Math.abs(hold.pct)}% ${hold.pct < 0 ? 'lower' : 'higher'} than the last verified value (${num(hold.was)}): publish it only if you checked the source.` : ''}`;
          if (!await C.ask(ask, body, 'Verify and publish')) return;
        }
        const done = C.busy(btn, publish ? 'Publishing' : keep ? 'Saving' : 'Saving draft');
        try {
          const item = opened || await enter(C, P, r);
          if (publish) await publishItem(C, item);
          else if (keep) await keepHidden(C, item);
          C.clean(f);
          C.toast(publish ? 'Published. The client sees it now.' : keep ? 'Kept hidden. The client keeps seeing the last verified number.' : hold ? 'Saved as a draft and held for a check. A Needs you item was opened.' : 'Saved as a draft. The client does not see it yet.');
          P.file = null;
          await refreshAfter(C, P);
          const base = `#/client/${C.current.id}/results`;
          const go = publish || keep ? base : `${base}/${item.id}`;
          // the address changes, so the page is drawn again from it; if it is the same address, it is drawn here
          if (location.hash === go) { P.openId = publish || keep ? '' : item.id; draw(C, box, P, signal); } else location.hash = go;
        } catch (x) { done(); say(C.message(x)); }
      } catch (x) { say(C.message(x)); }
    }, on);
    refresh();
  }

  /** Saves what was typed as a pending, hidden result (add_result_item). A big jump is held there, and Needs you gets a result_outlier item. @param {any} C @param {Page} P @param {any} r */
  async function enter(C, P, r) {
    const db = await C.db();
    const proof = P.file ? await uploadProof(P.tenantId, P.file) : null;
    const row = ok(await db.rpc('add_result_item', {
      p_tenant: P.tenantId, p_service: r.service || null, p_metric: r.metric, p_label: r.label || r.metric, p_value: r.value, p_unit: r.unit || null,
      p_period_start: r.start, p_period_end: r.end, p_source_name: r.source, p_read_at: r.readAt.toISOString(), p_proof_path: proof
    }));
    return row;
  }
  /** Publishes a pending result: the usual staff review, then the Needs you item for it is resolved. @param {any} C @param {any} item */
  async function publishItem(C, item) {
    const db = await C.db();
    ok(await db.rpc('review_dashboard_item', { p_item_id: item.id, p_decision: 'approve', p_note: 'Entered and verified on the Results tab', p_content: null, p_expected: item.updated_at || null }));
    const hold = holdOf(C, item);
    if (hold) ok(await db.rpc('resolve_dashboard_exception', { p_id: hold.id, p_status: 'resolved', p_note: 'Verified and published from the Results tab' }));
  }
  /** Keeps a number hidden: the item stays pending and unpublished, and its Needs you item is resolved. @param {any} C @param {any} item */
  async function keepHidden(C, item) {
    const db = await C.db();
    const hold = holdOf(C, item);
    if (hold) ok(await db.rpc('resolve_dashboard_exception', { p_id: hold.id, p_status: 'resolved', p_note: 'Kept hidden from the Results tab' }));
  }
  /** Reads the rows and the open Needs you items again after a write. @param {any} C @param {Page} P */
  async function refreshAfter(C, P) {
    await load(C, P);
    try {
      const db = await C.db();
      const res = await db.from('dashboard_exceptions').select('*').eq('tenant_id', P.tenantId).eq('status', 'open');
      if (!res.error) {
        const rv = C.all.reviews = C.all.reviews || { items: [], invoices: [], exceptions: [], sync: {}, auto: [] };
        rv.exceptions = (rv.exceptions || []).filter((/** @type {any} */ x) => x.tenant_id !== P.tenantId).concat(res.data || []);
      }
    } catch (e) { /* the next reload shows it */ }
  }

  EXT.results = { uploadProof, periodText, jump: (/** @type {any} */ C, /** @type {any} */ P, /** @type {any} */ r) => jump(C, P, r) };
})();
