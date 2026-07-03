import { describe, expect, it } from 'vitest';
import type { InternationalResult } from './internationalResults';
import {
  buildCausalRatingTimeline,
  buildCausalTeamRatings,
} from './causalTeamRatings';

const result = (
  id: string,
  date: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  neutral = true,
): InternationalResult => ({
  id,
  date,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  tournament: 'FIFA World Cup',
  city: 'Test City',
  country: 'Test Country',
  neutral,
  source: 'martj42-international-results',
  retrievedAt: '2026-07-02T12:00:00.000Z',
});

describe('causal team ratings', () => {
  it('uses only matches before the evaluation time', () => {
    const past = result('past', '2026-06-01', 'Alpha', 'Beta', 2, 0);
    const future = result('future', '2026-07-03', 'Alpha', 'Beta', 0, 5);
    const evaluationTime = Date.parse('2026-07-02T12:00:00.000Z');

    const withoutFuture = buildCausalTeamRatings([past], evaluationTime);
    const withFuture = buildCausalTeamRatings([future, past], evaluationTime);

    expect(withFuture).toEqual(withoutFuture);
    expect(withFuture.Alpha?.matches).toBe(1);
    expect(withFuture.Alpha?.elo).toBeGreaterThan(1500);
    expect(withFuture.Beta?.elo).toBeLessThan(1500);
  });

  it('captures pre-match ratings before applying each result', () => {
    const matches = [
      result('one', '2026-05-01', 'Alpha', 'Beta', 1, 0),
      result('two', '2026-06-01', 'Alpha', 'Beta', 1, 0),
    ];
    const timeline = buildCausalRatingTimeline(matches);

    expect(timeline[0]?.home.elo).toBe(1500);
    expect(timeline[0]?.away.elo).toBe(1500);
    expect(timeline[1]?.home.elo).toBeGreaterThan(timeline[0]?.home.elo ?? 0);
    expect(timeline[1]?.away.elo).toBeLessThan(timeline[0]?.away.elo ?? 0);
  });

  it('accounts for home advantage instead of treating every venue as neutral', () => {
    const neutral = buildCausalTeamRatings([
      result('neutral', '2026-06-01', 'Alpha', 'Beta', 1, 0, true),
    ], Date.parse('2026-07-02T12:00:00.000Z'));
    const home = buildCausalTeamRatings([
      result('home', '2026-06-01', 'Alpha', 'Beta', 1, 0, false),
    ], Date.parse('2026-07-02T12:00:00.000Z'));

    expect(neutral.Alpha?.elo).toBeGreaterThan(home.Alpha?.elo ?? 0);
  });

  it('decays stale form and goal evidence toward explicit priors', () => {
    const recent = buildCausalTeamRatings([
      result('recent', '2026-06-25', 'Alpha', 'Beta', 4, 0),
    ], Date.parse('2026-07-02T12:00:00.000Z'));
    const stale = buildCausalTeamRatings([
      result('stale', '2024-01-01', 'Alpha', 'Beta', 4, 0),
    ], Date.parse('2026-07-02T12:00:00.000Z'));

    expect(recent.Alpha?.form).toBeGreaterThan(stale.Alpha?.form ?? 0);
    expect(recent.Alpha?.attack).toBeGreaterThan(stale.Alpha?.attack ?? 0);
    expect(stale.Alpha?.evidenceWeight).toBeLessThan(recent.Alpha?.evidenceWeight ?? 0);
  });

  it('is deterministic regardless of input ordering', () => {
    const one = result('one', '2026-05-01', 'Alpha', 'Beta', 2, 1);
    const two = result('two', '2026-06-01', 'Beta', 'Alpha', 0, 0);
    const evaluationTime = Date.parse('2026-07-02T12:00:00.000Z');

    expect(buildCausalTeamRatings([one, two], evaluationTime))
      .toEqual(buildCausalTeamRatings([two, one], evaluationTime));
  });
});
