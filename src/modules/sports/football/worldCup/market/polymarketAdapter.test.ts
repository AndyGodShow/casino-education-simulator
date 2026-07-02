import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketProbability } from '../../../../../dataProviders/polymarket/types';
import { polymarketClient } from '../../../../../dataProviders/polymarket/polymarketClient';
import type { WorldCupMatch, WorldCupTeam } from '../types';
import {
  fetchMarketData,
  fetchMarketProbabilities,
  fetchPriceCurve,
  loadWorldCupMarketReferences,
} from './polymarketAdapter';

vi.mock('../../../../../dataProviders/polymarket/polymarketClient', () => ({
  polymarketClient: {
    searchMarketProbabilities: vi.fn(),
    getPriceHistory: vi.fn(),
  },
}));

const market = (outcome: string, price: number): MarketProbability => ({
  marketId: outcome,
  eventId: 'france-brazil',
  title: 'France vs Brazil',
  outcome,
  tokenId: `${outcome}-token`,
  price,
  impliedProbability: price,
  updatedAt: '2026-06-18T00:00:00.000Z',
  status: 'active',
  source: 'polymarket',
  confidence: 0.72,
  quality: {
    score: 72,
    level: 'high',
    warnings: [],
    liquidityQuality: 0.8,
    spreadQuality: 0.8,
    freshness: 0.8,
    confidencePenalty: 0.08,
  },
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

  it('does not combine outcomes from different events into a fake three-way market', async () => {
    vi.mocked(polymarketClient.searchMarketProbabilities).mockResolvedValue([
      { ...market('France', 0.6), eventId: 'event-one' },
      { ...market('Draw', 0.2), eventId: 'event-two' },
      { ...market('Brazil', 0.2), eventId: 'event-three' },
    ]);

    await expect(fetchMarketProbabilities('France', 'Brazil')).resolves.toBeNull();
  });

  it('converts an auditable three-way market into domain market data', async () => {
    vi.mocked(polymarketClient.searchMarketProbabilities).mockResolvedValue([
      market('France', 0.5),
      market('Draw', 0.25),
      market('Brazil', 0.25),
    ]);

    const result = await fetchMarketData('France', 'Brazil');

    expect(result).toEqual(expect.objectContaining({
      kind: 'real',
      source: 'polymarket',
      status: 'available',
      auditable: true,
      confidence: 0.72,
      quality: 'high',
      lastUpdated: '2026-06-18T00:00:00.000Z',
      probabilities: { home: 0.5, draw: 0.25, away: 0.25 },
      odds: { home: 2, draw: 4, away: 4 },
    }));
  });

  it('bounds upcoming market discovery and skips unresolved placeholders', async () => {
    vi.mocked(polymarketClient.searchMarketProbabilities).mockResolvedValue([
      market('France', 0.5),
      market('Draw', 0.25),
      market('Brazil', 0.25),
    ]);
    const baseMatch: WorldCupMatch = {
      id: 'match-1',
      competitionId: 'world-cup-2026',
      stage: 'round32',
      homeTeamId: 'france',
      awayTeamId: 'brazil',
      kickoff: '2026-07-03T18:00:00.000Z',
      status: 'scheduled',
      source: 'openfootball',
      lastUpdated: '2026-07-02T00:00:00.000Z',
    };
    const teams: Record<string, WorldCupTeam> = {
      france: { id: 'france', name: 'France', shortName: 'FRA', countryCode: 'FR', group: 'A', rating: 90, attack: 90, defense: 90, form: 90 },
      brazil: { id: 'brazil', name: 'Brazil', shortName: 'BRA', countryCode: 'BR', group: 'A', rating: 90, attack: 90, defense: 90, form: 90 },
      placeholder: { id: 'W80', name: 'W80', shortName: 'W80', countryCode: 'W8', group: 'A', rating: 75, attack: 75, defense: 75, form: 75 },
    };

    const result = await loadWorldCupMarketReferences([
      baseMatch,
      { ...baseMatch, id: 'match-2', kickoff: '2026-07-04T18:00:00.000Z' },
      { ...baseMatch, id: 'placeholder', homeTeamId: 'W80', kickoff: '2026-07-05T18:00:00.000Z' },
    ], teams, { maxMatches: 1 });

    expect(Object.keys(result)).toEqual(['match-1']);
    expect(polymarketClient.searchMarketProbabilities).toHaveBeenCalledTimes(1);
  });

  it('normalizes price curve points without using inverse odds', async () => {
    vi.mocked(polymarketClient.getPriceHistory).mockImplementation(async (tokenId: string) => ({
      history: [{ t: 100, p: tokenId === 'home' ? 0.5 : 0.25 }],
    }));

    const result = await fetchPriceCurve({ home: 'home', draw: 'draw', away: 'away' });

    expect(result).toEqual([{ timestamp: 100, home: 0.5, draw: 0.25, away: 0.25 }]);
  });
});
