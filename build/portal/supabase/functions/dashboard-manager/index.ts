// dashboard-manager: server-side worker for client-dashboard sync events.
//
// Required Supabase secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - DASHBOARD_MANAGER_CRON_SECRET
// - DASHBOARD_MANAGER_ENABLED=true (only after both manager migrations are deployed)
//
// The function writes only to client-safe projection tables. It never writes
// tenants.doc, sends email, or makes provider calls.

import { createClient } from "npm:@supabase/supabase-js@2";

type DashboardEvent = {
  id: string;
  tenant_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  payload: unknown;
};

type ProjectionItem = {
  kind: "work" | "result" | "update" | "billing";
  externalId: string;
  content: Record<string, unknown>;
  sourceKind: "console" | "integration" | "webhook" | "manager";
  sourceRef: string;
  sourceObservedAt?: string;
  verificationStatus: "pending" | "verified" | "rejected" | "stale";
  verifiedAt?: string;
  verifiedBy?: string;
  clientVisible: boolean;
  reportingPeriodStart?: string;
  reportingPeriodEnd?: string;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function requireSchedulerSecret(req: Request) {
  const expected = Deno.env.get("DASHBOARD_MANAGER_CRON_SECRET");
  const received = req.headers.get("x-dashboard-manager-secret");
  return Boolean(expected && received && received === expected);
}

function managerEnabled() {
  return Deno.env.get("DASHBOARD_MANAGER_ENABLED") === "true";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asText(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}

function parseItem(event: DashboardEvent): { item?: ProjectionItem; error?: string } {
  if (!isObject(event.payload) || !isObject(event.payload.item)) return { error: "Event payload must include an item object." };
  const raw = event.payload.item;
  const kind = raw.kind;
  const sourceKind = raw.sourceKind;
  const verificationStatus = raw.verificationStatus;
  const externalId = asText(raw.externalId, 200);
  const sourceRef = asText(raw.sourceRef, 500);

  if (!["work", "result", "update", "billing"].includes(String(kind))) return { error: "Item kind is invalid." };
  if (!["console", "integration", "webhook", "manager"].includes(String(sourceKind))) return { error: "Item source kind is invalid." };
  if (!["pending", "verified", "rejected", "stale"].includes(String(verificationStatus))) return { error: "Item verification status is invalid." };
  if (!externalId || !sourceRef || !isObject(raw.content) || typeof raw.clientVisible !== "boolean") return { error: "Item is missing required fields." };

  const item: ProjectionItem = {
    kind: kind as ProjectionItem["kind"],
    externalId,
    content: raw.content,
    sourceKind: sourceKind as ProjectionItem["sourceKind"],
    sourceRef,
    verificationStatus: verificationStatus as ProjectionItem["verificationStatus"],
    clientVisible: raw.clientVisible,
    ...(asText(raw.sourceObservedAt, 40) ? { sourceObservedAt: raw.sourceObservedAt as string } : {}),
    ...(asText(raw.verifiedAt, 40) ? { verifiedAt: raw.verifiedAt as string } : {}),
    ...(asText(raw.verifiedBy, 200) ? { verifiedBy: raw.verifiedBy as string } : {}),
    ...(asText(raw.reportingPeriodStart, 10) ? { reportingPeriodStart: raw.reportingPeriodStart as string } : {}),
    ...(asText(raw.reportingPeriodEnd, 10) ? { reportingPeriodEnd: raw.reportingPeriodEnd as string } : {}),
  };

  if (item.clientVisible && (item.verificationStatus !== "verified" || !item.verifiedAt || !item.verifiedBy)) {
    return { error: "Client-visible items require verified status, timestamp, and verifier." };
  }
  if (item.kind === "result" && item.clientVisible && (!item.sourceObservedAt || !item.reportingPeriodStart || !item.reportingPeriodEnd)) {
    return { error: "Client-visible results require source observation time and reporting period." };
  }
  return { item };
}

function invoiceRow(item: ProjectionItem, tenantId: string, now: string): { row?: Record<string, unknown>; error?: string } {
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
  if (item.clientVisible && !item.sourceObservedAt) return { error: "Client-visible invoices require source observation time." };
  return { row: {
    tenant_id: tenantId, provider: "stripe", provider_invoice_id: item.externalId, invoice_number: number,
    amount_minor: amountMinor, currency, status, issued_at: issuedAt, due_at: dueAt, paid_at: paidAt,
    hosted_payment_url: paymentUrl, source_ref: item.sourceRef, source_observed_at: item.sourceObservedAt || now,
    verification_status: item.verificationStatus, verified_at: item.verifiedAt || null, verified_by: item.verifiedBy || null,
    client_visible: item.clientVisible, updated_at: now, published_at: item.clientVisible ? now : null,
    published_by: item.clientVisible ? "dashboard-manager" : null,
  } };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method", message: "Use POST." });
  if (!requireSchedulerSecret(req)) return json(401, { error: "unauthorized" });
  if (!managerEnabled()) return json(503, { error: "disabled" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json(503, { error: "not-configured" });

  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const claimed = await db.rpc("claim_dashboard_event");
  if (claimed.error) return json(502, { error: "claim-failed" });

  const event = (claimed.data || [])[0] as DashboardEvent | undefined;
  if (!event) return json(200, { ok: true, processed: false, reason: "queue-empty" });

  const parsed = parseItem(event);
  if (!parsed.item) {
    const reason = parsed.error || "Invalid dashboard event.";
    await db.from("dashboard_exceptions").insert({
      tenant_id: event.tenant_id,
      event_id: event.id,
      entity_type: event.entity_type || "unknown",
      entity_id: event.entity_id,
      severity: "warning",
      reason_code: "invalid_event",
      message: reason,
      status: "open",
    });
    await db.from("dashboard_events")
      .update({ status: "failed", last_error: reason, processed_at: new Date().toISOString() })
      .eq("id", event.id);
    return json(422, { ok: false, eventId: event.id, error: "invalid-event" });
  }

  const item = parsed.item;
  const now = new Date().toISOString();
  if (item.kind === "billing") {
    const invoice = invoiceRow(item, event.tenant_id, now);
    if (!invoice.row) {
      const reason = invoice.error || "Invalid billing invoice.";
      await db.from("dashboard_exceptions").insert({ tenant_id: event.tenant_id, event_id: event.id, entity_type: "billing", entity_id: item.externalId, severity: "warning", reason_code: "invalid_billing_invoice", message: reason, status: "open" });
      await db.from("dashboard_events").update({ status: "failed", last_error: reason, processed_at: now }).eq("id", event.id);
      return json(422, { ok: false, eventId: event.id, error: "invalid-billing-invoice" });
    }
    const projectedInvoice = await db.from("client_billing_invoices").upsert(invoice.row, { onConflict: "tenant_id,provider,provider_invoice_id" });
    if (projectedInvoice.error) {
      const reason = "Billing projection write failed.";
      await db.from("dashboard_exceptions").insert({ tenant_id: event.tenant_id, event_id: event.id, entity_type: "billing", entity_id: item.externalId, severity: "critical", reason_code: "billing_projection_write_failed", message: reason, status: "open" });
      await db.from("dashboard_events").update({ status: "failed", last_error: reason, processed_at: now }).eq("id", event.id);
      return json(502, { ok: false, eventId: event.id, error: "billing-projection-write-failed" });
    }
    const completed = await db.from("dashboard_events").update({ status: "processed", last_error: null, processed_at: now }).eq("id", event.id);
    if (completed.error) return json(502, { error: "completion-write-failed", eventId: event.id });
    return json(200, { ok: true, processed: true, eventId: event.id, itemKind: item.kind });
  }

  const projection = await db.from("client_dashboard_items").upsert({
    tenant_id: event.tenant_id,
    item_kind: item.kind,
    external_id: item.externalId,
    content: item.content,
    source_kind: item.sourceKind,
    source_ref: item.sourceRef,
    source_observed_at: item.sourceObservedAt || null,
    verification_status: item.verificationStatus,
    verified_at: item.verifiedAt || null,
    verified_by: item.verifiedBy || null,
    client_visible: item.clientVisible,
    reporting_period_start: item.reportingPeriodStart || null,
    reporting_period_end: item.reportingPeriodEnd || null,
    updated_at: now,
    published_at: item.clientVisible ? now : null,
    published_by: item.clientVisible ? "dashboard-manager" : null,
  }, { onConflict: "tenant_id,item_kind,external_id" });

  if (projection.error) {
    const reason = "Projection write failed.";
    await db.from("dashboard_exceptions").insert({
      tenant_id: event.tenant_id,
      event_id: event.id,
      entity_type: item.kind,
      entity_id: item.externalId,
      severity: "critical",
      reason_code: "projection_write_failed",
      message: reason,
      status: "open",
    });
    await db.from("dashboard_events")
      .update({ status: "failed", last_error: reason, processed_at: now })
      .eq("id", event.id);
    return json(502, { ok: false, eventId: event.id, error: "projection-write-failed" });
  }

  const completed = await db.from("dashboard_events")
    .update({ status: "processed", last_error: null, processed_at: now })
    .eq("id", event.id);
  if (completed.error) return json(502, { error: "completion-write-failed", eventId: event.id });

  return json(200, { ok: true, processed: true, eventId: event.id, itemKind: item.kind });
});
