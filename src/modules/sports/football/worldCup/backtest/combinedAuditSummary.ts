import type { CombinedWorldCupCalibrationRun } from './combinedCalibration';
import type { HistoricalBacktestImportSummary } from './historicalBacktest';

export type WorldCupCombinedCalibrationEvidenceStatus =
  | 'ready'
  | 'insufficient_candidates'
  | 'sample_or_local_only'
  | 'empty';

export type WorldCupCombinedCalibrationEvidenceGrade =
  | 'official_ready'
  | 'provider_ready'
  | 'mixed_ready'
  | 'insufficient'
  | 'sample_or_local_only'
  | 'empty';

export type WorldCupCombinedCalibrationSummary = {
  status: WorldCupCombinedCalibrationEvidenceStatus;
  evidenceGrade: WorldCupCombinedCalibrationEvidenceGrade;
  label: string;
  detail: string;
  importDetail: string | null;
  evidenceDetail: string;
  candidateDetail: string;
  candidateSourceDetail: string;
  provenanceDetail: string;
  duplicateDetail: string;
  caveats: string[];
};

const statusLabels: Record<WorldCupCombinedCalibrationEvidenceStatus, string> = {
  ready: '合并校准可用',
  insufficient_candidates: '合并校准样本不足',
  sample_or_local_only: '仅样例/本地回测',
  empty: '暂无合并回测样本',
};

const reasonLabel = (scope: 'csv' | 'dataset', reason: string) => `${scope}:${reason}`;

const topReasonDetail = (summary: HistoricalBacktestImportSummary) => {
  if (summary.topRejectionReasons.length === 0) return '';

  return `；主要拒绝 ${summary.topRejectionReasons
    .slice(0, 3)
    .map((entry) => `${reasonLabel(entry.scope, entry.reason)} ${entry.count}`)
    .join(' · ')}`;
};

const duplicateDetail = (run: CombinedWorldCupCalibrationRun) => {
  const rejected = run.audit.rejectedDuplicateSamples;
  if (rejected === 0) return '合并拒绝重复 0';

  const ids = run.audit.duplicateMatchIds.slice(0, 3).join('、');
  const suffix = run.audit.duplicateMatchIds.length > 3 ? ' 等' : '';

  return `合并拒绝重复 ${rejected}${ids ? `（${ids}${suffix}）` : ''}`;
};

const evidenceStatus = (
  run: CombinedWorldCupCalibrationRun,
): WorldCupCombinedCalibrationEvidenceStatus => {
  if (run.audit.acceptedSamples === 0) return 'empty';
  if (run.calibration.status === 'ready') return 'ready';
  if (run.audit.calibrationCandidateSamples === 0 && run.audit.excludedSampleOrLocalSamples > 0) {
    return 'sample_or_local_only';
  }
  return 'insufficient_candidates';
};

const evidenceGrade = (
  run: CombinedWorldCupCalibrationRun,
): WorldCupCombinedCalibrationEvidenceGrade => {
  if (run.audit.acceptedSamples === 0) return 'empty';
  if (run.audit.calibrationCandidateSamples === 0 && run.audit.excludedSampleOrLocalSamples > 0) {
    return 'sample_or_local_only';
  }
  if (run.calibration.status !== 'ready') return 'insufficient';
  if (run.audit.officialCandidateSamples >= run.calibration.minimumSampleSize) return 'official_ready';
  if (run.audit.officialCandidateSamples === 0) return 'provider_ready';
  return 'mixed_ready';
};

const evidenceDetailFor = (
  grade: WorldCupCombinedCalibrationEvidenceGrade,
) => {
  if (grade === 'official_ready') return '官方校准候选充足';
  if (grade === 'provider_ready') return '第三方候选充足，但不等同官方校准证据';
  if (grade === 'mixed_ready') return '可作为合并校准候选，第三方 provider 仍保留来源标签';
  return '校准证据不足';
};

export function summarizeCombinedWorldCupCalibration(
  run: CombinedWorldCupCalibrationRun,
  importSummary?: HistoricalBacktestImportSummary,
): WorldCupCombinedCalibrationSummary {
  const status = evidenceStatus(run);
  const grade = evidenceGrade(run);
  const sourceCoverage = run.backtest.report.quality.sourceCoverage;
  const sampleOrLocal = sourceCoverage.sample.count + sourceCoverage.local.count;
  const importDetail = importSummary
    ? `导入接收 ${importSummary.acceptedRows} · 拒绝 ${importSummary.rejectedRows}${topReasonDetail(importSummary)}`
    : null;
  const candidateDetail = `校准候选 ${run.audit.calibrationCandidateSamples}/${run.calibration.minimumSampleSize}（当前 domain ${run.audit.currentDomainCandidateSamples} · 历史导入 ${run.audit.historicalImportCandidateSamples}）`;
  const candidateSourceDetail = `候选来源：官方 ${run.audit.officialCandidateSamples} · 第三方 ${run.audit.verifiedProviderCandidateSamples}`;
  const evidenceDetail = evidenceDetailFor(grade);
  const provenanceDetail = `官方 ${sourceCoverage.official.count} · 第三方 ${sourceCoverage.verified_provider.count} · 样例/本地 ${sampleOrLocal}；样例/本地排除 ${run.audit.excludedSampleOrLocalSamples}`;
  const duplicate = duplicateDetail(run);
  const caveats = [
    run.calibration.message,
    run.backtest.audit.message,
  ];

  return {
    status,
    evidenceGrade: grade,
    label: `${statusLabels[status]} · 合并后样本 ${run.backtest.report.overall.sampleSize}`,
    detail: [
      importDetail,
      candidateDetail,
      candidateSourceDetail,
      evidenceDetail,
      provenanceDetail,
      duplicate,
      ...caveats,
    ].filter(Boolean).join('。'),
    importDetail,
    evidenceDetail,
    candidateDetail,
    candidateSourceDetail,
    provenanceDetail,
    duplicateDetail: duplicate,
    caveats,
  };
}
