import { teams as worldCupTeams } from '../../../modules/sports/football/worldCup/data/teams';

export type TeamIdentity = {
  teamId: string;
  canonicalName: string;
  aliases: string[];
  country?: string;
  sourceMap: Record<string, string>;
};

const aliasMap: Record<string, string> = {
  usa: 'usa',
  'united states': 'usa',
  'united states of america': 'usa',
  america: 'usa',
  'korea republic': 'south-korea',
  korea: 'south-korea',
  'republic of korea': 'south-korea',
  'south korea': 'south-korea',
  'great britain': 'england',
  gb: 'england',
  turkey: 'turkey',
  turkiye: 'turkey',
  türkiye: 'turkey',
  "côte d'ivoire": 'ivory-coast',
  "cote d'ivoire": 'ivory-coast',
  'ivory coast': 'ivory-coast',
  'the netherlands': 'netherlands',
  holland: 'netherlands',
  deutschland: 'germany',
  espana: 'spain',
  nippon: 'japan',
};

function keyFor(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function generateStableId(name: string): string {
  return keyFor(normalizeName(name))
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export class TeamIdentityRegistry {
  private teams = new Map<string, TeamIdentity>();

  register(team: TeamIdentity) {
    this.teams.set(team.teamId, {
      ...team,
      canonicalName: normalizeName(team.canonicalName),
      aliases: Array.from(new Set(team.aliases.map(normalizeName))),
    });
  }

  resolve(name: string, provider?: string): TeamIdentity | null {
    const lookupKey = keyFor(name);

    if (provider) {
      for (const team of this.teams.values()) {
        if (team.sourceMap[provider] && keyFor(team.sourceMap[provider]) === lookupKey) {
          return team;
        }
      }
    }

    for (const team of this.teams.values()) {
      if (
        keyFor(team.canonicalName) === lookupKey ||
        team.aliases.some((alias) => keyFor(alias) === lookupKey) ||
        Object.values(team.sourceMap).some((sourceName) => keyFor(sourceName) === lookupKey)
      ) {
        return team;
      }
    }

    const aliasedId = aliasMap[lookupKey];
    return aliasedId ? this.teams.get(aliasedId) ?? null : null;
  }

  getAll() {
    return Array.from(this.teams.values());
  }
}

export function createWorldCupTeamIdentityRegistry(): TeamIdentityRegistry {
  const registry = new TeamIdentityRegistry();

  for (const team of worldCupTeams) {
    const aliases = [team.id, team.name];
    for (const [alias, teamId] of Object.entries(aliasMap)) {
      if (teamId === team.id) aliases.push(alias);
    }

    registry.register({
      teamId: team.id,
      canonicalName: team.name,
      aliases,
      country: team.name,
      sourceMap: {},
    });
  }

  return registry;
}
