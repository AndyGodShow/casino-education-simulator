import type {
  AdvancedMetricProvenance,
  MatchExternalIntelligenceFeed,
  MatchExternalIntelligenceInput,
  MatchTeamExternalIntelligence,
  WorldCupAdvancedMetrics,
  WorldCupMatch,
  WorldCupTeam,
} from '../types';
import { getFootballProviderFreshnessSlaHours } from './providerQualityRegistry';

export type ScheduleContext = {
  homeRestDays?: number;
  awayRestDays?: number;
  homeTravelFatigue?: number;
  awayTravelFatigue?: number;
  source: string;
};

export type EnrichedMatchTeams = {
  homeTeam: WorldCupTeam;
  awayTeam: WorldCupTeam;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

const hasNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const metricRanges = {
  elo: [0, 3000],
  recentXgFor: [0, 6],
  recentXgAgainst: [0, 6],
  squadAvailability: [0, 100],
  restDays: [0, 30],
  travelFatigue: [0, 1],
} satisfies Record<keyof WorldCupAdvancedMetrics, [number, number]>;

const metricFields = Object.keys(metricRanges) as Array<keyof WorldCupAdvancedMetrics>;

const metricConflictThresholds = {
  elo: 75,
  recentXgFor: 0.35,
  recentXgAgainst: 0.35,
  squadAvailability: 12,
  restDays: 2,
  travelFatigue: 0.22,
} satisfies Record<keyof WorldCupAdvancedMetrics, number>;

const trustRank: Record<AdvancedMetricProvenance['trustLevel'], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const sourceRank: Record<AdvancedMetricProvenance['source'], number> = {
  official: 4,
  provider: 3,
  manual: 2,
  seed: 1,
};

const derivedSource = (field: keyof WorldCupAdvancedMetrics, match: WorldCupMatch, caveat: string): AdvancedMetricProvenance => ({
  source: 'seed',
  providerName: 'derived-match-intelligence',
  trustLevel: 'low',
  lastUpdated: match.lastUpdated,
  caveat: `${field}: ${caveat}`,
});

const externalSource = (
  field: keyof WorldCupAdvancedMetrics,
  feed: MatchExternalIntelligenceFeed,
  side: MatchTeamExternalIntelligence | undefined,
  match?: WorldCupMatch,
): AdvancedMetricProvenance => {
  const explicitSource = side?.advancedMetricSources?.[field];
  const freshness = sourceFreshness(
    explicitSource?.lastUpdated ?? feed.lastUpdated,
    match,
    explicitSource?.source ?? feed.source,
    explicitSource?.providerName ?? feed.providerName,
  );
  const trustLevel = feed.auditable && freshness === 'fresh'
    ? (explicitSource?.trustLevel ?? feed.trustLevel)
    : 'low';
  const caveats = [
    explicitSource?.caveat ?? feed.caveat,
    feed.auditable ? undefined : 'Unaudited external match intelligence; forced to low trust.',
    freshness === 'stale' ? 'Stale external match intelligence; forced to low trust.' : undefined,
    freshness === 'unknown' ? 'Unknown external intelligence freshness; forced to low trust.' : undefined,
  ].filter(Boolean);

  return {
    source: explicitSource?.source ?? feed.source,
    providerName: explicitSource?.providerName ?? feed.providerName,
    trustLevel,
    lastUpdated: explicitSource?.lastUpdated ?? feed.lastUpdated,
    caveat: caveats.length ? caveats.join(' ') : undefined,
  };
};

const sourceFreshness = (
  lastUpdated: string | undefined,
  match: WorldCupMatch | undefined,
  source: AdvancedMetricProvenance['source'],
  providerName?: string,
) => {
  if (!match) return 'fresh';
  const sourceUpdatedAt = lastUpdated ? Date.parse(lastUpdated) : NaN;
  const reference = Date.parse(match.lastUpdated || match.kickoff);
  if (!Number.isFinite(sourceUpdatedAt) || !Number.isFinite(reference)) return 'unknown';

  const ageHours = Math.max(0, (reference - sourceUpdatedAt) / 3_600_000);
  return ageHours > getFootballProviderFreshnessSlaHours(source, providerName)
    ? 'stale'
    : 'fresh';
};

const sourceTimestamp = (source: AdvancedMetricProvenance) => {
  const timestamp = source.lastUpdated ? Date.parse(source.lastUpdated) : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const sourceLabel = (source: AdvancedMetricProvenance) => source.providerName ?? source.source;

const formatMetricValue = (value: number) => Number(value.toFixed(2));

const hasMaterialMetricConflict = (
  field: keyof WorldCupAdvancedMetrics,
  currentValue: number,
  candidateValue: number,
  currentSource: AdvancedMetricProvenance,
  candidateSource: AdvancedMetricProvenance,
) => currentSource.trustLevel !== 'low'
  && candidateSource.trustLevel !== 'low'
  && sourceLabel(currentSource) !== sourceLabel(candidateSource)
  && Math.abs(currentValue - candidateValue) >= metricConflictThresholds[field];

const withConflictCaveat = (
  source: AdvancedMetricProvenance,
  field: keyof WorldCupAdvancedMetrics,
  selectedValue: number,
  competingValue: number,
  competingSource: AdvancedMetricProvenance,
): AdvancedMetricProvenance => {
  const conflict = `Conflicting external intelligence for ${field}: ${sourceLabel(source)}=${formatMetricValue(selectedValue)} vs ${sourceLabel(competingSource)}=${formatMetricValue(competingValue)}; forced to low trust.`;

  return {
    ...source,
    trustLevel: 'low',
    caveat: [source.caveat, conflict].filter(Boolean).join(' '),
  };
};

const betterSource = (
  current: AdvancedMetricProvenance | undefined,
  candidate: AdvancedMetricProvenance,
) => {
  if (!current) return true;
  const trustDelta = trustRank[candidate.trustLevel] - trustRank[current.trustLevel];
  if (trustDelta !== 0) return trustDelta > 0;
  const sourceDelta = sourceRank[candidate.source] - sourceRank[current.source];
  if (sourceDelta !== 0) return sourceDelta > 0;
  return sourceTimestamp(candidate) >= sourceTimestamp(current);
};

const validExternalMetric = (field: keyof WorldCupAdvancedMetrics, value: unknown) => {
  const [min, max] = metricRanges[field];
  return hasNumber(value) && value >= min && value <= max ? value : undefined;
};

const shouldReplaceMetric = (
  currentSource: AdvancedMetricProvenance | undefined,
  incomingSource: AdvancedMetricProvenance,
) => betterSource(currentSource, incomingSource);

const selectExternalMetric = (input: {
  field: keyof WorldCupAdvancedMetrics;
  currentValue?: number;
  currentSource?: AdvancedMetricProvenance;
  candidateValue: number;
  candidateSource: AdvancedMetricProvenance;
}) => {
  const { field, currentValue, currentSource, candidateValue, candidateSource } = input;

  if (!hasNumber(currentValue) || !currentSource) {
    return {
      value: candidateValue,
      source: candidateSource,
    };
  }

  if (hasMaterialMetricConflict(field, currentValue, candidateValue, currentSource, candidateSource)) {
    const candidateWins = betterSource(currentSource, candidateSource);
    return candidateWins
      ? {
        value: candidateValue,
        source: withConflictCaveat(candidateSource, field, candidateValue, currentValue, currentSource),
      }
      : {
        value: currentValue,
        source: withConflictCaveat(currentSource, field, currentValue, candidateValue, candidateSource),
      };
  }

  if (!shouldReplaceMetric(currentSource, candidateSource)) return undefined;

  return {
    value: candidateValue,
    source: candidateSource,
  };
};

const deriveElo = (team: WorldCupTeam) => round(1200 + team.rating * 8, 0);

const deriveRecentXgFor = (team: WorldCupTeam) => round(clamp(0.45 + team.attack * 0.012, 0.8, 2.2));

const deriveRecentXgAgainst = (team: WorldCupTeam) => round(clamp(2.45 - team.defense * 0.012, 0.75, 2.1));

const deriveSquadAvailability = (team: WorldCupTeam) => {
  const formGap = team.form - team.rating;
  return round(clamp(86 + formGap * 1.4, 68, 98));
};

const withMetric = (
  team: WorldCupTeam,
  field: keyof WorldCupAdvancedMetrics,
  value: number | undefined,
  provenance: AdvancedMetricProvenance,
): WorldCupTeam => {
  if (!hasNumber(value) || hasNumber(team.advancedMetrics?.[field])) return team;

  return {
    ...team,
    advancedMetrics: {
      ...team.advancedMetrics,
      [field]: value,
    },
    advancedMetricSources: {
      ...team.advancedMetricSources,
      [field]: provenance,
    },
  };
};

const withExternalMetric = (
  team: WorldCupTeam,
  field: keyof WorldCupAdvancedMetrics,
  value: number | undefined,
  provenance: AdvancedMetricProvenance,
): WorldCupTeam => {
  if (!hasNumber(value)) return team;
  const selected = selectExternalMetric({
    field,
    currentValue: team.advancedMetrics?.[field],
    currentSource: team.advancedMetricSources?.[field],
    candidateValue: value,
    candidateSource: provenance,
  });
  if (!selected) return team;

  return {
    ...team,
    advancedMetrics: {
      ...team.advancedMetrics,
      [field]: selected.value,
    },
    advancedMetricSources: {
      ...team.advancedMetricSources,
      [field]: selected.source,
    },
  };
};

const applyExternalSide = (
  team: WorldCupTeam,
  feed: MatchExternalIntelligenceFeed,
  side: MatchTeamExternalIntelligence | undefined,
  match: WorldCupMatch,
) => {
  if (!side?.advancedMetrics) return team;

  return metricFields.reduce((enriched, field) => withExternalMetric(
    enriched,
    field,
    validExternalMetric(field, side.advancedMetrics?.[field]),
    externalSource(field, feed, side, match),
  ), team);
};

const mergeSide = (
  feeds: MatchExternalIntelligenceFeed[],
  side: 'home' | 'away',
  match?: WorldCupMatch,
): MatchTeamExternalIntelligence | undefined => {
  const merged: MatchTeamExternalIntelligence = {};

  feeds.forEach((feed) => {
    const sideFeed = feed[side];
    if (!sideFeed?.advancedMetrics) return;

    metricFields.forEach((field) => {
      const value = validExternalMetric(field, sideFeed.advancedMetrics?.[field]);
      if (!hasNumber(value)) return;

      const candidateSource = externalSource(field, feed, sideFeed, match);
      const selected = selectExternalMetric({
        field,
        currentValue: merged.advancedMetrics?.[field],
        currentSource: merged.advancedMetricSources?.[field],
        candidateValue: value,
        candidateSource,
      });
      if (!selected) return;

      merged.advancedMetrics = {
        ...merged.advancedMetrics,
        [field]: selected.value,
      };
      merged.advancedMetricSources = {
        ...merged.advancedMetricSources,
        [field]: selected.source,
      };
    });
  });

  return merged.advancedMetrics ? merged : undefined;
};

const mergedTrustLevel = (
  home: MatchTeamExternalIntelligence | undefined,
  away: MatchTeamExternalIntelligence | undefined,
) => {
  const sources = [
    ...Object.values(home?.advancedMetricSources ?? {}),
    ...Object.values(away?.advancedMetricSources ?? {}),
  ];
  if (sources.some((source) => source.trustLevel === 'high')) return 'high';
  if (sources.some((source) => source.trustLevel === 'medium')) return 'medium';
  return 'low';
};

const latestSourceTimestamp = (
  home: MatchTeamExternalIntelligence | undefined,
  away: MatchTeamExternalIntelligence | undefined,
) => {
  const timestamps = [
    ...Object.values(home?.advancedMetricSources ?? {}),
    ...Object.values(away?.advancedMetricSources ?? {}),
  ].map(sourceTimestamp);
  const latest = Math.max(0, ...timestamps);
  return latest > 0 ? new Date(latest).toISOString() : undefined;
};

export function mergeExternalMatchIntelligenceFeeds(
  feeds: MatchExternalIntelligenceFeed[],
  match?: WorldCupMatch,
): MatchExternalIntelligenceFeed | undefined {
  if (feeds.length === 0) return undefined;

  const home = mergeSide(feeds, 'home', match);
  const away = mergeSide(feeds, 'away', match);
  if (!home && !away) return undefined;

  return {
    source: 'provider',
    providerName: 'merged external intelligence',
    trustLevel: mergedTrustLevel(home, away),
    lastUpdated: latestSourceTimestamp(home, away),
    auditable: [...Object.values(home?.advancedMetricSources ?? {}), ...Object.values(away?.advancedMetricSources ?? {})]
      .some((source) => source.trustLevel !== 'low'),
    caveat: 'Merged per metric from external match intelligence feeds.',
    home,
    away,
  };
}

export function applyExternalMatchIntelligence(input: {
  match: WorldCupMatch;
  homeTeam: WorldCupTeam;
  awayTeam: WorldCupTeam;
  feed?: MatchExternalIntelligenceInput;
}): EnrichedMatchTeams {
  const feed = Array.isArray(input.feed)
    ? mergeExternalMatchIntelligenceFeeds(input.feed, input.match)
    : input.feed;

  if (!feed) {
    return {
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
    };
  }

  return {
    homeTeam: applyExternalSide(input.homeTeam, feed, feed.home, input.match),
    awayTeam: applyExternalSide(input.awayTeam, feed, feed.away, input.match),
  };
}

function enrichOneTeam(
  team: WorldCupTeam,
  match: WorldCupMatch,
  restDays: number | undefined,
  travelFatigue: number | undefined,
): WorldCupTeam {
  let enriched = team;
  enriched = withMetric(
    enriched,
    'elo',
    deriveElo(team),
    derivedSource('elo', match, 'derived from seeded team rating until a real Elo provider is attached.'),
  );
  enriched = withMetric(
    enriched,
    'recentXgFor',
    deriveRecentXgFor(team),
    derivedSource('recentXgFor', match, 'derived from attack rating until recent xG feed is attached.'),
  );
  enriched = withMetric(
    enriched,
    'recentXgAgainst',
    deriveRecentXgAgainst(team),
    derivedSource('recentXgAgainst', match, 'derived from defense rating until recent xG feed is attached.'),
  );
  enriched = withMetric(
    enriched,
    'squadAvailability',
    deriveSquadAvailability(team),
    derivedSource('squadAvailability', match, 'derived from form-rating gap until injury or lineup data is attached.'),
  );
  enriched = withMetric(
    enriched,
    'restDays',
    restDays,
    derivedSource('restDays', match, 'derived from fixture chronology.'),
  );
  enriched = withMetric(
    enriched,
    'travelFatigue',
    travelFatigue,
    derivedSource('travelFatigue', match, 'derived from host/non-host fixture context until distance data is attached.'),
  );

  return enriched;
}

export function enrichMatchTeamsWithDerivedMetrics(input: {
  match: WorldCupMatch;
  homeTeam: WorldCupTeam;
  awayTeam: WorldCupTeam;
  scheduleContext?: ScheduleContext;
}): EnrichedMatchTeams {
  return {
    homeTeam: enrichOneTeam(
      input.homeTeam,
      input.match,
      input.scheduleContext?.homeRestDays,
      input.scheduleContext?.homeTravelFatigue,
    ),
    awayTeam: enrichOneTeam(
      input.awayTeam,
      input.match,
      input.scheduleContext?.awayRestDays,
      input.scheduleContext?.awayTravelFatigue,
    ),
  };
}
