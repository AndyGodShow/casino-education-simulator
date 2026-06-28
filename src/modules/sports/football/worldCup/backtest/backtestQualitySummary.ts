import type { WorldCupBacktestReport } from './types';
import type { WorldCupMatch } from '../types';
import { sourceReadinessDetail } from './calibrationReadinessDetail';

export type WorldCupBacktestQualitySummary = {
  label: string;
  detail: string;
  sourceDetail: string;
  calibrationEvidenceDetail: string;
  highConfidenceDetail: string;
  stageCoverageDetail: string;
  candidateSourceReadinessDetail: string;
  nextAction: string;
};

const stageOrder: Array<WorldCupMatch['stage']> = [
  'group',
  'round32',
  'round16',
  'quarter',
  'semi',
  'thirdPlace',
  'final',
];

const stageLabels = {
  group: '小组赛',
  round32: '32 强',
  round16: '16 强',
  quarter: '八强',
  semi: '四强',
  thirdPlace: '三四名赛',
  final: '决赛',
} satisfies Record<WorldCupMatch['stage'], string>;

const stageCoverageDetailFor = (backtest: WorldCupBacktestReport) => {
  const coveredStages = stageOrder.filter((stage) => (backtest.quality.stageCoverage[stage]?.count ?? 0) > 0);
  if (coveredStages.length === 0) return `阶段覆盖 0/${stageOrder.length}`;

  return `阶段覆盖 ${coveredStages.length}/${stageOrder.length}（${coveredStages
    .map((stage) => stageLabels[stage])
    .join('、')}）`;
};

const candidateSourceReadinessDetailFor = (backtest: WorldCupBacktestReport) => {
  const officialReadiness = backtest.quality.officialReadiness;
  const providerReadiness = backtest.quality.providerReadiness;

  return sourceReadinessDetail({
    officialReadiness,
    providerReadiness,
    combinedCanUseForCalibration: backtest.quality.calibrationUsability.canUseForCalibration,
  });
};

const nextActionFor = (backtest: WorldCupBacktestReport) => {
  const calibrationUsability = backtest.quality.calibrationUsability;
  const officialReadiness = backtest.quality.officialReadiness;
  const providerReadiness = backtest.quality.providerReadiness;
  const officialSamples = backtest.quality.sourceCoverage.official.count;

  if (backtest.overall.sampleSize === 0) {
    return '等待真实比分进入 domain，或导入官方/已核验 provider 的历史回测样本。';
  }

  if (calibrationUsability.status === 'sample_or_local_only') {
    return '替换样例/本地回测，补充官方或已核验 provider 的完赛样本。';
  }

  if (!calibrationUsability.canUseForCalibration) {
    const missingSamples = Math.max(0, calibrationUsability.minimumSampleSize - calibrationUsability.sampleSize);
    const missingStages = Math.max(0, calibrationUsability.minimumStageCoverage - calibrationUsability.stageCoverage);
    return `继续补充非样例完赛样本：还差 ${missingSamples} 条候选、${missingStages} 个阶段。`;
  }

  if (officialReadiness.canUseForCalibration) {
    return '官方校准候选已达阈值；继续监控新完赛比赛的 Brier、LogLoss 和阶段漂移。';
  }

  if (officialSamples === 0 && providerReadiness.canUseForCalibration) {
    return '第三方候选已达阈值；下一步补充官方样本，避免把 provider-ready 当作 official-ready。';
  }

  return '合并候选已达阈值；继续补官方样本，并保留第三方 provider 来源标签。';
};

export function summarizeWorldCupBacktestQuality(
  backtest: WorldCupBacktestReport,
): WorldCupBacktestQualitySummary {
  const candidateSourceReadinessDetail = candidateSourceReadinessDetailFor(backtest);
  const nextAction = nextActionFor(backtest);

  if (backtest.overall.sampleSize === 0) {
    return {
      label: '暂无回测样本',
      detail: '暂无已完赛且带模型预测的样本；回测会在真实比分进入 domain 后自动汇总。',
      sourceDetail: '官方 0 · 第三方 0 · 样例/本地 0',
      calibrationEvidenceDetail: '校准证据不足',
      highConfidenceDetail: '降权后高自信 0 场',
      stageCoverageDetail: `阶段覆盖 0/${stageOrder.length}`,
      candidateSourceReadinessDetail,
      nextAction,
    };
  }

  const sourceCoverage = backtest.quality.sourceCoverage;
  const sampleOrLocalCount = sourceCoverage.sample.count + sourceCoverage.local.count;
  const highConfidenceCount = backtest.byConfidence.find((bucket) => bucket.label === 'high')?.count ?? 0;
  const calibrationUsability = backtest.quality.calibrationUsability;
  const calibrationScopeDetail = `非样例 ${calibrationUsability.sampleSize}/${calibrationUsability.minimumSampleSize} · 阶段 ${calibrationUsability.stageCoverage}/${calibrationUsability.minimumStageCoverage}`;
  const calibrationEvidenceDetail = calibrationUsability.canUseForCalibration
    ? `可作为校准候选（${calibrationScopeDetail}）`
    : `校准证据不足（${calibrationScopeDetail}）`;
  const sourceDetail = `官方 ${sourceCoverage.official.count} · 第三方 ${sourceCoverage.verified_provider.count} · 样例/本地 ${sampleOrLocalCount}`;
  const highConfidenceDetail = `降权后高自信 ${highConfidenceCount} 场`;
  const stageCoverageDetail = stageCoverageDetailFor(backtest);

  return {
    label: `样本 ${backtest.overall.sampleSize}`,
    detail: `Accuracy ${(backtest.overall.accuracy * 100).toFixed(1)}% · Brier ${backtest.overall.brierScore.toFixed(3)} · ${highConfidenceDetail}。${sourceDetail}；${stageCoverageDetail}；${calibrationEvidenceDetail}；${candidateSourceReadinessDetail}。下一步：${nextAction} 该摘要来自当前 domain 的已完赛样本。`,
    sourceDetail,
    calibrationEvidenceDetail,
    highConfidenceDetail,
    stageCoverageDetail,
    candidateSourceReadinessDetail,
    nextAction,
  };
}
