import type { DataTrustInfo } from '../trustLayer/dataTruth';
import { evaluatePredictionTruth } from '../trustLayer/trustEvaluator';

type ProbabilitySource = 'model' | 'polymarket' | 'ensemble';

export type ThreeWayProbability = {
  home: number;
  draw: number;
  away: number;
};

export type SourcedThreeWayProbability<TSource extends ProbabilitySource = ProbabilitySource> = ThreeWayProbability & {
  source: TSource;
};

export type UnifiedProbability = {
  matchId: string;
  model: SourcedThreeWayProbability<'model'>;
  market?: SourcedThreeWayProbability<'polymarket'>;
  merged?: SourcedThreeWayProbability<'ensemble'>;
  truth: DataTrustInfo;
};

const sanitize = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

export function normalizeThreeWay(input: Partial<ThreeWayProbability>, fallback: ThreeWayProbability = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 }): ThreeWayProbability {
  const home = sanitize(Number(input.home));
  const draw = sanitize(Number(input.draw));
  const away = sanitize(Number(input.away));
  const total = home + draw + away;
  if (total <= 0) return fallback;
  return {
    home: home / total,
    draw: draw / total,
    away: away / total,
  };
}

export function assertValidThreeWay(probability: ThreeWayProbability) {
  const values = [probability.home, probability.draw, probability.away];
  return values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1) &&
    Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 0.000001;
}

export function mergeModelAndMarket(
  model: ThreeWayProbability,
  market: ThreeWayProbability | undefined,
  marketConfidence = 0,
): SourcedThreeWayProbability<'ensemble'> {
  const normalizedModel = normalizeThreeWay(model);
  if (!market) return { ...normalizedModel, source: 'ensemble' };
  const normalizedMarket = normalizeThreeWay(market);
  const marketWeight = Math.min(0.55, Math.max(0, marketConfidence) * 0.55);
  const modelWeight = 1 - marketWeight;
  return {
    ...normalizeThreeWay({
      home: normalizedModel.home * modelWeight + normalizedMarket.home * marketWeight,
      draw: normalizedModel.draw * modelWeight + normalizedMarket.draw * marketWeight,
      away: normalizedModel.away * modelWeight + normalizedMarket.away * marketWeight,
    }),
    source: 'ensemble',
  };
}

export function createUnifiedProbability(input: {
  matchId: string;
  model: ThreeWayProbability;
  market?: ThreeWayProbability;
  marketConfidence?: number;
  truth?: DataTrustInfo;
}): UnifiedProbability {
  const model = { ...normalizeThreeWay(input.model), source: 'model' as const };
  const market = input.market ? { ...normalizeThreeWay(input.market), source: 'polymarket' as const } : undefined;
  return {
    matchId: input.matchId,
    model,
    market,
    merged: mergeModelAndMarket(model, market, input.marketConfidence),
    truth: input.truth ?? evaluatePredictionTruth({ matchId: input.matchId }),
  };
}

export function unifiedProbabilityFromPrediction(prediction: {
  matchId: string;
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  truth?: DataTrustInfo;
}): UnifiedProbability {
  return createUnifiedProbability({
    matchId: prediction.matchId,
    model: {
      home: prediction.probabilities.homeWin,
      draw: prediction.probabilities.draw,
      away: prediction.probabilities.awayWin,
    },
    truth: prediction.truth,
  });
}
