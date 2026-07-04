import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('World Cup public deployment policy', () => {
  it('schedules only the guarded evidence endpoint on the free daily cadence', () => {
    const config = JSON.parse(read('vercel.json')) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toEqual([{
      path: '/api/world-cup/prediction-snapshot',
      schedule: '0 8 * * *',
    }]);
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
    expect(deployable).toContain('REPLACE_WITH_A_LONG_RANDOM_SECRET');
  });

  it('keeps the Supabase schedule idempotent and on the guarded route', () => {
    const sql = read('supabase/configure_prediction_snapshot_cron.sql');

    expect(sql).toContain("cron.unschedule(jobid)");
    expect(sql).toContain('world_cup_prediction_snapshot_endpoint');
    expect(sql).toContain("'Authorization', 'Bearer '");
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

  it('enforces telemetry retention through the monitored daily job', () => {
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
    expect(endpoint).toContain('pruneClientTelemetryInSupabase');
    expect(endpoint).toContain('telemetryRowsPruned');
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
