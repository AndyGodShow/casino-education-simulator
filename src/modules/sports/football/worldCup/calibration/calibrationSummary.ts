/**
 * Calibration Summary Engine — aggregates all calibration metrics
 * into a single unified report.
 *
 * Read-only orchestration layer. No modification of any existing system.
 */
import type { BetSelection } from '../types';
import { calibrateOutcomes, type OutcomeCalibrationResult } from './outcomeCalibration';
import { batchMarketAlignment } from './marketAlignment';
import { trackPersistence, type AlphaPersistenceReport, type RollingWindowConfig } from './alphaPersistence';
import { evaluate, type EvaluationMetrics } from '../alpha/alphaEvaluator';
import type { ThreeWayOdds } from '../logic/oddsEngine';
import type { PredictionResult } from '../logic/scoring';

// ─── Types ───────────────────────────────────────────────────────────

export interface CalibrationReport {
  /** Overall model quality grade */
  grade: CalibrationGrade;
  /** Outcome calibration (Brier, LogLoss, calibration curve) */
  outcome: OutcomeCalibrationResult;
  /** Alpha evaluation metrics */
  alpha: EvaluationMetrics;
  /** Alpha persistence tracking */
  alphaPersistence: AlphaPersistenceReport;
  /** Market alignment summary (if odds data provided) */
  market?: {
    avgTotalDisagreement: number;
    avgEdge: Record<BetSelection, number>;
    efficiencyDistribution: Record<string, number>;
    sampleCount: number;
  };
  /** Timestamp of report generation */
  generatedAt: string;
}

type CalibrationGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface CalibrationReportInput {
  /** Prediction results with actual outcomes */
  results: PredictionResult[];
  /** Optional: market odds for each prediction */
  marketOdds?: Array<ThreeWayOdds | null>;
  /** Alpha persistence config */
  persistenceConfig?: RollingWindowConfig;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Generate a complete calibration report.
 */
export function generateReport(input: CalibrationReportInput): CalibrationReport {
  const { results, marketOdds, persistenceConfig } = input;

  // 1. Outcome calibration
  const outcome = calibrateOutcomes(results);

  // 2. Alpha evaluation
  const alpha = evaluate();

  // 3. Alpha persistence
  const alphaPersistence = trackPersistence(persistenceConfig);

  // 4. Market alignment (if odds available)
  let market: CalibrationReport['market'];
  if (marketOdds && marketOdds.length > 0) {
    const entries: Array<{ modelProbs: Record<BetSelection, number>; odds: ThreeWayOdds }> = [];
    for (let i = 0; i < Math.min(results.length, marketOdds.length); i += 1) {
      const odds = marketOdds[i];
      if (odds) {
        entries.push({
          modelProbs: results[i].probabilities,
          odds,
        });
      }
    }

    if (entries.length > 0) {
      const batch = batchMarketAlignment(entries);
      market = {
        avgTotalDisagreement: batch.avgTotalDisagreement,
        avgEdge: batch.avgEdge,
        efficiencyDistribution: batch.efficiencyDistribution,
        sampleCount: entries.length,
      };
    }
  }

  // 5. Grade
  const grade = computeGrade(outcome, alpha);

  return {
    grade,
    outcome,
    alpha,
    alphaPersistence,
    market,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Grading ──────────────────────────────────────────────────────────

function computeGrade(
  outcome: OutcomeCalibrationResult,
  alpha: EvaluationMetrics,
): CalibrationGrade {
  let score = 0;

  // Brier score relative to random baseline
  if (outcome.sampleSize > 0) {
    const brierRatio = outcome.brierScore / outcome.brierReference;
    if (brierRatio < 0.7) score += 3;       // significantly better than random
    else if (brierRatio < 0.9) score += 2;  // somewhat better
    else if (brierRatio < 1.1) score += 1;  // roughly random
    // else: worse than random → 0
  }

  // Alpha hit rate
  if (alpha.sampleSize > 0) {
    if (alpha.hitRate > 0.55) score += 2;
    else if (alpha.hitRate > 0.48) score += 1;
  }

  // Overconfidence penalty
  if (outcome.overconfidence.isOverconfident) score -= 1;
  if (outcome.overconfidence.isUnderconfident) score -= 1;

  // Convert to grade
  if (score >= 4) return 'A';
  if (score >= 3) return 'B';
  if (score >= 2) return 'C';
  if (score >= 1) return 'D';
  return 'F';
}

// ─── Display ───────────────────────────────────────────────────────────

export function formatCalibrationReport(report: CalibrationReport): string {
  const lines: string[] = [
    '═══════════════════════════════════════════',
    '      Calibration & Market Alignment       ',
    '═══════════════════════════════════════════',
    `Grade:              ${report.grade}`,
    `Generated:          ${report.generatedAt}`,
    '',
    '── Outcome Calibration ──',
    `Brier Score:        ${report.outcome.brierScore.toFixed(4)}  (random baseline: ${report.outcome.brierReference})`,
    `Log Loss:           ${report.outcome.logLoss.toFixed(4)}`,
    `Sample Size:        ${report.outcome.sampleSize}`,
    `Overconfidence:     ${report.outcome.overconfidence.isOverconfident ? '⚠ YES' : '✓ no'}`,
    `Underconfidence:    ${report.outcome.overconfidence.isUnderconfident ? '⚠ YES' : '✓ no'}`,
    '',
    '── Calibration Curve ──',
    ...report.outcome.calibrationCurve.map((bin) => {
      const bar = '█'.repeat(Math.min(20, Math.round(bin.actualFrequency * 20)));
      return `  ${bin.bin.padEnd(8)} n=${String(bin.count).padStart(4)}  pred=${(bin.avgPredicted * 100).toFixed(0).padStart(3)}%  act=${(bin.actualFrequency * 100).toFixed(0).padStart(3)}% ${bar}`;
    }),
    '',
    '── Alpha Performance ──',
    `Hit Rate:           ${(report.alpha.hitRate * 100).toFixed(1)}%`,
    `Best Signal:        ${report.alpha.bestSignal}`,
    `Bias Direction:     ${report.alpha.calibrationDrift.biasDirection}`,
    '',
    '── Alpha Persistence ──',
    `Rolling Hit Rate:   ${(report.alphaPersistence.rollingHitRate * 100).toFixed(1)}%`,
    `Overall Hit Rate:   ${(report.alphaPersistence.overallHitRate * 100).toFixed(1)}%`,
    `Decaying:           ${report.alphaPersistence.isDecaying ? '⚠ YES' : '✓ no'}`,
    `Signal Stability:   ${report.alphaPersistence.signalStability.ranking.map((s, i) => `${i + 1}.${s}`).join(' ')}`,
  ];

  if (report.market) {
    lines.push(
      '',
      '── Market Alignment ──',
      `Avg Disagreement:   ${(report.market.avgTotalDisagreement * 100).toFixed(1)}%`,
      `Avg Edge:           H=${(report.market.avgEdge.home * 100).toFixed(1)}% D=${(report.market.avgEdge.draw * 100).toFixed(1)}% A=${(report.market.avgEdge.away * 100).toFixed(1)}%`,
      `Efficiency:         eff=${(report.market.efficiencyDistribution.efficient * 100).toFixed(0)}% mod=${(report.market.efficiencyDistribution.moderate_edge * 100).toFixed(0)}% alpha=${(report.market.efficiencyDistribution.potential_alpha * 100).toFixed(0)}%`,
    );
  }

  lines.push('═══════════════════════════════════════════');
  return lines.join('\n');
}

export function logCalibrationReport(report: CalibrationReport): void {
  console.info(formatCalibrationReport(report));
}
