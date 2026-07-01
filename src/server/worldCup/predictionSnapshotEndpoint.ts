import type { PreMatchPredictionSnapshot } from '../../modules/sports/football/worldCup/types';
import { runPredictionSnapshotJob } from './predictionSnapshotJob';
import { persistPredictionSnapshotsToSupabase } from './supabasePredictionSnapshotRepository';

type PredictionSnapshotEndpointConfig = {
  cronSecret: string;
  supabaseUrl: string;
  serviceRoleKey: string;
};

type PredictionSnapshotJobResult = {
  source: string;
  written: number;
};

type PredictionSnapshotJobRunner = (input: {
  persistSnapshots: (snapshots: PreMatchPredictionSnapshot[]) => Promise<void>;
}) => Promise<PredictionSnapshotJobResult>;

type PredictionSnapshotEndpointDependencies = {
  runJob?: PredictionSnapshotJobRunner;
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

export async function handlePredictionSnapshotRequest(
  request: Request,
  config: PredictionSnapshotEndpointConfig,
  dependencies: PredictionSnapshotEndpointDependencies = {},
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
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
    return jsonResponse({ ok: false, error: 'Snapshot service is not configured.' }, 503);
  }

  const runJob = dependencies.runJob ?? runPredictionSnapshotJob;
  try {
    const result = await runJob({
      persistSnapshots: (snapshots) => persistPredictionSnapshotsToSupabase(snapshots, {
        supabaseUrl: config.supabaseUrl,
        serviceRoleKey: config.serviceRoleKey,
      }),
    });
    return jsonResponse({ ok: true, ...result }, 200);
  } catch {
    return jsonResponse({ ok: false, error: 'Prediction snapshot job failed.' }, 502);
  }
}
