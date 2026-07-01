import { describe, expect, it, vi } from 'vitest';
import type { FixtureProviderResult } from '../../dataProviders/football/fixtureProvider';
import type { MatchPrediction, WorldCupMatch } from '../../modules/sports/football/worldCup/types';
import { runPredictionSnapshotJob } from './predictionSnapshotJob';

const match: WorldCupMatch = {
  id: 'match-80',
  competitionId: 'world-cup-2026',
  stage: 'round32',
  homeTeamId: 'england',
  awayTeamId: 'dr-congo',
  kickoff: '2026-07-01T16:00:00.000Z',
  status: 'scheduled',
  source: 'openfootball',
  lastUpdated: '2026-07-01T15:58:00.000Z',
};

const prediction = {
  matchId: match.id,
  modelVersion: 'v2',
  confidence: 0.54,
  probabilities: { homeWin: 0.46, draw: 0.35, awayWin: 0.19 },
  decisionLayer: {
    expectedGoals: { home: 1.2, away: 0.8 },
  },
} as MatchPrediction;

describe('runPredictionSnapshotJob', () => {
  it('writes the latest prediction while the match is still scheduled', async () => {
    const persistSnapshots = vi.fn(async () => undefined);

    const result = await runPredictionSnapshotJob({
      now: Date.parse('2026-07-01T15:59:30.000Z'),
      loadFixtureResult: async () => ({
        source: 'openfootball',
      } as FixtureProviderResult),
      buildSnapshotCandidates: () => ({
        matches: [match],
        predictions: { [match.id]: prediction },
      }),
      persistSnapshots,
    });

    expect(result).toEqual({ source: 'openfootball', written: 1 });
    expect(persistSnapshots).toHaveBeenCalledWith([expect.objectContaining({
      matchId: match.id,
      capturedAt: '2026-07-01T15:59:30.000Z',
      prediction,
    })]);
  });

  it('does not overwrite a prediction at or after kickoff', async () => {
    const persistSnapshots = vi.fn(async () => undefined);

    const result = await runPredictionSnapshotJob({
      now: Date.parse(match.kickoff),
      loadFixtureResult: async () => ({
        source: 'openfootball',
      } as FixtureProviderResult),
      buildSnapshotCandidates: () => ({
        matches: [{ ...match, status: 'live' }],
        predictions: { [match.id]: prediction },
      }),
      persistSnapshots,
    });

    expect(result.written).toBe(0);
    expect(persistSnapshots).not.toHaveBeenCalled();
  });

  it('refuses to publish sample or local fallback predictions', async () => {
    await expect(runPredictionSnapshotJob({
      now: Date.parse('2026-07-01T15:59:30.000Z'),
      loadFixtureResult: async () => ({
        source: 'sample',
      } as FixtureProviderResult),
      buildSnapshotCandidates: () => ({
        matches: [match],
        predictions: { [match.id]: prediction },
      }),
      persistSnapshots: async () => undefined,
    })).rejects.toThrow('verified fixture provider');
  });
});
