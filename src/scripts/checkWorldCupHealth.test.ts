import { describe, expect, it, vi } from 'vitest';
import {
  checkWorldCupHealth,
  validateWorldCupHealth,
} from '../../scripts/check-world-cup-health.mjs';

const healthyBody = {
  schemaVersion: 1,
  status: 'healthy',
  checks: {
    configuration: { status: 'pass' },
    snapshotJob: {
      status: 'pass',
      lastCheckedAt: '2026-07-03T08:00:00.000Z',
    },
  },
};

describe('production World Cup health checker', () => {
  it('accepts only the healthy schema and returns the job timestamp', () => {
    expect(validateWorldCupHealth(200, healthyBody)).toBe(
      '2026-07-03T08:00:00.000Z',
    );

    expect(() => validateWorldCupHealth(503, {
      ...healthyBody,
      status: 'degraded',
      checks: {
        ...healthyBody.checks,
        snapshotJob: { status: 'stale', lastCheckedAt: null },
      },
    })).toThrow('deployment is unhealthy');
    expect(() => validateWorldCupHealth(200, {
      ...healthyBody,
      schemaVersion: 2,
    })).toThrow('deployment is unhealthy');
  });

  it('requires HTTPS and validates fetched JSON', async () => {
    const fetcher = vi.fn(async () => Response.json(healthyBody));

    await expect(checkWorldCupHealth(
      'https://example.test/api/world-cup/health',
      fetcher,
    )).resolves.toBe('2026-07-03T08:00:00.000Z');
    expect(fetcher).toHaveBeenCalledOnce();

    await expect(checkWorldCupHealth(
      'http://example.test/api/world-cup/health',
      fetcher,
    )).rejects.toThrow('require an HTTPS URL');
  });

  it('rejects non-JSON responses without returning their body', async () => {
    await expect(checkWorldCupHealth(
      'https://example.test/api/world-cup/health',
      async () => new Response('private upstream detail', { status: 502 }),
    )).rejects.toThrow('non-JSON content (HTTP 502)');
  });
});
