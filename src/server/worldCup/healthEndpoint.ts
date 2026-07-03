import {
  loadPredictionJobStatusFromSupabase,
  type PredictionJobStatus,
} from './supabasePredictionSnapshotRepository';

export const WORLD_CUP_JOB_STALE_AFTER_MS = 36 * 60 * 60 * 1_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1_000;

type WorldCupHealthEndpointConfig = {
  supabaseUrl: string;
  publishableKey: string;
};

type WorldCupHealthEndpointDependencies = {
  loadStatus?: () => Promise<PredictionJobStatus | null>;
  now?: () => Date;
};

type SnapshotJobCheckStatus = 'pass' | 'failure' | 'stale' | 'missing' | 'unavailable';

const jsonResponse = (body: unknown, status: number) => Response.json(body, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...(status === 503 ? { 'Retry-After': '300' } : {}),
  },
});

const responseBody = (
  status: 'healthy' | 'degraded' | 'unconfigured',
  checkedAt: string,
  configurationStatus: 'pass' | 'fail',
  snapshotJob: {
    status: SnapshotJobCheckStatus;
    lastCheckedAt: string | null;
    ageHours: number | null;
    source: string | null;
    snapshotsWritten: number;
    evidenceWritten: number;
  },
) => ({
  schemaVersion: 1,
  status,
  checkedAt,
  checks: {
    configuration: {
      status: configurationStatus,
    },
    snapshotJob,
  },
});

const unavailableJobCheck = (status: SnapshotJobCheckStatus) => ({
  status,
  lastCheckedAt: null,
  ageHours: null,
  source: null,
  snapshotsWritten: 0,
  evidenceWritten: 0,
});

export async function handleWorldCupHealthRequest(
  request: Request,
  config: WorldCupHealthEndpointConfig,
  dependencies: WorldCupHealthEndpointDependencies = {},
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
    });
  }

  const now = (dependencies.now ?? (() => new Date()))();
  const checkedAt = now.toISOString();
  if (!config.supabaseUrl.startsWith('https://') || !config.publishableKey) {
    return jsonResponse(responseBody(
      'unconfigured',
      checkedAt,
      'fail',
      unavailableJobCheck('unavailable'),
    ), 503);
  }

  try {
    const job = await (dependencies.loadStatus ?? (() =>
      loadPredictionJobStatusFromSupabase({
        supabaseUrl: config.supabaseUrl,
        publishableKey: config.publishableKey,
      })))();
    if (!job) {
      return jsonResponse(responseBody(
        'degraded',
        checkedAt,
        'pass',
        unavailableJobCheck('missing'),
      ), 503);
    }

    const ageMs = now.getTime() - Date.parse(job.checkedAt);
    const isFuture = ageMs < -MAX_FUTURE_CLOCK_SKEW_MS;
    const isStale = ageMs > WORLD_CUP_JOB_STALE_AFTER_MS;
    const jobStatus: SnapshotJobCheckStatus = job.status === 'failure'
      ? 'failure'
      : isFuture || isStale
        ? 'stale'
        : 'pass';
    const healthy = jobStatus === 'pass';
    return jsonResponse(responseBody(
      healthy ? 'healthy' : 'degraded',
      checkedAt,
      'pass',
      {
        status: jobStatus,
        lastCheckedAt: job.checkedAt,
        ageHours: Number((Math.max(0, ageMs) / 3_600_000).toFixed(2)),
        source: job.source,
        snapshotsWritten: job.snapshotsWritten,
        evidenceWritten: job.evidenceWritten ?? 0,
      },
    ), healthy ? 200 : 503);
  } catch {
    return jsonResponse(responseBody(
      'degraded',
      checkedAt,
      'pass',
      unavailableJobCheck('unavailable'),
    ), 503);
  }
}
