# World Cup Production Runbook

## Production contract

- Public application: Vercel.
- Durable evidence and scheduled-job status: Supabase.
- Primary fixture source: OpenFootball.
- Historical strategy source: `martj42/international_results`.
- Health probe: `GET /api/world-cup/health`.
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
5. Observe Vercel function errors and latency for at least 30 minutes.

## Rollback triggers

Roll back immediately when any of these occurs:

- The health endpoint stays at 503 after one retry window.
- New server or browser errors block the World Cup page.
- Fixture or research payload validation starts failing.
- Prediction evidence is written with an unintended input mode.
- Error rate exceeds twice the previous deployment baseline.
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
application rollback.
