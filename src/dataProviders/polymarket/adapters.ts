import type { ClobOrderBook, GammaMarket, MarketProbability, MarketQuality, OrderBookSummary } from './types';
import { isMarketActive, markStaleIfNeeded, parseJsonArray } from './guards';
import { evaluateMarketTruth } from '../../modules/core/trustLayer/trustEvaluator';

const toNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function marketQualityScore(input: {
  liquidity?: number;
  volume?: number;
  spread?: number;
  freshnessMs?: number;
  bestBid?: number;
  bestAsk?: number;
}): MarketQuality {
  const warnings: string[] = [];
  const liquidityScore = Math.min(1, (input.liquidity ?? 0) / 10000);
  const spread = input.spread ?? (input.bestBid && input.bestAsk ? input.bestAsk - input.bestBid : 1);
  const spreadScore = Math.max(0, 1 - spread / 0.12);
  const volumeScore = Math.min(1, (input.volume ?? 0) / 50000);
  const freshnessScore = Math.max(0, 1 - (input.freshnessMs ?? 900000) / 900000);
  const confidencePenalty = Math.min(0.75, (1 - liquidityScore) * 0.25 + (1 - spreadScore) * 0.35 + (1 - freshnessScore) * 0.4);
  const score = Math.round((liquidityScore * 0.4 + spreadScore * 0.3 + volumeScore * 0.2 + freshnessScore * 0.1) * 100);

  if (liquidityScore < 0.25) warnings.push('Low liquidity can exaggerate price gaps.');
  if (spreadScore < 0.4) warnings.push('Wide spread makes the implied probability noisy.');
  if (freshnessScore < 0.35) warnings.push('Market data may be stale.');

  return {
    score,
    level: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
    warnings,
    liquidityQuality: liquidityScore,
    spreadQuality: spreadScore,
    freshness: freshnessScore,
    confidencePenalty,
  };
}

export function computeMarketConfidence(market: Pick<MarketProbability, 'liquidity' | 'volume' | 'spread' | 'updatedAt' | 'bestBid' | 'bestAsk' | 'status'>) {
  const updatedAt = Date.parse(market.updatedAt);
  const freshnessMs = Number.isFinite(updatedAt) ? Date.now() - updatedAt : 900000;
  const quality = marketQualityScore({
    liquidity: market.liquidity,
    volume: market.volume,
    spread: market.spread,
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    freshnessMs,
  });
  const stalePenalty = market.status === 'stale' ? 0.45 : 0;
  return Math.max(0, Math.min(1, quality.score / 100 - quality.confidencePenalty - stalePenalty));
}

export function adaptGammaMarket(market: GammaMarket): MarketProbability[] {
  const outcomes = parseJsonArray(market.outcomes);
  const tokenIds = parseJsonArray(market.clobTokenIds);
  const prices = parseJsonArray(market.outcomePrices);
  const updatedAt = market.updatedAt ?? new Date(0).toISOString();

  return outcomes.map((outcome, index) => {
    const freshnessMs = Math.max(0, Date.now() - Date.parse(updatedAt));
    const quality = marketQualityScore({
      liquidity: toNumber(market.liquidity),
      volume: toNumber(market.volume),
      freshnessMs,
    });
    const adapted = markStaleIfNeeded({
      marketId: market.id ?? market.conditionId ?? market.slug ?? 'unknown',
      eventId: market.eventId,
      title: market.question ?? market.title ?? 'Untitled market',
      outcome,
      tokenId: tokenIds[index],
      price: toNumber(prices[index]),
      impliedProbability: Math.max(0, Math.min(1, toNumber(prices[index]))),
      volume: toNumber(market.volume),
      liquidity: toNumber(market.liquidity),
      updatedAt,
      status: market.closed ? 'closed' : market.resolved ? 'resolved' : 'active',
      source: 'polymarket',
      quality,
      liquidityQuality: quality.liquidityQuality,
      spreadQuality: quality.spreadQuality,
      freshness: quality.freshness,
      confidencePenalty: quality.confidencePenalty,
    });
    const confidence = computeMarketConfidence(adapted);
    return {
      ...adapted,
      confidence,
      truth: evaluateMarketTruth(adapted),
    };
  });
}

export const calculateMarketQuality = marketQualityScore;

export function calculateBestBidAsk(book: Pick<ClobOrderBook, 'bids' | 'asks'>) {
  const bids = (book.bids ?? []).map((bid) => toNumber(bid.price, Number.NaN)).filter(Number.isFinite);
  const asks = (book.asks ?? []).map((ask) => toNumber(ask.price, Number.NaN)).filter(Number.isFinite);
  return {
    bestBid: bids.length ? Math.max(...bids) : undefined,
    bestAsk: asks.length ? Math.min(...asks) : undefined,
  };
}

export function calculateSpread(bestBid?: number, bestAsk?: number) {
  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return undefined;
  return Math.max(0, Number(bestAsk) - Number(bestBid));
}

export function normalizeClobBook(book: ClobOrderBook): OrderBookSummary {
  const { bestBid, bestAsk } = calculateBestBidAsk(book);
  return {
    tokenId: book.tokenId ?? 'unknown',
    bestBid,
    bestAsk,
    spread: calculateSpread(bestBid, bestAsk),
    updatedAt: book.updatedAt ?? new Date(0).toISOString(),
  };
}

export const shouldExcludeMarket = (market: GammaMarket) => !isMarketActive(market);
