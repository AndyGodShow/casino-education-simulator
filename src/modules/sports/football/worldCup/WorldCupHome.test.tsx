import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorldCupAdapterResult } from '../../../../dataProviders/football/worldCupAdapter';
import { buildWorldCupDomain } from './domain/buildWorldCupDomain';
import { WorldCupHome } from './WorldCupHome';

const hookMocks = vi.hoisted(() => ({
  useWorldCupDomain: vi.fn(),
}));

vi.mock('./hooks/useWorldCupDomain', () => ({
  useWorldCupDomain: hookMocks.useWorldCupDomain,
}));

const emptyAdapterResult: WorldCupAdapterResult = {
  matches: [],
  teams: {},
  source: 'local',
  providerName: 'Local',
  errors: [],
  meta: {
    totalMatches: 0,
    statusBreakdown: { scheduled: 0, live: 0, finished: 0 },
  },
};

const finishedAdapterResult: WorldCupAdapterResult = {
  matches: [
    {
      id: 'finished-match',
      competitionId: 'world-cup-2026',
      stage: 'group',
      group: 'A',
      homeTeamId: 'canada',
      awayTeamId: 'mexico',
      kickoff: '2026-06-12T00:00:00.000Z',
      status: 'finished',
      homeScore: 2,
      awayScore: 1,
      source: 'official',
      lastUpdated: '2026-06-12T02:00:00.000Z',
    },
  ],
  teams: {
    canada: {
      id: 'canada',
      name: '加拿大',
      shortName: 'CAN',
      countryCode: 'CA',
      group: 'A',
      rating: 78,
      attack: 77,
      defense: 76,
      form: 78,
    },
    mexico: {
      id: 'mexico',
      name: '墨西哥',
      shortName: 'MEX',
      countryCode: 'MX',
      group: 'A',
      rating: 82,
      attack: 81,
      defense: 80,
      form: 82,
    },
  },
  source: 'official',
  providerName: 'Official',
  errors: [],
  meta: {
    totalMatches: 1,
    statusBreakdown: { scheduled: 0, live: 0, finished: 1 },
  },
};

describe('WorldCupHome', () => {
  beforeEach(() => {
    hookMocks.useWorldCupDomain.mockReturnValue(buildWorldCupDomain(emptyAdapterResult));
  });

  it('smoke renders the match center structure', () => {
    const html = renderToStaticMarkup(<WorldCupHome onBackToFootball={() => undefined} />);

    expect(html).toContain('世界杯比赛中心');
    expect(html).toContain('预测线路审计');
    expect(html).toContain('比赛列表');
    expect(html).toContain('正在加载比赛详情');
  });

  it('shows the final score panel instead of prediction insight for finished matches', () => {
    hookMocks.useWorldCupDomain.mockReturnValue(buildWorldCupDomain(finishedAdapterResult));

    const html = renderToStaticMarkup(<WorldCupHome onBackToFootball={() => undefined} />);

    expect(html).toContain('加拿大 vs 墨西哥');
    expect(html).toContain('最终比分');
    expect(html).toContain('2 - 1');
    expect(html).toContain('模型预测已隐藏');
    expect(html).not.toContain('模型倾向');
    expect(html).not.toContain('市场参考');
  });
});
