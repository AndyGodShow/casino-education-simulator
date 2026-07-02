import type { InternationalResult } from './internationalResults';

export type CausalTeamRating = {
  team: string;
  asOf: string;
  matches: number;
  elo: number;
  rating: number;
  form: number;
  attack: number;
  defense: number;
  evidenceWeight: number;
  lastMatchDate: string | null;
  provenance: {
    source: 'martj42-international-results';
    method: 'time-causal-elo-and-recency';
    trustLevel: 'low' | 'medium';
  };
};

export type CausalRatedMatch = {
  match: InternationalResult;
  home: CausalTeamRating;
  away: CausalTeamRating;
  outcome: 'home' | 'draw' | 'away';
};

type RecentPerformance = {
  dateMs: number;
  score: number;
  goalsFor: number;
  goalsAgainst: number;
};

type MutableTeamState = {
  team: string;
  elo: number;
  matches: number;
  lastMatchDate: string | null;
  recent: RecentPerformance[];
};

const INITIAL_ELO = 1500;
const HOME_ELO_ADVANTAGE = 80;
const ELO_K = 24;
const RECENCY_HALF_LIFE_DAYS = 180;
const PRIOR_WEIGHT = 2;
const DAY_MS = 86_400_000;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const rounded = (value: number) => Number(value.toFixed(3));

const sortedResults = (results: InternationalResult[]) => [...results].sort((left, right) =>
  left.date.localeCompare(right.date) || left.id.localeCompare(right.id));

const createState = (team: string): MutableTeamState => ({
  team,
  elo: INITIAL_ELO,
  matches: 0,
  lastMatchDate: null,
  recent: [],
});

const stateFor = (states: Map<string, MutableTeamState>, team: string) => {
  const existing = states.get(team);
  if (existing) return existing;
  const created = createState(team);
  states.set(team, created);
  return created;
};

const recencyWeight = (dateMs: number, asOfMs: number) =>
  2 ** (-Math.max(0, asOfMs - dateMs) / (RECENCY_HALF_LIFE_DAYS * DAY_MS));

const weightedAverage = (
  recent: RecentPerformance[],
  asOfMs: number,
  pick: (performance: RecentPerformance) => number,
  prior: number,
) => {
  const weighted = recent.reduce((sum, performance) =>
    sum + recencyWeight(performance.dateMs, asOfMs) * pick(performance), 0);
  const evidence = recent.reduce((sum, performance) =>
    sum + recencyWeight(performance.dateMs, asOfMs), 0);
  return {
    value: (weighted + PRIOR_WEIGHT * prior) / (evidence + PRIOR_WEIGHT),
    evidence,
  };
};

const snapshotState = (
  state: MutableTeamState,
  asOfMs: number,
): CausalTeamRating => {
  const form = weightedAverage(state.recent, asOfMs, (performance) => performance.score, 0.5);
  const attack = weightedAverage(state.recent, asOfMs, (performance) => performance.goalsFor, 1.2);
  const defense = weightedAverage(state.recent, asOfMs, (performance) => performance.goalsAgainst, 1.2);

  return {
    team: state.team,
    asOf: new Date(asOfMs).toISOString(),
    matches: state.matches,
    elo: rounded(state.elo),
    rating: rounded(clamp(75 + (state.elo - INITIAL_ELO) / 16, 45, 95)),
    form: rounded(clamp(50 + form.value * 40, 45, 92)),
    attack: rounded(clamp(70 + (attack.value - 1.2) * 10, 45, 95)),
    defense: rounded(clamp(70 + (1.2 - defense.value) * 10, 45, 95)),
    evidenceWeight: rounded(form.evidence),
    lastMatchDate: state.lastMatchDate,
    provenance: {
      source: 'martj42-international-results',
      method: 'time-causal-elo-and-recency',
      trustLevel: state.matches >= 8 && form.evidence >= 3 ? 'medium' : 'low',
    },
  };
};

const matchOutcome = (match: InternationalResult): CausalRatedMatch['outcome'] =>
  match.homeScore > match.awayScore ? 'home' : match.homeScore < match.awayScore ? 'away' : 'draw';

const resultScore = (outcome: CausalRatedMatch['outcome'], side: 'home' | 'away') => {
  if (outcome === 'draw') return 0.5;
  return outcome === side ? 1 : 0;
};

const tournamentWeight = (tournament: string) => {
  const normalized = tournament.toLowerCase();
  if (normalized.includes('world cup')) return 1.2;
  if (normalized.includes('friendly')) return 0.75;
  return 1;
};

const applyResult = (
  home: MutableTeamState,
  away: MutableTeamState,
  match: InternationalResult,
  outcome: CausalRatedMatch['outcome'],
) => {
  const homeAdvantage = match.neutral ? 0 : HOME_ELO_ADVANTAGE;
  const expectedHome = 1 / (1 + 10 ** ((away.elo - (home.elo + homeAdvantage)) / 400));
  const actualHome = resultScore(outcome, 'home');
  const goalMargin = Math.abs(match.homeScore - match.awayScore);
  const marginMultiplier = 1 + Math.log1p(goalMargin) * 0.35;
  const adjustment = ELO_K * tournamentWeight(match.tournament) * marginMultiplier
    * (actualHome - expectedHome);
  home.elo += adjustment;
  away.elo -= adjustment;

  const dateMs = Date.parse(`${match.date}T00:00:00.000Z`);
  home.recent.push({
    dateMs,
    score: actualHome,
    goalsFor: match.homeScore,
    goalsAgainst: match.awayScore,
  });
  away.recent.push({
    dateMs,
    score: 1 - actualHome,
    goalsFor: match.awayScore,
    goalsAgainst: match.homeScore,
  });
  home.recent = home.recent.slice(-20);
  away.recent = away.recent.slice(-20);
  home.matches += 1;
  away.matches += 1;
  home.lastMatchDate = match.date;
  away.lastMatchDate = match.date;
};

export function buildCausalRatingTimeline(
  results: InternationalResult[],
): CausalRatedMatch[] {
  const states = new Map<string, MutableTeamState>();

  return sortedResults(results).map((match) => {
    const matchTime = Date.parse(`${match.date}T00:00:00.000Z`);
    const home = stateFor(states, match.homeTeam);
    const away = stateFor(states, match.awayTeam);
    const ratedMatch: CausalRatedMatch = {
      match,
      home: snapshotState(home, matchTime),
      away: snapshotState(away, matchTime),
      outcome: matchOutcome(match),
    };
    applyResult(home, away, match, ratedMatch.outcome);
    return ratedMatch;
  });
}

export function buildCausalTeamRatings(
  results: InternationalResult[],
  evaluationTimeMs: number,
): Record<string, CausalTeamRating> {
  const states = new Map<string, MutableTeamState>();
  const eligibleResults = sortedResults(results).filter((match) =>
    Date.parse(`${match.date}T00:00:00.000Z`) < evaluationTimeMs);

  for (const match of eligibleResults) {
    const home = stateFor(states, match.homeTeam);
    const away = stateFor(states, match.awayTeam);
    applyResult(home, away, match, matchOutcome(match));
  }

  return Object.fromEntries(
    [...states.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([team, state]) => [team, snapshotState(state, evaluationTimeMs)]),
  );
}
