// @ts-check
/*
 * Cinematic view of Revenue (#/revenue/<month>/cinema, 2026-10-15): Karan's month as a full-screen dark stage, opened from the
 * Cinematic view button in the Revenue toolbar or the jump palette ("Revenue: Cinematic view"). Business owner only, like
 * Revenue itself (mod-revenue.js checks the owner and hands this file the month it already read; nothing is read here, nothing
 * is written, and the demo never shows it).
 *
 * On the stage: the month's income (green), costs (orange) and profit (ink) counting up with the margin and the move on last
 * month; the income and profit goal rings; the last 12 months as 3D bars you orbit and tilt with the pointer (drag) or the arrow
 * keys, each month a link to that month on Revenue; the client mix as a slowly turning 3D ring; costs by kind; tax to put aside,
 * still to come and the year so far; the "What changed" lines as captions that play one after another; and a Tour that moves a
 * spotlight from panel to panel for a screen on the wall. Space pauses, T tours, Esc or Close goes back to Revenue. With less
 * motion asked for, the same figures sit still.
 *
 * mod-revenue.js calls window.D8C_EXT.cinema.page(d, R) with the month's data and its helpers (totals, insights, goals, names).
 */
(function () {
  'use strict';
  const W = /** @type {any} */ (window);
  /** @type {any} */
  const EXT = (W.D8C_EXT = W.D8C_EXT || {});
  const C = () => W.D8C;
  const esc = (/** @type {any} */ s) => C().esc(s);
  const SPIN_PERIOD = 80000;   // one full turn of the client ring, in ms
  const TOUR_MS = 7000;
  const CAPTION_MS = 5200;
  const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  /** The view on screen, or null. @type {null | {root: HTMLElement, raf: number, spin: number, paused: boolean, sel: number, n: number, rx: number, ry: number, drag: {on: boolean, x: number, y: number, moved: boolean}, idle: number, tour: {on: boolean, i: number, at: number}, cap: {i: number, n: number, at: number}, timers: number[], counts: {el: HTMLElement, to: number, t0: number, text: (n: number) => string}[], off: (() => void)[], last: number, ym: string}} */
  let live = null;
  /** When the stage was last drawn: a redraw within a few seconds skips the entrance. */
  let shownAt = 0;

  /* ---- drawing helpers ------------------------------------------------------------------------------------------------- */

  /** A panel's shell. @param {string} key @param {string} title @param {string} sub @param {string} body @param {string} [href] @param {string} [cta] @param {number} [i] */
  function panel(key, title, sub, body, href, cta, i) {
    return `<section class="cn-panel cn-p-${esc(key)}" data-cn-panel="${esc(key)}" style="--i:${i || 0}" aria-labelledby="cn-h-${esc(key)}">
      <div class="cn-ph"><div><h2 id="cn-h-${esc(key)}">${title}</h2>${sub ? `<p class="cn-sub">${sub}</p>` : ''}</div>${href ? `<a class="cn-go" href="${esc(href)}">${esc(cta || 'Open')}${C().icon('arrow')}</a>` : ''}</div>
      <div class="cn-pb">${body}</div></section>`;
  }
  /** A money figure that counts up when the stage opens. @param {number} minor @param {string} [cls] */
  const moneyUp = (minor, cls) => `<span class="cn-num${cls ? ' ' + cls : ''}" data-cn-money="${Math.abs(minor)}">${rmq.matches ? esc(C().money(Math.abs(minor), 'USD')) : '$0'}</span>`;
  /** A plain number that counts up. @param {number} n @param {string} [after] */
  const countUp = (n, after) => `<span class="cn-num" data-cn-count="${n}"${after ? ` data-cn-after="${esc(after)}"` : ''}>${rmq.matches ? n : 0}${after ? esc(after) : ''}</span>`;
  /** A goal ring: an SVG circle filled to the percent. @param {number} pct @param {string} label @param {string} cls */
  function goalRing(pct, label, cls) {
    const r = 42;
    const len = 2 * Math.PI * r;
    return `<div class="cn-goal ${cls}" role="img" aria-label="${esc(label)}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="cn-goal-bg" cx="50" cy="50" r="${r}"/><circle class="cn-goal-fg" cx="50" cy="50" r="${r}" stroke-dasharray="${len.toFixed(1)}" stroke-dashoffset="${(len * (1 - pct / 100)).toFixed(1)}" style="--len:${len.toFixed(1)};--off:${(len * (1 - pct / 100)).toFixed(1)}"/></svg><span class="cn-goal-n">${countUp(pct, '%')}</span></div>`;
  }

  /* ---- the panels -------------------------------------------------------------------------------------------------------- */

  /** The month's three figures, the move on last month, the margin and the goal rings. @param {any} d @param {any} R */
  function heroPanel(d, R) {
    const K = C();
    const t = R.totals(d, d.ym);
    const prev = R.totals(d, R.shift(d.ym, -1));
    const pn = R.nearName(R.shift(d.ym, -1), d.ym);
    const mv = (/** @type {number} */ cur, /** @type {number} */ was, /** @type {boolean} */ has, /** @type {boolean} */ costs) => {
      const m = R.move(cur, { has, v: was });
      if (!m) return '';
      const good = m.dir === 'same' ? '' : (m.dir === 'up') !== costs ? ' is-good' : ' is-bad';
      return `<span class="cn-move${good}">${esc(m.dir === 'same' ? `same as ${pn}` : `${m.text} on ${pn}`)}</span>`;
    };
    const mg = R.margin(t.profit, t.inc);
    const st = d.settings || {};
    const partial = d.ym === R.currentMonth();
    const figs = `<dl class="cn-figs">
      <div class="is-inc"><dt>Income</dt><dd>${moneyUp(t.inc)}${mv(t.inc, prev.inc, prev.incN > 0, false)}</dd></div>
      <div class="is-cost"><dt>Costs</dt><dd>${moneyUp(t.cost)}${mv(t.cost, prev.cost, prev.costN > 0, true)}</dd></div>
      <div class="is-prof${t.profit < 0 ? ' is-neg' : ''}"><dt>${t.profit < 0 ? 'Loss' : 'Profit'}</dt><dd><span class="cn-num">${t.profit < 0 ? '-' : ''}${moneyUp(t.profit)}</span>${mg === null ? '' : `<span class="cn-move">${esc(`${mg}% margin`)}</span>`}</dd></div></dl>`;
    const rings = `<div class="cn-goals">${st.incGoal ? goalRing(R.goalPct(t.inc, st.incGoal), `${R.goalPct(t.inc, st.incGoal)} percent of the income goal of ${K.money(st.incGoal, 'USD')}`, 'is-inc') + `<p class="cn-goal-k">Income goal<br><strong>${esc(K.money(st.incGoal, 'USD'))}</strong></p>` : '<p class="cn-goal-k cn-goal-none">No income goal yet. Set one with Goals and tax on Revenue.</p>'}
      ${st.profGoal ? goalRing(R.goalPct(t.profit, st.profGoal), `${R.goalPct(t.profit, st.profGoal)} percent of the profit goal of ${K.money(st.profGoal, 'USD')}`, 'is-prof') + `<p class="cn-goal-k">Profit goal<br><strong>${esc(K.money(st.profGoal, 'USD'))}</strong></p>` : ''}</div>`;
    return panel('hero', esc(R.monthName(d.ym)), t.has ? (partial ? 'So far this month' : 'The month in full') : 'Nothing entered yet', t.has ? figs + rings : `<div class="empty"><p><strong>Nothing entered for ${esc(R.monthName(d.ym))}.</strong></p><p><a href="#/revenue/${esc(d.ym)}/income">Enter income on Revenue</a></p></div>`, `#/revenue/${d.ym}`, 'Revenue', 0);
  }

  /** The last 12 months as 3D bars: income and costs side by side on a floor, each month a link. @param {any} d @param {any} R */
  function barsPanel(d, R) {
    const K = C();
    const rows = d.series.slice(-12);
    const max = Math.max(1, ...rows.map((/** @type {any} */ r) => Math.max(r.inc, r.cost)));
    const H = 160;
    const groups = rows.map((/** @type {any} */ r, /** @type {number} */ i) => {
      const hi = Math.round((r.inc / max) * H);
      const hc = Math.round((r.cost / max) * H);
      const profit = r.inc - r.cost;
      const has = r.incN > 0 || r.costN > 0;
      const words = has ? `income ${K.money(r.inc, 'USD')}, costs ${K.money(r.cost, 'USD')}, ${profit < 0 ? 'loss ' + K.money(-profit, 'USD') : 'profit ' + K.money(profit, 'USD')}` : 'nothing entered';
      const faces = (/** @type {string} */ cls, /** @type {number} */ h) => `<span class="cn-box ${cls}" style="--h:${Math.max(h, has ? 2 : 0)}px"><i class="f-front"></i><i class="f-back"></i><i class="f-left"></i><i class="f-right"></i><i class="f-top"></i></span>`;
      return `<a class="cn-mgroup${r.ym === d.ym ? ' is-now' : ''}${has ? '' : ' is-empty'}" href="#/revenue/${esc(r.ym)}" style="--x:${i};--i:${i}" data-cn-month="${esc(r.ym)}" data-cn-words="${esc(`${R.monthName(r.ym)}: ${words}`)}" aria-label="${esc(R.monthName(r.ym))}: ${esc(words)}. Open the month">${faces('is-inc', hi)}${faces('is-cost', hc)}<span class="cn-mlabel">${esc(R.monthName(r.ym, 'mon'))}${r.ym.slice(5) === '01' || i === 0 ? `<small>${esc(r.ym.slice(0, 4))}</small>` : ''}</span></a>`;
    }).join('');
    const sum = rows.reduce((/** @type {{inc: number, cost: number}} */ s, /** @type {any} */ r) => ({ inc: s.inc + r.inc, cost: s.cost + r.cost }), { inc: 0, cost: 0 });
    const body = `<div class="cn-scene" id="cn-scene" tabindex="0" role="group" aria-label="The last 12 months as 3D bars. Drag or use the arrow keys to turn and tilt it. Tab moves between the months." aria-describedby="cn-scene-cap">
        <div class="cn-world" id="cn-world"><div class="cn-floor" aria-hidden="true"></div>${groups}</div></div>
      <p class="cn-scene-cap" id="cn-scene-cap" aria-live="polite"><span class="cn-key is-inc"></span>Income <span class="cn-key is-cost"></span>Costs <span class="cn-cap-text" data-cn-scene-cap>Hover or focus a month for its figures. Drag to turn.</span></p>`;
    return panel('bars', 'Last 12 months', `${esc(K.money(sum.inc, 'USD'))} in, ${esc(K.money(sum.cost, 'USD'))} out over the year`, body, `#/revenue/${d.ym}`, 'Charts', 1);
  }

  /** The client mix as a turning ring: one orb a client, sized by its share of the month's income. @param {any} d @param {any} R */
  function mixPanel(d, R) {
    const K = C();
    const slices = R.mixSlices(d);
    const total = slices.reduce((/** @type {number} */ s, /** @type {any} */ x) => s + x.minor, 0);
    const n = slices.length;
    const Col = EXT.color && typeof EXT.color === 'object' ? EXT.color : null;
    const orbs = slices.map((/** @type {any} */ x, /** @type {number} */ i) => {
      const share = total > 0 ? Math.round((x.minor / total) * 100) : 0;
      const size = Math.round(52 + (total > 0 ? (x.minor / total) : 0) * 56);
      const logo = x.id && Col ? Col.logoOf(x.id) : '';
      const tag = x.id && Col ? Col.tagOf(x.id) : (x.other ? '+' : String(x.name).slice(0, 2).toUpperCase());
      return `<a class="cn-orb${i === 0 ? ' is-sel' : ''}" href="#/revenue/${esc(d.ym)}/income" data-cn-orb="${i}" style="--a:${(360 / Math.max(1, n)) * i}deg;--i:${i};--size:${size}px;--cc:${esc(x.color)}" aria-label="${esc(x.name)}: ${esc(K.money(x.minor, 'USD'))}, ${share} percent of the month. Open the income list">
        <span class="cn-orb-core">${logo ? `<img src="${esc(logo)}" alt="" width="48" height="48" decoding="async" draggable="false">` : `<span class="cn-orb-tag">${esc(tag)}</span>`}</span>
        <span class="cn-orb-name">${esc(x.name)}</span><span class="cn-orb-amt">${esc(K.money(x.minor, 'USD'))} · ${share}%</span></a>`;
    }).join('');
    const body = n ? `<div class="cn-stage3d"><div class="cn-orbit" id="cn-orbit" style="--n:${n}">${orbs}</div></div><p class="cn-ring-help meta">Size is the share of the month. Arrow keys move between clients while the ring has the focus.</p>`
      : `<div class="empty"><p><strong>No income entered for ${esc(R.monthName(d.ym))}.</strong></p></div>`;
    return panel('mix', 'Client mix', n ? `${n === 1 ? 'One source' : `${n} sources`} of income this month` : 'Who paid what share', body, `#/revenue/${d.ym}/income`, 'Income', 2);
  }

  /** Costs by kind, largest first. @param {any} d @param {any} R */
  function kindsPanel(d, R) {
    const K = C();
    /** @type {Record<string, number>} */ const by = {};
    for (const c of d.costs) by[c.category] = (by[c.category] || 0) + c.amount;
    const list = Object.entries(by).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const total = list.reduce((s, [, v]) => s + v, 0);
    const rep = d.costs.filter((/** @type {any} */ c) => c.repeats).reduce((/** @type {number} */ s, /** @type {any} */ c) => s + c.amount, 0);
    const rows = list.map(([k, v], i) => `<li style="--i:${i}"><span class="cn-kind-h"><span>${esc(R.catName(k))}</span><strong>${esc(K.money(v, 'USD'))}</strong></span><span class="cn-kind-bar" aria-hidden="true"><i style="--w:${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%"></i></span></li>`).join('');
    const body = list.length ? `<ol class="cn-kinds">${rows}</ol><p class="meta cn-more">${esc(K.money(rep, 'USD'))} of it repeats every month${total - rep > 0 ? `, ${esc(K.money(total - rep, 'USD'))} is one-off` : ''}.</p>` : `<div class="empty"><p><strong>No costs entered for ${esc(R.monthName(d.ym))}.</strong></p></div>`;
    return panel('kinds', 'Costs by kind', list.length ? `${esc(K.money(total, 'USD'))} across ${list.length === 1 ? 'one kind' : `${list.length} kinds`}` : 'What the business spent on itself', body, `#/revenue/${d.ym}/costs`, 'Costs', 3);
  }

  /** Tax to put aside, still to come, and the year so far. @param {any} d @param {any} R */
  function tilesPanel(d, R) {
    const K = C();
    const t = R.totals(d, d.ym);
    const st = d.settings || {};
    const due = d.income.filter((/** @type {any} */ x) => !x.received && x.amount > 0);
    const dueSum = due.reduce((/** @type {number} */ s, /** @type {any} */ x) => s + x.amount, 0);
    const Y = R.yearRows(d);
    const ytd = Y.now.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + r.inc - r.cost, 0);
    const was = Y.was.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + r.inc - r.cost, 0);
    const hasWas = Y.was.some((/** @type {any} */ r) => r.incN || r.costN);
    const ytdInc = Y.now.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + r.inc, 0);
    const taxNow = st.tax ? R.taxOf(t.profit - dueSum, st.tax) : 0;
    const taxYear = st.tax ? R.taxOf(ytd, st.tax) : 0;
    const mvY = hasWas ? R.move(ytd, { has: true, v: was }) : null;
    const tile = (/** @type {string} */ k, /** @type {string} */ v, /** @type {string} */ s, /** @type {string} */ href, /** @type {string} */ cls) => `<a class="cn-tile${cls ? ' ' + cls : ''}" href="${esc(href)}"><span class="cn-tile-k">${k}</span><span class="cn-tile-v">${v}</span><span class="cn-tile-s">${s}</span></a>`;
    const body = `<div class="cn-tiles">
      ${tile('Put aside for tax', st.tax ? moneyUp(taxNow) : '<span class="cn-tile-none">Not set</span>', st.tax ? `${esc(R.pctText(st.tax))} of profit on money received. ${esc(Y.y)} so far: ${esc(K.money(taxYear, 'USD'))}` : 'Set a tax percent with Goals and tax', `#/revenue/${d.ym}`, 'is-tax')}
      ${tile('Still to come', moneyUp(dueSum), due.length ? `${due.length === 1 ? 'One payment' : `${due.length} payments`} not received yet` : 'Everything entered is received', `#/revenue/${d.ym}/income`, 'is-due')}
      ${tile(`${esc(Y.y)} so far`, `${ytd < 0 ? '-' : ''}${moneyUp(ytd)}`, `${ytd < 0 ? 'Loss' : 'Profit'} on ${esc(K.money(ytdInc, 'USD'))} income${mvY ? `, ${esc(mvY.dir === 'same' ? 'the same as' : mvY.text + ' on')} the same months of ${esc(Y.ly)}` : ''}`, `#/revenue/${d.ym}/years`, ytd < 0 ? 'is-neg' : 'is-year')}</div>`;
    return panel('tiles', 'Set aside, still to come, the year', 'From the same figures as the Revenue cards', body, `#/revenue/${d.ym}/years`, 'Years', 4);
  }

  /** The "What changed" lines as captions, one after another. @param {any} d @param {any} R */
  function captionsPanel(d, R) {
    const lines = R.insights(d);
    const body = lines.length
      ? `<div class="cn-caps" data-cn-caps="${lines.length}">${lines.map((/** @type {string} */ x, /** @type {number} */ i) => `<p class="cn-cap${i === 0 ? ' is-on' : ''}" data-cn-cap="${i}">${esc(x)}</p>`).join('')}</div>
         <div class="cn-cap-dots" role="group" aria-label="Captions">${lines.map((/** @type {string} */ x, /** @type {number} */ i) => `<button class="cn-cap-dot${i === 0 ? ' is-on' : ''}" type="button" data-cn-dot="${i}" aria-label="Caption ${i + 1} of ${lines.length}" aria-pressed="${i === 0}"></button>`).join('')}</div>
         <ul class="cn-cap-list sr-only">${lines.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join('')}</ul>`
      : `<div class="empty"><p><strong>Nothing to say yet.</strong></p><p>The captions come from the figures entered for ${esc(R.monthName(d.ym))}.</p></div>`;
    return panel('caps', 'What changed', lines.length ? `${esc(R.monthName(d.ym))}${d.ym === R.currentMonth() ? ', so far' : ''}, in plain words` : 'The month in plain words', body, `#/revenue/${d.ym}`, 'Revenue', 5);
  }

  /* ---- the page ------------------------------------------------------------------------------------------------------------ */

  /** Draws the stage into Revenue's body (#rv-body) and starts its motion. @param {any} d the month, from mod-revenue.js @param {any} R Revenue's helpers */
  function page(d, R) {
    stop();
    const K = C();
    const box = /** @type {HTMLElement|null} */ (K.main.querySelector('#rv-body')) || K.main;
    const settled = Date.now() - shownAt < 8000;
    shownAt = Date.now();
    const ym = d.ym;
    const prev = R.shift(ym, -1);
    const next = R.shift(ym, 1);
    const now = R.currentMonth();
    const canNext = R.monthIndex(next) <= R.monthIndex(now);
    const canPrev = R.monthIndex(prev) >= R.monthIndex(now) - R.MONTHS_BACK;
    document.body.classList.add('is-cinema');   // the sidebar and top bar sit under the stage: hidden while it is open (css/66-cinema.css)
    box.innerHTML = `<div class="cn-stage${rmq.matches ? ' is-still' : ''}${settled ? ' is-settled' : ''}" id="cn-stage" role="region" aria-label="Cinematic view of Revenue">
      <div class="cn-bg" aria-hidden="true"><div class="cn-bg-glow a"></div><div class="cn-bg-glow b"></div><div class="cn-bg-dots"></div><div class="cn-bg-stars"></div></div>
      <header class="cn-head">
        <div class="cn-head-l"><p class="cn-kicker">Revenue, only you see this</p><h2 class="cn-title" id="cn-title" tabindex="-1">Cinematic view</h2>
          <nav class="cn-months" aria-label="Month"><a class="cn-mnav${canPrev ? '' : ' is-off'}" href="#/revenue/${esc(prev)}/cinema"${canPrev ? '' : ' aria-disabled="true" tabindex="-1"'} aria-label="${esc(R.monthName(prev))}">${K.icon('back')}</a><span class="cn-mname">${esc(R.monthName(ym))}</span><a class="cn-mnav${canNext ? '' : ' is-off'}" href="#/revenue/${esc(next)}/cinema"${canNext ? '' : ' aria-disabled="true" tabindex="-1"'} aria-label="${esc(R.monthName(next))}">${K.icon('arrow')}</a></nav></div>
        <div class="cn-head-r">
          <button class="btn btn-quiet cn-btn" type="button" data-cn="tour" aria-pressed="false" title="Cycle through the panels, for a screen on the wall (T)">${K.icon('refresh')}Tour</button>
          <button class="btn btn-quiet cn-btn" type="button" data-cn="pause" aria-pressed="false" title="Pause the motion (Space)">${K.icon('clock')}<span data-cn-pause-label>Pause</span></button>
          <a class="btn cn-btn cn-close" href="#/revenue/${esc(ym)}" data-cn="close" title="Back to Revenue (Esc)">${K.icon('x')}Close</a>
        </div>
      </header>
      <div class="cn-grid">
        ${heroPanel(d, R)}
        ${barsPanel(d, R)}
        ${mixPanel(d, R)}
        ${kindsPanel(d, R)}
        ${captionsPanel(d, R)}
        ${tilesPanel(d, R)}
      </div>
      <p class="cn-foot meta"><kbd>←</kbd><kbd>→</kbd> turn <kbd>↑</kbd><kbd>↓</kbd> tilt <kbd>Space</kbd> pause <kbd>T</kbd> tour <kbd>Esc</kbd> close</p>
    </div>`;
    const root = /** @type {HTMLElement} */ (box.querySelector('#cn-stage'));
    const caps = root.querySelector('[data-cn-caps]');
    const nOrbs = root.querySelectorAll('[data-cn-orb]').length;
    // a ring of one, two or three starts turned a little, so nobody hides straight behind the first orb
    live = { root, raf: 0, spin: nOrbs > 1 && nOrbs <= 3 ? 60 : 0, paused: false, sel: 0, n: nOrbs, rx: 14, ry: -22, drag: { on: false, x: 0, y: 0, moved: false }, idle: performance.now(), tour: { on: false, i: -1, at: 0 }, cap: { i: 0, n: caps ? Number(caps.getAttribute('data-cn-caps')) || 0 : 0, at: performance.now() }, timers: [], counts: [], off: [], last: 0, ym };
    wire(root);
    collectCounts(root);
    paintWorld();
    { const ring = /** @type {HTMLElement|null} */ (root.querySelector('#cn-orbit')); if (ring) ring.style.setProperty('--spin', live.spin + 'deg'); }
    const h = /** @type {HTMLElement|null} */ (root.querySelector('#cn-title'));
    if (h) h.focus({ preventScroll: true });
    if (!rmq.matches) live.raf = requestAnimationFrame(frame);
    else if (live.cap.n > 1) live.timers.push(window.setInterval(() => { if (live && !live.paused) showCaption(live.cap.i + 1); }, CAPTION_MS));
  }
  /** Stops the motion and forgets the stage. */
  function stop() {
    document.body.classList.remove('is-cinema');
    if (!live) return;
    if (live.raf) cancelAnimationFrame(live.raf);
    for (const t of live.timers) clearInterval(t);
    for (const f of live.off) f();
    live = null;
  }
  /** Numbers that count up: found once per drawing. @param {HTMLElement} root */
  function collectCounts(root) {
    if (!live || rmq.matches) return;
    const K = C();
    const now = performance.now();
    for (const el of Array.from(root.querySelectorAll('[data-cn-count]'))) {
      const after = el.getAttribute('data-cn-after') || '';
      live.counts.push({ el: /** @type {HTMLElement} */ (el), to: Number(el.getAttribute('data-cn-count')) || 0, t0: now + 300, text: (n) => String(n) + after });
    }
    for (const el of Array.from(root.querySelectorAll('[data-cn-money]'))) {
      live.counts.push({ el: /** @type {HTMLElement} */ (el), to: Number(el.getAttribute('data-cn-money')) || 0, t0: now + 300, text: (n) => K.money(n, 'USD') });
    }
  }

  /* ---- motion: the bars' turn, the ring, the count-ups, the captions and the tour --------------------------------------------- */

  /** Puts the turn and tilt on the 3D world. */
  function paintWorld() {
    if (!live) return;
    const w = /** @type {HTMLElement|null} */ (live.root.querySelector('#cn-world'));
    if (w) w.style.transform = `rotateX(${live.rx.toFixed(2)}deg) rotateY(${live.ry.toFixed(2)}deg)`;
  }
  /** @param {number} now */
  function frame(now) {
    if (!live) return;
    const L = live;
    L.raf = requestAnimationFrame(frame);
    const dt = L.last ? Math.min(100, now - L.last) : 16;
    L.last = now;
    if (!L.paused) {
      // The client ring turns steadily.
      L.spin = (L.spin + (360 * dt) / SPIN_PERIOD) % 360;
      // The bars sway gently once nobody has touched them for a while.
      if (!L.drag.on && now - L.idle > 4000) { L.ry += Math.sin(now / 4800) * 0.008 * dt; paintWorld(); }
      // Captions play one after another.
      if (L.cap.n > 1 && now - L.cap.at > CAPTION_MS) showCaption(L.cap.i + 1);
      if (L.tour.on && now - L.tour.at > TOUR_MS) tourStep();
    }
    const ring = /** @type {HTMLElement|null} */ (L.root.querySelector('#cn-orbit'));
    if (ring) {
      ring.style.setProperty('--spin', L.spin.toFixed(2) + 'deg');
      const n = L.n || 1;
      const orbs = ring.children;
      for (let i = 0; i < orbs.length; i++) {
        const a = ((360 / n) * i + L.spin) * (Math.PI / 180);
        /** @type {HTMLElement} */ (orbs[i]).style.setProperty('--depth', ((Math.cos(a) + 1) / 2).toFixed(3));
      }
    }
    if (L.counts.length) {
      const keep = [];
      for (const c of L.counts) {
        const p = Math.min(1, Math.max(0, (now - c.t0) / 1200));
        const e = 1 - Math.pow(1 - p, 3);
        c.el.textContent = c.text(Math.round(c.to * e));
        if (p < 1) keep.push(c);
      }
      L.counts = keep;
    }
  }
  /** Shows one caption. @param {number} i */
  function showCaption(i) {
    if (!live || !live.cap.n) return;
    const L = live;
    L.cap.i = ((i % L.cap.n) + L.cap.n) % L.cap.n;
    L.cap.at = performance.now();
    for (const p of Array.from(L.root.querySelectorAll('[data-cn-cap]'))) p.classList.toggle('is-on', Number(p.getAttribute('data-cn-cap')) === L.cap.i);
    for (const b of Array.from(L.root.querySelectorAll('[data-cn-dot]'))) { const on = Number(b.getAttribute('data-cn-dot')) === L.cap.i; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); }
  }
  /** Chooses an orb on the client ring: it comes to the front. @param {number} i @param {boolean} focus */
  function select(i, focus) {
    if (!live || !live.n) return;
    const L = live;
    L.sel = ((i % L.n) + L.n) % L.n;
    const orbs = Array.from(L.root.querySelectorAll('[data-cn-orb]'));
    for (const o of orbs) o.classList.toggle('is-sel', Number(o.getAttribute('data-cn-orb')) === L.sel);
    L.spin = (360 - (360 / L.n) * L.sel) % 360;
    if (rmq.matches) { const ring = /** @type {HTMLElement|null} */ (L.root.querySelector('#cn-orbit')); if (ring) ring.style.setProperty('--spin', L.spin + 'deg'); }
    const el = /** @type {HTMLElement|undefined} */ (orbs[L.sel]);
    if (focus && el) el.focus({ preventScroll: true });
  }
  /** @param {boolean} on */
  function setPaused(on) {
    if (!live) return;
    live.paused = on;
    live.root.classList.toggle('is-paused', on);
    const b = live.root.querySelector('[data-cn="pause"]');
    if (b) { b.setAttribute('aria-pressed', String(on)); const l = b.querySelector('[data-cn-pause-label]'); if (l) l.textContent = on ? 'Play' : 'Pause'; }
  }
  /** @param {boolean} on */
  function setTour(on) {
    if (!live) return;
    live.tour.on = on;
    live.root.classList.toggle('is-tour', on);
    const b = live.root.querySelector('[data-cn="tour"]');
    if (b) b.setAttribute('aria-pressed', String(on));
    if (!on) { for (const p of Array.from(live.root.querySelectorAll('.cn-panel.is-spot'))) p.classList.remove('is-spot'); live.tour.i = -1; return; }
    tourStep();
  }
  /** The next panel takes the spotlight. */
  function tourStep() {
    if (!live) return;
    const L = live;
    const panels = Array.from(L.root.querySelectorAll('.cn-panel'));
    if (!panels.length) return;
    L.tour.i = (L.tour.i + 1) % panels.length;
    L.tour.at = performance.now();
    panels.forEach((p, i) => p.classList.toggle('is-spot', i === L.tour.i));
    const p = /** @type {HTMLElement} */ (panels[L.tour.i]);
    if (window.innerWidth < 1100) p.scrollIntoView({ block: 'center', behavior: rmq.matches ? 'auto' : 'smooth' });
    if (p.getAttribute('data-cn-panel') === 'mix' && L.n) select(L.sel + 1, false);
    if (rmq.matches) L.timers.push(window.setTimeout(() => { if (live && live.tour.on && !live.paused) tourStep(); }, TOUR_MS));
  }
  /** Leaves the stage: back to the month on Revenue. */
  function close() {
    const ym = live ? live.ym : '';
    stop();
    location.hash = ym ? `#/revenue/${ym}` : '#/revenue';
  }

  /** @param {HTMLElement} root */
  function wire(root) {
    if (!live) return;
    const L = live;
    root.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const b = t.closest('[data-cn]');
      if (b) {
        const k = b.getAttribute('data-cn');
        if (k === 'close') { e.preventDefault(); close(); }
        else if (k === 'pause') setPaused(!L.paused);
        else if (k === 'tour') setTour(!L.tour.on);
        return;
      }
      const dot = t.closest('[data-cn-dot]');
      if (dot) { showCaption(Number(dot.getAttribute('data-cn-dot'))); return; }
      // A drag that moved is not a click on a month.
      if (L.drag.moved && t.closest('.cn-mgroup')) { e.preventDefault(); L.drag.moved = false; }
    });
    root.addEventListener('focusin', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const o = t.closest('[data-cn-orb]');
      if (o) select(Number(o.getAttribute('data-cn-orb')), false);
      const m = t.closest('[data-cn-words]');
      if (m) sceneCaption(m.getAttribute('data-cn-words') || '');
    });
    root.addEventListener('pointerover', (e) => { const m = /** @type {HTMLElement} */ (e.target).closest('[data-cn-words]'); if (m) sceneCaption(m.getAttribute('data-cn-words') || ''); });
    // Dragging the 3D scene turns and tilts it.
    const scene = /** @type {HTMLElement|null} */ (root.querySelector('#cn-scene'));
    if (scene) {
      scene.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; L.drag = { on: true, x: e.clientX, y: e.clientY, moved: false }; L.idle = performance.now(); try { scene.setPointerCapture(e.pointerId); } catch (x) { /* a pointer that cannot be held still drags */ } });
      scene.addEventListener('pointermove', (e) => {
        if (!L.drag.on) return;
        const dx = e.clientX - L.drag.x, dy = e.clientY - L.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) L.drag.moved = true;
        L.ry += dx * 0.45;
        L.rx = Math.max(-4, Math.min(64, L.rx - dy * 0.35));
        L.drag.x = e.clientX; L.drag.y = e.clientY;
        L.idle = performance.now();
        paintWorld();
      });
      const up = () => { if (L.drag.on) { L.drag.on = false; L.idle = performance.now(); } };
      scene.addEventListener('pointerup', up);
      scene.addEventListener('pointercancel', up);
      scene.addEventListener('lostpointercapture', up);
    }
    // Hover holds the client ring still so the names can be read.
    root.addEventListener('pointerenter', (e) => { const t = /** @type {HTMLElement} */ (e.target); if (t.closest && t.closest('.cn-orbit')) root.classList.add('is-held'); }, true);
    root.addEventListener('pointerleave', (e) => { const t = /** @type {HTMLElement} */ (e.target); if (t.closest && t.closest('.cn-orbit')) root.classList.remove('is-held'); }, true);
    // A light parallax with a mouse: the background layers lean towards the pointer.
    if (finePointer.matches && !rmq.matches) {
      let queued = false, px = 0, py = 0;
      root.addEventListener('pointermove', (e) => {
        px = (e.clientX / window.innerWidth - 0.5) * 2;
        py = (e.clientY / window.innerHeight - 0.5) * 2;
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; root.style.setProperty('--mx', px.toFixed(3)); root.style.setProperty('--my', py.toFixed(3)); });
      }, { passive: true });
    }
    const keys = (/** @type {KeyboardEvent} */ e) => {
      if (!live || !root.isConnected) return;
      if (document.querySelector('dialog[open]')) return;
      const at = /** @type {HTMLElement} */ (e.target);
      if (at && (/^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName) || at.isContentEditable)) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const onRing = !!(at && at.closest && at.closest('.cn-orbit'));
      if (onRing && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) { e.preventDefault(); select(L.sel + 1, true); }
      else if (onRing && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) { e.preventDefault(); select(L.sel - 1, true); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); L.ry += e.key === 'ArrowLeft' ? -12 : 12; L.idle = performance.now(); paintWorld(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); L.rx = Math.max(-4, Math.min(64, L.rx + (e.key === 'ArrowUp' ? 6 : -6))); L.idle = performance.now(); paintWorld(); }
      else if (e.key === ' ' && !(at && (at.tagName === 'BUTTON' || at.tagName === 'A'))) { e.preventDefault(); setPaused(!L.paused); }
      else if (e.key === 't' || e.key === 'T') { e.preventDefault(); setTour(!L.tour.on); }
    };
    document.addEventListener('keydown', keys);
    L.off.push(() => document.removeEventListener('keydown', keys));
    const onHash = () => { if (!/\/cinema$/.test(location.hash)) stop(); };
    window.addEventListener('hashchange', onHash);
    L.off.push(() => window.removeEventListener('hashchange', onHash));
    const vis = () => { if (!live) return; if (document.visibilityState !== 'visible') { if (live.raf) cancelAnimationFrame(live.raf); live.raf = 0; } else if (!live.raf && !rmq.matches) { live.last = 0; live.raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', vis);
    L.off.push(() => document.removeEventListener('visibilitychange', vis));
  }
  /** The caption under the 3D scene. @param {string} words */
  function sceneCaption(words) {
    if (!live) return;
    const el = live.root.querySelector('[data-cn-scene-cap]');
    if (el && words) el.textContent = words;
  }

  EXT.cinema = { page, stop, get live() { return live; } };
})();
