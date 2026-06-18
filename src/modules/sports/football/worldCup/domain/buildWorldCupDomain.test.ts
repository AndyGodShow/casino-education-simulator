import { describe, expect, it } from 'vitest';
import type { WorldCupAdapterResult } from '../../../../../dataProviders/football/worldCupAdapter';
import { buildWorldCupDomain } from './buildWorldCupDomain';

const adapterResult: WorldCupAdapterResult = {
  matches: [
    {
      id: 'deterministic-domain',
      competitionId: 'world-cup-2026',
      stage: 'group',
      group: 'A',
      homeTeamId: 'alpha',
      awayTeamId: 'beta',
      kickoff: '2026-06-18T18:00:00.000Z',
      status: 'scheduled',
      source: 'local',
      lastUpdated: '2026-06-18T10:00:00.000Z',
    },
  ],
  teams: {
    alpha: {
      id: 'alpha',
      name: 'Alpha',
      shortName: 'ALP',
      countryCode: 'AL',
      group: 'A',
      rating: 82,
      attack: 83,
      defense: 80,
      form: 81,
    },
    beta: {
      id: 'beta',
      name: 'Beta',
      shortName: 'BET',
      countryCode: 'BE',
      group: 'A',
      rating: 76,
      attack: 75,
      defense: 77,
      form: 76,
    },
  },
  source: 'local',
  providerName: 'Local',
  errors: [],
  meta: {
    totalMatches: 1,
    statusBreakdown: { scheduled: 1, live: 0, finished: 0 },
  },
};

describe('buildWorldCupDomain', () => {
  it('derives deterministic lastUpdated from adapter matches', () => {
    const first = buildWorldCupDomain(adapterResult);
    const second = buildWorldCupDomain(adapterResult);

    expect(first.lastUpdated).toBe(Date.parse('2026-06-18T10:00:00.000Z'));
    expect(second).toEqual(first);
  });

  it('keeps prediction identities aligned with domain matches and teams', () => {
    const domain = buildWorldCupDomain(adapterResult);
    const [match] = domain.matches;
    const prediction = domain.predictions[match.id];

    expect(prediction.matchId).toBe(match.id);
    expect(domain.teams[match.homeTeamId].id).toBe(match.homeTeamId);
    expect(domain.teams[match.awayTeamId].id).toBe(match.awayTeamId);
    expect(prediction.modelVersion).toBe('v2');
  });
});
