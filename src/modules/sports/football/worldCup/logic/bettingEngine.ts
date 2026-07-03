import type { BetSelection } from '../types';
import { calculateProfit } from './oddsEngine';

export type BetSlip = {
  id: string;
  matchId: string;
  selection: BetSelection;
  stake: number;
  odds: number;
  modelProbability: number;
  marketProbability?: number;
  status: 'pending' | 'win' | 'lose' | 'void';
  profit: number;
  createdAt: string;
};

export type BettingStrategy = 'fixedStake' | 'fixedFraction' | 'kelly' | 'halfKelly' | 'quarterKelly' | 'martingale' | 'allIn';

export type BettingMetrics = {
  totalBets: number;
  winRate: number;
  profit: number;
  ROI: number;
  maxDrawdown: number;
  bankruptcyRate: number;
  longestWinStreak: number;
  longestLoseStreak: number;
  equityCurve: number[];
};

export function calculateStake(strategy: BettingStrategy, bankroll: number, baseStake: number, odds: number, probability: number, lossStreak = 0) {
  if (!Number.isFinite(bankroll) || bankroll <= 0 || !Number.isFinite(baseStake) || baseStake <= 0) return 0;
  if (!Number.isFinite(odds) || odds <= 1 || !Number.isFinite(probability) || probability < 0 || probability > 1) return 0;
  if (strategy === 'fixedStake') return Math.min(bankroll, baseStake);
  if (strategy === 'fixedFraction') return Math.min(bankroll, bankroll * 0.02);
  if (strategy === 'allIn') return bankroll;
  if (strategy === 'martingale') return Math.min(bankroll, baseStake * 2 ** lossStreak);

  const b = odds - 1;
  const q = 1 - probability;
  const kelly = Math.max(0, (b * probability - q) / b) * bankroll;
  if (strategy === 'kelly') return Math.min(bankroll, kelly);
  if (strategy === 'halfKelly') return Math.min(bankroll, kelly * 0.5);
  return Math.min(bankroll, kelly * 0.25);
}

export function createBetSlip(input: Omit<BetSlip, 'id' | 'profit' | 'createdAt' | 'status'>): BetSlip {
  return {
    ...input,
    id: `${input.matchId}-${input.selection}-${Date.now()}`,
    status: 'pending',
    profit: 0,
    createdAt: new Date().toISOString(),
  };
}

export function settleBetSlip(bet: BetSlip, outcome: BetSelection): BetSlip {
  const won = bet.selection === outcome;
  return { ...bet, status: won ? 'win' : 'lose', profit: calculateProfit(bet.stake, bet.odds, won) };
}

export function voidBetSlip(bet: BetSlip): BetSlip {
  return { ...bet, status: 'void', profit: 0 };
}

export function calculateBettingMetrics(settledBets: BetSlip[], startingBankroll: number): BettingMetrics {
  let bankroll = startingBankroll;
  let peak = startingBankroll;
  let maxDrawdown = 0;
  let wins = 0;
  let currentWin = 0;
  let currentLose = 0;
  let longestWinStreak = 0;
  let longestLoseStreak = 0;
  const equityCurve = [startingBankroll];
  const accountableBets = settledBets.filter((bet) => bet.status === 'win' || bet.status === 'lose');
  const totalStake = accountableBets.reduce((sum, bet) => sum + bet.stake, 0);

  for (const bet of settledBets) {
    bankroll += bet.profit;
    equityCurve.push(bankroll);
    peak = Math.max(peak, bankroll);
    maxDrawdown = Math.max(maxDrawdown, peak - bankroll);

    if (bet.status === 'win') {
      wins += 1;
      currentWin += 1;
      currentLose = 0;
    } else if (bet.status === 'lose') {
      currentLose += 1;
      currentWin = 0;
    }
    longestWinStreak = Math.max(longestWinStreak, currentWin);
    longestLoseStreak = Math.max(longestLoseStreak, currentLose);
  }

  const profit = bankroll - startingBankroll;
  return {
    totalBets: accountableBets.length,
    winRate: accountableBets.length ? wins / accountableBets.length : 0,
    profit,
    ROI: totalStake ? profit / totalStake : 0,
    maxDrawdown,
    bankruptcyRate: equityCurve.some((value) => value <= 0) ? 1 : 0,
    longestWinStreak,
    longestLoseStreak,
    equityCurve,
  };
}
