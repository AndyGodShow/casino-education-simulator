import { describe, expect, it } from 'vitest';
import { alignWithMarket, batchMarketAlignment } from './marketAlignment';

describe('marketAlignment', () => {
  const defaultOdds = { home: 2.0, draw: 3.5, away: 4.0 };

  it('computes edge = P_model - P_market', () => {
    const modelProbs = { home: 0.50, draw: 0.28, away: 0.22 };
    const result = alignWithMarket(modelProbs, defaultOdds);

    // No-vig market probs from odds 2.0/3.5/4.0
    // raw: 0.5, 0.286, 0.25 → total=1.036 → normalized: 0.483, 0.276, 0.241
    expect(result.marketProbs.home).toBeCloseTo(0.483, 2);
    expect(result.edge.home).toBeCloseTo(0.50 - result.marketProbs.home, 4);
    expect(result.edge.home + result.edge.draw + result.edge.away).toBeCloseTo(0, 5);
  });

  it('detects efficient market when edge is small', () => {
    const modelProbs = { home: 0.48, draw: 0.28, away: 0.24 }; // close to market
    const result = alignWithMarket(modelProbs, defaultOdds);
    expect(result.efficiencySignal.level).toBe('efficient');
  });

  it('detects potential alpha when edge is large', () => {
    const modelProbs = { home: 0.70, draw: 0.18, away: 0.12 }; // far from market
    const result = alignWithMarket(modelProbs, defaultOdds);
    expect(result.efficiencySignal.level).toBe('potential_alpha');
  });

  it('totalDisagreement is sum of absolute edges', () => {
    const modelProbs = { home: 0.55, draw: 0.25, away: 0.20 };
    const result = alignWithMarket(modelProbs, defaultOdds);
    expect(result.totalDisagreement).toBeCloseTo(
      Math.abs(result.edge.home) + Math.abs(result.edge.draw) + Math.abs(result.edge.away),
      5,
    );
  });

  it('batchMarketAlignment aggregates correctly', () => {
    const entries = [
      { modelProbs: { home: 0.50, draw: 0.28, away: 0.22 }, odds: defaultOdds },
      { modelProbs: { home: 0.70, draw: 0.18, away: 0.12 }, odds: defaultOdds },
    ];
    const batch = batchMarketAlignment(entries);
    expect(batch.avgTotalDisagreement).toBeGreaterThan(0);
    expect(batch.strongestMismatches).toHaveLength(2); // only 2 entries, sorted
  });

  it('returns empty result for no entries', () => {
    const batch = batchMarketAlignment([]);
    expect(batch.avgTotalDisagreement).toBe(0);
    expect(batch.strongestMismatches).toHaveLength(0);
  });

  it('direction consistency identifies favored outcome', () => {
    const modelProbs = { home: 0.60, draw: 0.22, away: 0.18 };
    const result = alignWithMarket(modelProbs, defaultOdds);
    expect(result.directionConsistency.isConsistent).toBe(true);
    // Model has higher home prob than market → edge.home > 0
    expect(result.directionConsistency.favoredOutcome).toBe('home');
  });
});
