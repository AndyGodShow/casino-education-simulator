import type {
  MatchDataQualityState,
  PredictionReliabilityDeduction,
  PredictionReliabilityDeductionReason,
  PredictionReliabilityLabel,
  PredictionReliabilityState,
  WorldCupCalibrationState,
  WorldCupPredictionAuditState,
} from '../domain/WorldCupDomainModel';
import type { WorldCupCombinedCalibrationEvidenceGrade } from '../backtest';
import type { MatchAdvancedMetricTrust, MatchInputCoverage, MatchIntelligenceLayer } from '../types';
import { WORLD_CUP_MODEL_CONFIG } from './modelConfig';

type PredictionReliabilityInput = {
  matchId: string;
  rawConfidence: number;
  inputCoverage?: MatchInputCoverage;
  advancedMetricTrust?: MatchAdvancedMetricTrust;
  intelligenceLayer?: MatchIntelligenceLayer;
  matchDataQuality: MatchDataQualityState;
  calibration: WorldCupCalibrationState;
  combinedCalibrationEvidenceGrade?: WorldCupCombinedCalibrationEvidenceGrade;
  predictionAudit: WorldCupPredictionAuditState;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const roundConfidence = (value: number) => Number(value.toFixed(4));

const deduction = (
  reason: PredictionReliabilityDeductionReason,
  amount: number,
  message: string,
): PredictionReliabilityDeduction => ({
  reason,
  amount,
  message,
});

const reliabilityLabel = (adjustedConfidence: number): PredictionReliabilityLabel => {
  if (adjustedConfidence >= WORLD_CUP_MODEL_CONFIG.reliability.labelThresholds.high) return 'high';
  if (adjustedConfidence >= WORLD_CUP_MODEL_CONFIG.reliability.labelThresholds.medium) return 'medium';
  return 'low';
};

const sourceDeductions = (quality: MatchDataQualityState): PredictionReliabilityDeduction[] => {
  if (quality.tier === 'local') {
    return [deduction('local_source', WORLD_CUP_MODEL_CONFIG.reliability.deductions.localSource, '本地 seed 只能支撑教育演示，不能支撑真实预测自信。')];
  }
  if (quality.tier === 'sample') {
    return [deduction('sample_source', WORLD_CUP_MODEL_CONFIG.reliability.deductions.sampleSource, '样例赛程只能支撑教育演示，不能支撑真实预测自信。')];
  }
  if (quality.tier === 'verified_provider') {
    return [deduction('verified_provider_not_official', WORLD_CUP_MODEL_CONFIG.reliability.deductions.verifiedProviderNotOfficial, '第三方 provider 尚未通过官方赛程口径核验。')];
  }
  return [];
};

const stalenessDeduction = (quality: MatchDataQualityState): PredictionReliabilityDeduction[] => {
  if (quality.staleness === 'stale') {
    return [deduction('stale_data', WORLD_CUP_MODEL_CONFIG.reliability.deductions.staleData, '输入数据已过期，需要更新后再提高自信。')];
  }
  if (quality.staleness === 'unknown') {
    return [deduction('unknown_staleness', WORLD_CUP_MODEL_CONFIG.reliability.deductions.unknownStaleness, '无法判断输入数据更新时间，需保守处理。')];
  }
  return [];
};

const coverageDeduction = (coverage?: MatchInputCoverage): PredictionReliabilityDeduction[] => {
  if (!coverage) {
    return [deduction('missing_input_coverage', WORLD_CUP_MODEL_CONFIG.reliability.deductions.missingInputCoverage, '缺少输入覆盖率审计，需保守处理模型自信。')];
  }
  if (coverage.overallRatio < WORLD_CUP_MODEL_CONFIG.reliability.inputCoverageThresholds.low) {
    return [deduction('low_input_coverage', WORLD_CUP_MODEL_CONFIG.reliability.deductions.lowInputCoverage, '输入覆盖率低于 50%，高级信号不足以支撑高自信。')];
  }
  if (coverage.overallRatio < WORLD_CUP_MODEL_CONFIG.reliability.inputCoverageThresholds.partial) {
    return [deduction('partial_input_coverage', WORLD_CUP_MODEL_CONFIG.reliability.deductions.partialInputCoverage, '输入覆盖率不足 80%，部分高级信号缺失。')];
  }
  return [];
};

const advancedMetricTrustDeduction = (trust?: MatchAdvancedMetricTrust): PredictionReliabilityDeduction[] => {
  if (!trust || trust.availableFields === 0) return [];

  const deductions: PredictionReliabilityDeduction[] = [];
  if (trust.missingSourceFields.length > 0) {
    deductions.push(deduction(
      'missing_advanced_metric_sources',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.missingAdvancedMetricSources,
      '部分高级指标已有数值但缺少字段级来源，需降低模型自信。',
    ));
  }

  if (trust.averageTrustScore < WORLD_CUP_MODEL_CONFIG.reliability.advancedMetricTrustThresholds.low) {
    deductions.push(deduction(
      'low_trust_advanced_metrics',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.lowTrustAdvancedMetrics,
      '高级指标主要来自低信任来源，只能作为弱信号使用。',
    ));
  } else if (trust.averageTrustScore < WORLD_CUP_MODEL_CONFIG.reliability.advancedMetricTrustThresholds.partial) {
    deductions.push(deduction(
      'partial_trust_advanced_metrics',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.partialTrustAdvancedMetrics,
      '高级指标来源信任度中等，需保守折扣模型自信。',
    ));
  }

  if (trust.staleFields.length > 0) {
    deductions.push(deduction(
      'stale_advanced_metrics',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.staleAdvancedMetrics,
      '部分高级指标更新时间已过期，阵容、状态或赛前条件可能不再可靠。',
    ));
  }

  if (trust.unknownFreshnessFields.length > 0) {
    deductions.push(deduction(
      'unknown_advanced_metric_freshness',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.unknownAdvancedMetricFreshness,
      '部分高级指标缺少可审计更新时间，需保守处理。',
    ));
  }

  return deductions;
};

const intelligenceDeduction = (layer?: MatchIntelligenceLayer): PredictionReliabilityDeduction[] => {
  if (!layer) return [];

  const deductions: PredictionReliabilityDeduction[] = [];
  if (layer.coverage.ratio < 0.67) {
    deductions.push(deduction(
      'low_intelligence_coverage',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.lowIntelligenceCoverage,
      '赛前情报覆盖率不足，阵容、赛程、市场或环境信号缺失，需降低模型自信。',
    ));
  }

  if (layer.factors.length > 0 && layer.summary.proxyCount / layer.factors.length >= 0.5) {
    deductions.push(deduction(
      'proxy_heavy_intelligence',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.proxyHeavyIntelligence,
      '赛前情报主要由代理指标构成，不是真实近期状态或官方情报。',
    ));
  }

  if (layer.coverage.missingCategories.includes('squad')) {
    deductions.push(deduction(
      'missing_squad_context',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.missingSquadContext,
      '缺少阵容可用性或伤停上下文，需保守处理单场预测。',
    ));
  }

  if (layer.coverage.missingCategories.includes('market')) {
    deductions.push(deduction(
      'missing_market_reference',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.missingMarketReference,
      '缺少市场参考，不能评估模型与市场隐含概率的分歧。',
    ));
  }

  if (layer.coverage.missingCategories.includes('schedule_travel')) {
    deductions.push(deduction(
      'missing_schedule_travel_context',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.missingScheduleTravelContext,
      '缺少休息天数或旅途疲劳上下文，赛前条件不完整。',
    ));
  }

  return deductions;
};

const calibrationDeduction = (calibration: WorldCupCalibrationState): PredictionReliabilityDeduction[] => {
  if (calibration.status === 'no_results') {
    return [deduction('no_calibration_sample', WORLD_CUP_MODEL_CONFIG.reliability.deductions.noCalibrationSample, '暂无真实比分样本，模型尚未经过结果回测。')];
  }
  if (calibration.status === 'insufficient_sample') {
    return [deduction('insufficient_calibration_sample', WORLD_CUP_MODEL_CONFIG.reliability.deductions.insufficientCalibrationSample, '真实比分样本不足，不能证明模型准确。')];
  }

  const deductions: PredictionReliabilityDeduction[] = [];
  if (
    calibration.calibrationError !== null
    && calibration.calibrationError > WORLD_CUP_MODEL_CONFIG.reliability.calibrationThresholds.overconfidenceError
  ) {
    deductions.push(deduction(
      'calibration_overconfidence',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.calibrationOverconfidence,
      '已有足够样本但校准误差偏高，模型概率存在过度自信迹象。',
    ));
  }

  if (
    calibration.brierScore !== null
    && calibration.brierScore >= calibration.brierReference * WORLD_CUP_MODEL_CONFIG.reliability.calibrationThresholds.weakBrierRatio
  ) {
    deductions.push(deduction(
      'weak_calibration_performance',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.weakCalibrationPerformance,
      '已有足够样本但 Brier 表现接近随机基线，需降低预测自信。',
    ));
  }

  return deductions;
};

const combinedCalibrationEvidenceDeduction = (
  grade?: WorldCupCombinedCalibrationEvidenceGrade,
): PredictionReliabilityDeduction[] => {
  if (!grade || grade === 'official_ready') return [];

  if (grade === 'provider_ready') {
    return [deduction(
      'provider_only_calibration_evidence',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.providerOnlyCalibrationEvidence,
      '合并校准候选全部来自第三方 provider，不等同官方校准证据，需保守降低自信。',
    )];
  }

  if (grade === 'mixed_ready') {
    return [deduction(
      'mixed_calibration_evidence',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.mixedCalibrationEvidence,
      '合并校准证据混合官方和第三方来源，第三方部分需保留来源折扣。',
    )];
  }

  if (grade === 'insufficient') {
    return [deduction(
      'insufficient_combined_calibration_evidence',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.insufficientCombinedCalibrationEvidence,
      '合并后的非样例校准候选仍不足，不能证明模型已校准。',
    )];
  }

  if (grade === 'sample_or_local_only') {
    return [deduction(
      'sample_or_local_only_calibration_evidence',
      WORLD_CUP_MODEL_CONFIG.reliability.deductions.sampleOrLocalOnlyCalibrationEvidence,
      '合并回测只包含样例或本地 seed，不能作为真实校准证据。',
    )];
  }

  return [deduction(
    'empty_combined_calibration_evidence',
    WORLD_CUP_MODEL_CONFIG.reliability.deductions.emptyCombinedCalibrationEvidence,
    '显式合并校准后仍没有可用回测样本，需降低模型自信。',
  )];
};

const auditDeduction = (predictionAudit: WorldCupPredictionAuditState): PredictionReliabilityDeduction[] => {
  if (predictionAudit.status === 'failed') {
    return [deduction('prediction_audit_failed', WORLD_CUP_MODEL_CONFIG.reliability.deductions.predictionAuditFailed, '预测链路自检失败，需先修复推导一致性。')];
  }
  if (predictionAudit.status === 'warning') {
    return [deduction('prediction_audit_warning', WORLD_CUP_MODEL_CONFIG.reliability.deductions.predictionAuditWarning, '预测链路自检存在警告，需降低自信。')];
  }
  return [];
};

const caveatFor = (
  label: PredictionReliabilityLabel,
  quality: MatchDataQualityState,
  deductions: PredictionReliabilityDeduction[],
) => {
  if (deductions.length === 0) {
    return '数据源、输入覆盖率、校准和链路自检暂未触发自信降权；仍不构成投注建议。';
  }
  if (quality.tier === 'local' || quality.tier === 'sample') {
    return '当前结果只适合教育演示；数据源和输入覆盖率不足以支撑真实预测自信。';
  }
  if (label === 'low') {
    return '当前模型只有概率倾向，数据质量或校准证据不足以支撑高自信。';
  }
  return '当前模型自信已按数据质量、输入覆盖率、校准和链路自检做保守降权。';
};

export function calculatePredictionReliability(input: PredictionReliabilityInput): PredictionReliabilityState {
  const rawConfidence = clamp(input.rawConfidence, 0, 1);
  const deductions = [
    ...sourceDeductions(input.matchDataQuality),
    ...stalenessDeduction(input.matchDataQuality),
    ...coverageDeduction(input.inputCoverage),
    ...advancedMetricTrustDeduction(input.advancedMetricTrust),
    ...intelligenceDeduction(input.intelligenceLayer),
    ...calibrationDeduction(input.calibration),
    ...combinedCalibrationEvidenceDeduction(input.combinedCalibrationEvidenceGrade),
    ...auditDeduction(input.predictionAudit),
  ];
  const totalDeduction = deductions.reduce((sum, item) => sum + item.amount, 0);
  const adjustedConfidence = roundConfidence(clamp(rawConfidence - totalDeduction, 0, 1));
  const label = reliabilityLabel(adjustedConfidence);

  return {
    matchId: input.matchId,
    rawConfidence,
    adjustedConfidence,
    ...(input.advancedMetricTrust ? { advancedMetricTrust: input.advancedMetricTrust } : {}),
    deductions,
    label,
    caveat: caveatFor(label, input.matchDataQuality, deductions),
  };
}
