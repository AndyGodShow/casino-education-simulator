import type { DataTrustInfo } from '../../modules/core/trustLayer/dataTruth';

export type MarketProbability = {
  marketId: string;
  eventId?: string;
  title: string;
  outcome: string;
  tokenId?: string;
  price: number;
  impliedProbability: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  volume?: number;
  liquidity?: number;
  lastTradePrice?: number;
  updatedAt: string;
  status: 'active' | 'closed' | 'resolved' | 'stale' | 'unknown';
  source: 'polymarket';
  truth?: DataTrustInfo;
  quality?: MarketQuality;
  liquidityQuality?: number;
  spreadQuality?: number;
  freshness?: number;
  confidencePenalty?: number;
  confidence?: number;
};

export type MarketQuality = {
  score: number;
  level: 'low' | 'medium' | 'high';
  warnings: string[];
  liquidityQuality: number;
  spreadQuality: number;
  freshness: number;
  confidencePenalty: number;
};

export type GammaMarket = {
  id?: string;
  eventId?: string;
  conditionId?: string;
  slug?: string;
  question?: string;
  title?: string;
  active?: boolean;
  closed?: boolean;
  ended?: boolean;
  resolved?: boolean;
  acceptingOrders?: boolean;
  outcomes?: string[] | string;
  clobTokenIds?: string[] | string;
  outcomePrices?: string[] | string;
  volume?: number | string;
  liquidity?: number | string;
  updatedAt?: string;
};

export type GammaSearchResponse = {
  events?: Array<{
    id?: string;
    title?: string;
    active?: boolean;
    closed?: boolean;
    markets?: GammaMarket[];
  }>;
};

export type OrderBookSummary = {
  tokenId: string;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  updatedAt: string;
};

export type ClobOrderBook = {
  tokenId?: string;
  bids?: Array<{ price?: string | number; size?: string | number }>;
  asks?: Array<{ price?: string | number; size?: string | number }>;
  updatedAt?: string;
};
