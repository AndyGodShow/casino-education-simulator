import type { ThreeWayOdds, ModelMarketDeviation } from '../logic/oddsEngine';
import type { QualificationProbability } from '../logic/groupSimulation';
import type { MatchPrediction, WorldCupMatch, WorldCupTeam } from '../types';

export type MatchViewModel = WorldCupMatch;
export type TeamViewModel = WorldCupTeam;

export type MarketData = {
  odds?: ThreeWayOdds;
  deviation?: ModelMarketDeviation | null;
  status: 'available' | 'empty' | 'stale' | 'error';
  message: string;
};

export type GroupSimulationState = {
  probabilities: QualificationProbability[];
};

export type WorldCupDomainSource = 'api' | 'openfootball' | 'sportmonks' | 'sample';

export type DataSourceStatus = {
  source: WorldCupDomainSource;
  label: string;
  lastUpdated: number;
  errors: string[];
  isSample: boolean;
};

export type WorldCupDomainModel = {
  matches: MatchViewModel[];
  teams: Record<string, TeamViewModel>;
  predictions: Record<string, MatchPrediction>;
  markets?: Record<string, MarketData | null>;
  simulation?: GroupSimulationState;
  source: WorldCupDomainSource;
  lastUpdated: number;
  errors?: string[];
};

