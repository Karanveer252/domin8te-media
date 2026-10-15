-- Bot chat plus (2026-10-15): what the console keeps for the ten Bot chat additions. Staff only, like bot_outputs itself.
-- No client policy anywhere, nothing for anon, every write through a security definer function that checks app.is_staff().
-- Safe to run again (if not exists, create or replace, drop ... if exists). TEST first; prod waits for Karan's word.
--
--   starred         a star on a draft (any status), so important ones sort first
--   snoozed_until   a Pending draft hidden from the waiting count until then (never past its expiry)
--   working_text    an edit saved without approving yet; Approve then approves this text
--   bot_output_versions   every saved edit and the edited text that was approved, for the history and the diff
--   bot_note_templates    saved reasons for Reject and saved notes for Respond, shared by the team
--   bot_output_decide_many  approve or reject many Pending drafts at once (one note for all when rejecting)
--   bot_output_stats        per bot for the last N days: dropped, approved, edited, rejected, expired, waiting, time to decide

alter table public.bot_outputs add column if not exists starred boolean not null default false;
alter table public.bot_outputs add column if not exists snoozed_until timestamptz;
alter table public.bot_outputs add column if not exists working_text text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bot_outputs_working_text_len' and conrelid = 'public.bot_outputs'::regclass) then
    alter table public.bot_outputs add constraint bot_outputs_working_text_len check (working_text is null or char_length(working_text) between 1 and 20000);
  end if;
end $$;
create index if not exists bot_outputs_starred_idx on public.bot_outputs (created_at desc) where starred;
-- Clients and signed-out visitors still get nothing; staff keep reading the whole row (table select, from 20261014110000).
revoke all on public.bot_outputs from anon;

-- ---- versions -------------------------------------------------------------------------------------------------------------
create table if not exists public.bot_output_versions (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references public.bot_outputs(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 20000),
  kind text not null default 'edit' check (kind in ('edit', 'approved')),
  by_id text,
  by_name text,
  at timestamptz not null default now()
);
create index if not exists bot_output_versions_output_idx on public.bot_output_versions (output_id, at);
alter table public.bot_output_versions enable row level security;
revoke all on public.bot_output_versions from public, anon, authenticated;
grant select on public.bot_output_versions to authenticated;
drop policy if exists "staff read bot versions" on public.bot_output_versions;
create policy "staff read bot versions" on public.bot_output_versions for select to authenticated using ((select app.is_staff()));

-- ---- saved reasons --------------------------------------------------------------------------------------------------------
create table if not exists public.bot_note_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('reject', 'respond')),
  body text not null check (char_length(body) between 1 and 500),
  created_by text,
  created_by_name text,
  created_at timestamptz not null default now()
);
create unique index if not exists bot_note_templates_unique on public.bot_note_templates (kind, lower(body));
alter table public.bot_note_templates enable row level security;
revoke all on public.bot_note_templates from public, anon, authenticated;
grant select on public.bot_note_templates to authenticated;
drop policy if exists "staff read bot templates" on public.bot_note_templates;
create policy "staff read bot templates" on public.bot_note_templates for select to authenticated using ((select app.is_staff()));

-- ---- the decision: Approve now approves a saved edit when there is one -----------------------------------------------------
-- Same as 20261014040000 except: approve with no text approves working_text (a saved edit) before the bot's draft.
create or replace function public.bot_output_decide(p_id uuid, p_action text, p_text text default null, p_note text default null)
returns public.bot_outputs
language plpgsql security definer set search_path = '' as $$
declare
  r public.bot_outputs;
  who text := app.jwt_sub();
  who_name text;
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  select * into r from public.bot_outputs where id = p_id for update;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'already-decided' using errcode = '23P01', detail = r.status; end if;
  select name into who_name from public.staff where clerk_user_id = who;
  if p_action = 'approve' then
    if p_text is not null and char_length(btrim(p_text)) = 0 then raise exception 'empty-text' using errcode = '22023'; end if;
    update public.bot_outputs set status = 'approved', final_text = coalesce(nullif(btrim(p_text), ''), working_text, draft),
      decided_at = now(), decided_by = who, decided_by_name = who_name where id = p_id returning * into r;
  elsif p_action = 'reject' then
    if char_length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'note-needed' using errcode = '22023'; end if;
    update public.bot_outputs set status = 'rejected', reject_note = left(btrim(p_note), 2000),
      decided_at = now(), decided_by = who, decided_by_name = who_name where id = p_id returning * into r;
  elsif p_action = 'respond' then
    if char_length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'note-needed' using errcode = '22023'; end if;
    if jsonb_array_length(r.notes) >= 50 then raise exception 'too-many-notes' using errcode = '22023'; end if;
    update public.bot_outputs set notes = notes || jsonb_build_array(jsonb_build_object('at', now(), 'by_name', coalesce(who_name, 'Team'), 'body', left(btrim(p_note), 2000)))
      where id = p_id returning * into r;
  elsif p_action = 'expire' then
    update public.bot_outputs set status = 'expired', decided_at = now(), decided_by = who, decided_by_name = who_name where id = p_id returning * into r;
  else
    raise exception 'bad-action' using errcode = '22023';
  end if;
  return r;
end $$;
revoke all on function public.bot_output_decide(uuid, text, text, text) from public, anon;
grant execute on function public.bot_output_decide(uuid, text, text, text) to authenticated;

-- An approved text that differs from the bot's draft is kept as the last version (whichever way it was approved).
create or replace function app.bot_output_keep_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.final_text is not null and new.final_text <> new.draft then
    insert into public.bot_output_versions (output_id, body, kind, by_id, by_name) values (new.id, new.final_text, 'approved', new.decided_by, new.decided_by_name);
  end if;
  return new;
end $$;
revoke all on function app.bot_output_keep_version() from public, anon, authenticated;
drop trigger if exists bot_outputs_keep_version on public.bot_outputs;
create trigger bot_outputs_keep_version after update of status on public.bot_outputs for each row execute function app.bot_output_keep_version();

-- ---- edits saved without approving ------------------------------------------------------------------------------------------
create or replace function public.bot_output_save_edit(p_id uuid, p_text text)
returns public.bot_outputs
language plpgsql security definer set search_path = '' as $$
declare
  r public.bot_outputs;
  t text := btrim(coalesce(p_text, ''));
  who text := app.jwt_sub();
  who_name text;
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  select * into r from public.bot_outputs where id = p_id for update;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'already-decided' using errcode = '23P01', detail = r.status; end if;
  if r.expires_at < now() then raise exception 'expired' using errcode = '22023'; end if;
  if t = '' then raise exception 'empty-text' using errcode = '22023'; end if;
  if char_length(t) > 20000 then raise exception 'too-long' using errcode = '22023'; end if;
  if t = coalesce(r.working_text, r.draft) then return r; end if;   -- nothing new to keep
  if (select count(*) from public.bot_output_versions where output_id = p_id) >= 100 then raise exception 'too-many-versions' using errcode = '22023'; end if;
  select name into who_name from public.staff where clerk_user_id = who;
  insert into public.bot_output_versions (output_id, body, kind, by_id, by_name) values (p_id, t, 'edit', who, coalesce(who_name, 'Team'));
  update public.bot_outputs set working_text = case when t = draft then null else t end where id = p_id returning * into r;
  return r;
end $$;
revoke all on function public.bot_output_save_edit(uuid, text) from public, anon;
grant execute on function public.bot_output_save_edit(uuid, text) to authenticated;

-- ---- star -------------------------------------------------------------------------------------------------------------------
create or replace function public.bot_output_star(p_id uuid, p_on boolean)
returns public.bot_outputs
language plpgsql security definer set search_path = '' as $$
declare r public.bot_outputs;
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  update public.bot_outputs set starred = coalesce(p_on, false) where id = p_id returning * into r;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  return r;
end $$;
revoke all on function public.bot_output_star(uuid, boolean) from public, anon;
grant execute on function public.bot_output_star(uuid, boolean) to authenticated;

-- ---- snooze (p_until null wakes it) ----------------------------------------------------------------------------------------------
create or replace function public.bot_output_snooze(p_id uuid, p_until timestamptz)
returns public.bot_outputs
language plpgsql security definer set search_path = '' as $$
declare r public.bot_outputs;
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  select * into r from public.bot_outputs where id = p_id for update;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'already-decided' using errcode = '23P01', detail = r.status; end if;
  if p_until is not null then
    if p_until <= now() or p_until > now() + interval '30 days' then raise exception 'bad-time' using errcode = '22023'; end if;
    if p_until > r.expires_at then raise exception 'after-expiry' using errcode = '22023'; end if;
  end if;
  update public.bot_outputs set snoozed_until = p_until where id = p_id returning * into r;
  return r;
end $$;
revoke all on function public.bot_output_snooze(uuid, timestamptz) from public, anon;
grant execute on function public.bot_output_snooze(uuid, timestamptz) to authenticated;

-- ---- move a Pending draft to the right client ------------------------------------------------------------------------------------
create or replace function public.bot_output_move(p_id uuid, p_tenant uuid)
returns public.bot_outputs
language plpgsql security definer set search_path = '' as $$
declare r public.bot_outputs;
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  select * into r from public.bot_outputs where id = p_id for update;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'already-decided' using errcode = '23P01', detail = r.status; end if;
  if not exists (select 1 from public.tenants where id = p_tenant and status <> 'archived') then raise exception 'no-client' using errcode = 'P0002'; end if;
  if r.tenant_id = p_tenant then return r; end if;
  update public.bot_outputs set tenant_id = p_tenant where id = p_id returning * into r;
  return r;
end $$;
revoke all on function public.bot_output_move(uuid, uuid) from public, anon;
grant execute on function public.bot_output_move(uuid, uuid) to authenticated;

-- ---- many at once: only drafts still Pending, not past expiry, of a live client; answers the rows it changed ------------------------
create or replace function public.bot_output_decide_many(p_ids uuid[], p_action text, p_note text default null)
returns setof public.bot_outputs
language plpgsql security definer set search_path = '' as $$
declare
  who text := app.jwt_sub();
  who_name text;
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('approve', 'reject') then raise exception 'bad-action' using errcode = '22023'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'nothing-picked' using errcode = '22023'; end if;
  if cardinality(p_ids) > 100 then raise exception 'too-many' using errcode = '22023'; end if;
  if p_action = 'reject' and char_length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'note-needed' using errcode = '22023'; end if;
  select name into who_name from public.staff where clerk_user_id = who;
  return query
    update public.bot_outputs b set
      status = case when p_action = 'approve' then 'approved' else 'rejected' end,
      final_text = case when p_action = 'approve' then coalesce(b.working_text, b.draft) else b.final_text end,
      reject_note = case when p_action = 'reject' then left(btrim(p_note), 2000) else b.reject_note end,
      decided_at = now(), decided_by = who, decided_by_name = who_name
    where b.id = any(p_ids) and b.status = 'pending' and b.expires_at >= now()
      and exists (select 1 from public.tenants t where t.id = b.tenant_id and t.status <> 'archived')
    returning b.*;
end $$;
revoke all on function public.bot_output_decide_many(uuid[], text, text) from public, anon;
grant execute on function public.bot_output_decide_many(uuid[], text, text) to authenticated;

-- ---- saved reasons ------------------------------------------------------------------------------------------------------------------
create or replace function public.bot_template_add(p_kind text, p_body text)
returns public.bot_note_templates
language plpgsql security definer set search_path = '' as $$
declare
  r public.bot_note_templates;
  t text := btrim(coalesce(p_body, ''));
  who text := app.jwt_sub();
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('reject', 'respond') then raise exception 'bad-kind' using errcode = '22023'; end if;
  if t = '' then raise exception 'empty-text' using errcode = '22023'; end if;
  if char_length(t) > 500 then raise exception 'too-long' using errcode = '22023'; end if;
  select * into r from public.bot_note_templates where kind = p_kind and lower(body) = lower(t);
  if found then return r; end if;
  if (select count(*) from public.bot_note_templates where kind = p_kind) >= 30 then raise exception 'too-many' using errcode = '22023'; end if;
  insert into public.bot_note_templates (kind, body, created_by, created_by_name)
    values (p_kind, t, who, (select name from public.staff where clerk_user_id = who))
    on conflict (kind, lower(body)) do nothing returning * into r;
  if r.id is null then select * into r from public.bot_note_templates where kind = p_kind and lower(body) = lower(t); end if;
  return r;
end $$;
revoke all on function public.bot_template_add(text, text) from public, anon;
grant execute on function public.bot_template_add(text, text) to authenticated;

create or replace function public.bot_template_remove(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  delete from public.bot_note_templates where id = p_id;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.bot_template_remove(uuid) from public, anon;
grant execute on function public.bot_template_remove(uuid) to authenticated;

-- ---- per-bot numbers (read only) --------------------------------------------------------------------------------------------------
create or replace function public.bot_output_stats(p_days integer default 30)
returns table (source text, dropped integer, approved integer, edited integer, rejected integer, expired integer, waiting integer, avg_minutes integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'bad-days' using errcode = '22023'; end if;
  return query
    select b.source,
      count(*)::integer,
      (count(*) filter (where b.status = 'approved'))::integer,
      (count(*) filter (where b.status = 'approved' and b.final_text is distinct from b.draft))::integer,
      (count(*) filter (where b.status = 'rejected'))::integer,
      (count(*) filter (where b.status = 'expired' or (b.status = 'pending' and b.expires_at < now())))::integer,
      (count(*) filter (where b.status = 'pending' and b.expires_at >= now()))::integer,
      round(extract(epoch from avg(b.decided_at - b.created_at) filter (where b.status in ('approved', 'rejected') and b.decided_at is not null)) / 60)::integer
    from public.bot_outputs b
    where b.created_at >= now() - make_interval(days => p_days)
    group by b.source
    order by count(*) desc, b.source;
end $$;
revoke all on function public.bot_output_stats(integer) from public, anon;
grant execute on function public.bot_output_stats(integer) to authenticated;
