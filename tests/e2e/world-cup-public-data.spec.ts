import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const generatedAt = '2026-07-02T12:00:00.000Z';

const publicDataSnapshot = {
  schemaVersion: 1,
  generatedAt,
  adapterResult: {
    matches: [{
      id: 'public-match-1',
      competitionId: 'world-cup-2026',
      stage: 'group',
      group: 'A',
      homeTeamId: 'alpha',
      awayTeamId: 'beta',
      kickoff: '2026-07-10T18:00:00.000Z',
      venue: 'Public Test Stadium',
      status: 'scheduled',
      source: 'openfootball',
      lastUpdated: generatedAt,
    }],
    teams: {
      alpha: {
        id: 'alpha',
        name: 'Alpha',
        shortName: 'ALP',
        countryCode: 'AL',
        group: 'A',
        rating: 84,
        attack: 83,
        defense: 82,
        form: 81,
      },
      beta: {
        id: 'beta',
        name: 'Beta',
        shortName: 'BET',
        countryCode: 'BE',
        group: 'A',
        rating: 78,
        attack: 77,
        defense: 76,
        form: 75,
      },
    },
    source: 'openfootball',
    providerName: 'OpenFootball',
    errors: [],
    meta: {
      totalMatches: 1,
      statusBreakdown: { scheduled: 1, live: 0, finished: 0 },
    },
  },
  markets: {},
  provenance: {
    delivery: 'server',
    fixture: {
      source: 'openfootball',
      providerName: 'OpenFootball',
      retrievedAt: generatedAt,
    },
    market: {
      source: 'polymarket',
      retrievedAt: generatedAt,
      matchedMatches: 0,
    },
  },
};

const strategyResearchSnapshot = {
  schemaVersion: 2,
  generatedAt,
  source: 'martj42-international-results',
  sourceUrl: 'https://example.test/results.csv',
  audit: {
    totalRows: 49_485,
    acceptedRows: 49_485,
    rejectedRows: 0,
    rejectionReasons: {},
  },
  report: {
    status: 'applied',
    applied: true,
    reason: 'Independent holdout passed.',
    selectedCandidate: {
      id: 'assertive-320',
      eloScale: 320,
      drawBase: 0.18,
      drawCloseness: 0.12,
    },
    baseline: {
      id: 'baseline-v2',
      eloScale: 500,
      drawBase: 0.2,
      drawCloseness: 0.14,
    },
    splits: {
      training: { from: '1872-01-01', to: '2025-01-01', sampleSize: 49_365 },
      validation: { from: '2025-01-02', to: '2026-01-01', sampleSize: 60 },
      holdout: { from: '2026-01-02', to: '2026-07-01', sampleSize: 60 },
    },
    validation: {
      sampleSize: 60,
      brierScore: 0.43,
      logLoss: 0.76,
      accuracy: 0.68,
    },
    holdout: {
      sampleSize: 60,
      brierScore: 0.4,
      logLoss: 0.71,
      accuracy: 0.7,
      baselineBrierScore: 0.437,
      brierImprovement: 0.037,
      contexts: 5,
    },
  },
  teamRatings: {
    alpha: {
      teamId: 'alpha',
      teamName: 'Alpha',
      asOf: generatedAt,
      matches: 30,
      elo: 1_720,
      evidenceWeight: 4,
      lastMatchDate: '2026-06-20',
      trustLevel: 'medium',
    },
    beta: {
      teamId: 'beta',
      teamName: 'Beta',
      asOf: generatedAt,
      matches: 28,
      elo: 1_640,
      evidenceWeight: 3.8,
      lastMatchDate: '2026-06-18',
      trustLevel: 'medium',
    },
  },
};

async function expectAccessiblePage(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

  const accessibility = await new AxeBuilder({ page }).analyze();
  const violations = accessibility.violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    targets: nodes.flatMap((node) => node.target).slice(0, 12),
  }));
  expect(violations).toEqual([]);
}

test('World Cup page consumes public snapshots and exposes strategy evidence', async ({ page }) => {
  await page.route('**/api/world-cup/data', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(publicDataSnapshot),
  }));
  await page.route('**/api/world-cup/research', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(strategyResearchSnapshot),
  }));

  await page.goto('/#/sports/football/world-cup-2026');
  await expect(page.getByRole('heading', { name: 'Alpha vs Beta' })).toBeVisible();
  await page.getByText('数据源状态说明', { exact: true }).click();

  await expect(page.getByText('OpenFootball', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('历史策略时间滚动验证', { exact: true })).toBeVisible();
  await expect(page.getByText('留出集通过', { exact: true })).toBeVisible();
  await expect(page.getByText('历史 Elo 输入', { exact: true })).toBeVisible();
  await expect(page.getByText('已接入 2/2 队', { exact: true })).toBeVisible();
  await expect(page.getByText(/Brier 改进 0\.037/)).toBeVisible();
  await expect(page.getByText(/不等于盈利证明/)).toBeVisible();

  await expectAccessiblePage(page);
});

test('World Cup page visibly falls back when the public snapshot is unavailable', async ({ page }) => {
  await page.route('**/api/world-cup/data', (route) => route.fulfill({
    status: 502,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'unavailable' }),
  }));
  await page.route('**/api/world-cup/research', (route) => route.fulfill({
    status: 502,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'unavailable' }),
  }));
  await page.route(/raw\.githubusercontent\.com|api\.github\.com|cdn\.jsdelivr\.net/, (route) =>
    route.abort());

  await page.goto('/#/sports/football/world-cup-2026');
  await page.getByText('数据源状态说明', { exact: true }).click();

  await expect(page.getByText('Sample fixtures', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('研究不可用', { exact: true })).toBeVisible();
  await expect(page.getByText(/继续使用基线模型/)).toBeVisible();
  await expectAccessiblePage(page);
});
