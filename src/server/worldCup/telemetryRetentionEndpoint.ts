import { pruneClientTelemetryInSupabase } from './clientTelemetryRepository';

type TelemetryRetentionEndpointConfig = {
  cronSecret: string;
  supabaseUrl: string;
  serviceRoleKey: string;
};

type TelemetryRetentionEndpointDependencies = {
  pruneTelemetry?: () => Promise<number>;
};

const jsonResponse = (body: unknown, status: number) => Response.json(body, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  },
});

const sha256 = async (value: string) => new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
);

const secretsMatch = async (provided: string, expected: string) => {
  const [providedHash, expectedHash] = await Promise.all([
    sha256(provided),
    sha256(expected),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= providedHash[index] ^ expectedHash[index];
  }
  return difference === 0;
};

export async function handleTelemetryRetentionRequest(
  request: Request,
  config: TelemetryRetentionEndpointConfig,
  dependencies: TelemetryRetentionEndpointDependencies = {},
): Promise<Response> {
  if (request.method !== 'POST' && request.method !== 'GET') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET, POST', 'Cache-Control': 'no-store' },
    });
  }

  if (
    !config.cronSecret
    || !await secretsMatch(
      request.headers.get('authorization') ?? '',
      `Bearer ${config.cronSecret}`,
    )
  ) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' }, 401);
  }

  if (!config.supabaseUrl || !config.serviceRoleKey) {
    return jsonResponse({
      ok: false,
      error: 'Telemetry retention service is not configured.',
    }, 503);
  }

  const pruneTelemetry = dependencies.pruneTelemetry ?? (
    () => pruneClientTelemetryInSupabase({
      supabaseUrl: config.supabaseUrl,
      serviceRoleKey: config.serviceRoleKey,
    })
  );

  try {
    const telemetryRowsPruned = await pruneTelemetry();
    if (!Number.isSafeInteger(telemetryRowsPruned) || telemetryRowsPruned < 0) {
      throw new Error('Telemetry retention returned an invalid result.');
    }
    return jsonResponse({ ok: true, telemetryRowsPruned }, 200);
  } catch {
    return jsonResponse({ ok: false, error: 'Telemetry retention failed.' }, 502);
  }
}
