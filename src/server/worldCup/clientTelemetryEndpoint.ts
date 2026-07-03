import { parseClientTelemetryEvent } from '../../observability/clientTelemetry';
import {
  persistClientTelemetryToSupabase,
  type ClientTelemetryRecord,
} from './clientTelemetryRepository';

const MAX_BODY_BYTES = 2_048;
const DEDUPE_BUCKET_MS = 5 * 60 * 1_000;

type ClientTelemetryEndpointConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

type ClientTelemetryEndpointDependencies = {
  now?: () => Date;
  persist?: typeof persistClientTelemetryToSupabase;
};

const securityHeaders = (additional: HeadersInit = {}) => ({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  ...additional,
});

const emptyResponse = (status: number, headers: HeadersInit = {}) =>
  new Response(null, { status, headers: securityHeaders(headers) });

const errorResponse = (status: number, error: string, headers: HeadersInit = {}) =>
  Response.json(
    { ok: false, error },
    { status, headers: securityHeaders(headers) },
  );

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const dedupeBucket = (now: Date) =>
  new Date(Math.floor(now.getTime() / DEDUPE_BUCKET_MS) * DEDUPE_BUCKET_MS).toISOString();

const readBoundedBody = async (request: Request): Promise<string | null> => {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

const quantizeEvent = (
  event: NonNullable<ReturnType<typeof parseClientTelemetryEvent>>,
) => {
  if (event.kind === 'runtime-error') return event;
  const value = event.name === 'CLS'
    ? Math.round(event.value * 100) / 100
    : Math.round(event.value / 50) * 50;
  return { ...event, value };
};

const buildRecord = async (
  event: NonNullable<ReturnType<typeof parseClientTelemetryEvent>>,
  now: Date,
): Promise<ClientTelemetryRecord> => {
  const normalizedEvent = quantizeEvent(event);
  const bucketStart = dedupeBucket(now);
  const measurement = normalizedEvent.kind === 'web-vital'
    ? `${normalizedEvent.value}:${normalizedEvent.rating}`
    : normalizedEvent.fingerprint;
  return {
    event: normalizedEvent,
    receivedAt: now.toISOString(),
    bucketStart,
    dedupeKey: `sha256:${await sha256([
      normalizedEvent.schemaVersion,
      normalizedEvent.kind,
      normalizedEvent.name,
      normalizedEvent.route,
      normalizedEvent.navigationType,
      bucketStart,
      measurement,
    ].join(':'))}`,
  };
};

export async function handleClientTelemetryRequest(
  request: Request,
  config: ClientTelemetryEndpointConfig,
  dependencies: ClientTelemetryEndpointDependencies = {},
): Promise<Response> {
  if (request.method !== 'POST') {
    return emptyResponse(405, { Allow: 'POST' });
  }

  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return errorResponse(403, 'Client telemetry request is forbidden.');
  }

  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return errorResponse(415, 'Client telemetry requires application/json.');
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return errorResponse(413, 'Client telemetry payload is too large.');
  }

  let body: string | null;
  try {
    body = await readBoundedBody(request);
  } catch {
    return errorResponse(400, 'Invalid client telemetry.');
  }
  if (body === null) {
    return errorResponse(413, 'Client telemetry payload is too large.');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return errorResponse(400, 'Invalid client telemetry.');
  }
  const event = parseClientTelemetryEvent(payload);
  if (!event) {
    return errorResponse(400, 'Invalid client telemetry.');
  }

  try {
    const now = (dependencies.now ?? (() => new Date()))();
    const record = await buildRecord(event, now);
    await (dependencies.persist ?? persistClientTelemetryToSupabase)([record], config);
    return emptyResponse(202);
  } catch {
    return errorResponse(
      503,
      'Client telemetry is unavailable.',
      { 'Retry-After': '300' },
    );
  }
}
