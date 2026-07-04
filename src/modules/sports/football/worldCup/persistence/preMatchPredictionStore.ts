import type {
  MatchPrediction,
  PreMatchPredictionSnapshot,
  WorldCupMatch,
} from '../types';

const PRE_MATCH_PREDICTION_STORAGE_KEY = 'world-cup-2026-pre-match-predictions-v1';

type PredictionSnapshotRecord = Record<string, PreMatchPredictionSnapshot>;

type SnapshotStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
};

type StoredSnapshots = {
  version: 1;
  snapshots: PredictionSnapshotRecord;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteProbability = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const isPrediction = (value: unknown, matchId: string): value is MatchPrediction => {
  if (!isRecord(value) || value.matchId !== matchId || value.modelVersion !== 'v2') return false;
  if (
    !isRecord(value.probabilities)
    || !isRecord(value.decisionLayer)
    || !isRecord(value.decisionLayer.expectedGoals)
  ) {
    return false;
  }
  if (
    value.featureLayer !== undefined
    && (
      !isRecord(value.featureLayer)
      || !isRecord(value.featureLayer.metadata)
      || !isRecord(value.featureLayer.metadata.inputCoverage)
      || typeof value.featureLayer.metadata.inputCoverage.overallRatio !== 'number'
    )
  ) {
    return false;
  }

  return (
    isFiniteProbability(value.probabilities.homeWin)
    && isFiniteProbability(value.probabilities.draw)
    && isFiniteProbability(value.probabilities.awayWin)
    && typeof value.confidence === 'number'
    && Number.isFinite(value.confidence)
    && typeof value.decisionLayer.expectedGoals.home === 'number'
    && Number.isFinite(value.decisionLayer.expectedGoals.home)
    && typeof value.decisionLayer.expectedGoals.away === 'number'
    && Number.isFinite(value.decisionLayer.expectedGoals.away)
  );
};

export const isPreMatchPredictionSnapshot = (
  value: unknown,
  matchId: string,
): value is PreMatchPredictionSnapshot => (
  isRecord(value)
  && value.matchId === matchId
  && typeof value.homeTeamId === 'string'
  && typeof value.awayTeamId === 'string'
  && typeof value.kickoff === 'string'
  && Number.isFinite(Date.parse(value.kickoff))
  && typeof value.capturedAt === 'string'
  && Number.isFinite(Date.parse(value.capturedAt))
  && Date.parse(value.capturedAt) < Date.parse(value.kickoff)
  && isPrediction(value.prediction, matchId)
);

export function loadPreMatchPredictionSnapshots(
  storage: SnapshotStorage,
): PredictionSnapshotRecord {
  try {
    const raw = storage.getItem(PRE_MATCH_PREDICTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.snapshots)) return {};

    const snapshots = Object.fromEntries(
      Object.entries(parsed.snapshots).filter(
        ([matchId, value]) => isPreMatchPredictionSnapshot(value, matchId),
      ),
    ) as PredictionSnapshotRecord;

    return Object.keys(snapshots).length === Object.keys(parsed.snapshots).length
      ? snapshots
      : {};
  } catch {
    return {};
  }
}

export function persistPreMatchPredictionSnapshots(
  storage: SnapshotStorage,
  snapshots: PredictionSnapshotRecord,
) {
  try {
    const payload: StoredSnapshots = { version: 1, snapshots };
    storage.setItem(PRE_MATCH_PREDICTION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Persistence may be unavailable in private or restricted browser contexts.
  }
}

type CapturePreMatchPredictionSnapshotsInput = {
  snapshots: PredictionSnapshotRecord;
  matches: WorldCupMatch[];
  predictions: Record<string, MatchPrediction>;
  now: number;
};

export function capturePreMatchPredictionSnapshots(input: CapturePreMatchPredictionSnapshotsInput) {
  let changed = false;
  const snapshots = { ...input.snapshots };

  for (const match of input.matches) {
    const kickoff = Date.parse(match.kickoff);
    const prediction = input.predictions[match.id];
    if (
      match.status !== 'scheduled'
      || !Number.isFinite(kickoff)
      || input.now >= kickoff
      || !prediction
      || snapshots[match.id]
    ) {
      continue;
    }

    snapshots[match.id] = {
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      kickoff: match.kickoff,
      capturedAt: new Date(input.now).toISOString(),
      prediction,
    };
    changed = true;
  }

  return { snapshots, changed };
}

export function capturePreMatchPredictionSnapshotsNow(
  input: Omit<CapturePreMatchPredictionSnapshotsInput, 'now'>,
) {
  return capturePreMatchPredictionSnapshots({
    ...input,
    now: Date.now(),
  });
}
