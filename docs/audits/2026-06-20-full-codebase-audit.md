# Audit Report: full codebase

**Date:** 2026-06-20  
**Scope:** full `baccarat-sim` workspace  
**Project type:** Vite + React 19 + TypeScript casino/sports probability education simulator  
**Project stage:** development  
**Review method:** mechanical checks plus local performance, architecture, code quality, frontend, testing, and operations review lenses

> Severity is calibrated for development. Production hardening items are advisory unless they currently break behavior, data integrity, or repeatability.

## Detection Summary

- **Source files:** 307 source files in the codebase map, 305 from raw `find` before generated outputs.
- **Tests:** 74 test/spec files.
- **Database/auth/server sensitive surface:** none detected.
- **Dependency audit:** `npm audit` via `pnpm dlx npm@latest audit --json` found 0 vulnerabilities across 296 dependencies.
- **Security gate:** lightweight only; no high/critical dependency vulnerability or likely hardcoded credential found.
- **Git state:** working tree is dirty, with a large uncommitted World Cup feature surface plus several provider/UI edits.
- **CI/deploy config:** no `.github/workflows`, `vercel.json`, `Dockerfile`, or comparable deployment config detected. One manual deploy script exists.

## Mechanical Checks

| Check | Result | Notes |
| --- | :---: | --- |
| Build | Pass | `tsc -b && vite build` passed through bundled pnpm/Node. |
| Lint | Pass | `eslint .` clean. |
| Unit tests | Pass | 74 files, 431 tests passed. |
| E2E | Fail | 1 of 3 Playwright smoke tests failed. |
| Dependency audit | Pass | 0 vulnerabilities. |
| Knip | No output | No compact dead-code findings surfaced in this run. |

E2E failure:

```text
tests/e2e/smoke.spec.ts:72
expect(page.getByText('概率概览')).toBeVisible()
```

The page selected an already-finished World Cup match, so `MatchInsightPanel` rendered the final-score branch rather than the probability overview.

## Structural Hotspots

- **Long source files >600 LOC:** 0.
- **Severe long files >1000 LOC:** 0.
- **Largest production files:** `MatchInsightPanel.tsx` 415 LOC, `historicalBacktest.ts` 398 LOC, `buildWorldCupDomain.ts` ~371 LOC, `alphaEvaluator.ts` 349 LOC.
- **Import cycles:** 0 in the codebase map.
- **High fan-in:** `src/modules/sports/football/worldCup/types.ts` has 58 importers, which is expected for a domain type module but should stay intentionally curated.
- **Pure re-export barrels:** several `index.ts` files under game entrypoints and UI/design-system. These are mostly public entrypoints, not immediate blockers.

## Scorecard: 10/18 +1/3 Accessibility - Developing

Security was not fully scored because the development-stage security gate stayed lightweight and clean.

| # | Axis | Score | Rationale |
| --- | --- | :---: | --- |
| 1 | Security Posture | -- | Lightweight gate clean: dependency audit clean and no likely secrets detected. |
| 2 | Performance | 2/3 | Good code splitting and build output, but World Cup simulation is synchronous and potentially main-thread heavy. |
| 3 | Architecture | 2/3 | Clear domain/UI split and no giant files/cycles; World Cup page still couples live provider/date/default selection tightly into the view. |
| 4 | Code Quality | 2/3 | Type/lint clean with strong tests; a few casts, global mutable store patterns, and barrels remain. |
| 5 | Test Health | 1/3 | Unit suite is strong, but Playwright smoke currently fails, so refactor confidence is capped. |
| 6 | Resilience | 2/3 | Error boundary and data-source caveats exist; the default World Cup detail state degrades into a non-prediction panel unexpectedly. |
| 7 | Operations | 1/3 | Build/lint/unit pass locally, but E2E fails, no CI is configured, and deploy script assumes unavailable `npm`/`npx` in this environment. |
|   | **Total** | **10/18** | **Developing** |

| Bonus | Score | Rationale |
| --- | :---: | --- |
| Accessibility | +1/3 | Semantic buttons/headings exist, but CSS contains widespread `transition: all`, `outline: none`, and permanent `will-change` signals that need focused review. |

## Findings

### High

#### Date-dependent World Cup default selection breaks the sports smoke flow

**Files:** `src/dataProviders/football/matchStateEngine.ts:5`, `src/dataProviders/football/worldCupAdapter.ts:257`, `src/modules/sports/football/worldCup/WorldCupHome.tsx:19`, `src/modules/sports/components/explanation/MatchInsightPanel.tsx:121`, `tests/e2e/smoke.spec.ts:72`

`adaptWorldCupFixtures()` defaults to `new Date()`, and on 2026-06-20 the OpenFootball schedule contains past kickoff dates. `WorldCupHome` defaults to `matches[0]`; that match is now marked `finished`, and `MatchInsightPanel` returns the final-score-only branch. The E2E test expects the probability overview, so the smoke suite fails.

**Recommendation:** inject a fixed clock/domain into tests, and make the page default to the first match that can show prediction insight, or update the test to intentionally select a scheduled match before asserting prediction sections.

### Medium

#### World Cup simulation runs synchronously during domain construction

**Files:** `src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts:167`, `src/modules/sports/football/worldCup/logic/groupSimulation.ts:191`

`buildWorldCupDomain()` runs `simulateManyTournaments({ iterations: 1000, matches, teams })` synchronously. With 104 matches, each iteration re-predicts scores and ranks groups on the main thread after provider data loads. The build passes, but this is a plausible UI hitch as the sports module grows.

**Recommendation:** memoize per-match prediction inputs, lower/default-gate iterations for initial render, or move simulation behind a user action/Web Worker/deferred transition.

#### World Cup page tests do not cover the live async/provider/date path

**Files:** `src/modules/sports/football/worldCup/WorldCupHome.test.tsx:7`, `src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts:16`

The unit smoke renders static markup and asserts the loading skeleton, while the failing behavior requires async provider loading plus date-based status computation. The important page state has only E2E coverage, and that E2E is currently time-sensitive.

**Recommendation:** allow `WorldCupHome` or `useWorldCupDomain` to receive a test domain/provider/clock. Add a component or integration test for default selected match behavior with both scheduled and finished fixtures.

#### Operations are not reproducible from a clean automation path

**Files:** `scripts/deploy.sh:6`, `scripts/deploy.sh:9`, `package.json:6`

The project has useful scripts, but no CI workflow was detected. The deploy script hardcodes `npm` and `npx`; this Codex shell had neither, so checks had to run through bundled `pnpm`. E2E is also absent from deploy gating and currently fails.

**Recommendation:** choose one package manager for scripts, add CI for build/lint/typecheck/unit/E2E smoke, and update deploy gating to call the same scripts CI runs.

### Low

#### CSS interaction rules need a cleanup pass

**Files:** examples include `src/games/roulette/components/RouletteControls.module.css:47`, `src/games/baccarat/components/Controls/Controls.module.css:63`, `src/games/craps/components/CrapsDice.module.css:107`

The CSS scan found many `transition: all`, several `outline: none`, and permanent `will-change` declarations. These are not breaking tests today, but they are performance/accessibility footguns.

**Recommendation:** replace `transition: all` with explicit properties, ensure visible focus styles wherever outline is removed, and only enable `will-change` during active animation when practical.

#### Design token CSS variable typing bypasses TypeScript

**File:** `src/modules/ui/designSystem/designTokens.ts:30`

`designCssVariables` uses `as unknown as CSSProperties`. It is a common workaround for CSS custom properties, but it weakens type safety in a central design-system export.

**Recommendation:** introduce a local typed custom-property map, for example `CSSProperties & Record<\`--${string}\`, string>`, so the cast is narrower and intentional.

#### Alpha calculation has a hidden module-level recording side effect

**Files:** `src/modules/sports/football/worldCup/logic/alphaEngine.ts:109`, `src/modules/sports/football/worldCup/alpha/alphaStore.ts:113`

`computeAlpha()` records into `defaultAlphaStore` every time prediction logic runs. Tests reset the store, but production/domain code can accumulate in-memory records as a side effect of prediction calls.

**Recommendation:** make recording explicit at orchestration boundaries, or inject the store into the alpha workflow so pure prediction remains deterministic.

## Task Clusters

### 1. Stabilize World Cup Page State and Tests

**Priority:** High  
**Why:** This is the only current red check and is caused by real time/date behavior.

Suggested order:

1. Add a deterministic clock/provider seam for World Cup domain construction.
2. Decide product behavior for default selected match: first scheduled prediction-ready match, or first match overall with a clear final-score detail.
3. Update `tests/e2e/smoke.spec.ts` to select a prediction-ready match or assert the intended default state.
4. Add a focused unit/integration test around scheduled vs finished default selection.

### 2. Make World Cup Heavy Work Explicit

**Priority:** Medium  
**Why:** The prediction/simulation pipeline is growing and currently runs synchronously inside domain construction.

Suggested order:

1. Measure `buildWorldCupDomain()` timing with 104 matches.
2. Cache per-match prediction results used by simulation.
3. Defer or offload `simulateManyTournaments()` if timing is user-visible.
4. Make alpha recording an explicit step rather than a hidden side effect.

### 3. Standardize Automation

**Priority:** Medium  
**Why:** The codebase has good local checks, but no CI and a deploy script that does not run in this environment.

Suggested order:

1. Pick npm or pnpm and make `package.json`, lockfile, and scripts agree.
2. Add CI for build, lint, unit tests, and Playwright smoke.
3. Update `scripts/deploy.sh` to call the same commands and include E2E or a documented reason to skip it.

### 4. Frontend Hygiene Pass

**Priority:** Low  
**Why:** CSS/interaction cleanup improves accessibility and perceived quality without changing domain behavior.

Suggested order:

1. Replace broad transitions in shared/game controls.
2. Audit focus styles where `outline: none` appears.
3. Review permanent `will-change` declarations after animation behavior is verified.
4. Narrow the design-token CSS variable typing cast.

## Next Steps

1. Fix the World Cup E2E/date-dependent default selection first.
2. Add deterministic World Cup domain fixtures so the sports page can be tested without live calendar drift.
3. Add CI once the smoke suite is green.
