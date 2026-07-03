import type {
  AdvancedMetricProvenance,
  WorldCupAdvancedMetrics,
  WorldCupMatch,
} from '../types';

export type FootballProviderFieldCoverage = 'high' | 'medium' | 'low' | 'none';

export type FootballProviderQualityProfile = {
  source: WorldCupMatch['source'];
  providerName: string;
  defaultAdvancedMetricTrust: AdvancedMetricProvenance['trustLevel'];
  freshnessSlaHours: number;
  fieldCoverage: {
    fixtures: FootballProviderFieldCoverage;
    scores: FootballProviderFieldCoverage;
    elo: FootballProviderFieldCoverage;
    recentXgFor: FootballProviderFieldCoverage;
    recentXgAgainst: FootballProviderFieldCoverage;
    squadAvailability: FootballProviderFieldCoverage;
    restDays: FootballProviderFieldCoverage;
    travelFatigue: FootballProviderFieldCoverage;
    weather: FootballProviderFieldCoverage;
  };
};

const noAdvancedMetrics = {
  elo: 'none',
  recentXgFor: 'none',
  recentXgAgainst: 'none',
  squadAvailability: 'none',
  restDays: 'none',
  travelFatigue: 'none',
} satisfies Record<keyof WorldCupAdvancedMetrics, FootballProviderFieldCoverage>;

const providerAdvancedMetrics = {
  elo: 'medium',
  recentXgFor: 'medium',
  recentXgAgainst: 'medium',
  squadAvailability: 'medium',
  restDays: 'medium',
  travelFatigue: 'medium',
} satisfies Record<keyof WorldCupAdvancedMetrics, FootballProviderFieldCoverage>;

const officialAdvancedMetrics = {
  elo: 'high',
  recentXgFor: 'high',
  recentXgAgainst: 'high',
  squadAvailability: 'high',
  restDays: 'high',
  travelFatigue: 'high',
} satisfies Record<keyof WorldCupAdvancedMetrics, FootballProviderFieldCoverage>;

const baseProfiles = {
  official: {
    defaultAdvancedMetricTrust: 'high',
    freshnessSlaHours: 24,
    fieldCoverage: {
      fixtures: 'high',
      scores: 'high',
      ...officialAdvancedMetrics,
      weather: 'medium',
    },
  },
  real: {
    defaultAdvancedMetricTrust: 'medium',
    freshnessSlaHours: 48,
    fieldCoverage: {
      fixtures: 'high',
      scores: 'high',
      ...providerAdvancedMetrics,
      weather: 'low',
    },
  },
  openfootball: {
    defaultAdvancedMetricTrust: 'low',
    freshnessSlaHours: 168,
    fieldCoverage: {
      fixtures: 'medium',
      scores: 'medium',
      ...noAdvancedMetrics,
      weather: 'none',
    },
  },
  'api-football': {
    defaultAdvancedMetricTrust: 'medium',
    freshnessSlaHours: 48,
    fieldCoverage: {
      fixtures: 'high',
      scores: 'high',
      ...providerAdvancedMetrics,
      weather: 'low',
    },
  },
  sportmonks: {
    defaultAdvancedMetricTrust: 'medium',
    freshnessSlaHours: 48,
    fieldCoverage: {
      fixtures: 'high',
      scores: 'high',
      ...providerAdvancedMetrics,
      weather: 'low',
    },
  },
  manual: {
    defaultAdvancedMetricTrust: 'low',
    freshnessSlaHours: 24,
    fieldCoverage: {
      fixtures: 'medium',
      scores: 'medium',
      elo: 'low',
      recentXgFor: 'low',
      recentXgAgainst: 'low',
      squadAvailability: 'low',
      restDays: 'low',
      travelFatigue: 'low',
      weather: 'low',
    },
  },
  sample: {
    defaultAdvancedMetricTrust: 'low',
    freshnessSlaHours: 1,
    fieldCoverage: {
      fixtures: 'low',
      scores: 'low',
      ...noAdvancedMetrics,
      weather: 'none',
    },
  },
  local: {
    defaultAdvancedMetricTrust: 'low',
    freshnessSlaHours: 1,
    fieldCoverage: {
      fixtures: 'low',
      scores: 'low',
      ...noAdvancedMetrics,
      weather: 'none',
    },
  },
} satisfies Record<WorldCupMatch['source'], Omit<FootballProviderQualityProfile, 'source' | 'providerName'>>;

export function getFootballProviderQualityProfile(
  source: WorldCupMatch['source'],
  providerName: string,
): FootballProviderQualityProfile {
  return {
    source,
    providerName,
    ...baseProfiles[source],
  };
}

type ProvenanceLikeSource = AdvancedMetricProvenance['source'] | WorldCupMatch['source'];

function inferProviderProfileSource(
  source: ProvenanceLikeSource,
  providerName?: string,
): WorldCupMatch['source'] {
  if (source === 'official') return 'official';
  if (source === 'manual') return 'manual';
  if (source === 'seed') return 'local';
  if (
    source === 'real'
    || source === 'sample'
    || source === 'local'
    || source === 'openfootball'
    || source === 'api-football'
    || source === 'sportmonks'
  ) {
    return source;
  }

  const normalizedProvider = providerName?.toLowerCase() ?? '';
  if (normalizedProvider.includes('api-football')) return 'api-football';
  if (normalizedProvider.includes('sportmonks')) return 'sportmonks';
  if (normalizedProvider.includes('openfootball')) return 'openfootball';
  return 'real';
}

export function getFootballProviderFreshnessSlaHours(
  source: ProvenanceLikeSource,
  providerName?: string,
): number {
  const profileSource = inferProviderProfileSource(source, providerName);
  return getFootballProviderQualityProfile(profileSource, providerName ?? profileSource).freshnessSlaHours;
}

export function buildDefaultAdvancedMetricProvenance(
  source: WorldCupMatch['source'],
  providerName: string,
): AdvancedMetricProvenance {
  const profile = getFootballProviderQualityProfile(source, providerName);

  if (source === 'official') {
    return {
      source: 'official',
      providerName,
      trustLevel: profile.defaultAdvancedMetricTrust,
      caveat: 'Official advanced metric source.',
    };
  }
  if (source === 'sample' || source === 'local') {
    return {
      source: 'seed',
      trustLevel: 'low',
      caveat: 'Seeded advanced metric for education only.',
    };
  }
  if (source === 'manual') {
    return {
      source: 'manual',
      providerName,
      trustLevel: 'low',
      caveat: 'Manually supplied advanced metric; requires independent verification.',
    };
  }
  if (profile.defaultAdvancedMetricTrust === 'low') {
    return {
      source: 'provider',
      providerName,
      trustLevel: 'low',
      caveat: 'Provider profile has no reliable advanced metric coverage; metric requires independent verification.',
    };
  }

  return {
    source: 'provider',
    providerName,
    trustLevel: profile.defaultAdvancedMetricTrust,
    caveat: 'Provider-supplied advanced metric; not official unless separately verified.',
  };
}
