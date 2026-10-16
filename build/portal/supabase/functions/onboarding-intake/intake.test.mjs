// Run: node --test build/portal/supabase/functions/onboarding-intake/
import test from "node:test";
import assert from "node:assert/strict";
const { parseIntake, saveIntake, mask } = await import("./intake.ts");

const GOOD = { sid: "abc12345-xyz", first: "Jon", last: "Test", email: "Jon@Example.com", mobile: "204 555 0100", place: "TEST Jon's Kitchen",
  summary: "Fix first: Google listing\nKickoff call: Tue 10:00", answers: JSON.stringify({ how: "self", goals: ["google"] }) };

test("a good form becomes one row, email lower-cased, answers parsed", () => {
  const p = parseIntake(GOOD);
  assert.equal(p.ok, true);
  assert.equal(p.row.email, "jon@example.com");
  assert.equal(p.row.restaurant, "TEST Jon's Kitchen");
  assert.deepEqual(p.row.answers, { how: "self", goals: ["google"] });
  assert.match(p.row.summary, /\nKickoff/);
});
test("missing name, place, summary or a bad email is refused", () => {
  for (const k of ["first", "place", "summary"]) assert.equal(parseIntake({ ...GOOD, [k]: "  " }).ok, false, k);
  assert.equal(parseIntake({ ...GOOD, email: "not-an-email" }).ok, false);
  assert.equal(parseIntake(null).ok, false);
});
test("a bad sid is refused; header junk is flattened", () => {
  assert.equal(parseIntake({ ...GOOD, sid: "../../x" }).ok, false);
  const p = parseIntake({ ...GOOD, first: "Jon\r\nBcc: x@y.z" });
  assert.equal(p.row.first_name, "Jon Bcc: x@y.z");
});
test("answers that are not a JSON object are left out, not fatal", () => {
  assert.equal(parseIntake({ ...GOOD, answers: "{broken" }).row.answers, null);
  assert.equal(parseIntake({ ...GOOD, answers: "[1,2]" }).row.answers, null);
});
test("save: new row ok, repeat sid is a duplicate, db error is a failure", async () => {
  const fake = (data, error = null) => ({ from: () => ({ upsert: (row, o) => { assert.equal(o.onConflict, "sid"); return { select: async () => ({ data, error }) }; } }) });
  assert.deepEqual(await saveIntake(fake([{ id: "1" }]), parseIntake(GOOD).row), { ok: true, duplicate: false });
  assert.deepEqual(await saveIntake(fake([]), parseIntake(GOOD).row), { ok: true, duplicate: true });
  assert.deepEqual(await saveIntake(fake(null, { message: "x" }), parseIntake(GOOD).row), { ok: false, error: "save" });
});
test("mask keeps no full address", () => assert.equal(mask("karanveersingh2425@gmail.com"), "k***@gmail.com"));
