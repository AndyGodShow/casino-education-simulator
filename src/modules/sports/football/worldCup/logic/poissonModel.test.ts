import { describe, expect, it } from 'vitest';
import { buildScoreMatrix } from './poissonModel';

describe('poissonModel', () => {
  it('builds a bounded score matrix with legal probabilities', () => {
    const result = buildScoreMatrix(1.5, 1.1);
    const matrixSum = result.matrix.reduce((total, cell) => total + cell.probability, 0);
    expect(matrixSum).toBeCloseTo(1, 5);
    expect(result.mostLikelyScore).toMatch(/\d-\d/);
    expect(result.probabilities.homeWin + result.probabilities.draw + result.probabilities.awayWin).toBeCloseTo(1, 6);
    expect(result.tailProbability).toBeGreaterThanOrEqual(0);
  });

  it('uses adaptive max goals range', () => {
    const lowLambda = buildScoreMatrix(0.5, 0.3);
    const highLambda = buildScoreMatrix(3.5, 2.8);
    expect(highLambda.matrix.length).toBeGreaterThan(lowLambda.matrix.length);
  });
});
