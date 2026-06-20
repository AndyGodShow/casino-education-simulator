import { polymarketClient } from '../../../../../dataProviders/polymarket/polymarketClient';
import { convertMarketProbabilities } from '../calibration/marketProbability';

export type MarketCurvePoint = {
  timestamp: number;
  home: number;
  draw: number;
  away: number;
};

export type PolymarketThreeWay = {
  home: number;
  draw: number;
  away: number;
  curve: MarketCurvePoint[];
};

function normalize(home: number, draw: number, away: number): { home: number; draw: number; away: number } {
  return convertMarketProbabilities({ kind: 'polymarketPrice', home, draw, away });
}

function matchOutcomeLabel(outcome: string, homeTeam: string, awayTeam: string): 'home' | 'draw' | 'away' | null {
  const lower = outcome.toLowerCase();
  const home = homeTeam.toLowerCase();
  const away = awayTeam.toLowerCase();

  if (lower.includes('draw') || lower.includes('tie')) return 'draw';
  if (lower === 'home' || lower.includes(home)) return 'home';
  if (lower === 'away' || lower.includes(away)) return 'away';
  // Ambiguous — Polymarket markets vary in naming
  return null;
}

export async function fetchMarketProbabilities(
  homeTeam: string,
  awayTeam: string,
): Promise<PolymarketThreeWay | null> {
  try {
    const query = `${homeTeam} ${awayTeam} winner`;
    const results = await polymarketClient.searchMarketProbabilities(query);

    if (!results.length) return null;

    let homeRaw = 0;
    let drawRaw = 0;
    let awayRaw = 0;

    for (const m of results) {
      const label = matchOutcomeLabel(m.outcome, homeTeam, awayTeam);
      if (label === 'home') homeRaw = Math.max(homeRaw, m.price);
      else if (label === 'draw') drawRaw = Math.max(drawRaw, m.price);
      else if (label === 'away') awayRaw = Math.max(awayRaw, m.price);
    }

    if (homeRaw <= 0 || drawRaw <= 0 || awayRaw <= 0) return null;

    const normalized = normalize(homeRaw, drawRaw, awayRaw);
    return { ...normalized, curve: [] };
  } catch {
    return null;
  }
}

export async function fetchPriceCurve(
  tokenIds: { home?: string; draw?: string; away?: string },
): Promise<MarketCurvePoint[]> {
  try {
    const curves: Map<number, { home?: number; draw?: number; away?: number }> = new Map();

    const fetchToken = async (key: 'home' | 'draw' | 'away', tokenId?: string) => {
      if (!tokenId) return;
      const history = (await polymarketClient.getPriceHistory(tokenId)) as {
        history?: Array<{ t?: number; p?: number }>;
      } | null;
      const points = history?.history ?? [];
      for (const point of points) {
        if (!point.t || point.p == null) continue;
        const entry = curves.get(point.t) ?? {};
        entry[key] = point.p;
        curves.set(point.t, entry);
      }
    };

    await Promise.all([
      fetchToken('home', tokenIds.home),
      fetchToken('draw', tokenIds.draw),
      fetchToken('away', tokenIds.away),
    ]);

    return Array.from(curves.entries())
      .sort(([a], [b]) => a - b)
      .map(([timestamp, partial]) => {
        const h = partial.home ?? 0;
        const d = partial.draw ?? 0;
        const a = partial.away ?? 0;
        const n = normalize(h, d, a);
        return { timestamp, home: n.home, draw: n.draw, away: n.away };
      });
  } catch {
    return [];
  }
}
