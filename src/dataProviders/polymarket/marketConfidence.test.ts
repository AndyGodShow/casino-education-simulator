import { describe, expect, it } from 'vitest';
import { computeMarketConfidence } from './adapters';

const fresh = () => new Date().toISOString();

describe('market confidence', () => {
  it('downweights low liquidity markets', () => {
    const high = computeMarketConfidence({ liquidity: 50000, volume: 100000, spread: 0.01, updatedAt: fresh(), status: 'active' });
    const low = computeMarketConfidence({ liquidity: 10, volume: 100000, spread: 0.01, updatedAt: fresh(), status: 'active' });
    expect(low).toBeLessThan(high);
  });

  it('applies stale penalty', () => {
    const confidence = computeMarketConfidence({ liquidity: 50000, volume: 100000, spread: 0.01, updatedAt: '2000-01-01T00:00:00.000Z', status: 'stale' });
    expect(confidence).toBeLessThan(0.25);
  });

  it('applies spread penalty', () => {
    const tight = computeMarketConfidence({ liquidity: 50000, volume: 100000, spread: 0.01, updatedAt: fresh(), status: 'active' });
    const wide = computeMarketConfidence({ liquidity: 50000, volume: 100000, spread: 0.4, updatedAt: fresh(), status: 'active' });
    expect(wide).toBeLessThan(tight);
  });
});
