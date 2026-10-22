// The reminder job without network or database (T15): dry run renders and sends nothing; three failures end in
// failed (the database opens reminder_failed); no key, secret or full address ever reaches a log line.
// Run: node --test build/portal/supabase/functions/billing-reminders/
import test from "node:test";
import assert from "node:assert/strict";

const { runReminders, mask } = await import("./run.ts");
const { renderReminder, day } = await import("./render.ts");

const ROW = { id: "r1", tenant_id: "t1", kind: "d7", to_email: "sam@samplecafe.example", attempts: 0, restaurant: "Sample Cafe", first_name: "Sam Lee",
  tz: "America/Winnipeg", bill_date: "2026-11-22", change_by: "2026-11-21", plan_now: "starter", plan_now_name: "Starter",
  picks_now: ["social", "advertising"], plan_next: "starter", plan_next_name: "Starter", picks_next: ["advertising", "social"],
  next_source: "auto_carry", website_option_next: null, price_next_minor: 99900, currency: "USD" };
const KEY = "re_TESTKEY_abcdefghijklmnop";

function fakeDb(due, finishes = []) {
  const calls = [];
  return { calls, rpc: async (fn, args) => {
    calls.push(fn);
    if (fn === "take_job_lease") return { data: true, error: null };
    if (fn === "plan_billing_reminders") return { data: { planned: 1, carried: 0 }, error: null };
    if (fn === "peek_billing_reminders" || fn === "claim_billing_reminders") return { data: due, error: null };
    if (fn === "finish_billing_reminder") return { data: finishes.shift() || (args.p_ok ? "sent" : "retry"), error: null };
    return { data: null, error: null };
  } };
}

test("dry run by default: counts and ids only, no rendered email in the answer", async () => {
  const db = fakeDb([ROW]); let fetched = 0;
  const out = await runReminders({ db, env: (k) => ({ REMINDERS_DRY_RUN: "1", RESEND_API_KEY: KEY, REMINDERS_FROM: "Karan <billing@domin8temedia.com>" })[k],
    fetch: async () => { fetched++; return { ok: true, status: 200, json: async () => ({ id: "x" }) }; }, log: () => {} });
  assert.equal(out.dryRun, true);
  assert.equal(out.wouldSend, 1);
  assert.deepEqual(out.due, [{ id: ROW.id, kind: "d7" }]);
  assert.equal(out.emails, undefined, "no emails unless asked with show");
  const flat = JSON.stringify(out);
  assert.ok(!/samplecafe|<html|<!doctype|renews/i.test(flat), "no address, subject or body in the answer");
  assert.equal(fetched, 0);
  assert.ok(!db.calls.includes("claim_billing_reminders"));
});

test("dry run with show (the secret holder asked): plans, renders the due 7 day email, sends and claims nothing", async () => {
  const db = fakeDb([ROW]); let fetched = 0; const logs = [];
  const out = await runReminders({ db, env: (k) => ({ REMINDERS_DRY_RUN: "1", RESEND_API_KEY: KEY, REMINDERS_FROM: "Karan <billing@domin8temedia.com>" })[k],
    fetch: async () => { fetched++; return { ok: true, status: 200, json: async () => ({ id: "x" }) }; }, log: (l) => logs.push(l) }, { show: true });
  assert.equal(out.dryRun, true);
  assert.equal(out.emails.length, 1);
  assert.equal(out.emails[0].kind, "d7");
  assert.equal(out.emails[0].to, "s***@samplecafe.example");
  assert.match(out.emails[0].subject, /Starter plan renews Sun 22 Nov: no action needed/);
  assert.match(out.emails[0].html, /Change by Sat 21 Nov, 11:59 PM Central/);
  assert.match(out.emails[0].html, /\$999 on Sun 22 Nov/);
  assert.match(out.emails[0].html, /dashboard\/#\/billing/);
  assert.equal(fetched, 0, "Resend is never called");
  assert.ok(!db.calls.includes("claim_billing_reminders"), "nothing is claimed");
  assert.ok(db.calls.includes("release_job_lease"));
});

test("three failures: each is reported, the last ends failed; logs hold no key and no full address", async () => {
  const logs = []; const env = (k) => ({ RESEND_API_KEY: KEY, REMINDERS_FROM: "Karan <billing@domin8temedia.com>" })[k];
  const fail = async () => ({ ok: false, status: 500, json: async () => ({ name: "internal_server_error" }) });
  const finishes = ["retry", "retry", "failed"];
  let seen = [];
  for (let i = 0; i < 3; i++) {
    const db = fakeDb([{ ...ROW, attempts: i }], finishes);
    const out = await runReminders({ db, env, fetch: fail, log: (l) => logs.push(l) });
    assert.equal(out.failed, 1); assert.equal(out.sent, 0);
    seen.push(db.calls.filter((c) => c === "finish_billing_reminder").length);
  }
  assert.deepEqual(seen, [1, 1, 1]);
  assert.ok(logs.some((l) => /; failed$/.test(l)), "the third run is recorded as failed");
  const all = logs.join("\n");
  assert.ok(!all.includes(KEY), "no API key in logs");
  assert.ok(!all.includes("sam@samplecafe.example"), "no full address in logs");
  assert.ok(all.includes("s***@samplecafe.example"));
});

test("sending is off without a key or a sender: rows are still planned", async () => {
  const db = fakeDb([ROW]);
  const out = await runReminders({ db, env: () => undefined, fetch: async () => { throw new Error("must not send"); }, log: () => {} });
  assert.equal(out.skipped, "not-configured");
  assert.ok(db.calls.includes("plan_billing_reminders"));
  assert.ok(!db.calls.includes("claim_billing_reminders"));
});

test("busy: a second run at the same time does nothing", async () => {
  const db = { rpc: async (fn) => (fn === "take_job_lease" ? { data: false, error: null } : assert.fail(`called ${fn}`)) };
  assert.equal((await runReminders({ db, env: () => undefined, fetch: async () => ({}), log: () => {} })).skipped, "busy");
});

test("emails: no em dashes, no results claims, the right words per kind", () => {
  const kinds = [
    renderReminder(ROW),
    renderReminder({ ...ROW, kind: "d3" }),
    renderReminder({ ...ROW, kind: "d3", next_source: "client_picker", plan_next: "growth", plan_next_name: "Growth", picks_next: ["advertising", "website", "local"], price_next_minor: 199900 }),
    renderReminder({ ...ROW, kind: "picks_confirmed", next_source: "client_picker", plan_next: "growth", plan_next_name: "Growth", picks_next: ["advertising", "social", "email"], price_next_minor: 199900 }),
    renderReminder({ ...ROW, plan_next: "starter", picks_next: ["advertising", "website"], website_option_next: "page", next_source: "client_picker", kind: "d7" }),
  ];
  for (const m of kinds) {
    for (const part of [m.subject, m.preview, m.html, m.text]) {
      assert.ok(!part.includes("\u2014"), "no em dash");
      assert.ok(!/(more bookings|% more|grow your|guarantee)/i.test(part), "no results claims");
    }
  }
  assert.equal(kinds[1].subject, "3 days left to change your services");
  assert.match(kinds[1].html, /Last day to change: Sat 21 Nov, 11:59 PM Central/);
  assert.match(kinds[1].html, /Do nothing and you keep Ads and Social media/);
  assert.match(kinds[2].html, /Next month is Growth with Ads, Website, SEO and Google Maps/);
  assert.match(kinds[3].subject, /^Confirmed: Growth with Ads, Social media and Email from Sun 22 Nov$/);
  assert.match(kinds[4].html, /1 new page a month/);
  assert.equal(day("2026-11-01"), "Sun 1 Nov", "a calendar date never shifts a day");
  assert.equal(mask("x"), "no address");
});

test("names from the database are escaped", () => {
  const m = renderReminder({ ...ROW, restaurant: "<script>alert(1)</script>", first_name: "<b>Sam" });
  assert.ok(!m.html.includes("<script>alert"));
  assert.ok(!m.html.includes("<b>Sam"));
});

test("the sign-off says 'just reply' only when a reply address is set", () => {
  for (const kind of ["d7", "d3", "picks_confirmed"]) {
    const plain = renderReminder({ ...ROW, kind });
    assert.ok(!/reply/i.test(plain.text.split("Karan, Domin8te Media")[0].split("\n").slice(-3).join(" ")), `${kind}: no reply promise without an address`);
    assert.match(plain.text, /message in your dashboard/);
    const withReply = renderReminder({ ...ROW, kind }, true);
    assert.match(withReply.text, /[Rr]eply/);
    assert.ok(!/message in your dashboard/.test(withReply.text));
  }
});

test("without a reply address the email says not to reply, in the text and the html; with one it does not", () => {
  for (const kind of ["d7", "d3", "picks_confirmed"]) {
    const plain = renderReminder({ ...ROW, kind });
    assert.match(plain.text, /Please don't reply to this email/);
    assert.match(plain.html, /Please don(&#39;|')t reply to this email/);
    const withReply = renderReminder({ ...ROW, kind }, true);
    assert.ok(!/don(&#39;|')t reply/.test(withReply.text + withReply.html));
  }
});
