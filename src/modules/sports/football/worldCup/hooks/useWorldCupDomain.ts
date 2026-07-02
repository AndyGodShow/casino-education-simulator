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
import type { MarketData, WorldCupDomainModel } from '../domain/WorldCupDomainModel';
import { loadWorldCupMarketReferences } from '../market/polymarketAdapter';
import {
  capturePreMatchPredictionSnapshots,
  loadPreMatchPredictionSnapshots,
  persistPreMatchPredictionSnapshots,
} from '../persistence/preMatchPredictionStore';
import {
  loadCloudPreMatchPredictionSnapshots,
  mergePreMatchPredictionSnapshots,
} from '../persistence/cloudPreMatchPredictionStore';
import type { PreMatchPredictionSnapshot } from '../types';

export const WORLD_CUP_REFRESH_INTERVAL_MS = 60_000;

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
) => buildWorldCupDomain({ ...adapterResult, markets } satisfies WorldCupAdapterResultWithMarkets, options);

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
        const [nextResult, sharedSnapshots] = await Promise.all([
          loadFixturesWithFallback(),
          loadSharedSnapshots(),
        ]);
        if (!cancelled) {
          const evaluationTimeMs = Date.now();
          let nextSnapshots = sharedSnapshots
            ? mergePreMatchPredictionSnapshots(snapshotsRef.current, sharedSnapshots)
            : snapshotsRef.current;
          if (sharedSnapshots) {
            snapshotsRef.current = nextSnapshots;
            const storage = browserStorage();
            if (storage) persistPreMatchPredictionSnapshots(storage, nextSnapshots);
          }
          const adapterResult = adaptWorldCupFixtures(nextResult);
          const domainOptions = {
            evaluationTimeMs,
            preMatchPredictionSnapshots: nextSnapshots,
          };
          let nextDomain = buildWorldCupDomain(adapterResult, domainOptions);
          setDomain(nextDomain);

          if (nextDomain.source !== 'sample' && nextDomain.source !== 'local') {
            const markets = await loadWorldCupMarketReferences(
              adapterResult.matches,
              adapterResult.teams,
            );
            if (cancelled) return;
            if (Object.keys(markets).length > 0) {
              nextDomain = buildWorldCupDomainWithMarkets(adapterResult, markets, domainOptions);
            }
            const captured = capturePreMatchPredictionSnapshots({
              snapshots: nextSnapshots,
              matches: nextDomain.matches,
              predictions: nextDomain.predictions,
              now: evaluationTimeMs,
            });
            if (captured.changed) {
              nextSnapshots = captured.snapshots;
              snapshotsRef.current = nextSnapshots;
              const storage = browserStorage();
              if (storage) persistPreMatchPredictionSnapshots(storage, nextSnapshots);
            }
          }

          setDomain(nextDomain);
        }
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
