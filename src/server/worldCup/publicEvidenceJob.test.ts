import { afterEach, describe, expect, it, vi } from 'vitest';
import { adaptWorldCupFixtures } from '../../dataProviders/football/worldCupAdapter';
import { createSampleFixtureResult } from '../../dataProviders/football/fixtureProvider';
import type { PublicWorldCupSnapshot } from '../../modules/sports/football/worldCup/data/publicWorldCupSnapshot';
import type { WorldCupStrategyResearchState } from '../../modules/sports/football/worldCup/domain/WorldCupDomainModel';
import {
  buildPublicEvidenceRecords,
  runPublicWorldCupEvidenceJob,
} from './publicEvidenceJob';

const APPLICATION_REVISION = 'cccccccccccccccccccccccccccccccccccccccc';
const DATASET_REVISION = 'f73286079f8c6b48a59f8a16e895d757119dca71';
const DATASET_SHA256 = `sha256:${'a'.repeat(64)}`;
const MODEL_CONFIG_SHA256 = `sha256:${'b'.repeat(64)}`;

afterEach(() => {
  vi.unstubAllEnvs();
});

const snapshot = (): PublicWorldCupSnapshot => {
  const adapterResult = adaptWorldCupFixtures(createSampleFixtureResult());
  const verifiedAdapter = {
    ...adapterResult,
    source: 'openfootball' as const,
    providerName: 'OpenFootball',
    matches: adapterResult.matches.map((match) => ({
      ...match,
      source: 'openfootball' as const,
      kickoff: '2026-07-03T12:00:00.000Z',
      status: 'scheduled' as const,
      homeScore: undefined,
      awayScore: undefined,
    })),
  };
  const matchId = verifiedAdapter.matches[0].id;

  return {
    schemaVersion: 1,
    generatedAt: '2026-07-02T12:00:00.000Z',
    adapterResult: verifiedAdapter,
    markets: {
      [matchId]: {
        kind: 'real',
        source: 'polymarket',
        status: 'available',
        probabilities: { home: 0.5, draw: 0.25, away: 0.25 },
        auditable: true,
        confidence: 0.7,
        quality: 'high',
        lastUpdated: '2026-07-02T11:59:00.000Z',
        message: 'Public market reference.',
      },
    },
    provenance: {
      delivery: 'server',
      fixture: {
        source: 'openfootball',
        providerName: 'OpenFootball',
        retrievedAt: '2026-07-02T12:00:00.000Z',
      },
      market: {
        source: 'polymarket',
        retrievedAt: '2026-07-02T12:00:00.000Z',
        matchedMatches: 1,
      },
    },
  };
};

const appliedResearch = (): WorldCupStrategyResearchState => ({
  status: 'applied',
  generatedAt: '2026-07-02T12:00:00.000Z',
  acceptedRows: 49_000,
  candidateId: 'assertive-320',
  validationSampleSize: 60,
  holdoutSampleSize: 60,
  holdoutContexts: 5,
  brierImprovement: 0.037,
  message: 'research',
  provenance: {
    datasetRevision: DATASET_REVISION,
    datasetSha256: DATASET_SHA256,
    researchAlgorithmVersion: 'world-cup-walk-forward-v1',
    modelConfigSha256: MODEL_CONFIG_SHA256,
  },
  teamRatings: {
    canada: {
      teamId: 'canada',
      teamName: 'Canada',
      asOf: '2026-07-02T12:00:00.000Z',
      matches: 30,
      elo: 1_680,
      evidenceWeight: 4,
      lastMatchDate: '2026-06-20',
      trustLevel: 'medium',
    },
    mexico: {
      teamId: 'mexico',
      teamName: 'Mexico',
      asOf: '2026-07-02T12:00:00.000Z',
      matches: 40,
      elo: 1_760,
      evidenceWeight: 4.5,
      lastMatchDate: '2026-06-21',
      trustLevel: 'medium',
    },
  },
});

describe('public evidence job', () => {
  it('builds deterministic fixture and per-match market evidence', async () => {
    const first = await buildPublicEvidenceRecords(snapshot());
    const second = await buildPublicEvidenceRecords(snapshot());

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({
      kind: 'fixture',
      matchId: null,
      source: 'openfootball',
      schemaVersion: 1,
    });
    expect(first[1]).toMatchObject({
      kind: 'market',
      source: 'polymarket',
      sourceUpdatedAt: '2026-07-02T11:59:00.000Z',
    });
    expect(first[0]?.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('hashes evidence content independently from observation timestamps', async () => {
    const firstSnapshot = snapshot();
    const laterSnapshot = snapshot();
    laterSnapshot.generatedAt = '2026-07-02T12:05:00.000Z';
    laterSnapshot.provenance.fixture.retrievedAt = '2026-07-02T12:05:00.000Z';
    laterSnapshot.provenance.market.retrievedAt = '2026-07-02T12:05:00.000Z';

    const [firstFixture, firstMarket] = await buildPublicEvidenceRecords(firstSnapshot);
    const [laterFixture, laterMarket] = await buildPublicEvidenceRecords(laterSnapshot);

    expect(laterFixture?.contentHash).toBe(firstFixture?.contentHash);
    expect(laterMarket?.contentHash).toBe(firstMarket?.contentHash);
    expect(laterFixture?.capturedAt).not.toBe(firstFixture?.capturedAt);
    expect(laterMarket?.capturedAt).not.toBe(firstMarket?.capturedAt);
    expect(firstFixture?.payload).toMatchObject({
      provenance: { retrievedAt: '2026-07-02T12:00:00.000Z' },
    });
    expect(laterFixture?.payload).toMatchObject({
      provenance: { retrievedAt: '2026-07-02T12:05:00.000Z' },
    });
    expect(firstMarket?.payload).toMatchObject({
      provenance: { retrievedAt: '2026-07-02T12:00:00.000Z' },
    });
    expect(laterMarket?.payload).toMatchObject({
      provenance: { retrievedAt: '2026-07-02T12:05:00.000Z' },
    });

    const changedFixtureSnapshot = snapshot();
    changedFixtureSnapshot.adapterResult.matches = changedFixtureSnapshot.adapterResult.matches
      .map((match, index) => index === 0 ? { ...match, venue: 'Changed Venue' } : match);
    const [changedFixture, unchangedMarket] = await buildPublicEvidenceRecords(
      changedFixtureSnapshot,
    );
    expect(changedFixture?.contentHash).not.toBe(firstFixture?.contentHash);
    expect(unchangedMarket?.contentHash).toBe(firstMarket?.contentHash);

    const changedMarketSnapshot = snapshot();
    const [matchId] = Object.keys(changedMarketSnapshot.markets);
    if (!matchId) throw new Error('Expected a market fixture.');
    const market = changedMarketSnapshot.markets[matchId];
    if (!market) throw new Error('Expected market evidence.');
    changedMarketSnapshot.markets[matchId] = {
      ...market,
      probabilities: { home: 0.55, draw: 0.25, away: 0.2 },
    };
    const [unchangedFixture, changedMarket] = await buildPublicEvidenceRecords(
      changedMarketSnapshot,
    );
    expect(unchangedFixture?.contentHash).toBe(firstFixture?.contentHash);
    expect(changedMarket?.contentHash).not.toBe(firstMarket?.contentHash);
  });

  it('persists evidence and pre-match predictions from one snapshot', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', APPLICATION_REVISION);
    const persistEvidence = vi.fn(async () => undefined);
    const persistSnapshots = vi.fn(async () => undefined);

    const result = await runPublicWorldCupEvidenceJob({
      loadSnapshot: async () => snapshot(),
      loadStrategyResearch: async () => appliedResearch(),
      persistEvidence,
      persistSnapshots,
    });

    expect(result.source).toBe('openfootball');
    expect(result.evidenceWritten).toBe(2);
    expect(result.written).toBeGreaterThan(0);
    expect(result.predictionInput).toBe('historical_elo');
    expect(persistEvidence).toHaveBeenCalledOnce();
    expect(persistSnapshots).toHaveBeenCalledOnce();
    const predictions = persistSnapshots.mock.calls[0]?.[0] ?? [];
    expect(predictions.every((entry) => Date.parse(entry.capturedAt) < Date.parse(entry.kickoff))).toBe(true);
    expect(predictions[0]?.prediction.featureLayer?.home.advanced.elo).not.toBe(0);
    expect(predictions[0]?.provenance).toEqual({
      schemaVersion: 1,
      applicationRevision: APPLICATION_REVISION,
      modelVersion: 'v2',
      researchGeneratedAt: '2026-07-02T12:00:00.000Z',
      candidateId: 'assertive-320',
      datasetRevision: DATASET_REVISION,
      datasetSha256: DATASET_SHA256,
      modelConfigSha256: MODEL_CONFIG_SHA256,
    });
  });

  it('does not call prediction persistence when every match has kicked off', async () => {
    const completed = snapshot();
    completed.adapterResult.matches = completed.adapterResult.matches.map((match) => ({
      ...match,
      kickoff: '2026-07-01T12:00:00.000Z',
    }));
    const persistSnapshots = vi.fn(async () => undefined);

    const result = await runPublicWorldCupEvidenceJob({
      loadSnapshot: async () => completed,
      loadStrategyResearch: async () => appliedResearch(),
      persistEvidence: async () => undefined,
      persistSnapshots,
    });

    expect(result.written).toBe(0);
    expect(persistSnapshots).not.toHaveBeenCalled();
  });

  it('persists provider evidence but preserves prior predictions when research is unavailable', async () => {
    const persistEvidence = vi.fn(async () => undefined);
    const persistSnapshots = vi.fn(async () => undefined);

    const result = await runPublicWorldCupEvidenceJob({
      loadSnapshot: async () => snapshot(),
      loadStrategyResearch: async () => ({
        ...appliedResearch(),
        status: 'unavailable',
        teamRatings: undefined,
      }),
      persistEvidence,
      persistSnapshots,
    });

    expect(result).toMatchObject({
      evidenceWritten: 2,
      written: 0,
      predictionInput: 'skipped_research_unavailable',
    });
    expect(persistEvidence).toHaveBeenCalledOnce();
    expect(persistSnapshots).not.toHaveBeenCalled();
  });

  it.each([
    ['generatedAt', { generatedAt: null }],
    ['candidateId', { candidateId: null }],
    ['provenance', { provenance: undefined }],
  ])('rejects capture when applied research is missing %s', async (_field, override) => {
    const persistSnapshots = vi.fn(async () => undefined);

    await expect(runPublicWorldCupEvidenceJob({
      loadSnapshot: async () => snapshot(),
      loadStrategyResearch: async () => ({ ...appliedResearch(), ...override }),
      persistEvidence: async () => undefined,
      persistSnapshots,
    })).rejects.toThrow('Applied research prediction is missing provenance');
    expect(persistSnapshots).not.toHaveBeenCalled();
  });

  it('rejects a malformed present deployment revision instead of labeling it local', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'main');

    await expect(runPublicWorldCupEvidenceJob({
      loadSnapshot: async () => snapshot(),
      loadStrategyResearch: async () => appliedResearch(),
      persistEvidence: async () => undefined,
      persistSnapshots: async () => undefined,
    })).rejects.toThrow('valid model and research provenance');
  });
});
