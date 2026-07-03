# World Cup Public Research Platform Feature Spec

## Problem Statement

The World Cup module can load OpenFootball fixtures and read public Polymarket
markets, but it still behaves primarily as a browser application. A public
deployment needs a durable evidence pipeline: data must be fetched without
depending on a visitor, source freshness must be explicit, pre-match predictions
must be immutable, and model changes must be justified by time-ordered tests
rather than by fitting completed matches.

The product remains an educational probability laboratory. It must never place a
bet, connect a wallet, claim official FIFA verification for community data, or
present a strategy as profitable without sufficient out-of-sample evidence.

## Goals

- Serve a normalized, cacheable World Cup data snapshot from a public server
  endpoint, with browser-side provider fallback.
- Preserve provider observations, market references, pre-match predictions, and
  job health in Supabase using append-only or guarded records.
- Ingest keyless public historical international results and derive time-causal
  team-strength features.
- Evaluate strategy candidates with chronological walk-forward validation.
- Apply tuning only when sample, stage coverage, and out-of-sample improvement
  thresholds pass; otherwise retain the baseline model.
- Expose source, freshness, sample size, validation status, and unavailable
  capabilities in the existing UI.
- Add CI and operational documentation suitable for a Vercel + Supabase public
  deployment.

## Non-Goals

- Paid or API-key-gated sports data providers.
- Fabricated xG, injuries, lineups, official verification, or live scores.
- Automated betting, wallet integration, order placement, or financial advice.
- Training a black-box model whose features or validation cannot be audited.

## Data Sources

- OpenFootball World Cup JSON is the primary fixture/result provider. It is
  public-domain community data and may be manually delayed.
- Mart Jürisoo's CC0 international results CSV is the historical strength source.
- Polymarket Gamma and public CLOB endpoints are read-only market references.
- Local/sample fixtures remain an explicitly labelled final fallback only.

Every observation records source, retrieval time, source event time when
available, content hash, schema version, and validation errors. Fetch time is not
treated as the source's update time.

## Architecture

1. `api/world-cup/data.ts` calls a server endpoint handler.
2. The handler loads normalized fixtures and bounded market references, emits a
   versioned snapshot, and sets CDN cache headers.
3. The browser requests this endpoint first and falls back to the existing direct
   provider chain if the endpoint is unavailable or invalid.
4. The scheduled evidence endpoint writes provider observations, market
   references, pre-match predictions, and health status to Supabase.
5. Historical result parsing and walk-forward optimization remain pure
   deterministic modules under the World Cup backtest boundary.
6. The existing `buildWorldCupDomain` remains the only UI-facing domain builder.

## Strategy Optimization Policy

- Training and validation splits are chronological.
- A match may use only results whose date is earlier than its kickoff.
- Candidate selection minimizes validation Brier score, with log loss as the
  tie-breaker; ROI is reported only when genuine pre-match market prices exist.
- A candidate is rejected unless it has at least 60 historical validation
  matches, spans at least two tournament stages or result contexts, and improves
  Brier score by at least 0.01 over baseline.
- Applied overrides are bounded by the existing model configuration. The
  baseline remains active when evidence is insufficient.
- The UI labels optimization as `applied`, `rejected`, or
  `insufficient_evidence`, including sample size and out-of-sample delta.

## Public API

`GET /api/world-cup/data`

- Returns `{ schemaVersion, generatedAt, adapterResult, markets, provenance }`.
- Never returns secrets or private Supabase credentials.
- Responds with `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
- Returns a sanitized `502` response when no verified provider is available.

`POST /api/world-cup/prediction-snapshot`

- Remains protected by `WORLD_CUP_CRON_SECRET`.
- Captures only before kickoff.
- Writes job health even when the provider or persistence layer fails.

## UI Requirements

- Match the existing World Cup visual system; introduce no new brand language.
- The data-source disclosure shows server/direct mode, observation age, strategy
  validation status, and missing xG/injury capability.
- Loading, provider, fallback, stale, market-empty, and error states remain
  distinguishable.

## Security and Reliability

- Cron endpoints use constant-time hashed secret comparison.
- Service-role keys stay server-side.
- Public payloads are schema-validated and size-bounded.
- External requests have timeouts, bounded fan-out, sanitized errors, and no
  user-controlled URLs.
- Database policies allow public reads only for explicitly public evidence
  tables; writes require the service role.

## Acceptance Criteria

- A public data endpoint produces a normalized provider snapshot without an API
  key and the client consumes it before direct fallback.
- Scheduled execution can persist auditable observations and immutable pre-match
  predictions.
- Historical data produces deterministic causal ratings and a walk-forward
  optimization report with leakage guards.
- Strategy tuning cannot activate below evidence thresholds.
- Unit, architecture, API, and E2E tests pass; lint, typecheck, build, and high
  severity dependency audit are CI gates.

## Verification Evidence

Verified on 2026-07-03:

- The live public-data handler returned OpenFootball with 104 matches, 70 teams,
  zero complete Polymarket three-way references, no provider errors, and the
  expected 60-second CDN cache policy.
- The historical research handler accepted 49,488 rows and rejected 11 rows.
- The selected research candidate improved independent-holdout Brier score by
  0.040687 across five pre-match scenario contexts. Its causal Elo ratings now
  enter Prediction V2 through a trust gate for all 48 resolved tournament teams;
  22 unresolved knockout slots are explicitly excluded from the coverage
  denominator. Higher-trust explicit inputs still win.
- The UI presents the research as a validated historical input, not a profit
  claim, official rating, current-squad assessment, real xG feed, injury feed, or
  substitute for current-tournament pre-match calibration.
- 104 Vitest files / 637 tests, six Playwright journeys, ESLint, TypeScript,
  production build, responsive browser inspection, and browser console
  inspection passed. The unchanged npm dependency graph was last audited clean
  and remains guarded by the CI high-severity audit.
- Tournament simulation caches each match's fixed score distribution before its
  1,000 deterministic iterations. This reduced repeated full prediction work
  from roughly 48,000 calls to roughly 48 without changing qualification
  probabilities.
