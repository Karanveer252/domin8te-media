// Test-project-only Dashboard Manager smoke runner.
// Never deploy to production. Requires explicit enable flag and scheduler secret.
//
// Checks the HTTP paths end to end with a temporary client, then removes everything it made. The rules that need a staff
// session token (review_*, gates, evidence, hidden rows, client RLS) are checked in tests/dashboard_manager.sql instead.
// The answer lists the check names in a fixed order; notes say which checks ran in a reduced form because a secret is
// not set here (presence only, never a value).
import { createClient } from "npm:@supabase/supabase-js@2";
import { secretMatches } from "../_shared/secret.ts";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const CHECKS = [
  "invalid-result-rejected", "work-event-processed", "projection-verified", "dashboard-item-recovery", "billing-event-processed",
  "invoice-recovery", "invalid-event-opened-exception", "sender-cannot-self-verify", "guard-blocks-direct-publish",
  "auto-publish-flag-alone-blocked", "multica-unset-noop", "cross-tenant-rejected", "drain-processes-many", "reaper-recovers-stuck",
  "sync-overlap-busy",
];

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "method" });
  if (!secretMatches(request.headers.get("x-dashboard-manager-secret"), Deno.env.get("DASHBOARD_MANAGER_CRON_SECRET"))) return json(401, { error: "unauthorized" });
  if (Deno.env.get("DASHBOARD_TEST_RUNNER_ENABLED") !== "true") return json(503, { error: "disabled" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const schedulerSecret = Deno.env.get("DASHBOARD_MANAGER_CRON_SECRET");
  if (!url || !serviceRoleKey || !schedulerSecret) return json(503, { error: "not-configured" });
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const runManager = async (body: Record<string, unknown> = {}) => {
    const response = await fetch(`${url}/functions/v1/dashboard-manager`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-dashboard-manager-secret": schedulerSecret },
      body: JSON.stringify(body),
    });
    return { response, body: await response.json().catch(() => ({})) };
  };
  const botNames = (Deno.env.get("DASHBOARD_BOT_ALLOWLIST") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const botSecret = Deno.env.get("DASHBOARD_BOT_SECRET");
  const botReady = Boolean(botNames.length && botSecret);
  const asBot = (name: string, secret: string, body: Record<string, unknown>) => fetch(`${url}/functions/v1/dashboard-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dashboard-bot-secret": secret, "x-dashboard-bot-name": name },
    body: JSON.stringify(body),
  });
  const enqueue = (tenant: string, eventType: string, entityType: string, entityId: string, payload: unknown, key: string) =>
    db.rpc("enqueue_dashboard_event", { p_tenant: tenant, p_event_type: eventType, p_entity_type: entityType, p_entity_id: entityId, p_source: "console", p_payload: payload, p_idempotency_key: key, p_created_by: "edge test runner" });
  const fail = (error: string) => json(502, { error });
  const notes: Record<string, string> = {};

  const pending = await db.from("dashboard_events").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (pending.error) return json(502, { error: "queue-check-failed" });
  if (pending.count) return json(409, { error: "queue-not-empty" });

  const tenants: string[] = [];
  try {
    const mk = async (name: string, status = "active") => {
      const t = await db.from("tenants").insert({ name: `Temporary edge test runner ${name} ${crypto.randomUUID()}`, status }).select("id").single();
      if (t.error || !t.data) throw new Error("tenant-create-failed");
      tenants.push(t.data.id);
      return t.data.id as string;
    };
    const tenantId = await mk("A");
    const otherId = await mk("B");
    const archivedId = await mk("archived", "archived");
    const card = await db.from("tasks").insert({ tenant_id: tenantId, title: "Runner card", status: "todo", multica_issue_id: "runner-issue", multica_identifier: "RUN-1", multica_status: "todo" }).select("id").single();
    const otherCard = await db.from("tasks").insert({ tenant_id: otherId, title: "Other client's card", status: "todo" }).select("id").single();
    if (card.error || otherCard.error) return fail("task-create-failed");

    // invalid-result-rejected: a visible result straight into the table is refused (CHECK and publication guard).
    const invalidResult = await db.from("client_dashboard_items").insert({ tenant_id: tenantId, item_kind: "result", external_id: "invalid-result", content: {}, source_kind: "console", source_ref: "test-only", verification_status: "pending", client_visible: true });
    if (!invalidResult.error) return json(500, { error: "invalid-result-was-accepted" });

    // work-event-processed: a sender claiming verified + visible.
    const work = await enqueue(tenantId, "work.changed", "work", card.data.id,
      { item: { kind: "work", externalId: card.data.id, content: { title: "Test only" }, sourceKind: "console", sourceRef: "console:runner", verificationStatus: "verified", verifiedAt: new Date().toISOString(), verifiedBy: "edge test runner", clientVisible: true } },
      `edge-runner-work-${tenantId}`);
    if (work.error || !work.data) return fail("work-event-create-failed");
    const workRun = await runManager();
    if (!workRun.response.ok || workRun.body.processed !== 1 || workRun.body.itemKind !== "work") return fail("work-event-process-failed");

    // projection-verified: the projection exists, pending and invisible, with the publish request kept.
    const workProjection = await db.from("client_dashboard_items").select("id, client_visible, verification_status, verified_by, published_at, publish_requested").eq("tenant_id", tenantId).eq("external_id", card.data.id).single();
    const wp = workProjection.data;
    if (workProjection.error || !wp || wp.client_visible || wp.verification_status !== "pending" || wp.verified_by || wp.published_at || !wp.publish_requested) return fail("projection-verification-failed");

    // sender-cannot-self-verify: what the outbox kept, and the same through the bot path when a bot is configured.
    const stored = await db.from("dashboard_events").select("payload").eq("id", work.data).single();
    const it = stored.data?.payload?.item || {};
    if (it.verificationStatus !== "pending" || it.clientVisible !== false || it.publishRequested !== true || "verifiedBy" in it || "verifiedAt" in it) return fail("sender-self-verified");
    if (botReady) {
      const r = await asBot(botNames[0], botSecret!, { tenantId, eventType: "updates.changed", entityType: "update", entityId: "bot-upd", idempotencyKey: `edge-runner-bot-${tenantId}`,
        payload: { item: { kind: "update", externalId: "bot-upd", content: { title: "Bot text" }, sourceKind: "manager", sourceRef: "console:bot-upd", verificationStatus: "verified", verifiedBy: "bot", clientVisible: true } } });
      const body = await r.json().catch(() => ({}));
      const ev = body.eventId ? await db.from("dashboard_events").select("payload, source, created_by").eq("id", body.eventId).single() : null;
      const bi = ev?.data?.payload?.item || {};
      if (r.status !== 202 || bi.verificationStatus !== "pending" || bi.clientVisible !== false || "verifiedBy" in bi || ev?.data?.source !== "manager" || ev?.data?.created_by !== `bot:${botNames[0]}`) return fail("bot-self-verified");
      await runManager();
    } else notes["sender-cannot-self-verify"] = "bot path not checked: DASHBOARD_BOT_SECRET or DASHBOARD_BOT_ALLOWLIST not set here";

    // guard-blocks-direct-publish
    const direct = await db.from("client_dashboard_items").update({ client_visible: true, verification_status: "verified", verified_at: new Date().toISOString(), verified_by: "x", published_at: new Date().toISOString(), published_by: "x" }).eq("id", wp.id);
    if (!direct.error || !/publication-blocked/.test(direct.error.message || "")) return fail("direct-publish-not-blocked");

    // auto-publish-flag-alone-blocked: whatever AUTO_PUBLISH_ENABLED says, no gates and no switch means no.
    const auto = await db.rpc("auto_publish_dashboard_item", { p_item_id: wp.id });
    const stillHidden = await db.from("client_dashboard_items").select("client_visible").eq("id", wp.id).single();
    if (auto.error || auto.data !== false || stillHidden.data?.client_visible) return fail("auto-publish-not-blocked");

    // dashboard-item-recovery: the runner cannot publish, so hiding a pending row finds nothing to hide and changes nothing.
    const itemRecovery = await db.rpc("hide_client_dashboard_item", { p_item_id: wp.id, p_performed_by: "edge test runner", p_reason: "test recovery", p_replacement_note: null });
    const afterHide = await db.from("client_dashboard_items").select("client_visible, hidden_at").eq("id", wp.id).single();
    if (itemRecovery.error || itemRecovery.data?.length || afterHide.data?.client_visible || afterHide.data?.hidden_at) return fail("dashboard-item-recovery-failed");

    // billing-event-processed
    const billing = await enqueue(tenantId, "billing.changed", "invoice", "edge-runner-invoice",
      { item: { kind: "billing", externalId: "edge-runner-invoice", content: { invoice: { number: "EDGE-TEST-1", currency: "USD", status: "open", issuedAt: "2026-10-06", amountMinor: 100, hostedPaymentUrl: "https://invoice.stripe.com/i/edge-test" } }, sourceKind: "console", sourceRef: "stripe:edge-runner-invoice", sourceObservedAt: new Date().toISOString(), verificationStatus: "verified", verifiedAt: new Date().toISOString(), verifiedBy: "edge test runner", clientVisible: true } },
      `edge-runner-billing-${tenantId}`);
    if (billing.error || !billing.data) return fail("billing-event-create-failed");
    const billingRun = await runManager();
    if (!billingRun.response.ok || billingRun.body.processed !== 1 || billingRun.body.itemKind !== "billing") return fail("billing-event-process-failed");
    const invoice = await db.from("client_billing_invoices").select("id, client_visible, verification_status, hosted_payment_url, publish_requested").eq("tenant_id", tenantId).eq("provider_invoice_id", "edge-runner-invoice").single();
    if (invoice.error || !invoice.data || invoice.data.client_visible || invoice.data.verification_status !== "pending" || !invoice.data.hosted_payment_url?.startsWith("https://invoice.stripe.com/")) return fail("billing-projection-verification-failed");

    // invoice-recovery: likewise, nothing to hide, nothing changes.
    const invoiceRecovery = await db.rpc("hide_client_billing_invoice", { p_invoice_id: invoice.data.id, p_performed_by: "edge test runner", p_reason: "test recovery", p_replacement_note: null });
    if (invoiceRecovery.error || invoiceRecovery.data?.length) return fail("invoice-recovery-failed");

    // invalid-event-opened-exception
    const invalidEvent = await enqueue(tenantId, "work.changed", "work", "invalid-event", {}, `edge-runner-invalid-${tenantId}`);
    if (invalidEvent.error || !invalidEvent.data) return fail("invalid-event-create-failed");
    const invalidRun = await runManager();
    if (invalidRun.response.status !== 422) return fail("invalid-event-not-rejected");
    const exception = await db.from("dashboard_exceptions").select("id").eq("event_id", invalidEvent.data).eq("reason_code", "invalid_event").eq("status", "open").maybeSingle();
    if (exception.error || !exception.data) return fail("invalid-event-opened-exception-failed");

    // multica-unset-noop: presence only.
    const multicaSet = Boolean(Deno.env.get("MULTICA_TOKEN")) && Boolean(Deno.env.get("MULTICA_WORKSPACE"));
    const exBefore = await db.from("dashboard_exceptions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
    const sync = await runManager({ action: "sync_multica" });
    if (!sync.response.ok || sync.body.ok !== true) return fail("sync-multica-failed");
    if (!multicaSet) {
      if (sync.body.skipped !== "multica-not-configured") return fail("sync-multica-not-skipped");
      const req = await enqueue(tenantId, "work.changed", "multica_issue", "RUN-1", { sync: { identifier: "RUN-1" } }, `edge-runner-sync-${tenantId}`);
      if (req.error || !req.data) return fail("sync-request-create-failed");
      const drained = await runManager();
      const ev = await db.from("dashboard_events").select("status, last_error").eq("id", req.data).single();
      const exAfter = await db.from("dashboard_exceptions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if (!drained.response.ok || ev.data?.status !== "discarded" || ev.data?.last_error !== "multica-not-configured" || exAfter.count !== exBefore.count) return fail("multica-unset-not-quiet");
    } else notes["multica-unset-noop"] = "Multica is configured here: checked that sync_multica answers ok instead";

    // cross-tenant-rejected
    const stranger = await asBot("not-on-the-list", "wrong", { tenantId, eventType: "updates.changed", entityType: "update", entityId: "x", idempotencyKey: "x", payload: {} });
    if (stranger.status !== 401) return fail("unknown-bot-not-refused");
    if (botReady) {
      const wrongTenant = await asBot(botNames[0], botSecret!, { tenantId, eventType: "work.changed", entityType: "work", entityId: otherCard.data.id, idempotencyKey: `edge-runner-x-${tenantId}`,
        payload: { item: { kind: "work", externalId: otherCard.data.id, content: { title: "x" }, sourceKind: "manager", sourceRef: "console:x" } } });
      const archived = await asBot(botNames[0], botSecret!, { tenantId: archivedId, eventType: "updates.changed", entityType: "update", entityId: "x", idempotencyKey: `edge-runner-y-${tenantId}`,
        payload: { item: { kind: "update", externalId: "x", content: { title: "x" }, sourceKind: "manager", sourceRef: "console:x" } } });
      const syncOther = await asBot(botNames[0], botSecret!, { tenantId: otherId, eventType: "work.changed", entityType: "multica_issue", entityId: "RUN-1", payload: { sync: { identifier: "RUN-1" } } });
      const billingBot = await asBot(botNames[0], botSecret!, { tenantId, eventType: "billing.changed", entityType: "invoice", entityId: "x", idempotencyKey: `edge-runner-z-${tenantId}`, payload: { item: { kind: "billing" } } });
      if (wrongTenant.status !== 403 || archived.status !== 404 || syncOther.status !== 403 || billingBot.status !== 403) return fail("cross-tenant-not-refused");
    } else notes["cross-tenant-rejected"] = "only the unknown-bot refusal checked: DASHBOARD_BOT_SECRET or DASHBOARD_BOT_ALLOWLIST not set here";

    // drain-processes-many: three events, one call.
    for (const n of [1, 2, 3]) {
      const e = await enqueue(tenantId, "updates.changed", "update", `many-${n}`, { item: { kind: "update", externalId: `many-${n}`, content: { title: `Update ${n}` }, sourceKind: "console", sourceRef: `console:many-${n}` } }, `edge-runner-many-${n}-${tenantId}`);
      if (e.error || !e.data) return fail("many-create-failed");
    }
    const many = await runManager();
    if (!many.response.ok || many.body.processed !== 3 || many.body.remaining !== false) return fail("drain-not-many");

    // reaper-recovers-stuck
    const stuck = await db.from("dashboard_events").insert({ tenant_id: tenantId, event_type: "work.changed", entity_type: "work", entity_id: "stuck", source: "console", payload: {}, idempotency_key: `edge-runner-stuck-${tenantId}`, status: "processing", attempts: 1, claimed_at: new Date(Date.now() - 3600_000).toISOString() }).select("id").single();
    if (stuck.error || !stuck.data) return fail("stuck-create-failed");
    await db.rpc("reap_dashboard_events");
    const reaped = await db.from("dashboard_events").select("status").eq("id", stuck.data.id).single();
    if (reaped.data?.status !== "pending") return fail("reaper-did-not-recover");
    await db.from("dashboard_events").update({ status: "discarded" }).eq("id", stuck.data.id);

    // sync-overlap-busy: a second taker of a live lease is told it is busy.
    const lease = `runner-${crypto.randomUUID().slice(0, 8)}`;
    const first = await db.rpc("take_dashboard_lease", { p_name: lease, p_holder: "one", p_seconds: 30 });
    const second = await db.rpc("take_dashboard_lease", { p_name: lease, p_holder: "two", p_seconds: 30 });
    await db.from("dashboard_sync_lease").delete().eq("name", lease);
    if (first.data === null || second.data !== null) return fail("lease-not-exclusive");

    return json(200, { ok: true, checks: CHECKS, ...(Object.keys(notes).length ? { notes } : {}) });
  } catch (e) {
    return json(502, { error: (e as Error).message || "runner-failed" });
  } finally {
    for (const id of tenants) {
      await db.from("dashboard_recoveries").delete().eq("tenant_id", id);
      await db.from("dashboard_exceptions").delete().eq("tenant_id", id);
      await db.from("dashboard_events").delete().eq("tenant_id", id);
      await db.from("tenants").delete().eq("id", id);
    }
  }
});
