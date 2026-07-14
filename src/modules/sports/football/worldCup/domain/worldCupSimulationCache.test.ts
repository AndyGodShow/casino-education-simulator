import { describe, expect, it, vi } from 'vitest';
import type { WorldCupAdapterResult } from '../../../../../dataProviders/football/worldCupAdapter';
import type { WorldCupTeam } from '../types';
import { createWorldCupSimulationCache } from './worldCupSimulationCache';

const provenance = (providerName: string) => ({
  source: 'provider' as const,
  providerName,
  lastUpdated: '2026-06-18T09:00:00.000Z',
  trustLevel: 'high' as const,
});

const team = (id: string, rating: number): WorldCupTeam => ({
  id,
  name: id.toUpperCase(),
  shortName: id.slice(0, 3).toUpperCase(),
  countryCode: id.slice(0, 2).toUpperCase(),
  group: 'A',
  rating,
  attack: rating + 1,
  defense: rating - 1,
  form: rating,
  coreMetricSources: {
    rating: provenance('rating-feed'),
  },
  advancedMetrics: {
    elo: 1700 + rating,
    recentXgFor: 1.5,
  },
  advancedMetricSources: {
    elo: provenance('elo-feed'),
  },
});

const adapterResult: WorldCupAdapterResult = {
  matches: [
    {
      id: 'match-b',
      competitionId: 'world-cup-2026',
      stage: 'group',
      group: 'A',
      homeTeamId: 'charlie',
      awayTeamId: 'delta',
      kickoff: '2026-06-19T18:00:00.000Z',
      status: 'scheduled',
      source: 'official',
      lastUpdated: '2026-06-18T11:00:00.000Z',
    },
    {
      id: 'match-a',
      competitionId: 'world-cup-2026',
      stage: 'group',
      group: 'A',
      homeTeamId: 'alpha',
      awayTeamId: 'beta',
      kickoff: '2026-06-18T18:00:00.000Z',
      status: 'live',
      homeScore: 1,
      awayScore: 0,
      source: 'official',
      lastUpdated: '2026-06-18T10:00:00.000Z',
    },
  ],
  teams: {
    delta: team('delta', 74),
    beta: team('beta', 76),
    charlie: team('charlie', 78),
    alpha: team('alpha', 82),
    spectator: team('spectator', 99),
  },
  source: 'official',
  providerName: 'Official feed',
  errors: [],
  meta: {
    totalMatches: 2,
    statusBreakdown: { scheduled: 1, live: 1, finished: 0 },
  },
};

const replaceAlpha = (changes: Partial<WorldCupTeam>): WorldCupAdapterResult => ({
  ...adapterResult,
  teams: {
    ...adapterResult.teams,
    alpha: { ...adapterResult.teams.alpha, ...changes },
  },
});

describe('createWorldCupSimulationCache', () => {
  it('reuses one simulation when only non-semantic refresh data changes', () => {
    const simulation = { probabilities: [] };
    const builder = vi.fn(() => simulation);
    const cache = createWorldCupSimulationCache(builder);

    const noisyRefresh = {
      ...adapterResult,
      errors: ['provider timeout after fallback'],
      providerName: 'same provider, later retrieval',
      providerRetrievedAt: '2026-06-18T12:30:00.000Z',
      markets: { 'match-a': { summary: 'market changed' } },
      researchSummary: 'new prose without new simulation inputs',
      evaluationTimeMs: Date.parse('2026-06-18T12:30:00.000Z'),
    };

    expect(cache.get(adapterResult)).toBe(simulation);
    expect(cache.get(noisyRefresh)).toBe(simulation);
    expect(builder).toHaveBeenCalledOnce();
  });

  it('is deterministic across match and team input ordering and ignores unreferenced teams', () => {
    const builder = vi.fn(() => ({ probabilities: [] }));
    const cache = createWorldCupSimulationCache(builder);
    const reordered = {
      ...adapterResult,
      matches: [...adapterResult.matches].reverse(),
      teams: Object.fromEntries([
        ['spectator', { ...adapterResult.teams.spectator, rating: 1 }],
        ...Object.entries(adapterResult.teams)
          .filter(([id]) => id !== 'spectator')
          .reverse(),
      ]),
    };

    const first = cache.get(adapterResult);
    expect(cache.get(reordered)).toBe(first);
    expect(builder).toHaveBeenCalledOnce();
  });

  it.each([
    ['id', { id: 'match-a-revised' }],
    ['stage', { stage: 'round16' as const }],
    ['group', { group: 'B' as const }],
    ['status', { status: 'finished' as const }],
    ['home team', { homeTeamId: 'beta' }],
    ['away team', { awayTeamId: 'alpha' }],
    ['source', { source: 'manual' as const }],
    ['home score', { homeScore: 2 }],
    ['away score', { awayScore: 1 }],
    ['kickoff', { kickoff: '2026-06-18T19:00:00.000Z' }],
    ['last update', { lastUpdated: '2026-06-18T10:01:00.000Z' }],
  ])('invalidates when match %s changes', (_label, changes) => {
    const builder = vi.fn(() => ({ probabilities: [] }));
    const cache = createWorldCupSimulationCache(builder);
    cache.get(adapterResult);
    cache.get({
      ...adapterResult,
      matches: adapterResult.matches.map((match) => (
        match.id === 'match-a' ? { ...match, ...changes } : match
      )),
    });

    expect(builder).toHaveBeenCalledTimes(2);
  });

  it.each(['rating', 'attack', 'defense', 'form'] as const)(
    'invalidates when referenced team %s changes',
    (field) => {
      const builder = vi.fn(() => ({ probabilities: [] }));
      const cache = createWorldCupSimulationCache(builder);
      cache.get(adapterResult);
      cache.get(replaceAlpha({ [field]: adapterResult.teams.alpha[field] + 1 }));

      expect(builder).toHaveBeenCalledTimes(2);
    },
  );

  it('invalidates when a referenced team host flag changes', () => {
    const builder = vi.fn(() => ({ probabilities: [] }));
    const cache = createWorldCupSimulationCache(builder);
    cache.get(adapterResult);
    cache.get(replaceAlpha({ isHost: true }));

    expect(builder).toHaveBeenCalledTimes(2);
  });

  it('invalidates when explicit match truth changes', () => {
    const builder = vi.fn(() => ({ probabilities: [] }));
    const cache = createWorldCupSimulationCache(builder);
    const withTruth = (level: 'live' | 'stale', confidence: number): WorldCupAdapterResult => ({
      ...adapterResult,
      matches: adapterResult.matches.map((match) => (
        match.id === 'match-a'
          ? {
              ...match,
              truth: {
                level,
                confidence,
                description: `${level} fixture`,
                sourceBreakdown: ['explicit test truth'],
              },
            }
          : match
      )),
    });

    cache.get(withTruth('live', 0.86));
    cache.get(withTruth('stale', 0.18));

    expect(builder).toHaveBeenCalledTimes(2);
  });

  it('invalidates across the freshness boundary and passes materialized truth to the builder', () => {
    vi.useFakeTimers();
    try {
      const builder = vi.fn(() => ({ probabilities: [] }));
      const cache = createWorldCupSimulationCache(builder);

      vi.setSystemTime('2026-06-18T10:14:00.000Z');
      cache.get(adapterResult);
      vi.setSystemTime('2026-06-18T10:16:00.000Z');
      cache.get(adapterResult);

      expect(builder).toHaveBeenCalledTimes(2);
      const firstInput = builder.mock.calls[0][0];
      const secondInput = builder.mock.calls[1][0];
      expect(firstInput.matches.find((match) => match.id === 'match-a')?.truth?.level).toBe('live');
      expect(secondInput.matches.find((match) => match.id === 'match-a')?.truth?.level).toBe('stale');
    } finally {
      vi.useRealTimers();
    }
  });

  it('invalidates for advanced metrics and both metric provenance maps', () => {
    const mutations: WorldCupAdapterResult[] = [
      replaceAlpha({
        advancedMetrics: { ...adapterResult.teams.alpha.advancedMetrics, elo: 1999 },
      }),
      replaceAlpha({
        coreMetricSources: {
          ...adapterResult.teams.alpha.coreMetricSources,
          rating: provenance('replacement-rating-feed'),
        },
      }),
      replaceAlpha({
        advancedMetricSources: {
          ...adapterResult.teams.alpha.advancedMetricSources,
          elo: provenance('replacement-elo-feed'),
        },
      }),
    ];

    for (const changedResult of mutations) {
      const builder = vi.fn(() => ({ probabilities: [] }));
      const cache = createWorldCupSimulationCache(builder);
      cache.get(adapterResult);
      cache.get(changedResult);
      expect(builder).toHaveBeenCalledTimes(2);
    }
  });

  it('retains only the most recent semantic fingerprint', () => {
    const builder = vi.fn(() => ({ probabilities: [] }));
    const cache = createWorldCupSimulationCache(builder);
    cache.get(adapterResult);
    cache.get(replaceAlpha({ rating: 91 }));
    cache.get(adapterResult);

    expect(builder).toHaveBeenCalledTimes(3);
  });
});
