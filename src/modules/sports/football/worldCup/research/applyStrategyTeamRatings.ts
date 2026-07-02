import type {
  WorldCupStrategyRatingInputAudit,
  WorldCupStrategyResearchState,
  WorldCupStrategyTeamRating,
} from '../domain/WorldCupDomainModel';
import type { AdvancedMetricProvenance, WorldCupTeam } from '../types';
import { strategyTeamId } from './strategyTeamIdentity';

const trustRank: Record<AdvancedMetricProvenance['trustLevel'], number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const ratingForTeam = (
  team: WorldCupTeam,
  ratings: Record<string, WorldCupStrategyTeamRating>,
) => ratings[team.id] ?? ratings[strategyTeamId(team.name)];

const canReplaceElo = (
  team: WorldCupTeam,
  rating: WorldCupStrategyTeamRating,
) => {
  if (typeof team.advancedMetrics?.elo !== 'number') return true;
  const existing = team.advancedMetricSources?.elo;
  return !existing || trustRank[existing.trustLevel] < trustRank[rating.trustLevel];
};

const audit = (
  status: WorldCupStrategyRatingInputAudit['status'],
  ratings: Record<string, WorldCupStrategyTeamRating>,
  overrides: Partial<WorldCupStrategyRatingInputAudit> = {},
): WorldCupStrategyRatingInputAudit => ({
  status,
  availableRatings: Object.keys(ratings).length,
  matchedTeams: 0,
  appliedTeams: 0,
  unmatchedTeamIds: [],
  preservedHigherTrustTeams: [],
  ...overrides,
});

export function applyStrategyTeamRatings<T extends { teams: Record<string, WorldCupTeam> }>(
  adapterResult: T,
  strategyResearch: WorldCupStrategyResearchState,
) {
  const ratings = strategyResearch.teamRatings ?? {};
  if (strategyResearch.status !== 'applied') {
    return {
      adapterResult,
      strategyResearch: {
        ...strategyResearch,
        ratingInputAudit: audit(
          strategyResearch.status === 'unavailable' ? 'unavailable' : 'baseline',
          ratings,
        ),
      },
    };
  }

  const unmatchedTeamIds: string[] = [];
  const preservedHigherTrustTeams: string[] = [];
  let matchedTeams = 0;
  let appliedTeams = 0;

  const teams = Object.fromEntries(
    Object.entries(adapterResult.teams).map(([teamId, team]) => {
      const rating = ratingForTeam(team, ratings);
      if (!rating) {
        unmatchedTeamIds.push(teamId);
        return [teamId, team];
      }
      matchedTeams += 1;
      if (!canReplaceElo(team, rating)) {
        preservedHigherTrustTeams.push(teamId);
        return [teamId, team];
      }

      appliedTeams += 1;
      return [teamId, {
        ...team,
        advancedMetrics: {
          ...team.advancedMetrics,
          elo: rating.elo,
        },
        advancedMetricSources: {
          ...team.advancedMetricSources,
          elo: {
            source: 'provider' as const,
            providerName: 'martj42 international results',
            lastUpdated: `${rating.lastMatchDate}T00:00:00.000Z`,
            trustLevel: rating.trustLevel,
            caveat: `Time-causal Elo from ${rating.matches} historical matches; this is not an official live rating or current-squad assessment.`,
          },
        },
      }];
    }),
  );

  return {
    adapterResult: appliedTeams > 0 ? { ...adapterResult, teams } as T : adapterResult,
    strategyResearch: {
      ...strategyResearch,
      ratingInputAudit: audit('applied', ratings, {
        matchedTeams,
        appliedTeams,
        unmatchedTeamIds: unmatchedTeamIds.sort(),
        preservedHigherTrustTeams: preservedHigherTrustTeams.sort(),
      }),
    },
  };
}
