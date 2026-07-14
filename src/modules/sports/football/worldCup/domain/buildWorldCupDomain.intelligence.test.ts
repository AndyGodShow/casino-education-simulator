import { describe, expect, it } from 'vitest';
import type { WorldCupAdapterResult } from '../../../../../dataProviders/football/worldCupAdapter';
import { worldCupAdapterResult as adapterResult } from '../testFixtures';
import { buildWorldCupDomain } from './buildWorldCupDomain';

describe('buildWorldCupDomain intelligence and reliability', () => {
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
});
