VERDICT: CLEAN

# Critic round 4: full regression sweep A to E (15 Oct 2026)

Critic: Sonnet, read-only. Nothing edited, no migration applied, nothing deployed, prod untouched. Only read-only SELECTs on TEST (leuvzsouqsdpdpyjspjr).
Scratch: C:\Users\kvsd1\AppData\Local\Temp\claude\C--Work-domin8te-media\dc214ef7-028c-40c9-8281-b73f7b46abca\scratchpad\critic4 (one headless Chrome at a time).
Builds were fresh (no source newer than versions/console-preview.html, 02:44). The local server on 4173 was already running; I left it as I found it.

Result: 0 high, 0 medium, 3 low (all residual, none a regression).

## Tool results (all green)
- console-check (console-preview): 24 of 24 clean. --phone: 24 of 24 fit 390px.
- Staged demo console, --demo: 25 of 25 clean; "13 direct writes refused, 91 tries on 9 pages, nothing changed". Demo browsing works on every route.
- a11y console-preview: 85 of 85 clean. a11y dashboard (v18h): 57 of 57 clean (the dark Billing hang from round 1 is gone).
- smoke: 90 of 90.
- release-checks: all clean (T10a, T10b, T10c, T10d, T11).
- lint: 93 files clean.
- npm test in v16: 115 tests, 114 pass, 0 fail, 1 skipped. tsc --noEmit: clean.
- functions tests: 98 of 98 pass.

## Round 1 to 3 fixes re-tested
- R1-3/R2-11 Clients table: with a fifth client (a 58-character name) the table fits and Freshness is whole at 1440 (VERIFIED, screenshot long-1440-clients.png). No sideways scroll at 1440 or 390 on 10 routes.
- R2-1 Services chip overlap at 390: fixed (name, chip and "What they see" each on clean rows; VERIFIED ov390.png).
- R2-6/R2-10 long words: a 400-character word in Messages at 390 gives no page scroll (scrollWidth 390) and no log scroll at 1440. overflow-wrap rules present for .bot-text, .card-title, .client-head h1 (BY READING).
- R2-22 Plans and limits: every bad entry (-5, abc, empty name, 80-char name, -1, 1.5, 999999, x) now shows its message under the field and as a toast, nothing is saved; a huge price asks first; Escape keeps the editor; three clicks on confirm wrote one audit row (VERIFIED, f9.js).
- R2-23 fieldFail: empty Messages reply focuses the box, sets aria-invalid and writes "Write the reply first." in .field-error; Talk gives 3 field errors; Add client focuses the first bad field (VERIFIED).
- R2-20 toast dedupe: three bad clicks leave one toast (VERIFIED).
- R2-5/R2-3 tap targets: the 600px rules are inside @media (max-width: 600px), so the desktop look cannot change (BY READING; 1440 and 768 audits show no tap flags and no layout change). Board chips and badges now reach 44px through ::after hit areas, Revenue Hide too (see R4-1 for what is left).
- Round 3 database (VERIFIED on TEST): the five new constraints exist and are validated; anon holds 0 table grants and 0 function execute rights in public and app; authenticated holds 0 TRIGGER or REFERENCES rights; every table with a policy still has SELECT for authenticated (no console or dashboard read broke); RLS is on for every table in public and app including app.settings; no SECURITY DEFINER function runs with a public search_path; sequences keep USAGE for authenticated. Default privileges for role postgres no longer grant anon or authenticated.
- Client view live (http://localhost:4173/versions/console-preview.html#/client/tnt_preview_bayleaf/view): frame loads "Viewing as Bayleaf Kitchen (preview), read only"; a change signal makes the frame show the new Running now text in 1.0 s; Messages textarea and Send are disabled; the read-only wrapper in view-as.js did not break reads; decisions count stayed 1. No console errors.
- Round 3 item 16 headers: deploy/security-headers.htaccess.txt present, waits for Karan's word "deploy".

## Areas A to E quick sweep
- Console light 1440, 768, 390 (23 routes each), console dark 1440, 768, 390, dashboard (demo=cornerbean) light and dark 1440, 768, 390 (8 routes each): no page sideways scroll, nothing sticking out except the known tab strips (below), no busy states, zero script errors (VERIFIED, out\*.json). Dark and light screenshots read well (console-dark-1440-queue.png, console-light-390 set, dash-*-390).
- Dashboard: no tap target flagged at 390.
- Flows retried: Messages send, triple click, Ctrl+Enter, search, status; Add client with logo and long name; Plans and limits; Client view. All behave as in round 2, no console errors.

## Findings
**R4-1. DESIGN, low.** Some Revenue controls at 390 are still under 44px: the month links inside the chart data tables (a in th, 18px tall, ~40 per page), the Costs form select (39px, min-height 38 wins) and the "repeats monthly" switch row (28px). Where: #/revenue and #/revenue/2026-10/costs, console/css/70-touch.css (td a is covered, th a is not) and 62-revenue.css. Evidence: VERIFIED by measurement (t1.js, t2.js). Board chips and badges are fine (hit area grown by ::after). Fix: add main th a to the padded link rule, and give .rv select and .rv-rep min-height 44 at 600px and under.
**R4-2. DESIGN, low.** Client page tab strip and Settings index strip at 390 are still sideways scrollers cut at the edge with no fade (span.t right 396 to 429; Settings buttons right 453 to 838). Same as R2-2 and R2-4, not fixed or only partly. Evidence: VERIFIED (audit out list). Fix: edge fade mask on those strips.
**R4-3. GENERAL, low.** Default privileges for role supabase_admin in schema public still grant anon and authenticated (VERIFIED, pg_default_acl). Only objects created by that role are affected; migrations run as postgres, so it does not bite today. Fix: add the same alter default privileges ... for role supabase_admin if the Supabase dashboard ever creates objects, or leave it and note it.

## Could not cover
Real signed-in writes against a database as a client, the second-tab Client view signal (the same-page channel path was proved), clipboard buttons in headless Chrome, scenes theme and 1024/600/360 widths (not asked this round; covered in rounds 1 to 2).
