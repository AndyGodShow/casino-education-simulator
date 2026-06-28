import { describe, expect, it } from 'vitest';
import { groups } from '../data/groups';
import { fixtures } from '../data/fixtures';
import { teams } from '../data/teams';
import {
  calculateGroupStandings,
  rankGroupTeams,
  rankThirdPlacedTeams,
  sampleScoreFromDistribution,
  simulateManyTournaments,
  simulateOneTournament,
} from './groupSimulation';
import type { WorldCupMatch } from '../types';

const teamRecord = Object.fromEntries(teams.map((team) => [team.id, team]));

const match = (id: string, homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number): WorldCupMatch => ({
  id,
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId,
  awayTeamId,
  kickoff: '2026-06-11T00:00:00.000Z',
  status: 'finished',
  homeScore,
  awayScore,
  source: 'local',
  lastUpdated: '2026-06-18T00:00:00.000Z',
});

describe('groupSimulation', () => {
  it('samples scores from cumulative score distribution buckets', () => {
    const matrix = [
      { home: 0, away: 0, probability: 0.2 },
      { home: 1, away: 0, probability: 0.3 },
      { home: 2, away: 1, probability: 0.5 },
    ];

    expect(sampleScoreFromDistribution(matrix, 0.19)).toEqual([0, 0]);
    expect(sampleScoreFromDistribution(matrix, 0.20)).toEqual([1, 0]);
    expect(sampleScoreFromDistribution(matrix, 0.99)).toEqual([2, 1]);
  });

  it('calculates and ranks standings', () => {
    const standings = calculateGroupStandings([
      match('1', 'a', 'b', 2, 0),
      match('2', 'a', 'c', 1, 1),
    ]);
    const ranked = rankGroupTeams(standings);
    expect(ranked[0].teamId).toBe('a');
    expect(ranked[0].points).toBe(4);
    expect(rankThirdPlacedTeams(standings)).toHaveLength(3);
  });

  it('returns stable qualification structure', () => {
    const result = simulateManyTournaments({ iterations: 10, matches: fixtures, teams: teamRecord });
    expect(result).toHaveLength(48);
    result.forEach((row) => {
      expect(row.qualified + row.eliminated).toBeCloseTo(1, 6);
      expect(row.confidenceInterval.lower).toBeGreaterThanOrEqual(0);
      expect(row.confidenceInterval.upper).toBeLessThanOrEqual(1);
      expect(row.truth.level).toBe('local_seed');
    });
  });

  it('models the 2026 group structure and eight best third-placed qualifiers', () => {
    expect(groups).toHaveLength(12);
    groups.forEach((group) => {
      expect(fixtures.filter((fixture) => fixture.group === group)).toHaveLength(6);
    });
    const tournament = simulateOneTournament(1, fixtures, teamRecord);
    expect(tournament.groupResults).toHaveLength(12);
    expect(tournament.qualified).toHaveLength(32);
    const directQualifiers = Array.from(tournament.groupResults.values()).flatMap((standings) => standings.slice(0, 2));
    expect(directQualifiers).toHaveLength(24);
  });

  it('preserves verified scores for finished matches while simulating unresolved matches', () => {
    const finished = match('finished', 'france', 'jordan', 4, 0);
    const scheduled: WorldCupMatch = {
      ...match('scheduled', 'argentina', 'saudi-arabia', 0, 0),
      status: 'scheduled',
      homeScore: undefined,
      awayScore: undefined,
    };

    const tournament = simulateOneTournament(1, [finished, scheduled], teamRecord);

    expect(tournament.matches[0]).toEqual(expect.objectContaining({
      id: 'finished',
      homeScore: 4,
      awayScore: 0,
    }));
    expect(tournament.matches[1].status).toBe('finished');
    expect(typeof tournament.matches[1].homeScore).toBe('number');
    expect(typeof tournament.matches[1].awayScore).toBe('number');
  });

  it('keeps probabilities in range even with invalid iteration input', () => {
    const result = simulateManyTournaments({ iterations: 0, matches: fixtures, teams: teamRecord });
    result.forEach((row) => {
      expect(row.qualified).toBeGreaterThanOrEqual(0);
      expect(row.qualified).toBeLessThanOrEqual(1);
      expect(row.qualified + row.eliminated).toBeCloseTo(1, 6);
    });
  });

  it('reduces simulation confidence when truth weighting is enabled', () => {
    const weighted = simulateManyTournaments({ iterations: 5, truthLevelWeighting: true, matches: fixtures, teams: teamRecord })[0];
    const unweighted = simulateManyTournaments({ iterations: 5, truthLevelWeighting: false, matches: fixtures, teams: teamRecord })[0];
    expect(weighted.weightedConfidence).toBeLessThan(unweighted.weightedConfidence);
    expect(weighted.warning).toContain('Local seed');
  });
});
