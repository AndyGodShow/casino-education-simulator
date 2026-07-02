import type { WorldCupAdapterResult } from '../../../../../dataProviders/football/worldCupAdapter';
import { createUnifiedProbability, normalizeThreeWay } from '../../../../core/probability/unifiedProbability';
import { calibrateOutcomes } from '../calibration/outcomeCalibration';
import { trustedEducationalOdds } from '../data/educationalOdds';
import { calculateAccuracy, type PredictionResult } from '../logic/scoring';
import { predictMatch } from '../logic/predictionEngine';
import { calculatePredictionReliability } from '../logic/predictionReliability';
import { buildPredictionActionGate } from '../logic/predictionActionGate';
import { buildMatchAdvancedMetricTrust } from '../logic/advancedMetricTrust';
import { buildMatchIntelligenceLayer } from '../logic/matchIntelligenceLayer';
import { applyExternalMatchIntelligence, enrichMatchTeamsWithDerivedMetrics } from '../logic/teamMetricEnrichment';
import type { EnrichedMatchTeams, ScheduleContext } from '../logic/teamMetricEnrichment';
import { calculateModelMarketDeviation, calculateNoVigProbabilities } from '../logic/oddsEngine';
import { buildGroupMotivationContext, type GroupMotivationContext } from '../logic/groupMotivation';
import { buildDecisionLayer } from '../logic/predictionDecisionLayer';
import { WORLD_CUP_MODEL_CONFIG, type WorldCupStrategyCalibrationOverrides } from '../logic/modelConfig';
import {
  buildWorldCupBacktestSamplesFromParts,
  runWorldCupBacktest,
  type WorldCupCombinedCalibrationEvidenceGrade,
} from '../backtest';
import { actualOutcomeFromMatch } from '../logic/matchOutcome';
import { simulateManyTournaments } from '../logic/groupSimulation';
import {
  validate1X2FromScoreDist,
  validateLambdaRange,
  validateScoreDistSum,
} from '../logic/consistencyValidator';
import { hasUnresolvedTeamPlaceholder } from '../logic/teamPlaceholders';
import type {
  GroupSimulationState,
  MarketData,
  MatchDataQualityState,
  WorldCupCalibrationState,
  WorldCupDataSourceTier,
  WorldCupDomainModel,
  WorldCupPredictionAuditState,
  WorldCupDomainSource,
  WorldCupSourceGateState,
} from './WorldCupDomainModel';
import type { MatchExternalIntelligenceInput, MatchPrediction, PreMatchPredictionSnapshot, WorldCupMatch } from '../types';

const MINIMUM_CALIBRATION_SAMPLE_SIZE = 30;
const PROBABILITY_TOLERANCE = 1e-6;
const STALE_LOCAL_HOURS = 1;
const STALE_SAMPLE_HOURS = 1;
const STALE_PROVIDER_HOURS = 48;
const EDUCATIONAL_MARKET_CONFIDENCE = 0.35;

export type WorldCupAdapterResultWithMarkets = WorldCupAdapterResult & {
  markets?: Record<string, MarketData | null>;
  matchIntelligence?: Record<string, MatchExternalIntelligenceInput>;
  strategyCalibrationOverrides?: WorldCupStrategyCalibrationOverrides;
};

export type WorldCupDomainBuildOptions = {
  evaluationTimeMs?: number;
  combinedCalibrationEvidenceGrade?: WorldCupCombinedCalibrationEvidenceGrade;
  preMatchPredictions?: Record<string, MatchPrediction>;
  preMatchPredictionSnapshots?: Record<string, PreMatchPredictionSnapshot>;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const mapDomainSource = (result: WorldCupAdapterResult): WorldCupDomainSource => {
  if (result.source === 'official') return 'official';
  if (result.source === 'local') return 'local';
  if (result.source === 'sample' || result.source === 'manual') return 'sample';
  if (result.source === 'openfootball') return 'openfootball';
  if (result.source === 'api-football') return 'api';
  if (result.source === 'sportmonks') return 'sportmonks';

  const providerName = result.providerName.toLowerCase();
  if (providerName.includes('openfootball')) return 'openfootball';
  if (providerName.includes('sportmonks')) return 'sportmonks';
  if (providerName.includes('api-football')) return 'api';
  return 'sample';
};

const sourceTierLabels: Record<WorldCupDataSourceTier, string> = {
  official: 'Official fixture',
  verified_provider: 'Verified provider',
  sample: 'Sample fixtures',
  local: 'Local seed',
};

const sourceTier = (source: WorldCupMatch['source']): WorldCupDataSourceTier => {
  if (source === 'official') return 'official';
  if (source === 'local') return 'local';
  if (source === 'sample') return 'sample';
  return 'verified_provider';
};

const matchStalenessThreshold = (tier: WorldCupDataSourceTier) => {
  if (tier === 'local') return STALE_LOCAL_HOURS;
  if (tier === 'sample') return STALE_SAMPLE_HOURS;
  return STALE_PROVIDER_HOURS;
};

const deriveStaleness = (match: WorldCupMatch, tier: WorldCupDataSourceTier) => {
  const lastUpdated = Date.parse(match.lastUpdated);
  if (!Number.isFinite(lastUpdated)) {
    return { lastUpdated: 0, staleness: 'unknown' as const, stalenessHours: null };
  }

  const kickoff = Date.parse(match.kickoff);
  const reference = Number.isFinite(kickoff) ? Math.max(kickoff, lastUpdated) : lastUpdated;
  const stalenessHours = Math.max(0, (reference - lastUpdated) / 3_600_000);
  const staleness = stalenessHours > matchStalenessThreshold(tier) ? 'stale' as const : 'fresh' as const;

  return { lastUpdated, staleness, stalenessHours };
};

const buildMatchDataQuality = (matches: WorldCupMatch[]): Record<string, MatchDataQualityState> => Object.fromEntries(
  matches.map((match) => {
    const tier = sourceTier(match.source);
    const staleness = deriveStaleness(match, tier);
    const isOfficialFixture = tier === 'official';
    const isVerifiedProvider = tier === 'official' || tier === 'verified_provider';
    const hasVerifiedScore = isVerifiedProvider
      && match.status === 'finished'
      && typeof match.homeScore === 'number'
      && typeof match.awayScore === 'number';
    const canUseForRealPrediction = isOfficialFixture && staleness.staleness === 'fresh';
    const caveat = tier === 'official'
      ? '官方赛程口径；仍需结合结果校准，不代表投注建议。'
      : tier === 'verified_provider'
        ? '第三方 provider 数据已进入模型，但仍需官方赛程核验。'
        : tier === 'sample'
          ? '样例数据仅用于教育演示，不应用作真实赛事预测。'
          : '本地 seed 仅用于教育演示，不应用作真实赛事预测。';

    return [match.id, {
      matchId: match.id,
      source: match.source,
      tier,
      label: sourceTierLabels[tier],
      lastUpdated: staleness.lastUpdated,
      staleness: staleness.staleness,
      stalenessHours: staleness.stalenessHours,
      isOfficialFixture,
      isVerifiedProvider,
      hasVerifiedScore,
      canUseForRealPrediction,
      caveat,
    }];
  }),
);

const sourceGateFromQuality = (
  source: WorldCupDomainSource,
  matchDataQuality: Record<string, MatchDataQualityState>,
): WorldCupSourceGateState => {
  const qualities = Object.values(matchDataQuality);
  const hasOfficial = qualities.some((quality) => quality.tier === 'official');
  const hasVerifiedProvider = qualities.some((quality) => quality.tier === 'verified_provider');
  const canUseForRealPrediction = qualities.length > 0
    && qualities.every((quality) => quality.canUseForRealPrediction);

  if (hasOfficial && canUseForRealPrediction) {
    return {
      tier: 'official',
      label: 'Official fixture gate',
      canUseForRealPrediction: true,
      requiresOfficialVerification: false,
      message: '当前赛程通过官方口径门禁；预测仍需结果校准，不构成投注建议。',
    };
  }

  if (hasVerifiedProvider || source === 'api' || source === 'openfootball' || source === 'sportmonks') {
    return {
      tier: 'verified_provider',
      label: 'Verified provider gate',
      canUseForRealPrediction: false,
      requiresOfficialVerification: true,
      message: '第三方 provider 数据可用于模型估计，但仍需官方赛程核验，不能标记为真实赛事预测。',
    };
  }

  if (source === 'sample') {
    return {
      tier: 'sample',
      label: 'Sample data gate',
      canUseForRealPrediction: false,
      requiresOfficialVerification: true,
      message: '样例赛程只允许教育演示口径，不能进入真实赛事预测。',
    };
  }

  return {
    tier: 'local',
    label: 'Local seed gate',
    canUseForRealPrediction: false,
    requiresOfficialVerification: true,
    message: '本地 seed 只允许教育演示口径，不能进入真实赛事预测。',
  };
};

const buildSimulation = (adapterResult: WorldCupAdapterResult): GroupSimulationState => ({
  probabilities: simulateManyTournaments({
    iterations: 1000,
    truthLevelWeighting: true,
    matches: adapterResult.matches.filter((match) => !hasUnresolvedTeamPlaceholder(match)),
    teams: adapterResult.teams,
  }),
});

const deriveLastUpdated = (adapterResult: WorldCupAdapterResult) => {
  const latestMatchUpdate = adapterResult.matches.reduce((latest, match) => {
    const timestamp = Date.parse(match.lastUpdated);
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);

  return latestMatchUpdate || 0;
};

const DAY_MS = 86_400_000;

const teamPlaysMatch = (match: WorldCupMatch, teamId: string) =>
  match.homeTeamId === teamId || match.awayTeamId === teamId;

const restDaysBeforeMatch = (
  currentMatch: WorldCupMatch,
  teamId: string,
  matches: WorldCupMatch[],
) => {
  const currentKickoff = Date.parse(currentMatch.kickoff);
  if (!Number.isFinite(currentKickoff)) return undefined;

  const previousKickoff = matches.reduce((latest, match) => {
    if (match.id === currentMatch.id || !teamPlaysMatch(match, teamId)) return latest;
    const kickoff = Date.parse(match.kickoff);
    if (!Number.isFinite(kickoff) || kickoff >= currentKickoff) return latest;
    return Math.max(latest, kickoff);
  }, 0);

  return previousKickoff > 0 ? Number(((currentKickoff - previousKickoff) / DAY_MS).toFixed(2)) : undefined;
};

const hostTravelProxy = (team: WorldCupAdapterResult['teams'][string], match: WorldCupMatch) => {
  if (!match.city && !match.venue) return undefined;
  return team.isHost ? 0.05 : 0.35;
};

const buildScheduleContext = (
  match: WorldCupMatch,
  matches: WorldCupMatch[],
  teams: WorldCupAdapterResult['teams'],
): ScheduleContext => {
  const homeTeam = teams[match.homeTeamId];
  const awayTeam = teams[match.awayTeamId];

  return {
    homeRestDays: restDaysBeforeMatch(match, match.homeTeamId, matches),
    awayRestDays: restDaysBeforeMatch(match, match.awayTeamId, matches),
    homeTravelFatigue: homeTeam ? hostTravelProxy(homeTeam, match) : undefined,
    awayTravelFatigue: awayTeam ? hostTravelProxy(awayTeam, match) : undefined,
    source: 'fixture chronology + host travel proxy',
  };
};

const buildEnrichedMatchTeams = (
  match: WorldCupMatch,
  adapterResult: WorldCupAdapterResult,
): EnrichedMatchTeams | null => {
  const homeTeam = adapterResult.teams[match.homeTeamId];
  const awayTeam = adapterResult.teams[match.awayTeamId];
  if (!homeTeam || !awayTeam) return null;
  const adapterWithIntelligence = adapterResult as WorldCupAdapterResultWithMarkets;
  const externalIntelligence = applyExternalMatchIntelligence({
    match,
    homeTeam,
    awayTeam,
    feed: adapterWithIntelligence.matchIntelligence?.[match.id],
  });

  return enrichMatchTeamsWithDerivedMetrics({
    match,
    homeTeam: externalIntelligence.homeTeam,
    awayTeam: externalIntelligence.awayTeam,
    scheduleContext: buildScheduleContext(match, adapterResult.matches, adapterResult.teams),
  });
};

const buildCalibration = (
  matches: WorldCupMatch[],
  predictions: Record<string, MatchPrediction>,
): WorldCupCalibrationState => {
  const results = matches.flatMap((match): PredictionResult[] => {
    const outcome = actualOutcomeFromMatch(match);
    const prediction = predictions[match.id];
    if (!outcome || !prediction) return [];

    return [{
      probabilities: {
        home: prediction.probabilities.homeWin,
        draw: prediction.probabilities.draw,
        away: prediction.probabilities.awayWin,
      },
      outcome,
    }];
  });

  const outcomeCalibration = calibrateOutcomes(results);
  const sampleSize = outcomeCalibration.sampleSize;
  const hasResults = sampleSize > 0;
  const status = !hasResults
    ? 'no_results'
    : sampleSize < MINIMUM_CALIBRATION_SAMPLE_SIZE
      ? 'insufficient_sample'
      : 'ready';

  const message = status === 'ready'
    ? `已有 ${sampleSize} 场带真实比分的比赛，可用于初步校准。`
    : status === 'insufficient_sample'
      ? `只有 ${sampleSize} 场带真实比分的比赛，样本不足，不能证明模型准确。`
      : '暂无同时具备真实比分和赛前预测快照的完赛样本，模型尚未经过可信结果回测。';

  return {
    status,
    sampleSize,
    minimumSampleSize: MINIMUM_CALIBRATION_SAMPLE_SIZE,
    brierScore: hasResults ? outcomeCalibration.brierScore : null,
    logLoss: hasResults ? outcomeCalibration.logLoss : null,
    accuracy: hasResults ? calculateAccuracy(results) : null,
    brierReference: outcomeCalibration.brierReference,
    calibrationError: hasResults ? outcomeCalibration.overconfidence.calibrationError : null,
    message,
  };
};

const probabilityDrift = (actual: number, expected: number) => Math.abs(actual - expected);

const auditPrediction = (prediction: MatchPrediction) => {
  const warnings: string[] = [];
  const decisionLayer = prediction.decisionLayer;
  const probabilitySum = prediction.probabilities.homeWin
    + prediction.probabilities.draw
    + prediction.probabilities.awayWin;

  warnings.push(...validateLambdaRange(decisionLayer.expectedGoals.home, 'home').warnings);
  warnings.push(...validateLambdaRange(decisionLayer.expectedGoals.away, 'away').warnings);
  warnings.push(...validateScoreDistSum(decisionLayer.scoreDistribution).warnings);
  warnings.push(...validate1X2FromScoreDist(decisionLayer.scoreDistribution, decisionLayer.oneX2).warnings);

  if (Math.abs(probabilitySum - 1) > PROBABILITY_TOLERANCE) {
    warnings.push(`Top-level 1X2 sum=${probabilitySum.toFixed(8)} deviates from 1.0`);
  }

  const drifts = [
    probabilityDrift(prediction.probabilities.homeWin, decisionLayer.oneX2.homeWin),
    probabilityDrift(prediction.probabilities.draw, decisionLayer.oneX2.draw),
    probabilityDrift(prediction.probabilities.awayWin, decisionLayer.oneX2.awayWin),
  ];
  const maxProbabilityDrift = Math.max(...drifts);

  if (maxProbabilityDrift > PROBABILITY_TOLERANCE) {
    warnings.push(`Top-level probabilities drift from decision layer by ${maxProbabilityDrift.toFixed(8)}`);
  }

  if (!Number.isFinite(prediction.confidence) || prediction.confidence < 0 || prediction.confidence > 1) {
    warnings.push(`Confidence=${prediction.confidence.toFixed(8)} outside [0, 1]`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    maxProbabilityDrift,
  };
};

const buildPredictionAudit = (predictions: Record<string, MatchPrediction>): WorldCupPredictionAuditState => {
  const audits = Object.values(predictions).map(auditPrediction);

  if (audits.length === 0) {
    return {
      status: 'warning',
      checkedMatches: 0,
      passedMatches: 0,
      warningCount: 1,
      maxProbabilityDrift: 0,
      message: '暂无可自检的预测样本，需等待赛程进入 Domain Model。',
    };
  }

  const passedMatches = audits.filter((audit) => audit.valid).length;
  const warningCount = audits.reduce((sum, audit) => sum + audit.warnings.length, 0);
  const maxProbabilityDrift = Math.max(...audits.map((audit) => audit.maxProbabilityDrift));
  const status = warningCount === 0
    ? 'passed'
    : passedMatches === 0
      ? 'failed'
      : 'warning';

  const message = status === 'passed'
    ? `已自检 ${audits.length} 场预测：λ、比分分布、胜平负概率和顶层展示一致。`
    : status === 'warning'
      ? `已自检 ${audits.length} 场预测，其中 ${audits.length - passedMatches} 场存在推导警告。`
      : `已自检 ${audits.length} 场预测，当前推导链条未通过一致性检查。`;

  return {
    status,
    checkedMatches: audits.length,
    passedMatches,
    warningCount,
    maxProbabilityDrift,
    message,
  };
};

const predictionModelProbability = (prediction: MatchPrediction) => ({
  home: prediction.probabilities.homeWin,
  draw: prediction.probabilities.draw,
  away: prediction.probabilities.awayWin,
});

const marketQualityRank = {
  low: 0,
  medium: 1,
  high: 2,
} as const;

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

const isUsableRealMarket = (
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

const applyGroupMotivationAdjustment = (
  prediction: MatchPrediction,
  motivationContext: GroupMotivationContext | undefined,
): MatchPrediction => {
  if (!motivationContext) return prediction;

  const config = WORLD_CUP_MODEL_CONFIG.featureLayer.motivation;
  const urgencyGap = motivationContext.home.urgency - motivationContext.away.urgency;
  const directionalShift = clamp(
    (urgencyGap / config.urgencyScale) * config.maxDirectionalLambdaShift,
    -config.maxDirectionalLambdaShift,
    config.maxDirectionalLambdaShift,
  );
  const avgUrgency = (motivationContext.home.urgency + motivationContext.away.urgency) / 2;
  const tempoShift = avgUrgency >= config.highTempoUrgency ? config.maxTempoLambdaShift : 0;
  const lambdaHome = clamp(prediction.expectedGoals.home + directionalShift + tempoShift, 0.2, 4.5);
  const lambdaAway = clamp(prediction.expectedGoals.away - directionalShift + tempoShift, 0.2, 4.5);

  if (
    Math.abs(lambdaHome - prediction.expectedGoals.home) < 1e-9
    && Math.abs(lambdaAway - prediction.expectedGoals.away) < 1e-9
  ) {
    return prediction;
  }

  const decisionLayer = buildDecisionLayer(lambdaHome, lambdaAway);
  const scoreDistribution = decisionLayer.scoreDistribution
    .map(({ home, away, probability }) => ({ score: `${home}-${away}`, probability }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 8);
  const favoriteProb = Math.max(decisionLayer.oneX2.homeWin, decisionLayer.oneX2.awayWin);
  const favoriteSide = decisionLayer.oneX2.homeWin >= decisionLayer.oneX2.awayWin ? 'home' : 'away';
  const structuredFactor = prediction.explanation.factors[0]
    ? {
      ...prediction.explanation.factors[0],
      impact: clamp((lambdaHome - lambdaAway) / 2.5, -1, 1),
      description: `λ after structured features and group-table urgency adjustment. Home λ=${lambdaHome.toFixed(2)}, Away λ=${lambdaAway.toFixed(2)}.`,
    }
    : undefined;
  const motivationFactor = {
    name: 'Group qualification motivation',
    impact: clamp(directionalShift / config.maxDirectionalLambdaShift, -1, 1),
    description: `Adjusted λ from group-table urgency. Home ${motivationContext.home.pressure} urgency=${motivationContext.home.urgency.toFixed(2)}, away ${motivationContext.away.pressure} urgency=${motivationContext.away.urgency.toFixed(2)}.`,
  };
  const featureLayer = prediction.featureLayer
    ? {
      ...prediction.featureLayer,
      home: {
        ...prediction.featureLayer.home,
        lambda: lambdaHome,
      },
      away: {
        ...prediction.featureLayer.away,
        lambda: lambdaAway,
      },
    }
    : prediction.featureLayer;

  return {
    ...prediction,
    probabilities: {
      homeWin: decisionLayer.oneX2.homeWin,
      draw: decisionLayer.oneX2.draw,
      awayWin: decisionLayer.oneX2.awayWin,
    },
    expectedGoals: {
      home: lambdaHome,
      away: lambdaAway,
    },
    scoreDistribution,
    mostLikelyScore: `${decisionLayer.mostLikelyScore.home}-${decisionLayer.mostLikelyScore.away}`,
    confidence: decisionLayer.confidence,
    explanation: {
      summary: `Prediction V2 favors ${favoriteSide} with ${(favoriteProb * 100).toFixed(1)}% top-side probability after group motivation context.`,
      factors: [
        ...(structuredFactor ? [structuredFactor] : []),
        motivationFactor,
        ...prediction.explanation.factors.slice(1),
      ],
    },
    unifiedProbability: createUnifiedProbability({
      matchId: prediction.matchId,
      model: {
        home: decisionLayer.oneX2.homeWin,
        draw: decisionLayer.oneX2.draw,
        away: decisionLayer.oneX2.awayWin,
      },
      truth: prediction.truth,
    }),
    decisionLayer,
    featureLayer,
  };
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
  const canUseForFusion = isUsableRealMarket(suppliedMarket, matchQuality, evaluationTimeMs);
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

const attachMarketReference = (
  prediction: MatchPrediction,
  marketData: MarketData | null,
  matchQuality: MatchDataQualityState | undefined,
  evaluationTimeMs: number,
): MatchPrediction => {
  if (!isUsableRealMarket(marketData, matchQuality, evaluationTimeMs)) return prediction;
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

export function buildWorldCupDomain(
  adapterResult: WorldCupAdapterResultWithMarkets,
  options: WorldCupDomainBuildOptions = {},
): WorldCupDomainModel {
  const adapterWithMarkets = adapterResult as WorldCupAdapterResultWithMarkets;
  const evaluationTimeMs = options.evaluationTimeMs ?? deriveLastUpdated(adapterResult);
  const matchesById = Object.fromEntries(adapterResult.matches.map((match) => [match.id, match]));
  const validPreMatchPredictionSnapshots = Object.fromEntries(
    Object.entries(options.preMatchPredictionSnapshots ?? {}).filter(([matchId, snapshot]) => {
      const match = matchesById[matchId];
      return Boolean(
        match
        && snapshot.matchId === match.id
        && snapshot.homeTeamId === match.homeTeamId
        && snapshot.awayTeamId === match.awayTeamId
        && snapshot.kickoff === match.kickoff
        && Date.parse(snapshot.capturedAt) < Date.parse(match.kickoff),
      );
    }),
  );
  const preMatchPredictions = {
    ...Object.fromEntries(
      Object.entries(validPreMatchPredictionSnapshots)
        .map(([matchId, snapshot]) => [matchId, snapshot.prediction]),
    ),
    ...(options.preMatchPredictions ?? {}),
  };
  const motivationContexts: Record<string, GroupMotivationContext | undefined> = Object.fromEntries(
    adapterResult.matches.map((match) => [match.id, buildGroupMotivationContext(match, adapterResult.matches)]),
  );
  const enrichedTeamsByMatchId: Record<string, EnrichedMatchTeams> = Object.fromEntries(
    adapterResult.matches.flatMap((match) => {
      if (hasUnresolvedTeamPlaceholder(match)) return [];
      const enriched = buildEnrichedMatchTeams(match, adapterResult);
      return enriched ? [[match.id, enriched]] : [];
    }),
  );
  const modelEstimates: Record<string, MatchPrediction> = Object.fromEntries(
    adapterResult.matches.flatMap((match) => {
      if (hasUnresolvedTeamPlaceholder(match)) return [];
      const enriched = enrichedTeamsByMatchId[match.id];
      return enriched ? [[
        match.id,
        applyGroupMotivationAdjustment(
          predictMatch(match, enriched.homeTeam, enriched.awayTeam, {
            strategyCalibrationOverrides: adapterWithMarkets.strategyCalibrationOverrides,
          }),
          motivationContexts[match.id],
        ),
      ]] : [];
    }),
  );
  const predictions: Record<string, MatchPrediction> = Object.fromEntries(
    Object.entries(modelEstimates).filter(([matchId]) => matchesById[matchId]?.status !== 'finished'),
  );
  const calibration = buildCalibration(adapterResult.matches, preMatchPredictions);
  const matchDataQuality = buildMatchDataQuality(adapterResult.matches);
  const markets: Record<string, MarketData | null> = Object.fromEntries(
    adapterResult.matches.map((match) => {
      const prediction = modelEstimates[match.id];
      if (!prediction) return [match.id, null];
      const suppliedMarket = adapterWithMarkets.markets?.[match.id];
      return [
        match.id,
        suppliedMarket
          ? buildRealMarketReference(
            prediction,
            suppliedMarket,
            matchDataQuality[match.id],
            evaluationTimeMs,
          )
          : buildEducationalMarketReference(prediction),
      ];
    }),
  );
  const intelligence = Object.fromEntries(
    Object.entries(modelEstimates).flatMap(([matchId]) => {
      const match = matchesById[matchId];
      const enriched = enrichedTeamsByMatchId[matchId];
      if (!match || !enriched) return [];
      const marketData = markets[matchId];
      const hasUsableMarketData = isUsableRealMarket(
        marketData,
        matchDataQuality[matchId],
        evaluationTimeMs,
      );

      return [[matchId, buildMatchIntelligenceLayer({
        match,
        homeTeam: enriched.homeTeam,
        awayTeam: enriched.awayTeam,
        matchDataQuality: matchDataQuality[matchId],
        hasMarketData: hasUsableMarketData,
        scheduleContext: buildScheduleContext(match, adapterResult.matches, adapterResult.teams),
        motivationContext: motivationContexts[matchId],
      })]];
    }),
  );
  const predictionsWithIntelligence: Record<string, MatchPrediction> = Object.fromEntries(
    Object.entries(predictions).map(([matchId, prediction]) => [
      matchId,
      {
        ...attachMarketReference(
          prediction,
          markets[matchId],
          matchDataQuality[matchId],
          evaluationTimeMs,
        ),
        intelligenceLayer: intelligence[matchId] ?? prediction.intelligenceLayer,
      },
    ]),
  );
  const predictionAudit = buildPredictionAudit(predictionsWithIntelligence);
  const predictionReliability = Object.fromEntries(
    Object.values(predictionsWithIntelligence).flatMap((prediction) => {
      const quality = matchDataQuality[prediction.matchId];
      if (!quality) return [];
      const enriched = enrichedTeamsByMatchId[prediction.matchId];
      const advancedMetricTrust = enriched
        ? buildMatchAdvancedMetricTrust(enriched.homeTeam, enriched.awayTeam, quality.lastUpdated)
        : undefined;

      return [[prediction.matchId, calculatePredictionReliability({
        matchId: prediction.matchId,
        rawConfidence: prediction.confidence,
        inputCoverage: prediction.featureLayer?.metadata.inputCoverage,
        advancedMetricTrust,
        intelligenceLayer: prediction.intelligenceLayer,
        matchDataQuality: quality,
        calibration,
        combinedCalibrationEvidenceGrade: options.combinedCalibrationEvidenceGrade,
        predictionAudit,
      })]];
    }),
  );
  const actionGates = Object.fromEntries(
    Object.values(predictionsWithIntelligence).flatMap((prediction) => {
      const quality = matchDataQuality[prediction.matchId];
      const reliability = predictionReliability[prediction.matchId];
      if (!quality || !reliability) return [];

      return [[prediction.matchId, buildPredictionActionGate({
        matchId: prediction.matchId,
        reliability,
        matchDataQuality: quality,
        calibration,
        intelligenceLayer: prediction.intelligenceLayer,
        marketDeviation: isUsableRealMarket(
          markets[prediction.matchId],
          quality,
          evaluationTimeMs,
        )
          ? markets[prediction.matchId]?.deviation
          : null,
        prediction,
      })]];
    }),
  );
  const preMatchBacktestSamples = buildWorldCupBacktestSamplesFromParts({
    matches: adapterResult.matches,
    predictions: preMatchPredictions,
    matchDataQuality,
    predictionReliability,
    predictionOrigin: 'pre_match_snapshot',
  });
  const reconstructedBacktestSamples = buildWorldCupBacktestSamplesFromParts({
    matches: adapterResult.matches,
    predictions: modelEstimates,
    matchDataQuality,
    predictionReliability,
    predictionOrigin: 'post_match_reconstruction',
  }).filter((sample) => !preMatchPredictions[sample.matchId]);
  const backtestSamples = [
    ...preMatchBacktestSamples,
    ...reconstructedBacktestSamples,
  ];
  const backtest = runWorldCupBacktest(backtestSamples);
  const source = mapDomainSource(adapterResult);
  const sourceGate = sourceGateFromQuality(source, matchDataQuality);

  return {
    matches: adapterResult.matches,
    teams: adapterResult.teams,
    predictions: predictionsWithIntelligence,
    intelligence,
    actionGates,
    markets,
    simulation: buildSimulation(adapterResult),
    calibration,
    predictionAudit,
    backtest,
    backtestSamples,
    predictionReliability,
    preMatchPredictionSnapshots: validPreMatchPredictionSnapshots,
    sourceGate,
    matchDataQuality,
    source,
    lastUpdated: deriveLastUpdated(adapterResult),
    errors: adapterResult.errors,
  };
}
