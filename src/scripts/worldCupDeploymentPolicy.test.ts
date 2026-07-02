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
});
