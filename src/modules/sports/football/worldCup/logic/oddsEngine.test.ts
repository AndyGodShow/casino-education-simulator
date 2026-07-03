import { describe, expect, it } from 'vitest';
import {
  calculateExpectedValue,
  calculateModelMarketDeviation,
  calculateNoVigProbabilities,
  calculateOverround,
  decimalOddsToImpliedProbability,
  impliedProbabilityToFairOdds,
} from './oddsEngine';

describe('oddsEngine', () => {
  it('converts decimal odds and fair odds', () => {
    expect(decimalOddsToImpliedProbability(2)).toBe(0.5);
    expect(impliedProbabilityToFairOdds(0.25)).toBe(4);
  });

  it('calculates overround and no-vig probabilities', () => {
    const odds = { home: 1.8, draw: 3.5, away: 4.5 };
    expect(calculateOverround(odds)).toBeCloseTo(0.0635, 3);
    const noVig = calculateNoVigProbabilities(odds);
    expect(noVig.home + noVig.draw + noVig.away).toBeCloseTo(1, 6);
  });

  it('calculates expected value', () => {
    expect(calculateExpectedValue(0.6, 2)).toBeCloseTo(0.2);
  });

  it('calculates model market deviation with confidence correction', () => {
    const deviation = calculateModelMarketDeviation({
      model: { home: 0.55, draw: 0.25, away: 0.2 },
      market: { home: 0.42, draw: 0.3, away: 0.28 },
      odds: { home: 2, draw: 3.3, away: 4 },
      marketConfidence: 0.8,
    });
    expect(deviation.deviationScore).toBeGreaterThan(0);
    expect(deviation.marketCorrectionFactor).toBeGreaterThan(0);
    expect(Number.isNaN(deviation.adjustedExpectedValue.home)).toBe(false);
  });

  it('defends against invalid odds and probabilities', () => {
    expect(() => decimalOddsToImpliedProbability(1)).toThrow();
    expect(() => decimalOddsToImpliedProbability(Number.NaN)).toThrow();
    expect(() => impliedProbabilityToFairOdds(0)).toThrow();
    expect(() => impliedProbabilityToFairOdds(1)).toThrow();
    expect(() => calculateExpectedValue(0.5, 1)).toThrow();
    expect(() => calculateNoVigProbabilities({ home: 0, draw: 3, away: 4 })).toThrow();
    expect(() => calculateNoVigProbabilities({} as never)).toThrow();
  });
});
