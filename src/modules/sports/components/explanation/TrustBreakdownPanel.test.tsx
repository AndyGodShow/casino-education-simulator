import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorldCupMatch } from '../../football/worldCup/types';
import { TrustBreakdownPanel } from './TrustBreakdownPanel';
import { createDataTrustInfo } from '../../../core/trustLayer/dataTruth';

const match: WorldCupMatch = {
  id: 'a-1',
  competitionId: 'world-cup-2026',
  stage: 'group',
  group: 'A',
  homeTeamId: 'canada',
  awayTeamId: 'mexico',
  kickoff: '2026-06-18T00:00:00.000Z',
  venue: 'Sample venue',
  status: 'scheduled',
  source: 'local',
  lastUpdated: new Date().toISOString(),
};

const truth = createDataTrustInfo('local_seed', 'Local seed data for testing', ['World Cup fixture seed']);

describe('TrustBreakdownPanel', () => {
  it('renders overall trust percentage', () => {
    const html = renderToStaticMarkup(
      <TrustBreakdownPanel truth={truth} confidence="medium" match={match} marketTruth={null} />
    );
    // local_seed default confidence is 0.28
    expect(html).toContain('28%');
    expect(html).toContain('可信度');
  });

  it('renders all three breakdown dimensions', () => {
    const html = renderToStaticMarkup(
      <TrustBreakdownPanel truth={truth} confidence="medium" match={match} marketTruth={null} />
    );
    expect(html).toContain('模型稳定性');
    expect(html).toContain('市场流动性');
    expect(html).toContain('数据新鲜度');
  });

  it('maps high confidence to 85% stability', () => {
    const html = renderToStaticMarkup(
      <TrustBreakdownPanel truth={truth} confidence="high" match={match} marketTruth={null} />
    );
    expect(html).toContain('85%');
  });

  it('maps low confidence to 38% stability', () => {
    const html = renderToStaticMarkup(
      <TrustBreakdownPanel truth={truth} confidence="low" match={match} marketTruth={null} />
    );
    expect(html).toContain('38%');
  });

  it('renders high freshness score for recently updated data', () => {
    const recentMatch = { ...match, lastUpdated: new Date().toISOString() };
    const html = renderToStaticMarkup(
      <TrustBreakdownPanel truth={truth} confidence="high" match={recentMatch} marketTruth={null} />
    );
    expect(html).toContain('95%');
  });

  it('renders low liquidity score when marketTruth is null', () => {
    const html = renderToStaticMarkup(
      <TrustBreakdownPanel truth={truth} confidence="high" match={match} marketTruth={null} />
    );
    expect(html).toContain('0%'); // null market = 0 liquidity
  });

  it('renders market liquidity score for live market', () => {
    const liveMarketTruth = createDataTrustInfo('live', 'Live Polymarket data', ['polymarket']);
    const html = renderToStaticMarkup(
      <TrustBreakdownPanel truth={truth} confidence="high" match={match} marketTruth={liveMarketTruth} />
    );
    expect(html).toContain('78%');
  });
});
