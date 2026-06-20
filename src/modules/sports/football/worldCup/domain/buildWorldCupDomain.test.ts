import { describe, expect, it } from 'vitest';
import type { WorldCupAdapterResult } from '../../../../../dataProviders/football/worldCupAdapter';
import { buildWorldCupDomain } from './buildWorldCupDomain';
import { selectDataSourceStatus } from './selectors';

const adapterResult: WorldCupAdapterResult = {
  matches: [
    {
      id: 'deterministic-domain',
      competitionId: 'world-cup-2026',
      stage: 'group',
      group: 'A',
      homeTeamId: 'alpha',
      awayTeamId: 'beta',
      kickoff: '2026-06-18T18:00:00.000Z',
      status: 'scheduled',
      source: 'local',
      lastUpdated: '2026-06-18T10:00:00.000Z',
    },
  ],
  teams: {
    alpha: {
      id: 'alpha',
      name: 'Alpha',
      shortName: 'ALP',
      countryCode: 'AL',
      group: 'A',
      rating: 82,
      attack: 83,
      defense: 80,
      form: 81,
    },
    beta: {
      id: 'beta',
      name: 'Beta',
      shortName: 'BET',
      countryCode: 'BE',
      group: 'A',
      rating: 76,
      attack: 75,
      defense: 77,
      form: 76,
    },
  },
  source: 'local',
  providerName: 'Local',
  errors: [],
  meta: {
    totalMatches: 1,
    statusBreakdown: { scheduled: 1, live: 0, finished: 0 },
  },
};

describe('buildWorldCupDomain', () => {
  it('derives deterministic lastUpdated from adapter matches', () => {
    const first = buildWorldCupDomain(adapterResult);
    const second = buildWorldCupDomain(adapterResult);

    expect(first.lastUpdated).toBe(Date.parse('2026-06-18T10:00:00.000Z'));
    expect(second).toEqual(first);
  });

  it('keeps prediction identities aligned with domain matches and teams', () => {
    const domain = buildWorldCupDomain(adapterResult);
    const [match] = domain.matches;
    const prediction = domain.predictions[match.id];

    expect(prediction.matchId).toBe(match.id);
    expect(domain.teams[match.homeTeamId].id).toBe(match.homeTeamId);
    expect(domain.teams[match.awayTeamId].id).toBe(match.awayTeamId);
    expect(prediction.modelVersion).toBe('v2');
  });

  it('carries advanced team inputs into the prediction feature layer', () => {
    const domain = buildWorldCupDomain({
      ...adapterResult,
      teams: {
        alpha: {
          ...adapterResult.teams.alpha,
          advancedMetrics: {
            elo: 1840,
            recentXgFor: 1.9,
            recentXgAgainst: 0.8,
            squadAvailability: 96,
            restDays: 6,
            travelFatigue: 0.05,
          },
        },
        beta: {
          ...adapterResult.teams.beta,
          advancedMetrics: {
            elo: 1760,
            recentXgFor: 1.1,
            recentXgAgainst: 1.7,
            squadAvailability: 76,
            restDays: 3,
            travelFatigue: 0.55,
          },
        },
      },
    });
    const prediction = domain.predictions['deterministic-domain'];

    expect(prediction.featureLayer?.metadata.availableAdvancedFeatures).toBeGreaterThan(0);
    expect(prediction.featureLayer?.home.advanced.total).toBeGreaterThan(0);
    expect(prediction.featureLayer?.away.advanced.total).toBeLessThan(0);
  });

  it('summarizes prediction chain self-audit separately from outcome calibration', () => {
    const domain = buildWorldCupDomain(adapterResult);

    expect(domain.predictionAudit.status).toBe('passed');
    expect(domain.predictionAudit.checkedMatches).toBe(1);
    expect(domain.predictionAudit.passedMatches).toBe(1);
    expect(domain.predictionAudit.warningCount).toBe(0);
    expect(domain.predictionAudit.maxProbabilityDrift).toBeLessThan(1e-6);
    expect(domain.predictionAudit.message).toContain('比分分布');
  });

  it('keeps local seed data distinct from sample/provider data in source status', () => {
    const domain = buildWorldCupDomain(adapterResult);
    const status = selectDataSourceStatus(domain);

    expect(domain.source).toBe('local');
    expect(domain.sourceGate.tier).toBe('local');
    expect(domain.sourceGate.canUseForRealPrediction).toBe(false);
    expect(domain.sourceGate.message).toContain('教育演示');
    expect(status.label).toBe('Local seed');
    expect(status.isSample).toBe(true);
    expect(status.isLiveProvider).toBe(false);
    expect(status.detail).toContain('不是实时或官方赛程数据');
    expect(status.predictionCaveat).toContain('不应用作真实赛事预测');
  });

  it('builds match-level data quality for local seed matches', () => {
    const domain = buildWorldCupDomain(adapterResult);
    const quality = domain.matchDataQuality['deterministic-domain'];

    expect(quality.matchId).toBe('deterministic-domain');
    expect(quality.tier).toBe('local');
    expect(quality.label).toBe('Local seed');
    expect(quality.isOfficialFixture).toBe(false);
    expect(quality.isVerifiedProvider).toBe(false);
    expect(quality.hasVerifiedScore).toBe(false);
    expect(quality.canUseForRealPrediction).toBe(false);
    expect(quality.staleness).toBe('stale');
    expect(quality.stalenessHours).toBeGreaterThan(0);
    expect(quality.caveat).toContain('教育演示');
  });

  it('derives prediction reliability from source quality, calibration, audit, and input coverage', () => {
    const domain = buildWorldCupDomain(adapterResult);
    const prediction = domain.predictions['deterministic-domain'];
    const reliability = domain.predictionReliability['deterministic-domain'];

    expect(reliability.matchId).toBe('deterministic-domain');
    expect(reliability.rawConfidence).toBe(prediction.confidence);
    expect(reliability.adjustedConfidence).toBeLessThan(reliability.rawConfidence);
    expect(reliability.label).toBe('low');
    expect(reliability.deductions.map((deduction) => deduction.reason)).toContain('local_source');
    expect(reliability.deductions.map((deduction) => deduction.reason)).toContain('no_calibration_sample');
  });

  it('feeds advanced metric provenance into prediction reliability deductions', () => {
    const domain = buildWorldCupDomain({
      ...adapterResult,
      matches: adapterResult.matches.map((match) => ({
        ...match,
        source: 'official' as const,
        lastUpdated: '2026-06-18T10:00:00.000Z',
      })),
      teams: {
        alpha: {
          ...adapterResult.teams.alpha,
          advancedMetrics: {
            elo: 1840,
            recentXgFor: 1.9,
            recentXgAgainst: 0.8,
            squadAvailability: 96,
            restDays: 6,
            travelFatigue: 0.05,
          },
          advancedMetricSources: {
            elo: {
              source: 'seed',
              trustLevel: 'low',
              lastUpdated: '2026-06-10T10:00:00.000Z',
              caveat: 'seeded Elo',
            },
            recentXgFor: {
              source: 'provider',
              providerName: 'Provider',
              trustLevel: 'medium',
            },
            recentXgAgainst: {
              source: 'seed',
              trustLevel: 'low',
              lastUpdated: '2026-06-18T09:00:00.000Z',
            },
            squadAvailability: {
              source: 'seed',
              trustLevel: 'low',
              lastUpdated: '2026-06-18T09:00:00.000Z',
            },
            restDays: {
              source: 'seed',
              trustLevel: 'low',
              lastUpdated: '2026-06-18T09:00:00.000Z',
            },
            travelFatigue: {
              source: 'provider',
              providerName: 'Provider',
              trustLevel: 'medium',
              lastUpdated: '2026-06-18T09:00:00.000Z',
            },
          },
        },
        beta: {
          ...adapterResult.teams.beta,
          advancedMetrics: {
            elo: 1760,
            recentXgFor: 1.1,
            recentXgAgainst: 1.7,
            squadAvailability: 76,
            restDays: 3,
            travelFatigue: 0.55,
          },
          advancedMetricSources: {
            elo: {
              source: 'seed',
              trustLevel: 'low',
              lastUpdated: '2026-06-10T10:00:00.000Z',
              caveat: 'seeded Elo',
            },
            recentXgFor: {
              source: 'provider',
              providerName: 'Provider',
              trustLevel: 'medium',
            },
            recentXgAgainst: {
              source: 'seed',
              trustLevel: 'low',
              lastUpdated: '2026-06-18T09:00:00.000Z',
            },
            squadAvailability: {
              source: 'seed',
              trustLevel: 'low',
              lastUpdated: '2026-06-18T09:00:00.000Z',
            },
            restDays: {
              source: 'seed',
              trustLevel: 'low',
              lastUpdated: '2026-06-18T09:00:00.000Z',
            },
            travelFatigue: {
              source: 'provider',
              providerName: 'Provider',
              trustLevel: 'medium',
              lastUpdated: '2026-06-18T09:00:00.000Z',
            },
          },
        },
      },
    });
    const reliability = domain.predictionReliability['deterministic-domain'];

    expect(reliability.advancedMetricTrust).toMatchObject({
      availableFields: 12,
      sourcedFields: 12,
      lowTrustFields: 8,
    });
    expect(reliability.deductions.map((deduction) => deduction.reason)).toContain('low_trust_advanced_metrics');
    expect(reliability.deductions.map((deduction) => deduction.reason)).toContain('stale_advanced_metrics');
    expect(reliability.deductions.map((deduction) => deduction.reason)).toContain('unknown_advanced_metric_freshness');
  });

  it('gates third-party provider data as verified but still requiring official fixture verification', () => {
    const domain = buildWorldCupDomain({
      ...adapterResult,
      source: 'api-football',
      providerName: 'API-Football',
      matches: adapterResult.matches.map((match) => ({
        ...match,
        source: 'api-football' as const,
        lastUpdated: '2026-06-19T12:00:00.000Z',
      })),
    });
    const quality = domain.matchDataQuality['deterministic-domain'];

    expect(domain.source).toBe('api');
    expect(domain.sourceGate.tier).toBe('verified_provider');
    expect(domain.sourceGate.canUseForRealPrediction).toBe(false);
    expect(domain.sourceGate.requiresOfficialVerification).toBe(true);
    expect(domain.sourceGate.message).toContain('仍需官方赛程核验');
    expect(quality.tier).toBe('verified_provider');
    expect(quality.isVerifiedProvider).toBe(true);
    expect(quality.isOfficialFixture).toBe(false);
    expect(quality.canUseForRealPrediction).toBe(false);
    expect(quality.staleness).toBe('fresh');
  });

  it('marks calibration as unavailable when there are no finished matches with source scores', () => {
    const domain = buildWorldCupDomain(adapterResult);

    expect(domain.calibration.status).toBe('no_results');
    expect(domain.calibration.sampleSize).toBe(0);
    expect(domain.calibration.brierScore).toBeNull();
    expect(domain.calibration.logLoss).toBeNull();
  });

  it('derives calibration metrics from finished matches with source scores', () => {
    const domain = buildWorldCupDomain({
      ...adapterResult,
      matches: adapterResult.matches.map((match) => ({
        ...match,
        status: 'finished' as const,
        homeScore: 2,
        awayScore: 0,
      })),
    });

    expect(domain.calibration.status).toBe('insufficient_sample');
    expect(domain.calibration.sampleSize).toBe(1);
    expect(domain.calibration.brierScore).toBeGreaterThanOrEqual(0);
    expect(domain.calibration.logLoss).toBeGreaterThanOrEqual(0);
    expect(domain.calibration.accuracy).toBeGreaterThanOrEqual(0);
    expect(domain.calibration.accuracy).toBeLessThanOrEqual(1);
    expect(domain.calibration.message).toContain('样本不足');
  });

  it('publishes current-domain backtest metrics from finished matches', () => {
    const domain = buildWorldCupDomain({
      ...adapterResult,
      matches: adapterResult.matches.map((match) => ({
        ...match,
        status: 'finished' as const,
        homeScore: 2,
        awayScore: 0,
      })),
    });

    expect(domain.backtest.overall.sampleSize).toBe(1);
    expect(domain.backtest.overall.accuracy).toBeGreaterThanOrEqual(0);
    expect(domain.backtest.byConfidence.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(1);
    expect(domain.backtest.bySourceTier.local?.count).toBe(1);
    expect(domain.backtest.byStage.group?.count).toBe(1);
  });
});
