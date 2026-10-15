// The allowed origins: the live site only, unless ALLOW_LOCAL_ORIGINS=1 (TEST and local only). No network.
// Run (from portal/supabase): node --test functions/_shared/origins.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

let ENV = {};
globalThis.Deno = { env: { get: (k) => ENV[k] } };
const { allowedOrigins } = await import("./origins.ts");

test("prod (flag unset): the live site only, apex first, no localhost", () => {
  ENV = {};
  assert.deepEqual(allowedOrigins(), ["https://domin8temedia.com", "https://www.domin8temedia.com"]);
  for (const v of ["0", "true", "yes", ""]) {
    ENV = { ALLOW_LOCAL_ORIGINS: v };
    assert.ok(!allowedOrigins().some((o) => o.includes("localhost")), `"${v}" does not open localhost`);
  }
});

test("TEST and local (ALLOW_LOCAL_ORIGINS=1): the preview ports are added after the site", () => {
  ENV = { ALLOW_LOCAL_ORIGINS: "1" };
  assert.deepEqual(allowedOrigins(), ["https://domin8temedia.com", "https://www.domin8temedia.com", "http://localhost:4173", "http://localhost:8080"]);
  assert.deepEqual(allowedOrigins((k) => (k === "ALLOW_LOCAL_ORIGINS" ? " 1 " : undefined)).length, 4);
});

test("no function keeps its own localhost list", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  for (const d of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "_shared")) {
    for (const f of readdirSync(join(root, d.name)).filter((f) => f.endsWith(".ts"))) {
      assert.ok(!/["'`]https?:\/\/localhost/.test(readFileSync(join(root, d.name, f), "utf8")), `${d.name}/${f} names localhost`);
    }
  }
});
