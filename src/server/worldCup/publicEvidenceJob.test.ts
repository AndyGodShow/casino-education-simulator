import { describe, expect, it, vi } from 'vitest';
import { adaptWorldCupFixtures } from '../../dataProviders/football/worldCupAdapter';
import { createSampleFixtureResult } from '../../dataProviders/football/fixtureProvider';
import type { PublicWorldCupSnapshot } from '../../modules/sports/football/worldCup/data/publicWorldCupSnapshot';
import {
  buildPublicEvidenceRecords,
  runPublicWorldCupEvidenceJob,
} from './publicEvidenceJob';

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

  it('persists evidence and pre-match predictions from one snapshot', async () => {
    const persistEvidence = vi.fn(async () => undefined);
    const persistSnapshots = vi.fn(async () => undefined);

    const result = await runPublicWorldCupEvidenceJob({
      loadSnapshot: async () => snapshot(),
      persistEvidence,
      persistSnapshots,
    });

    expect(result.source).toBe('openfootball');
    expect(result.evidenceWritten).toBe(2);
    expect(result.written).toBeGreaterThan(0);
    expect(persistEvidence).toHaveBeenCalledOnce();
    expect(persistSnapshots).toHaveBeenCalledOnce();
    const predictions = persistSnapshots.mock.calls[0]?.[0] ?? [];
    expect(predictions.every((entry) => Date.parse(entry.capturedAt) < Date.parse(entry.kickoff))).toBe(true);
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
      persistEvidence: async () => undefined,
      persistSnapshots,
    });

    expect(result.written).toBe(0);
    expect(persistSnapshots).not.toHaveBeenCalled();
  });
});
