import { useMemo } from 'react';
import { selectMatches, selectTeamDisplayName } from '../../modules/sports/football/worldCup/domain/selectors';
import { useWorldCupDomain } from '../../modules/sports/football/worldCup/hooks/useWorldCupDomain';

export function useLegacyWorldCupMatches() {
  const { domain, isInitialLoading } = useWorldCupDomain();

  return useMemo(() => {
    if (!domain) {
      return {
        matches: [],
        teams: {},
        source: 'sample' as const,
        providerName: 'loading',
        errors: [],
        meta: {
          totalMatches: 0,
          statusBreakdown: { scheduled: 0, live: 0, finished: 0 },
        },
        isLoading: isInitialLoading,
        featuredMatch: undefined,
        getTeamName: (teamId: string) => teamId,
      };
    }

    const matches = selectMatches(domain);

    return {
      matches,
      teams: domain.teams,
      source: domain.source,
      providerName: domain.source,
      errors: domain.errors ?? [],
      meta: {
        totalMatches: matches.length,
        statusBreakdown: matches.reduce((counts, match) => ({
          ...counts,
          [match.status]: counts[match.status] + 1,
        }), { scheduled: 0, live: 0, finished: 0 }),
      },
      isLoading: matches.length === 0,
      featuredMatch: matches[0],
      getTeamName: (teamId: string) => selectTeamDisplayName(domain, teamId),
    };
  }, [domain, isInitialLoading]);
}
