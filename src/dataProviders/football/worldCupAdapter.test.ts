import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWorldCupAdapterResult } from './worldCupAdapter';
import type { FixtureProvider } from './fixtureProvider';
import { fixtures } from '../../modules/sports/football/worldCup/data/fixtures';
import { teams } from '../../modules/sports/football/worldCup/data/teams';

function fakeProvider(matches = fixtures.slice(0, 10), providerTeams = teams.slice(0, 10)): FixtureProvider {
  return {
    name: 'Fake',
    source: 'real',
    loader: async () => ({
      status: 'available',
      source: 'api-football',
      matches,
      teams: providerTeams,
      message: 'ok',
    }),
  };
}

describe('worldCupAdapter', () => {
  it('returns enriched matches from provider', async () => {
    const result = await loadWorldCupAdapterResult([fakeProvider()]);
    expect(result.matches).toHaveLength(10);
    expect(result.source).toBe('real');
    expect(result.providerName).toBe('Fake');
    expect(result.meta.totalMatches).toBe(10);
  });

  it('keeps provider team metadata separate from match normalization', async () => {
    const result = await loadWorldCupAdapterResult([fakeProvider(fixtures.slice(0, 1))]);
    const [match] = result.matches;

    expect(match.homeTeam).toEqual(expect.objectContaining({
      id: match.homeTeamId,
      displayName: 'Canada',
      rawName: match.homeTeamId,
    }));
    expect(result.teams[match.homeTeamId].name).toBe('Canada');
  });

  it('generates teams from stable identities when provider has no teams', async () => {
    const result = await loadWorldCupAdapterResult([fakeProvider(fixtures.slice(0, 1), [])]);
    const [match] = result.matches;

    expect(result.teams[match.homeTeamId]).toEqual(expect.objectContaining({
      id: match.homeTeamId,
      name: 'Canada',
      rating: 76,
    }));
  });

  it('propagates sanitized provider advanced metrics into normalized teams', async () => {
    const result = await loadWorldCupAdapterResult([
      fakeProvider(fixtures.slice(0, 1), [{
        ...teams[0],
        advancedMetrics: {
          elo: 1720,
          recentXgFor: 1.45,
          recentXgAgainst: 1.12,
          squadAvailability: 94,
          restDays: 5,
          travelFatigue: 0.2,
        },
      }]),
    ]);

    expect(result.teams.canada.advancedMetrics).toEqual({
      elo: 1720,
      recentXgFor: 1.45,
      recentXgAgainst: 1.12,
      squadAvailability: 94,
      restDays: 5,
      travelFatigue: 0.2,
    });
  });

  it('attaches provenance to sanitized provider advanced metrics', async () => {
    const result = await loadWorldCupAdapterResult([
      fakeProvider(fixtures.slice(0, 1), [{
        ...teams[0],
        advancedMetrics: {
          elo: 1720,
          recentXgFor: 1.45,
          travelFatigue: 0.2,
        },
      }]),
    ]);

    expect(result.teams.canada.advancedMetricSources).toEqual({
      elo: {
        source: 'provider',
        providerName: 'Fake',
        trustLevel: 'medium',
        caveat: 'Provider-supplied advanced metric; not official unless separately verified.',
      },
      recentXgFor: {
        source: 'provider',
        providerName: 'Fake',
        trustLevel: 'medium',
        caveat: 'Provider-supplied advanced metric; not official unless separately verified.',
      },
      travelFatigue: {
        source: 'provider',
        providerName: 'Fake',
        trustLevel: 'medium',
        caveat: 'Provider-supplied advanced metric; not official unless separately verified.',
      },
    });
  });

  it('drops invalid provider advanced metrics at the adapter boundary', async () => {
    const result = await loadWorldCupAdapterResult([
      fakeProvider(fixtures.slice(0, 1), [{
        ...teams[0],
        advancedMetrics: {
          elo: Number.POSITIVE_INFINITY,
          recentXgFor: -1,
          recentXgAgainst: 7,
          squadAvailability: 101,
          restDays: Number.NaN,
          travelFatigue: 2,
        },
      }]),
    ]);

    expect(result.teams.canada.advancedMetrics).toBeUndefined();
  });

  it('maps provider aliases to stable team ids before domain use', async () => {
    const result = await loadWorldCupAdapterResult([
      fakeProvider([
        {
          id: 'alias-test',
          competitionId: 'world-cup-2026',
          stage: 'group',
          group: 'B',
          homeTeam: 'United States',
          awayTeam: 'Korea Republic',
          kickoff: '2026-06-18T18:00:00.000Z',
          status: 'scheduled',
          source: 'api-football',
          lastUpdated: '',
        },
      ], []),
    ]);

    expect(result.matches[0].homeTeamId).toBe('usa');
    expect(result.matches[0].awayTeamId).toBe('south-korea');
    expect(result.matches[0].homeTeam?.rawName).toBe('usa');
    expect(result.matches[0].awayTeam?.rawName).toBe('south-korea');
    expect(result.teams.usa.name).toBe('United States');
    expect(result.teams['south-korea'].name).toBe('South Korea');
  });

  it('normalizes match source to the selected fallback tier', async () => {
    const result = await loadWorldCupAdapterResult([fakeProvider(fixtures.slice(0, 2))]);

    expect(result.source).toBe('real');
    expect(result.matches.every((match) => match.source === 'real')).toBe(true);
  });

  it('computes status breakdown', async () => {
    const result = await loadWorldCupAdapterResult([fakeProvider()]);
    expect(result.meta.statusBreakdown).toBeDefined();
    expect(typeof result.meta.statusBreakdown.scheduled).toBe('number');
    expect(typeof result.meta.statusBreakdown.live).toBe('number');
    expect(typeof result.meta.statusBreakdown.finished).toBe('number');
    expect(
      result.meta.statusBreakdown.scheduled +
      result.meta.statusBreakdown.live +
      result.meta.statusBreakdown.finished
    ).toBe(result.meta.totalMatches);
  });

  it('enriches each match with status from matchStateEngine', async () => {
    const kickoff = '2026-06-18T18:00:00.000Z';
    const match = { ...fixtures[0], kickoff, status: 'scheduled' as const };
    const result = await loadWorldCupAdapterResult([fakeProvider([match])], {
      now: new Date('2026-06-18T19:00:00.000Z'),
    });

    expect(result.matches[0].status).toBe('live');
  });

  it('preserves provider freshness instead of replacing it with ingestion time', async () => {
    const match = { ...fixtures[0], lastUpdated: '2026-06-01T00:00:00.000Z' };
    const result = await loadWorldCupAdapterResult([fakeProvider([match])], {
      now: new Date('2026-06-18T19:00:00.000Z'),
    });

    expect(result.matches[0].lastUpdated).toBe('2026-06-01T00:00:00.000Z');
  });

  it('does not invent a score when a finished match has no source score', async () => {
    const kickoff = '2026-06-18T18:00:00.000Z';
    const match = { ...fixtures[0], kickoff, status: 'scheduled' as const, homeScore: undefined, awayScore: undefined };
    const result = await loadWorldCupAdapterResult([fakeProvider([match])], {
      now: new Date('2026-06-18T22:00:00.000Z'),
    });

    expect(result.matches[0].status).toBe('finished');
    expect(result.matches[0].homeScore).toBeUndefined();
    expect(result.matches[0].awayScore).toBeUndefined();
  });

  it('preserves source scores for finished matches', async () => {
    const kickoff = '2026-06-18T18:00:00.000Z';
    const match = { ...fixtures[0], kickoff, status: 'scheduled' as const, homeScore: 4, awayScore: 3 };
    const result = await loadWorldCupAdapterResult([fakeProvider([match])], {
      now: new Date('2026-06-18T22:00:00.000Z'),
    });

    expect(result.matches[0]).toEqual(expect.objectContaining({
      status: 'finished',
      homeScore: 4,
      awayScore: 3,
    }));
  });

  it('propagates errors from failed providers', async () => {
    const failing: FixtureProvider = {
      name: 'Failing',
      source: 'real',
      loader: async () => ({ status: 'failed', source: 'api-football', matches: [], teams: [], message: 'Down' }),
    };
    const result = await loadWorldCupAdapterResult([failing]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.source).toBe('sample'); // fell back to local seed
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it('keeps World Cup UI hook on the domain entrypoint instead of fixtures', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/modules/sports/football/worldCup/hooks/useWorldCupDomain.ts'),
      'utf8'
    );

    expect(source).toContain('loadFixturesWithFallback');
    expect(source).toContain('buildWorldCupDomain');
    expect(source).not.toContain("../data/fixtures");
    expect(source).not.toContain('teamsById');
  });
});
