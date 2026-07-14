import type { PreMatchPredictionSnapshot } from '../../modules/sports/football/worldCup/types';
import type { WorldCupStrategyResearchState } from '../../modules/sports/football/worldCup/domain/WorldCupDomainModel';
import { fetchWithTimeout } from '../http/fetchWithTimeout';
import {
  parseWorldCupStrategyResearchSnapshot,
  strategyResearchStateFromSnapshot,
} from '../../modules/sports/football/worldCup/research/strategyResearchSnapshot';
import { runPublicWorldCupEvidenceJob } from './publicEvidenceJob';
import {
  persistPublicEvidenceToSupabase,
  type PublicEvidenceRecord,
} from './publicEvidenceRepository';
import {
  persistPredictionJobStatusToSupabase,
  persistPredictionSnapshotsToSupabase,
  type PredictionJobStatus,
} from './supabasePredictionSnapshotRepository';

type PredictionSnapshotEndpointConfig = {
  cronSecret: string;
  supabaseUrl: string;
  serviceRoleKey: string;
};

type PredictionSnapshotJobResult = {
  source: string;
  written: number;
  evidenceWritten: number;
  predictionInput: 'historical_elo' | 'baseline' | 'skipped_research_unavailable';
};

type PredictionSnapshotJobRunner = (input: {
  persistSnapshots: (snapshots: PreMatchPredictionSnapshot[]) => Promise<void>;
  persistEvidence: (records: PublicEvidenceRecord[]) => Promise<void>;
  loadStrategyResearch: () => Promise<WorldCupStrategyResearchState>;
}) => Promise<PredictionSnapshotJobResult>;

type PredictionSnapshotEndpointDependencies = {
  runJob?: PredictionSnapshotJobRunner;
  loadStrategyResearch?: () => Promise<WorldCupStrategyResearchState>;
  recordStatus?: (status: PredictionJobStatus) => Promise<void>;
  fetchResearch?: typeof fetch;
  researchTimeoutMs?: number;
  now?: () => Date;
};

const RESEARCH_TIMEOUT_MS = 12_000;

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

const loadPublicStrategyResearch = async (
  requestUrl: string,
  fetchResearch: typeof fetch,
  timeoutMs: number,
) => {
  const response = await fetchWithTimeout(
    new URL('/api/world-cup/research', requestUrl),
    { headers: { Accept: 'application/json' } },
    timeoutMs,
    fetchResearch,
  );
  if (!response.ok) throw new Error('Strategy research is unavailable.');
  const snapshot = parseWorldCupStrategyResearchSnapshot(await response.json());
  if (!snapshot) throw new Error('Strategy research payload is invalid.');
  return strategyResearchStateFromSnapshot(snapshot);
};

export async function handlePredictionSnapshotRequest(
  request: Request,
  config: PredictionSnapshotEndpointConfig,
  dependencies: PredictionSnapshotEndpointDependencies = {},
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
    return jsonResponse({ ok: false, error: 'Snapshot service is not configured.' }, 503);
  }

  const runJob = dependencies.runJob ?? runPublicWorldCupEvidenceJob;
  const recordStatus = dependencies.recordStatus ?? (
    (status: PredictionJobStatus) => persistPredictionJobStatusToSupabase(status, {
      supabaseUrl: config.supabaseUrl,
      serviceRoleKey: config.serviceRoleKey,
    })
  );
  const checkedAt = () => (dependencies.now ?? (() => new Date()))().toISOString();
  const recordStatusSafely = async (status: PredictionJobStatus) => {
    try {
      await recordStatus(status);
    } catch {
      // Health recording must not turn a completed snapshot write into a failed job.
    }
  };

  try {
    const result = await runJob({
      persistSnapshots: (snapshots) => persistPredictionSnapshotsToSupabase(snapshots, {
        supabaseUrl: config.supabaseUrl,
        serviceRoleKey: config.serviceRoleKey,
      }),
      persistEvidence: (records) => persistPublicEvidenceToSupabase(records, {
        supabaseUrl: config.supabaseUrl,
        serviceRoleKey: config.serviceRoleKey,
      }),
      loadStrategyResearch: dependencies.loadStrategyResearch
        ?? (() => loadPublicStrategyResearch(
          request.url,
          dependencies.fetchResearch ?? fetch,
          dependencies.researchTimeoutMs ?? RESEARCH_TIMEOUT_MS,
        )),
    });
    await recordStatusSafely({
      status: 'success',
      checkedAt: checkedAt(),
      source: result.source,
      snapshotsWritten: result.written,
      evidenceWritten: result.evidenceWritten,
      message: `World Cup evidence job completed with ${result.predictionInput} prediction inputs.`,
    });
    return jsonResponse({ ok: true, ...result }, 200);
  } catch {
    await recordStatusSafely({
      status: 'failure',
      checkedAt: checkedAt(),
      source: null,
      snapshotsWritten: 0,
      evidenceWritten: 0,
      message: 'World Cup evidence job failed.',
    });
    return jsonResponse({ ok: false, error: 'World Cup evidence job failed.' }, 502);
  }
}
