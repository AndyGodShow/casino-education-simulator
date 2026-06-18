import { useMemo } from 'react';
import { calculateBettingMetrics, createBetSlip, settleBetSlip } from '../../modules/sports/football/worldCup/logic/bettingEngine';

export function useBettingSimulator() {
  return useMemo(() => {
    const bets = [
      settleBetSlip(createBetSlip({ matchId: 'a-1', selection: 'home', stake: 20, odds: 1.8, modelProbability: 0.54 }), 'home'),
      settleBetSlip(createBetSlip({ matchId: 'a-2', selection: 'away', stake: 20, odds: 4.5, modelProbability: 0.24 }), 'home'),
      settleBetSlip(createBetSlip({ matchId: 'b-1', selection: 'draw', stake: 15, odds: 3.5, modelProbability: 0.28 }), 'draw'),
    ];
    return { bets, metrics: calculateBettingMetrics(bets, 1000) };
  }, []);
}
