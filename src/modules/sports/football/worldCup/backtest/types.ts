import type { BetSelection, WorldCupMatch } from '../types';

export type WorldCupBacktestSourceTier = 'official' | 'verified_provider' | 'sample' | 'local';

export type WorldCupBacktestSample = {
  matchId: string;
  stage: WorldCupMatch['stage'];
  sourceTier: WorldCupBacktestSourceTier;
  rawConfidence: number;
  adjustedConfidence: number;
  probabilities: Record<BetSelection, number>;
  outcome: BetSelection;
};

export type WorldCupBacktestMetrics = {
  sampleSize: number;
  accuracy: number;
  brierScore: number;
  logLoss: number;
  brierReference: number;
  calibrationError: number;
};

export type WorldCupBacktestBucket = WorldCupBacktestMetrics & {
  count: number;
  averageRawConfidence: number;
  averageAdjustedConfidence: number;
};

export type WorldCupConfidenceBacktestBucket = WorldCupBacktestBucket & {
  label: 'low' | 'medium' | 'high';
  range: [number, number];
};

export type WorldCupBacktestSourceCoverage = Record<WorldCupBacktestSourceTier, {
  count: number;
  coverage: number;
}>;

export type WorldCupBacktestCalibrationUsabilityStatus =
  | 'usable'
  | 'no_samples'
  | 'insufficient_non_sample'
  | 'sample_or_local_only';

export type WorldCupBacktestQuality = {
  sourceCoverage: WorldCupBacktestSourceCoverage;
  officialOnly: WorldCupBacktestMetrics;
  nonSample: WorldCupBacktestMetrics;
  sampleOrLocal: WorldCupBacktestMetrics;
  calibrationUsability: {
    status: WorldCupBacktestCalibrationUsabilityStatus;
    canUseForCalibration: boolean;
    sampleSize: number;
    minimumSampleSize: number;
    message: string;
  };
};

export type WorldCupBacktestReport = {
  overall: WorldCupBacktestMetrics;
  byConfidence: WorldCupConfidenceBacktestBucket[];
  bySourceTier: Partial<Record<WorldCupBacktestSourceTier, WorldCupBacktestBucket>>;
  byStage: Partial<Record<WorldCupMatch['stage'], WorldCupBacktestBucket>>;
  quality: WorldCupBacktestQuality;
};

export type WorldCupCombinedBacktestOriginAudit = {
  inputSamples: number;
  acceptedSamples: number;
  rejectedDuplicateSamples: number;
  calibrationCandidateSamples: number;
  sourceCoverage: WorldCupBacktestSourceCoverage;
};

export type WorldCupCombinedBacktestAudit = {
  inputSamples: number;
  acceptedSamples: number;
  rejectedDuplicateSamples: number;
  duplicateMatchIds: string[];
  currentDomain: WorldCupCombinedBacktestOriginAudit;
  historicalImport: WorldCupCombinedBacktestOriginAudit;
  message: string;
};

export type WorldCupCombinedBacktestRun = {
  samples: WorldCupBacktestSample[];
  report: WorldCupBacktestReport;
  audit: WorldCupCombinedBacktestAudit;
};

export type WorldCupCombinedCalibrationAudit = {
  inputSamples: number;
  acceptedSamples: number;
  calibrationCandidateSamples: number;
  officialCandidateSamples: number;
  verifiedProviderCandidateSamples: number;
  excludedSampleOrLocalSamples: number;
  rejectedDuplicateSamples: number;
  duplicateMatchIds: string[];
  currentDomainCandidateSamples: number;
  historicalImportCandidateSamples: number;
  message: string;
};
