import { describe, expect, it } from 'vitest';
import { adaptGammaMarket, calculateBestBidAsk, calculateMarketQuality, calculateSpread, marketQualityScore, normalizeClobBook, shouldExcludeMarket } from './adapters';
import { filterActiveMarkets, markStaleIfNeeded } from './guards';

describe('polymarket adapters', () => {
  it('filters inactive markets', () => {
    expect(filterActiveMarkets([
      { active: true, acceptingOrders: true, clobTokenIds: '["1"]', outcomePrices: '["0.5"]' },
      { closed: true, clobTokenIds: '["2"]', outcomePrices: '["0.4"]' },
    ])).toHaveLength(1);
    expect(shouldExcludeMarket({ closed: true })).toBe(true);
    expect(shouldExcludeMarket({ resolved: true })).toBe(true);
    expect(shouldExcludeMarket({ acceptingOrders: false })).toBe(true);
  });

  it('adapts probabilities and marks stale', () => {
    const adapted = adaptGammaMarket({
      id: 'm1',
      question: 'Winner?',
      outcomes: '["Yes"]',
      clobTokenIds: '["token"]',
      outcomePrices: '["0.62"]',
      updatedAt: new Date().toISOString(),
      active: true,
      acceptingOrders: true,
    });
    expect(adapted[0].impliedProbability).toBe(0.62);
    expect(markStaleIfNeeded({ ...adapted[0], updatedAt: '2000-01-01T00:00:00.000Z' }).status).toBe('stale');
  });

  it('scores market quality', () => {
    const quality = marketQualityScore({ liquidity: 20000, volume: 100000, spread: 0.02, freshnessMs: 1000 });
    expect(quality.level).toBe('high');
    const lowQuality = calculateMarketQuality({ liquidity: 0, volume: 0, spread: 0.5, freshnessMs: 999999 });
    expect(lowQuality.level).toBe('low');
  });

  it('summarizes CLOB books and spreads', () => {
    expect(calculateBestBidAsk({ bids: [{ price: '0.42' }, { price: '0.45' }], asks: [{ price: '0.5' }, { price: '0.48' }] })).toEqual({ bestBid: 0.45, bestAsk: 0.48 });
    expect(calculateSpread(0.45, 0.48)).toBeCloseTo(0.03);
    expect(normalizeClobBook({ tokenId: 't1', bids: [{ price: '0.4' }], asks: [{ price: '0.46' }], updatedAt: '2026-01-01T00:00:00.000Z' })).toMatchObject({ tokenId: 't1', bestBid: 0.4, bestAsk: 0.46 });
  });
});
