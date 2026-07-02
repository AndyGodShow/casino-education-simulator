import { describe, expect, it } from 'vitest';
import type { MatchDataQualityState } from '../domain/WorldCupDomainModel';
import type { WorldCupMatch, WorldCupTeam } from '../types';
import { buildMatchIntelligenceLayer } from './matchIntelligenceLayer';

const match: WorldCupMatch = {
  id: 'intelligence-test',
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: 'home',
  awayTeamId: 'away',
  kickoff: '2026-06-18T18:00:00.000Z',
  venue: 'Sample venue',
  city: 'Sample city',
  status: 'scheduled',
  source: 'local',
  lastUpdated: '2026-06-18T00:00:00.000Z',
};

const team = (id: string, rating: number, isHost = false): WorldCupTeam => ({
  id,
  name: id,
  shortName: id.slice(0, 3).toUpperCase(),
  countryCode: id.slice(0, 2).toUpperCase(),
  group: 'A',
  rating,
  attack: rating + 1,
  defense: rating - 1,
  form: rating - 2,
  isHost,
});

const quality: MatchDataQualityState = {
  matchId: match.id,
  source: 'local',
  tier: 'local',
  label: 'Local seed',
  lastUpdated: Date.parse(match.lastUpdated),
  staleness: 'stale',
  stalenessHours: 12,
  isOfficialFixture: false,
  isVerifiedProvider: false,
  hasVerifiedScore: false,
  canUseForRealPrediction: false,
  caveat: 'local seed only',
};

describe('matchIntelligenceLayer', () => {
  it('emits auditable factors for every intelligence category', () => {
    const layer = buildMatchIntelligenceLayer({
      match,
      homeTeam: team('home', 82, true),
      awayTeam: team('away', 76),
      matchDataQuality: quality,
    });

    expect(layer.matchId).toBe(match.id);
    expect(new Set(layer.factors.map((factor) => factor.category))).toEqual(new Set([
      'team_strength',
      'recent_form',
      'squad',
      'schedule_travel',
      'venue_environment',
      'tactical_matchup',
      'market',
      'motivation',
      'data_quality',
    ]));
    layer.factors.forEach((factor) => {
      expect(factor.impact).toBeGreaterThanOrEqual(-1);
      expect(factor.impact).toBeLessThanOrEqual(1);
      expect(factor.confidence).toBeGreaterThanOrEqual(0);
      expect(factor.confidence).toBeLessThanOrEqual(1);
      expect(factor.source.length).toBeGreaterThan(0);
    });
  });

  it('makes missing squad, travel, and market inputs explicit', () => {
    const layer = buildMatchIntelligenceLayer({
      match,
      homeTeam: team('home', 82),
      awayTeam: team('away', 76),
      matchDataQuality: quality,
    });

    expect(layer.coverage.missingCategories).toEqual(expect.arrayContaining([
      'squad',
      'schedule_travel',
      'market',
    ]));
    expect(layer.summary.unavailableCount).toBeGreaterThan(0);
    expect(layer.factors.filter((factor) => factor.quality === 'unavailable').map((factor) => factor.key)).toEqual(expect.arrayContaining([
      'squad-availability',
      'schedule-rest-days',
      'market-reference',
    ]));
  });

  it('improves coverage and quality when provider advanced metrics and market data exist', () => {
    const homeTeam: WorldCupTeam = {
      ...team('home', 82),
      advancedMetrics: {
        squadAvailability: 94,
        restDays: 6,
        travelFatigue: 0.1,
      },
      advancedMetricSources: {
        squadAvailability: {
          source: 'provider',
          providerName: 'Provider',
          trustLevel: 'medium',
          lastUpdated: '2026-06-18T08:00:00.000Z',
        },
        restDays: {
          source: 'provider',
          providerName: 'Provider',
          trustLevel: 'medium',
          lastUpdated: '2026-06-18T08:00:00.000Z',
        },
        travelFatigue: {
          source: 'provider',
          providerName: 'Provider',
          trustLevel: 'medium',
          lastUpdated: '2026-06-18T08:00:00.000Z',
        },
      },
    };
    const awayTeam: WorldCupTeam = {
      ...team('away', 76),
      advancedMetrics: {
        squadAvailability: 78,
        restDays: 3,
        travelFatigue: 0.6,
      },
      advancedMetricSources: homeTeam.advancedMetricSources,
    };

    const layer = buildMatchIntelligenceLayer({
      match,
      homeTeam,
      awayTeam,
      matchDataQuality: {
        ...quality,
        source: 'api-football',
        tier: 'verified_provider',
        label: 'Verified provider',
        staleness: 'fresh',
      },
      hasMarketData: true,
    });

    expect(layer.coverage.ratio).toBe(1);
    expect(layer.coverage.missingCategories).toEqual([]);
    expect(layer.factors.find((factor) => factor.key === 'squad-availability')?.quality).toBe('provider');
    expect(layer.factors.find((factor) => factor.key === 'market-reference')?.quality).toBe('provider');
    expect(layer.summary.topPositive.length).toBeGreaterThan(0);
  });

  it('reports provider-derived form and attack/defense provenance honestly', () => {
    const providerTeam = (id: string, rating: number): WorldCupTeam => ({
      ...team(id, rating),
      coreMetricSources: {
        rating: {
          source: 'seed',
          trustLevel: 'low',
          caveat: 'Static rating prior.',
        },
        attack: {
          source: 'provider',
          providerName: 'OpenFootball results',
          trustLevel: 'medium',
          lastUpdated: '2026-07-02T06:00:00.000Z',
          caveat: 'Derived from completed scores; goals are not xG.',
        },
        defense: {
          source: 'provider',
          providerName: 'OpenFootball results',
          trustLevel: 'medium',
          lastUpdated: '2026-07-02T06:00:00.000Z',
          caveat: 'Derived from completed scores; goals are not xG.',
        },
        form: {
          source: 'provider',
          providerName: 'OpenFootball results',
          trustLevel: 'medium',
          lastUpdated: '2026-07-02T06:00:00.000Z',
          caveat: 'Derived from completed scores; goals are not xG.',
        },
      },
    });
    const layer = buildMatchIntelligenceLayer({
      match,
      homeTeam: providerTeam('home', 82),
      awayTeam: providerTeam('away', 76),
      matchDataQuality: quality,
    });
    const formFactor = layer.factors.find((factor) => factor.key === 'recent-form-rating-deviation');
    const matchupFactor = layer.factors.find((factor) => factor.key === 'tactical-attack-defense-matchup');
    const strengthFactor = layer.factors.find((factor) => factor.key === 'team-strength-rating-gap');

    expect(formFactor).toEqual(expect.objectContaining({
      quality: 'provider',
      source: 'OpenFootball results / OpenFootball results',
      lastUpdated: '2026-07-02T06:00:00.000Z',
    }));
    expect(formFactor?.caveat).toContain('goals are not xG');
    expect(matchupFactor?.quality).toBe('provider');
    expect(strengthFactor?.quality).toBe('proxy');
  });

  it('uses group standings context for match-specific qualification motivation', () => {
    const layer = buildMatchIntelligenceLayer({
      match,
      homeTeam: team('home', 82),
      awayTeam: team('away', 76),
      matchDataQuality: quality,
      motivationContext: {
        source: 'group standings before kickoff',
        home: {
          teamId: 'home',
          points: 1,
          rank: 4,
          played: 2,
          matchesRemaining: 1,
          pressure: 'must_win',
          urgency: 0.95,
        },
        away: {
          teamId: 'away',
          points: 6,
          rank: 1,
          played: 2,
          matchesRemaining: 1,
          pressure: 'protect_top_spot',
          urgency: 0.68,
        },
      },
    });
    const motivation = layer.factors.find((factor) => factor.key === 'group-qualification-motivation');

    expect(motivation?.quality).toBe('proxy');
    expect(motivation?.impact).toBeGreaterThan(0);
    expect(motivation?.caveat).toContain('must win');
    expect(motivation?.caveat).toContain('protect top spot');
  });
});
