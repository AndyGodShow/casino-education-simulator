import type { GammaMarket, MarketProbability } from './types';

const STALE_AFTER_MS = 15 * 60 * 1000;

export function isMarketActive(market: GammaMarket) {
  return Boolean(
    market.active !== false &&
    !market.closed &&
    !market.ended &&
    !market.resolved &&
    market.acceptingOrders !== false,
  );
}

function hasUsableTokenAndPrice(market: GammaMarket) {
  const tokens = parseJsonArray(market.clobTokenIds);
  const prices = parseJsonArray(market.outcomePrices);
  return tokens.length > 0 && prices.some((price) => Number.isFinite(Number(price)));
}

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

export function markStaleIfNeeded(market: MarketProbability, now = Date.now()): MarketProbability {
  const updatedAt = Date.parse(market.updatedAt);
  if (!Number.isFinite(updatedAt) || now - updatedAt > STALE_AFTER_MS || market.status === 'unknown') {
    return { ...market, status: 'stale' };
  }
  return market;
}

export const filterActiveMarkets = (markets: GammaMarket[]) =>
  markets.filter((market) => isMarketActive(market) && hasUsableTokenAndPrice(market));

export async function safeFetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 5000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}
