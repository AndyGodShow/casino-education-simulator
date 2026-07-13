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

const buildPublicMatches = (
  definitions: Array<{ id: string; stage: 'group' | 'round32'; group?: string }>,
) => {
  const teams = Object.fromEntries(definitions.flatMap(({ id, group }) => [
    [`${id}-home`, {
      id: `${id}-home`,
      name: `${id} Home`,
      shortName: 'HOM',
      countryCode: 'HO',
      group: group ?? 'A',
      rating: 84,
      attack: 83,
      defense: 82,
      form: 81,
    }],
    [`${id}-away`, {
      id: `${id}-away`,
      name: `${id} Away`,
      shortName: 'AWY',
      countryCode: 'AW',
      group: group ?? 'A',
      rating: 78,
      attack: 77,
      defense: 76,
      form: 75,
    }],
  ]));
  const matches = definitions.map(({ id, stage, group }, index) => ({
    id,
    competitionId: 'world-cup-2026',
    stage,
    group,
    homeTeamId: `${id}-home`,
    awayTeamId: `${id}-away`,
    kickoff: `2026-07-${String(10 + index).padStart(2, '0')}T18:00:00.000Z`,
    venue: 'Public Test Stadium',
    status: 'scheduled',
    source: 'openfootball',
    lastUpdated: generatedAt,
  }));

  return {
    ...publicDataSnapshot,
    adapterResult: {
      ...publicDataSnapshot.adapterResult,
      matches,
      teams,
      meta: {
        totalMatches: matches.length,
        statusBreakdown: { scheduled: matches.length, live: 0, finished: 0 },
      },
    },
  };
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

  await page.setViewportSize({ width: 390, height: 844 });
  const touchTargets = await Promise.all([
    page.getByRole('button', { name: '← 返回足球首页', exact: true }).boundingBox(),
    page.getByRole('combobox', { name: '阶段', exact: true }).boundingBox(),
    page.getByRole('combobox', { name: '状态', exact: true }).boundingBox(),
    page.getByRole('button', { name: '全部', exact: true }).boundingBox(),
  ]);
  for (const target of touchTargets) {
    expect(target?.height).toBeGreaterThanOrEqual(44);
    expect(target?.width).toBeGreaterThanOrEqual(44);
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: '全部', exact: true })).toHaveCSS(
    'transition-duration',
    '0s',
  );
});

test('World Cup page renders before a stalled cloud snapshot request finishes', async ({ page }) => {
  let cloudRouteRequested = false;

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
  await page.route('**/rest/v1/world_cup_prediction_snapshots*', async () => {
    cloudRouteRequested = true;
    await new Promise<void>(() => {});
  });

  await page.goto('/#/sports/football/world-cup-2026');
  await Promise.all([
    expect(page.getByRole('heading', { name: '世界杯比赛中心' })).toBeVisible({
      timeout: 2_500,
    }),
    expect(page.getByRole('heading', { name: 'Alpha vs Beta' })).toBeVisible({
      timeout: 2_500,
    }),
  ]);
  expect(cloudRouteRequested).toBe(true);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('World Cup filters keep every knockout match reachable and align the detail', async ({ page }) => {
  const snapshot = buildPublicMatches([
    ...Array.from({ length: 16 }, (_, index) => ({
      id: `round32-${index + 1}`,
      stage: 'round32' as const,
    })),
    { id: 'group-a', stage: 'group' as const, group: 'A' },
    { id: 'group-b', stage: 'group' as const, group: 'B' },
  ]);
  await page.route('**/api/world-cup/data', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(snapshot),
  }));
  await page.route('**/api/world-cup/research', (route) => route.fulfill({
    status: 502,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'not needed for interaction test' }),
  }));

  await page.goto('/#/sports/football/world-cup-2026');
  const stage = page.getByRole('combobox', { name: '阶段', exact: true });
  await stage.selectOption('round32');

  await expect(page.getByText('12 / 16 场比赛', { exact: true })).toBeVisible();
  const finalRound32Match = page.getByText('round32-16 Home vs round32-16 Away', {
    exact: true,
  });
  await expect(finalRound32Match).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'A', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '再显示 4 场', exact: true }).click();
  await expect(page.getByText('16 / 16 场比赛', { exact: true })).toBeVisible();
  await expect(finalRound32Match).toBeVisible();
  await finalRound32Match.click();
  await expect(page.getByRole('heading', {
    name: 'round32-16 Home vs round32-16 Away',
  })).toBeVisible();

  await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('scheduled');
  await expect(page.getByText('12 / 16 场比赛', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', {
    name: 'round32-1 Home vs round32-1 Away',
  })).toBeVisible();

  await stage.selectOption('group');
  await page.getByRole('button', { name: 'B', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'group-b Home vs group-b Away' }))
    .toBeVisible();
  await expect(page.getByRole('heading', { name: 'group-a Home vs group-a Away' }))
    .toHaveCount(0);
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
