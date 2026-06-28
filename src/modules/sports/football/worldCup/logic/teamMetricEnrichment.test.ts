import { describe, expect, it } from 'vitest';
import type { MatchExternalIntelligenceFeed, WorldCupMatch, WorldCupTeam } from '../types';
import {
  applyExternalMatchIntelligence,
  enrichMatchTeamsWithDerivedMetrics,
  mergeExternalMatchIntelligenceFeeds,
} from './teamMetricEnrichment';

const match: WorldCupMatch = {
  id: 'metric-enrichment',
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

const team = (id: string): WorldCupTeam => ({
  id,
  name: id,
  shortName: id.slice(0, 3).toUpperCase(),
  countryCode: id.slice(0, 2).toUpperCase(),
  group: 'A',
  rating: 82,
  attack: 84,
  defense: 80,
  form: 78,
});

describe('teamMetricEnrichment', () => {
  it('fills missing advanced metrics from match and team context', () => {
    const enriched = enrichMatchTeamsWithDerivedMetrics({
      match,
      homeTeam: team('home'),
      awayTeam: team('away'),
      scheduleContext: {
        homeRestDays: 5,
        awayRestDays: 3,
        homeTravelFatigue: 0.05,
        awayTravelFatigue: 0.35,
        source: 'fixture chronology + host travel proxy',
      },
    });

    expect(enriched.homeTeam.advancedMetrics).toMatchObject({
      elo: expect.any(Number),
      recentXgFor: expect.any(Number),
      recentXgAgainst: expect.any(Number),
      squadAvailability: expect.any(Number),
      restDays: 5,
      travelFatigue: 0.05,
    });
    expect(enriched.homeTeam.advancedMetricSources?.squadAvailability?.providerName).toBe('derived-match-intelligence');
    expect(enriched.awayTeam.advancedMetrics?.restDays).toBe(3);
  });

  it('does not overwrite existing provider metrics', () => {
    const homeTeam: WorldCupTeam = {
      ...team('home'),
      advancedMetrics: {
        elo: 1901,
        squadAvailability: 97,
      },
      advancedMetricSources: {
        elo: {
          source: 'provider',
          providerName: 'Provider Elo',
          trustLevel: 'medium',
        },
      },
    };
    const enriched = enrichMatchTeamsWithDerivedMetrics({
      match,
      homeTeam,
      awayTeam: team('away'),
      scheduleContext: {
        homeRestDays: 5,
        awayRestDays: 3,
        homeTravelFatigue: 0.05,
        awayTravelFatigue: 0.35,
        source: 'fixture chronology + host travel proxy',
      },
    });

    expect(enriched.homeTeam.advancedMetrics?.elo).toBe(1901);
    expect(enriched.homeTeam.advancedMetrics?.squadAvailability).toBe(97);
    expect(enriched.homeTeam.advancedMetricSources?.elo?.providerName).toBe('Provider Elo');
    expect(enriched.homeTeam.advancedMetrics?.restDays).toBe(5);
  });

  it('applies audited external match intelligence before derived proxy metrics', () => {
    const feed: MatchExternalIntelligenceFeed = {
      source: 'provider',
      providerName: 'Lineup + xG provider',
      trustLevel: 'high',
      lastUpdated: '2026-06-18T12:00:00.000Z',
      auditable: true,
      home: {
        advancedMetrics: {
          elo: 1860,
          recentXgFor: 1.72,
          recentXgAgainst: 0.88,
          squadAvailability: 91,
          restDays: 6,
          travelFatigue: 0.08,
        },
      },
      away: {
        advancedMetrics: {
          elo: 1740,
          recentXgFor: 1.04,
          recentXgAgainst: 1.48,
          squadAvailability: 79,
          restDays: 4,
          travelFatigue: 0.34,
        },
      },
    };
    const enriched = enrichMatchTeamsWithDerivedMetrics({
      match,
      ...applyExternalMatchIntelligence({
        match,
        homeTeam: team('home'),
        awayTeam: team('away'),
        feed,
      }),
      scheduleContext: {
        homeRestDays: 5,
        awayRestDays: 3,
        homeTravelFatigue: 0.05,
        awayTravelFatigue: 0.35,
        source: 'fixture chronology + host travel proxy',
      },
    });

    expect(enriched.homeTeam.advancedMetrics).toMatchObject({
      elo: 1860,
      recentXgFor: 1.72,
      squadAvailability: 91,
      restDays: 6,
      travelFatigue: 0.08,
    });
    expect(enriched.homeTeam.advancedMetricSources?.squadAvailability).toEqual(expect.objectContaining({
      source: 'provider',
      providerName: 'Lineup + xG provider',
      trustLevel: 'high',
      lastUpdated: '2026-06-18T12:00:00.000Z',
    }));
    expect(enriched.awayTeam.advancedMetrics?.travelFatigue).toBe(0.34);
  });

  it('downgrades unaudited external match intelligence to low trust provenance', () => {
    const enriched = applyExternalMatchIntelligence({
      match,
      homeTeam: team('home'),
      awayTeam: team('away'),
      feed: {
        source: 'manual',
        providerName: 'Unverified note',
        trustLevel: 'high',
        lastUpdated: '2026-06-18T12:00:00.000Z',
        auditable: false,
        home: {
          advancedMetrics: {
            squadAvailability: 60,
          },
        },
      },
    });

    expect(enriched.homeTeam.advancedMetrics?.squadAvailability).toBe(60);
    expect(enriched.homeTeam.advancedMetricSources?.squadAvailability).toEqual(expect.objectContaining({
      source: 'manual',
      providerName: 'Unverified note',
      trustLevel: 'low',
    }));
    expect(enriched.homeTeam.advancedMetricSources?.squadAvailability?.caveat).toContain('Unaudited');
  });

  it('downgrades stale audited external intelligence before it reaches lambda inputs', () => {
    const enriched = applyExternalMatchIntelligence({
      match,
      homeTeam: team('home'),
      awayTeam: team('away'),
      feed: {
        source: 'provider',
        providerName: 'Old lineup provider',
        trustLevel: 'high',
        lastUpdated: '2026-06-10T00:00:00.000Z',
        auditable: true,
        home: {
          advancedMetrics: {
            squadAvailability: 96,
          },
        },
      },
    });

    expect(enriched.homeTeam.advancedMetrics?.squadAvailability).toBe(96);
    expect(enriched.homeTeam.advancedMetricSources?.squadAvailability).toEqual(expect.objectContaining({
      providerName: 'Old lineup provider',
      trustLevel: 'low',
    }));
    expect(enriched.homeTeam.advancedMetricSources?.squadAvailability?.caveat).toContain('Stale');
  });

  it('uses provider quality freshness SLA for official external intelligence', () => {
    const enriched = applyExternalMatchIntelligence({
      match: {
        ...match,
        lastUpdated: '2026-06-18T12:00:00.000Z',
      },
      homeTeam: team('home'),
      awayTeam: team('away'),
      feed: {
        source: 'official',
        providerName: 'Official Feed',
        trustLevel: 'high',
        lastUpdated: '2026-06-17T00:00:00.000Z',
        auditable: true,
        home: {
          advancedMetrics: {
            squadAvailability: 96,
          },
        },
      },
    });

    expect(enriched.homeTeam.advancedMetrics?.squadAvailability).toBe(96);
    expect(enriched.homeTeam.advancedMetricSources?.squadAvailability).toEqual(expect.objectContaining({
      source: 'official',
      providerName: 'Official Feed',
      trustLevel: 'low',
    }));
    expect(enriched.homeTeam.advancedMetricSources?.squadAvailability?.caveat).toContain('Stale');
  });

  it('uses provider quality freshness SLA for named provider external intelligence', () => {
    const enriched = applyExternalMatchIntelligence({
      match: {
        ...match,
        lastUpdated: '2026-06-18T12:00:00.000Z',
      },
      homeTeam: team('home'),
      awayTeam: team('away'),
      feed: {
        source: 'provider',
        providerName: 'API-Football lineup feed',
        trustLevel: 'medium',
        lastUpdated: '2026-06-16T06:00:00.000Z',
        auditable: true,
        home: {
          advancedMetrics: {
            squadAvailability: 92,
          },
        },
      },
    });

    expect(enriched.homeTeam.advancedMetrics?.squadAvailability).toBe(92);
    expect(enriched.homeTeam.advancedMetricSources?.squadAvailability).toEqual(expect.objectContaining({
      source: 'provider',
      providerName: 'API-Football lineup feed',
      trustLevel: 'low',
    }));
    expect(enriched.homeTeam.advancedMetricSources?.squadAvailability?.caveat).toContain('Stale');
  });

  it('merges multiple external intelligence feeds per metric by audited trust and freshness', () => {
    const merged = mergeExternalMatchIntelligenceFeeds([
      {
        source: 'provider',
        providerName: 'xG provider',
        trustLevel: 'medium',
        lastUpdated: '2026-06-18T09:00:00.000Z',
        auditable: true,
        home: {
          advancedMetrics: {
            recentXgFor: 1.62,
            recentXgAgainst: 0.94,
            squadAvailability: 80,
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
            squadAvailability: 96,
            restDays: 6,
          },
        },
        away: {
          advancedMetrics: {
            travelFatigue: 0.42,
          },
        },
      },
      {
        source: 'manual',
        providerName: 'unaudited note',
        trustLevel: 'high',
        lastUpdated: '2026-06-18T12:00:00.000Z',
        auditable: false,
        home: {
          advancedMetrics: {
            squadAvailability: 55,
            recentXgFor: 2.2,
          },
        },
      },
    ]);

    expect(merged).toEqual(expect.objectContaining({
      auditable: true,
      source: 'provider',
      providerName: 'merged external intelligence',
      trustLevel: 'high',
    }));
    expect(merged?.home?.advancedMetrics).toEqual(expect.objectContaining({
      recentXgFor: 1.62,
      recentXgAgainst: 0.94,
      squadAvailability: 96,
      restDays: 6,
    }));
    expect(merged?.away?.advancedMetrics?.travelFatigue).toBe(0.42);
    expect(merged?.home?.advancedMetricSources?.recentXgFor?.providerName).toBe('xG provider');
    expect(merged?.home?.advancedMetricSources?.squadAvailability?.providerName).toBe('lineup provider');
  });

  it('prefers fresh medium-trust intelligence over stale high-trust intelligence for the same metric', () => {
    const merged = mergeExternalMatchIntelligenceFeeds([
      {
        source: 'provider',
        providerName: 'stale high provider',
        trustLevel: 'high',
        lastUpdated: '2026-06-10T00:00:00.000Z',
        auditable: true,
        home: {
          advancedMetrics: {
            squadAvailability: 97,
          },
        },
      },
      {
        source: 'provider',
        providerName: 'fresh medium provider',
        trustLevel: 'medium',
        lastUpdated: '2026-06-18T08:00:00.000Z',
        auditable: true,
        home: {
          advancedMetrics: {
            squadAvailability: 88,
          },
        },
      },
    ], match);

    expect(merged?.home?.advancedMetrics?.squadAvailability).toBe(88);
    expect(merged?.home?.advancedMetricSources?.squadAvailability).toEqual(expect.objectContaining({
      providerName: 'fresh medium provider',
      trustLevel: 'medium',
    }));
  });

  it('downgrades materially conflicting fresh provider metrics instead of trusting one source outright', () => {
    const merged = mergeExternalMatchIntelligenceFeeds([
      {
        source: 'provider',
        providerName: 'lineup provider',
        trustLevel: 'high',
        lastUpdated: '2026-06-18T09:00:00.000Z',
        auditable: true,
        home: {
          advancedMetrics: {
            squadAvailability: 96,
          },
        },
      },
      {
        source: 'provider',
        providerName: 'medical provider',
        trustLevel: 'medium',
        lastUpdated: '2026-06-18T10:00:00.000Z',
        auditable: true,
        home: {
          advancedMetrics: {
            squadAvailability: 72,
          },
        },
      },
    ], match);

    expect(merged?.home?.advancedMetrics?.squadAvailability).toBe(96);
    expect(merged?.home?.advancedMetricSources?.squadAvailability).toEqual(expect.objectContaining({
      providerName: 'lineup provider',
      trustLevel: 'low',
    }));
    expect(merged?.home?.advancedMetricSources?.squadAvailability?.caveat).toContain('Conflicting');
    expect(merged?.home?.advancedMetricSources?.squadAvailability?.caveat).toContain('medical provider=72');
  });

  it('applies arrays of external feeds as one merged intelligence source', () => {
    const enriched = applyExternalMatchIntelligence({
      match,
      homeTeam: team('home'),
      awayTeam: team('away'),
      feed: [
        {
          source: 'provider',
          providerName: 'xG provider',
          trustLevel: 'medium',
          lastUpdated: '2026-06-18T09:00:00.000Z',
          auditable: true,
          home: {
            advancedMetrics: {
              recentXgFor: 1.62,
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
              squadAvailability: 96,
            },
          },
        },
      ],
    });

    expect(enriched.homeTeam.advancedMetrics).toEqual(expect.objectContaining({
      recentXgFor: 1.62,
      squadAvailability: 96,
    }));
    expect(enriched.homeTeam.advancedMetricSources?.recentXgFor?.providerName).toBe('xG provider');
    expect(enriched.homeTeam.advancedMetricSources?.squadAvailability?.providerName).toBe('lineup provider');
  });
});
