import type { WorldCupMatch } from '../types';

const compact = (value: string) => value.trim().toLowerCase();

export function isUnresolvedTeamPlaceholder(teamId: string | undefined): boolean {
  if (!teamId) return true;
  const normalized = compact(teamId);

  return (
    /^\d+[a-l]$/.test(normalized) ||
    /^\d+[a-l](?:-\d*[a-l])+$/.test(normalized) ||
    /^[wl]\d+$/.test(normalized) ||
    /^(winner|loser|runner-up|runnerup|third-place|match)-?/.test(normalized)
  );
}

export function hasUnresolvedTeamPlaceholder(match: WorldCupMatch): boolean {
  return isUnresolvedTeamPlaceholder(match.homeTeamId) || isUnresolvedTeamPlaceholder(match.awayTeamId);
}
