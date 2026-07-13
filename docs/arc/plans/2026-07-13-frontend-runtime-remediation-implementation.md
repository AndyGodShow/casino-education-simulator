# Frontend Runtime Remediation Implementation Plan

> **For Arc:** Use /arc:implement to execute this plan. Subagents should report DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED, or AUTH_GATE.

**Source:** `docs/arc/audits/2026-07-13-full-codebase-reaudit.md` — High findings “Global idle preloading measurably delays the World Cup route”, “ErrorBoundary retry cannot recover a rejected React.lazy chunk”, and “The Hook-named test suite never executes useWorldCupDomain”; Medium findings “Refresh performance”, “Hook ownership”, “Empty state”, “Dialog focus”, and optional preload rejection.
**Goal:** Make route loading and World Cup refreshes recoverable, network-aware, semantically correct, accessible, and covered through real React lifecycle tests without changing the product’s visual direction.
**Stack:** React 19 + Vite 7 + TypeScript 5.9 + Vitest 4 + Playwright 1.60 + npm
**Planned at:** `8332a25`
**Out of scope:** Public API security/rate limiting, database retention and recovery, provenance fields, roulette keyboard semantics, game-input labels, live-region coverage, reduced motion, touch-target sizing, and unrelated export/test-file cleanup belong to the other audit remediation streams. Do not redesign existing screens or introduce new colors, typography, or motion.

---

## File map

- `src/app/preloadPolicy.ts` owns the pure policy for optional route preloads; `src/App.tsx` only schedules and invokes approved preloads.
- `src/components/ErrorBoundary.tsx` owns the retry callback contract; `src/App.tsx` supplies the route-module recovery action.
- `src/modules/sports/football/worldCup/WorldCupHome.tsx` owns loaded, loading, and empty presentation states.
- `src/components/Common/EducationalOverlay.tsx` owns dialog focus capture, trapping, and restoration.
- `src/modules/sports/football/worldCup/domain/worldCupSimulationCache.ts` owns a bounded, semantic, deterministic tournament-simulation cache.
- `src/modules/sports/football/worldCup/hooks/worldCupDomainRefresh.ts` owns one refresh cycle: source loading, snapshot merge, research application, market enrichment, domain building, and prediction capture.
- `src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts` remains the React lifecycle adapter: state, visibility, scheduling, overlap prevention, and teardown. It is currently tangled and must become materially smaller after refresh orchestration is extracted.
- Tests remain colocated except cross-route browser behavior, which stays under `tests/e2e/`.

## Tasks

<task id="1" depends="" type="auto">
  <name>Add a route- and network-aware optional preload policy</name>
  <files>
    <create>src/app/preloadPolicy.ts</create>
    <test>src/app/preloadPolicy.test.ts</test>
    <modify>src/App.tsx</modify>
  </files>
  <read_first>
    src/App.tsx
    src/utils/motion.ts
    src/modules/traditional/TraditionalLobby.tsx
  </read_first>
  <action>
    Create `shouldPreloadOptionalGames(input: { screenType: string; saveData?: boolean; effectiveType?: string }): boolean`.
    Return true only for `screenType === "traditional"`, `saveData !== true`, and an effective type other than `"slow-2g"` or `"2g"`. Unknown connection information is allowed.

    Add a narrow local `NavigatorWithConnection` type instead of adding a network-information dependency. In `App.tsx`, run the idle featured-game effect only while the traditional lobby is active and the policy allows it. Keep direct navigation loading available because it is user intent. Apply the same policy to hover/focus preview preloads.

    Change the optional preload helper to consume loader rejection with `.catch(() => undefined)` so a speculative request cannot create an unhandled rejection. Preserve `requestIdleCallback`, its cancellation, and the timeout fallback. Do not preload traditional games on main, sports, football, World Cup, or active-game routes.
  </action>
  <test_code><![CDATA[
import { describe, expect, it } from 'vitest';
import { shouldPreloadOptionalGames } from './preloadPolicy';

describe('shouldPreloadOptionalGames', () => {
  it.each(['main', 'sports', 'football', 'worldCup', 'game'])(
    'does not preload traditional games on the %s screen',
    (screenType) => expect(shouldPreloadOptionalGames({ screenType })).toBe(false),
  );

  it('allows idle preload in the traditional lobby on an unrestricted connection', () => {
    expect(shouldPreloadOptionalGames({ screenType: 'traditional', effectiveType: '4g' })).toBe(true);
  });

  it.each([
    { saveData: true, effectiveType: '4g' },
    { saveData: false, effectiveType: 'slow-2g' },
    { saveData: false, effectiveType: '2g' },
  ])('blocks optional preload for constrained networking: %o', (connection) => {
    expect(shouldPreloadOptionalGames({ screenType: 'traditional', ...connection })).toBe(false);
  });
});
  ]]></test_code>
  <verify>
    `npm exec vitest run src/app/preloadPolicy.test.ts` — all policy cases pass.
    `npm run typecheck` — the narrow connection type and App effect compile.
    `npm run lint` — no floating promise or hook-dependency errors.
  </verify>
  <done>Traditional-game idle preloads can run only in the traditional lobby on an unconstrained connection, preview obeys the same policy, and rejected speculative loaders are consumed.</done>
  <commit>fix(app): scope optional game preloads</commit>
</task>

<task id="2" depends="1" type="auto">
  <name>Make route-module retry recreate rejected lazy state</name>
  <files>
    <modify>src/components/ErrorBoundary.tsx</modify>
    <test>src/components/ErrorBoundary.test.tsx</test>
    <modify>src/App.tsx</modify>
    <test>tests/e2e/smoke.spec.ts</test>
  </files>
  <read_first>
    src/components/ErrorBoundary.tsx
    src/components/ErrorBoundary.test.tsx
    src/App.tsx
  </read_first>
  <action>
    Add `onRetry?: () => void` to `ErrorBoundaryProps`. In `handleRetry`, call `onRetry` when supplied; otherwise preserve the existing state-clear behavior for ordinary render errors. Do not claim that state clearing retries a rejected `React.lazy` value.

    In `App.tsx`, pass a stable callback that invokes `window.location.reload()` to the route-level boundary. A document reload is intentional here: the `lazy(...)` objects at module scope have cached the rejected promise, so remounting the same object or changing a child key cannot recover it. Keep the existing fallback copy and observability path. Extend the smoke browser suite by aborting the first Roulette module request, asserting the boundary, removing the abort, clicking Retry, and asserting the reloaded document renders Roulette.
  </action>
  <test_code><![CDATA[
it('delegates route-module recovery to the supplied retry action', () => {
  const onRetry = vi.fn();
  const boundary = new ErrorBoundary({ children: null, onRetry });
  boundary.state = { hasError: true, error: new Error('chunk failed') };

  boundary.handleRetry();

  expect(onRetry).toHaveBeenCalledOnce();
  expect(boundary.state.hasError).toBe(true);
});

it('keeps state-only retry for boundaries without a recovery action', () => {
  const boundary = new ErrorBoundary({ children: null });
  boundary.state = { hasError: true, error: new Error('render failed') };
  const setState = vi.spyOn(boundary, 'setState');

  boundary.handleRetry();

  expect(setState).toHaveBeenCalledWith({ hasError: false, error: null });
});
  ]]></test_code>
  <verify>
    `npm exec vitest run src/components/ErrorBoundary.test.tsx` — observability and both retry contracts pass.
    `npm exec playwright test tests/e2e/smoke.spec.ts -g "recovers a rejected route module"` — Roulette renders after the document reload.
    `npm run typecheck` — App supplies a valid retry callback.
    `npm run lint` — boundary and App stay clean.
  </verify>
  <done>The route boundary’s Retry action reloads the document and therefore creates fresh lazy module objects; generic boundaries retain state-only retry.</done>
  <commit>fix(app): recover rejected lazy modules</commit>
</task>

<task id="3" depends="" type="auto">
  <name>Separate World Cup loaded-empty presentation from loading</name>
  <files>
    <modify>src/modules/sports/football/worldCup/WorldCupHome.tsx</modify>
    <test>src/modules/sports/football/worldCup/WorldCupHome.test.tsx</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/WorldCupHome.tsx
    src/modules/sports/football/worldCup/WorldCupHome.test.tsx
    src/modules/sports/football/worldCup/components/MatchList.tsx
    src/modules/sports/football/worldCup/WorldCup.module.css
  </read_first>
  <action>
    Keep the existing provider-loading shell only when `domain === null`. Inside `LoadedWorldCupHome`, replace `!selectedMatch` loading skeleton with a semantic status message such as `当前没有可显示的比赛详情。请调整筛选条件。`.

    Reuse existing panel/status styling; do not add a new visual system. The state must not carry `aria-busy="true"` because data has loaded. Preserve the actual skeleton for the `domain === null` path and preserve `MatchList`’s existing filter-empty status.
  </action>
  <test_code><![CDATA[
it('renders an explicit loaded-empty detail state instead of a loading skeleton', () => {
  hookMocks.useWorldCupDomain.mockReturnValue({
    domain: buildWorldCupDomain(emptyAdapterResult),
    isInitialLoading: false,
  });

  const html = renderToStaticMarkup(<WorldCupHome onBackToFootball={() => undefined} />);

  expect(html).toContain('当前没有可显示的比赛详情');
  expect(html).not.toContain('aria-label="正在加载比赛详情"');
});
  ]]></test_code>
  <verify>
    `npm exec vitest run src/modules/sports/football/worldCup/WorldCupHome.test.tsx` — loading, loaded-empty, scheduled, and finished states pass.
    `npm run typecheck` — component contracts remain unchanged.
  </verify>
  <done>A null domain still reports loading, while a loaded domain with no selected match reports an explicit non-busy empty state.</done>
  <commit>fix(world-cup): distinguish empty match detail</commit>
</task>

<task id="4" depends="" type="auto">
  <name>Restore focus after closing the educational dialog</name>
  <files>
    <modify>src/components/Common/EducationalOverlay.tsx</modify>
    <test>tests/e2e/rules-modal-accessibility.spec.ts</test>
  </files>
  <read_first>
    src/components/Common/EducationalOverlay.tsx
    src/components/RulesModal/RulesModal.tsx
    tests/e2e/rules-modal-accessibility.spec.ts
    src/games/baccarat/BaccaratGame.tsx
  </read_first>
  <action>
    On open, capture `document.activeElement` when it is an `HTMLElement`, exactly as `RulesModal` does. In the effect cleanup, restore body overflow, remove the key listener, and call `opener?.focus()` after the dialog closes or unmounts.

    Keep the current Escape behavior, focus trap, close-button autofocus, backdrop close behavior, roles, and labels. Extend the existing accessibility E2E file with a Baccarat educational-dialog flow; use role/name locators rather than CSS selectors.
  </action>
  <test_code><![CDATA[
test('educational dialog restores focus to its opener after Escape', async ({ page }) => {
  await page.goto('/#/traditional/games/baccarat');

  const educationButton = page.getByRole('button', { name: /科普/ });
  await educationButton.click();
  const dialog = page.getByRole('dialog');
  const closeButton = dialog.getByRole('button', { name: '关闭教育弹窗' });

  await expect(dialog).toBeVisible();
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(educationButton).toBeFocused();
});
  ]]></test_code>
  <verify>
    `npm exec playwright test tests/e2e/rules-modal-accessibility.spec.ts` — both rules and educational dialog focus flows pass.
    `npm run typecheck` — exits 0 with focus capture narrowed to `HTMLElement`.
  </verify>
  <done>EducationalOverlay traps focus while open and restores focus to the exact opener after Escape, backdrop close, close-button activation, or unmount.</done>
  <commit>fix(a11y): restore educational dialog focus</commit>
</task>

<task id="5" depends="" type="auto">
  <name>Cache deterministic World Cup simulations by semantic inputs</name>
  <files>
    <create>src/modules/sports/football/worldCup/domain/worldCupSimulationCache.ts</create>
    <test>src/modules/sports/football/worldCup/domain/worldCupSimulationCache.test.ts</test>
    <modify>src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts</modify>
    <test>src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts
    src/modules/sports/football/worldCup/domain/WorldCupDomainModel.ts
    src/modules/sports/football/worldCup/logic/groupSimulation.ts
    src/modules/sports/football/worldCup/logic/predictionEngine.ts
    src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts
  </read_first>
  <action>
    Move the construction of `GroupSimulationState` behind `buildWorldCupSimulation(adapterResult)`. Add `createWorldCupSimulationCache(builder = buildWorldCupSimulation)` that retains exactly one `{ fingerprint, simulation }` entry and exposes `get(adapterResult)`.

    Build a deterministic fingerprint from only simulation-semantic inputs: for every resolved group match include id, group, status, home/away team ids, source, home/away scores, kickoff, and lastUpdated; for referenced teams include id, rating, attack, defense, form, advanced metrics, core metric sources, and advanced metric sources. Sort matches and teams by id before serialization. Do not include provider retrieval time, adapter errors, markets, research summary text, or `evaluationTimeMs`. A match score/status or relevant team metric change must invalidate the cache. A market-only or clock-only change must hit it.

    Add optional `simulation?: GroupSimulationState` to `WorldCupDomainBuildOptions`; use the supplied value or call `buildWorldCupSimulation`. This is an additive internal option that lets a refresh cycle avoid running 1,000 deterministic iterations on every rebuild. Do not use an unbounded module-level Map.
  </action>
  <test_code><![CDATA[
it('reuses one simulation for semantically identical adapter data', () => {
  const simulation = { probabilities: [] };
  const builder = vi.fn(() => simulation);
  const cache = createWorldCupSimulationCache(builder);

  expect(cache.get(adapterResult)).toBe(simulation);
  expect(cache.get({ ...adapterResult, errors: ['transport note'] })).toBe(simulation);
  expect(builder).toHaveBeenCalledOnce();
});

it('invalidates when a score or prediction-driving team metric changes', () => {
  const builder = vi.fn(() => ({ probabilities: [] }));
  const cache = createWorldCupSimulationCache(builder);
  cache.get(adapterResult);
  cache.get({
    ...adapterResult,
    teams: { ...adapterResult.teams, alpha: { ...adapterResult.teams.alpha, rating: 91 } },
  });

  expect(builder).toHaveBeenCalledTimes(2);
});

it('uses a supplied cached simulation without recomputing it in the domain builder', () => {
  const simulation = { probabilities: [] };
  expect(buildWorldCupDomain(adapterResult, { simulation }).simulation).toBe(simulation);
});
  ]]></test_code>
  <verify>
    `npm exec vitest run src/modules/sports/football/worldCup/domain/worldCupSimulationCache.test.ts src/modules/sports/football/worldCup/domain/buildWorldCupDomain.test.ts` — cache hits, invalidation, determinism, and override pass.
    `npm run typecheck` — the additive domain option is type-safe.
    `npm run lint` — stable serialization and cache code are clean.
  </verify>
  <done>Unchanged semantic inputs reuse one bounded deterministic simulation; relevant fixture/team changes invalidate it; domain callers can inject the cached result before expensive work begins.</done>
  <commit>perf(world-cup): cache tournament simulations</commit>
</task>

<task id="6" depends="5" type="auto">
  <name>Extract one World Cup refresh cycle into a coordinator</name>
  <files>
    <create>src/modules/sports/football/worldCup/hooks/worldCupDomainRefresh.ts</create>
    <test>src/modules/sports/football/worldCup/hooks/worldCupDomainRefresh.test.ts</test>
    <modify>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts</modify>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts
    src/modules/sports/football/worldCup/domain/worldCupSimulationCache.ts
    src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts
    src/modules/sports/football/worldCup/persistence/preMatchPredictionStore.ts
    src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.ts
  </read_first>
  <action>
    Create `createWorldCupDomainRefreshCoordinator(dependencies)` with a staged contract:
    `refresh(input, publish)` publishes an initial `{ domain, snapshots }` after required
    data and bounded research settle, then may publish a second result after optional cloud
    history settles and changes snapshots, and resolves with the final published result.
    A cloud promise that remains pending must never prevent the initial publish.

    Move the non-React orchestration currently inside `useWorldCupDomain` into this coordinator:
    start cloud loading concurrently, await required data and research, publish the first
    domain with local snapshots, then merge/persist/rebuild after bounded cloud completion.
    Preserve the reliability plan's deferred-cloud behavior. Propagate its versioned
    research provenance into client prediction capture. Inject data, cloud, research,
    market, and simulation-cache dependencies with production defaults so unit tests never
    access the network. Reuse one cached simulation for every build in a cycle and across
    unchanged cycles.

    Preserve current fallback behavior: a thrown refresh produces a sample domain containing the sanitized error message and current snapshots. Keep browser localStorage reads/writes in the hook boundary, not in the coordinator. Do not import React from the new module.
  </action>
  <test_code><![CDATA[
it('publishes required data before deferred cloud history and reuses one simulation', async () => {
  const simulationCache = { get: vi.fn(() => ({ probabilities: [] })) };
  let resolveCloud!: (value: {}) => void;
  const cloud = new Promise<{}>((resolve) => { resolveCloud = resolve; });
  const publish = vi.fn();
  const coordinator = createWorldCupDomainRefreshCoordinator({
    loadDataSource: async () => serverDataSource,
    loadSharedSnapshots: async () => cloud,
    loadStrategyResearch: async () => unavailableResearch,
    loadMarketReferences: vi.fn(),
    simulationCache,
  });

  const refresh = coordinator.refresh({ snapshots: {} }, publish);
  await Promise.resolve();

  expect(publish).toHaveBeenCalledTimes(1);
  resolveCloud({});
  await refresh;
  expect(simulationCache.get).toHaveBeenCalledOnce();
});

it('returns a sample fallback without exposing transport internals', async () => {
  const coordinator = createWorldCupDomainRefreshCoordinator({
    loadDataSource: async () => { throw new Error('provider unavailable'); },
    loadSharedSnapshots: async () => null,
    loadStrategyResearch: async () => unavailableResearch,
  });

  const publish = vi.fn();
  const result = await coordinator.refresh({ snapshots: {} }, publish);

  expect(result.domain.source).toBe('sample');
  expect(publish).toHaveBeenCalledWith(result);
  expect(result.domain.errors).toContain('provider unavailable');
});
  ]]></test_code>
  <verify>
    `npm exec vitest run src/modules/sports/football/worldCup/hooks/worldCupDomainRefresh.test.ts src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts` — coordinator paths and existing loader helpers pass.
    `npm run typecheck` — coordinator dependencies and results are explicit.
    `test $(wc -l &lt; src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts) -le 220` — exits 0.
  </verify>
  <done>Refresh orchestration is React-free and dependency-injected; the hook no longer owns source/research/market/domain assembly; all builds in unchanged cycles reuse the semantic simulation cache.</done>
  <commit>refactor(world-cup): extract refresh coordinator</commit>
</task>

<task id="7" depends="6" type="auto">
  <name>Mount-test the World Cup hook lifecycle and non-overlapping scheduler</name>
  <files>
    <modify>package.json</modify>
    <modify>package-lock.json</modify>
    <modify>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts</modify>
    <test>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts</test>
  </files>
  <read_first>
    package.json
    package-lock.json
    src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts
    src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts
    src/modules/sports/football/worldCup/hooks/worldCupDomainRefresh.ts
  </read_first>
  <action>
    Install `@testing-library/react` and `jsdom` as dev dependencies with npm; let npm update the lockfile. Mark the hook test with `// @vitest-environment jsdom` and import `renderHook`, `act`, and `waitFor`. Keep all existing helper tests in the same file.

    Give the hook a narrow test seam without changing normal callers: `useWorldCupDomain(options?: { coordinator?: WorldCupDomainRefreshCoordinator; refreshIntervalMs?: number })`, with production defaults and `60_000` ms. The return type remains exactly `WorldCupDomainState`.

    Replace fixed `setInterval` with a recursive timeout scheduled only after the prior refresh settles. On mount, refresh immediately. While hidden, do not start a refresh; on `visibilitychange` to visible, refresh immediately. Guard an in-flight refresh, persist returned snapshots after a successful non-cancelled cycle, and clear timeout/listener on unmount. Promise completion after unmount must not call `setDomain` or reschedule.
  </action>
  <test_code><![CDATA[
// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';

it('mounts, publishes the first domain, and refreshes after the configured delay', async () => {
  vi.useFakeTimers();
  const coordinator = { refresh: vi.fn(async (_input, publish) => {
    const value = { domain, snapshots: {} };
    publish(value);
    return value;
  }) };
  const { result, unmount } = renderHook(() => useWorldCupDomain({
    coordinator,
    refreshIntervalMs: 100,
  }));

  expect(result.current.isInitialLoading).toBe(true);
  await act(async () => { await Promise.resolve(); });
  expect(result.current.domain).toBe(domain);
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(coordinator.refresh).toHaveBeenCalledTimes(2);
  unmount();
  vi.useRealTimers();
});

it('does not overlap refreshes and stops scheduling after unmount', async () => {
  vi.useFakeTimers();
  let resolveRefresh!: (value: { domain: typeof domain; snapshots: {} }) => void;
  const coordinator = {
    refresh: vi.fn((_input, publish) => new Promise((resolve) => {
      resolveRefresh = (value) => { publish(value); resolve(value); };
    })),
  };
  const { unmount } = renderHook(() => useWorldCupDomain({ coordinator, refreshIntervalMs: 10 }));
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(coordinator.refresh).toHaveBeenCalledOnce();
  unmount();
  resolveRefresh({ domain, snapshots: {} });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(coordinator.refresh).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it('refreshes on becoming visible but stays idle while hidden', async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  const coordinator = { refresh: vi.fn(async (_input, publish) => {
    const value = { domain, snapshots: {} };
    publish(value);
    return value;
  }) };
  const { unmount } = renderHook(() => useWorldCupDomain({ coordinator, refreshIntervalMs: 100 }));
  await act(async () => { await Promise.resolve(); });
  expect(coordinator.refresh).not.toHaveBeenCalled();

  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await waitFor(() => expect(coordinator.refresh).toHaveBeenCalledOnce());
  unmount();
});
  ]]></test_code>
  <verify>
    `npm install --save-dev @testing-library/react jsdom` — package and lockfile update together.
    `npm exec vitest run src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts` — helper and real mount tests pass.
    `npm run typecheck` — production and injected hook calls compile.
    `npm run lint` — effects, timers, and test cleanup satisfy lint.
  </verify>
  <done>The test suite truly mounts useWorldCupDomain and proves initial loading, successful publication, delayed refresh, visibility refresh, overlap prevention, and unmount teardown.</done>
  <commit>test(world-cup): cover domain hook lifecycle</commit>
</task>

<task id="8" depends="1,2,3,4,5,6,7" type="auto">
  <name>Run frontend runtime regression gates</name>
  <files>
    <test>tests/e2e/smoke.spec.ts</test>
    <test>tests/e2e/rules-modal-accessibility.spec.ts</test>
  </files>
  <read_first>
    package.json
    playwright.config.ts
    tests/e2e/smoke.spec.ts
    tests/e2e/rules-modal-accessibility.spec.ts
    src/scripts/buildBudgetPolicy.test.ts
  </read_first>
  <action>
    Do not add product behavior in this task. Run the complete local quality gates after all preceding changes. If a regression is found, fix it in the owning task’s files and rerun that task’s focused tests before rerunning the full gates.

    Add request listeners to `tests/e2e/smoke.spec.ts` that capture URLs containing the
    Baccarat, Blackjack, or Roulette module/chunk names. On a fresh direct World Cup
    navigation, wait beyond `APP_PRELOAD_DELAY_MS` plus one idle turn and assert no captured
    game URL. Then navigate to Traditional and assert preview or selection requests the
    intended game. Keep all existing budget thresholds unchanged.
  </action>
  <test_code>
    Add the explicit World Cup no-game-chunk request assertion and Traditional positive
    preload assertion described above. Existing route and dialog coverage remains the rest
    of the required safety net.
  </test_code>
  <verify>
    `npm run typecheck` — exits 0.
    `npm run lint` — exits 0.
    `npm test` — all unit/integration tests pass.
    `npm run build` — production build and configured budget checks pass.
    `npm run test:e2e` — all browser tests pass.
    `git diff --check` — no whitespace errors.
  </verify>
  <done>All frontend runtime remediations pass type, lint, unit, build-budget, and browser gates without unrelated product changes.</done>
  <commit>test(app): verify runtime remediation gates</commit>
</task>

## Decision log
