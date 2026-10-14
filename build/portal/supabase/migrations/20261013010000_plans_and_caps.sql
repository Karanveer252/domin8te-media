-- Plans, the pickable services and the monthly caps (2026-10-13). LOCAL: applied to the TEST project only; prod waits
-- for Karan. Idempotent. Prices live here and in the signed-in portal/console only, never on the public site.
-- Proposed numbers (not yet confirmed by Karan) carry proposed = true and are starred in the console.

-- The restaurant's own clock: doc.timezone (an IANA name), else America/Winnipeg. Used for deadlines and reminders.
create or replace function app.tenant_tz(p_tenant uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select case when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = t.doc ->> 'timezone')
                                then t.doc ->> 'timezone' end
                   from public.tenants t where t.id = p_tenant), 'America/Winnipeg')
$$;
create or replace function app.tenant_today(p_tenant uuid) returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone app.tenant_tz(p_tenant))::date
$$;
revoke all on function app.tenant_tz(uuid), app.tenant_today(uuid) from public, anon;
grant execute on function app.tenant_tz(uuid), app.tenant_today(uuid) to authenticated;

create table if not exists public.plans (
  id text primary key check (id in ('starter','growth','domin8te')),
  name text not null,
  price_minor integer not null check (price_minor > 0),
  currency text not null default 'USD',
  picks_allowed integer,                       -- null = every service
  required_services text[] not null default '{}',
  max_clients integer,                         -- null = no cap
  sort integer not null,
  updated_at timestamptz not null default now(),
  updated_by text);
insert into public.plans (id, name, price_minor, picks_allowed, required_services, max_clients, sort) values
  ('starter',  'Starter',   99900, 1,    '{advertising}', null, 1),
  ('growth',   'Growth',   199900, 2,    '{}',            null, 2),
  ('domin8te', 'Domin8te', 349900, null, '{}',            1,    3)
on conflict (id) do update set name = excluded.name, price_minor = excluded.price_minor, picks_allowed = excluded.picks_allowed,
  required_services = excluded.required_services, max_clients = excluded.max_clients, sort = excluded.sort;

create table if not exists public.service_catalog (
  id text primary key check (id in ('website','social','advertising','local','email')),
  label text not null,
  pickable boolean not null default true,
  sort integer not null);
insert into public.service_catalog (id, label, pickable, sort) values
  ('advertising', 'Ads', true, 1), ('social', 'Social media', true, 2), ('website', 'Website', true, 3),
  ('local', 'SEO and Google Maps', true, 4), ('email', 'Email', true, 5)
on conflict (id) do update set label = excluded.label, pickable = excluded.pickable, sort = excluded.sort;

create table if not exists public.plan_caps (
  plan_id text not null references public.plans(id),
  service text not null references public.service_catalog(id),
  metric text not null check (metric ~ '^[a-z_]{3,40}$'),
  label text not null,
  monthly_cap integer not null check (monthly_cap >= 0),
  weekly_hint text,
  proposed boolean not null default false,
  version integer not null default 1 check (version >= 1),
  effective_from date not null default date '2026-11-01',
  created_at timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'sub'),
  primary key (plan_id, service, metric, version));
insert into public.plan_caps (plan_id, service, metric, label, monthly_cap, weekly_hint, proposed) values
  ('starter','social','social_posts','posts',8,'2 a week',false),('growth','social','social_posts','posts',12,'3 a week',false),('domin8te','social','social_posts','posts',16,'4 a week',false),
  ('starter','social','social_reels','Reels',1,null,true),('growth','social','social_reels','Reels',2,null,true),('domin8te','social','social_reels','Reels',4,null,true),
  ('starter','social','social_stories','Stories',0,null,true),('growth','social','social_stories','Stories',8,null,true),('domin8te','social','social_stories','Stories',12,null,true),
  ('starter','advertising','ads_live_campaigns','live campaigns',1,null,false),('growth','advertising','ads_live_campaigns','live campaigns',3,null,false),('domin8te','advertising','ads_live_campaigns','live campaigns',5,null,false),
  ('starter','advertising','ads_new_creatives','new ad designs',2,null,true),('growth','advertising','ads_new_creatives','new ad designs',4,null,true),('domin8te','advertising','ads_new_creatives','new ad designs',6,null,true),
  ('starter','advertising','ads_platforms','platforms',1,null,true),('growth','advertising','ads_platforms','platforms',2,null,true),('domin8te','advertising','ads_platforms','platforms',2,null,true),
  ('starter','website','web_pages','new pages',1,null,false),('starter','website','web_edits','edits',2,null,false),
  ('growth','website','web_pages','new pages',2,null,false),('growth','website','web_edits','edits',5,null,false),
  ('domin8te','website','web_pages','new pages',3,null,true),('domin8te','website','web_edits','edits',8,null,true),
  ('starter','local','seo_google_posts','Google posts',4,null,true),('growth','local','seo_google_posts','Google posts',6,null,true),('domin8te','local','seo_google_posts','Google posts',8,null,true),
  ('starter','local','seo_photos','photos',4,null,true),('growth','local','seo_photos','photos',8,null,true),('domin8te','local','seo_photos','photos',12,null,true),
  ('starter','local','seo_review_replies','review replies',20,null,true),('growth','local','seo_review_replies','review replies',30,null,true),('domin8te','local','seo_review_replies','review replies',40,null,true),
  ('starter','local','seo_jobs','SEO jobs',1,null,true),('growth','local','seo_jobs','SEO jobs',2,null,true),('domin8te','local','seo_jobs','SEO jobs',3,null,true),
  ('starter','email','email_campaigns','email campaigns',2,null,true),('growth','email','email_campaigns','email campaigns',3,null,true),('domin8te','email','email_campaigns','email campaigns',4,null,true),
  ('starter','email','email_automations','automations',0,null,true),('growth','email','email_automations','automations',1,null,true),('domin8te','email','email_automations','automations',2,null,true)
on conflict do nothing;
-- The launch caps (version 1) count from the start, so a month that began before 1 Nov 2026 has caps too. Later edits
-- are new versions starting on a chosen 1st of the month.
update public.plan_caps set effective_from = date '2026-01-01' where version = 1 and effective_from = date '2026-11-01';

-- The cap in force for a plan's metric on a given day: the newest version that has started by then.
create or replace function app.cap_for(p_plan text, p_service text, p_metric text, p_on date) returns public.plan_caps
language sql stable security definer set search_path = '' as $$
  select c.* from public.plan_caps c
  where c.plan_id = p_plan and c.service = p_service and c.metric = p_metric and c.effective_from <= p_on
  order by c.version desc limit 1
$$;
revoke all on function app.cap_for(text, text, text, date) from public, anon;
grant execute on function app.cap_for(text, text, text, date) to authenticated;

-- A cap edit is a NEW version (older months keep the cap they had). Only super admins, and never backdated.
create or replace function app.guard_plan_cap() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then          -- a person (seed rows from migrations skip this)
    if new.effective_from < app.tenant_today(null) then
      raise exception 'a cap change cannot start in the past' using errcode = '22023'; end if;
    if new.version <= coalesce((select max(version) from public.plan_caps where plan_id = new.plan_id and service = new.service and metric = new.metric), 0) then
      raise exception 'a cap change must be a new version' using errcode = '22023'; end if;
  end if;
  new.created_at := now(); new.created_by := coalesce(app.jwt_sub(), new.created_by);
  insert into public.audit_log (tenant_id, actor, action, detail) values (null, coalesce(app.jwt_sub(), 'system'), 'plan_cap_version',
    jsonb_build_object('plan', new.plan_id, 'service', new.service, 'metric', new.metric, 'cap', new.monthly_cap,
                       'version', new.version, 'effective_from', new.effective_from, 'proposed', new.proposed));
  return new;
end $$;
drop trigger if exists plan_caps_guard on public.plan_caps;
create trigger plan_caps_guard before insert on public.plan_caps for each row execute function app.guard_plan_cap();

create or replace function app.guard_plan() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id then raise exception 'a plan id cannot change' using errcode = '22023'; end if;
  new.updated_at := now(); new.updated_by := coalesce(app.jwt_sub(), new.updated_by);
  insert into public.audit_log (tenant_id, actor, action, detail) values (null, coalesce(app.jwt_sub(), 'system'), 'plan_updated',
    jsonb_build_object('plan', new.id, 'old', to_jsonb(old) - 'updated_at' - 'updated_by', 'new', to_jsonb(new) - 'updated_at' - 'updated_by'));
  return new;
end $$;
drop trigger if exists plans_guard on public.plans;
create trigger plans_guard before update on public.plans for each row execute function app.guard_plan();

alter table public.plans enable row level security;
alter table public.service_catalog enable row level security;
alter table public.plan_caps enable row level security;
drop policy if exists "staff read plans" on public.plans;
create policy "staff read plans" on public.plans for select to authenticated using ((select app.is_staff()));
drop policy if exists "super admin edits plans" on public.plans;
create policy "super admin edits plans" on public.plans for update to authenticated
  using ((select app.is_super_admin())) with check ((select app.is_super_admin()));
drop policy if exists "signed in read catalog" on public.service_catalog;
create policy "signed in read catalog" on public.service_catalog for select to authenticated using (true);
drop policy if exists "staff read caps" on public.plan_caps;
create policy "staff read caps" on public.plan_caps for select to authenticated using ((select app.is_staff()));
drop policy if exists "super admin writes caps" on public.plan_caps;
create policy "super admin writes caps" on public.plan_caps for insert to authenticated with check ((select app.is_super_admin()));
-- The client policies on plans and plan_caps (a client reads only its own plans) are in 20261013010100, after
-- tenant_plan_cycles exists.

revoke all on public.plans, public.plan_caps, public.service_catalog from anon, authenticated;
grant select on public.plans, public.plan_caps, public.service_catalog to authenticated;
grant update (name, price_minor, picks_allowed, required_services, max_clients) on public.plans to authenticated;
grant insert (plan_id, service, metric, label, monthly_cap, weekly_hint, proposed, version, effective_from) on public.plan_caps to authenticated;
