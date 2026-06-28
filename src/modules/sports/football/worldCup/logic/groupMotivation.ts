import type { WorldCupMatch } from '../types';
import { calculateGroupStandings, rankGroupTeams, type GroupStanding } from './groupSimulation';

export type TeamMotivationState = {
  teamId: string;
  points: number;
  rank: number;
  played: number;
  matchesRemaining: number;
  pressure:
    | 'opening_balance'
    | 'protect_top_spot'
    | 'qualification_race'
    | 'chase_third_place'
    | 'must_win'
    | 'settled'
    | 'unknown';
  urgency: number;
};

export type GroupMotivationContext = {
  source: string;
  home: TeamMotivationState;
  away: TeamMotivationState;
};

const emptyStanding = (teamId: string): GroupStanding => ({
  teamId,
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  points: 0,
});

const hasScore = (match: WorldCupMatch) =>
  match.status === 'finished'
  && typeof match.homeScore === 'number'
  && typeof match.awayScore === 'number';

const plays = (match: WorldCupMatch, teamId: string) =>
  match.homeTeamId === teamId || match.awayTeamId === teamId;

const kickoffTime = (match: WorldCupMatch) => {
  const parsed = Date.parse(match.kickoff);
  return Number.isFinite(parsed) ? parsed : 0;
};

const classifyPressure = (
  standing: GroupStanding,
  rank: number,
  matchesRemaining: number,
): Pick<TeamMotivationState, 'pressure' | 'urgency'> => {
  if (standing.played === 0) return { pressure: 'opening_balance', urgency: 0.45 };
  if (matchesRemaining <= 0) return { pressure: 'settled', urgency: 0.2 };
  if (matchesRemaining === 1 && standing.points <= 1) return { pressure: 'must_win', urgency: 0.95 };
  if (rank === 1) return { pressure: 'protect_top_spot', urgency: 0.68 };
  if (rank <= 3) return { pressure: 'qualification_race', urgency: 0.78 };
  return { pressure: 'chase_third_place', urgency: 0.86 };
};

export function buildGroupMotivationContext(
  match: WorldCupMatch,
  matches: WorldCupMatch[],
): GroupMotivationContext | undefined {
  if (match.stage !== 'group' || !match.group) return undefined;

  const currentKickoff = kickoffTime(match);
  const groupMatches = matches.filter((item) => item.group === match.group && item.stage === 'group');
  const teamIds = Array.from(new Set(groupMatches.flatMap((item) => [item.homeTeamId, item.awayTeamId])));
  const completedBeforeMatch = groupMatches.filter((item) => (
    item.id !== match.id
    && hasScore(item)
    && kickoffTime(item) < currentKickoff
  ));
  const standingsById = new Map(calculateGroupStandings(completedBeforeMatch).map((standing) => [standing.teamId, standing]));
  const ranked = rankGroupTeams(teamIds.map((teamId) => standingsById.get(teamId) ?? emptyStanding(teamId)));
  const rankedIndex = new Map(ranked.map((standing, index) => [standing.teamId, index + 1]));

  const teamState = (teamId: string): TeamMotivationState => {
    const standing = standingsById.get(teamId) ?? emptyStanding(teamId);
    const matchesRemaining = groupMatches.filter((item) => (
      item.id !== match.id
      && plays(item, teamId)
      && !hasScore(item)
      && kickoffTime(item) > currentKickoff
    )).length + 1;
    const rank = rankedIndex.get(teamId) ?? teamIds.length;
    const pressure = classifyPressure(standing, rank, matchesRemaining);

    return {
      teamId,
      points: standing.points,
      rank,
      played: standing.played,
      matchesRemaining,
      ...pressure,
    };
  };

  return {
    source: 'group standings before kickoff',
    home: teamState(match.homeTeamId),
    away: teamState(match.awayTeamId),
  };
}
