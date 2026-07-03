# World Cup Strategy Audit

**Date:** 2026-07-03  
**Scope:** public World Cup data, historical strategy research, Prediction V2
input gating, UI evidence, and release checks  
**Stage:** pre-launch/public deployment

## Outcome

No release-blocking correctness, security, or data-integrity issue remains in the
audited strategy path.

The public research endpoint produced a schema-v2 snapshot in 2.3 seconds:
49,488 accepted historical results, 256 bounded team ratings, and an independent
60-match holdout Brier improvement from 0.497201 to 0.456514. The shared rating
gate applied historical Elo to all 48 resolved tournament teams and excluded 22
unresolved knockout slots from both rating and result-derived coverage.

The browser and scheduled evidence job use the same rating application
function. Higher-trust official/provider Elo is preserved, rejected or
unavailable research keeps the baseline, and an unavailable scheduled research
input prevents a lower-quality prediction snapshot from replacing prior
evidence.

## Verification

| Check | Result |
| --- | :---: |
| Unit/integration tests | 112 files, 722 tests passed |
| Browser E2E | 6/6 passed |
| TypeScript | Passed |
| ESLint | Passed |
| Production build | Passed, 909 modules |
| Initial JavaScript budget | 66.13 KiB gzip / 70 KiB |
| World Cup route JavaScript budget | 59.54 KiB gzip / 90 KiB |
| Largest JavaScript chunk | 105.03 KiB gzip / 120 KiB |
| Largest CSS asset | 5.95 KiB gzip / 10 KiB |
| Largest raster asset | 154.31 KiB / 350 KiB |
| Real public research response | 200, 50,602 bytes, 2.3 seconds |
| Desktop horizontal overflow | None at 1280 px |
| Mobile horizontal overflow | None at 390 px |
| Automated accessibility scan | Axe default rules: 0 violations |
| Mobile World Cup controls | At least 44 x 44 px |
| Reduced-motion behavior | World Cup animation and transition durations disabled |
| Browser warnings/errors | None |
| Secret-pattern scan | No likely credentials found |
| Dependency audit | 0 vulnerabilities |
| Production health | Public probe plus twice-daily GitHub monitor |

The repository's current `package-lock.json` passed the high-severity dependency
audit. CI repeats `npm audit --audit-level=high` on every push and pull request.

## Scorecard

**18/21 +2/3 accessibility — Production-grade**

| Axis | Score | Evidence |
| --- | :---: | --- |
| Security | 2/3 | Bounded public payloads, a streaming-limited same-origin telemetry endpoint, private service-role aggregation with daily unique-row and per-row sample caps, sanitized failures, fixed upstream URLs, server-only service keys, and constant-time cron-secret comparison. Anonymous telemetry remains an operational signal, not authenticated evidence. |
| Performance | 3/3 | CDN caching, request timeouts, bounded ratings, automatic dynamic-entry splitting, enforced build budgets, a 2.3-second real research response, and one-time score-distribution caching for 1,000 tournament iterations. |
| Architecture | 3/3 | One domain builder and one rating gate serve browser and cron paths. The unused parallel legacy World Cup implementation and stale provider scaffolds are removed, with a guard preventing reintroduction. Reported import cycles are type-only, not runtime cycles. |
| Code quality | 2/3 | Strict types, lint-clean changes, no production source over 600 lines, and no confirmed orphan production files after excluding Vercel entrypoints from the dead-code result. Some intentionally broad research exports and older game styling patterns remain. |
| Test health | 3/3 | Causal leakage, schema validation, trust preservation, public endpoint fallback, layout, and user-visible evidence are covered across unit and E2E tests. |
| Resilience | 3/3 | Explicit loading/fallback/unavailable states, preserved baseline behavior, no silent synthetic market data, and no console errors. |
| Operations | 2/3 | CI and the deploy script gate lint, typecheck, unit, build, frontend budgets, dependency audit, and E2E. The repository now includes private browser error/Core Web Vitals aggregation, a public health probe, twice-daily monitoring, and a rollback runbook; production telemetry collection is not verified until migration and deployment. |
| Accessibility | +2/3 | Native details/summary controls, keyboard semantics, user-scalable viewport, responsive layout, 44 px mobile controls, reduced-motion behavior, and deterministic Axe scans with zero violations. A manual screen-reader pass remains outstanding. |

## Performance Correction

The audit initially confirmed that 1,000 tournament iterations recomputed a
full prediction for every unresolved group match. The simulation now calculates
each match's fixed score distribution once and reuses it for deterministic
sampling. This reduces the expensive work from roughly 48,000 full predictions
to roughly 48. An equivalence regression test compares the cached aggregate
against uncached per-iteration simulations.

The build audit also found that the manual Recharts chunk pulled React into the
initial dependency graph. Removing the manual chunk reduced actual initial
JavaScript from 167.35 KiB to 66.11 KiB gzip without a circular-chunk warning.
The opaque 1,401,803-byte lobby PNG became a visually verified 158,009-byte
progressive JPEG, and a previously invalid layered background declaration was
corrected so the intended image is actually rendered. CI now guards initial,
World Cup route, per-chunk, CSS, and raster budgets.

## Accessibility Correction

The deterministic public-snapshot Playwright journeys now run the default Axe
rules against both loaded and unavailable-data World Cup states. The first scan
found prohibited ARIA on decorative probability tracks, insufficient
muted-text contrast, duplicate landmark names, and a viewport that disabled
user zoom. The UI now hides decorative tracks from assistive technology while
retaining their visible text values, uses a contrast-safe muted token, gives
the match list/detail landmark a unique name, declares Simplified Chinese as
the document language, and permits browser zoom. The repeat scans report zero
violations. This automated result does not replace a manual screen-reader pass.

The follow-up interaction audit also found that the World Cup filter selects
rendered at only 24 px high on a 390 px viewport and that live/skeleton motion
ignored the operating-system reduced-motion preference. The mobile controls now
measure at least 44 x 44 px, and a reduced-motion media query disables World Cup
animation and transition durations. Both behaviors are asserted in Playwright.

## Architecture And Storage-Boundary Correction

Dead-code analysis initially found 28 apparently unused files. Four were Vercel
function entrypoints and therefore tool false positives. The remaining set
included an 11-file parallel `src/legacy/worldcup` implementation, components
used only by that implementation, empty market/source scaffolds that contradicted
the live provider state, and unused design-token/barrel modules. Twenty-six
files containing 712 lines of obsolete code were removed. A source-boundary test
now prevents a second legacy World Cup implementation from being introduced.

The same review found that a caller could rotate syntactically valid error
fingerprints and create unbounded telemetry rows despite the browser-side
ten-error limit. The private aggregation RPC now serializes daily admission with
an advisory transaction lock, caps new rows at 5,000 per UTC day, and saturates
each aggregate at 10,000 samples. This bounds storage abuse but does not make
anonymous browser telemetry trustworthy; operational decisions must still
correlate it with Vercel logs and deployment evidence.

## Remaining Work

### Low: deploy and validate centralized client telemetry

The repository now collects privacy-minimized browser errors and Core Web
Vitals through the existing Vercel + Supabase boundary. Production still needs
the new migration applied and the exact commit deployed before this can count as
live evidence. After deployment, verify bounded row cardinality and wait for
enough real page views before interpreting the weighted p75 query.

The strategy boundary is unchanged: complete real pre-match three-way market
snapshots, real xG, injuries, current squads, and enough 2026 tournament
calibration samples remain unavailable and must not be synthesized.
