import { teams } from '../../modules/sports/football/worldCup/data/teams';
import { getCountryDisplayName } from '../../utils/countryNameMap';

export type MappedTeam = {
  teamId: string;
  displayName: string;
  rawName: string;
};

const aliasMap: Record<string, string> = {
  'usa': 'usa',
  'united states of america': 'usa',
  'america': 'usa',
  'korea republic': 'south-korea',
  'korea': 'south-korea',
  'republic of korea': 'south-korea',
  'great britain': 'england',
  'gb': 'england',
  'turkey': 'turkey',
  'côte d\'ivoire': 'ivory-coast',
  'cote d\'ivoire': 'ivory-coast',
  'the netherlands': 'netherlands',
  'holland': 'netherlands',
  'deutschland': 'germany',
  'espana': 'spain',
  'nippon': 'japan',
};

const idToTeam = new Map(teams.map((t) => [t.id, t]));
const nameToId = new Map(teams.map((t) => [t.name.toLowerCase(), t.id]));

for (const [alias, target] of Object.entries(aliasMap)) {
  if (!nameToId.has(alias)) {
    nameToId.set(alias, target);
  }
}

export function mapExternalTeamName(rawName: string): MappedTeam | null {
  const key = rawName.trim().toLowerCase();
  const id = nameToId.get(key);
  if (!id) return null;

  const team = idToTeam.get(id);
  if (!team) return null; // alias resolved to a team not in the tournament

  const displayName = getCountryDisplayName(team.name);

  return { teamId: id, displayName, rawName };
}

export function getTeamDisplayName(teamId: string): string {
  const team = idToTeam.get(teamId);
  if (!team) return teamId;
  return getCountryDisplayName(team.name);
}

export function getTeamId(rawName: string): string | null {
  const key = rawName.trim().toLowerCase();
  return nameToId.get(key) ?? null;
}
