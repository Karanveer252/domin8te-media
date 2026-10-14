// bot-drop without network or database (2026-10-14): who may drop a draft (allowlist, shared secret, the Hermes switch),
// what a body must hold, how the client is found (id or exact name, archived left out, a shared name refused) and what is
// stored. The Supabase client is a stub, loaded through a module hook, as in dashboard-event's test; Deno is a stand-in.
// Run (from portal/supabase): node --test functions/bot-drop/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The stub records every call in globalThis.__db and answers with what the test put there.
const STUB = `export function createClient(url, key) { const D = globalThis.__db; D.made.push({ url, key }); return {
  from: (table) => {
    if (table === "tenants") return { select: (cols) => ({
      eq: async (col, v) => { D.lookups.push({ by: "eq", col, v, cols }); return D.tenants; },
      ilike: async (col, v) => { D.lookups.push({ by: "ilike", col, v, cols }); return D.tenants; } }) };
    if (table === "bot_outputs") return { insert: (row) => { D.inserts.push(row); return { select: () => ({ single: async () => D.insert }) }; } };
    throw new Error("unexpected table " + table);
  } }; }`;
registerHooks({ resolve: (spec, ctx, next) => spec.startsWith("npm:@supabase/supabase-js")
  ? { url: "data:text/javascript," + encodeURIComponent(STUB), shortCircuit: true } : next(spec, ctx) });

const BASE = { SUPABASE_URL: "https://x.test", SUPABASE_SERVICE_ROLE_KEY: "service-TEST", BOT_DROP_ALLOWLIST: "grok, Claude,hermes", BOT_DROP_SECRET: "bot-secret-TEST" };
let ENV = { ...BASE };
let handler;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };
await import("./index.ts");

const BAYLEAF = { id: "0f9a8b7c-1d2e-4f30-8a1b-2c3d4e5f6a7b", name: "Bayleaf Kitchen", status: "active" };
/** A fresh stub database: one client found, the insert works. */
function reset(o = {}) {
  globalThis.__db = { made: [], lookups: [], inserts: [], tenants: { data: [BAYLEAF], error: null }, insert: { data: { id: "bo-1", status: "pending" }, error: null }, ...o };
  return globalThis.__db;
}
const drop = (body, headers = {}, method = "POST") => handler(new Request("https://x.test/functions/v1/bot-drop", {
  method, headers: { "x-bot-secret": "bot-secret-TEST", "x-bot-name": "grok", "Content-Type": "application/json", ...headers },
  body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
}));
const read = async (res) => ({ status: res.status, body: await res.json() });
const GOOD = { client: BAYLEAF.id, text: "Brunch at Bayleaf, every weekend from 9. Book a table." };

test("only POST", async () => {
  reset(); ENV = { ...BASE };
  const r = await read(await drop(null, {}, "GET"));
  assert.equal(r.status, 405);
  assert.equal(r.body.error, "method");
});

test("a bot on the allowlist with the right secret drops a Pending card, and the database holds the bot's name", async () => {
  const D = reset(); ENV = { ...BASE };
  const r = await read(await drop({ ...GOOD, request: "Make the headline stronger", type: "Website", changeNote: "Stronger headline", highlights: ["Book a table.", "not in the text"] }));
  assert.equal(r.status, 201);
  assert.deepEqual(r.body, { id: "bo-1", status: "pending", client: "Bayleaf Kitchen" });
  assert.equal(D.made[0].key, "service-TEST");
  assert.deepEqual(D.lookups, [{ by: "eq", col: "id", v: BAYLEAF.id, cols: "id, name, status" }]);
  assert.deepEqual(D.inserts, [{ tenant_id: BAYLEAF.id, kind: "Website", request: "Make the headline stronger", draft: GOOD.text, change_note: "Stronger headline", highlights: ["Book a table."], source: "grok" }]);
});

test("the bot's name is matched in any case, and the defaults are General with no request, note or highlights", async () => {
  const D = reset(); ENV = { ...BASE };
  const r = await read(await drop(GOOD, { "x-bot-name": "CLAUDE" }));
  assert.equal(r.status, 201);
  assert.deepEqual(D.inserts[0], { tenant_id: BAYLEAF.id, kind: "General", request: null, draft: GOOD.text, change_note: null, highlights: [], source: "claude" });
});

test("refused with the same 401 and no detail: no allowlist, a name not on it, a bad name, a wrong or missing secret", async () => {
  for (const [env, headers] of [
    [{ ...BASE, BOT_DROP_ALLOWLIST: "" }, {}],
    [{ ...BASE }, { "x-bot-name": "someone" }],
    [{ ...BASE }, { "x-bot-name": "grok bot" }],
    [{ ...BASE }, { "x-bot-secret": "wrong" }],
    [{ ...BASE }, { "x-bot-secret": "" }],
    [{ ...BASE, BOT_DROP_SECRET: "" }, {}]
  ]) {
    const D = reset(); ENV = env;
    const r = await read(await drop(GOOD, headers));
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, { error: "unauthorized", message: "Not allowed." });
    assert.equal(D.made.length, 0, "the database is never opened");
  }
});

test("Hermes is refused while HERMES_ENABLED is off, even on the allowlist with the right secret; on, it may drop", async () => {
  reset(); ENV = { ...BASE };
  assert.equal((await drop(GOOD, { "x-bot-name": "hermes" })).status, 401);
  reset(); ENV = { ...BASE, HERMES_ENABLED: "false" };
  assert.equal((await drop(GOOD, { "x-bot-name": "hermes" })).status, 401);
  const D = reset(); ENV = { ...BASE, HERMES_ENABLED: "true" };
  assert.equal((await drop(GOOD, { "x-bot-name": "hermes" })).status, 201);
  assert.equal(D.inserts[0].source, "hermes");
});

test("no Supabase settings: 503, nothing stored", async () => {
  const D = reset(); ENV = { ...BASE, SUPABASE_SERVICE_ROLE_KEY: "" };
  const r = await read(await drop(GOOD));
  assert.equal(r.status, 503);
  assert.equal(r.body.error, "not-configured");
  assert.equal(D.inserts.length, 0);
});

test("the body: 64 KB at most, a JSON object, client and text required, the optional parts checked", async () => {
  ENV = { ...BASE };
  const cases = [
    [JSON.stringify({ ...GOOD, text: "x".repeat(65 * 1024) }), 413, "too-large"],
    ["not json", 400, "bad-request"],
    ["[1,2]", 400, "bad-request"],
    ["null", 400, "bad-request"],
    [{ text: GOOD.text }, 400, "invalid"],
    [{ client: BAYLEAF.id }, 400, "invalid"],
    [{ client: BAYLEAF.id, text: "   " }, 400, "invalid"],
    [{ ...GOOD, text: "x".repeat(20001) }, 400, "invalid"],
    [{ ...GOOD, request: "" }, 400, "invalid"],
    [{ ...GOOD, type: "x".repeat(41) }, 400, "invalid"],
    [{ ...GOOD, changeNote: "x".repeat(601) }, 400, "invalid"],
    [{ ...GOOD, highlights: "Book a table." }, 400, "invalid"],
    [{ ...GOOD, highlights: Array.from({ length: 21 }, () => "Book") }, 400, "invalid"]
  ];
  for (const [body, status, error] of cases) {
    const D = reset();
    const r = await read(await drop(body));
    assert.equal(r.status, status, `${String(typeof body === "string" ? body : JSON.stringify(body)).slice(0, 60)}`);
    assert.equal(r.body.error, error);
    assert.equal(D.inserts.length, 0);
  }
});

test("a client by exact name (any case): the name is searched literally, with % and _ escaped", async () => {
  const D = reset(); ENV = { ...BASE };
  assert.equal((await drop({ ...GOOD, client: "bayleaf_kitchen 100%" })).status, 201);
  assert.deepEqual(D.lookups[0], { by: "ilike", col: "name", v: "bayleaf\\_kitchen 100\\%", cols: "id, name, status" });
});

test("the client: none, only archived, two with one name, or a failed lookup are refused and nothing is stored", async () => {
  ENV = { ...BASE };
  for (const [tenants, status, error] of [
    [{ data: [], error: null }, 404, "no-client"],
    [{ data: [{ ...BAYLEAF, status: "archived" }], error: null }, 404, "no-client"],
    [{ data: [BAYLEAF, { ...BAYLEAF, id: "other" }], error: null }, 409, "ambiguous"],
    [{ data: null, error: { message: "boom" } }, 500, "lookup-failed"]
  ]) {
    const D = reset({ tenants });
    const r = await read(await drop({ ...GOOD, client: "Bayleaf Kitchen" }));
    assert.equal(r.status, status);
    assert.equal(r.body.error, error);
    assert.equal(D.inserts.length, 0);
  }
  // An archived twin does not make a live client ambiguous.
  const D = reset({ tenants: { data: [BAYLEAF, { ...BAYLEAF, id: "old", status: "archived" }], error: null } });
  assert.equal((await drop({ ...GOOD, client: "Bayleaf Kitchen" })).status, 201);
  assert.equal(D.inserts[0].tenant_id, BAYLEAF.id);
});

test("a failed save is a 500 with no database detail", async () => {
  reset({ insert: { data: null, error: { message: "permission denied for table bot_outputs" } } }); ENV = { ...BASE };
  const r = await read(await drop(GOOD));
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { error: "save-failed", message: "Could not save it." });
});
