import type { PreMatchPredictionSnapshot } from '../../modules/sports/football/worldCup/types';

type SupabasePredictionSnapshotRepositoryConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetcher?: typeof fetch;
};

type SupabasePredictionJobStatusReaderConfig = {
  supabaseUrl: string;
  publishableKey: string;
  fetcher?: typeof fetch;
};

export type PredictionJobStatus = {
  status: 'success' | 'failure';
  checkedAt: string;
  source: string | null;
  snapshotsWritten: number;
  evidenceWritten?: number;
  message: string;
};

type PredictionJobStatusRow = {
  status: PredictionJobStatus['status'];
  checked_at: string;
  source: string | null;
  snapshots_written: number;
  evidence_written: number;
  message: string;
};

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const parsePredictionJobStatusRow = (value: unknown): PredictionJobStatusRow | null => {
  if (
    !isRecord(value)
    || (value.status !== 'success' && value.status !== 'failure')
    || typeof value.checked_at !== 'string'
    || !Number.isFinite(Date.parse(value.checked_at))
    || (value.source !== null && typeof value.source !== 'string')
    || !isNonNegativeInteger(value.snapshots_written)
    || !isNonNegativeInteger(value.evidence_written)
    || typeof value.message !== 'string'
  ) {
    return null;
  }
  return value as PredictionJobStatusRow;
};

export async function loadPredictionJobStatusFromSupabase(
  config: SupabasePredictionJobStatusReaderConfig,
): Promise<PredictionJobStatus | null> {
  if (!config.supabaseUrl.startsWith('https://') || !config.publishableKey) {
    throw new Error('Supabase prediction job status configuration is incomplete.');
  }

  const endpoint = new URL(
    '/rest/v1/world_cup_prediction_job_status',
    `${trimTrailingSlashes(config.supabaseUrl)}/`,
  );
  endpoint.searchParams.set('id', 'eq.snapshot-job');
  endpoint.searchParams.set(
    'select',
    'status,checked_at,source,snapshots_written,evidence_written,message',
  );
  endpoint.searchParams.set('limit', '1');

  const response = await (config.fetcher ?? fetch)(endpoint.toString(), {
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${config.publishableKey}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase prediction job status read failed (${response.status}).`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Supabase prediction job status payload is invalid.');
  }
  if (payload.length === 0) return null;
  const row = parsePredictionJobStatusRow(payload[0]);
  if (!row) throw new Error('Supabase prediction job status payload is invalid.');

  return {
    status: row.status,
    checkedAt: row.checked_at,
    source: row.source,
    snapshotsWritten: row.snapshots_written,
    evidenceWritten: row.evidence_written,
    message: row.message,
  };
}

export async function persistPredictionSnapshotsToSupabase(
  snapshots: PreMatchPredictionSnapshot[],
  config: SupabasePredictionSnapshotRepositoryConfig,
): Promise<void> {
  if (snapshots.length === 0) return;
  if (!config.supabaseUrl.startsWith('https://') || !config.serviceRoleKey) {
    throw new Error('Supabase prediction snapshot configuration is incomplete.');
  }

  const endpoint = new URL(
    '/rest/v1/world_cup_prediction_snapshots',
    `${trimTrailingSlashes(config.supabaseUrl)}/`,
  );
  endpoint.searchParams.set('on_conflict', 'match_id');

  const response = await (config.fetcher ?? fetch)(endpoint.toString(), {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(snapshots.map((snapshot) => ({
      match_id: snapshot.matchId,
      home_team_id: snapshot.homeTeamId,
      away_team_id: snapshot.awayTeamId,
      kickoff: snapshot.kickoff,
      captured_at: snapshot.capturedAt,
      prediction: snapshot.prediction,
    }))),
  });

  if (!response.ok) {
    throw new Error(`Supabase prediction snapshot write failed (${response.status}).`);
  }
}

export async function persistPredictionJobStatusToSupabase(
  status: PredictionJobStatus,
  config: SupabasePredictionSnapshotRepositoryConfig,
): Promise<void> {
  if (!config.supabaseUrl.startsWith('https://') || !config.serviceRoleKey) {
    throw new Error('Supabase prediction job status configuration is incomplete.');
  }

  const endpoint = new URL(
    '/rest/v1/world_cup_prediction_job_status',
    `${trimTrailingSlashes(config.supabaseUrl)}/`,
  );
  endpoint.searchParams.set('on_conflict', 'id');

  const response = await (config.fetcher ?? fetch)(endpoint.toString(), {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([{
      id: 'snapshot-job',
      status: status.status,
      checked_at: status.checkedAt,
      source: status.source,
      snapshots_written: status.snapshotsWritten,
      evidence_written: status.evidenceWritten ?? 0,
      message: status.message,
      updated_at: status.checkedAt,
    }]),
  });

  if (!response.ok) {
    throw new Error(`Supabase prediction job status write failed (${response.status}).`);
  }
}
