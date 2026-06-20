import type { WorldCupMatch, WorldCupTeam } from '../types';
import { computeBaseLambdaForAlpha, type ExpectedGoals } from './predictionEngine';
import { buildDecisionLayer } from './predictionDecisionLayer';
import { computeSignalLayer } from './signalLayer';
import type { AlphaSignals } from './signalLayer';
import { getWeights, type SignalWeights } from '../alpha/alphaCalibration';
import { record as storeRecord } from '../alpha/alphaStore';
import type { MatchOutcome } from '../alpha/alphaStore';
import { validateAlphaSum } from './consistencyValidator';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export interface AlphaResult {
  /** Baseline 1X2 from clean alpha λ, no explicit signals */
  baseline: { homeWin: number; draw: number; awayWin: number };
  /** Model 1X2 (signal-injected λ) */
  model: { homeWin: number; draw: number; awayWin: number };
  /** Alpha = P_model - P_baseline */
  alpha: { homeWin: number; draw: number; awayWin: number };
  /** Raw signal values */
  signals: AlphaSignals;
  weights: SignalWeights;
  /** λ values for both paths */
  lambda: {
    base: ExpectedGoals;
    signal: ExpectedGoals;
  };
}

function baselineOutcome(probs: { homeWin: number; draw: number; awayWin: number }): MatchOutcome {
  if (probs.homeWin >= probs.draw && probs.homeWin >= probs.awayWin) return 'home';
  if (probs.draw >= probs.homeWin && probs.draw >= probs.awayWin) return 'draw';
  return 'away';
}

/**
 * Compute alpha: the difference between signal-injected model prediction
 * and the baseline V2 prediction.
 *
 * λ_signal = λ_base + w_form*form + w_matchup*matchup + w_context*context
 *
 * Weights are read from the calibration layer. Updating them is an explicit
 * heuristic step via calibrate(), not proof of causal signal calibration.
 */
export function computeAlpha(
  match: WorldCupMatch,
  homeTeam: WorldCupTeam,
  awayTeam: WorldCupTeam,
): AlphaResult {
  // 1. Clean baseline λ: base strength + attack/defense + fixed home prior only.
  const baselineLambda = computeBaseLambdaForAlpha(match, homeTeam, awayTeam);

  // 2. Baseline 1X2 from clean baseline λ
  const baselineDecision = buildDecisionLayer(baselineLambda.home, baselineLambda.away);

  // 3. Compute signals
  const signals = computeSignalLayer(homeTeam, awayTeam, match);

  // 4. Signal-injected λ using calibrated weights
  const w = getWeights();
  const signalLambda = {
    home: clamp(
      baselineLambda.home
        + w.form * signals.form.home.value
        + w.matchup * signals.matchup.home.value
        + w.context * signals.context.home.value,
      0.2,
      4.5,
    ),
    away: clamp(
      baselineLambda.away
        + w.form * signals.form.away.value
        + w.matchup * signals.matchup.away.value
        + w.context * signals.context.away.value,
      0.2,
      4.5,
    ),
  };

  // 5. Model 1X2 from signal λ
  const modelDecision = buildDecisionLayer(signalLambda.home, signalLambda.away);

  const baselineProbs = baselineDecision.oneX2;
  const modelProbs = modelDecision.oneX2;

  const alpha = {
    homeWin: modelProbs.homeWin - baselineProbs.homeWin,
    draw: modelProbs.draw - baselineProbs.draw,
    awayWin: modelProbs.awayWin - baselineProbs.awayWin,
  };
  const alphaValidation = validateAlphaSum(alpha);
  if (!alphaValidation.valid) {
    throw new Error(`[AlphaEngine] ${alphaValidation.warnings.join('; ')}`);
  }

  const result: AlphaResult = {
    baseline: baselineProbs,
    model: modelProbs,
    alpha,
    signals,
    weights: { ...w },
    lambda: {
      base: baselineLambda,
      signal: signalLambda,
    },
  };

  // Hook: record alpha for evaluation
  storeRecord({
    matchId: match.id,
    alpha,
    alphaHomeWin: alpha.homeWin,
    alphaDraw: alpha.draw,
    alphaAwayWin: alpha.awayWin,
    baseline: {
      oneX2: baselineProbs,
      lambda: baselineLambda,
    },
    signalModel: {
      oneX2: modelProbs,
      lambda: signalLambda,
    },
    signals,
    weights: { ...w },
    predictedOutcome: baselineOutcome(baselineProbs),
  });

  return result;
}

export function applyAlphaSignalsToLambda(
  baselineLambda: ExpectedGoals,
  signals: AlphaSignals,
  weights: SignalWeights,
): ExpectedGoals {
  return {
    home: clamp(
      baselineLambda.home
        + weights.form * signals.form.home.value
        + weights.matchup * signals.matchup.home.value
        + weights.context * signals.context.home.value,
    0.2,
    4.5,
    ),
    away: clamp(
      baselineLambda.away
        + weights.form * signals.form.away.value
        + weights.matchup * signals.matchup.away.value
        + weights.context * signals.context.away.value,
    0.2,
    4.5,
    ),
  };
}
