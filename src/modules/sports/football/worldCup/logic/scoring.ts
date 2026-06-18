import type { BetSelection } from '../types';

const clampProbability = (probability: number) => Math.min(0.999999, Math.max(0.000001, probability));

export type PredictionResult = {
  probabilities: Record<BetSelection, number>;
  outcome: BetSelection;
};

export const calculateAccuracy = (results: PredictionResult[]) =>
  results.length
    ? results.filter((result) => {
      const predicted = (Object.entries(result.probabilities) as Array<[BetSelection, number]>).sort((a, b) => b[1] - a[1])[0][0];
      return predicted === result.outcome;
    }).length / results.length
    : 0;

export const calculateBrierScore = (results: PredictionResult[]) =>
  results.length
    ? results.reduce((sum, result) => sum + (['home', 'draw', 'away'] as BetSelection[]).reduce((inner, key) => {
      const actual = result.outcome === key ? 1 : 0;
      return inner + (result.probabilities[key] - actual) ** 2;
    }, 0), 0) / results.length
    : 0;

export const calculateLogLoss = (results: PredictionResult[]) =>
  results.length
    ? -results.reduce((sum, result) => sum + Math.log(clampProbability(result.probabilities[result.outcome])), 0) / results.length
    : 0;
