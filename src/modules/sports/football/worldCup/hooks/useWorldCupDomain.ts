import { useEffect, useRef, useState } from 'react';
import type { WorldCupDomainModel } from '../domain/WorldCupDomainModel';
import {
  loadPreMatchPredictionSnapshots,
  persistPreMatchPredictionSnapshots,
} from '../persistence/preMatchPredictionStore';
import type { PreMatchPredictionSnapshot } from '../types';
import { createWorldCupDomainRefreshCoordinator } from './worldCupDomainRefresh';

export {
  buildWorldCupDomainWithMarketLoad,
  buildWorldCupDomainWithMarkets,
  loadWorldCupDataSource,
  loadWorldCupRefreshSources,
  loadWorldCupStrategyResearch,
  runWorldCupRefreshStages,
} from './worldCupDomainRefresh';

const WORLD_CUP_REFRESH_INTERVAL_MS = 60_000;

export type WorldCupDomainState = {
  domain: WorldCupDomainModel | null;
  isInitialLoading: boolean;
};

export const createInitialWorldCupDomainState = (): WorldCupDomainState => ({
  domain: null,
  isInitialLoading: true,
});

const browserStorage = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
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
    const persist = (snapshots: Record<string, PreMatchPredictionSnapshot>) => {
      if (cancelled) return;
      snapshotsRef.current = snapshots;
      const storage = browserStorage();
      if (storage) persistPreMatchPredictionSnapshots(storage, snapshots);
    };
    const coordinator = createWorldCupDomainRefreshCoordinator({ persistSnapshots: persist });

    const refresh = async () => {
      if (cancelled || refreshInFlight) return;
      refreshInFlight = true;
      try {
        await coordinator.refresh({ snapshots: snapshotsRef.current }, (result) => {
          if (cancelled) return;
          if (result.snapshots !== snapshotsRef.current) persist(result.snapshots);
          setDomain(result.domain);
        });
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

  return { domain, isInitialLoading: domain === null };
}
