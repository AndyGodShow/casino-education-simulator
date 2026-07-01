import { describe, expect, it } from 'vitest';
import { calibrateOutcomes } from './outcomeCalibration';
import type { PredictionResult } from '../logic/scoring';

describe('outcomeCalibration', () => {
  it('returns empty result for no data', () => {
    const result = calibrateOutcomes([]);
    expect(result.sampleSize).toBe(0);
    expect(result.brierScore).toBe(0);
  });

  it('computes perfect Brier score for perfect predictions', () => {
    const results: PredictionResult[] = [
      { probabilities: { home: 1.0, draw: 0, away: 0 }, outcome: 'home' },
      { probabilities: { home: 0, draw: 1.0, away: 0 }, outcome: 'draw' },
      { probabilities: { home: 0, draw: 0, away: 1.0 }, outcome: 'away' },
    ];
    const result = calibrateOutcomes(results);
    expect(result.brierScore).toBeCloseTo(0, 3);
    expect(result.logLoss).toBeCloseTo(0, 3);
  });

  it('computes worst-case Brier score', () => {
    const results: PredictionResult[] = [
      { probabilities: { home: 1.0, draw: 0, away: 0 }, outcome: 'away' },
      { probabilities: { home: 1.0, draw: 0, away: 0 }, outcome: 'away' },
    ];
    const result = calibrateOutcomes(results);
    // Brier: (1-0)^2 + (0-0)^2 + (0-1)^2 = 2 per result, average = 2
    expect(result.brierScore).toBeCloseTo(2, 1);
  });

  it('builds calibration curve with 5 bins', () => {
    const results: PredictionResult[] = [];
    // Generate predictions across probability ranges
    for (let i = 0; i < 50; i += 1) {
      const p = (i % 5) * 0.15 + 0.1; // spread across bins
      results.push({
        probabilities: { home: p, draw: (1 - p) / 2, away: (1 - p) / 2 },
        outcome: i < 25 ? 'home' : 'away', // 50% home wins
      });
    }
    const result = calibrateOutcomes(results);
    expect(result.calibrationCurve).toHaveLength(5);
    expect(result.sampleSize).toBe(50);
  });

  it('detects overconfidence when predicted > actual', () => {
    // Overconfident: predict 90% but only 50% correct
    const results: PredictionResult[] = [];
    for (let i = 0; i < 100; i += 1) {
      results.push({
        probabilities: { home: 0.9, draw: 0.05, away: 0.05 },
        outcome: i < 50 ? 'home' : 'away',
      });
    }
    const result = calibrateOutcomes(results);
    expect(result.overconfidence.isOverconfident).toBe(true);
    expect(result.overconfidence.calibrationError).toBeCloseTo(0.2667, 3);
  });

  it('detects underconfidence when predicted < actual', () => {
    // Underconfident: predict home=25% but 80% home wins → clear underconfidence
    const results: PredictionResult[] = [];
    for (let i = 0; i < 100; i += 1) {
      results.push({
        probabilities: { home: 0.25, draw: 0.25, away: 0.50 },
        outcome: i < 80 ? 'home' : 'away',
      });
    }
    const result = calibrateOutcomes(results);
    expect(result.overconfidence.isUnderconfident).toBe(true);
  });

  it('well-calibrated predictions show no over/underconfidence', () => {
    // Calibrated: predict 60% and 60% correct
    const results: PredictionResult[] = [];
    for (let i = 0; i < 100; i += 1) {
      results.push({
        probabilities: { home: 0.6, draw: 0.2, away: 0.2 },
        outcome: i < 60 ? 'home' : 'away',
      });
    }
    const result = calibrateOutcomes(results);
    expect(result.overconfidence.isOverconfident).toBe(false);
    expect(result.overconfidence.isUnderconfident).toBe(false);
  });
});
