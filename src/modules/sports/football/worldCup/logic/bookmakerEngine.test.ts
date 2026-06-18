import { describe, expect, it } from 'vitest';
import { simulateBookmaker } from './bookmakerEngine';

describe('bookmakerEngine', () => {
  it('calculates overround, payout ratio and exposure', () => {
    const result = simulateBookmaker({ home: 1.8, draw: 3.5, away: 4.5 }, { home: 100, draw: 50, away: 50 });
    expect(result.overround).toBeGreaterThan(0);
    expect(result.payoutRatio).toBeLessThan(1);
    expect(result.exposures).toHaveLength(3);
    expect(['low', 'medium', 'high']).toContain(result.riskLevel);
  });
});
