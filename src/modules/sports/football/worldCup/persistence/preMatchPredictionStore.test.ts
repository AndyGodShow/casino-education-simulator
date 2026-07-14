import { describe, expect, it, vi } from 'vitest';
import type { MatchPrediction, WorldCupMatch } from '../types';
import {
  baselinePreMatchPredictionProvenance,
  capturePreMatchPredictionSnapshots,
  capturePreMatchPredictionSnapshotsNow,
  isPreMatchPredictionSnapshot,
  loadPreMatchPredictionSnapshots,
  migrateLegacyPreMatchPredictionSnapshot,
  persistPreMatchPredictionSnapshots,
} from './preMatchPredictionStore';

const APPLICATION_REVISION = 'cccccccccccccccccccccccccccccccccccccccc';
const DATASET_REVISION = 'f73286079f8c6b48a59f8a16e895d757119dca71';
const DATASET_SHA256 = `sha256:${'a'.repeat(64)}`;
const MODEL_CONFIG_SHA256 = `sha256:${'b'.repeat(64)}`;

const appliedProvenance = () => ({
  schemaVersion: 1 as const,
  applicationRevision: APPLICATION_REVISION,
  modelVersion: 'v2' as const,
  researchGeneratedAt: '2026-07-01T12:00:00.000Z',
  candidateId: 'assertive-320',
  datasetRevision: DATASET_REVISION,
  datasetSha256: DATASET_SHA256,
  modelConfigSha256: MODEL_CONFIG_SHA256,
});

const baselineProvenance = () => ({
  schemaVersion: 1 as const,
  applicationRevision: 'local',
  modelVersion: 'v2' as const,
  researchGeneratedAt: null,
  candidateId: null,
  datasetRevision: null,
  datasetSha256: null,
  modelConfigSha256: null,
});

const match: WorldCupMatch = {
  id: 'match-80',
  competitionId: 'world-cup-2026',
  stage: 'round32',
  homeTeamId: 'england',
  awayTeamId: 'dr-congo',
  kickoff: '2026-07-01T16:00:00.000Z',
  status: 'scheduled',
  source: 'openfootball',
  lastUpdated: '',
};

const prediction = {
  matchId: match.id,
  modelVersion: 'v2',
  confidence: 0.54,
  probabilities: { homeWin: 0.46, draw: 0.35, awayWin: 0.19 },
  decisionLayer: {
    expectedGoals: { home: 1.2, away: 0.8 },
  },
} as MatchPrediction;

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

describe('preMatchPredictionStore', () => {
  it('keeps the first prediction observed before kickoff and never overwrites it', () => {
    const first = capturePreMatchPredictionSnapshots({
      snapshots: {},
      matches: [match],
      predictions: { [match.id]: prediction },
      now: Date.parse('2026-07-01T15:58:00.000Z'),
      provenance: appliedProvenance(),
    });
    const updatedPrediction = {
      ...prediction,
      probabilities: { homeWin: 0.5, draw: 0.31, awayWin: 0.19 },
    };
    const second = capturePreMatchPredictionSnapshots({
      snapshots: first.snapshots,
      matches: [match],
      predictions: { [match.id]: updatedPrediction },
      now: Date.parse('2026-07-01T15:59:30.000Z'),
      provenance: {
        ...appliedProvenance(),
        applicationRevision: 'dddddddddddddddddddddddddddddddddddddddd',
        candidateId: 'different-candidate',
        datasetSha256: `sha256:${'d'.repeat(64)}`,
      },
    });
    const afterKickoff = capturePreMatchPredictionSnapshots({
      snapshots: second.snapshots,
      matches: [{ ...match, status: 'live' }],
      predictions: {
        [match.id]: {
          ...updatedPrediction,
          probabilities: { homeWin: 0.1, draw: 0.1, awayWin: 0.8 },
        },
      },
      now: Date.parse('2026-07-01T16:00:01.000Z'),
      provenance: baselineProvenance(),
    });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.snapshots[match.id].capturedAt).toBe('2026-07-01T15:58:00.000Z');
    expect(second.snapshots[match.id].prediction.probabilities.homeWin).toBe(0.46);
    expect(second.snapshots[match.id].provenance).toEqual(appliedProvenance());
    expect(afterKickoff.changed).toBe(false);
    expect(afterKickoff.snapshots[match.id]).toEqual(first.snapshots[match.id]);
  });

  it('attaches exact applied-research provenance to a new capture', () => {
    const captured = capturePreMatchPredictionSnapshots({
      snapshots: {},
      matches: [match],
      predictions: { [match.id]: prediction },
      now: Date.parse('2026-07-01T15:58:00.000Z'),
      provenance: appliedProvenance(),
    });

    expect(captured.snapshots[match.id].provenance).toEqual(appliedProvenance());
  });

  it('uses explicit null research provenance for a baseline capture', () => {
    const captured = capturePreMatchPredictionSnapshots({
      snapshots: {},
      matches: [match],
      predictions: { [match.id]: prediction },
      now: Date.parse('2026-07-01T15:58:00.000Z'),
      provenance: baselineProvenance(),
    });

    expect(captured.snapshots[match.id].provenance).toEqual(baselineProvenance());
  });

  it('rejects a malformed present application revision instead of rewriting it as local', () => {
    expect(baselinePreMatchPredictionProvenance('main').applicationRevision).toBe('main');
    expect(() => capturePreMatchPredictionSnapshots({
      snapshots: {},
      matches: [match],
      predictions: { [match.id]: prediction },
      now: Date.parse('2026-07-01T15:58:00.000Z'),
      provenance: {
        ...baselineProvenance(),
        applicationRevision: 'main',
      },
    })).toThrow('valid model and research provenance');
  });

  it('round-trips valid snapshots and rejects corrupt persisted data', () => {
    const storage = memoryStorage();
    const captured = capturePreMatchPredictionSnapshots({
      snapshots: {},
      matches: [match],
      predictions: { [match.id]: prediction },
      now: Date.parse('2026-07-01T15:59:00.000Z'),
      provenance: baselineProvenance(),
    });

    persistPreMatchPredictionSnapshots(storage, captured.snapshots);
    expect(loadPreMatchPredictionSnapshots(storage)).toEqual(captured.snapshots);

    storage.setItem('world-cup-2026-pre-match-predictions-v1', '{"bad":true}');
    expect(loadPreMatchPredictionSnapshots(storage)).toEqual({});
  });

  it('explicitly migrates a valid legacy local snapshot to baseline provenance', () => {
    const legacySnapshot = {
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      kickoff: match.kickoff,
      capturedAt: '2026-07-01T15:58:00.000Z',
      prediction,
    };

    const migrated = migrateLegacyPreMatchPredictionSnapshot(legacySnapshot, match.id);

    expect(migrated).toEqual({
      ...legacySnapshot,
      provenance: baselineProvenance(),
    });
  });

  it.each([
    ['applicationRevision', 'main'],
    ['datasetRevision', 'master'],
    ['datasetSha256', 'sha256:abc'],
    ['modelConfigSha256', `sha256:${'A'.repeat(64)}`],
  ] as const)('rejects malformed snapshot provenance %s=%s', (field, value) => {
    const captured = capturePreMatchPredictionSnapshots({
      snapshots: {},
      matches: [match],
      predictions: { [match.id]: prediction },
      now: Date.parse('2026-07-01T15:58:00.000Z'),
      provenance: appliedProvenance(),
    });
    const validSnapshot = captured.snapshots[match.id];
    const malformed = {
      ...validSnapshot,
      provenance: { ...validSnapshot.provenance, [field]: value },
    };

    expect(isPreMatchPredictionSnapshot(malformed, match.id)).toBe(false);
  });

  it('uses the actual capture time after an asynchronous provider lookup', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T16:00:01.000Z'));

    try {
      const captured = capturePreMatchPredictionSnapshotsNow({
        snapshots: {},
        matches: [match],
        predictions: { [match.id]: prediction },
        provenance: baselineProvenance(),
      });

      expect(captured.changed).toBe(false);
      expect(captured.snapshots).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });
});
