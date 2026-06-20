import type { WorldCupBacktestReport } from './types';

export type WorldCupBacktestQualitySummary = {
  label: string;
  detail: string;
  sourceDetail: string;
  calibrationEvidenceDetail: string;
  highConfidenceDetail: string;
};

export function summarizeWorldCupBacktestQuality(
  backtest: WorldCupBacktestReport,
): WorldCupBacktestQualitySummary {
  if (backtest.overall.sampleSize === 0) {
    return {
      label: '暂无回测样本',
      detail: '暂无已完赛且带模型预测的样本；回测会在真实比分进入 domain 后自动汇总。',
      sourceDetail: '官方 0 · 第三方 0 · 样例/本地 0',
      calibrationEvidenceDetail: '校准证据不足',
      highConfidenceDetail: '降权后高自信 0 场',
    };
  }

  const sourceCoverage = backtest.quality.sourceCoverage;
  const sampleOrLocalCount = sourceCoverage.sample.count + sourceCoverage.local.count;
  const highConfidenceCount = backtest.byConfidence.find((bucket) => bucket.label === 'high')?.count ?? 0;
  const calibrationUsability = backtest.quality.calibrationUsability;
  const calibrationEvidenceDetail = calibrationUsability.canUseForCalibration
    ? `可作为校准候选（非样例 ${calibrationUsability.sampleSize}/${calibrationUsability.minimumSampleSize}）`
    : `校准证据不足（非样例 ${calibrationUsability.sampleSize}/${calibrationUsability.minimumSampleSize}）`;
  const sourceDetail = `官方 ${sourceCoverage.official.count} · 第三方 ${sourceCoverage.verified_provider.count} · 样例/本地 ${sampleOrLocalCount}`;
  const highConfidenceDetail = `降权后高自信 ${highConfidenceCount} 场`;

  return {
    label: `样本 ${backtest.overall.sampleSize}`,
    detail: `Accuracy ${(backtest.overall.accuracy * 100).toFixed(1)}% · Brier ${backtest.overall.brierScore.toFixed(3)} · ${highConfidenceDetail}。${sourceDetail}；${calibrationEvidenceDetail}。该摘要来自当前 domain 的已完赛样本。`,
    sourceDetail,
    calibrationEvidenceDetail,
    highConfidenceDetail,
  };
}
