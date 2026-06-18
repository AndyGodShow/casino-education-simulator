import { useEffect, useMemo, useState } from 'react';
import { adaptWorldCupFixtures } from '../../../../../dataProviders/football/worldCupAdapter';
import { loadFixturesWithFallback, type FixtureProviderResult } from '../../../../../dataProviders/football/fixtureProvider';
import { resolveTeamsFromMatches } from '../../../../../dataProviders/football/identity/teamResolver';
import { buildWorldCupDomain } from '../domain/buildWorldCupDomain';
import type { WorldCupDomainModel } from '../domain/WorldCupDomainModel';

const emptyFixtureResult: FixtureProviderResult = {
  fixtures: [],
  teams: [],
  teamRegistry: resolveTeamsFromMatches([], 'local'),
  source: 'local',
  providerName: 'none',
  errors: [],
};

export function useWorldCupDomain(): WorldCupDomainModel {
  const [fixtureResult, setFixtureResult] = useState<FixtureProviderResult>(emptyFixtureResult);

  useEffect(() => {
    let cancelled = false;

    loadFixturesWithFallback()
      .then((nextResult) => {
        if (!cancelled) setFixtureResult(nextResult);
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setFixtureResult({ ...emptyFixtureResult, errors: [message] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => buildWorldCupDomain(adaptWorldCupFixtures(fixtureResult)), [fixtureResult]);
}
