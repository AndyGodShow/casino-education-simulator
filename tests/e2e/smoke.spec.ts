import { expect, test } from '@playwright/test';

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
  await page.getByPlaceholder('自定义').fill('50');
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
  await page.getByPlaceholder('自定义').fill('2');
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

test('new and legacy game hash routes stay compatible', async ({ page }) => {
  for (const [slug, heading] of gameRoutes) {
    await page.goto(`/#/traditional/games/${slug}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await page.goto(`/#/games/${slug}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});
