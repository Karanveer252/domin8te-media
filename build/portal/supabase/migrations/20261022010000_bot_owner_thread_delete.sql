-- Ask bots: delete a chat or a thread (2026-10-22, Karan: "Give me a delete button for chats and threads", then "I want the delete
-- button to delete the entire thread, not just clear the messages"). TEST PROJECT FIRST; prod on Karan's word (prodmig.py).
-- Idempotent (run twice).
--
-- bot_owner_thread_delete(id): the owner's own threads only, the same gate and the same "unknown function" answer for anyone else
-- as the other bot_owner_* functions. Every thread goes, with every message in it: a chat or thread Karan made, and also the three
-- a client is seeded with (General, Photos & social, Website changes).
--
-- app.bot_owner_seed() puts those three back whenever one is missing, on every list. So a deleted one is written down in
-- public.bot_owner_removed (client slug + kind, with the client's id and name) and the seed skips it. A client whose threads are all
-- deleted leaves the side list but stays in the New chat picker (bot_owner_clients), and a chat started for it keeps its client link
-- (app.bot_owner_project also looks in bot_owner_removed).

create table if not exists public.bot_owner_removed (
  client_slug text not null,
  kind        text not null check (kind in ('general', 'photos_social', 'website')),
  removed_at  timestamptz not null default now(),
  primary key (client_slug, kind)
);
alter table public.bot_owner_removed enable row level security;
revoke all on public.bot_owner_removed from anon, authenticated;
alter table public.bot_owner_removed add column if not exists tenant_id uuid;
alter table public.bot_owner_removed add column if not exists client_name text;

-- a client's project: from its threads, else from a deleted default thread, else a new project (as before)
create or replace function app.bot_owner_project(p_slug text, p_name text)
returns table(tenant_id uuid, client_slug text, client_name text)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  s text := lower(btrim(coalesce(p_slug, '')));
  n text := btrim(coalesce(p_name, ''));
begin
  return query
    select th.tenant_id, th.client_slug, coalesce(tn.name, th.client_name)
    from public.bot_owner_threads th left join public.tenants tn on tn.id = th.tenant_id
    where th.client_slug = s order by th.created_at limit 1;
  if found then return; end if;
  return query
    select r.tenant_id, r.client_slug, coalesce(tn.name, r.client_name, n)
    from public.bot_owner_removed r left join public.tenants tn on tn.id = r.tenant_id
    where r.client_slug = s and coalesce(tn.status, 'active') <> 'archived' order by r.removed_at desc limit 1;
  if found then return; end if;
  if s ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(s) <= 80 and length(n) between 1 and 200 then
    return query select null::uuid, s, n;
  end if;
end $$;

-- the seed, as before, but a default thread Karan deleted stays deleted
create or replace function app.bot_owner_seed()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  t record; slug text; base text;
begin
  for t in select x.id, x.name, nullif(btrim(x.doc->>'router_slug'), '') as router_slug
           from public.tenants x where x.status <> 'archived' order by x.created_at, x.id loop
    select th.client_slug into slug from public.bot_owner_threads th where th.tenant_id = t.id order by th.created_at limit 1;
    if slug is null then   -- every thread deleted: keep the name the deletions were written down under
      select r.client_slug into slug from public.bot_owner_removed r where r.tenant_id = t.id order by r.removed_at limit 1;
    end if;
    if slug is null then
      base := coalesce(case when t.router_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(t.router_slug) <= 80 then t.router_slug end,
                       app.bot_owner_slug(t.name), 'client');
      slug := base;
      -- a slug already used by another client (or the agency) gets a short, stable suffix from the tenant id
      if base = 'domin8te-media' or exists (select 1 from public.bot_owner_threads th where th.client_slug = base and th.tenant_id is distinct from t.id) then
        slug := base || '-' || left(replace(t.id::text, '-', ''), 6);
      end if;
    end if;
    insert into public.bot_owner_threads (tenant_id, client_slug, client_name, kind, title, sort)
    select t.id, slug, t.name, v.kind, v.title, v.sort
      from (values ('general', 'General', 10), ('photos_social', 'Photos & social', 20), ('website', 'Website changes', 30)) v(kind, title, sort)
     where not exists (select 1 from public.bot_owner_removed r where r.client_slug = slug and r.kind = v.kind)
    on conflict (client_slug, kind) where kind <> 'custom' do nothing;
  end loop;
  insert into public.bot_owner_threads (tenant_id, client_slug, client_name, kind, title, sort)
  select null, 'domin8te-media', 'Domin8te Media', v.kind, v.title, v.sort
    from (values ('general', 'General', 10), ('photos_social', 'Photos & social', 20), ('website', 'Website changes', 30)) v(kind, title, sort)
   where not exists (select 1 from public.bot_owner_removed r where r.client_slug = 'domin8te-media' and r.kind = v.kind)
  on conflict (client_slug, kind) where kind <> 'custom' do nothing;
end $$;

create or replace function public.bot_owner_thread_delete(id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  cur public.bot_owner_threads;
begin
  if not app.is_bot_chat_owner() then
    perform app.bot_owner_unknown('bot_owner_thread_delete', 'id');
  end if;
  select * into cur from public.bot_owner_threads th where th.id = bot_owner_thread_delete.id;
  if not found then perform app.bot_owner_unknown('bot_owner_thread_delete', 'id'); end if;
  if cur.kind <> 'custom' and cur.client_slug is not null then
    insert into public.bot_owner_removed (client_slug, kind, tenant_id, client_name) values (cur.client_slug, cur.kind, cur.tenant_id, cur.client_name)
    on conflict (client_slug, kind) do update set removed_at = now(), tenant_id = excluded.tenant_id, client_name = excluded.client_name;
  end if;
  delete from public.bot_chat_owner_messages m where m.thread_id = cur.id;
  delete from public.bot_owner_threads th where th.id = cur.id;
end $$;

revoke all on function public.bot_owner_thread_delete(uuid) from public;
grant execute on function public.bot_owner_thread_delete(uuid) to authenticated, anon;

-- every client the chat knows (with threads, or with only deleted ones), for the New chat picker; agency first, then by name
create or replace function public.bot_owner_clients()
returns table(client_slug text, client_name text)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not app.is_bot_chat_owner() then
    perform app.bot_owner_unknown('bot_owner_clients', '');
  end if;
  perform app.bot_owner_seed();
  return query
    select x.client_slug, x.client_name from (
      select distinct on (k.client_slug) k.client_slug, coalesce(tn.name, k.client_name) as client_name
      from (select th.client_slug, th.client_name, th.tenant_id from public.bot_owner_threads th where th.client_slug is not null
            union all
            select r.client_slug, r.client_name, r.tenant_id from public.bot_owner_removed r) k
      left join public.tenants tn on tn.id = k.tenant_id
      where coalesce(tn.status, 'active') <> 'archived'
      order by k.client_slug, (k.tenant_id is null)
    ) x
    order by (x.client_slug = 'domin8te-media') desc, lower(x.client_name);
end $$;

revoke all on function public.bot_owner_clients() from public;
grant execute on function public.bot_owner_clients() to authenticated, anon;
