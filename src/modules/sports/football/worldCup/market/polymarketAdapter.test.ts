import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketProbability } from '../../../../../dataProviders/polymarket/types';
import { polymarketClient } from '../../../../../dataProviders/polymarket/polymarketClient';
import { fetchMarketProbabilities, fetchPriceCurve } from './polymarketAdapter';

vi.mock('../../../../../dataProviders/polymarket/polymarketClient', () => ({
  polymarketClient: {
    searchMarketProbabilities: vi.fn(),
    getPriceHistory: vi.fn(),
  },
}));

const market = (outcome: string, price: number): MarketProbability => ({
  marketId: outcome,
  title: 'France vs Brazil',
  outcome,
  price,
  impliedProbability: price,
  updatedAt: '2026-06-18T00:00:00.000Z',
  status: 'active',
  source: 'polymarket',
});

describe('polymarketAdapter', () => {
  beforeEach(() => {
    vi.mocked(polymarketClient.searchMarketProbabilities).mockReset();
    vi.mocked(polymarketClient.getPriceHistory).mockReset();
  });

  it('treats Polymarket prices as probabilities for explicit 1X2 outcomes', async () => {
    vi.mocked(polymarketClient.searchMarketProbabilities).mockResolvedValue([
      market('France', 0.5),
      market('Draw', 0.25),
      market('Brazil', 0.25),
    ]);

    const result = await fetchMarketProbabilities('France', 'Brazil');

    expect(result?.home).toBeCloseTo(0.5, 5);
    expect(result?.draw).toBeCloseTo(0.25, 5);
    expect(result?.away).toBeCloseTo(0.25, 5);
  });

  it('returns null instead of fabricating uniform probabilities for unrecognized outcomes', async () => {
    vi.mocked(polymarketClient.searchMarketProbabilities).mockResolvedValue([
      market('Yes', 0.6),
      market('No', 0.4),
    ]);

    await expect(fetchMarketProbabilities('France', 'Brazil')).resolves.toBeNull();
  });

  it('returns null when a three-way market is incomplete', async () => {
    vi.mocked(polymarketClient.searchMarketProbabilities).mockResolvedValue([
      market('France', 0.6),
      market('Brazil', 0.4),
    ]);

    await expect(fetchMarketProbabilities('France', 'Brazil')).resolves.toBeNull();
  });

  it('normalizes price curve points without using inverse odds', async () => {
    vi.mocked(polymarketClient.getPriceHistory).mockImplementation(async (tokenId: string) => ({
      history: [{ t: 100, p: tokenId === 'home' ? 0.5 : 0.25 }],
    }));

    const result = await fetchPriceCurve({ home: 'home', draw: 'draw', away: 'away' });

    expect(result).toEqual([{ timestamp: 100, home: 0.5, draw: 0.25, away: 0.25 }]);
  });
});
