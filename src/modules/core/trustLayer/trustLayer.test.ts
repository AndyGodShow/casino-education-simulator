import { describe, expect, it } from 'vitest';
import { evaluateMarketTruth, evaluateMatchTruth, evaluatePredictionTruth } from './trustEvaluator';

describe('trust layer', () => {
  it('downgrades local seed matches', () => {
    const truth = evaluateMatchTruth({ source: 'local', lastUpdated: '2026-06-18T00:00:00.000Z' });
    expect(truth.level).toBe('local_seed');
    expect(truth.confidence).toBeLessThan(0.4);
  });

  it('labels sample data correctly', () => {
    const truth = evaluateMatchTruth({ source: 'manual', lastUpdated: '2026-06-18T00:00:00.000Z' });
    expect(truth.level).toBe('sample');
    expect(truth.description).toContain('sample');
  });

  it('distinguishes fresh third-party fixtures from official live data', () => {
    const now = Date.parse('2026-07-02T06:10:00.000Z');
    const provider = evaluateMatchTruth({
      source: 'openfootball',
      lastUpdated: '2026-07-02T06:00:00.000Z',
    }, now);
    const official = evaluateMatchTruth({
      source: 'official',
      lastUpdated: '2026-07-02T06:00:00.000Z',
    }, now);

    expect(provider.level).toBe('provider');
    expect(provider.description).toContain('third-party');
    expect(official.level).toBe('live');
    expect(official.description).toContain('Official');
  });

  it('labels model predictions as local seed when no provider truth exists', () => {
    const truth = evaluatePredictionTruth({ confidence: 'medium', matchId: 'sample-match' });
    expect(truth.level).toBe('local_seed');
    expect(truth.description).toContain('local team ratings');
  });

  it('recognizes stale market data', () => {
    const truth = evaluateMarketTruth({
      source: 'polymarket',
      status: 'active',
      updatedAt: '2026-06-18T00:00:00.000Z',
    }, Date.parse('2026-06-18T01:00:00.000Z'));
    expect(truth.level).toBe('stale');
    expect(truth.confidence).toBeLessThan(0.3);
  });
});
