export type PublicEvidenceRecord = {
  kind: 'fixture' | 'market';
  contentHash: string;
  matchId: string | null;
  source: string;
  capturedAt: string;
  sourceUpdatedAt: string | null;
  schemaVersion: number;
  payload: unknown;
};

type PublicEvidenceRepositoryConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetcher?: typeof fetch;
};

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const evidenceRow = (record: PublicEvidenceRecord) => ({
  kind: record.kind,
  content_hash: record.contentHash,
  match_id: record.matchId,
  source: record.source,
  captured_at: record.capturedAt,
  source_updated_at: record.sourceUpdatedAt,
  schema_version: record.schemaVersion,
  payload: record.payload,
});

export async function persistPublicEvidenceToSupabase(
  records: PublicEvidenceRecord[],
  config: PublicEvidenceRepositoryConfig,
) {
  if (records.length === 0) return;
  if (!config.supabaseUrl.startsWith('https://') || !config.serviceRoleKey) {
    throw new Error('Public evidence persistence is not configured.');
  }

  const endpoint = new URL(
    `${trimTrailingSlashes(config.supabaseUrl)}/rest/v1/world_cup_public_evidence`,
  );
  endpoint.searchParams.set('on_conflict', 'kind,content_hash');
  const response = await (config.fetcher ?? fetch)(endpoint.toString(), {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      'content-type': 'application/json',
      prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(records.map(evidenceRow)),
  });

  if (!response.ok) {
    throw new Error(`Public evidence persistence failed with status ${response.status}.`);
  }
}

