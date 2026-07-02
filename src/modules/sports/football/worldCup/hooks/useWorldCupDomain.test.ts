import { describe, expect, it, vi } from 'vitest';
import { adaptWorldCupFixtures } from '../../../../../dataProviders/football/worldCupAdapter';
import { createSampleFixtureResult } from '../../../../../dataProviders/football/fixtureProvider';
import {
  buildWorldCupDomainWithMarketLoad,
  buildWorldCupDomainWithMarkets,
  createInitialWorldCupDomainState,
  loadWorldCupDataSource,
} from './useWorldCupDomain';

describe('createSampleFixtureResult', () => {
  it('keeps sample fixtures available only as an explicit fallback', () => {
    const result = createSampleFixtureResult();
    const adapterResult = adaptWorldCupFixtures(result);

    expect(result.source).toBe('sample');
    expect(result.providerName).toBe('Sample Fixtures');
    expect(result.fixtures.length).toBeGreaterThan(0);
    expect(result.teams.length).toBeGreaterThan(0);
    expect(result.teamRegistry.resolve('Canada')?.teamId).toBe('canada');
    expect(adapterResult.matches.length).toBeGreaterThan(0);
    expect(Object.keys(adapterResult.teams).length).toBeGreaterThan(0);
  });

  it('starts without a sample domain while the provider chain is loading', () => {
    expect(createInitialWorldCupDomainState()).toEqual({
      domain: null,
      isInitialLoading: true,
    });
  });

  it('injects fetched market references into the shared domain model', () => {
    const adapterResult = adaptWorldCupFixtures(createSampleFixtureResult());
    const matchId = adapterResult.matches[0].id;
    const domain = buildWorldCupDomainWithMarkets(adapterResult, {
      [matchId]: {
        kind: 'real',
        source: 'polymarket',
        probabilities: { home: 0.5, draw: 0.25, away: 0.25 },
        odds: { home: 2, draw: 4, away: 4 },
        status: 'available',
        confidence: 0.7,
        quality: 'high',
        auditable: true,
        lastUpdated: '2026-07-02T06:00:00.000Z',
        message: 'test market',
      },
    });

    expect(domain.markets?.[matchId]).toEqual(expect.objectContaining({
      kind: 'real',
      source: 'polymarket',
      probabilities: { home: 0.5, draw: 0.25, away: 0.25 },
    }));
  });

  it('surfaces market transport errors without dropping fixture data', () => {
    const adapterResult = adaptWorldCupFixtures(createSampleFixtureResult());
    const domain = buildWorldCupDomainWithMarketLoad(adapterResult, {
      markets: {},
      errors: ['Polymarket transport unavailable'],
    });

    expect(domain.matches).toHaveLength(adapterResult.matches.length);
    expect(domain.errors).toContain('Polymarket transport unavailable');
  });

  it('prefers a valid server snapshot over the browser provider chain', async () => {
    const adapterResult = adaptWorldCupFixtures(createSampleFixtureResult());
    const verifiedAdapter = {
      ...adapterResult,
      source: 'openfootball' as const,
      providerName: 'OpenFootball',
      matches: adapterResult.matches.map((match) => ({ ...match, source: 'openfootball' as const })),
    };
    const loadFixtureResult = vi.fn();
    const result = await loadWorldCupDataSource({
      fetchSnapshot: async () => new Response(JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-07-02T12:00:00.000Z',
        adapterResult: verifiedAdapter,
        markets: {},
        provenance: {
          delivery: 'server',
          fixture: {
            source: 'openfootball',
            providerName: 'OpenFootball',
            retrievedAt: '2026-07-02T12:00:00.000Z',
          },
          market: {
            source: 'polymarket',
            retrievedAt: '2026-07-02T12:00:00.000Z',
            matchedMatches: 0,
          },
        },
      }), { status: 200 }),
      loadFixtureResult,
    });

    expect(result.delivery).toBe('server');
    expect(result.adapterResult.source).toBe('openfootball');
    expect(loadFixtureResult).not.toHaveBeenCalled();
  });

  it('falls back to the browser provider chain and preserves the server error', async () => {
    const result = await loadWorldCupDataSource({
      fetchSnapshot: async () => new Response('{invalid', { status: 200 }),
      loadFixtureResult: async () => createSampleFixtureResult(),
    });

    expect(result.delivery).toBe('direct');
    expect(result.adapterResult.source).toBe('sample');
    expect(result.adapterResult.errors.join(' ')).toContain('Public data endpoint');
  });

  it('aborts a slow server snapshot before using the direct provider chain', async () => {
    const fetchSnapshot = vi.fn((_signal: AbortSignal) => new Promise<Response>((_resolve, reject) => {
      _signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));

    const result = await loadWorldCupDataSource({
      fetchSnapshot,
      loadFixtureResult: async () => createSampleFixtureResult(),
      timeoutMs: 5,
    });

    expect(result.delivery).toBe('direct');
    expect(fetchSnapshot.mock.calls[0]?.[0].aborted).toBe(true);
  });
});
