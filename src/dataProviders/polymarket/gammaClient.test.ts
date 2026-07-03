import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchMarkets } from './gammaClient';

describe('gammaClient searchMarkets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the public search endpoint and preserves event identity', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        events: [
          {
            id: 'event-1',
            title: 'France vs Brazil',
            active: true,
            closed: false,
            markets: [{
              id: 'market-1',
              question: 'France vs Brazil winner',
              active: true,
              closed: false,
              outcomes: '["France","Draw","Brazil"]',
              clobTokenIds: '["home","draw","away"]',
              outcomePrices: '["0.5","0.25","0.25"]',
            }],
          },
        ],
      }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const markets = await searchMarkets('France Brazil world cup 2026 test');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/public-search?q=France%20Brazil%20world%20cup%202026%20test'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(markets).toEqual([
      expect.objectContaining({
        id: 'market-1',
        eventId: 'event-1',
        title: 'France vs Brazil winner',
      }),
    ]);
  });
});
