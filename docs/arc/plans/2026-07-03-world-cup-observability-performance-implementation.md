# World Cup Observability and Performance Implementation Plan

> **For Arc:** Execute locally in the shared workspace. Multi-agent execution is
> disabled for this thread. Preserve the user's changes in
> `tests/e2e/smoke.spec.ts` and `test-results/`.

**Feature spec:** `docs/arc/specs/2026-07-02-world-cup-public-research-platform-spec.md`
**Audit input:** `docs/audits/2026-07-03-world-cup-strategy-audit.md`
**Goal:** Close the remaining centralized browser-observability gap, enforce
measured frontend performance budgets, and keep the public deployment path
private, bounded, testable, and rollback-friendly.
**Stack:** React 19 + TypeScript 5.9 + Vite 7 + Vitest + Playwright + Vercel
Functions + Supabase + `web-vitals` 5

## Scope posture

This is a large, cross-layer change, but it is split into independently
deployable increments:

1. a privacy-minimized telemetry contract and private persistence boundary;
2. a bounded same-origin API endpoint;
3. production browser error and Core Web Vitals reporting;
4. deterministic build-budget enforcement;
5. a measured hero-image optimization;
6. operational documentation and whole-system verification.

No Sentry, PostHog, Google Analytics, cookies, user IDs, IP addresses, raw error
messages, raw stack traces, query strings, or arbitrary client-provided labels
are introduced. The existing Supabase service-role boundary performs writes.
Telemetry is never exposed through a public read policy.

## File structure

- `src/observability/clientTelemetry.ts` owns the shared versioned payload
  contract, enum validation, known-route classification, and error
  fingerprinting inputs.
- `src/observability/browserObservability.ts` owns production-only global error
  listeners, React error reporting, Core Web Vitals callbacks, and
  `sendBeacon`/`fetch` delivery.
- `src/server/worldCup/clientTelemetryRepository.ts` owns the service-role
  Supabase aggregation-RPC boundary.
- `src/server/worldCup/clientTelemetryEndpoint.ts` owns request security,
  payload bounds, server-time deduplication, and sanitized responses.
- `api/world-cup/client-telemetry.ts` remains a thin Vercel adapter.
- `supabase/migrations/20260703150000_create_world_cup_client_telemetry.sql`
  owns the private telemetry table and constraints.
- `scripts/check-build-budget.mjs` owns deterministic post-build size budgets.
- `src/scripts/buildBudgetPolicy.test.ts` exercises the budget script against
  generated fixtures instead of relying on hashed filenames.
- Existing CI, deploy, runbook, and audit documents own operational use.

## Test coverage plan

| Layer | Test file | Coverage |
| --- | --- | --- |
| Contract | `src/observability/clientTelemetry.test.ts` | valid metric/error payloads, route normalization, arbitrary-label rejection, non-finite values |
| Repository | `src/server/worldCup/clientTelemetryRepository.test.ts` | private aggregation RPC, row mapping, config validation, sanitized errors |
| Endpoint | `src/server/worldCup/clientTelemetryEndpoint.test.ts` | method, origin, content type, body size, schema, dedupe, persistence failure, security headers |
| Browser | `src/observability/browserObservability.test.ts` | beacon/fetch fallback, production gate, metric mapping, error fingerprint privacy |
| React boundary | `src/components/ErrorBoundary.test.tsx` | caught render errors are forwarded without changing fallback behavior |
| Build policy | `src/scripts/buildBudgetPolicy.test.ts` | passing manifest, oversized entry, route, chunk, CSS, and image failures |
| E2E | existing six Playwright journeys | no console regressions, responsive behavior, World Cup disclosure |

## Performance budgets

Budgets are based on the measured 2026-07-03 production build:

- initial JavaScript: at most 70 KiB gzip (baseline 62.94 KiB);
- World Cup route JavaScript, excluding initial JavaScript: at most 90 KiB
  gzip (measured corrected baseline approximately 60 KiB);
- any single JavaScript chunk: at most 120 KiB gzip (largest baseline 108.76
  KiB);
- any single CSS asset: at most 10 KiB gzip (largest baseline 5.99 KiB);
- any copied raster asset: at most 350 KiB (current lobby hero is 1.39 MiB and
  is the measured violation).

The budgets leave limited growth room while avoiding a brittle exact-size
snapshot.

<task id="1" depends="" type="auto">
  <name>Create the private client-telemetry contract and repository</name>
  <files>
    <create>src/observability/clientTelemetry.ts</create>
    <test>src/observability/clientTelemetry.test.ts</test>
    <create>src/server/worldCup/clientTelemetryRepository.ts</create>
    <test>src/server/worldCup/clientTelemetryRepository.test.ts</test>
    <create>supabase/migrations/20260703150000_create_world_cup_client_telemetry.sql</create>
  </files>
  <read_first>
    src/server/worldCup/publicEvidenceRepository.ts
    src/server/worldCup/publicEvidenceRepository.test.ts
    supabase/migrations/20260702190000_create_world_cup_public_evidence.sql
  </read_first>
  <action>
    Define schema version 1 with two discriminated payloads.

    `web-vital` payload:
    - `kind`: `"web-vital"`
    - `name`: `"CLS" | "INP" | "LCP"`
    - `value`: finite, non-negative number
    - `rating`: `"good" | "needs-improvement" | "poor"`
    - `route`: `"main" | "traditional" | "sports" | "football" |
      "world-cup" | "game" | "unknown"`
    - `navigationType`: `"navigate" | "reload" | "back-forward" |
      "prerender" | "unknown"`

    `runtime-error` payload:
    - `kind`: `"runtime-error"`
    - `name`: `"window-error" | "unhandled-rejection" | "react-error"`
    - `fingerprint`: lowercase SHA-256 hex
    - the same bounded `route` and `navigationType`

    Reject unknown keys. Do not include message, stack, filename, URL, user
    agent, session ID, or user identifier fields. Route classification uses only
    the known application hash routes and maps everything else to `unknown`.

    Create a private table with a unique `dedupe_key`, server `received_at`,
    constraints matching the payload union, RLS enabled, and no grants or
    public select policy for `anon` or `authenticated`. Add a service-role-only
    SQL RPC that inserts a new five-minute/value/error bucket or atomically
    increments `sample_count` on conflict. The repository invokes only that RPC
    and exposes no Supabase response body.
  </action>
  <test_code>
    Write contract tests before implementation for one valid metric, one valid
    runtime error, every invalid union crossing, unknown properties, Infinity,
    negative values, raw message/stack rejection, and known/unknown routes.
    Write repository tests before implementation for exact REST URL, service
    headers, aggregate row mapping, no-op empty input, invalid HTTPS/config
    rejection, and sanitized non-2xx failures.
  </test_code>
  <verify>
    `pnpm vitest run src/observability/clientTelemetry.test.ts src/server/worldCup/clientTelemetryRepository.test.ts`
    passes.
    `pnpm run typecheck` passes.
    Migration contains RLS and contains no `grant select` or public read policy.
  </verify>
  <done>A versioned low-sensitivity contract and private service-role repository exist, with database constraints mirroring runtime validation.</done>
  <commit>feat(observability): add private client telemetry storage</commit>
</task>

<task id="2" depends="1" type="auto">
  <name>Add the bounded same-origin telemetry endpoint</name>
  <files>
    <create>src/server/worldCup/clientTelemetryEndpoint.ts</create>
    <test>src/server/worldCup/clientTelemetryEndpoint.test.ts</test>
    <create>api/world-cup/client-telemetry.ts</create>
  </files>
  <read_first>
    src/observability/clientTelemetry.ts
    src/server/worldCup/clientTelemetryRepository.ts
    src/server/worldCup/healthEndpoint.ts
    api/world-cup/health.ts
  </read_first>
  <action>
    Accept only `POST` with `application/json`, an `Origin` exactly matching the
    request URL origin, and a UTF-8 body no larger than 2,048 bytes. Parse and
    validate exactly one schema-v1 event.

    Replace client time with server time. Derive a five-minute UTC bucket.
    Quantize CLS to 0.01 and INP/LCP to 50 ms before persistence. Derive a
    SHA-256 `dedupe_key` from schema version, kind, bounded name, bounded route,
    navigation type, bucket, and either the quantized metric value/rating or the
    error fingerprint. The private RPC increments `sample_count` for matching
    buckets, preserving a weighted field distribution without one row per page
    view.

    Return 202 on accepted or duplicate writes. Return 405/403/415/413/400 for
    method, origin, media type, size, and validation failures. Return a sanitized
    503 when persistence is unavailable. Every response uses `no-store`,
    `nosniff`, and `DENY` framing headers. Never echo request data or internal
    errors.
  </action>
  <test_code>
    Write failing endpoint tests for all response classes, exact five-minute
    metric quantization, dedupe stability, dedupe changes across buckets or
    error fingerprints, server timestamp use, service-role aggregation mapping,
    absence of raw client data in error responses, and the thin Vercel adapter
    environment mapping.
  </test_code>
  <verify>
    `pnpm vitest run src/server/worldCup/clientTelemetryEndpoint.test.ts` passes.
    `pnpm run typecheck` and `pnpm run lint` pass.
  </verify>
  <done>The public write endpoint has bounded cost and vocabulary, same-origin browser enforcement, private persistence, and sanitized failures.</done>
  <commit>feat(observability): accept bounded browser telemetry</commit>
</task>

<task id="3" depends="2" type="auto">
  <name>Report browser errors and Core Web Vitals without personal data</name>
  <files>
    <create>src/observability/browserObservability.ts</create>
    <test>src/observability/browserObservability.test.ts</test>
    <modify>src/components/ErrorBoundary.tsx</modify>
    <test>src/components/ErrorBoundary.test.tsx</test>
    <modify>src/main.tsx</modify>
    <modify>package.json</modify>
    <modify>package-lock.json</modify>
  </files>
  <read_first>
    src/observability/clientTelemetry.ts
    src/components/ErrorBoundary.tsx
    src/main.tsx
    package.json
  </read_first>
  <action>
    Install `web-vitals` 5.3.x and dynamically import the standard build after
    application startup. Register `onCLS`, `onINP`, and `onLCP` exactly once per
    page load and send only name, value, rating, known route, and navigation
    type.

    Register `error` and `unhandledrejection` listeners. Convert error name plus
    message plus stack/component stack into a local SHA-256 fingerprint, then
    discard the source text before delivery. Forward React boundary errors
    through the same fingerprint function while retaining the existing console
    and fallback behavior.

    Run reporting only in production builds. Use an application/json `Blob`
    with `navigator.sendBeacon`; if unavailable or rejected, use same-origin
    `fetch` with `keepalive: true`, `credentials: "omit"`, and no retry loop.
    Reporting failures are swallowed to avoid recursive error reporting.
  </action>
  <test_code>
    Write tests before implementation for Web Vitals field mapping, one-time
    startup, production disablement, beacon success, beacon rejection fetch
    fallback, fingerprint determinism, differing fingerprints, known route
    classification, no raw error material in the serialized body, and React
    boundary forwarding.
  </test_code>
  <verify>
    `pnpm vitest run src/observability/browserObservability.test.ts src/components/ErrorBoundary.test.tsx`
    passes.
    `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` pass.
    The initial application chunk remains below 70 KiB gzip because
    `web-vitals` is dynamically loaded.
  </verify>
  <done>Production browsers report three Core Web Vitals and three bounded runtime-error categories to the private endpoint without transmitting raw diagnostics or identity data.</done>
  <commit>feat(observability): report browser health privately</commit>
</task>

<task id="4" depends="3" type="auto">
  <name>Enforce deterministic frontend build budgets</name>
  <files>
    <create>scripts/check-build-budget.mjs</create>
    <test>src/scripts/buildBudgetPolicy.test.ts</test>
    <modify>vite.config.ts</modify>
    <modify>package.json</modify>
    <modify>.github/workflows/ci.yml</modify>
    <modify>scripts/deploy.sh</modify>
  </files>
  <read_first>
    vite.config.ts
    package.json
    .github/workflows/ci.yml
    scripts/deploy.sh
    src/scripts/deployScriptPolicy.test.ts
  </read_first>
  <action>
    Enable Vite's build manifest. Implement a dependency-free Node script that
    reads `dist/.vite/manifest.json`, follows the initial and World Cup import
    graphs, gzips assets in memory, and checks the documented initial, route,
    single-chunk, CSS, and raster budgets. Remove the manual Recharts chunk:
    measurement showed it pulled React into the initial graph, while explicit
    dependency-only chunking created a Rollup circular-chunk warning. Vite's
    automatic dynamic-entry splitting avoids both failures.

    The script accepts `--root` for isolated tests, emits every measured value,
    exits zero only when all budgets pass, and emits no absolute local paths.
    Add `check:build-budget`; run it immediately after the production build in
    CI and `scripts/deploy.sh`.
  </action>
  <test_code>
    Generate temporary manifests/assets in Vitest and spawn the script for a
    passing build plus separate initial, World Cup route, single JS, CSS, and
    raster violations. Assert deterministic non-zero exits and actionable
    relative-path output. Extend deploy policy tests to require the budget gate
    after build and before E2E.
  </test_code>
  <verify>
    `pnpm vitest run src/scripts/buildBudgetPolicy.test.ts src/scripts/deployScriptPolicy.test.ts`
    passes.
    `pnpm run build && pnpm run check:build-budget` fails only on the measured
    1.39 MiB lobby PNG before task 5.
  </verify>
  <done>CI and manual deployment reject measurable JavaScript, CSS, route, or raster regressions using hashed-output-independent checks.</done>
  <commit>perf(build): enforce frontend size budgets</commit>
</task>

<task id="5" depends="4" type="auto">
  <name>Remove the measured lobby hero transfer bottleneck</name>
  <files>
    <create>public/assets/lobby-hero.jpg</create>
    <delete>public/assets/lobby-hero.png</delete>
    <modify>src/components/Lobby/Lobby.css</modify>
    <modify>src/modules/lobby/MainLobby.module.css</modify>
  </files>
  <read_first>
    public/assets/lobby-hero.png
    src/components/Lobby/Lobby.css
    src/modules/lobby/MainLobby.module.css
  </read_first>
  <action>
    Transcode the opaque 1672x941 PNG to progressive-quality JPEG using the same
    dimensions and visual content. Target at most 300 KiB without changing crop
    or composition. Update both CSS consumers and remove the obsolete PNG.
    Compare the rendered desktop and 390 px mobile lobby before accepting.
  </action>
  <test_code>
    Use the task-4 build budget as the failing regression test. Before
    transcoding it must report the PNG violation; after transcoding the complete
    production build must pass every budget.
  </test_code>
  <verify>
    `pnpm run build` passes.
    `pnpm run check:build-budget` passes.
    The replacement asset is at most 300 KiB and remains 1672x941.
    Browser inspection at 1280 px and 390 px shows the intended crop, readable
    copy, no horizontal overflow, and no console error.
  </verify>
  <done>The lobby hero transfer drops by at least 75 percent while preserving the existing visual design.</done>
  <commit>perf(lobby): compress the hero background</commit>
</task>

<task id="6" depends="1,2,3,4,5" type="auto">
  <name>Document, self-review, and verify the release increment</name>
  <files>
    <modify>README.md</modify>
    <modify>docs/runbooks/world-cup-production.md</modify>
    <modify>docs/audits/2026-07-03-world-cup-strategy-audit.md</modify>
    <modify>docs/arc/specs/2026-07-02-world-cup-public-research-platform-spec.md</modify>
  </files>
  <read_first>
    README.md
    docs/runbooks/world-cup-production.md
    docs/audits/2026-07-03-world-cup-strategy-audit.md
    docs/arc/specs/2026-07-02-world-cup-public-research-platform-spec.md
  </read_first>
  <action>
    Document the private telemetry contract, migration order, no-PII boundary,
    sample-count-weighted seven-day Core Web Vitals p75 queries, grouped
    runtime-error queries, a 30-day retention command, and rollback behavior.
    State that telemetry is operational evidence, not sports-model evidence and
    not a public dataset.

    Update audit evidence with measured before/after asset sizes, build budgets,
    endpoint security checks, dependency audit status, and remaining external
    production configuration. Perform a five-axis review: correctness,
    readability, architecture, security/privacy, and performance. Fix every
    blocking or important finding before completion.
  </action>
  <test_code>
    Re-run focused tests after review fixes. Run the complete 106+ Vitest files
    and all Playwright journeys with a temporary output directory so the user's
    `test-results/` remains byte-for-byte unchanged.
  </test_code>
  <verify>
    `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run build`,
    `pnpm run check:build-budget`, and `npm audit --audit-level=high` pass.
    Playwright passes with diagnostics directed outside the repository.
    Workflow YAML parses; deploy script passes `bash -n`; secret-pattern scan is
    empty.
    `git diff -- tests/e2e/smoke.spec.ts` and hashes under `test-results/` match
    the pre-task baseline.
  </verify>
  <done>The observability/performance increment is documented, reviewed, release-gated, and leaves user-owned E2E work untouched.</done>
  <commit>docs(world-cup): record observability launch evidence</commit>
</task>

## Out-of-scope checkpoints

- Actual Vercel/Supabase deployment remains an authentication/configuration
  checkpoint. Do not claim telemetry is collecting production data until the
  migration and exact commit are deployed.
- Genuine pre-match three-way market snapshots, xG, injuries, and current-squad
  inputs remain unavailable. Do not synthesize them.
- Production p75 conclusions require enough real-user observations; local or
  E2E values are implementation checks, not field evidence.

## Post-plan accessibility hardening

After the observability and performance tasks passed, the remaining audit gap
was narrowed with a deterministic Axe gate in the public-snapshot Playwright
journey. A red-first scan exposed four classes of issue: invalid ARIA on
decorative probability tracks, muted-text contrast below 4.5:1, duplicate
landmark names, and disabled browser zoom. The implementation corrected each
issue, added focused semantic unit assertions, and updated the layout journey's
landmark locator. A follow-up review corrected the Chinese application's root
document language and applied the same gate to the unavailable-data state. The
final Axe scans report zero violations; manual screen-reader verification
remains intentionally unclaimed.

## Post-plan structural and abuse-resistance hardening

A subsequent full-codebase audit removed 26 confirmed orphan files after
separating four Vercel function entrypoints from dead-code-tool false positives.
The deleted set included the parallel legacy World Cup UI, components reachable
only through that UI, contradictory provider scaffolds, and unused design
modules. A source-boundary test now keeps the canonical World Cup domain path
singular.

The same pass made mobile filters at least 44 x 44 px, added reduced-motion
behavior, and bounded anonymous telemetry storage in PostgreSQL. Daily admission
is serialized and capped at 5,000 new rows, while individual aggregates
saturate at 10,000 samples. These controls limit storage abuse without claiming
that anonymous telemetry is authenticated.
