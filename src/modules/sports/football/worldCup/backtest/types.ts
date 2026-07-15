import type { BetSelection, WorldCupMatch } from '../types';

export type WorldCupBacktestSourceTier = 'official' | 'verified_provider' | 'sample' | 'local';
type WorldCupBacktestPredictionOrigin =
  | 'pre_match_snapshot'
  | 'post_match_reconstruction'
  | 'historical_import';
type WorldCupBacktestStageBucket = 'group' | 'knockout';
type WorldCupBacktestEdgeBucket = 'close' | 'balanced' | 'mismatch';
type WorldCupBacktestTempoBucket = 'low' | 'normal' | 'high';
type WorldCupBacktestCoverageBucket = 'low' | 'partial' | 'high';

export type WorldCupBacktestScenarioProfile = {
  stageBucket: WorldCupBacktestStageBucket;
  edgeBucket: WorldCupBacktestEdgeBucket;
  tempoBucket: WorldCupBacktestTempoBucket;
  coverageBucket: WorldCupBacktestCoverageBucket;
};

export type WorldCupBacktestSample = {
  matchId: string;
  stage: WorldCupMatch['stage'];
  sourceTier: WorldCupBacktestSourceTier;
  predictionOrigin?: WorldCupBacktestPredictionOrigin;
  rawConfidence: number;
  adjustedConfidence: number;
  probabilities: Record<BetSelection, number>;
  outcome: BetSelection;
  scenarioProfile?: WorldCupBacktestScenarioProfile;
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

export type WorldCupBacktestStageCoverage = Partial<Record<WorldCupMatch['stage'], {
  count: number;
  coverage: number;
}>>;

export type WorldCupBacktestScenarioBuckets = {
  byStageBucket: Partial<Record<WorldCupBacktestStageBucket, WorldCupBacktestBucket>>;
  byEdgeBucket: Partial<Record<WorldCupBacktestEdgeBucket, WorldCupBacktestBucket>>;
  byTempoBucket: Partial<Record<WorldCupBacktestTempoBucket, WorldCupBacktestBucket>>;
  byCoverageBucket: Partial<Record<WorldCupBacktestCoverageBucket, WorldCupBacktestBucket>>;
};

export type WorldCupBacktestCalibrationUsabilityStatus =
  | 'usable'
  | 'no_samples'
  | 'insufficient_non_sample'
  | 'insufficient_stage_coverage'
  | 'sample_or_local_only';

export type WorldCupBacktestCalibrationReadiness = {
  status: WorldCupBacktestCalibrationUsabilityStatus;
  canUseForCalibration: boolean;
  sampleSize: number;
  minimumSampleSize: number;
  stageCoverage: number;
  minimumStageCoverage: number;
  message: string;
};

export type WorldCupBacktestQuality = {
  sourceCoverage: WorldCupBacktestSourceCoverage;
  officialOnly: WorldCupBacktestMetrics;
  nonSample: WorldCupBacktestMetrics;
  sampleOrLocal: WorldCupBacktestMetrics;
  stageCoverage: WorldCupBacktestStageCoverage;
  officialReadiness: WorldCupBacktestCalibrationReadiness;
  providerReadiness: WorldCupBacktestCalibrationReadiness;
  calibrationUsability: WorldCupBacktestCalibrationReadiness;
};

export type WorldCupBacktestReport = {
  overall: WorldCupBacktestMetrics;
  byConfidence: WorldCupConfidenceBacktestBucket[];
  bySourceTier: Partial<Record<WorldCupBacktestSourceTier, WorldCupBacktestBucket>>;
  byStage: Partial<Record<WorldCupMatch['stage'], WorldCupBacktestBucket>>;
  byScenario: WorldCupBacktestScenarioBuckets;
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
  calibrationStageCoverage: number;
  minimumCalibrationStageCoverage: number;
  excludedSampleOrLocalSamples: number;
  rejectedDuplicateSamples: number;
  duplicateMatchIds: string[];
  currentDomainCandidateSamples: number;
  historicalImportCandidateSamples: number;
  message: string;
};
