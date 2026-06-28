import {
  buildWorldCupBacktestSamples,
  runCombinedWorldCupCalibration,
  summarizeCombinedWorldCupCalibration,
  summarizeHistoricalBacktestImport,
  type HistoricalBacktestCsvRun,
  type HistoricalBacktestRun,
} from '../backtest';
import type { WorldCupDomainModel } from '../domain/WorldCupDomainModel';

const importStatusLabels = {
  ready: '导入可用',
  partial: '部分导入',
  blocked: '导入阻断',
} satisfies Record<ReturnType<typeof summarizeHistoricalBacktestImport>['status'], string>;

export type CombinedCalibrationPresentation = {
  noticeLabel: string;
  noticeDetail: string;
  auditLabel: string;
  auditDetail: string;
  details: Array<[label: string, value: string]>;
};

const sentenceList = (items: string[]) => items
  .map((item) => item.trim().replace(/[。.]$/u, ''))
  .filter(Boolean)
  .join('。');

export function buildCombinedCalibrationPresentation(
  domain: WorldCupDomainModel,
  historicalBacktestRun: HistoricalBacktestRun | HistoricalBacktestCsvRun,
): CombinedCalibrationPresentation {
  const importSummary = summarizeHistoricalBacktestImport(historicalBacktestRun);
  const combined = runCombinedWorldCupCalibration({
    currentDomainSamples: buildWorldCupBacktestSamples(domain),
    historicalSamples: historicalBacktestRun.dataset.samples,
  });
  const summary = summarizeCombinedWorldCupCalibration(combined, importSummary);

  return {
    noticeLabel: summary.label,
    noticeDetail: summary.detail,
    auditLabel: `${importStatusLabels[importSummary.status]} · ${summary.label}`,
    auditDetail: summary.evidenceDetail,
    details: [
      ['导入结果', summary.importDetail ?? '未提供 CSV 导入摘要'],
      ['校准候选', summary.candidateDetail],
      ['候选来源', summary.candidateSourceDetail],
      ['来源 readiness', summary.candidateSourceReadinessDetail],
      ['证据等级', summary.evidenceDetail],
      ['下一步', summary.nextAction],
      ['来源保留', summary.provenanceDetail],
      ['重复处理', summary.duplicateDetail],
      ['边界说明', sentenceList(summary.caveats)],
    ],
  };
}
