create or replace function public.prune_world_cup_client_telemetry()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_rows integer;
begin
  delete from public.world_cup_client_telemetry
  where received_at < pg_catalog.now() - interval '30 days';

  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$$;

revoke all on function public.prune_world_cup_client_telemetry()
  from public, anon, authenticated;
grant execute on function public.prune_world_cup_client_telemetry()
  to service_role;
grant delete on table public.world_cup_client_telemetry
  to service_role;
