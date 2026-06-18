import { describe, expect, it } from 'vitest';
import { buildDecisionLayer } from './predictionDecisionLayer';

describe('predictionDecisionLayer', () => {
  it('produces complete decision result', () => {
    const result = buildDecisionLayer(1.5, 1.2);
    expect(result.expectedGoals.home).toBe(1.5);
    expect(result.expectedGoals.away).toBe(1.2);
    expect(result.scoreDistribution.length).toBeGreaterThan(0);
    expect(result.oneX2.homeWin + result.oneX2.draw + result.oneX2.awayWin).toBeCloseTo(1, 5);
    expect(result.mostLikelyScore.home).toBeGreaterThanOrEqual(0);
    expect(result.mostLikelyScore.away).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('is deterministic', () => {
    const a = buildDecisionLayer(1.5, 1.2);
    const b = buildDecisionLayer(1.5, 1.2);
    expect(a).toEqual(b);
  });

  it('1X2 derived strictly from score distribution', () => {
    const result = buildDecisionLayer(1.8, 1.0);
    let computedHome = 0;
    let computedDraw = 0;
    let computedAway = 0;
    for (const entry of result.scoreDistribution) {
      if (entry.home > entry.away) computedHome += entry.probability;
      else if (entry.home === entry.away) computedDraw += entry.probability;
      else computedAway += entry.probability;
    }
    expect(computedHome).toBeCloseTo(result.oneX2.homeWin, 5);
    expect(computedDraw).toBeCloseTo(result.oneX2.draw, 5);
    expect(computedAway).toBeCloseTo(result.oneX2.awayWin, 5);
  });

  it('score distribution sums to ≈1', () => {
    const result = buildDecisionLayer(2.0, 0.8);
    const sum = result.scoreDistribution.reduce((acc, e) => acc + e.probability, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('higher confidence for imbalanced teams', () => {
    const closeTeams = buildDecisionLayer(1.5, 1.4);
    const farTeams = buildDecisionLayer(3.0, 0.5);
    expect(farTeams.confidence).toBeGreaterThan(closeTeams.confidence);
  });
});
