import { adaptWorldCupFixtures } from '../../dataProviders/football/worldCupAdapter';
import {
  loadFixturesWithFallback,
  type FixtureProviderResult,
} from '../../dataProviders/football/fixtureProvider';
import { buildWorldCupDomain } from '../../modules/sports/football/worldCup/domain/buildWorldCupDomain';
import { capturePreMatchPredictionSnapshots } from '../../modules/sports/football/worldCup/persistence/preMatchPredictionStore';
import type {
  MatchPrediction,
  PreMatchPredictionSnapshot,
  WorldCupMatch,
} from '../../modules/sports/football/worldCup/types';

type SnapshotCandidates = {
  matches: WorldCupMatch[];
  predictions: Record<string, MatchPrediction>;
};

type PredictionSnapshotJobDependencies = {
  now?: number;
  loadFixtureResult?: () => Promise<FixtureProviderResult>;
  buildSnapshotCandidates?: (
    fixtureResult: FixtureProviderResult,
    now: number,
  ) => SnapshotCandidates;
  persistSnapshots: (snapshots: PreMatchPredictionSnapshot[]) => Promise<void>;
};

const buildDefaultSnapshotCandidates = (
  fixtureResult: FixtureProviderResult,
  now: number,
): SnapshotCandidates => {
  const domain = buildWorldCupDomain(
    adaptWorldCupFixtures(fixtureResult, { now: new Date(now) }),
    { evaluationTimeMs: now },
  );

  return {
    matches: domain.matches,
    predictions: domain.predictions,
  };
};

export async function runPredictionSnapshotJob(
  dependencies: PredictionSnapshotJobDependencies,
) {
  const now = dependencies.now ?? Date.now();
  const fixtureResult = await (dependencies.loadFixtureResult ?? loadFixturesWithFallback)();
  if (fixtureResult.source === 'sample' || fixtureResult.source === 'local') {
    throw new Error('Prediction snapshots require a verified fixture provider.');
  }

  const candidates = (dependencies.buildSnapshotCandidates ?? buildDefaultSnapshotCandidates)(
    fixtureResult,
    now,
  );
  const captured = capturePreMatchPredictionSnapshots({
    snapshots: {},
    matches: candidates.matches,
    predictions: candidates.predictions,
    now,
  });
  const snapshots = Object.values(captured.snapshots);

  if (snapshots.length > 0) {
    await dependencies.persistSnapshots(snapshots);
  }

  return {
    source: fixtureResult.source,
    written: snapshots.length,
  };
}
