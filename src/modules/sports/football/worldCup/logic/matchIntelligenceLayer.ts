import type {
  AdvancedMetricProvenance,
  IntelligenceFactorCategory,
  IntelligenceFactorQuality,
  MatchIntelligenceFactor,
  MatchIntelligenceLayer,
  WorldCupAdvancedMetrics,
  WorldCupCoreMetric,
  WorldCupMatch,
  WorldCupTeam,
} from '../types';
import type { MatchDataQualityState } from '../domain/WorldCupDomainModel';
import type { GroupMotivationContext } from './groupMotivation';

export type MatchIntelligenceInput = {
  match: WorldCupMatch;
  homeTeam: WorldCupTeam;
  awayTeam: WorldCupTeam;
  matchDataQuality?: MatchDataQualityState;
  hasMarketData?: boolean;
  scheduleContext?: {
    homeRestDays?: number;
    awayRestDays?: number;
    homeTravelFatigue?: number;
    awayTravelFatigue?: number;
    source: string;
  };
  motivationContext?: GroupMotivationContext;
};

const categories: IntelligenceFactorCategory[] = [
  'team_strength',
  'recent_form',
  'squad',
  'schedule_travel',
  'venue_environment',
  'tactical_matchup',
  'market',
  'motivation',
  'data_quality',
];

const clamp = (value: number, min = -1, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const round = (value: number, digits = 4) => Number(value.toFixed(digits));

const safeNumber = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? value as number : fallback;

const hasNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const provenanceQuality = (provenance?: AdvancedMetricProvenance): IntelligenceFactorQuality => {
  if (!provenance) return 'proxy';
  if (provenance.source === 'official') return 'real';
  if (provenance.source === 'provider') return 'provider';
  if (provenance.source === 'manual') return 'manual';
  return 'proxy';
};

const provenanceSource = (field: keyof WorldCupAdvancedMetrics, provenance?: AdvancedMetricProvenance) => {
  if (!provenance) return `advancedMetrics.${field}`;
  if (provenance.providerName) return provenance.providerName;
  return provenance.source;
};

const combineCaveats = (...caveats: Array<string | undefined>) => [...new Set(caveats.filter(Boolean))]
  .join(' ');

const weakestProvenanceQuality = (
  provenances: Array<AdvancedMetricProvenance | undefined>,
): IntelligenceFactorQuality => {
  const qualities = provenances.map(provenanceQuality);
  if (qualities.includes('proxy')) return 'proxy';
  if (qualities.includes('manual')) return 'manual';
  if (qualities.includes('provider')) return 'provider';
  return 'real';
};

const coreMetricPairMetadata = (
  homeTeam: WorldCupTeam,
  awayTeam: WorldCupTeam,
  field: WorldCupCoreMetric,
) => {
  const homeSource = homeTeam.coreMetricSources?.[field];
  const awaySource = awayTeam.coreMetricSources?.[field];
  const sourceName = (provenance?: AdvancedMetricProvenance) =>
    provenance?.providerName ?? provenance?.source ?? `team.${field}`;

  return {
    quality: weakestProvenanceQuality([homeSource, awaySource]),
    source: `${sourceName(homeSource)} / ${sourceName(awaySource)}`,
    lastUpdated: homeSource?.lastUpdated ?? awaySource?.lastUpdated,
    caveat: combineCaveats(homeSource?.caveat, awaySource?.caveat),
  };
};

const combinedCoreMetricMetadata = (
  homeTeam: WorldCupTeam,
  awayTeam: WorldCupTeam,
  fields: WorldCupCoreMetric[],
) => {
  const provenances = fields.flatMap((field) => [
    homeTeam.coreMetricSources?.[field],
    awayTeam.coreMetricSources?.[field],
  ]);
  const sources = [...new Set(provenances.map((provenance) => (
    provenance?.providerName ?? provenance?.source
  )).filter(Boolean))];

  return {
    quality: weakestProvenanceQuality(provenances),
    source: sources.join(' / ') || fields.map((field) => `team.${field}`).join(' / '),
    lastUpdated: provenances.find((provenance) => provenance?.lastUpdated)?.lastUpdated,
    caveat: combineCaveats(...provenances.map((provenance) => provenance?.caveat)),
  };
};

const confidenceForQuality = (quality: IntelligenceFactorQuality) => {
  if (quality === 'real') return 0.9;
  if (quality === 'provider') return 0.72;
  if (quality === 'manual') return 0.55;
  if (quality === 'proxy') return 0.4;
  return 0;
};

const factor = (input: Omit<MatchIntelligenceFactor, 'impact' | 'confidence'> & {
  impact?: number;
  confidence?: number;
}): MatchIntelligenceFactor => ({
  ...input,
  impact: round(clamp(input.impact ?? 0)),
  confidence: round(Math.min(1, Math.max(0, input.confidence ?? confidenceForQuality(input.quality)))),
});

const unavailable = (
  key: string,
  category: IntelligenceFactorCategory,
  label: string,
  caveat: string,
): MatchIntelligenceFactor => factor({
  key,
  category,
  label,
  side: 'match',
  quality: 'unavailable',
  source: 'not supplied',
  caveat,
});

const advancedFactor = (
  input: MatchIntelligenceInput,
  field: keyof WorldCupAdvancedMetrics,
  key: string,
  category: IntelligenceFactorCategory,
  label: string,
  impactFor: (home: number, away: number) => number,
  caveat: string,
): MatchIntelligenceFactor => {
  const homeValue = input.homeTeam.advancedMetrics?.[field];
  const awayValue = input.awayTeam.advancedMetrics?.[field];

  if (!hasNumber(homeValue) || !hasNumber(awayValue)) {
    return unavailable(key, category, label, caveat);
  }

  const homeSource = input.homeTeam.advancedMetricSources?.[field];
  const awaySource = input.awayTeam.advancedMetricSources?.[field];
  const qualities = [provenanceQuality(homeSource), provenanceQuality(awaySource)];
  const quality = qualities.includes('real')
    ? 'real'
    : qualities.includes('provider')
      ? 'provider'
      : qualities.includes('manual')
        ? 'manual'
        : 'proxy';

  return factor({
    key,
    category,
    label,
    side: 'match',
    quality,
    impact: impactFor(homeValue, awayValue),
    confidence: Math.min(confidenceForQuality(qualities[0]), confidenceForQuality(qualities[1])),
    source: `${provenanceSource(field, homeSource)} / ${provenanceSource(field, awaySource)}`,
    lastUpdated: homeSource?.lastUpdated ?? awaySource?.lastUpdated,
    caveat: combineCaveats(caveat, homeSource?.caveat, awaySource?.caveat),
  });
};

const sourcedPairFactor = (
  input: {
    key: string;
    category: IntelligenceFactorCategory;
    label: string;
    homeValue?: number;
    awayValue?: number;
    homeQuality: IntelligenceFactorQuality;
    awayQuality: IntelligenceFactorQuality;
    source: string;
    impactFor: (home: number, away: number) => number;
    caveat: string;
  },
): MatchIntelligenceFactor => {
  if (!hasNumber(input.homeValue) || !hasNumber(input.awayValue)) {
    return unavailable(input.key, input.category, input.label, input.caveat);
  }

  const quality = input.homeQuality === 'real' || input.awayQuality === 'real'
    ? 'real'
    : input.homeQuality === 'provider' || input.awayQuality === 'provider'
      ? 'provider'
      : input.homeQuality === 'manual' || input.awayQuality === 'manual'
        ? 'manual'
        : 'proxy';

  return factor({
    key: input.key,
    category: input.category,
    label: input.label,
    side: 'match',
    quality,
    impact: input.impactFor(input.homeValue, input.awayValue),
    confidence: Math.min(confidenceForQuality(input.homeQuality), confidenceForQuality(input.awayQuality)),
    source: input.source,
    caveat: input.caveat,
  });
};

const valueQuality = (
  team: WorldCupTeam,
  field: keyof WorldCupAdvancedMetrics,
  fallbackValue?: number,
): IntelligenceFactorQuality => {
  if (hasNumber(team.advancedMetrics?.[field])) return provenanceQuality(team.advancedMetricSources?.[field]);
  if (hasNumber(fallbackValue)) return 'proxy';
  return 'unavailable';
};

const metricPairSource = (
  homeTeam: WorldCupTeam,
  awayTeam: WorldCupTeam,
  field: keyof WorldCupAdvancedMetrics,
  fallbackSource: string | undefined,
) => {
  const homeSource = homeTeam.advancedMetricSources?.[field];
  const awaySource = awayTeam.advancedMetricSources?.[field];
  if (homeSource || awaySource) {
    return `${provenanceSource(field, homeSource)} / ${provenanceSource(field, awaySource)}`;
  }
  return fallbackSource ?? 'not supplied';
};

const pressureLabels: Record<GroupMotivationContext['home']['pressure'], string> = {
  opening_balance: 'opening balance',
  protect_top_spot: 'protect top spot',
  qualification_race: 'qualification race',
  chase_third_place: 'chase third-place path',
  must_win: 'must win',
  settled: 'settled',
  unknown: 'unknown',
};

const groupMotivationFactor = (input: MatchIntelligenceInput): MatchIntelligenceFactor => {
  const context = input.motivationContext;
  if (!context) {
    return factor({
      key: 'group-qualification-motivation',
      category: 'motivation',
      label: 'Group qualification motivation',
      side: 'match',
      quality: input.match.stage === 'group' ? 'unavailable' : 'proxy',
      source: input.match.stage === 'group' ? 'not supplied' : 'match.stage',
      impact: input.match.stage === 'group' ? 0 : 0.12,
      confidence: input.match.stage === 'group' ? 0 : 0.32,
      caveat: input.match.stage === 'group'
        ? 'No group standings context is attached, so qualification incentives are not modeled.'
        : 'Knockout matches are treated as structurally high-motivation without group table context.',
    });
  }

  return factor({
    key: 'group-qualification-motivation',
    category: 'motivation',
    label: 'Group qualification motivation',
    side: 'match',
    quality: 'proxy',
    source: context.source,
    impact: (context.home.urgency - context.away.urgency) / 0.75,
    confidence: 0.52,
    caveat: `Home ${pressureLabels[context.home.pressure]} (${context.home.points} pts, rank ${context.home.rank}); away ${pressureLabels[context.away.pressure]} (${context.away.points} pts, rank ${context.away.rank}).`,
  });
};

function buildFactors(input: MatchIntelligenceInput): MatchIntelligenceFactor[] {
  const { match, homeTeam, awayTeam, matchDataQuality } = input;
  const homeRating = safeNumber(homeTeam.rating, 75);
  const awayRating = safeNumber(awayTeam.rating, 75);
  const homeAttack = safeNumber(homeTeam.attack, homeRating);
  const awayAttack = safeNumber(awayTeam.attack, awayRating);
  const homeDefense = safeNumber(homeTeam.defense, homeRating);
  const awayDefense = safeNumber(awayTeam.defense, awayRating);
  const homeForm = safeNumber(homeTeam.form, homeRating);
  const awayForm = safeNumber(awayTeam.form, awayRating);
  const homeRestDays = homeTeam.advancedMetrics?.restDays ?? input.scheduleContext?.homeRestDays;
  const awayRestDays = awayTeam.advancedMetrics?.restDays ?? input.scheduleContext?.awayRestDays;
  const homeTravelFatigue = homeTeam.advancedMetrics?.travelFatigue ?? input.scheduleContext?.homeTravelFatigue;
  const awayTravelFatigue = awayTeam.advancedMetrics?.travelFatigue ?? input.scheduleContext?.awayTravelFatigue;
  const isKnockout = match.stage !== 'group';
  const ratingMetadata = coreMetricPairMetadata(homeTeam, awayTeam, 'rating');
  const formMetadata = coreMetricPairMetadata(homeTeam, awayTeam, 'form');
  const matchupMetadata = combinedCoreMetricMetadata(homeTeam, awayTeam, ['attack', 'defense']);

  return [
    factor({
      key: 'team-strength-rating-gap',
      category: 'team_strength',
      label: 'Team strength rating gap',
      side: 'match',
      quality: ratingMetadata.quality,
      source: ratingMetadata.source,
      lastUpdated: ratingMetadata.lastUpdated,
      impact: (homeRating - awayRating) / 25,
      caveat: combineCaveats(
        'Ratings are education inputs unless backed by provider or official data.',
        ratingMetadata.caveat,
      ),
    }),
    factor({
      key: 'recent-form-rating-deviation',
      category: 'recent_form',
      label: 'Recent form signal',
      side: 'match',
      quality: formMetadata.quality,
      source: formMetadata.source,
      lastUpdated: formMetadata.lastUpdated,
      impact: ((homeForm - homeRating) - (awayForm - awayRating)) / 18,
      caveat: combineCaveats(
        formMetadata.quality === 'provider'
          ? 'Current form is derived from completed provider results.'
          : 'Current form is a static form-rating deviation, not a real recent-match feed.',
        formMetadata.caveat,
      ),
    }),
    advancedFactor(
      input,
      'squadAvailability',
      'squad-availability',
      'squad',
      'Squad availability',
      (home, away) => (home - away) / 30,
      'Availability affects confidence only when backed by supplied squad metrics.',
    ),
    sourcedPairFactor({
      key: 'schedule-rest-days',
      category: 'schedule_travel',
      label: 'Rest-day gap',
      homeValue: homeRestDays,
      awayValue: awayRestDays,
      homeQuality: valueQuality(homeTeam, 'restDays', input.scheduleContext?.homeRestDays),
      awayQuality: valueQuality(awayTeam, 'restDays', input.scheduleContext?.awayRestDays),
      source: metricPairSource(homeTeam, awayTeam, 'restDays', input.scheduleContext?.source),
      impactFor: (home, away) => (home - away) / 6,
      caveat: 'Rest days are derived from provider metrics when present; otherwise from known fixture chronology.',
    }),
    sourcedPairFactor({
      key: 'schedule-travel-fatigue',
      category: 'schedule_travel',
      label: 'Travel fatigue',
      homeValue: homeTravelFatigue,
      awayValue: awayTravelFatigue,
      homeQuality: valueQuality(homeTeam, 'travelFatigue', input.scheduleContext?.homeTravelFatigue),
      awayQuality: valueQuality(awayTeam, 'travelFatigue', input.scheduleContext?.awayTravelFatigue),
      source: metricPairSource(homeTeam, awayTeam, 'travelFatigue', input.scheduleContext?.source),
      impactFor: (home, away) => (away - home) / 0.8,
      caveat: 'Travel fatigue is auto-filled as a host/non-host proxy until a distance or provider feed is available.',
    }),
    factor({
      key: 'venue-host-context',
      category: 'venue_environment',
      label: 'Venue and host context',
      side: 'match',
      quality: homeTeam.isHost || awayTeam.isHost || match.venue || match.city ? 'proxy' : 'unavailable',
      source: match.venue || match.city ? 'fixture venue/city' : 'not supplied',
      impact: homeTeam.isHost ? 0.35 : awayTeam.isHost ? -0.35 : 0,
      caveat: homeTeam.isHost || awayTeam.isHost
        ? 'Host context is modeled as a proxy until explicit venue-host and environment details are available.'
        : match.venue || match.city
          ? 'Venue/city is present, but weather, altitude, pitch condition, and explicit venue-host effects are not modeled yet.'
          : 'No host, venue-host, weather, altitude, or pitch-condition signal is available.',
    }),
    factor({
      key: 'tactical-attack-defense-matchup',
      category: 'tactical_matchup',
      label: 'Attack-defense matchup',
      side: 'match',
      quality: matchupMetadata.quality,
      source: matchupMetadata.source,
      lastUpdated: matchupMetadata.lastUpdated,
      impact: ((homeAttack - awayDefense) - (awayAttack - homeDefense)) / 25,
      caveat: combineCaveats(
        'This is an attack/defense rating matchup, not a tactical or lineup scouting report.',
        matchupMetadata.caveat,
      ),
    }),
    factor({
      key: 'market-reference',
      category: 'market',
      label: 'Market reference availability',
      side: 'match',
      quality: input.hasMarketData ? 'provider' : 'unavailable',
      source: input.hasMarketData ? 'market reference' : 'not supplied',
      impact: 0,
      confidence: input.hasMarketData ? 0.65 : 0,
      caveat: input.hasMarketData
        ? 'Market data is a reference signal only, not a source of truth or betting recommendation.'
        : 'No market reference is attached to this match; edge and market disagreement should not be inferred.',
    }),
    groupMotivationFactor(input),
    factor({
      key: 'stage-motivation-pressure',
      category: 'motivation',
      label: 'Stage motivation pressure',
      side: 'match',
      quality: 'proxy',
      source: 'match.stage',
      impact: isKnockout ? 0.12 : 0.04,
      confidence: 0.32,
      caveat: input.motivationContext
        ? 'Stage pressure is retained as a coarse backdrop; group qualification motivation carries the match-specific incentive signal.'
        : 'Stage pressure is a coarse proxy until standings incentives and team-specific motivation are modeled.',
    }),
    factor({
      key: 'match-data-quality',
      category: 'data_quality',
      label: 'Data quality and freshness',
      side: 'match',
      quality: matchDataQuality?.tier === 'official'
        ? 'real'
        : matchDataQuality?.tier === 'verified_provider'
          ? 'provider'
          : 'proxy',
      source: matchDataQuality?.label ?? match.source,
      lastUpdated: match.lastUpdated,
      impact: matchDataQuality?.canUseForRealPrediction ? 0.15 : -0.25,
      confidence: matchDataQuality?.staleness === 'fresh' ? 0.72 : 0.35,
      caveat: matchDataQuality?.caveat ?? 'Data quality is inferred from the fixture source.',
    }),
  ];
}

function buildCoverage(factors: MatchIntelligenceFactor[]): MatchIntelligenceLayer['coverage'] {
  const missingCategories = categories.filter((category) => (
    !factors.some((factorItem) => factorItem.category === category && factorItem.quality !== 'unavailable')
  ));
  const available = categories.length - missingCategories.length;

  return {
    available,
    total: categories.length,
    ratio: round(available / categories.length, 2),
    missingCategories,
  };
}

function buildSummary(factors: MatchIntelligenceFactor[]): MatchIntelligenceLayer['summary'] {
  const available = factors.filter((factorItem) => factorItem.quality !== 'unavailable');
  const byImpact = [...available].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return {
    topPositive: byImpact.filter((factorItem) => factorItem.impact > 0).slice(0, 5),
    topNegative: byImpact.filter((factorItem) => factorItem.impact < 0).slice(0, 5),
    proxyCount: factors.filter((factorItem) => factorItem.quality === 'proxy').length,
    unavailableCount: factors.filter((factorItem) => factorItem.quality === 'unavailable').length,
  };
}

export function buildMatchIntelligenceLayer(input: MatchIntelligenceInput): MatchIntelligenceLayer {
  const factors = buildFactors(input);

  return {
    matchId: input.match.id,
    factors,
    coverage: buildCoverage(factors),
    summary: buildSummary(factors),
  };
}
