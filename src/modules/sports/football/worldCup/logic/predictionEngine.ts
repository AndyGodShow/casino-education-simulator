import type {
  MatchEvidenceCalibration,
  MatchFeatureLayer,
  MatchPrediction,
  ScoreDistributionEntry,
  WorldCupMatch,
  WorldCupTeam,
} from '../types';
import { createUnifiedProbability } from '../../../../core/probability/unifiedProbability';
import { evaluateMatchTruth } from '../../../../core/trustLayer/trustEvaluator';
import { buildDecisionLayer } from './predictionDecisionLayer';
import { buildMatchFeatureLayer, compressGoalExpectation } from './featureLayer';
import { buildMatchIntelligenceLayer } from './matchIntelligenceLayer';
import { WORLD_CUP_MODEL_CONFIG, type WorldCupStrategyCalibrationOverrides } from './modelConfig';

export type PredictionEngineOptions = {
  strategyCalibrationOverrides?: WorldCupStrategyCalibrationOverrides;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const safeRating = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

const normalizeImpact = (value: number, scale: number) => clamp(value / scale, -1, 1);

const bucketedProduct = (values: number[], max: number) => clamp(
  values.reduce((product, value) => product * value, 1),
  0,
  max,
);

const calibrationMultiplier = (overrideValue: number | undefined, defaultValue: number, max: number) => {
  if (typeof overrideValue !== 'number' || !Number.isFinite(overrideValue)) return defaultValue;
  return clamp(overrideValue, 0.5, max);
};

const evidenceCalibrationConfig = (overrides?: WorldCupStrategyCalibrationOverrides) => {
  const config = WORLD_CUP_MODEL_CONFIG.featureLayer.evidenceCalibration;
  const shrinkageMultiplier = {
    knockout: calibrationMultiplier(overrides?.shrinkageMultiplier?.knockout, config.shrinkageMultiplier.knockout, 1.8),
    close: calibrationMultiplier(overrides?.shrinkageMultiplier?.close, config.shrinkageMultiplier.close, 1.8),
    mismatch: calibrationMultiplier(overrides?.shrinkageMultiplier?.mismatch, config.shrinkageMultiplier.mismatch, 1.8),
    lowTempo: calibrationMultiplier(overrides?.shrinkageMultiplier?.lowTempo, config.shrinkageMultiplier.lowTempo, 1.8),
    lowCoverage: calibrationMultiplier(overrides?.shrinkageMultiplier?.lowCoverage, config.shrinkageMultiplier.lowCoverage, 1.8),
    highCoverage: calibrationMultiplier(overrides?.shrinkageMultiplier?.highCoverage, config.shrinkageMultiplier.highCoverage, 1.8),
  };
  const drawMultiplierMax = calibrationMultiplier(
    overrides?.drawCorrectionMultiplier?.max,
    config.drawCorrectionMultiplier.max,
    2,
  );
  const drawCorrectionMultiplier = {
    knockout: calibrationMultiplier(overrides?.drawCorrectionMultiplier?.knockout, config.drawCorrectionMultiplier.knockout, drawMultiplierMax),
    close: calibrationMultiplier(overrides?.drawCorrectionMultiplier?.close, config.drawCorrectionMultiplier.close, drawMultiplierMax),
    mismatch: calibrationMultiplier(overrides?.drawCorrectionMultiplier?.mismatch, config.drawCorrectionMultiplier.mismatch, drawMultiplierMax),
    lowTempo: calibrationMultiplier(overrides?.drawCorrectionMultiplier?.lowTempo, config.drawCorrectionMultiplier.lowTempo, drawMultiplierMax),
    lowCoverage: calibrationMultiplier(overrides?.drawCorrectionMultiplier?.lowCoverage, config.drawCorrectionMultiplier.lowCoverage, drawMultiplierMax),
    max: drawMultiplierMax,
  };

  return {
    ...config,
    shrinkageMultiplier,
    drawCorrectionMultiplier,
  };
};

function buildEvidenceCalibrationProfile(
  match: WorldCupMatch,
  featureLayer: MatchFeatureLayer,
  overrides?: WorldCupStrategyCalibrationOverrides,
): MatchEvidenceCalibration['profile'] {
  const config = evidenceCalibrationConfig(overrides);
  const coverage = featureLayer.metadata.inputCoverage.overallRatio;
  const lambdaDiff = Math.abs(featureLayer.home.lambda - featureLayer.away.lambda);
  const totalGoals = featureLayer.home.lambda + featureLayer.away.lambda;
  const stageBucket = match.stage === 'group' ? 'group' : 'knockout';
  const edgeBucket = lambdaDiff <= config.buckets.closeEdgeThreshold
    ? 'close'
    : lambdaDiff >= config.buckets.mismatchEdgeThreshold
      ? 'mismatch'
      : 'balanced';
  const tempoBucket = totalGoals <= config.buckets.lowTempoGoalThreshold
    ? 'low'
    : totalGoals >= config.buckets.highTempoGoalThreshold
      ? 'high'
      : 'normal';
  const coverageBucket = coverage < config.buckets.lowCoverageThreshold
    ? 'low'
    : coverage < config.buckets.partialCoverageThreshold
      ? 'partial'
      : 'high';

  const shrinkageMultipliers = [
    stageBucket === 'knockout' ? config.shrinkageMultiplier.knockout : 1,
    edgeBucket === 'close' ? config.shrinkageMultiplier.close : 1,
    edgeBucket === 'mismatch' ? config.shrinkageMultiplier.mismatch : 1,
    tempoBucket === 'low' ? config.shrinkageMultiplier.lowTempo : 1,
    coverageBucket === 'low' ? config.shrinkageMultiplier.lowCoverage : 1,
    coverageBucket === 'high' ? config.shrinkageMultiplier.highCoverage : 1,
  ];
  const drawCorrectionMultipliers = [
    stageBucket === 'knockout' ? config.drawCorrectionMultiplier.knockout : 1,
    edgeBucket === 'close' ? config.drawCorrectionMultiplier.close : 1,
    edgeBucket === 'mismatch' ? config.drawCorrectionMultiplier.mismatch : 1,
    tempoBucket === 'low' ? config.drawCorrectionMultiplier.lowTempo : 1,
    coverageBucket === 'low' ? config.drawCorrectionMultiplier.lowCoverage : 1,
  ];

  return {
    stageBucket,
    edgeBucket,
    tempoBucket,
    coverageBucket,
    shrinkageMultiplier: bucketedProduct(shrinkageMultipliers, config.maxContextualLambdaShrinkage / config.maxLambdaShrinkage),
    drawCorrectionMultiplier: bucketedProduct(drawCorrectionMultipliers, config.drawCorrectionMultiplier.max),
  };
}

function calibrateFeatureLayerForEvidence(
  featureLayer: MatchFeatureLayer,
  profile: MatchEvidenceCalibration['profile'],
  overrides?: WorldCupStrategyCalibrationOverrides,
): MatchFeatureLayer {
  const config = evidenceCalibrationConfig(overrides);
  const coverage = featureLayer.metadata.inputCoverage.overallRatio;
  const coverageGap = Math.max(0, config.coverageNoShrinkThreshold - coverage);
  const shrinkage = clamp(
    (coverageGap / config.coverageNoShrinkThreshold) * config.maxLambdaShrinkage * profile.shrinkageMultiplier,
    0,
    config.maxContextualLambdaShrinkage,
  );

  if (shrinkage <= 0) return featureLayer;

  const neutralLambda = (featureLayer.home.lambda + featureLayer.away.lambda) / 2 || config.neutralLambda;
  const calibratedHome = featureLayer.home.lambda * (1 - shrinkage) + neutralLambda * shrinkage;
  const calibratedAway = featureLayer.away.lambda * (1 - shrinkage) + neutralLambda * shrinkage;

  return {
    ...featureLayer,
    home: {
      ...featureLayer.home,
      lambda: calibratedHome,
    },
    away: {
      ...featureLayer.away,
      lambda: calibratedAway,
    },
    metadata: {
      ...featureLayer.metadata,
      evidenceCalibration: {
        neutralLambda,
        shrinkage,
        originalHomeLambda: featureLayer.home.lambda,
        originalAwayLambda: featureLayer.away.lambda,
        profile,
      },
    },
  };
}

function buildCalibratedFeatureLayer(
  match: WorldCupMatch,
  homeTeam: WorldCupTeam,
  awayTeam: WorldCupTeam,
  options: PredictionEngineOptions = {},
) {
  const rawFeatureLayer = buildMatchFeatureLayer(match, homeTeam, awayTeam);
  const calibrationProfile = buildEvidenceCalibrationProfile(
    match,
    rawFeatureLayer,
    options.strategyCalibrationOverrides,
  );
  return {
    featureLayer: calibrateFeatureLayerForEvidence(
      rawFeatureLayer,
      calibrationProfile,
      options.strategyCalibrationOverrides,
    ),
    calibrationProfile,
  };
}

export type ExpectedGoals = {
  home: number;
  away: number;
};

export function computeLambda(
  team: WorldCupTeam,
  opponent: WorldCupTeam,
  isHome: boolean,
  match: WorldCupMatch,
  options: PredictionEngineOptions = {},
): number {
  const { featureLayer } = buildCalibratedFeatureLayer(
    match,
    isHome ? team : opponent,
    isHome ? opponent : team,
    options,
  );
  return isHome ? featureLayer.home.lambda : featureLayer.away.lambda;
}

export function computeBaseLambdaForAlpha(
  _match: WorldCupMatch,
  homeTeam: WorldCupTeam,
  awayTeam: WorldCupTeam,
): ExpectedGoals {
  const homeRating = safeRating(homeTeam.rating, 75);
  const awayRating = safeRating(awayTeam.rating, 75);
  const homeAttack = safeRating(homeTeam.attack, homeRating);
  const homeDefense = safeRating(homeTeam.defense, homeRating);
  const awayAttack = safeRating(awayTeam.attack, awayRating);
  const awayDefense = safeRating(awayTeam.defense, awayRating);

  const baseFor = (
    teamRating: number,
    teamAttack: number,
    opponentDefense: number,
    isHome: boolean,
  ) => {
    const baseStrength = 0.85 + (teamRating - 60) * 0.014;
    const attackDefenseSplit = (teamAttack - opponentDefense) * 0.014;
    const baselineHomePrior = isHome ? 0.06 : 0;
    return clamp(compressGoalExpectation(baseStrength + attackDefenseSplit + baselineHomePrior), 0.2, 4.5);
  };

  return {
    home: baseFor(homeRating, homeAttack, awayDefense, true),
    away: baseFor(awayRating, awayAttack, homeDefense, false),
  };
}

export function predictMatch(
  match: WorldCupMatch,
  homeTeam: WorldCupTeam,
  awayTeam: WorldCupTeam,
  options: PredictionEngineOptions = {},
): MatchPrediction {
  const { featureLayer, calibrationProfile } = buildCalibratedFeatureLayer(match, homeTeam, awayTeam, options);
  const intelligenceLayer = buildMatchIntelligenceLayer({ match, homeTeam, awayTeam });
  const lambdaHome = featureLayer.home.lambda;
  const lambdaAway = featureLayer.away.lambda;

  const decisionLayer = buildDecisionLayer(lambdaHome, lambdaAway, undefined, {
    drawCorrectionMultiplier: calibrationProfile.drawCorrectionMultiplier,
  });

  const normalizedHome = decisionLayer.oneX2.homeWin;
  const normalizedDraw = decisionLayer.oneX2.draw;
  const normalizedAway = decisionLayer.oneX2.awayWin;
  const favoriteProb = Math.max(normalizedHome, normalizedAway);
  const confidence = decisionLayer.confidence;

  const truth = evaluateMatchTruth(match);
  const unifiedProbability = createUnifiedProbability({
    matchId: match.id,
    model: {
      home: normalizedHome,
      draw: normalizedDraw,
      away: normalizedAway,
    },
    truth,
  });

  // Score distribution derived from decision layer (single source of truth)
  const scoreDistribution: ScoreDistributionEntry[] = decisionLayer.scoreDistribution
    .map(({ home, away, probability }) => ({ score: `${home}-${away}`, probability }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 8);

  const mostLikelyScore = `${decisionLayer.mostLikelyScore.home}-${decisionLayer.mostLikelyScore.away}`;

  const factors = [
    {
      name: 'Structured expected goals (λ)',
      impact: normalizeImpact(lambdaHome - lambdaAway, 2.5),
      description: `λ decomposed into base strength, attack/defense split, home advantage, form adjustment, and matchup factor. Home λ=${lambdaHome.toFixed(2)}, Away λ=${lambdaAway.toFixed(2)}.`,
    },
    ...intelligenceLayer.factors
      .filter((factor) => factor.quality !== 'unavailable')
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
      .slice(0, 7)
      .map((factor) => ({
        name: factor.label,
        impact: factor.impact,
        description: `${factor.category} · ${factor.quality} · ${factor.source}. ${factor.caveat ?? ''}`.trim(),
      })),
  ];

  return {
    matchId: match.id,
    probabilities: {
      homeWin: normalizedHome,
      draw: normalizedDraw,
      awayWin: normalizedAway,
    },
    expectedGoals: {
      home: lambdaHome,
      away: lambdaAway,
    },
    scoreDistribution,
    mostLikelyScore,
    confidence,
    explanation: {
      summary: `Prediction V2 favors ${normalizedHome >= normalizedAway ? homeTeam.name : awayTeam.name} with ${(favoriteProb * 100).toFixed(1)}% top-side probability. λ_home=${lambdaHome.toFixed(2)}, λ_away=${lambdaAway.toFixed(2)}.`,
      factors,
    },
    modelVersion: 'v2',
    truth,
    unifiedProbability,
    decisionLayer,
    featureLayer,
    intelligenceLayer,
  };
}
