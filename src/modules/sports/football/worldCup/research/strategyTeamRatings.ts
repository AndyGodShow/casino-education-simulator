import {
  createWorldCupTeamIdentityRegistry,
  generateStableId,
} from '../../../../../dataProviders/football/identity/teamIdentitySystem';
import type { WorldCupStrategyTeamRating } from '../domain/WorldCupDomainModel';
import type { CausalTeamRating } from './causalTeamRatings';

export const MAX_PUBLIC_STRATEGY_TEAM_RATINGS = 256;

const validRating = (rating: CausalTeamRating) => (
  rating.matches > 0
  && rating.evidenceWeight > 0
  && Number.isFinite(rating.elo)
  && Number.isFinite(Date.parse(rating.asOf))
  && typeof rating.lastMatchDate === 'string'
  && Number.isFinite(Date.parse(`${rating.lastMatchDate}T00:00:00.000Z`))
);

const preferredRating = (
  left: WorldCupStrategyTeamRating,
  right: WorldCupStrategyTeamRating,
) => (
  right.lastMatchDate.localeCompare(left.lastMatchDate)
  || right.evidenceWeight - left.evidenceWeight
  || right.matches - left.matches
  || left.teamName.localeCompare(right.teamName)
) < 0 ? left : right;

const ranking = (
  left: WorldCupStrategyTeamRating,
  right: WorldCupStrategyTeamRating,
) => (
  right.lastMatchDate.localeCompare(left.lastMatchDate)
  || right.evidenceWeight - left.evidenceWeight
  || right.matches - left.matches
  || left.teamId.localeCompare(right.teamId)
);

export function projectStrategyTeamRatings(
  ratings: Record<string, CausalTeamRating>,
): Record<string, WorldCupStrategyTeamRating> {
  const identityRegistry = createWorldCupTeamIdentityRegistry();
  const byTeamId = new Map<string, WorldCupStrategyTeamRating>();

  for (const rating of Object.values(ratings)) {
    if (!validRating(rating)) continue;
    const teamId = identityRegistry.resolve(rating.team)?.teamId ?? generateStableId(rating.team);
    if (!teamId) continue;

    const projected: WorldCupStrategyTeamRating = {
      teamId,
      teamName: rating.team,
      asOf: rating.asOf,
      matches: rating.matches,
      elo: rating.elo,
      evidenceWeight: rating.evidenceWeight,
      lastMatchDate: rating.lastMatchDate as string,
      trustLevel: rating.provenance.trustLevel,
    };
    const existing = byTeamId.get(teamId);
    byTeamId.set(teamId, existing ? preferredRating(existing, projected) : projected);
  }

  return Object.fromEntries(
    [...byTeamId.values()]
      .sort(ranking)
      .slice(0, MAX_PUBLIC_STRATEGY_TEAM_RATINGS)
      .sort((left, right) => left.teamId.localeCompare(right.teamId))
      .map((rating) => [rating.teamId, rating]),
  );
}
