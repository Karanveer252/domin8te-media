-- Bill reminders (7 and 3 days before, 10:00 restaurant time) and the "picks confirmed" email (2026-10-13).
-- LOCAL: TEST project only until Karan approves prod. Idempotent. Rows are planned and sent only by the server
-- (billing-reminders Edge Function, service role). Staff can read them and re-queue a failed one.

create table if not exists public.billing_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle_id uuid not null references public.tenant_plan_cycles(id) on delete cascade,   -- the month the email is about
  kind text not null check (kind in ('d7','d3','picks_confirmed')),
  send_at timestamptz not null,
  to_email text not null check (length(to_email) <= 200),
  status text not null default 'scheduled' check (status in ('scheduled','sending','sent','failed','skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_id text, error text check (error is null or length(error) <= 300), sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, kind));
create index if not exists billing_reminders_due on public.billing_reminders (send_at) where status = 'scheduled';

alter table public.billing_reminders enable row level security;
drop policy if exists "staff read reminders" on public.billing_reminders;
create policy "staff read reminders" on public.billing_reminders for select to authenticated using ((select app.is_staff()));
drop policy if exists "staff requeue reminders" on public.billing_reminders;
create policy "staff requeue reminders" on public.billing_reminders for update to authenticated
  using ((select app.is_staff())) with check ((select app.is_staff()));
revoke all on public.billing_reminders from anon, authenticated;
grant select on public.billing_reminders to authenticated;
grant update (status, attempts, error, to_email, send_at) on public.billing_reminders to authenticated;

-- Staff may only put a failed or skipped reminder back in the queue (optionally with a fixed address).
create or replace function app.guard_reminder_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  -- server code (service role) and the system's own queueing (reminders.path) are not held to the staff rule
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') or coalesce(current_setting('reminders.path', true), '') = 'system' then return new; end if;
  if not (old.status in ('failed', 'skipped') and new.status = 'scheduled') then
    raise exception 'only-requeue: a staff member can only re-queue a failed or skipped reminder' using errcode = '42501'; end if;
  if new.to_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'bad-email' using errcode = '22023'; end if;
  new.attempts := 0; new.error := null; new.send_at := greatest(now(), new.send_at);
  insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, app.jwt_sub(), 'reminder_requeued',
    jsonb_build_object('reminder', new.id, 'kind', new.kind, 'email_changed', new.to_email is distinct from old.to_email));
  return new;
end $$;
drop trigger if exists billing_reminders_guard on public.billing_reminders;
create trigger billing_reminders_guard before update on public.billing_reminders for each row execute function app.guard_reminder_update();

-- Where emails go: the client record's signed-in owner (doc.user.email). Never hard-coded.
create or replace function app.tenant_email(p_tenant uuid) returns text language sql stable security definer set search_path = '' as $$
  select nullif(lower(btrim(t.doc -> 'user' ->> 'email')), '') from public.tenants t where t.id = p_tenant
$$;
create or replace function app.mask_email(p text) returns text language sql immutable set search_path = '' as $$
  select case when p is null or position('@' in p) < 2 then 'no address' else left(p, 1) || '***' || substr(p, position('@' in p)) end
$$;

-- Queue the "picks confirmed" email: when a client confirms in the picker, or when staff ask to email a copy.
create or replace function app.queue_picks_confirmed(p_cycle uuid) returns void language plpgsql security definer set search_path = '' as $$
declare c public.tenant_plan_cycles; mail text;
begin
  select * into c from public.tenant_plan_cycles where id = p_cycle;
  if c.id is null then return; end if;
  mail := app.tenant_email(c.tenant_id);
  perform set_config('reminders.path', 'system', true);
  insert into public.billing_reminders (tenant_id, cycle_id, kind, send_at, to_email, status, error)
  values (c.tenant_id, c.id, 'picks_confirmed', now(), coalesce(mail, ''), case when mail is null then 'skipped' else 'scheduled' end,
          case when mail is null then 'no email on file' end)
  on conflict (cycle_id, kind) do update set send_at = now(), to_email = excluded.to_email, status = excluded.status,
    attempts = 0, error = excluded.error, provider_id = null, sent_at = null
    where public.billing_reminders.status <> 'sending';
  perform set_config('reminders.path', '', true);
end $$;
create or replace function app.cycle_picks_confirmed() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'client_picker' and (tg_op = 'INSERT' or new.picks is distinct from old.picks or new.plan_id is distinct from old.plan_id
       or new.website_option is distinct from old.website_option or old.source <> 'client_picker' or new.confirmed_at is distinct from old.confirmed_at) then
    perform app.queue_picks_confirmed(new.id);
  end if;
  return null;
end $$;
drop trigger if exists tenant_plan_cycles_confirmed on public.tenant_plan_cycles;
create trigger tenant_plan_cycles_confirmed after insert or update on public.tenant_plan_cycles
  for each row execute function app.cycle_picks_confirmed();

create or replace function public.email_cycle_copy(p_cycle uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_staff() or app.jwt_sub() is null then raise exception 'not-staff' using errcode = '42501'; end if;
  perform app.queue_picks_confirmed(p_cycle);
end $$;
revoke all on function public.email_cycle_copy(uuid) from public, anon;
grant execute on function public.email_cycle_copy(uuid) to authenticated;

-- Plan the 7 and 3 day reminders for every client's next bill (rolls the months first, so next month exists).
-- send_at = (next bill date - N days) at 10:00 on the restaurant's clock. Paused or archived clients: skipped.
-- A reminder planned more than 12 hours after its time (for example a client added 2 days before a bill) is skipped.
create or replace function public.plan_billing_reminders() returns jsonb language plpgsql security definer set search_path = '' as $$
declare t record; cur public.tenant_plan_cycles; nxt public.tenant_plan_cycles; k text; n int; at timestamptz; mail text; planned int := 0; roll jsonb;
begin
  roll := public.roll_plan_cycles();
  for t in select id, status from public.tenants where status <> 'archived' loop
    select * into cur from public.tenant_plan_cycles where tenant_id = t.id and state = 'active' order by period_start desc limit 1;
    continue when cur.id is null;
    select * into nxt from public.tenant_plan_cycles where tenant_id = t.id and period_start = cur.period_end;
    continue when nxt.id is null;
    mail := app.tenant_email(t.id);
    foreach k in array array['d7', 'd3'] loop
      n := case k when 'd7' then 7 else 3 end;
      at := ((nxt.period_start - n) + time '10:00') at time zone app.tenant_tz(t.id);
      insert into public.billing_reminders (tenant_id, cycle_id, kind, send_at, to_email, status, error)
      values (t.id, nxt.id, k, at, coalesce(mail, ''),
              case when t.status <> 'active' or mail is null or at < now() - interval '12 hours' then 'skipped' else 'scheduled' end,
              case when t.status <> 'active' then 'client is ' || t.status when mail is null then 'no email on file'
                   when at < now() - interval '12 hours' then 'planned after its time' end)
      on conflict (cycle_id, kind) do nothing;
      if found then
        planned := planned + 1;
        if mail is null and t.status = 'active' then
          perform public.open_dashboard_exception(t.id, null, 'reminder', k || ':' || nxt.id::text, 'warning', 'reminder_failed',
            'No email on file, so the ' || n || ' day bill reminder cannot go out.', null);
        end if;
      end if;
    end loop;
  end loop;
  return roll || jsonb_build_object('planned', planned);
end $$;

-- The sender takes due rows (marks them sending) with what the email needs. A row stuck in sending for 30 minutes
-- (a crash mid-send) is taken again.
create or replace function public.claim_billing_reminders(p_limit integer default 20) returns table (
  id uuid, tenant_id uuid, kind text, to_email text, attempts integer, restaurant text, first_name text, tz text,
  bill_date date, change_by date, plan_now text, plan_now_name text, picks_now text[], plan_next text, plan_next_name text,
  picks_next text[], next_source text, website_option_next text, price_next_minor integer, currency text)
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('reminders.path', 'system', true);
  return query
  with due as (
    select r.id from public.billing_reminders r
     where (r.status = 'scheduled' and r.send_at <= now()) or (r.status = 'sending' and r.updated_at < now() - interval '30 minutes')
     order by r.send_at limit greatest(1, least(p_limit, 50)) for update skip locked),
  took as (update public.billing_reminders r set status = 'sending', updated_at = now() from due where r.id = due.id returning r.*)
  select k.id, k.tenant_id, k.kind, k.to_email, k.attempts, t.name, t.doc -> 'user' ->> 'firstName', app.tenant_tz(t.id),
         n.period_start, n.period_start - 1, c.plan_id, pc.name, c.picks, n.plan_id, pn.name, n.picks, n.source, n.website_option,
         pn.price_minor, pn.currency
    from took k join public.tenant_plan_cycles n on n.id = k.cycle_id join public.tenants t on t.id = k.tenant_id
    left join public.tenant_plan_cycles c on c.tenant_id = k.tenant_id and c.period_end = n.period_start
    left join public.plans pc on pc.id = c.plan_id left join public.plans pn on pn.id = n.plan_id;
end $$;

-- Dry run: what is due, rendered by the function, with nothing claimed or changed.
create or replace function public.peek_billing_reminders(p_limit integer default 20) returns table (
  id uuid, tenant_id uuid, kind text, to_email text, attempts integer, restaurant text, first_name text, tz text,
  bill_date date, change_by date, plan_now text, plan_now_name text, picks_now text[], plan_next text, plan_next_name text,
  picks_next text[], next_source text, website_option_next text, price_next_minor integer, currency text)
language sql stable security definer set search_path = '' as $$
  select k.id, k.tenant_id, k.kind, k.to_email, k.attempts, t.name, t.doc -> 'user' ->> 'firstName', app.tenant_tz(t.id),
         n.period_start, n.period_start - 1, c.plan_id, pc.name, c.picks, n.plan_id, pn.name, n.picks, n.source, n.website_option,
         pn.price_minor, pn.currency
    from public.billing_reminders k join public.tenant_plan_cycles n on n.id = k.cycle_id join public.tenants t on t.id = k.tenant_id
    left join public.tenant_plan_cycles c on c.tenant_id = k.tenant_id and c.period_end = n.period_start
    left join public.plans pc on pc.id = c.plan_id left join public.plans pn on pn.id = n.plan_id
   where k.status = 'scheduled' and k.send_at <= now()
   order by k.send_at limit greatest(1, least(p_limit, 50))
$$;

-- The sender reports back. Failures retry up to 3 times, 15 minutes apart, then fail and open reminder_failed.
create or replace function public.finish_billing_reminder(p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.billing_reminders;
begin
  perform set_config('reminders.path', 'system', true);
  select * into r from public.billing_reminders where id = p_id for update;
  if r.id is null or r.status <> 'sending' then return 'ignored'; end if;
  if p_ok then
    update public.billing_reminders set status = 'sent', sent_at = now(), provider_id = left(p_provider_id, 120), error = null where id = p_id;
    return 'sent';
  end if;
  if r.attempts + 1 < 3 then
    update public.billing_reminders set status = 'scheduled', attempts = r.attempts + 1, error = left(p_error, 300), send_at = now() + interval '15 minutes'
     where id = p_id;
    return 'retry';
  end if;
  update public.billing_reminders set status = 'failed', attempts = r.attempts + 1, error = left(p_error, 300) where id = p_id;
  perform public.open_dashboard_exception(r.tenant_id, null, 'reminder', r.id::text, 'warning', 'reminder_failed',
    'Reminder ' || r.kind || ' to ' || app.mask_email(r.to_email) || ' failed', null);
  return 'failed';
end $$;

-- The reminder job's own lease (not the Dashboard Manager's).
create table if not exists public.job_leases (
  name text primary key, holder text, held_until timestamptz not null default 'epoch');
alter table public.job_leases enable row level security;
revoke all on public.job_leases from anon, authenticated;
create or replace function public.take_job_lease(p_name text, p_holder text, p_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.job_leases (name) values (p_name) on conflict (name) do nothing;
  update public.job_leases set holder = p_holder, held_until = now() + make_interval(secs => least(greatest(p_seconds, 10), 900))
   where name = p_name and (held_until < now() or holder = p_holder);
  return found;
end $$;
create or replace function public.release_job_lease(p_name text, p_holder text) returns void
language sql security definer set search_path = '' as $$
  update public.job_leases set held_until = 'epoch' where name = p_name and holder = p_holder
$$;

revoke all on function public.plan_billing_reminders(), public.claim_billing_reminders(integer), public.peek_billing_reminders(integer),
  public.finish_billing_reminder(uuid, boolean, text, text), public.take_job_lease(text, text, integer),
  public.release_job_lease(text, text) from public, anon, authenticated;
grant execute on function public.plan_billing_reminders(), public.claim_billing_reminders(integer), public.peek_billing_reminders(integer),
  public.finish_billing_reminder(uuid, boolean, text, text), public.take_job_lease(text, text, integer),
  public.release_job_lease(text, text) to service_role;
revoke all on function app.queue_picks_confirmed(uuid), app.tenant_email(uuid) from public, anon, authenticated;
