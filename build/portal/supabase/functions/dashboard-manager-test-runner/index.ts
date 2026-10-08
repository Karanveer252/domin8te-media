// Test-project-only Dashboard Manager smoke runner.
// Never deploy to production. Requires explicit enable flag and scheduler secret.
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function authorized(request: Request) {
  const expected = Deno.env.get("DASHBOARD_MANAGER_CRON_SECRET");
  const received = request.headers.get("x-dashboard-manager-secret");
  return Boolean(expected && received && expected === received);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "method" });
  if (!authorized(request)) return json(401, { error: "unauthorized" });
  if (Deno.env.get("DASHBOARD_TEST_RUNNER_ENABLED") !== "true") return json(503, { error: "disabled" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const schedulerSecret = Deno.env.get("DASHBOARD_MANAGER_CRON_SECRET");
  if (!url || !serviceRoleKey || !schedulerSecret) return json(503, { error: "not-configured" });
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const runManager = async () => {
    const response = await fetch(`${url}/functions/v1/dashboard-manager`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-dashboard-manager-secret": schedulerSecret },
      body: "{}",
    });
    return { response, body: await response.json().catch(() => ({})) };
  };

  const pending = await db.from("dashboard_events").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (pending.error) return json(502, { error: "queue-check-failed" });
  if (pending.count) return json(409, { error: "queue-not-empty" });

  let tenantId: string | null = null;
  try {
    const tenant = await db.from("tenants").insert({ name: `Temporary edge test runner ${crypto.randomUUID()}` }).select("id").single();
    if (tenant.error || !tenant.data) return json(502, { error: "tenant-create-failed" });
    tenantId = tenant.data.id;

    const invalidResult = await db.from("client_dashboard_items").insert({ tenant_id: tenantId, item_kind: "result", external_id: "invalid-result", content: {}, source_kind: "console", source_ref: "test-only", verification_status: "pending", client_visible: true });
    if (!invalidResult.error) return json(500, { error: "invalid-result-was-accepted" });

    const work = await db.from("dashboard_events").insert({
      tenant_id: tenantId, event_type: "work.changed", entity_type: "work", entity_id: "edge-runner-work", source: "console", idempotency_key: `edge-runner-work-${tenantId}`,
      payload: { item: { kind: "work", externalId: "edge-runner-work", content: { title: "Test only" }, sourceKind: "console", sourceRef: "test-only", verificationStatus: "verified", verifiedAt: new Date().toISOString(), verifiedBy: "edge test runner", clientVisible: true } },
    }).select("id").single();
    if (work.error || !work.data) return json(502, { error: "work-event-create-failed" });
    const workRun = await runManager();
    if (!workRun.response.ok || workRun.body.processed !== true || workRun.body.itemKind !== "work") return json(502, { error: "work-event-process-failed" });

    const workProjection = await db.from("client_dashboard_items").select("id, client_visible, verification_status, verified_at, published_at").eq("tenant_id", tenantId).eq("external_id", "edge-runner-work").single();
    if (workProjection.error || !workProjection.data || !workProjection.data.client_visible || workProjection.data.verification_status !== "verified" || !workProjection.data.verified_at || !workProjection.data.published_at) return json(502, { error: "projection-verification-failed" });
    const itemRecovery = await db.rpc("hide_client_dashboard_item", { p_item_id: workProjection.data.id, p_performed_by: "edge test runner", p_reason: "test recovery", p_replacement_note: null });
    if (itemRecovery.error || !itemRecovery.data?.length) return json(502, { error: "dashboard-item-recovery-failed" });

    const billing = await db.from("dashboard_events").insert({
      tenant_id: tenantId, event_type: "billing.changed", entity_type: "invoice", entity_id: "edge-runner-invoice", source: "console", idempotency_key: `edge-runner-billing-${tenantId}`,
      payload: { item: { kind: "billing", externalId: "edge-runner-invoice", content: { invoice: { number: "EDGE-TEST-1", currency: "USD", status: "open", issuedAt: "2026-10-06", amountMinor: 100, hostedPaymentUrl: "https://invoice.stripe.com/i/edge-test" } }, sourceKind: "console", sourceRef: "test-only", sourceObservedAt: new Date().toISOString(), verificationStatus: "verified", verifiedAt: new Date().toISOString(), verifiedBy: "edge test runner", clientVisible: true } },
    }).select("id").single();
    if (billing.error || !billing.data) return json(502, { error: "billing-event-create-failed" });
    const billingRun = await runManager();
    if (!billingRun.response.ok || billingRun.body.processed !== true || billingRun.body.itemKind !== "billing") return json(502, { error: "billing-event-process-failed" });

    const invoice = await db.from("client_billing_invoices").select("id, client_visible, verification_status, hosted_payment_url").eq("tenant_id", tenantId).eq("provider_invoice_id", "edge-runner-invoice").single();
    if (invoice.error || !invoice.data || !invoice.data.client_visible || invoice.data.verification_status !== "verified" || !invoice.data.hosted_payment_url?.startsWith("https://invoice.stripe.com/")) return json(502, { error: "billing-projection-verification-failed" });
    const invoiceRecovery = await db.rpc("hide_client_billing_invoice", { p_invoice_id: invoice.data.id, p_performed_by: "edge test runner", p_reason: "test recovery", p_replacement_note: null });
    if (invoiceRecovery.error || !invoiceRecovery.data?.length) return json(502, { error: "invoice-recovery-failed" });

    const invalidEvent = await db.from("dashboard_events").insert({ tenant_id: tenantId, event_type: "work.changed", entity_type: "work", entity_id: "invalid-event", source: "console", idempotency_key: `edge-runner-invalid-${tenantId}`, payload: {} }).select("id").single();
    if (invalidEvent.error || !invalidEvent.data) return json(502, { error: "invalid-event-create-failed" });
    const invalidRun = await runManager();
    if (invalidRun.response.status !== 422) return json(502, { error: "invalid-event-not-rejected" });
    const exception = await db.from("dashboard_exceptions").select("id").eq("event_id", invalidEvent.data.id).eq("reason_code", "invalid_event").eq("status", "open").maybeSingle();
    if (exception.error || !exception.data) return json(502, { error: "invalid-event-opened-exception-failed" });

    return json(200, { ok: true, checks: ["invalid-result-rejected", "work-event-processed", "projection-verified", "dashboard-item-recovery", "billing-event-processed", "invoice-recovery", "invalid-event-opened-exception"] });
  } finally {
    if (tenantId) {
      const recovery = await db.from("dashboard_recoveries").delete().eq("tenant_id", tenantId);
      const exceptions = await db.from("dashboard_exceptions").delete().eq("tenant_id", tenantId);
      const events = await db.from("dashboard_events").delete().eq("tenant_id", tenantId);
      const tenant = await db.from("tenants").delete().eq("id", tenantId);
      if (recovery.error || exceptions.error || events.error || tenant.error) throw new Error("test-cleanup-failed");
    }
  }
});
