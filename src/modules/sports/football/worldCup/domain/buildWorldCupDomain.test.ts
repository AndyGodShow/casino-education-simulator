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

  it('uses external match intelligence feeds before derived proxy enrichment', () => {
    const defaultDomain = buildWorldCupDomain(adapterResult);
    const enrichedDomain = buildWorldCupDomain({
      ...adapterResult,
      matchIntelligence: {
        'deterministic-domain': {
          source: 'provider',
          providerName: 'Lineup + travel provider',
          trustLevel: 'high',
          lastUpdated: '2026-06-18T12:00:00.000Z',
          auditable: true,
          home: {
            advancedMetrics: {
              elo: 1860,
              recentXgFor: 1.9,
              recentXgAgainst: 0.8,
              squadAvailability: 97,
              restDays: 6,
              travelFatigue: 0.04,
            },
          },
          away: {
            advancedMetrics: {
              elo: 1710,
              recentXgFor: 1.0,
              recentXgAgainst: 1.7,
              squadAvailability: 72,
              restDays: 3,
              travelFatigue: 0.58,
            },
          },
        },
      },
    });
    const defaultPrediction = defaultDomain.predictions['deterministic-domain'];
    const enrichedPrediction = enrichedDomain.predictions['deterministic-domain'];
    const squad = enrichedDomain.intelligence['deterministic-domain'].factors.find((factor) => factor.key === 'squad-availability');
    const travel = enrichedDomain.intelligence['deterministic-domain'].factors.find((factor) => factor.key === 'schedule-travel-fatigue');

    expect(enrichedPrediction.featureLayer?.metadata.inputCoverage.advancedSourceQualityRatio)
      .toBeGreaterThan(defaultPrediction.featureLayer?.metadata.inputCoverage.advancedSourceQualityRatio ?? 0);
    expect(squad?.quality).toBe('provider');
    expect(squad?.source).toContain('Lineup + travel provider');
    expect(travel?.quality).toBe('provider');
    expect(enrichedPrediction.expectedGoals.home).toBeGreaterThan(defaultPrediction.expectedGoals.home);
    expect(enrichedPrediction.expectedGoals.away).toBeLessThan(defaultPrediction.expectedGoals.away);
    expect(enrichedDomain.predictionReliability['deterministic-domain'].advancedMetricTrust).toEqual(expect.objectContaining({
      availableFields: 12,
      sourcedFields: 12,
      highTrustFields: 12,
    }));
  });

  it('merges multiple external match intelligence feeds before prediction', () => {
    const domain = buildWorldCupDomain({
      ...adapterResult,
      matchIntelligence: {
        'deterministic-domain': [
          {
            source: 'provider',
            providerName: 'xG provider',
            trustLevel: 'medium',
            lastUpdated: '2026-06-18T09:00:00.000Z',
            auditable: true,
            home: {
              advancedMetrics: {
                recentXgFor: 1.9,
                recentXgAgainst: 0.8,
              },
            },
            away: {
              advancedMetrics: {
                recentXgFor: 1.0,
                recentXgAgainst: 1.7,
              },
            },
          },
          {
            source: 'provider',
            providerName: 'lineup provider',
            trustLevel: 'high',
            lastUpdated: '2026-06-18T11:00:00.000Z',
            auditable: true,
            home: {
              advancedMetrics: {
                squadAvailability: 97,
                restDays: 6,
                travelFatigue: 0.05,
              },
            },
            away: {
              advancedMetrics: {
                squadAvailability: 72,
                restDays: 3,
                travelFatigue: 0.5,
              },
            },
          },
        ],
      },
    });
    const prediction = domain.predictions['deterministic-domain'];
    const squad = domain.intelligence['deterministic-domain'].factors.find((factor) => factor.key === 'squad-availability');

    expect(prediction.featureLayer?.home.advanced.xg).toBeGreaterThan(0);
    expect(prediction.featureLayer?.home.advanced.squadAvailability).toBeGreaterThan(0);
    expect(squad?.source).toContain('lineup provider');
    expect(domain.predictionReliability['deterministic-domain'].advancedMetricTrust).toEqual(expect.objectContaining({
      availableFields: 12,
      sourcedFields: 12,
      highTrustFields: 6,
      mediumTrustFields: 4,
    }));
  });

  it('downgrades stale external intelligence before it affects domain prediction strength', () => {
    const intelligenceFeed = (lastUpdated: string) => ({
      source: 'provider' as const,
      providerName: 'lineup provider',
      trustLevel: 'high' as const,
      lastUpdated,
      auditable: true,
      home: {
        advancedMetrics: {
          elo: 1860,
          recentXgFor: 1.9,
          recentXgAgainst: 0.8,
          squadAvailability: 97,
          restDays: 6,
          travelFatigue: 0.04,
        },
      },
      away: {
        advancedMetrics: {
          elo: 1710,
          recentXgFor: 1.0,
          recentXgAgainst: 1.7,
          squadAvailability: 72,
          restDays: 3,
          travelFatigue: 0.58,
        },
      },
    });
    const freshDomain = buildWorldCupDomain({
      ...adapterResult,
      matches: adapterResult.matches.map((match) => ({
        ...match,
        lastUpdated: '2026-06-18T12:00:00.000Z',
      })),
      matchIntelligence: {
        'deterministic-domain': intelligenceFeed('2026-06-18T10:00:00.000Z'),
      },
    });
    const staleDomain = buildWorldCupDomain({
      ...adapterResult,
      matches: adapterResult.matches.map((match) => ({
        ...match,
        lastUpdated: '2026-06-18T12:00:00.000Z',
      })),
      matchIntelligence: {
        'deterministic-domain': intelligenceFeed('2026-06-10T10:00:00.000Z'),
      },
    });
    const freshPrediction = freshDomain.predictions['deterministic-domain'];
    const stalePrediction = staleDomain.predictions['deterministic-domain'];

    expect(stalePrediction.featureLayer?.metadata.inputCoverage.advancedSourceQualityRatio)
      .toBeLessThan(freshPrediction.featureLayer?.metadata.inputCoverage.advancedSourceQualityRatio ?? 0);
    expect(stalePrediction.featureLayer?.metadata.evidenceCalibration?.shrinkage).toBeGreaterThan(0);
    expect(Math.abs(stalePrediction.expectedGoals.home - stalePrediction.expectedGoals.away))
      .toBeLessThan(Math.abs(freshPrediction.expectedGoals.home - freshPrediction.expectedGoals.away));
    expect(staleDomain.predictionReliability['deterministic-domain'].advancedMetricTrust?.lowTrustFields).toBe(12);
  });

  it('treats materially conflicting external provider fields as low-quality evidence for lambda calibration', () => {
    const consensusDomain = buildWorldCupDomain({
      ...adapterResult,
      matchIntelligence: {
        'deterministic-domain': {
          source: 'provider',
          providerName: 'consensus provider',
          trustLevel: 'high',
          lastUpdated: '2026-06-18T09:00:00.000Z',
          auditable: true,
          home: {
            advancedMetrics: {
              elo: 1860,
              recentXgFor: 1.9,
              recentXgAgainst: 0.8,
              squadAvailability: 97,
              restDays: 6,
              travelFatigue: 0.04,
            },
          },
          away: {
            advancedMetrics: {
              elo: 1710,
              recentXgFor: 1.0,
              recentXgAgainst: 1.7,
              squadAvailability: 72,
              restDays: 3,
              travelFatigue: 0.58,
            },
          },
        },
      },
    });
    const conflictDomain = buildWorldCupDomain({
      ...adapterResult,
      matchIntelligence: {
        'deterministic-domain': [
          {
            source: 'provider',
            providerName: 'lineup provider',
            trustLevel: 'high',
            lastUpdated: '2026-06-18T09:00:00.000Z',
            auditable: true,
            home: {
              advancedMetrics: {
                elo: 1860,
                recentXgFor: 1.9,
                recentXgAgainst: 0.8,
                squadAvailability: 97,
                restDays: 6,
                travelFatigue: 0.04,
              },
            },
            away: {
              advancedMetrics: {
                elo: 1710,
                recentXgFor: 1.0,
                recentXgAgainst: 1.7,
                squadAvailability: 72,
                restDays: 3,
                travelFatigue: 0.58,
              },
            },
          },
          {
            source: 'provider',
            providerName: 'tracking provider',
            trustLevel: 'medium',
            lastUpdated: '2026-06-18T09:30:00.000Z',
            auditable: true,
            home: {
              advancedMetrics: {
                elo: 1740,
                recentXgFor: 1.1,
                recentXgAgainst: 1.5,
                squadAvailability: 73,
                restDays: 3,
                travelFatigue: 0.5,
              },
            },
            away: {
              advancedMetrics: {
                elo: 1830,
                recentXgFor: 1.8,
                recentXgAgainst: 0.9,
                squadAvailability: 95,
                restDays: 6,
                travelFatigue: 0.08,
              },
            },
          },
        ],
      },
    });
    const consensusPrediction = consensusDomain.predictions['deterministic-domain'];
    const conflictPrediction = conflictDomain.predictions['deterministic-domain'];
    const squad = conflictDomain.intelligence['deterministic-domain'].factors.find((factor) => factor.key === 'squad-availability');

    expect(conflictPrediction.featureLayer?.metadata.inputCoverage.advancedSourceQualityRatio)
      .toBeLessThan(consensusPrediction.featureLayer?.metadata.inputCoverage.advancedSourceQualityRatio ?? 0);
    expect(conflictPrediction.featureLayer?.metadata.evidenceCalibration?.shrinkage)
      .toBeGreaterThan(consensusPrediction.featureLayer?.metadata.evidenceCalibration?.shrinkage ?? 0);
    expect(Math.abs(conflictPrediction.expectedGoals.home - conflictPrediction.expectedGoals.away))
      .toBeLessThan(Math.abs(consensusPrediction.expectedGoals.home - consensusPrediction.expectedGoals.away));
    expect(conflictDomain.predictionReliability['deterministic-domain'].advancedMetricTrust?.lowTrustFields).toBe(12);
    expect(squad?.source).toContain('lineup provider');
    expect(squad?.quality).toBe('provider');
    expect(squad?.caveat).toContain('Conflicting');
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

  it('publishes match intelligence and an action gate from the domain model', () => {
    const domain = buildWorldCupDomain(adapterResult);
    const intelligence = domain.intelligence['deterministic-domain'];
    const actionGate = domain.actionGates['deterministic-domain'];

    expect(domain.predictions['deterministic-domain'].intelligenceLayer).toBe(intelligence);
    expect(intelligence.coverage.total).toBe(9);
    expect(intelligence.coverage.missingCategories).not.toContain('squad');
    expect(intelligence.coverage.missingCategories).toContain('market');
    expect(intelligence.factors.find((factor) => factor.key === 'squad-availability')?.source).toContain('derived-match-intelligence');
    expect(domain.markets?.['deterministic-domain']?.status).toBe('available');
    expect(domain.markets?.['deterministic-domain']?.kind).toBe('educational');
    expect(domain.markets?.['deterministic-domain']?.deviation?.deviationScore).toBeGreaterThanOrEqual(0);
    expect(domain.predictions['deterministic-domain'].unifiedProbability.market).toBeUndefined();
    expect(actionGate.matchId).toBe('deterministic-domain');
    expect(actionGate.blockingFactors).toContain('missing_market_reference');
    expect(actionGate.blockingFactors.length).toBeGreaterThan(0);
  });

  it('fuses only fresh auditable real market data into unified probabilities', () => {
    const officialResult: WorldCupAdapterResult & { markets: NonNullable<ReturnType<typeof buildWorldCupDomain>['markets']> } = {
      ...adapterResult,
      source: 'official',
      providerName: 'Official',
      matches: adapterResult.matches.map((match) => ({
        ...match,
        source: 'official' as const,
        lastUpdated: '2026-06-18T10:00:00.000Z',
      })),
      markets: {
        'deterministic-domain': {
          kind: 'real',
          source: 'polymarket',
          status: 'available',
          odds: { home: 1.9, draw: 3.4, away: 4.6 },
          confidence: 0.82,
          quality: 'high',
          auditable: true,
          lastUpdated: '2026-06-18T09:55:00.000Z',
          message: 'Polymarket normalized three-way market.',
        },
      },
    };

    const domain = buildWorldCupDomain(officialResult, {
      evaluationTimeMs: Date.parse('2026-06-18T10:00:00.000Z'),
    });
    const prediction = domain.predictions['deterministic-domain'];
    const market = domain.markets?.['deterministic-domain'];

    expect(market?.kind).toBe('real');
    expect(market?.deviation?.marketCorrectionFactor).toBeGreaterThan(0);
    expect(prediction.unifiedProbability.market?.home).toBeGreaterThan(0);
    expect(prediction.unifiedProbability.merged?.home).not.toBe(prediction.unifiedProbability.model.home);
    expect(domain.intelligence['deterministic-domain'].coverage.missingCategories).not.toContain('market');
    expect(domain.actionGates['deterministic-domain'].blockingFactors).not.toContain('missing_market_reference');
  });

  it('rejects stale or unaudited real market data from probability fusion', () => {
    const officialResult: WorldCupAdapterResult & { markets: NonNullable<ReturnType<typeof buildWorldCupDomain>['markets']> } = {
      ...adapterResult,
      source: 'official',
      providerName: 'Official',
      matches: adapterResult.matches.map((match) => ({
        ...match,
        source: 'official' as const,
        lastUpdated: '2026-06-18T10:00:00.000Z',
      })),
      markets: {
        'deterministic-domain': {
          kind: 'real',
          source: 'polymarket',
          status: 'available',
          odds: { home: 1.9, draw: 3.4, away: 4.6 },
          confidence: 0.9,
          quality: 'high',
          auditable: true,
          lastUpdated: '2026-06-18T09:00:00.000Z',
          message: 'Stale market should not be fused.',
        },
      },
    };

    const domain = buildWorldCupDomain(officialResult, {
      evaluationTimeMs: Date.parse('2026-06-18T10:00:00.000Z'),
    });

    expect(domain.markets?.['deterministic-domain']?.status).toBe('stale');
    expect(domain.predictions['deterministic-domain'].unifiedProbability.market).toBeUndefined();
    expect(domain.actionGates['deterministic-domain'].blockingFactors).toContain('missing_market_reference');
  });

  it('rejects market data that is stale at evaluation time even when fixture data has not changed', () => {
    const officialResult: WorldCupAdapterResult & { markets: NonNullable<ReturnType<typeof buildWorldCupDomain>['markets']> } = {
      ...adapterResult,
      source: 'official',
      providerName: 'Official',
      matches: adapterResult.matches.map((match) => ({
        ...match,
        source: 'official' as const,
        lastUpdated: '2026-06-18T10:00:00.000Z',
      })),
      markets: {
        'deterministic-domain': {
          kind: 'real',
          source: 'polymarket',
          status: 'available',
          odds: { home: 1.9, draw: 3.4, away: 4.6 },
          confidence: 0.9,
          quality: 'high',
          auditable: true,
          lastUpdated: '2026-06-18T09:55:00.000Z',
          message: 'Market was fresh when the fixture was updated.',
        },
      },
    };

    const domain = buildWorldCupDomain(officialResult, {
      evaluationTimeMs: Date.parse('2026-06-18T10:30:00.000Z'),
    });

    expect(domain.markets?.['deterministic-domain']?.status).toBe('stale');
    expect(domain.predictions['deterministic-domain'].unifiedProbability.market).toBeUndefined();
  });

  it('rejects market timestamps that are in the future relative to evaluation time', () => {
    const officialResult: WorldCupAdapterResult & { markets: NonNullable<ReturnType<typeof buildWorldCupDomain>['markets']> } = {
      ...adapterResult,
      source: 'official',
      providerName: 'Official',
      matches: adapterResult.matches.map((match) => ({
        ...match,
        source: 'official' as const,
        lastUpdated: '2026-06-18T10:00:00.000Z',
      })),
      markets: {
        'deterministic-domain': {
          kind: 'real',
          source: 'polymarket',
          status: 'available',
          odds: { home: 1.9, draw: 3.4, away: 4.6 },
          confidence: 0.9,
          quality: 'high',
          auditable: true,
          lastUpdated: '2026-06-18T10:05:00.000Z',
          message: 'Future timestamp must be rejected.',
        },
      },
    };

    const domain = buildWorldCupDomain(officialResult, {
      evaluationTimeMs: Date.parse('2026-06-18T10:00:00.000Z'),
    });

    expect(domain.markets?.['deterministic-domain']?.status).toBe('stale');
    expect(domain.predictions['deterministic-domain'].unifiedProbability.market).toBeUndefined();
  });

  it('applies combined calibration evidence deductions through the domain reliability pipeline', () => {
    const domain = buildWorldCupDomain(adapterResult, {
      combinedCalibrationEvidenceGrade: 'provider_ready',
    });

    expect(domain.predictionReliability['deterministic-domain'].deductions).toContainEqual(
      expect.objectContaining({ reason: 'provider_only_calibration_evidence' }),
    );
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
