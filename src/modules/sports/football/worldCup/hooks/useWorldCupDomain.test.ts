import { describe, expect, it } from 'vitest';
import { adaptWorldCupFixtures } from '../../../../../dataProviders/football/worldCupAdapter';
import { createSampleFixtureResult } from '../../../../../dataProviders/football/fixtureProvider';
import {
  buildWorldCupDomainWithMarketLoad,
  buildWorldCupDomainWithMarkets,
  createInitialWorldCupDomainState,
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
});
