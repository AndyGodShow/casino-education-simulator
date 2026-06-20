import type { BetSelection, WorldCupMatch } from '../types';

export const outcomeFromScore = (homeScore: number, awayScore: number): BetSelection => {
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
};

export const actualOutcomeFromMatch = (match: WorldCupMatch): BetSelection | null => {
  if (match.status !== 'finished') return null;
  if (typeof match.homeScore !== 'number' || typeof match.awayScore !== 'number') return null;
  return outcomeFromScore(match.homeScore, match.awayScore);
};
