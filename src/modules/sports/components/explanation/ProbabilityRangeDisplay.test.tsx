import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProbabilityRangeDisplay } from './ProbabilityRangeDisplay';
import { createUnifiedProbability } from '../../../core/probability/unifiedProbability';

describe('ProbabilityRangeDisplay', () => {
  const unified = createUnifiedProbability({
    matchId: 'a-1',
    model: { home: 0.55, draw: 0.25, away: 0.20 },
  });

  it('renders model range with high confidence (±3%)', () => {
    const html = renderToStaticMarkup(
      <ProbabilityRangeDisplay
        unifiedProbability={unified}
        confidence="high"
        uncertaintyAdjustment={null}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    expect(html).toContain('模型');
    // 55 ± 3 = 52% ~ 58%
    expect(html).toContain('52.0%');
    expect(html).toContain('58.0%');
  });

  it('widens range for low confidence (±10%)', () => {
    const html = renderToStaticMarkup(
      <ProbabilityRangeDisplay
        unifiedProbability={unified}
        confidence="low"
        uncertaintyAdjustment={null}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    // 55 ± 10 = 45% ~ 65%
    expect(html).toContain('45.0%');
    expect(html).toContain('65.0%');
  });

  it('renders medium confidence with ±6% half range', () => {
    const html = renderToStaticMarkup(
      <ProbabilityRangeDisplay
        unifiedProbability={unified}
        confidence="medium"
        uncertaintyAdjustment={null}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    // 55 ± 6 = 49% ~ 61%
    expect(html).toContain('49.0%');
    expect(html).toContain('61.0%');
  });

  it('shows fallback when no market data', () => {
    const html = renderToStaticMarkup(
      <ProbabilityRangeDisplay
        unifiedProbability={unified}
        confidence="high"
        uncertaintyAdjustment={null}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    expect(html).toContain('无市场数据');
  });

  it('renders market range when market data exists', () => {
    const withMarket = createUnifiedProbability({
      matchId: 'a-1',
      model: { home: 0.55, draw: 0.25, away: 0.20 },
      market: { home: 0.48, draw: 0.28, away: 0.24 },
      marketConfidence: 0.5,
    });
    const html = renderToStaticMarkup(
      <ProbabilityRangeDisplay
        unifiedProbability={withMarket}
        confidence="high"
        uncertaintyAdjustment={null}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    expect(html).toContain('市场');
    expect(html).toContain('40.0%'); // 48 - 8
    expect(html).toContain('56.0%'); // 48 + 8
  });

  it('renders team names in summary row', () => {
    const html = renderToStaticMarkup(
      <ProbabilityRangeDisplay
        unifiedProbability={unified}
        confidence="high"
        uncertaintyAdjustment={null}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    expect(html).toContain('巴西');
    expect(html).toContain('阿根廷');
    expect(html).toContain('平局');
  });

  it('widens range when uncertainty adjustment is provided', () => {
    const html = renderToStaticMarkup(
      <ProbabilityRangeDisplay
        unifiedProbability={unified}
        confidence="high"
        uncertaintyAdjustment={0.5}
        homeTeamName="巴西"
        awayTeamName="阿根廷"
      />
    );
    // 55 ± 3*(1+0.5) = 55 ± 4.5 = 50.5% ~ 59.5%
    expect(html).toContain('50.5%');
    expect(html).toContain('59.5%');
  });
});
