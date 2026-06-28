import { afterEach, describe, expect, it, vi } from 'vitest';

const jsonResponse = (body: unknown) => ({
  ok: true,
  json: async () => body,
}) as Response;

describe('openFootballProvider', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('maps OpenFootball final scores into provider fixtures', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('worldcup.json')) {
        return jsonResponse({
          matches: [
            {
              num: 1,
              team1: 'Mexico',
              team2: 'South Africa',
              date: '2026-06-11',
              time: '13:00 UTC-6',
              group: 'Group A',
              round: 'Matchday 1',
              ground: 'Mexico City',
              score: {
                ft: [2, 0],
              },
            },
          ],
        });
      }

      return jsonResponse({ teams: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { openFootballProvider } = await import('./openFootballProvider');
    const [fixture] = await openFootballProvider.fetchFixtures();

    expect(fixture.homeTeam).toBe('Mexico');
    expect(fixture.awayTeam).toBe('South Africa');
    expect(fixture.homeScore).toBe(2);
    expect(fixture.awayScore).toBe(0);
    expect(fixture.kickoff).toBe('2026-06-11T19:00:00.000Z');
  });

  it('tries a secondary fixture endpoint when the primary endpoint is unavailable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('raw.githubusercontent.com') && url.includes('worldcup.json')) {
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => ({}),
        } as Response;
      }
      if (url.includes('cdn.jsdelivr.net') && url.includes('worldcup.json')) {
        return jsonResponse({
          matches: [
            {
              num: 2,
              team1: 'Canada',
              team2: 'Qatar',
              datetime: '2026-06-12T00:00:00.000Z',
            },
          ],
        });
      }

      return jsonResponse({ teams: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { openFootballProvider } = await import('./openFootballProvider');
    const [fixture] = await openFootballProvider.fetchFixtures();

    expect(fixture.homeTeam).toBe('Canada');
    expect(fixture.awayTeam).toBe('Qatar');
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(expect.arrayContaining([
      expect.stringContaining('raw.githubusercontent.com'),
      expect.stringContaining('cdn.jsdelivr.net'),
    ]));
  });

  it('decodes GitHub contents API fixtures when CDN endpoints are unavailable', async () => {
    const encoded = btoa(JSON.stringify({
      matches: [
        {
          num: 4,
          team1: 'Japan',
          team2: 'Germany',
          datetime: '2026-06-13T00:00:00.000Z',
          score: {
            ft: [1, 1],
          },
        },
      ],
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.github.com') && url.includes('worldcup.json')) {
        return jsonResponse({
          encoding: 'base64',
          content: encoded,
        });
      }

      return {
        ok: false,
        status: 504,
        statusText: 'Gateway Timeout',
        json: async () => ({}),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { openFootballProvider } = await import('./openFootballProvider');
    const [fixture] = await openFootballProvider.fetchFixtures();

    expect(fixture.homeTeam).toBe('Japan');
    expect(fixture.awayTeam).toBe('Germany');
    expect(fixture.homeScore).toBe(1);
    expect(fixture.awayScore).toBe(1);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(expect.arrayContaining([
      expect.stringContaining('api.github.com'),
    ]));
  });

  it('hedges fixture endpoints so a stalled primary does not block a healthy mirror', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('raw.githubusercontent.com') && url.includes('worldcup.json')) {
          return new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          });
        }
        if (url.includes('cdn.jsdelivr.net') && url.includes('worldcup.json')) {
          return jsonResponse({
            matches: [
              {
                num: 5,
                team1: 'Spain',
                team2: 'Morocco',
                datetime: '2026-06-14T00:00:00.000Z',
              },
            ],
          });
        }

        return jsonResponse({ teams: [] });
      });
      vi.stubGlobal('fetch', fetchMock);

      const { openFootballProvider } = await import('./openFootballProvider');
      const fixturesPromise = openFootballProvider.fetchFixtures();
      await Promise.resolve();
      await Promise.resolve();

      expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(expect.arrayContaining([
        expect.stringContaining('raw.githubusercontent.com'),
        expect.stringContaining('cdn.jsdelivr.net'),
      ]));
      await expect(fixturesPromise).resolves.toEqual([
        expect.objectContaining({
          homeTeam: 'Spain',
          awayTeam: 'Morocco',
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('derives provider teams from fixtures when the teams endpoint fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('worldcup.json')) {
        return jsonResponse({
          matches: [
            {
              num: 3,
              team1: 'Mexico',
              team2: 'Canada',
              datetime: '2026-06-12T03:00:00.000Z',
            },
          ],
        });
      }

      throw new Error('teams endpoint timeout');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { openFootballProvider } = await import('./openFootballProvider');
    await expect(openFootballProvider.fetchFixtures()).resolves.toHaveLength(1);

    const teams = await openFootballProvider.fetchTeams();

    expect(teams.map((team) => team.name).sort()).toEqual(['Canada', 'Mexico']);
  });
});
