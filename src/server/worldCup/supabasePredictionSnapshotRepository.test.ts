import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { MatchPrediction, PreMatchPredictionSnapshot } from '../../modules/sports/football/worldCup/types';
import {
  loadPredictionJobStatusFromSupabase,
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
  provenance: {
    schemaVersion: 1,
    applicationRevision: 'cccccccccccccccccccccccccccccccccccccccc',
    modelVersion: 'v2',
    researchGeneratedAt: '2026-06-30T08:00:00.000Z',
    candidateId: 'balanced-v1',
    datasetRevision: 'f73286079f8c6b48a59f8a16e895d757119dca71',
    datasetSha256: `sha256:${'a'.repeat(64)}`,
    modelConfigSha256: `sha256:${'b'.repeat(64)}`,
  },
};

describe('persistPredictionSnapshotsToSupabase', () => {
  it('reads and validates the singleton job health status', async () => {
    const fetcher = vi.fn(async () => Response.json([{
      status: 'success',
      checked_at: '2026-07-03T08:00:00.000Z',
      source: 'openfootball',
      snapshots_written: 12,
      evidence_written: 4,
      message: 'World Cup evidence job completed.',
    }]));

    await expect(loadPredictionJobStatusFromSupabase({
      supabaseUrl: 'https://project.supabase.co/',
      publishableKey: 'public-key',
      fetcher,
    })).resolves.toEqual({
      status: 'success',
      checkedAt: '2026-07-03T08:00:00.000Z',
      source: 'openfootball',
      snapshotsWritten: 12,
      evidenceWritten: 4,
      message: 'World Cup evidence job completed.',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/world_cup_prediction_job_status?id=eq.snapshot-job&select=status%2Cchecked_at%2Csource%2Csnapshots_written%2Cevidence_written%2Cmessage&limit=1',
      {
        headers: {
          apikey: 'public-key',
          Authorization: 'Bearer public-key',
          Accept: 'application/json',
        },
      },
    );
  });

  it('rejects malformed job health payloads', async () => {
    await expect(loadPredictionJobStatusFromSupabase({
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'public-key',
      fetcher: async () => Response.json([{
        status: 'success',
        checked_at: 'not-a-date',
      }]),
    })).rejects.toThrow('payload is invalid');
  });

  it('preserves the first snapshot when the match already exists', async () => {
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
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify([{
          match_id: snapshot.matchId,
          home_team_id: snapshot.homeTeamId,
          away_team_id: snapshot.awayTeamId,
          kickoff: snapshot.kickoff,
          captured_at: snapshot.capturedAt,
          prediction: snapshot.prediction,
          provenance: snapshot.provenance,
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

describe('prediction snapshot provenance migration', () => {
  it('adds nullable checked provenance without weakening immutable snapshot history', () => {
    const migrationPath = join(
      process.cwd(),
      'supabase/migrations/20260713120000_add_world_cup_prediction_provenance.sql',
    );

    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');
    const immutableMigration = readFileSync(join(
      process.cwd(),
      'supabase/migrations/20260704120000_lock_world_cup_prediction_snapshots.sql',
    ), 'utf8');

    expect(migration).toMatch(
      /alter table public\.world_cup_prediction_snapshots[\s\S]*add column(?: if not exists)? provenance jsonb(?!\s+not null)/i,
    );
    expect(migration).toMatch(/check\s*\([\s\S]*provenance is null[\s\S]*jsonb_typeof\(provenance\)\s*=\s*'object'/i);
    for (const field of [
      'schemaVersion',
      'applicationRevision',
      'modelVersion',
      'researchGeneratedAt',
      'candidateId',
      'datasetRevision',
      'datasetSha256',
      'modelConfigSha256',
    ]) {
      expect(migration).toMatch(new RegExp(`provenance\\s*->>?\\s*'${field}'`));
    }
    expect(migration).toMatch(/provenance\s*->>?\s*'schemaVersion'[\s\S]*=\s*'?1'?/i);
    expect(migration).toMatch(/provenance\s*->>?\s*'modelVersion'[\s\S]*=\s*'v2'/i);
    expect(migration).toMatch(
      /jsonb_typeof\(provenance\s*->\s*'datasetRevision'\)\s*=\s*'string'/i,
    );
    expect(migration).toMatch(/datasetSha256[\s\S]*sha256:/i);
    expect(migration).toMatch(/modelConfigSha256[\s\S]*sha256:/i);
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function|drop\s+trigger|create\s+trigger/i);
    expect(immutableMigration).toMatch(/before insert or update or delete/i);
    expect(immutableMigration).toContain(
      'A prediction snapshot is immutable after its first capture.',
    );
  });
});
