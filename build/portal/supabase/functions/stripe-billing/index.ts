// stripe-billing: the console's and the client portal's Stripe calls. Needs the caller's Clerk session token.
//
// Staff (a member of the Domin8te team: public.console_me with the caller's token):
//   POST { action: "status" }                                    { configured, mode: "test"|"live"|null, refused, liveAllowed, webhook }
//   POST { action: "search", query }                             up to 10 customers by email (exact) or name: { customers: [safe fields] }
// Super admin only (the same people who add clients):
//   POST { action: "create", tenantId, name?, email? }           a Stripe customer for the client (metadata tenant_id), stored as
//                                                                 doc.billing.stripeCustomerId: { customer }
//   POST { action: "link", tenantId, customerId }                stores an existing customer after checking it exists: { customer }
//   POST { action: "unlink", tenantId }                          removes doc.billing.stripeCustomerId (Stripe is left alone)
// Client (the caller's own restaurant, read under row level security with their token; no tenant id is ever taken
// from the body):
//   POST { action: "portal" }                                    a Stripe Billing Portal session: { url }
//   POST { action: "invoice", number }                           { url } = the invoice's hosted page, only for an invoice of their
//                                                                 customer that is visible to them (client_billing_invoices.client_visible)
//
// Errors are JSON { error, message }: not-configured (503, STRIPE_SECRET_KEY missing), live-key-refused (503),
// signed-out (401), forbidden (403), bad-request (400), no-client (404), no-customer (404), already-linked (409),
// not-found (404), stripe (502), conflict (409).
// verify_jwt is off because the token is Clerk's; console_me and row level security are the guards.

import { createClient } from "npm:@supabase/supabase-js@2";
import { CUSTOMER_ID, safeCustomer, stripe, stripeError, stripeMode, withCustomerId } from "../_shared/stripe.ts";

const ALLOWED = ["https://domin8temedia.com", "http://localhost:4173", "http://localhost:8080"];
const RETURN_URL = "https://domin8temedia.com/dashboard/#/billing";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(origin: string | null) {
  const allow = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function reply(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
const fail = (origin: string | null, status: number, error: string, message: string) => reply(origin, status, { error, message });

function claims(token: string): Record<string, any> {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "="))) || {};
  } catch { return {}; }
}
// The Clerk organisation in the token (org_id, or o.id in Clerk's v2 tokens), like app.jwt_org().
const orgOf = (c: Record<string, any>) => String(c.org_id || c.o?.id || "");

// Writes doc.billing.stripeCustomerId only: compare-and-set on updated_at, one retry.
async function setCustomer(db: any, tenantId: string, id: string | null, expectCurrent: (cur: string | null) => boolean) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cur = await db.from("tenants").select("doc, updated_at").eq("id", tenantId).maybeSingle();
    if (cur.error) return { error: "read" };
    if (!cur.data) return { error: "no-client" };
    const now = cur.data.doc?.billing?.stripeCustomerId || null;
    if (!expectCurrent(now)) return { error: "already-linked", current: now };
    const u = await db.from("tenants").update({ doc: withCustomerId(cur.data.doc, id), updated_at: new Date().toISOString() })
      .eq("id", tenantId).eq("updated_at", cur.data.updated_at).select("id");
    if (u.error) return { error: "write" };
    if (u.data?.length) return { ok: true };
  }
  return { error: "conflict" };
}

function portalReturn(origin: string | null) {
  return origin && origin.startsWith("http://localhost:") && ALLOWED.includes(origin) ? `${origin}/dashboard/#/billing` : RETURN_URL;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return fail(origin, 405, "method", "Use POST.");

  const mode = stripeMode();
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(origin, 401, "signed-out", "Sign in first.");
  const url = Deno.env.get("SUPABASE_URL"), anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return fail(origin, 503, "not-configured", "The server is missing its Supabase settings.");
  const db = createClient(url, anonKey, { accessToken: async () => token });

  let body: any;
  try { body = await req.json(); } catch { return fail(origin, 400, "bad-request", "Send an action."); }
  const action = String(body?.action || "");
  const staffActions = ["status", "search", "create", "link", "unlink"];
  const clientActions = ["portal", "invoice"];
  if (![...staffActions, ...clientActions].includes(action)) return fail(origin, 400, "bad-request", "Unknown action.");

  // ---------- staff ----------
  if (staffActions.includes(action)) {
    const who = await db.rpc("console_me");
    if (who.error || !who.data || !who.data.staff) return fail(origin, 403, "forbidden", "Only the Domin8te team can do this.");
    if (action === "status") {
      return reply(origin, 200, { ok: true, configured: mode.configured, mode: mode.mode, refused: mode.refused, liveAllowed: mode.liveAllowed, webhook: Boolean(Deno.env.get("STRIPE_WEBHOOK_SECRET")) });
    }
    if (!mode.configured) return fail(origin, 503, "not-configured", "Stripe is not set up on the server yet (Supabase: Edge Functions > Secrets > STRIPE_SECRET_KEY).");
    if (mode.refused) return fail(origin, 503, "live-key-refused", "The Stripe key on the server is a live key, and live mode is off (STRIPE_ALLOW_LIVE).");

    if (action === "search") {
      const q = String(body.query || "").trim().slice(0, 100);
      if (q.length < 3) return fail(origin, 400, "bad-request", "Type at least three characters.");  // Stripe's name~ needs 3
      const r = q.includes("@")
        ? await stripe("GET", "/customers", { email: q.toLowerCase(), limit: 10 })
        : await stripe("GET", "/customers/search", { query: `name~"${q.replace(/["\\]/g, "")}"`, limit: 10 });
      if (!r.ok) return fail(origin, 502, "stripe", `Stripe would not search (${stripeError(r)}).`);
      return reply(origin, 200, { ok: true, customers: (r.data?.data || []).slice(0, 10).map(safeCustomer) });
    }

    if (who.data.role !== "super_admin") return fail(origin, 403, "forbidden", "Only a super admin can link clients to Stripe.");
    const tenantId = String(body.tenantId || "");
    if (!UUID.test(tenantId)) return fail(origin, 400, "bad-request", "Say which client.");
    const t = await db.from("tenants").select("id, name, doc").eq("id", tenantId).maybeSingle();
    if (t.error) return fail(origin, 502, "read", "Could not read the client.");
    if (!t.data) return fail(origin, 404, "no-client", "That client was not found.");
    const linked: string | null = t.data.doc?.billing?.stripeCustomerId || null;

    if (action === "unlink") {
      if (!linked) return reply(origin, 200, { ok: true, unlinked: false });
      const s = await setCustomer(db, tenantId, null, (cur) => cur === linked);
      if (!s.ok) return fail(origin, 409, "conflict", "The client changed while unlinking. Try again.");
      return reply(origin, 200, { ok: true, unlinked: true });
    }

    // Is this customer already some other client's?
    const takenBy = async (id: string) => {
      const r = await db.from("tenants").select("id").eq("doc->billing->>stripeCustomerId", id).neq("id", tenantId).limit(1);
      return r.data?.[0]?.id || null;
    };

    if (action === "link") {
      const id = String(body.customerId || "").trim();
      if (!CUSTOMER_ID.test(id)) return fail(origin, 400, "bad-request", "That is not a Stripe customer id (cus_…).");
      if (linked && linked !== id) return fail(origin, 409, "already-linked", "This client is already linked to another Stripe customer. Unlink it first.");
      const c = await stripe("GET", `/customers/${encodeURIComponent(id)}`);
      if (c.status === 404 || c.data?.deleted) return fail(origin, 404, "not-found", "Stripe has no such customer (in this mode).");
      if (!c.ok) return fail(origin, 502, "stripe", `Stripe would not find the customer (${stripeError(c)}).`);
      if (await takenBy(id)) return fail(origin, 409, "already-linked", "That Stripe customer belongs to another client.");
      const s = await setCustomer(db, tenantId, id, (cur) => !cur || cur === id);
      if (!s.ok) return fail(origin, 409, s.error === "already-linked" ? "already-linked" : "conflict", "The client changed while linking. Try again.");
      if (c.data?.metadata?.tenant_id !== tenantId) await stripe("POST", `/customers/${encodeURIComponent(id)}`, { metadata: { tenant_id: tenantId } });
      return reply(origin, 200, { ok: true, customer: safeCustomer({ ...c.data, metadata: { ...(c.data?.metadata || {}), tenant_id: tenantId } }) });
    }

    // create
    if (linked) return fail(origin, 409, "already-linked", "This client already has a Stripe customer.");
    const name = String(body.name || t.data.name || "").trim().slice(0, 200);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(origin, 400, "bad-request", "Enter a valid email address.");
    // One customer per client: reuse one Stripe already has for this tenant (a retry after a failed save).
    let customer: any = null;
    const existing = await stripe("GET", "/customers/search", { query: `metadata['tenant_id']:'${tenantId}'`, limit: 1 });
    if (existing.ok && existing.data?.data?.[0]) customer = existing.data.data[0];
    if (!customer) {
      const c = await stripe("POST", "/customers", { name: name || undefined, email: email || undefined, metadata: { tenant_id: tenantId } }, { idempotencyKey: `create-customer:${tenantId}:${email}:${name}`.slice(0, 255) });
      if (!c.ok) return fail(origin, 502, "stripe", `Stripe would not create the customer (${stripeError(c)}).`);
      customer = c.data;
    }
    if (await takenBy(customer.id)) return fail(origin, 409, "already-linked", "That Stripe customer belongs to another client.");
    const s = await setCustomer(db, tenantId, customer.id, (cur) => !cur || cur === customer.id);
    if (!s.ok) return reply(origin, 409, { error: "conflict", message: "Stripe made the customer but the client could not be saved. Link it again.", customer: safeCustomer(customer) });
    return reply(origin, 200, { ok: true, created: !existing.data?.data?.[0], customer: safeCustomer(customer) });
  }

  // ---------- client: their own restaurant only ----------
  const org = orgOf(claims(token));
  if (!org) return fail(origin, 403, "forbidden", "Open this from your restaurant's account.");
  // Row level security decides what this token can read; the org filter only picks their row out of it.
  const t = await db.from("tenants").select("id, doc").eq("clerk_org_id", org).limit(2);
  if (t.error) return fail(origin, 502, "read", "Could not read your account.");
  if (!t.data?.length || t.data.length > 1) return fail(origin, 404, "no-client", "No restaurant account was found for you.");
  const tenant = t.data[0];
  const customerId: string | null = tenant.doc?.billing?.stripeCustomerId || null;
  if (!mode.configured) return fail(origin, 503, "not-configured", "Online billing is not switched on yet.");
  if (mode.refused) return fail(origin, 503, "live-key-refused", "Online billing is not switched on yet.");
  if (!customerId || !CUSTOMER_ID.test(customerId)) return fail(origin, 404, "no-customer", "Billing is not set up for your account yet.");

  if (action === "portal") {
    const r = await stripe("POST", "/billing_portal/sessions", { customer: customerId, return_url: portalReturn(origin) });
    if (!r.ok || typeof r.data?.url !== "string") return fail(origin, 502, "stripe", "The billing page could not be opened. Try again in a minute.");
    return reply(origin, 200, { ok: true, url: r.data.url });
  }

  // invoice
  const number = String(body.number || "").trim();
  if (!number || number.length > 100) return fail(origin, 400, "bad-request", "Say which invoice.");
  const inv = await db.from("client_billing_invoices").select("provider_invoice_id")
    .eq("tenant_id", tenant.id).eq("invoice_number", number).eq("client_visible", true).is("hidden_at", null).maybeSingle();
  if (inv.error) return fail(origin, 502, "read", "Could not read your invoices.");
  if (!inv.data) return fail(origin, 404, "not-found", "That invoice was not found.");
  const r = await stripe("GET", `/invoices/${encodeURIComponent(inv.data.provider_invoice_id)}`);
  if (!r.ok) return fail(origin, 502, "stripe", "The invoice could not be opened. Try again in a minute.");
  const owner = typeof r.data?.customer === "string" ? r.data.customer : r.data?.customer?.id;
  if (owner !== customerId) return fail(origin, 403, "forbidden", "That invoice is not on your account.");
  if (typeof r.data?.hosted_invoice_url !== "string" || !/^https:\/\/(invoice|billing)\.stripe\.com\//.test(r.data.hosted_invoice_url)) return fail(origin, 404, "not-found", "That invoice has no online page.");
  return reply(origin, 200, { ok: true, url: r.data.hosted_invoice_url });
});
