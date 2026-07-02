import { polymarketClient } from '../../../../../dataProviders/polymarket/polymarketClient';
import type { MarketProbability, MarketQuality } from '../../../../../dataProviders/polymarket/types';
import { convertMarketProbabilities } from '../calibration/marketProbability';
import type { MarketData } from '../domain/WorldCupDomainModel';
import type { WorldCupMatch, WorldCupTeam } from '../types';

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
  updatedAt: string;
  confidence: number;
  quality: MarketQuality['level'];
  auditable: boolean;
  status: 'available' | 'stale';
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

    const groups = new Map<string, MarketProbability[]>();
    for (const result of results) {
      const key = result.eventId ?? result.title.trim().toLowerCase();
      const group = groups.get(key) ?? [];
      group.push(result);
      groups.set(key, group);
    }

    const candidates = [...groups.values()].flatMap((group) => {
      const byOutcome = new Map<'home' | 'draw' | 'away', MarketProbability>();
      for (const market of group) {
        const label = matchOutcomeLabel(market.outcome, homeTeam, awayTeam);
        if (!label) continue;
        const current = byOutcome.get(label);
        if (!current || market.price > current.price) byOutcome.set(label, market);
      }
      const home = byOutcome.get('home');
      const draw = byOutcome.get('draw');
      const away = byOutcome.get('away');
      return home && draw && away ? [{ home, draw, away }] : [];
    });

    if (candidates.length === 0) return null;
    const best = candidates.sort((left, right) => (
      minimumConfidence(right) - minimumConfidence(left)
    ))[0];
    const normalized = normalize(best.home.price, best.draw.price, best.away.price);
    const selected = [best.home, best.draw, best.away];
    const quality = lowestQuality(selected);
    const updatedAt = oldestUpdate(selected);

    return {
      ...normalized,
      curve: [],
      updatedAt,
      confidence: minimumConfidence(best),
      quality,
      auditable: selected.every((market) => Boolean(market.marketId && market.tokenId)),
      status: selected.some((market) => market.status === 'stale') ? 'stale' : 'available',
    };
  } catch {
    return null;
  }
}

function minimumConfidence(markets: {
  home: MarketProbability;
  draw: MarketProbability;
  away: MarketProbability;
}): number;
function minimumConfidence(markets: MarketProbability[]): number;
function minimumConfidence(
  markets: MarketProbability[] | { home: MarketProbability; draw: MarketProbability; away: MarketProbability },
) {
  const values = Array.isArray(markets) ? markets : [markets.home, markets.draw, markets.away];
  return Math.min(...values.map((market) => market.confidence ?? 0));
}

function lowestQuality(markets: MarketProbability[]): MarketQuality['level'] {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return markets.reduce<MarketQuality['level']>((lowest, market) => {
    const level = market.quality?.level ?? 'low';
    return rank[level] < rank[lowest] ? level : lowest;
  }, 'high');
}

function oldestUpdate(markets: MarketProbability[]) {
  return markets.reduce((oldest, market) => {
    const timestamp = Date.parse(market.updatedAt);
    const oldestTimestamp = Date.parse(oldest);
    return Number.isFinite(timestamp) && (!Number.isFinite(oldestTimestamp) || timestamp < oldestTimestamp)
      ? market.updatedAt
      : oldest;
  }, '');
}

export async function fetchMarketData(
  homeTeam: string,
  awayTeam: string,
): Promise<MarketData | null> {
  const market = await fetchMarketProbabilities(homeTeam, awayTeam);
  if (!market) return null;

  const probabilities = { home: market.home, draw: market.draw, away: market.away };
  return {
    kind: 'real',
    source: 'polymarket',
    probabilities,
    odds: {
      home: 1 / probabilities.home,
      draw: 1 / probabilities.draw,
      away: 1 / probabilities.away,
    },
    status: market.status,
    confidence: market.confidence,
    quality: market.quality,
    auditable: market.auditable,
    lastUpdated: market.updatedAt,
    message: 'Read-only Polymarket prices matched to an explicit three-way event; no wallet or trading capability is used.',
  };
}

const hasPlaceholder = (teamId: string) => /^(?:W|L)\d+$/i.test(teamId);

export async function loadWorldCupMarketReferences(
  matches: WorldCupMatch[],
  teams: Record<string, WorldCupTeam>,
  options: { maxMatches?: number } = {},
): Promise<Record<string, MarketData>> {
  const maxMatches = options.maxMatches ?? 8;
  const candidates = matches
    .filter((match) => (
      match.status === 'scheduled'
      && match.source !== 'sample'
      && match.source !== 'local'
      && !hasPlaceholder(match.homeTeamId)
      && !hasPlaceholder(match.awayTeamId)
      && teams[match.homeTeamId]
      && teams[match.awayTeamId]
    ))
    .sort((left, right) => Date.parse(left.kickoff) - Date.parse(right.kickoff))
    .slice(0, maxMatches);

  const entries = await Promise.all(candidates.map(async (match) => {
    const market = await fetchMarketData(
      teams[match.homeTeamId].name,
      teams[match.awayTeamId].name,
    );
    return market ? [match.id, market] as const : null;
  }));

  return Object.fromEntries(entries.filter((entry): entry is readonly [string, MarketData] => entry !== null));
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
