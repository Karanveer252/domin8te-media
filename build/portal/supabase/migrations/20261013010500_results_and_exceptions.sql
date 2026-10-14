-- Results the client sees, the staff result entry, and the Needs you reasons the console can raise (2026-10-13).
-- LOCAL: TEST project only until Karan approves prod. Idempotent. The Dashboard Manager's own paths are untouched:
-- the outlier hold lives in the staff entry RPC below, not in a trigger, so service-role writes behave exactly as before.

-- Staff raise a Needs you item from the console (for example after an over-cap usage row was refused). Staff only:
-- the client-side cases (over cap, service not in the plan) are raised by the requests trigger, never by the client.
create or replace function public.report_exception(p_tenant uuid, p_entity_type text, p_entity_id text, p_reason text,
  p_message text, p_last jsonb default null) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_staff() or app.jwt_sub() is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if p_reason not in ('over_cap','over_cap_request','service_not_picked','result_outlier','plan_mismatch',
                      'reminder_failed','picks_unconfirmed','plan_backfill_needed') then
    raise exception 'unknown-reason' using errcode = '22023'; end if;
  return public.open_dashboard_exception(p_tenant, null, left(p_entity_type, 80), left(p_entity_id, 200), 'warning', p_reason,
                                         left(coalesce(nullif(trim(p_message), ''), p_reason), 2000), p_last);
end $$;
revoke all on function public.report_exception(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.report_exception(uuid, text, text, text, text, jsonb) to authenticated;

-- The newest verified, visible result per metric, and whether a newer number is still being checked.
-- One row per metric (metric_key = content.metric, else the external id). (tenant, kind, external_id) is unique, so a
-- newer number is either a pending change on the same row (pending_at) or a newer period's row that is not verified yet.
-- A function, not a view: a client cannot read the unverified rows, but must learn that one exists ("We are checking a
-- newer number"), so this runs with the owner's rights and keeps every caller to their own restaurant itself.
drop view if exists public.client_results_current;
create or replace function public.client_results_current() returns table (
  tenant_id uuid, metric_key text, id uuid, external_id text, content jsonb, reporting_period_start date, reporting_period_end date,
  source_observed_at timestamptz, source_ref text, verification_status text, verified_at timestamptz, verified_by text,
  published_at timestamptz, has_newer_unverified boolean)
language sql stable security definer set search_path = '' as $$
select distinct on (i.tenant_id, coalesce(i.content ->> 'metric', i.external_id))
  i.tenant_id, coalesce(i.content ->> 'metric', i.external_id), i.id, i.external_id, i.content,
  i.reporting_period_start, i.reporting_period_end, i.source_observed_at, i.source_ref,
  i.verification_status, i.verified_at, i.verified_by, i.published_at,
  (i.pending_at is not null or exists (select 1 from public.client_dashboard_items n
     where n.tenant_id = i.tenant_id and n.item_kind = 'result' and n.id <> i.id
       and coalesce(n.content ->> 'metric', n.external_id) = coalesce(i.content ->> 'metric', i.external_id)
       and n.verification_status not in ('verified', 'rejected') and n.hidden_at is null
       and n.reporting_period_end >= i.reporting_period_end))
from public.client_dashboard_items i
where i.item_kind = 'result' and i.client_visible and i.verification_status in ('verified', 'stale') and i.hidden_at is null
  and (app.is_staff() or i.tenant_id = app.my_tenant())
order by i.tenant_id, coalesce(i.content ->> 'metric', i.external_id), i.reporting_period_end desc, i.verified_at desc
$$;
revoke all on function public.client_results_current() from public, anon;
grant execute on function public.client_results_current() to authenticated;

-- Staff enter a result (console client detail). It is stored pending and hidden; publishing is the usual staff review
-- (review_dashboard_item). A value more than 40% away from the last verified one is held and opens result_outlier.
-- A newer row for the same metric gets its own external id (metric + period end), so the last verified value keeps
-- showing until the new one is approved.
create or replace function public.add_result_item(p_tenant uuid, p_service text, p_metric text, p_label text, p_value numeric,
  p_unit text, p_period_start date, p_period_end date, p_source_name text, p_read_at timestamptz, p_proof_path text default null)
returns public.client_dashboard_items language plpgsql security definer set search_path = '' as $$
declare who text := app.jwt_sub(); r public.client_dashboard_items; last record; ext text;
begin
  if not app.is_staff() or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if p_metric !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'bad-metric' using errcode = '22023'; end if;
  if p_value is null or p_period_start is null or p_period_end is null or p_period_start > p_period_end then
    raise exception 'value-and-period-required' using errcode = '22023'; end if;
  if coalesce(trim(p_source_name), '') = '' or p_read_at is null or p_read_at > now() + interval '5 minutes' then
    raise exception 'named-source-and-read-time-required' using errcode = '22023'; end if;
  if p_proof_path is not null and p_proof_path !~ ('^' || p_tenant::text || '/[A-Za-z0-9._-]{1,120}$') then
    raise exception 'bad-proof-path' using errcode = '22023'; end if;
  ext := p_metric;
  select c.content, c.reporting_period_end into last from public.client_results_current() c
   where c.tenant_id = p_tenant and c.metric_key = ext;
  insert into public.client_dashboard_items (tenant_id, item_kind, external_id, content, source_kind, source_ref, source_observed_at,
      verification_status, client_visible, reporting_period_start, reporting_period_end)
  values (p_tenant, 'result', ext || ':' || to_char(p_period_end, 'YYYYMMDD'),
      jsonb_strip_nulls(jsonb_build_object('service', p_service, 'metric', p_metric, 'label', left(p_label, 80), 'value', p_value,
        'unit', left(p_unit, 30), 'source', left(p_source_name, 120), 'proof', p_proof_path)),
      'console', 'console:result/' || p_metric || '/' || to_char(p_period_end, 'YYYYMMDD'), p_read_at,
      'pending', false, p_period_start, p_period_end)
  returning * into r;
  if last.content is not null and (last.content ->> 'value') ~ '^-?[0-9.]+$' and (last.content ->> 'value')::numeric <> 0
     and abs(p_value - (last.content ->> 'value')::numeric) / abs((last.content ->> 'value')::numeric) > 0.40 then
    perform public.open_dashboard_exception(p_tenant, null, 'client_dashboard_item', r.id::text, 'warning', 'result_outlier',
      'New ' || coalesce(p_label, p_metric) || ' value ' || p_value || ' is more than 40% away from the last verified ' || (last.content ->> 'value') || '.',
      jsonb_build_object('value', last.content -> 'value', 'period_end', last.reporting_period_end));
  end if;
  insert into public.audit_log (tenant_id, actor, action, detail) values (p_tenant, who, 'result_entered',
    jsonb_build_object('item', r.id, 'metric', p_metric, 'value', p_value, 'period_end', p_period_end, 'source', p_source_name));
  return r;
end $$;
revoke all on function public.add_result_item(uuid, text, text, text, numeric, text, date, date, text, timestamptz, text) from public, anon;
grant execute on function public.add_result_item(uuid, text, text, text, numeric, text, date, date, text, timestamptz, text) to authenticated;

-- Proof files for results: a private bucket only staff can read or add to. Never public.
insert into storage.buckets (id, name, public) values ('result-proof', 'result-proof', false) on conflict (id) do update set public = false;
drop policy if exists "staff read result proof" on storage.objects;
create policy "staff read result proof" on storage.objects for select to authenticated using (bucket_id = 'result-proof' and (select app.is_staff()));
drop policy if exists "staff add result proof" on storage.objects;
create policy "staff add result proof" on storage.objects for insert to authenticated with check (bucket_id = 'result-proof' and (select app.is_staff()));
