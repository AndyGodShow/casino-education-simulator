import { adaptGammaMarket } from './adapters';
import { getLastTradePrice, getMidpointPrice, getOrderBook, getPriceHistory, getSpread } from './clobClient';
import { filterActiveMarkets, searchMarkets } from './gammaClient';

export const polymarketClient = {
  async searchMarketProbabilities(query: string) {
    try {
      const markets = filterActiveMarkets(await searchMarkets(query));
      return markets.flatMap(adaptGammaMarket);
    } catch {
      return [];
    }
  },
  getOrderBook,
  getMidpointPrice,
  getSpread,
  getLastTradePrice,
  getPriceHistory,
};
