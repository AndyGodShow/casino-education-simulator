import { describe, expect, it, beforeEach } from 'vitest';
import { buildHeuristicWeightSuggestion, getWeights, calibrate, resetWeights, getCalibrationState } from './alphaCalibration';

describe('alphaCalibration', () => {
  beforeEach(() => resetWeights());

  it('starts with default weights summing to 1', () => {
    const w = getWeights();
    expect(w.form + w.matchup + w.context).toBeCloseTo(1, 5);
    expect(w.form).toBe(0.4);
    expect(w.matchup).toBe(0.4);
    expect(w.context).toBe(0.2);
  });

  it('boosts strong signal and penalizes weak signal', () => {
    // Form is good, matchup is weak, context is neutral
    const newWeights = calibrate({ form: 0.65, matchup: 0.35, context: 0.50 });
    expect(newWeights.form).toBeGreaterThan(0.4);
    expect(newWeights.matchup).toBeLessThan(0.4);
    // Sum still 1
    expect(newWeights.form + newWeights.matchup + newWeights.context).toBeCloseTo(1, 5);
  });

  it('keeps weights within bounds [0.05, 0.60]', () => {
    // Extreme calibration
    for (let i = 0; i < 50; i += 1) {
      calibrate({ form: 0.90, matchup: 0.10, context: 0.10 });
    }
    const w = getWeights();
    expect(w.form).toBeLessThanOrEqual(0.605); // allow fp epsilon
    expect(w.form).toBeGreaterThanOrEqual(0.045);
    expect(w.matchup).toBeGreaterThanOrEqual(0.045);
    expect(w.context).toBeGreaterThanOrEqual(0.045);
  });

  it('adjustment per cycle is bounded by ±0.02', () => {
    // First calibration
    calibrate({ form: 0.90, matchup: 0.10, context: 0.10 });
    const state = getCalibrationState();
    expect(Math.abs(state.lastAdjustment.form)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(state.lastAdjustment.matchup)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(state.lastAdjustment.context)).toBeLessThanOrEqual(0.02);
  });

  it('near-0.5 signals produce no adjustment', () => {
    const before = { ...getWeights() };
    calibrate({ form: 0.50, matchup: 0.51, context: 0.49 });
    const after = getWeights();
    // Should be very close to original (only tiny adjustments for 0.51/0.49)
    expect(Math.abs(after.form - before.form)).toBeLessThan(0.005);
  });

  it('reset restores default weights', () => {
    calibrate({ form: 0.70, matchup: 0.30, context: 0.40 });
    resetWeights();
    const w = getWeights();
    expect(w.form).toBe(0.4);
    expect(w.matchup).toBe(0.4);
    expect(w.context).toBe(0.2);
    expect(getCalibrationState().cycleCount).toBe(0);
  });

  it('tracks cycle count', () => {
    expect(getCalibrationState().cycleCount).toBe(0);
    calibrate({ form: 0.55, matchup: 0.45, context: 0.50 });
    expect(getCalibrationState().cycleCount).toBe(1);
    calibrate({ form: 0.55, matchup: 0.45, context: 0.50 });
    expect(getCalibrationState().cycleCount).toBe(2);
  });

  it('returns insufficientData suggestion without enough raw attribution', () => {
    const suggestion = buildHeuristicWeightSuggestion({ sampleSize: 5 });
    expect(suggestion.status).toBe('insufficientData');
    expect(suggestion.message).toContain('raw signal history');
  });

  it('builds heuristic weight suggestion from available attribution without mutating state', () => {
    const before = { ...getWeights() };
    const suggestion = buildHeuristicWeightSuggestion({
      sampleSize: 25,
      signalAttribution: {
        status: 'available',
        scores: { form: 0.7, matchup: 0.5, context: 0.4 },
      },
    });

    expect(suggestion.status).toBe('available');
    expect(suggestion.message).toContain('Heuristic only');
    expect(suggestion.suggestedWeights?.form).toBeGreaterThan(before.form);
    expect(getWeights()).toEqual(before);
  });
});
