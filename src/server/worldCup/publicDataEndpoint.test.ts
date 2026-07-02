import { describe, expect, it, vi } from 'vitest';
import type { FixtureProviderResult } from '../../dataProviders/football/fixtureProvider';
import { createSampleFixtureResult } from '../../dataProviders/football/fixtureProvider';
import type { WorldCupMarketReferenceLoadResult } from '../../modules/sports/football/worldCup/market/polymarketAdapter';
import { handlePublicWorldCupDataRequest } from './publicDataEndpoint';

const verifiedFixtureResult = (): FixtureProviderResult => {
  const sample = createSampleFixtureResult();
  return {
    ...sample,
    fixtures: sample.fixtures.map((match) => ({ ...match, source: 'openfootball' as const })),
    source: 'openfootball',
    providerName: 'OpenFootball',
    errors: [],
  };
};

describe('handlePublicWorldCupDataRequest', () => {
  it('returns a cacheable normalized snapshot for a verified provider', async () => {
    const response = await handlePublicWorldCupDataRequest(
      new Request('https://example.test/api/world-cup/data'),
      {
        now: () => new Date('2026-07-02T12:00:00.000Z'),
        loadFixtureResult: async () => verifiedFixtureResult(),
        loadMarkets: async (): Promise<WorldCupMarketReferenceLoadResult> => ({
          markets: {},
          errors: [],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=300',
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const payload = await response.json();
    expect(payload).toMatchObject({
      schemaVersion: 1,
      generatedAt: '2026-07-02T12:00:00.000Z',
      adapterResult: {
        source: 'openfootball',
        providerName: 'OpenFootball',
      },
      provenance: {
        delivery: 'server',
        fixture: {
          source: 'openfootball',
          providerName: 'OpenFootball',
        },
        market: {
          source: 'polymarket',
          matchedMatches: 0,
        },
      },
    });
    expect(payload.adapterResult.matches).toHaveLength(72);
  });

  it('rejects local or sample fallback instead of publishing it as provider data', async () => {
    const response = await handlePublicWorldCupDataRequest(
      new Request('https://example.test/api/world-cup/data'),
      {
        loadFixtureResult: async () => createSampleFixtureResult(['provider failed']),
        loadMarkets: vi.fn(),
      },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Verified World Cup provider data is unavailable.',
    });
  });

  it('sanitizes provider failures and does not leak the upstream message', async () => {
    const response = await handlePublicWorldCupDataRequest(
      new Request('https://example.test/api/world-cup/data'),
      {
        loadFixtureResult: async () => {
          throw new Error('upstream token=secret internal detail');
        },
      },
    );

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('token=secret');
  });

  it('rejects unsupported methods without loading providers', async () => {
    const loadFixtureResult = vi.fn();
    const response = await handlePublicWorldCupDataRequest(
      new Request('https://example.test/api/world-cup/data', { method: 'POST' }),
      { loadFixtureResult },
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(loadFixtureResult).not.toHaveBeenCalled();
  });
});
