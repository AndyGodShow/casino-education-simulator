# Audit Report: full codebase re-audit

**Date:** 2026-07-13
**Scope:** full `baccarat-sim` workspace; independent re-check of the same source revision
**Project type:** React 19 + Vite 7 + TypeScript 5.9, Vercel Functions, Supabase
**Project stage:** production
**Reviewers:** security, performance, architecture, data, senior/code quality,
test quality, React/product/resilience, and accessibility specialist passes, plus
mechanical checks and primary-agent vetting

> All High findings were reopened against the current source by the primary reviewer.
> The random-query cache bypass was also reproduced against production. Medium and Low
> findings were checked against current files rather than copied from the first report.

## Re-audit Outcome

The code revision has not changed since the first 2026-07-13 audit, and every quality
gate remains green. This deeper pass nevertheless found four important omissions in the
first report: public GET cache-key abuse, route-independent game preloading, broken lazy
module retry, and widespread unlabeled traditional-game inputs. It also corrected two
severity ratings and narrowed the claim about the optional minute Cron.

This is therefore a **review-depth correction, not a source-code regression**.

## Mechanical Verification

| Check | Result |
| --- | :---: |
| Production build | Passed, 909 modules |
| TypeScript | Passed |
| ESLint | Passed |
| Unit/integration | 112 files, 729 tests passed |
| Playwright | 8/8 passed in 46.1 s |
| Dependency audit | 0 vulnerabilities |
| Build budgets | All passed |
| Initial JS | 66.12 KiB gzip / 70 KiB |
| World Cup route JS | 59.80 KiB gzip / 90 KiB |
| Largest JS chunk | 105.18 KiB gzip / 120 KiB |
| Production health | Healthy; latest job `2026-07-12T08:37:17.21Z` |
| Public data | 200; 2.54 s; 104 matches; 0 provider errors |
| Public research | 200; 5.04 s; 49,501 rows; 256 ratings |
| Random-query cache test | Both `data` and `research` returned `x-vercel-cache: MISS` |

## Structural Hotspots

- Files over 600 LOC: 2, both tests.
- Severe files over 1,000 LOC: 1.
- Production files over 600 LOC: 0.
- Auto-fail files over 2,000 LOC: 0.
- Suspicious boundary wrappers: 0.

| File | LOC | Assessment |
| --- | ---: | --- |
| `buildWorldCupDomain.test.ts` | 1,126 | Severe test-maintenance hotspot |
| `worldCupBacktest.test.ts` | 855 | Large repeated-fixture test suite |
| `buildWorldCupDomain.ts` | 577 | Largest production file; cohesive domain assembly |

The mapper's two World Cup cycles are closed by `import type` edges and are not runtime
cycles. Four Knip “unused files” are Vercel route entrypoints. The remaining Knip output
is real public-surface noise: 45 unused exports, 95 unused exported types, and two
duplicate export aliases.

## Scorecard: 13/21 — Solid

| # | Axis | Score | Rationale |
| --- | --- | :---: | --- |
| 1 | Security | 2/3 | Strong RLS, secret isolation, input bounds, headers, and clean dependencies; public high-cost endpoints still lack request budgets and canonical cache keys. |
| 2 | Performance | 1/3 | Per-chunk budgets pass, but auxiliary cloud I/O is unbounded, unrelated game preloads measurably delay World Cup, and minute refreshes run large main-thread simulations. |
| 3 | Architecture | 2/3 | Clear domain/server/UI boundaries and no runtime cycles; initialization orchestration and research provenance remain coupled. |
| 4 | Code Quality | 2/3 | Strict types and lint are strong; the World Cup hook mixes responsibilities and several recovery/optional-preload contracts are misleading. |
| 5 | Test Health | 2/3 | Broad, reliable unit and E2E coverage; critical Hook orchestration and bet accounting contain false-confidence gaps. |
| 6 | Resilience | 1/3 | Many fallbacks exist, but one route can wait forever and the advertised lazy-module retry does not recover its failure mode. |
| 7 | Operations | 3/3 | Full CI, deployment gates, monitoring, telemetry, health checks, and rollback are configured and passing. |
| | **Total** | **13/21** | **Solid** |

| Bonus | Score | Rationale |
| --- | :---: | --- |
| Accessibility | +1/3 | Dialog work is good, but core roulette betting and many traditional-game inputs remain inaccessible. |

## Finding Counts

- **Critical:** 0
- **High:** 8
- **Medium:** 15
- **Low:** 2

## Must Fix

No confirmed credential exposure, injection path, authorization bypass, or active data
corruption was found.

## Spec-compliance Findings

### High — Optional cloud snapshots can block the complete World Cup route forever

**Files:** `src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.ts:79`,
`src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts:210`
**Confidence:** 99%

```ts
const response = await (config.fetcher ?? fetch)(endpoint.toString(), {
  headers: { /* Supabase publishable credentials */ },
});

const [dataSource, sharedSnapshots, strategyResearch] = await Promise.all([
  loadWorldCupDataSource(),
  loadSharedSnapshots(),
  loadWorldCupStrategyResearch(),
]);
```

The auxiliary Supabase read has no timeout or signal. A connection that never resolves
does not reach the catch, keeps `domain` null, and leaves `refreshInFlight` true forever.
This directly violates the feature specification's bounded-external-request requirement.

**Recommendation:** add an abortable 2–3 second boundary and merge snapshots after the
required data path has rendered. Test with a fetcher that never resolves.

### Medium — Prediction evidence cannot reproduce its research input

**Files:** `src/server/worldCup/strategyResearchEndpoint.ts:17`,
`src/modules/sports/football/worldCup/research/strategyResearchSnapshot.ts:11`,
`src/modules/sports/football/worldCup/types.ts:223`

Historical results use mutable `master` URLs, while immutable predictions omit dataset
hash/commit, research generation time, candidate ID, rating-set hash, and model config.
Store a versioned provenance reference with every first-capture prediction.

### Medium — `content_hash` mixes stable content identity with observation time

**Files:** `src/server/worldCup/publicDataEndpoint.ts:73`,
`src/server/worldCup/publicEvidenceJob.ts:39`,
`supabase/migrations/20260702190000_create_world_cup_public_evidence.sql:12`

Recording every retrieval is consistent with the specification. The problem is semantic:
`retrievedAt` participates in `content_hash`, so identical provider content always has a
new hash. Preserve observation time separately and hash only canonical provider content.

### Medium — Telemetry retention depends on the whole evidence task succeeding first

**Files:** `src/server/worldCup/predictionSnapshotEndpoint.ts:129`,
`supabase/migrations/20260704130000_prune_world_cup_client_telemetry.sql:10`

`pruneTelemetry()` runs only after `runJob()` succeeds. Long provider/research/evidence
failure therefore also suspends the 30-day retention promise. Run retention from an
independent database schedule or attempt and report it independently of evidence status.

### Medium — The optional minute schedule is a high-fan-out configuration trap

**Files:** `supabase/configure_prediction_snapshot_cron.sql:19`,
`src/server/worldCup/publicEvidenceJob.ts:79`, `README.md:170`

If enabled, it invokes the complete fixture/market/domain/persistence flow 1,440 times a
day and creates a fresh observation hash on each run. No repository evidence proves it is
currently enabled, so this is Medium rather than an active High incident.

**Correction to the first report:** the research endpoint has a six-hour CDN cache. The
minute job normally parses the cached ~50 KB research JSON; it does **not** download and
re-optimize the full up-to-6 MB CSV every minute. Full research recomputation occurs on
cache misses/expiry, while domain simulation and evidence work still run per invocation.

## Code-quality and Production Findings

### High — Random query parameters bypass cache for two expensive public GET endpoints

**Files:** `src/server/worldCup/publicDataEndpoint.ts:89`,
`src/server/worldCup/strategyResearchEndpoint.ts:98`
**Confidence:** 95%

Both endpoints ignore query parameters and perform expensive work, but do not reject or
canonicalize them. Production requests with a fresh `?reaudit_nonce=` returned
`x-vercel-cache: MISS` for both endpoints. An attacker can rotate meaningless parameters
to force provider requests and 49,501-row research computation.

**Recommendation:** reject undeclared query parameters or redirect to the canonical URL,
add edge request budgets, and consider scheduled/versioned static research artifacts.

### High — Anonymous telemetry can be driven past storage limits as a compute attack

**Files:** `src/server/worldCup/clientTelemetryEndpoint.ts:114`,
`supabase/migrations/20260703150000_create_world_cup_client_telemetry.sql:80`
**Confidence:** 95%

`Origin` is forgeable by direct clients. Every valid request still invokes a service-role
RPC, advisory lock, update, and possibly a count query, even after the 5,000-row admission
cap is full. Add Vercel Firewall/WAF rate and burst limits with 429 responses and alerts.

**Severity correction:** the first report called this Medium. Arc's production calibration
classifies a missing request budget on a public write/compute surface as High.

### High — Global idle preloading measurably delays the World Cup route

**File:** `src/App.tsx:128`
**Confidence:** 98%

```ts
const preloadFeaturedGames = () => IDLE_PRELOAD_GAME_IDS.forEach(preloadGame);
```

The effect runs on every route and preloads Baccarat, Blackjack, Roulette, and shared
dependencies. A controlled 4× CPU comparison measured roughly 153 KB extra compressed
transfer and a 0.65–0.88 second slower World Cup visible state.

**Recommendation:** preload only inside the traditional lobby or on user intent; add a
Resource Timing regression proving sports routes do not fetch game chunks before visible.

### High — ErrorBoundary “retry” cannot recover a rejected `React.lazy` chunk

**Files:** `src/components/ErrorBoundary.tsx:34`, `src/App.tsx:166`
**Confidence:** 92%

```ts
handleRetry = () => {
  this.setState({ hasError: false, error: null });
};
```

`React.lazy` caches the rejected loader result. Clearing only boundary state renders the
same rejected lazy type and immediately fails again. Implement a real remount/re-import
strategy or make this recovery action a page reload.

### High — The Hook-named test suite never executes `useWorldCupDomain`

**File:** `src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts:4`
**Confidence:** 98%

The test imports only pure helpers, not the Hook. A permanent cloud wait, 60-second refresh,
visibility refresh, overlap guard, and unmount behavior can regress while all tests remain
green. Extract a dependency-injected coordinator or mount the Hook with fake timers and
never-resolving/late-resolving boundary fakes.

### High — Roulette's primary betting surface is pointer-only

**File:** `src/games/roulette/components/RouletteTable.tsx:23`
**Confidence:** 99%

Zero, numbers, columns, dozens, and outside bets use clickable `div` elements without
focus, role, keyboard handlers, accessible names, or state. Replace them with native
buttons and add a complete keyboard betting journey. WCAG 2.1.1 and 4.1.2.

### High — Traditional-game amount and simulation fields lack programmatic labels

**Representative files:** `src/games/roulette/components/RouletteControls.tsx:99`,
`src/games/baccarat/components/Controls/Controls.tsx:88`,
`src/components/SimulationPanel/SimulationPanel.tsx:114`
**Confidence:** 97%

Custom amounts rely on placeholder text, while simulation labels are neither wrapping
labels nor associated through `htmlFor`/`id`. Apply a unique label relationship to every
input/select across the shared and game-specific controls. WCAG 1.3.1, 3.3.2, 4.1.2.

### Medium findings

| Area | Files | Finding |
| --- | --- | --- |
| Scheduled research | `predictionSnapshotEndpoint.ts:71` | Internal HTTP call to the public research route has no timeout; platform timeout may prevent failure-health recording. |
| Refresh performance | `useWorldCupDomain.ts:297`, `buildWorldCupDomain.ts:68` | Every visible minute runs a full domain build and 1,000 tournament simulations; 4× CPU profiling found 284–318 ms main-thread tasks. |
| Preload resilience | `App.tsx:107` | Fire-and-forget dynamic imports have no rejection handler and ignore Save-Data/slow-network signals. |
| Hook ownership | `useWorldCupDomain.ts:194` | The 314-line Hook owns remote loading, refresh, storage merge, research, markets, rebuilds, capture, persistence, and fallback. |
| Empty state | `WorldCupHome.tsx:81` | No selected match always shows a loading skeleton, even when the filter is empty rather than loading. |
| Database recovery | `world-cup-production.md:215` | No verified Supabase PITR/backup window, RPO/RTO, owner, or isolated restore drill is documented. |
| Dialog focus | `EducationalOverlay.tsx:27` | Educational dialog moves focus inward but does not restore the opener on close. |
| Status announcements | traditional result views | Deal/spin/result/balance changes lack a stable `aria-live` status message. |
| Reduced motion | `SlotMachine.module.css:58` | Multiple infinite animations have no reduced-motion branch or pause route. |
| Touch targets | `RouletteTable.module.css:118`, `App.css:98` | Several game/header controls are below the project's 44×44 touch baseline. |
| Bet-safety tests | `BetPlacementSafety.test.ts:12` | Source-string ordering gives false confidence instead of testing failed debit and settlement behavior. |

### Low findings

1. The public export surface remains wider than its real consumers: 45 unused exports,
   95 unused exported types, and two duplicate aliases.
2. The 1,126- and 855-line World Cup test files should be split by behavioral capability
   with shared fixture builders; they are test-maintenance debt, not production god files.

## Task Clusters

### 1. Bound World Cup orchestration

- Add cloud and internal-research deadlines.
- Decouple optional snapshots from required first render.
- Extract/test the refresh coordinator.
- Cache or offload simulation when inputs are unchanged.

### 2. Harden public request economics

- Canonicalize/reject query parameters for `data` and `research`.
- Add edge rate/burst budgets for public GETs and telemetry.
- Alert on 429 volume, RPC latency, and cache misses.

### 3. Correct background data lifecycle

- Version research/prediction provenance.
- Separate content identity from observation identity.
- Decouple telemetry retention.
- Replace the minute full-pipeline Cron with a bounded match-window snapshot job.
- Document and test database restoration.

### 4. Fix frontend loading and recovery contracts

- Scope idle preloading to traditional-game intent.
- Consume optional preload failures.
- Implement real lazy-chunk recovery.
- Distinguish loading from empty selection/filter states.

### 5. Make traditional games operable for everyone

- Convert roulette bets to buttons.
- Label all amount/simulation fields.
- Add result live regions, reduced-motion handling, 44 px targets, and opener focus return.
- Run Axe plus keyboard journeys across all traditional games.

### 6. Improve test and module maintainability

- Replace source-string accounting checks with behavior tests.
- Split the two oversized suites.
- Configure Knip for Vercel entrypoints, then prune the real unused/duplicate exports.

<details>
<summary>Dismissed findings</summary>

- The mapper's World Cup cycles are type-only, not runtime cycles.
- Four Knip unused API files are Vercel route entrypoint false positives.
- The class-based ErrorBoundary is valid; its retry behavior, not its class form, is the issue.
- Global `outline: none` has a shared focus-ring replacement.
- Cron authentication and Supabase RLS/service-role separation were rechecked and remain sound.
- No dynamic SQL, unsafe HTML, eval-like execution, hardcoded credential, or service-role client leak was found.
- Polymarket fan-out is capped at eight matches per invocation.
- The maximum production file is 577 LOC and was not classified as a god module solely by size.

</details>

## Changes From the First Report

1. Security remains 2/3, but the missing GET cache-key boundary is newly reported.
2. Performance changes from 3/3 to 1/3 after route-level resource and main-thread profiling.
3. Resilience changes from 2/3 to 1/3 after validating lazy retry behavior.
4. Operations is derived as 3/3 because the full automated pipeline and monitoring are
   present; backup/retention findings remain concrete improvements rather than evidence
   that the current build/deploy pipeline is absent.
5. Anonymous telemetry rate limiting is raised from Medium to High for production.
6. Optional Cron is lowered from High to Medium while inactive, and the per-minute full-CSV
   claim is withdrawn because the research endpoint is normally served from six-hour CDN cache.

## Next Steps

1. Fix the cloud timeout/fail-open path and its Hook-level regression first.
2. Close the random-query cache bypass and add edge request budgets.
3. Remove global game idle preloads from sports routes and implement real lazy recovery.
4. Correct roulette semantics and label the shared/game control inputs.
5. Then address evidence provenance, retention independence, recovery documentation, and
   the optional Cron design.
