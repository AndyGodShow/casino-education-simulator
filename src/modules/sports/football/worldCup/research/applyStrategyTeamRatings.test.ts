import { describe, expect, it } from 'vitest';
import type { WorldCupAdapterResult } from '../../../../../dataProviders/football/worldCupAdapter';
import type {
  WorldCupStrategyResearchState,
  WorldCupStrategyTeamRating,
} from '../domain/WorldCupDomainModel';
import { applyStrategyTeamRatings } from './applyStrategyTeamRatings';

const teamRating = (
  teamId: string,
  overrides: Partial<WorldCupStrategyTeamRating> = {},
): WorldCupStrategyTeamRating => ({
  teamId,
  teamName: teamId,
  asOf: '2026-07-02T12:00:00.000Z',
  matches: 30,
  elo: 1_700,
  evidenceWeight: 4,
  lastMatchDate: '2026-06-20',
  trustLevel: 'medium',
  ...overrides,
});

const adapterResult: WorldCupAdapterResult = {
  matches: [],
  teams: {
    spain: {
      id: 'spain',
      name: 'Spain',
      shortName: 'ESP',
      countryCode: 'ES',
      group: 'A',
      rating: 90,
      attack: 88,
      defense: 88,
      form: 85,
    },
    usa: {
      id: 'usa',
      name: 'United States',
      shortName: 'USA',
      countryCode: 'US',
      group: 'B',
      rating: 81,
      attack: 79,
      defense: 80,
      form: 74,
      advancedMetrics: { elo: 1_820 },
      advancedMetricSources: {
        elo: {
          source: 'official',
          providerName: 'Official',
          trustLevel: 'high',
          lastUpdated: '2026-07-02T11:00:00.000Z',
        },
      },
    },
    unknown: {
      id: 'unknown',
      name: 'Unknown',
      shortName: 'UNK',
      countryCode: 'UN',
      group: 'C',
      rating: 75,
      attack: 75,
      defense: 75,
      form: 75,
    },
  },
  source: 'openfootball',
  providerName: 'OpenFootball',
  errors: [],
  meta: {
    totalMatches: 0,
    statusBreakdown: { scheduled: 0, live: 0, finished: 0 },
  },
};

const research = (
  status: WorldCupStrategyResearchState['status'],
): WorldCupStrategyResearchState => ({
  status,
  generatedAt: '2026-07-02T12:00:00.000Z',
  acceptedRows: 49_000,
  candidateId: status === 'applied' ? 'assertive-320' : 'baseline-v2',
  validationSampleSize: 60,
  holdoutSampleSize: 60,
  holdoutContexts: 5,
  brierImprovement: status === 'applied' ? 0.037 : 0,
  message: 'research',
  teamRatings: {
    spain: teamRating('spain', { elo: 1_930 }),
    usa: teamRating('usa', { elo: 1_760 }),
  },
});

describe('applyStrategyTeamRatings', () => {
  it('applies gated Elo inputs and preserves stronger explicit evidence', () => {
    const result = applyStrategyTeamRatings(adapterResult, research('applied'));

    expect(result.adapterResult.teams.spain.advancedMetrics?.elo).toBe(1_930);
    expect(result.adapterResult.teams.spain.advancedMetricSources?.elo).toMatchObject({
      source: 'provider',
      providerName: 'martj42 international results',
      trustLevel: 'medium',
    });
    expect(result.adapterResult.teams.usa.advancedMetrics?.elo).toBe(1_820);
    expect(result.strategyResearch.ratingInputAudit).toEqual({
      status: 'applied',
      availableRatings: 2,
      matchedTeams: 2,
      appliedTeams: 1,
      unmatchedTeamIds: ['unknown'],
      preservedHigherTrustTeams: ['usa'],
    });
  });

  it('keeps the baseline untouched when the research gate did not pass', () => {
    const result = applyStrategyTeamRatings(adapterResult, research('rejected'));

    expect(result.adapterResult).toBe(adapterResult);
    expect(result.strategyResearch.ratingInputAudit).toMatchObject({
      status: 'baseline',
      appliedTeams: 0,
    });
  });

  it('marks unavailable research without inventing an input', () => {
    const unavailable = {
      ...research('unavailable'),
      teamRatings: undefined,
    };
    const result = applyStrategyTeamRatings(adapterResult, unavailable);

    expect(result.adapterResult).toBe(adapterResult);
    expect(result.strategyResearch.ratingInputAudit).toMatchObject({
      status: 'unavailable',
      availableRatings: 0,
      appliedTeams: 0,
    });
  });
});
