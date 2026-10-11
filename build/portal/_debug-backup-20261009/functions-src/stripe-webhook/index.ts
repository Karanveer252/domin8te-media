// stripe-webhook: Stripe's events in, nothing else. verify_jwt is off; the Stripe-Signature header (HMAC with
// STRIPE_WEBHOOK_SECRET, 5-minute tolerance) is the only guard, so every request without a valid one is refused.
//
// - Invoices (invoice.finalized, .paid, .payment_failed, .voided, .marked_uncollectible, .updated): queued as a
//   billing.changed/invoice item through public.enqueue_dashboard_event (source 'webhook', source_ref
//   'stripe:<invoice id>', idempotency key = the Stripe event id). The manager stores it pending and invisible;
//   Karan approves it in the console's "Check before it goes live". Nothing here can show an invoice to a client.
// - Subscriptions (customer.subscription.created/updated/deleted, and invoice.paid / invoice.payment_failed): the
//   client's doc.billing.subscription facts (status, startedAt, nextBilling, amount, graceUntil, retryOn,
//   stripeSubscriptionId), written with an optimistic updated_at check and one retry. No other doc field is touched.
//   The subscription is re-read from Stripe when the key is set, so an event arriving late never writes old facts.
//
// The client is the tenant whose doc.billing.stripeCustomerId is the event's customer. An unknown customer, an event
// type not handled here, or a live event while live mode is off answers 200 "ignored" (and is logged), so Stripe does
// not retry it for days. A database failure answers 500 so Stripe retries; repeats are harmless (idempotent).

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  HANDLED_EVENTS, customerId, invoiceItem, invoiceSubscriptionId, stripe, stripeMode, subscriptionFacts,
  verifyStripeSignature, withSubscriptionFacts,
} from "../_shared/stripe.ts";

const MAX_BODY = 512 * 1024;
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function findTenant(db: any, customer: string) {
  const r = await db.from("tenants").select("id, status").eq("doc->billing->>stripeCustomerId", customer).limit(2);
  if (r.error) return { error: true as const };
  if (!r.data?.length) return { tenant: null };
  if (r.data.length > 1) { console.log(`stripe-webhook: customer ${customer} is linked to more than one client; ignored`); return { tenant: null }; }
  return { tenant: r.data[0] as { id: string; status: string } };
}

// The subscription as it is now (with its latest invoice), or the event's copy when Stripe can't be asked.
async function freshSubscription(id: string, fallback: any) {
  const m = stripeMode();
  if (!m.configured || m.refused) return fallback;
  const r = await stripe("GET", `/subscriptions/${encodeURIComponent(id)}`, { expand: ["latest_invoice"] });
  return r.ok && r.data?.id === id ? r.data : fallback;
}

// Writes only doc.billing.subscription's Stripe facts. Compare-and-set on updated_at, one retry.
async function applyFacts(db: any, tenantId: string, facts: Record<string, unknown>): Promise<"updated" | "unchanged" | "conflict" | "error"> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cur = await db.from("tenants").select("doc, updated_at").eq("id", tenantId).maybeSingle();
    if (cur.error || !cur.data) return "error";
    const before = cur.data.doc?.billing?.subscription || {};
    if (Object.keys(facts).every((k) => JSON.stringify(before[k] ?? null) === JSON.stringify(facts[k] ?? null))) return "unchanged";
    const doc = withSubscriptionFacts(cur.data.doc, facts);
    const u = await db.from("tenants").update({ doc, updated_at: new Date().toISOString() })
      .eq("id", tenantId).eq("updated_at", cur.data.updated_at).select("id");
    if (u.error) return "error";
    if (u.data?.length) return "updated";
  }
  return "conflict";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method" });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !url || !serviceRoleKey) { console.log("stripe-webhook: not configured"); return json(503, { error: "not-configured" }); }

  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return json(413, { error: "too-large" });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too-large" });
  const sig = await verifyStripeSignature(raw, req.headers.get("Stripe-Signature"), secret);
  if (!sig.ok) return json(400, { error: "bad-signature", reason: sig.reason });

  let event: any;
  try { event = JSON.parse(raw); } catch { return json(400, { error: "bad-request" }); }
  if (!event || typeof event.id !== "string" || typeof event.type !== "string" || !event.data?.object) return json(400, { error: "bad-request" });

  if (!HANDLED_EVENTS.includes(event.type)) return json(200, { ok: true, ignored: "event-type", type: event.type });
  if (event.livemode && Deno.env.get("STRIPE_ALLOW_LIVE") !== "true") {
    console.log(`stripe-webhook: live event ${event.id} ignored (live mode is off)`);
    return json(200, { ok: true, ignored: "live-mode-off" });
  }

  const obj = event.data.object;
  const customer = customerId(obj);
  if (!customer) return json(200, { ok: true, ignored: "no-customer" });
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const found = await findTenant(db, customer);
  if ("error" in found) return json(500, { error: "tenant-read-failed" });
  if (!found.tenant) {
    console.log(`stripe-webhook: ${event.type} ${event.id} for unknown customer ${customer}; ignored`);
    return json(200, { ok: true, ignored: "unknown-customer" });
  }
  const tenantId = found.tenant.id;
  const out: Record<string, unknown> = { ok: true, event: event.id, type: event.type };

  // 1. Invoices -> the outbox, pending until Karan approves.
  if (event.type.startsWith("invoice.")) {
    const item = invoiceItem(obj, event.type, Number(event.created) || Math.floor(Date.now() / 1000));
    if (!item) out.invoice = "skipped";  // a draft, or nothing a client could be shown
    else {
      const q = await db.rpc("enqueue_dashboard_event", {
        p_tenant: tenantId, p_event_type: "billing.changed", p_entity_type: "invoice", p_entity_id: item.externalId,
        p_source: "webhook", p_payload: { item }, p_idempotency_key: event.id, p_created_by: "stripe",
      });
      if (q.error) { console.log(`stripe-webhook: enqueue failed for ${event.id}`); return json(500, { error: "queue-failed" }); }
      out.invoice = q.data ? "queued" : "duplicate";
    }
  }

  // 2. Subscription facts.
  let subId: string | null = null;
  let fallback: any = null;
  let attempt: number | null = null;
  if (event.type.startsWith("customer.subscription.")) { subId = obj.id; fallback = obj; }
  else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    subId = invoiceSubscriptionId(obj);
    if (event.type === "invoice.payment_failed" && typeof obj.next_payment_attempt === "number") attempt = obj.next_payment_attempt;
  }
  if (subId) {
    const sub = await freshSubscription(subId, fallback);
    const facts = sub ? subscriptionFacts(sub, attempt) : null;
    if (!facts) out.subscription = "skipped";
    else {
      const r = await applyFacts(db, tenantId, facts);
      if (r === "error") return json(500, { error: "tenant-write-failed" });
      if (r === "conflict") { console.log(`stripe-webhook: ${event.id} lost the write race twice; Stripe will retry`); return json(500, { error: "busy" }); }
      out.subscription = r;
      if (r === "updated") await db.from("audit_log").insert({ tenant_id: tenantId, actor: "stripe-webhook", action: "billing.subscription.synced", detail: { event: event.id, type: event.type, status: facts.status } });
    }
  }
  return json(200, out);
});
