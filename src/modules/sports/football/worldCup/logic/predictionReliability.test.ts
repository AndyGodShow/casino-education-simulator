import { describe, expect, it } from 'vitest';
import { calculatePredictionReliability } from './predictionReliability';
import { WORLD_CUP_MODEL_CONFIG } from './modelConfig';
import type {
  MatchDataQualityState,
  WorldCupCalibrationState,
  WorldCupPredictionAuditState,
} from '../domain/WorldCupDomainModel';
import type { MatchAdvancedMetricTrust, MatchInputCoverage, MatchIntelligenceLayer } from '../types';

const completeCoverage: MatchInputCoverage = {
  baseFieldsAvailable: 8,
  baseFieldsTotal: 8,
  advancedFieldsAvailable: 12,
  advancedFieldsTotal: 12,
  overallRatio: 1,
  missingFields: [],
};

const sparseCoverage: MatchInputCoverage = {
  baseFieldsAvailable: 8,
  baseFieldsTotal: 8,
  advancedFieldsAvailable: 0,
  advancedFieldsTotal: 12,
  overallRatio: 0.4,
  missingFields: [
    'home.advancedMetrics.elo',
    'away.advancedMetrics.elo',
  ],
};

const weakAdvancedMetricTrust: MatchAdvancedMetricTrust = {
  availableFields: 12,
  sourcedFields: 12,
  highTrustFields: 0,
  mediumTrustFields: 4,
  lowTrustFields: 8,
  missingSourceFields: [],
  staleFields: ['home.advancedMetricSources.elo'],
  unknownFreshnessFields: [
    'home.advancedMetricSources.recentXgFor',
    'away.advancedMetricSources.recentXgFor',
  ],
  averageTrustScore: 0.47,
  sourceCoverageRatio: 1,
};

const readyCalibration: WorldCupCalibrationState = {
  status: 'ready',
  sampleSize: 30,
  minimumSampleSize: 30,
  brierScore: 0.18,
  logLoss: 0.65,
  accuracy: 0.55,
  brierReference: 0.67,
  calibrationError: 0.05,
  message: 'ready',
};

const noCalibration: WorldCupCalibrationState = {
  status: 'no_results',
  sampleSize: 0,
  minimumSampleSize: 30,
  brierScore: null,
  logLoss: null,
  accuracy: null,
  brierReference: 0.67,
  calibrationError: null,
  message: 'no results',
};

const passedAudit: WorldCupPredictionAuditState = {
  status: 'passed',
  checkedMatches: 1,
  passedMatches: 1,
  warningCount: 0,
  maxProbabilityDrift: 0,
  message: 'passed',
};

const warningAudit: WorldCupPredictionAuditState = {
  ...passedAudit,
  status: 'warning',
  warningCount: 1,
  message: 'warning',
};

const sparseIntelligence: MatchIntelligenceLayer = {
  matchId: 'match-1',
  factors: [
    {
      key: 'team-strength-rating-gap',
      category: 'team_strength',
      label: 'Team strength rating gap',
      side: 'match',
      impact: 0.2,
      confidence: 0.4,
      quality: 'proxy',
      source: 'seeded team ratings',
    },
    {
      key: 'squad-availability',
      category: 'squad',
      label: 'Squad availability',
      side: 'match',
      impact: 0,
      confidence: 0,
      quality: 'unavailable',
      source: 'not supplied',
    },
    {
      key: 'market-reference',
      category: 'market',
      label: 'Market reference availability',
      side: 'match',
      impact: 0,
      confidence: 0,
      quality: 'unavailable',
      source: 'not supplied',
    },
  ],
  coverage: {
    available: 4,
    total: 9,
    ratio: 0.44,
    missingCategories: ['squad', 'market', 'schedule_travel'],
  },
  summary: {
    topPositive: [],
    topNegative: [],
    proxyCount: 2,
    unavailableCount: 3,
  },
};

const quality = (overrides: Partial<MatchDataQualityState>): MatchDataQualityState => ({
  matchId: 'match-1',
  source: 'official',
  tier: 'official',
  label: 'Official fixture',
  lastUpdated: Date.parse('2026-06-18T10:00:00.000Z'),
  staleness: 'fresh',
  stalenessHours: 0,
  isOfficialFixture: true,
  isVerifiedProvider: true,
  hasVerifiedScore: false,
  canUseForRealPrediction: true,
  caveat: 'official',
  ...overrides,
});

describe('calculatePredictionReliability', () => {
  it('keeps confidence high when data quality, coverage, calibration, and audit are strong', () => {
    const result = calculatePredictionReliability({
      matchId: 'match-1',
      rawConfidence: 0.82,
      inputCoverage: completeCoverage,
      matchDataQuality: quality({}),
      calibration: readyCalibration,
      predictionAudit: passedAudit,
    });

    expect(result.rawConfidence).toBe(0.82);
    expect(result.adjustedConfidence).toBe(0.82);
    expect(result.label).toBe('high');
    expect(result.deductions).toEqual([]);
  });

  it('heavily discounts local seed predictions with sparse inputs and no calibration', () => {
    const result = calculatePredictionReliability({
      matchId: 'match-1',
      rawConfidence: 0.82,
      inputCoverage: sparseCoverage,
      matchDataQuality: quality({
        source: 'local',
        tier: 'local',
        label: 'Local seed',
        staleness: 'stale',
        stalenessHours: 8,
        isOfficialFixture: false,
        isVerifiedProvider: false,
        canUseForRealPrediction: false,
        caveat: 'local seed',
      }),
      calibration: noCalibration,
      predictionAudit: passedAudit,
    });

    expect(result.adjustedConfidence).toBeLessThan(0.35);
    expect(result.deductions[0].amount).toBe(WORLD_CUP_MODEL_CONFIG.reliability.deductions.localSource);
    expect(result.label).toBe('low');
    expect(result.deductions.map((deduction) => deduction.reason)).toEqual([
      'local_source',
      'stale_data',
      'low_input_coverage',
      'no_calibration_sample',
    ]);
    expect(result.caveat).toContain('教育演示');
  });

  it('discounts provider predictions when the derivation audit has warnings', () => {
    const result = calculatePredictionReliability({
      matchId: 'match-1',
      rawConfidence: 0.75,
      inputCoverage: {
        ...completeCoverage,
        advancedFieldsAvailable: 6,
        overallRatio: 0.7,
        missingFields: ['home.advancedMetrics.restDays'],
      },
      matchDataQuality: quality({
        source: 'api-football',
        tier: 'verified_provider',
        label: 'Verified provider',
        isOfficialFixture: false,
        canUseForRealPrediction: false,
        caveat: 'provider',
      }),
      calibration: {
        ...readyCalibration,
        status: 'insufficient_sample',
        sampleSize: 8,
        message: 'insufficient',
      },
      predictionAudit: warningAudit,
    });

    expect(result.adjustedConfidence).toBeLessThan(result.rawConfidence);
    expect(result.adjustedConfidence).toBeGreaterThan(0);
    expect(result.deductions[0].amount).toBe(WORLD_CUP_MODEL_CONFIG.reliability.deductions.verifiedProviderNotOfficial);
    expect(result.deductions.map((deduction) => deduction.reason)).toEqual([
      'verified_provider_not_official',
      'partial_input_coverage',
      'insufficient_calibration_sample',
      'prediction_audit_warning',
    ]);
  });

  it('discounts available advanced metrics when their sources are low trust or stale', () => {
    const result = calculatePredictionReliability({
      matchId: 'match-1',
      rawConfidence: 0.82,
      inputCoverage: completeCoverage,
      advancedMetricTrust: weakAdvancedMetricTrust,
      matchDataQuality: quality({}),
      calibration: readyCalibration,
      predictionAudit: passedAudit,
    });

    expect(result.adjustedConfidence).toBe(0.57);
    expect(result.advancedMetricTrust).toEqual(weakAdvancedMetricTrust);
    expect(result.deductions.map((deduction) => deduction.reason)).toEqual([
      'low_trust_advanced_metrics',
      'stale_advanced_metrics',
      'unknown_advanced_metric_freshness',
    ]);
  });

  it('discounts low-coverage proxy-heavy match intelligence without changing raw confidence', () => {
    const result = calculatePredictionReliability({
      matchId: 'match-1',
      rawConfidence: 0.82,
      inputCoverage: completeCoverage,
      intelligenceLayer: sparseIntelligence,
      matchDataQuality: quality({}),
      calibration: readyCalibration,
      predictionAudit: passedAudit,
    });

    expect(result.rawConfidence).toBe(0.82);
    expect(result.adjustedConfidence).toBeLessThan(0.82);
    expect(result.deductions.map((deduction) => deduction.reason)).toEqual([
      'low_intelligence_coverage',
      'proxy_heavy_intelligence',
      'missing_squad_context',
      'missing_market_reference',
      'missing_schedule_travel_context',
    ]);
  });

  it('discounts advanced metrics that have values but no field-level provenance', () => {
    const result = calculatePredictionReliability({
      matchId: 'match-1',
      rawConfidence: 0.82,
      inputCoverage: completeCoverage,
      advancedMetricTrust: {
        ...weakAdvancedMetricTrust,
        missingSourceFields: ['home.advancedMetricSources.travelFatigue'],
        staleFields: [],
        unknownFreshnessFields: [],
        averageTrustScore: 0.9,
      },
      matchDataQuality: quality({}),
      calibration: readyCalibration,
      predictionAudit: passedAudit,
    });

    expect(result.deductions.map((deduction) => deduction.reason)).toEqual([
      'missing_advanced_metric_sources',
    ]);
    expect(result.adjustedConfidence).toBe(0.74);
  });

  it('discounts sufficient calibration samples that still show overconfidence', () => {
    const result = calculatePredictionReliability({
      matchId: 'match-1',
      rawConfidence: 0.82,
      inputCoverage: completeCoverage,
      matchDataQuality: quality({}),
      calibration: {
        ...readyCalibration,
        calibrationError: 0.14,
      },
      predictionAudit: passedAudit,
    });

    expect(result.adjustedConfidence).toBe(0.74);
    expect(result.deductions.map((deduction) => deduction.reason)).toEqual([
      'calibration_overconfidence',
    ]);
  });

  it('discounts sufficient calibration samples whose Brier score is near the random baseline', () => {
    const result = calculatePredictionReliability({
      matchId: 'match-1',
      rawConfidence: 0.82,
      inputCoverage: completeCoverage,
      matchDataQuality: quality({}),
      calibration: {
        ...readyCalibration,
        brierScore: 0.65,
        brierReference: 0.67,
      },
      predictionAudit: passedAudit,
    });

    expect(result.adjustedConfidence).toBe(0.72);
    expect(result.deductions.map((deduction) => deduction.reason)).toEqual([
      'weak_calibration_performance',
    ]);
  });

  it('optionally discounts provider-only combined calibration evidence without treating it as official-ready', () => {
    const result = calculatePredictionReliability({
      matchId: 'match-1',
      rawConfidence: 0.82,
      inputCoverage: completeCoverage,
      matchDataQuality: quality({}),
      calibration: readyCalibration,
      predictionAudit: passedAudit,
      combinedCalibrationEvidenceGrade: 'provider_ready',
    });

    expect(result.adjustedConfidence).toBeCloseTo(
      0.82 - WORLD_CUP_MODEL_CONFIG.reliability.deductions.providerOnlyCalibrationEvidence,
    );
    expect(result.deductions.map((deduction) => deduction.reason)).toEqual([
      'provider_only_calibration_evidence',
    ]);
    expect(result.deductions[0].message).toContain('第三方');
  });

  it('keeps official-ready combined calibration evidence from adding an extra deduction', () => {
    const result = calculatePredictionReliability({
      matchId: 'match-1',
      rawConfidence: 0.82,
      inputCoverage: completeCoverage,
      matchDataQuality: quality({}),
      calibration: readyCalibration,
      predictionAudit: passedAudit,
      combinedCalibrationEvidenceGrade: 'official_ready',
    });

    expect(result.adjustedConfidence).toBe(0.82);
    expect(result.deductions).toEqual([]);
  });

  it.each([
    ['mixed_ready', 'mixed_calibration_evidence'],
    ['insufficient', 'insufficient_combined_calibration_evidence'],
    ['sample_or_local_only', 'sample_or_local_only_calibration_evidence'],
    ['empty', 'empty_combined_calibration_evidence'],
  ] as const)('maps combined calibration evidence grade %s to a reliability deduction', (grade, reason) => {
    const result = calculatePredictionReliability({
      matchId: 'match-1',
      rawConfidence: 0.82,
      inputCoverage: completeCoverage,
      matchDataQuality: quality({}),
      calibration: readyCalibration,
      predictionAudit: passedAudit,
      combinedCalibrationEvidenceGrade: grade,
    });

    expect(result.deductions.map((deduction) => deduction.reason)).toEqual([reason]);
    expect(result.adjustedConfidence).toBeLessThan(0.82);
  });
});
