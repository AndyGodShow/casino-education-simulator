import type { WorldCupCalibrationState } from '../domain/WorldCupDomainModel';
import { WORLD_CUP_MODEL_CONFIG } from '../logic/modelConfig';
import type {
  WorldCupBacktestSample,
  WorldCupCombinedBacktestRun,
  WorldCupCombinedCalibrationAudit,
} from './types';
import { runCombinedWorldCupBacktest, type CombinedWorldCupBacktestInput } from './combinedBacktest';
import { runWorldCupBacktest } from './worldCupBacktest';

export type CombinedWorldCupCalibrationRun = {
  backtest: WorldCupCombinedBacktestRun;
  calibration: WorldCupCalibrationState;
  audit: WorldCupCombinedCalibrationAudit;
};

const isCalibrationCandidate = (sample: WorldCupBacktestSample) => (
  sample.sourceTier === 'official' || sample.sourceTier === 'verified_provider'
);

const calibrationMessage = (
  status: WorldCupCalibrationState['status'],
  sampleSize: number,
  excludedSampleOrLocalSamples: number,
) => {
  if (status === 'ready') {
    return `已有 ${sampleSize} 条非样例回测样本，可作为合并校准候选；第三方 provider 仍保留来源标签。`;
  }

  if (status === 'insufficient_sample') {
    return `只有 ${sampleSize} 条非样例回测样本，样本不足，不能证明模型已校准。`;
  }

  return excludedSampleOrLocalSamples > 0
    ? '当前合并回测只包含样例或本地 seed 样本，不能作为真实校准证据。'
    : '暂无可用于合并校准的非样例回测样本。';
};

export function runCombinedWorldCupCalibration(
  input: CombinedWorldCupBacktestInput,
): CombinedWorldCupCalibrationRun {
  const backtest = runCombinedWorldCupBacktest(input);
  const candidateSamples = backtest.samples.filter(isCalibrationCandidate);
  const excludedSampleOrLocalSamples = backtest.samples.length - candidateSamples.length;
  const minimumSampleSize = WORLD_CUP_MODEL_CONFIG.backtest.minimumCalibrationSampleSize;
  const candidateReport = runWorldCupBacktest(candidateSamples);
  const sampleSize = candidateReport.overall.sampleSize;
  const officialCandidateSamples = candidateSamples.filter((sample) => sample.sourceTier === 'official').length;
  const verifiedProviderCandidateSamples = candidateSamples.filter(
    (sample) => sample.sourceTier === 'verified_provider',
  ).length;
  const hasResults = sampleSize > 0;
  const status = !hasResults
    ? 'no_results'
    : sampleSize < minimumSampleSize
      ? 'insufficient_sample'
      : 'ready';
  const message = calibrationMessage(status, sampleSize, excludedSampleOrLocalSamples);
  const currentDomainCandidateSamples = backtest.audit.currentDomain.calibrationCandidateSamples;
  const historicalImportCandidateSamples = backtest.audit.historicalImport.calibrationCandidateSamples;

  return {
    backtest,
    calibration: {
      status,
      sampleSize,
      minimumSampleSize,
      brierScore: hasResults ? candidateReport.overall.brierScore : null,
      logLoss: hasResults ? candidateReport.overall.logLoss : null,
      accuracy: hasResults ? candidateReport.overall.accuracy : null,
      brierReference: candidateReport.overall.brierReference,
      calibrationError: hasResults ? candidateReport.overall.calibrationError : null,
      message,
    },
    audit: {
      inputSamples: backtest.audit.inputSamples,
      acceptedSamples: backtest.audit.acceptedSamples,
      calibrationCandidateSamples: sampleSize,
      officialCandidateSamples,
      verifiedProviderCandidateSamples,
      excludedSampleOrLocalSamples,
      rejectedDuplicateSamples: backtest.audit.rejectedDuplicateSamples,
      duplicateMatchIds: backtest.audit.duplicateMatchIds,
      currentDomainCandidateSamples,
      historicalImportCandidateSamples,
      message,
    },
  };
}
