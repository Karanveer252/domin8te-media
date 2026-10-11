// Unit tests for _shared/multica.ts and _shared/secret.ts. No network, no database: fetch, Deno.env and the
// Supabase client are stubs. Run: node --test build/portal/supabase/functions/_shared/  (Node 22.18+ strips the types)
import test from "node:test";
import assert from "node:assert/strict";

const ENV = { MULTICA_TOKEN: "test-token", MULTICA_WORKSPACE: "test-ws" };
globalThis.Deno = { env: { get: (k) => ENV[k] } };

const { pullTask, issueUnchanged, listProjectIssues, multicaConfigured, boardStatus, sameInstant } = await import("./multica.ts");
const { secretMatches } = await import("./secret.ts");

// fetch stub: answers by path; records every call.
let calls = [];
let routes = {};
globalThis.fetch = async (url) => {
  const path = String(url).replace(/^https:\/\/api\.multica\.ai/, "");
  calls.push(path);
  const hit = Object.entries(routes).find(([p]) => path.startsWith(p));
  const [status, body] = hit ? hit[1](path) : [404, { error: "not found" }];
  return { ok: status < 400, status, text: async () => JSON.stringify(body) };
};
const reset = (r = {}) => { calls = []; routes = r; };

// Supabase client stub for tasks: update().eq().eq().select() returns the matched rows.
function fakeDb(rows) {
  const writes = [];
  return {
    writes,
    from: () => ({
      update(patch) {
        const filters = [];
        const run = () => {
          const hit = rows.filter((r) => filters.every(([k, v]) => r[k] === v));
          for (const r of hit) Object.assign(r, patch);
          writes.push({ patch, matched: hit.length });
          return { error: null, data: hit.map((r) => ({ id: r.id })) };
        };
        const q = {
          eq(k, v) { filters.push([k, v]); return q; },
          select() { return Promise.resolve(run()); },
          then(res, rej) { return Promise.resolve(run()).then(res, rej); },
        };
        return q;
      },
    }),
  };
}
const task = (over = {}) => ({ id: "t1", tenant_id: "ten", status: "todo", multica_issue_id: "i1", multica_identifier: "DOM-1", multica_status: "todo", multica_synced_at: null, multica_updated_at: "2026-10-08T10:00:00.000000+00:00", multica_revision: 3, ...over });
const issue = (over = {}) => ({ id: "i1", identifier: "DOM-1", status: "todo", updated_at: "2026-10-08T10:00:00Z", revision: 3, project_id: "p1", ...over });

test("secretMatches: equal, different, missing", () => {
  assert.equal(secretMatches("abc", "abc"), true);
  assert.equal(secretMatches("abc", "abd"), false);
  assert.equal(secretMatches("abc", "abcd"), false);
  assert.equal(secretMatches(null, "abc"), false);
  assert.equal(secretMatches("abc", undefined), false);
});

test("multicaConfigured checks presence only", () => {
  assert.equal(multicaConfigured(), true);
  delete ENV.MULTICA_WORKSPACE;
  assert.equal(multicaConfigured(), false);
  ENV.MULTICA_WORKSPACE = "test-ws";
});

test("backlog maps to todo; instants compare across formats", () => {
  assert.equal(boardStatus("backlog"), "todo");
  assert.equal(boardStatus("done"), "done");
  assert.equal(sameInstant("2026-10-08T10:00:00.000000+00:00", "2026-10-08T10:00:00Z"), true);
  assert.equal(sameInstant("2026-10-08T10:00:01Z", "2026-10-08T10:00:00Z"), false);
  assert.equal(sameInstant(null, null), true);
});

for (const via of ["list", "single-GET"]) {
  const run = async (t, i) => {
    reset({ "/api/issues/": () => [200, i] });
    const rows = [t];
    const db = fakeDb(rows);
    const out = await pullTask(db, t, "2026-10-08T12:00:00Z", via === "list" ? i : undefined);
    return { out, db, row: rows[0] };
  };

  test(`pull-guard (${via}): same`, async () => {
    const { out, row } = await run(task(), issue({ revision: 4 }));
    assert.equal(out.result, "same");
    assert.equal(row.status, "todo");
    assert.equal(row.multica_revision, 4);
    assert.equal(calls.length, via === "list" ? 0 : 1);
  });

  test(`pull-guard (${via}): moved`, async () => {
    const { out, row } = await run(task(), issue({ status: "in_progress", revision: 4 }));
    assert.equal(out.result, "moved");
    assert.deepEqual([out.from, out.to], ["todo", "in_progress"]);
    assert.equal(row.status, "in_progress");
    assert.equal(row.multica_status, "in_progress");
  });

  test(`pull-guard (${via}): local-pending`, async () => {
    const { out, db, row } = await run(task({ status: "done" }), issue());
    assert.equal(out.result, "local-pending");
    assert.equal(row.status, "done");
    assert.equal(db.writes.length, 0);
  });

  test(`pull-guard (${via}): conflict`, async () => {
    const { out, db, row } = await run(task({ status: "done" }), issue({ status: "blocked", revision: 4 }));
    assert.equal(out.result, "conflict");
    assert.deepEqual([out.from, out.to], ["done", "blocked"]);
    assert.equal(row.status, "done");
    assert.equal(db.writes.length, 0);
  });

  test(`pull-guard (${via}): both moved to the same column is not a conflict`, async () => {
    const { out } = await run(task({ status: "done" }), issue({ status: "done", revision: 4 }));
    assert.equal(out.result, "same");
  });

  test(`pull-guard (${via}): backlog reads as an unmoved todo`, async () => {
    const { out, row } = await run(task(), issue({ status: "backlog", revision: 4 }));
    assert.equal(out.result, "same");
    assert.equal(row.multica_status, "todo");
  });

  test(`pull-guard (${via}): unknown status only stamps`, async () => {
    const { out, row } = await run(task(), issue({ status: "triage", revision: 4 }));
    assert.equal(out.result, "unknown-status");
    assert.equal(row.status, "todo");
  });
}

test("pull-guard: single GET 404 is missing, 500 is remote-error", async () => {
  reset({ "/api/issues/": () => [404, {}] });
  assert.equal((await pullTask(fakeDb([task()]), task())).result, "missing");
  reset({ "/api/issues/": () => [500, {}] });
  assert.equal((await pullTask(fakeDb([task()]), task())).result, "remote-error");
});

test("pull-guard: compare-and-set loses to a concurrent local move", async () => {
  const rows = [task({ status: "in_review" })];       // the row moved after we read it as "todo"
  const out = await pullTask(fakeDb(rows), task(), "2026-10-08T12:00:00Z", issue({ status: "done", revision: 4 }));
  assert.equal(out.result, "local-pending");
  assert.equal(rows[0].status, "in_review");
});

test("diff-skips-unchanged and revision-only-change", () => {
  assert.equal(issueUnchanged(task(), issue()), true);
  assert.equal(issueUnchanged(task(), issue({ revision: 4 })), false);
  assert.equal(issueUnchanged(task(), issue({ updated_at: "2026-10-08T10:05:00Z" })), false);
  assert.equal(issueUnchanged(task(), issue({ status: "done" })), false);
  assert.equal(issueUnchanged(task({ multica_revision: null }), issue()), false);  // never stamped a revision yet
  assert.equal(issueUnchanged(task(), issue({ status: "backlog" })), true);
});

test("list-pull-paginates: 230 issues, 3 calls, other projects ignored", async () => {
  const all = Array.from({ length: 230 }, (_, n) => issue({ id: `i${n}`, identifier: `DOM-${n}` }));
  reset({
    "/api/issues?": (path) => {
      const offset = Number(new URL("http://x" + path).searchParams.get("offset"));
      return [200, { issues: all.slice(offset, offset + 100), total: 230 }];
    },
  });
  const r = await listProjectIssues("p1");
  assert.equal(r.ok, true);
  assert.equal(r.issues.length, 230);
  assert.equal(r.calls, 3);
  assert.deepEqual(calls.map((c) => new URL("http://x" + c).searchParams.get("offset")), ["0", "100", "200"]);
  assert.ok(calls.every((c) => c.includes("project_id=p1") && c.includes("limit=100")));
});

test("client-project filter: another project's and internal cards are dropped", async () => {
  reset({ "/api/issues?": () => [200, { issues: [issue(), issue({ id: "other", project_id: "p2" }), issue({ id: "internal", project_id: null })], total: 3 }] });
  const r = await listProjectIssues("p1");
  assert.deepEqual(r.issues.map((i) => i.id), ["i1"]);
});

test("list pull: a failed page reports not ok", async () => {
  reset({ "/api/issues?": () => [502, {}] });
  const r = await listProjectIssues("p1");
  assert.equal(r.ok, false);
});
