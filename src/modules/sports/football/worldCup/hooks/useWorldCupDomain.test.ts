import { describe, expect, it } from 'vitest';
import { adaptWorldCupFixtures } from '../../../../../dataProviders/football/worldCupAdapter';
import { createSampleFixtureResult } from '../../../../../dataProviders/football/fixtureProvider';
import { createInitialWorldCupDomainState } from './useWorldCupDomain';

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
});
