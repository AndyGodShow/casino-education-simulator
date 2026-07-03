import { describe, expect, it, vi } from 'vitest';
import { handleWorldCupHealthRequest } from './healthEndpoint';

const config = {
  supabaseUrl: 'https://project.supabase.co',
  publishableKey: 'public-key',
};

const request = (method = 'GET') => new Request(
  'https://example.test/api/world-cup/health',
  { method },
);

const now = () => new Date('2026-07-03T12:00:00.000Z');

describe('World Cup health endpoint', () => {
  it('reports healthy only for a recent successful scheduled job', async () => {
    const response = await handleWorldCupHealthRequest(request(), config, {
      now,
      loadStatus: async () => ({
        status: 'success',
        checkedAt: '2026-07-03T08:00:00.000Z',
        source: 'openfootball',
        snapshotsWritten: 12,
        evidenceWritten: 4,
        message: 'private operational detail',
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const responseText = await response.clone().text();
    expect(await response.json()).toEqual({
      schemaVersion: 1,
      status: 'healthy',
      checkedAt: '2026-07-03T12:00:00.000Z',
      checks: {
        configuration: { status: 'pass' },
        snapshotJob: {
          status: 'pass',
          lastCheckedAt: '2026-07-03T08:00:00.000Z',
          ageHours: 4,
          source: 'openfootball',
          snapshotsWritten: 12,
          evidenceWritten: 4,
        },
      },
    });
    expect(responseText).not.toContain('private operational detail');
  });

  it.each([
    {
      name: 'failed',
      checkedAt: '2026-07-03T08:00:00.000Z',
      persistedStatus: 'failure' as const,
      expectedStatus: 'failure',
    },
    {
      name: 'stale',
      checkedAt: '2026-07-01T23:59:59.000Z',
      persistedStatus: 'success' as const,
      expectedStatus: 'stale',
    },
    {
      name: 'future-dated',
      checkedAt: '2026-07-03T12:06:00.000Z',
      persistedStatus: 'success' as const,
      expectedStatus: 'stale',
    },
  ])('reports degraded for a $name job state', async ({
    checkedAt,
    persistedStatus,
    expectedStatus,
  }) => {
    const response = await handleWorldCupHealthRequest(request(), config, {
      now,
      loadStatus: async () => ({
        status: persistedStatus,
        checkedAt,
        source: 'openfootball',
        snapshotsWritten: 0,
        evidenceWritten: 0,
        message: 'detail',
      }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('300');
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      checks: {
        snapshotJob: { status: expectedStatus },
      },
    });
  });

  it('distinguishes missing configuration and missing first run', async () => {
    const loadStatus = vi.fn();
    const unconfigured = await handleWorldCupHealthRequest(request(), {
      supabaseUrl: '',
      publishableKey: '',
    }, { now, loadStatus });
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toMatchObject({
      status: 'unconfigured',
      checks: { configuration: { status: 'fail' } },
    });
    expect(loadStatus).not.toHaveBeenCalled();

    const missing = await handleWorldCupHealthRequest(request(), config, {
      now,
      loadStatus: async () => null,
    });
    expect(await missing.json()).toMatchObject({
      status: 'degraded',
      checks: { snapshotJob: { status: 'missing' } },
    });
  });

  it('sanitizes persistence failures and rejects unsupported methods', async () => {
    const failed = await handleWorldCupHealthRequest(request(), config, {
      now,
      loadStatus: async () => {
        throw new Error('database detail token=secret');
      },
    });
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('database detail');

    const method = await handleWorldCupHealthRequest(request('POST'), config);
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('GET');
  });
});
