import type { PreMatchPredictionSnapshot } from '../types';
import { fetchWithTimeout } from '../../../../../server/http/fetchWithTimeout';
import { isPreMatchPredictionSnapshot } from './preMatchPredictionStore';

type CloudSnapshotRow = {
  match_id: unknown;
  home_team_id: unknown;
  away_team_id: unknown;
  kickoff: unknown;
  captured_at: unknown;
  prediction: unknown;
};

type CloudSnapshotConfig = {
  supabaseUrl: string;
  publishableKey: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_CLOUD_SNAPSHOT_TIMEOUT_MS = 3_000;

export const mergePreMatchPredictionSnapshots = (
  localSnapshots: Record<string, PreMatchPredictionSnapshot>,
  cloudSnapshots: Record<string, PreMatchPredictionSnapshot>,
) => {
  const merged = { ...localSnapshots };
  for (const [matchId, cloudSnapshot] of Object.entries(cloudSnapshots)) {
    const localSnapshot = merged[matchId];
    if (
      !localSnapshot
      || Date.parse(cloudSnapshot.capturedAt) < Date.parse(localSnapshot.capturedAt)
    ) {
      merged[matchId] = cloudSnapshot;
    }
  }
  return merged;
};

const CLOUD_SNAPSHOT_COLUMNS = [
  'match_id',
  'home_team_id',
  'away_team_id',
  'kickoff',
  'captured_at',
  'prediction',
].join(',');

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const isCloudSnapshotRow = (value: unknown): value is CloudSnapshotRow =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const rowToSnapshot = (row: CloudSnapshotRow): PreMatchPredictionSnapshot | null => {
  const snapshot = {
    matchId: row.match_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    kickoff: row.kickoff,
    capturedAt: row.captured_at,
    prediction: row.prediction,
  };

  return typeof snapshot.matchId === 'string'
    && isPreMatchPredictionSnapshot(snapshot, snapshot.matchId)
    ? snapshot
    : null;
};

export async function loadCloudPreMatchPredictionSnapshots(
  config: CloudSnapshotConfig,
): Promise<Record<string, PreMatchPredictionSnapshot>> {
  if (!config.supabaseUrl.startsWith('https://') || !config.publishableKey) {
    throw new Error('Cloud prediction snapshot configuration is incomplete.');
  }

  const endpoint = new URL(
    '/rest/v1/world_cup_prediction_snapshots',
    `${trimTrailingSlashes(config.supabaseUrl)}/`,
  );
  endpoint.searchParams.set('select', CLOUD_SNAPSHOT_COLUMNS);

  const response = await fetchWithTimeout(
    endpoint.toString(),
    {
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${config.publishableKey}`,
      },
    },
    config.timeoutMs ?? DEFAULT_CLOUD_SNAPSHOT_TIMEOUT_MS,
    config.fetcher ?? fetch,
  );
  if (!response.ok) {
    throw new Error(`Cloud prediction snapshot request failed (${response.status}).`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Cloud prediction snapshot response is invalid.');
  }

  const snapshots = payload.map((row) => (
    isCloudSnapshotRow(row) ? rowToSnapshot(row) : null
  ));
  if (snapshots.some((snapshot) => snapshot === null)) {
    throw new Error('Cloud prediction snapshot response contains invalid snapshot data.');
  }
  const validSnapshots = snapshots as PreMatchPredictionSnapshot[];

  return Object.fromEntries(
    validSnapshots.map((snapshot) => [snapshot.matchId, snapshot]),
  );
}
