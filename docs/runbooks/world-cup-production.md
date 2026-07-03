# World Cup Production Runbook

## Production contract

- Public application: Vercel.
- Durable evidence and scheduled-job status: Supabase.
- Primary fixture source: OpenFootball.
- Historical strategy source: `martj42/international_results`.
- Health probe: `GET /api/world-cup/health`.
- Private browser telemetry: `POST /api/world-cup/client-telemetry`.
- Evidence cron: daily at 08:00 UTC.
- Health monitor: GitHub Actions at 08:30 and 20:30 UTC.

The health probe returns 200 only when its server configuration is present and
the most recent scheduled evidence job succeeded within 36 hours. Missing,
failed, stale, future-dated, unconfigured, and unreadable states return 503 with
`Retry-After: 300`. The response contains no credentials or upstream error
details.

## One-time production setup

1. Apply every migration under `supabase/migrations/`.
2. Configure these Vercel server variables:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
3. Configure these Vercel browser variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Set the GitHub repository variable `PRODUCTION_HEALTH_URL` to the complete
   HTTPS URL ending in `/api/world-cup/health`.
5. Run the `World Cup production health` workflow manually after the first
   scheduled evidence job has completed.

Never place the service-role key in a `VITE_` variable, repository variable,
workflow output, URL, screenshot, or client bundle.

## Pre-deployment gate

Run on the exact commit intended for release:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run check:build-budget
npm run test:e2e
npm audit --audit-level=high
```

Deploy to a Vercel preview first. Verify:

```bash
curl --fail --silent --show-error \
  https://PREVIEW_HOST/api/world-cup/data > /dev/null
curl --fail --silent --show-error \
  https://PREVIEW_HOST/api/world-cup/research > /dev/null
```

The health endpoint depends on the durable production job status. A new preview
can therefore be checked for response shape, but production promotion should be
validated against the production health URL.

## Production verification

Immediately after promotion:

1. Open the World Cup page and expand `数据源状态说明`.
2. Confirm the fixture count, historical strategy validation, historical Elo
   coverage, and missing-market/xG/injury boundaries are visible.
3. Run:

```bash
npm run check:production-health -- \
  https://PRODUCTION_HOST/api/world-cup/health
```

4. Confirm the GitHub health workflow is green.
5. Load the production page, interact once, background or leave the tab, then
   confirm `world_cup_client_telemetry` receives bounded rows. Do not expose the
   table through a public read policy.
6. Observe Vercel function errors, telemetry cardinality, and latency for at
   least 30 minutes.

## Private client telemetry

Production builds register the standard `web-vitals` CLS, INP, and LCP
callbacks plus `error`, `unhandledrejection`, and React error-boundary
reporting. The client sends only fixed enums, a known application route,
navigation type, metric value/rating, or a SHA-256 error fingerprint. It does
not send raw messages, stacks, query strings, cookies, user IDs, session IDs, or
User-Agent values. A page reports at most ten runtime errors.

The endpoint requires an exact same-origin `Origin`, `application/json`, a
2,048-byte streaming body limit, and the versioned strict schema. The server
owns timestamps, quantizes CLS to 0.01 and INP/LCP to 50 ms, and aggregates
matching five-minute buckets with `sample_count`. The database caps each row at
10,000 samples and admits at most 5,000 new telemetry rows per UTC day under an
advisory transaction lock. Requests above those storage-cardinality limits are
dropped without expanding the table. Same-origin checks and these limits reduce
abuse; they do not authenticate anonymous browser telemetry, so treat the data
as an operational signal rather than authoritative evidence. Telemetry is not
sports-model evidence and not a public dataset.

Use an administrative Supabase SQL session for these queries. This weighted
nearest-rank query reports an approximate seven-day p75 after enough real page
views exist:

```sql
with distribution as (
  select
    name,
    route,
    value,
    sum(sample_count)::bigint as samples_at_value
  from public.world_cup_client_telemetry
  where kind = 'web-vital'
    and received_at >= now() - interval '7 days'
  group by name, route, value
),
ranked as (
  select
    name,
    route,
    value,
    sum(samples_at_value) over (
      partition by name, route
      order by value
    ) as cumulative_samples,
    sum(samples_at_value) over (
      partition by name, route
    ) as total_samples
  from distribution
)
select distinct on (name, route)
  name,
  route,
  value as approximate_p75,
  total_samples
from ranked
where cumulative_samples >= total_samples * 0.75
order by name, route, value;
```

Group runtime errors without revealing their source text:

```sql
select
  route,
  name,
  fingerprint,
  sum(sample_count) as occurrences,
  max(received_at) as last_seen_at
from public.world_cup_client_telemetry
where kind = 'runtime-error'
  and received_at >= now() - interval '7 days'
group by route, name, fingerprint
order by occurrences desc, last_seen_at desc
limit 50;
```

Telemetry is deliberately mutable and separate from append-only prediction
evidence. Retain only the operational window actually needed:

```sql
delete from public.world_cup_client_telemetry
where received_at < now() - interval '30 days';
```

## Rollback triggers

Roll back immediately when any of these occurs:

- The health endpoint stays at 503 after one retry window.
- New server or browser errors block the World Cup page.
- Fixture or research payload validation starts failing.
- Prediction evidence is written with an unintended input mode.
- Error rate exceeds twice the previous deployment baseline.
- Telemetry write cardinality is unexpectedly high or any raw diagnostic/user
  field appears in the private table.
- P95 latency rises more than 50% from the previous deployment.
- A credential or data-integrity issue is discovered.

## Rollback procedure

1. In Vercel, promote the last known-good deployment.
2. If a source rollback is also required, create a normal revert commit for the
   offending commit and push it through CI. Do not rewrite shared history.
3. Verify `/api/world-cup/data`, `/api/world-cup/research`, and the World Cup
   page on the restored deployment.
4. Run the production health check command.
5. Record the incident time, failed deployment, restored deployment, symptom,
   and follow-up owner.

Do not roll back by deleting Supabase evidence. Fixture and market evidence is
append-only, while pre-match snapshots preserve their earliest capture. Schema
migrations in this release are additive; leave them in place during an
application rollback. The telemetry table may remain in place when rolling back
the application; it is private operational data and follows the retention rule
above rather than the append-only evidence policy.
