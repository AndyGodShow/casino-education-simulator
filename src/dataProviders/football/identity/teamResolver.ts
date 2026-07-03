import type { RawFixture } from '../types/FootballProvider';
import {
  createWorldCupTeamIdentityRegistry,
  generateStableId,
  normalizeName,
  TeamIdentityRegistry,
  type TeamIdentity,
} from './teamIdentitySystem';

function rawString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readTeamNames(match: RawFixture | { homeTeamId?: string; awayTeamId?: string }) {
  const raw = match as RawFixture;
  return [
    rawString(raw.homeTeam) ?? raw.home_team ?? raw.team1 ?? raw.homeTeamId,
    rawString(raw.awayTeam) ?? raw.away_team ?? raw.team2 ?? raw.awayTeamId,
  ].filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
}

function withProviderSource(team: TeamIdentity, provider: string, rawName: string): TeamIdentity {
  return {
    ...team,
    aliases: Array.from(new Set([...team.aliases, rawName])),
    sourceMap: {
      ...team.sourceMap,
      [provider]: rawName,
    },
  };
}

export function resolveTeamsFromMatches(
  matches: Array<RawFixture | { homeTeamId?: string; awayTeamId?: string }>,
  provider = 'openfootball',
) {
  const knownTeams = createWorldCupTeamIdentityRegistry();
  const registry = new TeamIdentityRegistry();
  const seen = new Map<string, TeamIdentity>();

  for (const match of matches) {
    for (const name of readTeamNames(match)) {
      if (!seen.has(name)) {
        const knownTeam = knownTeams.resolve(name, provider) ?? knownTeams.resolve(name);
        const team: TeamIdentity = knownTeam
          ? withProviderSource(knownTeam, provider, name)
          : {
              teamId: generateStableId(name),
              canonicalName: normalizeName(name),
              aliases: [name],
              sourceMap: {
                [provider]: name,
              },
            };
        seen.set(name, team);
        registry.register(team);
      }
    }
  }

  return registry;
}
