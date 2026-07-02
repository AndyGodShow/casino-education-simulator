# World Cup Live Data Implementation Plan

> **For Arc:** Use /arc:implement to execute this plan. Subagents should report DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED.

**Feature spec:** Confirmed in the 2026-07-02 conversation
**Goal:** Make the World Cup screen visibly load provider data, derive auditable current-team signals from real results, consume read-only market references when available, and preserve pre-match evidence without presenting missing data as real.
**Stack:** React 19 + TypeScript + Vitest + Playwright + npm-compatible pnpm runtime

## File structure

- `src/dataProviders/football/openFootballProvider.ts` owns OpenFootball transport metadata and raw fixture mapping.
- `src/dataProviders/football/worldCupAdapter.ts` owns provider-to-domain normalization and provider-derived team metrics.
- `src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts` owns browser loading, refresh, market enrichment, and snapshot capture.
- `src/modules/sports/football/worldCup/market/polymarketAdapter.ts` owns read-only market matching and conversion.
- `src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts` remains the only UI-facing domain builder.
- `src/modules/sports/football/worldCup/WorldCupHome.tsx` and existing CSS own loading-state presentation without introducing a new visual system.

<task id="1" depends="" type="auto">
  <name>Expose provider loading and freshness honestly</name>
  <files>
    <modify>src/dataProviders/football/types/FootballProvider.ts</modify>
    <modify>src/dataProviders/football/openFootballProvider.ts</modify>
    <modify>src/dataProviders/football/fixtureProvider.ts</modify>
    <modify>src/dataProviders/football/worldCupAdapter.ts</modify>
    <modify>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts</modify>
    <modify>src/modules/sports/football/worldCup/WorldCupHome.tsx</modify>
    <modify>src/modules/sports/football/worldCup/WorldCup.module.css</modify>
    <test>src/dataProviders/football/openFootballProvider.test.ts</test>
    <test>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts</test>
  </files>
  <read_first>
    src/dataProviders/football/types/FootballProvider.ts
    src/dataProviders/football/openFootballProvider.ts
    src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts
    src/modules/sports/football/worldCup/WorldCupHome.tsx
  </read_first>
  <action>
    Add a provider fetch timestamp to raw fixtures/results and map it into `lastUpdated`.
    Return a hook state containing `{ domain, loading }`; start with no domain rather than a sample domain.
    Render the existing skeleton pattern while the first provider chain is unresolved.
    Preserve sample/local fallback after a provider failure and keep the 60-second visible-tab refresh.
  </action>
  <test_code>
    Add tests proving OpenFootball fixtures receive a non-empty ISO `lastUpdated`, the hook exposes loading before provider resolution, and fallback data is shown only after the provider chain resolves.
  </test_code>
  <verify>
    `pnpm vitest run src/dataProviders/football/openFootballProvider.test.ts src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts` passes.
    `pnpm typecheck` passes.
  </verify>
  <done>The first render is a loading state; provider and fallback data are distinguishable; OpenFootball freshness is no longer unknown.</done>
  <commit>fix(world-cup): expose provider loading and freshness</commit>
</task>

<task id="2" depends="1" type="auto">
  <name>Derive auditable current-team metrics from completed matches</name>
  <files>
    <modify>src/dataProviders/football/worldCupAdapter.ts</modify>
    <modify>src/modules/sports/football/worldCup/logic/providerQualityRegistry.ts</modify>
    <test>src/dataProviders/football/worldCupAdapter.test.ts</test>
  </files>
  <read_first>
    src/dataProviders/football/worldCupAdapter.ts
    src/modules/sports/football/worldCup/types.ts
    src/modules/sports/football/worldCup/logic/providerQualityRegistry.ts
  </read_first>
  <action>
    Derive `form`, `attack`, and `defense` updates from each team's completed provider matches before the evaluation time.
    Use bounded, deterministic recency-weighted goals/results and retain the static rating only as an explicitly low-trust prior.
    Attach field-level provenance with the provider name and newest contributing result timestamp.
    Do not label goals-derived values as xG and do not synthesize injuries or squad availability.
  </action>
  <test_code>
    Add deterministic adapter tests for win/loss form movement, attack/defense movement, no-future-result leakage, and provenance timestamps.
  </test_code>
  <verify>
    `pnpm vitest run src/dataProviders/football/worldCupAdapter.test.ts` passes.
    `pnpm typecheck` passes.
  </verify>
  <done>Upcoming predictions use provider-result-derived form/attack/defense with auditable provenance and no fabricated xG or injury fields.</done>
  <commit>feat(world-cup): derive team form from provider results</commit>
</task>

<task id="3" depends="1" type="auto">
  <name>Load and inject read-only Polymarket match references</name>
  <files>
    <modify>src/modules/sports/football/worldCup/market/polymarketAdapter.ts</modify>
    <modify>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts</modify>
    <modify>src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts</modify>
    <test>src/modules/sports/football/worldCup/market/polymarketAdapter.test.ts</test>
    <test>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts</test>
  </files>
  <read_first>
    src/dataProviders/polymarket/polymarketClient.ts
    src/modules/sports/football/worldCup/market/polymarketAdapter.ts
    src/modules/sports/football/worldCup/domain/WorldCupDomainModel.ts
    src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts
  </read_first>
  <action>
    Convert matched three-way market outcomes into `MarketData` with probabilities, decimal odds, source, confidence, quality, auditability, and `lastUpdated`.
    Fetch only a bounded set of resolved upcoming fixtures, reuse existing cache behavior, and merge results into the adapter input before building the domain.
    Treat missing, ambiguous, stale, or low-quality markets as unavailable without blocking fixture rendering.
    Keep market fusion conservative; OpenFootball fixtures may display real market reference but must not be promoted to official prediction status.
  </action>
  <test_code>
    Add tests for correct three-way conversion, ambiguous outcome rejection, bounded fetch behavior, and graceful empty/error fallback.
  </test_code>
  <verify>
    `pnpm vitest run src/modules/sports/football/worldCup/market/polymarketAdapter.test.ts src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts` passes.
    `pnpm typecheck` passes.
  </verify>
  <done>Available auditable Polymarket references reach the domain and UI; unavailable markets remain N/A without affecting fixtures.</done>
  <commit>feat(world-cup): connect read-only market references</commit>
</task>

<task id="4" depends="2,3" type="auto">
  <name>Preserve evidence and document the live-data boundary</name>
  <files>
    <modify>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts</modify>
    <modify>src/modules/sports/football/worldCup/components/DataSourceNotice.tsx</modify>
    <modify>README.md</modify>
    <test>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts</test>
    <test>src/modules/sports/football/worldCup/components/DataSourceNotice.test.tsx</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/persistence/preMatchPredictionStore.ts
    src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts
    src/modules/sports/football/worldCup/components/DataSourceNotice.tsx
    README.md
  </read_first>
  <action>
    Keep capturing predictions only before kickoff from non-sample providers and persist them locally/cloud-side as already supported.
    Surface fixture freshness, result-derived metric coverage, market availability, and missing xG/injury capability in the data-source disclosure.
    Update README so OpenFootball is described as active and all other providers are described accurately.
  </action>
  <test_code>
    Add tests that loading/refresh does not overwrite valid pre-match snapshots and that the disclosure names real, derived, and unavailable inputs accurately.
  </test_code>
  <verify>
    `pnpm test` passes.
    `pnpm typecheck` passes.
    `pnpm lint` passes.
    `pnpm build` passes.
    Browser verification shows no Sample fixtures flash, a non-empty last update, and truthful market/metric labels.
  </verify>
  <done>The application preserves pre-match evidence and clearly distinguishes real fixtures, derived metrics, market references, and unavailable signals.</done>
  <commit>docs(world-cup): document live data boundaries</commit>
</task>
