import { describe, expect, it, vi } from 'vitest';
import type { MatchPrediction, PreMatchPredictionSnapshot } from '../../modules/sports/football/worldCup/types';
import {
  persistPredictionJobStatusToSupabase,
  persistPredictionSnapshotsToSupabase,
} from './supabasePredictionSnapshotRepository';

const snapshot: PreMatchPredictionSnapshot = {
  matchId: 'match-80',
  homeTeamId: 'england',
  awayTeamId: 'dr-congo',
  kickoff: '2026-07-01T16:00:00.000Z',
  capturedAt: '2026-07-01T15:59:30.000Z',
  prediction: {
    matchId: 'match-80',
    modelVersion: 'v2',
  } as MatchPrediction,
};

describe('persistPredictionSnapshotsToSupabase', () => {
  it('upserts snapshots through the private service-role boundary', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

    await persistPredictionSnapshotsToSupabase([snapshot], {
      supabaseUrl: 'https://project.supabase.co/',
      serviceRoleKey: 'server-secret',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/world_cup_prediction_snapshots?on_conflict=match_id',
      {
        method: 'POST',
        headers: {
          apikey: 'server-secret',
          Authorization: 'Bearer server-secret',
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify([{
          match_id: snapshot.matchId,
          home_team_id: snapshot.homeTeamId,
          away_team_id: snapshot.awayTeamId,
          kickoff: snapshot.kickoff,
          captured_at: snapshot.capturedAt,
          prediction: snapshot.prediction,
        }]),
      },
    );
  });

  it('upserts the singleton job health status without exposing secrets', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

    await persistPredictionJobStatusToSupabase({
      status: 'success',
      checkedAt: '2026-07-01T14:27:00.000Z',
      source: 'openfootball',
      snapshotsWritten: 12,
      message: 'Prediction snapshot job completed.',
    }, {
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'server-secret',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/world_cup_prediction_job_status?on_conflict=id',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify([{
          id: 'snapshot-job',
          status: 'success',
          checked_at: '2026-07-01T14:27:00.000Z',
          source: 'openfootball',
          snapshots_written: 12,
          evidence_written: 0,
          message: 'Prediction snapshot job completed.',
          updated_at: '2026-07-01T14:27:00.000Z',
        }]),
      }),
    );
  });
});
