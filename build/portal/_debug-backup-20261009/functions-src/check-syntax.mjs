// Syntax check for the Edge Functions without Deno: strip the TypeScript types (Node's own stripper) and parse
// each file as an ES module. Catches typos and broken braces; it is not a type check.
// Run: node build/portal/supabase/functions/check-syntax.mjs
import { stripTypeScriptTypes } from "node:module";
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "fn-check-"));
let bad = 0;
for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  for (const f of readdirSync(join(root, dir.name)).filter((f) => f.endsWith(".ts"))) {
    const file = join(root, dir.name, f);
    try {
      const js = stripTypeScriptTypes(readFileSync(file, "utf8"));
      const out = join(tmp, `${dir.name}-${f}.mjs`);
      writeFileSync(out, js);
      execFileSync(process.execPath, ["--check", out], { stdio: "pipe" });
      console.log(`ok   ${dir.name}/${f}`);
    } catch (e) {
      bad++;
      console.log(`FAIL ${dir.name}/${f}\n${String(e.stderr || e.message).split("\n").slice(0, 6).join("\n")}`);
    }
  }
}
rmSync(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
