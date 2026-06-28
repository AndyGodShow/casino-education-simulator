import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorldCupMatch } from '../types';
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
  it('shows only the real final score boundary for finished matches', () => {
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
    expect(html).toContain('模型预测已隐藏');
    expect(html).not.toContain('概率倾向');
    expect(html).not.toContain('模型倾向');
    expect(html).not.toContain('市场参考');
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
