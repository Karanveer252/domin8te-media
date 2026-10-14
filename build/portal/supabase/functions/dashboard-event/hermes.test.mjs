// dashboard-event refuses the sender "hermes" while Hermes is off, even when it is on the allowlist with the right
// secret (T17); with the flag on it gets past the sender check and nothing more (it still only enqueues pending events).
// No network: the Supabase client is a stub, loaded through a module hook. Run: node --test build/portal/supabase/functions/dashboard-event/
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const STUB = `export function createClient() { return {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "t1", status: "active" }, error: null }) }) }) }),
  rpc: async (fn) => { globalThis.__rpc.push(fn); return { data: "11111111-1111-1111-1111-111111111111", error: null }; } }; }`;
registerHooks({ resolve: (spec, ctx, next) => spec.startsWith("npm:@supabase/supabase-js")
  ? { url: "data:text/javascript," + encodeURIComponent(STUB), shortCircuit: true } : next(spec, ctx) });

const ENV = { DASHBOARD_MANAGER_ENABLED: "true", SUPABASE_URL: "https://x.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
  DASHBOARD_BOT_ALLOWLIST: "grok,hermes", DASHBOARD_BOT_SECRET: "bot-secret-TEST" };
let handler;
globalThis.__rpc = [];
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };
await import("./index.ts");

const call = (name) => handler(new Request("https://fn.test/dashboard-event", { method: "POST",
  headers: { "x-dashboard-bot-secret": "bot-secret-TEST", "x-dashboard-bot-name": name, "content-type": "application/json" },
  body: JSON.stringify({ tenantId: "11111111-1111-1111-1111-111111111111", eventType: "work.changed", entityType: "work", entityId: "card-1",
    idempotencyKey: "k1", payload: { item: { title: "x", status: "todo" } } }) }));

test("off: sender hermes is refused with 401 even on the allowlist", async () => {
  delete ENV.HERMES_ENABLED;
  const res = await call("hermes");
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "unauthorized");
});

test("off: other allowed bots are unaffected", async () => {
  delete ENV.HERMES_ENABLED;
  const res = await call("grok");
  assert.notEqual(res.status, 401);
});

test("on: hermes passes the sender check like any allowed bot (and still only enqueues)", async () => {
  ENV.HERMES_ENABLED = "true"; globalThis.__rpc = [];
  const res = await call("hermes");
  assert.notEqual(res.status, 401);
  assert.ok(globalThis.__rpc.every((fn) => fn === "enqueue_dashboard_event"), `only the outbox: ${globalThis.__rpc}`);
  delete ENV.HERMES_ENABLED;
});
