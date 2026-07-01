import { useEffect, useRef, useState } from 'react';
import { adaptWorldCupFixtures } from '../../../../../dataProviders/football/worldCupAdapter';
import { createSampleFixtureResult, loadFixturesWithFallback, type FixtureProviderResult } from '../../../../../dataProviders/football/fixtureProvider';
import { buildWorldCupDomain } from '../domain/buildWorldCupDomain';
import type { WorldCupDomainModel } from '../domain/WorldCupDomainModel';
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

const initialFixtureResult: FixtureProviderResult = createSampleFixtureResult();
export const WORLD_CUP_REFRESH_INTERVAL_MS = 60_000;

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

export function useWorldCupDomain(): WorldCupDomainModel {
  const [initialSnapshots] = useState<Record<string, PreMatchPredictionSnapshot>>(() => {
    const storage = browserStorage();
    return storage ? loadPreMatchPredictionSnapshots(storage) : {};
  });
  const snapshotsRef = useRef(initialSnapshots);
  const [domain, setDomain] = useState<WorldCupDomainModel>(() => buildWorldCupDomain(
    adaptWorldCupFixtures(initialFixtureResult),
    { preMatchPredictionSnapshots: initialSnapshots },
  ));

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
          const provisionalDomain = buildWorldCupDomain(
            adaptWorldCupFixtures(nextResult),
            {
              evaluationTimeMs,
              preMatchPredictionSnapshots: nextSnapshots,
            },
          );
          if (provisionalDomain.source !== 'sample' && provisionalDomain.source !== 'local') {
            const captured = capturePreMatchPredictionSnapshots({
              snapshots: nextSnapshots,
              matches: provisionalDomain.matches,
              predictions: provisionalDomain.predictions,
              now: evaluationTimeMs,
            });
            if (captured.changed) {
              nextSnapshots = captured.snapshots;
              snapshotsRef.current = nextSnapshots;
              const storage = browserStorage();
              if (storage) persistPreMatchPredictionSnapshots(storage, nextSnapshots);
            }
          }

          setDomain(provisionalDomain);
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

  return domain;
}
