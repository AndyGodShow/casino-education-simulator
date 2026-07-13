import type { ThreeWayProbability } from '../../../../core/probability/unifiedProbability';
import type { CausalRatedMatch } from './causalTeamRatings';

export type StrategyOptimizationSample = {
  matchId: string;
  date: string;
  context: string;
  neutral: boolean;
  homeElo: number;
  awayElo: number;
  outcome: 'home' | 'draw' | 'away';
};

export type StrategyCandidate = {
  id: string;
  eloScale: number;
  drawBase: number;
  drawCloseness: number;
};

export type StrategyEvaluationMetrics = {
  sampleSize: number;
  brierScore: number;
  logLoss: number;
  accuracy: number;
};

export type WalkForwardStrategyReport = {
  status: 'applied' | 'rejected' | 'insufficient_evidence';
  applied: boolean;
  reason: string;
  selectedCandidate: StrategyCandidate;
  baseline: StrategyCandidate;
  splits: {
    training: { from: string; to: string; sampleSize: number };
    validation: { from: string; to: string; sampleSize: number };
    holdout: { from: string; to: string; sampleSize: number };
  };
  validation: StrategyEvaluationMetrics;
  holdout: StrategyEvaluationMetrics & {
    baselineBrierScore: number;
    brierImprovement: number;
    contexts: number;
  };
};

type OptimizeWorldCupStrategyOptions = {
  candidates?: StrategyCandidate[];
  baseline?: StrategyCandidate;
  minimumTrainingMatches?: number;
  minimumValidationMatches?: number;
  minimumHoldoutMatches?: number;
  minimumContexts?: number;
  minimumBrierImprovement?: number;
};

export const WORLD_CUP_STRATEGY_RESEARCH_CONFIG = {
  baseline: {
    id: 'baseline-v2',
    eloScale: 500,
    drawBase: 0.2,
    drawCloseness: 0.14,
  },
  candidates: [
    { id: 'balanced-400', eloScale: 400, drawBase: 0.2, drawCloseness: 0.14 },
    { id: 'conservative-520', eloScale: 520, drawBase: 0.22, drawCloseness: 0.16 },
    { id: 'assertive-320', eloScale: 320, drawBase: 0.18, drawCloseness: 0.12 },
    { id: 'draw-aware-420', eloScale: 420, drawBase: 0.23, drawCloseness: 0.18 },
  ],
  minimumTrainingMatches: 60,
  minimumValidationMatches: 60,
  minimumHoldoutMatches: 60,
  minimumContexts: 2,
  minimumBrierImprovement: 0.01,
  probability: {
    homeEloAdvantage: 80,
    eloScaleClamp: { min: 120, max: 1_000 },
    drawClamp: { min: 0.05, max: 0.42 },
    drawClosenessDivisor: 250,
  },
} as const;

const rounded = (value: number) => Number(value.toFixed(6));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function predictStrategyCandidate(
  sample: StrategyOptimizationSample,
  candidate: StrategyCandidate,
): ThreeWayProbability {
  const config = WORLD_CUP_STRATEGY_RESEARCH_CONFIG.probability;
  const homeAdvantage = sample.neutral ? 0 : config.homeEloAdvantage;
  const eloGap = sample.homeElo + homeAdvantage - sample.awayElo;
  const scale = clamp(candidate.eloScale, config.eloScaleClamp.min, config.eloScaleClamp.max);
  const homeShare = 1 / (1 + 10 ** (-eloGap / scale));
  const draw = clamp(
    candidate.drawBase
      + candidate.drawCloseness * Math.exp(-Math.abs(eloGap) / config.drawClosenessDivisor),
    config.drawClamp.min,
    config.drawClamp.max,
  );

  return {
    home: (1 - draw) * homeShare,
    draw,
    away: (1 - draw) * (1 - homeShare),
  };
}

const outcomeIndex = (outcome: StrategyOptimizationSample['outcome']) =>
  outcome === 'home' ? 0 : outcome === 'draw' ? 1 : 2;

const evaluate = (
  samples: StrategyOptimizationSample[],
  candidate: StrategyCandidate,
): StrategyEvaluationMetrics => {
  if (samples.length === 0) {
    return { sampleSize: 0, brierScore: 0, logLoss: 0, accuracy: 0 };
  }

  let brier = 0;
  let logLoss = 0;
  let correct = 0;
  for (const sample of samples) {
    const probabilities = predictStrategyCandidate(sample, candidate);
    const values = [probabilities.home, probabilities.draw, probabilities.away];
    const actual = outcomeIndex(sample.outcome);
    brier += values.reduce((sum, probability, index) =>
      sum + (probability - (index === actual ? 1 : 0)) ** 2, 0);
    logLoss -= Math.log(clamp(values[actual] ?? 0, 1e-12, 1));
    const predicted = values.indexOf(Math.max(...values));
    if (predicted === actual) correct += 1;
  }

  return {
    sampleSize: samples.length,
    brierScore: rounded(brier / samples.length),
    logLoss: rounded(logLoss / samples.length),
    accuracy: rounded(correct / samples.length),
  };
};

const emptyRange = () => ({ from: '', to: '', sampleSize: 0 });
const rangeFor = (samples: StrategyOptimizationSample[]) => samples.length === 0
  ? emptyRange()
  : {
    from: samples[0]?.date ?? '',
    to: samples[samples.length - 1]?.date ?? '',
    sampleSize: samples.length,
  };

const sortedValidSamples = (samples: StrategyOptimizationSample[]) => samples
  .filter((sample) => (
    Boolean(sample.matchId)
    && /^\d{4}-\d{2}-\d{2}$/.test(sample.date)
    && Number.isFinite(Date.parse(`${sample.date}T00:00:00.000Z`))
    && Number.isFinite(sample.homeElo)
    && Number.isFinite(sample.awayElo)
  ))
  .sort((left, right) => left.date.localeCompare(right.date) || left.matchId.localeCompare(right.matchId));

export function buildStrategyScenarioContext(input: {
  tournament: string;
  neutral: boolean;
  homeElo: number;
  awayElo: number;
}) {
  const gap = Math.abs(input.homeElo - input.awayElo);
  const edge = gap < 75 ? 'close' : gap >= 300 ? 'mismatch' : 'balanced';
  return `${input.tournament}|${input.neutral ? 'neutral' : 'home-context'}|${edge}`;
}

export function strategyOptimizationSamplesFromTimeline(
  timeline: CausalRatedMatch[],
): StrategyOptimizationSample[] {
  return timeline.map(({ match, home, away, outcome }) => ({
    matchId: match.id,
    date: match.date,
    context: buildStrategyScenarioContext({
      tournament: match.tournament,
      neutral: match.neutral,
      homeElo: home.elo,
      awayElo: away.elo,
    }),
    neutral: match.neutral,
    homeElo: home.elo,
    awayElo: away.elo,
    outcome,
  }));
}

export function optimizeWorldCupStrategy(
  inputSamples: StrategyOptimizationSample[],
  options: OptimizeWorldCupStrategyOptions = {},
): WalkForwardStrategyReport {
  const config = WORLD_CUP_STRATEGY_RESEARCH_CONFIG;
  const baseline = options.baseline ?? config.baseline;
  const candidates = options.candidates?.length ? options.candidates : config.candidates;
  const minimumTraining = options.minimumTrainingMatches ?? config.minimumTrainingMatches;
  const minimumValidation = options.minimumValidationMatches ?? config.minimumValidationMatches;
  const minimumHoldout = options.minimumHoldoutMatches ?? config.minimumHoldoutMatches;
  const minimumContexts = options.minimumContexts ?? config.minimumContexts;
  const minimumImprovement = options.minimumBrierImprovement ?? config.minimumBrierImprovement;
  const samples = sortedValidSamples(inputSamples);
  const required = minimumTraining + minimumValidation + minimumHoldout;

  if (samples.length < required) {
    return {
      status: 'insufficient_evidence',
      applied: false,
      reason: `Need at least ${required} chronological samples; received ${samples.length}.`,
      selectedCandidate: baseline,
      baseline,
      splits: {
        training: rangeFor(samples),
        validation: emptyRange(),
        holdout: emptyRange(),
      },
      validation: evaluate([], baseline),
      holdout: {
        ...evaluate([], baseline),
        baselineBrierScore: 0,
        brierImprovement: 0,
        contexts: 0,
      },
    };
  }

  const holdout = samples.slice(-minimumHoldout);
  const validation = samples.slice(-(minimumHoldout + minimumValidation), -minimumHoldout);
  const training = samples.slice(0, -(minimumHoldout + minimumValidation));
  const selected = [...candidates]
    .map((candidate) => ({ candidate, metrics: evaluate(validation, candidate) }))
    .sort((left, right) =>
      left.metrics.brierScore - right.metrics.brierScore
      || left.metrics.logLoss - right.metrics.logLoss
      || left.candidate.id.localeCompare(right.candidate.id))[0] ?? {
    candidate: baseline,
    metrics: evaluate(validation, baseline),
  };
  const selectedHoldout = evaluate(holdout, selected.candidate);
  const baselineHoldout = evaluate(holdout, baseline);
  const brierImprovement = rounded(baselineHoldout.brierScore - selectedHoldout.brierScore);
  const contexts = new Set(holdout.map((sample) => sample.context)).size;
  const applied = contexts >= minimumContexts && brierImprovement >= minimumImprovement;
  const reason = applied
    ? `Candidate improved holdout Brier score by ${brierImprovement.toFixed(3)} across ${contexts} contexts.`
    : contexts < minimumContexts
      ? `Holdout covers ${contexts}/${minimumContexts} required contexts.`
      : `Holdout Brier improvement ${brierImprovement.toFixed(3)} is below ${minimumImprovement.toFixed(3)}.`;

  return {
    status: applied ? 'applied' : 'rejected',
    applied,
    reason,
    selectedCandidate: selected.candidate,
    baseline,
    splits: {
      training: rangeFor(training),
      validation: rangeFor(validation),
      holdout: rangeFor(holdout),
    },
    validation: selected.metrics,
    holdout: {
      ...selectedHoldout,
      baselineBrierScore: baselineHoldout.brierScore,
      brierImprovement,
      contexts,
    },
  };
}
