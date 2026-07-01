import type { PreMatchPredictionSnapshot } from '../../modules/sports/football/worldCup/types';

type SupabasePredictionSnapshotRepositoryConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetcher?: typeof fetch;
};

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

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
