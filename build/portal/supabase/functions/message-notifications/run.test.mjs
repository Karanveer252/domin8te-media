// The message-email job without network or database: renders both kinds, escapes HTML, the dry run sends and claims nothing,
// three failures end in failed (the database opens notification_failed), and no key, secret, message or full address reaches a log line.
// Run: node --test build/portal/supabase/functions/message-notifications/
import test from "node:test";
import assert from "node:assert/strict";

const { runNotifications, mask } = await import("./run.ts");
const { renderNotification, trim, consoleUrl, DASHBOARD_URL } = await import("./render.ts");

const TEAM = { id: "n1", tenant_id: "5c047f41-9a29-4769-9673-b4865eeec8c3", direction: "to_team", to_email: "team@domin8temedia.example", attempts: 0,
  restaurant: "Sample Cafe", first_name: "Sam Lee", message_count: 1,
  messages: [{ body: "Can we change the brunch menu photo?", by_name: "Sam", at: "2026-10-14T15:00:00Z", about: "general" }] };
const CLIENT = { id: "n2", tenant_id: TEAM.tenant_id, direction: "to_client", to_email: "sam@samplecafe.example", attempts: 0,
  restaurant: "Sample Cafe", first_name: "Sam Lee", message_count: 1,
  messages: [{ body: "Yes, send the photo and I will swap it today.", by_name: "Karan", at: "2026-10-14T15:05:00Z", about: "general" }] };
// Made-up values for the stubs only: they are not real and open nothing.
const KEY = "re_TESTKEY_abcdefghijklmnop", SECRET = "mn_TESTSECRET_123456";
const ENV = { RESEND_API_KEY: KEY, NOTIFY_FROM: "Domin8te <notifications@domin8temedia.com>", MESSAGE_NOTIFY_CRON_SECRET: SECRET };

function fakeDb(due, finishes = []) {
  const calls = [];
  return { calls, rpc: async (fn, args) => {
    calls.push(fn);
    if (fn === "take_job_lease") return { data: true, error: null };
    if (fn === "peek_message_notifications" || fn === "claim_message_notifications") return { data: due, error: null };
    if (fn === "finish_message_notification") return { data: finishes.shift() || (args.p_ok ? "sent" : "retry"), error: null };
    return { data: null, error: null };
  } };
}

test("to the team: New message from <restaurant>, the text, who sent it, a button to the console Messages page", () => {
  const m = renderNotification(TEAM);
  assert.equal(m.subject, "New message from Sample Cafe");
  assert.match(m.html, /Can we change the brunch menu photo\?/);
  assert.match(m.html, /<strong>Sam<\/strong> wrote in their dashboard/);
  assert.ok(m.html.includes(`href="${consoleUrl(TEAM.tenant_id)}"`));
  assert.match(m.html, /console\/#\/messages\/5c047f41-9a29-4769-9673-b4865eeec8c3/);
  assert.match(m.html, /Open the conversation/);
  assert.match(m.text, /Open the conversation: https:\/\/domin8temedia\.com\/console\/#\/messages\//);
  assert.match(m.text, /Sam:\n {2}Can we change the brunch menu photo\?/);
});

test("to the client: Domin8te replied, the reply, who replied, a button to the dashboard Messages page", () => {
  const m = renderNotification(CLIENT);
  assert.equal(m.subject, "Domin8te replied");
  assert.match(m.html, /Yes, send the photo and I will swap it today\./);
  assert.match(m.html, /Hi Sam, <strong>Karan<\/strong> wrote back to you/);
  assert.ok(m.html.includes(`href="${DASHBOARD_URL}"`));
  assert.equal(DASHBOARD_URL, "https://domin8temedia.com/dashboard/#/messages");
  assert.match(m.html, /Read and reply/);
  assert.ok(!m.html.includes("/console/"), "the client email never links to the console");
  assert.match(m.text, /Read and reply: https:\/\/domin8temedia\.com\/dashboard\/#\/messages/);
});

test("a reply with no name says the team; a message with no name says someone at the restaurant", () => {
  assert.match(renderNotification({ ...CLIENT, messages: [{ ...CLIENT.messages[0], by_name: "" }] }).html, /<strong>the team<\/strong> wrote back/);
  assert.match(renderNotification({ ...TEAM, messages: [{ ...TEAM.messages[0], by_name: "  " }] }).html, /<strong>Someone at the restaurant<\/strong> wrote/);
});

test("HTML in a message, a name or the restaurant is escaped, in the html; the plain text keeps the words as written", () => {
  const evil = { ...TEAM, restaurant: "<b>Cafe</b>", first_name: "<i>Sam", messages: [{ body: "<script>alert(1)</script> & \"quotes\" <img src=x onerror=alert(2)>", by_name: "<u>Sam</u>", at: "x", about: "general" }] };
  const m = renderNotification(evil);
  for (const bad of ["<script>alert", "<img src=x", "<b>Cafe", "<u>Sam", "<i>Sam"]) assert.ok(!m.html.includes(bad), `not raw: ${bad}`);
  assert.match(m.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;quotes&quot;/);
  assert.ok(m.html.includes(`overflow:hidden">&lt;script`), "the hidden preview line is escaped too");
  assert.match(m.text, /<script>alert\(1\)<\/script> & "quotes"/);
  const c = renderNotification({ ...CLIENT, first_name: "<b>Sam" });
  assert.ok(!c.html.includes("<b>Sam"));
});

test("a long message is cut to 600 characters with three dots; a short one is left alone; emoji are not split", () => {
  const m = renderNotification({ ...TEAM, messages: [{ ...TEAM.messages[0], body: "a".repeat(1000) }] });
  assert.ok(m.html.includes("a".repeat(600) + "...") && !m.html.includes("a".repeat(601)));
  assert.equal(trim("  hello  "), "hello");
  assert.equal(trim("x".repeat(600)), "x".repeat(600));
  const cut = trim("\u{1F600}".repeat(700));
  assert.equal(Array.from(cut).length, 603);
  assert.ok(cut.endsWith("\u{1F600}..."), "no half character before the dots");
});

test("a burst: the newest five are shown and the rest are counted", () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ body: `message ${i + 1}`, by_name: "Sam", at: `2026-10-14T15:0${i}:00Z`, about: "general" }));
  const m = renderNotification({ ...TEAM, message_count: 7, messages: many.slice(2) });   // the database sends the newest five, oldest first
  assert.equal(m.subject, "New message from Sample Cafe");
  assert.match(m.html, /Sample Cafe sent 7 messages\./);
  assert.match(m.html, /2 earlier messages in this run/);
  assert.ok(m.html.includes("message 7") && m.html.includes("message 3") && !m.html.includes("message 2<"));
  const c = renderNotification({ ...CLIENT, message_count: 2, messages: [CLIENT.messages[0], { ...CLIENT.messages[0], body: "One more thing." }] });
  assert.match(c.html, /One more thing\./);
  assert.equal(c.subject, "Domin8te replied");
});

test("emails: no long dashes, no prices, no results claims", () => {
  for (const r of [TEAM, CLIENT, { ...TEAM, message_count: 6, messages: Array(5).fill(TEAM.messages[0]) }, { ...CLIENT, messages: [] }]) {
    const m = renderNotification(r);
    for (const part of [m.subject, m.preview, m.html, m.text]) {
      assert.ok(!part.includes(String.fromCharCode(0x2014)) && !part.includes(String.fromCharCode(0x2013)), "no long dash");
      assert.ok(!/\$\s?\d/.test(part), "no price");
      assert.ok(!/(more bookings|% more|grow your|guarantee)/i.test(part), "no results claims");
    }
  }
});

test("dry run: renders the due emails, sends and claims nothing, even with a key set", async () => {
  const db = fakeDb([TEAM, CLIENT]); let fetched = 0; const logs = [];
  const out = await runNotifications({ db, env: (k) => ({ ...ENV, MESSAGE_NOTIFY_DRY_RUN: "1" })[k],
    fetch: async () => { fetched++; return { ok: true, status: 200, json: async () => ({ id: "x" }) }; }, log: (l) => logs.push(l) });
  assert.equal(out.dryRun, true);
  assert.equal(out.emails.length, 2);
  assert.deepEqual(out.emails.map((e) => e.direction), ["to_team", "to_client"]);
  assert.equal(out.emails[0].to, "t***@domin8temedia.example");
  assert.equal(out.emails[1].to, "s***@samplecafe.example");
  assert.equal(out.emails[0].subject, "New message from Sample Cafe");
  assert.ok(out.emails[0].html.includes("<!doctype html>"));
  assert.equal(fetched, 0, "Resend is never called");
  assert.ok(!db.calls.includes("claim_message_notifications"), "nothing is claimed");
  assert.ok(!db.calls.includes("finish_message_notification"), "nothing is recorded");
  assert.ok(db.calls.includes("release_job_lease"));
  assert.ok(!logs.join("\n").includes("brunch"), "no message text in logs");
});

test("a good run: each due email goes to its own address through Resend, with the key and an idempotency key, and is recorded", async () => {
  const db = fakeDb([TEAM, CLIENT]); const sent = [];
  const out = await runNotifications({ db, env: (k) => ENV[k], log: () => {},
    fetch: async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200, json: async () => ({ id: "re_" + sent.length }) }; } });
  assert.deepEqual([out.sent, out.failed], [2, 0]);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].url, "https://api.resend.com/emails");
  assert.equal(sent[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(sent[0].init.headers["Idempotency-Key"], "n1:0");
  const body0 = JSON.parse(sent[0].init.body), body1 = JSON.parse(sent[1].init.body);
  assert.deepEqual(body0.to, ["team@domin8temedia.example"]);
  assert.deepEqual(body1.to, ["sam@samplecafe.example"]);
  assert.equal(body0.from, ENV.NOTIFY_FROM);
  assert.equal(body1.subject, "Domin8te replied");
  assert.equal(db.calls.filter((c) => c === "finish_message_notification").length, 2);
});

test("three failures: each is reported, the last ends failed; logs hold no key, secret, message or full address", async () => {
  const logs = [];
  const fail = async () => ({ ok: false, status: 500, json: async () => ({ name: "internal_server_error" }) });
  const finishes = ["retry", "retry", "failed"];
  const seen = [];
  for (let i = 0; i < 3; i++) {
    const db = fakeDb([{ ...TEAM, attempts: i }], finishes);
    const out = await runNotifications({ db, env: (k) => ENV[k], fetch: fail, log: (l) => logs.push(l) });
    assert.equal(out.failed, 1); assert.equal(out.sent, 0);
    seen.push(db.calls.filter((c) => c === "finish_message_notification").length);
  }
  assert.deepEqual(seen, [1, 1, 1]);
  assert.ok(logs.some((l) => /; failed$/.test(l)), "the third run is recorded as failed");
  const all = logs.join("\n");
  for (const secret of [KEY, SECRET, "brunch", "team@domin8temedia.example", "Authorization"]) assert.ok(!all.includes(secret), `not in logs: ${secret}`);
  assert.ok(all.includes("t***@domin8temedia.example"));
});

test("a network error is a failure with a short reason; the error text never carries the key", async () => {
  const logs = []; let recorded;
  const db = { rpc: async (fn, args) => {
    if (fn === "take_job_lease") return { data: true };
    if (fn === "claim_message_notifications") return { data: [CLIENT] };
    if (fn === "finish_message_notification") { recorded = args; return { data: "retry" }; }
    return { data: null };
  } };
  const out = await runNotifications({ db, env: (k) => ENV[k], log: (l) => logs.push(l), fetch: async () => { throw new Error("socket hang up"); } });
  assert.equal(out.failed, 1);
  assert.equal(recorded.p_ok, false);
  assert.match(recorded.p_error, /^network: socket hang up/);
  assert.ok(!JSON.stringify(recorded).includes(KEY));
  assert.ok(!logs.join("\n").includes(KEY));
});

test("sending is off without a key or a sender: nothing is claimed, nothing is sent", async () => {
  for (const env of [() => undefined, (k) => ({ RESEND_API_KEY: KEY })[k], (k) => ({ NOTIFY_FROM: "x" })[k]]) {
    const db = fakeDb([TEAM]);
    const out = await runNotifications({ db, env, fetch: async () => { throw new Error("must not send"); }, log: () => {} });
    assert.equal(out.skipped, "not-configured");
    assert.ok(!db.calls.includes("claim_message_notifications"));
  }
});

test("busy: a second run at the same time does nothing", async () => {
  const db = { rpc: async (fn) => (fn === "take_job_lease" ? { data: false, error: null } : assert.fail(`called ${fn}`)) };
  assert.equal((await runNotifications({ db, env: () => undefined, fetch: async () => ({}), log: () => {} })).skipped, "busy");
});

test("a claim that fails stops the run and still lets go of the lease", async () => {
  const calls = [];
  const db = { rpc: async (fn) => { calls.push(fn); return fn === "take_job_lease" ? { data: true, error: null } : fn === "claim_message_notifications" ? { data: null, error: { message: "boom" } } : { data: null, error: null }; } };
  await assert.rejects(runNotifications({ db, env: (k) => ENV[k], fetch: async () => ({}), log: () => {} }), /claim: boom/);
  assert.ok(calls.includes("release_job_lease"));
  assert.equal(mask("x"), "no address");
});
