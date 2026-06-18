import { describe, expect, it } from 'vitest';
import {
  assertValidThreeWay,
  createUnifiedProbability,
  mergeModelAndMarket,
  normalizeThreeWay,
  unifiedProbabilityFromPrediction,
} from './unifiedProbability';

describe('unified probability', () => {
  it('normalizes to sum of one with no NaN values', () => {
    const probability = normalizeThreeWay({ home: 2, draw: Number.NaN, away: 1 });
    expect(probability.home + probability.draw + probability.away).toBeCloseTo(1, 6);
    expect(Object.values(probability).some(Number.isNaN)).toBe(false);
    expect(assertValidThreeWay(probability)).toBe(true);
  });

  it('merges model and market using bounded market confidence', () => {
    const merged = mergeModelAndMarket(
      { home: 0.5, draw: 0.25, away: 0.25 },
      { home: 0.2, draw: 0.3, away: 0.5 },
      1,
    );
    expect(merged.home).toBeLessThan(0.5);
    expect(merged.away).toBeGreaterThan(0.25);
    expect(assertValidThreeWay(merged)).toBe(true);
  });

  it('creates a unified model market ensemble structure', () => {
    const unified = createUnifiedProbability({
      matchId: 'a-1',
      model: { home: 45, draw: 25, away: 30 },
      market: { home: 0.4, draw: 0.28, away: 0.32 },
      marketConfidence: 0.6,
    });
    expect(unified.model.source).toBe('model');
    expect(unified.market?.source).toBe('polymarket');
    expect(unified.merged?.source).toBe('ensemble');
    expect(assertValidThreeWay(unified.model)).toBe(true);
    expect(assertValidThreeWay(unified.market!)).toBe(true);
    expect(assertValidThreeWay(unified.merged!)).toBe(true);
  });

  it('adapts Prediction V2 probability shape', () => {
    const unified = unifiedProbabilityFromPrediction({
      matchId: 'v2',
      probabilities: {
        homeWin: 0.5,
        draw: 0.25,
        awayWin: 0.25,
      },
    });

    expect(unified.matchId).toBe('v2');
    expect(unified.model.home).toBeCloseTo(0.5, 6);
    expect(unified.model.draw).toBeCloseTo(0.25, 6);
    expect(unified.model.away).toBeCloseTo(0.25, 6);
  });
});
