export const LIVE_WINDOW_MS = 150 * 60 * 1000; // 150 minutes = 2.5 hours

export type MatchStatus = 'scheduled' | 'live' | 'finished';

export function computeMatchStatus(kickoff: string, now?: Date): MatchStatus {
  const nowMs = (now ?? new Date()).getTime();
  const kickoffMs = new Date(kickoff).getTime();

  if (!Number.isFinite(kickoffMs)) return 'scheduled';

  const elapsedMs = nowMs - kickoffMs;

  if (elapsedMs < 0) return 'scheduled';
  if (elapsedMs < LIVE_WINDOW_MS) return 'live';
  return 'finished';
}
