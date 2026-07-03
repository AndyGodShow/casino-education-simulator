import type {
  MatchDataQualityState,
  PredictionReliabilityState,
  WorldCupCalibrationState,
} from '../domain/WorldCupDomainModel';
import type {
  BetSelection,
  IntelligenceFactorCategory,
  MatchIntelligenceFactor,
  MatchIntelligenceLayer,
  MatchPrediction,
  PredictionAction,
  PredictionActionGate,
  PredictionRiskPolicy,
  PredictionSimulationCandidate,
} from '../types';
import type { ModelMarketDeviation } from './oddsEngine';
import { WORLD_CUP_MODEL_CONFIG } from './modelConfig';

export type PredictionActionGateInput = {
  matchId: string;
  reliability: PredictionReliabilityState;
  matchDataQuality: MatchDataQualityState;
  calibration: WorldCupCalibrationState;
  intelligenceLayer?: MatchIntelligenceLayer;
  marketDeviation?: ModelMarketDeviation | null;
  prediction?: MatchPrediction;
};

const hasMissingCategory = (layer: MatchIntelligenceLayer | undefined, category: IntelligenceFactorCategory) =>
  layer?.coverage.missingCategories.includes(category) ?? false;

const findFactor = (
  layer: MatchIntelligenceLayer | undefined,
  key: string,
): MatchIntelligenceFactor | undefined => layer?.factors.find((factor) => factor.key === key);

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const topTwoProbabilityGap = (prediction: MatchPrediction | undefined) => {
  if (!prediction) return undefined;
  const sorted = [
    prediction.probabilities.homeWin,
    prediction.probabilities.draw,
    prediction.probabilities.awayWin,
  ].sort((a, b) => b - a);
  return sorted[0] - sorted[1];
};

const riskPolicyFor = (
  action: PredictionAction,
  blockingFactors: string[],
  reliability: PredictionReliabilityState,
): PredictionRiskPolicy => {
  if (action === 'skip_due_to_low_confidence') {
    return {
      band: 'no_action',
      maxSimulatedStakeFraction: 0,
      note: '跳过该场；不进入模拟下注动作。',
    };
  }

  if (action === 'observe_only') {
    return {
      band: 'watch_only',
      maxSimulatedStakeFraction: 0,
      note: '只观察，不生成模拟仓位。',
    };
  }

  if (blockingFactors.length > 0 || reliability.label !== 'high') {
    return {
      band: 'capped_simulation',
      maxSimulatedStakeFraction: WORLD_CUP_MODEL_CONFIG.actionGate.maxCappedSimulatedStakeFraction,
      note: '仅允许极小教育模拟仓位，用于学习概率和风险，不是真实投注建议。',
    };
  }

  return {
    band: 'standard_simulation',
    maxSimulatedStakeFraction: WORLD_CUP_MODEL_CONFIG.actionGate.maxStandardSimulatedStakeFraction,
    note: '允许标准教育模拟仓位；仍不构成真实投注建议。',
  };
};

const bestSimulationCandidate = (
  marketDeviation: ModelMarketDeviation | null | undefined,
  riskPolicy: PredictionRiskPolicy,
  reliability: PredictionReliabilityState,
): PredictionSimulationCandidate | undefined => {
  if (!marketDeviation || riskPolicy.maxSimulatedStakeFraction <= 0) return undefined;

  const selections: BetSelection[] = ['home', 'draw', 'away'];
  const best = selections.reduce((currentBest, selection) => (
    marketDeviation.adjustedExpectedValue[selection] > marketDeviation.adjustedExpectedValue[currentBest]
      ? selection
      : currentBest
  ), selections[0]);
  const adjustedExpectedValue = marketDeviation.adjustedExpectedValue[best];
  if (adjustedExpectedValue < WORLD_CUP_MODEL_CONFIG.actionGate.minimumPositiveReferenceEv) return undefined;
  const evStrength = clamp(adjustedExpectedValue / WORLD_CUP_MODEL_CONFIG.actionGate.fullStakeReferenceEv);
  const uncertaintyMultiplier = clamp(1 - marketDeviation.uncertaintyAdjustment * WORLD_CUP_MODEL_CONFIG.actionGate.uncertaintyStakePenalty);
  const confidenceMultiplier = clamp(reliability.adjustedConfidence);
  const recommendedSimulatedStakeFraction = Math.min(
    riskPolicy.maxSimulatedStakeFraction,
    riskPolicy.maxSimulatedStakeFraction * evStrength * uncertaintyMultiplier * confidenceMultiplier,
  );

  return {
    selection: best,
    adjustedExpectedValue,
    expectedValueDifference: marketDeviation.expectedValueDifference[best],
    recommendedSimulatedStakeFraction,
    rationale: 'Selected from the highest positive adjusted educational reference EV after market uncertainty correction.',
  };
};

const withRiskPolicy = (
  gate: Omit<PredictionActionGate, 'riskPolicy'>,
  reliability: PredictionReliabilityState,
  marketDeviation?: ModelMarketDeviation | null,
): PredictionActionGate => {
  const riskPolicy = riskPolicyFor(gate.action, gate.blockingFactors, reliability);

  return {
    ...gate,
    riskPolicy,
    simulationCandidate: bestSimulationCandidate(marketDeviation, riskPolicy, reliability),
  };
};

export function buildPredictionActionGate(input: PredictionActionGateInput): PredictionActionGate {
  const reasons: string[] = [];
  const blockingFactors: string[] = [];
  const { reliability, matchDataQuality, calibration, intelligenceLayer, marketDeviation, prediction } = input;
  const gateConfig = WORLD_CUP_MODEL_CONFIG.actionGate;
  const groupMotivation = findFactor(intelligenceLayer, 'group-qualification-motivation');
  const probabilityGap = topTwoProbabilityGap(prediction);

  if (matchDataQuality.tier === 'local' || matchDataQuality.tier === 'sample') {
    reasons.push('当前数据源只允许教育演示，不能作为真实赛事预测。');
    blockingFactors.push('non_real_prediction_source');
  }

  if (calibration.status !== 'ready') {
    reasons.push('结果校准样本不足，不能把概率倾向包装成强结论。');
    blockingFactors.push('insufficient_calibration');
  }

  if (hasMissingCategory(intelligenceLayer, 'market')) {
    reasons.push('缺少市场参考，不能评估模型与市场隐含概率的分歧。');
    blockingFactors.push('missing_market_reference');
  }

  if ((intelligenceLayer?.coverage.ratio ?? 1) < 0.5) {
    reasons.push('赛前情报覆盖率过低，阵容、赛程或环境条件不足。');
    blockingFactors.push('low_intelligence_coverage');
  }

  if (probabilityGap !== undefined && probabilityGap < gateConfig.minimumTopTwoProbabilityGap) {
    reasons.push('模型最高项与第二高项差距过小，单场方向不够清晰。');
    blockingFactors.push('thin_model_edge');
  }

  if (groupMotivation?.quality === 'unavailable') {
    reasons.push('缺少小组积分形势，不能判断双方真实出线动机。');
    blockingFactors.push('missing_group_motivation_context');
  }

  if (groupMotivation && Math.abs(groupMotivation.impact) > gateConfig.highMotivationSwing) {
    reasons.push('小组出线动机错位较大，比赛状态可能偏离常规强弱模型。');
    blockingFactors.push('volatile_group_motivation');
  }

  if (groupMotivation?.caveat?.includes('must win')) {
    reasons.push('存在必须赢的小组赛压力，策略只应先观察该压力是否被阵容和市场共同确认。');
    blockingFactors.push('must_win_group_pressure');
  }

  if (marketDeviation && marketDeviation.deviationScore > gateConfig.highMarketDisagreement) {
    reasons.push('模型与市场参考分歧较大，应先复核输入、情报覆盖和赔率口径。');
    blockingFactors.push('high_market_disagreement');
  }

  if (marketDeviation) {
    const bestReferenceEv = Math.max(
      marketDeviation.adjustedExpectedValue.home,
      marketDeviation.adjustedExpectedValue.draw,
      marketDeviation.adjustedExpectedValue.away,
    );
    if (bestReferenceEv < gateConfig.minimumPositiveReferenceEv) {
      reasons.push('教育市场参考下没有足够正向期望值，适合观察而不是模拟下注动作。');
      blockingFactors.push('no_positive_reference_ev');
    }
  }

  if (reliability.adjustedConfidence < 0.25) {
    return withRiskPolicy({
      matchId: input.matchId,
      action: 'skip_due_to_low_confidence',
      reasons: reasons.length > 0 ? reasons : ['可信自信过低，当前只适合跳过该预测。'],
      blockingFactors: blockingFactors.length > 0 ? blockingFactors : ['low_adjusted_confidence'],
    }, reliability, marketDeviation);
  }

  if (
    matchDataQuality.tier === 'local'
    || matchDataQuality.tier === 'sample'
    || calibration.status !== 'ready'
  ) {
    return withRiskPolicy({
      matchId: input.matchId,
      action: 'educational_simulation',
      reasons: reasons.length > 0 ? reasons : ['当前预测仅用于教育模拟。'],
      blockingFactors,
    }, reliability, marketDeviation);
  }

  if (blockingFactors.length > 0 || reliability.label === 'low') {
    return withRiskPolicy({
      matchId: input.matchId,
      action: 'observe_only',
      reasons: reasons.length > 0 ? reasons : ['当前模型只有概率倾向，建议仅观察。'],
      blockingFactors,
    }, reliability, marketDeviation);
  }

  return withRiskPolicy({
    matchId: input.matchId,
    action: 'educational_simulation',
    reasons: ['数据质量、校准和情报覆盖未触发跳过；仍仅用于教育模拟。'],
    blockingFactors: [],
  }, reliability, marketDeviation);
}
