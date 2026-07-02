import type { WorldCupStrategyResearchState } from '../domain/WorldCupDomainModel';
import type { InternationalResultsDataset } from './internationalResults';
import type { WalkForwardStrategyReport } from './walkForwardOptimizer';
import {
  MAX_PUBLIC_STRATEGY_TEAM_RATINGS,
  type WorldCupStrategyTeamRating,
} from './strategyTeamRatings';

export type WorldCupStrategyResearchSnapshot = {
  schemaVersion: 2;
  generatedAt: string;
  source: 'martj42-international-results';
  sourceUrl: string;
  audit: InternationalResultsDataset['audit'];
  report: WalkForwardStrategyReport;
  teamRatings: Record<string, WorldCupStrategyTeamRating>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (
  value: unknown,
  min = 0,
  max = Number.POSITIVE_INFINITY,
): value is number => (
  typeof value === 'number'
  && Number.isFinite(value)
  && value >= min
  && value <= max
);

const isNonNegativeInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isInteger(value) && value >= 0
);

const isCandidate = (value: unknown) => (
  isRecord(value)
  && typeof value.id === 'string'
  && value.id.length > 0
  && isFiniteNumber(value.eloScale, 120, 1_000)
  && isFiniteNumber(value.drawBase, 0.05, 0.42)
  && isFiniteNumber(value.drawCloseness, 0, 0.42)
);

const isMetrics = (value: unknown) => (
  isRecord(value)
  && isNonNegativeInteger(value.sampleSize)
  && isFiniteNumber(value.brierScore, 0, 2)
  && isFiniteNumber(value.logLoss, 0)
  && isFiniteNumber(value.accuracy, 0, 1)
);

const isRange = (value: unknown) => (
  isRecord(value)
  && typeof value.from === 'string'
  && typeof value.to === 'string'
  && isNonNegativeInteger(value.sampleSize)
);

const isReport = (value: unknown): value is WalkForwardStrategyReport => {
  if (!isRecord(value)) return false;
  const status = value.status;
  if (status !== 'applied' && status !== 'rejected' && status !== 'insufficient_evidence') return false;
  if (value.applied !== (status === 'applied') || typeof value.reason !== 'string') return false;
  if (!isCandidate(value.selectedCandidate) || !isCandidate(value.baseline)) return false;
  if (!isRecord(value.splits) || !isRange(value.splits.training) || !isRange(value.splits.validation) || !isRange(value.splits.holdout)) {
    return false;
  }
  if (!isRecord(value.holdout)) return false;
  return isMetrics(value.validation)
    && isMetrics(value.holdout)
    && isFiniteNumber(value.holdout.baselineBrierScore, 0, 2)
    && isFiniteNumber(value.holdout.brierImprovement, -2, 2)
    && isNonNegativeInteger(value.holdout.contexts);
};

const isTeamRating = (value: unknown, teamId: string): value is WorldCupStrategyTeamRating => (
  isRecord(value)
  && value.teamId === teamId
  && typeof value.teamName === 'string'
  && value.teamName.length > 0
  && typeof value.asOf === 'string'
  && Number.isFinite(Date.parse(value.asOf))
  && isNonNegativeInteger(value.matches)
  && value.matches > 0
  && isFiniteNumber(value.elo, 500, 3_000)
  && isFiniteNumber(value.evidenceWeight, Number.EPSILON, 100)
  && typeof value.lastMatchDate === 'string'
  && Number.isFinite(Date.parse(`${value.lastMatchDate}T00:00:00.000Z`))
  && (value.trustLevel === 'low' || value.trustLevel === 'medium')
);

export function parseWorldCupStrategyResearchSnapshot(
  value: unknown,
): WorldCupStrategyResearchSnapshot | null {
  if (
    !isRecord(value)
    || value.schemaVersion !== 2
    || value.source !== 'martj42-international-results'
    || typeof value.generatedAt !== 'string'
    || !Number.isFinite(Date.parse(value.generatedAt))
    || typeof value.sourceUrl !== 'string'
    || !isRecord(value.audit)
    || !isNonNegativeInteger(value.audit.totalRows)
    || !isNonNegativeInteger(value.audit.acceptedRows)
    || !isNonNegativeInteger(value.audit.rejectedRows)
    || !isRecord(value.audit.rejectionReasons)
    || !isReport(value.report)
    || !isRecord(value.teamRatings)
  ) {
    return null;
  }
  const ratings = Object.entries(value.teamRatings);
  if (
    ratings.length > MAX_PUBLIC_STRATEGY_TEAM_RATINGS
    || ratings.some(([teamId, rating]) => !isTeamRating(rating, teamId))
  ) {
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
