import { createUnifiedProbability, normalizeThreeWay } from '../../../../core/probability/unifiedProbability';
import { trustedEducationalOdds } from '../data/educationalOdds';
import { calculateModelMarketDeviation, calculateNoVigProbabilities } from '../logic/oddsEngine';
import { WORLD_CUP_MODEL_CONFIG } from '../logic/modelConfig';
import type { MatchPrediction } from '../types';
import type { MarketData, MatchDataQualityState } from './WorldCupDomainModel';

const EDUCATIONAL_MARKET_CONFIDENCE = 0.35;

const marketQualityRank = {
  low: 0,
  medium: 1,
  high: 2,
} as const;

const predictionModelProbability = (prediction: MatchPrediction) => ({
  home: prediction.probabilities.homeWin,
  draw: prediction.probabilities.draw,
  away: prediction.probabilities.awayWin,
});

const marketProbabilities = (marketData: MarketData) => {
  if (marketData.probabilities) return normalizeThreeWay(marketData.probabilities);
  return marketData.odds ? calculateNoVigProbabilities(marketData.odds) : null;
};

const marketOdds = (marketData: MarketData) => {
  if (marketData.odds) return marketData.odds;
  const probabilities = marketData.probabilities ? normalizeThreeWay(marketData.probabilities) : null;
  if (!probabilities) return null;

  return {
    home: 1 / probabilities.home,
    draw: 1 / probabilities.draw,
    away: 1 / probabilities.away,
  };
};

const marketFreshnessMinutes = (marketData: MarketData, evaluationTimeMs: number) => {
  const updatedAt = Date.parse(marketData.lastUpdated ?? '');
  if (!Number.isFinite(updatedAt)) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(evaluationTimeMs) || updatedAt > evaluationTimeMs) return Number.POSITIVE_INFINITY;
  return (evaluationTimeMs - updatedAt) / 60_000;
};

export const isWorldCupMarketUsableForFusion = (
  marketData: MarketData | null | undefined,
  matchQuality: MatchDataQualityState | undefined,
  evaluationTimeMs: number,
) => {
  if (!marketData || marketData.status !== 'available') return false;
  if (marketData.kind !== 'real') return false;
  if (marketData.auditable !== true) return false;
  if (!matchQuality?.canUseForRealPrediction) return false;
  if (!marketProbabilities(marketData) || !marketOdds(marketData)) return false;
  if ((marketData.confidence ?? 0) < WORLD_CUP_MODEL_CONFIG.marketFusion.minimumConfidence) return false;
  const minimumQuality = marketQualityRank[WORLD_CUP_MODEL_CONFIG.marketFusion.minimumQuality];
  if (marketQualityRank[marketData.quality ?? 'low'] < minimumQuality) return false;
  return marketFreshnessMinutes(marketData, evaluationTimeMs) <= WORLD_CUP_MODEL_CONFIG.marketFusion.maxStalenessMinutes;
};

const buildEducationalMarketReference = (prediction: MatchPrediction): MarketData => {
  const odds = trustedEducationalOdds.odds;
  const market = calculateNoVigProbabilities(odds);

  return {
    kind: 'educational',
    source: 'educationalOdds',
    odds,
    deviation: calculateModelMarketDeviation({
      model: predictionModelProbability(prediction),
      market,
      odds,
      marketConfidence: EDUCATIONAL_MARKET_CONFIDENCE,
    }),
    status: 'available',
    confidence: EDUCATIONAL_MARKET_CONFIDENCE,
    quality: 'low',
    auditable: false,
    message: `${trustedEducationalOdds.truth.description} 用于展示模型与市场参照的分歧，不是真实赔率或投注建议。`,
  };
};

const buildRealMarketReference = (
  prediction: MatchPrediction,
  suppliedMarket: MarketData,
  matchQuality: MatchDataQualityState | undefined,
  evaluationTimeMs: number,
): MarketData => {
  const probabilities = marketProbabilities(suppliedMarket);
  const odds = marketOdds(suppliedMarket);

  if (!probabilities || !odds) {
    return {
      ...suppliedMarket,
      kind: 'real',
      status: 'error',
      deviation: null,
      message: `${suppliedMarket.message} Market probabilities or odds are invalid, so it was excluded from fusion.`,
    };
  }

  const freshnessMinutes = marketFreshnessMinutes(suppliedMarket, evaluationTimeMs);
  const hasFreshMarket = freshnessMinutes <= WORLD_CUP_MODEL_CONFIG.marketFusion.maxStalenessMinutes;
  const hasEnoughConfidence = (suppliedMarket.confidence ?? 0) >= WORLD_CUP_MODEL_CONFIG.marketFusion.minimumConfidence;
  const minimumQuality = marketQualityRank[WORLD_CUP_MODEL_CONFIG.marketFusion.minimumQuality];
  const hasEnoughQuality = marketQualityRank[suppliedMarket.quality ?? 'low'] >= minimumQuality;
  const referenceAvailable = suppliedMarket.status === 'available'
    && suppliedMarket.auditable === true
    && hasFreshMarket
    && hasEnoughConfidence
    && hasEnoughQuality;
  const canUseForFusion = isWorldCupMarketUsableForFusion(suppliedMarket, matchQuality, evaluationTimeMs);
  const status = referenceAvailable
    ? 'available'
    : !hasFreshMarket
      ? 'stale'
      : 'empty';
  const exclusionReasons = [
    suppliedMarket.auditable === true ? null : 'missing auditable provenance',
    matchQuality?.canUseForRealPrediction ? null : 'fixture source is not official fresh data',
    hasFreshMarket ? null : `market is older than ${WORLD_CUP_MODEL_CONFIG.marketFusion.maxStalenessMinutes} minutes`,
    hasEnoughConfidence ? null : 'market confidence is below fusion threshold',
    hasEnoughQuality ? null : 'market quality is below fusion threshold',
  ].filter((reason): reason is string => Boolean(reason));

  return {
    ...suppliedMarket,
    kind: 'real',
    odds,
    probabilities,
    status,
    deviation: canUseForFusion
      ? calculateModelMarketDeviation({
        model: predictionModelProbability(prediction),
        market: probabilities,
        odds,
        marketConfidence: suppliedMarket.confidence,
      })
      : null,
    message: canUseForFusion
      ? `${suppliedMarket.message} Fresh auditable real market accepted for probability fusion.`
      : referenceAvailable
        ? `${suppliedMarket.message} Displayed as a read-only reference but excluded from probability fusion: ${exclusionReasons.join('; ')}.`
        : `${suppliedMarket.message} Excluded from probability fusion: ${exclusionReasons.join('; ')}.`,
  };
};

export const buildWorldCupMarketReference = (
  prediction: MatchPrediction,
  suppliedMarket: MarketData | null | undefined,
  matchQuality: MatchDataQualityState | undefined,
  evaluationTimeMs: number,
) => suppliedMarket
  ? buildRealMarketReference(prediction, suppliedMarket, matchQuality, evaluationTimeMs)
  : buildEducationalMarketReference(prediction);

export const applyWorldCupMarketReference = (
  prediction: MatchPrediction,
  marketData: MarketData | null,
  matchQuality: MatchDataQualityState | undefined,
  evaluationTimeMs: number,
): MatchPrediction => {
  if (!isWorldCupMarketUsableForFusion(marketData, matchQuality, evaluationTimeMs)) return prediction;
  const market = marketData ? marketProbabilities(marketData) : null;
  if (!market) return prediction;

  return {
    ...prediction,
    unifiedProbability: createUnifiedProbability({
      matchId: prediction.matchId,
      model: predictionModelProbability(prediction),
      market,
      marketConfidence: marketData?.confidence,
      truth: prediction.truth,
    }),
  };
};
