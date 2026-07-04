# Production Follow-up Audit

**Date:** 2026-07-04
**Scope:** production data integrity, browser security, shared modal
accessibility, performance, release automation, and operational boundaries
**Stage:** production; follow-up to the 2026-07-03 World Cup strategy audit

## Outcome

No known release-blocking defect remains in the audited paths.

This follow-up found and corrected three cross-cutting production issues:

1. A conflict upsert and a permissive database trigger allowed a scheduled run
   to replace the first pre-match prediction snapshot.
2. The browser cache and cloud merge selected newer snapshots even after the
   database was made immutable.
3. Static browser responses lacked a restrictive content security policy and
   common anti-framing/content-sniffing headers, while the shared rules modal
   lacked complete keyboard-dialog behavior.

Prediction snapshots now preserve the earliest valid pre-kickoff capture in
the database, browser storage, and local/cloud merge path. Database
`UPDATE`/`DELETE` operations are rejected, inserts ignore duplicate match IDs,
and scheduled and browser readers retain one causal observation rather than a
later model result.

All static Vercel responses now carry a restrictive CSP, clickjacking and MIME
sniffing protection, a bounded referrer policy, and a permissions policy. The
shared rules modal now exposes dialog semantics, moves and traps focus, closes
with Escape, restores focus, locks background scrolling, provides a 44 px close
target, and respects reduced-motion preferences.

## Verification

| Check | Result |
| --- | :---: |
| Unit/integration tests | 112 files, 724 tests passed |
| Pull-request browser tests | Passed |
| TypeScript | Passed |
| ESLint | Passed |
| Production build | Passed, 909 modules |
| Initial JavaScript budget | 66.12 KiB gzip / 70 KiB |
| World Cup route JavaScript budget | 59.54 KiB gzip / 90 KiB |
| Largest JavaScript chunk | 105.18 KiB gzip / 120 KiB |
| Largest CSS asset | 5.95 KiB gzip / 10 KiB |
| Largest raster asset | 154.31 KiB / 350 KiB |
| Dependency audit | 0 vulnerabilities |
| Secret-pattern scan | No likely credentials found |
| Database immutability check | Trigger guards UPDATE and DELETE; mutation rejected |
| Production security headers | CSP, nosniff, DENY, referrer and permissions policies present |
| Shared rules modal regression | Dialog name, initial focus, focus trap, Escape and focus return passed |
| Telemetry retention | Private 30-day prune runs inside the monitored daily job |

The repository also passed whitespace checks, workflow YAML parsing, shell
syntax validation, production bundle budgets, and the protected GitHub quality
gates. The user-owned fixed-clock change in `tests/e2e/smoke.spec.ts` and the
untracked `test-results/` directory were not included in any commit.

## Findings And Corrections

### High: first-capture prediction evidence was mutable — fixed

The snapshot REST write used conflict merging, and the original trigger only
blocked changes after kickoff. A later pre-kickoff cron run could therefore
rewrite the evidence used for calibration. Writes now ignore duplicate match
IDs, and the database trigger rejects every update and delete. Regression tests
lock both deployment policy and repository behavior.

Existing historical rows that may have been replaced before this correction
cannot be reconstructed from the current table. They remain labeled as
pre-match observations, but must not be represented as provably first-capture
records. Future captures have the stronger invariant.

### High: browser snapshot semantics disagreed with storage — fixed

The local capture function overwrote scheduled matches on every calculation,
and the cloud merge preferred whichever valid snapshot was newer. Both paths
now preserve the earliest valid capture. Focused tests prove that repeated
pre-kickoff calculations do not alter the stored prediction and that merge
order does not replace an earlier observation with a later one.

### Medium: static browser security policy was incomplete — fixed

Vercel now supplies a CSP limited to the application and its explicit data/font
providers, blocks framing and object embedding, enables MIME sniffing
protection, limits referrer disclosure, disables unused powerful browser
features, and upgrades insecure subresource requests. Production response
headers were checked after deployment.

### Medium: shared rules modal was not a complete keyboard dialog — fixed

The modal was visually usable but lacked `role="dialog"`, an accessible name,
initial focus, focus containment, Escape handling, focus restoration, and
background scroll locking. The shared component now implements these behaviors
for all traditional games. An independent Playwright regression test covers the
keyboard journey without changing the user's fixed-clock smoke test.

### Low: telemetry retention depended on a manual query — fixed

The original runbook defined a 30-day deletion query but no durable execution
path. The protected daily evidence job now invokes a private, fixed-retention
database function and reports the deleted row count. The function is executable
only by the service role. A pruning failure fails the monitored job so the
existing health alert exposes retention failures instead of silently ignoring
them.

## Scorecard

**19/21 +2/3 accessibility — Production-grade**

| Axis | Score | Evidence |
| --- | :---: | --- |
| Security | 2/3 | Restrictive production headers, least-privilege public reads, server-only privileged credentials, bounded and private telemetry aggregation, sanitized endpoint failures, dependency and secret gates. Anonymous telemetry has storage caps but no authenticated client identity or dedicated edge rate limit. |
| Performance | 3/3 | Route splitting, bounded bundle budgets, cached tournament score distributions, request timeouts, CDN caching, and measured production research behavior. |
| Architecture | 3/3 | Browser and cron share the domain/rating path; snapshot immutability now agrees across repository, database, local cache, and cloud merge. Reported dependency cycles are type-only. |
| Code quality | 2/3 | Strict types, clean lint, no production file over 600 lines, and no confirmed orphan after excluding Vercel entrypoint false positives. Some broad research exports and older game styling remain. |
| Test health | 3/3 | Causality, snapshot immutability, deployment policy, accessibility interaction, provider fallback, build budgets, and production journeys have regression coverage. |
| Resilience | 3/3 | Explicit unavailable/fallback states, immutable evidence, baseline preservation, bounded inputs, and health-based operational failure signals. |
| Operations | 3/3 | CI and deployment gates cover lint, types, tests, build, budgets, dependency audit, E2E, production health monitoring, and documented rollback. |
| Accessibility | +2/3 | Automated Axe coverage, scalable viewport, contrast and landmark corrections, 44 px mobile controls, reduced motion, and keyboard-safe shared dialogs. A manual screen-reader pass remains outstanding. |

## Remaining Non-blocking Work

### Anonymous ingestion boundary

Same-origin validation reduces accidental cross-site submissions but is not
authentication and can be spoofed by a direct client. Database admission caps
bound row growth. If production traffic justifies it, add provider-level edge
rate limiting and alerting; keep telemetry advisory and correlate it with
deployment and server evidence.

### Strategy data

Real three-way pre-match market snapshots, real xG, injuries, current squads,
and enough 2026 tournament calibration samples are still unavailable. They
must remain visibly labeled as missing and must not be synthesized from
post-match or partial odds data.

### Manual assistive-technology pass

Automated checks cannot confirm announcement quality across screen readers.
Run one production pass with VoiceOver/Safari or NVDA/Firefox before treating
accessibility as fully verified.

## Release Decision

The corrected build is suitable for continued public deployment. Roll back if
health becomes stale, prediction evidence changes after first capture, CSP
blocks a required first-party flow, keyboard focus escapes an open dialog, or
telemetry cardinality exceeds the documented bounds.
