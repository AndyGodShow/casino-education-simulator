import type { MatchPrediction, ScoreDistributionEntry, WorldCupMatch, WorldCupTeam } from '../types';
import { createUnifiedProbability } from '../../../../core/probability/unifiedProbability';
import { evaluateMatchTruth } from '../../../../core/trustLayer/trustEvaluator';
import { buildDecisionLayer } from './predictionDecisionLayer';
import { buildMatchFeatureLayer, compressGoalExpectation } from './featureLayer';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const safeRating = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

const normalizeImpact = (value: number, scale: number) => clamp(value / scale, -1, 1);

export type ExpectedGoals = {
  home: number;
  away: number;
};

export function computeLambda(
  team: WorldCupTeam,
  opponent: WorldCupTeam,
  isHome: boolean,
  match: WorldCupMatch,
): number {
  const featureLayer = buildMatchFeatureLayer(
    match,
    isHome ? team : opponent,
    isHome ? opponent : team,
  );
  return isHome ? featureLayer.home.lambda : featureLayer.away.lambda;
}

export function computeBaseLambdaForAlpha(
  _match: WorldCupMatch,
  homeTeam: WorldCupTeam,
  awayTeam: WorldCupTeam,
): ExpectedGoals {
  const homeRating = safeRating(homeTeam.rating, 75);
  const awayRating = safeRating(awayTeam.rating, 75);
  const homeAttack = safeRating(homeTeam.attack, homeRating);
  const homeDefense = safeRating(homeTeam.defense, homeRating);
  const awayAttack = safeRating(awayTeam.attack, awayRating);
  const awayDefense = safeRating(awayTeam.defense, awayRating);

  const baseFor = (
    teamRating: number,
    teamAttack: number,
    opponentDefense: number,
    isHome: boolean,
  ) => {
    const baseStrength = 0.85 + (teamRating - 60) * 0.014;
    const attackDefenseSplit = (teamAttack - opponentDefense) * 0.014;
    const baselineHomePrior = isHome ? 0.06 : 0;
    return clamp(compressGoalExpectation(baseStrength + attackDefenseSplit + baselineHomePrior), 0.2, 4.5);
  };

  return {
    home: baseFor(homeRating, homeAttack, awayDefense, true),
    away: baseFor(awayRating, awayAttack, homeDefense, false),
  };
}

export function predictMatch(match: WorldCupMatch, homeTeam: WorldCupTeam, awayTeam: WorldCupTeam): MatchPrediction {
  const featureLayer = buildMatchFeatureLayer(match, homeTeam, awayTeam);
  const lambdaHome = featureLayer.home.lambda;
  const lambdaAway = featureLayer.away.lambda;

  const decisionLayer = buildDecisionLayer(lambdaHome, lambdaAway);

  const normalizedHome = decisionLayer.oneX2.homeWin;
  const normalizedDraw = decisionLayer.oneX2.draw;
  const normalizedAway = decisionLayer.oneX2.awayWin;
  const favoriteProb = Math.max(normalizedHome, normalizedAway);
  const confidence = decisionLayer.confidence;

  const truth = evaluateMatchTruth(match);
  const unifiedProbability = createUnifiedProbability({
    matchId: match.id,
    model: {
      home: normalizedHome,
      draw: normalizedDraw,
      away: normalizedAway,
    },
    truth,
  });

  // Score distribution derived from decision layer (single source of truth)
  const scoreDistribution: ScoreDistributionEntry[] = decisionLayer.scoreDistribution
    .map(({ home, away, probability }) => ({ score: `${home}-${away}`, probability }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 8);

  const mostLikelyScore = `${decisionLayer.mostLikelyScore.home}-${decisionLayer.mostLikelyScore.away}`;

  const homeRating = safeRating(homeTeam.rating, 75);
  const awayRating = safeRating(awayTeam.rating, 75);
  const ratingDelta = homeRating - awayRating;
  const formDelta = safeRating(homeTeam.form, homeRating) - safeRating(awayTeam.form, awayRating);
  const homeAttackEdge = safeRating(homeTeam.attack, homeRating) - safeRating(awayTeam.defense, awayRating);
  const awayAttackEdge = safeRating(awayTeam.attack, awayRating) - safeRating(homeTeam.defense, homeRating);
  const strengthGap = ratingDelta * 0.055 + homeAttackEdge * 0.024 - awayAttackEdge * 0.024;
  const formFactor = formDelta * 0.018;

  const factors = [
    {
      name: 'Structured expected goals (λ)',
      impact: normalizeImpact(lambdaHome - lambdaAway, 2.5),
      description: `λ decomposed into base strength, attack/defense split, home advantage, form adjustment, and matchup factor. Home λ=${lambdaHome.toFixed(2)}, Away λ=${lambdaAway.toFixed(2)}.`,
    },
    {
      name: 'Team strength gap',
      impact: normalizeImpact(strengthGap, 2.5),
      description: 'Compares rating strength plus each attack against the opposing defense.',
    },
    {
      name: 'Form factor',
      impact: normalizeImpact(formFactor, 0.45),
      description: 'Uses recent performance ratings when present, with rating-derived baselines for missing values.',
    },
    {
      name: 'Match context',
      impact: normalizeImpact(homeTeam.isHost ? 0.15 : 0, 0.2),
      description: 'Home advantage explicitly modeled in λ computation with host boost.',
    },
  ];

  return {
    matchId: match.id,
    probabilities: {
      homeWin: normalizedHome,
      draw: normalizedDraw,
      awayWin: normalizedAway,
    },
    expectedGoals: {
      home: lambdaHome,
      away: lambdaAway,
    },
    scoreDistribution,
    mostLikelyScore,
    confidence,
    explanation: {
      summary: `Prediction V2 favors ${normalizedHome >= normalizedAway ? homeTeam.name : awayTeam.name} with ${(favoriteProb * 100).toFixed(1)}% top-side probability. λ_home=${lambdaHome.toFixed(2)}, λ_away=${lambdaAway.toFixed(2)}.`,
      factors,
    },
    modelVersion: 'v2',
    truth,
    unifiedProbability,
    decisionLayer,
    featureLayer,
  };
}
