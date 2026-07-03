import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorldCupMatch } from '../types';
import { predictMatch } from '../logic/predictionEngine';
import { FinishedMatchResultPanel } from './FinishedMatchResultPanel';

const finishedMatch: WorldCupMatch = {
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
};

describe('FinishedMatchResultPanel', () => {
  it('shows the final score and an explicit missing-snapshot boundary', () => {
    const html = renderToStaticMarkup(
      <FinishedMatchResultPanel
        match={finishedMatch}
        homeName="加拿大"
        awayName="墨西哥"
      />,
    );

    expect(html).toContain('加拿大 vs 墨西哥');
    expect(html).toContain('最终比分');
    expect(html).toContain('2 - 1');
    expect(html).toContain('暂无赛前预测快照');
    expect(html).not.toContain('概率倾向');
    expect(html).not.toContain('模型倾向');
    expect(html).not.toContain('市场参考');
  });

  it('compares the locked pre-match prediction with the final score', () => {
    const homeTeam = {
      id: 'canada',
      name: '加拿大',
      shortName: 'CAN',
      countryCode: 'CA',
      group: 'A' as const,
      rating: 84,
      attack: 83,
      defense: 82,
      form: 81,
    };
    const awayTeam = {
      id: 'mexico',
      name: '墨西哥',
      shortName: 'MEX',
      countryCode: 'MX',
      group: 'A' as const,
      rating: 76,
      attack: 75,
      defense: 74,
      form: 73,
    };
    const generatedPrediction = predictMatch(finishedMatch, homeTeam, awayTeam);
    const prediction = {
      ...generatedPrediction,
      probabilities: {
        homeWin: 0.6,
        draw: 0.25,
        awayWin: 0.15,
      },
    };
    const html = renderToStaticMarkup(
      <FinishedMatchResultPanel
        match={finishedMatch}
        homeName="加拿大"
        awayName="墨西哥"
        snapshot={{
          matchId: finishedMatch.id,
          homeTeamId: finishedMatch.homeTeamId,
          awayTeamId: finishedMatch.awayTeamId,
          kickoff: finishedMatch.kickoff,
          capturedAt: '2026-06-11T23:59:00.000Z',
          prediction,
        }}
      />,
    );

    expect(html).toContain('赛前预测');
    expect(html).toContain('加拿大胜');
    expect(html).toContain('预测命中');
    expect(html).toContain('最终比分');
    expect(html).toContain('2 - 1');
  });

  it('labels a time-finished match without a verified score as awaiting confirmation', () => {
    const html = renderToStaticMarkup(
      <FinishedMatchResultPanel
        match={{
          ...finishedMatch,
          homeScore: undefined,
          awayScore: undefined,
        }}
        homeName="加拿大"
        awayName="墨西哥"
      />,
    );

    expect(html).toContain('结果待确认');
    expect(html).toContain('比分数据尚未到达');
    expect(html).not.toContain('最终比分');
    expect(html).not.toContain('- - -');
  });
});
