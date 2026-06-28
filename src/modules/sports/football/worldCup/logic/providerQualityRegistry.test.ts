import { describe, expect, it } from 'vitest';
import {
  buildDefaultAdvancedMetricProvenance,
  getFootballProviderFreshnessSlaHours,
  getFootballProviderQualityProfile,
} from './providerQualityRegistry';

describe('providerQualityRegistry', () => {
  it('defines source-level trust, freshness SLA, and field coverage for football providers', () => {
    const apiFootball = getFootballProviderQualityProfile('api-football', 'API-Football');
    const openFootball = getFootballProviderQualityProfile('openfootball', 'openfootball');

    expect(apiFootball).toEqual(expect.objectContaining({
      providerName: 'API-Football',
      defaultAdvancedMetricTrust: 'medium',
      freshnessSlaHours: 48,
    }));
    expect(apiFootball.fieldCoverage).toEqual(expect.objectContaining({
      fixtures: 'high',
      scores: 'high',
      squadAvailability: 'medium',
      weather: 'low',
    }));

    expect(openFootball).toEqual(expect.objectContaining({
      providerName: 'openfootball',
      defaultAdvancedMetricTrust: 'low',
      freshnessSlaHours: 168,
    }));
    expect(openFootball.fieldCoverage).toEqual(expect.objectContaining({
      fixtures: 'medium',
      elo: 'none',
      squadAvailability: 'none',
    }));
  });

  it('builds default advanced metric provenance from provider profiles', () => {
    expect(buildDefaultAdvancedMetricProvenance('official', 'Official Feed')).toEqual({
      source: 'official',
      providerName: 'Official Feed',
      trustLevel: 'high',
      caveat: 'Official advanced metric source.',
    });

    expect(buildDefaultAdvancedMetricProvenance('openfootball', 'openfootball')).toEqual({
      source: 'provider',
      providerName: 'openfootball',
      trustLevel: 'low',
      caveat: 'Provider profile has no reliable advanced metric coverage; metric requires independent verification.',
    });

    expect(buildDefaultAdvancedMetricProvenance('api-football', 'API-Football')).toEqual({
      source: 'provider',
      providerName: 'API-Football',
      trustLevel: 'medium',
      caveat: 'Provider-supplied advanced metric; not official unless separately verified.',
    });
  });

  it('resolves freshness SLA from source and provider names', () => {
    expect(getFootballProviderFreshnessSlaHours('official', 'Official Feed')).toBe(24);
    expect(getFootballProviderFreshnessSlaHours('provider', 'API-Football xG feed')).toBe(48);
    expect(getFootballProviderFreshnessSlaHours('provider', 'SportMonks lineups')).toBe(48);
    expect(getFootballProviderFreshnessSlaHours('provider', 'openfootball fixture file')).toBe(168);
    expect(getFootballProviderFreshnessSlaHours('provider', 'Unknown feed')).toBe(48);
    expect(getFootballProviderFreshnessSlaHours('manual', 'Analyst note')).toBe(24);
  });
});
