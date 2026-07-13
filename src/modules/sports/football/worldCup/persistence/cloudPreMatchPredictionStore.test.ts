import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchPrediction, PreMatchPredictionSnapshot } from '../types';
import {
  loadCloudPreMatchPredictionSnapshots,
  mergePreMatchPredictionSnapshots,
} from './cloudPreMatchPredictionStore';

const snapshot: PreMatchPredictionSnapshot = {
  matchId: 'match-80',
  homeTeamId: 'england',
  awayTeamId: 'dr-congo',
  kickoff: '2026-07-01T16:00:00.000Z',
  capturedAt: '2026-07-01T15:59:30.000Z',
  prediction: {
    matchId: 'match-80',
    modelVersion: 'v2',
    confidence: 0.54,
    probabilities: { homeWin: 0.46, draw: 0.35, awayWin: 0.19 },
    decisionLayer: {
      expectedGoals: { home: 1.2, away: 0.8 },
    },
  } as MatchPrediction,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('loadCloudPreMatchPredictionSnapshots', () => {
  it('loads shared snapshots from the Supabase REST API', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{
      match_id: snapshot.matchId,
      home_team_id: snapshot.homeTeamId,
      away_team_id: snapshot.awayTeamId,
      kickoff: snapshot.kickoff,
      captured_at: snapshot.capturedAt,
      prediction: snapshot.prediction,
    }]), { status: 200 }));

    const result = await loadCloudPreMatchPredictionSnapshots({
      supabaseUrl: 'https://project.supabase.co/',
      publishableKey: 'public-key',
      fetcher,
    });

    expect(result).toEqual({ [snapshot.matchId]: snapshot });
    expect(fetcher).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/world_cup_prediction_snapshots?select=match_id%2Chome_team_id%2Caway_team_id%2Ckickoff%2Ccaptured_at%2Cprediction',
      expect.objectContaining({
        headers: {
          apikey: 'public-key',
          Authorization: 'Bearer public-key',
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('aborts a never-settling request after the default 3000 milliseconds', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      })
    ));

    const request = loadCloudPreMatchPredictionSnapshots({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'public-key',
      fetcher,
    });
    const rejection = request.catch((error: unknown) => error);
    const signal = fetcher.mock.calls[0]?.[1]?.signal;

    expect(signal).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await expect(rejection).resolves.toMatchObject({ name: 'AbortError' });
  });

  it('supports overriding the request timeout', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      })
    ));

    const request = loadCloudPreMatchPredictionSnapshots({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'public-key',
      fetcher,
      timeoutMs: 25,
    });
    const rejection = request.catch((error: unknown) => error);
    const signal = fetcher.mock.calls[0]?.[1]?.signal;

    expect(signal).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(24);
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await expect(rejection).resolves.toMatchObject({ name: 'AbortError' });
  });

  it('rejects malformed rows without exposing a partial shared history', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([
      {
        match_id: snapshot.matchId,
        home_team_id: snapshot.homeTeamId,
        away_team_id: snapshot.awayTeamId,
        kickoff: snapshot.kickoff,
        captured_at: snapshot.capturedAt,
        prediction: snapshot.prediction,
      },
      { match_id: 'corrupt' },
    ]), { status: 200 }));

    await expect(loadCloudPreMatchPredictionSnapshots({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'public-key',
      fetcher,
    })).rejects.toThrow('invalid snapshot data');
  });

  it('keeps the earliest local snapshot while retaining local-only fallback rows', () => {
    const olderLocal = {
      ...snapshot,
      capturedAt: '2026-07-01T15:58:00.000Z',
    };
    const localOnly = {
      ...snapshot,
      matchId: 'match-81',
      prediction: { ...snapshot.prediction, matchId: 'match-81' },
    };

    expect(mergePreMatchPredictionSnapshots(
      { [snapshot.matchId]: olderLocal, [localOnly.matchId]: localOnly },
      { [snapshot.matchId]: snapshot },
    )).toEqual({
      [snapshot.matchId]: olderLocal,
      [localOnly.matchId]: localOnly,
    });
  });

  it('uses an earlier shared snapshot instead of a later local snapshot', () => {
    const olderCloud = {
      ...snapshot,
      capturedAt: '2026-07-01T15:58:00.000Z',
    };

    expect(mergePreMatchPredictionSnapshots(
      { [snapshot.matchId]: snapshot },
      { [snapshot.matchId]: olderCloud },
    )[snapshot.matchId]).toEqual(olderCloud);
  });
});
