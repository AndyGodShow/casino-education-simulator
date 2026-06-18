import { describe, expect, it } from 'vitest';
import { predictMatch } from './predictionEngine';
import type { WorldCupMatch, WorldCupTeam } from '../types';

const getPrediction = (homeId = 'france', awayId = 'jordan') => {
  const match = { ...baseMatch, id: 'test', homeTeamId: homeId, awayTeamId: awayId };
  const home = teamById[homeId];
  const away = teamById[awayId];
  return predictMatch(match, home, away);
};

const baseMatch: WorldCupMatch = {
  id: 'base',
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: 'france',
  awayTeamId: 'jordan',
  kickoff: '2026-06-18T18:00:00.000Z',
  status: 'scheduled',
  source: 'local',
  lastUpdated: '2026-06-18T00:00:00.000Z',
};

const team = (id: string, rating: number, attack: number, defense: number, form: number, isHost = false): WorldCupTeam => ({
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

const teamById: Record<string, WorldCupTeam> = {
  france: team('france', 90, 88, 86, 87),
  jordan: team('jordan', 68, 67, 70, 69),
  japan: team('japan', 80, 79, 78, 80),
  uruguay: team('uruguay', 84, 83, 82, 81),
};

describe('predictionEngine', () => {
  it('normalizes legal non-NaN probabilities', () => {
    const prediction = getPrediction();
    const probabilities = [prediction.probabilities.homeWin, prediction.probabilities.draw, prediction.probabilities.awayWin];
    expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 4);
    probabilities.forEach((value) => {
      expect(Number.isNaN(value)).toBe(false);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
  });

  it('keeps upset probability alive for mismatches', () => {
    expect(getPrediction('france', 'jordan').probabilities.awayWin).toBeGreaterThan(0.03);
  });

  it('applies host boost', () => {
    const match = { ...baseMatch, id: 'host-test', homeTeamId: 'japan', awayTeamId: 'uruguay' };
    const home = teamById.japan;
    const away = teamById.uruguay;
    const hosted = predictMatch(match, { ...home, isHost: true }, away).probabilities.homeWin;
    const neutral = predictMatch(match, { ...home, isHost: false }, away).probabilities.homeWin;
    expect(hosted).toBeGreaterThan(neutral);
  });

  it('handles equal strength and missing form safely', () => {
    const match = { ...baseMatch, id: 'equal-test' };
    const home = { ...teamById.japan, rating: 80, attack: 80, defense: 80, form: Number.NaN };
    const away = { ...teamById.uruguay, rating: 80, attack: 80, defense: 80, form: 80 };
    const prediction = predictMatch(match, home, away);
    expect(prediction.probabilities.homeWin + prediction.probabilities.draw + prediction.probabilities.awayWin).toBeCloseTo(1, 4);
    expect(prediction.expectedGoals.home).toBeGreaterThan(0);
    expect(prediction.expectedGoals.away).toBeGreaterThan(0);
  });

  it('emits trust metadata and unified model probability', () => {
    const prediction = getPrediction();
    expect(prediction.truth.level).toBe('local_seed');
    expect(prediction.unifiedProbability.model.source).toBe('model');
    expect(prediction.unifiedProbability.model.home + prediction.unifiedProbability.model.draw + prediction.unifiedProbability.model.away).toBeCloseTo(1, 6);
  });

  it('emits deterministic Prediction V2 explanation output', () => {
    const first = getPrediction();
    const second = getPrediction();

    expect(first).toEqual(second);
    expect(first.modelVersion).toBe('v2');
    expect(first.scoreDistribution.length).toBeGreaterThan(0);
    expect(first.scoreDistribution[0].score).toMatch(/^\d+-\d+$/);
    expect(first.confidence).toBeGreaterThanOrEqual(0);
    expect(first.confidence).toBeLessThanOrEqual(1);
    expect(first.decisionLayer).toBeDefined();
    expect(first.decisionLayer.expectedGoals.home).toBe(first.expectedGoals.home);
    expect(first.decisionLayer.oneX2.homeWin + first.decisionLayer.oneX2.draw + first.decisionLayer.oneX2.awayWin).toBeCloseTo(1, 5);
    expect(first.explanation.summary).toContain('Poisson V2');
    expect(first.explanation.factors.map((factor) => factor.name)).toEqual([
      'Structured expected goals (λ)',
      'Team strength gap',
      'Form factor',
      'Match context',
    ]);
  });
});
