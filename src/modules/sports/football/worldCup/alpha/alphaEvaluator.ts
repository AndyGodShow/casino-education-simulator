import type { AlphaRecord, MatchOutcome } from './alphaStore';
import { getResolved } from './alphaStore';

// ─── Types ───────────────────────────────────────────────────────────

export interface EvaluationMetrics {
  /** Alpha Hit Rate: P(alpha direction == actual outcome) */
  hitRate: number;
  /** Directional Accuracy: per-outcome hit rate breakdown */
  directionalAccuracy: {
    home: number;
    draw: number;
    away: number;
  };
  /** Bucket accuracy: hit rate by alpha magnitude bucket */
  bucketAccuracy: BucketResult[];
  /** Long-term calibration drift */
  calibrationDrift: CalibrationDrift;
  /** Which signal contributes most to correct predictions */
  bestSignal: 'form' | 'matchup' | 'context' | 'none';
  /** Signal contribution scores */
  signalScores: {
    form: number;
    matchup: number;
    context: number;
  };
  signalAttribution: SignalAttribution;
  /** Total resolved matches evaluated */
  sampleSize: number;
}

interface BucketResult {
  bucket: string;
  range: [number, number];
  count: number;
  hitRate: number;
}

interface CalibrationDrift {
  /** Mean alpha for actually-occurred outcomes */
  meanAlphaOnCorrect: number;
  /** Mean alpha for outcomes that did NOT occur */
  meanAlphaOnIncorrect: number;
  /** Systematic bias: positive = over-predicting, negative = under-predicting */
  biasDirection: 'neutral' | 'home_skew' | 'away_skew' | 'draw_skew';
  /** Magnitude of the bias */
  biasMagnitude: number;
}

type SignalAttribution = {
  status: 'available' | 'insufficientData';
  message?: string;
  scores?: {
    form: number;
    matchup: number;
    context: number;
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────

function alphaDirection(record: AlphaRecord): MatchOutcome {
  const { alphaHomeWin, alphaDraw, alphaAwayWin } = record;
  if (alphaHomeWin >= alphaDraw && alphaHomeWin >= alphaAwayWin) return 'home';
  if (alphaDraw >= alphaHomeWin && alphaDraw >= alphaAwayWin) return 'draw';
  return 'away';
}

function alphaForOutcome(record: AlphaRecord, outcome: MatchOutcome): number {
  switch (outcome) {
    case 'home': return record.alphaHomeWin;
    case 'draw': return record.alphaDraw;
    case 'away': return record.alphaAwayWin;
  }
}

// ─── Evaluation ───────────────────────────────────────────────────────

export function evaluate(): EvaluationMetrics {
  const records = getResolved();
  const n = records.length;

  if (n === 0) {
    return emptyMetrics();
  }

  // ── 1. Alpha Hit Rate ──
  let hits = 0;
  const outcomeHits = { home: 0, draw: 0, away: 0 };
  const outcomeCounts = { home: 0, draw: 0, away: 0 };

  for (const record of records) {
    const dir = alphaDirection(record);
    const actual = record.actualOutcome!;
    if (dir === actual) hits += 1;
    outcomeCounts[actual] += 1;
    if (dir === actual) outcomeHits[actual] += 1;
  }

  const hitRate = hits / n;

  // ── 2. Directional Accuracy ──
  const directionalAccuracy = {
    home: outcomeCounts.home > 0 ? outcomeHits.home / outcomeCounts.home : 0,
    draw: outcomeCounts.draw > 0 ? outcomeHits.draw / outcomeCounts.draw : 0,
    away: outcomeCounts.away > 0 ? outcomeHits.away / outcomeCounts.away : 0,
  };

  // ── 3. Bucket Accuracy ──
  const bucketAccuracy = computeBucketAccuracy(records);

  // ── 4. Calibration Drift ──
  const calibrationDrift = computeCalibrationDrift(records);

  // ── 5. Best Signal ──
  const signalAttribution = computeSignalAttribution(records);
  const signalScores = signalAttribution.scores ?? { form: 0.5, matchup: 0.5, context: 0.5 };
  const bestSignal = identifyBestSignal(signalScores);

  return {
    hitRate,
    directionalAccuracy,
    bucketAccuracy,
    calibrationDrift,
    bestSignal,
    signalScores,
    signalAttribution,
    sampleSize: n,
  };
}

// ── Bucket Analysis ───────────────────────────────────────────────────

function computeBucketAccuracy(records: ReadonlyArray<Readonly<AlphaRecord>>): BucketResult[] {
  const buckets: Array<{ range: [number, number]; hits: number; count: number }> = [
    { range: [-0.30, -0.10], hits: 0, count: 0 },
    { range: [-0.10, 0.00], hits: 0, count: 0 },
    { range: [0.00, 0.10], hits: 0, count: 0 },
    { range: [0.10, 0.30], hits: 0, count: 0 },
  ];

  for (const record of records) {
    const alpha = alphaForOutcome(record, record.actualOutcome!);
    for (const bucket of buckets) {
      if (alpha >= bucket.range[0] && alpha < bucket.range[1]) {
        bucket.count += 1;
        if (alphaDirection(record) === record.actualOutcome) {
          bucket.hits += 1;
        }
        break;
      }
    }
  }

  return buckets.map((b) => ({
    bucket: `[${b.range[0].toFixed(2)}, ${b.range[1].toFixed(2)})`,
    range: b.range,
    count: b.count,
    hitRate: b.count > 0 ? b.hits / b.count : 0,
  }));
}

// ── Calibration Drift ─────────────────────────────────────────────────

function computeCalibrationDrift(records: ReadonlyArray<Readonly<AlphaRecord>>): CalibrationDrift {
  let alphaCorrectSum = 0;
  let alphaIncorrectSum = 0;
  let correctCount = 0;
  let incorrectCount = 0;

  // Track per-outcome mean alpha to detect systematic bias
  let homeAlphaSum = 0;
  let drawAlphaSum = 0;
  let awayAlphaSum = 0;

  for (const record of records) {
    const actual = record.actualOutcome!;
    const dir = alphaDirection(record);

    homeAlphaSum += record.alphaHomeWin;
    drawAlphaSum += record.alphaDraw;
    awayAlphaSum += record.alphaAwayWin;

    if (dir === actual) {
      alphaCorrectSum += alphaForOutcome(record, actual);
      correctCount += 1;
    } else {
      alphaIncorrectSum += alphaForOutcome(record, actual);
      incorrectCount += 1;
    }
  }

  const n = records.length;
  const meanHomeAlpha = homeAlphaSum / n;
  const meanDrawAlpha = drawAlphaSum / n;
  const meanAwayAlpha = awayAlphaSum / n;

  // Determine bias direction
  let biasDirection: CalibrationDrift['biasDirection'] = 'neutral';
  let biasMagnitude = 0;

  const absHome = Math.abs(meanHomeAlpha);
  const absAway = Math.abs(meanAwayAlpha);
  const absDraw = Math.abs(meanDrawAlpha);

  if (absHome > absAway && absHome > absDraw && absHome > 0.005) {
    biasDirection = meanHomeAlpha > 0 ? 'home_skew' : 'away_skew';
    biasMagnitude = absHome;
  } else if (absAway > absHome && absAway > absDraw && absAway > 0.005) {
    biasDirection = meanAwayAlpha > 0 ? 'away_skew' : 'home_skew';
    biasMagnitude = absAway;
  } else if (absDraw > 0.005) {
    biasDirection = 'draw_skew';
    biasMagnitude = absDraw;
  }

  return {
    meanAlphaOnCorrect: correctCount > 0 ? alphaCorrectSum / correctCount : 0,
    meanAlphaOnIncorrect: incorrectCount > 0 ? alphaIncorrectSum / incorrectCount : 0,
    biasDirection,
    biasMagnitude,
  };
}

// ── Signal Scoring ────────────────────────────────────────────────────

function computeSignalAttribution(records: ReadonlyArray<Readonly<AlphaRecord>>): SignalAttribution {
  const usable = records.filter((record) => record.signals && record.actualOutcome);
  if (usable.length !== records.length || usable.length < 3) {
    return {
      status: 'insufficientData',
      message: 'Need resolved records with raw AlphaSignals for signal attribution.',
    };
  }

  const totals = { form: 0, matchup: 0, context: 0 };
  const weights = { form: 0, matchup: 0, context: 0 };

  for (const record of usable) {
    const actual = record.actualOutcome!;
    const signals = record.signals!;
    scoreSignalPair(totals, weights, 'form', signals.form.home.value, signals.form.away.value, actual);
    scoreSignalPair(totals, weights, 'matchup', signals.matchup.home.value, signals.matchup.away.value, actual);
    scoreSignalPair(totals, weights, 'context', signals.context.home.value, signals.context.away.value, actual);
  }

  return {
    status: 'available',
    scores: {
      form: weightedScore(totals.form, weights.form),
      matchup: weightedScore(totals.matchup, weights.matchup),
      context: weightedScore(totals.context, weights.context),
    },
  };
}

function scoreSignalPair(
  totals: { form: number; matchup: number; context: number },
  weights: { form: number; matchup: number; context: number },
  key: 'form' | 'matchup' | 'context',
  homeValue: number,
  awayValue: number,
  actual: MatchOutcome,
) {
  const spread = homeValue - awayValue;
  const magnitude = Math.max(0.001, Math.abs(spread));
  weights[key] += magnitude;

  if (actual === 'home') {
    totals[key] += spread > 0 ? magnitude : 0;
  } else if (actual === 'away') {
    totals[key] += spread < 0 ? magnitude : 0;
  } else {
    totals[key] += Math.abs(spread) <= 0.02 ? magnitude : 0;
  }
}

function weightedScore(total: number, weight: number): number {
  return weight > 0 ? clamp(total / weight, 0, 1) : 0.5;
}

function identifyBestSignal(scores: { form: number; matchup: number; context: number }): 'form' | 'matchup' | 'context' | 'none' {
  const max = Math.max(scores.form, scores.matchup, scores.context);
  if (max < 0.51) return 'none';
  if (scores.form === max) return 'form';
  if (scores.matchup === max) return 'matchup';
  return 'context';
}

// ── Display ───────────────────────────────────────────────────────────

export function formatEvaluationReport(metrics: EvaluationMetrics): string {
  const lines: string[] = [
    '═══════════════════════════════════════',
    '        Alpha Evaluation Report        ',
    '═══════════════════════════════════════',
    `Sample Size:        ${metrics.sampleSize} matches`,
    `Alpha Hit Rate:     ${(metrics.hitRate * 100).toFixed(1)}%`,
    `Directional Accuracy:`,
    `  Home:             ${(metrics.directionalAccuracy.home * 100).toFixed(1)}%`,
    `  Draw:             ${(metrics.directionalAccuracy.draw * 100).toFixed(1)}%`,
    `  Away:             ${(metrics.directionalAccuracy.away * 100).toFixed(1)}%`,
    `Calibration Drift:  ${metrics.calibrationDrift.biasDirection} (${(metrics.calibrationDrift.biasMagnitude * 100).toFixed(2)}%)`,
    `Best Signal:        ${metrics.bestSignal}`,
    `Signal Scores:      F=${(metrics.signalScores.form * 100).toFixed(0)}% M=${(metrics.signalScores.matchup * 100).toFixed(0)}% C=${(metrics.signalScores.context * 100).toFixed(0)}%`,
    '───────────────────────────────────────',
    'Bucket Analysis:',
  ];

  for (const bucket of metrics.bucketAccuracy) {
    const bar = '█'.repeat(Math.round(bucket.hitRate * 20));
    lines.push(`  ${bucket.bucket.padEnd(16)} n=${String(bucket.count).padStart(3)}  ${(bucket.hitRate * 100).toFixed(0).padStart(3)}% ${bar}`);
  }

  lines.push('═══════════════════════════════════════');
  return lines.join('\n');
}

export function logEvaluationReport(): void {
  const metrics = evaluate();
  console.info(formatEvaluationReport(metrics));
}

// ── Helpers ───────────────────────────────────────────────────────────

function emptyMetrics(): EvaluationMetrics {
  return {
    hitRate: 0,
    directionalAccuracy: { home: 0, draw: 0, away: 0 },
    bucketAccuracy: [],
    calibrationDrift: {
      meanAlphaOnCorrect: 0,
      meanAlphaOnIncorrect: 0,
      biasDirection: 'neutral',
      biasMagnitude: 0,
    },
    bestSignal: 'none',
    signalScores: { form: 0.5, matchup: 0.5, context: 0.5 },
    signalAttribution: {
      status: 'insufficientData',
      message: 'Need resolved records with raw AlphaSignals for signal attribution.',
    },
    sampleSize: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
