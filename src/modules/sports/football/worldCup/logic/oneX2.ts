import type { ScoreEntry } from './scoreDistribution';

export type OneX2Result = {
  homeWin: number;
  draw: number;
  awayWin: number;
};

export function compute1X2(matrix: ScoreEntry[]): OneX2Result {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (const entry of matrix) {
    if (entry.home > entry.away) homeWin += entry.probability;
    else if (entry.home === entry.away) draw += entry.probability;
    else awayWin += entry.probability;
  }

  // Strict normalization safeguard
  const total = homeWin + draw + awayWin;
  if (total <= 0) return { homeWin: 1 / 3, draw: 1 / 3, awayWin: 1 / 3 };

  return {
    homeWin: homeWin / total,
    draw: draw / total,
    awayWin: awayWin / total,
  };
}
