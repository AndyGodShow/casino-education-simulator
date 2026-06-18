import type { FootballProvider, RawFixture, RawTeam } from './types/FootballProvider';

const WORLDCUP_URL = 'https://raw.githubusercontent.com/openfootball/world-cup.json/master/2026/worldcup.json';
const TEAMS_URL = 'https://raw.githubusercontent.com/openfootball/world-cup.json/master/2026/teams.json';

type OpenFootballMatch = {
  id?: string;
  num?: number;
  team1?: string;
  team2?: string;
  home_team?: string;
  away_team?: string;
  datetime?: string;
  date?: string;
  time?: string;
  group?: string;
  ground?: string;
  round?: string;
};

type OpenFootballWorldCup = {
  matches?: OpenFootballMatch[];
};

let cachedWorldCup: OpenFootballWorldCup | null = null;

async function fetchWorldCup(): Promise<OpenFootballWorldCup> {
  if (cachedWorldCup) return cachedWorldCup;

  const res = await fetch(WORLDCUP_URL);
  if (!res.ok) {
    throw new Error('OpenFootball fixtures fetch failed');
  }

  cachedWorldCup = await res.json();
  return cachedWorldCup ?? {};
}

function parseKickoff(match: OpenFootballMatch): string {
  if (match.datetime) return match.datetime;
  if (!match.date || !match.time) return '';

  const [hours = '00', minutes = '00'] = match.time.split(' ')[0]?.split(':') ?? [];
  const offset = match.time.match(/UTC([+-]\d{1,2})/)?.[1] ?? '+0';
  const offsetHours = Number(offset);
  const utcHour = Number(hours) - offsetHours;

  return new Date(Date.UTC(
    Number(match.date.slice(0, 4)),
    Number(match.date.slice(5, 7)) - 1,
    Number(match.date.slice(8, 10)),
    utcHour,
    Number(minutes),
  )).toISOString();
}

function mapMatch(match: OpenFootballMatch, index: number): RawFixture {
  return {
    id: String(match.id ?? match.num ?? `openfootball-${index + 1}`),
    homeTeam: match.home_team ?? match.team1 ?? '',
    awayTeam: match.away_team ?? match.team2 ?? '',
    kickoff: parseKickoff(match),
    group: match.group,
    ground: match.ground,
    round: match.round,
    num: match.num,
  };
}

function deriveTeams(matches: RawFixture[]): RawTeam[] {
  const names = new Set<string>();
  for (const match of matches) {
    if (typeof match.homeTeam === 'string') names.add(match.homeTeam);
    if (typeof match.awayTeam === 'string') names.add(match.awayTeam);
  }

  return Array.from(names).map((name) => ({
    id: name,
    name,
    country: name,
  }));
}

export const openFootballProvider: FootballProvider = {
  name: 'openfootball',
  status: 'active',
  async fetchFixtures() {
    const data = await fetchWorldCup();
    return (data.matches ?? []).map(mapMatch);
  },
  async fetchTeams() {
    const res = await fetch(TEAMS_URL);
    if (res.ok) {
      const data = await res.json();
      return (data.teams ?? []).map((team: { id?: string; name: string }) => ({
        id: team.id ?? team.name,
        name: team.name,
        country: team.name,
      }));
    }

    const fixtures = await this.fetchFixtures();
    if (fixtures.length > 0) return deriveTeams(fixtures);

    throw new Error('OpenFootball teams fetch failed');
  },
};
