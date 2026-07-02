import { describe, expect, it } from 'vitest';
import type { StrategyOptimizationSample } from './walkForwardOptimizer';
import {
  buildStrategyScenarioContext,
  optimizeWorldCupStrategy,
  predictStrategyCandidate,
} from './walkForwardOptimizer';

const samples = (
  count: number,
  outcomeFor: (index: number) => StrategyOptimizationSample['outcome'],
): StrategyOptimizationSample[] => Array.from({ length: count }, (_, index) => ({
  matchId: `match-${index + 1}`,
  date: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10),
  context: index % 2 === 0 ? 'FIFA World Cup' : 'Continental Championship',
  neutral: true,
  homeElo: index % 2 === 0 ? 1750 : 1250,
  awayElo: index % 2 === 0 ? 1250 : 1750,
  outcome: outcomeFor(index),
}));

describe('optimizeWorldCupStrategy', () => {
  it('blocks tuning below chronological evidence thresholds', () => {
    const report = optimizeWorldCupStrategy(samples(120, (index) => index % 2 === 0 ? 'home' : 'away'));

    expect(report.status).toBe('insufficient_evidence');
    expect(report.applied).toBe(false);
    expect(report.holdout.sampleSize).toBe(0);
  });

  it('keeps selection and holdout windows strictly chronological', () => {
    const report = optimizeWorldCupStrategy(samples(240, (index) => index % 2 === 0 ? 'home' : 'away'));

    expect(report.splits.training.to < report.splits.validation.from).toBe(true);
    expect(report.splits.validation.to < report.splits.holdout.from).toBe(true);
    expect(report.validation.sampleSize).toBe(60);
    expect(report.holdout.sampleSize).toBe(60);
  });

  it('applies a candidate only after out-of-sample Brier improvement', () => {
    const report = optimizeWorldCupStrategy(
      samples(240, (index) => index % 2 === 0 ? 'home' : 'away'),
      {
        candidates: [
          { id: 'sharp', eloScale: 180, drawBase: 0.08, drawCloseness: 0.08 },
          { id: 'soft', eloScale: 700, drawBase: 0.25, drawCloseness: 0.18 },
        ],
        baseline: { id: 'baseline', eloScale: 700, drawBase: 0.25, drawCloseness: 0.18 },
      },
    );

    expect(report.selectedCandidate.id).toBe('sharp');
    expect(report.status).toBe('applied');
    expect(report.applied).toBe(true);
    expect(report.holdout.brierImprovement).toBeGreaterThanOrEqual(0.01);
    expect(report.holdout.contexts).toBe(2);
  });

  it('does not let holdout outcomes change candidate selection', () => {
    const base = samples(240, (index) => index % 2 === 0 ? 'home' : 'away');
    const invertedHoldout = base.map((sample, index) => index < 180 ? sample : {
      ...sample,
      outcome: sample.outcome === 'home' ? 'away' as const : 'home' as const,
    });
    const options = {
      candidates: [
        { id: 'sharp', eloScale: 180, drawBase: 0.08, drawCloseness: 0.08 },
        { id: 'soft', eloScale: 700, drawBase: 0.25, drawCloseness: 0.18 },
      ],
      baseline: { id: 'baseline', eloScale: 700, drawBase: 0.25, drawCloseness: 0.18 },
    };

    expect(optimizeWorldCupStrategy(base, options).selectedCandidate.id)
      .toBe(optimizeWorldCupStrategy(invertedHoldout, options).selectedCandidate.id);
  });

  it('produces normalized deterministic probabilities', () => {
    const candidate = { id: 'test', eloScale: 400, drawBase: 0.2, drawCloseness: 0.15 };
    const sample = samples(1, () => 'home')[0];
    const first = predictStrategyCandidate(sample, candidate);
    const second = predictStrategyCandidate(sample, candidate);

    expect(first).toEqual(second);
    expect(first.home + first.draw + first.away).toBeCloseTo(1, 12);
    expect(first.home).toBeGreaterThan(first.away);
  });

  it('builds scenario coverage only from information known before kickoff', () => {
    expect(buildStrategyScenarioContext({
      tournament: 'FIFA World Cup',
      neutral: true,
      homeElo: 1750,
      awayElo: 1250,
    })).toBe('FIFA World Cup|neutral|mismatch');
    expect(buildStrategyScenarioContext({
      tournament: 'Friendly',
      neutral: false,
      homeElo: 1505,
      awayElo: 1500,
    })).toBe('Friendly|home-context|close');
  });
});
