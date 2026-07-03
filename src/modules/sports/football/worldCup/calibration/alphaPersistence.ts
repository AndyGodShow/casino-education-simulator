/**
 * Alpha Persistence Tracker — measures whether alpha signals remain
 * predictive over time, detects decay, and ranks signal stability.
 *
 * Read-only: uses alphaStore and alphaEvaluator as data sources.
 */
import { getResolved } from '../alpha/alphaStore';
import { evaluate } from '../alpha/alphaEvaluator';
import type { AlphaRecord } from '../alpha/alphaStore';

// ─── Types ───────────────────────────────────────────────────────────

export interface AlphaPersistenceReport {
  /** Rolling hit rate over the most recent window */
  rollingHitRate: number;
  /** Hit rate over all historical data */
  overallHitRate: number;
  /** Whether alpha hit rate is declining */
  isDecaying: boolean;
  /** Decay magnitude: how much the recent hit rate differs from overall */
  decayMagnitude: number;
  /** Per-signal stability ranking */
  signalStability: SignalStabilityRanking;
  /** Number of matches in the rolling window */
  windowSize: number;
  /** Total matches analyzed */
  totalMatches: number;
}

export interface SignalStabilityRanking {
  /** Sorted from most stable to least stable */
  ranking: Array<'form' | 'matchup' | 'context'>;
  /** Per-signal stability scores (higher = more stable) */
  scores: {
    form: number;
    matchup: number;
    context: number;
  };
}

export interface RollingWindowConfig {
  /** Number of recent matches to include in the rolling window */
  windowSize: number;
}

const DEFAULT_CONFIG: RollingWindowConfig = { windowSize: 20 };

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Compute alpha persistence metrics.
 *
 * @param config — optional window configuration
 */
export function trackPersistence(
  config: RollingWindowConfig = DEFAULT_CONFIG,
): AlphaPersistenceReport {
  const allRecords = getResolved();
  const totalMatches = allRecords.length;

  if (totalMatches === 0) {
    return emptyReport(config.windowSize);
  }

  // Overall hit rate
  const overallMetrics = evaluate();
  const overallHitRate = overallMetrics.hitRate;

  // Rolling window: evaluate only the last N matches
  const windowSize = Math.min(config.windowSize, totalMatches);
  const rollingHitRate = computeRollingHitRate(allRecords, windowSize);

  // Decay detection
  const decayMagnitude = overallHitRate - rollingHitRate;
  const isDecaying = decayMagnitude > 0.05; // recent worse than overall by 5%+

  // Signal stability
  const signalStability = computeSignalStability(allRecords, config.windowSize);

  return {
    rollingHitRate,
    overallHitRate,
    isDecaying,
    decayMagnitude,
    signalStability,
    windowSize,
    totalMatches,
  };
}

// ─── Rolling Hit Rate ─────────────────────────────────────────────────

function computeRollingHitRate(
  records: ReadonlyArray<Readonly<AlphaRecord>>,
  windowSize: number,
): number {
  const window = records.slice(-windowSize);
  if (window.length === 0) return 0;

  let hits = 0;
  for (const record of window) {
    const alphaDir = maxAlphaDirection(record);
    if (alphaDir === record.actualOutcome) {
      hits += 1;
    }
  }
  return hits / window.length;
}

// ─── Signal Stability ─────────────────────────────────────────────────

function computeSignalStability(
  records: ReadonlyArray<Readonly<AlphaRecord>>,
  windowSize: number,
): SignalStabilityRanking {
  if (records.some((record) => !record.signals)) {
    return {
      ranking: ['form', 'matchup', 'context'],
      scores: { form: 0.5, matchup: 0.5, context: 0.5 },
    };
  }

  // Split data into non-overlapping windows and compute per-window
  // signal scores, then measure variance across windows.
  const effectiveWindow = Math.max(5, Math.min(windowSize, Math.floor(records.length / 3)));
  if (records.length < effectiveWindow * 2) {
    // Not enough data for stability analysis — return neutral
    return {
      ranking: ['form', 'matchup', 'context'],
      scores: { form: 0.5, matchup: 0.5, context: 0.5 },
    };
  }

  const numWindows = Math.min(5, Math.floor(records.length / effectiveWindow));
  const windowScores: Array<{ form: number; matchup: number; context: number }> = [];

  for (let w = 0; w < numWindows; w += 1) {
    const start = records.length - (w + 1) * effectiveWindow;
    const end = records.length - w * effectiveWindow;
    const windowRecords = records.slice(Math.max(0, start), end);

    // Compute signal scores for this window using a simplified heuristic:
    // For each record in the window, check if the alpha direction matches.
    // Signals that contribute to correct alpha direction get higher scores.
    let formCorrect = 0;
    let matchupCorrect = 0;
    let contextCorrect = 0;
    let total = 0;

    for (const record of windowRecords) {
      if (!record.actualOutcome) continue;
      total += 1;

      const signals = record.signals!;
      formCorrect += signalHitScore(signals.form.home.value, signals.form.away.value, record.actualOutcome);
      matchupCorrect += signalHitScore(signals.matchup.home.value, signals.matchup.away.value, record.actualOutcome);
      contextCorrect += signalHitScore(signals.context.home.value, signals.context.away.value, record.actualOutcome);
    }

    if (total > 0) {
      windowScores.push({
        form: formCorrect / total,
        matchup: matchupCorrect / total,
        context: contextCorrect / total,
      });
    }
  }

  if (windowScores.length < 2) {
    return {
      ranking: ['form', 'matchup', 'context'],
      scores: { form: 0.5, matchup: 0.5, context: 0.5 },
    };
  }

  // Compute average and variance across windows
  const avgScores = {
    form: windowScores.reduce((s, w) => s + w.form, 0) / windowScores.length,
    matchup: windowScores.reduce((s, w) => s + w.matchup, 0) / windowScores.length,
    context: windowScores.reduce((s, w) => s + w.context, 0) / windowScores.length,
  };

  // Stability = 1 - coefficient of variation (higher = more stable)
  const variances = {
    form: windowScores.reduce((s, w) => s + (w.form - avgScores.form) ** 2, 0) / windowScores.length,
    matchup: windowScores.reduce((s, w) => s + (w.matchup - avgScores.matchup) ** 2, 0) / windowScores.length,
    context: windowScores.reduce((s, w) => s + (w.context - avgScores.context) ** 2, 0) / windowScores.length,
  };

  const stabilityScores = {
    form: 1 / (1 + Math.sqrt(variances.form)),
    matchup: 1 / (1 + Math.sqrt(variances.matchup)),
    context: 1 / (1 + Math.sqrt(variances.context)),
  };

  const ranking = [...(['form', 'matchup', 'context'] as const)]
    .sort((a, b) => stabilityScores[b] - stabilityScores[a]);

  return { ranking, scores: stabilityScores };
}

function signalHitScore(homeValue: number, awayValue: number, actual: 'home' | 'draw' | 'away'): number {
  const spread = homeValue - awayValue;
  if (actual === 'home') return spread > 0 ? 1 : 0;
  if (actual === 'away') return spread < 0 ? 1 : 0;
  return Math.abs(spread) <= 0.02 ? 1 : 0;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function maxAlphaDirection(record: Readonly<AlphaRecord>): 'home' | 'draw' | 'away' {
  const { alphaHomeWin, alphaDraw, alphaAwayWin } = record;
  if (alphaHomeWin >= alphaDraw && alphaHomeWin >= alphaAwayWin) return 'home';
  if (alphaDraw >= alphaHomeWin && alphaDraw >= alphaAwayWin) return 'draw';
  return 'away';
}

function emptyReport(windowSize: number): AlphaPersistenceReport {
  return {
    rollingHitRate: 0,
    overallHitRate: 0,
    isDecaying: false,
    decayMagnitude: 0,
    signalStability: {
      ranking: ['form', 'matchup', 'context'],
      scores: { form: 0.5, matchup: 0.5, context: 0.5 },
    },
    windowSize,
    totalMatches: 0,
  };
}
