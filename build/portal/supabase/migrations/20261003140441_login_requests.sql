-- A client asks for a login for someone on their team (a manager, say). It is only a request: logins
-- are still created only from the agency console, by the team.
create table public.login_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.my_tenant() references public.tenants(id) on delete cascade,
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  email text not null check (length(email) <= 200 and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  role text check (role is null or length(role) <= 60),
  note text check (note is null or length(note) <= 500),
  by_user text not null default app.jwt_sub(),
  by_name text check (by_name is null or length(by_name) <= 100),
  status text not null default 'pending' check (status in ('pending', 'granted', 'declined')),
  at timestamptz not null default now(),
  decided_at timestamptz
);
create index login_requests_tenant on public.login_requests (tenant_id, at desc);
alter table public.login_requests enable row level security;

create policy "a client asks for a login for its own restaurant" on public.login_requests for insert to authenticated
  with check (tenant_id = (select app.my_tenant()) and by_user = (select app.jwt_sub()) and status = 'pending' and decided_at is null);
create policy "a client sees its own asks; staff see all" on public.login_requests for select to authenticated
  using ((select app.is_staff()) or tenant_id = (select app.my_tenant()));
create policy "staff answer login asks" on public.login_requests for update to authenticated
  using ((select app.is_staff())) with check ((select app.is_staff()));

grant select, insert, update on public.login_requests to authenticated;
