import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWorldCupAdapterResult } from './worldCupAdapter';
import type { FixtureProvider, FixtureProviderResult } from './fixtureProvider';
import { fixtures } from '../../modules/sports/football/worldCup/data/fixtures';
import { teams } from '../../modules/sports/football/worldCup/data/teams';

function fakeProvider(
  matches: FixtureProviderResult['fixtures'] = fixtures.slice(0, 10),
  providerTeams: FixtureProviderResult['teams'] = teams.slice(0, 10),
): FixtureProvider {
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

  it('carries provider match intelligence feeds for domain enrichment', async () => {
    const [match] = fixtures;
    const result = await loadWorldCupAdapterResult([
      {
        name: 'Intelligence Provider',
        source: 'api-football',
        loader: async () => ({
          status: 'available',
          source: 'api-football',
          matches: [match],
          teams: teams.slice(0, 2),
          matchIntelligence: {
            [match.id]: {
              source: 'provider',
              providerName: 'Lineup + travel feed',
              trustLevel: 'high',
              lastUpdated: '2026-06-18T12:00:00.000Z',
              auditable: true,
              home: {
                advancedMetrics: {
                  squadAvailability: 93,
                  restDays: 6,
                  travelFatigue: 0.08,
                },
              },
            },
          },
          message: 'ok',
        }),
      },
    ]);

    expect(result.matchIntelligence?.[match.id]).toEqual(expect.objectContaining({
      providerName: 'Lineup + travel feed',
      auditable: true,
      home: expect.objectContaining({
        advancedMetrics: expect.objectContaining({
          squadAvailability: 93,
          restDays: 6,
          travelFatigue: 0.08,
        }),
      }),
    }));
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

  it('uses provider quality profiles when defaulting advanced metric provenance', async () => {
    const result = await loadWorldCupAdapterResult([
      {
        name: 'OpenFootball fixture file',
        source: 'openfootball',
        loader: async () => ({
          status: 'available',
          source: 'openfootball',
          matches: fixtures.slice(0, 1),
          teams: [{
            ...teams[0],
            advancedMetrics: {
              elo: 1705,
              squadAvailability: 91,
            },
          }],
          message: 'ok',
        }),
      },
    ]);

    expect(result.teams.canada.advancedMetricSources).toEqual({
      elo: {
        source: 'provider',
        providerName: 'OpenFootball fixture file',
        trustLevel: 'low',
        caveat: 'Provider profile has no reliable advanced metric coverage; metric requires independent verification.',
      },
      squadAvailability: {
        source: 'provider',
        providerName: 'OpenFootball fixture file',
        trustLevel: 'low',
        caveat: 'Provider profile has no reliable advanced metric coverage; metric requires independent verification.',
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

  it('classifies knockout stages before matching the generic final token', async () => {
    const result = await loadWorldCupAdapterResult([
      fakeProvider([
        {
          id: 'quarter-final',
          competitionId: 'world-cup-2026',
          homeTeam: 'France',
          awayTeam: 'Brazil',
          kickoff: '2026-07-09T20:00:00.000Z',
          round: 'Quarter-final',
          source: 'openfootball',
          lastUpdated: '2026-06-21T00:00:00.000Z',
        },
        {
          id: 'semi-final',
          competitionId: 'world-cup-2026',
          homeTeam: 'Argentina',
          awayTeam: 'Spain',
          kickoff: '2026-07-14T20:00:00.000Z',
          round: 'Semi-final',
          source: 'openfootball',
          lastUpdated: '2026-06-21T00:00:00.000Z',
        },
      ], []),
    ]);

    expect(result.matches.map((match) => match.stage)).toEqual(['quarter', 'semi']);
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

  it('derives current form, attack, and defense from completed provider results', async () => {
    const result = await loadWorldCupAdapterResult([
      fakeProvider([
        {
          ...fixtures[0],
          id: 'completed-result',
          homeTeamId: 'canada',
          awayTeamId: 'mexico',
          kickoff: '2026-06-20T18:00:00.000Z',
          homeScore: 3,
          awayScore: 0,
          lastUpdated: '2026-07-02T05:00:00.000Z',
        },
        {
          ...fixtures[0],
          id: 'upcoming-match',
          homeTeamId: 'canada',
          awayTeamId: 'mexico',
          kickoff: '2026-07-03T18:00:00.000Z',
          homeScore: undefined,
          awayScore: undefined,
          lastUpdated: '2026-07-02T06:00:00.000Z',
        },
      ], [teams[0], teams[1]]),
    ], {
      now: new Date('2026-07-02T06:30:00.000Z'),
    });

    expect(result.teams.canada).toEqual(expect.objectContaining({
      form: expect.any(Number),
      attack: expect.any(Number),
      defense: expect.any(Number),
    }));
    expect(result.teams.canada.form).toBeGreaterThan(teams[0].form);
    expect(result.teams.canada.attack).toBeGreaterThan(teams[0].attack);
    expect(result.teams.canada.defense).toBeGreaterThan(teams[0].defense);
    expect(result.teams.canada.coreMetricSources).toEqual(expect.objectContaining({
      form: expect.objectContaining({
        source: 'provider',
        providerName: 'Fake',
        lastUpdated: '2026-07-02T05:00:00.000Z',
      }),
      attack: expect.objectContaining({
        caveat: expect.stringContaining('completed score'),
      }),
    }));
  });

  it('does not use provider scores whose kickoff is after the evaluation time', async () => {
    const result = await loadWorldCupAdapterResult([
      fakeProvider([
        {
          ...fixtures[0],
          id: 'future-result',
          homeTeamId: 'canada',
          awayTeamId: 'mexico',
          kickoff: '2026-08-01T18:00:00.000Z',
          homeScore: 8,
          awayScore: 0,
          lastUpdated: '2026-08-01T20:00:00.000Z',
        },
      ], [teams[0], teams[1]]),
    ], {
      now: new Date('2026-07-02T06:30:00.000Z'),
    });

    expect(result.teams.canada.attack).toBe(teams[0].attack);
    expect(result.teams.canada.form).toBe(teams[0].form);
    expect(result.teams.canada.coreMetricSources?.attack?.source).toBe('seed');
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

  it('treats a provider final score as authoritative even before the local status window closes', async () => {
    const kickoff = '2026-06-18T18:00:00.000Z';
    const match = { ...fixtures[0], kickoff, status: 'scheduled' as const, homeScore: 2, awayScore: 1 };
    const result = await loadWorldCupAdapterResult([fakeProvider([match])], {
      now: new Date('2026-06-18T19:00:00.000Z'),
    });

    expect(result.matches[0]).toEqual(expect.objectContaining({
      status: 'finished',
      homeScore: 2,
      awayScore: 1,
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

  it('keeps World Cup refresh orchestration on the domain entrypoint instead of fixtures', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/modules/sports/football/worldCup/hooks/worldCupDomainRefresh.ts'),
      'utf8'
    );

    expect(source).toContain('loadFixturesWithFallback');
    expect(source).toContain('buildWorldCupDomain');
    expect(source).not.toContain("../data/fixtures");
    expect(source).not.toContain('teamsById');
  });
});
