// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Stand-ins for the staff list functions of
// 20261014130000_staff_columns.sql (2026-10-14): list_home_sections, list_dashboard_items, list_billing_invoices, list_plans and
// list_plan_caps give staff the whole rows (who published, hid or verified them, a hide reason, a version waiting for review),
// which a client can no longer read from the tables. The same arguments and filters as the SQL; the rows come from the in-memory tables.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  /** Copies of a table's rows, for one client when p_tenant is given. @param {string} table @param {any} a */
  const rows = (table, a) => (S.db[table] || []).filter((/** @type {any} */ r) => !a || !a.p_tenant || r.tenant_id === a.p_tenant).map((/** @type {any} */ r) => Object.assign({}, r));
  /** Waiting for a review: new and pending, or a newer version waiting. @param {any} r */
  const open = (r) => r.verification_status === 'pending' || !!r.pending_at;
  const byUpdated = (/** @type {any} */ x, /** @type {any} */ y) => String(x.updated_at || '').localeCompare(String(y.updated_at || ''));
  S.rpcs.list_home_sections = (/** @type {any} */ a) => rows('client_home_sections', a).sort((x, y) => String(x.tenant_id).localeCompare(String(y.tenant_id)) || String(x.section).localeCompare(String(y.section)));
  S.rpcs.list_dashboard_items = (/** @type {any} */ a) => rows('client_dashboard_items', a).filter((r) => !(a && a.p_open) || open(r)).sort(byUpdated);
  S.rpcs.list_billing_invoices = (/** @type {any} */ a) => rows('client_billing_invoices', a).filter((r) => !(a && a.p_open) || open(r)).sort(byUpdated);
  S.rpcs.list_plans = () => rows('plans', null).sort((x, y) => (Number(x.sort) || 0) - (Number(y.sort) || 0));
  S.rpcs.list_plan_caps = () => rows('plan_caps', null);
})();
