import {
  loadFixturesWithFallback,
  type FixtureProviderResult,
} from '../../dataProviders/football/fixtureProvider';
import {
  adaptWorldCupFixtures,
  type WorldCupAdapterResult,
} from '../../dataProviders/football/worldCupAdapter';
import {
  PUBLIC_WORLD_CUP_MAX_MATCHES,
  PUBLIC_WORLD_CUP_SNAPSHOT_SCHEMA_VERSION,
  type PublicWorldCupSnapshot,
} from '../../modules/sports/football/worldCup/data/publicWorldCupSnapshot';
import {
  loadWorldCupMarketReferences,
  type WorldCupMarketReferenceLoadResult,
} from '../../modules/sports/football/worldCup/market/polymarketAdapter';

type PublicWorldCupDataDependencies = {
  now?: () => Date;
  loadFixtureResult?: () => Promise<FixtureProviderResult>;
  loadMarkets?: (
    matches: WorldCupAdapterResult['matches'],
    teams: WorldCupAdapterResult['teams'],
  ) => Promise<WorldCupMarketReferenceLoadResult>;
};

const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

const jsonResponse = (body: unknown, status: number, cacheControl = 'no-store') => Response.json(body, {
  status,
  headers: {
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  },
});

const isVerifiedProvider = (result: FixtureProviderResult) =>
  result.source !== 'sample'
  && result.source !== 'local'
  && result.fixtures.length > 0
  && result.fixtures.length <= PUBLIC_WORLD_CUP_MAX_MATCHES;

export async function loadPublicWorldCupSnapshot(
  dependencies: PublicWorldCupDataDependencies = {},
): Promise<PublicWorldCupSnapshot> {
  const fixtureResult = await (dependencies.loadFixtureResult ?? loadFixturesWithFallback)();
  if (!isVerifiedProvider(fixtureResult)) {
    throw new Error('Verified World Cup provider data is unavailable.');
  }

  const adapterResult = adaptWorldCupFixtures(fixtureResult);
  const marketLoad = await (dependencies.loadMarkets ?? loadWorldCupMarketReferences)(
    adapterResult.matches,
    adapterResult.teams,
  );
  const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString();

  return {
    schemaVersion: PUBLIC_WORLD_CUP_SNAPSHOT_SCHEMA_VERSION,
    generatedAt,
    adapterResult: {
      ...adapterResult,
      errors: [...adapterResult.errors, ...marketLoad.errors],
    },
    markets: marketLoad.markets,
    provenance: {
      delivery: 'server',
      fixture: {
        source: adapterResult.source,
        providerName: adapterResult.providerName,
        retrievedAt: generatedAt,
      },
      market: {
        source: 'polymarket',
        retrievedAt: generatedAt,
        matchedMatches: Object.keys(marketLoad.markets).length,
      },
    },
  };
}

export async function handlePublicWorldCupDataRequest(
  request: Request,
  dependencies: PublicWorldCupDataDependencies = {},
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response(null, {
      status: 405,
      headers: {
        Allow: 'GET',
        'Cache-Control': 'no-store',
      },
    });
  }

  try {
    return jsonResponse(await loadPublicWorldCupSnapshot(dependencies), 200, CACHE_CONTROL);
  } catch {
    return jsonResponse({
      ok: false,
      error: 'Verified World Cup provider data is unavailable.',
    }, 502);
  }
}

