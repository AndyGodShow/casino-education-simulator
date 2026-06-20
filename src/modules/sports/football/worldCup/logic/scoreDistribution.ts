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

const DRAW_CORRECTION_THRESHOLD = 0.5;
const MAX_DIAGONAL_BOOST = 0.45;

function normalizeMatrix(matrix: ScoreEntry[]): ScoreEntry[] {
  const sum = matrix.reduce((acc, entry) => acc + entry.probability, 0);
  if (sum <= 0) return matrix;
  return matrix.map((entry) => ({ ...entry, probability: entry.probability / sum }));
}

export function applyDrawMassCorrection(
  matrix: ScoreEntry[],
  lambdaHome: number,
  lambdaAway: number,
): ScoreEntry[] {
  const diff = Math.abs(lambdaHome - lambdaAway);
  if (diff >= DRAW_CORRECTION_THRESHOLD) {
    return normalizeMatrix(matrix);
  }

  const proximity = 1 - diff / DRAW_CORRECTION_THRESHOLD;
  const diagonalBoost = 1 + MAX_DIAGONAL_BOOST * proximity * proximity;
  const corrected = matrix.map((entry) => ({
    ...entry,
    probability: entry.home === entry.away
      ? entry.probability * diagonalBoost
      : entry.probability,
  }));

  return normalizeMatrix(corrected);
}

export function generateScoreDistribution(
  lambdaHome: number,
  lambdaAway: number,
  maxGoalsOverride?: number,
  options: { applyDrawCorrection?: boolean } = {},
): ScoreDistribution {
  const shouldApplyDrawCorrection = options.applyDrawCorrection ?? true;
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

  // Proportional tail compensation: distribute truncated probability mass
  // to each score entry in proportion to its original probability.
  // This preserves distribution shape under truncation — high-probability
  // scores (e.g. 1-0) receive more tail mass than rare scores (e.g. 5-4).
  if (enumerated > 0 && rawTail > 0) {
    for (const entry of matrix) {
      entry.probability += rawTail * (entry.probability / enumerated);
    }
  }

  const normalized = normalizeMatrix(matrix);
  const corrected = shouldApplyDrawCorrection
    ? applyDrawMassCorrection(normalized, lambdaHome, lambdaAway)
    : normalized;

  return { matrix: corrected, tailProbability: rawTail };
}
