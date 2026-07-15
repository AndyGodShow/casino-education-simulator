import { calibrateOutcomes } from '../calibration/outcomeCalibration';
import type {
  MatchDataQualityState,
  PredictionReliabilityState,
  WorldCupDomainModel,
} from '../domain/WorldCupDomainModel';
import { calculateAccuracy, calculateBrierScore, calculateLogLoss, type PredictionResult } from '../logic/scoring';
import { actualOutcomeFromMatch } from '../logic/matchOutcome';
import { WORLD_CUP_MODEL_CONFIG } from '../logic/modelConfig';
import type { WorldCupMatch } from '../types';
import type {
  WorldCupBacktestBucket,
  WorldCupBacktestCalibrationReadiness,
  WorldCupBacktestCalibrationUsabilityStatus,
  WorldCupBacktestMetrics,
  WorldCupBacktestQuality,
  WorldCupBacktestReport,
  WorldCupBacktestSample,
  WorldCupBacktestScenarioBuckets,
  WorldCupBacktestScenarioProfile,
  WorldCupBacktestStageCoverage,
  WorldCupBacktestSourceCoverage,
  WorldCupBacktestSourceTier,
  WorldCupConfidenceBacktestBucket,
} from './types';

export type {
  WorldCupBacktestReport,
  WorldCupBacktestSample,
} from './types';

const confidenceBuckets: Array<{
  label: WorldCupConfidenceBacktestBucket['label'];
  range: [number, number];
}> = [
  { label: 'low', range: [0, 0.45] },
  { label: 'medium', range: [0.45, 0.7] },
  { label: 'high', range: [0.7, 1] },
];

const sourceTiers: WorldCupBacktestSourceTier[] = [
  'official',
  'verified_provider',
  'sample',
  'local',
];

export const isWorldCupCalibrationCandidate = (sample: WorldCupBacktestSample) => (
  (sample.sourceTier === 'official' || sample.sourceTier === 'verified_provider')
  && sample.predictionOrigin !== 'post_match_reconstruction'
);

const stageOrder: Array<WorldCupMatch['stage']> = [
  'group',
  'round32',
  'round16',
  'quarter',
  'semi',
  'thirdPlace',
  'final',
];

const profileForPrediction = (
  stage: WorldCupMatch['stage'],
  prediction: WorldCupDomainModel['predictions'][string],
): WorldCupBacktestScenarioProfile | undefined => {
  const existingProfile = prediction.featureLayer?.metadata.evidenceCalibration?.profile;
  if (existingProfile) {
    return {
      stageBucket: existingProfile.stageBucket,
      edgeBucket: existingProfile.edgeBucket,
      tempoBucket: existingProfile.tempoBucket,
      coverageBucket: existingProfile.coverageBucket,
    };
  }

  const config = WORLD_CUP_MODEL_CONFIG.featureLayer.evidenceCalibration;
  const lambdaHome = prediction.decisionLayer.expectedGoals.home;
  const lambdaAway = prediction.decisionLayer.expectedGoals.away;
  const lambdaDiff = Math.abs(lambdaHome - lambdaAway);
  const totalGoals = lambdaHome + lambdaAway;
  const coverage = prediction.featureLayer?.metadata.inputCoverage.overallRatio;
  if (!Number.isFinite(lambdaDiff) || !Number.isFinite(totalGoals) || typeof coverage !== 'number' || !Number.isFinite(coverage)) return undefined;

  return {
    stageBucket: stage === 'group' ? 'group' : 'knockout',
    edgeBucket: lambdaDiff <= config.buckets.closeEdgeThreshold
      ? 'close'
      : lambdaDiff >= config.buckets.mismatchEdgeThreshold
        ? 'mismatch'
        : 'balanced',
    tempoBucket: totalGoals <= config.buckets.lowTempoGoalThreshold
      ? 'low'
      : totalGoals >= config.buckets.highTempoGoalThreshold
        ? 'high'
        : 'normal',
    coverageBucket: coverage < config.buckets.lowCoverageThreshold
      ? 'low'
      : coverage < config.buckets.partialCoverageThreshold
        ? 'partial'
        : 'high',
  };
};

const toPredictionResults = (samples: WorldCupBacktestSample[]): PredictionResult[] =>
  samples.map((sample) => ({
    probabilities: sample.probabilities,
    outcome: sample.outcome,
  }));

const emptyMetrics = (): WorldCupBacktestMetrics => ({
  sampleSize: 0,
  accuracy: 0,
  brierScore: 0,
  logLoss: 0,
  brierReference: 2 / 3,
  calibrationError: 0,
});

const roundMetric = (value: number) => Number(value.toFixed(6));

const metricsFor = (samples: WorldCupBacktestSample[]): WorldCupBacktestMetrics => {
  if (samples.length === 0) return emptyMetrics();

  const results = toPredictionResults(samples);
  const calibration = calibrateOutcomes(results);

  return {
    sampleSize: samples.length,
    accuracy: roundMetric(calculateAccuracy(results)),
    brierScore: roundMetric(calculateBrierScore(results)),
    logLoss: roundMetric(calculateLogLoss(results)),
    brierReference: calibration.brierReference,
    calibrationError: roundMetric(calibration.overconfidence.calibrationError),
  };
};

const bucketFor = (samples: WorldCupBacktestSample[]): WorldCupBacktestBucket => {
  const metrics = metricsFor(samples);

  return {
    ...metrics,
    count: samples.length,
    averageRawConfidence: samples.length
      ? roundMetric(samples.reduce((sum, sample) => sum + sample.rawConfidence, 0) / samples.length)
      : 0,
    averageAdjustedConfidence: samples.length
      ? roundMetric(samples.reduce((sum, sample) => sum + sample.adjustedConfidence, 0) / samples.length)
      : 0,
  };
};

const confidenceBucketFor = (
  bucket: (typeof confidenceBuckets)[number],
  samples: WorldCupBacktestSample[],
): WorldCupConfidenceBacktestBucket => ({
  label: bucket.label,
  range: bucket.range,
  ...bucketFor(samples),
});

const inConfidenceRange = (confidence: number, [min, max]: [number, number]) => {
  if (max === 1) return confidence >= min && confidence <= max;
  return confidence >= min && confidence < max;
};

const groupBy = <K extends string>(
  samples: WorldCupBacktestSample[],
  keyFor: (sample: WorldCupBacktestSample) => K,
): Partial<Record<K, WorldCupBacktestBucket>> => {
  const groups = new Map<K, WorldCupBacktestSample[]>();

  for (const sample of samples) {
    const key = keyFor(sample);
    const group = groups.get(key);
    if (group) {
      group.push(sample);
    } else {
      groups.set(key, [sample]);
    }
  }

  return Object.fromEntries(
    [...groups.entries()].map(([key, groupSamples]) => [key, bucketFor(groupSamples)]),
  ) as Partial<Record<K, WorldCupBacktestBucket>>;
};

const sourceCoverageFor = (samples: WorldCupBacktestSample[]): WorldCupBacktestSourceCoverage => {
  const total = samples.length;

  return Object.fromEntries(
    sourceTiers.map((tier) => {
      const count = samples.filter((sample) => sample.sourceTier === tier).length;
      return [tier, {
        count,
        coverage: total > 0 ? roundMetric(count / total) : 0,
      }];
    }),
  ) as WorldCupBacktestSourceCoverage;
};

const stageCoverageFor = (samples: WorldCupBacktestSample[]): WorldCupBacktestStageCoverage => {
  const total = samples.length;
  if (total === 0) return {};

  return Object.fromEntries(
    stageOrder.flatMap((stage) => {
      const count = samples.filter((sample) => sample.stage === stage).length;
      return count > 0
        ? [[stage, {
          count,
          coverage: roundMetric(count / total),
        }]]
        : [];
    }),
  ) as WorldCupBacktestStageCoverage;
};

const scenarioBucketsFor = (samples: WorldCupBacktestSample[]): WorldCupBacktestScenarioBuckets => {
  const profiledSamples = samples.filter((sample) => sample.scenarioProfile);

  return {
    byStageBucket: groupBy(profiledSamples, (sample) => sample.scenarioProfile?.stageBucket ?? 'group'),
    byEdgeBucket: groupBy(profiledSamples, (sample) => sample.scenarioProfile?.edgeBucket ?? 'balanced'),
    byTempoBucket: groupBy(profiledSamples, (sample) => sample.scenarioProfile?.tempoBucket ?? 'normal'),
    byCoverageBucket: groupBy(profiledSamples, (sample) => sample.scenarioProfile?.coverageBucket ?? 'partial'),
  };
};

const calibrationUsabilityFor = (
  allSamples: WorldCupBacktestSample[],
  nonSampleSamples: WorldCupBacktestSample[],
): WorldCupBacktestQuality['calibrationUsability'] => {
  const minimumSampleSize = WORLD_CUP_MODEL_CONFIG.backtest.minimumCalibrationSampleSize;
  const minimumStageCoverage = WORLD_CUP_MODEL_CONFIG.backtest.minimumCalibrationStageCoverage;
  const stageCoverage = new Set(nonSampleSamples.map((sample) => sample.stage)).size;
  let status: WorldCupBacktestCalibrationUsabilityStatus = 'usable';
  let message = '非样例回测样本达到校准阈值，且覆盖多个赛事阶段，可作为校准候选证据；第三方 provider 仍保留其来源标记。';

  if (allSamples.length === 0) {
    status = 'no_samples';
    message = '暂无已完赛回测样本，不能用于校准。';
  } else if (nonSampleSamples.length === 0) {
    status = 'sample_or_local_only';
    message = '当前回测只包含样例或本地 seed 数据，不能作为真实校准证据。';
  } else if (nonSampleSamples.length < minimumSampleSize) {
    status = 'insufficient_non_sample';
    message = '非样例回测样本不足，不能证明模型已校准。';
  } else if (stageCoverage < minimumStageCoverage) {
    status = 'insufficient_stage_coverage';
    message = '非样例回测样本达到数量阈值，但阶段覆盖不足，不能证明模型可泛化。';
  }

  return {
    status,
    canUseForCalibration: status === 'usable',
    sampleSize: nonSampleSamples.length,
    minimumSampleSize,
    stageCoverage,
    minimumStageCoverage,
    message,
  };
};

const calibrationReadinessFor = (
  samples: WorldCupBacktestSample[],
  sourceTier: Extract<WorldCupBacktestSourceTier, 'official' | 'verified_provider'>,
): WorldCupBacktestCalibrationReadiness => {
  const minimumSampleSize = WORLD_CUP_MODEL_CONFIG.backtest.minimumCalibrationSampleSize;
  const minimumStageCoverage = WORLD_CUP_MODEL_CONFIG.backtest.minimumCalibrationStageCoverage;
  const stageCoverage = new Set(samples.map((sample) => sample.stage)).size;
  let status: WorldCupBacktestCalibrationUsabilityStatus = 'usable';
  let message = sourceTier === 'official'
    ? '官方回测样本达到校准阈值并覆盖多个赛事阶段，可作为官方校准证据。'
    : '第三方 provider 回测样本达到校准阈值并覆盖多个赛事阶段，可作为校准候选；第三方 provider 不等同官方校准证据。';

  if (samples.length === 0) {
    status = 'no_samples';
    message = sourceTier === 'official'
      ? '暂无官方回测样本，不能作为官方校准证据。'
      : '暂无第三方 provider 回测样本，不能作为第三方校准候选。';
  } else if (samples.length < minimumSampleSize) {
    status = 'insufficient_non_sample';
    message = sourceTier === 'official'
      ? '官方回测样本不足，不能作为官方校准证据。'
      : '第三方 provider 回测样本不足，不能作为第三方校准候选。';
  } else if (stageCoverage < minimumStageCoverage) {
    status = 'insufficient_stage_coverage';
    message = sourceTier === 'official'
      ? '官方回测样本达到数量阈值，但阶段覆盖不足，不能证明官方校准证据可泛化。'
      : '第三方 provider 回测样本达到数量阈值，但阶段覆盖不足，不能证明模型可泛化；第三方 provider 不等同官方校准证据。';
  }

  return {
    status,
    canUseForCalibration: status === 'usable',
    sampleSize: samples.length,
    minimumSampleSize,
    stageCoverage,
    minimumStageCoverage,
    message,
  };
};

const qualityFor = (samples: WorldCupBacktestSample[]): WorldCupBacktestQuality => {
  const calibrationCandidates = samples.filter(isWorldCupCalibrationCandidate);
  const officialSamples = calibrationCandidates.filter((sample) => sample.sourceTier === 'official');
  const providerSamples = calibrationCandidates.filter((sample) => sample.sourceTier === 'verified_provider');
  const nonSampleSamples = calibrationCandidates;
  const sampleOrLocalSamples = samples.filter((sample) => (
    sample.sourceTier === 'sample' || sample.sourceTier === 'local'
  ));

  return {
    sourceCoverage: sourceCoverageFor(samples),
    officialOnly: metricsFor(officialSamples),
    nonSample: metricsFor(nonSampleSamples),
    sampleOrLocal: metricsFor(sampleOrLocalSamples),
    stageCoverage: stageCoverageFor(samples),
    officialReadiness: calibrationReadinessFor(officialSamples, 'official'),
    providerReadiness: calibrationReadinessFor(providerSamples, 'verified_provider'),
    calibrationUsability: calibrationUsabilityFor(samples, nonSampleSamples),
  };
};

export function runWorldCupBacktest(samples: WorldCupBacktestSample[]): WorldCupBacktestReport {
  return {
    overall: metricsFor(samples),
    byConfidence: confidenceBuckets.map((bucket) => confidenceBucketFor(
      bucket,
      samples.filter((sample) => inConfidenceRange(sample.adjustedConfidence, bucket.range)),
    )),
    bySourceTier: groupBy(samples, (sample) => sample.sourceTier),
    byStage: groupBy(samples, (sample) => sample.stage),
    byScenario: scenarioBucketsFor(samples),
    quality: qualityFor(samples),
  };
}

export function buildWorldCupBacktestSamplesFromParts(input: {
  matches: WorldCupMatch[];
  predictions: Record<string, WorldCupDomainModel['predictions'][string]>;
  matchDataQuality: Record<string, MatchDataQualityState>;
  predictionReliability: Record<string, PredictionReliabilityState>;
  predictionOrigin?: WorldCupBacktestSample['predictionOrigin'];
}): WorldCupBacktestSample[] {
  return input.matches.flatMap((match) => {
    const outcome = actualOutcomeFromMatch(match);
    const prediction = input.predictions[match.id];
    const quality = input.matchDataQuality[match.id];
    if (!outcome || !prediction || !quality) return [];

    const reliability = input.predictionReliability[match.id];

    return [{
      matchId: match.id,
      stage: match.stage,
      sourceTier: quality.tier,
      ...(input.predictionOrigin ? { predictionOrigin: input.predictionOrigin } : {}),
      rawConfidence: reliability?.rawConfidence ?? prediction.confidence,
      adjustedConfidence: reliability?.adjustedConfidence ?? prediction.confidence,
      probabilities: {
        home: prediction.probabilities.homeWin,
        draw: prediction.probabilities.draw,
        away: prediction.probabilities.awayWin,
      },
      outcome,
      scenarioProfile: profileForPrediction(match.stage, prediction),
    }];
  });
}

export function buildWorldCupBacktestSamples(domain: WorldCupDomainModel): WorldCupBacktestSample[] {
  return domain.backtestSamples;
}
