# Audit Report: full codebase

**Date:** 2026-07-13
**Reviewers:** Arc mechanical audit plus local security, performance, architecture,
data, senior-engineering, test-quality, product, and accessibility lenses. Parallel
reviewer dispatch was attempted, but the reviewer service returned a usage-limit
error; the same prompts and evidence checks were completed locally.
**Scope:** full `baccarat-sim` workspace
**Project Type:** React 19 + Vite 7 + TypeScript 5.9 educational casino and
sports-probability simulator, with Vercel Functions and Supabase persistence
**Project Stage:** production

> Severity ratings are calibrated for a production deployment. Every finding in
> this report was re-opened and checked against the current source; Medium and Low
> items are not scanner-only citations.

## Verification Summary

| Check | Result |
| --- | :---: |
| Production build | Passed, 909 modules |
| TypeScript | Passed |
| ESLint | Passed |
| Unit/integration tests | 112 files, 729 tests passed |
| Playwright E2E | 8/8 passed |
| Dependency audit | 0 vulnerabilities at `high` threshold |
| Secret-pattern scan | No likely credentials found |
| Build budgets | All passed |
| Initial JavaScript | 66.12 KiB gzip / 70 KiB budget |
| World Cup route JavaScript | 59.80 KiB gzip / 90 KiB budget |
| Largest JavaScript chunk | 105.18 KiB gzip / 120 KiB budget |
| Largest CSS asset | 6.02 KiB gzip / 10 KiB budget |
| Largest raster asset | 154.31 KiB / 350 KiB budget |
| Production health | Healthy; latest job checked at `2026-07-12T08:37:17.21Z` |
| Production data endpoint | 200; 2.57 s; 104 OpenFootball matches; no provider errors |
| Production research endpoint | 200; 4.09 s; 49,501 accepted rows; 256 team ratings |

The CI workflow repeats install, lint, typecheck, unit tests, build, bundle budgets,
and dependency audit. Playwright runs in CI with artifacts, and a separate workflow
checks the production health endpoint twice daily.

## Structural Hotspots

- **Authored files over 600 LOC:** 2, both tests; no production file exceeds 600 LOC.
- **Severe files over 1000 LOC:** 1.
- **Auto-fail files over 2000 LOC:** 0.
- **Suspicious boundary/wrapper files:** 0.
- **Suspicious and long overlap:** 0.
- **Thin-page-to-god-client findings:** 0.

| File | LOC | Assessment |
| --- | ---: | --- |
| `src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts` | 1,126 | Severe test-maintenance hotspot spanning most domain-builder responsibilities |
| `src/modules/sports/football/worldCup/backtest/worldCupBacktest.test.ts` | 855 | Large backtest suite with many repeated fixtures |
| `src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts` | 577 | Largest production file; still below the production-file ceiling |

## Codebase Map

The map contains 364 source files. `src/games/` owns eight traditional game
implementations and their probability engines; `src/modules/sports/` owns the sports
lobbies and World Cup research/domain/UI stack; `src/server/worldCup/` owns Vercel
endpoint behavior; `api/` contains deployment entrypoints; and `supabase/` owns
migrations and the optional high-frequency schedule.

The mapper reported two cycles around `WorldCupDomainModel`, group simulation,
prediction, match intelligence, and group motivation. Re-inspection confirmed the
cycle-closing imports are `import type`, so they do not form runtime cycles. The
high-fan-in `worldCup/types.ts` and `WorldCupDomainModel.ts` files are intentional
domain contracts, though their export surfaces should remain curated.

## Scorecard: 15/21 — Solid

| # | Axis | Score | Rationale |
| --- | --- | :---: | --- |
| 1 | Security Posture | 2/3 | Secrets, RLS, payload bounds, constant-time cron authentication, headers, and dependency gates are strong; anonymous telemetry still lacks an edge request budget. |
| 2 | Performance | 3/3 | Route splitting, hard bundle budgets, bounded provider requests, CDN caching, and cached tournament simulation are implemented and measured. |
| 3 | Architecture | 2/3 | Domain and server boundaries are clear, but an optional cloud read can block the primary route and prediction evidence omits research provenance. |
| 4 | Code Quality | 2/3 | Strict types and lint are clean with no oversized production file; the public export surface and a few oversized suites need pruning. |
| 5 | Test Health | 2/3 | 729 unit tests and 8 E2E journeys pass, but critical bet-placement safety is partly asserted by source-string ordering and traditional-game accessibility is not scanned. |
| 6 | Resilience | 2/3 | Provider fallbacks and explicit unavailable states are good; the cloud snapshot fetch has no timeout and is awaited by the initial-load barrier. |
| 7 | Operations | 2/3 | CI, deployment gates, health monitoring, telemetry retention, and rollback exist; the optional minute cron and database recovery posture need hardening. |
| | **Total** | **15/21** | **Solid** |

| Bonus | Score | Rationale |
| --- | :---: | --- |
| Accessibility | +1/3 | Dialog focus behavior, reduced motion, visible focus rings, and World Cup Axe checks exist, but the roulette game's primary betting surface is pointer-only. |
| **Bonus** | **+1/3** | |

## Executive Summary

The repository is healthy and deployable: every mechanical gate passes, production
health is green, bundle sizes are controlled, secrets remain server-side, and the
World Cup data/research paths are live. The fixes recorded in the July 3–4 audits—
immutable prediction snapshots, CSP, telemetry retention, deterministic simulation,
and modal keyboard behavior—remain present.

The highest-leverage remaining work is concentrated in two production paths. First,
the browser awaits an unbounded Supabase snapshot read alongside required fixture and
research data, so a hanging optional read can keep the entire World Cup page loading
forever. Second, the optional per-minute Supabase schedule calls the complete evidence
and research pipeline and creates a distinct append-only fixture observation on each
run because retrieval time participates in the hash. This is not currently shown as
active by the production health record, but it is a hazardous documented operation if
enabled as written.

- **Critical:** 0
- **High:** 2
- **Medium:** 5
- **Low:** 1

## Must Fix

No currently active credential-exposure, remote-code-execution, confirmed data-loss,
or release-blocking correctness defect was found.

## Spec Compliance Findings

### Should Consider

#### High — Optional cloud snapshot read can hang the complete World Cup route

**Files:** `src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.ts:66`,
`src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts:184`,
`src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts:210`
**Flagged by:** resilience, architecture, performance
**Confidence / effort:** High / S–M

`loadCloudPreMatchPredictionSnapshots()` calls `fetch()` without an `AbortSignal` or
deadline. `loadSharedSnapshots()` catches eventual rejection, but a connection that
never settles does not reject. The hook then includes that optional read in the same
`Promise.all` barrier as required fixture and research data. A stalled Supabase REST
connection can therefore leave the initial page in its loading state indefinitely.
This also conflicts with the feature specification's requirement that external
requests have timeouts.

**Excerpt:**

```ts
const response = await (config.fetcher ?? fetch)(endpoint.toString(), {
  headers: { /* ... */ },
});

const [dataSource, sharedSnapshots, strategyResearch] = await Promise.all([
  loadWorldCupDataSource(),
  loadSharedSnapshots(),
  loadWorldCupStrategyResearch(),
]);
```

**Recommendation:** accept an `AbortSignal` or enforce a short deadline in the cloud
store, and make historic cloud snapshots fail open independently using a bounded
promise or `Promise.allSettled`. Add a fake-timer regression where the fetcher never
resolves and prove that the page still builds from live/local inputs.

#### Medium — Immutable predictions do not retain the research input identity

**Files:** `src/server/worldCup/strategyResearchEndpoint.ts:17`,
`src/server/worldCup/publicEvidenceJob.ts:83`,
`src/modules/sports/football/worldCup/research/strategyResearchSnapshot.ts:11`,
`src/modules/sports/football/worldCup/persistence/preMatchPredictionStore.ts:136`,
`src/modules/sports/football/worldCup/types.ts:223`
**Flagged by:** data, architecture, product
**Confidence / effort:** High / M

Historical results are fetched from the mutable GitHub `master` branch. The research
response includes a source URL, generation time, audit report, and team ratings, but
the scheduled job converts that response to domain state and persists only the final
prediction. `PreMatchPredictionSnapshot` has no source commit, dataset hash, research
generation time, candidate identity, or model-configuration identity. Later analysis
can prove what the model output was, but not exactly which historical bytes and
research result produced it.

This falls short of the project specification that every observation retain source,
retrieval time, content hash, schema version, and validation errors, and that scheduled
predictions be auditable.

**Recommendation:** pin the upstream dataset to a commit or persist its content hash,
then store a compact research provenance block with each first-capture prediction:
dataset commit/hash, research `generatedAt`, selected candidate ID, rating-set hash,
and model/config version. Version the snapshot schema and migration rather than
overloading existing rows.

## Code Quality Findings

### Should Consider

#### High — The optional minute cron runs the entire expensive evidence pipeline and grows append-only evidence each minute

**Files:** `supabase/configure_prediction_snapshot_cron.sql:19`,
`src/server/worldCup/predictionSnapshotEndpoint.ts:129`,
`src/server/worldCup/publicEvidenceJob.ts:36`,
`src/server/worldCup/publicEvidenceJob.ts:76`,
`supabase/migrations/20260702190000_create_world_cup_public_evidence.sql:1`,
`README.md:170`
**Flagged by:** operations, performance, data
**Confidence / effort:** High / M

The optional script schedules the protected endpoint with `* * * * *`. That endpoint
does not perform a lightweight “freeze the soon-to-kick-off matches” operation: it
loads the public snapshot, writes public evidence, loads the research endpoint,
rebuilds the full domain, captures predictions, prunes telemetry, and writes health.
The research endpoint currently processes 49,501 historical rows and took 4.09 seconds
in the live check.

Fixture evidence hashes the full fixture payload plus provenance. Provenance includes
the current `retrievedAt`, so otherwise unchanged fixtures receive a new content hash
on every run. The append-only table de-duplicates only `(kind, content_hash)`, making a
continuously enabled schedule capable of adding about 1,440 fixture rows per day while
repeating the full research/domain workload. The normal Vercel daily task can also
overlap it. The current health record is consistent with the daily task; this audit did
not find evidence that the optional minute schedule is active now.

**Excerpt:**

```sql
select cron.schedule(
  'lock-world-cup-predictions-every-minute',
  '* * * * *',
```

**Recommendation:** do not enable this script unchanged. Split first-capture snapshot
freezing from full evidence/research refresh, hash source content separately from
observation time, cache or pin research, gate high-frequency work to a bounded match
window, add a single-flight/job lock, and provide an explicit disable script plus row
and compute budgets.

#### Medium — Anonymous telemetry has storage caps but no request-rate budget

**Files:** `src/server/worldCup/clientTelemetryEndpoint.ts:105`,
`supabase/migrations/20260703150000_create_world_cup_client_telemetry.sql:80`
**Flagged by:** security, operations
**Confidence / effort:** High / S–M
**Status:** carried forward from the 2026-07-04 production follow-up audit.

The endpoint validates exact `Origin`, media type, body size, schema, and server-owned
metadata. The database serializes daily admission and caps new rows and per-row sample
counts. These are valuable storage controls, but `Origin` is not authentication—a
direct client can set it—and every request still reaches the Vercel function and a
Supabase RPC. Once storage is saturated, abusive requests continue consuming function,
database, advisory-lock, and count-query work.

**Recommendation:** add provider-level/WAF rate limiting and 429 responses keyed by a
privacy-preserving network bucket, plus volume and rejection alerts. Keep anonymous
telemetry advisory rather than treating it as trusted product evidence.

#### Medium — No database backup/PITR and restore drill is documented for immutable evidence

**Files:** `README.md:165`, `docs/runbooks/world-cup-production.md:201`
**Flagged by:** data, operations
**Confidence / effort:** High / S

The runbook documents application rollback and correctly forbids deleting append-only
evidence, but it does not state the Supabase backup/PITR tier, retention period,
recovery-point objective, recovery-time objective, or a tested restore procedure. The
README calls the daily evidence capture a “backup evidence task”, but another capture
is not a database backup. First-capture predictions and historic evidence cannot be
reconstructed exactly after database loss.

**Recommendation:** document the actual managed-backup/PITR configuration, owners,
retention, RPO/RTO, and a periodic restore drill into an isolated project. If the
current Supabase plan has no adequate recovery feature, add an encrypted logical export
with tested restoration and retention.

#### Medium — Roulette's primary betting surface is inaccessible to keyboard and assistive technology

**Files:** `src/games/roulette/components/RouletteTable.tsx:19`,
`src/games/roulette/components/RouletteTable.tsx:34`,
`src/games/roulette/components/RouletteTable.tsx:57`,
`src/games/roulette/components/RouletteTable.tsx:75`,
`tests/e2e/world-cup-public-data.spec.ts:198`
**Flagged by:** accessibility, product, test quality
**Confidence / effort:** High / M

The 0–36 cells, column bets, dozens, and outside bets are clickable `div` elements with
no focusability, button role, accessible state, or Enter/Space handling. Keyboard and
screen-reader users cannot perform the game's main action. The only Axe scan runs on
World Cup journeys, while the traditional-game smoke test checks visibility and two
mouse-driven flows, so the issue is outside the current automated accessibility net.

**Recommendation:** render each actionable bet as a native `button` while preserving
the CSS grid, expose the bet name and current amount in its accessible name/state, add
visible focus styling and disabled semantics, and add keyboard plus Axe coverage for
the roulette route.

#### Medium — Critical bet-safety coverage relies on source text and two suites have become maintenance hotspots

**Files:** `src/games/BetPlacementSafety.test.ts:1`,
`src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts:54`,
`src/modules/sports/football/worldCup/backtest/worldCupBacktest.test.ts:27`
**Flagged by:** test quality, senior engineering
**Confidence / effort:** High / M

`BetPlacementSafety.test.ts` reads hook source files, finds two string fragments, and
asserts their first textual occurrence order. It does not execute a failed debit,
state mutation, double action, or settlement. An unrelated earlier string can produce
a false pass, while a behavior-preserving refactor can fail the test. This is weak
assurance for accounting invariants. Separately, the domain-builder test is 1,126 LOC
and the backtest suite is 855 LOC, which raises fixture duplication and review cost even
though their individual assertions are useful.

**Recommendation:** keep the source-policy check only as a secondary guard. Extract a
pure bet transaction/state transition boundary and test failed debit, successful debit,
duplicate actions, clear/reset, and settlement through public behavior for every game.
Split the two World Cup suites by responsibility and introduce focused fixture builders.

### Worth Noting

#### Low — The exported API surface is wider than the application uses

**Files:** representative barrels under
`src/modules/sports/football/worldCup/backtest/index.ts` and adjacent research modules
**Flagged by:** code quality, architecture
**Confidence / effort:** High / S–M

Knip reported 45 unused exported values, 95 unused exported types, and two duplicate
export aliases. These counts are not equivalent to 142 dead implementations, and four
reported unused files were Vercel entrypoint false positives. Still, this private
application exposes many research/backtest helpers that no caller imports, which makes
ownership and safe deletion harder to see.

**Recommendation:** configure Knip with the Vercel function entrypoints, remove unused
export modifiers and duplicate aliases in small batches, and retain broad exports only
where a documented package/test boundary needs them.

## Task Clusters

> Findings are grouped by what should be changed together, ordered by leverage.

### 1. Make World Cup loading fail open

| Severity | File | Issue |
| --- | --- | --- |
| High | `cloudPreMatchPredictionStore.ts:66` | Cloud fetch has no deadline |
| High | `useWorldCupDomain.ts:210` | Optional cloud history blocks primary initial load |

**Suggested approach:** add abortable cloud loading first, then decouple it from the
required data barrier and add the never-resolving-fetch regression.

### 2. Separate high-frequency snapshot capture from research/evidence refresh

| Severity | File | Issue |
| --- | --- | --- |
| High | `configure_prediction_snapshot_cron.sql:19` | Per-minute schedule invokes the full job |
| High | `publicEvidenceJob.ts:39` | Retrieval time participates in append-only content identity |
| Medium | `strategyResearchEndpoint.ts:17` | Mutable research input is not pinned |
| Medium | `preMatchPredictionStore.ts:136` | Prediction omits research/model provenance |

**Suggested approach:** define separate job contracts and schemas before changing the
cron. Add provenance to versioned snapshots, stabilize content identity, then introduce
match-window scheduling and concurrency/cost guards.

### 3. Close production operational boundaries

| Severity | File | Issue |
| --- | --- | --- |
| Medium | `clientTelemetryEndpoint.ts:105` | No edge request-rate budget |
| Medium | `world-cup-production.md:201` | No database recovery posture or restore drill |

**Suggested approach:** add rate limiting and observability, then record and test the
real Supabase recovery mechanism. Neither change requires altering prediction logic.

### 4. Make traditional-game safety testable and keyboard-operable

| Severity | File | Issue |
| --- | --- | --- |
| Medium | `RouletteTable.tsx:19` | Primary betting controls are pointer-only |
| Medium | `BetPlacementSafety.test.ts:1` | Accounting guard is a source-string assertion |

**Suggested approach:** introduce semantic roulette buttons and a pure/shared bet-state
transition boundary, then add keyboard, Axe, failed-debit, and settlement regressions.

### 5. Reduce maintenance surface

| Severity | File | Issue |
| --- | --- | --- |
| Medium | `buildWorldCupDomain.test.ts:54` | 1,126 LOC multi-responsibility test suite |
| Medium | `worldCupBacktest.test.ts:27` | 855 LOC repeated-fixture suite |
| Low | `worldCup/backtest/index.ts` | Broad unused/duplicate export surface |

**Suggested approach:** split tests around domain responsibilities with shared builders,
then prune exports using a configured Knip baseline.

<details>
<summary>Dismissed findings (5 items)</summary>

| Finding | Reason dismissed |
| --- | --- |
| Two World Cup dependency cycles | The cycle-closing edges are type-only imports and create no runtime cycle. |
| Four unused API files reported by Knip | They are Vercel function entrypoints, not dead files. |
| React class `ErrorBoundary` | Class-based error boundaries remain a valid React implementation pattern. |
| Global `outline: none` | The same rule supplies a visible shared focus-ring box shadow; the raw scanner signal was not a defect. |
| Date-sensitive World Cup smoke failure from the June audit | The current E2E uses a fixed clock and all 8 journeys pass. |

</details>

## Next Steps

1. Fix the unbounded cloud snapshot read and add the fail-open regression.
2. Do not enable the minute cron until the snapshot job is separated from full research/evidence work and content identity is corrected.
3. Version prediction snapshots with pinned research/model provenance.
4. Convert the roulette bet grid to native controls and extend Axe/keyboard coverage to traditional games.
5. Add edge telemetry rate limiting and document a tested Supabase restore path.
6. Replace source-string accounting checks with behavioral state-transition tests, then split the two oversized test suites and prune exports.
