import type { UnifiedProbability } from '../../../core/probability/unifiedProbability';
import type { DataTrustInfo } from '../../../core/trustLayer/dataTruth';

export type WorldCupGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

export type WorldCupTeam = {
  id: string;
  name: string;
  shortName: string;
  countryCode: string;
  group: WorldCupGroup;
  rating: number;
  attack: number;
  defense: number;
  form: number;
  isHost?: boolean;
};

export type WorldCupMatchTeam = {
  id: string;
  displayName: string;
  rawName: string;
  countryCode?: string;
};

export type WorldCupMatch = {
  id: string;
  competitionId: 'world-cup-2026';
  stage: 'group' | 'round32' | 'round16' | 'quarter' | 'semi' | 'thirdPlace' | 'final';
  group?: WorldCupGroup;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam?: WorldCupMatchTeam;
  awayTeam?: WorldCupMatchTeam;
  kickoff: string;
  venue?: string;
  city?: string;
  status: 'scheduled' | 'live' | 'finished';
  homeScore?: number;
  awayScore?: number;
  source: 'real' | 'sample' | 'local' | 'openfootball' | 'api-football' | 'sportmonks' | 'manual';
  lastUpdated: string;
  truth?: DataTrustInfo;
};

export type BetSelection = 'home' | 'draw' | 'away';

export type PredictionFactor = {
  name: string;
  impact: number;
  description: string;
};

export type ScoreDistributionEntry = {
  score: string;
  probability: number;
};

export type PredictionDecisionResult = {
  expectedGoals: {
    home: number;
    away: number;
  };
  scoreDistribution: Array<{
    home: number;
    away: number;
    probability: number;
  }>;
  oneX2: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  mostLikelyScore: {
    home: number;
    away: number;
  };
  confidence: number;
};

export type MatchPrediction = {
  matchId: string;
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  expectedGoals: {
    home: number;
    away: number;
  };
  scoreDistribution: ScoreDistributionEntry[];
  mostLikelyScore: string;
  confidence: number;
  explanation: {
    summary: string;
    factors: PredictionFactor[];
  };
  modelVersion: 'v2';
  truth: DataTrustInfo;
  unifiedProbability: UnifiedProbability;
  decisionLayer: PredictionDecisionResult;
};
