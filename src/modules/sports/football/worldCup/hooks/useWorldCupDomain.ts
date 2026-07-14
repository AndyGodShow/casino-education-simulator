import { useEffect, useRef, useState } from 'react';
import type { WorldCupDomainModel } from '../domain/WorldCupDomainModel';
import {
  loadPreMatchPredictionSnapshots,
  persistPreMatchPredictionSnapshots,
} from '../persistence/preMatchPredictionStore';
import type { PreMatchPredictionSnapshot } from '../types';
import {
  createWorldCupDomainRefreshCoordinator,
  type WorldCupDomainRefreshCoordinator,
  type WorldCupDomainRefreshResult,
} from './worldCupDomainRefresh';

export type { WorldCupDomainRefreshCoordinator } from './worldCupDomainRefresh';

export {
  buildWorldCupDomainWithMarketLoad,
  buildWorldCupDomainWithMarkets,
  loadWorldCupDataSource,
  loadWorldCupRefreshSources,
  loadWorldCupStrategyResearch,
  runWorldCupRefreshStages,
} from './worldCupDomainRefresh';

const WORLD_CUP_REFRESH_INTERVAL_MS = 60_000;

export type UseWorldCupDomainOptions = {
  coordinator?: WorldCupDomainRefreshCoordinator;
  refreshIntervalMs?: number;
};

export type WorldCupDomainState = {
  domain: WorldCupDomainModel | null;
  isInitialLoading: boolean;
};

type WorldCupRefreshSubscriber = (
  result: WorldCupDomainRefreshResult,
) => void | Promise<void>;

type WorldCupRefreshOwner = {
  coordinator: WorldCupDomainRefreshCoordinator;
  promise: Promise<WorldCupDomainRefreshResult>;
  latestPublished: WorldCupDomainRefreshResult | null;
  subscribers: Set<WorldCupRefreshSubscriber>;
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

export function useWorldCupDomain(
  options: UseWorldCupDomainOptions = {},
): WorldCupDomainState {
  const [initialSnapshots] = useState<Record<string, PreMatchPredictionSnapshot>>(() => {
    const storage = browserStorage();
    return storage ? loadPreMatchPredictionSnapshots(storage) : {};
  });
  const snapshotsRef = useRef(initialSnapshots);
  const [domain, setDomain] = useState<WorldCupDomainModel | null>(null);
  const refreshOwnerRef = useRef<WorldCupRefreshOwner | null>(null);
  const defaultCoordinatorRef = useRef<WorldCupDomainRefreshCoordinator | null>(null);
  if (!defaultCoordinatorRef.current) {
    defaultCoordinatorRef.current = createWorldCupDomainRefreshCoordinator();
  }
  const coordinator = options.coordinator ?? defaultCoordinatorRef.current;
  const refreshIntervalMs = options.refreshIntervalMs ?? WORLD_CUP_REFRESH_INTERVAL_MS;

  useEffect(() => {
    let cancelled = false;
    let refreshInFlight = false;
    let refreshGeneration = 0;
    let refreshTimer: number | null = null;
    let activeSubscription: {
      owner: WorldCupRefreshOwner;
      subscriber: WorldCupRefreshSubscriber;
      generation: number;
    } | null = null;
    const persist = (snapshots: Record<string, PreMatchPredictionSnapshot>) => {
      if (cancelled) return;
      snapshotsRef.current = snapshots;
      const storage = browserStorage();
      if (storage) persistPreMatchPredictionSnapshots(storage, snapshots);
    };

    const clearRefreshTimer = () => {
      if (refreshTimer === null) return;
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    };

    const scheduleRefresh = () => {
      clearRefreshTimer();
      if (cancelled || document.visibilityState !== 'visible') return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refresh();
      }, refreshIntervalMs);
    };

    const refresh = async () => {
      if (cancelled || refreshInFlight || document.visibilityState !== 'visible') return;
      clearRefreshTimer();
      refreshInFlight = true;
      const generation = ++refreshGeneration;
      let owner = refreshOwnerRef.current?.coordinator === coordinator
        ? refreshOwnerRef.current
        : null;
      const subscriber: WorldCupRefreshSubscriber = async (published) => {
        await Promise.resolve();
        if (cancelled || generation !== refreshGeneration) return;
        setDomain(published.domain);
      };
      try {
        if (!owner) {
          let resolveOwner!: (result: WorldCupDomainRefreshResult) => void;
          let rejectOwner!: (reason?: unknown) => void;
          owner = {
            coordinator,
            promise: new Promise<WorldCupDomainRefreshResult>((resolve, reject) => {
              resolveOwner = resolve;
              rejectOwner = reject;
            }),
            latestPublished: null,
            subscribers: new Set([subscriber]),
          };
          activeSubscription = { owner, subscriber, generation };
          refreshOwnerRef.current = owner;
          try {
            coordinator.refresh(
              { snapshots: snapshotsRef.current },
              async (published) => {
                if (!owner) return;
                owner.latestPublished = published;
                await Promise.all(
                  [...owner.subscribers].map((listener) => listener(published)),
                );
              },
            ).then(resolveOwner, rejectOwner);
          } catch (error) {
            rejectOwner(error);
          }
        } else {
          owner.subscribers.add(subscriber);
          activeSubscription = { owner, subscriber, generation };
          if (owner.latestPublished) await subscriber(owner.latestPublished);
        }
        const result = await owner.promise;
        if (cancelled || generation !== refreshGeneration) return;
        persist(result.snapshots);
        setDomain(result.domain);
      } catch {
        // A failed refresh keeps the last good domain and retries on the next cycle.
      } finally {
        owner?.subscribers.delete(subscriber);
        if (activeSubscription?.generation === generation) activeSubscription = null;
        if (owner && refreshOwnerRef.current === owner) {
          refreshOwnerRef.current = null;
        }
        refreshInFlight = false;
        if (generation === refreshGeneration) scheduleRefresh();
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        clearRefreshTimer();
        void refresh();
      } else {
        clearRefreshTimer();
      }
    };

    document.addEventListener('visibilitychange', refreshWhenVisible);
    if (document.visibilityState === 'visible') void refresh();

    return () => {
      cancelled = true;
      refreshGeneration += 1;
      if (activeSubscription) {
        activeSubscription.owner.subscribers.delete(activeSubscription.subscriber);
        activeSubscription = null;
      }
      clearRefreshTimer();
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [coordinator, refreshIntervalMs]);

  return { domain, isInitialLoading: domain === null };
}
