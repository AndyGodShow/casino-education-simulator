import type { PredictionDecisionResult } from '../types';
import { generateScoreDistribution } from './scoreDistribution';
import { compute1X2 } from './oneX2';
import type { ScoreEntry } from './scoreDistribution';

function computeMultiFactorConfidence(
  matrix: ScoreEntry[],
  oneX2: { homeWin: number; draw: number; awayWin: number },
  lambdaHome: number,
  lambdaAway: number,
): number {
  // 1. Distribution sharpness — top score dominance
  const sorted = [...matrix].sort((a, b) => b.probability - a.probability);
  const topScoreProb = sorted[0]?.probability ?? 0;
  const sharpness = Math.min(1, topScoreProb * 3);

  // 2. Top outcome separation — gap between best and second best 1X2 outcome
  const outcomes = [oneX2.homeWin, oneX2.draw, oneX2.awayWin].sort((a, b) => b - a);
  const separation = outcomes[0] - outcomes[1];

  // 3. Entropy stability — lower entropy = higher confidence
  let entropy = 0;
  for (const entry of matrix) {
    if (entry.probability > 0) {
      entropy -= entry.probability * Math.log(entry.probability);
    }
  }
  const maxEntropy = Math.log(matrix.length || 36);
  const entropyStability = maxEntropy > 0 ? 1 - entropy / maxEntropy : 0;

  // 4. λ balance factor — small λ difference → lower confidence
  const lambdaDiff = Math.abs(lambdaHome - lambdaAway);
  const lambdaBalance = Math.min(1, lambdaDiff / 1.5);

  // Weighted combination
  const raw = sharpness * 0.25 + separation * 0.25 + entropyStability * 0.30 + lambdaBalance * 0.20;

  return Math.max(0.05, Math.min(0.95, raw));
}

export function buildDecisionLayer(
  lambdaHome: number,
  lambdaAway: number,
  maxGoals?: number,
): PredictionDecisionResult {
  const distribution = generateScoreDistribution(lambdaHome, lambdaAway, maxGoals);
  const oneX2 = compute1X2(distribution.matrix, lambdaHome, lambdaAway);

  let bestEntry = distribution.matrix[0];
  for (const entry of distribution.matrix) {
    if (entry.probability > bestEntry.probability) bestEntry = entry;
  }

  const confidence = computeMultiFactorConfidence(distribution.matrix, oneX2, lambdaHome, lambdaAway);

  return {
    expectedGoals: { home: lambdaHome, away: lambdaAway },
    scoreDistribution: distribution.matrix,
    oneX2,
    mostLikelyScore: { home: bestEntry.home, away: bestEntry.away },
    confidence,
  };
}
