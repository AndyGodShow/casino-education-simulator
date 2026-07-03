import { describe, expect, it } from 'vitest';
import { generateScoreDistribution } from './scoreDistribution';

const drawMass = (result: ReturnType<typeof generateScoreDistribution>) =>
  result.matrix
    .filter((entry) => entry.home === entry.away)
    .reduce((sum, entry) => sum + entry.probability, 0);

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

  it('applies draw correction by increasing diagonal score mass', () => {
    const raw = generateScoreDistribution(1.2, 1.2, undefined, { applyDrawCorrection: false });
    const corrected = generateScoreDistribution(1.2, 1.2);
    const rawDrawMass = drawMass(raw);
    const correctedDrawMass = drawMass(corrected);

    expect(correctedDrawMass).toBeGreaterThan(rawDrawMass);
    expect(corrected.matrix.reduce((s, e) => s + e.probability, 0)).toBeCloseTo(1, 5);
  });

  it('adds more draw mass for low-tempo close matches than high-tempo close matches', () => {
    const lowTempoRaw = generateScoreDistribution(0.85, 0.82, undefined, { applyDrawCorrection: false });
    const lowTempoCorrected = generateScoreDistribution(0.85, 0.82);
    const highTempoRaw = generateScoreDistribution(1.85, 1.82, undefined, { applyDrawCorrection: false });
    const highTempoCorrected = generateScoreDistribution(1.85, 1.82);
    const lowTempoDrawGain = drawMass(lowTempoCorrected) - drawMass(lowTempoRaw);
    const highTempoDrawGain = drawMass(highTempoCorrected) - drawMass(highTempoRaw);

    expect(lowTempoDrawGain).toBeGreaterThan(highTempoDrawGain);
    expect(lowTempoCorrected.matrix.reduce((s, e) => s + e.probability, 0)).toBeCloseTo(1, 5);
  });

  it('lets calibration profiles scale close-match draw correction without breaking normalization', () => {
    const standard = generateScoreDistribution(1.05, 1.02, undefined, { drawCorrectionMultiplier: 1 });
    const bucketed = generateScoreDistribution(1.05, 1.02, undefined, { drawCorrectionMultiplier: 1.35 });

    expect(drawMass(bucketed)).toBeGreaterThan(drawMass(standard));
    expect(bucketed.matrix.reduce((s, e) => s + e.probability, 0)).toBeCloseTo(1, 5);
  });
});
