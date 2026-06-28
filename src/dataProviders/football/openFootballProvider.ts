import type { FootballProvider, RawFixture, RawTeam } from './types/FootballProvider';

const FETCH_TIMEOUT_MS = 8000;
const WORLDCUP_URLS = [
  'https://raw.githubusercontent.com/openfootball/world-cup.json/master/2026/worldcup.json',
  'https://cdn.jsdelivr.net/gh/openfootball/world-cup.json@master/2026/worldcup.json',
  'https://api.github.com/repos/openfootball/world-cup.json/contents/2026/worldcup.json?ref=master',
];
const TEAMS_URLS = [
  'https://raw.githubusercontent.com/openfootball/world-cup.json/master/2026/teams.json',
  'https://cdn.jsdelivr.net/gh/openfootball/world-cup.json@master/2026/teams.json',
  'https://api.github.com/repos/openfootball/world-cup.json/contents/2026/teams.json?ref=master',
];

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
  score?: {
    ft?: number[];
  };
};

type OpenFootballWorldCup = {
  matches?: OpenFootballMatch[];
};

type OpenFootballTeams = {
  teams?: Array<{ id?: string; name: string }>;
};

type GitHubContentsResponse = {
  encoding?: unknown;
  content?: unknown;
};

let cachedWorldCup: OpenFootballWorldCup | null = null;

async function fetchWithTimeout(url: string, controller: AbortController): Promise<Response> {
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`request timed out after ${FETCH_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJsonFromCandidates<T>(urls: string[], label: string): Promise<T> {
  const controllers = urls.map(() => new AbortController());
  const errors: string[] = [];

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let remaining = urls.length;

    urls.forEach((url, index) => {
      const controller = controllers[index];
      fetchCandidateJson<T>(url, controller)
        .then((value) => {
          if (settled) return;
          settled = true;
          controllers.forEach((candidateController, candidateIndex) => {
            if (candidateIndex !== index) candidateController.abort();
          });
          resolve(value);
        })
        .catch((error: unknown) => {
          if (settled) return;
          errors.push(error instanceof Error ? error.message : String(error));
          remaining -= 1;
          if (remaining === 0) {
            reject(new Error(`OpenFootball ${label} fetch failed: ${errors.join('; ')}`));
          }
        });
    });
  });
}

async function fetchCandidateJson<T>(url: string, controller: AbortController): Promise<T> {
  try {
    const res = await fetchWithTimeout(url, controller);
    if (!res.ok) {
      throw new Error(`${url} returned ${res.status} ${res.statusText}`.trim());
    }

    return decodeCandidateJson<T>(url, await res.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${url} failed: ${message}`);
  }
}

function decodeCandidateJson<T>(url: string, payload: unknown): T {
  if (!url.includes('api.github.com')) return payload as T;

  const response = payload as GitHubContentsResponse;
  if (response.encoding !== 'base64' || typeof response.content !== 'string') {
    throw new Error('GitHub contents response is not base64 JSON');
  }

  const binary = atob(response.content.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function fetchWorldCup(): Promise<OpenFootballWorldCup> {
  if (cachedWorldCup) return cachedWorldCup;

  cachedWorldCup = await fetchJsonFromCandidates<OpenFootballWorldCup>(WORLDCUP_URLS, 'fixtures');
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

function finalScore(match: OpenFootballMatch): Pick<RawFixture, 'homeScore' | 'awayScore'> {
  const [homeScore, awayScore] = match.score?.ft ?? [];
  if (Number.isFinite(homeScore) && Number.isFinite(awayScore)) {
    return { homeScore, awayScore };
  }

  return {};
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
    ...finalScore(match),
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
    try {
      const data = await fetchJsonFromCandidates<OpenFootballTeams>(TEAMS_URLS, 'teams');
      return (data.teams ?? []).map((team) => ({
        id: team.id ?? team.name,
        name: team.name,
        country: team.name,
      }));
    } catch (error) {
      const fixtures = await this.fetchFixtures();
      if (fixtures.length > 0) return deriveTeams(fixtures);

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenFootball teams fetch failed: ${message}`);
    }
  },
};
