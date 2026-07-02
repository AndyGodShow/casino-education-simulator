import { CACHE_TTL, getCached, setCached } from './cache';
import { filterActiveMarkets, safeFetchJson } from './guards';
import type { GammaMarket, GammaSearchResponse } from './types';

const GAMMA_BASE_URL = 'https://gamma-api.polymarket.com';

async function getJson<T>(url: string): Promise<T> {
  return safeFetchJson<T>(url);
}

export async function searchMarkets(query: string): Promise<GammaMarket[]> {
  const cacheKey = `gamma:search:${query}`;
  const cached = getCached<GammaMarket[]>(cacheKey);
  if (cached) return cached;
  const response = await getJson<GammaSearchResponse>(
    `${GAMMA_BASE_URL}/public-search?q=${encodeURIComponent(query)}&limit_per_type=10`,
  );
  const markets = (response.events ?? []).flatMap((event) => (
    event.active === false || event.closed
      ? []
      : (event.markets ?? []).map((market) => ({
        ...market,
        eventId: event.id,
        title: market.title ?? market.question ?? event.title,
      }))
  ));
  setCached(cacheKey, markets, CACHE_TTL.gammaSearch);
  return markets;
}

export async function getEventBySlug(slug: string) {
  return getJson<unknown>(`${GAMMA_BASE_URL}/events/slug/${encodeURIComponent(slug)}`);
}

export async function getMarketBySlug(slug: string) {
  return getJson<GammaMarket>(`${GAMMA_BASE_URL}/markets/slug/${encodeURIComponent(slug)}`);
}

export { filterActiveMarkets };
