-- Security fixes, part 1: who can read and write what (2026-10-14, critic items 7 and 14). LOCAL: TEST project only until Karan
-- approves prod. Idempotent (safe to run twice).
--
-- Item 7. A client could read the staff-only columns of its own rows through the API (the dashboard never asked for them, but
-- PostgREST lets a signed-in client select any granted column):
--   tenant_plan_cycles: override_reason (staff notes), created_by, updated_by, confirmed_by (staff ids)
--   usage_events: note (staff notes), created_by, over_cap_approved_by, voided_by, voided_reason
-- Both tables now grant SELECT on the safe columns only. Row level security is unchanged (a client still reads only its own rows,
-- staff read every row). Staff lose the hidden columns through the API too: the console never shows them (the history comes from
-- audit_log), so it now asks for the safe columns by name (console.js loadPlans, mod-work.js).
-- NOTE for anyone adding a column to either table later: a new column is NOT readable through the API until it is added to the
-- grant below (or a grant of its own).
--
-- Item 14. New tables and views were left with the default privileges of the authenticated role (DELETE, UPDATE, TRUNCATE,
-- TRIGGER, REFERENCES on bot_outputs; full DML on the two views). Row level security or invoker rights blocked use through the
-- API, but TRUNCATE ignores row level security. Each now starts from `revoke all` and gets back only what is used.
-- Also: three older functions ran with search_path = public; they now run with search_path = '' (every name is qualified).
-- The revenue tables (20261014070000) are not touched here: another change owns them.

-- 7) Safe columns only ---------------------------------------------------------------------------------------------------------
-- (Revoking the table-wide SELECT also clears earlier column grants, so the grant below is the whole list each time.)
revoke select on public.tenant_plan_cycles from authenticated;
grant select (id, tenant_id, period_start, period_end, plan_id, picks, website_option, state, confirmed_at, locked_at, source,
              created_at, updated_at) on public.tenant_plan_cycles to authenticated;
do $$ begin
  -- the bill day (20261014100000) when that change is in place
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tenant_plan_cycles' and column_name = 'bill_day') then
    grant select (bill_day) on public.tenant_plan_cycles to authenticated;
  end if;
end $$;

revoke select on public.usage_events from authenticated;
grant select (id, tenant_id, cycle_id, service, metric, qty, counted, task_id, request_id, over_cap_approved_at, created_at, voided_at)
  on public.usage_events to authenticated;
do $$ begin
  -- the write order of usage rows (20261014110100), which tenant_usage_current reads for the "live at a time" limits
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'usage_events' and column_name = 'seq') then
    grant select (seq) on public.usage_events to authenticated;
  end if;
end $$;

-- 14) Least privilege on the new tables and views --------------------------------------------------------------------------------
-- Bot chat: staff read; a staff insert is allowed by its policy (the bot-drop function uses the service role). Decisions go
-- through public.bot_output_decide only.
revoke all on public.bot_outputs from anon, authenticated;
grant select on public.bot_outputs to authenticated;
grant insert (tenant_id, kind, request, draft, change_note, highlights, source) on public.bot_outputs to authenticated;

-- The two views are read only.
revoke all on public.client_visibility_history from anon, authenticated;
grant select on public.client_visibility_history to authenticated;
revoke all on public.tenant_usage_current from anon, authenticated;
grant select on public.tenant_usage_current to authenticated;

-- client_profile (staff only by its policies): read, and the console's upserts of the sign-off level, tier, card colour, tag and
-- logo. PostgREST's upsert also sets tenant_id to itself, so tenant_id is in the update list. updated_at / updated_by are set by
-- the table's own trigger (app.touch_profile). No DELETE, TRUNCATE, TRIGGER or REFERENCES.
revoke all on public.client_profile from anon, authenticated;
grant select on public.client_profile to authenticated;
grant insert (tenant_id, tier, approval_level, card_color, card_tag, logo_data) on public.client_profile to authenticated;
grant update (tenant_id, tier, approval_level, card_color, card_tag, logo_data) on public.client_profile to authenticated;

-- 14) search_path = '' on the three older functions ---------------------------------------------------------------------------------
-- Same body as 20261008120100, with the two tables named in full.
create or replace function app.auto_publish_allowed(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.dashboard_publish_gates) = 4
     and coalesce((select enabled from public.tenant_auto_publish where tenant_id = p_tenant), false);
$$;
-- Every name in these two bodies is already qualified (app.*, auth.jwt, vault.decrypted_secrets, net.http_post) or built in.
alter function app.guard_dashboard_publication() set search_path = '';
alter function public.dm_post(text, text, text, jsonb) set search_path = '';
