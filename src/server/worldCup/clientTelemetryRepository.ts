import type { ClientTelemetryEvent } from '../../observability/clientTelemetry';

export type ClientTelemetryRecord = {
  event: ClientTelemetryEvent;
  receivedAt: string;
  dedupeKey: string;
};

type ClientTelemetryRepositoryConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetcher?: typeof fetch;
};

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const telemetryRow = ({ event, receivedAt, dedupeKey }: ClientTelemetryRecord) => ({
  schema_version: event.schemaVersion,
  kind: event.kind,
  name: event.name,
  value: event.kind === 'web-vital' ? event.value : null,
  rating: event.kind === 'web-vital' ? event.rating : null,
  fingerprint: event.kind === 'runtime-error' ? event.fingerprint : null,
  route: event.route,
  navigation_type: event.navigationType,
  received_at: receivedAt,
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
    `${trimTrailingSlashes(config.supabaseUrl)}/rest/v1/world_cup_client_telemetry`,
  );
  endpoint.searchParams.set('on_conflict', 'dedupe_key');
  const response = await (config.fetcher ?? fetch)(endpoint.toString(), {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(records.map(telemetryRow)),
  });

  if (!response.ok) {
    throw new Error(`Client telemetry persistence failed with status ${response.status}.`);
  }
}
