import type { WorldCupAdapterResult } from '../../../../../dataProviders/football/worldCupAdapter';
import { evaluateMatchTruth } from '../../../../core/trustLayer/trustEvaluator';
import { simulateManyTournaments } from '../logic/groupSimulation';
import { hasUnresolvedTeamPlaceholder } from '../logic/teamPlaceholders';
import type { WorldCupMatch } from '../types';
import type { GroupSimulationState } from './WorldCupDomainModel';

type SimulationBuilder = (adapterResult: WorldCupAdapterResult) => GroupSimulationState;

const resolvedGroupMatches = (matches: WorldCupMatch[]) => matches.filter(
  (match) => Boolean(match.group) && !hasUnresolvedTeamPlaceholder(match),
);

const materializeSimulationInput = (
  adapterResult: WorldCupAdapterResult,
  now: number,
): WorldCupAdapterResult => ({
  ...adapterResult,
  matches: adapterResult.matches.map((match) => (
    match.group && !hasUnresolvedTeamPlaceholder(match)
      ? { ...match, truth: evaluateMatchTruth(match, now) }
      : match
  )),
});

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};

const simulationFingerprint = (adapterResult: WorldCupAdapterResult) => {
  const matches = resolvedGroupMatches(adapterResult.matches)
    .map((match) => ({
      id: match.id,
      stage: match.stage,
      group: match.group,
      status: match.status,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      source: match.source,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      kickoff: match.kickoff,
      lastUpdated: match.lastUpdated,
      truth: match.truth,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const referencedTeamIds = new Set(
    matches.flatMap((match) => [match.homeTeamId, match.awayTeamId]),
  );
  const teams = [...referencedTeamIds]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((id) => {
      const team = adapterResult.teams[id];
      return team
        ? [{
            id: team.id,
            rating: team.rating,
            attack: team.attack,
            defense: team.defense,
            form: team.form,
            isHost: team.isHost,
            advancedMetrics: team.advancedMetrics,
            coreMetricSources: team.coreMetricSources,
            advancedMetricSources: team.advancedMetricSources,
          }]
        : [];
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return JSON.stringify(canonicalize({ matches, teams }));
};

export const buildWorldCupSimulation: SimulationBuilder = (adapterResult) => {
  const semanticInput = materializeSimulationInput(adapterResult, Date.now());
  return {
    probabilities: simulateManyTournaments({
      iterations: 1000,
      truthLevelWeighting: true,
      matches: resolvedGroupMatches(semanticInput.matches),
      teams: semanticInput.teams,
    }),
  };
};

export const createWorldCupSimulationCache = (
  builder: SimulationBuilder = buildWorldCupSimulation,
) => {
  let latest: { fingerprint: string; simulation: GroupSimulationState } | undefined;

  return {
    get(adapterResult: WorldCupAdapterResult): GroupSimulationState {
      const semanticInput = materializeSimulationInput(adapterResult, Date.now());
      const fingerprint = simulationFingerprint(semanticInput);
      if (latest?.fingerprint === fingerprint) return latest.simulation;

      const simulation = builder(semanticInput);
      latest = { fingerprint, simulation };
      return simulation;
    },
  };
};
