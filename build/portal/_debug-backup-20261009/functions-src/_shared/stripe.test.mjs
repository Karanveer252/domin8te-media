// Unit tests for _shared/stripe.ts. No network, no database: fetch and Deno.env are stubs.
// Run: node --test build/portal/supabase/functions/_shared/stripe.test.mjs  (Node 22.18+ strips the types)
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const ENV = {};
globalThis.Deno = { env: { get: (k) => ENV[k] } };
const setEnv = (o) => { for (const k of Object.keys(ENV)) delete ENV[k]; Object.assign(ENV, o); };

const S = await import("./stripe.ts");

let calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  return { ok: true, status: 200, text: async () => JSON.stringify({ id: "cus_ok" }) };
};

// ---------- signatures ----------
const SECRET = "whsec_test_secret";
const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
const sign = (payload, t, secret = SECRET) => createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
const NOW = 1_790_000_000;

test("signature: valid", async () => {
  const r = await S.verifyStripeSignature(body, `t=${NOW},v1=${sign(body, NOW)}`, SECRET, 300, NOW + 10);
  assert.deepEqual(r, { ok: true, timestamp: NOW });
});

test("signature: wrong secret", async () => {
  const r = await S.verifyStripeSignature(body, `t=${NOW},v1=${sign(body, NOW, "whsec_other")}`, SECRET, 300, NOW);
  assert.deepEqual(r, { ok: false, reason: "mismatch" });
});

test("signature: tampered body", async () => {
  const r = await S.verifyStripeSignature(body.replace("evt_1", "evt_2"), `t=${NOW},v1=${sign(body, NOW)}`, SECRET, 300, NOW);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "mismatch");
});

test("signature: too old, and too far in the future", async () => {
  const old = NOW - 301;
  assert.deepEqual(await S.verifyStripeSignature(body, `t=${old},v1=${sign(body, old)}`, SECRET, 300, NOW), { ok: false, reason: "too-old" });
  const ahead = NOW + 301;
  assert.deepEqual(await S.verifyStripeSignature(body, `t=${ahead},v1=${sign(body, ahead)}`, SECRET, 300, NOW), { ok: false, reason: "too-old" });
  assert.equal((await S.verifyStripeSignature(body, `t=${NOW - 300},v1=${sign(body, NOW - 300)}`, SECRET, 300, NOW)).ok, true);
});

test("signature: multiple v1 (secret rotation), any one valid is enough", async () => {
  const header = `t=${NOW},v1=${sign(body, NOW, "whsec_old")},v1=${sign(body, NOW)},v0=${"0".repeat(64)}`;
  assert.equal((await S.verifyStripeSignature(body, header, SECRET, 300, NOW)).ok, true);
  const none = `t=${NOW},v1=${sign(body, NOW, "a")},v1=${sign(body, NOW, "b")}`;
  assert.equal((await S.verifyStripeSignature(body, none, SECRET, 300, NOW)).ok, false);
});

test("signature: missing or malformed", async () => {
  assert.deepEqual(await S.verifyStripeSignature(body, null, SECRET), { ok: false, reason: "missing" });
  assert.deepEqual(await S.verifyStripeSignature(body, "t=1", undefined), { ok: false, reason: "missing" });
  assert.deepEqual(await S.verifyStripeSignature(body, `t=${NOW}`, SECRET, 300, NOW), { ok: false, reason: "malformed" });
  assert.deepEqual(await S.verifyStripeSignature(body, `v1=${sign(body, NOW)}`, SECRET, 300, NOW), { ok: false, reason: "malformed" });
  assert.deepEqual(await S.verifyStripeSignature(body, `t=${NOW},v0=${sign(body, NOW)}`, SECRET, 300, NOW), { ok: false, reason: "malformed" });
});

// ---------- keys and live refusal ----------
test("stripeMode: test keys, live keys, unknown, missing", () => {
  setEnv({});
  assert.deepEqual(S.stripeMode(""), { configured: false, mode: null, refused: false, liveAllowed: false });
  assert.equal(S.stripeMode("sk_test_abc").mode, "test");
  assert.equal(S.stripeMode("rk_test_abc").refused, false);
  assert.deepEqual(S.stripeMode("sk_live_abc"), { configured: true, mode: "live", refused: true, liveAllowed: false });
  assert.equal(S.stripeMode("rk_live_abc").refused, true);
  assert.equal(S.stripeMode("pk_test_abc").refused, true);  // a publishable key is never a server key
  setEnv({ STRIPE_ALLOW_LIVE: "true" });
  assert.equal(S.stripeMode("sk_live_abc").refused, false);
  setEnv({ STRIPE_ALLOW_LIVE: "yes" });
  assert.equal(S.stripeMode("sk_live_abc").refused, true);  // only the exact word "true"
});

test("stripe(): refuses a live key before any network call; test key goes out with version and form body", async () => {
  setEnv({ STRIPE_SECRET_KEY: "sk_live_x" });
  calls = [];
  const r = await S.stripe("POST", "/customers", { name: "A" });
  assert.equal(r.ok, false);
  assert.equal(r.data.error.code, "live-key-refused");
  assert.equal(calls.length, 0);

  setEnv({});
  assert.equal((await S.stripe("GET", "/customers")).data.error.code, "not-configured");
  assert.equal(calls.length, 0);

  setEnv({ STRIPE_SECRET_KEY: "sk_test_x" });
  const ok = await S.stripe("POST", "/customers", { name: "Bayleaf & Co", metadata: { tenant_id: "t1" } }, { idempotencyKey: "k1" });
  assert.equal(ok.ok, true);
  const c = calls[0];
  assert.equal(c.url, "https://api.stripe.com/v1/customers");
  assert.equal(c.init.headers["Stripe-Version"], S.STRIPE_VERSION);
  assert.equal(c.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(c.init.headers["Idempotency-Key"], "k1");
  assert.equal(c.init.body, "name=Bayleaf%20%26%20Co&metadata%5Btenant_id%5D=t1");
  await S.stripe("GET", "/subscriptions/sub_1", { expand: ["latest_invoice"] });
  assert.equal(calls[1].url, "https://api.stripe.com/v1/subscriptions/sub_1?expand%5B%5D=latest_invoice");
  assert.equal(calls[1].init.body, undefined);
  setEnv({});
});

// ---------- status mapping ----------
test("subscriptionStatus: Stripe -> console SUB_STATUS keys", () => {
  const m = { active: "active", trialing: "trialing", past_due: "past_due", paused: "paused", canceled: "canceled", unpaid: "past_due", incomplete: "past_due", incomplete_expired: "canceled" };
  for (const [k, v] of Object.entries(m)) assert.equal(S.subscriptionStatus(k), v, k);
  assert.equal(S.subscriptionStatus("weird"), null);
});

test("invoiceStatus: open, paid, overdue, failed, void; drafts are null", () => {
  const now = NOW;
  assert.equal(S.invoiceStatus({ status: "draft" }, "invoice.updated", now), null);
  assert.equal(S.invoiceStatus({ status: "open", attempt_count: 0 }, "invoice.finalized", now), "open");
  assert.equal(S.invoiceStatus({ status: "open", attempt_count: 0, due_date: now + 86400 }, "invoice.updated", now), "open");
  assert.equal(S.invoiceStatus({ status: "open", attempt_count: 0, due_date: now - 1 }, "invoice.updated", now), "overdue");
  assert.equal(S.invoiceStatus({ status: "open", attempt_count: 1 }, "invoice.payment_failed", now), "failed");
  assert.equal(S.invoiceStatus({ status: "open", attempt_count: 0 }, "invoice.payment_failed", now), "failed");
  assert.equal(S.invoiceStatus({ status: "paid" }, "invoice.paid", now), "paid");
  assert.equal(S.invoiceStatus({ status: "void" }, "invoice.voided", now), "void");
  assert.equal(S.invoiceStatus({ status: "uncollectible" }, "invoice.marked_uncollectible", now), "failed");
});

// ---------- invoice item ----------
// 2026-10-05 15:00 UTC = 10:00 in Chicago; 2026-10-06 03:00 UTC = 2026-10-05 22:00 in Chicago.
const T_FINAL = Date.UTC(2026, 9, 5, 15) / 1000;
const T_LATE = Date.UTC(2026, 9, 6, 3) / 1000;
const invoice = (over = {}) => ({
  id: "in_123", object: "invoice", customer: "cus_1", number: "D8M-0001", status: "open", total: 49900, amount_due: 49900,
  currency: "usd", created: T_FINAL - 60, due_date: T_FINAL + 14 * 86400, attempt_count: 0,
  status_transitions: { finalized_at: T_FINAL, paid_at: null },
  hosted_invoice_url: "https://invoice.stripe.com/i/acct_1/test_abc", ...over,
});

test("invoiceItem: exactly the fields dashboard-manager reads", () => {
  const it = S.invoiceItem(invoice(), "invoice.finalized", T_FINAL, T_FINAL);
  assert.deepEqual(it, {
    kind: "billing", externalId: "in_123", sourceKind: "webhook", sourceRef: "stripe:in_123",
    sourceObservedAt: new Date(T_FINAL * 1000).toISOString(),
    content: { invoice: { number: "D8M-0001", amountMinor: 49900, currency: "USD", status: "open", issuedAt: "2026-10-05", dueAt: "2026-10-19", paidAt: null, hostedPaymentUrl: "https://invoice.stripe.com/i/acct_1/test_abc" } },
  });
  // dashboard-manager's rules: issuedAt/dueAt 10 chars, currency 3 upper-case letters, integer minor units.
  assert.match(it.content.invoice.issuedAt, /^\d{4}-\d{2}-\d{2}$/);
});

test("invoiceItem: dates are the Chicago day", () => {
  const it = S.invoiceItem(invoice({ status_transitions: { finalized_at: T_LATE } }), "invoice.finalized", T_LATE, T_LATE);
  assert.equal(it.content.invoice.issuedAt, "2026-10-05");
});

test("invoiceItem: paid carries paidAt; payment_failed is failed; due before issue is clamped", () => {
  const paid = S.invoiceItem(invoice({ status: "paid", status_transitions: { finalized_at: T_FINAL, paid_at: T_FINAL + 3600 } }), "invoice.paid", T_FINAL + 3600);
  assert.equal(paid.content.invoice.status, "paid");
  assert.equal(paid.content.invoice.paidAt, new Date((T_FINAL + 3600) * 1000).toISOString());
  const paidNoStamp = S.invoiceItem(invoice({ status: "paid", status_transitions: { finalized_at: T_FINAL } }), "invoice.paid", T_FINAL + 7);
  assert.equal(paidNoStamp.content.invoice.paidAt, new Date((T_FINAL + 7) * 1000).toISOString());
  const failed = S.invoiceItem(invoice({ attempt_count: 1 }), "invoice.payment_failed", T_FINAL, T_FINAL);
  assert.equal(failed.content.invoice.status, "failed");
  assert.equal(failed.content.invoice.paidAt, null);
  const clamped = S.invoiceItem(invoice({ due_date: T_FINAL - 5 * 86400 }), "invoice.finalized", T_FINAL, T_FINAL - 6 * 86400);
  assert.equal(clamped.content.invoice.dueAt, clamped.content.invoice.issuedAt);
  const auto = S.invoiceItem(invoice({ due_date: null }), "invoice.finalized", T_FINAL, T_FINAL);
  assert.equal(auto.content.invoice.dueAt, null);
});

test("invoiceItem: currency, amounts and links", () => {
  assert.equal(S.invoiceItem(invoice({ currency: "cad" }), "invoice.finalized", T_FINAL, T_FINAL).content.invoice.currency, "CAD");
  assert.equal(S.invoiceItem(invoice({ total: 0, amount_due: 0 }), "invoice.finalized", T_FINAL, T_FINAL).content.invoice.amountMinor, 0);
  assert.equal(S.invoiceItem(invoice({ total: -100 }), "invoice.finalized", T_FINAL, T_FINAL), null);
  assert.equal(S.invoiceItem(invoice({ hosted_invoice_url: "https://evil.example/x" }), "invoice.finalized", T_FINAL, T_FINAL).content.invoice.hostedPaymentUrl, null);
  assert.equal(S.invoiceItem(invoice({ hosted_invoice_url: null }), "invoice.finalized", T_FINAL, T_FINAL).content.invoice.hostedPaymentUrl, null);
});

test("invoiceItem: drafts and invoices without a number are skipped", () => {
  assert.equal(S.invoiceItem(invoice({ status: "draft", number: null }), "invoice.updated", T_FINAL), null);
  assert.equal(S.invoiceItem(invoice({ number: null }), "invoice.finalized", T_FINAL), null);
  assert.equal(S.invoiceItem({ id: "evil" }, "invoice.finalized", T_FINAL), null);
});

test("invoiceSubscriptionId: old and new invoice shapes", () => {
  assert.equal(S.invoiceSubscriptionId({ subscription: "sub_1" }), "sub_1");
  assert.equal(S.invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_2" } } }), "sub_2");
  assert.equal(S.invoiceSubscriptionId({ subscription: { id: "sub_3" } }), "sub_3");
  assert.equal(S.invoiceSubscriptionId({}), null);
});

// ---------- subscription facts ----------
const START = Date.UTC(2026, 8, 1, 17) / 1000;
const END = Date.UTC(2026, 10, 1, 17) / 1000;
const price = (amount, interval = "month", count = 1, currency = "usd") => ({ unit_amount: amount, currency, recurring: { interval, interval_count: count } });
const sub = (over = {}) => ({ id: "sub_1", status: "active", customer: "cus_1", start_date: START, created: START, items: { data: [{ price: price(49900), quantity: 1, current_period_end: END }] }, ...over });

test("formatPrice: readable amounts", () => {
  assert.equal(S.formatPrice(49900, "usd", "month"), "$499 a month");
  assert.equal(S.formatPrice(49950, "usd", "month"), "$499.50 a month");
  assert.equal(S.formatPrice(120000, "usd", "month", 3), "$1,200 every 3 months");
  assert.equal(S.formatPrice(500000, "usd", "year"), "$5,000 a year");
  assert.equal(S.formatPrice(9900, "cad", "week"), "CA$99 a week");
  assert.equal(S.formatPrice(9900, "usd"), "$99");
});

test("subscriptionFacts: active (basil shape: period end on the item)", () => {
  assert.deepEqual(S.subscriptionFacts(sub()), {
    status: "active", startedAt: "2026-09-01", nextBilling: "2026-11-01", amount: "$499 a month",
    graceUntil: null, retryOn: null, stripeSubscriptionId: "sub_1",
  });
});

test("subscriptionFacts: old shape, several items, quantities", () => {
  const f = S.subscriptionFacts(sub({ current_period_end: END, items: { data: [{ price: price(39900), quantity: 1 }, { price: price(5000), quantity: 2 }, { price: price(100000, "year") }] } }));
  assert.equal(f.nextBilling, "2026-11-01");
  assert.equal(f.amount, "$499 a month");  // the yearly add-on is a different interval, so not summed in
});

test("subscriptionFacts: past_due gets grace and retry from the next payment attempt", () => {
  const retry = Date.UTC(2026, 9, 12, 15) / 1000;
  const f = S.subscriptionFacts(sub({ status: "past_due", latest_invoice: { id: "in_9", next_payment_attempt: retry } }));
  assert.equal(f.status, "past_due");
  assert.equal(f.graceUntil, "2026-10-12");
  assert.equal(f.retryOn, "2026-10-12");
  assert.equal(S.subscriptionFacts(sub({ status: "past_due" }), retry + 86400).graceUntil, "2026-10-13");  // the failed invoice wins
  assert.equal(S.subscriptionFacts(sub({ status: "unpaid" })).graceUntil, null);
});

test("subscriptionFacts: canceled has no next billing; unknown status is null", () => {
  const f = S.subscriptionFacts(sub({ status: "canceled" }));
  assert.equal(f.status, "canceled");
  assert.equal(f.nextBilling, null);
  assert.equal(S.subscriptionFacts(sub({ status: "mystery" })), null);
});

test("withSubscriptionFacts / withCustomerId touch only their keys", () => {
  const doc = { business: { name: "Bayleaf" }, billing: { plan: { name: "Gold" }, stripeCustomerId: "cus_1", subscription: { status: "active", note: "keep me", amount: "$1" } } };
  const out = S.withSubscriptionFacts(doc, { status: "past_due", amount: "$499 a month" });
  assert.deepEqual(out, { business: { name: "Bayleaf" }, billing: { plan: { name: "Gold" }, stripeCustomerId: "cus_1", subscription: { status: "past_due", note: "keep me", amount: "$499 a month" } } });
  assert.equal(doc.billing.subscription.status, "active");  // not mutated
  assert.deepEqual(S.withCustomerId(doc, "cus_2").billing, { ...doc.billing, stripeCustomerId: "cus_2" });
  assert.equal("stripeCustomerId" in S.withCustomerId(doc, null).billing, false);
  assert.deepEqual(S.withCustomerId(null, "cus_3"), { billing: { stripeCustomerId: "cus_3" } });
});

test("safeCustomer keeps only safe fields", () => {
  const c = S.safeCustomer({ id: "cus_1", name: "A", email: "a@b.co", created: START, livemode: false, metadata: { tenant_id: "t1", other: "x" }, invoice_settings: {}, address: { line1: "secret" } });
  assert.deepEqual(c, { id: "cus_1", name: "A", email: "a@b.co", created: "2026-09-01", livemode: false, tenantId: "t1" });
});

test("handled events list", () => {
  assert.equal(S.HANDLED_EVENTS.length, 9);
  assert.ok(S.HANDLED_EVENTS.includes("invoice.marked_uncollectible"));
  assert.ok(!S.HANDLED_EVENTS.includes("charge.succeeded"));
});
