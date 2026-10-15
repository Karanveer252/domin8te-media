VERDICT: NOT CLEAN

# Critic round 7: Bot chat plus + botd design pass (15 Oct 2026)

Read-only. Nothing edited, applied or deployed. Prod untouched. Staging was rebuilt by make-staging.js (as required for the demo run).
Result: 0 high, 1 medium, 6 low. Findings below are BY READING unless marked VERIFIED.

## Tool results (all green, VERIFIED)
- console-check console-preview: 32/32. --phone: 32/32 fit 390px.
- Staged demo (versions/staging/console/index.html --demo): 33/33, "13 direct writes refused, 96 tries on 10 pages, nothing changed". (Running --demo without the staged path fails with "not a demo console build": that is the tool, not a bug.)
- a11y console-preview --only=bot: 31/31.
- SQL on TEST: bot_plus.sql 59 rows 0 fail; bot_outputs.sql 14 rows 0 fail.

## Areas that held up (BY READING)
- Search is plain `includes` (no regex), esc() on the box value; emoji/quotes safe. Hidden drafts are never touched: results() drops picks that are not on screen on every redraw; bulk SQL only touches pending, unexpired, live-client rows and caps at 100.
- Keys skip INPUT/TEXTAREA/SELECT, open dialogs, open forms; j/k clamp at list ends; "a" exists only on pending cards.
- Saved reasons and ask() text: esc() or textContent everywhere, no XSS path. ask() keeps "Keep it" and red button by default; only the two new Approve/Reject callers pass options.
- Diff pieces are esc()'d, HTML-looking text is safe. Approve uses working_text in both SQL paths.
- SQL: every function checks app.is_staff() (42501), search_path '', revoke from public/anon, grant to authenticated only; tables RLS staff-select only. Replaced bot_output_decide keeps all old checks (staff, not-found, already-decided, empty-text, note-needed, too-many-notes, bad-action) and only changes the approve coalesce. Hermes shows as "Another bot" in filters, rows, card, search and stats while the flag is off. Demo: write controls disabled, RPCs refused.

## Findings

**R7-1. IMPLEMENTATION, medium.** Holding the "a" key approves several drafts in a row.
Where: console/mod-bot.js:998-1011 (keydown handler has no `e.repeat` check; "a" clicks Approve and next, which navigates to the next card, and the next auto-repeat then approves that card too, unseen). Approve sends nothing but marks the draft decided with no way back.
Fix: `if (e.repeat) return;` at the top of the handler, and optionally ignore "a" for ~700 ms after a card change.

**R7-2. IMPLEMENTATION, low.** A snooze that runs out is not noticed on an open page.
Where: mod-bot.js:933 (sig() ignores whether a draft is snoozed now), 936-953 (poll only redraws when sig changes), 83. The row keeps the Snoozed pill and the sidebar/Needs you count stays low until a reload or navigation.
Fix: add `isSnoozed(r)` to sig() so the poll redraws and refreshes the badge when a snooze lapses.

**R7-3. GENERAL, low.** On a Sunday "Tomorrow at 9" and "Monday at 9" are the same time, two identical buttons.
Where: mod-bot.js:451-458 (`mon` is 1 on Sunday). Fix: drop Monday when its time equals tomorrow's.

**R7-4. GENERAL, low.** Edit history shows the same text twice after approve-after-edit ("Saved edit" then "Approved text", identical bodies) and counts it as two versions.
Where: mod-bot.js:434-445 with trigger app.bot_output_keep_version (migration ~line 118). Fix: skip the approved row when its body equals the latest edit, or label it "Approved as saved".

**R7-5. IMPLEMENTATION, low.** Single Approve does not check expiry in SQL, while decide_many and save_edit do (old behaviour kept, now inconsistent). A stale open card for a just-expired draft can still be approved.
Where: supabase/migrations/20261015010000_bot_plus.sql bot_output_decide approve branch. Fix: raise 'expired' (22023) when r.expires_at < now() for approve, as save_edit does.

**R7-6. GENERAL, low.** Bot numbers: the 7/30/90 day buttons have no handler until the first count finishes (and the panel onclick is only attached after a successful load/fallback).
Where: mod-bot.js:585-594. Fix: attach onclick to the panel before the await.

**R7-7. GENERAL, low.** Diff hides whitespace-only changes (newline vs space, extra blank lines): the pieces are drawn unmarked, so an edit that only changed line breaks looks identical to the draft.
Where: mod-bot.js:252 (`/^\s+$/.test(t)` returns plain text). Fix: mark whitespace changes with a visible ins/del (or a "line breaks changed" note).

Not found: no wrong-client edge (move only refuses missing/archived clients, client tab hands off to #/bot/<id> after a move, VERIFIED by sql test + console-check route bot/client).
