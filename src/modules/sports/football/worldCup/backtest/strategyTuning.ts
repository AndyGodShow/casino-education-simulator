import { WORLD_CUP_MODEL_CONFIG, type WorldCupStrategyCalibrationOverrides } from '../logic/modelConfig';
import { calculateBrierScore, type PredictionResult } from '../logic/scoring';
import type {
  WorldCupBacktestSample,
  WorldCupBacktestScenarioProfile,
} from './types';
import { isWorldCupCalibrationCandidate } from './worldCupBacktest';

export type WorldCupStrategyTuningParameter =
  | 'evidenceShrinkageMultiplier'
  | 'drawCorrectionMultiplier';

export type WorldCupStrategyTuningDirection = 'increase' | 'decrease';

export type WorldCupStrategyTuningRecommendation = {
  parameter: WorldCupStrategyTuningParameter;
  direction: WorldCupStrategyTuningDirection;
  scenario: Partial<WorldCupBacktestScenarioProfile>;
  suggestedMultiplierDelta: number;
  evidence: {
    sampleSize: number;
    brierScore: number;
    overallBrierScore: number;
    averagePredictedDraw: number;
    actualDrawRate: number;
  };
  rationale: string;
};

export type WorldCupStrategyTuningPatchChange = {
  path: string;
  currentValue: number;
  proposedValue: number;
  delta: number;
  recommendation: WorldCupStrategyTuningRecommendation;
};

export type WorldCupStrategyTuningPatch = {
  applies: boolean;
  baseModelVersion: typeof WORLD_CUP_MODEL_CONFIG.modelVersion;
  changes: WorldCupStrategyTuningPatchChange[];
};

export type WorldCupStrategyTuningReport = {
  status: 'ready' | 'insufficient_evidence';
  canTune: boolean;
  candidateSamples: number;
  recommendations: WorldCupStrategyTuningRecommendation[];
  candidatePatch: WorldCupStrategyTuningPatch;
};

const toPredictionResults = (samples: WorldCupBacktestSample[]): PredictionResult[] =>
  samples.map((sample) => ({
    probabilities: sample.probabilities,
    outcome: sample.outcome,
  }));

const brierFor = (samples: WorldCupBacktestSample[]) => calculateBrierScore(toPredictionResults(samples));

const rounded = (value: number) => Number(value.toFixed(6));

const averagePredictedDraw = (samples: WorldCupBacktestSample[]) =>
  samples.length ? samples.reduce((sum, sample) => sum + sample.probabilities.draw, 0) / samples.length : 0;

const actualDrawRate = (samples: WorldCupBacktestSample[]) =>
  samples.length ? samples.filter((sample) => sample.outcome === 'draw').length / samples.length : 0;

const groupSamples = (
  samples: WorldCupBacktestSample[],
  predicate: (profile: WorldCupBacktestScenarioProfile) => boolean,
) => samples.filter((sample) => sample.scenarioProfile && predicate(sample.scenarioProfile));

const multiplierStep = (pressure: number) =>
  rounded(Math.min(WORLD_CUP_MODEL_CONFIG.strategyTuning.maxMultiplierStep, Math.max(0.02, pressure)));

const candidatePatchBaseline = (): WorldCupStrategyTuningPatch => ({
  applies: false,
  baseModelVersion: WORLD_CUP_MODEL_CONFIG.modelVersion,
  changes: [],
});

const clampMultiplier = (value: number, max: number) => rounded(Math.min(max, Math.max(0.5, value)));

const applyDirection = (
  currentValue: number,
  direction: WorldCupStrategyTuningDirection,
  delta: number,
  max: number,
) => {
  const signedDelta = direction === 'increase' ? delta : -delta;
  return clampMultiplier(currentValue + signedDelta, max);
};

const patchChange = (
  path: string,
  currentValue: number,
  proposedValue: number,
  recommendation: WorldCupStrategyTuningRecommendation,
): WorldCupStrategyTuningPatchChange => ({
  path,
  currentValue,
  proposedValue,
  delta: rounded(proposedValue - currentValue),
  recommendation,
});

const buildCandidatePatch = (
  recommendations: WorldCupStrategyTuningRecommendation[],
): WorldCupStrategyTuningPatch => {
  const patch = candidatePatchBaseline();
  const evidenceCalibration = WORLD_CUP_MODEL_CONFIG.featureLayer.evidenceCalibration;

  recommendations.forEach((recommendation) => {
    if (recommendation.parameter === 'evidenceShrinkageMultiplier') {
      const currentValue = evidenceCalibration.shrinkageMultiplier.lowCoverage;
      const proposedValue = applyDirection(
        currentValue,
        recommendation.direction,
        recommendation.suggestedMultiplierDelta,
        1.8,
      );

      if (proposedValue !== currentValue) {
        patch.changes.push(patchChange(
          'featureLayer.evidenceCalibration.shrinkageMultiplier.lowCoverage',
          currentValue,
          proposedValue,
          recommendation,
        ));
      }
    }

    if (recommendation.parameter === 'drawCorrectionMultiplier') {
      const paths = [
        {
          path: 'featureLayer.evidenceCalibration.drawCorrectionMultiplier.close',
          currentValue: evidenceCalibration.drawCorrectionMultiplier.close,
        },
        {
          path: 'featureLayer.evidenceCalibration.drawCorrectionMultiplier.lowTempo',
          currentValue: evidenceCalibration.drawCorrectionMultiplier.lowTempo,
        },
      ];
      const distributedDelta = rounded(recommendation.suggestedMultiplierDelta / paths.length);

      paths.forEach(({ path, currentValue }) => {
        const proposedValue = applyDirection(
          currentValue,
          recommendation.direction,
          distributedDelta,
          evidenceCalibration.drawCorrectionMultiplier.max,
        );

        if (proposedValue !== currentValue) {
          patch.changes.push(patchChange(path, currentValue, proposedValue, recommendation));
        }
      });
    }
  });

  return {
    ...patch,
    applies: patch.changes.length > 0,
  };
};

const recommendationEvidence = (
  samples: WorldCupBacktestSample[],
  overallBrierScore: number,
) => ({
  sampleSize: samples.length,
  brierScore: rounded(brierFor(samples)),
  overallBrierScore: rounded(overallBrierScore),
  averagePredictedDraw: rounded(averagePredictedDraw(samples)),
  actualDrawRate: rounded(actualDrawRate(samples)),
});

export function buildWorldCupStrategyCalibrationOverrides(
  patch: WorldCupStrategyTuningPatch,
): WorldCupStrategyCalibrationOverrides {
  const overrides: WorldCupStrategyCalibrationOverrides = {};

  patch.changes.forEach((change) => {
    if (change.path === 'featureLayer.evidenceCalibration.shrinkageMultiplier.lowCoverage') {
      overrides.shrinkageMultiplier = {
        ...overrides.shrinkageMultiplier,
        lowCoverage: change.proposedValue,
      };
    }

    if (change.path === 'featureLayer.evidenceCalibration.drawCorrectionMultiplier.close') {
      overrides.drawCorrectionMultiplier = {
        ...overrides.drawCorrectionMultiplier,
        close: change.proposedValue,
      };
    }

    if (change.path === 'featureLayer.evidenceCalibration.drawCorrectionMultiplier.lowTempo') {
      overrides.drawCorrectionMultiplier = {
        ...overrides.drawCorrectionMultiplier,
        lowTempo: change.proposedValue,
      };
    }
  });

  return overrides;
}

export function recommendWorldCupStrategyTuning(
  samples: WorldCupBacktestSample[],
): WorldCupStrategyTuningReport {
  const config = WORLD_CUP_MODEL_CONFIG.strategyTuning;
  const candidateSamples = samples.filter((sample) => (
    isWorldCupCalibrationCandidate(sample) && sample.scenarioProfile
  ));

  if (candidateSamples.length < config.minimumScenarioSamples) {
    return {
      status: 'insufficient_evidence',
      canTune: false,
      candidateSamples: candidateSamples.length,
      recommendations: [],
      candidatePatch: candidatePatchBaseline(),
    };
  }

  const overallBrierScore = brierFor(candidateSamples);
  const recommendations: WorldCupStrategyTuningRecommendation[] = [];
  const lowCoverageSamples = groupSamples(candidateSamples, (profile) => (
    profile.coverageBucket === 'low' || profile.coverageBucket === 'partial'
  ));

  if (lowCoverageSamples.length >= config.minimumScenarioSamples) {
    const lowCoverageBrier = brierFor(lowCoverageSamples);
    const brierPressure = lowCoverageBrier - overallBrierScore;

    if (brierPressure >= config.brierUnderperformanceMargin) {
      recommendations.push({
        parameter: 'evidenceShrinkageMultiplier',
        direction: 'increase',
        scenario: { coverageBucket: 'low' },
        suggestedMultiplierDelta: multiplierStep(brierPressure),
        evidence: recommendationEvidence(lowCoverageSamples, overallBrierScore),
        rationale: 'Low/partial coverage scenarios underperform the calibration candidate baseline; shrink team-edge lambda harder before trusting sparse feature gaps.',
      });
    }
  }

  const closeLowTempoSamples = groupSamples(candidateSamples, (profile) => (
    profile.edgeBucket === 'close' && profile.tempoBucket === 'low'
  ));

  if (closeLowTempoSamples.length >= config.minimumScenarioSamples) {
    const predictedDraw = averagePredictedDraw(closeLowTempoSamples);
    const observedDraw = actualDrawRate(closeLowTempoSamples);
    const drawGap = observedDraw - predictedDraw;

    if (Math.abs(drawGap) >= config.drawRateGapThreshold) {
      recommendations.push({
        parameter: 'drawCorrectionMultiplier',
        direction: drawGap > 0 ? 'increase' : 'decrease',
        scenario: { edgeBucket: 'close', tempoBucket: 'low' },
        suggestedMultiplierDelta: multiplierStep(Math.abs(drawGap)),
        evidence: recommendationEvidence(closeLowTempoSamples, overallBrierScore),
        rationale: drawGap > 0
          ? 'Close low-tempo matches draw more often than the model prices; increase diagonal score-mass correction.'
          : 'Close low-tempo matches draw less often than the model prices; reduce diagonal score-mass correction.',
      });
    }
  }

  return {
    status: 'ready',
    canTune: recommendations.length > 0,
    candidateSamples: candidateSamples.length,
    recommendations,
    candidatePatch: buildCandidatePatch(recommendations),
  };
}
