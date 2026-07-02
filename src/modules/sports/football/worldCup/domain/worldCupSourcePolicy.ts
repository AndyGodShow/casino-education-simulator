import type { WorldCupMatch } from '../types';
import type {
  MatchDataQualityState,
  WorldCupDataSourceTier,
  WorldCupDomainSource,
  WorldCupSourceGateState,
} from './WorldCupDomainModel';

const STALE_LOCAL_HOURS = 1;
const STALE_SAMPLE_HOURS = 1;
const STALE_PROVIDER_HOURS = 48;

const sourceTierLabels: Record<WorldCupDataSourceTier, string> = {
  official: 'Official fixture',
  verified_provider: 'Verified provider',
  sample: 'Sample fixtures',
  local: 'Local seed',
};

const sourceTier = (source: WorldCupMatch['source']): WorldCupDataSourceTier => {
  if (source === 'official') return 'official';
  if (source === 'local') return 'local';
  if (source === 'sample') return 'sample';
  return 'verified_provider';
};

const matchStalenessThreshold = (tier: WorldCupDataSourceTier) => {
  if (tier === 'local') return STALE_LOCAL_HOURS;
  if (tier === 'sample') return STALE_SAMPLE_HOURS;
  return STALE_PROVIDER_HOURS;
};

const deriveStaleness = (match: WorldCupMatch, tier: WorldCupDataSourceTier) => {
  const lastUpdated = Date.parse(match.lastUpdated);
  if (!Number.isFinite(lastUpdated)) {
    return { lastUpdated: 0, staleness: 'unknown' as const, stalenessHours: null };
  }

  const kickoff = Date.parse(match.kickoff);
  const reference = Number.isFinite(kickoff) ? Math.max(kickoff, lastUpdated) : lastUpdated;
  const stalenessHours = Math.max(0, (reference - lastUpdated) / 3_600_000);
  const staleness = stalenessHours > matchStalenessThreshold(tier) ? 'stale' as const : 'fresh' as const;

  return { lastUpdated, staleness, stalenessHours };
};

type WorldCupSourceDescriptor = {
  source: WorldCupMatch['source'];
  providerName: string;
};

export const mapWorldCupDomainSource = (result: WorldCupSourceDescriptor): WorldCupDomainSource => {
  if (result.source === 'official') return 'official';
  if (result.source === 'local') return 'local';
  if (result.source === 'sample' || result.source === 'manual') return 'sample';
  if (result.source === 'openfootball') return 'openfootball';
  if (result.source === 'api-football') return 'api';
  if (result.source === 'sportmonks') return 'sportmonks';

  const providerName = result.providerName.toLowerCase();
  if (providerName.includes('openfootball')) return 'openfootball';
  if (providerName.includes('sportmonks')) return 'sportmonks';
  if (providerName.includes('api-football')) return 'api';
  return 'sample';
};

export const buildWorldCupMatchDataQuality = (
  matches: WorldCupMatch[],
): Record<string, MatchDataQualityState> => Object.fromEntries(
  matches.map((match) => {
    const tier = sourceTier(match.source);
    const staleness = deriveStaleness(match, tier);
    const isOfficialFixture = tier === 'official';
    const isVerifiedProvider = tier === 'official' || tier === 'verified_provider';
    const hasVerifiedScore = isVerifiedProvider
      && match.status === 'finished'
      && typeof match.homeScore === 'number'
      && typeof match.awayScore === 'number';
    const canUseForRealPrediction = isOfficialFixture && staleness.staleness === 'fresh';
    const caveat = tier === 'official'
      ? '官方赛程口径；仍需结合结果校准，不代表投注建议。'
      : tier === 'verified_provider'
        ? '第三方 provider 数据已进入模型，但仍需官方赛程核验。'
        : tier === 'sample'
          ? '样例数据仅用于教育演示，不应用作真实赛事预测。'
          : '本地 seed 仅用于教育演示，不应用作真实赛事预测。';

    return [match.id, {
      matchId: match.id,
      source: match.source,
      tier,
      label: sourceTierLabels[tier],
      lastUpdated: staleness.lastUpdated,
      staleness: staleness.staleness,
      stalenessHours: staleness.stalenessHours,
      isOfficialFixture,
      isVerifiedProvider,
      hasVerifiedScore,
      canUseForRealPrediction,
      caveat,
    }];
  }),
);

export const buildWorldCupSourceGate = (
  source: WorldCupDomainSource,
  matchDataQuality: Record<string, MatchDataQualityState>,
): WorldCupSourceGateState => {
  const qualities = Object.values(matchDataQuality);
  const hasOfficial = qualities.some((quality) => quality.tier === 'official');
  const hasVerifiedProvider = qualities.some((quality) => quality.tier === 'verified_provider');
  const canUseForRealPrediction = qualities.length > 0
    && qualities.every((quality) => quality.canUseForRealPrediction);

  if (hasOfficial && canUseForRealPrediction) {
    return {
      tier: 'official',
      label: 'Official fixture gate',
      canUseForRealPrediction: true,
      requiresOfficialVerification: false,
      message: '当前赛程通过官方口径门禁；预测仍需结果校准，不构成投注建议。',
    };
  }

  if (hasVerifiedProvider || source === 'api' || source === 'openfootball' || source === 'sportmonks') {
    return {
      tier: 'verified_provider',
      label: 'Verified provider gate',
      canUseForRealPrediction: false,
      requiresOfficialVerification: true,
      message: '第三方 provider 数据可用于模型估计，但仍需官方赛程核验，不能标记为真实赛事预测。',
    };
  }

  if (source === 'sample') {
    return {
      tier: 'sample',
      label: 'Sample data gate',
      canUseForRealPrediction: false,
      requiresOfficialVerification: true,
      message: '样例赛程只允许教育演示口径，不能进入真实赛事预测。',
    };
  }

  return {
    tier: 'local',
    label: 'Local seed gate',
    canUseForRealPrediction: false,
    requiresOfficialVerification: true,
    message: '本地 seed 只允许教育演示口径，不能进入真实赛事预测。',
  };
};
