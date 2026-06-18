import type { BetSelection } from '../types';
import { normalizeThreeWay, type ThreeWayProbability } from '../../../../core/probability/unifiedProbability';

export type ThreeWayOdds = Record<BetSelection, number>;

export type ModelMarketDeviation = {
  deviationScore: number;
  expectedValueDifference: ThreeWayProbability;
  uncertaintyAdjustment: number;
  marketCorrectionFactor: number;
  adjustedExpectedValue: ThreeWayProbability;
};

export const decimalOddsToImpliedProbability = (odds: number) => {
  if (!Number.isFinite(odds) || odds <= 1) throw new Error('Decimal odds must be greater than 1');
  return 1 / odds;
};

export const impliedProbabilityToFairOdds = (probability: number) => {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) throw new Error('Probability must be in (0, 1)');
  return 1 / probability;
};

export const calculateOverround = (odds: ThreeWayOdds) =>
  Object.values(odds).reduce((sum, odd) => sum + decimalOddsToImpliedProbability(odd), 0) - 1;

export const calculatePayout = (stake: number, odds: number) => stake * odds;

export const calculateProfit = (stake: number, odds: number, won: boolean) => (won ? stake * (odds - 1) : -stake);

export const normalizeBookProbabilities = (impliedProbabilities: ThreeWayOdds) => {
  const total = impliedProbabilities.home + impliedProbabilities.draw + impliedProbabilities.away || 1;
  return {
    home: impliedProbabilities.home / total,
    draw: impliedProbabilities.draw / total,
    away: impliedProbabilities.away / total,
  };
};

export const calculateExpectedValue = (modelProbability: number, odds: number) => {
  if (!Number.isFinite(modelProbability) || modelProbability < 0 || modelProbability > 1) throw new Error('Model probability must be in [0, 1]');
  if (!Number.isFinite(odds) || odds <= 1) throw new Error('Decimal odds must be greater than 1');
  return modelProbability * (odds - 1) - (1 - modelProbability);
};

export const calculateEdge = (modelProbability: number, marketProbability: number) => modelProbability - marketProbability;

export const calculateNoVigProbabilities = (odds: ThreeWayOdds) =>
  normalizeBookProbabilities({
    home: decimalOddsToImpliedProbability(odds.home),
    draw: decimalOddsToImpliedProbability(odds.draw),
    away: decimalOddsToImpliedProbability(odds.away),
  });

export function calculateModelMarketDeviation(input: {
  model: ThreeWayProbability;
  market?: ThreeWayProbability;
  odds: ThreeWayOdds;
  marketConfidence?: number;
}): ModelMarketDeviation {
  const model = normalizeThreeWay(input.model);
  const noVig = normalizeThreeWay(input.market ?? calculateNoVigProbabilities(input.odds));
  const marketCorrectionFactor = Math.min(0.65, Math.max(0, input.marketConfidence ?? 0) * 0.65);
  const corrected = normalizeThreeWay({
    home: model.home * (1 - marketCorrectionFactor) + noVig.home * marketCorrectionFactor,
    draw: model.draw * (1 - marketCorrectionFactor) + noVig.draw * marketCorrectionFactor,
    away: model.away * (1 - marketCorrectionFactor) + noVig.away * marketCorrectionFactor,
  });
  const uncertaintyAdjustment = 1 - marketCorrectionFactor;
  const expectedValueDifference = {
    home: calculateExpectedValue(model.home, input.odds.home) - calculateExpectedValue(noVig.home, input.odds.home),
    draw: calculateExpectedValue(model.draw, input.odds.draw) - calculateExpectedValue(noVig.draw, input.odds.draw),
    away: calculateExpectedValue(model.away, input.odds.away) - calculateExpectedValue(noVig.away, input.odds.away),
  };
  const adjustedExpectedValue = {
    home: calculateExpectedValue(corrected.home, input.odds.home) * (1 - uncertaintyAdjustment * 0.35),
    draw: calculateExpectedValue(corrected.draw, input.odds.draw) * (1 - uncertaintyAdjustment * 0.35),
    away: calculateExpectedValue(corrected.away, input.odds.away) * (1 - uncertaintyAdjustment * 0.35),
  };
  const deviationScore = Math.abs(model.home - noVig.home) + Math.abs(model.draw - noVig.draw) + Math.abs(model.away - noVig.away);

  return {
    deviationScore,
    expectedValueDifference,
    uncertaintyAdjustment,
    marketCorrectionFactor,
    adjustedExpectedValue,
  };
}
