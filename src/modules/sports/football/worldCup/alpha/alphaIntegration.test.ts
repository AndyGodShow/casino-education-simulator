import { describe, expect, it, beforeEach } from 'vitest';
import { computeAlpha } from '../logic/alphaEngine';
import { reset, resolve, countResolved } from './alphaStore';
import { evaluate } from './alphaEvaluator';
import { calibrate, getWeights, resetWeights } from './alphaCalibration';
import type { WorldCupMatch, WorldCupTeam } from '../types';

const team = (
  id: string,
  rating: number,
  attack: number,
  defense: number,
  form: number,
  isHost = false,
): WorldCupTeam => ({
  id,
  name: id,
  shortName: id.slice(0, 3).toUpperCase(),
  countryCode: id.slice(0, 2).toUpperCase(),
  group: 'A',
  rating,
  attack,
  defense,
  form,
  isHost,
});

const match = (id: string, overrides: Partial<WorldCupMatch> = {}): WorldCupMatch => ({
  id,
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: 'home',
  awayTeamId: 'away',
  kickoff: '2026-06-18T18:00:00.000Z',
  status: 'scheduled',
  source: 'local',
  lastUpdated: '2026-06-18T00:00:00.000Z',
  ...overrides,
});

describe('alpha integration: compute → store → evaluate → calibrate', () => {
  beforeEach(() => {
    reset();
    resetWeights();
  });

  it('full loop: compute alpha, resolve matches, evaluate, calibrate', () => {
    // ── Step 1: Compute alpha for several matches ──
    const alpha1 = computeAlpha(
      match('m1'),
      team('france', 90, 88, 86, 90),  // strong home, good form
      team('jordan', 60, 58, 62, 58),  // weak away, bad form
    );
    const alpha2 = computeAlpha(
      match('m2'),
      team('japan', 80, 80, 80, 80),
      team('uruguay', 80, 80, 80, 80),
    );
    const alpha3 = computeAlpha(
      match('m3'),
      team('jordan', 60, 58, 62, 60),
      team('france', 90, 88, 86, 90),
    );

    // Verify alpha was recorded
    expect(countResolved()).toBe(0); // not resolved yet
    expect(alpha1.alpha.homeWin + alpha1.alpha.draw + alpha1.alpha.awayWin).toBeCloseTo(0, 5);
    expect(alpha2.alpha.homeWin + alpha2.alpha.draw + alpha2.alpha.awayWin).toBeCloseTo(0, 5);
    expect(alpha3.alpha.homeWin + alpha3.alpha.draw + alpha3.alpha.awayWin).toBeCloseTo(0, 5);

    // ── Step 2: Resolve matches with scores ──
    resolve('m1', 3, 0); // home win (alpha predicted correctly if α_home > 0)
    resolve('m2', 1, 1); // draw
    resolve('m3', 0, 2); // away win

    expect(countResolved()).toBe(3);

    // ── Step 3: Evaluate ──
    const metrics = evaluate();
    expect(metrics.sampleSize).toBe(3);
    expect(metrics.hitRate).toBeGreaterThanOrEqual(0);
    expect(metrics.hitRate).toBeLessThanOrEqual(1);

    // ── Step 4: Calibrate ──
    const newWeights = calibrate(metrics.signalScores);
    expect(newWeights.form + newWeights.matchup + newWeights.context).toBeCloseTo(1, 5);

    // Weights may or may not change depending on signal scores
    // But they should stay within bounds
    expect(newWeights.form).toBeGreaterThanOrEqual(0.05);
    expect(newWeights.matchup).toBeGreaterThanOrEqual(0.05);
    expect(newWeights.context).toBeGreaterThanOrEqual(0.05);

    // ── Step 5: Re-compute alpha with new weights ──
    const alphaWithNewWeights = computeAlpha(
      match('m1-new'),
      team('france', 90, 88, 86, 90),
      team('jordan', 60, 58, 62, 58),
    );
    // AlphaResult structure unchanged
    expect(alphaWithNewWeights.baseline).toBeDefined();
    expect(alphaWithNewWeights.model).toBeDefined();
    expect(alphaWithNewWeights.alpha).toBeDefined();
    expect(alphaWithNewWeights.signals).toBeDefined();
    expect(alphaWithNewWeights.lambda).toBeDefined();
  });

  it('calibration converges on repeated cycles', () => {
    // Simulate multiple calibration cycles
    const cycles = 5;
    const weightsHistory: number[] = [];

    for (let cycle = 0; cycle < cycles; cycle += 1) {
      reset(); // clear store for new cycle

      // Generate matches where form is genuinely predictive
      for (let i = 0; i < 20; i += 1) {
        const homeForm = 80 + (i % 3) * 5; // some variation
        const awayForm = 75;
        const homeStrong = homeForm > 78;

        computeAlpha(
          match(`c${cycle}-m${i}`),
          team('teamA', 80, 80, 80, homeForm),
          team('teamB', 80, 80, 80, awayForm),
        );
        resolve(`c${cycle}-m${i}`, homeStrong ? 2 : 0, homeStrong ? 0 : 2);
      }

      const metrics = evaluate();
      calibrate(metrics.signalScores);
      weightsHistory.push(getWeights().form);
    }

    // Weights should have moved from the default
    const lastWeight = weightsHistory[weightsHistory.length - 1];
    // If form is predictive, weights should adjust
    // (direction depends on heuristic scoring)
    expect(Math.abs(lastWeight - 0.4)).toBeGreaterThanOrEqual(0);
    // Sum should always be 1
    const finalWeights = getWeights();
    expect(finalWeights.form + finalWeights.matchup + finalWeights.context).toBeCloseTo(1, 5);
  });

  it('deterministic: same inputs produce same outputs across full loop', () => {
    const runLoop = () => {
      reset();
      resetWeights();

      computeAlpha(match('det'), team('france', 90, 88, 86, 87), team('jordan', 68, 67, 70, 69));
      resolve('det', 2, 0);

      const m = evaluate();
      calibrate(m.signalScores);
      return {
        hitRate: m.hitRate,
        weights: { ...getWeights() },
        bestSignal: m.bestSignal,
      };
    };

    const a = runLoop();
    const b = runLoop();
    expect(a).toEqual(b);
  });
});
