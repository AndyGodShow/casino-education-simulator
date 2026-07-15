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

export const WORLD_CUP_CAUSAL_RATING_CONFIG = {
  initialElo: 1_500,
  homeEloAdvantage: 80,
  eloDivisor: 400,
  eloK: 24,
  goalMarginWeight: 0.35,
  tournamentWeight: { worldCup: 1.2, friendly: 0.75, default: 1 },
  recencyHalfLifeDays: 180,
  priorWeight: 2,
  recentMatchLimit: 20,
  projection: {
    formPrior: 0.5,
    goalsPrior: 1.2,
    rating: { base: 75, divisor: 16, min: 45, max: 95 },
    form: { base: 50, weight: 40, min: 45, max: 92 },
    attackDefense: { base: 70, weight: 10, min: 45, max: 95 },
    trust: { minimumMatches: 8, minimumEvidence: 3 },
    roundingDigits: 3,
  },
} as const;

const DAY_MS = 86_400_000;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const rounded = (value: number) => Number(
  value.toFixed(WORLD_CUP_CAUSAL_RATING_CONFIG.projection.roundingDigits),
);

const sortedResults = (results: InternationalResult[]) => [...results].sort((left, right) =>
  left.date.localeCompare(right.date) || left.id.localeCompare(right.id));

const createState = (team: string): MutableTeamState => ({
  team,
  elo: WORLD_CUP_CAUSAL_RATING_CONFIG.initialElo,
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
  2 ** (-Math.max(0, asOfMs - dateMs)
    / (WORLD_CUP_CAUSAL_RATING_CONFIG.recencyHalfLifeDays * DAY_MS));

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
    value: (weighted + WORLD_CUP_CAUSAL_RATING_CONFIG.priorWeight * prior)
      / (evidence + WORLD_CUP_CAUSAL_RATING_CONFIG.priorWeight),
    evidence,
  };
};

const snapshotState = (
  state: MutableTeamState,
  asOfMs: number,
): CausalTeamRating => {
  const config = WORLD_CUP_CAUSAL_RATING_CONFIG;
  const { projection } = config;
  const form = weightedAverage(
    state.recent,
    asOfMs,
    (performance) => performance.score,
    projection.formPrior,
  );
  const attack = weightedAverage(
    state.recent,
    asOfMs,
    (performance) => performance.goalsFor,
    projection.goalsPrior,
  );
  const defense = weightedAverage(
    state.recent,
    asOfMs,
    (performance) => performance.goalsAgainst,
    projection.goalsPrior,
  );

  return {
    team: state.team,
    asOf: new Date(asOfMs).toISOString(),
    matches: state.matches,
    elo: rounded(state.elo),
    rating: rounded(clamp(
      projection.rating.base + (state.elo - config.initialElo) / projection.rating.divisor,
      projection.rating.min,
      projection.rating.max,
    )),
    form: rounded(clamp(
      projection.form.base + form.value * projection.form.weight,
      projection.form.min,
      projection.form.max,
    )),
    attack: rounded(clamp(
      projection.attackDefense.base
        + (attack.value - projection.goalsPrior) * projection.attackDefense.weight,
      projection.attackDefense.min,
      projection.attackDefense.max,
    )),
    defense: rounded(clamp(
      projection.attackDefense.base
        + (projection.goalsPrior - defense.value) * projection.attackDefense.weight,
      projection.attackDefense.min,
      projection.attackDefense.max,
    )),
    evidenceWeight: rounded(form.evidence),
    lastMatchDate: state.lastMatchDate,
    provenance: {
      source: 'martj42-international-results',
      method: 'time-causal-elo-and-recency',
      trustLevel: state.matches >= projection.trust.minimumMatches
        && form.evidence >= projection.trust.minimumEvidence ? 'medium' : 'low',
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
  const weights = WORLD_CUP_CAUSAL_RATING_CONFIG.tournamentWeight;
  if (normalized.includes('world cup')) return weights.worldCup;
  if (normalized.includes('friendly')) return weights.friendly;
  return weights.default;
};

const applyResult = (
  home: MutableTeamState,
  away: MutableTeamState,
  match: InternationalResult,
  outcome: CausalRatedMatch['outcome'],
) => {
  const config = WORLD_CUP_CAUSAL_RATING_CONFIG;
  const homeAdvantage = match.neutral ? 0 : config.homeEloAdvantage;
  const expectedHome = 1
    / (1 + 10 ** ((away.elo - (home.elo + homeAdvantage)) / config.eloDivisor));
  const actualHome = resultScore(outcome, 'home');
  const goalMargin = Math.abs(match.homeScore - match.awayScore);
  const marginMultiplier = 1 + Math.log1p(goalMargin) * config.goalMarginWeight;
  const adjustment = config.eloK * tournamentWeight(match.tournament) * marginMultiplier
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
  home.recent = home.recent.slice(-config.recentMatchLimit);
  away.recent = away.recent.slice(-config.recentMatchLimit);
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
