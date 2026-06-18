import type { WorldCupAdapterResult } from '../../../../../dataProviders/football/worldCupAdapter';
import { predictMatch } from '../logic/predictionEngine';
import { simulateManyTournaments } from '../logic/groupSimulation';
import type {
  GroupSimulationState,
  WorldCupDomainModel,
  WorldCupDomainSource,
} from './WorldCupDomainModel';

const mapDomainSource = (result: WorldCupAdapterResult): WorldCupDomainSource => {
  const providerName = result.providerName.toLowerCase();
  if (providerName.includes('openfootball')) return 'openfootball';
  if (providerName.includes('sportmonks')) return 'sportmonks';
  if (providerName.includes('api-football')) return 'api';
  return 'sample';
};

const buildSimulation = (adapterResult: WorldCupAdapterResult): GroupSimulationState => ({
  probabilities: simulateManyTournaments({
    iterations: 1000,
    truthLevelWeighting: true,
    matches: adapterResult.matches,
    teams: adapterResult.teams,
  }),
});

const deriveLastUpdated = (adapterResult: WorldCupAdapterResult) => {
  const latestMatchUpdate = adapterResult.matches.reduce((latest, match) => {
    const timestamp = Date.parse(match.lastUpdated);
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);

  return latestMatchUpdate || 0;
};

export function buildWorldCupDomain(adapterResult: WorldCupAdapterResult): WorldCupDomainModel {
  const predictions = Object.fromEntries(
    adapterResult.matches.flatMap((match) => {
      const homeTeam = adapterResult.teams[match.homeTeamId];
      const awayTeam = adapterResult.teams[match.awayTeamId];
      return homeTeam && awayTeam ? [[match.id, predictMatch(match, homeTeam, awayTeam)]] : [];
    }),
  );
  const markets = Object.fromEntries(adapterResult.matches.map((match) => [match.id, null]));

  return {
    matches: adapterResult.matches,
    teams: adapterResult.teams,
    predictions,
    markets,
    simulation: buildSimulation(adapterResult),
    source: mapDomainSource(adapterResult),
    lastUpdated: deriveLastUpdated(adapterResult),
    errors: adapterResult.errors,
  };
}
