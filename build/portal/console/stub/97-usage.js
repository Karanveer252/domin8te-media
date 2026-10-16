// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Stand-ins for dashboard use (migration
// 20261016020000) and the weekly summary (20261016010000): Bayleaf uses its dashboard, Marlow & Finch texts instead and
// is quiet on the dashboard, Corner Bean has not opened it.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const ago = (/** @type {number} */ h) => new Date(Date.now() - h * 3600000).toISOString();
  const monday = () => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return d.toISOString().slice(0, 10); };
  /** @type {any[]} */ const outside = [
    { id: 'ca_1', tenant_id: 'tnt_preview_marlow', channel: 'text', at: ago(30) },
    { id: 'ca_2', tenant_id: 'tnt_preview_marlow', channel: 'email', at: ago(80) },
    { id: 'ca_3', tenant_id: 'tnt_preview_bayleaf', channel: 'call', at: ago(200) }
  ];
  const seen = /** @type {Record<string, string|null>} */ ({ tnt_preview_bayleaf: ago(3), tnt_preview_marlow: ago(24 * 12), tnt_preview_corner: null, tnt_preview_osteria: null });
  /** @type {Record<string, any>} */ const weeks = {
    tnt_preview_bayleaf: { id: 'wk_bay', week_start: monday(), sentence: 'Last week: 41 bookings. This week: 52 bookings, 797 website visits. Specials posted: yes.', opened_at: ago(2) },
    tnt_preview_marlow: { id: 'wk_mar', week_start: monday(), sentence: 'Last week: 14 calls, 9 directions. This week: 18 calls, 11 directions. Reviews answered: 4.', opened_at: null }
  };
  const row = (/** @type {string} */ id) => {
    const out = outside.filter((x) => x.tenant_id === id).sort((a, b) => b.at.localeCompare(a.at));
    const n = (/** @type {number} */ d) => out.filter((x) => Date.now() - Date.parse(x.at) < d * 86400000).length;
    const s = seen[id] || null;
    const w = weeks[id] || {};
    return {
      tenant_id: id, last_seen_at: s, visits_7d: s && Date.now() - Date.parse(s) < 7 * 86400000 ? 4 : 0,
      last_approval_at: id === 'tnt_preview_bayleaf' ? ago(26) : null, last_answer_at: id === 'tnt_preview_bayleaf' ? ago(26) : null,
      week_id: w.id || null, week_start: w.week_start || null, week_sentence: w.sentence || null, week_opened_at: w.opened_at || null,
      outside_30d: n(30), outside_14d: n(14), last_outside_at: out[0] ? out[0].at : null, last_outside_channel: out[0] ? out[0].channel : null,
      quiet: n(14) > 0 && (!s || Date.now() - Date.parse(s) > 7 * 86400000)
    };
  };
  S.rpcs.client_usage = () => Object.keys(seen).map(row);
  S.rpcs.log_outside_message = (/** @type {any} */ a) => {
    const r = { id: 'ca_' + (outside.length + 1) + '_' + Date.now(), tenant_id: a.p_tenant, kind: 'outside_message', channel: a.p_channel, note: a.p_note || null, at: new Date().toISOString() };
    outside.push(r);
    return r;
  };
  S.rpcs.remove_outside_message = (/** @type {any} */ a) => { const i = outside.findIndex((x) => x.id === a.p_id); if (i >= 0) outside.splice(i, 1); return i >= 0; };
  S.rpcs.rebuild_weekly_summary = (/** @type {any} */ a) => weeks[a.p_tenant] ? { ...weeks[a.p_tenant], tenant_id: a.p_tenant } : { id: null };
})();
