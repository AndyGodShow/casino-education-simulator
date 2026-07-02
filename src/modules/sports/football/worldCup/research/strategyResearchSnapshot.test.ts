import { describe, expect, it } from 'vitest';
import type { WorldCupStrategyResearchSnapshot } from './strategyResearchSnapshot';
import {
  parseWorldCupStrategyResearchSnapshot,
  strategyResearchStateFromSnapshot,
} from './strategyResearchSnapshot';

const validSnapshot = (): WorldCupStrategyResearchSnapshot => ({
  schemaVersion: 2,
  generatedAt: '2026-07-02T12:00:00.000Z',
  source: 'martj42-international-results',
  sourceUrl: 'https://example.test/results.csv',
  audit: {
    totalRows: 240,
    acceptedRows: 240,
    rejectedRows: 0,
    rejectionReasons: {},
  },
  report: {
    status: 'applied',
    applied: true,
    reason: 'holdout passed',
    selectedCandidate: {
      id: 'assertive-320',
      eloScale: 320,
      drawBase: 0.18,
      drawCloseness: 0.12,
    },
    baseline: {
      id: 'baseline-v2',
      eloScale: 500,
      drawBase: 0.2,
      drawCloseness: 0.14,
    },
    splits: {
      training: { from: '2020-01-01', to: '2025-01-01', sampleSize: 120 },
      validation: { from: '2025-01-02', to: '2026-01-01', sampleSize: 60 },
      holdout: { from: '2026-01-02', to: '2026-07-01', sampleSize: 60 },
    },
    validation: {
      sampleSize: 60,
      brierScore: 0.42,
      logLoss: 0.74,
      accuracy: 0.68,
    },
    holdout: {
      sampleSize: 60,
      brierScore: 0.4,
      logLoss: 0.7,
      accuracy: 0.7,
      baselineBrierScore: 0.437,
      brierImprovement: 0.037,
      contexts: 5,
    },
  },
  teamRatings: {
    spain: {
      teamId: 'spain',
      teamName: 'Spain',
      asOf: '2026-07-02T12:00:00.000Z',
      matches: 300,
      elo: 1_920,
      evidenceWeight: 4.5,
      lastMatchDate: '2026-06-20',
      trustLevel: 'medium',
    },
  },
});

describe('parseWorldCupStrategyResearchSnapshot', () => {
  it('accepts a bounded deeply valid strategy snapshot', () => {
    expect(parseWorldCupStrategyResearchSnapshot(validSnapshot())).toEqual(validSnapshot());
  });

  it('rejects malformed rating evidence instead of partially trusting it', () => {
    const invalid = validSnapshot() as unknown as Record<string, unknown>;
    invalid.teamRatings = {
      spain: {
        ...(validSnapshot().teamRatings.spain),
        elo: Number.NaN,
      },
    };

    expect(parseWorldCupStrategyResearchSnapshot(invalid)).toBeNull();
  });

  it('rejects a report whose applied flag contradicts its status', () => {
    const invalid = validSnapshot();
    invalid.report = {
      ...invalid.report,
      status: 'rejected',
      applied: true,
    };

    expect(parseWorldCupStrategyResearchSnapshot(invalid)).toBeNull();
  });

  it('carries validated team ratings into the domain research state', () => {
    const state = strategyResearchStateFromSnapshot(validSnapshot());

    expect(state.teamRatings?.spain).toMatchObject({
      teamId: 'spain',
      elo: 1_920,
    });
  });
});
