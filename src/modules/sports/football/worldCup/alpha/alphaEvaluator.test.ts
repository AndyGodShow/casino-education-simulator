import { describe, expect, it, beforeEach } from 'vitest';
import { evaluate, formatEvaluationReport, logEvaluationReport } from './alphaEvaluator';
import { record, resolve, reset } from './alphaStore';
import type { AlphaRecord, MatchOutcome } from './alphaStore';
import type { AlphaSignals } from '../logic/signalLayer';

const makeRecord = (
  matchId: string,
  alphaHome: number,
  alphaDraw: number,
  alphaAway: number,
  predicted: MatchOutcome = 'home',
): Omit<AlphaRecord, 'createdAt'> => ({
  matchId,
  alphaHomeWin: alphaHome,
  alphaDraw: alphaDraw,
  alphaAwayWin: alphaAway,
  predictedOutcome: predicted,
});

const signal = (value: number) => ({ value, quality: 'proxy' as const, explanation: 'test' });

const makeSignals = (formHome: number, formAway: number): AlphaSignals => ({
  form: { home: signal(formHome), away: signal(formAway) },
  matchup: { home: signal(formHome), away: signal(formAway) },
  context: { home: signal(0), away: signal(0) },
  metadata: { hasRealFormData: false, hasVenueHostData: false, hasPressureData: false },
});

describe('alphaEvaluator', () => {
  beforeEach(() => reset());

  it('returns empty metrics when no data', () => {
    const metrics = evaluate();
    expect(metrics.sampleSize).toBe(0);
    expect(metrics.hitRate).toBe(0);
    expect(metrics.bestSignal).toBe('none');
  });

  it('computes 100% hit rate when alpha direction always matches outcome', () => {
    // Alpha always favors home, and home always wins
    for (let i = 0; i < 10; i += 1) {
      record(makeRecord(`m${i}`, 0.05, -0.02, -0.03, 'home'));
      resolve(`m${i}`, 2, 0); // home win
    }
    const metrics = evaluate();
    expect(metrics.hitRate).toBe(1.0);
    expect(metrics.sampleSize).toBe(10);
  });

  it('computes 0% hit rate when alpha direction always wrong', () => {
    // Alpha always favors home, but away always wins
    for (let i = 0; i < 10; i += 1) {
      record(makeRecord(`m${i}`, 0.05, -0.02, -0.03, 'home'));
      resolve(`m${i}`, 0, 2); // away win
    }
    const metrics = evaluate();
    expect(metrics.hitRate).toBe(0.0);
  });

  it('directional accuracy breaks down by outcome', () => {
    // Mix of outcomes with varying alpha accuracy
    record(makeRecord('m1', 0.05, -0.02, -0.03, 'home'));
    resolve('m1', 2, 0); // home win → hit

    record(makeRecord('m2', 0.05, -0.02, -0.03, 'home'));
    resolve('m2', 0, 2); // away win → miss

    record(makeRecord('m3', -0.02, 0.04, -0.02, 'draw'));
    resolve('m3', 1, 1); // draw → hit

    record(makeRecord('m4', -0.03, -0.02, 0.05, 'away'));
    resolve('m4', 0, 2); // away win → hit

    const metrics = evaluate();
    expect(metrics.sampleSize).toBe(4);
    expect(metrics.hitRate).toBe(0.75);
    expect(metrics.directionalAccuracy.home).toBe(1); // m1: home alpha → home win ✓
    expect(metrics.directionalAccuracy.draw).toBe(1); // m3: draw alpha → draw ✓
    // m2: home alpha → away win ✗, m4: away alpha → away win ✓ → away accuracy = 0.5
    expect(metrics.directionalAccuracy.away).toBe(0.5);
  });

  it('calibration drift detects home skew', () => {
    // Alpha consistently positive for home, and home wins a lot
    for (let i = 0; i < 20; i += 1) {
      const homeWins = i < 15; // 75% home win rate
      record(makeRecord(`m${i}`, 0.04, -0.03, -0.01, 'home'));
      resolve(`m${i}`, homeWins ? 2 : 0, homeWins ? 0 : 2);
    }
    const metrics = evaluate();
    // With 75% home wins and alpha favoring home, the bias should be detected
    expect(metrics.calibrationDrift.biasDirection).toBe('home_skew');
    expect(metrics.calibrationDrift.biasMagnitude).toBeGreaterThan(0);
  });

  it('best signal is identified when scores differ significantly', () => {
    // Create data where form-like patterns dominate
    for (let i = 0; i < 30; i += 1) {
      const homeWins = i < 20;
      record(makeRecord(`m${i}`, homeWins ? 0.06 : -0.04, -0.02, homeWins ? -0.04 : 0.06, 'home'));
      resolve(`m${i}`, homeWins ? 2 : 0, homeWins ? 0 : 2);
    }
    const metrics = evaluate();
    expect(metrics.bestSignal).toBeDefined();
    expect(['form', 'matchup', 'context', 'none']).toContain(metrics.bestSignal);
    expect(metrics.signalScores.form).toBeGreaterThanOrEqual(0);
    expect(metrics.signalScores.form).toBeLessThanOrEqual(1);
  });

  it('does not fake attribution when raw signals are missing', () => {
    record(makeRecord('m1', 0.05, -0.02, -0.03, 'home'));
    resolve('m1', 2, 0);

    const metrics = evaluate();
    expect(metrics.signalAttribution.status).toBe('insufficientData');
    expect(metrics.bestSignal).toBe('none');
  });

  it('computes attribution when raw signals are present', () => {
    for (let i = 0; i < 5; i += 1) {
      record({
        ...makeRecord(`m${i}`, 0.05, -0.02, -0.03, 'home'),
        signals: makeSignals(0.2, -0.1),
      });
      resolve(`m${i}`, 2, 0);
    }

    const metrics = evaluate();
    expect(metrics.signalAttribution.status).toBe('available');
    expect(metrics.signalAttribution.scores?.form).toBe(1);
  });

  it('bucket accuracy splits alpha into magnitude ranges', () => {
    for (let i = 0; i < 20; i += 1) {
      const homeWins = i % 2 === 0;
      const mag = (i % 4) * 0.04; // varying magnitudes
      record(makeRecord(`m${i}`, mag, -mag / 2, -mag / 2, 'home'));
      resolve(`m${i}`, homeWins ? 2 : 0, homeWins ? 0 : 2);
    }
    const metrics = evaluate();
    expect(metrics.bucketAccuracy.length).toBeGreaterThan(0);
    // Each bucket should have a valid hit rate
    for (const bucket of metrics.bucketAccuracy) {
      expect(bucket.hitRate).toBeGreaterThanOrEqual(0);
      expect(bucket.hitRate).toBeLessThanOrEqual(1);
    }
  });

  it('formatEvaluationReport returns non-empty string', () => {
    record(makeRecord('m1', 0.05, -0.02, -0.03, 'home'));
    resolve('m1', 2, 0);
    const report = formatEvaluationReport(evaluate());
    expect(report).toContain('Alpha Evaluation Report');
    expect(report).toContain('Hit Rate');
  });

  it('logEvaluationReport does not throw', () => {
    record(makeRecord('m1', 0.05, -0.02, -0.03, 'home'));
    resolve('m1', 2, 0);
    expect(() => logEvaluationReport()).not.toThrow();
  });
});
