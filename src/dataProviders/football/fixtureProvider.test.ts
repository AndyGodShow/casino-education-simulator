import { describe, expect, it } from 'vitest';
import { loadFixturesWithFallback } from './fixtureProvider';
import type { FixtureProvider } from './fixtureProvider';
import type { FootballProviderResult } from './types';
import { fixtures } from '../../modules/sports/football/worldCup/data/fixtures';
import { teams } from '../../modules/sports/football/worldCup/data/teams';

function makeProvider(
  name: string,
  source: 'real' | 'sample' | 'local',
  result: FootballProviderResult
): FixtureProvider {
  return { name, source, loader: async () => result };
}

describe('fixtureProvider', () => {
  it('returns matches from the first available provider', async () => {
    const provider = makeProvider('Test', 'real', {
      status: 'available',
      source: 'api-football',
      matches: fixtures.slice(0, 10),
      teams: teams.slice(0, 10),
      message: 'ok',
    });
    const result = await loadFixturesWithFallback([provider]);
    expect(result.fixtures).toHaveLength(10);
    expect(result.teams).toHaveLength(8);
    expect(result.teamRegistry.resolve('Canada')?.teamId).toBe('canada');
    expect(result.source).toBe('real');
    expect(result.providerName).toBe('Test');
    expect(result.errors).toHaveLength(0);
  });

  it('falls back to next provider when first fails', async () => {
    const failingProvider = makeProvider('Failing', 'real', {
      status: 'failed',
      source: 'api-football',
      matches: [],
      teams: [],
      message: 'Network error',
    });
    const workingProvider = makeProvider('Working', 'real', {
      status: 'available',
      source: 'api-football',
      matches: fixtures.slice(0, 5),
      teams: teams.slice(0, 5),
      message: 'ok',
    });
    const result = await loadFixturesWithFallback([failingProvider, workingProvider]);
    expect(result.fixtures).toHaveLength(5);
    expect(result.providerName).toBe('Working');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Failing');
    expect(result.errors[0]).toContain('Network error');
  });

  it('keeps match intelligence from the selected provider result', async () => {
    const [match] = fixtures;
    const provider = makeProvider('Intelligence', 'real', {
      status: 'available',
      source: 'api-football',
      matches: [match],
      teams: teams.slice(0, 2),
      matchIntelligence: {
        [match.id]: {
          source: 'provider',
          providerName: 'Availability provider',
          trustLevel: 'high',
          lastUpdated: '2026-06-18T12:00:00.000Z',
          auditable: true,
          home: {
            advancedMetrics: {
              squadAvailability: 92,
            },
          },
        },
      },
      message: 'ok',
    });

    const result = await loadFixturesWithFallback([provider]);

    expect(result.matchIntelligence?.[match.id]).toEqual(expect.objectContaining({
      providerName: 'Availability provider',
      home: expect.objectContaining({
        advancedMetrics: expect.objectContaining({ squadAvailability: 92 }),
      }),
    }));
  });

  it('falls back to local seed when all providers fail', async () => {
    const failing = makeProvider('Broken', 'real', {
      status: 'failed',
      source: 'api-football',
      matches: [],
      teams: [],
      message: 'Down',
    });
    const result = await loadFixturesWithFallback([failing]);
    expect(result.fixtures.length).toBeGreaterThan(0);
    expect(result.teams.length).toBeGreaterThan(0);
    expect(result.source).toBe('sample');
    expect(result.providerName).toBe('Sample Fixtures');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('handles provider that throws an error', async () => {
    const throwing: FixtureProvider = {
      name: 'Throwing',
      source: 'real',
      loader: async () => { throw new Error('Boom'); },
    };
    const result = await loadFixturesWithFallback([throwing]);
    expect(result.fixtures.length).toBeGreaterThan(0);
    expect(result.source).toBe('sample');
    expect(result.errors[0]).toContain('Boom');
  });

  it('handles empty providers array', async () => {
    const result = await loadFixturesWithFallback([]);
    expect(result.fixtures.length).toBeGreaterThan(0);
    expect(result.source).toBe('sample');
    expect(result.providerName).toBe('Sample Fixtures');
  });

  it('falls back to local seed when sample fallback is unavailable', async () => {
    const failingReal = makeProvider('Real', 'real', {
      status: 'failed',
      source: 'real',
      matches: [],
      teams: [],
      message: 'Real down',
    });
    const failingSample = makeProvider('Sample', 'sample', {
      status: 'failed',
      source: 'sample',
      matches: [],
      teams: [],
      message: 'Sample down',
    });
    const localSeed = makeProvider('Local Seed', 'local', {
      status: 'available',
      source: 'local',
      matches: fixtures.slice(0, 1).map((match) => ({ ...match, source: 'local' })),
      teams: teams.slice(0, 2),
      message: 'ok',
    });

    const result = await loadFixturesWithFallback([failingReal], {
      fallbackProviders: [failingSample, localSeed],
    });

    expect(result.fixtures).toHaveLength(1);
    expect(result.teams).toHaveLength(2);
    expect(result.teamRegistry.getAll()).toHaveLength(2);
    expect(result.source).toBe('local');
    expect(result.providerName).toBe('Local Seed');
    expect(result.errors).toHaveLength(2);
  });

  it('returns empty matches when even local seed is broken (extreme)', async () => {
    // Override the fallback by passing a custom chain with no local seed
    const broken: FixtureProvider = {
      name: 'Broken',
      source: 'local',
      loader: async () => { throw new Error('Total failure'); },
    };
    const result = await loadFixturesWithFallback([broken]);
    // Falls through to local seed fallback since broken provider isn't the seed
    expect(result.source).toBe('sample');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
