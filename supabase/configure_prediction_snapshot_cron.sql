-- Legacy cleanup only. Run after production deployment.
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid)
from cron.job
where jobname = 'lock-world-cup-predictions-every-minute';

-- Do not schedule the full prediction/research/evidence pipeline every minute.
-- Match-window capture requires a future lightweight capture-only endpoint that avoids
-- research generation and durable evidence work. It must be reviewed, authenticated,
-- and load-tested before any high-frequency schedule is enabled.
