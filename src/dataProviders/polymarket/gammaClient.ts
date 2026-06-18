import { CACHE_TTL, getCached, setCached } from './cache';
import { filterActiveMarkets } from './guards';
import type { GammaMarket } from './types';

const GAMMA_BASE_URL = 'https://gamma-api.polymarket.com';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Polymarket Gamma request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function searchMarkets(query: string): Promise<GammaMarket[]> {
  const cacheKey = `gamma:search:${query}`;
  const cached = getCached<GammaMarket[]>(cacheKey);
  if (cached) return cached;
  const markets = await getJson<GammaMarket[]>(`${GAMMA_BASE_URL}/markets?search=${encodeURIComponent(query)}`);
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
