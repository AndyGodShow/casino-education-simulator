import { describe, expect, it, vi } from 'vitest';
import {
  buildWorldCupStrategyResearchSnapshot,
  handleWorldCupStrategyResearchRequest,
} from './strategyResearchEndpoint';

const header = 'date,home_team,away_team,home_score,away_score,tournament,city,country,neutral';

const historicalCsv = (count: number) => [
  header,
  ...Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10);
    const even = index % 2 === 0;
    return [
      date,
      even ? 'Alpha' : 'Beta',
      even ? 'Beta' : 'Alpha',
      even ? 3 : 0,
      even ? 0 : 2,
      index % 3 === 0 ? 'FIFA World Cup' : 'Continental Championship',
      'Test City',
      'Test Country',
      'TRUE',
    ].join(',');
  }),
].join('\n');

describe('World Cup strategy research endpoint', () => {
  it('builds an audited report from chronological public results', () => {
    const snapshot = buildWorldCupStrategyResearchSnapshot(
      historicalCsv(240),
      '2026-07-02T12:00:00.000Z',
    );

    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.source).toBe('martj42-international-results');
    expect(snapshot.audit.acceptedRows).toBe(240);
    expect(snapshot.report.splits.validation.sampleSize).toBe(60);
    expect(snapshot.report.splits.holdout.sampleSize).toBe(60);
    expect(snapshot.teamRatings.alpha).toMatchObject({
      teamId: 'alpha',
      teamName: 'Alpha',
      matches: 240,
    });
    expect(snapshot.teamRatings.beta?.elo).toBeTypeOf('number');
  });

  it('serves only a compact cacheable research snapshot', async () => {
    const response = await handleWorldCupStrategyResearchRequest(
      new Request('https://example.test/api/world-cup/research'),
      {
        now: () => new Date('2026-07-02T12:00:00.000Z'),
        loadCsv: async () => historicalCsv(180),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, s-maxage=21600, stale-while-revalidate=86400',
    );
    const body = await response.json();
    expect(body).toMatchObject({
      schemaVersion: 2,
      source: 'martj42-international-results',
      audit: { acceptedRows: 180 },
    });
    expect(JSON.stringify(body).length).toBeLessThan(10_000);
  });

  it('rejects unsupported methods and sanitizes source failures', async () => {
    const methodResponse = await handleWorldCupStrategyResearchRequest(
      new Request('https://example.test/api/world-cup/research', { method: 'POST' }),
    );
    expect(methodResponse.status).toBe(405);

    const failureResponse = await handleWorldCupStrategyResearchRequest(
      new Request('https://example.test/api/world-cup/research'),
      {
        loadCsv: async () => {
          throw new Error('private upstream detail');
        },
      },
    );
    expect(failureResponse.status).toBe(502);
    expect(await failureResponse.text()).not.toContain('private upstream detail');
  });

  it('rejects query parameters without loading research data or permitting caching', async () => {
    const loadCsv = vi.fn(async () => historicalCsv(180));
    const response = await handleWorldCupStrategyResearchRequest(
      new Request('https://example.test/api/world-cup/research?reaudit_nonce=random'),
      { loadCsv },
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Query parameters are not supported.',
    });
    expect(loadCsv).not.toHaveBeenCalled();
  });
});
