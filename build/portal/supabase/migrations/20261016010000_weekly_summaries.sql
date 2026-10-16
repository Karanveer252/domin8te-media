-- The weekly summary on the client's Home (2026-10-16, dashboard usage plan step 2). LOCAL: TEST project only until Karan
-- approves prod. Idempotent. Pure SQL, no network call.
--
-- One row per restaurant per week (Monday to Sunday on the restaurant's own clock): up to three numbers (calls, directions,
-- bookings first) next to the week before, plus what staff recorded (specials posted, reviews answered), and one plain
-- sentence for the console and emails. Only VERIFIED weekly results count: a staff result whose period is exactly that
-- Monday to Sunday. Nothing is guessed; a number with no verified week is left out, and a week with nothing is not saved.
-- The client may read its own rows and mark the newest one opened; nobody writes the rows except the builder.
-- Rollback: select cron.unschedule('weekly_summaries_daily'); drop function public.mark_weekly_opened(uuid);
--   drop function public.rebuild_weekly_summary(uuid, date); drop function public.build_weekly_summaries();
--   drop function app.build_weekly_summary(uuid, date); drop function app.week_value(uuid, text, date); drop table public.weekly_summaries;

create table if not exists public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  numbers jsonb not null default '[]'::jsonb,
  extras jsonb not null default '[]'::jsonb,
  sentence text not null default '',
  built_at timestamptz not null default now(),
  opened_at timestamptz,
  opened_by text,
  constraint weekly_summaries_one_a_week unique (tenant_id, week_start),
  constraint weekly_summaries_monday check (extract(isodow from week_start) = 1 and week_end = week_start + 6)
);
create index if not exists weekly_summaries_tenant_week on public.weekly_summaries (tenant_id, week_start desc);

alter table public.weekly_summaries enable row level security;
drop policy if exists "weekly summaries: own restaurant or staff" on public.weekly_summaries;
create policy "weekly summaries: own restaurant or staff" on public.weekly_summaries for select to authenticated
  using ((select app.is_staff()) or tenant_id = (select app.my_tenant()));
revoke all on public.weekly_summaries from public, anon, authenticated;
grant select on public.weekly_summaries to authenticated;

-- One verified weekly figure: a visible, verified, not hidden result for that metric whose period is exactly the week.
create or replace function app.week_value(p_tenant uuid, p_metric text, p_start date) returns numeric
language sql stable security definer set search_path = '' as $$
  select (i.content ->> 'value')::numeric
    from public.client_dashboard_items i
   where i.tenant_id = p_tenant and i.item_kind = 'result' and i.client_visible and i.hidden_at is null
     and i.verification_status = 'verified'
     and coalesce(i.content ->> 'metric', split_part(i.external_id, ':', 1)) = p_metric
     and i.reporting_period_start = p_start and i.reporting_period_end = p_start + 6
     and (i.content ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$'
   order by i.verified_at desc nulls last
   limit 1
$$;
revoke all on function app.week_value(uuid, text, date) from public, anon, authenticated;

-- Builds (or rebuilds) one restaurant's week. Keeps opened_at, so a rebuild after a late number never hides that the
-- client already looked. Returns null when there is nothing verified to say.
create or replace function app.build_weekly_summary(p_tenant uuid, p_week_start date) returns public.weekly_summaries
language plpgsql security definer set search_path = '' as $$
declare
  k record; v numeric; b numeric;
  nums jsonb := '[]'::jsonb; ex jsonb := '[]'::jsonb;
  s_now text[] := '{}'; s_before text[] := '{}'; s_ex text[] := '{}';
  words text; r public.weekly_summaries;
begin
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then raise exception 'week-must-start-monday' using errcode = '22023'; end if;
  for k in select * from (values
      (1, 'google_calls', 'calls', 'call', 'calls'),
      (2, 'direction_requests', 'directions', 'direction request', 'directions'),
      (3, 'website_bookings', 'bookings', 'booking', 'bookings'),
      (4, 'online_orders', 'orders', 'order', 'orders'),
      (5, 'website_visits', 'visits', 'website visit', 'website visits'),
      (6, 'ads_leads', 'leads', 'lead from ads', 'leads from ads')) as t (ord, metric, id, one, many) order by ord loop
    exit when jsonb_array_length(nums) >= 3;
    v := app.week_value(p_tenant, k.metric, p_week_start);
    continue when v is null;
    b := app.week_value(p_tenant, k.metric, p_week_start - 7);
    nums := nums || jsonb_build_array(jsonb_build_object('id', k.id, 'metric', k.metric, 'now', v, 'before', b));
    s_now := s_now || (trim_scale(v)::text || ' ' || case when v = 1 then k.one else k.many end);
    if b is not null then s_before := s_before || (trim_scale(b)::text || ' ' || case when b = 1 then k.one else k.many end); end if;
  end loop;
  -- What staff recorded for the week, said plainly.
  v := app.week_value(p_tenant, 'specials_posted', p_week_start);
  if v is not null then
    ex := ex || jsonb_build_array(jsonb_build_object('label', 'Specials posted', 'value', case when v > 0 then 'yes' else 'no' end));
    s_ex := s_ex || ('Specials posted: ' || case when v > 0 then 'yes' else 'no' end || '.');
  end if;
  v := app.week_value(p_tenant, 'reviews_answered', p_week_start);
  if v is not null then
    ex := ex || jsonb_build_array(jsonb_build_object('label', 'Reviews answered', 'value', trim_scale(v)::text));
    s_ex := s_ex || ('Reviews answered: ' || trim_scale(v)::text || '.');
  end if;
  -- Nothing verified any more (a number was hidden or rejected): the old row goes, so Home never keeps a stale week.
  if jsonb_array_length(nums) = 0 and jsonb_array_length(ex) = 0 then
    delete from public.weekly_summaries where tenant_id = p_tenant and week_start = p_week_start;
    return null;
  end if;
  -- The week is the last full one: "Last week" is it, "The week before" the one it is compared with.
  words := concat_ws(' ',
    case when cardinality(s_now) > 0 then 'Last week: ' || array_to_string(s_now, ', ') || '.' end,
    case when cardinality(s_before) > 0 then 'The week before: ' || array_to_string(s_before, ', ') || '.' end,
    nullif(array_to_string(s_ex, ' '), ''));
  insert into public.weekly_summaries as w (tenant_id, week_start, week_end, numbers, extras, sentence, built_at)
  values (p_tenant, p_week_start, p_week_start + 6, nums, ex, words, now())
  on conflict (tenant_id, week_start) do update
    set numbers = excluded.numbers, extras = excluded.extras, sentence = excluded.sentence, built_at = excluded.built_at
  returning * into r;
  return r;
end $$;
revoke all on function app.build_weekly_summary(uuid, date) from public, anon, authenticated;

-- The daily job: last full week for every restaurant that is not archived. Daily, not only Mondays, so a number staff
-- verify on Tuesday still reaches that week's summary. One restaurant failing never stops the others.
create or replace function public.build_weekly_summaries() returns integer
language plpgsql security definer set search_path = '' as $$
declare t record; n integer := 0;
begin
  -- Visits older than 180 days are not needed for "last visit" or the quiet flag.
  if to_regclass('public.client_activity') is not null then
    execute 'delete from public.client_activity where kind = ''seen'' and at < now() - interval ''180 days''';
  end if;
  for t in select id from public.tenants where status <> 'archived' order by created_at, id loop
    begin
      -- (.id: a row value IS NOT NULL only when every field is set, and opened_at is usually null)
      if (app.build_weekly_summary(t.id, date_trunc('week', app.tenant_today(t.id) - 7)::date)).id is not null then n := n + 1; end if;
    exception when others then
      raise warning 'weekly summary for % failed: %', t.id, sqlerrm;
    end;
  end loop;
  return n;
end $$;
revoke all on function public.build_weekly_summaries() from public, anon, authenticated;

-- Staff build one restaurant's week now (console). Defaults to the last full week on the restaurant's clock.
create or replace function public.rebuild_weekly_summary(p_tenant uuid, p_week_start date default null) returns public.weekly_summaries
language plpgsql security definer set search_path = '' as $$
declare r public.weekly_summaries;
begin
  if not app.is_staff() or app.jwt_sub() is null then raise exception 'not-staff' using errcode = '42501'; end if;
  r := app.build_weekly_summary(p_tenant, coalesce(p_week_start, date_trunc('week', app.tenant_today(p_tenant) - 7)::date));
  insert into public.audit_log (tenant_id, actor, action, detail) values (p_tenant, app.jwt_sub(), 'weekly_summary_built',
    jsonb_build_object('week_start', coalesce(p_week_start, date_trunc('week', app.tenant_today(p_tenant) - 7)::date), 'saved', r.id is not null));
  return r;
end $$;
revoke all on function public.rebuild_weekly_summary(uuid, date) from public, anon;
grant execute on function public.rebuild_weekly_summary(uuid, date) to authenticated;

-- The client saw this week's summary (Home shows it). Their own restaurant only, never staff (viewing as the client is not
-- the client opening it), first time only. Returns when it was first opened.
create or replace function public.mark_weekly_opened(p_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_tenant(); at timestamptz;
begin
  if app.jwt_sub() is null or t is null or app.is_staff() then raise exception 'not-allowed' using errcode = '42501'; end if;
  update public.weekly_summaries set opened_at = now(), opened_by = app.jwt_sub()
   where id = p_id and tenant_id = t and opened_at is null;
  select opened_at into at from public.weekly_summaries where id = p_id and tenant_id = t;
  if at is null then raise exception 'not-found' using errcode = 'P0002'; end if;
  return at;
end $$;
revoke all on function public.mark_weekly_opened(uuid) from public, anon;
grant execute on function public.mark_weekly_opened(uuid) to authenticated;

-- 13:00 UTC is 8:00 in Winnipeg in summer and 7:00 in winter: the summary is there before a Monday lunch service.
do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'weekly_summaries_daily';
end $$;
select cron.schedule('weekly_summaries_daily', '0 13 * * *', $$select public.build_weekly_summaries()$$);
