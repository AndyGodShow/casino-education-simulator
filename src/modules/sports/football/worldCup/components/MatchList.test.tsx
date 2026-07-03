import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorldCupMatch } from '../types';
import { MatchList } from './MatchList';

const groupMatches: WorldCupMatch[] = Array.from({ length: 12 }, (_, index) => ({
  id: `group-${index}`,
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: `group-home-${index}`,
  awayTeamId: `group-away-${index}`,
  kickoff: `2026-06-${String(12 + index).padStart(2, '0')}T12:00:00.000Z`,
  status: 'finished',
  homeScore: 1,
  awayScore: 0,
  source: 'openfootball',
  lastUpdated: '2026-07-01T00:00:00.000Z',
}));

describe('WorldCup MatchList', () => {
  it('puts the active knockout schedule ahead of completed group matches', () => {
    const knockoutMatch: WorldCupMatch = {
      id: 'round32-current',
      competitionId: 'world-cup-2026',
      stage: 'round32',
      homeTeamId: 'england',
      awayTeamId: 'dr-congo',
      kickoff: '2026-07-01T16:00:00.000Z',
      status: 'scheduled',
      source: 'openfootball',
      lastUpdated: '2026-07-01T00:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      <MatchList
        matches={[...groupMatches, knockoutMatch]}
        getTeamName={(teamId) => teamId}
        getPrediction={() => undefined}
        onSelectMatch={() => undefined}
      />,
    );

    expect(html).toContain('england vs dr-congo');
    expect(html).toContain('32 强');
  });
});
