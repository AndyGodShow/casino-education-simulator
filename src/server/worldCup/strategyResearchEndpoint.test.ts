import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildWorldCupStrategyResearchSnapshot,
  hashWorldCupResearchModelConfig,
  handleWorldCupStrategyResearchRequest,
} from './strategyResearchEndpoint';
import { WORLD_CUP_CAUSAL_RATING_CONFIG } from '../../modules/sports/football/worldCup/research/causalTeamRatings';
import { WORLD_CUP_MODEL_CONFIG } from '../../modules/sports/football/worldCup/logic/modelConfig';
import { WORLD_CUP_STRATEGY_RESEARCH_CONFIG } from '../../modules/sports/football/worldCup/research/walkForwardOptimizer';

const header = 'date,home_team,away_team,home_score,away_score,tournament,city,country,neutral';
const PINNED_DATASET_REVISION = 'f73286079f8c6b48a59f8a16e895d757119dca71';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('World Cup strategy research endpoint', () => {
  it('builds an audited report with immutable research provenance', async () => {
    const snapshot = await buildWorldCupStrategyResearchSnapshot(
      historicalCsv(240),
      '2026-07-02T12:00:00.000Z',
    );

    expect(snapshot.schemaVersion).toBe(3);
    expect(snapshot.source).toBe('martj42-international-results');
    expect(snapshot.sourceUrl).toContain(PINNED_DATASET_REVISION);
    expect(snapshot.sourceUrl).not.toContain('master');
    expect(snapshot.provenance).toEqual({
      datasetRevision: PINNED_DATASET_REVISION,
      datasetSha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      researchAlgorithmVersion: 'world-cup-walk-forward-v1',
      modelConfigSha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
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

  it('keeps provenance hashes stable and changes only the dataset hash for one CSV byte', async () => {
    const csv = historicalCsv(240);
    const first = await buildWorldCupStrategyResearchSnapshot(
      csv,
      '2026-07-02T12:00:00.000Z',
    );
    const second = await buildWorldCupStrategyResearchSnapshot(
      csv,
      '2026-07-02T12:05:00.000Z',
    );
    const changedCsv = await buildWorldCupStrategyResearchSnapshot(
      `${csv}\n`,
      '2026-07-02T12:00:00.000Z',
    );

    expect(second.provenance.datasetSha256).toBe(first.provenance.datasetSha256);
    expect(second.provenance.modelConfigSha256).toBe(first.provenance.modelConfigSha256);
    expect(changedCsv.provenance.datasetSha256).not.toBe(first.provenance.datasetSha256);
    expect(changedCsv.provenance.modelConfigSha256).toBe(first.provenance.modelConfigSha256);
  });

  it('changes the model hash when either causal ratings or strategy calibration changes', async () => {
    const identity = {
      applicationModel: WORLD_CUP_MODEL_CONFIG,
      causalRating: WORLD_CUP_CAUSAL_RATING_CONFIG,
      strategyResearch: WORLD_CUP_STRATEGY_RESEARCH_CONFIG,
    };
    const baseline = await hashWorldCupResearchModelConfig(identity);
    const causalChanged = await hashWorldCupResearchModelConfig({
      ...identity,
      causalRating: { ...WORLD_CUP_CAUSAL_RATING_CONFIG, eloK: 25 },
    });
    const strategyChanged = await hashWorldCupResearchModelConfig({
      ...identity,
      strategyResearch: {
        ...WORLD_CUP_STRATEGY_RESEARCH_CONFIG,
        minimumBrierImprovement: 0.02,
      },
    });

    expect(causalChanged).not.toBe(baseline);
    expect(strategyChanged).not.toBe(baseline);
  });

  it('loads historical results only from pinned public source URLs', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('unavailable', { status: 502 }))
      .mockResolvedValue(new Response(historicalCsv(180), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await handleWorldCupStrategyResearchRequest(
      new Request('https://example.test/api/world-cup/research'),
      { now: () => new Date('2026-07-02T12:00:00.000Z') },
    );

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [input] of fetcher.mock.calls) {
      const sourceUrl = String(input);
      expect(sourceUrl).toContain(PINNED_DATASET_REVISION);
      expect(sourceUrl).not.toContain('master');
    }
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
      schemaVersion: 3,
      source: 'martj42-international-results',
      audit: { acceptedRows: 180 },
      provenance: {
        datasetRevision: PINNED_DATASET_REVISION,
        researchAlgorithmVersion: 'world-cup-walk-forward-v1',
      },
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
