import type { UnifiedProbability } from '../../../core/probability/unifiedProbability';
import type { DataTrustInfo } from '../../../core/trustLayer/dataTruth';

export type WorldCupGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

export type WorldCupAdvancedMetrics = {
  elo?: number;
  recentXgFor?: number;
  recentXgAgainst?: number;
  squadAvailability?: number;
  restDays?: number;
  travelFatigue?: number;
};

export type AdvancedMetricProvenance = {
  source: 'official' | 'provider' | 'manual' | 'seed';
  providerName?: string;
  lastUpdated?: string;
  trustLevel: 'high' | 'medium' | 'low';
  caveat?: string;
};

export type WorldCupCoreMetric = 'rating' | 'attack' | 'defense' | 'form';

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
  coreMetricSources?: Partial<Record<WorldCupCoreMetric, AdvancedMetricProvenance>>;
  advancedMetrics?: WorldCupAdvancedMetrics;
  advancedMetricSources?: Partial<Record<keyof WorldCupAdvancedMetrics, AdvancedMetricProvenance>>;
};

export type MatchTeamExternalIntelligence = {
  advancedMetrics?: WorldCupAdvancedMetrics;
  advancedMetricSources?: Partial<Record<keyof WorldCupAdvancedMetrics, AdvancedMetricProvenance>>;
};

export type MatchExternalIntelligenceFeed = {
  source: AdvancedMetricProvenance['source'];
  providerName?: string;
  trustLevel: AdvancedMetricProvenance['trustLevel'];
  lastUpdated?: string;
  auditable: boolean;
  caveat?: string;
  home?: MatchTeamExternalIntelligence;
  away?: MatchTeamExternalIntelligence;
};

export type MatchExternalIntelligenceInput =
  | MatchExternalIntelligenceFeed
  | MatchExternalIntelligenceFeed[];

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
  source: 'official' | 'real' | 'sample' | 'local' | 'openfootball' | 'api-football' | 'sportmonks' | 'manual';
  lastUpdated: string;
  truth?: DataTrustInfo;
};

export type BetSelection = 'home' | 'draw' | 'away';

export type PredictionFactor = {
  name: string;
  impact: number;
  description: string;
};

export type IntelligenceFactorCategory =
  | 'team_strength'
  | 'recent_form'
  | 'squad'
  | 'schedule_travel'
  | 'venue_environment'
  | 'tactical_matchup'
  | 'market'
  | 'motivation'
  | 'data_quality';

export type IntelligenceFactorQuality = 'real' | 'provider' | 'manual' | 'proxy' | 'unavailable';

type IntelligenceFactorSide = 'home' | 'away' | 'match';

export type MatchIntelligenceFactor = {
  key: string;
  category: IntelligenceFactorCategory;
  label: string;
  side: IntelligenceFactorSide;
  impact: number;
  confidence: number;
  quality: IntelligenceFactorQuality;
  source: string;
  lastUpdated?: string;
  caveat?: string;
};

type MatchIntelligenceCoverage = {
  available: number;
  total: number;
  ratio: number;
  missingCategories: IntelligenceFactorCategory[];
};

export type MatchIntelligenceLayer = {
  matchId: string;
  factors: MatchIntelligenceFactor[];
  coverage: MatchIntelligenceCoverage;
  summary: {
    topPositive: MatchIntelligenceFactor[];
    topNegative: MatchIntelligenceFactor[];
    proxyCount: number;
    unavailableCount: number;
  };
};

export type PredictionAction = 'educational_simulation' | 'observe_only' | 'skip_due_to_low_confidence';

type PredictionRiskBand = 'no_action' | 'watch_only' | 'capped_simulation' | 'standard_simulation';

export type PredictionRiskPolicy = {
  band: PredictionRiskBand;
  maxSimulatedStakeFraction: number;
  note: string;
};

export type PredictionSimulationCandidate = {
  selection: BetSelection;
  adjustedExpectedValue: number;
  expectedValueDifference: number;
  recommendedSimulatedStakeFraction: number;
  rationale: string;
};

export type PredictionActionGate = {
  matchId: string;
  action: PredictionAction;
  reasons: string[];
  blockingFactors: string[];
  riskPolicy: PredictionRiskPolicy;
  simulationCandidate?: PredictionSimulationCandidate;
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
  featureLayer?: MatchFeatureLayer;
  intelligenceLayer?: MatchIntelligenceLayer;
};

export type PreMatchPredictionSnapshot = {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoff: string;
  capturedAt: string;
  prediction: MatchPrediction;
  provenance: PreMatchPredictionProvenance;
};

type PreMatchPredictionProvenanceIdentity = {
  schemaVersion: 1;
  applicationRevision: string;
  modelVersion: 'v2';
};

export type PreMatchPredictionProvenance = PreMatchPredictionProvenanceIdentity & (
  | {
      researchGeneratedAt: string;
      candidateId: string;
      datasetRevision: string;
      datasetSha256: string;
      modelConfigSha256: string;
    }
  | {
      researchGeneratedAt: null;
      candidateId: null;
      datasetRevision: null;
      datasetSha256: null;
      modelConfigSha256: null;
    }
);

type MatchAdvancedFeatureContribution = {
  elo: number;
  xg: number;
  squadAvailability: number;
  rest: number;
  travel: number;
  total: number;
};

export type MatchFeatureSide = {
  baseStrength: number;
  attackDefense: number;
  homeAdvantage: number;
  formAdjustment: number;
  matchupAsymmetry: number;
  stageMultiplier: number;
  advanced: MatchAdvancedFeatureContribution;
  rawLambda: number;
  lambda: number;
};

export type MatchInputCoverage = {
  baseFieldsAvailable: number;
  baseFieldsTotal: number;
  advancedFieldsAvailable: number;
  advancedFieldsTotal: number;
  structuralRatio: number;
  advancedSourceQualityRatio: number;
  overallRatio: number;
  missingFields: string[];
};

export type MatchEvidenceCalibration = {
  neutralLambda: number;
  shrinkage: number;
  originalHomeLambda: number;
  originalAwayLambda: number;
  profile: {
    stageBucket: 'group' | 'knockout';
    edgeBucket: 'close' | 'balanced' | 'mismatch';
    tempoBucket: 'low' | 'normal' | 'high';
    coverageBucket: 'low' | 'partial' | 'high';
    shrinkageMultiplier: number;
    drawCorrectionMultiplier: number;
  };
};

export type MatchAdvancedMetricTrust = {
  availableFields: number;
  sourcedFields: number;
  highTrustFields: number;
  mediumTrustFields: number;
  lowTrustFields: number;
  missingSourceFields: string[];
  staleFields: string[];
  unknownFreshnessFields: string[];
  averageTrustScore: number;
  sourceCoverageRatio: number;
};

export type MatchFeatureLayer = {
  home: MatchFeatureSide;
  away: MatchFeatureSide;
  metadata: {
    availableAdvancedFeatures: number;
    missingAdvancedFeatures: string[];
    inputCoverage: MatchInputCoverage;
    evidenceCalibration?: MatchEvidenceCalibration;
  };
};
