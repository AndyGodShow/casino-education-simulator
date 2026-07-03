/**
 * Lightweight, deterministic signal weight suggestion.
 *
 * This is heuristic only. It is not causal calibration and should not be
 * treated as proof of alpha until backed by real outcomes and raw signal
 * history. Each optional adjustment cycle is capped at ±0.02, and weights
 * are clamped to [0.05, 0.60].
 */

export interface SignalWeights {
  form: number;
  matchup: number;
  context: number;
}

export interface CalibrationState {
  weights: SignalWeights;
  cycleCount: number;
  lastAdjustment: SignalWeights;
}

export interface WeightSuggestion {
  status: 'available' | 'insufficientData';
  message: string;
  suggestedWeights?: SignalWeights;
}

const DEFAULT_WEIGHTS: SignalWeights = { form: 0.4, matchup: 0.4, context: 0.2 };
const MIN_WEIGHT = 0.05;
const MAX_WEIGHT = 0.60;
const MAX_ADJUSTMENT_PER_CYCLE = 0.02;

let state: CalibrationState = {
  weights: { ...DEFAULT_WEIGHTS },
  cycleCount: 0,
  lastAdjustment: { form: 0, matchup: 0, context: 0 },
};

export function getWeights(): Readonly<SignalWeights> {
  return state.weights;
}

export function getCalibrationState(): Readonly<CalibrationState> {
  return state;
}

export function buildHeuristicWeightSuggestion(input: {
  sampleSize: number;
  signalAttribution?: {
    status: 'available' | 'insufficientData';
    scores?: SignalWeights;
  };
}): WeightSuggestion {
  if (input.sampleSize < 20 || input.signalAttribution?.status !== 'available' || !input.signalAttribution.scores) {
    return {
      status: 'insufficientData',
      message: 'Need at least 20 resolved matches with raw signal history before suggesting weights.',
    };
  }

  return {
    status: 'available',
    message: 'Heuristic only; not causal calibration. Validate on out-of-sample real outcomes.',
    suggestedWeights: previewWeights(input.signalAttribution.scores),
  };
}

/**
 * Apply a single calibration cycle.
 *
 * @param signalHitRates — { form, matchup, context } each in [0, 1]
 *   representing the hit rate of alpha direction for that signal alone.
 */
export function calibrate(signalHitRates: SignalWeights): SignalWeights {
  const newWeights = previewWeights(signalHitRates);
  state.weights = newWeights;
  state.cycleCount += 1;
  state.lastAdjustment = computeAdjustments(signalHitRates);

  return newWeights;
}

function computeAdjustments(signalHitRates: SignalWeights): SignalWeights {
  const adjustments: SignalWeights = { form: 0, matchup: 0, context: 0 };
  const entries: Array<{ key: keyof SignalWeights; rate: number }> = [
    { key: 'form', rate: signalHitRates.form },
    { key: 'matchup', rate: signalHitRates.matchup },
    { key: 'context', rate: signalHitRates.context },
  ];

  // Sort by hit rate descending — best signal gets positive adjustment
  const sorted = [...entries].sort((a, b) => b.rate - a.rate);

  for (let i = 0; i < sorted.length; i += 1) {
    const { key, rate } = sorted[i];
    if (rate > 0.55) {
      // Good signal → increase weight
      adjustments[key] = Math.min(MAX_ADJUSTMENT_PER_CYCLE, (rate - 0.5) * 0.1);
    } else if (rate < 0.45) {
      // Weak signal → decrease weight
      adjustments[key] = Math.max(-MAX_ADJUSTMENT_PER_CYCLE, (rate - 0.5) * 0.1);
    }
    // Near 0.5 → no adjustment (random)
  }

  return adjustments;
}

function previewWeights(signalHitRates: SignalWeights): SignalWeights {
  const adjustments = computeAdjustments(signalHitRates);

  // Apply adjustments with pre-normalization clamping
  const newWeights: SignalWeights = { ...state.weights };
  for (const key of ['form', 'matchup', 'context'] as Array<keyof SignalWeights>) {
    newWeights[key] = clamp(state.weights[key] + adjustments[key], MIN_WEIGHT, MAX_WEIGHT);
  }

  // Re-normalize to sum to 1.0, then re-clamp to enforce bounds
  let total = newWeights.form + newWeights.matchup + newWeights.context;
  if (total > 0) {
    newWeights.form /= total;
    newWeights.matchup /= total;
    newWeights.context /= total;
  }

  // Post-normalization clamp: if any weight exceeds MAX_WEIGHT after
  // normalization, cap it and redistribute proportionally.
  for (let iter = 0; iter < 3; iter += 1) {
    let overflow = 0;
    let didClamp = false;
    for (const key of ['form', 'matchup', 'context'] as Array<keyof SignalWeights>) {
      if (newWeights[key] > MAX_WEIGHT) {
        overflow += newWeights[key] - MAX_WEIGHT;
        newWeights[key] = MAX_WEIGHT;
        didClamp = true;
      }
      if (newWeights[key] < MIN_WEIGHT) {
        overflow += newWeights[key] - MIN_WEIGHT;
        newWeights[key] = MIN_WEIGHT;
        didClamp = true;
      }
    }
    if (!didClamp) break;
    // Redistribute overflow to non-clamped weights
    const freeKeys = (['form', 'matchup', 'context'] as Array<keyof SignalWeights>)
      .filter((k) => newWeights[k] > MIN_WEIGHT && newWeights[k] < MAX_WEIGHT);
    if (freeKeys.length > 0) {
      const perKey = overflow / freeKeys.length;
      for (const key of freeKeys) {
        newWeights[key] += perKey;
      }
    }
  }

  // Final normalization
  total = newWeights.form + newWeights.matchup + newWeights.context;
  if (total > 0) {
    newWeights.form /= total;
    newWeights.matchup /= total;
    newWeights.context /= total;
  }

  return newWeights;
}

export function resetWeights(): void {
  state = {
    weights: { ...DEFAULT_WEIGHTS },
    cycleCount: 0,
    lastAdjustment: { form: 0, matchup: 0, context: 0 },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
