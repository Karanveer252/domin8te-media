-- The raw data editor's audit row (2026-10-13). LOCAL: TEST project only until Karan approves prod. Idempotent.
-- audit_log has no insert for signed-in people (001_prod_base_mirror.sql revokes it), so the console calls this function after it
-- saves the record. The console sends p_detail = { keys: [changed paths], count: n, changes: [{ path, before, after }] }, with each
-- value cut to 120 characters. History reads the action 'tenant.raw_edit' in words ("changed the raw data: business.name, ...").
-- Staff only; the detail must be a small JSON object; the client must exist. It writes one audit_log row and nothing else.
-- Deploy with the new console (20261013010400 and this one belong to the same console release).

create or replace function public.record_raw_edit(p_tenant uuid, p_detail jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_staff() or app.jwt_sub() is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if p_detail is null or jsonb_typeof(p_detail) <> 'object' then raise exception 'the detail must be a JSON object' using errcode = '22023'; end if;
  if pg_column_size(p_detail) > 40000 then raise exception 'the detail is too large' using errcode = '22023'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then raise exception 'unknown client' using errcode = '23503'; end if;
  insert into public.audit_log (tenant_id, actor, action, detail) values (p_tenant, app.jwt_sub(), 'tenant.raw_edit', p_detail);
end $$;
revoke all on function public.record_raw_edit(uuid, jsonb) from public, anon;
grant execute on function public.record_raw_edit(uuid, jsonb) to authenticated;
