import type { MatchExternalIntelligenceInput, WorldCupMatch, WorldCupTeam } from '../../modules/sports/football/worldCup/types';
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
  matchIntelligence?: Record<string, MatchExternalIntelligenceInput>;
  errors: string[];
};

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
      const matchIntelligence = await provider.fetchMatchIntelligence?.();

      return {
        status: matches.length > 0 ? 'available' : 'failed',
        source: 'openfootball',
        matches,
        teams: providerTeams,
        matchIntelligence,
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

function resolveProviderTeamId(
  teamRegistry: TeamIdentityRegistry,
  team: WorldCupTeam | RawTeam,
  source: FixtureSource,
) {
  const byId = teamRegistry.resolve(team.id, source) ?? teamRegistry.resolve(team.id);
  if (byId) return byId.teamId;

  const byName = teamRegistry.resolve(team.name, source) ?? teamRegistry.resolve(team.name);
  return byName?.teamId ?? team.id;
}

function mergeProviderTeams(
  teamRegistry: TeamIdentityRegistry,
  providerTeams: Array<WorldCupTeam | RawTeam>,
  source: FixtureSource,
): Array<WorldCupTeam | RawTeam> {
  const merged = new Map<string, WorldCupTeam | RawTeam>(
    teamsFromRegistry(teamRegistry).map((team) => [team.id, team]),
  );

  for (const team of providerTeams) {
    const teamId = resolveProviderTeamId(teamRegistry, team, source);
    const existing = merged.get(teamId);
    if (!existing) continue;

    merged.set(teamId, {
      ...existing,
      ...team,
      id: teamId,
      name: team.name ?? existing?.name ?? teamId,
    });
  }

  return Array.from(merged.values());
}

export function createSampleFixtureResult(errors: string[] = []): FixtureProviderResult {
  const sampleFixtures = fixtures.map((match) => ({ ...match, source: 'sample' as const }));
  const teamRegistry = resolveTeamsFromMatches(sampleFixtures, 'sample');

  return {
    fixtures: sampleFixtures,
    teams: mergeProviderTeams(teamRegistry, teams, 'sample'),
    teamRegistry,
    source: 'sample',
    providerName: 'Sample Fixtures',
    errors,
  };
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
          teams: mergeProviderTeams(teamRegistry, result.teams, provider.source),
          teamRegistry,
          source: provider.source,
          providerName: provider.name,
          matchIntelligence: result.matchIntelligence,
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
