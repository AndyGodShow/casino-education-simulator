type ScoreProbability = {
  homeGoals: number;
  awayGoals: number;
  probability: number;
};

export type PoissonResult = {
  matrix: ScoreProbability[];
  mostLikelyScore: string;
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  tailProbability: number;
};

const factorial = (value: number): number => {
  let result = 1;
  for (let i = 2; i <= value; i += 1) result *= i;
  return result;
};

export const poissonProbability = (lambda: number, goals: number) => {
  const safeLambda = Math.max(0.05, lambda);
  return (Math.exp(-safeLambda) * safeLambda ** goals) / factorial(goals);
};

export function adaptiveMaxGoals(lambdaHome: number, lambdaAway: number): number {
  return Math.max(5, Math.ceil(Math.max(lambdaHome, lambdaAway) + 3));
}

export function buildScoreMatrix(expectedHomeGoals: number, expectedAwayGoals: number, maxGoalsOverride?: number): PoissonResult {
  const maxGoals = maxGoalsOverride ?? adaptiveMaxGoals(expectedHomeGoals, expectedAwayGoals);
  const matrix: ScoreProbability[] = [];
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let mostLikely = { score: '0-0', probability: -1 };

  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      const probability = poissonProbability(expectedHomeGoals, homeGoals) * poissonProbability(expectedAwayGoals, awayGoals);
      matrix.push({ homeGoals, awayGoals, probability });

      if (homeGoals > awayGoals) homeWin += probability;
      else if (homeGoals === awayGoals) draw += probability;
      else awayWin += probability;

      if (probability > mostLikely.probability) {
        mostLikely = { score: `${homeGoals}-${awayGoals}`, probability };
      }
    }
  }

  const enumerated = homeWin + draw + awayWin;
  const tailProbability = Math.max(0, 1 - enumerated);
  const total = enumerated || 1;

  // Normalize matrix entries
  for (const entry of matrix) {
    entry.probability /= total;
  }

  return {
    matrix,
    mostLikelyScore: mostLikely.score,
    probabilities: {
      homeWin: homeWin / total,
      draw: draw / total,
      awayWin: awayWin / total,
    },
    tailProbability: total > 0 ? tailProbability / (enumerated + tailProbability) : 0,
  };
}
