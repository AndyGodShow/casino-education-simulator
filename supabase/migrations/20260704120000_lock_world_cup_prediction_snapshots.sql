create or replace function public.guard_world_cup_prediction_snapshot_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if clock_timestamp() >= new.kickoff then
      raise exception 'A prediction snapshot cannot be inserted after kickoff.';
    end if;
    return new;
  end if;

  raise exception 'A prediction snapshot is immutable after its first capture.';
end;
$$;

drop trigger if exists guard_world_cup_prediction_snapshot_update
  on public.world_cup_prediction_snapshots;
create trigger guard_world_cup_prediction_snapshot_update
before insert or update or delete on public.world_cup_prediction_snapshots
for each row execute function public.guard_world_cup_prediction_snapshot_update();
