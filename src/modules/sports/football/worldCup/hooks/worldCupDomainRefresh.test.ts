import { afterEach, describe, expect, it, vi } from 'vitest';
import { adaptWorldCupFixtures } from '../../../../../dataProviders/football/worldCupAdapter';
import { createSampleFixtureResult } from '../../../../../dataProviders/football/fixtureProvider';
import type {
  WorldCupStrategyResearchState,
  WorldCupStrategyTeamRating,
} from '../domain/WorldCupDomainModel';
import { createWorldCupSimulationCache } from '../domain/worldCupSimulationCache';
import type { MatchPrediction, PreMatchPredictionSnapshot } from '../types';
import {
  createWorldCupDomainRefreshCoordinator,
  type WorldCupDomainRefreshResult,
} from './worldCupDomainRefresh';

const APPLICATION_REVISION = 'cccccccccccccccccccccccccccccccccccccccc';
const DATASET_REVISION = 'f73286079f8c6b48a59f8a16e895d757119dca71';
const DATASET_SHA256 = `sha256:${'a'.repeat(64)}`;
const MODEL_CONFIG_SHA256 = `sha256:${'b'.repeat(64)}`;
const NOW = Date.parse('2026-06-01T12:00:00.000Z');

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const verifiedAdapterResult = () => {
  const sample = adaptWorldCupFixtures(createSampleFixtureResult(), {
    now: new Date(NOW),
  });
  return {
    ...sample,
    source: 'openfootball' as const,
    providerName: 'OpenFootball',
    matches: sample.matches.map((match) => ({
      ...match,
      source: 'openfootball' as const,
      status: 'scheduled' as const,
    })),
  };
};

const unavailableResearch = (): WorldCupStrategyResearchState => ({
  status: 'unavailable',
  generatedAt: null,
  acceptedRows: 0,
  candidateId: null,
  validationSampleSize: 0,
  holdoutSampleSize: 0,
  holdoutContexts: 0,
  brierImprovement: 0,
  message: '基线模型',
});

const appliedRating = (teamId: string): WorldCupStrategyTeamRating => ({
  teamId,
  teamName: teamId,
  asOf: '2026-05-31T12:00:00.000Z',
  matches: 30,
  elo: 1_720,
  evidenceWeight: 4,
  lastMatchDate: '2026-05-30',
  trustLevel: 'medium',
});

const appliedResearch = (teamId: string): WorldCupStrategyResearchState => ({
  ...unavailableResearch(),
  status: 'applied',
  generatedAt: '2026-05-31T12:00:00.000Z',
  acceptedRows: 49_000,
  candidateId: 'assertive-320',
  validationSampleSize: 60,
  holdoutSampleSize: 60,
  holdoutContexts: 5,
  brierImprovement: 0.037,
  message: 'research applied',
  provenance: {
    datasetRevision: DATASET_REVISION,
    datasetSha256: DATASET_SHA256,
    researchAlgorithmVersion: 'world-cup-walk-forward-v1',
    modelConfigSha256: MODEL_CONFIG_SHA256,
  },
  teamRatings: { [teamId]: appliedRating(teamId) },
});

const serverDataSource = () => ({
  adapterResult: verifiedAdapterResult(),
  markets: {},
  delivery: 'server' as const,
});

const coordinatorDependencies = (overrides: Record<string, unknown> = {}) => ({
  loadDataSource: async () => serverDataSource(),
  loadSharedSnapshots: async () => null,
  loadStrategyResearch: async () => unavailableResearch(),
  loadMarketReferences: vi.fn(async () => ({ markets: {}, errors: [] })),
  simulationCache: { get: vi.fn(() => ({ probabilities: [] })) },
  applicationRevision: APPLICATION_REVISION,
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createWorldCupDomainRefreshCoordinator', () => {
  it('publishes verified direct data before optional market enrichment settles', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const deferredMarket = createDeferred<{
      markets: Record<string, never>;
      errors: string[];
    }>();
    const publish = vi.fn();
    const coordinator = createWorldCupDomainRefreshCoordinator(coordinatorDependencies({
      loadDataSource: async () => ({ ...serverDataSource(), delivery: 'direct' as const }),
      loadMarketReferences: vi.fn(() => deferredMarket.promise),
    }));

    const pendingRefresh = coordinator.refresh({ snapshots: {} }, publish);

    await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
    expect(publish.mock.calls[0]?.[0].domain.source).toBe('openfootball');
    deferredMarket.resolve({ markets: {}, errors: [] });
    await pendingRefresh;

    expect(publish).toHaveBeenCalledTimes(2);
    expect(Object.keys(publish.mock.calls[1]?.[0].snapshots ?? {})).not.toHaveLength(0);
  });

  it('does not request optional markets for a direct sample fallback', async () => {
    const loadMarketReferences = vi.fn(async () => ({ markets: {}, errors: [] }));
    const publish = vi.fn();
    const coordinator = createWorldCupDomainRefreshCoordinator(coordinatorDependencies({
      loadDataSource: async () => ({
        adapterResult: adaptWorldCupFixtures(createSampleFixtureResult()),
        markets: {},
        delivery: 'direct' as const,
      }),
      loadMarketReferences,
    }));

    const result = await coordinator.refresh({ snapshots: {} }, publish);

    expect(result.domain.source).toBe('sample');
    expect(loadMarketReferences).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledOnce();
  });

  it('publishes required data before deferred cloud history and reuses one simulation in the cycle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const deferredCloud = createDeferred<Record<string, PreMatchPredictionSnapshot> | null>();
    const simulationCache = { get: vi.fn(() => ({ probabilities: [] })) };
    const persistSnapshots = vi.fn();
    const publish = vi.fn<(result: WorldCupDomainRefreshResult) => void>();
    const coordinator = createWorldCupDomainRefreshCoordinator(coordinatorDependencies({
      loadSharedSnapshots: () => deferredCloud.promise,
      simulationCache,
      persistSnapshots,
    }));

    const pendingRefresh = coordinator.refresh({ snapshots: {} }, publish);

    await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
    const initial = publish.mock.calls[0]?.[0];
    expect(initial?.domain.source).toBe('openfootball');
    expect(Object.keys(initial?.snapshots ?? {})).not.toHaveLength(0);
    expect(simulationCache.get).toHaveBeenCalledOnce();

    const [matchId, initialSnapshot] = Object.entries(initial?.snapshots ?? {})[0] ?? [];
    expect(matchId).toBeTruthy();
    expect(initialSnapshot).toBeDefined();
    const earlierCloudSnapshot = {
      ...initialSnapshot!,
      capturedAt: new Date(NOW - 60_000).toISOString(),
    };
    deferredCloud.resolve({ [matchId!]: earlierCloudSnapshot });

    const finalResult = await pendingRefresh;
    expect(publish).toHaveBeenCalledTimes(2);
    expect(persistSnapshots).toHaveBeenCalledOnce();
    expect(finalResult).toBe(publish.mock.calls[1]?.[0]);
    expect(finalResult.snapshots[matchId!]).toEqual(earlierCloudSnapshot);
    expect(simulationCache.get).toHaveBeenCalledOnce();
  });

  it('does not persist or publish a second time when cloud history leaves snapshots unchanged', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const persistSnapshots = vi.fn();
    const publish = vi.fn();
    const coordinator = createWorldCupDomainRefreshCoordinator(coordinatorDependencies({
      loadSharedSnapshots: async () => ({}),
      persistSnapshots,
    }));

    const result = await coordinator.refresh({ snapshots: {} }, publish);

    expect(publish).toHaveBeenCalledOnce();
    expect(persistSnapshots).not.toHaveBeenCalled();
    expect(result).toBe(publish.mock.calls[0]?.[0]);
  });

  it('reuses the simulation cache across unchanged refresh cycles', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const buildSimulation = vi.fn(() => ({ probabilities: [] }));
    const simulationCache = createWorldCupSimulationCache(buildSimulation);
    const coordinator = createWorldCupDomainRefreshCoordinator(coordinatorDependencies({
      simulationCache,
    }));

    const first = await coordinator.refresh({ snapshots: {} }, vi.fn());
    await coordinator.refresh({ snapshots: first.snapshots }, vi.fn());

    expect(buildSimulation).toHaveBeenCalledOnce();
  });

  it('preserves applied research provenance on prediction captures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const dataSource = serverDataSource();
    const firstMatch = dataSource.adapterResult.matches[0];
    const coordinator = createWorldCupDomainRefreshCoordinator(coordinatorDependencies({
      loadDataSource: async () => dataSource,
      loadStrategyResearch: async () => appliedResearch(firstMatch.homeTeamId),
    }));

    const result = await coordinator.refresh({ snapshots: {} }, vi.fn());

    expect(result.snapshots[firstMatch.id].provenance).toEqual({
      schemaVersion: 1,
      applicationRevision: APPLICATION_REVISION,
      modelVersion: 'v2',
      researchGeneratedAt: '2026-05-31T12:00:00.000Z',
      candidateId: 'assertive-320',
      datasetRevision: DATASET_REVISION,
      datasetSha256: DATASET_SHA256,
      modelConfigSha256: MODEL_CONFIG_SHA256,
    });
  });

  it('publishes a sample fallback with the current snapshots and a sanitized thrown message', async () => {
    const adapterResult = verifiedAdapterResult();
    const match = adapterResult.matches[0];
    const currentSnapshot: PreMatchPredictionSnapshot = {
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      kickoff: match.kickoff,
      capturedAt: '2026-06-01T11:00:00.000Z',
      prediction: { matchId: match.id } as MatchPrediction,
      provenance: {
        schemaVersion: 1,
        applicationRevision: 'local',
        modelVersion: 'v2',
        researchGeneratedAt: null,
        candidateId: null,
        datasetRevision: null,
        datasetSha256: null,
        modelConfigSha256: null,
      },
    };
    const snapshots = { [match.id]: currentSnapshot };
    const publish = vi.fn();
    const coordinator = createWorldCupDomainRefreshCoordinator(coordinatorDependencies({
      loadDataSource: async () => {
        const error = new Error('provider unavailable');
        error.stack = 'transport internals that must not be exposed';
        throw error;
      },
    }));

    const result = await coordinator.refresh({ snapshots }, publish);

    expect(result.domain.source).toBe('sample');
    expect(result.domain.errors).toContain('provider unavailable');
    expect(result.domain.errors?.join(' ')).not.toContain('transport internals');
    expect(result.snapshots).toBe(snapshots);
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(result);
  });
});
