import { describe, expect, it, vi } from 'vitest';
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
      }),
    );
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

  it('treats shared snapshots as authoritative while retaining local-only fallback rows', () => {
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
      [snapshot.matchId]: snapshot,
      [localOnly.matchId]: localOnly,
    });
  });

  it('keeps a newer valid local snapshot when the shared snapshot is older', () => {
    const olderCloud = {
      ...snapshot,
      capturedAt: '2026-07-01T15:58:00.000Z',
    };

    expect(mergePreMatchPredictionSnapshots(
      { [snapshot.matchId]: snapshot },
      { [snapshot.matchId]: olderCloud },
    )[snapshot.matchId]).toEqual(snapshot);
  });
});
