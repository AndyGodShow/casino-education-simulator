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
});
