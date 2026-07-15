import { poissonProbability, adaptiveMaxGoals } from './poissonModel';
import { WORLD_CUP_MODEL_CONFIG } from './modelConfig';

export type ScoreEntry = {
  home: number;
  away: number;
  probability: number;
};

export type ScoreDistribution = {
  matrix: ScoreEntry[];
  tailProbability: number;
};

const drawCorrectionConfig = WORLD_CUP_MODEL_CONFIG.scoreDistribution.drawMassCorrection;

function normalizeMatrix(matrix: ScoreEntry[]): ScoreEntry[] {
  const sum = matrix.reduce((acc, entry) => acc + entry.probability, 0);
  if (sum <= 0) return matrix;
  return matrix.map((entry) => ({ ...entry, probability: entry.probability / sum }));
}

function applyDrawMassCorrection(
  matrix: ScoreEntry[],
  lambdaHome: number,
  lambdaAway: number,
  correctionMultiplier = 1,
): ScoreEntry[] {
  const diff = Math.abs(lambdaHome - lambdaAway);
  if (diff >= drawCorrectionConfig.edgeThreshold) {
    return normalizeMatrix(matrix);
  }

  const proximity = 1 - diff / drawCorrectionConfig.edgeThreshold;
  const totalGoals = lambdaHome + lambdaAway;
  const lowTempoSignal = Math.max(
    0,
    (drawCorrectionConfig.lowTempoGoalThreshold - totalGoals) / drawCorrectionConfig.lowTempoGoalThreshold,
  );
  const maxBoost = drawCorrectionConfig.maxDiagonalBoost
    + drawCorrectionConfig.lowTempoMaxAdditionalBoost * lowTempoSignal;
  const diagonalBoost = 1 + maxBoost * correctionMultiplier * proximity * proximity;
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
  options: { applyDrawCorrection?: boolean; drawCorrectionMultiplier?: number } = {},
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
    ? applyDrawMassCorrection(normalized, lambdaHome, lambdaAway, options.drawCorrectionMultiplier)
    : normalized;

  return { matrix: corrected, tailProbability: rawTail };
}
