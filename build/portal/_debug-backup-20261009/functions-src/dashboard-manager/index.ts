// dashboard-manager: the scheduled worker behind the client dashboards. Only the scheduler calls it (pg_cron + pg_net
// in prod, every minute), with header x-dashboard-manager-secret = DASHBOARD_MANAGER_CRON_SECRET.
//
//   {} or { action: "drain" }      process the outbox (dashboard_events) until empty, 50 events or 20 s
//   { action: "sync_multica" }     pull every client project's issues from Multica (one list call per 100 issues),
//                                  move cards Multica moved, resume next minute from a stored cursor
//   { action: "daily", force? }    06:00 Chicago catch-up: reap stuck events, full Multica re-pull, stale sources and
//                                  results, one audit line per client. Scheduled at 11:00 and 12:00 UTC; runs only in
//                                  the 6 o'clock hour in Chicago (so DST needs no change), or any time with force: true
//
// Quiet skips, all 200 and none of them opening exceptions or failing events: { skipped: "disabled" } without
// DASHBOARD_MANAGER_ENABLED=true; { skipped: "multica-not-configured" } without MULTICA_TOKEN / MULTICA_WORKSPACE (logged
// once per call); { skipped: "busy" } while another sync holds the lease; { skipped: "not-6am-chicago" } for daily.
//
// Nothing here makes anything client-visible. Projection rows are written pending (or as a pending revision of a live
// row, which stays as it was); staff publish them in the console. The only automated publisher is the database's
// auto_publish_dashboard_item, called only with AUTO_PUBLISH_ENABLED=true and gated again in SQL; never for invoices.
// Logs carry counts only, never titles, content or secret values.
//
// Secrets (names): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DASHBOARD_MANAGER_CRON_SECRET, DASHBOARD_MANAGER_ENABLED,
// MULTICA_TOKEN, MULTICA_WORKSPACE (optional MULTICA_API_URL, MULTICA_WORKSPACE_ID), AUTO_PUBLISH_ENABLED (leave unset).

import { createClient } from "npm:@supabase/supabase-js@2";
import { secretMatches } from "../_shared/secret.ts";
import { multicaConfigured, warnMulticaUnconfiguredOnce, pullTask, issueUnchanged, listProjectIssues, TASK_COLUMNS, type TaskRow, type PullOutcome } from "../_shared/multica.ts";

type DashboardEvent = {
  id: string;
  tenant_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  payload: unknown;
  attempts: number;
  created_by: string | null;
};

type ProjectionItem = {
  kind: "work" | "result" | "update" | "billing";
  externalId: string;
  content: Record<string, unknown>;
  sourceKind: "console" | "integration" | "webhook" | "manager";
  sourceRef: string;
  sourceObservedAt?: string;
  publishRequested: boolean;
  reportingPeriodStart?: string;
  reportingPeriodEnd?: string;
};

type Result = { status: number; body: Record<string, unknown> };

const ACTOR = "dashboard-manager";
const BUDGET_MS = 20_000;
const MAX_EVENTS = 50;
const MAX_MULTICA_CALLS = 40;
const MAX_FALLBACKS = 10;
const LEASE = "multica-sync";
const TASK_FIELDS = `${TASK_COLUMNS}, title, service, due`;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asText(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}

// Whatever the sender wrote about verification is ignored: every item is pending until staff approve it.
// clientVisible / publishRequested survive only as a request to publish.
function parseItem(event: DashboardEvent): { item?: ProjectionItem; error?: string } {
  if (!isObject(event.payload) || !isObject(event.payload.item)) return { error: "Event payload must include an item object." };
  const raw = event.payload.item;
  const kind = raw.kind;
  const sourceKind = raw.sourceKind;
  const externalId = asText(raw.externalId, 200);
  const sourceRef = asText(raw.sourceRef, 500);

  if (!["work", "result", "update", "billing"].includes(String(kind))) return { error: "Item kind is invalid." };
  if (!["console", "integration", "webhook", "manager"].includes(String(sourceKind))) return { error: "Item source kind is invalid." };
  if (!externalId || !sourceRef || !isObject(raw.content)) return { error: "Item is missing required fields." };

  return { item: {
    kind: kind as ProjectionItem["kind"],
    externalId,
    content: raw.content,
    sourceKind: sourceKind as ProjectionItem["sourceKind"],
    sourceRef,
    publishRequested: raw.publishRequested === true || raw.clientVisible === true,
    ...(asText(raw.sourceObservedAt, 40) ? { sourceObservedAt: raw.sourceObservedAt as string } : {}),
    ...(asText(raw.reportingPeriodStart, 10) ? { reportingPeriodStart: raw.reportingPeriodStart as string } : {}),
    ...(asText(raw.reportingPeriodEnd, 10) ? { reportingPeriodEnd: raw.reportingPeriodEnd as string } : {}),
  } };
}

// billing.changed events carry entity_type 'invoice'; their item kind is 'billing' and they land in client_billing_invoices.
function invoiceRow(item: ProjectionItem, now: string): { row?: Record<string, unknown>; error?: string } {
  if (item.kind !== "billing") return { error: "Not a billing item." };
  const raw = item.content.invoice;
  if (!isObject(raw)) return { error: "Billing item must include an invoice object." };
  const number = asText(raw.number, 100);
  const currency = asText(raw.currency, 3);
  const status = asText(raw.status, 20);
  const issuedAt = asText(raw.issuedAt, 10);
  const dueAt = raw.dueAt === undefined || raw.dueAt === null || raw.dueAt === "" ? null : asText(raw.dueAt, 10);
  const paidAt = raw.paidAt === undefined || raw.paidAt === null || raw.paidAt === "" ? null : asText(raw.paidAt, 40);
  const paymentUrl = raw.hostedPaymentUrl === undefined || raw.hostedPaymentUrl === null || raw.hostedPaymentUrl === "" ? null : asText(raw.hostedPaymentUrl, 2000);
  const amountMinor = typeof raw.amountMinor === "number" && Number.isSafeInteger(raw.amountMinor) && raw.amountMinor >= 0 ? raw.amountMinor : null;
  if (!number || !currency || !/^[A-Z]{3}$/.test(currency) || !issuedAt || amountMinor === null || !["open", "paid", "overdue", "failed", "void"].includes(String(status))) return { error: "Billing invoice fields are invalid." };
  if ((dueAt && dueAt < issuedAt) || (status === "paid" && !paidAt)) return { error: "Billing dates are invalid." };
  if (paymentUrl && !/^https:\/\/(invoice|billing)\.stripe\.com\//.test(paymentUrl)) return { error: "Payment link must be an approved Stripe HTTPS URL." };
  return { row: {
    invoice_number: number, amount_minor: amountMinor, currency, status, issued_at: issuedAt, due_at: dueAt, paid_at: paidAt,
    hosted_payment_url: paymentUrl, source_ref: item.sourceRef, source_observed_at: item.sourceObservedAt || now,
  } };
}

async function audit(db: any, tenantId: string | null, action: string, detail: Record<string, unknown>) {
  await db.from("audit_log").insert({ tenant_id: tenantId, actor: ACTOR, action, detail });
}

async function openException(db: any, tenantId: string, eventId: string | null, entityType: string, entityId: string | null, severity: string, reasonCode: string, message: string, lastValue: unknown = null) {
  const r = await db.rpc("open_dashboard_exception", {
    p_tenant: tenantId, p_event: eventId, p_entity_type: entityType, p_entity_id: entityId,
    p_severity: severity, p_reason_code: reasonCode, p_message: message, p_last_value: lastValue,
  });
  return !r.error && r.data === true;
}

// Write one item as pending. A row that is live (visible) or hidden keeps everything the client sees and gets the new
// version in pending_* for staff to approve; a hidden row is never made visible from here.
async function projectItem(db: any, tenantId: string, item: ProjectionItem, now: string): Promise<{ ok: boolean; mode?: string }> {
  const found = await db.from("client_dashboard_items").select("id, client_visible, hidden_at")
    .eq("tenant_id", tenantId).eq("item_kind", item.kind).eq("external_id", item.externalId).maybeSingle();
  if (found.error) return { ok: false };
  const fields = {
    content: item.content, source_kind: item.sourceKind, source_ref: item.sourceRef, source_observed_at: item.sourceObservedAt || null,
    reporting_period_start: item.reportingPeriodStart || null, reporting_period_end: item.reportingPeriodEnd || null,
  };
  if (!found.data) {
    const ins = await db.from("client_dashboard_items").insert({
      tenant_id: tenantId, item_kind: item.kind, external_id: item.externalId, ...fields,
      verification_status: "pending", client_visible: false, publish_requested: item.publishRequested, updated_at: now,
    });
    return { ok: !ins.error, mode: "new" };
  }
  if (found.data.client_visible || found.data.hidden_at) {
    const upd = await db.from("client_dashboard_items").update({
      pending_content: item.content, pending_source_ref: item.sourceRef, pending_observed_at: item.sourceObservedAt || now,
      pending_at: now, publish_requested: item.publishRequested, updated_at: now,
    }).eq("id", found.data.id);
    return { ok: !upd.error, mode: "revision" };
  }
  const upd = await db.from("client_dashboard_items").update({
    ...fields, verification_status: "pending", publish_requested: item.publishRequested,
    pending_content: null, pending_source_ref: null, pending_observed_at: null, pending_at: null, updated_at: now,
  }).eq("id", found.data.id);
  return { ok: !upd.error, mode: "replace" };
}

// Same rules for invoices: a live or hidden invoice keeps its figures and takes the new ones in pending_row.
async function projectInvoice(db: any, tenantId: string, item: ProjectionItem, row: Record<string, unknown>, now: string): Promise<{ ok: boolean; mode?: string }> {
  const found = await db.from("client_billing_invoices").select("id, client_visible, hidden_at")
    .eq("tenant_id", tenantId).eq("provider", "stripe").eq("provider_invoice_id", item.externalId).maybeSingle();
  if (found.error) return { ok: false };
  if (!found.data) {
    const ins = await db.from("client_billing_invoices").insert({
      tenant_id: tenantId, provider: "stripe", provider_invoice_id: item.externalId, ...row,
      verification_status: "pending", client_visible: false, publish_requested: item.publishRequested, updated_at: now,
    });
    return { ok: !ins.error, mode: "new" };
  }
  if (found.data.client_visible || found.data.hidden_at) {
    const upd = await db.from("client_billing_invoices").update({ pending_row: row, pending_at: now, publish_requested: item.publishRequested, updated_at: now }).eq("id", found.data.id);
    return { ok: !upd.error, mode: "revision" };
  }
  const upd = await db.from("client_billing_invoices").update({
    ...row, verification_status: "pending", publish_requested: item.publishRequested, pending_row: null, pending_at: null, updated_at: now,
  }).eq("id", found.data.id);
  return { ok: !upd.error, mode: "replace" };
}

// What a pull outcome means for the dashboards. The card itself already moved (pullTask). A move becomes a pending
// work item for staff to approve; a conflict or a vanished issue becomes one open exception (deduplicated).
async function applyOutcome(db: any, task: any, o: PullOutcome, now: string, requestedBy: string, eventId: string | null) {
  if (o.result === "moved") {
    await audit(db, task.tenant_id, "task.moved", { via: ACTOR, requestedBy, from: o.from, to: o.to, identifier: o.identifier, task: task.id });
    const content: Record<string, unknown> = { title: task.title, status: o.to };
    if (task.service) content.service = task.service;
    if (task.due) content.due = task.due;
    await projectItem(db, task.tenant_id, {
      kind: "work", externalId: task.id, content, sourceKind: "manager", sourceRef: `multica:${o.identifier || task.multica_issue_id}`,
      sourceObservedAt: now, publishRequested: false,
    }, now);
  } else if (o.result === "conflict") {
    const opened = await openException(db, task.tenant_id, eventId, "task", task.id, "warning", "multica_conflict",
      `${o.identifier || "A card"} was moved both here (${o.from}) and in Multica (${o.to}).`,
      { local: o.from, remote: o.to, identifier: o.identifier, taskId: task.id });
    if (opened) await audit(db, task.tenant_id, "dashboard.exception.opened", { reason: "multica_conflict", task: task.id, identifier: o.identifier });
  } else if (o.result === "missing") {
    await openException(db, task.tenant_id, eventId, "task", task.id, "warning", "multica_missing",
      `${task.multica_identifier || "A linked card"} is no longer in Multica (deleted or moved out of the client's project).`,
      { identifier: task.multica_identifier, taskId: task.id });
  }
}

async function finishEvent(db: any, id: string, status: string, lastError: string | null, now: string) {
  return db.from("dashboard_events").update({ status, last_error: lastError, processed_at: now }).eq("id", id);
}

// One claimed event.
async function processEvent(db: any, event: DashboardEvent): Promise<Result> {
  const now = new Date().toISOString();

  // Sync request for one Multica card.
  if (event.entity_type === "multica_issue") {
    if (!multicaConfigured()) {
      warnMulticaUnconfiguredOnce();
      await finishEvent(db, event.id, "discarded", "multica-not-configured", now);
      return { status: 200, body: { ok: true, eventId: event.id, discarded: true, skipped: "multica-not-configured" } };
    }
    const found = await db.from("tasks").select(TASK_FIELDS).eq("tenant_id", event.tenant_id).eq("multica_identifier", event.entity_id || "").not("multica_issue_id", "is", null).maybeSingle();
    if (found.error) {
      await db.from("dashboard_events").update({ status: "pending", available_at: new Date(Date.now() + 60_000).toISOString(), last_error: "task-read-failed" }).eq("id", event.id);
      return { status: 502, body: { ok: false, eventId: event.id, error: "task-read-failed" } };
    }
    if (!found.data) {
      await finishEvent(db, event.id, "discarded", "no-linked-task", now);
      return { status: 200, body: { ok: true, eventId: event.id, discarded: true } };
    }
    const o = await pullTask(db, found.data as TaskRow, now);
    if (o.result === "remote-error") {
      // Try again in a minute; after 5 attempts the event fails, with no exception per attempt.
      if (event.attempts >= 5) await finishEvent(db, event.id, "failed", "multica unreachable after 5 attempts", now);
      else await db.from("dashboard_events").update({ status: "pending", available_at: new Date(Date.now() + 60_000).toISOString(), last_error: "multica-unreachable" }).eq("id", event.id);
      return { status: 200, body: { ok: true, eventId: event.id, retry: event.attempts < 5 } };
    }
    await applyOutcome(db, found.data, o, now, event.created_by || "unknown", event.id);
    await finishEvent(db, event.id, "processed", null, now);
    return { status: 200, body: { ok: true, processed: true, eventId: event.id, result: o.result } };
  }

  const parsed = parseItem(event);
  if (!parsed.item) {
    const reason = parsed.error || "Invalid dashboard event.";
    await db.from("dashboard_exceptions").insert({
      tenant_id: event.tenant_id, event_id: event.id, entity_type: event.entity_type || "unknown", entity_id: event.entity_id,
      severity: "warning", reason_code: "invalid_event", message: reason, status: "open",
    });
    await finishEvent(db, event.id, "failed", reason, now);
    return { status: 422, body: { ok: false, eventId: event.id, error: "invalid-event" } };
  }

  const item = parsed.item;
  if (item.kind === "billing") {
    const invoice = invoiceRow(item, now);
    if (!invoice.row) {
      const reason = invoice.error || "Invalid billing invoice.";
      await db.from("dashboard_exceptions").insert({ tenant_id: event.tenant_id, event_id: event.id, entity_type: "billing", entity_id: item.externalId, severity: "warning", reason_code: "invalid_billing_invoice", message: reason, status: "open" });
      await finishEvent(db, event.id, "failed", reason, now);
      return { status: 422, body: { ok: false, eventId: event.id, error: "invalid-billing-invoice" } };
    }
    const projected = await projectInvoice(db, event.tenant_id, item, invoice.row, now);
    if (!projected.ok) {
      const reason = "Billing projection write failed.";
      await db.from("dashboard_exceptions").insert({ tenant_id: event.tenant_id, event_id: event.id, entity_type: "billing", entity_id: item.externalId, severity: "critical", reason_code: "billing_projection_write_failed", message: reason, status: "open" });
      await finishEvent(db, event.id, "failed", reason, now);
      return { status: 502, body: { ok: false, eventId: event.id, error: "billing-projection-write-failed" } };
    }
    await audit(db, event.tenant_id, "dashboard.invoice.queued", { event: event.id, invoice: item.externalId, mode: projected.mode, requestedBy: event.created_by });
    await finishEvent(db, event.id, "processed", null, now);
    return { status: 200, body: { ok: true, processed: true, eventId: event.id, itemKind: item.kind } };
  }

  const projected = await projectItem(db, event.tenant_id, item, now);
  if (!projected.ok) {
    const reason = "Projection write failed.";
    await db.from("dashboard_exceptions").insert({
      tenant_id: event.tenant_id, event_id: event.id, entity_type: item.kind, entity_id: item.externalId,
      severity: "critical", reason_code: "projection_write_failed", message: reason, status: "open",
    });
    await finishEvent(db, event.id, "failed", reason, now);
    return { status: 502, body: { ok: false, eventId: event.id, error: "projection-write-failed" } };
  }
  await audit(db, event.tenant_id, "dashboard.item.queued", { event: event.id, kind: item.kind, item: item.externalId, mode: projected.mode, requestedBy: event.created_by });
  const completed = await finishEvent(db, event.id, "processed", null, now);
  if (completed.error) return { status: 502, body: { error: "completion-write-failed", eventId: event.id } };
  return { status: 200, body: { ok: true, processed: true, eventId: event.id, itemKind: item.kind } };
}

// Drain: claim and process until the queue is empty, 50 events or 20 s. The first event's fields are kept at the top
// level (eventId, itemKind, error) and its status code is the response's, as the single-event version answered.
async function drain(db: any) {
  const started = Date.now();
  let first: Result | null = null;
  let processed = 0, failed = 0, remaining = false;
  for (;;) {
    if (processed + failed >= MAX_EVENTS || Date.now() - started > BUDGET_MS) { remaining = true; break; }
    const claimed = await db.rpc("claim_dashboard_event");
    if (claimed.error) { if (!first) return { status: 502, body: { error: "claim-failed" } }; break; }
    const event = (claimed.data || [])[0] as DashboardEvent | undefined;
    if (!event) break;
    const r = await processEvent(db, event);
    if (!first) first = r;
    if (r.status >= 400) failed++; else processed++;
  }
  const autoPublished = await autoPublish(db);
  const body: Record<string, unknown> = { ...(first?.body || { reason: "queue-empty" }), ok: failed === 0, processed, failed, remaining };
  if (autoPublished) body.autoPublished = autoPublished;
  if (processed || failed) console.log(JSON.stringify({ action: "drain", processed, failed, remaining }));
  return { status: first?.status || 200, body };
}

// Only with AUTO_PUBLISH_ENABLED=true, and the database re-checks the four gates, the tenant switch and the evidence.
// Never invoices: there is no automated path for them.
async function autoPublish(db: any) {
  if (Deno.env.get("AUTO_PUBLISH_ENABLED") !== "true") return null;
  const rows = await db.from("client_dashboard_items").select("id").eq("publish_requested", true).eq("client_visible", false).is("hidden_at", null).limit(50);
  if (rows.error) return null;
  let published = 0, held = 0;
  for (const r of rows.data || []) {
    const ok = await db.rpc("auto_publish_dashboard_item", { p_item_id: r.id });
    if (!ok.error && ok.data === true) published++; else held++;
  }
  if (published || held) console.log(JSON.stringify({ action: "auto-publish", published, held }));
  return { published, held };
}

// The minute sync. One lease at a time; resumes from the stored cursor; stops at 20 s or 40 Multica calls.
// full: the daily catch-up, which starts from the first client and re-pulls rows not stamped for 24 h even when the
// list says they are unchanged.
async function syncMultica(db: any, full = false) {
  if (!multicaConfigured()) { warnMulticaUnconfiguredOnce(); return { ok: true, skipped: "multica-not-configured" }; }
  const holder = crypto.randomUUID();
  const lease = await db.rpc("take_dashboard_lease", { p_name: LEASE, p_holder: holder, p_seconds: 60 });
  if (lease.error) return { ok: false, error: "lease-failed" };
  if (lease.data === null) return { ok: true, skipped: "busy" };
  const storedCursor = String(lease.data || "");
  const started = Date.now();
  const stats = { tenants: 0, checked: 0, unchanged: 0, moved: 0, conflicts: 0, unlinked: 0, missing: 0, calls: 0 };
  let cursor = full ? "" : storedCursor;
  let nextCursor = "";
  let fallbacks = 0;
  try {
    let q = db.from("tenants").select("id, multica_project_id").not("multica_project_id", "is", null).neq("status", "archived").order("id").limit(500);
    if (cursor) q = q.gt("id", cursor);
    const tenants = await q;
    if (tenants.error) return { ok: false, error: "tenants-read-failed" };
    const dayAgo = Date.now() - 24 * 3600_000;
    for (const tenant of tenants.data || []) {
      if (Date.now() - started > BUDGET_MS || stats.calls >= MAX_MULTICA_CALLS) { nextCursor = cursor; break; }
      const now = new Date().toISOString();
      const list = await listProjectIssues(tenant.multica_project_id);
      stats.calls += list.calls;
      if (!list.ok) {
        await db.from("tenant_multica_sync").upsert({ tenant_id: tenant.id, last_run_at: now, last_error: "list-failed" });
        cursor = tenant.id;
        continue;
      }
      const rows = await db.from("tasks").select(TASK_FIELDS).eq("tenant_id", tenant.id).not("multica_issue_id", "is", null);
      if (rows.error) { await db.from("tenant_multica_sync").upsert({ tenant_id: tenant.id, last_run_at: now, last_error: "tasks-read-failed" }); cursor = tenant.id; continue; }
      const byId = new Map(list.issues.map((i: any) => [String(i.id), i]));
      const linked = new Set<string>();
      let moved = 0;
      for (const task of rows.data || []) {
        linked.add(String(task.multica_issue_id));
        const issue = byId.get(String(task.multica_issue_id));
        stats.checked++;
        if (!issue) {
          // Not in the client's project any more: one single GET, at most 10 per run.
          if (fallbacks >= MAX_FALLBACKS || stats.calls >= MAX_MULTICA_CALLS) continue;
          fallbacks++; stats.calls++;
          const o = await pullTask(db, task as TaskRow, now);
          if (o.result === "missing") stats.missing++;
          if (o.result === "moved") { moved++; stats.moved++; }
          if (o.result === "conflict") stats.conflicts++;
          await applyOutcome(db, task, o, now, "scheduler", null);
          continue;
        }
        const fresh = !full || (task.multica_synced_at && Date.parse(task.multica_synced_at) > dayAgo);
        if (fresh && issueUnchanged(task as TaskRow, issue)) { stats.unchanged++; continue; }
        const o = await pullTask(db, task as TaskRow, now, issue);
        if (o.result === "moved") { moved++; stats.moved++; }
        if (o.result === "conflict") stats.conflicts++;
        await applyOutcome(db, task, o, now, "scheduler", null);
      }
      stats.unlinked += list.issues.filter((i: any) => !linked.has(String(i.id))).length;  // counted, never imported
      await db.from("tenant_multica_sync").upsert({ tenant_id: tenant.id, last_run_at: now, last_ok_at: now, last_total: list.issues.length, last_changed: moved, last_error: null });
      stats.tenants++;
      cursor = tenant.id;
    }
  } finally {
    // The daily run leaves the minute run's place alone.
    await db.rpc("release_dashboard_lease", { p_name: LEASE, p_holder: holder, p_cursor: full ? storedCursor : nextCursor });
  }
  console.log(JSON.stringify({ action: full ? "sync_multica:full" : "sync_multica", ...stats, more: Boolean(nextCursor) }));
  const { calls: _calls, ...shown } = stats;
  return { ok: true, ...shown, nextCursor: nextCursor || null };
}

function chicagoHour(d = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(d));
}

async function daily(db: any, force: boolean) {
  // Scheduled at 11:00 and 12:00 UTC; exactly one of them is 06:00 in Chicago, whatever the season.
  if (!force && chicagoHour() !== 6) return { ok: true, skipped: "not-6am-chicago" };
  const reaped = await db.rpc("reap_dashboard_events");

  // Full catch-up. If a minute run holds the lease, wait for it (it finishes within ~25 s).
  let sync: Record<string, unknown> = { skipped: "multica-not-configured" };
  if (multicaConfigured()) {
    for (let i = 0; i < 4; i++) {
      sync = await syncMultica(db, true);
      if (sync.skipped !== "busy") break;
      await new Promise((r) => setTimeout(r, 8_000));
    }
  } else warnMulticaUnconfiguredOnce();

  // Sources not refreshed for 26 h open one exception each (deduplicated while open).
  const tenants = await db.from("tenants").select("id, doc").neq("status", "archived");
  const cutoff = Date.now() - 26 * 3600_000;
  let staleSources = 0;
  for (const t of tenants.data || []) {
    const sources = Array.isArray(t.doc?.sources) ? t.doc.sources : [];
    let mine = 0;
    for (const [n, s] of sources.entries()) {
      const at = Date.parse(s?.updatedAt || "");
      if (!Number.isFinite(at) || at >= cutoff) continue;
      const key = String(s.id || s.name || `source-${n}`).slice(0, 200);
      if (await openException(db, t.id, null, "source", key, "warning", "source_stale", `${String(s.name || "A data source").slice(0, 120)} has not updated for more than 26 hours.`)) mine++;
    }
    staleSources += mine;
    await audit(db, t.id, "dashboard.daily", { staleSources: mine });
  }
  const staleResults = await db.rpc("mark_stale_dashboard_results");
  const out = { ok: true, reaped: reaped.data ?? 0, sync, staleSources, staleResults: staleResults.data ?? 0 };
  console.log(JSON.stringify({ action: "daily", reaped: out.reaped, staleSources, staleResults: out.staleResults }));
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method", message: "Use POST." });
  if (!secretMatches(req.headers.get("x-dashboard-manager-secret"), Deno.env.get("DASHBOARD_MANAGER_CRON_SECRET"))) return json(401, { error: "unauthorized" });
  if (Deno.env.get("DASHBOARD_MANAGER_ENABLED") !== "true") return json(200, { ok: true, skipped: "disabled" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json(503, { error: "not-configured" });

  let body: Record<string, unknown> = {};
  try { const raw = await req.text(); body = raw ? JSON.parse(raw) : {}; } catch { return json(400, { error: "bad-request" }); }
  if (!isObject(body)) return json(400, { error: "bad-request" });
  const action = String(body.action || "drain");

  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  if (action === "drain") { const r = await drain(db); return json(r.status, r.body); }
  if (action === "sync_multica") return json(200, await syncMultica(db, false));
  if (action === "daily") return json(200, await daily(db, body.force === true));
  return json(400, { error: "bad-action" });
});
