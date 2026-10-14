-- The client's Home tab sections, written and published by staff (2026-10-13). LOCAL: TEST project only until Karan
-- approves prod. Idempotent. Plain text only. Hidden sections leave the client view at once; every change is audited.

create or replace function app.home_content_ok(c jsonb) returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(c) = 'object'
    and not exists (select 1 from jsonb_object_keys(c) k where k not in ('title', 'body', 'items'))
    and coalesce(jsonb_typeof(c -> 'title'), 'string') = 'string' and length(coalesce(c ->> 'title', '')) <= 120
    and coalesce(jsonb_typeof(c -> 'body'), 'string') = 'string' and length(coalesce(c ->> 'body', '')) <= 2000
    and coalesce(jsonb_typeof(c -> 'items'), 'array') = 'array' and jsonb_array_length(coalesce(c -> 'items', '[]')) <= 12
    and not exists (select 1 from jsonb_array_elements(coalesce(c -> 'items', '[]')) e where jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 200)
$$;

create table if not exists public.client_home_sections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  section text not null check (section in ('running_now','next_month','nothing_to_do','note')),
  content jsonb not null,                      -- {title, body, items[]}: plain text only
  source text not null default 'Domin8te console' check (length(trim(source)) between 1 and 80),
  client_visible boolean not null default false,
  published_at timestamptz, published_by text,
  hidden_at timestamptz, hidden_by text, hidden_reason text check (hidden_reason is null or length(hidden_reason) <= 500),
  updated_at timestamptz not null default now(), updated_by text,
  unique (tenant_id, section),
  constraint home_section_publish check (not client_visible or (published_at is not null and published_by is not null and hidden_at is null)),
  constraint home_section_content check (app.home_content_ok(content)));

create or replace function app.home_section_audit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.client_visible and not old.client_visible then
      new.published_at := now(); new.published_by := coalesce(app.jwt_sub(), new.published_by);
      new.hidden_at := null; new.hidden_by := null; new.hidden_reason := null;
    elsif old.client_visible and not new.client_visible then
      if coalesce(trim(new.hidden_reason), '') = '' then raise exception 'reason-required' using errcode = '22023'; end if;
      new.hidden_at := now(); new.hidden_by := coalesce(app.jwt_sub(), new.hidden_by);
    end if;
  elsif new.client_visible then
    new.published_at := now(); new.published_by := coalesce(app.jwt_sub(), new.published_by);
  end if;
  new.updated_at := now(); new.updated_by := coalesce(app.jwt_sub(), new.updated_by);
  insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, coalesce(app.jwt_sub(), 'system'),
    'home_section_' || lower(tg_op), jsonb_build_object('section', new.section,
      'old', case when tg_op = 'UPDATE' then jsonb_build_object('content', old.content, 'visible', old.client_visible) end,
      'new', jsonb_build_object('content', new.content, 'visible', new.client_visible), 'reason', new.hidden_reason));
  return new;
end $$;
drop trigger if exists client_home_sections_audit on public.client_home_sections;
create trigger client_home_sections_audit before insert or update on public.client_home_sections
  for each row execute function app.home_section_audit();

alter table public.client_home_sections enable row level security;
drop policy if exists "staff manage home" on public.client_home_sections;
create policy "staff manage home" on public.client_home_sections for all to authenticated using ((select app.is_staff())) with check ((select app.is_staff()));
drop policy if exists "client reads visible home" on public.client_home_sections;
create policy "client reads visible home" on public.client_home_sections for select to authenticated
  using (tenant_id = (select app.my_tenant()) and client_visible);
revoke all on public.client_home_sections from anon, authenticated;
grant select on public.client_home_sections to authenticated;
grant insert (tenant_id, section, content, source, client_visible) on public.client_home_sections to authenticated;
grant update (content, source, client_visible, hidden_reason) on public.client_home_sections to authenticated;
