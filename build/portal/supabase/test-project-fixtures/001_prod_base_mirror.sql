-- TEST PROJECT ONLY (leuvzsouqsdpdpyjspjr). Never apply to production.
--
-- The test project holds only the dashboard tables and a bare tenants table. Prod's base (from its 15 migrations,
-- which are not in the repo) has tasks, requests, audit_log, tenants.status / multica_project_id and app.jwt_sub().
-- The hardening and cron migrations need those, so this mirrors their shapes as read from prod's catalog on
-- 2026-10-08 (columns, types, defaults, CHECKs, FKs). It leaves out prod's triggers (touch, audit, card/request
-- mirror), which the dashboard manager does not rely on: service-role code writes its own audit_log rows.
-- Idempotent.

alter table public.tenants add column if not exists status text not null default 'active';
alter table public.tenants add column if not exists updated_by text;
alter table public.tenants add column if not exists multica_project_id text;
do $$ begin
  alter table public.tenants add constraint tenants_status_check check (status = any (array['active','paused','archived']));
exception when duplicate_object then null; end $$;

create or replace function app.jwt_sub() returns text language sql stable as $$ select auth.jwt() ->> 'sub' $$;

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service text not null,
  body text not null,
  status text not null default 'review',
  by_user text not null default (auth.jwt() ->> 'sub'),
  by_name text not null default '',
  at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null default 'task' check (kind = any (array['task','request'])),
  request_id uuid references public.requests(id) on delete set null,
  service text,
  title text not null check (length(title) >= 1 and length(title) <= 200),
  detail text not null default '',
  status text not null default 'todo' check (status = any (array['todo','in_progress','in_review','blocked','done','cancelled'])),
  priority text not null default 'none' check (priority = any (array['urgent','high','medium','low','none'])),
  due date,
  position integer not null default 0,
  assignee text,
  multica_issue_id text,
  multica_identifier text,
  multica_status text,
  multica_synced_at timestamptz,
  multica_updated_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete set null,
  actor text,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

alter table public.requests enable row level security;
alter table public.tasks enable row level security;
alter table public.audit_log enable row level security;
drop policy if exists "staff work the board" on public.tasks;
create policy "staff work the board" on public.tasks for all to authenticated using ((select app.is_staff())) with check ((select app.is_staff()));
drop policy if exists "staff read the audit log" on public.audit_log;
create policy "staff read the audit log" on public.audit_log for select to authenticated using ((select app.is_staff()));
drop policy if exists "staff read requests" on public.requests;
create policy "staff read requests" on public.requests for select to authenticated using ((select app.is_staff()));
revoke insert, update, delete on public.audit_log from anon, authenticated;
