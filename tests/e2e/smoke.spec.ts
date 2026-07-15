import { expect, test, type Page } from '@playwright/test';

type FeaturedGameModule = 'baccarat' | 'blackjack' | 'roulette';

// Exceeds APP_PRELOAD_DELAY_MS (816 ms) before yielding one browser idle turn.
const OPTIONAL_GAME_PRELOAD_SETTLE_MS = 1_000;
const featuredGameModulePattern = /(?:^|\/)(baccarat|blackjack|roulette)(?:Game)?(?:\/index)?(?:-[A-Za-z0-9_-]+)?\.(?:[cm]?[jt]sx?)$/i;

const getFeaturedGameModule = (requestUrl: string): FeaturedGameModule | null => {
  const pathname = decodeURIComponent(new URL(requestUrl).pathname);
  const match = pathname.match(featuredGameModulePattern);
  return match ? (match[1].toLowerCase() as FeaturedGameModule) : null;
};

const trackFeaturedGameRequests = (page: Page) => {
  const requestUrls: string[] = [];
  page.on('request', (request) => {
    if (getFeaturedGameModule(request.url())) requestUrls.push(request.url());
  });
  return requestUrls;
};

const waitForPreloadOpportunity = async (page: Page) => {
  await page.waitForTimeout(OPTIONAL_GAME_PRELOAD_SETTLE_MS);
  await page.evaluate(() => new Promise<void>((resolve) => {
    const idleWindow: { requestIdleCallback?: Window['requestIdleCallback'] } = window;
    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(() => resolve(), { timeout: 250 });
      return;
    }
    window.requestAnimationFrame(() => resolve());
  }));
};

const gameNames = ['百家乐', '二十一点', '轮盘', '老虎机', '骰宝', '龙虎斗', '三公', '花旗骰'];
const gameRoutes = [
  ['baccarat', '百家乐 (Baccarat)'],
  ['blackjack', '二十一点 (Blackjack)'],
  ['roulette', '轮盘 (Roulette)'],
  ['slot-machine', '老虎机 (Slot Machine)'],
  ['sic-bo', '骰宝 (Sic Bo)'],
  ['dragon-tiger', '龙虎斗 (Dragon Tiger)'],
  ['three-card', '三公 (San Gong)'],
  ['craps', '花旗骰 (Craps)'],
] as const;

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('lobby exposes all games and two playable smoke flows stay stable', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '赌场教育模拟器' })).toBeVisible();
  await expect(page.getByRole('button', { name: /传统游戏/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /体育预测实验室/ })).toBeVisible();

  await page.getByRole('button', { name: /传统游戏/ }).click();
  await expect(page.getByRole('heading', { name: '赌场教育模拟器' })).toBeVisible();
  for (const gameName of gameNames) {
    await expect(page.getByRole('button', { name: new RegExp(gameName) })).toBeVisible();
  }

  await page.getByRole('button', { name: /百家乐/ }).click();
  await expect(page.getByRole('heading', { name: '百家乐 (Baccarat)' })).toBeVisible();
  await page.getByRole('button', { name: '?' }).click();
  await expect(page.getByRole('heading', { name: '游戏指南 & 规则' })).toBeVisible();
  await page.getByRole('button', { name: '×' }).click();
  await expect(page.getByRole('heading', { name: '游戏指南 & 规则' })).toBeHidden();
  await page.getByLabel('自定义下注金额', { exact: true }).fill('50');
  await page.getByRole('button', { name: /闲 PLAYER/ }).click();
  await page.getByRole('button', { name: '发牌' }).click();
  await expect(page.getByText('当前余额:')).toBeVisible();
  await expect(page.getByText('当前下注:')).toBeVisible();
  await page.getByRole('button', { name: '← 返回大厅' }).click();
  await expect(page.getByRole('heading', { name: '赌场教育模拟器' })).toBeVisible();

  await page.getByRole('button', { name: /老虎机/ }).click();
  await expect(page.getByRole('heading', { name: '老虎机 (Slot Machine)' })).toBeVisible();
  await page.getByRole('button', { name: '?' }).click();
  await expect(page.getByRole('heading', { name: '🎰 老虎机规则' })).toBeVisible();
  await page.getByRole('button', { name: '×' }).click();
  await expect(page.getByRole('heading', { name: '🎰 老虎机规则' })).toBeHidden();
  await page.getByLabel('自定义每线注额', { exact: true }).fill('2');
  await page.getByRole('button', { name: /旋转/ }).click();
  await expect(page.getByText('余额').first()).toBeVisible();
  await page.getByRole('button', { name: '← 返回大厅' }).click();
  await expect(page.getByRole('heading', { name: '赌场教育模拟器' })).toBeVisible();
});

test('sports lab reaches World Cup 2026 MVP', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-01T00:00:00Z'));
  await page.goto('/');

  await page.getByRole('button', { name: /体育预测实验室/ }).click();
  await expect(page.getByRole('heading', { name: '体育预测实验室' })).toBeVisible();
  await page.getByRole('button', { name: /足球/ }).click();
  await expect(page.getByRole('heading', { name: '足球概率实验室' })).toBeVisible();
  await page.getByRole('button', { name: /世界杯 2026/ }).click();
  await expect(page.getByRole('heading', { name: '世界杯比赛中心' })).toBeVisible();
  await expect(page.getByText('仅用于概率教育和模拟学习')).toBeVisible();
  await expect(page.getByRole('heading', { name: '世界杯比赛列表' })).toBeVisible();
  await expect(page.getByText('概率概览')).toBeVisible();
  await expect(page.getByRole('heading', { name: '预期进球与胜平负概率' })).toBeVisible();
  await expect(page.getByText('模型为什么这样预测')).toBeVisible();
});

test('a fresh World Cup route does not request featured traditional game modules', async ({ page }) => {
  const requestedGameUrls = trackFeaturedGameRequests(page);

  await page.goto('/#/sports/football/world-cup-2026');
  await expect(page.getByRole('heading', { name: '世界杯比赛中心' })).toBeVisible();
  await waitForPreloadOpportunity(page);

  expect(requestedGameUrls).toEqual([]);
});

test('previewing a traditional game requests its module', async ({ page }) => {
  const requestedGameUrls = trackFeaturedGameRequests(page);

  await page.goto('/#/traditional');
  const rouletteCard = page.getByRole('button', { name: /轮盘/ });
  await expect(rouletteCard).toBeVisible();
  await rouletteCard.hover();

  await expect.poll(() => requestedGameUrls.some((url) => getFeaturedGameModule(url) === 'roulette')).toBe(true);
});

test('new and legacy game hash routes stay compatible', async ({ page }) => {
  for (const [slug, heading] of gameRoutes) {
    await page.goto(`/#/traditional/games/${slug}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await page.goto(`/#/games/${slug}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});

test('a failed lazy game module recovers through a document reload', async ({ page }) => {
  const rouletteModule = '**/src/modules/traditional/games/roulette/index.ts*';
  await page.route(rouletteModule, async (route) => route.abort());

  await page.goto('/#/traditional/games/roulette');
  await expect(page.getByRole('heading', { name: '模块加载出错，请重试' })).toBeVisible();

  await page.unroute(rouletteModule);
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: /重试/ }).click(),
  ]);

  await expect(page.getByRole('heading', { name: '轮盘 (Roulette)' })).toBeVisible();
});
