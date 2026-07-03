import { describe, expect, it, beforeEach } from 'vitest';
import { generateReport, formatCalibrationReport, logCalibrationReport } from './calibrationSummary';
import { resolve, reset } from '../alpha/alphaStore';
import { computeAlpha } from '../logic/alphaEngine';
import type { WorldCupMatch, WorldCupTeam } from '../types';
import type { PredictionResult } from '../logic/scoring';

const team = (
  id: string,
  rating: number,
  attack: number,
  defense: number,
  form: number,
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
});

const match = (id: string): WorldCupMatch => ({
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
});

describe('calibrationSummary', () => {
  beforeEach(() => reset());

  it('generates complete report with grade', () => {
    // Create prediction results
    const results: PredictionResult[] = [];
    for (let i = 0; i < 10; i += 1) {
      results.push({
        probabilities: { home: 0.55, draw: 0.25, away: 0.20 },
        outcome: i < 6 ? 'home' : 'away',
      });
    }

    const report = generateReport({ results });
    expect(report.grade).toBeDefined();
    expect(['A', 'B', 'C', 'D', 'F']).toContain(report.grade);
    expect(report.outcome.sampleSize).toBe(10);
    expect(report.outcome.brierScore).toBeGreaterThan(0);
    expect(report.generatedAt).toBeDefined();
  });

  it('includes market alignment when odds provided', () => {
    const results: PredictionResult[] = [
      { probabilities: { home: 0.55, draw: 0.25, away: 0.20 }, outcome: 'home' },
      { probabilities: { home: 0.50, draw: 0.28, away: 0.22 }, outcome: 'draw' },
    ];
    const odds = [
      { home: 1.8, draw: 3.5, away: 4.5 },
      { home: 2.0, draw: 3.2, away: 3.8 },
    ];

    const report = generateReport({ results, marketOdds: odds });
    expect(report.market).toBeDefined();
    expect(report.market!.sampleCount).toBe(2);
    expect(report.market!.avgTotalDisagreement).toBeGreaterThanOrEqual(0);
  });

  it('handles null/missing odds gracefully', () => {
    const results: PredictionResult[] = [
      { probabilities: { home: 0.55, draw: 0.25, away: 0.20 }, outcome: 'home' },
    ];
    const odds = [null];

    const report = generateReport({ results, marketOdds: odds });
    expect(report.market).toBeUndefined(); // no valid odds entries
  });

  it('integrates with alpha pipeline', () => {
    // Compute alpha → records in store → calibrate
    for (let i = 0; i < 5; i += 1) {
      computeAlpha(
        match(`m${i}`),
        team('france', 90, 88, 86, 87),
        team('jordan', 68, 67, 70, 69),
      );
      resolve(`m${i}`, i < 4 ? 2 : 0, i < 4 ? 0 : 1); // mostly home wins
    }

    const results: PredictionResult[] = [
      { probabilities: { home: 0.70, draw: 0.18, away: 0.12 }, outcome: 'home' },
      { probabilities: { home: 0.70, draw: 0.18, away: 0.12 }, outcome: 'home' },
      { probabilities: { home: 0.70, draw: 0.18, away: 0.12 }, outcome: 'home' },
      { probabilities: { home: 0.70, draw: 0.18, away: 0.12 }, outcome: 'home' },
      { probabilities: { home: 0.70, draw: 0.18, away: 0.12 }, outcome: 'draw' },
    ];

    const report = generateReport({ results });
    expect(report.alpha.sampleSize).toBe(5);
    expect(report.alphaPersistence.totalMatches).toBe(5);
  });

  it('formatCalibrationReport produces readable output', () => {
    const results: PredictionResult[] = [
      { probabilities: { home: 0.55, draw: 0.25, away: 0.20 }, outcome: 'home' },
    ];
    const report = generateReport({ results });
    const formatted = formatCalibrationReport(report);
    expect(formatted).toContain('Calibration');
    expect(formatted).toContain('Grade');
    expect(formatted).toContain('Brier');
    expect(formatted).toContain('Alpha');
  });

  it('logCalibrationReport does not throw', () => {
    const results: PredictionResult[] = [
      { probabilities: { home: 0.55, draw: 0.25, away: 0.20 }, outcome: 'home' },
    ];
    const report = generateReport({ results });
    expect(() => logCalibrationReport(report)).not.toThrow();
  });

  it('well-calibrated model has low Brier and valid alpha metrics', () => {
    // Seed alpha data
    for (let i = 0; i < 20; i += 1) {
      computeAlpha(
        match(`ga${i}`),
        team('france', 90, 88, 86, 87),
        team('jordan', 68, 67, 70, 69),
      );
      resolve(`ga${i}`, i < 16 ? 2 : 0, i < 16 ? 0 : 2);
    }

    // Well-calibrated predictions
    const results: PredictionResult[] = [];
    for (let i = 0; i < 100; i += 1) {
      results.push({
        probabilities: { home: 0.78, draw: 0.14, away: 0.08 },
        outcome: i < 78 ? 'home' : i < 92 ? 'draw' : 'away',
      });
    }
    const report = generateReport({ results });

    // Core calibration metrics
    expect(report.outcome.brierScore).toBeLessThan(report.outcome.brierReference);
    expect(report.outcome.sampleSize).toBe(100);
    expect(report.alpha.sampleSize).toBe(20);
    expect(report.alpha.hitRate).toBeGreaterThanOrEqual(0);
    expect(report.alpha.hitRate).toBeLessThanOrEqual(1);
    // Structure checks
    expect(report.grade).toBeDefined();
    expect(report.generatedAt).toBeDefined();
    expect(report.outcome.calibrationCurve.length).toBeGreaterThan(0);
  });
});
