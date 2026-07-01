-- Run after production deployment. Replace both placeholders before executing.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

select vault.create_secret(
  'https://YOUR_PRODUCTION_DOMAIN/api/world-cup/prediction-snapshot',
  'world_cup_prediction_snapshot_endpoint'
);
select vault.create_secret(
  'REPLACE_WITH_A_LONG_RANDOM_SECRET',
  'world_cup_prediction_snapshot_cron_secret'
);

select cron.schedule(
  'lock-world-cup-predictions-every-minute',
  '* * * * *',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'world_cup_prediction_snapshot_endpoint'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'world_cup_prediction_snapshot_cron_secret'
        )
      ),
      body := '{}'::jsonb
    );
  $$
);
