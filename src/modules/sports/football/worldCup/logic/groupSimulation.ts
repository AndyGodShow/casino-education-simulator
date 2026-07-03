import type { WorldCupGroup, WorldCupMatch, WorldCupTeam } from '../types';
import { predictMatch } from './predictionEngine';
import type { DataTrustInfo } from '../../../../core/trustLayer/dataTruth';
import { evaluateMatchTruth } from '../../../../core/trustLayer/trustEvaluator';
import { hasUnresolvedTeamPlaceholder } from './teamPlaceholders';

export type GroupStanding = {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export type QualificationProbability = {
  teamId: string;
  groupWinner: number;
  groupRunnerUp: number;
  thirdPlaceQualified: number;
  eliminated: number;
  qualified: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  weightedConfidence: number;
  warning?: string;
  truth: DataTrustInfo;
};

export type SimulationConfig = {
  iterations: number;
  truthLevelWeighting: boolean;
  matches?: WorldCupMatch[];
  teams?: Record<string, WorldCupTeam>;
};

const emptyStanding = (teamId: string): GroupStanding => ({
  teamId,
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  points: 0,
});

export function calculateGroupStandings(matches: WorldCupMatch[]): GroupStanding[] {
  const table = new Map<string, GroupStanding>();

  for (const match of matches) {
    const home = table.get(match.homeTeamId) ?? emptyStanding(match.homeTeamId);
    const away = table.get(match.awayTeamId) ?? emptyStanding(match.awayTeamId);
    const homeScore = match.homeScore ?? 0;
    const awayScore = match.awayScore ?? 0;

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (homeScore < awayScore) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }

    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
    table.set(home.teamId, home);
    table.set(away.teamId, away);
  }

  return Array.from(table.values());
}

export function rankGroupTeams(standings: GroupStanding[]) {
  return [...standings].sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.teamId.localeCompare(b.teamId),
  );
}

export const rankThirdPlacedTeams = (thirdPlacedStandings: GroupStanding[]) => rankGroupTeams(thirdPlacedStandings);

type ScoreProbabilityEntry = {
  home: number;
  away: number;
  probability: number;
};

const seededUnitInterval = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
};

export function sampleScoreFromDistribution(
  matrix: ScoreProbabilityEntry[],
  draw: number,
): readonly [number, number] {
  const target = Math.min(0.999999999, Math.max(0, Number.isFinite(draw) ? draw : 0));
  let cumulative = 0;

  for (const entry of matrix) {
    cumulative += Math.max(0, entry.probability);
    if (target < cumulative) return [entry.home, entry.away] as const;
  }

  const fallback = matrix[matrix.length - 1];
  return fallback ? [fallback.home, fallback.away] as const : [0, 0] as const;
}

const hasSourceScore = (match: WorldCupMatch) =>
  typeof match.homeScore === 'number' && typeof match.awayScore === 'number';

const deterministicScore = (match: WorldCupMatch, iteration: number, teamLookup: Record<string, WorldCupTeam>) => {
  const home = teamLookup[match.homeTeamId];
  const away = teamLookup[match.awayTeamId];
  if (!home || !away) return [0, 0] as const;
  const prediction = predictMatch(match, home, away);
  const draw = seededUnitInterval(`${iteration}:${match.id}:${match.homeTeamId}:${match.awayTeamId}`);
  return sampleScoreFromDistribution(prediction.decisionLayer.scoreDistribution, draw);
};

const scoreDistributionCache = (
  matches: WorldCupMatch[],
  teamLookup: Record<string, WorldCupTeam>,
): Record<string, ScoreProbabilityEntry[]> => Object.fromEntries(
  matches.flatMap((match) => {
    if (match.status === 'finished' && hasSourceScore(match)) return [];
    const home = teamLookup[match.homeTeamId];
    const away = teamLookup[match.awayTeamId];
    if (!home || !away) return [];
    return [[match.id, predictMatch(match, home, away).decisionLayer.scoreDistribution]];
  }),
);

const deterministicScoreFromCache = (
  match: WorldCupMatch,
  iteration: number,
  teamLookup: Record<string, WorldCupTeam>,
  distributions?: Record<string, ScoreProbabilityEntry[]>,
) => {
  const cached = distributions?.[match.id];
  if (!cached) return deterministicScore(match, iteration, teamLookup);
  const draw = seededUnitInterval(`${iteration}:${match.id}:${match.homeTeamId}:${match.awayTeamId}`);
  return sampleScoreFromDistribution(cached, draw);
};

const simulateTournament = (
  iteration = 0,
  sourceMatches: WorldCupMatch[] = [],
  teamLookup: Record<string, WorldCupTeam> = {},
  distributions?: Record<string, ScoreProbabilityEntry[]>,
) => {
  const simulatedMatches = sourceMatches.map((match) => {
    if (match.status === 'finished' && hasSourceScore(match)) {
      return { ...match, status: 'finished' as const };
    }

    const [homeScore, awayScore] = deterministicScoreFromCache(
      match,
      iteration,
      teamLookup,
      distributions,
    );
    return { ...match, status: 'finished' as const, homeScore, awayScore };
  });
  const groupResults = new Map<WorldCupGroup, GroupStanding[]>();
  const qualified = new Set<string>();
  const thirdPlaced: GroupStanding[] = [];
  const groups = Array.from(new Set(simulatedMatches.flatMap((match) => (match.group ? [match.group] : [])))).sort();

  for (const group of groups) {
    const standings = rankGroupTeams(calculateGroupStandings(simulatedMatches.filter((match) => match.group === group)));
    groupResults.set(group, standings);
    standings.slice(0, 2).forEach((standing) => qualified.add(standing.teamId));
    if (standings[2]) thirdPlaced.push(standings[2]);
  }

  rankThirdPlacedTeams(thirdPlaced).slice(0, 8).forEach((standing) => qualified.add(standing.teamId));
  return { matches: simulatedMatches, groupResults, qualified };
};

export function simulateOneTournament(
  iteration = 0,
  sourceMatches: WorldCupMatch[] = [],
  teamLookup: Record<string, WorldCupTeam> = {},
) {
  return simulateTournament(iteration, sourceMatches, teamLookup);
}

const confidenceInterval = (probability: number, iterations: number, truthConfidence: number) => {
  const samplingError = 1.96 * Math.sqrt((probability * (1 - probability)) / iterations);
  const truthPenalty = (1 - truthConfidence) * 0.12;
  const margin = samplingError + truthPenalty;
  return {
    lower: Math.max(0, probability - margin),
    upper: Math.min(1, probability + margin),
  };
};

const normalizeSimulationConfig = (input: number | Partial<SimulationConfig> = 1000): SimulationConfig => {
  if (typeof input === 'number') {
    return { iterations: input, truthLevelWeighting: true };
  }
  return {
    iterations: input.iterations ?? 1000,
    truthLevelWeighting: input.truthLevelWeighting ?? true,
    matches: input.matches,
    teams: input.teams,
  };
};

export function simulateManyTournaments(config: number | Partial<SimulationConfig> = 1000) {
  const normalizedConfig = normalizeSimulationConfig(config);
  const safeIterations = Math.max(1, Math.floor(Number.isFinite(normalizedConfig.iterations) ? normalizedConfig.iterations : 1000));
  const sourceMatches = (normalizedConfig.matches ?? [])
    .filter((match) => Boolean(match.group) && !hasUnresolvedTeamPlaceholder(match));
  const teamLookup = normalizedConfig.teams ?? {};
  const distributions = scoreDistributionCache(sourceMatches, teamLookup);
  const teamIds = Array.from(new Set(sourceMatches.flatMap((match) => [match.homeTeamId, match.awayTeamId])));
  if (sourceMatches.length === 0 || teamIds.length === 0) return [];
  const counts = new Map<string, QualificationProbability>();
  const truth = sourceMatches.reduce((lowest, match) => {
    const current = evaluateMatchTruth(match);
    return current.confidence < lowest.confidence ? current : lowest;
  }, evaluateMatchTruth(sourceMatches[0]));
  const weightedConfidence = normalizedConfig.truthLevelWeighting ? truth.confidence : 1;
  const warning = truth.level === 'local_seed'
    ? 'Local seed simulation: interval is widened because fixture and rating inputs are not live provider data.'
    : truth.level === 'sample'
      ? 'Sample data simulation: use for education, not forecasting.'
      : undefined;

  teamIds.forEach((teamId) => counts.set(teamId, {
    teamId,
    groupWinner: 0,
    groupRunnerUp: 0,
    thirdPlaceQualified: 0,
    eliminated: 0,
    qualified: 0,
    confidenceInterval: { lower: 0, upper: 0 },
    weightedConfidence,
    warning,
    truth,
  }));

  for (let i = 0; i < safeIterations; i += 1) {
    const result = simulateTournament(i, sourceMatches, teamLookup, distributions);
    for (const groupStandings of result.groupResults.values()) {
      groupStandings.forEach((standing, index) => {
        const count = counts.get(standing.teamId);
        if (!count) return;
        if (index === 0) count.groupWinner += 1;
        else if (index === 1) count.groupRunnerUp += 1;
        else if (index === 2 && result.qualified.has(standing.teamId)) count.thirdPlaceQualified += 1;
        if (result.qualified.has(standing.teamId)) count.qualified += 1;
        else count.eliminated += 1;
      });
    }
  }

  return Array.from(counts.values()).map((count) => {
    const qualified = count.qualified / safeIterations;
    return {
      ...count,
      groupWinner: count.groupWinner / safeIterations,
      groupRunnerUp: count.groupRunnerUp / safeIterations,
      thirdPlaceQualified: count.thirdPlaceQualified / safeIterations,
      eliminated: count.eliminated / safeIterations,
      qualified,
      confidenceInterval: confidenceInterval(qualified, safeIterations, weightedConfidence),
    };
  });
}
