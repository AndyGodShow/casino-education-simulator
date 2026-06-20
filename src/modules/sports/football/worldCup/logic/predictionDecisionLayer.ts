import type { PredictionDecisionResult } from '../types';
import { generateScoreDistribution } from './scoreDistribution';
import { compute1X2 } from './oneX2';
import type { ScoreEntry } from './scoreDistribution';
import { runAllValidations } from './consistencyValidator';

function computeMultiFactorConfidence(
  matrix: ScoreEntry[],
  oneX2: { homeWin: number; draw: number; awayWin: number },
  lambdaHome: number,
  lambdaAway: number,
): number {
  // 1. Distribution peakedness — how concentrated is the most likely score
  const sorted = [...matrix].sort((a, b) => b.probability - a.probability);
  const maxProb = sorted[0]?.probability ?? 0;
  const peakedness = Math.min(1, maxProb * 4);

  // 2. Top-2 gap — separation between best and second-best 1X2 outcome
  const outcomes = [oneX2.homeWin, oneX2.draw, oneX2.awayWin].sort((a, b) => b - a);
  const top2Gap = outcomes[0] - outcomes[1];

  // 3. λ imbalance penalty — small λ difference → uncertainty
  const lambdaDiff = Math.abs(lambdaHome - lambdaAway);
  const lambdaBalancePenalty = 1 - Math.exp(-lambdaDiff * 2);

  const raw = peakedness * 0.35 + top2Gap * 0.35 + lambdaBalancePenalty * 0.30;

  return Math.max(0.05, Math.min(0.95, raw));
}

export function buildDecisionLayer(
  lambdaHome: number,
  lambdaAway: number,
  maxGoals?: number,
): PredictionDecisionResult {
  const distribution = generateScoreDistribution(lambdaHome, lambdaAway, maxGoals);
  const oneX2 = compute1X2(distribution.matrix);

  let bestEntry = distribution.matrix[0];
  for (const entry of distribution.matrix) {
    if (entry.probability > bestEntry.probability) bestEntry = entry;
  }

  const confidence = computeMultiFactorConfidence(distribution.matrix, oneX2, lambdaHome, lambdaAway);

  // Dev-mode consistency validation
  runAllValidations(lambdaHome, lambdaAway, distribution.matrix, oneX2);

  return {
    expectedGoals: { home: lambdaHome, away: lambdaAway },
    scoreDistribution: distribution.matrix,
    oneX2,
    mostLikelyScore: { home: bestEntry.home, away: bestEntry.away },
    confidence,
  };
}
