import { useMemo } from 'react';
import { simulateManyTournaments, type SimulationConfig } from '../../modules/sports/football/worldCup/logic/groupSimulation';

export function useGroupSimulation(config: number | Partial<SimulationConfig> = 1000) {
  const iterations = typeof config === 'number' ? config : config.iterations ?? 1000;
  const truthLevelWeighting = typeof config === 'number' ? true : config.truthLevelWeighting ?? true;
  return useMemo(() => simulateManyTournaments({ iterations, truthLevelWeighting }), [iterations, truthLevelWeighting]);
}
