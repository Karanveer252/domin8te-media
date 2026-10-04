/* Domin8te onboarding engine. Renders window.ONB.steps one at a time,
   autosaves every answer to this browser, and keeps a "sort it on the call"
   list of anything skipped. No framework, no build. */
(function () {
  'use strict';
  const { STUDIO_EMAIL, prefill, chapters, steps } = window.ONB;
  const KEY = 'd8-onboarding-v2';
  const PORTAL = 'https://domin8temedia.com/dashboard/';
  const TIMES = ['09:30', '10:00', '10:30', '14:30', '15:00', '15:30', '16:00'];
  const PASSIVE = ['done'];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arr = v => (Array.isArray(v) ? v : []);
  const I = {
    check: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg>',
    arrow: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4l6 6-6 6"/></svg>',
    ext: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 4h5v5M16 4l-7 7M14 12v4H4V6h4"/></svg>',
    x: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg>',
    chev: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5"/></svg>'
  };

  /* ---------- state ---------- */
  const fresh = () => ({ d: JSON.parse(JSON.stringify(prefill)), at: steps[0].id, done: {}, skipped: {}, savedAt: 0 });
  function load() {
    try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.d) return Object.assign(fresh(), j); } catch (e) { /* private window */ }
    return fresh();
  }
  let S = load();
  const thumbs = {};
  let saveT = 0, savedT = 0, autoT = 0;
  function save(quiet) {
    S.savedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* still works, just not across reloads */ }
    if (!quiet) flashSaved();
  }
  const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(save, 350); };
  function flashSaved() {
    const el = $('#saved'); el.textContent = 'Saved'; el.classList.add('on');
    clearTimeout(savedT); savedT = setTimeout(() => el.classList.remove('on'), 1600);
  }

  /* ---------- helpers ---------- */
  function fill(s) {
    if (!s) return '';
    return String(s)
      .replace(/\{first\}/g, esc(S.d.first || 'there'))
      .replace(/\{rname\}/g, esc(S.d.rname || 'your place'))
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
  const plain = s => fill(s).replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const order = id => steps.findIndex(s => s.id === id);
  const byId = id => steps.find(s => s.id === id);

  function visible() {
    const call = S.d.how === 'call';
    return steps.filter(s => (!call || s.core) && (!s.when || s.when(S.d)));
  }
  function cur() {
    const v = visible();
    let i = v.findIndex(s => s.id === S.at);
    if (i < 0) { const o = order(S.at); i = v.findIndex(s => order(s.id) >= o); if (i < 0) i = v.length - 1; }
    return { v, i, s: v[i] };
  }
  function minutesLeft(v, i) {
    const sec = v.slice(i).reduce((n, s) => n + (S.done[s.id] || S.skipped[s.id] ? 0 : (s.t || 10)), 0);
    return sec < 50 ? 0 : Math.max(1, Math.round(sec / 60));
  }
  function workdays(n) {
    const out = []; const d = new Date(); d.setHours(12, 0, 0, 0);
    while (out.length < n) {
      d.setDate(d.getDate() + 1);
      const wd = d.getDay(); if (wd === 0 || wd === 6) continue;
      const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      out.push({ iso, wd: d.toLocaleDateString(undefined, { weekday: 'short' }), dd: d.getDate(), mon: d.toLocaleDateString(undefined, { month: 'short' }) });
    }
    return out;
  }
  const isoToDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  function fmtTime(t) { const [h, m] = t.split(':').map(Number); return new Date(2026, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function slotText() {
    const sl = S.d.slot || {};
    if (!sl.date || !sl.time) return '';
    const day = isoToDate(sl.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    return day + ' at ' + fmtTime(sl.time) + (S.d.callType ? (S.d.callType === 'video' ? ', video call' : ', phone call') : '');
  }
  function ensureChecks(s) {
    if (!S.d.checks) { S.d.checks = {}; s.items.forEach(it => { S.d.checks[it.k] = !!it.def; }); }
    return S.d.checks;
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3600);
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- pieces ---------- */
  function optRows(s, val) {
    return s.opts.map((o, n) => {
      const tail = o.s && o.s.length <= 5;
      return '<button type="button" class="opt" role="radio" aria-checked="' + (val === o.v) + '" data-v="' + esc(o.v) + '">' +
        '<span class="k" aria-hidden="true">' + (n + 1) + '</span>' +
        '<span class="l">' + esc(o.l) + (o.s && !tail ? '<span class="s">' + esc(o.s) + '</span>' : '') + '</span>' +
        (tail ? '<span class="tail">' + esc(o.s) + '</span>' : '<span></span>') + '</button>';
    }).join('');
  }
  function chips(key, opts, o) {
    o = o || {};
    const val = S.d[key];
    return '<div class="chips" role="group">' + opts.map(op => {
      const on = o.single ? val === op.v : arr(val).includes(op.v);
      return '<button type="button" class="chip' + (o.compact ? ' compact' : '') + '" aria-pressed="' + on + '" data-chip="' + esc(key) + '" data-v="' + esc(op.v) + '"' +
        (o.single ? ' data-single="1"' : '') + (op.solo ? ' data-solo="1"' : '') + '>' + I.check + esc(op.l) + '</button>';
    }).join('') + '</div>';
  }
  function field(f) {
    const id = 'f-' + f.k, v = S.d[f.k] == null ? '' : S.d[f.k];
    const attrs = 'id="' + id + '" data-k="' + f.k + '" autocomplete="' + (f.ac || 'on') + '"' +
      (f.im ? ' inputmode="' + f.im + '"' : '') + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') +
      (f.hint ? ' aria-describedby="' + id + '-h"' : '');
    const input = f.area ? '<textarea ' + attrs + ' rows="3">' + esc(v) + '</textarea>'
      : '<input ' + attrs + ' type="' + (f.type === 'url' ? 'text' : (f.type || 'text')) + '" value="' + esc(v) + '">';
    return '<div class="field' + (f.half ? ' half' : '') + '"><label for="' + id + '">' + esc(f.l) + (f.opt ? '<span class="opt-tag">Optional</span>' : '') + '</label>' +
      input + (f.hint ? '<span class="hint" id="' + id + '-h">' + esc(f.hint) + '</span>' : '') + '</div>';
  }
  const unsureLink = s => (s.unsure ? '<button type="button" class="link unsure" data-act="unsure">' + esc(s.unsure) + '</button>' : '');
  function sample(s) {
    const o = s.opts.find(x => x.v === S.d[s.key]) || s.opts[0];
    const name = S.d.rname || 'Your place';
    return '<div class="sample" aria-live="polite"><header><span class="av" aria-hidden="true">' + esc(name.trim()[0] || 'B') + '</span>' +
      '<span class="who">' + esc(name) + '<span>' + esc(o.l) + '</span></span><span class="from tagx">Sample</span></header><p>' + esc(o.ex) + '</p></div>';
  }
  /* "where to tap" pictures (guides.js), one per numbered step */
  const GUIDES = window.ONB_GUIDES || {};
  function guideCtx() {
    const name = (S.d.rname || 'Your place').trim();
    return { name, first: (S.d.first || 'You').trim(), email: STUDIO_EMAIL, handle: '@' + (name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'yourplace') };
  }
  function shots(s) {
    const g = GUIDES[s.id]; if (!g) return '';
    const c = guideCtx();
    return '<section class="shots" aria-label="Where to tap"><div class="shots-head"><p class="label">Where to tap</p>' +
      '<p class="small">Illustrations, not real screenshots. Tap one to see it bigger.</p></div><div class="shots-grid">' +
      g.map((p, n) => '<figure class="shot"><button type="button" class="shot-btn" data-zoom="' + n + '" aria-label="Enlarge picture ' + (n + 1) + ': ' + esc(p.cap) + '">' + p.draw(c) + '</button>' +
        '<figcaption><b>' + String(n + 1).padStart(2, '0') + '</b><span>' + esc(p.cap) + '</span></figcaption></figure>').join('') +
      '</div></section>';
  }
  const zoom = $('#zoom'); let zoomAt = 0;
  function showZoom(n) {
    const g = GUIDES[cur().s.id]; if (!g) return;
    zoomAt = (n + g.length) % g.length;
    $('#zoomArt').innerHTML = g[zoomAt].draw(guideCtx());
    $('#zoomCap').innerHTML = '<b>' + String(zoomAt + 1).padStart(2, '0') + '</b> ' + esc(g[zoomAt].cap);
    $('#zoomCount').textContent = (zoomAt + 1) + ' of ' + g.length;
    if (!zoom.open) zoom.showModal();
  }
  function fileRow(key, f, n) {
    const url = thumbs[key + '/' + f.name];
    const ext = (f.name.split('.').pop() || '').slice(0, 4).toUpperCase();
    const kb = f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB';
    return '<li><span class="th"' + (url ? ' style="background-image:url(' + url + ')"' : '') + '>' + (url ? '' : esc(ext)) + '</span>' +
      '<span class="nm">' + esc(f.name) + '<span class="sz">' + kb + '</span></span>' +
      '<button type="button" class="x" data-rm="' + esc(key) + '" data-n="' + n + '" aria-label="Remove ' + esc(f.name) + '">' + I.x + '</button></li>';
  }

  /* ---------- step renderers ---------- */
  const R = {
    choice(s) {
      return '<div class="body"><div class="opts" role="radiogroup" aria-label="' + esc(plain(s.q)) + '">' + optRows(s, S.d[s.key]) + '</div>' +
        (s.opts.some(o => o.ex) ? sample(s) : '') + unsureLink(s) + '</div>';
    },
    multi(s) {
      let h = '<div class="body">' + chips(s.key, s.opts);
      if (s.max) h += '<p class="max" id="maxNote">Pick up to ' + s.max + '.</p>';
      if (s.other) h += '<div class="other">' + field({ k: s.key + '_other', l: 'Something else?', opt: true, ac: 'off' }) + '</div>';
      if (s.extra) h += '<div class="extra"' + (s.extra.when(S.d) ? '' : ' hidden') + '><div class="fields" style="margin-top:32px">' + s.extra.fields.map(field).join('') + '</div></div>';
      return h + unsureLink(s) + '</div>';
    },
    fields(s) {
      const fromHere = s.fields.some(f => arr(S.d._from).includes(f.k) && S.d[f.k] === prefill[f.k]);
      return '<div class="body">' + (fromHere ? '<p class="from" style="margin:0 0 28px">Filled in from your enquiry</p>' : '') +
        '<div class="fields">' + s.fields.map(field).join('') + '</div><p class="err" id="err" aria-live="polite"></p></div>';
    },
    upload(s) {
      const files = arr(S.d[s.key]);
      return '<div class="body"><div class="drop" data-drop="' + s.key + '">' +
        '<p>Drag ' + (s.multiple ? 'files' : 'a file') + ' here, or</p><div class="btns">' +
        '<button type="button" class="ghost line" data-pick="file-' + s.key + '">Choose ' + (s.multiple ? 'files' : 'a file') + '</button>' +
        (s.camera ? '<button type="button" class="ghost line" data-pick="cam-' + s.key + '">Take a photo</button>' : '') + '</div>' +
        '<input type="file" id="file-' + s.key + '" data-file="' + s.key + '" accept="' + esc(s.accept) + '"' + (s.multiple ? ' multiple' : '') + ' tabindex="-1" aria-hidden="true">' +
        (s.camera ? '<input type="file" id="cam-' + s.key + '" data-file="' + s.key + '" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true">' : '') +
        '</div><ul class="files">' + files.map((f, n) => fileRow(s.key, f, n)).join('') + '</ul>' +
        (s.link ? '<div class="linkfield">' + field({ k: s.link.k, l: s.link.l, ph: s.link.ph, opt: true, im: 'url', ac: 'url' }) + '</div>' : '') +
        (s.alts ? '<div class="alts"><p class="label">Or</p>' + chips(s.key + 'Alt', s.alts, { single: true }) + '</div>' : '') + '</div>';
    },
    connect(s) {
      return '<div class="body">' +
        (S.d.how === 'mix' ? '<p class="banner">You chose to connect accounts on the call. Tap “Do it on the call” and keep going.</p>' : '') +
        '<div class="connect"><ol class="how">' + s.how.map(x => '<li><span>' + fill(x) + '</span></li>').join('') + '</ol>' +
        '<div class="card"><p class="label">Our email, to paste in</p><div class="copy"><span>' + STUDIO_EMAIL + '</span><button type="button" data-act="copy">Copy</button></div>' +
        (s.link ? '<a class="ghost line open" href="' + s.link.href + '" target="_blank" rel="noopener">' + esc(s.link.l) + I.ext + '</a>' : '') +
        '<p class="small">No password needed. The invite gives us access, and you can remove it any time. About 2 minutes. If your screens look different, do it on the call.</p></div></div>' +
        shots(s) +
        '<div class="connect-status"><p class="label" style="margin-bottom:12px">How did it go?</p><div class="opts" role="radiogroup" aria-label="How did it go?">' + optRows(s, S.d[s.key]) + '</div></div></div>';
    },
    toggles(s) {
      const c = ensureChecks(s);
      return '<div class="body"><ul class="tgl">' + s.items.map(it =>
        '<li><button type="button" role="switch" aria-checked="' + !!c[it.k] + '" data-tg="' + it.k + '"' + (it.lock ? ' aria-disabled="true"' : '') + '>' +
        '<span><span class="tl">' + esc(it.l) + '</span><span class="ts">' + esc(it.s) + '</span></span>' +
        '<span style="display:flex;align-items:center">' + (it.lock ? '<span class="lockt">Always on</span>' : '') + '<span class="sw2"></span></span></button></li>').join('') + '</ul></div>';
    },
    slots() {
      const sl = S.d.slot || {};
      return '<div class="body"><div class="group"><p class="label">Pick a day</p><div class="days">' +
        workdays(8).map(d => '<button type="button" class="day" aria-pressed="' + (sl.date === d.iso) + '" data-day="' + d.iso + '"><span>' + esc(d.wd) + '</span><b>' + d.dd + '</b><span>' + esc(d.mon) + '</span></button>').join('') +
        '</div></div><div class="group"><p class="label">Pick a time</p><div class="chips">' +
        TIMES.map(t => '<button type="button" class="chip compact" aria-pressed="' + (sl.time === t) + '" data-time="' + t + '">' + I.check + esc(fmtTime(t)) + '</button>').join('') +
        '</div><p class="small" style="margin:12px 0 0">Your local time. Mornings before you open, or the afternoon lull. Never during service.</p></div>' +
        '<div class="group"><p class="label">Phone or video?</p>' + chips('callType', [{ v: 'phone', l: 'Phone call' }, { v: 'video', l: 'Video call' }], { single: true }) + '</div>' +
        '<p class="slotsum" id="slotsum" aria-live="polite">' + (slotText() ? 'Booked in: <b>' + esc(slotText()) + '</b>' : 'Pick a day and a time.') + '</p></div>';
    },
    done() {
      const slot = slotText();
      const todo = visible().filter(x => !PASSIVE.includes(x.type) && isTodo(x));
      return '<p class="lead">That’s everything we need to start. Here’s what happens next.</p>' +
        (S.d.how === 'call' ? '<p class="note">Everything else we go through together on the call.</p>' : '') +
        (todo.length ? '<div class="todo"><h2>We’ll sort these on your call (' + todo.length + ')</h2><p>No need to chase them now.</p><ul>' +
          todo.map(x => '<li>' + esc(x.sum) + '</li>').join('') + '</ul></div>' : '') +
        '<ol class="next">' +
        '<li><div><h3>Sent to the studio</h3><p>Your answers are with us. A copy goes to ' + esc(S.d.email || 'your email') + '.</p></div></li>' +
        '<li><div><h3>Within one business day</h3><p>We check every invite and connection, and tell you if anything is missing.</p></div></li>' +
        '<li><div><h3>' + (slot ? 'Kickoff call: ' + esc(slot) : 'Your kickoff call') + '</h3><p>We walk you through the plan and finish anything you skipped.</p></div></li>' +
        '<li><div><h3>First drafts in your portal</h3><p>Website, posts and ads arrive for you to approve, one tap each.</p></div></li>' +
        '<li><div><h3>Then we keep it running</h3><p>Every week. You run the restaurant.</p></div></li></ol>' +
        '<div class="done-acts">' + (slot ? '<button type="button" class="ghost line" data-act="ics">Add the call to my calendar</button>' : '') +
        '<button type="button" class="ghost line" data-act="download">Download my answers</button></div>' +
        '<p class="restart small"><button type="button" class="link" data-act="restart">Start over (demo)</button> &nbsp;·&nbsp; <a class="link" href="map.html">See the whole flow</a></p>';
    }
  };

  function isTodo(x) {
    if (S.skipped[x.id]) return true;
    const v = S.d[x.key];
    return v === 'unsure' || (x.type === 'connect' && v === 'call');
  }
  function labelOf(opts, v) { const o = opts.find(x => x.v === v); return o ? o.l : v; }
  function summarize(x) {
    const d = S.d;
    switch (x.type) {
      case 'choice': case 'connect':
        if (d[x.key] === 'unsure') return x.unsure || 'Not sure yet';
        return d[x.key] ? labelOf(x.opts, d[x.key]) : '';
      case 'multi': {
        const parts = arr(d[x.key]).map(v => labelOf(x.opts, v));
        if (d[x.key + '_other']) parts.push(d[x.key + '_other']);
        if (x.extra && x.extra.when(d)) x.extra.fields.forEach(f => { if (d[f.k]) parts.push(d[f.k]); });
        return parts.join(', ');
      }
      case 'fields': return x.fields.map(f => d[f.k]).filter(Boolean).join(', ');
      case 'upload': {
        const f = arr(d[x.key]);
        if (f.length) return f.length + (f.length === 1 ? ' file: ' : ' files: ') + f.slice(0, 2).map(z => z.name).join(', ') + (f.length > 2 ? '…' : '');
        if (x.link && d[x.link.k]) return d[x.link.k];
        return d[x.key + 'Alt'] ? labelOf(x.alts, d[x.key + 'Alt']) : '';
      }
      case 'toggles': { const c = d.checks; return c ? x.items.filter(it => c[it.k]).map(it => it.l).join(', ') : ''; }
      case 'slots': return slotText();
      default: return '';
    }
  }

  /* ---------- render ---------- */
  function render(opts) {
    opts = opts || {};
    const { v, i, s } = cur();
    S.at = s.id;
    const lead = S.d.how === 'call' && s.leadCall ? s.leadCall : s.lead;
    const stage = $('#stage');
    stage.innerHTML = '<div class="step' + (opts.anim === false ? '' : ' enter') + '" data-id="' + s.id + '">' +
      '<h1 class="q" tabindex="-1">' + fill(s.q) + '</h1>' +
      (lead ? '<p class="lead">' + fill(lead) + '</p>' : '') +
      (s.why ? '<details class="why"><summary>Why we ask</summary><p>' + fill(s.why) + '</p></details>' : '') +
      R[s.type](s) + '</div>';
    rail(v, i, s); dock(v, i, s); bar(v, i); help(s);
    try { history.replaceState(null, '', '#s=' + s.id); } catch (e) { /* file:// */ }
    if (opts.focus !== false) { window.scrollTo(0, 0); const q = $('.q', stage); q && q.focus({ preventScroll: true }); }
    save(true);
  }
  function rail(v, i, s) {
    const cIdx = chapters.findIndex(c => c.id === s.ch);
    $('#chapters').innerHTML = chapters.map((c, n) => {
      const items = v.filter(x => x.ch === c.id); if (!items.length) return '';
      const fin = items.every(x => S.done[x.id] || S.skipped[x.id]);
      const sk = items.filter(x => S.skipped[x.id]).length;
      const st = c.id === s.ch ? 'cur' : fin ? 'done' : '';
      return '<li class="' + st + '"><button type="button" data-ch="' + c.id + '"' + (st === 'cur' ? ' aria-current="step"' : '') + '>' +
        '<span class="n">' + String(n + 1).padStart(2, '0') + '</span><span>' + esc(c.name) + (sk ? ' <span class="skipc">· ' + sk + ' skipped</span>' : '') + '</span>' +
        '<span class="c">' + (fin && st !== 'cur' ? I.check : items.length) + '</span></button></li>';
    }).join('');
    const m = minutesLeft(v, i);
    $('#timeLeft').textContent = s.type === 'done' ? 'All done' : m ? 'About ' + m + ' min left' : 'Almost done';
    $('#topChapter').innerHTML = '<button type="button" id="chapBtn" aria-controls="rail" aria-expanded="false"><b>' + (cIdx + 1) + '/' + chapters.length + '</b> <span class="t">' + esc(chapters[cIdx].name) + '</span>' + I.chev + '</button>';
  }
  function dock(v, i, s) {
    const back = $('#backBtn'), skip = $('#skipBtn'), nx = $('#nextBtn');
    back.disabled = i === 0;
    back.hidden = s.type === 'done';
    skip.hidden = s.skip === false || PASSIVE.includes(s.type);
    nx.querySelector('span').textContent = s.type === 'done' ? 'Open your portal' : (s.cta || 'Continue');
  }
  function bar(v, i) {
    const pct = v.length > 1 ? Math.round(i / (v.length - 1) * 100) : 0;
    $('#barFill').style.width = pct + '%';
    $('#bar').setAttribute('aria-valuenow', pct);
  }
  function help(s) {
    $('#helpBody').innerHTML = '<h2>Need a hand?</h2>' +
      (s.why ? '<p class="whyx"><b>Why we ask this:</b> ' + fill(s.why) + '</p>' : '<p class="whyx">Ask us anything. Or skip this part and we’ll do it together.</p>') +
      '<div class="acts">' +
      (PASSIVE.includes(s.type) || s.skip === false ? '' : '<button type="button" data-act="helpcall"><span>Do this part on the call<span>We skip it for now and do it with you.</span></span>' + I.arrow + '</button>') +
      '<a href="mailto:' + STUDIO_EMAIL + '?subject=' + encodeURIComponent('Setup help: ' + plain(s.q)) + '"><span>Email the studio<span>' + STUDIO_EMAIL + '. We reply within one business day.</span></span>' + I.arrow + '</a>' +
      '<button type="button" data-act="bookcall"><span>Book a setup call now<span>30 minutes, around service, not during it.</span></span>' + I.arrow + '</button></div>' +
      '<div class="qa"><p class="label" style="margin-bottom:6px">Common questions</p>' +
      qa('Do you need my passwords?', 'No. You add us through each platform’s own invite button, and you can remove us any time.') +
      qa('Can I change my answers later?', 'Yes. Everything here can be changed in your portal or on the kickoff call.') +
      qa('What if I don’t have something?', 'Tap Skip for now. It goes on a short list we go through with you on the call.') +
      qa('Will anything go live straight away?', 'No. First drafts come to your portal for your OK before anything is published.') +
      qa('Who sees my answers?', 'Only the studio. We use them to set up your accounts and plan your first month.') + '</div>';
  }
  const qa = (q, a) => '<details><summary>' + esc(q) + '</summary><p>' + esc(a) + '</p></details>';

  /* ---------- navigation ---------- */
  function go(id, anim) { S.at = id; render({ anim }); }
  function afterId(s) {
    const v = visible(); const i = v.findIndex(x => x.id === s.id);
    return (v[i + 1] || v[i] || v[0]).id;
  }
  function validate(s) {
    if (!s.req) return true;
    const bad = s.req.filter(k => {
      const val = String(S.d[k] || '').trim();
      return !val || (k === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val));
    });
    if (!bad.length) return true;
    bad.forEach(k => { const inp = $('[data-k="' + k + '"]'); if (inp) inp.closest('.field').classList.add('bad'); });
    const first = $('[data-k="' + bad[0] + '"]'); if (first) first.focus();
    const err = $('#err');
    if (err) err.textContent = s.reqMsg || (bad[0] === 'email' ? 'We need a working email. It’s how you sign in to your portal.' : 'We need this one to set things up.');
    return false;
  }
  function next() {
    clearTimeout(autoT);
    const { s } = cur();
    if (s.type === 'done') { window.open(PORTAL, '_blank', 'noopener'); return; }
    if (!validate(s)) return;
    delete S.skipped[s.id]; S.done[s.id] = true;
    go(afterId(s));
  }
  function skip(reason) {
    const { s } = cur();
    S.skipped[s.id] = reason || 'skip'; delete S.done[s.id];
    toast(reason === 'call' ? 'Added to the list for your call.' : 'Skipped. It’s on the list for your call.');
    go(afterId(s));
  }
  function back() {
    clearTimeout(autoT);
    const { v, i } = cur();
    if (i > 0) go(v[i - 1].id);
  }

  /* ---------- events ---------- */
  const stage = $('#stage');
  stage.addEventListener('click', e => {
    const t = e.target;
    const { s } = cur();
    let el;
    if ((el = t.closest('[data-zoom]'))) return showZoom(+el.dataset.zoom);
    if ((el = t.closest('[data-chip]'))) return onChip(el, s);
    if ((el = t.closest('.opt'))) return onOpt(el, s);
    if ((el = t.closest('[data-tg]'))) {
      if (el.getAttribute('aria-disabled') === 'true') return toast('Offers always need your OK. That one stays on.');
      const c = S.d.checks; c[el.dataset.tg] = !c[el.dataset.tg]; el.setAttribute('aria-checked', c[el.dataset.tg]); return save();
    }
    if ((el = t.closest('[data-day]'))) { S.d.slot = Object.assign({}, S.d.slot, { date: el.dataset.day }); return slotUpdate(); }
    if ((el = t.closest('[data-time]'))) { S.d.slot = Object.assign({}, S.d.slot, { time: el.dataset.time }); return slotUpdate(); }
    if ((el = t.closest('[data-pick]'))) { const inp = document.getElementById(el.dataset.pick); return inp && inp.click(); }
    if ((el = t.closest('[data-rm]'))) {
      const k = el.dataset.rm; const list = arr(S.d[k]); list.splice(+el.dataset.n, 1); S.d[k] = list; save(); return render({ anim: false, focus: false });
    }
    if ((el = t.closest('[data-act]'))) return act(el.dataset.act, el, s);
  });
  stage.addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset.k) return;
    S.d[t.dataset.k] = t.value; saveSoon();
    const f = t.closest('.field');
    if (f && f.classList.contains('bad') && t.value.trim()) { f.classList.remove('bad'); const err = $('#err'); if (err && !$('.field.bad', stage)) err.textContent = ''; }
  });
  stage.addEventListener('change', e => { const t = e.target; if (t.dataset.file) { addFiles(t.dataset.file, t.files); t.value = ''; } });
  stage.addEventListener('dragover', e => { const z = e.target.closest('.drop'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  stage.addEventListener('dragleave', e => { const z = e.target.closest('.drop'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
  stage.addEventListener('drop', e => { const z = e.target.closest('.drop'); if (z) { e.preventDefault(); z.classList.remove('over'); addFiles(z.dataset.drop, e.dataTransfer.files); } });

  function onOpt(el, s) {
    S.d[s.key] = el.dataset.v;
    $$('.opt', stage).forEach(o => o.setAttribute('aria-checked', o === el));
    save();
    if (s.opts.some(o => o.ex)) { const box = $('.sample', stage); if (box) box.outerHTML = sample(s); }
    if (s.auto !== false) { clearTimeout(autoT); autoT = setTimeout(next, 320); }
  }
  function onChip(el, s) {
    const key = el.dataset.chip, v = el.dataset.v;
    if (el.dataset.single) {
      S.d[key] = S.d[key] === v ? null : v;
    } else {
      let list = arr(S.d[key]).slice();
      const soloVals = $$('[data-chip="' + key + '"]', stage).filter(b => b.dataset.solo).map(b => b.dataset.v);
      if (list.includes(v)) list = list.filter(x => x !== v);
      else if (el.dataset.solo) list = [v];
      else {
        list = list.filter(x => !soloVals.includes(x));
        const max = s.key === key ? s.max : 0;
        if (max && list.length >= max) {
          const n = $('#maxNote'); if (n) { n.textContent = 'That’s ' + max + '. Untick one to swap it.'; n.classList.add('flash'); setTimeout(() => { n.textContent = 'Pick up to ' + max + '.'; n.classList.remove('flash'); }, 2200); }
          return;
        }
        list.push(v);
      }
      S.d[key] = list;
    }
    $$('[data-chip="' + key + '"]', stage).forEach(b => b.setAttribute('aria-pressed', b.dataset.single ? S.d[key] === b.dataset.v : arr(S.d[key]).includes(b.dataset.v)));
    if (s.extra) { const x = $('.extra', stage); if (x) x.hidden = !s.extra.when(S.d); }
    if (key === 'callType') slotUpdate(true);
    if (s.type === 'upload' && key === s.key + 'Alt' && S.d[key]) { S.d[s.key] = []; render({ anim: false, focus: false }); }
    save();
  }
  function slotUpdate(noSave) {
    const sl = S.d.slot || {};
    $$('[data-day]', stage).forEach(b => b.setAttribute('aria-pressed', b.dataset.day === sl.date));
    $$('[data-time]', stage).forEach(b => b.setAttribute('aria-pressed', b.dataset.time === sl.time));
    const t = slotText(); $('#slotsum').innerHTML = t ? 'Booked in: <b>' + esc(t) + '</b>' : (sl.date ? 'Now pick a time.' : 'Pick a day and a time.');
    if (!noSave) save();
  }
  function addFiles(key, list) {
    if (!list || !list.length) return;
    const s = byId(cur().s.id);
    const files = s.multiple ? arr(S.d[key]).slice() : [];
    Array.from(list).forEach(f => {
      files.push({ name: f.name, size: f.size, type: f.type });
      if (/^image\//.test(f.type)) thumbs[key + '/' + f.name] = URL.createObjectURL(f);
    });
    S.d[key] = files; S.d[key + 'Alt'] = null;
    save(); render({ anim: false, focus: false });
    toast(list.length === 1 ? 'Got it: ' + list[0].name : 'Got ' + list.length + ' files.');
  }
  function act(a, el, s) {
    switch (a) {
      case 'unsure': S.d[s.key] = 'unsure'; S.skipped[s.id] = 'unsure'; toast('No problem. We’ll find out together.'); return go(afterId(s));
      case 'copy': return copyText(STUDIO_EMAIL, el);
      case 'ics': return ics();
      case 'download': return download((S.d.rname || 'restaurant').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-setup.txt', answersText(), 'text/plain');
      case 'restart':
        if (!confirm('Start the demo again from the beginning? Your answers on this device are cleared.')) return;
        try { localStorage.removeItem(KEY); } catch (e) { /* fine */ }
        S = fresh(); return render();
    }
  }
  function copyText(text, btn) {
    const ok = () => { btn.textContent = 'Copied'; btn.classList.add('ok'); setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('ok'); }, 1800); };
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(ok, () => fallback()); } else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { toast('Copy failed. The email is ' + text); } ta.remove(); }
  }
  function ics() {
    const sl = S.d.slot; if (!sl || !sl.date || !sl.time) return;
    const [y, m, d] = sl.date.split('-').map(Number); const [hh, mm] = sl.time.split(':').map(Number);
    const p = n => String(n).padStart(2, '0');
    const loc = dt => dt.getFullYear() + p(dt.getMonth() + 1) + p(dt.getDate()) + 'T' + p(dt.getHours()) + p(dt.getMinutes()) + '00';
    const start = new Date(y, m - 1, d, hh, mm), end = new Date(start.getTime() + 30 * 60000);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    download('domin8te-kickoff.ics', ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Domin8te Media//Onboarding//EN', 'BEGIN:VEVENT',
      'UID:' + Date.now() + '@domin8temedia.com', 'DTSTAMP:' + stamp, 'DTSTART:' + loc(start), 'DTEND:' + loc(end),
      'SUMMARY:Domin8te kickoff call (' + (S.d.callType === 'video' ? 'video' : 'phone') + ')',
      'DESCRIPTION:30 minutes. We walk through your plan and finish anything you skipped.', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'), 'text/calendar');
  }
  function answersText() {
    const lines = ['Your Domin8te setup', (S.d.rname || '') + (S.d.first ? ', ' + S.d.first : ''), ''];
    const v = visible().filter(x => !PASSIVE.includes(x.type));
    chapters.forEach(c => {
      const items = v.filter(x => x.ch === c.id); if (!items.length) return;
      lines.push(c.name.toUpperCase());
      items.forEach(x => lines.push('  ' + x.sum + ': ' + (summarize(x) || (S.skipped[x.id] ? 'to sort on the call' : 'not answered'))));
      lines.push('');
    });
    lines.push('Questions: ' + STUDIO_EMAIL);
    return lines.join('\n');
  }

  /* dock, header, drawers */
  $('#nextBtn').addEventListener('click', next);
  $('#backBtn').addEventListener('click', back);
  $('#skipBtn').addEventListener('click', () => skip());
  $('#chapters').addEventListener('click', e => {
    const b = e.target.closest('[data-ch]'); if (!b) return;
    const items = visible().filter(x => x.ch === b.dataset.ch);
    const first = items.find(x => !S.done[x.id] && !S.skipped[x.id]) || items[0];
    closeRail(); go(first.id);
  });
  const railEl = $('#rail'), scrim = $('#scrim'), helpEl = $('#help');
  function openRail() { railEl.classList.add('open'); scrim.hidden = false; const b = $('#chapBtn'); b && b.setAttribute('aria-expanded', 'true'); }
  function closeRail() { railEl.classList.remove('open'); if (helpEl.hidden) scrim.hidden = true; const b = $('#chapBtn'); b && b.setAttribute('aria-expanded', 'false'); }
  $('#topChapter').addEventListener('click', e => { if (e.target.closest('#chapBtn')) railEl.classList.contains('open') ? closeRail() : openRail(); });
  function openHelp() { helpEl.hidden = false; scrim.hidden = false; $('#helpBtn').setAttribute('aria-expanded', 'true'); $('#helpClose').focus(); }
  function closeHelp() { helpEl.hidden = true; if (!railEl.classList.contains('open')) scrim.hidden = true; $('#helpBtn').setAttribute('aria-expanded', 'false'); $('#helpBtn').focus(); }
  $('#helpBtn').addEventListener('click', openHelp);
  $('#helpClose').addEventListener('click', closeHelp);
  scrim.addEventListener('click', () => { if (!helpEl.hidden) closeHelp(); closeRail(); });
  helpEl.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'helpcall') { closeHelp(); skip('call'); }
    if (b.dataset.act === 'bookcall') { closeHelp(); go('call'); }
  });
  const later = $('#later');
  $('#laterBtn').addEventListener('click', () => {
    $('#laterWho').textContent = S.d.email ? 'Want to finish on another device? We can email ' + S.d.email + ' a link back to this exact step.' : '';
    later.showModal ? later.showModal() : later.setAttribute('open', '');
  });
  $('#laterClose').addEventListener('click', () => later.close());
  $('#laterEmail').addEventListener('click', () => { later.close(); toast('Demo only: the real version emails your link to ' + (S.d.email || 'you') + '.'); });

  $('#zoomPrev').addEventListener('click', () => showZoom(zoomAt - 1));
  $('#zoomNext').addEventListener('click', () => showZoom(zoomAt + 1));
  $('#zoomClose').addEventListener('click', () => zoom.close());
  zoom.addEventListener('click', e => { if (e.target === zoom) zoom.close(); });

  document.addEventListener('keydown', e => {
    if (zoom.open) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); showZoom(zoomAt - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); showZoom(zoomAt + 1); }
      return;
    }
    if (e.key === 'Escape') { if (!helpEl.hidden) closeHelp(); if (railEl.classList.contains('open')) closeRail(); return; }
    if (later.open || !helpEl.hidden || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target, tag = t.tagName;
    const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && t.type !== 'file');
    if (e.key === 'Enter' && !e.shiftKey) {
      if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return;
      e.preventDefault(); next(); return;
    }
    if (!typing && /^[1-9]$/.test(e.key)) {
      const opts = $$('.opt', stage); const o = opts[+e.key - 1]; if (o) { e.preventDefault(); o.click(); o.focus(); }
    }
  });
  window.addEventListener('hashchange', () => { if (fromHash()) render(); });
  function fromHash() {
    const m = /#s=([\w-]+)/.exec(location.hash); if (!m || m[1] === S.at) return false;
    const s = byId(m[1]); if (!s) return false;
    if (S.d.how === 'call' && !s.core) S.d.how = 'self';
    S.at = s.id; return true;
  }

  /* boot */
  const returning = !fromHash() && S.at !== steps[0].id && Object.keys(S.done).length > 0;
  $('#saved').textContent = 'Autosave on';
  render({ focus: false });
  if (returning) toast('Welcome back. You’re right where you left off.');
})();
