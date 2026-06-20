import { describe, expect, it } from 'vitest';
import type { WorldCupDomainModel } from '../domain/WorldCupDomainModel';
import { buildWorldCupBacktestSamples, runWorldCupBacktest, type WorldCupBacktestSample } from './worldCupBacktest';

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
      calibrationUsability: {
        status: 'no_samples',
        canUseForCalibration: false,
        sampleSize: 0,
        minimumSampleSize: 30,
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
  });

  it('adds source coverage and quality metrics without treating providers as official', () => {
    const report = runWorldCupBacktest([
      sample({
        matchId: 'official-hit',
        sourceTier: 'official',
        probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
        outcome: 'home',
      }),
      sample({
        matchId: 'official-miss',
        sourceTier: 'official',
        probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
        outcome: 'away',
      }),
      sample({
        matchId: 'provider-hit',
        sourceTier: 'verified_provider',
        probabilities: { home: 0.2, draw: 0.25, away: 0.55 },
        outcome: 'away',
      }),
      sample({
        matchId: 'sample-hit',
        sourceTier: 'sample',
        probabilities: { home: 0.2, draw: 0.25, away: 0.55 },
        outcome: 'away',
      }),
    ]);

    expect(report.quality.sourceCoverage).toEqual({
      official: { count: 2, coverage: 0.5 },
      verified_provider: { count: 1, coverage: 0.25 },
      sample: { count: 1, coverage: 0.25 },
      local: { count: 0, coverage: 0 },
    });
    expect(report.quality.officialOnly).toEqual(expect.objectContaining({
      sampleSize: 2,
      accuracy: 0.5,
    }));
    expect(report.quality.nonSample).toEqual(expect.objectContaining({
      sampleSize: 3,
      accuracy: 0.666667,
    }));
    expect(report.quality.sampleOrLocal).toEqual(expect.objectContaining({
      sampleSize: 1,
      accuracy: 1,
    }));
    expect(report.quality.calibrationUsability).toEqual(expect.objectContaining({
      status: 'insufficient_non_sample',
      canUseForCalibration: false,
      sampleSize: 3,
      minimumSampleSize: 30,
    }));
  });

  it('requires enough non-sample samples before marking a backtest usable for calibration', () => {
    const providerSamples = Array.from({ length: 29 }, (_, index) => sample({
      matchId: `provider-${index}`,
      sourceTier: 'verified_provider',
      probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
      outcome: 'home',
    }));
    const localSample = sample({
      matchId: 'local-seed',
      sourceTier: 'local',
      probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
      outcome: 'home',
    });

    expect(runWorldCupBacktest([...providerSamples, localSample]).quality.calibrationUsability)
      .toEqual(expect.objectContaining({
        status: 'insufficient_non_sample',
        canUseForCalibration: false,
        sampleSize: 29,
      }));

    expect(runWorldCupBacktest([
      ...providerSamples,
      sample({
        matchId: 'provider-29',
        sourceTier: 'verified_provider',
        probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
        outcome: 'home',
      }),
      localSample,
    ]).quality.calibrationUsability).toEqual(expect.objectContaining({
      status: 'usable',
      canUseForCalibration: true,
      sampleSize: 30,
    }));
  });

  it('builds backtest samples from finished domain matches only', () => {
    const domain: WorldCupDomainModel = {
      matches: [
        {
          id: 'finished-with-prediction',
          competitionId: 'world-cup-2026',
          stage: 'group',
          group: 'A',
          homeTeamId: 'alpha',
          awayTeamId: 'beta',
          kickoff: '2026-06-18T18:00:00.000Z',
          status: 'finished',
          homeScore: 2,
          awayScore: 1,
          source: 'official',
          lastUpdated: '2026-06-18T22:00:00.000Z',
        },
        {
          id: 'scheduled-with-prediction',
          competitionId: 'world-cup-2026',
          stage: 'group',
          group: 'A',
          homeTeamId: 'gamma',
          awayTeamId: 'delta',
          kickoff: '2026-06-19T18:00:00.000Z',
          status: 'scheduled',
          source: 'official',
          lastUpdated: '2026-06-18T22:00:00.000Z',
        },
      ],
      teams: {},
      predictions: {
        'finished-with-prediction': {
          matchId: 'finished-with-prediction',
          probabilities: {
            homeWin: 0.58,
            draw: 0.24,
            awayWin: 0.18,
          },
          expectedGoals: { home: 1.4, away: 0.9 },
          scoreDistribution: [],
          mostLikelyScore: '1-0',
          confidence: 0.76,
          explanation: { summary: 'summary', factors: [] },
          modelVersion: 'v2',
          truth: { level: 'official', source: 'official', updatedAt: 0 },
          unifiedProbability: {
            model: { home: 0.58, draw: 0.24, away: 0.18 },
            market: null,
            merged: null,
            truth: { level: 'official', source: 'official', updatedAt: 0 },
          },
          decisionLayer: {
            expectedGoals: { home: 1.4, away: 0.9 },
            scoreDistribution: [],
            oneX2: { homeWin: 0.58, draw: 0.24, awayWin: 0.18 },
            mostLikelyScore: { home: 1, away: 0 },
            confidence: 0.76,
          },
        },
        'scheduled-with-prediction': {
          matchId: 'scheduled-with-prediction',
          probabilities: {
            homeWin: 0.42,
            draw: 0.3,
            awayWin: 0.28,
          },
          expectedGoals: { home: 1.1, away: 1 },
          scoreDistribution: [],
          mostLikelyScore: '1-1',
          confidence: 0.51,
          explanation: { summary: 'summary', factors: [] },
          modelVersion: 'v2',
          truth: { level: 'official', source: 'official', updatedAt: 0 },
          unifiedProbability: {
            model: { home: 0.42, draw: 0.3, away: 0.28 },
            market: null,
            merged: null,
            truth: { level: 'official', source: 'official', updatedAt: 0 },
          },
          decisionLayer: {
            expectedGoals: { home: 1.1, away: 1 },
            scoreDistribution: [],
            oneX2: { homeWin: 0.42, draw: 0.3, awayWin: 0.28 },
            mostLikelyScore: { home: 1, away: 1 },
            confidence: 0.51,
          },
        },
      },
      markets: {},
      simulation: { probabilities: [] },
      calibration: {
        status: 'insufficient_sample',
        sampleSize: 1,
        minimumSampleSize: 30,
        brierScore: 0.3,
        logLoss: 0.54,
        accuracy: 1,
        brierReference: 2 / 3,
        calibrationError: 0.02,
        message: 'sample',
      },
      predictionAudit: {
        status: 'passed',
        checkedMatches: 2,
        passedMatches: 2,
        warningCount: 0,
        maxProbabilityDrift: 0,
        message: 'passed',
      },
      backtest: runWorldCupBacktest([]),
      predictionReliability: {
        'finished-with-prediction': {
          matchId: 'finished-with-prediction',
          rawConfidence: 0.76,
          adjustedConfidence: 0.64,
          deductions: [],
          label: 'medium',
          caveat: 'medium',
        },
      },
      sourceGate: {
        tier: 'official',
        label: 'Official gate',
        canUseForRealPrediction: true,
        requiresOfficialVerification: false,
        message: 'official',
      },
      matchDataQuality: {
        'finished-with-prediction': {
          matchId: 'finished-with-prediction',
          source: 'official',
          tier: 'official',
          label: 'Official fixture',
          lastUpdated: 0,
          staleness: 'fresh',
          stalenessHours: 0,
          isOfficialFixture: true,
          isVerifiedProvider: true,
          hasVerifiedScore: true,
          canUseForRealPrediction: true,
          caveat: 'official',
        },
        'scheduled-with-prediction': {
          matchId: 'scheduled-with-prediction',
          source: 'official',
          tier: 'official',
          label: 'Official fixture',
          lastUpdated: 0,
          staleness: 'fresh',
          stalenessHours: 0,
          isOfficialFixture: true,
          isVerifiedProvider: true,
          hasVerifiedScore: false,
          canUseForRealPrediction: true,
          caveat: 'official',
        },
      },
      source: 'official',
      lastUpdated: 0,
      errors: [],
    };

    expect(buildWorldCupBacktestSamples(domain)).toEqual([
      {
        matchId: 'finished-with-prediction',
        stage: 'group',
        sourceTier: 'official',
        rawConfidence: 0.76,
        adjustedConfidence: 0.64,
        probabilities: {
          home: 0.58,
          draw: 0.24,
          away: 0.18,
        },
        outcome: 'home',
      },
    ]);
  });
});
