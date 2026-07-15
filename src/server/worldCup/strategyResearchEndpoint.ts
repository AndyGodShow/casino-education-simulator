import {
  buildCausalRatingTimeline,
  buildCausalTeamRatings,
  WORLD_CUP_CAUSAL_RATING_CONFIG,
} from '../../modules/sports/football/worldCup/research/causalTeamRatings';
import {
  parseInternationalResultsCsv,
} from '../../modules/sports/football/worldCup/research/internationalResults';
import {
  optimizeWorldCupStrategy,
  strategyOptimizationSamplesFromTimeline,
  WORLD_CUP_STRATEGY_RESEARCH_CONFIG,
} from '../../modules/sports/football/worldCup/research/walkForwardOptimizer';
import { WORLD_CUP_MODEL_CONFIG } from '../../modules/sports/football/worldCup/logic/modelConfig';
import type { WorldCupStrategyResearchSnapshot } from '../../modules/sports/football/worldCup/research/strategyResearchSnapshot';
import {
  WORLD_CUP_RESEARCH_ALGORITHM_VERSION,
  WORLD_CUP_RESEARCH_DATASET_REVISION,
  WORLD_CUP_RESEARCH_SOURCE_URLS,
} from '../../modules/sports/football/worldCup/research/strategyResearchSnapshot';
import {
  projectStrategyTeamRatings,
} from '../../modules/sports/football/worldCup/research/strategyTeamRatings';

const HISTORICAL_RESULTS_URLS = WORLD_CUP_RESEARCH_SOURCE_URLS;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CSV_BYTES = 6_000_000;
const CACHE_CONTROL = 'public, s-maxage=21600, stale-while-revalidate=86400';

type StrategyResearchEndpointDependencies = {
  now?: () => Date;
  loadCsv?: () => Promise<string>;
};

const fetchCsv = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/csv,text/plain;q=0.9' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_CSV_BYTES) throw new Error('response exceeds size limit');
    const csv = await response.text();
    if (new TextEncoder().encode(csv).byteLength > MAX_CSV_BYTES) {
      throw new Error('response exceeds size limit');
    }
    return csv;
  } finally {
    clearTimeout(timeout);
  }
};

const loadHistoricalResultsCsv = async () => {
  const errors: string[] = [];
  for (const url of HISTORICAL_RESULTS_URLS) {
    try {
      return await fetchCsv(url);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`Historical results unavailable: ${errors.join('; ')}`);
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, child]) => [key, canonicalize(child)]));
};

const sha256 = async (value: string) => {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

const defaultResearchModelIdentity = () => ({
  applicationModel: WORLD_CUP_MODEL_CONFIG,
  causalRating: WORLD_CUP_CAUSAL_RATING_CONFIG,
  strategyResearch: WORLD_CUP_STRATEGY_RESEARCH_CONFIG,
});

export const hashWorldCupResearchModelConfig = async (
  identity: unknown = defaultResearchModelIdentity(),
) => sha256(JSON.stringify(canonicalize(identity)));

export async function buildWorldCupStrategyResearchSnapshot(
  csv: string,
  generatedAt: string,
): Promise<WorldCupStrategyResearchSnapshot> {
  const evaluationTimeMs = Date.parse(generatedAt);
  const dataset = parseInternationalResultsCsv(csv, {
    evaluationTimeMs,
    retrievedAt: generatedAt,
  });
  const timeline = buildCausalRatingTimeline(dataset.results);
  const report = optimizeWorldCupStrategy(strategyOptimizationSamplesFromTimeline(timeline));
  const teamRatings = projectStrategyTeamRatings(
    buildCausalTeamRatings(dataset.results, evaluationTimeMs),
  );

  return {
    schemaVersion: 3,
    generatedAt,
    source: 'martj42-international-results',
    sourceUrl: HISTORICAL_RESULTS_URLS[0],
    provenance: {
      datasetRevision: WORLD_CUP_RESEARCH_DATASET_REVISION,
      datasetSha256: await sha256(csv),
      researchAlgorithmVersion: WORLD_CUP_RESEARCH_ALGORITHM_VERSION,
      modelConfigSha256: await hashWorldCupResearchModelConfig(),
    },
    audit: dataset.audit,
    report,
    teamRatings,
  };
}

const jsonResponse = (body: unknown, status: number, cacheControl = 'no-store') => Response.json(body, {
  status,
  headers: {
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  },
});

export async function handleWorldCupStrategyResearchRequest(
  request: Request,
  dependencies: StrategyResearchEndpointDependencies = {},
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
    });
  }

  if (new URL(request.url).search.length > 0) {
    return jsonResponse({
      ok: false,
      error: 'Query parameters are not supported.',
    }, 400);
  }

  try {
    const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const csv = await (dependencies.loadCsv ?? loadHistoricalResultsCsv)();
    const snapshot = await buildWorldCupStrategyResearchSnapshot(csv, generatedAt);
    return jsonResponse(snapshot, 200, CACHE_CONTROL);
  } catch {
    return jsonResponse({
      ok: false,
      error: 'World Cup strategy research is temporarily unavailable.',
    }, 502);
  }
}
