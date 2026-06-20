import { describe, expect, it } from 'vitest';
import { buildMatchAdvancedMetricTrust } from './advancedMetricTrust';
import type { WorldCupTeam } from '../types';

const team = (
  id: string,
  advancedMetrics: WorldCupTeam['advancedMetrics'],
  advancedMetricSources: WorldCupTeam['advancedMetricSources'] = undefined,
): WorldCupTeam => ({
  id,
  name: id,
  shortName: id.slice(0, 3).toUpperCase(),
  countryCode: id.slice(0, 2).toUpperCase(),
  group: 'A',
  rating: 80,
  attack: 80,
  defense: 80,
  form: 80,
  advancedMetrics,
  advancedMetricSources,
});

describe('buildMatchAdvancedMetricTrust', () => {
  it('summarizes source trust, missing provenance, stale fields, and unknown freshness', () => {
    const result = buildMatchAdvancedMetricTrust(
      team(
        'home',
        {
          elo: 1840,
          recentXgFor: 1.8,
          recentXgAgainst: 0.9,
          squadAvailability: 94,
          restDays: 6,
          travelFatigue: 0.1,
        },
        {
          elo: {
            source: 'official',
            trustLevel: 'high',
            lastUpdated: '2026-06-18T09:00:00.000Z',
          },
          recentXgFor: {
            source: 'provider',
            providerName: 'Provider',
            trustLevel: 'medium',
          },
          recentXgAgainst: {
            source: 'seed',
            trustLevel: 'low',
            lastUpdated: '2026-06-10T09:00:00.000Z',
          },
          squadAvailability: {
            source: 'manual',
            trustLevel: 'low',
            lastUpdated: '2026-06-18T09:00:00.000Z',
          },
          restDays: {
            source: 'official',
            trustLevel: 'high',
            lastUpdated: '2026-06-18T09:00:00.000Z',
          },
        },
      ),
      team(
        'away',
        {
          elo: 1760,
          recentXgFor: 1.2,
          recentXgAgainst: 1.5,
        },
        {
          elo: {
            source: 'official',
            trustLevel: 'high',
            lastUpdated: '2026-06-18T09:00:00.000Z',
          },
          recentXgFor: {
            source: 'provider',
            providerName: 'Provider',
            trustLevel: 'medium',
            lastUpdated: '2026-06-18T09:00:00.000Z',
          },
          recentXgAgainst: {
            source: 'seed',
            trustLevel: 'low',
            lastUpdated: '2026-06-10T09:00:00.000Z',
          },
        },
      ),
      Date.parse('2026-06-18T10:00:00.000Z'),
    );

    expect(result.availableFields).toBe(9);
    expect(result.sourcedFields).toBe(8);
    expect(result.highTrustFields).toBe(3);
    expect(result.mediumTrustFields).toBe(2);
    expect(result.lowTrustFields).toBe(3);
    expect(result.missingSourceFields).toEqual(['home.advancedMetricSources.travelFatigue']);
    expect(result.staleFields).toEqual([
      'home.advancedMetricSources.recentXgAgainst',
      'away.advancedMetricSources.recentXgAgainst',
    ]);
    expect(result.unknownFreshnessFields).toEqual(['home.advancedMetricSources.recentXgFor']);
    expect(result.sourceCoverageRatio).toBe(0.89);
    expect(result.averageTrustScore).toBe(0.61);
  });

  it('treats matches without advanced metrics as fully neutral for source trust', () => {
    const result = buildMatchAdvancedMetricTrust(
      team('home', undefined),
      team('away', undefined),
      Date.parse('2026-06-18T10:00:00.000Z'),
    );

    expect(result).toEqual({
      availableFields: 0,
      sourcedFields: 0,
      highTrustFields: 0,
      mediumTrustFields: 0,
      lowTrustFields: 0,
      missingSourceFields: [],
      staleFields: [],
      unknownFreshnessFields: [],
      averageTrustScore: 1,
      sourceCoverageRatio: 1,
    });
  });
});
