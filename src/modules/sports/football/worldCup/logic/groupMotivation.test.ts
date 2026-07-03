import { describe, expect, it } from 'vitest';
import type { WorldCupMatch } from '../types';
import { buildGroupMotivationContext } from './groupMotivation';

const groupMatch = (
  id: string,
  homeTeamId: string,
  awayTeamId: string,
  kickoff: string,
  score?: readonly [number, number],
): WorldCupMatch => ({
  id,
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId,
  awayTeamId,
  kickoff,
  status: score ? 'finished' : 'scheduled',
  homeScore: score?.[0],
  awayScore: score?.[1],
  source: 'openfootball',
  lastUpdated: '2026-06-20T00:00:00.000Z',
});

describe('groupMotivation', () => {
  it('treats opening group matches as balanced motivation', () => {
    const current = groupMatch('m1', 'alpha', 'beta', '2026-06-18T18:00:00.000Z');
    const context = buildGroupMotivationContext(current, [
      current,
      groupMatch('m2', 'gamma', 'delta', '2026-06-18T20:00:00.000Z'),
    ]);

    expect(context?.home.pressure).toBe('opening_balance');
    expect(context?.away.urgency).toBe(0.45);
  });

  it('marks one-point final group matches as must-win pressure', () => {
    const current = groupMatch('m5', 'alpha', 'beta', '2026-06-26T18:00:00.000Z');
    const context = buildGroupMotivationContext(current, [
      groupMatch('m1', 'alpha', 'gamma', '2026-06-18T18:00:00.000Z', [0, 1]),
      groupMatch('m2', 'beta', 'delta', '2026-06-18T20:00:00.000Z', [2, 0]),
      groupMatch('m3', 'alpha', 'delta', '2026-06-22T18:00:00.000Z', [1, 1]),
      groupMatch('m4', 'beta', 'gamma', '2026-06-22T20:00:00.000Z', [1, 0]),
      current,
      groupMatch('m6', 'gamma', 'delta', '2026-06-26T20:00:00.000Z'),
    ]);

    expect(context?.home).toMatchObject({
      points: 1,
      played: 2,
      matchesRemaining: 1,
      pressure: 'must_win',
      urgency: 0.95,
    });
    expect(context?.away.pressure).toBe('protect_top_spot');
  });

  it('does not create group motivation for knockout matches', () => {
    const knockout: WorldCupMatch = {
      ...groupMatch('r32', 'alpha', 'beta', '2026-06-29T18:00:00.000Z'),
      stage: 'round32',
      group: undefined,
    };

    expect(buildGroupMotivationContext(knockout, [knockout])).toBeUndefined();
  });
});
