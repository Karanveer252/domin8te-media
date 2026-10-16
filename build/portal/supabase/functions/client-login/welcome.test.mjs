// Run: node --test build/portal/supabase/functions/client-login/
import test from "node:test";
import assert from "node:assert/strict";
const { renderWelcome, sendWelcome, DASHBOARD } = await import("./welcome.ts");
const O = { restaurant: "TEST Jon's <Kitchen>", firstName: "Jon Test", email: "karanveersingh2425@gmail.com", key: "org_x:user_y" };

test("render: first name, link, sign-in steps, HTML escaped, no long dashes", () => {
  const m = renderWelcome(O);
  assert.match(m.subject, /dashboard for TEST Jon's <Kitchen> is ready/);
  assert.match(m.html, /Hi Jon,/);
  assert.match(m.html, /&lt;Kitchen&gt;/);
  assert.doesNotMatch(m.html, /<Kitchen>/);
  assert.ok(m.html.includes(DASHBOARD) && m.text.includes(DASHBOARD));
  assert.match(m.text, /6-digit code/);
  assert.doesNotMatch(m.html + m.text, /[\u2013\u2014]/);
});
test("send: no key or sender means nothing is sent", async () => {
  let called = false;
  const r = await sendWelcome(() => undefined, async () => { called = true; return new Response("{}"); }, O);
  assert.deepEqual(r, { sent: false, reason: "not-configured" });
  assert.equal(called, false);
});
test("send: posts to Resend once, with an idempotency key", async () => {
  const env = { RESEND_API_KEY: "re_TESTKEY_x", NOTIFY_FROM: "Domin8te <notifications@domin8temedia.com>" };
  let seen;
  const r = await sendWelcome((k) => env[k], async (u, i) => { seen = { u, i }; return new Response(JSON.stringify({ id: "em_1" }), { status: 200 }); }, O);
  assert.deepEqual(r, { sent: true });
  assert.equal(seen.u, "https://api.resend.com/emails");
  assert.equal(seen.i.headers["Idempotency-Key"], "welcome:org_x:user_y");
  assert.deepEqual(JSON.parse(seen.i.body).to, [O.email]);
});
test("send: a refusal or a network error never throws", async () => {
  const env = { RESEND_API_KEY: "k", NOTIFY_FROM: "f" };
  assert.deepEqual(await sendWelcome((k) => env[k], async () => new Response("{}", { status: 422 }), O), { sent: false, reason: "resend 422" });
  assert.deepEqual(await sendWelcome((k) => env[k], async () => { throw new Error("down"); }, O), { sent: false, reason: "network" });
});
