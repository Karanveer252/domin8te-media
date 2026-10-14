// Hermes kept but off (T17), and on (the T18 parts that live in code). No network: fetch and Deno.env are stubs.
// Run: node --test build/portal/supabase/functions/_shared/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ENV = { MULTICA_TOKEN: "test-token", MULTICA_WORKSPACE: "test-ws", MULTICA_AGENT_ID: "agent_TEST_hermes" };
globalThis.Deno = { env: { get: (k) => ENV[k] } };
const { hermesEnabled, withAgent } = await import("./hermes.ts");
const { multica } = await import("./multica.ts");

let sent = [];
globalThis.fetch = async (url, init) => { sent.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
  return { ok: true, status: 200, text: async () => JSON.stringify({ id: "iss_1", identifier: "D8-1", status: "todo" }) }; };

const fields = { title: "Brunch photos", status: "todo", project_id: "p1" };

test("off by default: unset, empty, or anything but true", () => {
  for (const v of [undefined, "", "false", "1", "yes", "TRUE "]) {
    const env = (k) => (k === "HERMES_ENABLED" ? v : undefined);
    assert.equal(hermesEnabled(env), v === "TRUE ", `HERMES_ENABLED=${JSON.stringify(v)}`);
  }
  delete ENV.HERMES_ENABLED;
  assert.equal(hermesEnabled(), false, "reads Deno.env by default");
});

test("off: a pushed issue has no agent, even with MULTICA_AGENT_ID set (stubbed fetch)", async () => {
  delete ENV.HERMES_ENABLED; sent = [];
  await multica("/api/issues", { method: "POST", body: JSON.stringify(withAgent(fields, (k) => ENV[k])) });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.assignee_type, undefined);
  assert.equal(sent[0].body.assignee_id, undefined);
  assert.equal(sent[0].body.title, "Brunch photos");
});

test("on: the issue goes to the agent, and nothing else changes", async () => {
  ENV.HERMES_ENABLED = "true"; sent = [];
  await multica("/api/issues", { method: "POST", body: JSON.stringify(withAgent(fields, (k) => ENV[k])) });
  assert.equal(sent[0].body.assignee_type, "agent");
  assert.equal(sent[0].body.assignee_id, "agent_TEST_hermes");
  assert.deepEqual({ ...sent[0].body, assignee_type: undefined, assignee_id: undefined }, { ...fields, assignee_type: undefined, assignee_id: undefined });
  assert.equal(withAgent(fields, (k) => (k === "HERMES_ENABLED" ? "true" : undefined)), fields, "on without an agent id: unchanged");
  delete ENV.HERMES_ENABLED;
});

test("multica-sync assigns an agent only through withAgent", () => {
  const src = readFileSync(new URL("../multica-sync/index.ts", import.meta.url), "utf8");
  assert.ok(/body: JSON\.stringify\(withAgent\(fields, env\)\)/.test(src), "the create-issue POST goes through withAgent");
  assert.equal((src.match(/assignee_(type|id)/g) || []).length, 0, "no other place sets an assignee");
});
