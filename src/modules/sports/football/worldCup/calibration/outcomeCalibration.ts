/**
 * Real Outcome Calibration — compares model predictions against actual match results.
 *
 * Reuses calculateBrierScore / calculateLogLoss from scoring.ts for core metrics.
 * Adds calibration curve and overconfidence detection on top.
 */
import type { BetSelection } from '../types';
import { calculateBrierScore, calculateLogLoss, type PredictionResult } from '../logic/scoring';

// ─── Types ───────────────────────────────────────────────────────────

export interface CalibrationCurveBucket {
  /** Predicted probability range label, e.g. "0-20%" */
  bin: string;
  range: [number, number];
  count: number;
  /** Average predicted probability in this bin */
  avgPredicted: number;
  /** Actual frequency of outcome in this bin */
  actualFrequency: number;
}

export interface OverconfidenceReport {
  /** True if systematic overconfidence detected */
  isOverconfident: boolean;
  /** True if systematic underconfidence detected */
  isUnderconfident: boolean;
  /** Expected calibration error: weighted absolute distance from observed frequency */
  calibrationError: number;
  /** Per-bin deviation details */
  binDeviations: Array<{
    bin: string;
    deviation: number;
    severity: 'none' | 'mild' | 'significant';
  }>;
}

export interface OutcomeCalibrationResult {
  brierScore: number;
  logLoss: number;
  /** Reference: random baseline Brier (3-outcome uniform) = 6/9 ≈ 0.667 */
  brierReference: number;
  calibrationCurve: CalibrationCurveBucket[];
  overconfidence: OverconfidenceReport;
  sampleSize: number;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Calibrate model predictions against actual match outcomes.
 *
 * @param results — array of { probabilities, outcome } where outcome is 'home'|'draw'|'away'
 */
export function calibrateOutcomes(results: PredictionResult[]): OutcomeCalibrationResult {
  const n = results.length;
  if (n === 0) {
    return emptyResult();
  }

  const brierScore = calculateBrierScore(results);
  const logLoss = calculateLogLoss(results);

  // Random baseline for 3-outcome: uniform p=1/3 for each outcome
  // Brier = Σ(p_k - o_k)^2. For the actual outcome: (1/3-1)^2 = 4/9
  // For two wrong outcomes: 2*(1/3-0)^2 = 2/9
  // Total per prediction: 4/9 + 1/9 + 1/9 = 6/9 = 2/3 ≈ 0.667
  const brierReference = 2 / 3; // ≈ 0.667

  const calibrationCurve = buildCalibrationCurve(results);
  const overconfidence = detectOverconfidence(calibrationCurve);

  return {
    brierScore,
    logLoss,
    brierReference,
    calibrationCurve,
    overconfidence,
    sampleSize: n,
  };
}

// ─── Calibration Curve ────────────────────────────────────────────────

function buildCalibrationCurve(results: PredictionResult[]): CalibrationCurveBucket[] {
  const bins: Array<{
    range: [number, number];
    predictions: number[];
    outcomes: number[];
  }> = [
    { range: [0.0, 0.2], predictions: [], outcomes: [] },
    { range: [0.2, 0.4], predictions: [], outcomes: [] },
    { range: [0.4, 0.6], predictions: [], outcomes: [] },
    { range: [0.6, 0.8], predictions: [], outcomes: [] },
    { range: [0.8, 1.0], predictions: [], outcomes: [] },
  ];

  const outcomes: BetSelection[] = ['home', 'draw', 'away'];

  for (const result of results) {
    for (const key of outcomes) {
      const p = result.probabilities[key];
      const actual = result.outcome === key ? 1 : 0;

      for (const bin of bins) {
        if (p >= bin.range[0] && p < bin.range[1]) {
          bin.predictions.push(p);
          bin.outcomes.push(actual);
          break;
        }
      }
      // Handle p == 1.0 edge case
      if (p >= 1.0) {
        bins[4].predictions.push(p);
        bins[4].outcomes.push(actual);
      }
    }
  }

  return bins.map((bin) => ({
    bin: `${Math.round(bin.range[0] * 100)}-${Math.round(bin.range[1] * 100)}%`,
    range: bin.range,
    count: bin.predictions.length,
    avgPredicted: bin.predictions.length > 0
      ? bin.predictions.reduce((a, b) => a + b, 0) / bin.predictions.length
      : 0,
    actualFrequency: bin.outcomes.length > 0
      ? bin.outcomes.reduce((a, b) => a + b, 0) / bin.outcomes.length
      : 0,
  }));
}

// ─── Overconfidence Detection ─────────────────────────────────────────

function detectOverconfidence(bins: CalibrationCurveBucket[]): OverconfidenceReport {
  const binDeviations: OverconfidenceReport['binDeviations'] = [];
  let weightedErrorSum = 0;
  let totalWeight = 0;
  let hasOverconfidentBin = false;
  let hasUnderconfidentBin = false;

  for (const bin of bins) {
    if (bin.count === 0) continue;
    const deviation = bin.avgPredicted - bin.actualFrequency;
    const severity: 'none' | 'mild' | 'significant' =
      Math.abs(deviation) < 0.05 ? 'none' :
      Math.abs(deviation) < 0.12 ? 'mild' : 'significant';

    binDeviations.push({ bin: bin.bin, deviation, severity });
    weightedErrorSum += Math.abs(deviation) * bin.count;
    totalWeight += bin.count;

    // Per-bin detection: a bin with substantial data and large deviation
    // indicates over/underconfidence even if other bins cancel it out
    if (bin.count >= 10 && severity === 'significant') {
      if (deviation > 0) hasOverconfidentBin = true;
      if (deviation < 0) hasUnderconfidentBin = true;
    }
  }

  const calibrationError = totalWeight > 0 ? weightedErrorSum / totalWeight : 0;
  const isOverconfident = hasOverconfidentBin;
  const isUnderconfident = hasUnderconfidentBin;

  return { isOverconfident, isUnderconfident, calibrationError, binDeviations };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function emptyResult(): OutcomeCalibrationResult {
  return {
    brierScore: 0,
    logLoss: 0,
    brierReference: 2 / 3,
    calibrationCurve: [],
    overconfidence: {
      isOverconfident: false,
      isUnderconfident: false,
      calibrationError: 0,
      binDeviations: [],
    },
    sampleSize: 0,
  };
}
