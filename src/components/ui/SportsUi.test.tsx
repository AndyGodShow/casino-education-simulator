import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExpandablePanel } from './ExpandablePanel';
import { MatchCard } from './MatchCard';
import { ProbabilityBar } from './ProbabilityBar';
import { TrustBadge } from './TrustBadge';

describe('sports UI components', () => {
  it('renders MatchCard with teams, probability bars, and trust state', () => {
    const html = renderToStaticMarkup(
      <MatchCard
        homeTeam="加拿大"
        awayTeam="墨西哥"
        meta="小组 A"
        modelProbability={{ label: '模型最高项', value: 0.62 }}
        marketProbability={{ label: '市场', value: null }}
        trust={{ level: 'local_seed', confidence: 0.28, description: 'local sample', sourceBreakdown: ['seed'] }}
      />,
    );

    expect(html).toContain('加拿大 vs 墨西哥');
    expect(html).toContain('模型最高项');
    expect(html).toContain('62.0%');
    expect(html).toContain('市场');
    expect(html).toContain('N/A');
    expect(html).toContain('本地模拟数据');
  });

  it('renders TrustBadge state labels', () => {
    const html = renderToStaticMarkup(
      <div>
        <TrustBadge level="live" />
        <TrustBadge level="sample" />
        <TrustBadge level="scaffold" />
        <TrustBadge level="stale" />
      </div>,
    );

    expect(html).toContain('官方实时数据');
    expect(html).toContain('示例数据');
    expect(html).toContain('分散数据源');
    expect(html).toContain('已过期数据');
  });

  it('keeps ProbabilityBar values and variants consistent', () => {
    const html = renderToStaticMarkup(
      <div>
        <ProbabilityBar label="模型" value={0.42} variant="model" />
        <ProbabilityBar label="市场" value={0.31} variant="market" />
        <ProbabilityBar label="融合" value={0.5} variant="merged" />
      </div>,
    );

    expect(html).toContain('data-variant="model"');
    expect(html).toContain('42.0%');
    expect(html).toContain('data-variant="market"');
    expect(html).toContain('31.0%');
    expect(html).toContain('data-variant="merged"');
    expect(html).toContain('50.0%');
  });

  it('renders ExpandablePanel closed by default and open when requested', () => {
    const closed = renderToStaticMarkup(<ExpandablePanel title="模型解释">隐藏详情</ExpandablePanel>);
    const open = renderToStaticMarkup(<ExpandablePanel title="模拟摘要" defaultOpen>可见详情</ExpandablePanel>);

    expect(closed).toContain('<details');
    expect(closed).not.toContain('<details open=""');
    expect(open).toContain('open=""');
  });
});
