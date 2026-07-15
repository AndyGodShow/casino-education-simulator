import { describe, expect, it } from 'vitest';
import { worldCupAdapterResult as adapterResult } from '../testFixtures';
import { baselinePreMatchPredictionProvenance } from '../persistence/preMatchPredictionStore';
import { buildWorldCupDomain } from './buildWorldCupDomain';
import { selectDataSourceStatus } from './selectors';

describe('buildWorldCupDomain', () => {
  it('derives deterministic lastUpdated from adapter matches', () => {
    const first = buildWorldCupDomain(adapterResult);
    const second = buildWorldCupDomain(adapterResult);

    expect(first.lastUpdated).toBe(Date.parse('2026-06-18T10:00:00.000Z'));
    expect(second).toEqual(first);
  });

  it('uses an explicitly supplied simulation without rebuilding it', () => {
    const simulation = { probabilities: [] };

    const domain = buildWorldCupDomain(adapterResult, { simulation });

    expect(domain.simulation).toBe(simulation);
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

  it('applies audited strategy calibration overrides to domain predictions', () => {
    const sparseMismatchResult = {
      ...adapterResult,
      teams: {
        alpha: {
          ...adapterResult.teams.alpha,
          rating: 90,
          attack: 90,
          defense: 88,
          form: 88,
        },
        beta: {
          ...adapterResult.teams.beta,
          rating: 62,
          attack: 61,
          defense: 64,
          form: 63,
        },
      },
    };
    const defaultDomain = buildWorldCupDomain(sparseMismatchResult);
    const tunedDomain = buildWorldCupDomain({
      ...sparseMismatchResult,
      strategyCalibrationOverrides: {
        shrinkageMultiplier: { mismatch: 1.4, highCoverage: 1.4 },
      },
    });
    const defaultPrediction = defaultDomain.predictions['deterministic-domain'];
    const tunedPrediction = tunedDomain.predictions['deterministic-domain'];
    const defaultCalibration = defaultPrediction.featureLayer?.metadata.evidenceCalibration;
    const tunedCalibration = tunedPrediction.featureLayer?.metadata.evidenceCalibration;

    expect(defaultCalibration).toBeDefined();
    expect(tunedCalibration).toBeDefined();
    if (!defaultCalibration || !tunedCalibration) throw new Error('Expected sparse evidence calibration metadata');

    expect(tunedCalibration.profile.shrinkageMultiplier).toBeGreaterThan(defaultCalibration.profile.shrinkageMultiplier);
    expect(Math.abs(tunedPrediction.expectedGoals.home - tunedPrediction.expectedGoals.away))
      .toBeLessThan(Math.abs(defaultPrediction.expectedGoals.home - defaultPrediction.expectedGoals.away));
    expect(tunedPrediction.probabilities.draw).toBeGreaterThan(defaultPrediction.probabilities.draw);
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
    expect(quality.staleness).toBe('fresh');
    expect(quality.stalenessHours).toBe(0);
    expect(quality.caveat).toContain('教育演示');
  });

  it('measures fixture freshness from evaluation time instead of future kickoff time', () => {
    const futureFixture = {
      ...adapterResult,
      source: 'openfootball' as const,
      providerName: 'OpenFootball',
      matches: adapterResult.matches.map((match) => ({
        ...match,
        source: 'openfootball' as const,
        kickoff: '2026-07-18T18:00:00.000Z',
        lastUpdated: '2026-07-02T10:00:00.000Z',
      })),
    };

    const freshDomain = buildWorldCupDomain(futureFixture, {
      evaluationTimeMs: Date.parse('2026-07-02T12:00:00.000Z'),
    });
    const staleDomain = buildWorldCupDomain(futureFixture, {
      evaluationTimeMs: Date.parse('2026-07-05T12:00:00.000Z'),
    });

    expect(freshDomain.matchDataQuality['deterministic-domain'].staleness).toBe('fresh');
    expect(freshDomain.matchDataQuality['deterministic-domain'].stalenessHours).toBe(2);
    expect(staleDomain.matchDataQuality['deterministic-domain'].staleness).toBe('stale');
    expect(staleDomain.matchDataQuality['deterministic-domain'].stalenessHours).toBe(74);
  });

  it('auto-fills schedule and travel context from fixture chronology when provider metrics are absent', () => {
    const domain = buildWorldCupDomain({
      ...adapterResult,
      matches: [
        {
          ...adapterResult.matches[0],
          id: 'first-meeting',
          kickoff: '2026-06-18T18:00:00.000Z',
          venue: 'Host Stadium',
          city: 'Toronto',
        },
        {
          ...adapterResult.matches[0],
          id: 'second-meeting',
          kickoff: '2026-06-22T18:00:00.000Z',
          venue: 'Host Stadium',
          city: 'Toronto',
        },
      ],
      teams: {
        alpha: {
          ...adapterResult.teams.alpha,
          isHost: true,
        },
        beta: adapterResult.teams.beta,
      },
      meta: {
        totalMatches: 2,
        statusBreakdown: { scheduled: 2, live: 0, finished: 0 },
      },
    });
    const intelligence = domain.intelligence['second-meeting'];
    const rest = intelligence.factors.find((factor) => factor.key === 'schedule-rest-days');
    const travel = intelligence.factors.find((factor) => factor.key === 'schedule-travel-fatigue');

    expect(intelligence.coverage.missingCategories).not.toContain('schedule_travel');
    expect(rest?.quality).toBe('proxy');
    expect(rest?.source).toContain('derived-match-intelligence');
    expect(travel?.quality).toBe('proxy');
    expect(travel?.impact).toBeGreaterThan(0);
  });

  it('applies group motivation context to model estimates before audit and action gating', () => {
    const domain = buildWorldCupDomain({
      ...adapterResult,
      matches: [
        {
          ...adapterResult.matches[0],
          id: 'alpha-loss',
          homeTeamId: 'alpha',
          awayTeamId: 'gamma',
          kickoff: '2026-06-18T18:00:00.000Z',
          status: 'finished',
          homeScore: 0,
          awayScore: 1,
        },
        {
          ...adapterResult.matches[0],
          id: 'beta-win',
          homeTeamId: 'beta',
          awayTeamId: 'delta',
          kickoff: '2026-06-18T20:00:00.000Z',
          status: 'finished',
          homeScore: 2,
          awayScore: 0,
        },
        {
          ...adapterResult.matches[0],
          id: 'alpha-draw',
          homeTeamId: 'alpha',
          awayTeamId: 'delta',
          kickoff: '2026-06-22T18:00:00.000Z',
          status: 'finished',
          homeScore: 1,
          awayScore: 1,
        },
        {
          ...adapterResult.matches[0],
          id: 'beta-second-win',
          homeTeamId: 'beta',
          awayTeamId: 'gamma',
          kickoff: '2026-06-22T20:00:00.000Z',
          status: 'finished',
          homeScore: 1,
          awayScore: 0,
        },
        {
          ...adapterResult.matches[0],
          id: 'final-group-pressure',
          homeTeamId: 'alpha',
          awayTeamId: 'beta',
          kickoff: '2026-06-26T18:00:00.000Z',
          status: 'scheduled',
        },
      ],
      teams: {
        ...adapterResult.teams,
        gamma: {
          ...adapterResult.teams.beta,
          id: 'gamma',
          name: 'Gamma',
          shortName: 'GAM',
          countryCode: 'GA',
        },
        delta: {
          ...adapterResult.teams.beta,
          id: 'delta',
          name: 'Delta',
          shortName: 'DEL',
          countryCode: 'DE',
        },
      },
      meta: {
        totalMatches: 5,
        statusBreakdown: { scheduled: 1, live: 0, finished: 4 },
      },
    });
    const prediction = domain.predictions['final-group-pressure'];
    const motivation = domain.intelligence['final-group-pressure'].factors.find((factor) => factor.key === 'group-qualification-motivation');

    expect(prediction.explanation.summary).toContain('group motivation context');
    expect(prediction.explanation.factors.map((factor) => factor.name)).toContain('Group qualification motivation');
    expect(prediction.expectedGoals.home).toBe(prediction.decisionLayer.expectedGoals.home);
    expect(prediction.featureLayer?.home.lambda).toBe(prediction.expectedGoals.home);
    expect(prediction.featureLayer?.away.lambda).toBe(prediction.expectedGoals.away);
    expect(prediction.probabilities.homeWin + prediction.probabilities.draw + prediction.probabilities.awayWin).toBeCloseTo(1, 6);
    expect(motivation?.caveat).toContain('must win');
    expect(domain.actionGates['final-group-pressure'].blockingFactors).toEqual(expect.arrayContaining([
      'volatile_group_motivation',
      'must_win_group_pressure',
    ]));
  });

  it('keeps unresolved knockout placeholders out of predictions and simulation', () => {
    const domain = buildWorldCupDomain({
      ...adapterResult,
      matches: [
        {
          id: 'placeholder-knockout',
          competitionId: 'world-cup-2026',
          stage: 'round32',
          homeTeamId: '1a',
          awayTeamId: '3a-b-c-d-f',
          kickoff: '2026-06-29T20:00:00.000Z',
          status: 'scheduled',
          source: 'openfootball',
          lastUpdated: '2026-06-21T00:00:00.000Z',
        },
      ],
      teams: {
        '1a': {
          id: '1a',
          name: '1A',
          shortName: '1A',
          countryCode: '1A',
          group: 'A',
          rating: 75,
          attack: 75,
          defense: 75,
          form: 75,
        },
        '3a-b-c-d-f': {
          id: '3a-b-c-d-f',
          name: '3A/B/C/D/F',
          shortName: '3AB',
          countryCode: '3A',
          group: 'A',
          rating: 75,
          attack: 75,
          defense: 75,
          form: 75,
        },
      },
      source: 'openfootball',
      providerName: 'OpenFootball',
    });

    expect(domain.predictions['placeholder-knockout']).toBeUndefined();
    expect(domain.predictionReliability['placeholder-knockout']).toBeUndefined();
    expect(domain.simulation?.probabilities.map((row) => row.teamId)).not.toContain('1a');
    expect(domain.simulation?.probabilities.map((row) => row.teamId)).not.toContain('3a-b-c-d-f');
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

    expect(domain.calibration.status).toBe('no_results');
    expect(domain.calibration.sampleSize).toBe(0);
    expect(domain.predictions['deterministic-domain']).toBeUndefined();
    expect(domain.predictionReliability['deterministic-domain']).toBeUndefined();
    expect(domain.predictionAudit.checkedMatches).toBe(0);
    expect(domain.calibration.brierScore).toBeNull();
    expect(domain.calibration.logLoss).toBeNull();
    expect(domain.calibration.accuracy).toBeNull();
    expect(domain.calibration.message).toContain('赛前预测快照');
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
    expect(domain.backtestSamples[0]?.predictionOrigin).toBe('post_match_reconstruction');
    expect(domain.backtest.quality.calibrationUsability.canUseForCalibration).toBe(false);
    expect(domain.backtest.quality.calibrationUsability.sampleSize).toBe(0);
  });

  it('does not publish provider post-match reconstructions as historical performance', () => {
    const domain = buildWorldCupDomain({
      ...adapterResult,
      source: 'openfootball',
      providerName: 'OpenFootball',
      matches: adapterResult.matches.map((match) => ({
        ...match,
        source: 'openfootball' as const,
        status: 'finished' as const,
        homeScore: 2,
        awayScore: 0,
      })),
      teams: {
        alpha: {
          ...adapterResult.teams.alpha,
          coreMetricSources: {
            form: { source: 'provider', providerName: 'OpenFootball', trustLevel: 'medium' },
          },
        },
        beta: {
          ...adapterResult.teams.beta,
          coreMetricSources: {
            form: { source: 'provider', providerName: 'OpenFootball', trustLevel: 'medium' },
          },
        },
      },
    });

    expect(domain.backtest.overall.sampleSize).toBe(0);
    expect(domain.backtestSamples).toEqual([]);
  });

  it('uses a persisted pre-match prediction snapshot as calibration evidence', () => {
    const scheduledDomain = buildWorldCupDomain(adapterResult);
    const preMatchPrediction = scheduledDomain.predictions['deterministic-domain'];
    const finishedResult = {
      ...adapterResult,
      matches: adapterResult.matches.map((match) => ({
        ...match,
        status: 'finished' as const,
        homeScore: 2,
        awayScore: 0,
      })),
    };

    const domain = buildWorldCupDomain(finishedResult, {
      preMatchPredictionSnapshots: {
        'deterministic-domain': {
          matchId: 'deterministic-domain',
          homeTeamId: adapterResult.matches[0].homeTeamId,
          awayTeamId: adapterResult.matches[0].awayTeamId,
          kickoff: adapterResult.matches[0].kickoff,
          capturedAt: '2026-06-18T17:59:00.000Z',
          prediction: preMatchPrediction,
          provenance: baselinePreMatchPredictionProvenance('test'),
        },
      },
    });

    expect(domain.calibration.status).toBe('insufficient_sample');
    expect(domain.calibration.sampleSize).toBe(1);
    expect(domain.backtestSamples).toEqual([
      expect.objectContaining({
        matchId: 'deterministic-domain',
        predictionOrigin: 'pre_match_snapshot',
      }),
    ]);
    expect(domain.preMatchPredictionSnapshots?.['deterministic-domain'].prediction)
      .toBe(preMatchPrediction);
  });
});
