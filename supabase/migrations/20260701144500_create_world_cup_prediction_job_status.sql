create table if not exists public.world_cup_prediction_job_status (
  id text primary key,
  status text not null check (status in ('success', 'failure')),
  checked_at timestamptz not null,
  source text,
  snapshots_written integer not null default 0 check (snapshots_written >= 0),
  message text not null,
  updated_at timestamptz not null default now(),
  constraint world_cup_prediction_job_status_singleton
    check (id = 'snapshot-job')
);

alter table public.world_cup_prediction_job_status enable row level security;

revoke all on table public.world_cup_prediction_job_status from anon, authenticated;
grant select on table public.world_cup_prediction_job_status to anon, authenticated;

drop policy if exists "Prediction job health is publicly readable"
  on public.world_cup_prediction_job_status;
create policy "Prediction job health is publicly readable"
on public.world_cup_prediction_job_status
for select
to anon, authenticated
using (true);
