import { useEffect, useMemo, useState } from 'react';
import { adaptWorldCupFixtures } from '../../../../../dataProviders/football/worldCupAdapter';
import { createSampleFixtureResult, loadFixturesWithFallback, type FixtureProviderResult } from '../../../../../dataProviders/football/fixtureProvider';
import { buildWorldCupDomain } from '../domain/buildWorldCupDomain';
import type { WorldCupDomainModel } from '../domain/WorldCupDomainModel';

const initialFixtureResult: FixtureProviderResult = createSampleFixtureResult();

export function useWorldCupDomain(): WorldCupDomainModel {
  const [domainInput, setDomainInput] = useState<{
    fixtureResult: FixtureProviderResult;
    evaluationTimeMs?: number;
  }>({
    fixtureResult: initialFixtureResult,
  });

  useEffect(() => {
    let cancelled = false;

    loadFixturesWithFallback()
      .then((nextResult) => {
        if (!cancelled) {
          setDomainInput({
            fixtureResult: nextResult,
            evaluationTimeMs: Date.now(),
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setDomainInput({
            fixtureResult: createSampleFixtureResult([message]),
            evaluationTimeMs: Date.now(),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => buildWorldCupDomain(
    adaptWorldCupFixtures(domainInput.fixtureResult),
    { evaluationTimeMs: domainInput.evaluationTimeMs },
  ), [domainInput]);
}
