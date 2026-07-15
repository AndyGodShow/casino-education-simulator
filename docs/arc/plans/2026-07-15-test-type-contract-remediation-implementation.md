# Test Type Contract Remediation Implementation Plan

> **For Arc:** Use /arc:implement to execute this plan. Subagents should report DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED, or AUTH_GATE.

**Source:** code review on 2026-07-15 found that `tsconfig.app.json` excludes all Vitest files and that strict compilation reports 45 errors across 19 test files.
**Goal:** Make every unit and E2E test compile against the same production contracts and enforce that check in CI through the existing `npm run typecheck` gate.
**Stack:** React 19 + TypeScript 5.9 + Vitest 4 + Playwright 1.60 + npm
**Planned at:** `6747565`
**Out of scope:** Production behavior, public APIs, visual output, deployment, and the existing A12 production authorization checkpoint.

---

## File structure

- `tsconfig.test.json` owns strict compilation settings for Vitest and Playwright sources, including JavaScript module inference for the health-check script.
- `package.json` wires test compilation into the existing `typecheck` CI command.
- `src/architecture/test-typecheck-policy.test.ts` protects the configuration contract.
- Existing test files retain ownership of their fixtures and mocks; each is updated only to match current production types.

## Tasks

<task id="1" depends="" type="auto" status="done">
  <name>Add the strict test-type quality gate</name>
  <files>
    <create>tsconfig.test.json</create>
    <modify>package.json</modify>
    <test>src/architecture/test-typecheck-policy.test.ts</test>
  </files>
  <read_first>
    tsconfig.app.json
    package.json
    .github/workflows/ci.yml
    src/architecture/knip-policy.test.ts
  </read_first>
  <action>
    First add a policy test that reads package.json and tsconfig.test.json and requires `typecheck:test` to equal `tsc --noEmit -p tsconfig.test.json`, the existing `typecheck` script to invoke it after `tsc -b`, and the test config to include `src/**/*.test.ts`, `src/**/*.test.tsx`, and `tests/e2e/**/*.ts`. Run it before creating the config to capture RED. Then create tsconfig.test.json extending tsconfig.app.json, override `lib` to ES2023/DOM/DOM.Iterable, `types` to node and vite/client, `allowJs` to true, `noEmit` to true, include all unit tests, E2E tests, and scripts/check-world-cup-health.mjs, and override exclude to an empty array. Wire the scripts without adding dependencies or changing CI YAML because CI already calls `npm run typecheck`.
  </action>
  <test_code>
    `src/architecture/test-typecheck-policy.test.ts` parses both JSON files and asserts the exact scripts, include globs, empty exclude, ES2023 library, node/vite types, and allowJs setting.
  </test_code>
  <verify>
    `npm test -- --run src/architecture/test-typecheck-policy.test.ts` exits 0 with the policy test passing. `npm run typecheck:test` exits non-zero only for the known fixture/mock errors that tasks 2–6 own.
  </verify>
  <done>The repository has an executable strict test-type gate and CI reaches it through npm run typecheck.</done>
  <commit>test(quality): add strict test typecheck gate</commit>
</task>

<task id="2" depends="1" type="auto" status="done">
  <name>Repair probability and reliability fixtures</name>
  <files>
    <test>src/dataProviders/football/worldCupAdapter.test.ts</test>
    <test>src/modules/sports/football/worldCup/components/MatchCard.test.tsx</test>
    <test>src/modules/sports/football/worldCup/domain/selectors.test.ts</test>
    <test>src/modules/sports/football/worldCup/logic/predictionReliability.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/types.ts
    src/modules/core/probability/unifiedProbability.ts
    src/modules/sports/football/worldCup/domain/WorldCupDomainModel.ts
    src/modules/sports/football/worldCup/testFixtures.ts
  </read_first>
  <action>
    Replace string-only match teams with the current WorldCupMatchTeam shape, add exact source discriminants to model/market/merged probability fixtures, use undefined instead of null where the contract requires it, add structuralRatio and advancedSourceQualityRatio to input-coverage fixtures, and add intelligence/actionGates to complete WorldCupDomainModel fixtures. Prefer existing fixture builders; do not weaken production types or cast through unknown.
  </action>
  <test_code>
    Existing tests remain the behavioral safety net; `npm run typecheck:test` is the RED/GREEN contract test for these four files.
  </test_code>
  <verify>
    `npm run typecheck:test` reports none of these four paths. `npm test -- --run` with the four paths exits 0.
  </verify>
  <done>Probability, team, coverage, and selector fixtures satisfy current production contracts without assertions that bypass type safety.</done>
  <commit>test(world-cup): align probability fixtures with domain types</commit>
</task>

<task id="3" depends="2" type="auto">
  <name>Repair complete domain-model fixtures</name>
  <files>
    <test>src/modules/sports/football/worldCup/components/combinedCalibrationPresentation.test.ts</test>
    <test>src/modules/sports/football/worldCup/components/DataSourceNotice.test.tsx</test>
    <test>src/modules/sports/football/worldCup/components/PredictionPipelineAuditPanel.test.tsx</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/domain/WorldCupDomainModel.ts
    src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts
    src/modules/sports/football/worldCup/testFixtures.ts
  </read_first>
  <action>
    Update the three hand-built WorldCupDomainModel fixtures with current intelligence and actionGates state using existing domain defaults/builders where practical. Keep each test's scenario-specific calibration and audit values intact and avoid broad Partial casts.
  </action>
  <test_code>
    Existing component/presentation assertions cover behavior; strict test compilation proves the fixtures implement WorldCupDomainModel.
  </test_code>
  <verify>
    `npm run typecheck:test` reports none of these three paths. `npm test -- --run` with the three paths exits 0.
  </verify>
  <done>All complete domain fixtures include the current intelligence and action-gate layers while preserving their original scenarios.</done>
  <commit>test(world-cup): refresh domain presentation fixtures</commit>
</task>

<task id="4" depends="3" type="auto">
  <name>Repair snapshot provenance fixtures</name>
  <files>
    <test>src/modules/sports/football/worldCup/components/FinishedMatchResultPanel.test.tsx</test>
    <test>src/modules/sports/football/worldCup/WorldCupHome.test.tsx</test>
    <test>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts</test>
    <test>src/modules/sports/football/worldCup/research/strategyResearchSnapshot.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/types.ts
    src/modules/sports/football/worldCup/persistence/preMatchPredictionStore.ts
    src/modules/sports/football/worldCup/research/strategyResearchSnapshot.ts
  </read_first>
  <action>
    Add valid baseline or applied-research provenance to every PreMatchPredictionSnapshot fixture by reusing baselinePreMatchPredictionProvenance where appropriate. Preserve the tests that intentionally exercise legacy rows without provenance by keeping those inputs typed as unknown. Annotate the strategy-research fixture with WorldCupStrategyResearchProvenance or `satisfies` so its pinned dataset revision remains a literal rather than widening to string.
  </action>
  <test_code>
    Existing snapshot parsing, rendering, and hook tests cover behavior; strict compilation proves current provenance contracts.
  </test_code>
  <verify>
    `npm run typecheck:test` reports none of these four paths. `npm test -- --run` with the four paths exits 0.
  </verify>
  <done>All current snapshot fixtures carry valid provenance and intentional legacy-input tests remain explicit.</done>
  <commit>test(world-cup): align snapshot provenance fixtures</commit>
</task>

<task id="5" depends="4" type="auto">
  <name>Repair inferred mock call types</name>
  <files>
    <test>src/modules/sports/football/worldCup/domain/worldCupSimulationCache.test.ts</test>
    <test>src/modules/sports/football/worldCup/hooks/worldCupDomainRefresh.test.ts</test>
    <test>src/observability/browserObservability.test.ts</test>
    <test>src/server/worldCup/clientTelemetryRepository.test.ts</test>
    <test>src/server/worldCup/publicEvidenceJob.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/domain/worldCupSimulationCache.ts
    src/modules/sports/football/worldCup/hooks/worldCupDomainRefresh.ts
    src/observability/browserObservability.ts
    src/server/worldCup/clientTelemetryRepository.ts
    src/server/worldCup/publicEvidenceJob.ts
  </read_first>
  <action>
    Give vi.fn mocks exact function signatures so `.mock.calls` and callback inputs infer real tuples instead of `[]`/never. Replace incomplete shared-snapshot literals with valid PreMatchPredictionSnapshot fixtures. Use explicit typed mock functions or `vi.fn<Signature>()`; do not add any, non-null assertions that hide missing calls, or unknown double casts.
  </action>
  <test_code>
    Existing cache, refresh, observability, repository, and evidence assertions remain the behavioral tests; strict compilation validates their mock signatures.
  </test_code>
  <verify>
    `npm run typecheck:test` reports none of these five paths. `npm test -- --run` with the five paths exits 0.
  </verify>
  <done>Mock call tuples and callback payloads are inferred from the actual production signatures.</done>
  <commit>test(quality): type asynchronous mock contracts</commit>
</task>

<task id="6" depends="5" type="auto">
  <name>Close the remaining unit and E2E type gaps</name>
  <files>
    <test>src/scripts/checkWorldCupHealth.test.ts</test>
    <test>src/server/worldCup/strategyResearchEndpoint.test.ts</test>
    <test>tests/e2e/smoke.spec.ts</test>
  </files>
  <read_first>
    scripts/check-world-cup-health.mjs
    src/server/worldCup/strategyResearchEndpoint.ts
    tests/e2e/smoke.spec.ts
    tsconfig.test.json
  </read_first>
  <action>
    Let TypeScript infer the imported MJS health helper through allowJs, type the strategy-research fetch mock so its first call exists as a RequestInfo/URL tuple, and avoid the unreachable `never` fallback in the idle-preload helper by reading requestIdleCallback through an optional structural Window type before falling back to requestAnimationFrame. Do not change runtime timing or request behavior.
  </action>
  <test_code>
    Existing health, research, and smoke tests cover behavior; the final strict gate must compile all unit and E2E sources with zero diagnostics.
  </test_code>
  <verify>
    `npm run typecheck` exits 0. `npm test` exits 0. `npm run build`, `npm run check:build-budget`, `npm run check:dead-code`, `npm audit --audit-level=high`, and `npm run test:e2e` all exit 0. `git diff --check` exits 0.
  </verify>
  <done>The complete test suite is strictly typed, the gate runs in CI through npm run typecheck, and every repository quality gate passes.</done>
  <commit>test(quality): enforce test type contracts</commit>
</task>

## Decision log

- 2026-07-15 — Task 2 types `fakeProvider` against `FixtureProviderResult` instead of replacing raw string team names, preserving the alias-normalization behavior under test.
- 2026-07-15 — Task 2 also adds baseline provenance to MatchCard's snapshot fixture so every file owned by the task exits the type-error inventory atomically.
