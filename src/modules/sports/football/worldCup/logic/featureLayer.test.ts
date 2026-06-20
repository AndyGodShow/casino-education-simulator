import { describe, expect, it } from 'vitest';
import { buildMatchFeatureLayer } from './featureLayer';
import type { WorldCupMatch, WorldCupTeam } from '../types';

const team = (
  id: string,
  rating: number,
  attack: number,
  defense: number,
  form: number,
  advancedMetrics: WorldCupTeam['advancedMetrics'] = undefined,
): WorldCupTeam => ({
  id,
  name: id,
  shortName: id.slice(0, 3).toUpperCase(),
  countryCode: id.slice(0, 2).toUpperCase(),
  group: 'A',
  rating,
  attack,
  defense,
  form,
  advancedMetrics,
});

const match: WorldCupMatch = {
  id: 'feature-test',
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: 'home',
  awayTeamId: 'away',
  kickoff: '2026-06-18T18:00:00.000Z',
  status: 'scheduled',
  source: 'local',
  lastUpdated: '2026-06-18T00:00:00.000Z',
};

describe('featureLayer', () => {
  it('keeps advanced feature contribution at zero when richer inputs are absent', () => {
    const result = buildMatchFeatureLayer(
      match,
      team('home', 84, 83, 82, 81),
      team('away', 80, 79, 78, 77),
    );

    expect(result.home.advanced.total).toBe(0);
    expect(result.away.advanced.total).toBe(0);
    expect(result.metadata.availableAdvancedFeatures).toBe(0);
    expect(result.metadata.missingAdvancedFeatures).toContain('elo');
    expect(result.home.lambda).toBeGreaterThan(0);
    expect(result.away.lambda).toBeGreaterThan(0);
  });

  it('lets xG, squad availability, rest, travel, and Elo move lambda conservatively', () => {
    const neutral = buildMatchFeatureLayer(
      match,
      team('home', 84, 83, 82, 81),
      team('away', 80, 79, 78, 77),
    );
    const enriched = buildMatchFeatureLayer(
      match,
      team('home', 84, 83, 82, 81, {
        elo: 1840,
        recentXgFor: 1.9,
        recentXgAgainst: 0.8,
        squadAvailability: 96,
        restDays: 6,
        travelFatigue: 0.05,
      }),
      team('away', 80, 79, 78, 77, {
        elo: 1760,
        recentXgFor: 1.1,
        recentXgAgainst: 1.7,
        squadAvailability: 76,
        restDays: 3,
        travelFatigue: 0.55,
      }),
    );

    expect(enriched.home.advanced.total).toBeGreaterThan(0);
    expect(enriched.away.advanced.total).toBeLessThan(0);
    expect(enriched.home.lambda).toBeGreaterThan(neutral.home.lambda);
    expect(enriched.away.lambda).toBeLessThan(neutral.away.lambda);
    expect(enriched.metadata.availableAdvancedFeatures).toBeGreaterThanOrEqual(5);
  });

  it('keeps the configured lambda formula numerically stable', () => {
    const result = buildMatchFeatureLayer(
      match,
      team('home', 84, 83, 82, 81, {
        elo: 1840,
        recentXgFor: 1.9,
        recentXgAgainst: 0.8,
        squadAvailability: 96,
        restDays: 6,
        travelFatigue: 0.05,
      }),
      team('away', 80, 79, 78, 77, {
        elo: 1760,
        recentXgFor: 1.1,
        recentXgAgainst: 1.7,
        squadAvailability: 76,
        restDays: 3,
        travelFatigue: 0.55,
      }),
    );

    expect(result.home).toMatchObject({
      baseStrength: 1.186,
      attackDefense: 0.07,
      homeAdvantage: 0.12,
      formAdjustment: -0.042,
      matchupAsymmetry: 0.064,
      stageMultiplier: 1,
      rawLambda: 1.669,
    });
    expect(result.home.advanced).toMatchObject({
      elo: 0.064,
      xg: 0.07199999999999998,
      squadAvailability: 0.066,
      rest: 0.07500000000000001,
      travel: -0.006,
      total: 0.271,
    });
    expect(result.home.lambda).toBeCloseTo(1.0459703762463277, 12);
    expect(result.away.rawLambda).toBeCloseTo(0.6589999999999998, 12);
    expect(result.away.lambda).toBeCloseTo(0.5252605823344227, 12);
  });

  it('reports structured input coverage for complete base and advanced fields', () => {
    const result = buildMatchFeatureLayer(
      match,
      team('home', 84, 83, 82, 81, {
        elo: 1840,
        recentXgFor: 1.9,
        recentXgAgainst: 0.8,
        squadAvailability: 96,
        restDays: 6,
        travelFatigue: 0.05,
      }),
      team('away', 80, 79, 78, 77, {
        elo: 1760,
        recentXgFor: 1.1,
        recentXgAgainst: 1.7,
        squadAvailability: 76,
        restDays: 3,
        travelFatigue: 0.55,
      }),
    );

    expect(result.metadata.inputCoverage).toEqual({
      baseFieldsAvailable: 8,
      baseFieldsTotal: 8,
      advancedFieldsAvailable: 12,
      advancedFieldsTotal: 12,
      overallRatio: 1,
      missingFields: [],
    });
  });

  it('reports missing input coverage without hiding usable base model inputs', () => {
    const result = buildMatchFeatureLayer(
      match,
      team('home', 84, Number.NaN, 82, 81, {
        elo: 1840,
        recentXgFor: 1.9,
      }),
      team('away', 80, 79, 78, 77, {
        recentXgAgainst: 1.7,
        travelFatigue: 0.55,
      }),
    );

    expect(result.metadata.inputCoverage.baseFieldsAvailable).toBe(7);
    expect(result.metadata.inputCoverage.baseFieldsTotal).toBe(8);
    expect(result.metadata.inputCoverage.advancedFieldsAvailable).toBe(4);
    expect(result.metadata.inputCoverage.advancedFieldsTotal).toBe(12);
    expect(result.metadata.inputCoverage.overallRatio).toBe(0.55);
    expect([...result.metadata.inputCoverage.missingFields].sort()).toEqual([
      'home.attack',
      'away.advancedMetrics.elo',
      'away.advancedMetrics.recentXgFor',
      'home.advancedMetrics.recentXgAgainst',
      'home.advancedMetrics.squadAvailability',
      'away.advancedMetrics.squadAvailability',
      'home.advancedMetrics.restDays',
      'away.advancedMetrics.restDays',
      'home.advancedMetrics.travelFatigue',
    ].sort());
  });
});
