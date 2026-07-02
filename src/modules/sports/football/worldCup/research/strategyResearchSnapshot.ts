import type { WorldCupStrategyResearchState } from '../domain/WorldCupDomainModel';
import type { InternationalResultsDataset } from './internationalResults';
import type { WalkForwardStrategyReport } from './walkForwardOptimizer';

export type WorldCupStrategyResearchSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  source: 'martj42-international-results';
  sourceUrl: string;
  audit: InternationalResultsDataset['audit'];
  report: WalkForwardStrategyReport;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseWorldCupStrategyResearchSnapshot(
  value: unknown,
): WorldCupStrategyResearchSnapshot | null {
  if (
    !isRecord(value)
    || value.schemaVersion !== 1
    || value.source !== 'martj42-international-results'
    || typeof value.generatedAt !== 'string'
    || !Number.isFinite(Date.parse(value.generatedAt))
    || typeof value.sourceUrl !== 'string'
    || !isRecord(value.audit)
    || !isRecord(value.report)
  ) {
    return null;
  }
  const status = value.report.status;
  if (status !== 'applied' && status !== 'rejected' && status !== 'insufficient_evidence') {
    return null;
  }
  return value as WorldCupStrategyResearchSnapshot;
}

export function strategyResearchStateFromSnapshot(
  snapshot: WorldCupStrategyResearchSnapshot,
): WorldCupStrategyResearchState {
  const report = snapshot.report;
  const appliedMessage = '候选参数通过独立留出集门禁，作为已验证研究基准；不会静默覆盖当前 Prediction V2。';
  const unavailableMessage = report.status === 'insufficient_evidence'
    ? '历史时间窗尚未达到策略优化门禁，继续使用基线模型。'
    : '候选参数未在独立留出集达到改进阈值，继续使用基线模型。';

  return {
    status: report.status,
    generatedAt: snapshot.generatedAt,
    acceptedRows: snapshot.audit.acceptedRows,
    candidateId: report.selectedCandidate.id,
    validationSampleSize: report.validation.sampleSize,
    holdoutSampleSize: report.holdout.sampleSize,
    holdoutContexts: report.holdout.contexts,
    brierImprovement: report.holdout.brierImprovement,
    message: report.status === 'applied' ? appliedMessage : unavailableMessage,
  };
}

