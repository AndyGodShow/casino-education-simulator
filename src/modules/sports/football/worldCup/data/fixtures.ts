import type { WorldCupMatch } from '../types';
import { groups, groupTeams } from './groups';

const pairings: Array<[number, number]> = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];

export const fixtures: WorldCupMatch[] = groups.flatMap((group, groupIndex) => {
  const ids = groupTeams[group];
  return pairings.map(([homeIndex, awayIndex], matchIndex) => ({
    id: `${group.toLowerCase()}-${matchIndex + 1}`,
    competitionId: 'world-cup-2026',
    stage: 'group',
    group,
    homeTeamId: ids[homeIndex],
    awayTeamId: ids[awayIndex],
    kickoff: new Date(Date.UTC(2026, 5, 11 + groupIndex + Math.floor(matchIndex / 2), 18 + (matchIndex % 2) * 3)).toISOString(),
    venue: 'Sample venue',
    city: 'Sample city',
    status: 'scheduled',
    source: 'local',
    lastUpdated: '2026-06-18T00:00:00.000Z',
  }));
});
