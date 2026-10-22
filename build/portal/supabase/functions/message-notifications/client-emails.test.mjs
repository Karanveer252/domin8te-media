// The client emails without network or database (2026-10-21): rendering and routing rules.
// Run: node --test build/portal/supabase/functions/message-notifications/
import test from "node:test";
import assert from "node:assert/strict";

const { renderClientEmail, recipients, goLink, settingsUrl, questionPart, weeklyHeadline, updateSubject, siteOrigin } = await import("./client-render.ts");
const { runNotifications } = await import("./run.ts");

const T = "5c047f41-9a29-4769-9673-b4865eeec8c3";
const base = (over) => ({ id: "ce1", tenant_id: T, audience: "client", route: "client", to_emails: ["ana@samplecafe.example"], attempts: 0, items: [],
  payload: { restaurant: "Sample Cafe", first_name: "Ana Lee", checkin: null, expect_to: null, message: null, week: null }, ...over });
const MSG = base({ kind: "message", items: [{ kind: "message", id: "m1" }],
  payload: { ...base({}).payload, message: { id: "8d1f0a8e-0000-4000-8000-000000000001", body: "The new menu photos are up.\nHave a look when you can.", by_name: "Karan Singh", at: "2026-10-21T15:00:00Z", is_question: false } } });
const Q = base({ kind: "question", payload: { ...MSG.payload, message: { ...MSG.payload.message, body: "Do you want the brunch photo or the dinner photo first on the new autumn menu page?", is_question: true } } });
const REM = base({ kind: "reminder", payload: Q.payload });
const APPROVAL = { kind: "approval", id: "apv_posts", title: "Next week's social posts", text: "Three posts for Mon, Wed and Fri.", previewType: "posts", count: 3,
  preview: [{ day: "Mon", text: "Autumn is on the menu.", image: "https://cdn.example.test/risotto.jpg" }, { day: "Wed", text: "Sunday roast is back." }, { day: "Fri", text: "Weekend brunch." }] };
const PAGE = { kind: "update", id: "upd_1", title: "Your autumn menu page is live", text: "Published the autumn menu page." };
const WORK = { kind: "work", id: "website", title: "Your website work is now done" };
const UPD1 = base({ kind: "update", items: [PAGE] });
const UPDA = base({ kind: "update", items: [APPROVAL] });
const BUNDLE = base({ kind: "update", items: [PAGE, APPROVAL, WORK] });
const WEEK = base({ kind: "weekly", payload: { ...base({}).payload, checkin: "2026-11-03",
  week: { id: "w1", week_start: "2026-10-12", week_end: "2026-10-18", numbers: [{ id: "calls", now: 18, before: 14 }, { id: "bookings", now: 12, before: 9 }] } } });
const ALERT = base({ kind: "alert", audience: "admin", route: "admin", to_emails: ["admin@domin8temedia.example"],
  items: [{ kind: "daily_panel_failed", restaurant: "Sample Cafe", day: "2026-10-21", error: "forced test failure" }],
  payload: { ...base({}).payload, expect_to: "admin@domin8temedia.example" } });
const ALL_CLIENT = [MSG, Q, REM, UPD1, UPDA, BUNDLE, WEEK];
const ALL = [...ALL_CLIENT, ALERT];

test("deep links: https://domin8temedia.com/dashboard/#/go/<kind>/<id>, never a token", () => {
  assert.equal(goLink("approval", "apv_posts"), "https://domin8temedia.com/dashboard/#/go/approval/apv_posts");
  assert.equal(goLink("work", "website"), "https://domin8temedia.com/dashboard/#/go/work/website");
  assert.equal(goLink("nope", "x"), "https://domin8temedia.com/dashboard/#/go/home/x");
  assert.equal(goLink("approval", "a b/c"), "https://domin8temedia.com/dashboard/#/go/approval/a%20b%2Fc");
  for (const r of ALL_CLIENT) {
    const m = renderClientEmail(r);
    const links = [...m.html.matchAll(/href="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, "&"));
    assert.ok(links.length >= 2, "a button and the settings link");
    for (const l of links) {
      assert.match(l, /^https:\/\/domin8temedia\.com\/dashboard\/#\/(go\/(approval|message|update|work|results|billing|home)\/[^?&]*|settings)$/, l);
      assert.ok(!/token|password|code=|key=|secret/i.test(l), "no login token in a link");
    }
  }
  assert.equal(siteOrigin((k) => ({ PORTAL_SITE_ORIGIN: "javascript:alert(1)" })[k]), "https://domin8temedia.com");
  assert.equal(siteOrigin((k) => ({ PORTAL_SITE_ORIGIN: "https://staging.domin8temedia.com" })[k]), "https://staging.domin8temedia.com");
});

test("message: subject names the sender, first lines, one Reply button to that message", () => {
  const m = renderClientEmail(MSG);
  assert.equal(m.subject, "Karan sent you a message");
  assert.match(m.html, /The new menu photos are up\./);
  assert.match(m.html, />Reply in your dashboard</);
  assert.ok(m.html.includes(`href="${goLink("message", MSG.payload.message.id)}"`));
  assert.match(m.text, /Reply in your dashboard: https:\/\/domin8temedia\.com\/dashboard\/#\/go\/message\/8d1f0a8e/);
  assert.equal((m.html.match(/border-radius:999px/g) || []).length, 1, "one button");
});

test("question: subject starts \"Karan has a question:\" plus the first part of the question", () => {
  const m = renderClientEmail(Q);
  assert.ok(m.subject.startsWith("Karan has a question: Do you want the brunch photo"), m.subject);
  assert.ok(m.subject.length <= 90);
  assert.ok(m.subject.endsWith("..."));
  assert.equal(questionPart("Short one?"), "Short one?");
  assert.match(m.html, />Reply in your dashboard</);
});

test("reminder: Still waiting on your answer, quoting the question, Reply button", () => {
  const m = renderClientEmail(REM);
  assert.equal(m.subject, "Still waiting on your answer");
  assert.match(m.text, /still waiting on your answer/);
  assert.match(m.html, /brunch photo or the dinner photo/);
  assert.ok(m.html.includes(goLink("message", Q.payload.message.id)));
});

test("one update: the subject names the thing, one or two sentences, Open your dashboard to that item", () => {
  const m = renderClientEmail(UPD1);
  assert.equal(m.subject, "Your autumn menu page is live");
  assert.match(m.html, /Published the autumn menu page\./);
  assert.match(m.html, />Open your dashboard</);
  assert.ok(m.html.includes(`href="${goLink("update", "upd_1")}"`));
});

test("approval: N posts are ready for your OK, the post texts, the https image only, Approve in your dashboard", () => {
  const m = renderClientEmail(UPDA);
  assert.equal(m.subject, "3 posts are ready for your OK");
  assert.match(m.html, /Autumn is on the menu\./);
  assert.match(m.html, /Sunday roast is back\./);
  assert.equal((m.html.match(/<img /g) || []).length, 1, "only the https image");
  assert.ok(m.html.includes('src="https://cdn.example.test/risotto.jpg"'));
  assert.match(m.html, />Approve in your dashboard</);
  assert.ok(m.html.includes(`href="${goLink("approval", "apv_posts")}"`));
  const textOnly = renderClientEmail(base({ kind: "update", items: [{ ...APPROVAL, preview: [{ text: "Hours", image: "Your photo: brunch" }] }] }));
  assert.ok(!textOnly.html.includes("<img"), "no image URL: text only");
  assert.equal(updateSubject({ kind: "approval", title: "Autumn opening hours" }), "Autumn opening hours is ready for your OK");
});

test("bundling: several updates are one email listing each, with its own link", () => {
  const m = renderClientEmail(BUNDLE);
  assert.equal(m.subject, "3 updates for Sample Cafe");
  for (const it of [PAGE, APPROVAL, WORK]) assert.ok(m.html.includes(goLink(it.kind, it.id)), it.kind);
  assert.match(m.html, /3 posts are ready for your OK/);
  assert.match(m.text, /Your autumn menu page is live: https:\/\/domin8temedia\.com\/dashboard\/#\/go\/update\/upd_1/);
});

test("Monday email: the customers number first (never a percentage), the next check-in, See this week; 5 lines or fewer", () => {
  const m = renderClientEmail(WEEK);
  assert.equal(m.subject, "Your weekly update is ready");
  assert.match(m.html, /Last week: 12 bookings\./, "bookings beat calls");
  assert.match(m.html, /next check-in with Karan: Tue 3 Nov\./);
  assert.match(m.html, />See this week</);
  assert.ok(!/%/.test(m.subject + m.html.replace(/width="100%"|max-width:100%/g, "") + m.text), "no percentage");
  const body = m.text.split("\n\n").slice(2).join("\n").split(/\nSee this week:/)[0].split("\n").filter((l) => l.trim());
  assert.ok(body.length <= 5, `body is ${body.length} lines`);
  assert.equal(weeklyHeadline([{ id: "visits", now: 900 }]), "Last week: 900 website visits.");
  assert.equal(weeklyHeadline([]), null);
});

test("every client email: plain text, the restaurant's name, a footer link to manage email settings", () => {
  for (const r of ALL_CLIENT) {
    const m = renderClientEmail(r);
    assert.ok(m.text.length > 40, `${r.kind} has a text part`);
    assert.ok(!/<[a-z]/i.test(m.text), `${r.kind} text is plain`);
    assert.match(m.html, /Sample Cafe/); assert.match(m.text, /Sample Cafe/);
    assert.ok(m.html.includes(`href="${settingsUrl()}"`), `${r.kind} footer link`);
    assert.ok(m.text.includes(`Manage email settings: ${settingsUrl()}`), `${r.kind} text footer`);
  }
});

test("copy rules: no long dashes, no prices, no SMS, Domin8te with the 8", () => {
  for (const r of [...ALL, base({ kind: "message", payload: { ...MSG.payload, message: { id: "x", body: "A dash \u2014 here and \u2013 there", by_name: "Karan" } } })]) {
    const m = renderClientEmail(r);
    for (const part of [m.subject, m.preview, m.html, m.text]) {
      assert.ok(!/[\u2013\u2014]/.test(part), `no long dash in ${r.kind}`);
      assert.ok(!/\$\s?\d|setup fee|per month|\/mo\b/i.test(part), `no price in ${r.kind}`);
      assert.ok(!/\bSMS\b|text message/i.test(part), `no SMS in ${r.kind}`);
      assert.ok(!/Dominate|Domin8 /i.test(part), "Domin8te always with the 8");
    }
  }
});

test("HTML from a message, a title or the restaurant is escaped", () => {
  const evil = base({ kind: "update", items: [{ kind: "update", id: "u", title: "<script>x</script>", text: "<img src=x onerror=1>" }],
    payload: { ...base({}).payload, restaurant: "<b>Cafe</b>" } });
  const m = renderClientEmail(evil);
  for (const bad of ["<script>x", "<img src=x", "<b>Cafe"]) assert.ok(!m.html.includes(bad), bad);
});

test("routing: the demo never sends, a test restaurant only to the test inbox, alerts only to the admin address", () => {
  assert.deepEqual(recipients(MSG), { to: ["ana@samplecafe.example"] });
  assert.ok("refuse" in recipients({ ...MSG, route: "demo" }), "demo refused");
  assert.ok("refuse" in recipients({ ...MSG, route: "test", payload: { ...MSG.payload, expect_to: "inbox@karan.example" } }), "test row with the client's address refused");
  assert.deepEqual(recipients({ ...MSG, route: "test", to_emails: ["inbox@karan.example"], payload: { ...MSG.payload, expect_to: "inbox@karan.example" } }), { to: ["inbox@karan.example"] });
  assert.ok("refuse" in recipients({ ...MSG, route: "test", to_emails: ["inbox@karan.example"] }), "no inbox setting: refused");
  assert.deepEqual(recipients(ALERT), { to: ["admin@domin8temedia.example"] });
  assert.ok("refuse" in recipients({ ...ALERT, to_emails: ["ana@samplecafe.example"] }), "alert to a client refused");
  assert.ok("refuse" in recipients({ ...ALERT, to_emails: ["admin@domin8temedia.example", "ana@samplecafe.example"] }), "alert with a second address refused");
  assert.ok("refuse" in recipients({ ...MSG, audience: "admin", route: "admin" }), "client mail to admin route refused");
  const a = renderClientEmail(ALERT);
  assert.equal(a.subject, "Today panel failed for Sample Cafe");
  assert.match(a.text, /forced test failure/);
  assert.match(a.text, /admin address only/);
});

function fakeDb({ team = [], client = [] } = {}) {
  const calls = [], finished = [];
  return { calls, finished, rpc: async (fn, args) => {
    calls.push(fn);
    if (fn === "take_job_lease") return { data: true, error: null };
    if (fn === "peek_message_notifications" || fn === "claim_message_notifications") return { data: team, error: null };
    if (fn === "peek_client_emails" || fn === "claim_client_emails") return { data: client, error: null };
    if (fn === "finish_client_email") { finished.push(args); return { data: args.p_ok ? "sent" : "retry", error: null }; }
    return { data: null, error: null };
  } };
}
const ENV = { RESEND_API_KEY: "re_TESTKEY_abcdefghijklmnop", NOTIFY_FROM: "Domin8te <notifications@domin8temedia.com>" };

test("sending: messages and questions go out the minute they are due, each on its own, to the right address only", async () => {
  const demo = { ...MSG, id: "demo1", route: "demo", to_emails: ["dani@bayleaf.example"] };
  const db = fakeDb({ client: [MSG, Q, ALERT, demo] }); const sent = [];
  const out = await runNotifications({ db, env: (k) => ENV[k], log: () => {},
    fetch: async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ id: "re_" + sent.length }) }; } });
  assert.equal(out.clientSent, 3);
  assert.equal(out.clientFailed, 1, "the demo row is refused, never sent");
  assert.deepEqual(sent.map((b) => b.to), [["ana@samplecafe.example"], ["ana@samplecafe.example"], ["admin@domin8temedia.example"]]);
  assert.ok(!sent.some((b) => b.to.includes("dani@bayleaf.example")), "demo never sends");
  assert.ok(sent.every((b) => b.text && b.html), "plain text with every email");
  assert.equal(db.finished.find((f) => f.p_id === "demo1").p_ok, false);
});

test("dry run with show: renders client emails, sends and claims nothing; without show no text at all", async () => {
  const db = fakeDb({ client: [MSG, BUNDLE] }); let fetched = 0;
  const out = await runNotifications({ db, env: (k) => ({ ...ENV, MESSAGE_NOTIFY_DRY_RUN: "1" })[k], fetch: async () => { fetched++; return {}; }, log: () => {} }, { show: true });
  assert.equal(out.clientWouldSend, 2);
  assert.equal(out.clientEmails.length, 2);
  assert.equal(out.clientEmails[1].subject, "3 updates for Sample Cafe");
  assert.deepEqual(out.clientEmails[0].to, ["a***@samplecafe.example"]);
  assert.equal(fetched, 0);
  assert.ok(!db.calls.includes("claim_client_emails"));
  const quiet = await runNotifications({ db: fakeDb({ client: [MSG] }), env: (k) => ({ MESSAGE_NOTIFY_DRY_RUN: "1" })[k], fetch: async () => ({}), log: () => {} });
  assert.equal(quiet.clientEmails, undefined);
  assert.ok(!/menu photos|samplecafe/.test(JSON.stringify(quiet)), "no message or address in a plain dry run");
});
