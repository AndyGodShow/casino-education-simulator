import { describe, expect, it, vi } from 'vitest';
import type { MatchPrediction, WorldCupMatch } from '../types';
import {
  capturePreMatchPredictionSnapshots,
  capturePreMatchPredictionSnapshotsNow,
  loadPreMatchPredictionSnapshots,
  persistPreMatchPredictionSnapshots,
} from './preMatchPredictionStore';

const match: WorldCupMatch = {
  id: 'match-80',
  competitionId: 'world-cup-2026',
  stage: 'round32',
  homeTeamId: 'england',
  awayTeamId: 'dr-congo',
  kickoff: '2026-07-01T16:00:00.000Z',
  status: 'scheduled',
  source: 'openfootball',
  lastUpdated: '',
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

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

describe('preMatchPredictionStore', () => {
  it('keeps the latest prediction observed before kickoff and freezes it after kickoff', () => {
    const first = capturePreMatchPredictionSnapshots({
      snapshots: {},
      matches: [match],
      predictions: { [match.id]: prediction },
      now: Date.parse('2026-07-01T15:58:00.000Z'),
    });
    const updatedPrediction = {
      ...prediction,
      probabilities: { homeWin: 0.5, draw: 0.31, awayWin: 0.19 },
    };
    const second = capturePreMatchPredictionSnapshots({
      snapshots: first.snapshots,
      matches: [match],
      predictions: { [match.id]: updatedPrediction },
      now: Date.parse('2026-07-01T15:59:30.000Z'),
    });
    const afterKickoff = capturePreMatchPredictionSnapshots({
      snapshots: second.snapshots,
      matches: [{ ...match, status: 'live' }],
      predictions: {
        [match.id]: {
          ...updatedPrediction,
          probabilities: { homeWin: 0.1, draw: 0.1, awayWin: 0.8 },
        },
      },
      now: Date.parse('2026-07-01T16:00:01.000Z'),
    });

    expect(first.changed).toBe(true);
    expect(second.snapshots[match.id].capturedAt).toBe('2026-07-01T15:59:30.000Z');
    expect(second.snapshots[match.id].prediction.probabilities.homeWin).toBe(0.5);
    expect(afterKickoff.changed).toBe(false);
    expect(afterKickoff.snapshots[match.id]).toEqual(second.snapshots[match.id]);
  });

  it('round-trips valid snapshots and rejects corrupt persisted data', () => {
    const storage = memoryStorage();
    const captured = capturePreMatchPredictionSnapshots({
      snapshots: {},
      matches: [match],
      predictions: { [match.id]: prediction },
      now: Date.parse('2026-07-01T15:59:00.000Z'),
    });

    persistPreMatchPredictionSnapshots(storage, captured.snapshots);
    expect(loadPreMatchPredictionSnapshots(storage)).toEqual(captured.snapshots);

    storage.setItem('world-cup-2026-pre-match-predictions-v1', '{"bad":true}');
    expect(loadPreMatchPredictionSnapshots(storage)).toEqual({});
  });

  it('uses the actual capture time after an asynchronous provider lookup', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T16:00:01.000Z'));

    try {
      const captured = capturePreMatchPredictionSnapshotsNow({
        snapshots: {},
        matches: [match],
        predictions: { [match.id]: prediction },
      });

      expect(captured.changed).toBe(false);
      expect(captured.snapshots).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });
});
