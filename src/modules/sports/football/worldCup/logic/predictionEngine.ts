import type { MatchPrediction, ScoreDistributionEntry, WorldCupMatch, WorldCupTeam } from '../types';
import { createUnifiedProbability } from '../../../../core/probability/unifiedProbability';
import { evaluateMatchTruth } from '../../../../core/trustLayer/trustEvaluator';
import { buildScoreMatrix } from './poissonModel';
import { buildDecisionLayer } from './predictionDecisionLayer';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const safeRating = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

const normalizeImpact = (value: number, scale: number) => clamp(value / scale, -1, 1);

function computeLambda(
  team: WorldCupTeam,
  opponent: WorldCupTeam,
  isHome: boolean,
  match: WorldCupMatch,
): number {
  const rating = safeRating(team.rating, 75);
  const attack = safeRating(team.attack, rating);
  const defense = safeRating(team.defense, rating);
  const form = safeRating(team.form, rating);
  const oppAttack = safeRating(opponent.attack, opponent.rating);
  const oppDefense = safeRating(opponent.defense, opponent.rating);

  // 1. baseStrength — rating to goal expectation baseline
  const baseStrength = 0.85 + (rating - 60) * 0.014;

  // 2. attack/defense split — own attack vs opponent defense
  const attackContrib = (attack - oppDefense) * 0.014;

  // 3. homeAdvantage — explicit home field boost
  const homeAdvantage = isHome ? (team.isHost ? 0.28 : 0.12) : 0;

  // 4. formAdjustment — deviation from baseline rating
  const formAdj = (form - rating) * 0.014;

  // 5. matchupFactor — attack/defense gap asymmetry between sides
  const ownEdge = attack - oppDefense;
  const oppEdge = oppAttack - defense;
  const matchupAsymmetry = (ownEdge - oppEdge) * 0.008;

  // 6. stage factor — knockout matches slightly lower scoring
  const stageFactor = match.stage === 'group' ? 1.0 : 0.96;

  const lambda = (baseStrength + attackContrib + homeAdvantage + formAdj + matchupAsymmetry) * stageFactor;

  return clamp(lambda, 0.2, 4.5);
}

export function predictMatch(match: WorldCupMatch, homeTeam: WorldCupTeam, awayTeam: WorldCupTeam): MatchPrediction {
  const lambdaHome = computeLambda(homeTeam, awayTeam, true, match);
  const lambdaAway = computeLambda(awayTeam, homeTeam, false, match);

  const poisson = buildScoreMatrix(lambdaHome, lambdaAway);
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

  const scoreDistribution: ScoreDistributionEntry[] = poisson.matrix
    .map(({ homeGoals, awayGoals, probability }) => ({ score: `${homeGoals}-${awayGoals}`, probability }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 8);

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
    mostLikelyScore: poisson.mostLikelyScore,
    confidence,
    explanation: {
      summary: `Poisson V2 favors ${normalizedHome >= normalizedAway ? homeTeam.name : awayTeam.name} with ${(favoriteProb * 100).toFixed(1)}% top-side probability. λ_home=${lambdaHome.toFixed(2)}, λ_away=${lambdaAway.toFixed(2)}.`,
      factors,
    },
    modelVersion: 'v2',
    truth,
    unifiedProbability,
    decisionLayer,
  };
}
