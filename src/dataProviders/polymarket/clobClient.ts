import { CACHE_TTL, getCached, setCached } from './cache';
import type { OrderBookSummary } from './types';

const CLOB_BASE_URL = 'https://clob.polymarket.com';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Polymarket CLOB request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function getOrderBook(tokenId: string): Promise<OrderBookSummary> {
  const cacheKey = `clob:book:${tokenId}`;
  const cached = getCached<OrderBookSummary>(cacheKey);
  if (cached) return cached;
  const book = await getJson<{ bids?: Array<{ price: string }>; asks?: Array<{ price: string }> }>(`${CLOB_BASE_URL}/book?token_id=${encodeURIComponent(tokenId)}`);
  const bestBid = book.bids?.[0] ? Number(book.bids[0].price) : undefined;
  const bestAsk = book.asks?.[0] ? Number(book.asks[0].price) : undefined;
  const summary = { tokenId, bestBid, bestAsk, spread: bestBid && bestAsk ? bestAsk - bestBid : undefined, updatedAt: new Date().toISOString() };
  setCached(cacheKey, summary, CACHE_TTL.orderBook);
  return summary;
}

export async function getMidpointPrice(tokenId: string) {
  const book = await getOrderBook(tokenId);
  return book.bestBid && book.bestAsk ? (book.bestBid + book.bestAsk) / 2 : undefined;
}

export async function getSpread(tokenId: string) {
  return (await getOrderBook(tokenId)).spread;
}

export async function getLastTradePrice(tokenId: string) {
  const cacheKey = `clob:last:${tokenId}`;
  const cached = getCached<number>(cacheKey);
  if (cached !== null) return cached;
  const data = await getJson<{ price?: string | number }>(`${CLOB_BASE_URL}/last-trade-price?token_id=${encodeURIComponent(tokenId)}`);
  const price = Number(data.price);
  setCached(cacheKey, price, CACHE_TTL.clobPrice);
  return Number.isFinite(price) ? price : undefined;
}

export async function getPriceHistory(tokenId: string) {
  return getJson<unknown>(`${CLOB_BASE_URL}/prices-history?market=${encodeURIComponent(tokenId)}`);
}
