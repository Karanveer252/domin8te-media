// Loader centring probe (2026-10-17). A dev tool for the local preview: fetch and eval it, then run
// await window.__loaderCentre('console' | 'dashboard'). It puts the boot loader on screen the way the app does, and
// returns how far the mark's centre is from the screen's centre (dx, dy in px), plus the screen size.
window.__loaderCentre = async function (app) {
  const main = document.querySelector('#main');
  if (app === 'console') {
    const h = await (await fetch('/versions/console-preview.html?probe=' + Date.now())).text();
    const m = h.match(/<main id="main"[^>]*>([\s\S]*?)<\/main>/);
    main.innerHTML = m[1];
  } else {
    const brand = document.getElementById('brand-mark');
    const mark = brand && brand.getAttribute('src');
    const img = (c) => `<img class="${c}" src="${mark}" alt="">`;
    main.innerHTML = `<div class="page page-booting" aria-busy="true"><div class="d8-load" aria-hidden="true">${img('is-dim')}${img('is-tail2')}${img('is-tail')}${img('is-lit')}</div><span class="d8-load-word">Opening your dashboard</span></div>`;
  }
  await new Promise((r) => setTimeout(r, 300));
  const box = document.querySelector('.d8-load').getBoundingClientRect();
  const word = document.querySelector('.d8-load-word').getBoundingClientRect();
  const W = document.documentElement.clientWidth, H = window.innerHeight;
  // the mark and the words together are the group that should sit in the middle
  const top = Math.min(box.top, word.top), bottom = Math.max(box.bottom, word.bottom);
  return { w: W, h: H, dx: Math.round(box.left + box.width / 2 - W / 2), dy: Math.round((top + bottom) / 2 - H / 2) };
};
