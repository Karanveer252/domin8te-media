-- Onboarding intake (2026-10-15, Karan: "automate this workflow ... so the client does not need to wait and I don't need
-- to do everything by hand"). The /onboarding/ form already mails the answers to the studio. Its submit.php now also
-- posts them, server to server, to the onboarding-intake function, which saves one row here. The console shows new rows
-- on Needs you with "Add as client and send login", so nothing is typed twice.
--
-- Who can do what: nobody writes here from a browser. The function writes with the service role. Staff read rows and
-- change only status, tenant_id and decided_* (column grants). Clients never see this table. Re-runnable.

create table if not exists public.onboarding_submissions (
  id uuid primary key default gen_random_uuid(),
  sid text not null unique check (sid ~ '^[A-Za-z0-9-]{8,64}$'),
  at timestamptz not null default now(),
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text check (last_name is null or length(last_name) <= 80),
  email text not null check (length(email) <= 190 and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  mobile text check (mobile is null or length(mobile) <= 60),
  restaurant text not null check (length(trim(restaurant)) between 1 and 160),
  summary text not null check (length(summary) <= 20000),
  answers jsonb check (answers is null or pg_column_size(answers) <= 65536),
  status text not null default 'new' check (status in ('new', 'added', 'dismissed')),
  tenant_id uuid references public.tenants(id) on delete set null,
  decided_at timestamptz,
  decided_by text check (decided_by is null or length(decided_by) <= 100)
);
create index if not exists onboarding_submissions_new on public.onboarding_submissions (at desc) where status = 'new';

alter table public.onboarding_submissions enable row level security;

drop policy if exists "staff read setup forms" on public.onboarding_submissions;
create policy "staff read setup forms" on public.onboarding_submissions for select to authenticated
  using ((select app.is_staff()));
drop policy if exists "staff decide setup forms" on public.onboarding_submissions;
create policy "staff decide setup forms" on public.onboarding_submissions for update to authenticated
  using ((select app.is_staff())) with check ((select app.is_staff()));

revoke all on public.onboarding_submissions from anon, authenticated;
grant select on public.onboarding_submissions to authenticated;
grant update (status, tenant_id, decided_at, decided_by) on public.onboarding_submissions to authenticated;
