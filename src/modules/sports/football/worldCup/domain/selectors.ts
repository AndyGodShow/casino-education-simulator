import type {
  DataSourceStatus,
  WorldCupDomainModel,
} from './WorldCupDomainModel';
import { getCountryDisplayName } from '../../../../../utils/countryNameMap';

const sourceLabels: Record<WorldCupDomainModel['source'], string> = {
  api: 'API-Football',
  openfootball: 'OpenFootball',
  sportmonks: 'SportMonks',
  sample: 'Sample / local seed',
};

export const selectMatches = (domain: WorldCupDomainModel) => domain.matches;

export const selectMatchById = (domain: WorldCupDomainModel, matchId?: string) =>
  matchId ? domain.matches.find((match) => match.id === matchId) : undefined;

export const selectTeam = (domain: WorldCupDomainModel, teamId?: string) =>
  teamId ? domain.teams[teamId] : undefined;

export const selectTeamDisplayName = (domain: WorldCupDomainModel, teamId?: string) => {
  const team = selectTeam(domain, teamId);
  return team ? getCountryDisplayName(team.name) : teamId ?? '';
};

export const selectPrediction = (domain: WorldCupDomainModel, matchId?: string) =>
  matchId ? domain.predictions[matchId] : undefined;

export const selectSimulation = (domain: WorldCupDomainModel) => domain.simulation;

export const selectDataSourceStatus = (domain: WorldCupDomainModel): DataSourceStatus => ({
  source: domain.source,
  label: sourceLabels[domain.source],
  lastUpdated: domain.lastUpdated,
  errors: domain.errors ?? [],
  isSample: domain.source === 'sample',
});
