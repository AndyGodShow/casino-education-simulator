import {
  buildCausalRatingTimeline,
  buildCausalTeamRatings,
} from '../../modules/sports/football/worldCup/research/causalTeamRatings';
import {
  parseInternationalResultsCsv,
} from '../../modules/sports/football/worldCup/research/internationalResults';
import {
  optimizeWorldCupStrategy,
  strategyOptimizationSamplesFromTimeline,
} from '../../modules/sports/football/worldCup/research/walkForwardOptimizer';
import type { WorldCupStrategyResearchSnapshot } from '../../modules/sports/football/worldCup/research/strategyResearchSnapshot';
import {
  projectStrategyTeamRatings,
} from '../../modules/sports/football/worldCup/research/strategyTeamRatings';

const HISTORICAL_RESULTS_URLS = [
  'https://raw.githubusercontent.com/martj42/international_results/master/results.csv',
  'https://cdn.jsdelivr.net/gh/martj42/international_results@master/results.csv',
];
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

export function buildWorldCupStrategyResearchSnapshot(
  csv: string,
  generatedAt: string,
): WorldCupStrategyResearchSnapshot {
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
    schemaVersion: 2,
    generatedAt,
    source: 'martj42-international-results',
    sourceUrl: HISTORICAL_RESULTS_URLS[0],
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

  try {
    const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const csv = await (dependencies.loadCsv ?? loadHistoricalResultsCsv)();
    const snapshot = buildWorldCupStrategyResearchSnapshot(csv, generatedAt);
    return jsonResponse(snapshot, 200, CACHE_CONTROL);
  } catch {
    return jsonResponse({
      ok: false,
      error: 'World Cup strategy research is temporarily unavailable.',
    }, 502);
  }
}
