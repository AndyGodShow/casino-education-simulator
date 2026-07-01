create table if not exists public.world_cup_prediction_snapshots (
  match_id text primary key,
  home_team_id text not null,
  away_team_id text not null,
  kickoff timestamptz not null,
  captured_at timestamptz not null,
  prediction jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prediction_snapshot_before_kickoff check (captured_at < kickoff),
  constraint prediction_snapshot_match_id_matches
    check (prediction ->> 'matchId' = match_id)
);

create or replace function public.guard_world_cup_prediction_snapshot_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and clock_timestamp() >= new.kickoff then
    raise exception 'A prediction snapshot cannot be inserted after kickoff.';
  end if;

  if tg_op = 'UPDATE' and clock_timestamp() >= old.kickoff then
    raise exception 'A prediction snapshot cannot change after kickoff.';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guard_world_cup_prediction_snapshot_update
  on public.world_cup_prediction_snapshots;
create trigger guard_world_cup_prediction_snapshot_update
before insert or update on public.world_cup_prediction_snapshots
for each row execute function public.guard_world_cup_prediction_snapshot_update();

alter table public.world_cup_prediction_snapshots enable row level security;

revoke all on table public.world_cup_prediction_snapshots from anon, authenticated;
grant select on table public.world_cup_prediction_snapshots to anon, authenticated;

drop policy if exists "Prediction snapshots are publicly readable"
  on public.world_cup_prediction_snapshots;
create policy "Prediction snapshots are publicly readable"
on public.world_cup_prediction_snapshots
for select
to anon, authenticated
using (true);

create index if not exists world_cup_prediction_snapshots_kickoff_idx
  on public.world_cup_prediction_snapshots (kickoff);
