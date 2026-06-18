import { describe, expect, it } from 'vitest';
import { generateScoreDistribution } from './scoreDistribution';

describe('scoreDistribution', () => {
  it('generates adaptive range based on lambda', () => {
    const lowLambda = generateScoreDistribution(0.5, 0.3);
    const highLambda = generateScoreDistribution(3.5, 2.8);
    expect(highLambda.matrix.length).toBeGreaterThan(lowLambda.matrix.length);
    expect(lowLambda.matrix.length).toBeGreaterThan(0);
  });

  it('sums matrix probabilities to ≈1', () => {
    const result = generateScoreDistribution(1.5, 1.2);
    const sum = result.matrix.reduce((acc, e) => acc + e.probability, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('is deterministic for same input', () => {
    const a = generateScoreDistribution(1.5, 1.2);
    const b = generateScoreDistribution(1.5, 1.2);
    expect(a).toEqual(b);
  });

  it('stable for different inputs', () => {
    const a = generateScoreDistribution(0.5, 0.3);
    const b = generateScoreDistribution(3.2, 2.8);
    expect(a.matrix.reduce((s, e) => s + e.probability, 0)).toBeCloseTo(1, 5);
    expect(b.matrix.reduce((s, e) => s + e.probability, 0)).toBeCloseTo(1, 5);
  });

  it('reports tail probability', () => {
    const result = generateScoreDistribution(1, 1);
    expect(result.tailProbability).toBeGreaterThanOrEqual(0);
    expect(result.tailProbability).toBeLessThan(1);
  });
});
