import { describe, expect, it } from 'vitest';
import { WORLD_CUP_MODEL_CONFIG } from '../logic/modelConfig';
import type { WorldCupBacktestSample } from './types';
import {
  buildWorldCupStrategyCalibrationOverrides,
  recommendWorldCupStrategyTuning,
} from './strategyTuning';

const sample = (overrides: Partial<WorldCupBacktestSample>): WorldCupBacktestSample => ({
  matchId: 'match-1',
  stage: 'round16',
  sourceTier: 'official',
  rawConfidence: 0.62,
  adjustedConfidence: 0.52,
  probabilities: { home: 0.42, draw: 0.24, away: 0.34 },
  outcome: 'home',
  scenarioProfile: {
    stageBucket: 'knockout',
    edgeBucket: 'close',
    tempoBucket: 'low',
    coverageBucket: 'low',
  },
  ...overrides,
});

describe('strategyTuning', () => {
  it('recommends stronger shrinkage when low-coverage scenarios underperform overall calibration', () => {
    const strongBaseline = Array.from({ length: 8 }, (_, index) => sample({
      matchId: `baseline-${index}`,
      stage: 'group',
      probabilities: { home: 0.72, draw: 0.18, away: 0.1 },
      outcome: 'home',
      scenarioProfile: {
        stageBucket: 'group',
        edgeBucket: 'mismatch',
        tempoBucket: 'normal',
        coverageBucket: 'high',
      },
    }));
    const lowCoverageMisses = Array.from({ length: 6 }, (_, index) => sample({
      matchId: `low-coverage-${index}`,
      probabilities: { home: 0.62, draw: 0.2, away: 0.18 },
      outcome: index % 2 === 0 ? 'away' : 'draw',
    }));

    const tuning = recommendWorldCupStrategyTuning([...strongBaseline, ...lowCoverageMisses]);

    expect(tuning.canTune).toBe(true);
    expect(tuning.recommendations).toContainEqual(expect.objectContaining({
      parameter: 'evidenceShrinkageMultiplier',
      direction: 'increase',
      scenario: expect.objectContaining({ coverageBucket: 'low' }),
    }));
    expect(tuning.candidatePatch).toEqual(expect.objectContaining({
      applies: true,
      baseModelVersion: WORLD_CUP_MODEL_CONFIG.modelVersion,
      changes: expect.arrayContaining([
        expect.objectContaining({
          path: 'featureLayer.evidenceCalibration.shrinkageMultiplier.lowCoverage',
          currentValue: WORLD_CUP_MODEL_CONFIG.featureLayer.evidenceCalibration.shrinkageMultiplier.lowCoverage,
          proposedValue: expect.any(Number),
        }),
      ]),
    }));
    expect(tuning.candidatePatch.changes[0]?.proposedValue).toBeGreaterThan(
      WORLD_CUP_MODEL_CONFIG.featureLayer.evidenceCalibration.shrinkageMultiplier.lowCoverage,
    );
    expect(buildWorldCupStrategyCalibrationOverrides(tuning.candidatePatch)).toEqual(expect.objectContaining({
      shrinkageMultiplier: {
        lowCoverage: tuning.candidatePatch.changes.find((change) => (
          change.path === 'featureLayer.evidenceCalibration.shrinkageMultiplier.lowCoverage'
        ))?.proposedValue,
      },
    }));
    expect(WORLD_CUP_MODEL_CONFIG.featureLayer.evidenceCalibration.shrinkageMultiplier.lowCoverage).toBe(1.18);
  });

  it('recommends stronger draw correction when close low-tempo matches draw more often than predicted', () => {
    const samples = Array.from({ length: 8 }, (_, index) => sample({
      matchId: `draw-heavy-${index}`,
      probabilities: { home: 0.38, draw: 0.24, away: 0.38 },
      outcome: index < 4 ? 'draw' : index % 2 === 0 ? 'home' : 'away',
    }));

    const tuning = recommendWorldCupStrategyTuning(samples);

    expect(tuning.recommendations).toContainEqual(expect.objectContaining({
      parameter: 'drawCorrectionMultiplier',
      direction: 'increase',
      scenario: expect.objectContaining({
        edgeBucket: 'close',
        tempoBucket: 'low',
      }),
      evidence: expect.objectContaining({
        averagePredictedDraw: 0.24,
        actualDrawRate: 0.5,
      }),
    }));
    expect(tuning.candidatePatch.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'featureLayer.evidenceCalibration.drawCorrectionMultiplier.close',
        proposedValue: expect.any(Number),
      }),
      expect.objectContaining({
        path: 'featureLayer.evidenceCalibration.drawCorrectionMultiplier.lowTempo',
        proposedValue: expect.any(Number),
      }),
    ]));
    expect(
      tuning.candidatePatch.changes.find((change) => (
        change.path === 'featureLayer.evidenceCalibration.drawCorrectionMultiplier.close'
      ))?.proposedValue,
    ).toBeGreaterThan(WORLD_CUP_MODEL_CONFIG.featureLayer.evidenceCalibration.drawCorrectionMultiplier.close);
    expect(buildWorldCupStrategyCalibrationOverrides(tuning.candidatePatch)).toEqual({
      drawCorrectionMultiplier: {
        close: tuning.candidatePatch.changes.find((change) => (
          change.path === 'featureLayer.evidenceCalibration.drawCorrectionMultiplier.close'
        ))?.proposedValue,
        lowTempo: tuning.candidatePatch.changes.find((change) => (
          change.path === 'featureLayer.evidenceCalibration.drawCorrectionMultiplier.lowTempo'
        ))?.proposedValue,
      },
    });
  });

  it('does not tune from sample or local-only evidence', () => {
    const localOnly = Array.from({ length: 8 }, (_, index) => sample({
      matchId: `local-${index}`,
      sourceTier: 'local',
      probabilities: { home: 0.38, draw: 0.24, away: 0.38 },
      outcome: 'draw',
    }));

    const tuning = recommendWorldCupStrategyTuning(localOnly);

    expect(tuning.canTune).toBe(false);
    expect(tuning.recommendations).toEqual([]);
    expect(tuning.status).toBe('insufficient_evidence');
    expect(tuning.candidatePatch).toEqual({
      applies: false,
      baseModelVersion: WORLD_CUP_MODEL_CONFIG.modelVersion,
      changes: [],
    });
    expect(buildWorldCupStrategyCalibrationOverrides(tuning.candidatePatch)).toEqual({});
  });

  it('does not tune from post-match reconstructed predictions', () => {
    const reconstructed = Array.from({ length: 8 }, (_, index) => sample({
      matchId: `reconstructed-${index}`,
      predictionOrigin: 'post_match_reconstruction',
      probabilities: { home: 0.38, draw: 0.24, away: 0.38 },
      outcome: 'draw',
    }));

    const tuning = recommendWorldCupStrategyTuning(reconstructed);

    expect(tuning.canTune).toBe(false);
    expect(tuning.candidateSamples).toBe(0);
    expect(tuning.recommendations).toEqual([]);
  });
});
