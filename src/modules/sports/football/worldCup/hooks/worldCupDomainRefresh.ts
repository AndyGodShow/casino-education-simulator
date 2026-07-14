import {
  adaptWorldCupFixtures,
  type WorldCupAdapterResult,
} from '../../../../../dataProviders/football/worldCupAdapter';
import {
  createSampleFixtureResult,
  loadFixturesWithFallback,
} from '../../../../../dataProviders/football/fixtureProvider';
import {
  buildWorldCupDomain,
  type WorldCupAdapterResultWithMarkets,
  type WorldCupDomainBuildOptions,
} from '../domain/buildWorldCupDomain';
import type {
  GroupSimulationState,
  MarketData,
  WorldCupDomainModel,
  WorldCupStrategyResearchState,
} from '../domain/WorldCupDomainModel';
import { createWorldCupSimulationCache } from '../domain/worldCupSimulationCache';
import { parsePublicWorldCupSnapshot } from '../data/publicWorldCupSnapshot';
import {
  loadWorldCupMarketReferences,
  type WorldCupMarketReferenceLoadResult,
} from '../market/polymarketAdapter';
import {
  capturePreMatchPredictionSnapshotsNow,
  preMatchPredictionProvenanceForCapture,
} from '../persistence/preMatchPredictionStore';
import {
  loadCloudPreMatchPredictionSnapshots,
  mergePreMatchPredictionSnapshots,
} from '../persistence/cloudPreMatchPredictionStore';
import {
  parseWorldCupStrategyResearchSnapshot,
  strategyResearchStateFromSnapshot,
} from '../research/strategyResearchSnapshot';
import { applyStrategyTeamRatings } from '../research/applyStrategyTeamRatings';
import type { PreMatchPredictionSnapshot } from '../types';

const PUBLIC_DATA_TIMEOUT_MS = 8_000;
const STRATEGY_RESEARCH_TIMEOUT_MS = 10_000;

export type WorldCupDataSourceLoad = {
  adapterResult: WorldCupAdapterResult;
  markets: Record<string, MarketData>;
  delivery: 'server' | 'direct';
};

type WorldCupDataSourceDependencies = {
  fetchSnapshot?: (signal: AbortSignal) => Promise<Response>;
  loadFixtureResult?: typeof loadFixturesWithFallback;
  timeoutMs?: number;
};

export async function loadWorldCupDataSource(
  dependencies: WorldCupDataSourceDependencies = {},
): Promise<WorldCupDataSourceLoad> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? PUBLIC_DATA_TIMEOUT_MS,
  );
  let serverError = 'Public data endpoint unavailable.';
  try {
    const response = await (dependencies.fetchSnapshot ?? ((signal) => fetch('/api/world-cup/data', {
      method: 'GET', headers: { Accept: 'application/json' }, signal,
    })))(controller.signal);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = parsePublicWorldCupSnapshot(await response.json());
    if (!snapshot) throw new Error('invalid snapshot payload');
    return { adapterResult: snapshot.adapterResult, markets: snapshot.markets, delivery: 'server' };
  } catch {
    serverError = controller.signal.aborted
      ? 'Public data endpoint timed out; using the direct provider fallback.'
      : 'Public data endpoint unavailable or returned an invalid payload.';
  } finally {
    clearTimeout(timeoutId);
  }
  const fixtureResult = await (dependencies.loadFixtureResult ?? loadFixturesWithFallback)();
  const adapterResult = adaptWorldCupFixtures(fixtureResult);
  return {
    adapterResult: { ...adapterResult, errors: [...adapterResult.errors, serverError] },
    markets: {},
    delivery: 'direct',
  };
}

type StrategyResearchLoadDependencies = {
  fetchSnapshot?: (signal: AbortSignal) => Promise<Response>;
  timeoutMs?: number;
};

const unavailableStrategyResearch = (): WorldCupStrategyResearchState => ({
  status: 'unavailable', generatedAt: null, acceptedRows: 0, candidateId: null,
  validationSampleSize: 0, holdoutSampleSize: 0, holdoutContexts: 0,
  brierImprovement: 0,
  message: '历史策略研究暂不可用，当前继续使用基线模型，不会静默启用未经验证的参数。',
});

export async function loadWorldCupStrategyResearch(
  dependencies: StrategyResearchLoadDependencies = {},
): Promise<WorldCupStrategyResearchState> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? STRATEGY_RESEARCH_TIMEOUT_MS,
  );
  try {
    const response = await (dependencies.fetchSnapshot ?? ((signal) =>
      fetch('/api/world-cup/research', {
        method: 'GET', headers: { Accept: 'application/json' }, signal,
      })))(controller.signal);
    if (!response.ok) return unavailableStrategyResearch();
    const snapshot = parseWorldCupStrategyResearchSnapshot(await response.json());
    return snapshot ? strategyResearchStateFromSnapshot(snapshot) : unavailableStrategyResearch();
  } catch {
    return unavailableStrategyResearch();
  } finally {
    clearTimeout(timeoutId);
  }
}

const cloudSnapshotConfig = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return supabaseUrl && publishableKey ? { supabaseUrl, publishableKey } : null;
};

const defaultLoadSharedSnapshots = async () => {
  const config = cloudSnapshotConfig();
  if (!config) return null;
  try {
    return await loadCloudPreMatchPredictionSnapshots(config);
  } catch {
    return null;
  }
};

export type WorldCupRefreshSourceDependencies = {
  loadDataSource?: typeof loadWorldCupDataSource;
  loadStrategyResearch?: typeof loadWorldCupStrategyResearch;
  loadSharedSnapshots?: () => Promise<Record<string, PreMatchPredictionSnapshot> | null>;
};

export async function loadWorldCupRefreshSources(
  dependencies: WorldCupRefreshSourceDependencies = {},
) {
  const dataSourcePromise = (dependencies.loadDataSource ?? loadWorldCupDataSource)();
  const strategyResearchPromise = (
    dependencies.loadStrategyResearch ?? loadWorldCupStrategyResearch
  )();
  const sharedSnapshots = (dependencies.loadSharedSnapshots ?? defaultLoadSharedSnapshots)();
  const [dataSource, strategyResearch] = await Promise.all([
    dataSourcePromise, strategyResearchPromise,
  ]);
  return { dataSource, strategyResearch, sharedSnapshots };
}

const snapshotsChanged = (
  previous: Record<string, PreMatchPredictionSnapshot>,
  next: Record<string, PreMatchPredictionSnapshot>,
) => Object.keys(previous).length !== Object.keys(next).length
  || Object.entries(next).some(([matchId, snapshot]) => previous[matchId] !== snapshot);

type WorldCupRefreshPublication<TContext> = {
  snapshots: Record<string, PreMatchPredictionSnapshot>;
  context: TContext;
};

export async function runWorldCupRefreshStages<TContext>(
  dependencies: WorldCupRefreshSourceDependencies,
  handlers: {
    publishRequired: (sources: {
      dataSource: WorldCupDataSourceLoad;
      strategyResearch: WorldCupStrategyResearchState;
    }) => WorldCupRefreshPublication<TContext> | null
      | Promise<WorldCupRefreshPublication<TContext> | null>;
    persistMerged: (snapshots: Record<string, PreMatchPredictionSnapshot>) => void | Promise<void>;
    publishMerged: (publication: WorldCupRefreshPublication<TContext>) => void | Promise<void>;
  },
) {
  const { dataSource, strategyResearch, sharedSnapshots } = await loadWorldCupRefreshSources(dependencies);
  const requiredPublication = await handlers.publishRequired({ dataSource, strategyResearch });
  if (!requiredPublication) return;
  const cloudSnapshots = await sharedSnapshots;
  if (!cloudSnapshots) return;
  const mergedSnapshots = mergePreMatchPredictionSnapshots(
    requiredPublication.snapshots, cloudSnapshots,
  );
  if (!snapshotsChanged(requiredPublication.snapshots, mergedSnapshots)) return;
  await handlers.persistMerged(mergedSnapshots);
  await handlers.publishMerged({ snapshots: mergedSnapshots, context: requiredPublication.context });
}

export const buildWorldCupDomainWithMarketLoad = (
  adapterResult: WorldCupAdapterResult,
  marketLoad: WorldCupMarketReferenceLoadResult,
  options: WorldCupDomainBuildOptions = {},
) => buildWorldCupDomain({
  ...adapterResult,
  markets: marketLoad.markets,
  errors: [...adapterResult.errors, ...marketLoad.errors],
} satisfies WorldCupAdapterResultWithMarkets, options);

export const buildWorldCupDomainWithMarkets = (
  adapterResult: WorldCupAdapterResult,
  markets: Record<string, MarketData>,
  options: WorldCupDomainBuildOptions = {},
) => buildWorldCupDomainWithMarketLoad(adapterResult, { markets, errors: [] }, options);

type SimulationCache = { get: (result: WorldCupAdapterResult) => GroupSimulationState };

export type WorldCupDomainRefreshResult = {
  domain: WorldCupDomainModel;
  snapshots: Record<string, PreMatchPredictionSnapshot>;
};

export type WorldCupDomainRefreshDependencies = {
  loadDataSource?: typeof loadWorldCupDataSource;
  loadStrategyResearch?: typeof loadWorldCupStrategyResearch;
  loadSharedSnapshots?: () => Promise<Record<string, PreMatchPredictionSnapshot> | null>;
  loadMarketReferences?: typeof loadWorldCupMarketReferences;
  persistSnapshots?: (snapshots: Record<string, PreMatchPredictionSnapshot>) => void | Promise<void>;
  simulationCache?: SimulationCache;
  applicationRevision?: string;
};

const productionSimulationCache = createWorldCupSimulationCache();

export function createWorldCupDomainRefreshCoordinator(
  dependencies: WorldCupDomainRefreshDependencies = {},
) {
  const simulationCache = dependencies.simulationCache ?? productionSimulationCache;
  return {
    async refresh(
      current: { snapshots: Record<string, PreMatchPredictionSnapshot> },
      publish: (result: WorldCupDomainRefreshResult) => void | Promise<void>,
    ): Promise<WorldCupDomainRefreshResult> {
      try {
        const { dataSource, strategyResearch, sharedSnapshots } = await loadWorldCupRefreshSources({
          loadDataSource: dependencies.loadDataSource,
          loadStrategyResearch: dependencies.loadStrategyResearch,
          loadSharedSnapshots: dependencies.loadSharedSnapshots,
        });
        const strategyInputs = applyStrategyTeamRatings(dataSource.adapterResult, strategyResearch);
        const { adapterResult } = strategyInputs;
        const simulation = simulationCache.get(adapterResult);
        let marketLoad: WorldCupMarketReferenceLoadResult = {
          markets: dataSource.markets,
          errors: [],
        };
        let snapshots = current.snapshots;
        const domainOptions: WorldCupDomainBuildOptions = {
          evaluationTimeMs: Date.now(),
          preMatchPredictionSnapshots: snapshots,
          strategyResearch: strategyInputs.strategyResearch,
          simulation,
        };
        let domain = buildWorldCupDomainWithMarketLoad(adapterResult, marketLoad, domainOptions);
        const captureSnapshots = () => {
          const captured = capturePreMatchPredictionSnapshotsNow({
            snapshots,
            matches: domain.matches,
            predictions: domain.predictions,
            provenance: preMatchPredictionProvenanceForCapture(
              dependencies.applicationRevision
                ?? import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA
                ?? 'local',
              {
                appliedTeams: strategyInputs.strategyResearch.ratingInputAudit?.appliedTeams ?? 0,
                researchGeneratedAt: strategyInputs.strategyResearch.generatedAt,
                candidateId: strategyInputs.strategyResearch.candidateId,
                provenance: strategyInputs.strategyResearch.provenance,
              },
            ),
          });
          if (captured.changed) {
            snapshots = captured.snapshots;
            domain = buildWorldCupDomainWithMarketLoad(adapterResult, marketLoad, {
              ...domainOptions, preMatchPredictionSnapshots: snapshots,
            });
          }
          return captured.changed;
        };

        const canCapture = domain.source !== 'sample' && domain.source !== 'local';
        if (dataSource.delivery !== 'direct' && canCapture) captureSnapshots();

        let latest = { domain, snapshots };
        await publish(latest);

        if (dataSource.delivery === 'direct' && canCapture) {
          marketLoad = await (dependencies.loadMarketReferences ?? loadWorldCupMarketReferences)(
            adapterResult.matches, adapterResult.teams,
          );
          const hasMarketUpdate = Object.keys(marketLoad.markets).length > 0
            || marketLoad.errors.length > 0;
          if (hasMarketUpdate) {
            domain = buildWorldCupDomainWithMarketLoad(adapterResult, marketLoad, domainOptions);
          }
          const captured = captureSnapshots();
          if (hasMarketUpdate || captured) {
            latest = { domain, snapshots };
            await publish(latest);
          }
        }

        const cloudSnapshots = await sharedSnapshots;
        if (!cloudSnapshots) return latest;
        const mergedSnapshots = mergePreMatchPredictionSnapshots(snapshots, cloudSnapshots);
        if (!snapshotsChanged(snapshots, mergedSnapshots)) return latest;
        await dependencies.persistSnapshots?.(mergedSnapshots);
        latest = {
          snapshots: mergedSnapshots,
          domain: buildWorldCupDomainWithMarketLoad(adapterResult, marketLoad, {
            ...domainOptions, preMatchPredictionSnapshots: mergedSnapshots,
          }),
        };
        await publish(latest);
        return latest;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const fallback = {
          snapshots: current.snapshots,
          domain: buildWorldCupDomain(
            adaptWorldCupFixtures(createSampleFixtureResult([message])),
            {
              evaluationTimeMs: Date.now(),
              preMatchPredictionSnapshots: current.snapshots,
            },
          ),
        };
        await publish(fallback);
        return fallback;
      }
    },
  };
}
