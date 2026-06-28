import { describe, expect, it } from 'vitest';
import type { WorldCupBacktestSample } from './types';
import { runCombinedWorldCupCalibration } from './combinedCalibration';

const sample = (
  overrides: Partial<WorldCupBacktestSample>,
): WorldCupBacktestSample => ({
  matchId: 'match-1',
  stage: 'group',
  sourceTier: 'official',
  rawConfidence: 0.72,
  adjustedConfidence: 0.62,
  probabilities: {
    home: 0.6,
    draw: 0.25,
    away: 0.15,
  },
  outcome: 'home',
  ...overrides,
});

describe('runCombinedWorldCupCalibration', () => {
  it('returns no-results calibration when no non-sample samples are available', () => {
    const run = runCombinedWorldCupCalibration({
      historicalSamples: [
        sample({
          matchId: 'sample-row',
          sourceTier: 'sample',
        }),
        sample({
          matchId: 'local-row',
          sourceTier: 'local',
        }),
      ],
    });

    expect(run.backtest.report.overall.sampleSize).toBe(2);
    expect(run.calibration).toEqual({
      status: 'no_results',
      sampleSize: 0,
      minimumSampleSize: 30,
      brierScore: null,
      logLoss: null,
      accuracy: null,
      brierReference: 2 / 3,
      calibrationError: null,
      message: '当前合并回测只包含样例或本地 seed 样本，不能作为真实校准证据。',
    });
    expect(run.audit).toEqual(expect.objectContaining({
      inputSamples: 2,
      acceptedSamples: 2,
      calibrationCandidateSamples: 0,
      officialCandidateSamples: 0,
      verifiedProviderCandidateSamples: 0,
      excludedSampleOrLocalSamples: 2,
      calibrationStageCoverage: 0,
      minimumCalibrationStageCoverage: 2,
      currentDomainCandidateSamples: 0,
      historicalImportCandidateSamples: 0,
    }));
  });

  it('marks calibration as insufficient until enough non-sample samples exist', () => {
    const run = runCombinedWorldCupCalibration({
      currentDomainSamples: [
        sample({
          matchId: 'current-official',
          sourceTier: 'official',
        }),
      ],
      historicalSamples: [
        sample({
          matchId: 'historical-provider',
          sourceTier: 'verified_provider',
          probabilities: {
            home: 0.2,
            draw: 0.25,
            away: 0.55,
          },
          outcome: 'away',
        }),
        sample({
          matchId: 'historical-local',
          sourceTier: 'local',
          probabilities: {
            home: 0.2,
            draw: 0.25,
            away: 0.55,
          },
          outcome: 'away',
        }),
      ],
    });

    expect(run.calibration).toEqual(expect.objectContaining({
      status: 'insufficient_sample',
      sampleSize: 2,
      minimumSampleSize: 30,
      brierScore: expect.any(Number),
      logLoss: expect.any(Number),
      accuracy: 1,
      calibrationError: expect.any(Number),
    }));
    expect(run.audit).toEqual(expect.objectContaining({
      inputSamples: 3,
      acceptedSamples: 3,
      calibrationCandidateSamples: 2,
      officialCandidateSamples: 1,
      verifiedProviderCandidateSamples: 1,
      excludedSampleOrLocalSamples: 1,
      calibrationStageCoverage: 1,
      minimumCalibrationStageCoverage: 2,
      currentDomainCandidateSamples: 1,
      historicalImportCandidateSamples: 1,
    }));
    expect(run.calibration.message).toContain('样本不足');
  });

  it('marks calibration ready only when non-sample candidate samples and stage coverage reach the thresholds', () => {
    const providerSamples = Array.from({ length: 29 }, (_, index) => sample({
      matchId: `provider-${index}`,
      sourceTier: 'verified_provider',
      probabilities: {
        home: 0.2,
        draw: 0.25,
        away: 0.55,
      },
      outcome: 'away',
    }));

    const almostReady = runCombinedWorldCupCalibration({
      currentDomainSamples: [
        sample({
          matchId: 'current-official',
          sourceTier: 'official',
        }),
      ],
      historicalSamples: providerSamples.slice(0, 28),
    });
    const singleStage = runCombinedWorldCupCalibration({
      currentDomainSamples: [
        sample({
          matchId: 'current-official',
          sourceTier: 'official',
        }),
      ],
      historicalSamples: providerSamples,
    });
    const ready = runCombinedWorldCupCalibration({
      currentDomainSamples: [
        sample({
          matchId: 'current-official',
          sourceTier: 'official',
        }),
      ],
      historicalSamples: [
        ...providerSamples.slice(0, 28),
        sample({
          matchId: 'provider-final',
          sourceTier: 'verified_provider',
          stage: 'final',
          probabilities: {
            home: 0.2,
            draw: 0.25,
            away: 0.55,
          },
          outcome: 'away',
        }),
      ],
    });

    expect(almostReady.calibration.status).toBe('insufficient_sample');
    expect(almostReady.calibration.sampleSize).toBe(29);
    expect(singleStage.calibration.status).toBe('insufficient_sample');
    expect(singleStage.calibration.sampleSize).toBe(30);
    expect(singleStage.calibration.message).toContain('阶段覆盖不足');
    expect(ready.calibration.status).toBe('ready');
    expect(ready.calibration.sampleSize).toBe(30);
    expect(ready.audit).toEqual(expect.objectContaining({
      officialCandidateSamples: 1,
      verifiedProviderCandidateSamples: 29,
      calibrationStageCoverage: 2,
      minimumCalibrationStageCoverage: 2,
      currentDomainCandidateSamples: 1,
      historicalImportCandidateSamples: 29,
    }));
    expect(ready.calibration.message).toContain('第三方 provider 仍保留来源标签');
  });

  it('excludes duplicate historical samples before building calibration metrics', () => {
    const run = runCombinedWorldCupCalibration({
      currentDomainSamples: [
        sample({
          matchId: 'same-match',
          sourceTier: 'official',
          outcome: 'home',
        }),
      ],
      historicalSamples: [
        sample({
          matchId: 'same-match',
          sourceTier: 'verified_provider',
          outcome: 'away',
        }),
      ],
    });

    expect(run.calibration).toEqual(expect.objectContaining({
      status: 'insufficient_sample',
      sampleSize: 1,
      accuracy: 1,
    }));
    expect(run.audit).toEqual(expect.objectContaining({
      rejectedDuplicateSamples: 1,
      duplicateMatchIds: ['same-match'],
      calibrationCandidateSamples: 1,
      officialCandidateSamples: 1,
      verifiedProviderCandidateSamples: 0,
      calibrationStageCoverage: 1,
      minimumCalibrationStageCoverage: 2,
      currentDomainCandidateSamples: 1,
      historicalImportCandidateSamples: 0,
    }));
  });
});
