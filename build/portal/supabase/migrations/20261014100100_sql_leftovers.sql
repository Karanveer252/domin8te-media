-- Two small SQL leftovers from the 14 Oct critic (item 21). LOCAL: TEST project only until Karan approves prod. Idempotent.
--
-- 1. 20261013010400 marks every old Work card "decided" (visibility_decided_by = 'migration-2026-10', for cards created before
--    it ran). Run again later, that line would also mark newer cards that are still waiting for a decision. Applied migrations
--    are not rewritten, so the guard on tasks now refuses that mark for a card made after the first run: the time of the first
--    run is kept in app.settings (tasks_decided_mark_at), and the mark leaves such a card exactly as it was. Cards from before
--    it are unchanged (they were all marked the first time).
-- 2. The "picks confirmed" email trigger (20261013010700) read old.source in "tg_op = 'INSERT' or ... old.source", which relied
--    on OR being evaluated left to right. It now checks the INSERT case first in its own branch. Same behaviour.

-- 1) The first run of the old mark --------------------------------------------------------------------------------------------
insert into app.settings (key, value)
select 'tasks_decided_mark_at', coalesce((select min(t.visibility_decided_at) from public.tasks t where t.visibility_decided_by = 'migration-2026-10'), now())::text
on conflict (key) do nothing;

-- The visibility guard (20261013010400) with the re-run rule in front. Everything after it is unchanged.
create or replace function app.guard_task_visibility() returns trigger language plpgsql security definer set search_path = '' as $$
declare path text := coalesce(current_setting('tasks.change_path', true), ''); mark timestamptz;
begin
  -- a re-run of the one-off "old cards were decided" mark never touches a card made after its first run
  if tg_op = 'UPDATE' then
    if new.visibility_decided_by = 'migration-2026-10' and old.visibility_decided_by is distinct from 'migration-2026-10' then
      select s.value::timestamptz into mark from app.settings s where s.key = 'tasks_decided_mark_at';
      if mark is not null and old.created_at >= mark then
        new.client_visible := old.client_visible; new.visibility_decided_at := old.visibility_decided_at; new.visibility_decided_by := old.visibility_decided_by;
      end if;
    end if;
  end if;
  -- Only signed-in people are held to this (auth.role() from the request: inside this security definer function
  -- current_user is the owner). Server code (multica-sync, service role) and migrations are unchanged.
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.client_visible := false; new.visibility_decided_at := null; new.visibility_decided_by := null;
    new.deleted_at := null; new.deleted_by := null; new.deleted_reason := null;
    return new;
  end if;
  if old.deleted_at is not null and path <> 'delete' then
    raise exception 'card-removed: this card was removed and is kept for its history' using errcode = '42501'; end if;
  if (new.client_visible, new.visibility_decided_at, new.visibility_decided_by) is distinct from (old.client_visible, old.visibility_decided_at, old.visibility_decided_by)
     and path not in ('visibility', 'delete') then
    raise exception 'use-set-task-visibility' using errcode = '42501'; end if;
  if (new.deleted_at, new.deleted_by, new.deleted_reason) is distinct from (old.deleted_at, old.deleted_by, old.deleted_reason) and path <> 'delete' then
    raise exception 'use-soft-delete-task' using errcode = '42501'; end if;
  return new;
end $$;

-- 2) The "picks confirmed" email trigger --------------------------------------------------------------------------------------
create or replace function app.cycle_picks_confirmed() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source <> 'client_picker' then return null; end if;
  if tg_op = 'INSERT' then
    perform app.queue_picks_confirmed(new.id);
  elsif new.picks is distinct from old.picks or new.plan_id is distinct from old.plan_id
        or new.website_option is distinct from old.website_option or old.source is distinct from 'client_picker'
        or new.confirmed_at is distinct from old.confirmed_at then
    perform app.queue_picks_confirmed(new.id);
  end if;
  return null;
end $$;
