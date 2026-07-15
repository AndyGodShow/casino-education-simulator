import { describe, expect, it } from 'vitest';
import type { WorldCupDomainModel } from '../domain/WorldCupDomainModel';
import { worldCupBacktestSample as sample } from '../testFixtures';
import {
  buildWorldCupBacktestSamples,
  buildWorldCupBacktestSamplesFromParts,
  runWorldCupBacktest,
} from './worldCupBacktest';

describe('runWorldCupBacktest readiness and sample building', () => {
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
    expect(report.quality.officialReadiness).toEqual(expect.objectContaining({
      status: 'insufficient_non_sample',
      canUseForCalibration: false,
      sampleSize: 2,
      stageCoverage: 1,
      minimumStageCoverage: 2,
    }));
    expect(report.quality.providerReadiness).toEqual(expect.objectContaining({
      status: 'insufficient_non_sample',
      canUseForCalibration: false,
      sampleSize: 1,
      stageCoverage: 1,
      minimumStageCoverage: 2,
    }));
  });

  it('requires enough non-sample samples and stage coverage before marking a backtest usable for calibration', () => {
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
      stageCoverage: 1,
      minimumStageCoverage: 2,
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
      status: 'insufficient_stage_coverage',
      canUseForCalibration: false,
      sampleSize: 30,
      stageCoverage: 1,
      minimumStageCoverage: 2,
    }));

    expect(runWorldCupBacktest([
      ...providerSamples,
      sample({
        matchId: 'provider-29-final',
        sourceTier: 'verified_provider',
        stage: 'final',
        probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
        outcome: 'home',
      }),
      localSample,
    ]).quality.calibrationUsability).toEqual(expect.objectContaining({
      status: 'usable',
      canUseForCalibration: true,
      sampleSize: 30,
      stageCoverage: 2,
      minimumStageCoverage: 2,
    }));
  });

  it('tracks official readiness separately from provider calibration evidence', () => {
    const report = runWorldCupBacktest(
      Array.from({ length: 30 }, (_, index) => sample({
        matchId: `official-${index}`,
        sourceTier: 'official',
        stage: index < 20 ? 'group' : 'final',
        probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
        outcome: 'home',
      })),
    );

    expect(report.quality.calibrationUsability).toEqual(expect.objectContaining({
      status: 'usable',
      canUseForCalibration: true,
      sampleSize: 30,
      stageCoverage: 2,
    }));
    expect(report.quality.officialReadiness).toEqual(expect.objectContaining({
      status: 'usable',
      canUseForCalibration: true,
      sampleSize: 30,
      stageCoverage: 2,
    }));
    expect(report.quality.providerReadiness).toEqual(expect.objectContaining({
      status: 'no_samples',
      canUseForCalibration: false,
      sampleSize: 0,
      stageCoverage: 0,
    }));
  });

  it('allows provider calibration candidates without treating them as official readiness', () => {
    const report = runWorldCupBacktest(
      Array.from({ length: 30 }, (_, index) => sample({
        matchId: `provider-${index}`,
        sourceTier: 'verified_provider',
        stage: index < 20 ? 'group' : 'final',
        probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
        outcome: 'home',
      })),
    );

    expect(report.quality.calibrationUsability).toEqual(expect.objectContaining({
      status: 'usable',
      canUseForCalibration: true,
      sampleSize: 30,
      stageCoverage: 2,
    }));
    expect(report.quality.officialReadiness).toEqual(expect.objectContaining({
      status: 'no_samples',
      canUseForCalibration: false,
      sampleSize: 0,
      stageCoverage: 0,
    }));
    expect(report.quality.providerReadiness).toEqual(expect.objectContaining({
      status: 'usable',
      canUseForCalibration: true,
      sampleSize: 30,
      stageCoverage: 2,
    }));
    expect(report.quality.providerReadiness.message).toContain('第三方 provider 不等同官方');
  });

  it('keeps mixed calibration candidates labelled when no single source reaches readiness', () => {
    const providerSamples = Array.from({ length: 29 }, (_, index) => sample({
      matchId: `provider-${index}`,
      sourceTier: 'verified_provider',
      stage: 'group',
      probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
      outcome: 'home',
    }));
    const report = runWorldCupBacktest([
      ...providerSamples,
      sample({
        matchId: 'official-final',
        sourceTier: 'official',
        stage: 'final',
        probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
        outcome: 'home',
      }),
    ]);

    expect(report.quality.calibrationUsability).toEqual(expect.objectContaining({
      status: 'usable',
      canUseForCalibration: true,
      sampleSize: 30,
      stageCoverage: 2,
    }));
    expect(report.quality.officialReadiness).toEqual(expect.objectContaining({
      status: 'insufficient_non_sample',
      canUseForCalibration: false,
      sampleSize: 1,
      stageCoverage: 1,
    }));
    expect(report.quality.providerReadiness).toEqual(expect.objectContaining({
      status: 'insufficient_non_sample',
      canUseForCalibration: false,
      sampleSize: 29,
      stageCoverage: 1,
    }));
  });

  it('carries prediction scenario profile into generated backtest samples', () => {
    const samples = buildWorldCupBacktestSamplesFromParts({
      matches: [{
        id: 'profiled-finished-match',
        competitionId: 'world-cup-2026',
        stage: 'round16',
        homeTeamId: 'alpha',
        awayTeamId: 'beta',
        kickoff: '2026-06-20T18:00:00.000Z',
        status: 'finished',
        homeScore: 1,
        awayScore: 1,
        source: 'official',
        lastUpdated: '2026-06-20T21:00:00.000Z',
      }],
      predictions: {
        'profiled-finished-match': {
          matchId: 'profiled-finished-match',
          probabilities: { homeWin: 0.34, draw: 0.36, awayWin: 0.3 },
          expectedGoals: { home: 0.95, away: 0.92 },
          scoreDistribution: [],
          mostLikelyScore: '1-1',
          confidence: 0.42,
          explanation: { summary: 'profiled', factors: [] },
          modelVersion: 'v2',
          truth: { level: 'live', confidence: 1, description: 'official', sourceBreakdown: ['official'] },
          unifiedProbability: {
            matchId: 'profiled-finished-match',
            model: { home: 0.34, draw: 0.36, away: 0.3, source: 'model' },
            merged: { home: 0.34, draw: 0.36, away: 0.3, source: 'ensemble' },
            truth: { level: 'live', confidence: 1, description: 'official', sourceBreakdown: ['official'] },
          },
          decisionLayer: {
            expectedGoals: { home: 0.95, away: 0.92 },
            scoreDistribution: [],
            oneX2: { homeWin: 0.34, draw: 0.36, awayWin: 0.3 },
            mostLikelyScore: { home: 1, away: 1 },
            confidence: 0.42,
          },
          featureLayer: {
            home: {
              baseStrength: 0.9,
              attackDefense: 0,
              homeAdvantage: 0,
              formAdjustment: 0,
              matchupAsymmetry: 0,
              stageMultiplier: 0.96,
              advanced: { elo: 0, xg: 0, squadAvailability: 0, rest: 0, travel: 0, total: 0 },
              rawLambda: 0.95,
              lambda: 0.95,
            },
            away: {
              baseStrength: 0.9,
              attackDefense: 0,
              homeAdvantage: 0,
              formAdjustment: 0,
              matchupAsymmetry: 0,
              stageMultiplier: 0.96,
              advanced: { elo: 0, xg: 0, squadAvailability: 0, rest: 0, travel: 0, total: 0 },
              rawLambda: 0.92,
              lambda: 0.92,
            },
            metadata: {
              availableAdvancedFeatures: 0,
              missingAdvancedFeatures: ['elo'],
              inputCoverage: {
                baseFieldsAvailable: 8,
                baseFieldsTotal: 8,
                advancedFieldsAvailable: 0,
                advancedFieldsTotal: 12,
                structuralRatio: 1,
                advancedSourceQualityRatio: 0,
                overallRatio: 0.4,
                missingFields: ['home.advancedMetrics.elo'],
              },
              evidenceCalibration: {
                neutralLambda: 0.935,
                shrinkage: 0.2,
                originalHomeLambda: 1,
                originalAwayLambda: 0.87,
                profile: {
                  stageBucket: 'knockout',
                  edgeBucket: 'close',
                  tempoBucket: 'low',
                  coverageBucket: 'low',
                  shrinkageMultiplier: 1.4,
                  drawCorrectionMultiplier: 1.3,
                },
              },
            },
          },
        },
      },
      matchDataQuality: {
        'profiled-finished-match': {
          matchId: 'profiled-finished-match',
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
      },
      predictionReliability: {
        'profiled-finished-match': {
          matchId: 'profiled-finished-match',
          rawConfidence: 0.42,
          adjustedConfidence: 0.31,
          deductions: [],
          label: 'low',
          caveat: 'low',
        },
      },
    });

    expect(samples).toEqual([
      expect.objectContaining({
        matchId: 'profiled-finished-match',
        outcome: 'draw',
        scenarioProfile: {
          stageBucket: 'knockout',
          edgeBucket: 'close',
          tempoBucket: 'low',
          coverageBucket: 'low',
        },
      }),
    ]);
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
          truth: { level: 'live', confidence: 1, description: 'official', sourceBreakdown: ['official'] },
          unifiedProbability: {
            matchId: 'finished-with-prediction',
            model: { home: 0.58, draw: 0.24, away: 0.18, source: 'model' },
            truth: { level: 'live', confidence: 1, description: 'official', sourceBreakdown: ['official'] },
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
          truth: { level: 'live', confidence: 1, description: 'official', sourceBreakdown: ['official'] },
          unifiedProbability: {
            matchId: 'scheduled-with-prediction',
            model: { home: 0.42, draw: 0.3, away: 0.28, source: 'model' },
            truth: { level: 'live', confidence: 1, description: 'official', sourceBreakdown: ['official'] },
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
      intelligence: {},
      actionGates: {},
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
      backtestSamples: [
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
      ],
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
