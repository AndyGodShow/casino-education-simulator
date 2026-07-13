import { useEffect, useRef, useState } from 'react';
import {
  adaptWorldCupFixtures,
  type WorldCupAdapterResult,
} from '../../../../../dataProviders/football/worldCupAdapter';
import { createSampleFixtureResult, loadFixturesWithFallback } from '../../../../../dataProviders/football/fixtureProvider';
import {
  buildWorldCupDomain,
  type WorldCupDomainBuildOptions,
  type WorldCupAdapterResultWithMarkets,
} from '../domain/buildWorldCupDomain';
import type {
  MarketData,
  WorldCupDomainModel,
  WorldCupStrategyResearchState,
} from '../domain/WorldCupDomainModel';
import { parsePublicWorldCupSnapshot } from '../data/publicWorldCupSnapshot';
import {
  loadWorldCupMarketReferences,
  type WorldCupMarketReferenceLoadResult,
} from '../market/polymarketAdapter';
import {
  capturePreMatchPredictionSnapshotsNow,
  loadPreMatchPredictionSnapshots,
  persistPreMatchPredictionSnapshots,
} from '../persistence/preMatchPredictionStore';
import {
  loadCloudPreMatchPredictionSnapshots,
  mergePreMatchPredictionSnapshots,
} from '../persistence/cloudPreMatchPredictionStore';
import type { PreMatchPredictionSnapshot } from '../types';
import {
  parseWorldCupStrategyResearchSnapshot,
  strategyResearchStateFromSnapshot,
} from '../research/strategyResearchSnapshot';
import { applyStrategyTeamRatings } from '../research/applyStrategyTeamRatings';

const WORLD_CUP_REFRESH_INTERVAL_MS = 60_000;

export type WorldCupDomainState = {
  domain: WorldCupDomainModel | null;
  isInitialLoading: boolean;
};

export const createInitialWorldCupDomainState = (): WorldCupDomainState => ({
  domain: null,
  isInitialLoading: true,
});

export const buildWorldCupDomainWithMarkets = (
  adapterResult: WorldCupAdapterResult,
  markets: Record<string, MarketData>,
  options: WorldCupDomainBuildOptions = {},
) => buildWorldCupDomainWithMarketLoad(adapterResult, { markets, errors: [] }, options);

export const buildWorldCupDomainWithMarketLoad = (
  adapterResult: WorldCupAdapterResult,
  marketLoad: WorldCupMarketReferenceLoadResult,
  options: WorldCupDomainBuildOptions = {},
) => buildWorldCupDomain({
  ...adapterResult,
  markets: marketLoad.markets,
  errors: [...adapterResult.errors, ...marketLoad.errors],
} satisfies WorldCupAdapterResultWithMarkets, options);

type WorldCupDataSourceDependencies = {
  fetchSnapshot?: (signal: AbortSignal) => Promise<Response>;
  loadFixtureResult?: typeof loadFixturesWithFallback;
  timeoutMs?: number;
};

type WorldCupDataSourceLoad = {
  adapterResult: WorldCupAdapterResult;
  markets: Record<string, MarketData>;
  delivery: 'server' | 'direct';
};

const PUBLIC_DATA_TIMEOUT_MS = 8_000;
const STRATEGY_RESEARCH_TIMEOUT_MS = 10_000;

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
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    })))(controller.signal);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = parsePublicWorldCupSnapshot(await response.json());
    if (!snapshot) throw new Error('invalid snapshot payload');

    return {
      adapterResult: snapshot.adapterResult,
      markets: snapshot.markets,
      delivery: 'server',
    };
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
    adapterResult: {
      ...adapterResult,
      errors: [...adapterResult.errors, serverError],
    },
    markets: {},
    delivery: 'direct',
  };
}

type StrategyResearchLoadDependencies = {
  fetchSnapshot?: (signal: AbortSignal) => Promise<Response>;
  timeoutMs?: number;
};

const unavailableStrategyResearch = (): WorldCupStrategyResearchState => ({
  status: 'unavailable',
  generatedAt: null,
  acceptedRows: 0,
  candidateId: null,
  validationSampleSize: 0,
  holdoutSampleSize: 0,
  holdoutContexts: 0,
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
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
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

const browserStorage = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

const cloudSnapshotConfig = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return supabaseUrl && publishableKey ? { supabaseUrl, publishableKey } : null;
};

const loadSharedSnapshots = async () => {
  const config = cloudSnapshotConfig();
  if (!config) return null;
  try {
    return await loadCloudPreMatchPredictionSnapshots(config);
  } catch {
    return null;
  }
};

type WorldCupRefreshSourceDependencies = {
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
  const sharedSnapshots = (dependencies.loadSharedSnapshots ?? loadSharedSnapshots)();
  const [dataSource, strategyResearch] = await Promise.all([
    dataSourcePromise,
    strategyResearchPromise,
  ]);

  return { dataSource, strategyResearch, sharedSnapshots };
}

const snapshotsChanged = (
  previous: Record<string, PreMatchPredictionSnapshot>,
  next: Record<string, PreMatchPredictionSnapshot>,
) => Object.keys(previous).length !== Object.keys(next).length
  || Object.entries(next).some(([matchId, snapshot]) => previous[matchId] !== snapshot);

type WorldCupRefreshRequiredSources = {
  dataSource: WorldCupDataSourceLoad;
  strategyResearch: WorldCupStrategyResearchState;
};

type WorldCupRefreshPublication<TContext> = {
  snapshots: Record<string, PreMatchPredictionSnapshot>;
  context: TContext;
};

type WorldCupRefreshStageHandlers<TContext> = {
  publishRequired: (
    sources: WorldCupRefreshRequiredSources,
  ) => WorldCupRefreshPublication<TContext> | null
    | Promise<WorldCupRefreshPublication<TContext> | null>;
  persistMerged: (
    snapshots: Record<string, PreMatchPredictionSnapshot>,
  ) => void | Promise<void>;
  publishMerged: (
    publication: WorldCupRefreshPublication<TContext>,
  ) => void | Promise<void>;
};

export async function runWorldCupRefreshStages<TContext>(
  dependencies: WorldCupRefreshSourceDependencies,
  handlers: WorldCupRefreshStageHandlers<TContext>,
) {
  const {
    dataSource,
    strategyResearch,
    sharedSnapshots,
  } = await loadWorldCupRefreshSources(dependencies);
  const requiredPublication = await handlers.publishRequired({
    dataSource,
    strategyResearch,
  });
  if (!requiredPublication) return;

  const cloudSnapshots = await sharedSnapshots;
  if (!cloudSnapshots) return;

  const mergedSnapshots = mergePreMatchPredictionSnapshots(
    requiredPublication.snapshots,
    cloudSnapshots,
  );
  if (!snapshotsChanged(requiredPublication.snapshots, mergedSnapshots)) return;

  await handlers.persistMerged(mergedSnapshots);
  await handlers.publishMerged({
    snapshots: mergedSnapshots,
    context: requiredPublication.context,
  });
}

export function useWorldCupDomain(): WorldCupDomainState {
  const [initialSnapshots] = useState<Record<string, PreMatchPredictionSnapshot>>(() => {
    const storage = browserStorage();
    return storage ? loadPreMatchPredictionSnapshots(storage) : {};
  });
  const snapshotsRef = useRef(initialSnapshots);
  const [domain, setDomain] = useState<WorldCupDomainModel | null>(null);

  useEffect(() => {
    let cancelled = false;
    let refreshInFlight = false;

    const refresh = async () => {
      if (cancelled || refreshInFlight) return;
      refreshInFlight = true;
      try {
        await runWorldCupRefreshStages({}, {
          publishRequired: async ({ dataSource, strategyResearch }) => {
            if (cancelled) return null;

            const evaluationTimeMs = Date.now();
            let nextSnapshots = snapshotsRef.current;
            const strategyInputs = applyStrategyTeamRatings(
              dataSource.adapterResult,
              strategyResearch,
            );
            const { adapterResult } = strategyInputs;
            const domainOptions = {
              evaluationTimeMs,
              preMatchPredictionSnapshots: nextSnapshots,
              strategyResearch: strategyInputs.strategyResearch,
            };
            let marketLoad: WorldCupMarketReferenceLoadResult = {
              markets: dataSource.markets,
              errors: [],
            };
            let nextDomain = Object.keys(marketLoad.markets).length > 0
              ? buildWorldCupDomainWithMarketLoad(adapterResult, marketLoad, domainOptions)
              : buildWorldCupDomain(adapterResult, domainOptions);
            setDomain(nextDomain);

            if (nextDomain.source !== 'sample' && nextDomain.source !== 'local') {
              if (dataSource.delivery === 'direct') {
                marketLoad = await loadWorldCupMarketReferences(
                  adapterResult.matches,
                  adapterResult.teams,
                );
                if (cancelled) return null;
                if (Object.keys(marketLoad.markets).length > 0 || marketLoad.errors.length > 0) {
                  nextDomain = buildWorldCupDomainWithMarketLoad(
                    adapterResult,
                    marketLoad,
                    domainOptions,
                  );
                }
              }
              const captured = capturePreMatchPredictionSnapshotsNow({
                snapshots: nextSnapshots,
                matches: nextDomain.matches,
                predictions: nextDomain.predictions,
              });
              if (captured.changed) {
                nextSnapshots = captured.snapshots;
                snapshotsRef.current = nextSnapshots;
                const storage = browserStorage();
                if (storage) persistPreMatchPredictionSnapshots(storage, nextSnapshots);
                const updatedOptions = {
                  ...domainOptions,
                  preMatchPredictionSnapshots: nextSnapshots,
                };
                nextDomain = Object.keys(marketLoad.markets).length > 0
                  || marketLoad.errors.length > 0
                  ? buildWorldCupDomainWithMarketLoad(adapterResult, marketLoad, updatedOptions)
                  : buildWorldCupDomain(adapterResult, updatedOptions);
              }
            }

            setDomain(nextDomain);

            return {
              snapshots: nextSnapshots,
              context: { adapterResult, marketLoad, domainOptions },
            };
          },
          persistMerged: (snapshots) => {
            if (cancelled) return;

            snapshotsRef.current = snapshots;
            const storage = browserStorage();
            if (storage) persistPreMatchPredictionSnapshots(storage, snapshots);
          },
          publishMerged: ({ snapshots, context }) => {
            if (cancelled) return;

            const cloudOptions = {
              ...context.domainOptions,
              preMatchPredictionSnapshots: snapshots,
            };
            const cloudDomain = Object.keys(context.marketLoad.markets).length > 0
              || context.marketLoad.errors.length > 0
              ? buildWorldCupDomainWithMarketLoad(
                context.adapterResult,
                context.marketLoad,
                cloudOptions,
              )
              : buildWorldCupDomain(context.adapterResult, cloudOptions);
            setDomain(cloudDomain);
          },
        });
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setDomain(buildWorldCupDomain(
            adaptWorldCupFixtures(createSampleFixtureResult([message])),
            {
              evaluationTimeMs: Date.now(),
              preMatchPredictionSnapshots: snapshotsRef.current,
            },
          ));
        }
      } finally {
        refreshInFlight = false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    void refresh();
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, WORLD_CUP_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  return {
    domain,
    isInitialLoading: domain === null,
  };
}
