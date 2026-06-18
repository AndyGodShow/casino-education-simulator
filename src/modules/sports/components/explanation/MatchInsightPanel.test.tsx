import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MatchInsightPanel } from './MatchInsightPanel';
import { predictMatch } from '../../football/worldCup/logic/predictionEngine';
import type { WorldCupMatch, WorldCupTeam } from '../../football/worldCup/types';

const match: WorldCupMatch = {
  id: 'insight-test',
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: 'alpha',
  awayTeamId: 'beta',
  kickoff: '2026-06-18T18:00:00.000Z',
  venue: 'Sample venue',
  status: 'scheduled',
  source: 'local',
  lastUpdated: '2026-06-18T00:00:00.000Z',
};

const homeTeam: WorldCupTeam = {
  id: 'alpha',
  name: 'Alpha',
  shortName: 'ALP',
  countryCode: 'AL',
  group: 'A',
  rating: 84,
  attack: 83,
  defense: 82,
  form: 81,
};

const awayTeam: WorldCupTeam = {
  id: 'beta',
  name: 'Beta',
  shortName: 'BET',
  countryCode: 'BE',
  group: 'A',
  rating: 78,
  attack: 77,
  defense: 76,
  form: 78,
};

describe('MatchInsightPanel', () => {
  const prediction = predictMatch(match, homeTeam, awayTeam);
  const teams = { [homeTeam.id]: homeTeam, [awayTeam.id]: awayTeam };

  it('smoke renders all required section headings', () => {
    const html = renderToStaticMarkup(
      <MatchInsightPanel
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        prediction={prediction}
        market={null}
        teams={teams}
      />
    );

    expect(html).toContain('概率概览');
    expect(html).toContain('可信度拆解');
    expect(html).toContain('模型为什么这样预测');
    expect(html).toContain('概率区间');
    expect(html).toContain('模拟结果摘要');
    expect(html).toContain('小组影响');
  });

  it('renders match header with team names', () => {
    const html = renderToStaticMarkup(
      <MatchInsightPanel
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        prediction={prediction}
        market={null}
        teams={teams}
      />
    );
    expect(html).toContain('vs');
  });

  it('renders expected goals and win/draw/loss probabilities', () => {
    const html = renderToStaticMarkup(
      <MatchInsightPanel
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        prediction={prediction}
        market={null}
        teams={teams}
      />
    );
    expect(html).toContain('预期进球');
    expect(html).toContain('平局');
    expect(html).toContain('胜');
  });

  it('renders ProbabilityBar components', () => {
    const html = renderToStaticMarkup(
      <MatchInsightPanel
        match={match}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        prediction={prediction}
        market={null}
        teams={teams}
      />
    );
    expect(html).toContain('模型');
    expect(html).toContain('市场参考');
    expect(html).toContain('融合概率');
  });
});
