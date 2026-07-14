# World Cup Reliability and Data Remediation Implementation Plan

> **For Arc:** Use /arc:implement to execute this plan. Subagents should report DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED, or AUTH_GATE.

**Source:** `docs/arc/audits/2026-07-13-full-codebase-reaudit.md` — World Cup reliability, request-budget, provenance, evidence-identity, retention, scheduling, and recovery findings
**Goal:** Keep the World Cup route available when optional services stall, prevent cache-bypass amplification, and make scheduled evidence, prediction provenance, retention, and recovery behavior reproducible and independently verifiable.
**Stack:** React 19 + Vite 7 + TypeScript 5.9 + Vitest 4 + Playwright 1.60 + npm + Vercel Functions + Supabase
**Planned at:** `8332a25`
**Out of scope:** Buying or enabling Vercel/Supabase plan features; changing fixture, market, or research providers beyond pinning the current public dataset revision; redesigning Prediction V2; frontend accessibility and traditional-game fixes tracked by the same audit; claiming production rate limits, PITR, backups, or restore readiness without control-plane evidence.

---

## File structure

- `src/server/http/fetchWithTimeout.ts` owns the shared abort/deadline primitive for server and browser fetch callers.
- `src/server/worldCup/*Endpoint.ts` owns HTTP validation, sanitized failures, and job orchestration; Vercel files under `api/world-cup/` remain adapters only.
- `src/modules/sports/football/worldCup/research/strategyResearchSnapshot.ts` owns the versioned research-provenance contract.
- `src/modules/sports/football/worldCup/types.ts` and persistence modules own the versioned pre-match prediction provenance contract.
- `src/server/worldCup/publicEvidenceJob.ts` owns stable content identity separately from observation time.
- Additive Supabase migrations own durable schema changes; existing migrations remain immutable.
- `vercel.json`, `supabase/configure_prediction_snapshot_cron.sql`, and `docs/runbooks/world-cup-production.md` own scheduling and operational contracts.
- `useWorldCupDomain.ts` is already 314 lines and tangled; this plan limits its change to staged initialization and moves deadline logic into reusable modules.

<task id="1" depends="" type="auto" status="done">
  <name>Add a reusable aborting fetch deadline</name>
  <files>
    <create>src/server/http/fetchWithTimeout.ts</create>
    <test>src/server/http/fetchWithTimeout.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts
    src/server/worldCup/strategyResearchEndpoint.ts
  </read_first>
  <action>
    Export `fetchWithTimeout(input, init, timeoutMs, fetcher = fetch): Promise&lt;Response&gt;`.
    Create an `AbortController`, merge the caller's signal by aborting the local controller
    when it fires, abort after the exact positive `timeoutMs`, pass the local signal to the
    fetcher, and always clear the timer and remove the caller-signal listener. Preserve the
    fetch rejection; do not turn timeouts into successful responses or expose request URLs.
  </action>
  <test_code>
    Add Vitest cases that inject a never-settling fetcher which rejects on `abort`, advance
    fake timers by 25 ms, and assert the passed signal is aborted. Add cases proving a fast
    response clears the timer and an already-aborted caller signal prevents a live request.
  </test_code>
  <verify>
    `npx vitest run src/server/http/fetchWithTimeout.test.ts` — all tests pass.
    `npm run typecheck` — exits 0.
  </verify>
  <done>`fetchWithTimeout` provides one tested, cleanup-safe deadline primitive.</done>
  <commit>feat(http): add aborting fetch deadline</commit>
</task>

<task id="2" depends="1" type="auto" status="done">
  <name>Bound cloud prediction reads</name>
  <files>
    <modify>src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.ts</modify>
    <test>src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.test.ts</test>
  </files>
  <read_first>
    src/server/http/fetchWithTimeout.ts
    src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.ts
    src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.test.ts
  </read_first>
  <action>
    Add optional `timeoutMs` to `CloudSnapshotConfig`, defaulting to 3,000 ms. Replace the
    unbounded fetch with `fetchWithTimeout`, preserving the injectable `fetcher`, current
    HTTPS/config validation, response parser, and sanitized error messages. Do not add an
    in-memory retry loop; the caller already treats cloud history as optional.
  </action>
  <test_code>
    Extend the existing loader test to assert `RequestInit.signal` is present. Add a fake-
    timer test whose fetcher rejects on abort and assert the loader rejects after 3,000 ms;
    retain the malformed-row and earliest-snapshot merge cases.
  </test_code>
  <verify>
    `npx vitest run src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.test.ts` — all tests pass.
    `npm run typecheck` — exits 0.
  </verify>
  <done>Supabase prediction-history reads can no longer wait indefinitely.</done>
  <commit>fix(world-cup): bound cloud prediction reads</commit>
</task>

<task id="3" depends="2" type="auto" status="done">
  <name>Decouple optional cloud history from initial World Cup rendering</name>
  <files>
    <modify>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts</modify>
    <test>src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts</test>
    <test>tests/e2e/world-cup-public-data.spec.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts
    src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts
    tests/e2e/world-cup-public-data.spec.ts
    src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.ts
  </read_first>
  <action>
    Remove cloud history from the initial `Promise.all` barrier. Await required public data
    and bounded research first, build and publish the domain with local snapshots, then
    await the bounded cloud promise and, when it supplies earlier snapshots, merge,
    persist locally, and rebuild only if the effect is still mounted. Preserve the
    one-refresh-at-a-time guard, visibility refresh, sample fallback, and earliest-capture
    semantics. Extract a small exported orchestration helper only if needed to execute the
    behavior in Vitest; the test must exercise staged publication rather than merely test
    unrelated pure helpers.
  </action>
  <test_code>
    Add a staged-load test with deferred cloud history: resolve data and research, assert
    the first domain is published while cloud is pending, resolve an earlier cloud snapshot,
    then assert one merged rebuild. In Playwright, intercept the Supabase prediction REST
    URL without fulfilling it, fulfill `/api/world-cup/data` and `/api/world-cup/research`,
    navigate to `/sports/football/world-cup`, and assert the tournament heading and match
    content become visible before the cloud request settles.
  </test_code>
  <verify>
    `npx vitest run src/modules/sports/football/worldCup/hooks/useWorldCupDomain.test.ts` — all tests pass.
    `VITE_SUPABASE_URL=https://project.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=public-test-key npx playwright test tests/e2e/world-cup-public-data.spec.ts -g "stalled cloud snapshot"` — the intercepted cloud request is observed and the focused test passes.
    `npm run typecheck` — exits 0.
  </verify>
  <done>Required data renders the route independently; optional cloud history merges later.</done>
  <commit>fix(world-cup): decouple cloud history from initial render</commit>
</task>

<task id="4" depends="" type="auto" status="done">
  <name>Reject cache-key query variants on public endpoints</name>
  <files>
    <modify>src/server/worldCup/publicDataEndpoint.ts</modify>
    <test>src/server/worldCup/publicDataEndpoint.test.ts</test>
    <modify>src/server/worldCup/strategyResearchEndpoint.ts</modify>
    <test>src/server/worldCup/strategyResearchEndpoint.test.ts</test>
  </files>
  <read_first>
    src/server/worldCup/publicDataEndpoint.ts
    src/server/worldCup/publicDataEndpoint.test.ts
    src/server/worldCup/strategyResearchEndpoint.ts
    src/server/worldCup/strategyResearchEndpoint.test.ts
  </read_first>
  <action>
    After the GET method guard and before any provider/research work, parse `request.url` and
    reject every non-empty query string with status 400, a generic `{ ok: false, error:
    "Query parameters are not supported." }` body, `Cache-Control: no-store`, nosniff, and
    frame-deny headers. Do not redirect arbitrary keys into another cache key. Keep the
    canonical no-query success cache policies at 60 seconds for data and six hours for
    research.
  </action>
  <test_code>
    In each endpoint suite request `?reaudit_nonce=random`, inject a `vi.fn()` provider or
    CSV loader, and assert status 400, `no-store`, the generic body, and zero loader calls.
    Retain the canonical GET, 405, and sanitized upstream-failure cases.
  </test_code>
  <verify>
    `npx vitest run src/server/worldCup/publicDataEndpoint.test.ts src/server/worldCup/strategyResearchEndpoint.test.ts` — all tests pass.
    `npm run typecheck` — exits 0.
  </verify>
  <done>Only one canonical CDN cache key can invoke each expensive public GET handler.</done>
  <commit>fix(world-cup): reject public endpoint query variants</commit>
</task>

<task id="5" depends="1" type="auto" status="done">
  <name>Bound the scheduled job's internal research request</name>
  <files>
    <modify>src/server/worldCup/predictionSnapshotEndpoint.ts</modify>
    <test>src/server/worldCup/predictionSnapshotEndpoint.test.ts</test>
  </files>
  <read_first>
    src/server/http/fetchWithTimeout.ts
    src/server/worldCup/predictionSnapshotEndpoint.ts
    src/server/worldCup/predictionSnapshotEndpoint.test.ts
  </read_first>
  <action>
    Use `fetchWithTimeout` for the internal `/api/world-cup/research` GET with an 12,000 ms
    deadline, `Accept: application/json`, and no query string. Add injectable
    `fetchResearch?: typeof fetch` and `researchTimeoutMs?: number` dependencies so the
    endpoint test never touches the network. A timeout must reject through the existing
    generic job-failure path early enough for `recordStatus({ status: "failure" })`; do not
    include the URL, provider response, or credentials in the response/status message.
  </action>
  <test_code>
    Add a fake-timer test with an authorized request and a research fetcher that rejects when
    its signal aborts. Have `runJob` invoke `loadStrategyResearch`, advance 12,000 ms, await
    the response, and assert 502 plus one sanitized failure status write. Assert the fetch
    received a signal and the response body contains no injected upstream detail.
  </test_code>
  <verify>
    `npx vitest run src/server/worldCup/predictionSnapshotEndpoint.test.ts` — all tests pass.
    `npm run typecheck` — exits 0.
  </verify>
  <done>Internal research stalls become recorded failures before the function hard timeout.</done>
  <commit>fix(world-cup): bound scheduled research fetch</commit>
</task>

<task id="6" depends="" type="auto" status="done">
  <name>Separate evidence content identity from observation time</name>
  <files>
    <modify>src/server/worldCup/publicEvidenceJob.ts</modify>
    <test>src/server/worldCup/publicEvidenceJob.test.ts</test>
  </files>
  <read_first>
    src/server/worldCup/publicEvidenceJob.ts
    src/server/worldCup/publicEvidenceJob.test.ts
    src/modules/sports/football/worldCup/data/publicWorldCupSnapshot.ts
    supabase/migrations/20260702190000_create_world_cup_public_evidence.sql
  </read_first>
  <action>
    Keep full observation provenance in each payload and `capturedAt`, but compute
    `contentHash` from a separate canonical identity. Fixture identity contains `kind`,
    `adapterResult`, fixture source, and provider name but excludes `retrievedAt`. Market
    identity contains `kind`, `matchId`, the complete market value, market source, and
    `matchedMatches` but excludes provenance `retrievedAt`; the market's own `lastUpdated`
    remains content. Keep sorted-key canonicalization and SHA-256 output unchanged. Do not
    alter the existing unique `(kind, content_hash)` database constraint.
  </action>
  <test_code>
    Build two snapshots with identical fixtures/markets but different `generatedAt` and both
    provenance `retrievedAt` values. Assert corresponding hashes are equal while
    `capturedAt` and payload observation timestamps differ. Then change one fixture field
    and one market probability and assert their hashes change.
  </test_code>
  <verify>
    `npx vitest run src/server/worldCup/publicEvidenceJob.test.ts` — all tests pass.
    `npm run typecheck` — exits 0.
  </verify>
  <done>`content_hash` deduplicates equal provider content without erasing observation metadata.</done>
  <commit>fix(world-cup): stabilize public evidence content hashes</commit>
</task>

<task id="7" depends="4" type="auto" status="done">
  <name>Version and pin research provenance</name>
  <files>
    <modify>src/server/worldCup/strategyResearchEndpoint.ts</modify>
    <test>src/server/worldCup/strategyResearchEndpoint.test.ts</test>
    <modify>src/modules/sports/football/worldCup/research/strategyResearchSnapshot.ts</modify>
    <test>src/modules/sports/football/worldCup/research/strategyResearchSnapshot.test.ts</test>
    <modify>src/modules/sports/football/worldCup/domain/WorldCupDomainModel.ts</modify>
  </files>
  <read_first>
    src/server/worldCup/strategyResearchEndpoint.ts
    src/modules/sports/football/worldCup/research/strategyResearchSnapshot.ts
    src/modules/sports/football/worldCup/logic/modelConfig.ts
    src/modules/sports/football/worldCup/research/walkForwardOptimizer.ts
  </read_first>
  <action>
    Pin both historical CSV URLs to commit
    `f73286079f8c6b48a59f8a16e895d757119dca71`, never `master`. Upgrade the research
    snapshot to schema version 3 and add `provenance` with exact fields:
    `datasetRevision`, `datasetSha256`, `researchAlgorithmVersion: "world-cup-walk-forward-v1"`,
    and `modelConfigSha256`. Hash the exact UTF-8 CSV bytes and a canonical serialization of
    the calibration/model inputs that affect research output. Make the snapshot builder
    async if required. Validate both hashes as `sha256:` plus 64 lowercase hex characters,
    require the pinned revision, and keep schema-v2 parsing rejected rather than silently
    inventing provenance. Extend `WorldCupStrategyResearchState` and its mapping with the
    same validated provenance so downstream capture never reconstructs it from loose fields.
  </action>
  <test_code>
    Update fixtures to schema 3. Assert the same CSV/config produces stable dataset and model
    hashes, one-byte CSV changes alter only the dataset hash, both public URLs contain the
    pinned revision, and parser cases reject `master`, missing provenance, malformed hashes,
    or an unknown algorithm version.
  </test_code>
  <verify>
    `npx vitest run src/server/worldCup/strategyResearchEndpoint.test.ts src/modules/sports/football/worldCup/research/strategyResearchSnapshot.test.ts` — all tests pass.
    `npm run typecheck` — exits 0.
  </verify>
  <done>Every accepted research snapshot identifies immutable data and model inputs.</done>
  <commit>feat(world-cup): version research provenance</commit>
</task>

<task id="8" depends="3,6,7" type="auto" status="done">
  <name>Carry research provenance into captured predictions</name>
  <files>
    <modify>src/modules/sports/football/worldCup/types.ts</modify>
    <modify>src/modules/sports/football/worldCup/persistence/preMatchPredictionStore.ts</modify>
    <test>src/modules/sports/football/worldCup/persistence/preMatchPredictionStore.test.ts</test>
    <modify>src/server/worldCup/publicEvidenceJob.ts</modify>
    <test>src/server/worldCup/publicEvidenceJob.test.ts</test>
  </files>
  <read_first>
    src/modules/sports/football/worldCup/domain/WorldCupDomainModel.ts
    src/modules/sports/football/worldCup/research/strategyResearchSnapshot.ts
    src/modules/sports/football/worldCup/types.ts
    src/modules/sports/football/worldCup/persistence/preMatchPredictionStore.ts
    src/modules/sports/football/worldCup/persistence/preMatchPredictionStore.test.ts
  </read_first>
  <action>
    Add a required `provenance` object to new `PreMatchPredictionSnapshot` values containing
    `schemaVersion: 1`, `applicationRevision`, `modelVersion: "v2"`, `researchGeneratedAt`,
    `candidateId`, `datasetRevision`, `datasetSha256`, and `modelConfigSha256`; nullable
    research fields are allowed only for explicit baseline predictions. Pass provenance into
    `capturePreMatchPredictionSnapshots` and persist it with the immutable first capture.
    Have the hook pass `import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ?? "local"`; have the
    evidence job pass `process.env.VERCEL_GIT_COMMIT_SHA ?? "local"`. Never place a
    credential in provenance. Update
    runtime validation and local-storage tests, preserving backwards compatibility by
    accepting legacy local snapshots as baseline provenance only through an explicit
    migration function, not a type cast. Extend the public-evidence job test in task 6's
    existing suite when executing this task if server provenance wiring lacks direct coverage.
  </action>
  <test_code>
    Add cases for an applied-research capture with all exact provenance fields, a baseline
    capture with null research fields, migration of a valid legacy local snapshot, rejection
    of malformed hashes/revisions, and preservation of the first snapshot when a later
    capture supplies different provenance.
  </test_code>
  <verify>
    `npx vitest run src/modules/sports/football/worldCup/persistence/preMatchPredictionStore.test.ts src/modules/sports/football/worldCup/research/strategyResearchSnapshot.test.ts src/server/worldCup/publicEvidenceJob.test.ts` — all tests pass.
    `npm run typecheck` — exits 0.
  </verify>
  <done>Every newly captured prediction carries validated, immutable model and research identity.</done>
  <commit>feat(world-cup): attach provenance to prediction captures</commit>
</task>

<task id="9" depends="2,8" type="auto">
  <name>Persist prediction provenance through Supabase</name>
  <files>
    <create>supabase/migrations/20260713120000_add_world_cup_prediction_provenance.sql</create>
    <modify>src/server/worldCup/supabasePredictionSnapshotRepository.ts</modify>
    <test>src/server/worldCup/supabasePredictionSnapshotRepository.test.ts</test>
    <modify>src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.ts</modify>
    <test>src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.test.ts</test>
  </files>
  <read_first>
    supabase/migrations/20260701130000_create_world_cup_prediction_snapshots.sql
    supabase/migrations/20260704120000_lock_world_cup_prediction_snapshots.sql
    src/server/worldCup/supabasePredictionSnapshotRepository.ts
    src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.ts
  </read_first>
  <action>
    Add an additive nullable `provenance jsonb` column so existing immutable rows remain
    readable, plus JSON shape checks for non-null new values. Do not edit historical
    migrations or relax the immutable trigger. Map snapshot provenance into the server
    insert, select it in cloud reads, and run legacy null rows through the explicit baseline
    migration from task 8. Keep `on_conflict=match_id` with
    `resolution=ignore-duplicates` so provenance cannot overwrite the first capture.
  </action>
  <test_code>
    Assert REST writes include the provenance object, cloud reads round-trip it, null legacy
    rows migrate explicitly, malformed cloud provenance rejects the entire response, and
    insert headers still ignore duplicate match IDs. Add migration text assertions for the
    new column/check and unchanged immutable-trigger behavior.
  </test_code>
  <verify>
    `npx vitest run src/server/worldCup/supabasePredictionSnapshotRepository.test.ts src/modules/sports/football/worldCup/persistence/cloudPreMatchPredictionStore.test.ts` — all tests pass.
    `npm run typecheck` — exits 0.
  </verify>
  <done>Local, server, database, and cloud-read prediction contracts preserve provenance.</done>
  <commit>feat(world-cup): persist prediction provenance</commit>
</task>

<task id="10" depends="5" type="auto">
  <name>Decouple telemetry retention from evidence generation</name>
  <files>
    <create>src/server/worldCup/telemetryRetentionEndpoint.ts</create>
    <test>src/server/worldCup/telemetryRetentionEndpoint.test.ts</test>
    <create>api/world-cup/telemetry-retention.ts</create>
    <modify>src/server/worldCup/predictionSnapshotEndpoint.ts</modify>
    <test>src/server/worldCup/predictionSnapshotEndpoint.test.ts</test>
  </files>
  <read_first>
    src/server/worldCup/predictionSnapshotEndpoint.ts
    src/server/worldCup/clientTelemetryRepository.ts
    supabase/migrations/20260704130000_prune_world_cup_client_telemetry.sql
    api/world-cup/prediction-snapshot.ts
  </read_first>
  <action>
    Create a dedicated GET/POST retention endpoint using the same constant-time bearer
    comparison contract as the evidence endpoint, `CRON_SECRET` (or
    `WORLD_CUP_CRON_SECRET` fallback), `SUPABASE_URL`, and
    `SUPABASE_SERVICE_ROLE_KEY`. It calls only `pruneClientTelemetryInSupabase`, returns the
    bounded deleted-row count on success, and returns generic 401/503/502 responses with
    `no-store`. Remove pruning and `telemetryRowsPruned` from the prediction endpoint so
    evidence failure, research timeout, or provider latency cannot suspend retention and
    retention failure cannot relabel successful evidence writes.
  </action>
  <test_code>
    Test retention 401, unsupported method 405, unconfigured 503, success with an integer
    row count, and sanitized repository failure 502. Update prediction endpoint tests to
    assert successful evidence no longer calls or returns pruning and evidence failures do
    not affect the independent retention contract.
  </test_code>
  <verify>
    `npx vitest run src/server/worldCup/telemetryRetentionEndpoint.test.ts src/server/worldCup/predictionSnapshotEndpoint.test.ts` — all tests pass.
    `npm run typecheck` — exits 0.
  </verify>
  <done>Telemetry retention and evidence generation have independent endpoints and failure domains.</done>
  <commit>fix(world-cup): decouple telemetry retention job</commit>
</task>

<task id="11" depends="4,10" type="auto">
  <name>Harden schedules and document recovery and edge budgets</name>
  <files>
    <modify>vercel.json</modify>
    <modify>supabase/configure_prediction_snapshot_cron.sql</modify>
    <test>src/scripts/worldCupDeploymentPolicy.test.ts</test>
    <modify>docs/runbooks/world-cup-production.md</modify>
    <modify>README.md</modify>
  </files>
  <read_first>
    vercel.json
    supabase/configure_prediction_snapshot_cron.sql
    src/scripts/worldCupDeploymentPolicy.test.ts
    docs/runbooks/world-cup-production.md
    README.md
  </read_first>
  <action>
    Add the independent retention endpoint to the daily Vercel schedule at `15 8 * * *`
    while keeping evidence at `0 8 * * *`. Change the Supabase helper SQL so it unschedules
    the legacy `lock-world-cup-predictions-every-minute` job and does not recreate any
    `* * * * *` full-pipeline schedule; explain that match-window capture needs a future
    lightweight capture-only design. Update policy tests to lock both daily routes, reject
    minute cadence, retain secret-scanning assertions by location/type only, and confirm
    retention no longer appears in the evidence endpoint.

    Update README/runbook with: canonical query-free public URLs; Vercel edge-rate-limit
    requirements for `/api/world-cup/data`, `/api/world-cup/research`, and
    `/api/world-cup/client-telemetry`; why Origin/storage caps are not request budgets; the
    command to unschedule the old Supabase job; independent retention monitoring; database
    owner, actual-plan field, backup/PITR retention field, target RPO/RTO fields, quarterly
    isolated restore drill, evidence integrity queries, rollback boundaries, and a dated
    control-plane verification record template. Mark all unverified values `UNVERIFIED`;
    never claim a dashboard feature is enabled from repository state alone.
  </action>
  <test_code>
    Extend the deployment-policy suite to assert exact two-entry daily cron configuration,
    absence of the literal minute schedule in the Supabase SQL, presence of separate
    retention/evidence routes, no retention call in `predictionSnapshotEndpoint.ts`, and
    runbook markers `Edge request budget`, `RPO`, `RTO`, `PITR`, `restore drill`, and
    `UNVERIFIED`.
  </test_code>
  <verify>
    `npx vitest run src/scripts/worldCupDeploymentPolicy.test.ts` — all tests pass.
    `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` — exits 0.
    `npm run lint && npm run typecheck` — exits 0.
  </verify>
  <done>The repo disables the unsafe minute job and defines truthful retention, edge-budget, and recovery contracts.</done>
  <commit>ops(world-cup): harden schedules and recovery runbook</commit>
</task>

<task id="12" depends="3,4,5,6,7,8,9,10,11" type="checkpoint:verify">
  <name>Verify production control-plane safeguards without exposing secrets</name>
  <files>
    <modify>docs/runbooks/world-cup-production.md</modify>
  </files>
  <read_first>
    docs/runbooks/world-cup-production.md
    vercel.json
    supabase/configure_prediction_snapshot_cron.sql
    docs/arc/audits/2026-07-13-full-codebase-reaudit.md
  </read_first>
  <action>
    Execute this checkpoint only after the frontend-runtime and accessibility/test-maintenance
    plans are DONE and their full gates pass. After a preview deployment, the agent verifies observable state and presents evidence
    for approval. If authentication is required, stop with `AUTH_GATE` and resume only after
    the user restores access through the execution workflow.

    Verify: random-query requests to data/research return 400 without upstream work;
    canonical requests hit CDN cache on repetition; Vercel edge rules impose documented
    per-route request budgets on data, research, and telemetry; both daily jobs show a
    successful run; Supabase has no active `lock-world-cup-predictions-every-minute` job;
    the provenance migration is applied; the actual backup/PITR tier and retention match
    the runbook; and an isolated restore drill meets the recorded RPO/RTO and passes row-
    count, immutable-snapshot, and evidence-hash checks. Record only dates, settings,
    counts, durations, deployment IDs, and pass/fail results in the runbook. Never copy a
    token, key, authorization header, decrypted vault value, or secret-bearing URL. If any
    credential is unexpectedly exposed, cite only its location/type and require rotation.
  </action>
  <test_code>
    Run canonical and random-query HTTP probes and record status/cache headers; query cron
    job names/schedules and schema presence through an administrative session without
    printing credentials; execute the runbook's restored-project integrity queries. The
    evidence record must contain no bearer token, API key, vault value, cookie, or secret.
  </test_code>
  <verify>
    User approves the sanitized control-plane evidence, including active edge budgets,
    independent daily jobs, absent minute cron, applied migration, documented backup/PITR
    state, and a passing isolated restore drill. `rg -n -i "bearer |service_role.*=|apikey.*=" docs/runbooks/world-cup-production.md` returns no secret-bearing record.
  </verify>
  <done>The runbook contains a dated, sanitized production verification record; unknown or failed controls remain explicitly `UNVERIFIED` and block a readiness claim.</done>
  <commit>docs(world-cup): record control-plane recovery verification</commit>
</task>

## Decision log

- 2026-07-13 — Task 1 added explicit tests for caller cancellation during an in-flight
  request and listener cleanup after a fast response after the code-quality gate identified
  those missing regression cases.
- 2026-07-13 — Task 3 runs the stalled-cloud Playwright case with inert public Supabase test
  configuration so the intercepted REST request is guaranteed to occur; the test asserts
  that route was reached before accepting the independent initial render as evidence.
- 2026-07-13 — Task 7 centralizes the causal-rating and walk-forward defaults into the
  same exported configuration objects used by runtime calculations and provenance hashing;
  the code-quality gate also tightened source validation to an exact pinned-URL allowlist.
- 2026-07-14 — Task 8 preserves malformed configured deployment revisions until runtime
  validation instead of relabeling them `local`, and refuses to label predictions as baseline
  when research ratings affected them but the required research identity is incomplete.
