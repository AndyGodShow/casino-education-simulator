import { describe, expect, it } from 'vitest';
import { calculateBettingMetrics, calculateStake, createBetSlip, settleBetSlip, voidBetSlip } from './bettingEngine';

describe('bettingEngine', () => {
  it('calculates strategy stakes', () => {
    expect(calculateStake('fixedStake', 1000, 50, 2, 0.55)).toBe(50);
    expect(calculateStake('fixedFraction', 1000, 50, 2, 0.55)).toBe(20);
    expect(calculateStake('kelly', 1000, 50, 2, 0.6)).toBeCloseTo(200);
    expect(calculateStake('halfKelly', 1000, 50, 2, 0.6)).toBeCloseTo(100);
    expect(calculateStake('quarterKelly', 1000, 50, 2, 0.6)).toBeCloseTo(50);
    expect(calculateStake('kelly', 1000, 50, 2, 0.4)).toBe(0);
  });

  it('settles losses and max drawdown', () => {
    const lost = settleBetSlip(createBetSlip({ matchId: 'm1', selection: 'home', stake: 50, odds: 2, modelProbability: 0.5 }), 'away');
    expect(lost.profit).toBe(-50);
    const metrics = calculateBettingMetrics([lost], 1000);
    expect(metrics.maxDrawdown).toBe(50);
    expect(metrics.longestLoseStreak).toBe(1);
  });

  it('handles bankruptcy and void bets', () => {
    const allInLoss = settleBetSlip(createBetSlip({ matchId: 'm2', selection: 'home', stake: 1000, odds: 2, modelProbability: 0.5 }), 'away');
    const voided = voidBetSlip(createBetSlip({ matchId: 'm3', selection: 'draw', stake: 100, odds: 3, modelProbability: 0.3 }));
    const metrics = calculateBettingMetrics([allInLoss, voided], 1000);
    expect(metrics.bankruptcyRate).toBe(1);
    expect(metrics.totalBets).toBe(1);
    expect(metrics.ROI).toBe(-1);
  });
});
