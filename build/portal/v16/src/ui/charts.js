// @ts-check
/*
 * One chart type: a daily line for the chosen period, with the previous period as a dashed
 * line for comparison. Drawn at the element's real width (redrawn on resize) so the labels
 * stay legible on a phone. Hover shows the day's figures; the same figures are always
 * available as a table under the chart for keyboard and screen-reader users.
 */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});
  const F = D8.fmt;
  const T = D8.time;

  /** @param {number} v */
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  /** @param {HTMLElement} host */
  function draw(host) {
    const data = JSON.parse(host.getAttribute('data-points') || '[]');
    if (!data.length) return;
    const days = Number(host.getAttribute('data-days')) || data.length;
    const unit = host.getAttribute('data-unit') || '';
    const W = Math.max(260, Math.floor(host.clientWidth));
    if (host.getAttribute('data-w') === String(W)) return;
    host.setAttribute('data-w', String(W));
    const H = host.clientHeight || 200;
    const P = { l: 6, r: 44, t: 12, b: 28 };
    const iw = W - P.l - P.r;
    const ih = H - P.t - P.b;
    const vals = [];
    for (const p of data) { if (p.v !== null) vals.push(p.v); if (p.p !== null) vals.push(p.p); }
    const max = niceMax(Math.max(1, ...vals));
    const x = (i) => P.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const y = (v) => P.t + (1 - v / max) * ih;
    const path = (key) => {
      let d = '';
      let pen = false;
      data.forEach((p, i) => {
        if (p[key] === null) { pen = false; return; }
        d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p[key]).toFixed(1);
        pen = true;
      });
      return d;
    };
    const idx = data.map((p, i) => (p.v === null ? -1 : i)).filter((i) => i >= 0);
    const area = idx.length > 1
      ? 'M' + x(idx[0]).toFixed(1) + ',' + y(0) + idx.map((i) => 'L' + x(i).toFixed(1) + ',' + y(data[i].v).toFixed(1)).join('') + 'L' + x(idx[idx.length - 1]).toFixed(1) + ',' + y(0) + 'Z'
      : '';
    const grid = [0, max / 2, max].map((t) =>
      `<line class="c-grid" x1="${P.l}" x2="${W - P.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="c-y" x="${W - P.r + 8}" y="${(y(t) + 4).toFixed(1)}">${F.num(Math.round(t * 10) / 10)}</text>`).join('');
    const marks = [0, Math.floor((data.length - 1) / 2), data.length - 1];
    const xl = marks.map((i, k) => `<text class="c-x" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}">${F.date(data[i].d, { weekday: false })}</text>`).join('');
    const last = idx.length ? idx[idx.length - 1] : -1;
    const end = last >= 0 ? `<circle class="c-end" cx="${x(last).toFixed(1)}" cy="${y(data[last].v).toFixed(1)}" r="4.5"/>` : '';
    host.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${grid}<path class="c-area" d="${area}"/><path class="c-prev" d="${path('p')}"/><path class="c-cur" d="${path('v')}"/>${end}<line class="c-cross" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" visibility="hidden"/><circle class="c-dot-prev" r="3.5" visibility="hidden"/><circle class="c-dot" r="5" visibility="hidden"/>${xl}</svg><div class="chart-tip" aria-hidden="true" hidden></div>`;

    const svg = /** @type {SVGSVGElement} */ (host.querySelector('svg'));
    const tip = /** @type {HTMLElement} */ (host.querySelector('.chart-tip'));
    const cross = /** @type {SVGLineElement} */ (svg.querySelector('.c-cross'));
    const dot = /** @type {SVGCircleElement} */ (svg.querySelector('.c-dot'));
    const dotPrev = /** @type {SVGCircleElement} */ (svg.querySelector('.c-dot-prev'));
    const show = (i) => {
      const p = data[i];
      const px = x(i);
      cross.setAttribute('x1', px.toFixed(1));
      cross.setAttribute('x2', px.toFixed(1));
      cross.setAttribute('visibility', 'visible');
      if (p.v !== null) { dot.setAttribute('cx', px.toFixed(1)); dot.setAttribute('cy', y(p.v).toFixed(1)); dot.setAttribute('visibility', 'visible'); } else dot.setAttribute('visibility', 'hidden');
      if (p.p !== null) { dotPrev.setAttribute('cx', px.toFixed(1)); dotPrev.setAttribute('cy', y(p.p).toFixed(1)); dotPrev.setAttribute('visibility', 'visible'); } else dotPrev.setAttribute('visibility', 'hidden');
      const prevDay = T.isoDay(T.dayNum(p.d) - days);
      tip.innerHTML = `<strong>${F.date(p.d)}</strong><span>${p.v === null ? 'No numbers' : F.num(p.v) + ' ' + F.esc(unit)}</span><span class="tip-prev">${F.date(prevDay, { weekday: false })}: ${p.p === null ? 'no numbers' : F.num(p.p)}</span>`;
      tip.hidden = false;
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(W - tw, px - tw / 2)) + 'px';
    };
    const hide = () => {
      tip.hidden = true;
      for (const el of [cross, dot, dotPrev]) el.setAttribute('visibility', 'hidden');
    };
    host.onpointermove = (e) => {
      const r = svg.getBoundingClientRect();
      const i = Math.round(((e.clientX - r.left - P.l) / iw) * (data.length - 1));
      show(Math.max(0, Math.min(data.length - 1, i)));
    };
    host.onpointerleave = hide;
  }

  const observer = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver((entries) => entries.forEach((e) => draw(/** @type {HTMLElement} */ (e.target))))
    : null;

  /** Draws every chart inside `scope` and keeps it sized to its container. @param {ParentNode} scope */
  function mountAll(scope) {
    scope.querySelectorAll('.chart[data-points]').forEach((el) => {
      const host = /** @type {HTMLElement} */ (el);
      host.removeAttribute('data-w');
      draw(host);
      if (observer) observer.observe(host);
    });
  }

  D8.charts = { mountAll };
})(typeof window !== 'undefined' ? window : globalThis);
