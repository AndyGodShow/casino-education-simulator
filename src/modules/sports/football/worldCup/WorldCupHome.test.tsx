import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorldCupHome } from './WorldCupHome';

describe('WorldCupHome', () => {
  it('smoke renders the match center structure', () => {
    const html = renderToStaticMarkup(<WorldCupHome onBackToFootball={() => undefined} />);

    expect(html).toContain('世界杯比赛中心');
    expect(html).toContain('预测线路审计');
    expect(html).toContain('比赛列表');
    expect(html).toContain('正在加载比赛详情');
  });
});
