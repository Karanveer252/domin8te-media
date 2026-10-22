-- Update emails (2026-10-21, Karan's brief items 33, 38, 40). TEST PROJECT ONLY until Karan approves prod. Idempotent.
-- Needs 20261021010000_client_emails.sql. When staff save something for a client, the database queues an update email
-- naming it (server side, so the console stays as it is). Several within 15 minutes for the same client are one email.
--
-- What counts (each becomes one item {kind, id, title, text?, pref?, ...} in the bundle; kind is the deep-link kind):
--   tenants.doc.updates   a new update row                      -> kind update   (pref website when the service is website)
--   tenants.doc.approvals a new approval                        -> kind approval (pref approvals; carries a preview: post texts,
--                                                                  and image URLs only when the approval has https images)
--   tenants.doc.services  a service status change               -> kind work, id = the service (pref website for website)
--                         a new file on a service              -> kind work
--   tenants.doc.actions   a new attention item (not approvals)  -> kind billing for billing items (pref account: always sent),
--                                                                  else kind home
--   tasks                 a client-visible card changes status  -> kind work, id = its service
--   client_dashboard_items a verified result becomes visible    -> kind results, id = the item
-- Never blocks the save: a queue problem only logs a warning.
--
-- Rollback: drop trigger if exists tenants_update_emails on public.tenants; drop trigger if exists tasks_update_emails on public.tasks;
--   drop trigger if exists results_update_emails on public.client_dashboard_items;
--   drop function app.queue_tenant_update_emails(), app.queue_task_update_emails(), app.queue_result_update_emails(),
--     app.service_words(text), app.status_words(text);

create or replace function app.service_words(p_service text) returns text language sql immutable set search_path = '' as $$
  select case p_service when 'website' then 'website' when 'social' then 'social media' when 'advertising' then 'ads'
    when 'local' then 'SEO and Google Maps' when 'seo' then 'SEO and Google Maps' else coalesce(nullif(replace(p_service, '_', ' '), ''), 'the') end
$$;
create or replace function app.status_words(p_status text) returns text language sql immutable set search_path = '' as $$
  select case p_status when 'in_progress' then 'in progress' when 'waiting' then 'waiting on you' when 'in_review' then 'ready for a check'
    when 'done' then 'done' when 'live' then 'live' when 'paused' then 'paused' when 'todo' then 'planned' when 'blocked' then 'on hold'
    else coalesce(replace(p_status, '_', ' '), 'updated') end
$$;

create or replace function app.queue_tenant_update_emails() returns trigger language plpgsql security definer set search_path = '' as $$
declare it jsonb := '[]'::jsonb; x jsonb; k text; ou jsonb; nu jsonb; prev jsonb; img jsonb; n integer; pv jsonb;
begin
  if new.doc is not distinct from old.doc then return null; end if;
  -- new update rows
  ou := case when jsonb_typeof(old.doc -> 'updates') = 'array' then old.doc -> 'updates' else '[]'::jsonb end;
  nu := case when jsonb_typeof(new.doc -> 'updates') = 'array' then new.doc -> 'updates' else '[]'::jsonb end;
  for x in select e from jsonb_array_elements(nu) e loop
    continue when coalesce(x ->> 'id', '') = '' or exists (select 1 from jsonb_array_elements(ou) o where o ->> 'id' = x ->> 'id');
    it := it || jsonb_build_array(jsonb_build_object('kind', 'update', 'id', x ->> 'id',
      'title', left(coalesce(nullif(btrim(x ->> 'title'), ''), 'New update from your team'), 140),
      'text', left(coalesce(x ->> 'completed', x ->> 'text', ''), 300), 'service', x ->> 'service',
      'pref', case when x ->> 'service' = 'website' then 'website' end));
  end loop;
  -- new approvals
  prev := case when jsonb_typeof(old.doc -> 'approvals') = 'object' then old.doc -> 'approvals' else '{}'::jsonb end;
  for k, x in select key, value from jsonb_each(case when jsonb_typeof(new.doc -> 'approvals') = 'object' then new.doc -> 'approvals' else '{}'::jsonb end) loop
    continue when prev ? k or jsonb_typeof(x) <> 'object';
    pv := x -> 'preview';
    n := case when jsonb_typeof(pv -> 'items') = 'array' then jsonb_array_length(pv -> 'items') end;
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('text', left(coalesce(i ->> 'text', ''), 400), 'day', i ->> 'day',
             'image', case when coalesce(i ->> 'image', '') ~ '^https://[^\s"<>]+$' then i ->> 'image' end))), '[]'::jsonb)
      into img from (select i from jsonb_array_elements(case when jsonb_typeof(pv -> 'items') = 'array' then pv -> 'items' else '[]'::jsonb end) i limit 3) s;
    it := it || jsonb_build_array(jsonb_build_object('kind', 'approval', 'id', k,
      'title', left(coalesce(nullif(btrim(x ->> 'title'), ''), 'Something new'), 140),
      'text', left(coalesce(x ->> 'intro', ''), 300), 'service', x ->> 'service', 'previewType', pv ->> 'type',
      'count', n, 'preview', img, 'pref', 'approvals'));
  end loop;
  -- service status changes and new files
  prev := case when jsonb_typeof(old.doc -> 'services') = 'object' then old.doc -> 'services' else '{}'::jsonb end;
  for k, x in select key, value from jsonb_each(case when jsonb_typeof(new.doc -> 'services') = 'object' then new.doc -> 'services' else '{}'::jsonb end) loop
    continue when not (prev ? k) or jsonb_typeof(x) <> 'object';
    if coalesce(x ->> 'status', '') <> '' and (prev -> k ->> 'status') is distinct from (x ->> 'status') then
      it := it || jsonb_build_array(jsonb_build_object('kind', 'work', 'id', k,
        'title', 'Your ' || app.service_words(k) || ' work is now ' || app.status_words(x ->> 'status'),
        'text', left(coalesce(x ->> 'now', ''), 300), 'service', k, 'pref', case when k = 'website' then 'website' end));
    end if;
    if jsonb_typeof(x -> 'files') = 'array' and jsonb_array_length(x -> 'files') >
       (case when jsonb_typeof(prev -> k -> 'files') = 'array' then jsonb_array_length(prev -> k -> 'files') else 0 end) then
      it := it || jsonb_build_array(jsonb_build_object('kind', 'work', 'id', k,
        'title', 'New file for your ' || app.service_words(k) || ': ' || left(coalesce(x -> 'files' -> -1 ->> 'name', 'a file'), 100),
        'service', k, 'pref', case when k = 'website' then 'website' end));
    end if;
  end loop;
  -- new attention items that are not approvals (an approval already has its own item)
  ou := case when jsonb_typeof(old.doc -> 'actions') = 'array' then old.doc -> 'actions' else '[]'::jsonb end;
  nu := case when jsonb_typeof(new.doc -> 'actions') = 'array' then new.doc -> 'actions' else '[]'::jsonb end;
  for x in select e from jsonb_array_elements(nu) e loop
    continue when coalesce(x ->> 'id', '') = '' or coalesce(x ->> 'kind', '') = 'approval'
      or exists (select 1 from jsonb_array_elements(ou) o where o ->> 'id' = x ->> 'id');
    it := it || jsonb_build_array(jsonb_build_object('kind', case when x ->> 'kind' = 'billing' then 'billing' else 'home' end,
      'id', x ->> 'id', 'title', left(coalesce(nullif(btrim(x ->> 'title'), ''), 'Something needs you'), 140),
      'text', left(coalesce(x ->> 'detail', ''), 300), 'pref', case when x ->> 'kind' = 'billing' then 'account' end));
  end loop;
  if jsonb_array_length(it) > 0 then perform app.enqueue_update_items(new.id, it); end if;
  return null;
exception when others then
  raise warning 'client-emails: tenant update not queued (%)', left(sqlerrm, 200);
  return null;
end $$;
drop trigger if exists tenants_update_emails on public.tenants;
create trigger tenants_update_emails after update of doc on public.tenants for each row execute function app.queue_tenant_update_emails();

create or replace function app.queue_task_update_emails() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.client_visible and new.visibility_decided_at is not null and new.deleted_at is null and new.service is not null
     and new.status <> 'cancelled' and new.status is distinct from old.status then
    perform app.enqueue_update_items(new.tenant_id, jsonb_build_array(jsonb_build_object('kind', 'work', 'id', new.service,
      'card', new.id, 'title', left(btrim(new.title), 120) || ': ' || app.status_words(new.status), 'service', new.service,
      'pref', case when new.service = 'website' then 'website' end)));
  end if;
  return null;
exception when others then
  raise warning 'client-emails: card update not queued (%)', left(sqlerrm, 200);
  return null;
end $$;
drop trigger if exists tasks_update_emails on public.tasks;
create trigger tasks_update_emails after update of status on public.tasks for each row execute function app.queue_task_update_emails();

create or replace function app.queue_result_update_emails() returns trigger language plpgsql security definer set search_path = '' as $$
declare was boolean := false;
begin
  if tg_op = 'UPDATE' then was := old.client_visible and old.hidden_at is null and old.verification_status = 'verified'; end if;
  if new.item_kind = 'result' and new.client_visible and new.hidden_at is null and new.verification_status = 'verified' and not was then
    perform app.enqueue_update_items(new.tenant_id, jsonb_build_array(jsonb_build_object('kind', 'results', 'id', new.id::text,
      'title', 'New number on your Results page: ' || left(coalesce(nullif(new.content ->> 'label', ''), new.content ->> 'metric', 'a result'), 80))));
  end if;
  return null;
exception when others then
  raise warning 'client-emails: result update not queued (%)', left(sqlerrm, 200);
  return null;
end $$;
drop trigger if exists results_update_emails on public.client_dashboard_items;
create trigger results_update_emails after insert or update on public.client_dashboard_items for each row execute function app.queue_result_update_emails();

revoke all on function app.queue_tenant_update_emails(), app.queue_task_update_emails(), app.queue_result_update_emails() from public, anon, authenticated;
