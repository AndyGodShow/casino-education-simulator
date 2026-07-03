import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProbabilityExplanationPanel } from './ProbabilityExplanationPanel';
import { calculateModelMarketDeviation } from '../../football/worldCup/logic/oddsEngine';

const factors = [
  { name: 'Team strength gap', impact: 0.6, description: 'Compares rating strength plus each attack against the opposing defense.' },
  { name: 'Form factor', impact: 0.01, description: 'Uses recent performance ratings when present.' },
  { name: 'Goal expectation model', impact: 0.35, description: 'Transforms expected goals into match outcome probabilities.' },
  { name: 'Match context factor', impact: -0.2, description: 'Applies a bounded host and stage-pressure adjustment.' },
];

const emptyFactors: typeof factors = [];

const deviation = calculateModelMarketDeviation({
  model: { home: 0.55, draw: 0.25, away: 0.20 },
  market: { home: 0.42, draw: 0.30, away: 0.28 },
  odds: { home: 2.4, draw: 3.1, away: 3.6 },
  marketConfidence: 0.4,
});

describe('ProbabilityExplanationPanel', () => {
  it('renders all four model factors with Chinese labels', () => {
    const html = renderToStaticMarkup(
      <ProbabilityExplanationPanel
        factors={factors}
        deviation={deviation}
        hasMarketData={true}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    expect(html).toContain('球队强度差');
    expect(html).toContain('近期状态');
    expect(html).toContain('预期进球模型');
    expect(html).toContain('比赛语境');
  });

  it('renders direction badges for home/away/neutral', () => {
    const html = renderToStaticMarkup(
      <ProbabilityExplanationPanel
        factors={factors}
        deviation={deviation}
        hasMarketData={false}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    expect(html).toContain('巴西');
    expect(html).toContain('阿根廷');
    expect(html).toContain('中性');
  });

  it('renders market explanation section', () => {
    const html = renderToStaticMarkup(
      <ProbabilityExplanationPanel
        factors={factors}
        deviation={deviation}
        hasMarketData={false}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    expect(html).toContain('市场解释');
    expect(html).toContain('当前无实时市场数据');
  });

  it('renders market educational items when hasMarketData is true', () => {
    const html = renderToStaticMarkup(
      <ProbabilityExplanationPanel
        factors={factors}
        deviation={deviation}
        hasMarketData={true}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    expect(html).toContain('流动性影响');
    expect(html).toContain('情绪偏差');
    expect(html).toContain('数据延迟');
    expect(html).toContain('交易深度');
  });

  it('renders delta analysis when deviation is provided (production-aligned: hasMarketData=true)', () => {
    const html = renderToStaticMarkup(
      <ProbabilityExplanationPanel
        factors={factors}
        deviation={deviation}
        hasMarketData={true}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    expect(html).toContain('偏差指数');
    expect(html).toContain('不确定性调整');
    expect(html).toContain('巴西');
    expect(html).toContain('阿根廷');
    expect(html).toContain('平局');
  });

  it('renders fallback when deviation is null', () => {
    const html = renderToStaticMarkup(
      <ProbabilityExplanationPanel
        factors={factors}
        deviation={null}
        hasMarketData={false}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    expect(html).toContain('偏差数据不可用');
  });

  it('renders correct deviation score numeric value', () => {
    expect(deviation.deviationScore).toBeCloseTo(0.26, 2);
    const html = renderToStaticMarkup(
      <ProbabilityExplanationPanel
        factors={factors}
        deviation={deviation}
        hasMarketData={true}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    expect(html).toContain(deviation.deviationScore.toFixed(3));
  });

  it('renders with empty factors array without crashing', () => {
    const html = renderToStaticMarkup(
      <ProbabilityExplanationPanel
        factors={emptyFactors}
        deviation={null}
        hasMarketData={false}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    expect(html).toContain('模型解释');
  });
});
