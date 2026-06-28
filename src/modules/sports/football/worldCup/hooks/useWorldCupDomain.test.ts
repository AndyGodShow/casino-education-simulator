import { describe, expect, it } from 'vitest';
import { adaptWorldCupFixtures } from '../../../../../dataProviders/football/worldCupAdapter';
import { createSampleFixtureResult } from '../../../../../dataProviders/football/fixtureProvider';

describe('createSampleFixtureResult', () => {
  it('starts the World Cup page with sample fixtures while live providers load', () => {
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
});
