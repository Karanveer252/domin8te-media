// Stripe, shared by stripe-billing (console + client portal) and stripe-webhook (Stripe only).
// A tiny REST client over fetch (form-encoded bodies, Bearer STRIPE_SECRET_KEY, pinned Stripe-Version), webhook
// signature checks with Web Crypto, and the pure mappings from Stripe objects to what the portal stores.
//
// Test mode is enforced: a live key (sk_live_ / rk_live_) is refused unless STRIPE_ALLOW_LIVE === "true".
// No secret value is ever logged or returned: callers check presence and mode only, with stripeMode().

export const STRIPE_API = "https://api.stripe.com/v1";
// Pinned so responses keep one shape. The mappings below also read the older shapes (current_period_end on the
// subscription, invoice.subscription), because webhook payloads follow the endpoint's own API version.
export const STRIPE_VERSION = "2025-03-31.basil";
// Invoice and subscription dates are stored as the day in Chicago, like the rest of the dashboard.
export const BILLING_TZ = "America/Chicago";

const env = (k: string) => (Deno.env.get(k) || "").trim();

export type StripeMode = { configured: boolean; mode: "test" | "live" | null; refused: boolean; liveAllowed: boolean };

/** What kind of key is set, without ever exposing it. refused = a live key while STRIPE_ALLOW_LIVE is not "true". */
export function stripeMode(key = env("STRIPE_SECRET_KEY")): StripeMode {
  const liveAllowed = env("STRIPE_ALLOW_LIVE") === "true";
  if (!key) return { configured: false, mode: null, refused: false, liveAllowed };
  const live = /^(sk|rk)_live_/.test(key);
  const test = /^(sk|rk)_test_/.test(key);
  const mode = live ? "live" : test ? "test" : null;
  return { configured: true, mode, refused: mode === null || (live && !liveAllowed), liveAllowed };
}

/** Form-encodes nested objects the way Stripe expects: metadata[tenant_id]=…, expand[]=…. */
export function formEncode(data: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x) => parts.push(`${encodeURIComponent(key + "[]")}=${encodeURIComponent(String(x))}`));
    else if (typeof v === "object") { const inner = formEncode(v as Record<string, unknown>, key); if (inner) parts.push(inner); }
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join("&");
}

export type StripeResult = { ok: boolean; status: number; data: any };

/**
 * One call to Stripe. Answers { ok, status, data }; never throws on a bad answer. Refuses (status 0,
 * error "live-key-refused" / "not-configured") before any network call when the key is missing or live and not allowed.
 * GET bodies go in the query string; POST/DELETE bodies are form-encoded.
 */
export async function stripe(method: "GET" | "POST" | "DELETE", path: string, body: Record<string, unknown> = {}, opts: { idempotencyKey?: string } = {}): Promise<StripeResult> {
  const key = env("STRIPE_SECRET_KEY");
  const m = stripeMode(key);
  if (!m.configured) return { ok: false, status: 0, data: { error: { code: "not-configured" } } };
  if (m.refused) return { ok: false, status: 0, data: { error: { code: "live-key-refused" } } };
  const form = formEncode(body);
  const url = STRIPE_API + path + (method === "GET" && form ? (path.includes("?") ? "&" : "?") + form : "");
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION };
  if (method !== "GET") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (opts.idempotencyKey && method === "POST") headers["Idempotency-Key"] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: method === "GET" ? undefined : form });
  } catch {
    return { ok: false, status: 0, data: { error: { code: "network" } } };
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, data };
}

export const stripeError = (r: StripeResult) => r.data?.error?.message || r.data?.error?.code || `HTTP ${r.status}`;

// ---------- webhook signatures ----------

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (same length check folded in). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

export type SignatureCheck = { ok: true; timestamp: number } | { ok: false; reason: "missing" | "malformed" | "too-old" | "mismatch" };

/**
 * Stripe-Signature: "t=<unix>,v1=<hex>,v1=<hex>,v0=…". Valid when any v1 equals HMAC-SHA256(secret, "<t>.<rawBody>")
 * and t is within toleranceSeconds of now (either side). rawBody must be the exact bytes Stripe sent, as text.
 */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string | undefined, toleranceSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000)): Promise<SignatureCheck> {
  if (!header || !secret) return { ok: false, reason: "missing" };
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t" && /^\d{1,12}$/.test(v)) t = Number(v);
    else if (k === "v1" && /^[0-9a-f]{64}$/i.test(v)) v1.push(v.toLowerCase());
  }
  if (t === null || !v1.length) return { ok: false, reason: "malformed" };
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return { ok: false, reason: "too-old" };
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  let match = false;
  for (const s of v1) match = timingSafeEqual(s, expected) || match;  // check every one: no early exit
  return match ? { ok: true, timestamp: t } : { ok: false, reason: "mismatch" };
}

// ---------- mappings ----------

/** Unix seconds -> "YYYY-MM-DD" in BILLING_TZ, or null. */
export function stripeDate(unix: unknown, tz = BILLING_TZ): string | null {
  if (typeof unix !== "number" || !Number.isFinite(unix) || unix <= 0) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unix * 1000));
}
export function stripeInstant(unix: unknown): string | null {
  return typeof unix === "number" && Number.isFinite(unix) && unix > 0 ? new Date(unix * 1000).toISOString() : null;
}

// The console's SUB_STATUS keys: active, trialing, past_due, paused, canceled.
const SUB_MAP: Record<string, string> = {
  active: "active", trialing: "trialing", past_due: "past_due", paused: "paused", canceled: "canceled",
  unpaid: "past_due",               // retries ran out; still owes money
  incomplete: "past_due",           // first payment not made yet
  incomplete_expired: "canceled",   // first payment never made; Stripe gave up
};
export function subscriptionStatus(stripeStatus: unknown): string | null {
  return SUB_MAP[String(stripeStatus || "")] || null;
}

/**
 * The portal's invoice status: open, paid, overdue, failed, void (client_billing_invoices.status).
 * Drafts answer null: they have no number yet and are never sent to the dashboard.
 */
export function invoiceStatus(inv: any, eventType = "", nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  const s = String(inv?.status || "");
  if (s === "paid") return "paid";
  if (s === "void") return "void";
  if (s === "uncollectible") return "failed";
  if (s !== "open") return null;
  if (eventType === "invoice.payment_failed" || Number(inv.attempt_count) > 0) return "failed";
  if (typeof inv.due_date === "number" && inv.due_date < nowSeconds) return "overdue";
  return "open";
}

export const STRIPE_HOSTED_URL = /^https:\/\/(invoice|billing)\.stripe\.com\//;

/** The subscription id an invoice belongs to, in the old (invoice.subscription) and new (invoice.parent) shapes. */
export function invoiceSubscriptionId(inv: any): string | null {
  const s = inv?.subscription ?? inv?.parent?.subscription_details?.subscription ?? null;
  if (!s) return null;
  return typeof s === "string" ? s : s.id || null;
}
export function customerId(obj: any): string | null {
  const c = obj?.customer;
  if (!c) return null;
  return typeof c === "string" ? c : c.id || null;
}

/**
 * A Stripe invoice -> the dashboard-manager billing item (payload.item for billing.changed/invoice).
 * Field names are exactly what dashboard-manager's invoiceRow reads. null = not something to show (draft, no number).
 */
export function invoiceItem(inv: any, eventType: string, eventCreated: number, nowSeconds = Math.floor(Date.now() / 1000)): { kind: "billing"; externalId: string; sourceKind: "webhook"; sourceRef: string; sourceObservedAt: string; content: { invoice: Record<string, unknown> } } | null {
  if (!inv || typeof inv.id !== "string" || !inv.id.startsWith("in_")) return null;
  const status = invoiceStatus(inv, eventType, nowSeconds);
  const number = typeof inv.number === "string" && inv.number.trim() ? inv.number.trim().slice(0, 100) : null;
  if (!status || !number) return null;
  const amount = [inv.total, inv.amount_due].find((x) => typeof x === "number" && Number.isSafeInteger(x));
  if (amount === undefined || amount < 0) return null;
  const currency = String(inv.currency || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const issuedAt = stripeDate(inv.status_transitions?.finalized_at) || stripeDate(inv.created);
  if (!issuedAt) return null;
  let dueAt = stripeDate(inv.due_date);
  if (dueAt && dueAt < issuedAt) dueAt = issuedAt;  // the table refuses a due date before the issue date
  const paidAt = status === "paid" ? (stripeInstant(inv.status_transitions?.paid_at) || stripeInstant(eventCreated)) : null;
  const url = typeof inv.hosted_invoice_url === "string" && STRIPE_HOSTED_URL.test(inv.hosted_invoice_url) ? inv.hosted_invoice_url : null;
  return {
    kind: "billing",
    externalId: inv.id,
    sourceKind: "webhook",
    sourceRef: `stripe:${inv.id}`,
    sourceObservedAt: stripeInstant(eventCreated) || new Date(nowSeconds * 1000).toISOString(),
    content: { invoice: { number, amountMinor: amount, currency, status, issuedAt, dueAt, paidAt, hostedPaymentUrl: url } },
  };
}

/** "$499 a month", "$1,200 every 3 months", "CA$99 a week". Whole amounts drop the cents. */
export function formatPrice(amountMinor: number, currency: string, interval?: string | null, intervalCount = 1): string {
  const cur = String(currency || "usd").toUpperCase();
  const zeroDecimal = ["JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XAF", "XOF", "PYG", "RWF", "BIF", "DJF", "GNF", "KMF", "MGA", "VUV", "XPF"].includes(cur);
  const major = zeroDecimal ? amountMinor : amountMinor / 100;
  const whole = Number.isInteger(major);
  let money: string;
  try {
    money = new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(major);
  } catch { money = `${major} ${cur}`; }
  if (!interval) return money;
  const n = Number(intervalCount) || 1;
  return n === 1 ? `${money} a ${interval}` : `${money} every ${n} ${interval}s`;
}

/** The subscription's price as a readable string: the items that share the first item's interval, summed. */
export function subscriptionAmount(sub: any): string | null {
  const items: any[] = Array.isArray(sub?.items?.data) ? sub.items.data : [];
  const priced = items.map((it) => ({ p: it.price || it.plan || {}, q: Number(it.quantity ?? 1) || 1 }))
    .filter(({ p }) => typeof (p.unit_amount ?? p.amount) === "number");
  if (!priced.length) return null;
  const first = priced[0].p;
  const interval = first.recurring?.interval || first.interval || null;
  const count = first.recurring?.interval_count || first.interval_count || 1;
  const same = priced.filter(({ p }) => (p.recurring?.interval || p.interval || null) === interval && (p.recurring?.interval_count || p.interval_count || 1) === count && p.currency === first.currency);
  const total = same.reduce((sum, { p, q }) => sum + (p.unit_amount ?? p.amount) * q, 0);
  return formatPrice(total, first.currency, interval, count);
}

/**
 * A Stripe subscription -> the facts the console keeps in doc.billing.subscription. Only these keys are written;
 * everything else in the record is left alone. nextPaymentAttempt (unix) comes from the latest invoice when known.
 */
export function subscriptionFacts(sub: any, nextPaymentAttempt?: number | null): Record<string, unknown> | null {
  const status = subscriptionStatus(sub?.status);
  if (!sub || typeof sub.id !== "string" || !status) return null;
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;  // old shape, then basil
  const attempt = nextPaymentAttempt ?? (typeof sub.latest_invoice === "object" ? sub.latest_invoice?.next_payment_attempt : null) ?? null;
  const owing = status === "past_due";
  return {
    status,
    startedAt: stripeDate(sub.start_date) || stripeDate(sub.created),
    nextBilling: status === "canceled" ? null : stripeDate(periodEnd),
    amount: subscriptionAmount(sub),
    graceUntil: owing ? stripeDate(attempt) : null,
    retryOn: owing ? stripeDate(attempt) : null,
    stripeSubscriptionId: sub.id,
  };
}

/** doc with only doc.billing.subscription's Stripe facts replaced (and stripeCustomerId kept). Pure. */
export function withSubscriptionFacts(doc: any, facts: Record<string, unknown>): any {
  const d = doc && typeof doc === "object" ? doc : {};
  const billing = d.billing && typeof d.billing === "object" ? d.billing : {};
  const sub = billing.subscription && typeof billing.subscription === "object" ? billing.subscription : {};
  return { ...d, billing: { ...billing, subscription: { ...sub, ...facts } } };
}

/** doc with doc.billing.stripeCustomerId set (or removed when id is null). Pure. */
export function withCustomerId(doc: any, id: string | null): any {
  const d = doc && typeof doc === "object" ? doc : {};
  const billing = { ...(d.billing && typeof d.billing === "object" ? d.billing : {}) };
  if (id) billing.stripeCustomerId = id; else delete billing.stripeCustomerId;
  return { ...d, billing };
}

export const CUSTOMER_ID = /^cus_[A-Za-z0-9]{1,100}$/;

/** The fields of a customer that may leave the server. */
export function safeCustomer(c: any) {
  return { id: c?.id || null, name: c?.name || null, email: c?.email || null, created: stripeDate(c?.created), livemode: !!c?.livemode, tenantId: c?.metadata?.tenant_id || null };
}

export const HANDLED_EVENTS = [
  "invoice.finalized", "invoice.paid", "invoice.payment_failed", "invoice.voided", "invoice.marked_uncollectible", "invoice.updated",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
];
