import type { ScoreEntry } from './scoreDistribution';
import type { OneX2Result } from './oneX2';

export type ConsistencyReport = {
  valid: boolean;
  warnings: string[];
};

function isDev(): boolean {
  try {
    return typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  } catch {
    return false;
  }
}

export function validateLambdaRange(lambda: number, label: string): ConsistencyReport {
  const warnings: string[] = [];
  if (!Number.isFinite(lambda)) {
    return { valid: false, warnings: [`${label} λ is not finite`] };
  }
  if (lambda < 0.2 || lambda > 4.5) {
    warnings.push(`${label} λ=${lambda.toFixed(3)} outside valid range [0.2, 4.5]`);
  }
  if (lambda > 3.5) {
    warnings.push(`${label} λ=${lambda.toFixed(3)} unusually high — check rating inputs`);
  }
  return { valid: warnings.length === 0, warnings };
}

export function validateScoreDistSum(matrix: ScoreEntry[]): ConsistencyReport {
  const invalid = matrix.find((entry) => !Number.isFinite(entry.probability) || entry.probability < 0);
  if (invalid) {
    return { valid: false, warnings: [`Score distribution contains invalid probability at ${invalid.home}-${invalid.away}`] };
  }
  const sum = matrix.reduce((acc, e) => acc + e.probability, 0);
  if (Math.abs(sum - 1) > 1e-6) {
    return { valid: false, warnings: [`Score distribution sum=${sum.toFixed(8)} deviates from 1.0`] };
  }
  return { valid: true, warnings: [] };
}

export function validate1X2FromScoreDist(
  matrix: ScoreEntry[],
  oneX2: OneX2Result,
): ConsistencyReport {
  let rawHome = 0;
  let rawDraw = 0;
  let rawAway = 0;

  for (const entry of matrix) {
    if (entry.home > entry.away) rawHome += entry.probability;
    else if (entry.home === entry.away) rawDraw += entry.probability;
    else rawAway += entry.probability;
  }

  const rawTotal = rawHome + rawDraw + rawAway;
  if (rawTotal <= 0) {
    return { valid: false, warnings: ['Score distribution has zero total probability'] };
  }

  const normalizedRaw = {
    home: rawHome / rawTotal,
    draw: rawDraw / rawTotal,
    away: rawAway / rawTotal,
  };

  const homeDelta = Math.abs(oneX2.homeWin - normalizedRaw.home);
  const drawDelta = Math.abs(oneX2.draw - normalizedRaw.draw);
  const awayDelta = Math.abs(oneX2.awayWin - normalizedRaw.away);
  const maxAllowedDelta = 1e-6;

  const warnings: string[] = [];
  if (!Number.isFinite(oneX2.homeWin) || !Number.isFinite(oneX2.draw) || !Number.isFinite(oneX2.awayWin)) {
    warnings.push('1X2 contains non-finite probability');
  }
  const oneX2Sum = oneX2.homeWin + oneX2.draw + oneX2.awayWin;
  if (Math.abs(oneX2Sum - 1) > 1e-6) {
    warnings.push(`1X2 sum=${oneX2Sum.toFixed(8)} deviates from 1.0`);
  }
  if (homeDelta > maxAllowedDelta) {
    warnings.push(`1X2 homeWin deviates from scoreDist by ${(homeDelta * 100).toFixed(2)}%`);
  }
  if (drawDelta > maxAllowedDelta) {
    warnings.push(`1X2 draw deviates from scoreDist by ${(drawDelta * 100).toFixed(2)}%`);
  }
  if (awayDelta > maxAllowedDelta) {
    warnings.push(`1X2 awayWin deviates from scoreDist by ${(awayDelta * 100).toFixed(2)}%`);
  }

  return { valid: warnings.length === 0, warnings };
}

export function validateAlphaSum(alpha: { homeWin: number; draw: number; awayWin: number }): ConsistencyReport {
  const warnings: string[] = [];
  const values = [alpha.homeWin, alpha.draw, alpha.awayWin];
  if (values.some((value) => !Number.isFinite(value))) {
    warnings.push('Alpha contains non-finite probability delta');
  }
  const sum = alpha.homeWin + alpha.draw + alpha.awayWin;
  if (Math.abs(sum) > 1e-6) {
    warnings.push(`Alpha sum=${sum.toFixed(8)} deviates from 0`);
  }
  return { valid: warnings.length === 0, warnings };
}

export function validateBehavioralConstraints(
  matrix: ScoreEntry[],
  lambdaHome: number,
  lambdaAway: number,
): ConsistencyReport {
  const warnings: string[] = [];

  // Low-scoring bias: P(0-0, 1-0, 0-1, 1-1) should dominate
  let lowScoreMass = 0;
  const lowScores = new Set(['0|0', '1|0', '0|1', '1|1']);
  for (const entry of matrix) {
    if (lowScores.has(`${entry.home}|${entry.away}`)) {
      lowScoreMass += entry.probability;
    }
  }
  if (lowScoreMass < 0.12) {
    warnings.push(`Low-score mass ${(lowScoreMass * 100).toFixed(1)}% below 12% minimum`);
  }

  // Score decay: P(goals) should decrease as total goals increase beyond the peak.
  // For realistic λ (0.5-3.0), the probability peak is typically at 1-2 goals,
  // so we only enforce monotonic decay for totals ≥ 2.
  const byTotalGoals = new Map<number, number>();
  for (const entry of matrix) {
    const total = entry.home + entry.away;
    byTotalGoals.set(total, (byTotalGoals.get(total) ?? 0) + entry.probability);
  }
  const totals = [...byTotalGoals.keys()].sort((a, b) => a - b);
  for (let i = 3; i < Math.min(totals.length, 8); i += 1) {
    const prev = byTotalGoals.get(totals[i - 1]) ?? 0;
    const curr = byTotalGoals.get(totals[i]) ?? 0;
    if (curr > prev * 1.2 && totals[i] >= 3) {
      warnings.push(`Score decay anomaly: ${totals[i]}-goal total (${(curr * 100).toFixed(1)}%) exceeds ${totals[i - 1]}-goal (${(prev * 100).toFixed(1)}%)`);
    }
  }

  // Home advantage: P(homeWin) should slightly exceed P(awayWin) when λ_home ≥ λ_away
  if (lambdaHome >= lambdaAway) {
    let homeWin = 0;
    let awayWin = 0;
    for (const entry of matrix) {
      if (entry.home > entry.away) homeWin += entry.probability;
      else if (entry.home < entry.away) awayWin += entry.probability;
    }
    if (awayWin > homeWin * 1.05 && lambdaHome - lambdaAway < 0.3) {
      warnings.push('Home advantage sign anomaly: awayWin exceeds homeWin when λ_home ≥ λ_away');
    }
  }

  return { valid: warnings.length === 0, warnings };
}

export function runAllValidations(
  lambdaHome: number,
  lambdaAway: number,
  matrix: ScoreEntry[],
  oneX2: OneX2Result,
): ConsistencyReport {
  if (!isDev()) return { valid: true, warnings: [] };

  const allWarnings: string[] = [];

  const checks = [
    validateLambdaRange(lambdaHome, 'home'),
    validateLambdaRange(lambdaAway, 'away'),
    validateScoreDistSum(matrix),
    validate1X2FromScoreDist(matrix, oneX2),
    validateBehavioralConstraints(matrix, lambdaHome, lambdaAway),
  ];

  for (const check of checks) {
    allWarnings.push(...check.warnings);
  }

  if (allWarnings.length > 0) {
    console.warn('[ConsistencyValidator]', allWarnings.join('; '));
  }

  return { valid: allWarnings.length === 0, warnings: allWarnings };
}
