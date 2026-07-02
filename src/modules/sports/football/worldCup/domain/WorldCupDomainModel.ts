import type { ThreeWayOdds, ModelMarketDeviation } from '../logic/oddsEngine';
import type { ThreeWayProbability } from '../../../../core/probability/unifiedProbability';
import type { QualificationProbability } from '../logic/groupSimulation';
import type {
  MatchAdvancedMetricTrust,
  MatchIntelligenceLayer,
  MatchPrediction,
  PredictionActionGate,
  PreMatchPredictionSnapshot,
  WorldCupMatch,
  WorldCupTeam,
} from '../types';
import type { WorldCupBacktestReport, WorldCupBacktestSample } from '../backtest';

export type MatchViewModel = WorldCupMatch;
export type TeamViewModel = WorldCupTeam;

export type MarketData = {
  kind?: 'educational' | 'real';
  source?: 'educationalOdds' | 'polymarket' | 'provider' | 'manual';
  odds?: ThreeWayOdds;
  probabilities?: ThreeWayProbability;
  deviation?: ModelMarketDeviation | null;
  status: 'available' | 'empty' | 'stale' | 'error';
  confidence?: number;
  quality?: 'low' | 'medium' | 'high';
  auditable?: boolean;
  lastUpdated?: string;
  message: string;
};

export type GroupSimulationState = {
  probabilities: QualificationProbability[];
};

export type WorldCupCalibrationStatus = 'no_results' | 'insufficient_sample' | 'ready';

export type WorldCupCalibrationState = {
  status: WorldCupCalibrationStatus;
  sampleSize: number;
  minimumSampleSize: number;
  brierScore: number | null;
  logLoss: number | null;
  accuracy: number | null;
  brierReference: number;
  calibrationError: number | null;
  message: string;
};

export type WorldCupPredictionAuditStatus = 'passed' | 'warning' | 'failed';

export type WorldCupPredictionAuditState = {
  status: WorldCupPredictionAuditStatus;
  checkedMatches: number;
  passedMatches: number;
  warningCount: number;
  maxProbabilityDrift: number;
  message: string;
};

export type PredictionReliabilityDeductionReason =
  | 'local_source'
  | 'sample_source'
  | 'verified_provider_not_official'
  | 'stale_data'
  | 'unknown_staleness'
  | 'missing_input_coverage'
  | 'low_input_coverage'
  | 'partial_input_coverage'
  | 'missing_advanced_metric_sources'
  | 'low_trust_advanced_metrics'
  | 'partial_trust_advanced_metrics'
  | 'stale_advanced_metrics'
  | 'unknown_advanced_metric_freshness'
  | 'low_intelligence_coverage'
  | 'proxy_heavy_intelligence'
  | 'missing_squad_context'
  | 'missing_market_reference'
  | 'missing_schedule_travel_context'
  | 'no_calibration_sample'
  | 'insufficient_calibration_sample'
  | 'calibration_error'
  | 'weak_calibration_performance'
  | 'provider_only_calibration_evidence'
  | 'mixed_calibration_evidence'
  | 'insufficient_combined_calibration_evidence'
  | 'sample_or_local_only_calibration_evidence'
  | 'empty_combined_calibration_evidence'
  | 'prediction_audit_warning'
  | 'prediction_audit_failed';

export type PredictionReliabilityDeduction = {
  reason: PredictionReliabilityDeductionReason;
  amount: number;
  message: string;
};

export type PredictionReliabilityLabel = 'low' | 'medium' | 'high';

export type PredictionReliabilityState = {
  matchId: string;
  rawConfidence: number;
  adjustedConfidence: number;
  advancedMetricTrust?: MatchAdvancedMetricTrust;
  deductions: PredictionReliabilityDeduction[];
  label: PredictionReliabilityLabel;
  caveat: string;
};

export type WorldCupDataSourceTier = 'official' | 'verified_provider' | 'sample' | 'local';

export type WorldCupSourceGateState = {
  tier: WorldCupDataSourceTier;
  label: string;
  canUseForRealPrediction: boolean;
  requiresOfficialVerification: boolean;
  message: string;
};

export type MatchDataStaleness = 'fresh' | 'stale' | 'unknown';

export type MatchDataQualityState = {
  matchId: string;
  source: WorldCupMatch['source'];
  tier: WorldCupDataSourceTier;
  label: string;
  lastUpdated: number;
  staleness: MatchDataStaleness;
  stalenessHours: number | null;
  isOfficialFixture: boolean;
  isVerifiedProvider: boolean;
  hasVerifiedScore: boolean;
  canUseForRealPrediction: boolean;
  caveat: string;
};

export type WorldCupDomainSource = 'official' | 'api' | 'openfootball' | 'sportmonks' | 'sample' | 'local';

export type WorldCupStrategyResearchState = {
  status: 'applied' | 'rejected' | 'insufficient_evidence' | 'unavailable';
  generatedAt: string | null;
  acceptedRows: number;
  candidateId: string | null;
  validationSampleSize: number;
  holdoutSampleSize: number;
  holdoutContexts: number;
  brierImprovement: number;
  message: string;
};

export type DataSourceStatus = {
  source: WorldCupDomainSource;
  label: string;
  lastUpdated: number;
  errors: string[];
  isSample: boolean;
  isLiveProvider: boolean;
  detail: string;
  predictionCaveat: string;
};

export type WorldCupDomainModel = {
  matches: MatchViewModel[];
  teams: Record<string, TeamViewModel>;
  predictions: Record<string, MatchPrediction>;
  intelligence: Record<string, MatchIntelligenceLayer>;
  actionGates: Record<string, PredictionActionGate>;
  markets?: Record<string, MarketData | null>;
  simulation?: GroupSimulationState;
  calibration: WorldCupCalibrationState;
  predictionAudit: WorldCupPredictionAuditState;
  backtest: WorldCupBacktestReport;
  backtestSamples: WorldCupBacktestSample[];
  predictionReliability: Record<string, PredictionReliabilityState>;
  strategyResearch?: WorldCupStrategyResearchState;
  preMatchPredictionSnapshots?: Record<string, PreMatchPredictionSnapshot>;
  sourceGate: WorldCupSourceGateState;
  matchDataQuality: Record<string, MatchDataQualityState>;
  source: WorldCupDomainSource;
  lastUpdated: number;
  errors?: string[];
};
