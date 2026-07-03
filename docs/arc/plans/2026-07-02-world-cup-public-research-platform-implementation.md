# World Cup Public Research Platform Implementation Plan

> **For Arc:** Use /arc:implement to execute this plan. Work locally because
> multi-agent execution is disabled for this thread.

**Feature spec:** `docs/arc/specs/2026-07-02-world-cup-public-research-platform-spec.md`
**Goal:** Turn the World Cup module into a publicly deployable, evidence-preserving research platform using only keyless public sports data.
**Stack:** React 19 + TypeScript 5.9 + Vite 7 + Vitest + Playwright + Vercel Functions + Supabase

## File Structure

- `src/server/worldCup/publicDataEndpoint.ts` owns the public snapshot HTTP contract.
- `api/world-cup/data.ts` is the Vercel adapter only.
- `src/modules/.../data/publicWorldCupSnapshot.ts` owns client validation.
- `src/server/worldCup/publicEvidence*` owns persistence and scheduled evidence writes.
- `src/modules/.../research/` owns historical parsing, causal ratings, and walk-forward optimization.
- Existing domain and UI modules consume results through typed contracts.

<task id="1" depends="" type="auto">
  <name>Define and serve the public World Cup snapshot contract</name>
  <files>
    <create>src/modules/sports/football/worldCup/data/publicWorldCupSnapshot.ts</create>
    <create>src/server/worldCup/publicDataEndpoint.ts</create>
    <create>api/world-cup/data.ts</create>
    <test>src/server/worldCup/publicDataEndpoint.test.ts</test>
  </files>
  <read_first>
    src/dataProviders/football/fixtureProvider.ts
    src/dataProviders/football/worldCupAdapter.ts
    src/modules/sports/football/worldCup/market/polymarketAdapter.ts
  </read_first>
  <action>
    Add schema version 1, generatedAt, normalized adapterResult, markets, and
    provenance. Reject sample/local responses at the public endpoint. Bound the
    response to the current 104-match tournament and use public CDN cache headers.
  </action>
  <test_code>Test GET/405, verified response, sample rejection, sanitized errors, and cache headers.</test_code>
  <verify>Run the endpoint test and `npm run typecheck`.</verify>
  <done>The Vercel route returns a typed, secret-free provider snapshot.</done>
  <commit>feat(world-cup): add public data snapshot endpoint</commit>
</task>

<task id="2" depends="1" type="auto">
  <name>Consume server snapshots before browser provider fallback</name>
  <files>
    <modify>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts</modify>
    <test>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/data/publicWorldCupSnapshot.ts
    src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts
  </read_first>
  <action>
    Fetch `/api/world-cup/data` with an abort timeout. Validate before use. Fall
    back to the existing provider chain without hiding the server error.
  </action>
  <test_code>Test valid server snapshot, invalid payload fallback, timeout fallback, and merged errors.</test_code>
  <verify>Run hook tests and typecheck.</verify>
  <done>Public deployments no longer depend on a visitor directly reaching every provider.</done>
  <commit>feat(world-cup): prefer server data snapshots</commit>
</task>

<task id="3" depends="1" type="auto">
  <name>Add auditable provider and market observation storage</name>
  <files>
    <create>supabase/migrations/20260702190000_create_world_cup_public_evidence.sql</create>
    <create>src/server/worldCup/publicEvidenceRepository.ts</create>
    <test>src/server/worldCup/publicEvidenceRepository.test.ts</test>
  </files>
  <read_first>
    src/server/worldCup/supabasePredictionSnapshotRepository.ts
    supabase/migrations/20260701130000_create_world_cup_prediction_snapshots.sql
  </read_first>
  <action>
    Create append-only observation tables keyed by content hash and captured time.
    Permit public select, service-role writes, and reject updates/deletes.
  </action>
  <test_code>Test REST URLs, headers, payload mapping, and sanitized persistence failures.</test_code>
  <verify>Run repository tests and inspect migration policies.</verify>
  <done>Fixture and market evidence can be audited independently of the current UI state.</done>
  <commit>feat(world-cup): persist public data evidence</commit>
</task>

<task id="4" depends="1,3" type="auto">
  <name>Extend the scheduled job into an evidence pipeline</name>
  <files>
    <create>src/server/worldCup/publicEvidenceJob.ts</create>
    <modify>src/server/worldCup/predictionSnapshotEndpoint.ts</modify>
    <test>src/server/worldCup/publicEvidenceJob.test.ts</test>
    <test>src/server/worldCup/predictionSnapshotEndpoint.test.ts</test>
  </files>
  <read_first>
    src/server/worldCup/predictionSnapshotJob.ts
    src/server/worldCup/publicDataEndpoint.ts
  </read_first>
  <action>
    Fetch one normalized snapshot per run, persist provider/market evidence, then
    capture pre-match predictions. Keep status recording failure-safe and never
    convert sample fallback into evidence.
  </action>
  <test_code>Test success, duplicate evidence, provider failure, persistence failure, and pre-kickoff-only behavior.</test_code>
  <verify>Run server job and endpoint tests.</verify>
  <done>One cron call produces durable observations, predictions, and health.</done>
  <commit>feat(world-cup): schedule public evidence capture</commit>
</task>

<task id="5" depends="" type="auto">
  <name>Parse keyless historical international results safely</name>
  <files>
    <create>src/modules/sports/football/worldCup/research/internationalResults.ts</create>
    <test>src/modules/sports/football/worldCup/research/internationalResults.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/backtest/historicalBacktest.ts
  </read_first>
  <action>
    Parse the CC0 results CSV with quoted-field support, normalize dates and team
    names, reject malformed/future rows, deduplicate deterministically, and retain
    provenance.
  </action>
  <test_code>Test valid rows, quoted values, malformed scores, duplicates, and evaluation-time filtering.</test_code>
  <verify>Run parser tests and typecheck.</verify>
  <done>Historical results enter the research layer through an audited boundary.</done>
  <commit>feat(world-cup): add historical results importer</commit>
</task>

<task id="6" depends="5" type="auto">
  <name>Build causal team ratings from historical results</name>
  <files>
    <create>src/modules/sports/football/worldCup/research/causalTeamRatings.ts</create>
    <test>src/modules/sports/football/worldCup/research/causalTeamRatings.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/research/internationalResults.ts
    src/modules/sports/football/worldCup/logic/predictionEngine.ts
  </read_first>
  <action>
    Produce pre-match Elo, recency-weighted form, attack, and defense using only
    earlier rows. Use deterministic defaults and explicit low-trust provenance.
  </action>
  <test_code>Test ordering, no future leakage, home/neutral handling, inactivity decay, and deterministic output.</test_code>
  <verify>Run rating tests and typecheck.</verify>
  <done>Every derived rating is reproducible at a specified evaluation time.</done>
  <commit>feat(world-cup): derive causal historical ratings</commit>
</task>

<task id="7" depends="5,6" type="auto">
  <name>Add chronological walk-forward strategy optimization</name>
  <files>
    <create>src/modules/sports/football/worldCup/research/walkForwardOptimizer.ts</create>
    <test>src/modules/sports/football/worldCup/research/walkForwardOptimizer.test.ts</test>
    <modify>src/modules/sports/football/worldCup/backtest/index.ts</modify>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/backtest/strategyTuning.ts
    src/modules/sports/football/worldCup/logic/modelConfig.ts
  </read_first>
  <action>
    Evaluate bounded candidates chronologically. Select by validation Brier score
    then log loss. Require 60 validation matches, two contexts, and 0.01 Brier
    improvement before marking a candidate applied.
  </action>
  <test_code>Test chronological splits, leakage rejection, thresholds, tie-breaking, and deterministic selection.</test_code>
  <verify>Run optimizer tests and all backtest tests.</verify>
  <done>Strategy changes require measurable out-of-sample evidence.</done>
  <commit>feat(world-cup): add walk-forward strategy optimization</commit>
</task>

<task id="8" depends="7" type="auto">
  <name>Integrate optimization status without unsafe auto-tuning</name>
  <files>
    <modify>src/modules/sports/football/worldCup/domain/WorldCupDomainModel.ts</modify>
    <modify>src/modules/sports/football/worldCup/domain/buildWorldCupDomain.ts</modify>
    <modify>src/modules/sports/football/worldCup/components/DataSourceNotice.tsx</modify>
    <test>src/modules/sports/football/worldCup/components/DataSourceNotice.test.tsx</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/research/walkForwardOptimizer.ts
    src/modules/sports/football/worldCup/components/DataSourceNotice.tsx
  </read_first>
  <action>
    Surface applied/rejected/insufficient status and metrics. Keep the baseline
    active unless a precomputed report passes all policy gates.
  </action>
  <test_code>Test each status, sample metrics, and absence of profit claims.</test_code>
  <verify>Run component/domain tests and browser-check the disclosure.</verify>
  <done>Users can see what was optimized and why it was or was not applied.</done>
  <commit>feat(world-cup): expose strategy validation status</commit>
</task>

<task id="9" depends="2,4,8" type="auto">
  <name>Add public deployment and operational safeguards</name>
  <files>
    <create>vercel.json</create>
    <modify>supabase/configure_prediction_snapshot_cron.sql</modify>
    <modify>.github/workflows/ci.yml</modify>
    <modify>README.md</modify>
    <test>src/scripts/deployScriptPolicy.test.ts</test>
  </files>
  <read_first>
    .github/workflows/ci.yml
    supabase/configure_prediction_snapshot_cron.sql
    README.md
  </read_first>
  <action>
    Configure API caching and cron route, document required environment variables,
    add an E2E CI job, artifact retention on failure, and rollback/health checks.
  </action>
  <test_code>Assert deploy config never exposes service credentials and cron targets the guarded endpoint.</test_code>
  <verify>Validate JSON/YAML, run policy tests, lint, typecheck, and build.</verify>
  <done>The repository contains a reproducible public deployment runbook.</done>
  <commit>ops(world-cup): harden public deployment workflow</commit>
</task>

<task id="10" depends="1,2,3,4,5,6,7,8,9" type="auto">
  <name>Complete whole-system verification and self-review</name>
  <files>
    <modify>tests/e2e/world-cup-public-data.spec.ts</modify>
    <modify>docs/arc/specs/2026-07-02-world-cup-public-research-platform-spec.md</modify>
  </files>
  <read_first>
    docs/arc/specs/2026-07-02-world-cup-public-research-platform-spec.md
    tests/e2e/smoke.spec.ts
  </read_first>
  <action>
    Exercise loading, provider, fallback, stale, market-empty, strategy status,
    and disclosure states. Review all changed files for stubs, leakage, security,
    and source-label errors; fix findings before completion.
  </action>
  <test_code>Use route interception for deterministic public endpoint success and failure flows.</test_code>
  <verify>Run all unit tests, architecture guards, E2E, lint, typecheck, build, and dependency audit.</verify>
  <done>Every spec acceptance criterion has fresh automated or browser evidence.</done>
  <commit>test(world-cup): verify public research platform</commit>
</task>

