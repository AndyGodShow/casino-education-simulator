import type {
  MatchFeatureLayer,
  MatchFeatureSide,
  MatchInputCoverage,
  WorldCupAdvancedMetrics,
  WorldCupMatch,
  WorldCupTeam,
} from '../types';
import { WORLD_CUP_MODEL_CONFIG } from './modelConfig';

const featureConfig = WORLD_CUP_MODEL_CONFIG.featureLayer;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const safeRating = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

const hasNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const metricSourceWeight = (team: WorldCupTeam, field: keyof WorldCupAdvancedMetrics) => {
  const trustLevel = team.advancedMetricSources?.[field]?.trustLevel;
  return trustLevel
    ? featureConfig.advanced.provenanceWeight[trustLevel]
    : featureConfig.advanced.provenanceWeight.unsourced;
};

const pairedSourceWeight = (
  team: WorldCupTeam,
  teamField: keyof WorldCupAdvancedMetrics,
  opponent: WorldCupTeam,
  opponentField: keyof WorldCupAdvancedMetrics,
) => Math.min(metricSourceWeight(team, teamField), metricSourceWeight(opponent, opponentField));

export const compressGoalExpectation = (lambda: number) => {
  const alpha = featureConfig.goalCompressionAlpha;
  return alpha * Math.log(1 + lambda / alpha);
};

type SideInput = {
  team: WorldCupTeam;
  opponent: WorldCupTeam;
  isHome: boolean;
  match: WorldCupMatch;
};

const advancedContribution = ({ team, opponent }: SideInput) => {
  const metrics = team.advancedMetrics;
  const opponentMetrics = opponent.advancedMetrics;
  const advancedConfig = featureConfig.advanced;

  const elo = hasNumber(metrics?.elo) && hasNumber(opponentMetrics?.elo)
    ? clamp(
      (metrics.elo - opponentMetrics.elo) * advancedConfig.elo.weight,
      advancedConfig.elo.clamp.min,
      advancedConfig.elo.clamp.max,
    ) * pairedSourceWeight(team, 'elo', opponent, 'elo')
    : 0;

  const xg = hasNumber(metrics?.recentXgFor) && hasNumber(opponentMetrics?.recentXgAgainst)
    ? clamp(
      (
        (metrics.recentXgFor - advancedConfig.xg.baseline)
        + (opponentMetrics.recentXgAgainst - advancedConfig.xg.baseline)
      ) * advancedConfig.xg.weight,
      advancedConfig.xg.clamp.min,
      advancedConfig.xg.clamp.max,
    ) * pairedSourceWeight(team, 'recentXgFor', opponent, 'recentXgAgainst')
    : 0;

  const squadAvailability = hasNumber(metrics?.squadAvailability)
    ? clamp(
      (metrics.squadAvailability - advancedConfig.squadAvailability.baseline) * advancedConfig.squadAvailability.weight,
      advancedConfig.squadAvailability.clamp.min,
      advancedConfig.squadAvailability.clamp.max,
    ) * metricSourceWeight(team, 'squadAvailability')
    : 0;

  const rest = hasNumber(metrics?.restDays) && hasNumber(opponentMetrics?.restDays)
    ? clamp(
      (metrics.restDays - opponentMetrics.restDays) * advancedConfig.rest.weight,
      advancedConfig.rest.clamp.min,
      advancedConfig.rest.clamp.max,
    ) * pairedSourceWeight(team, 'restDays', opponent, 'restDays')
    : 0;

  const travel = hasNumber(metrics?.travelFatigue)
    ? -clamp(
      metrics.travelFatigue,
      advancedConfig.travel.clamp.min,
      advancedConfig.travel.clamp.max,
    ) * advancedConfig.travel.weight * metricSourceWeight(team, 'travelFatigue')
    : 0;

  return {
    elo,
    xg,
    squadAvailability,
    rest,
    travel,
    total: elo + xg + squadAvailability + rest + travel,
  };
};

const buildSideFeatureLayer = (input: SideInput): MatchFeatureSide => {
  const { team, opponent, isHome, match } = input;
  const rating = safeRating(team.rating, featureConfig.ratingFallback);
  const attack = safeRating(team.attack, rating);
  const defense = safeRating(team.defense, rating);
  const form = safeRating(team.form, rating);
  const opponentRating = safeRating(opponent.rating, featureConfig.ratingFallback);
  const opponentAttack = safeRating(opponent.attack, opponentRating);
  const opponentDefense = safeRating(opponent.defense, opponentRating);

  const baseStrength = featureConfig.baseStrength.baseline
    + (rating - featureConfig.baseStrength.ratingReference) * featureConfig.baseStrength.ratingWeight;
  const attackDefense = (attack - opponentDefense) * featureConfig.attackDefenseWeight;
  const homeAdvantage = isHome
    ? (team.isHost ? featureConfig.homeAdvantage.host : featureConfig.homeAdvantage.nonHost)
    : featureConfig.homeAdvantage.away;
  const formAdjustment = (form - rating) * featureConfig.formAdjustmentWeight;
  const ownEdge = attack - opponentDefense;
  const opponentEdge = opponentAttack - defense;
  const matchupAsymmetry = (ownEdge - opponentEdge) * featureConfig.matchupAsymmetryWeight;
  const stageMultiplier = match.stage === 'group'
    ? featureConfig.stageMultiplier.group
    : featureConfig.stageMultiplier.knockout;
  const advanced = advancedContribution(input);
  const rawLambda = (
    baseStrength
    + attackDefense
    + homeAdvantage
    + formAdjustment
    + matchupAsymmetry
    + advanced.total
  ) * stageMultiplier;
  const lambda = clamp(
    compressGoalExpectation(rawLambda),
    featureConfig.lambdaClamp.min,
    featureConfig.lambdaClamp.max,
  );

  return {
    baseStrength,
    attackDefense,
    homeAdvantage,
    formAdjustment,
    matchupAsymmetry,
    stageMultiplier,
    advanced,
    rawLambda,
    lambda,
  };
};

const countAvailableAdvancedFeatures = (homeTeam: WorldCupTeam, awayTeam: WorldCupTeam) => {
  const pairFields = ['elo', 'restDays'] as const;
  const teamFields = ['recentXgFor', 'squadAvailability', 'travelFatigue'] as const;
  const opponentFields = ['recentXgAgainst'] as const;
  let available = 0;

  for (const field of pairFields) {
    if (hasNumber(homeTeam.advancedMetrics?.[field]) && hasNumber(awayTeam.advancedMetrics?.[field])) {
      available += 1;
    }
  }
  for (const field of teamFields) {
    if (hasNumber(homeTeam.advancedMetrics?.[field])) available += 1;
    if (hasNumber(awayTeam.advancedMetrics?.[field])) available += 1;
  }
  for (const field of opponentFields) {
    if (hasNumber(homeTeam.advancedMetrics?.[field])) available += 1;
    if (hasNumber(awayTeam.advancedMetrics?.[field])) available += 1;
  }

  return available;
};

const missingAdvancedFeatures = (homeTeam: WorldCupTeam, awayTeam: WorldCupTeam) => {
  const missing = new Set<string>();
  if (!hasNumber(homeTeam.advancedMetrics?.elo) || !hasNumber(awayTeam.advancedMetrics?.elo)) missing.add('elo');
  if (!hasNumber(homeTeam.advancedMetrics?.recentXgFor) || !hasNumber(awayTeam.advancedMetrics?.recentXgFor)) missing.add('recentXgFor');
  if (!hasNumber(homeTeam.advancedMetrics?.recentXgAgainst) || !hasNumber(awayTeam.advancedMetrics?.recentXgAgainst)) missing.add('recentXgAgainst');
  if (!hasNumber(homeTeam.advancedMetrics?.squadAvailability) || !hasNumber(awayTeam.advancedMetrics?.squadAvailability)) missing.add('squadAvailability');
  if (!hasNumber(homeTeam.advancedMetrics?.restDays) || !hasNumber(awayTeam.advancedMetrics?.restDays)) missing.add('restDays');
  if (!hasNumber(homeTeam.advancedMetrics?.travelFatigue) || !hasNumber(awayTeam.advancedMetrics?.travelFatigue)) missing.add('travelFatigue');
  return [...missing];
};

const baseCoverageFields = ['rating', 'attack', 'defense', 'form'] as const;
const advancedCoverageFields = [
  'elo',
  'recentXgFor',
  'recentXgAgainst',
  'squadAvailability',
  'restDays',
  'travelFatigue',
] as const;

const buildInputCoverage = (homeTeam: WorldCupTeam, awayTeam: WorldCupTeam): MatchInputCoverage => {
  const sides = [
    { label: 'home', team: homeTeam },
    { label: 'away', team: awayTeam },
  ] as const;
  const missingFields: string[] = [];
  let baseFieldsAvailable = 0;
  let advancedFieldsAvailable = 0;
  let advancedSourceQualityTotal = 0;

  for (const { label, team } of sides) {
    for (const field of baseCoverageFields) {
      if (hasNumber(team[field])) {
        baseFieldsAvailable += 1;
      } else {
        missingFields.push(`${label}.${field}`);
      }
    }

    for (const field of advancedCoverageFields) {
      if (hasNumber(team.advancedMetrics?.[field])) {
        advancedFieldsAvailable += 1;
        advancedSourceQualityTotal += metricSourceWeight(team, field);
      } else {
        missingFields.push(`${label}.advancedMetrics.${field}`);
      }
    }
  }

  const baseFieldsTotal = sides.length * baseCoverageFields.length;
  const advancedFieldsTotal = sides.length * advancedCoverageFields.length;
  const fieldsTotal = baseFieldsTotal + advancedFieldsTotal;
  const fieldsAvailable = baseFieldsAvailable + advancedFieldsAvailable;
  const effectiveFieldsAvailable = baseFieldsAvailable + advancedSourceQualityTotal;

  return {
    baseFieldsAvailable,
    baseFieldsTotal,
    advancedFieldsAvailable,
    advancedFieldsTotal,
    structuralRatio: Number((fieldsAvailable / fieldsTotal).toFixed(2)),
    advancedSourceQualityRatio: advancedFieldsAvailable > 0
      ? Number((advancedSourceQualityTotal / advancedFieldsAvailable).toFixed(2))
      : 1,
    overallRatio: Number((effectiveFieldsAvailable / fieldsTotal).toFixed(2)),
    missingFields,
  };
};

export function buildMatchFeatureLayer(
  match: WorldCupMatch,
  homeTeam: WorldCupTeam,
  awayTeam: WorldCupTeam,
): MatchFeatureLayer {
  return {
    home: buildSideFeatureLayer({ team: homeTeam, opponent: awayTeam, isHome: true, match }),
    away: buildSideFeatureLayer({ team: awayTeam, opponent: homeTeam, isHome: false, match }),
    metadata: {
      availableAdvancedFeatures: countAvailableAdvancedFeatures(homeTeam, awayTeam),
      missingAdvancedFeatures: missingAdvancedFeatures(homeTeam, awayTeam),
      inputCoverage: buildInputCoverage(homeTeam, awayTeam),
    },
  };
}
