import type { BetSelection } from '../types';
import { calculateOverround, calculatePayout, type ThreeWayOdds } from './oddsEngine';

type BookmakerExposure = {
  outcome: BetSelection;
  totalStake: number;
  potentialPayout: number;
  bookmakerProfitIfOutcome: number;
};

export type BookmakerSimulation = {
  overround: number;
  payoutRatio: number;
  exposures: BookmakerExposure[];
  riskLevel: 'low' | 'medium' | 'high';
  explanation: string[];
};

export function simulateBookmaker(odds: ThreeWayOdds, stakes: Record<BetSelection, number>): BookmakerSimulation {
  const totalStake = stakes.home + stakes.draw + stakes.away;
  const exposures = (['home', 'draw', 'away'] as BetSelection[]).map((outcome) => {
    const potentialPayout = calculatePayout(stakes[outcome], odds[outcome]);
    return {
      outcome,
      totalStake: stakes[outcome],
      potentialPayout,
      bookmakerProfitIfOutcome: totalStake - potentialPayout,
    };
  });
  const worstProfit = Math.min(...exposures.map((item) => item.bookmakerProfitIfOutcome));
  const riskRatio = totalStake ? Math.abs(Math.min(0, worstProfit)) / totalStake : 0;
  const riskLevel = riskRatio > 0.35 ? 'high' : riskRatio > 0.12 ? 'medium' : 'low';
  const overround = calculateOverround(odds);

  return {
    overround,
    payoutRatio: 1 / (1 + overround),
    exposures,
    riskLevel,
    explanation: [
      '赔率隐含概率总和超过 100%，差额是庄家优势的一种体现。',
      '热门方向下注过多时，庄家可能降低热门赔率或提高反向赔率来平衡赔付风险。',
      '该模拟只展示风险管理逻辑，不构成投注建议。',
    ],
  };
}
