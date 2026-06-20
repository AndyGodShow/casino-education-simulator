import { describe, expect, it, beforeEach } from 'vitest';
import { trackPersistence } from './alphaPersistence';
import { record, resolve, reset } from '../alpha/alphaStore';
import type { AlphaRecord } from '../alpha/alphaStore';

const makeRecord = (
  matchId: string,
  alphaHome: number,
  alphaDraw: number,
  alphaAway: number,
  predicted: 'home' | 'draw' | 'away' = 'home',
): Omit<AlphaRecord, 'createdAt'> => ({
  matchId,
  alphaHomeWin: alphaHome,
  alphaDraw: alphaDraw,
  alphaAwayWin: alphaAway,
  predictedOutcome: predicted,
});

describe('alphaPersistence', () => {
  beforeEach(() => reset());

  it('returns empty report when no data', () => {
    const report = trackPersistence({ windowSize: 10 });
    expect(report.totalMatches).toBe(0);
    expect(report.rollingHitRate).toBe(0);
    expect(report.isDecaying).toBe(false);
  });

  it('computes rolling hit rate from recent window', () => {
    // Create 30 matches: first 20 have 50% hit, last 10 have 80% hit
    for (let i = 0; i < 20; i += 1) {
      record(makeRecord(`m${i}`, 0.04, -0.02, -0.02, 'home'));
      resolve(`m${i}`, i % 2 === 0 ? 2 : 0, i % 2 === 0 ? 0 : 2); // 50% home
    }
    for (let i = 20; i < 30; i += 1) {
      record(makeRecord(`m${i}`, 0.04, -0.02, -0.02, 'home'));
      resolve(`m${i}`, 2, 0); // 100% home → alpha correct
    }

    const report = trackPersistence({ windowSize: 10 });
    expect(report.totalMatches).toBe(30);
    expect(report.rollingHitRate).toBe(1.0); // last 10 all hits
    expect(report.windowSize).toBe(10);
  });

  it('detects decay when recent performance is worse', () => {
    // First 10 matches: alpha always correct (100%)
    for (let i = 0; i < 10; i += 1) {
      record(makeRecord(`m${i}`, 0.04, -0.02, -0.02, 'home'));
      resolve(`m${i}`, 2, 0);
    }
    // Last 10 matches: alpha always wrong (0%)
    for (let i = 10; i < 20; i += 1) {
      record(makeRecord(`m${i}`, 0.04, -0.02, -0.02, 'home'));
      resolve(`m${i}`, 0, 2);
    }

    const report = trackPersistence({ windowSize: 10 });
    expect(report.rollingHitRate).toBe(0); // last 10 all misses
    expect(report.overallHitRate).toBe(0.5); // overall 50%
    expect(report.isDecaying).toBe(true); // rolling < overall by > 5%
  });

  it('signal stability ranking returns valid order', () => {
    for (let i = 0; i < 30; i += 1) {
      record(makeRecord(`m${i}`, 0.04, -0.02, -0.02, 'home'));
      resolve(`m${i}`, i % 2 === 0 ? 2 : 0, i % 2 === 0 ? 0 : 2);
    }
    const report = trackPersistence({ windowSize: 10 });
    expect(report.signalStability.ranking).toHaveLength(3);
    expect(report.signalStability.scores.form).toBeGreaterThanOrEqual(0);
    expect(report.signalStability.scores.form).toBeLessThanOrEqual(1);
    // All scores should be finite
    expect(Number.isFinite(report.signalStability.scores.form)).toBe(true);
    expect(Number.isFinite(report.signalStability.scores.matchup)).toBe(true);
    expect(Number.isFinite(report.signalStability.scores.context)).toBe(true);
  });
});
