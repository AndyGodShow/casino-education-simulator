import type {
  MatchPrediction,
  PreMatchPredictionProvenance,
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

const isRevision = (value: unknown) => (
  value === 'local' || (typeof value === 'string' && /^[a-f0-9]{40}$/.test(value))
);

const isSha256 = (value: unknown) => (
  typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
);

const isProvenance = (value: unknown): value is PreMatchPredictionProvenance => {
  if (
    !isRecord(value)
    || value.schemaVersion !== 1
    || !isRevision(value.applicationRevision)
    || value.modelVersion !== 'v2'
  ) return false;

  const researchFields = [
    value.researchGeneratedAt,
    value.candidateId,
    value.datasetRevision,
    value.datasetSha256,
    value.modelConfigSha256,
  ];
  if (researchFields.every((field) => field === null)) return true;

  return (
    typeof value.researchGeneratedAt === 'string'
    && Number.isFinite(Date.parse(value.researchGeneratedAt))
    && typeof value.candidateId === 'string'
    && value.candidateId.length > 0
    && typeof value.datasetRevision === 'string'
    && /^[a-f0-9]{40}$/.test(value.datasetRevision)
    && isSha256(value.datasetSha256)
    && isSha256(value.modelConfigSha256)
  );
};

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
  && isProvenance(value.provenance)
);

export function baselinePreMatchPredictionProvenance(
  applicationRevision: string,
): PreMatchPredictionProvenance {
  return {
    schemaVersion: 1,
    applicationRevision,
    modelVersion: 'v2',
    researchGeneratedAt: null,
    candidateId: null,
    datasetRevision: null,
    datasetSha256: null,
    modelConfigSha256: null,
  };
}

type AppliedResearchCaptureInput = {
  appliedTeams: number;
  researchGeneratedAt: string | null;
  candidateId: string | null;
  provenance?: {
    datasetRevision: string;
    datasetSha256: string;
    modelConfigSha256: string;
  };
};

export function preMatchPredictionProvenanceForCapture(
  applicationRevision: string,
  research?: AppliedResearchCaptureInput,
): PreMatchPredictionProvenance {
  if (!research || research.appliedTeams <= 0) {
    return baselinePreMatchPredictionProvenance(applicationRevision);
  }
  if (!research.researchGeneratedAt || !research.candidateId || !research.provenance) {
    throw new Error('Applied research prediction is missing provenance.');
  }
  return {
    schemaVersion: 1,
    applicationRevision,
    modelVersion: 'v2',
    researchGeneratedAt: research.researchGeneratedAt,
    candidateId: research.candidateId,
    datasetRevision: research.provenance.datasetRevision,
    datasetSha256: research.provenance.datasetSha256,
    modelConfigSha256: research.provenance.modelConfigSha256,
  };
}

export function migrateLegacyPreMatchPredictionSnapshot(
  value: unknown,
  matchId: string,
): PreMatchPredictionSnapshot | null {
  if (
    !isRecord(value)
    || 'provenance' in value
    || value.matchId !== matchId
    || typeof value.homeTeamId !== 'string'
    || typeof value.awayTeamId !== 'string'
    || typeof value.kickoff !== 'string'
    || !Number.isFinite(Date.parse(value.kickoff))
    || typeof value.capturedAt !== 'string'
    || !Number.isFinite(Date.parse(value.capturedAt))
    || Date.parse(value.capturedAt) >= Date.parse(value.kickoff)
    || !isPrediction(value.prediction, matchId)
  ) return null;

  return {
    matchId,
    homeTeamId: value.homeTeamId,
    awayTeamId: value.awayTeamId,
    kickoff: value.kickoff,
    capturedAt: value.capturedAt,
    prediction: value.prediction,
    provenance: baselinePreMatchPredictionProvenance('local'),
  };
}

export function loadPreMatchPredictionSnapshots(
  storage: SnapshotStorage,
): PredictionSnapshotRecord {
  try {
    const raw = storage.getItem(PRE_MATCH_PREDICTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.snapshots)) return {};

    const snapshots: PredictionSnapshotRecord = {};
    for (const [matchId, value] of Object.entries(parsed.snapshots)) {
      if (isPreMatchPredictionSnapshot(value, matchId)) {
        snapshots[matchId] = value;
        continue;
      }
      const migrated = migrateLegacyPreMatchPredictionSnapshot(value, matchId);
      if (!migrated) return {};
      snapshots[matchId] = migrated;
    }
    return snapshots;
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
  provenance: PreMatchPredictionProvenance;
  now: number;
};

export function capturePreMatchPredictionSnapshots(input: CapturePreMatchPredictionSnapshotsInput) {
  if (!isProvenance(input.provenance)) {
    throw new Error('Prediction capture requires valid model and research provenance.');
  }
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
      provenance: { ...input.provenance },
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
