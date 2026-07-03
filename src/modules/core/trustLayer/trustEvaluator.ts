import { createDataTrustInfo, type DataTrustInfo, type DataTruthLevel } from './dataTruth';

type TruthBearing = {
  truth?: DataTrustInfo;
};

type MatchLike = TruthBearing & {
  source?: string;
  lastUpdated?: string;
  venue?: string;
  city?: string;
};

type MarketLike = TruthBearing & {
  source?: string;
  status?: string;
  liquidity?: number;
  volume?: number;
  spread?: number;
  updatedAt?: string;
};

type PredictionLike = TruthBearing & {
  confidence?: 'low' | 'medium' | 'high';
  source?: string;
  matchId?: string;
};

const STALE_AFTER_MS = 15 * 60 * 1000;

const ageMs = (updatedAt?: string, now = Date.now()) => {
  const parsed = Date.parse(updatedAt ?? '');
  return Number.isFinite(parsed) ? now - parsed : Number.POSITIVE_INFINITY;
};

const isStaleTimestamp = (updatedAt?: string, now?: number) => ageMs(updatedAt, now) > STALE_AFTER_MS;

const fromLevel = (level: DataTruthLevel, description: string, sourceBreakdown: string[], confidence?: number) =>
  createDataTrustInfo(level, description, sourceBreakdown, confidence);

export function evaluateMatchTruth(match: MatchLike, now = Date.now()): DataTrustInfo {
  if (match.truth) return match.truth;
  const source = match.source ?? 'unknown';

  if (source === 'local') {
    return fromLevel('local_seed', 'Generated local World Cup fixture seed; not a live schedule feed.', [
      'World Cup fixture seed',
      match.venue ?? 'venue sample',
      match.city ?? 'city sample',
    ]);
  }

  if (source === 'manual') {
    return fromLevel('sample', 'Manually curated sample fixture; useful for education, not live data.', ['manual sample']);
  }

  if (isStaleTimestamp(match.lastUpdated, now)) {
    return fromLevel('stale', 'External fixture metadata is older than the freshness window.', [source, match.lastUpdated ?? 'missing timestamp']);
  }

  if (source === 'official') {
    return fromLevel('live', 'Official fixture metadata is active and inside the freshness window.', [
      source,
      match.lastUpdated ?? 'missing timestamp',
    ]);
  }

  if (['openfootball', 'api-football', 'sportmonks', 'real'].includes(source)) {
    return fromLevel('provider', 'Fresh third-party provider metadata; not an official fixture verification.', [
      source,
      match.lastUpdated ?? 'missing timestamp',
    ]);
  }

  return fromLevel('scaffold', 'Provider shape exists but no trusted data source is enabled.', [source]);
}

export function evaluateMarketTruth(market?: MarketLike | null, now = Date.now()): DataTrustInfo {
  if (market?.truth) return market.truth;
  if (!market) {
    return fromLevel('scaffold', 'Read-only market scaffold is present, but no Polymarket market is attached.', ['polymarket scaffold']);
  }

  if (market.status === 'stale' || isStaleTimestamp(market.updatedAt, now)) {
    return fromLevel('stale', 'Polymarket reference exists but is stale and should be heavily discounted.', [
      market.source ?? 'polymarket',
      market.updatedAt ?? 'missing timestamp',
    ]);
  }

  if (market.source === 'polymarket' && market.status === 'active') {
    const liquidity = Number.isFinite(market.liquidity) ? Number(market.liquidity) : 0;
    const spread = Number.isFinite(market.spread) ? Number(market.spread) : undefined;
    const confidencePenalty = liquidity < 2500 || (spread ?? 0) > 0.12 ? 0.2 : 0;
    return fromLevel(
      'live',
      'Live Polymarket reference data, weighted by liquidity, spread, and freshness.',
      ['polymarket gamma/clob', `liquidity ${liquidity}`, spread === undefined ? 'spread unknown' : `spread ${spread}`],
      0.82 - confidencePenalty,
    );
  }

  return fromLevel('scaffold', 'Market adapter has a shape but no live quality signal.', [market.source ?? 'unknown market']);
}

export function evaluatePredictionTruth(prediction?: PredictionLike | null): DataTrustInfo {
  if (prediction?.truth) return prediction.truth;
  const confidence = prediction?.confidence === 'high' ? 0.5 : prediction?.confidence === 'medium' ? 0.38 : 0.28;
  return fromLevel('local_seed', 'Model output is generated from local team ratings and seeded fixtures.', [
    'predictionEngine',
    prediction?.matchId ?? 'unknown match',
  ], confidence);
}
