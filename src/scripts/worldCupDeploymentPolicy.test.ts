import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('World Cup public deployment policy', () => {
  it('schedules the evidence and telemetry retention endpoints once per day', () => {
    const config = JSON.parse(read('vercel.json')) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toEqual([
      {
        path: '/api/world-cup/prediction-snapshot',
        schedule: '0 8 * * *',
      },
      {
        path: '/api/world-cup/telemetry-retention',
        schedule: '15 8 * * *',
      },
    ]);
  });

  it('applies browser security headers to every deployed route', () => {
    const config = JSON.parse(read('vercel.json')) as {
      headers?: Array<{
        source: string;
        headers: Array<{ key: string; value: string }>;
      }>;
    };
    const globalHeaders = config.headers?.find(({ source }) => source === '/(.*)');
    const headerMap = Object.fromEntries(
      globalHeaders?.headers.map(({ key, value }) => [key.toLowerCase(), value]) ?? [],
    );

    expect(headerMap['content-security-policy']).toContain("default-src 'self'");
    expect(headerMap['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headerMap['x-content-type-options']).toBe('nosniff');
    expect(headerMap['x-frame-options']).toBe('DENY');
    expect(headerMap['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headerMap['permissions-policy']).toContain('camera=()');
  });

  it('never embeds service credentials in deployable configuration', () => {
    const deployable = [
      read('vercel.json'),
      read('api/world-cup/prediction-snapshot.ts'),
      read('supabase/configure_prediction_snapshot_cron.sql'),
    ].join('\n');

    expect(deployable).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}/);
    expect(deployable).not.toMatch(/service[_-]?role[_-]?key\s*[:=]\s*['"][^'"]+/i);
    expect(deployable).not.toMatch(/(?:cron[_-]?secret|authorization|bearer)\s*[:=]\s*['"][^'"]+/i);
  });

  it('removes the legacy minute job without recreating a minute cadence', () => {
    const sql = read('supabase/configure_prediction_snapshot_cron.sql');

    expect(sql).toContain("cron.unschedule(jobid)");
    expect(sql).toContain("jobname = 'lock-world-cup-predictions-every-minute'");
    expect(sql).not.toContain("'* * * * *'");
    expect(sql).not.toContain('cron.schedule');
    expect(sql).not.toContain('vault.create_secret');
    expect(sql).not.toContain('REPLACE_');
    expect(sql).not.toContain('pg_net');
    expect(sql).not.toContain('supabase_vault');
  });

  it('deploys separate evidence and telemetry retention routes', () => {
    expect(existsSync(join(root, 'api/world-cup/prediction-snapshot.ts'))).toBe(true);
    expect(existsSync(join(root, 'api/world-cup/telemetry-retention.ts'))).toBe(true);
  });

  it('monitors the public health endpoint without embedding credentials', () => {
    const workflow = read('.github/workflows/world-cup-health.yml');
    const checker = read('scripts/check-world-cup-health.mjs');
    const healthApi = read('api/world-cup/health.ts');

    expect(workflow).toContain("cron: '30 8,20 * * *'");
    expect(workflow).toContain('vars.PRODUCTION_HEALTH_URL');
    expect(workflow).toContain('npm run check:production-health');
    expect(checker).toContain("body?.status !== 'healthy'");
    expect(checker).toContain("snapshotJob?.status !== 'pass'");
    expect(healthApi).toContain('SUPABASE_PUBLISHABLE_KEY');
    expect(healthApi).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(`${workflow}\n${checker}`).not.toMatch(/Authorization|Bearer|service[_-]?role/i);
  });

  it('keeps client telemetry private and service-role aggregated', () => {
    const migration = read(
      'supabase/migrations/20260703150000_create_world_cup_client_telemetry.sql',
    );
    const api = read('api/world-cup/client-telemetry.ts');

    expect(migration).toContain(
      'alter table public.world_cup_client_telemetry enable row level security',
    );
    expect(migration).toContain(
      'revoke all on table public.world_cup_client_telemetry from anon, authenticated',
    );
    expect(migration).not.toMatch(
      /grant\s+select[\s\S]*world_cup_client_telemetry[\s\S]*to\s+(?:anon|authenticated)/i,
    );
    expect(migration).toMatch(
      /grant\s+select,\s*insert,\s*update[\s\S]*world_cup_client_telemetry[\s\S]*to\s+service_role/i,
    );
    expect(migration).toMatch(
      /grant\s+execute[\s\S]*record_world_cup_client_telemetry[\s\S]*to\s+service_role/i,
    );
    expect(migration).toContain('sample_count between 1 and 10000');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('daily_row_count < 5000');
    expect(api).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(api).not.toContain('VITE_SUPABASE_SERVICE_ROLE_KEY');
  });

  it('keeps telemetry retention out of the evidence endpoint', () => {
    const migration = read(
      'supabase/migrations/20260704130000_prune_world_cup_client_telemetry.sql',
    );
    const endpoint = read('src/server/worldCup/predictionSnapshotEndpoint.ts');

    expect(migration).toContain("interval '30 days'");
    expect(migration).toMatch(
      /revoke all on function public\.prune_world_cup_client_telemetry\(\)/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.prune_world_cup_client_telemetry\(\)[\s\S]*to service_role/i,
    );
    expect(migration).toMatch(
      /grant delete on table public\.world_cup_client_telemetry[\s\S]*to service_role/i,
    );
    expect(endpoint).not.toContain('pruneClientTelemetryInSupabase');
    expect(endpoint).not.toContain('pruneTelemetry');
    expect(endpoint).not.toContain('telemetryRowsPruned');
  });

  it('documents edge request budgets and verifiable recovery objectives', () => {
    const runbook = read('docs/runbooks/world-cup-production.md');

    expect(runbook).toContain('Edge request budget');
    expect(runbook).toContain('RPO');
    expect(runbook).toContain('RTO');
    expect(runbook).toContain('PITR');
    expect(runbook).toContain('restore drill');
    expect(runbook).toContain('UNVERIFIED');
  });

  it('documents sanitized public-evidence integrity checks for isolated restores', () => {
    const runbook = read('docs/runbooks/world-cup-production.md');
    const integritySection = runbook.slice(
      runbook.indexOf('Evidence integrity checks after an isolated restore:'),
      runbook.indexOf('### Sanitized control-plane verification record'),
    );

    expect(integritySection).toContain('public.world_cup_public_evidence');
    expect(integritySection).toMatch(
      /select\s+kind,\s*source,\s*schema_version,\s*count\(\*\)/i,
    );
    expect(integritySection).toContain("^sha256:[a-f0-9]{64}$");
    expect(integritySection).toMatch(
      /count\(\*\)\s+filter\s*\(\s*where\s+content_hash\s+is\s+null\s+or\s+content_hash\s+!~/i,
    );
    expect(integritySection).toMatch(
      /group by\s+kind,\s*content_hash[\s\S]*having\s+count\(\*\)\s*>\s*1/i,
    );
    expect(integritySection).not.toMatch(/select\s+(?:\*|payload)\s+from/i);
    expect(integritySection).toContain('Pass criteria');
    expect(runbook).toContain('Public-evidence counts by kind/source/schema');
    expect(runbook).toContain('Public-evidence hash status');
  });

  it('makes the first pre-match prediction snapshot immutable', () => {
    const migration = read(
      'supabase/migrations/20260704120000_lock_world_cup_prediction_snapshots.sql',
    );
    const repository = read(
      'src/server/worldCup/supabasePredictionSnapshotRepository.ts',
    );
    const snapshotWriter = repository.slice(
      repository.indexOf('export async function persistPredictionSnapshotsToSupabase'),
      repository.indexOf('export async function persistPredictionJobStatusToSupabase'),
    );

    expect(migration).toMatch(/before insert or update or delete/i);
    expect(migration).toContain(
      'A prediction snapshot is immutable after its first capture.',
    );
    expect(snapshotWriter).toContain(
      "Prefer: 'resolution=ignore-duplicates,return=minimal'",
    );
    expect(snapshotWriter).not.toContain(
      "Prefer: 'resolution=merge-duplicates,return=minimal'",
    );
  });
});
