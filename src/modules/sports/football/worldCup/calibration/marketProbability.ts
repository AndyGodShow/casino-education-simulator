import type { BetSelection } from '../types';
import { decimalOddsToImpliedProbability, type ThreeWayOdds } from '../logic/oddsEngine';

export type MarketProbabilityInput =
  | ({ kind: 'polymarketPrice' } & Record<BetSelection, number>)
  | ({ kind: 'decimalOdds' } & ThreeWayOdds);

const clampProbability = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const normalize = (values: Record<BetSelection, number>): Record<BetSelection, number> => {
  const total = values.home + values.draw + values.away;
  if (total <= 0) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  return {
    home: values.home / total,
    draw: values.draw / total,
    away: values.away / total,
  };
};

export function convertMarketProbabilities(input: MarketProbabilityInput): Record<BetSelection, number> {
  if (input.kind === 'polymarketPrice') {
    return normalize({
      home: clampProbability(input.home),
      draw: clampProbability(input.draw),
      away: clampProbability(input.away),
    });
  }

  return normalize({
    home: decimalOddsToImpliedProbability(input.home),
    draw: decimalOddsToImpliedProbability(input.draw),
    away: decimalOddsToImpliedProbability(input.away),
  });
}
