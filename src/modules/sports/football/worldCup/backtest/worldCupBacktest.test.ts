import { describe, expect, it } from 'vitest';
import { worldCupBacktestSample as sample } from '../testFixtures';
import { runWorldCupBacktest } from './worldCupBacktest';

describe('runWorldCupBacktest', () => {
  it('returns an empty report when no historical samples are available', () => {
    const report = runWorldCupBacktest([]);

    expect(report.overall).toEqual({
      sampleSize: 0,
      accuracy: 0,
      brierScore: 0,
      logLoss: 0,
      brierReference: 2 / 3,
      calibrationError: 0,
    });
    expect(report.byConfidence).toEqual([
      expect.objectContaining({ label: 'low', count: 0 }),
      expect.objectContaining({ label: 'medium', count: 0 }),
      expect.objectContaining({ label: 'high', count: 0 }),
    ]);
    expect(report.bySourceTier).toEqual({});
    expect(report.byStage).toEqual({});
    expect(report.quality).toEqual({
      sourceCoverage: {
        official: { count: 0, coverage: 0 },
        verified_provider: { count: 0, coverage: 0 },
        sample: { count: 0, coverage: 0 },
        local: { count: 0, coverage: 0 },
      },
      officialOnly: report.overall,
      nonSample: report.overall,
      sampleOrLocal: report.overall,
      stageCoverage: {},
      officialReadiness: {
        status: 'no_samples',
        canUseForCalibration: false,
        sampleSize: 0,
        minimumSampleSize: 30,
        stageCoverage: 0,
        minimumStageCoverage: 2,
        message: '暂无官方回测样本，不能作为官方校准证据。',
      },
      providerReadiness: {
        status: 'no_samples',
        canUseForCalibration: false,
        sampleSize: 0,
        minimumSampleSize: 30,
        stageCoverage: 0,
        minimumStageCoverage: 2,
        message: '暂无第三方 provider 回测样本，不能作为第三方校准候选。',
      },
      calibrationUsability: {
        status: 'no_samples',
        canUseForCalibration: false,
        sampleSize: 0,
        minimumSampleSize: 30,
        stageCoverage: 0,
        minimumStageCoverage: 2,
        message: '暂无已完赛回测样本，不能用于校准。',
      },
    });
  });

  it('summarizes overall performance and confidence buckets', () => {
    const report = runWorldCupBacktest([
      sample({
        matchId: 'high-hit',
        rawConfidence: 0.82,
        adjustedConfidence: 0.74,
        probabilities: { home: 0.7, draw: 0.2, away: 0.1 },
        outcome: 'home',
      }),
      sample({
        matchId: 'high-miss',
        rawConfidence: 0.78,
        adjustedConfidence: 0.71,
        probabilities: { home: 0.65, draw: 0.2, away: 0.15 },
        outcome: 'away',
      }),
      sample({
        matchId: 'medium-hit',
        rawConfidence: 0.58,
        adjustedConfidence: 0.5,
        probabilities: { home: 0.25, draw: 0.45, away: 0.3 },
        outcome: 'draw',
      }),
      sample({
        matchId: 'low-hit',
        rawConfidence: 0.38,
        adjustedConfidence: 0.28,
        probabilities: { home: 0.2, draw: 0.3, away: 0.5 },
        outcome: 'away',
      }),
    ]);

    expect(report.overall.sampleSize).toBe(4);
    expect(report.overall.accuracy).toBe(0.75);
    expect(report.overall.brierScore).toBeGreaterThan(0);
    expect(report.overall.logLoss).toBeGreaterThan(0);
    expect(report.byConfidence).toEqual([
      expect.objectContaining({
        label: 'low',
        count: 1,
        accuracy: 1,
        averageRawConfidence: 0.38,
        averageAdjustedConfidence: 0.28,
      }),
      expect.objectContaining({
        label: 'medium',
        count: 1,
        accuracy: 1,
        averageRawConfidence: 0.58,
        averageAdjustedConfidence: 0.5,
      }),
      expect.objectContaining({
        label: 'high',
        count: 2,
        accuracy: 0.5,
        averageRawConfidence: 0.8,
        averageAdjustedConfidence: 0.725,
      }),
    ]);
  });

  it('buckets backtest confidence by adjusted confidence after reliability deductions', () => {
    const report = runWorldCupBacktest([
      sample({
        matchId: 'raw-high-adjusted-medium',
        rawConfidence: 0.81,
        adjustedConfidence: 0.64,
      }),
    ]);

    expect(report.byConfidence).toEqual([
      expect.objectContaining({ label: 'low', count: 0 }),
      expect.objectContaining({
        label: 'medium',
        count: 1,
        averageRawConfidence: 0.81,
        averageAdjustedConfidence: 0.64,
      }),
      expect.objectContaining({ label: 'high', count: 0 }),
    ]);
  });

  it('breaks performance down by data source tier and match stage', () => {
    const report = runWorldCupBacktest([
      sample({
        matchId: 'official-group',
        sourceTier: 'official',
        stage: 'group',
        probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
        outcome: 'home',
      }),
      sample({
        matchId: 'official-final',
        sourceTier: 'official',
        stage: 'final',
        probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
        outcome: 'away',
      }),
      sample({
        matchId: 'provider-final',
        sourceTier: 'verified_provider',
        stage: 'final',
        probabilities: { home: 0.2, draw: 0.25, away: 0.55 },
        outcome: 'away',
      }),
      sample({
        matchId: 'seed-semi',
        sourceTier: 'local',
        stage: 'semi',
        probabilities: { home: 0.4, draw: 0.35, away: 0.25 },
        outcome: 'draw',
      }),
    ]);

    expect(report.bySourceTier.official).toEqual(expect.objectContaining({
      count: 2,
      accuracy: 0.5,
    }));
    expect(report.bySourceTier.verified_provider).toEqual(expect.objectContaining({
      count: 1,
      accuracy: 1,
    }));
    expect(report.bySourceTier.local).toEqual(expect.objectContaining({
      count: 1,
      accuracy: 0,
    }));
    expect(report.byStage.group).toEqual(expect.objectContaining({
      count: 1,
      accuracy: 1,
    }));
    expect(report.byStage.final).toEqual(expect.objectContaining({
      count: 2,
      accuracy: 0.5,
    }));
    expect(report.byStage.semi).toEqual(expect.objectContaining({
      count: 1,
      accuracy: 0,
    }));
    expect(report.quality.stageCoverage).toEqual({
      group: { count: 1, coverage: 0.25 },
      final: { count: 2, coverage: 0.5 },
      semi: { count: 1, coverage: 0.25 },
    });
  });

  it('breaks calibration metrics down by model scenario profile for parameter tuning', () => {
    const report = runWorldCupBacktest([
      sample({
        matchId: 'close-low-coverage-hit',
        stage: 'round16',
        probabilities: { home: 0.36, draw: 0.34, away: 0.3 },
        outcome: 'draw',
        scenarioProfile: {
          stageBucket: 'knockout',
          edgeBucket: 'close',
          tempoBucket: 'low',
          coverageBucket: 'low',
        },
      }),
      sample({
        matchId: 'close-low-coverage-miss',
        stage: 'quarter',
        probabilities: { home: 0.38, draw: 0.32, away: 0.3 },
        outcome: 'away',
        scenarioProfile: {
          stageBucket: 'knockout',
          edgeBucket: 'close',
          tempoBucket: 'low',
          coverageBucket: 'low',
        },
      }),
      sample({
        matchId: 'high-coverage-mismatch',
        stage: 'group',
        probabilities: { home: 0.72, draw: 0.18, away: 0.1 },
        outcome: 'home',
        scenarioProfile: {
          stageBucket: 'group',
          edgeBucket: 'mismatch',
          tempoBucket: 'normal',
          coverageBucket: 'high',
        },
      }),
    ]);

    expect(report.byScenario.byStageBucket.knockout).toEqual(expect.objectContaining({
      count: 2,
      sampleSize: 2,
    }));
    expect(report.byScenario.byStageBucket.group).toEqual(expect.objectContaining({
      count: 1,
      accuracy: 1,
    }));
    expect(report.byScenario.byEdgeBucket.close).toEqual(expect.objectContaining({
      count: 2,
    }));
    expect(report.byScenario.byEdgeBucket.mismatch).toEqual(expect.objectContaining({
      count: 1,
      accuracy: 1,
    }));
    expect(report.byScenario.byTempoBucket.low).toEqual(expect.objectContaining({
      count: 2,
    }));
    expect(report.byScenario.byCoverageBucket.low).toEqual(expect.objectContaining({
      count: 2,
    }));
    expect(report.byScenario.byCoverageBucket.high).toEqual(expect.objectContaining({
      count: 1,
    }));
    expect(report.byScenario.byCoverageBucket.low?.brierScore).toBeGreaterThan(0);
  });

});
