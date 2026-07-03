import type {
  WorldCupBacktestSample,
  WorldCupBacktestSourceCoverage,
  WorldCupCombinedBacktestAudit,
  WorldCupCombinedBacktestOriginAudit,
  WorldCupCombinedBacktestRun,
} from './types';
import { isWorldCupCalibrationCandidate, runWorldCupBacktest } from './worldCupBacktest';

export type CombinedWorldCupBacktestInput = {
  currentDomainSamples?: WorldCupBacktestSample[];
  historicalSamples?: WorldCupBacktestSample[];
};

type SampleOrigin = 'currentDomain' | 'historicalImport';

const emptyCoverage = (): WorldCupBacktestSourceCoverage => ({
  official: { count: 0, coverage: 0 },
  verified_provider: { count: 0, coverage: 0 },
  sample: { count: 0, coverage: 0 },
  local: { count: 0, coverage: 0 },
});

const originAudit = (
  inputSamples: number,
  acceptedSamples: WorldCupBacktestSample[],
  rejectedDuplicateSamples: number,
): WorldCupCombinedBacktestOriginAudit => ({
  inputSamples,
  acceptedSamples: acceptedSamples.length,
  rejectedDuplicateSamples,
  calibrationCandidateSamples: acceptedSamples.filter(isWorldCupCalibrationCandidate).length,
  sourceCoverage: acceptedSamples.length > 0
    ? runWorldCupBacktest(acceptedSamples).quality.sourceCoverage
    : emptyCoverage(),
});

const combinedMessage = (audit: Omit<WorldCupCombinedBacktestAudit, 'message'>) => {
  if (audit.acceptedSamples === 0) {
    return '暂无可合并的当前 domain 或历史导入回测样本。';
  }

  const duplicateNote = audit.rejectedDuplicateSamples > 0
    ? audit.historicalImport.rejectedDuplicateSamples > 0 && audit.currentDomain.acceptedSamples > 0
      ? `已拒绝 ${audit.rejectedDuplicateSamples} 条重复 matchId；当前 domain 样本优先，其余重复保留先出现的样本。`
      : `已拒绝 ${audit.rejectedDuplicateSamples} 条重复 matchId；保留先出现的样本。`
    : '未发现重复 matchId。';

  return `已合并当前 domain ${audit.currentDomain.acceptedSamples} 条、历史导入 ${audit.historicalImport.acceptedSamples} 条回测样本；样例/本地数据保留来源标签，不会作为真实校准证据。${duplicateNote}`;
};

export function runCombinedWorldCupBacktest(
  input: CombinedWorldCupBacktestInput,
): WorldCupCombinedBacktestRun {
  const currentDomainSamples = input.currentDomainSamples ?? [];
  const historicalSamples = input.historicalSamples ?? [];
  const acceptedByOrigin: Record<SampleOrigin, WorldCupBacktestSample[]> = {
    currentDomain: [],
    historicalImport: [],
  };
  const rejectedByOrigin: Record<SampleOrigin, number> = {
    currentDomain: 0,
    historicalImport: 0,
  };
  const duplicateMatchIds = new Set<string>();
  const seenMatchIds = new Set<string>();

  const acceptSamples = (origin: SampleOrigin, samples: WorldCupBacktestSample[]) => {
    for (const sample of samples) {
      if (seenMatchIds.has(sample.matchId)) {
        rejectedByOrigin[origin] += 1;
        duplicateMatchIds.add(sample.matchId);
        continue;
      }

      seenMatchIds.add(sample.matchId);
      acceptedByOrigin[origin].push(sample);
    }
  };

  acceptSamples('currentDomain', currentDomainSamples);
  acceptSamples('historicalImport', historicalSamples);

  const samples = [
    ...acceptedByOrigin.currentDomain,
    ...acceptedByOrigin.historicalImport,
  ];
  const report = runWorldCupBacktest(samples);
  const auditWithoutMessage = {
    inputSamples: currentDomainSamples.length + historicalSamples.length,
    acceptedSamples: samples.length,
    rejectedDuplicateSamples: rejectedByOrigin.currentDomain + rejectedByOrigin.historicalImport,
    duplicateMatchIds: [...duplicateMatchIds].sort(),
    currentDomain: originAudit(
      currentDomainSamples.length,
      acceptedByOrigin.currentDomain,
      rejectedByOrigin.currentDomain,
    ),
    historicalImport: originAudit(
      historicalSamples.length,
      acceptedByOrigin.historicalImport,
      rejectedByOrigin.historicalImport,
    ),
  };

  return {
    samples,
    report,
    audit: {
      ...auditWithoutMessage,
      message: combinedMessage(auditWithoutMessage),
    },
  };
}
