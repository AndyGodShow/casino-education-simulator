import { describe, expect, it } from 'vitest';
import { actualOutcomeFromMatch, outcomeFromScore } from './matchOutcome';
import type { WorldCupMatch } from '../types';

const match: WorldCupMatch = {
  id: 'outcome-test',
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: 'home',
  awayTeamId: 'away',
  kickoff: '2026-06-18T18:00:00.000Z',
  status: 'finished',
  source: 'official',
  lastUpdated: '2026-06-18T22:00:00.000Z',
};

describe('matchOutcome', () => {
  it('derives outcome from explicit scores', () => {
    expect(outcomeFromScore(2, 1)).toBe('home');
    expect(outcomeFromScore(1, 1)).toBe('draw');
    expect(outcomeFromScore(0, 2)).toBe('away');
  });

  it('only derives actual match outcome for finished matches with numeric scores', () => {
    expect(actualOutcomeFromMatch({ ...match, homeScore: 2, awayScore: 1 })).toBe('home');
    expect(actualOutcomeFromMatch({ ...match, status: 'scheduled', homeScore: 2, awayScore: 1 })).toBeNull();
    expect(actualOutcomeFromMatch({ ...match, homeScore: 2 })).toBeNull();
  });
});
