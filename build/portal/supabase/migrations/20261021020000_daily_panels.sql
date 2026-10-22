-- Today at <restaurant> (2026-10-21, Karan's brief items 26, 27, 30, 44). TEST PROJECT ONLY until Karan approves prod.
-- Idempotent (run twice). Needs 20261021010000_client_emails.sql (the failure alert goes through its queue).
--
-- One row per restaurant per day (the restaurant's own clock: app.tenant_tz, doc.timezone, else America/Winnipeg), built once
-- early in the morning (from 06:00 local) by pg_cron, from REAL data only:
--   tiles   the last full day's verified, client-visible numbers (results whose period is exactly that one day), each
--           {id, label, value, unit, yesterday, source, sourceDay}: customers (bookings and orders), leads (calls + messages
--           + form fills), adSpend (what the restaurant paid Meta and Google; never a Domin8te price). A tile appears only
--           when that day has a number and its source is not listed as disconnected. Never estimated, never 0 for missing.
--           sourceDay = the day the number is for (the day before the panel's day); yesterday = the number for the day before
--           sourceDay (null when there is none); about = one plain line on where the number is from.
--   changed one plain line from real events on sourceDay (updates posted, posts, reviews answered, ads started or ended,
--           jobs finished, new results), or an honest "nothing new" line naming that day.
--   missed  {customers, period, source} from last month's verified missed_calls + unanswered_messages, else null.
-- Running it again the same day for the same restaurant changes nothing (logged as noop). A failure marks the day failed,
-- logs it, and queues one alert to Karan's admin address (notify_team_email) at once. The client then sees "updating" for
-- today, never an older day.
--
-- Check-in (item 30): tenants.next_checkin (date) and tenants.checkin_every_days (default 14). app.next_checkin() falls back to
-- the record's meeting date (doc.meeting.at) when next_checkin is not set. Staff RPCs: set_next_checkin, mark_checkin_done.
--
-- Rollback: select cron.unschedule('daily_panels_quarter_hour');
--   drop function public.client_today_panel(uuid), public.build_daily_panels(), public.set_next_checkin(uuid, date, integer),
--     public.mark_checkin_done(uuid), app.build_daily_panel(uuid, date), app.daily_panel_content(uuid, date),
--     app.day_value(uuid, text, date), app.month_value(uuid, text, date), app.panel_tile(uuid, text, date);
--   drop table public.daily_panel_runs, public.daily_panels;
--   create or replace function app.next_checkin(p_tenant uuid) returns date language sql stable security definer set search_path = '' as 'select null::date';
--   alter table public.tenants drop column next_checkin, drop column checkin_every_days;

-- ===== check-in =========================================================================================================
alter table public.tenants add column if not exists next_checkin date;
alter table public.tenants add column if not exists checkin_every_days integer not null default 14;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_checkin_every_days_check') then
    alter table public.tenants add constraint tenants_checkin_every_days_check check (checkin_every_days between 1 and 90);
  end if;
end $$;

create or replace function app.next_checkin(p_tenant uuid) returns date language sql stable security definer set search_path = '' as $$
  select coalesce(t.next_checkin,
    case when coalesce(t.doc -> 'meeting' ->> 'at', '') ~ '^\d{4}-\d{2}-\d{2}' and coalesce(t.doc -> 'meeting' ->> 'status', '') <> 'cancelled'
         then left(t.doc -> 'meeting' ->> 'at', 10)::date end)
  from public.tenants t where t.id = p_tenant
$$;
revoke all on function app.next_checkin(uuid) from public, anon, authenticated;

create or replace function public.set_next_checkin(p_tenant uuid, p_next date, p_every_days integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.tenants;
begin
  if not app.is_staff() or app.jwt_sub() is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if p_every_days is not null and (p_every_days < 1 or p_every_days > 90) then raise exception 'bad-every' using errcode = '22023'; end if;
  update public.tenants set next_checkin = p_next, checkin_every_days = coalesce(p_every_days, checkin_every_days) where id = p_tenant returning * into r;
  if r.id is null then raise exception 'not-found' using errcode = 'P0002'; end if;
  insert into public.audit_log (tenant_id, actor, action, detail) values (p_tenant, app.jwt_sub(), 'checkin_set',
    jsonb_build_object('next', p_next, 'every_days', r.checkin_every_days));
  return jsonb_build_object('next_checkin', r.next_checkin, 'checkin_every_days', r.checkin_every_days);
end $$;

-- Karan held the check-in: the next one is checkin_every_days after today (restaurant's clock).
create or replace function public.mark_checkin_done(p_tenant uuid) returns date
language plpgsql security definer set search_path = '' as $$
declare d date;
begin
  if not app.is_staff() or app.jwt_sub() is null then raise exception 'not-staff' using errcode = '42501'; end if;
  update public.tenants set next_checkin = app.tenant_today(id) + checkin_every_days where id = p_tenant returning next_checkin into d;
  if d is null then raise exception 'not-found' using errcode = 'P0002'; end if;
  insert into public.audit_log (tenant_id, actor, action, detail) values (p_tenant, app.jwt_sub(), 'checkin_done', jsonb_build_object('next', d));
  return d;
end $$;
revoke all on function public.set_next_checkin(uuid, date, integer), public.mark_checkin_done(uuid) from public, anon;
grant execute on function public.set_next_checkin(uuid, date, integer), public.mark_checkin_done(uuid) to authenticated;

-- ===== tables ===========================================================================================================
create table if not exists public.daily_panels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  day date not null,
  tiles jsonb not null default '[]'::jsonb check (jsonb_typeof(tiles) = 'array'),
  changed text check (changed is null or length(changed) <= 400),
  missed jsonb,
  status text not null check (status in ('ready', 'failed')),
  error text check (error is null or length(error) <= 300),
  built_at timestamptz not null default now(),
  unique (tenant_id, day));
alter table public.daily_panels enable row level security;
drop policy if exists "client reads own ready panels; staff read all" on public.daily_panels;
create policy "client reads own ready panels; staff read all" on public.daily_panels for select to authenticated
  using ((select app.is_staff()) or (status = 'ready' and tenant_id = (select app.my_tenant())));
revoke all on public.daily_panels from anon, authenticated;
grant select on public.daily_panels to authenticated;

create table if not exists public.daily_panel_runs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  day date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result text not null check (result in ('ok', 'noop', 'failed')),
  error text check (error is null or length(error) <= 300));
create index if not exists daily_panel_runs_tenant_day on public.daily_panel_runs (tenant_id, day);
alter table public.daily_panel_runs enable row level security;
drop policy if exists "staff read panel runs" on public.daily_panel_runs;
create policy "staff read panel runs" on public.daily_panel_runs for select to authenticated using ((select app.is_staff()));
revoke all on public.daily_panel_runs from anon, authenticated;
grant select on public.daily_panel_runs to authenticated;

-- ===== numbers ==========================================================================================================
-- One verified, client-visible number for exactly one day (period start = end = p_day).
create or replace function app.day_value(p_tenant uuid, p_metric text, p_day date) returns numeric
language sql stable security definer set search_path = '' as $$
  select (i.content ->> 'value')::numeric from public.client_dashboard_items i
   where i.tenant_id = p_tenant and i.item_kind = 'result' and i.client_visible and i.hidden_at is null
     and i.verification_status = 'verified'
     and coalesce(i.content ->> 'metric', split_part(i.external_id, ':', 1)) = p_metric
     and i.reporting_period_start = p_day and i.reporting_period_end = p_day
     and (i.content ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$'
   order by i.verified_at desc nulls last limit 1
$$;
-- One verified number for exactly one calendar month (p_month = its first day).
create or replace function app.month_value(p_tenant uuid, p_metric text, p_month date) returns numeric
language sql stable security definer set search_path = '' as $$
  select (i.content ->> 'value')::numeric from public.client_dashboard_items i
   where i.tenant_id = p_tenant and i.item_kind = 'result' and i.client_visible and i.hidden_at is null
     and i.verification_status = 'verified'
     and coalesce(i.content ->> 'metric', split_part(i.external_id, ':', 1)) = p_metric
     and i.reporting_period_start = p_month and i.reporting_period_end = (p_month + interval '1 month' - interval '1 day')::date
     and (i.content ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$'
   order by i.verified_at desc nulls last limit 1
$$;

-- A tile for one day, or null. Sums only the metrics that have a number; null when none do (never 0 for missing).
create or replace function app.panel_tile(p_tenant uuid, p_tile text, p_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare metrics text[]; srcs text[]; lbl text; unit_ text; m text; v numeric; tot numeric; used text[] := '{}';
        prev numeric; pv numeric; listed boolean; connected boolean;
begin
  case p_tile
    when 'customers' then metrics := array['website_bookings', 'online_orders', 'bookings', 'orders', 'customers', 'reservations'];
                          srcs := array['booking', 'orders', 'pos']; lbl := 'Bookings and orders'; unit_ := 'customers';
    when 'leads' then metrics := array['google_calls', 'calls', 'messages_received', 'form_fills', 'ads_leads'];
                      srcs := array['gbp', 'meta-ads', 'google-ads', 'facebook', 'instagram', 'analytics']; lbl := 'New leads (calls, messages and forms)'; unit_ := 'leads';
    when 'adSpend' then metrics := array['meta_ad_spend', 'google_ad_spend', 'ad_spend'];
                        srcs := array['meta-ads', 'google-ads']; lbl := 'Ad spend (paid to Meta and Google)'; unit_ := 'CAD';
    else return null;
  end case;
  -- a source listed on the record but none of them connected: no tile
  select count(*) > 0, coalesce(bool_or(s ->> 'status' = 'connected'), false) into listed, connected
    from public.tenants t, jsonb_array_elements(case when jsonb_typeof(t.doc -> 'sources') = 'array' then t.doc -> 'sources' else '[]'::jsonb end) s
   where t.id = p_tenant and s ->> 'id' = any (srcs);
  if listed and not connected then return null; end if;
  foreach m in array metrics loop
    v := app.day_value(p_tenant, m, p_day);
    if v is not null then tot := coalesce(tot, 0) + v; used := used || m; end if;
    pv := app.day_value(p_tenant, m, p_day - 1);
    if pv is not null then prev := coalesce(prev, 0) + pv; end if;
  end loop;
  if tot is null then return null; end if;
  if p_tile = 'customers' then
    lbl := case
      when used && array['customers'] then 'Customers'
      when not (used && array['online_orders', 'orders']) then 'Bookings'
      when not (used && array['website_bookings', 'bookings', 'reservations']) then 'Orders'
      else 'Bookings and orders' end;
  end if;
  return jsonb_build_object('id', p_tile, 'label', lbl, 'value', trim_scale(tot), 'unit', unit_,
    'yesterday', case when prev is null then null else trim_scale(prev) end, 'source', array_to_string(used, '+'), 'sourceDay', p_day,
    'about', 'A checked number for ' || to_char(p_day, 'Dy FMDD Mon') || '.');
end $$;

-- The panel's content for day p_day: {tiles, changed, missed}. Pure read; raises on bad input.
create or replace function app.daily_panel_content(p_tenant uuid, p_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tenants; src date := p_day - 1; tz text := app.tenant_tz(p_tenant);
        from_ts timestamptz; to_ts timestamptz; tiles jsonb := '[]'::jsonb; x jsonb; k text;
        bits text[] := '{}'; v numeric; n integer; titles text[]; leads jsonb; missed jsonb; mm numeric; mu numeric; prev_month date;
        line text; daytxt text; ads_running boolean;
begin
  if p_day is null then raise exception 'no-day' using errcode = '22023'; end if;
  select * into t from public.tenants where id = p_tenant;
  if t.id is null then raise exception 'no-such-client' using errcode = 'P0002'; end if;
  if coalesce(current_setting('daily_panel.fail_tenant', true), '') = p_tenant::text then
    raise exception 'forced test failure' using errcode = 'P0001'; end if;
  from_ts := (src::timestamp) at time zone tz; to_ts := ((src + 1)::timestamp) at time zone tz;
  daytxt := to_char(src, 'Dy FMDD Mon');

  foreach k in array array['customers', 'leads', 'adSpend'] loop
    x := app.panel_tile(p_tenant, k, src);
    if x is not null then tiles := tiles || jsonb_build_array(x); end if;
    if k = 'leads' then leads := x; end if;
  end loop;

  -- What changed on that day, from real events only.
  select array_agg(btrim(regexp_replace(u ->> 'title', '[.\s]+$', '')) || '.' order by u ->> 'title') into titles
    from jsonb_array_elements(case when jsonb_typeof(t.doc -> 'updates') = 'array' then t.doc -> 'updates' else '[]'::jsonb end) u
   where left(coalesce(u ->> 'date', ''), 10) = to_char(src, 'YYYY-MM-DD') and coalesce(btrim(u ->> 'title'), '') <> '';
  if titles is not null then bits := bits || titles[1:2]; end if;
  v := coalesce(app.day_value(p_tenant, 'posts_published', src), app.day_value(p_tenant, 'specials_posted', src));
  if v is not null and v > 0 then bits := bits || (case when v = 1 then 'A new post went live.' else trim_scale(v)::text || ' posts went live.' end); end if;
  v := app.day_value(p_tenant, 'reviews_answered', src);
  if v is not null and v > 0 then bits := bits || (case when v = 1 then '1 review answered.' else trim_scale(v)::text || ' reviews answered.' end); end if;
  for x in select c from jsonb_array_elements(case when jsonb_typeof(t.doc -> 'campaigns') = 'array' then t.doc -> 'campaigns' else '[]'::jsonb end) c loop
    if left(coalesce(x ->> 'from', ''), 10) = to_char(src, 'YYYY-MM-DD') and coalesce(x ->> 'status', '') not in ('planned', 'cancelled') then
      bits := bits || ('Ads started: ' || coalesce(x ->> 'name', 'a new campaign') || '.'); end if;
    if left(coalesce(x ->> 'to', ''), 10) = to_char(src, 'YYYY-MM-DD') and coalesce(x ->> 'status', '') <> 'cancelled' then
      bits := bits || ('Ads ended: ' || coalesce(x ->> 'name', 'a campaign') || '.'); end if;
  end loop;
  select count(*) into n from public.tasks k where k.tenant_id = p_tenant and k.client_visible and k.visibility_decided_at is not null
     and k.deleted_at is null and k.status = 'done' and k.updated_at >= from_ts and k.updated_at < to_ts;
  if n > 0 then bits := bits || (case when n = 1 then '1 job finished.' else n || ' jobs finished.' end); end if;
  select count(*) into n from public.client_dashboard_items i where i.tenant_id = p_tenant and i.item_kind = 'result' and i.client_visible
     and i.hidden_at is null and i.published_at >= from_ts and i.published_at < to_ts;
  if n > 0 then bits := bits || (case when n = 1 then 'A new number is on your Results page.' else n || ' new numbers are on your Results page.' end); end if;
  bits := bits[1:3];

  select coalesce(bool_or(coalesce(c ->> 'status', '') in ('running', 'live', 'active')
            or (coalesce(c ->> 'status', '') not in ('planned', 'complete', 'cancelled', 'paused')
                and left(coalesce(c ->> 'from', ''), 10) <> '' and left(c ->> 'from', 10) <= to_char(src, 'YYYY-MM-DD')
                and (coalesce(c ->> 'to', '') = '' or left(c ->> 'to', 10) >= to_char(src, 'YYYY-MM-DD')))), false)
    into ads_running
    from jsonb_array_elements(case when jsonb_typeof(t.doc -> 'campaigns') = 'array' then t.doc -> 'campaigns' else '[]'::jsonb end) c;

  if cardinality(bits) > 0 then
    line := array_to_string(bits, ' ');
    if leads is not null and (leads ->> 'value')::numeric = 0 then
      line := 'No new leads on ' || daytxt || ', but ' || lower(left(line, 1)) || substr(line, 2);
    end if;
  elsif leads is not null and (leads ->> 'value')::numeric = 0 then
    line := 'No new leads on ' || daytxt || '.' || case when ads_running then ' Your ads are running as planned.' else '' end;
  else
    line := 'Nothing new on ' || daytxt || '.' || case when ads_running then ' Your ads are running as planned.' else '' end;
  end if;

  -- Missed customers last month, only from real numbers.
  prev_month := date_trunc('month', p_day - interval '1 month')::date;
  mm := app.month_value(p_tenant, 'missed_calls', prev_month);
  mu := app.month_value(p_tenant, 'unanswered_messages', prev_month);
  if mm is not null or mu is not null then
    missed := jsonb_build_object('customers', trim_scale(coalesce(mm, 0) + coalesce(mu, 0)), 'period', to_char(prev_month, 'YYYY-MM'),
      'source', concat_ws('+', case when mm is not null then 'missed_calls' end, case when mu is not null then 'unanswered_messages' end));
  end if;

  return jsonb_build_object('tiles', tiles, 'changed', left(line, 400), 'missed', missed);
end $$;

-- ===== build one panel: idempotent, every run logged, a failure alerts Karan =============================================
create or replace function app.build_daily_panel(p_tenant uuid, p_day date) returns text
language plpgsql security definer set search_path = '' as $$
declare started timestamptz := clock_timestamp(); c jsonb; err text; restaurant text;
begin
  perform pg_advisory_xact_lock(hashtext('daily_panel:' || p_tenant::text || ':' || p_day::text));
  if exists (select 1 from public.daily_panels where tenant_id = p_tenant and day = p_day and status = 'ready') then
    insert into public.daily_panel_runs (tenant_id, day, started_at, finished_at, result) values (p_tenant, p_day, started, clock_timestamp(), 'noop');
    return 'noop';
  end if;
  begin
    c := app.daily_panel_content(p_tenant, p_day);
    insert into public.daily_panels as d (tenant_id, day, tiles, changed, missed, status, error, built_at)
    values (p_tenant, p_day, c -> 'tiles', c ->> 'changed', case when jsonb_typeof(c -> 'missed') = 'object' then c -> 'missed' end, 'ready', null, now())
    on conflict (tenant_id, day) do update set tiles = excluded.tiles, changed = excluded.changed, missed = excluded.missed,
      status = 'ready', error = null, built_at = excluded.built_at;
  exception when others then
    err := left(sqlerrm, 300);
  end;
  if err is null then
    insert into public.daily_panel_runs (tenant_id, day, started_at, finished_at, result) values (p_tenant, p_day, started, clock_timestamp(), 'ok');
    return 'ok';
  end if;
  insert into public.daily_panels as d (tenant_id, day, tiles, changed, missed, status, error, built_at)
  values (p_tenant, p_day, '[]'::jsonb, null, null, 'failed', err, now())
  on conflict (tenant_id, day) do update set tiles = '[]'::jsonb, changed = null, missed = null, status = 'failed', error = excluded.error, built_at = excluded.built_at;
  insert into public.daily_panel_runs (tenant_id, day, started_at, finished_at, result, error) values (p_tenant, p_day, started, clock_timestamp(), 'failed', err);
  select name into restaurant from public.tenants where id = p_tenant;
  -- one alert per restaurant per day, to the admin address only, at once
  perform app.enqueue_client_email(p_tenant, 'alert', 'daily_panel:' || p_tenant::text || ':' || p_day::text,
    jsonb_build_array(jsonb_build_object('kind', 'daily_panel_failed', 'restaurant', restaurant, 'day', p_day, 'error', err)));
  return 'failed';
end $$;

-- The scheduler: every restaurant that is active, whose local time is 06:00 or later, and has no ready panel for its local
-- today. A failed day is tried again on the next run (the alert is sent once). One restaurant failing never stops the rest.
create or replace function public.build_daily_panels() returns jsonb language plpgsql security definer set search_path = '' as $$
declare t record; res text; ok integer := 0; noop integer := 0; bad integer := 0;
begin
  for t in select x.id, app.tenant_today(x.id) as today from public.tenants x
            where x.status = 'active'
              and (now() at time zone app.tenant_tz(x.id))::time >= time '06:00'
              and not exists (select 1 from public.daily_panels d where d.tenant_id = x.id and d.day = app.tenant_today(x.id) and d.status = 'ready')
            order by x.created_at, x.id loop
    begin
      res := app.build_daily_panel(t.id, t.today);
      if res = 'ok' then ok := ok + 1; elsif res = 'noop' then noop := noop + 1; else bad := bad + 1; end if;
    exception when others then
      bad := bad + 1; raise warning 'daily panel for % failed: %', t.id, left(sqlerrm, 200);
    end;
  end loop;
  return jsonb_build_object('ok', ok, 'noop', noop, 'failed', bad);
end $$;

revoke all on function app.day_value(uuid, text, date), app.month_value(uuid, text, date), app.panel_tile(uuid, text, date),
  app.daily_panel_content(uuid, date), app.build_daily_panel(uuid, date) from public, anon, authenticated;
revoke all on function public.build_daily_panels() from public, anon, authenticated;

-- ===== client read ======================================================================================================
-- client_today_panel(): the signed-in client's own restaurant. Staff pass p_tenant (view as client). Never an older day:
-- no ready row for the restaurant's local today = state 'updating' with today's date and no tiles.
create or replace function public.client_today_panel(p_tenant uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t uuid; today date; d public.daily_panels;
begin
  if p_tenant is not null then
    if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
    t := p_tenant;
  else
    t := app.my_tenant();
    if t is null or app.jwt_sub() is null then raise exception 'not-allowed' using errcode = '42501'; end if;
  end if;
  if not exists (select 1 from public.tenants where id = t) then raise exception 'not-found' using errcode = 'P0002'; end if;
  today := app.tenant_today(t);
  select * into d from public.daily_panels where tenant_id = t and day = today and status = 'ready';
  if d.id is null then
    return jsonb_build_object('day', to_char(today, 'YYYY-MM-DD'), 'state', 'updating', 'tiles', '[]'::jsonb, 'changed', null,
      'builtAt', null, 'missed', null, 'checkin', to_char(app.next_checkin(t), 'YYYY-MM-DD'));
  end if;
  return jsonb_build_object('day', to_char(today, 'YYYY-MM-DD'), 'state', 'ready', 'tiles', d.tiles, 'changed', d.changed,
    'builtAt', d.built_at, 'missed', d.missed, 'checkin', to_char(app.next_checkin(t), 'YYYY-MM-DD'));
end $$;
revoke all on function public.client_today_panel(uuid) from public, anon;
grant execute on function public.client_today_panel(uuid) to authenticated;

-- Every 15 minutes; each restaurant is built once its local clock passes 06:00.
do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'daily_panels_quarter_hour';
end $$;
select cron.schedule('daily_panels_quarter_hour', '*/15 * * * *', $$select public.build_daily_panels()$$);
