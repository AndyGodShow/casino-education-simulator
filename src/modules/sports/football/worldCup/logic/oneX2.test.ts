import { describe, expect, it } from 'vitest';
import { generateScoreDistribution } from './scoreDistribution';
import { compute1X2 } from './oneX2';

describe('oneX2', () => {
  it('derives from score distribution and sums to ≈1', () => {
    const distribution = generateScoreDistribution(1.5, 1.2);
    const result = compute1X2(distribution.matrix);
    expect(result.homeWin + result.draw + result.awayWin).toBeCloseTo(1, 5);
  });

  it('favors stronger home side', () => {
    const distribution = generateScoreDistribution(2.8, 0.6);
    const result = compute1X2(distribution.matrix);
    expect(result.homeWin).toBeGreaterThan(result.awayWin);
    expect(result.homeWin).toBeGreaterThan(0.4);
  });

  it('favors stronger away side', () => {
    const distribution = generateScoreDistribution(0.6, 2.8);
    const result = compute1X2(distribution.matrix);
    expect(result.awayWin).toBeGreaterThan(result.homeWin);
    expect(result.awayWin).toBeGreaterThan(0.4);
  });

  it('draw probability exceeds 20% for equal teams', () => {
    const distribution = generateScoreDistribution(1.5, 1.5);
    const result = compute1X2(distribution.matrix);
    expect(result.draw).toBeGreaterThan(0.2);
  });

  it('all probabilities in valid range', () => {
    const distribution = generateScoreDistribution(1.2, 1.8);
    const result = compute1X2(distribution.matrix);
    expect(result.homeWin).toBeGreaterThanOrEqual(0);
    expect(result.homeWin).toBeLessThanOrEqual(1);
    expect(result.draw).toBeGreaterThanOrEqual(0);
    expect(result.draw).toBeLessThanOrEqual(1);
    expect(result.awayWin).toBeGreaterThanOrEqual(0);
    expect(result.awayWin).toBeLessThanOrEqual(1);
  });
});
