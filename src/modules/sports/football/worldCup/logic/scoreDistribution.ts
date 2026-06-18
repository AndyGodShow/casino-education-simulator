import { poissonProbability, adaptiveMaxGoals } from './poissonModel';

export type ScoreEntry = {
  home: number;
  away: number;
  probability: number;
};

export type ScoreDistribution = {
  matrix: ScoreEntry[];
  tailProbability: number;
};

export function generateScoreDistribution(
  lambdaHome: number,
  lambdaAway: number,
  maxGoalsOverride?: number,
): ScoreDistribution {
  const maxGoals = maxGoalsOverride ?? adaptiveMaxGoals(lambdaHome, lambdaAway);
  const matrix: ScoreEntry[] = [];
  let enumerated = 0;

  for (let home = 0; home <= maxGoals; home += 1) {
    for (let away = 0; away <= maxGoals; away += 1) {
      const p = poissonProbability(lambdaHome, home) * poissonProbability(lambdaAway, away);
      matrix.push({ home, away, probability: p });
      enumerated += p;
    }
  }

  const rawTail = Math.max(0, 1 - enumerated);

  // Probability smoothing: add uniform floor to prevent sharp tail cutoff,
  // then normalize once so sum = 1 exactly.
  const floor = rawTail / (matrix.length || 1);
  for (const entry of matrix) {
    entry.probability = entry.probability + floor;
  }

  const sum = matrix.reduce((acc, e) => acc + e.probability, 0);
  if (sum > 0) {
    for (const entry of matrix) {
      entry.probability /= sum;
    }
  }

  return { matrix, tailProbability: sum > 0 ? rawTail / sum : 0 };
}
