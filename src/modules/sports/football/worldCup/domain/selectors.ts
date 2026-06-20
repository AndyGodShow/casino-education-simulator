import type {
  DataSourceStatus,
  WorldCupDomainModel,
} from './WorldCupDomainModel';
import { getCountryDisplayName } from '../../../../../utils/countryNameMap';

const sourceLabels: Record<WorldCupDomainModel['source'], string> = {
  official: 'Official fixture',
  api: 'API-Football',
  openfootball: 'OpenFootball',
  sportmonks: 'SportMonks',
  sample: 'Sample fixtures',
  local: 'Local seed',
};

const sourceDetails: Record<WorldCupDomainModel['source'], string> = {
  official: '官方赛程数据已进入统一 Domain Model；仍会保留模型校准和自检边界。',
  api: '第三方 API-Football 数据已进入统一 Domain Model，仍需与官方赛程核验。',
  openfootball: 'OpenFootball 第三方赛程已进入统一 Domain Model，属于外部 provider 数据。',
  sportmonks: 'SportMonks 第三方赛程已进入统一 Domain Model，属于外部 provider 数据。',
  sample: '当前使用样例赛程，仅用于概率教育和界面演示，不声明官方 2026 赛程准确性。',
  local: '当前使用本地种子赛程，仅用于概率教育和界面演示，不是实时或官方赛程数据。',
};

const predictionCaveats: Record<WorldCupDomainModel['source'], string> = {
  official: '概率基于官方赛程和本地模型估计；仍不是官方预测或投注建议。',
  api: '概率是基于第三方赛程和本地模型的估计，不是官方预测或投注建议。',
  openfootball: '概率是基于 OpenFootball 赛程和本地模型的估计，不是官方预测或投注建议。',
  sportmonks: '概率是基于 SportMonks 赛程和本地模型的估计，不是官方预测或投注建议。',
  sample: '样例数据模式下只能展示教育性概率，不应用作真实赛事预测。',
  local: '本地 seed 模式下只能展示教育性概率，不应用作真实赛事预测。',
};

export const selectMatches = (domain: WorldCupDomainModel) => domain.matches;

export const selectMatchById = (domain: WorldCupDomainModel, matchId?: string) =>
  matchId ? domain.matches.find((match) => match.id === matchId) : undefined;

export const selectDefaultInsightMatch = (domain: WorldCupDomainModel) =>
  domain.matches.find((match) => (
    match.status !== 'finished'
    && Boolean(domain.predictions[match.id])
    && Boolean(domain.predictionReliability[match.id])
    && Boolean(domain.matchDataQuality[match.id])
  )) ?? domain.matches[0];

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
  isSample: domain.source === 'sample' || domain.source === 'local',
  isLiveProvider: domain.source === 'official' || domain.source === 'api' || domain.source === 'openfootball' || domain.source === 'sportmonks',
  detail: sourceDetails[domain.source],
  predictionCaveat: predictionCaveats[domain.source],
});
