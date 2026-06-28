import { describe, expect, it } from 'vitest';
import type {
  MatchDataQualityState,
  PredictionReliabilityState,
  WorldCupCalibrationState,
} from '../domain/WorldCupDomainModel';
import type { MatchIntelligenceFactor, MatchIntelligenceLayer, MatchPrediction } from '../types';
import type { ModelMarketDeviation } from './oddsEngine';
import { buildPredictionActionGate } from './predictionActionGate';

const calibration: WorldCupCalibrationState = {
  status: 'ready',
  sampleSize: 30,
  minimumSampleSize: 30,
  brierScore: 0.2,
  logLoss: 0.7,
  accuracy: 0.55,
  brierReference: 2 / 3,
  calibrationError: 0.03,
  message: 'ready',
};

const quality = (tier: MatchDataQualityState['tier']): MatchDataQualityState => ({
  matchId: 'match-1',
  source: tier === 'official' ? 'official' : tier === 'verified_provider' ? 'api-football' : tier,
  tier,
  label: tier,
  lastUpdated: Date.parse('2026-06-18T10:00:00.000Z'),
  staleness: 'fresh',
  stalenessHours: 0,
  isOfficialFixture: tier === 'official',
  isVerifiedProvider: tier === 'official' || tier === 'verified_provider',
  hasVerifiedScore: false,
  canUseForRealPrediction: tier === 'official',
  caveat: tier,
});

const reliability = (adjustedConfidence: number, label: PredictionReliabilityState['label']): PredictionReliabilityState => ({
  matchId: 'match-1',
  rawConfidence: 0.75,
  adjustedConfidence,
  deductions: [],
  label,
  caveat: 'test',
});

const intelligence = (
  ratio: number,
  missingCategories: MatchIntelligenceLayer['coverage']['missingCategories'],
  factors: MatchIntelligenceFactor[] = [],
): MatchIntelligenceLayer => ({
  matchId: 'match-1',
  factors,
  coverage: {
    available: Math.round(ratio * 9),
    total: 9,
    ratio,
    missingCategories,
  },
  summary: {
    topPositive: [],
    topNegative: [],
    proxyCount: 0,
    unavailableCount: missingCategories.length,
  },
});

const marketDeviation = (input: Partial<ModelMarketDeviation> = {}): ModelMarketDeviation => ({
  deviationScore: 0.08,
  expectedValueDifference: { home: 0.02, draw: -0.01, away: -0.01 },
  uncertaintyAdjustment: 0.75,
  marketCorrectionFactor: 0.25,
  adjustedExpectedValue: { home: 0.04, draw: -0.02, away: -0.03 },
  ...input,
});

const motivationFactor = (input: Partial<MatchIntelligenceFactor> = {}): MatchIntelligenceFactor => ({
  key: 'group-qualification-motivation',
  category: 'motivation',
  label: 'Group qualification motivation',
  side: 'match',
  impact: 0.1,
  confidence: 0.52,
  quality: 'proxy',
  source: 'group standings before kickoff',
  caveat: 'Home qualification race; away opening balance.',
  ...input,
});

const prediction = (homeWin: number, draw: number, awayWin: number): MatchPrediction => ({
  matchId: 'match-1',
  probabilities: { homeWin, draw, awayWin },
} as MatchPrediction);

describe('predictionActionGate', () => {
  it('keeps local data in educational simulation mode', () => {
    const gate = buildPredictionActionGate({
      matchId: 'match-1',
      reliability: reliability(0.4, 'low'),
      matchDataQuality: quality('local'),
      calibration: { ...calibration, status: 'no_results', sampleSize: 0, message: 'none' },
      intelligenceLayer: intelligence(0.6, ['market']),
    });

    expect(gate.action).toBe('educational_simulation');
    expect(gate.riskPolicy.band).toBe('capped_simulation');
    expect(gate.riskPolicy.maxSimulatedStakeFraction).toBe(0.005);
    expect(gate.blockingFactors).toEqual(expect.arrayContaining([
      'non_real_prediction_source',
      'insufficient_calibration',
    ]));
  });

  it('skips predictions when adjusted confidence is too low', () => {
    const gate = buildPredictionActionGate({
      matchId: 'match-1',
      reliability: reliability(0.12, 'low'),
      matchDataQuality: quality('official'),
      calibration,
      intelligenceLayer: intelligence(0.4, ['squad', 'market', 'schedule_travel']),
    });

    expect(gate.action).toBe('skip_due_to_low_confidence');
    expect(gate.riskPolicy.band).toBe('no_action');
    expect(gate.riskPolicy.maxSimulatedStakeFraction).toBe(0);
    expect(gate.simulationCandidate).toBeUndefined();
    expect(gate.blockingFactors).toContain('low_intelligence_coverage');
  });

  it('uses observe-only when provider data lacks market context', () => {
    const gate = buildPredictionActionGate({
      matchId: 'match-1',
      reliability: reliability(0.58, 'medium'),
      matchDataQuality: quality('verified_provider'),
      calibration,
      intelligenceLayer: intelligence(0.8, ['market']),
    });

    expect(gate.action).toBe('observe_only');
    expect(gate.riskPolicy.band).toBe('watch_only');
    expect(gate.riskPolicy.maxSimulatedStakeFraction).toBe(0);
    expect(gate.simulationCandidate).toBeUndefined();
    expect(gate.reasons.join(' ')).toContain('市场参考');
  });

  it('uses observe-only when model-market disagreement is too large', () => {
    const gate = buildPredictionActionGate({
      matchId: 'match-1',
      reliability: reliability(0.72, 'high'),
      matchDataQuality: quality('official'),
      calibration,
      intelligenceLayer: intelligence(1, []),
      marketDeviation: marketDeviation({ deviationScore: 0.4 }),
    });

    expect(gate.action).toBe('observe_only');
    expect(gate.blockingFactors).toContain('high_market_disagreement');
  });

  it('uses observe-only when reference EV has no positive cushion', () => {
    const gate = buildPredictionActionGate({
      matchId: 'match-1',
      reliability: reliability(0.72, 'high'),
      matchDataQuality: quality('official'),
      calibration,
      intelligenceLayer: intelligence(1, []),
      marketDeviation: marketDeviation({
        adjustedExpectedValue: { home: 0.01, draw: -0.02, away: -0.03 },
      }),
    });

    expect(gate.action).toBe('observe_only');
    expect(gate.blockingFactors).toContain('no_positive_reference_ev');
  });

  it('allows standard educational simulation only when no strategy gate blocks', () => {
    const gate = buildPredictionActionGate({
      matchId: 'match-1',
      reliability: reliability(0.82, 'high'),
      matchDataQuality: quality('official'),
      calibration,
      intelligenceLayer: intelligence(1, [], [
        motivationFactor({ impact: 0.1 }),
      ]),
      marketDeviation: marketDeviation(),
      prediction: prediction(0.54, 0.25, 0.21),
    });

    expect(gate.action).toBe('educational_simulation');
    expect(gate.blockingFactors).toEqual([]);
    expect(gate.riskPolicy.band).toBe('standard_simulation');
    expect(gate.riskPolicy.maxSimulatedStakeFraction).toBe(0.02);
    expect(gate.simulationCandidate).toMatchObject({
      selection: 'home',
      adjustedExpectedValue: 0.04,
      expectedValueDifference: 0.02,
    });
    expect(gate.simulationCandidate?.recommendedSimulatedStakeFraction).toBeGreaterThan(0);
    expect(gate.simulationCandidate?.recommendedSimulatedStakeFraction).toBeLessThan(gate.riskPolicy.maxSimulatedStakeFraction);
  });

  it('uses observe-only when the top two model outcomes are too close', () => {
    const gate = buildPredictionActionGate({
      matchId: 'match-1',
      reliability: reliability(0.82, 'high'),
      matchDataQuality: quality('official'),
      calibration,
      intelligenceLayer: intelligence(1, [], [
        motivationFactor({ impact: 0.1 }),
      ]),
      marketDeviation: marketDeviation(),
      prediction: prediction(0.36, 0.34, 0.3),
    });

    expect(gate.action).toBe('observe_only');
    expect(gate.blockingFactors).toContain('thin_model_edge');
    expect(gate.simulationCandidate).toBeUndefined();
  });

  it('omits a simulation candidate when positive EV cushion is absent', () => {
    const gate = buildPredictionActionGate({
      matchId: 'match-1',
      reliability: reliability(0.82, 'high'),
      matchDataQuality: quality('official'),
      calibration,
      intelligenceLayer: intelligence(1, [], [
        motivationFactor({ impact: 0.1 }),
      ]),
      marketDeviation: marketDeviation({
        adjustedExpectedValue: { home: 0.01, draw: 0.005, away: -0.03 },
      }),
    });

    expect(gate.action).toBe('observe_only');
    expect(gate.simulationCandidate).toBeUndefined();
  });

  it('uses observe-only when group motivation context is missing', () => {
    const gate = buildPredictionActionGate({
      matchId: 'match-1',
      reliability: reliability(0.72, 'high'),
      matchDataQuality: quality('official'),
      calibration,
      intelligenceLayer: intelligence(1, [], [
        motivationFactor({
          quality: 'unavailable',
          impact: 0,
          confidence: 0,
          source: 'not supplied',
          caveat: 'No group standings context is attached, so qualification incentives are not modeled.',
        }),
      ]),
      marketDeviation: marketDeviation(),
    });

    expect(gate.action).toBe('observe_only');
    expect(gate.blockingFactors).toContain('missing_group_motivation_context');
  });

  it('uses observe-only when group motivation is volatile or must-win', () => {
    const gate = buildPredictionActionGate({
      matchId: 'match-1',
      reliability: reliability(0.72, 'high'),
      matchDataQuality: quality('official'),
      calibration,
      intelligenceLayer: intelligence(1, [], [
        motivationFactor({
          impact: 0.48,
          caveat: 'Home must win (1 pts, rank 4); away protect top spot (6 pts, rank 1).',
        }),
      ]),
      marketDeviation: marketDeviation(),
    });

    expect(gate.action).toBe('observe_only');
    expect(gate.blockingFactors).toEqual(expect.arrayContaining([
      'volatile_group_motivation',
      'must_win_group_pressure',
    ]));
  });
});
