import type { ClientTelemetryEvent } from '../../observability/clientTelemetry';

export type ClientTelemetryRecord = {
  event: ClientTelemetryEvent;
  receivedAt: string;
  bucketStart: string;
  dedupeKey: string;
};

type ClientTelemetryRepositoryConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetcher?: typeof fetch;
};

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const telemetryRow = ({
  event,
  receivedAt,
  bucketStart,
  dedupeKey,
}: ClientTelemetryRecord) => ({
  schema_version: event.schemaVersion,
  kind: event.kind,
  name: event.name,
  value: event.kind === 'web-vital' ? event.value : null,
  rating: event.kind === 'web-vital' ? event.rating : null,
  fingerprint: event.kind === 'runtime-error' ? event.fingerprint : null,
  route: event.route,
  navigation_type: event.navigationType,
  received_at: receivedAt,
  bucket_start: bucketStart,
  dedupe_key: dedupeKey,
});

export async function persistClientTelemetryToSupabase(
  records: ClientTelemetryRecord[],
  config: ClientTelemetryRepositoryConfig,
): Promise<void> {
  if (records.length === 0) return;
  if (!config.supabaseUrl.startsWith('https://') || !config.serviceRoleKey) {
    throw new Error('Client telemetry persistence is not configured.');
  }

  const endpoint = new URL(
    `${trimTrailingSlashes(config.supabaseUrl)}/rest/v1/rpc/record_world_cup_client_telemetry`,
  );
  const response = await (config.fetcher ?? fetch)(endpoint.toString(), {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      telemetry_records: records.map(telemetryRow),
    }),
  });

  if (!response.ok) {
    throw new Error(`Client telemetry persistence failed with status ${response.status}.`);
  }
}

export async function pruneClientTelemetryInSupabase(
  config: ClientTelemetryRepositoryConfig,
): Promise<number> {
  if (!config.supabaseUrl.startsWith('https://') || !config.serviceRoleKey) {
    throw new Error('Client telemetry pruning is not configured.');
  }

  const endpoint = new URL(
    `${trimTrailingSlashes(config.supabaseUrl)}/rest/v1/rpc/prune_world_cup_client_telemetry`,
  );
  const response = await (config.fetcher ?? fetch)(endpoint.toString(), {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!response.ok) {
    throw new Error(`Client telemetry pruning failed with status ${response.status}.`);
  }

  const rowsPruned: unknown = await response.json();
  if (!Number.isSafeInteger(rowsPruned) || (rowsPruned as number) < 0) {
    throw new Error('Client telemetry pruning returned an invalid result.');
  }
  return rowsPruned as number;
}
