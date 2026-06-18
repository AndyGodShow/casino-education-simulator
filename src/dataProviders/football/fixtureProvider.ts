import type { WorldCupMatch, WorldCupTeam } from '../../modules/sports/football/worldCup/types';
import type { FootballProviderResult } from './types';
import type { FootballProvider as RawFootballProvider, RawFixture, RawTeam } from './types/FootballProvider';
import { fixtures } from '../../modules/sports/football/worldCup/data/fixtures';
import { teams } from '../../modules/sports/football/worldCup/data/teams';
import { loadApiFootballFixtures } from './apiFootballAdapter';
import { resolveTeamsFromMatches } from './identity/teamResolver';
import type { TeamIdentityRegistry } from './identity/teamIdentitySystem';
import { openFootballProvider } from './openFootballProvider';
import { loadSportMonksFixtures } from './sportMonksAdapter';

export type FixtureSource = WorldCupMatch['source'];

export type FixtureProviderResult = {
  fixtures: Array<WorldCupMatch | RawFixture>;
  teams: Array<WorldCupTeam | RawTeam>;
  teamRegistry: TeamIdentityRegistry;
  source: FixtureSource;
  providerName: string;
  errors: string[];
};

export type WorldCupProviderOutput = FixtureProviderResult;

export type FixtureProvider = {
  name: string;
  source: FixtureSource;
  loader: () => Promise<FootballProviderResult>;
};

export type FixtureProviderOptions = {
  fallbackProviders?: FixtureProvider[];
};

function defaultProviders(): FixtureProvider[] {
  return [
    providerFromFootballProvider(openFootballProvider),
    { name: 'API-Football', source: 'api-football', loader: loadApiFootballFixtures },
    { name: 'SportMonks', source: 'sportmonks', loader: loadSportMonksFixtures },
  ];
}

function providerFromFootballProvider(provider: RawFootballProvider): FixtureProvider {
  return {
    name: provider.name,
    source: 'openfootball',
    loader: async () => {
      const [matches, providerTeams] = await Promise.all([
        provider.fetchFixtures(),
        provider.fetchTeams(),
      ]);

      return {
        status: matches.length > 0 ? 'available' : 'failed',
        source: 'openfootball',
        matches,
        teams: providerTeams,
        message: matches.length > 0 ? 'OpenFootball fixtures loaded.' : 'OpenFootball returned no matches.',
      };
    },
  };
}

function sampleFallbackProvider(): FixtureProvider {
  return {
    name: 'Sample Fixtures',
    source: 'sample',
    loader: async () => ({
      status: 'available',
      source: 'sample',
      matches: fixtures.map((match) => ({ ...match, source: 'sample' })),
      teams,
      message: 'Sample World Cup data loaded as fallback.',
    }),
  };
}

function localFallbackProvider(): FixtureProvider {
  return {
    name: 'Local Seed',
    source: 'local',
    loader: async () => ({
      status: 'available',
      source: 'local',
      matches: fixtures.map((match) => ({ ...match, source: 'local' })),
      teams,
      message: 'Local seed data loaded as final fallback.',
    }),
  };
}

function teamsFromRegistry(teamRegistry: TeamIdentityRegistry): RawTeam[] {
  return teamRegistry.getAll().map((team) => ({
    id: team.teamId,
    name: team.canonicalName,
    country: team.country,
  }));
}

export async function loadFixturesWithFallback(
  providers?: FixtureProvider[],
  options: FixtureProviderOptions = {}
): Promise<FixtureProviderResult> {
  const fallbackProviders = options.fallbackProviders ?? [sampleFallbackProvider(), localFallbackProvider()];
  const chain = [...(providers ?? defaultProviders()), ...fallbackProviders];
  const errors: string[] = [];

  for (const provider of chain) {
    try {
      const result = await provider.loader();
      if (result.status === 'available' && result.matches.length > 0) {
        const teamRegistry = resolveTeamsFromMatches(result.matches, provider.source);
        return {
          fixtures: result.matches,
          teams: teamsFromRegistry(teamRegistry),
          teamRegistry,
          source: provider.source,
          providerName: provider.name,
          errors,
        };
      }
      if (result.status === 'failed') {
        errors.push(`${provider.name}: ${result.message}`);
      } else {
        errors.push(`${provider.name}: ${result.message || 'No matches returned'}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider.name}: ${msg}`);
    }
  }

  return {
    fixtures: [],
    teams: [],
    teamRegistry: resolveTeamsFromMatches([], 'local'),
    source: 'local',
    providerName: 'none',
    errors,
  };
}
