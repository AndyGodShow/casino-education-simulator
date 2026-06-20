import { describe, expect, it } from 'vitest';
import { convertMarketProbabilities } from './marketProbability';

describe('marketProbability', () => {
  it('treats Polymarket prices as probabilities', () => {
    const result = convertMarketProbabilities({
      kind: 'polymarketPrice',
      home: 0.4,
      draw: 0.3,
      away: 0.3,
    });

    expect(result.home).toBeCloseTo(0.4, 5);
    expect(result.draw).toBeCloseTo(0.3, 5);
    expect(result.away).toBeCloseTo(0.3, 5);
  });

  it('normalizes Polymarket prices when they do not sum to 1', () => {
    const result = convertMarketProbabilities({
      kind: 'polymarketPrice',
      home: 0.45,
      draw: 0.35,
      away: 0.25,
    });

    expect(result.home + result.draw + result.away).toBeCloseTo(1, 5);
    expect(result.home).toBeCloseTo(0.45 / 1.05, 5);
  });

  it('converts decimal odds through inverse odds before normalizing', () => {
    const result = convertMarketProbabilities({
      kind: 'decimalOdds',
      home: 2.5,
      draw: 3.2,
      away: 3.0,
    });
    const rawHome = 1 / 2.5;
    const total = rawHome + 1 / 3.2 + 1 / 3.0;

    expect(result.home).toBeCloseTo(rawHome / total, 5);
    expect(result.home + result.draw + result.away).toBeCloseTo(1, 5);
  });

  it('clamps invalid Polymarket prices into probability range', () => {
    const result = convertMarketProbabilities({
      kind: 'polymarketPrice',
      home: 2,
      draw: -1,
      away: Number.NaN,
    });

    expect(result.home).toBe(1);
    expect(result.draw).toBe(0);
    expect(result.away).toBe(0);
  });

  it('rejects invalid decimal odds', () => {
    expect(() => convertMarketProbabilities({
      kind: 'decimalOdds',
      home: 1,
      draw: 3,
      away: 4,
    })).toThrow();
  });
});
